// Moodboard Saver — Chrome Extension Background Service Worker
// Right-click any image → saved to your Moodboard

// Match pattern for finding the moodboard tab
const MB_PATTERNS = ['Moodboard/index.html', 'moodboard/index.html'];

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: 'save-to-moodboard',
    title: 'Save to Moodboard',
    contexts: ['image', 'page', 'frame', 'link', 'video']
  });
  chrome.action.setBadgeBackgroundColor({ color: '#4285f4' });
});

// Convert image URL to base64
async function fetchAsBase64(url) {
  if (url.startsWith('data:')) return url;
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch (e) {
    // CORS blocked — try via tab injection
    throw new Error('CORS: ' + e.message);
  }
}

// Clean filename from URL, using actual MIME to get correct extension
function getFilename(url, base64) {
  const extMap = { 'png': '.png', 'jpeg': '.jpg', 'jpg': '.jpg', 'webp': '.webp', 'gif': '.gif', 'svg+xml': '.svg', 'bmp': '.bmp', 'avif': '.avif' };

  // Detect actual format from the base64 data URL if available
  let actualExt = '.png';
  const src = base64 || url;
  if (src.startsWith('data:')) {
    const mm = src.match(/^data:image\/([^;]+)/);
    if (mm && extMap[mm[1]]) actualExt = extMap[mm[1]];
  }

  // Extract base name from URL (without extension)
  let baseName = 'image';
  if (!url.startsWith('data:')) {
    try {
      const path = new URL(url).pathname;
      let name = decodeURIComponent(path.split('/').pop() || 'image');
      // Strip any existing extension
      const dot = name.lastIndexOf('.');
      if (dot > 0) name = name.substring(0, dot);
      if (name) baseName = name;
    } catch {}
  }

  return baseName + actualExt;
}

// ─── YOUTUBE VIDEO ID EXTRACTION ────────────────
// Extracts YouTube video ID from thumbnail URLs.
// Supports:
//   i.ytimg.com/vi/<ID>/...
//   i.ytimg.com/vi_webp/<ID>/...
//   i.ytimg.com/an_webp/<ID>/...
//   i.ytimg.com/sb/<ID>/...
//   img.youtube.com/vi/<ID>/...
// Thumbnail variants: default, hqdefault, mqdefault, sddefault,
//   maxresdefault, 0-3, hq720, oar2, *_live, etc.
// Video IDs are exactly 11 chars: [A-Za-z0-9_-]

function extractYouTubeVideoId(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();

    // Only match known YouTube image hosts
    if (host !== 'i.ytimg.com' && host !== 'img.youtube.com') return null;

    // Path format: /vi/<ID>/thumb.jpg  or  /vi_webp/<ID>/thumb.webp  etc.
    // Split into segments, find the segment after a known prefix
    const segments = u.pathname.split('/').filter(Boolean);
    const prefixes = ['vi', 'vi_webp', 'an_webp', 'sb'];

    for (let i = 0; i < segments.length - 1; i++) {
      if (prefixes.includes(segments[i])) {
        const candidate = segments[i + 1];
        if (isValidYouTubeId(candidate)) return candidate;
      }
    }

    return null;
  } catch {
    return null;
  }
}

function isValidYouTubeId(id) {
  // YouTube video IDs are exactly 11 characters: [A-Za-z0-9_-]
  return typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id);
}

// ═══════════════════════════════════════════════════
//  METADATA PROVIDER SYSTEM
//  Abstraction over multiple YouTube metadata sources.
//  The rest of the extension only sees:
//    resolveMetadata(videoId) → { title, channel, viewCount, uploadDate }
// ═══════════════════════════════════════════════════

// ─── Error Classification ───────────────────────
// Every provider failure is typed so the orchestrator
// can decide whether to try the next provider or stop.

class ProviderError extends Error {
  /**
   * @param {'timeout'|'network'|'http'|'parse'|'unavailable'|'unknown'} type
   * @param {string} message
   */
  constructor(type, message) {
    super(message);
    this.name = 'ProviderError';
    this.type = type;
  }
}

// ─── Null Metadata Constant ─────────────────────

const NULL_METADATA = Object.freeze({
  title: null,
  channel: null,
  viewCount: null,
  uploadDate: null
});

// ─── JSON Boundary Finder ───────────────────────
// String-safe brace counter for extracting JSON from HTML.

function findJsonEnd(str, start) {
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < str.length; i++) {
    const ch = str[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return i + 1; }
  }
  return -1;
}

// ─── CACHE ──────────────────────────────────────
// Stores successful metadata in chrome.storage.local.
// Key format: ytmeta_<videoId>
// Never requests the same video twice unless manually cleared.

const MetadataCache = {
  PREFIX: 'ytmeta_',

  async get(videoId) {
    try {
      const key = this.PREFIX + videoId;
      const result = await chrome.storage.local.get(key);
      return result[key] || null;
    } catch { return null; }
  },

  async set(videoId, metadata) {
    try {
      const key = this.PREFIX + videoId;
      await chrome.storage.local.set({
        [key]: { ...metadata, _cachedAt: Date.now() }
      });
    } catch (e) {
      console.warn('[Moodboard] Cache write failed:', e.message);
    }
  }
};

// ─── PROVIDER 1: YouTube Official Page Parser ───
// Fetches the actual youtube.com/watch page and extracts
// metadata from the embedded ytInitialPlayerResponse JSON.
// This is the same approach used by yt-dlp and similar tools.
//
// Timeout:  8 seconds
// Retries:  1 (total 2 attempts)
// Skips retry on: 'unavailable' (video confirmed missing)

const YouTubePageProvider = {
  name: 'YouTube Page',
  timeout: 8000,
  retries: 1,

  async fetchMetadata(videoId) {
    let lastError;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        return await this._attempt(videoId);
      } catch (err) {
        lastError = err;
        // Don't retry if video is confirmed unavailable
        if (err instanceof ProviderError && err.type === 'unavailable') throw err;
        if (attempt < this.retries) {
          await new Promise(r => setTimeout(r, 500));
        }
      }
    }
    throw lastError;
  },

  async _attempt(videoId) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const resp = await fetch(
        `https://www.youtube.com/watch?v=${videoId}&hl=en`,
        {
          signal: controller.signal,
          headers: { 'Accept-Language': 'en-US,en;q=0.9' }
        }
      );
      clearTimeout(timer);

      if (!resp.ok) throw new ProviderError('http', `HTTP ${resp.status}`);

      const html = await resp.text();
      return this._parse(html);
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof ProviderError) throw err;
      if (err.name === 'AbortError') throw new ProviderError('timeout', 'Request timed out');
      throw new ProviderError('network', err.message);
    }
  },

  _parse(html) {
    // Locate ytInitialPlayerResponse JSON blob
    const marker = 'var ytInitialPlayerResponse = ';
    const idx = html.indexOf(marker);
    if (idx === -1) throw new ProviderError('parse', 'ytInitialPlayerResponse not found in page');

    const jsonStart = idx + marker.length;
    const jsonEnd = findJsonEnd(html, jsonStart);
    if (jsonEnd === -1) throw new ProviderError('parse', 'Could not find JSON boundary');

    let data;
    try {
      data = JSON.parse(html.substring(jsonStart, jsonEnd));
    } catch {
      throw new ProviderError('parse', 'JSON parse failed');
    }

    // Check playability status
    const status = data.playabilityStatus?.status;
    if (status === 'ERROR') {
      throw new ProviderError('unavailable', 'Video has been removed');
    }
    if (status === 'LOGIN_REQUIRED') {
      throw new ProviderError('unavailable', 'Video is private');
    }

    const vd = data.videoDetails;
    if (!vd) throw new ProviderError('parse', 'No videoDetails in response');

    // Upload date from microformat (ISO format: "2009-10-25")
    let uploadDate = null;
    const pub = data.microformat?.playerMicroformatRenderer?.publishDate;
    if (typeof pub === 'string' && pub.length >= 10) {
      uploadDate = pub.slice(0, 10);
    }

    return {
      title: vd.title || null,
      channel: vd.author || null,
      viewCount: vd.viewCount ? parseInt(vd.viewCount, 10) : null,
      uploadDate
    };
  }
};

// ─── PROVIDER 2: Invidious API ──────────────────
// Free, no-key-needed YouTube metadata API.
// Tries multiple public instances as its own internal fallback.
//
// Timeout:  5 seconds per instance
// Retries:  3 instances (acts as implicit retry)
// Skips further instances on: 'unavailable'

const InvidiousProvider = {
  name: 'Invidious',
  instances: [
    'https://inv.nadeko.net',
    'https://invidious.fdn.fr',
    'https://vid.puffyan.us'
  ],
  timeout: 5000,

  async fetchMetadata(videoId) {
    let lastError;
    for (const instance of this.instances) {
      try {
        return await this._attemptInstance(instance, videoId);
      } catch (err) {
        lastError = err;
        if (err instanceof ProviderError && err.type === 'unavailable') throw err;
      }
    }
    throw lastError || new ProviderError('network', 'All Invidious instances failed');
  },

  async _attemptInstance(instance, videoId) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const resp = await fetch(
        `${instance}/api/v1/videos/${videoId}?fields=title,author,viewCount,published`,
        { signal: controller.signal }
      );
      clearTimeout(timer);

      if (resp.status === 404) throw new ProviderError('unavailable', 'Video not found');
      if (!resp.ok) throw new ProviderError('http', `${instance} returned HTTP ${resp.status}`);

      const data = await resp.json();
      if (data.error) throw new ProviderError('unavailable', data.error);

      let uploadDate = null;
      if (typeof data.published === 'number' && data.published > 0) {
        uploadDate = new Date(data.published * 1000).toISOString().slice(0, 10);
      }

      return {
        title: (typeof data.title === 'string' && data.title) ? data.title : null,
        channel: (typeof data.author === 'string' && data.author) ? data.author : null,
        viewCount: (typeof data.viewCount === 'number') ? data.viewCount : null,
        uploadDate
      };
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof ProviderError) throw err;
      if (err.name === 'AbortError') throw new ProviderError('timeout', `${instance} timed out`);
      throw new ProviderError('network', err.message);
    }
  }
};

// ─── PROVIDER ORCHESTRATOR ──────────────────────
// Tries providers in priority order. Stops on first success.
// Caches successful results. Short-circuits on 'unavailable'.

const PROVIDERS = [YouTubePageProvider, InvidiousProvider];

async function resolveMetadata(videoId) {
  if (!videoId || !isValidYouTubeId(videoId)) {
    return { ...NULL_METADATA };
  }

  // 1. Check cache — never request twice
  const cached = await MetadataCache.get(videoId);
  if (cached) {
    const { _cachedAt, ...meta } = cached;
    console.log(`[Moodboard] Cache hit for ${videoId} (cached ${new Date(_cachedAt).toISOString()})`);
    return meta;
  }

  // 2. Try providers in order
  for (const provider of PROVIDERS) {
    try {
      const meta = await provider.fetchMetadata(videoId);
      console.log(`[Moodboard] ✓ ${provider.name} succeeded for ${videoId}:`, meta);
      // Cache the successful result
      await MetadataCache.set(videoId, meta);
      return meta;
    } catch (err) {
      const type = (err instanceof ProviderError) ? err.type : 'unknown';
      console.warn(`[Moodboard] ✕ ${provider.name} failed [${type}]: ${err.message}`);

      // 'unavailable' = video confirmed missing/private — no provider can help
      if (type === 'unavailable') {
        const nullResult = { ...NULL_METADATA };
        await MetadataCache.set(videoId, nullResult);
        return nullResult;
      }
      // Otherwise: try next provider
    }
  }

  // 3. All providers failed — do NOT cache (might be temporary network issue)
  console.warn(`[Moodboard] All providers failed for ${videoId}, returning nulls`);
  return { ...NULL_METADATA };
}

// Check if a tab URL matches the moodboard
function isMoodboardUrl(url) {
  if (!url) return false;
  return MB_PATTERNS.some(p => url.includes(p));
}

// Find existing moodboard tab
async function findMoodboardTab() {
  const tabs = await chrome.tabs.query({});
  return tabs.find(t => isMoodboardUrl(t.url));
}

// Inject the image into the moodboard tab
async function injectImage(tabId, base64, filename) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: (src, name) => {
        if (typeof addOne === 'function') {
          addOne(src, name);
          return true;
        }
        return false;
      },
      args: [base64, filename]
    });
    // Check if addOne was found and called
    return results && results[0] && results[0].result === true;
  } catch (e) {
    console.error('Inject failed:', e);
    return false;
  }
}

// Update badge with queue count
async function updateBadge() {
  try {
    const { moodboard_queue = [] } = await chrome.storage.local.get('moodboard_queue');
    const count = moodboard_queue.length;
    chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
  } catch (e) {}
}

// Queue an image for later import
async function queueImage(base64, filename, ytVideoId = null, ytMetadata = null, metadataStatus = null) {
  const { moodboard_queue = [] } = await chrome.storage.local.get('moodboard_queue');
  moodboard_queue.push({ src: base64, filename, timestamp: Date.now(), ytVideoId, ytMetadata, metadataStatus });
  await chrome.storage.local.set({ moodboard_queue });
  await updateBadge();
  return moodboard_queue.length;
}

// ─── BACKGROUND METADATA RESOLUTION ────────────
// Fire-and-forget: resolves metadata via the provider
// system and updates the queued item when done.
// Never blocks the save operation.

let _metadataUpdateLock = Promise.resolve();

function resolveMetadataInBackground(ytVideoId) {
  // Intentionally not awaited — runs independently
  resolveMetadata(ytVideoId).then(meta => {
    const hasData = meta.title !== null || meta.viewCount !== null;
    return updateQueuedMetadata(ytVideoId, meta, hasData ? 'complete' : 'failed');
  }).catch(err => {
    console.warn(`[Moodboard] Background metadata failed for ${ytVideoId}:`, err.message);
    return updateQueuedMetadata(ytVideoId, null, 'failed');
  });
}

function updateQueuedMetadata(ytVideoId, metadata, status) {
  // Serialized via promise chain to prevent concurrent
  // read-modify-write races when saving multiple thumbnails rapidly
  _metadataUpdateLock = _metadataUpdateLock.then(async () => {
    try {
      const { moodboard_queue = [] } = await chrome.storage.local.get('moodboard_queue');
      let updated = false;
      for (const item of moodboard_queue) {
        if (item.ytVideoId === ytVideoId && item.metadataStatus === 'pending') {
          item.ytMetadata = metadata;
          item.metadataStatus = status;
          updated = true;
        }
      }
      if (updated) {
        await chrome.storage.local.set({ moodboard_queue });
        console.log(`[Moodboard] Queue updated: ${ytVideoId} → ${status}`);
      }
    } catch (err) {
      console.warn(`[Moodboard] Queue update failed for ${ytVideoId}:`, err.message);
    }
  });
  return _metadataUpdateLock;
}

// Show a temporary notification on the source tab (non-intrusive)
async function showSaveNotice(tabId, message) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (msg) => {
        // Create a toast notification on the page
        const el = document.createElement('div');
        el.textContent = msg;
        el.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:999999;background:#111;color:#fff;padding:10px 20px;border-radius:10px;font:600 13px -apple-system,system-ui,sans-serif;box-shadow:0 4px 20px rgba(0,0,0,0.5);opacity:0;transition:opacity 200ms;pointer-events:none;';
        document.body.appendChild(el);
        requestAnimationFrame(() => { el.style.opacity = '1'; });
        setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 200); }, 2000);
      },
      args: [message]
    });
  } catch (e) {
    // Not critical, ignore
  }
}

// ─── MAIN HANDLER ───────────────────────────────────

async function saveImageUrl(srcUrl, sourceTab) {
  try {
    let base64;
    try {
      base64 = await fetchAsBase64(srcUrl);
    } catch (fetchErr) {
      // CORS blocked — try capturing via canvas in the page
      console.warn('[Moodboard] Fetch failed, trying canvas capture:', fetchErr.message);
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: sourceTab.id },
          func: (url) => {
            return new Promise((resolve, reject) => {
              const img = new Image();
              img.crossOrigin = 'anonymous';
              img.onload = () => {
                try {
                  const cv = document.createElement('canvas');
                  cv.width = img.naturalWidth;
                  cv.height = img.naturalHeight;
                  cv.getContext('2d').drawImage(img, 0, 0);
                  resolve(cv.toDataURL('image/png'));
                } catch (e) { reject(e); }
              };
              img.onerror = () => reject(new Error('Image load failed'));
              img.src = url;
            });
          },
          args: [srcUrl],
          world: 'MAIN'
        });
        base64 = results?.[0]?.result;
        if (!base64) throw new Error('Canvas capture returned empty');
      } catch (canvasErr) {
        // Last resort: store URL directly (works for public images)
        console.warn('[Moodboard] Canvas failed too, storing URL directly:', canvasErr.message);
        base64 = srcUrl;
      }
    }

    const filename = getFilename(srcUrl, base64);
    const ytVideoId = extractYouTubeVideoId(srcUrl);
    const metadataStatus = ytVideoId ? 'pending' : null;

    const mbTab = await findMoodboardTab();
    if (mbTab) {
      const ok = await injectImage(mbTab.id, base64, filename);
      if (ok) {
        showSaveNotice(sourceTab.id, '✓ Saved to Moodboard');
      } else {
        await queueImage(base64, filename, ytVideoId, null, metadataStatus);
        showSaveNotice(sourceTab.id, '⏳ Queued — open Moodboard to import');
      }
    } else {
      const count = await queueImage(base64, filename, ytVideoId, null, metadataStatus);
      showSaveNotice(sourceTab.id, `⏳ Queued (${count}) — open Moodboard to import`);
    }

    if (ytVideoId) resolveMetadataInBackground(ytVideoId);
  } catch (err) {
    console.error('Moodboard Saver error:', err);
    try { showSaveNotice(sourceTab.id, '✕ Failed to save image'); } catch (e) {}
  }
}

// Detect the image under cursor via the content script (tracks exact right-click target)
async function detectImageUnderCursor(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { action: 'detect-image' });
    if (response && response.url) return response.url;
  } catch (e) {
    // Content script not loaded — try inline detection
  }

  // Fallback: inject a minimal detection at the element under cursor
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // Use the last contextmenu event target if available
        const target = document.__moodboardLastTarget;
        if (target) {
          if (target.tagName === 'IMG' && target.src) return target.currentSrc || target.src;
          const img = target.querySelector && target.querySelector('img[src]');
          if (img && img.src) return img.currentSrc || img.src;
          let parent = target.parentElement;
          for (let d = 0; parent && d < 5; d++, parent = parent.parentElement) {
            const pImg = parent.querySelector('img[src]');
            if (pImg && pImg.src && pImg.naturalWidth > 10) return pImg.currentSrc || pImg.src;
          }
        }
        return null;
      },
      world: 'MAIN'
    });
    return results?.[0]?.result || null;
  } catch (e) {
    console.warn('[Moodboard] Image detection failed:', e.message);
    return null;
  }
}

chrome.contextMenus.onClicked.addListener(async (info, sourceTab) => {
  if (info.menuItemId !== 'save-to-moodboard') return;

  // 1. Chrome provides srcUrl for direct <img> right-clicks — always accurate
  if (info.srcUrl) {
    await saveImageUrl(info.srcUrl, sourceTab);
    return;
  }

  // 2. For overlay sites (Instagram, Pinterest etc.) — detect from right-click target
  showSaveNotice(sourceTab.id, '🔍 Detecting image...');
  const imgUrl = await detectImageUnderCursor(sourceTab.id);
  if (imgUrl) {
    await saveImageUrl(imgUrl, sourceTab);
  } else {
    showSaveNotice(sourceTab.id, '✕ No image found — try right-clicking directly on an image');
  }
});

// ─── AUTO-FLUSH QUEUE ───────────────────────────
// When user opens/reloads the moodboard, flush any queued images into it


let _flushing = false;
async function flushQueue(tabId) {
  if (_flushing) return; // prevent concurrent flush
  _flushing = true;
  try {
    const { moodboard_queue = [] } = await chrome.storage.local.get('moodboard_queue');
    if (!moodboard_queue.length) { _flushing = false; return; }

    // Clear queue FIRST to prevent re-flush of same items
    await chrome.storage.local.set({ moodboard_queue: [] });
    await updateBadge();

    let injected = 0;
    const failed = [];
    for (const item of moodboard_queue) {
      const ok = await injectImage(tabId, item.src, item.filename);
      if (ok) injected++;
      else failed.push(item);
      // Small delay between injections to not overwhelm
      await new Promise(r => setTimeout(r, 300));
    }

    // Re-queue any that failed
    if (failed.length) {
      const { moodboard_queue: current = [] } = await chrome.storage.local.get('moodboard_queue');
      await chrome.storage.local.set({ moodboard_queue: [...current, ...failed] });
      await updateBadge();
    }

    if (injected > 0) {
      // Show toast in the moodboard tab
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          world: 'MAIN',
          func: (n) => { if (typeof toast === 'function') toast('Imported ' + n + ' queued image' + (n > 1 ? 's' : '') + ' from extension'); },
          args: [injected]
        });
      } catch (e) {}
    }
  } finally {
    _flushing = false;
  }
}

// Auto-flush when moodboard tab finishes loading (debounced)
let _flushTimer = null;
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status === 'complete' && isMoodboardUrl(tab.url)) {
    clearTimeout(_flushTimer);
    _flushTimer = setTimeout(() => flushQueue(tabId), 3000);
  }
});

// Listen for flush requests from popup and scrape messages from content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'flush' && msg.tabId) {
    setTimeout(() => flushQueue(msg.tabId), 1500);
  }
  if (msg.action === 'getQueueCount') {
    chrome.storage.local.get('moodboard_queue').then(data => {
      sendResponse({ count: (data.moodboard_queue || []).length });
    });
    return true; // async response
  }

  // ─── CHANNEL SCRAPER: receive thumbnail from content script ───
  // Stores YouTube URL directly — NO download, NO base64 conversion.
  if (msg.action === 'scrape-thumbnail' && msg.url && msg.videoId) {
    (async () => {
      try {
        const src = msg.url; // store the YouTube CDN URL directly
        const filename = msg.videoId + '_maxresdefault.jpg';

        const mbTab = await findMoodboardTab();
        let injected = false;
        if (mbTab) {
          injected = await injectImage(mbTab.id, src, filename);
        }
        if (!injected) {
          await queueImage(src, filename, msg.videoId, null, null);
        }
        sendResponse({ ok: true, injected });
      } catch (err) {
        console.warn('[Moodboard] Scrape save failed for', msg.videoId, err.message);
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  // ─── BATCH SCRAPE: inject multiple thumbnails at once ───
  if (msg.action === 'scrape-batch' && Array.isArray(msg.items)) {
    (async () => {
      try {
        const mbTab = await findMoodboardTab();
        if (mbTab) {
          const results = await chrome.scripting.executeScript({
            target: { tabId: mbTab.id },
            world: 'MAIN',
            func: (items) => {
              if (typeof addBulkUrls === 'function') return addBulkUrls(items);
              return 0;
            },
            args: [msg.items]
          });
          const added = results && results[0] ? results[0].result : 0;
          sendResponse({ ok: true, added });
        } else {
          // Queue them all
          for (const it of msg.items) {
            await queueImage(it.src, it.filename, null, null, null);
          }
          sendResponse({ ok: true, queued: msg.items.length });
        }
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }
});

// Init badge on startup
updateBadge();
