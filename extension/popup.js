// ─── YouTube Channel Detection ──────────────────
function isYouTubeChannel(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (!u.hostname.includes('youtube.com')) return false;
    // Match: /@channel, /c/channel, /channel/ID, /user/name
    const path = u.pathname;
    return /^\/@/.test(path) || /^\/c\//.test(path) ||
           /^\/channel\//.test(path) || /^\/user\//.test(path);
  } catch { return false; }
}

// ─── Main Load ──────────────────────────────────
async function load() {
  const { moodboard_queue = [] } = await chrome.storage.local.get('moodboard_queue');
  document.getElementById('count').textContent = moodboard_queue.length;

  // Show scrape button if on a YouTube channel
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const scrapeSection = document.getElementById('scrapeSection');
    if (tab && isYouTubeChannel(tab.url)) {
      scrapeSection.style.display = 'block';
      setupScrapeButton(tab);
    } else {
      scrapeSection.style.display = 'none';
    }
  } catch {}

  const queue = document.getElementById('queue');
  const actions = document.getElementById('actions');

  if (moodboard_queue.length === 0) {
    queue.innerHTML = '<div class="empty">No images clipped yet</div>';
    actions.innerHTML = '';
    return;
  }

  // Show last 20 thumbnails
  queue.innerHTML = moodboard_queue.slice(-20).map(img =>
    '<img src="' + img.src + '" title="' + (img.filename || 'image') + '">'
  ).join('');

  actions.innerHTML = [
    '<button class="btn primary" id="openBtn">Open Moodboard & Import</button>',
    '<button class="btn secondary" id="dlBtn">Download as JSON</button>',
    '<button class="btn danger" id="clearBtn">Clear Queue</button>'
  ].join('');

  // Open Moodboard & trigger auto-import
  document.getElementById('openBtn').onclick = async function() {
    const tabs = await chrome.tabs.query({});
    const mbTab = tabs.find(t => t.url && (t.url.includes('Moodboard/index.html') || t.url.includes('moodboard/index.html')));

    if (mbTab) {
      await chrome.tabs.update(mbTab.id, { active: true });
      chrome.runtime.sendMessage({ action: 'flush', tabId: mbTab.id });
    } else {
      alert('Please open your Moodboard (index.html) in Chrome.\n\nQueued images will import automatically when the page loads.');
    }
    window.close();
  };

  // Download as JSON for manual import
  document.getElementById('dlBtn').onclick = async function() {
    const data = JSON.stringify({
      version: 2,
      timestamp: Date.now(),
      categories: [],
      sort: 'newest',
      images: moodboard_queue.map(q => ({
        id: Math.random().toString(36).substr(2, 9),
        src: q.src,
        filename: q.filename,
        timestamp: q.timestamp || Date.now(),
        viewCount: 0,
        categories: [],
        note: '',
        fav: false,
        manualOrder: 0,
        palette: [],
        hash: ''
      }))
    });
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'clipped-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    await chrome.storage.local.set({ moodboard_queue: [] });
    load();
  };

  // Clear queue
  document.getElementById('clearBtn').onclick = async function() {
    if (!confirm('Clear ' + moodboard_queue.length + ' queued images?')) return;
    await chrome.storage.local.set({ moodboard_queue: [] });
    load();
  };
}

// ─── Scrape Button Logic ────────────────────────
function setupScrapeButton(tab) {
  const btn = document.getElementById('scrapeBtn');
  const info = document.getElementById('scrapeInfo');

  btn.onclick = async () => {
    btn.disabled = true;
    btn.textContent = 'Injecting scraper...';
    info.textContent = 'The page will auto-scroll. Check the overlay for progress.';

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['channel-scraper.js']
      });
      // Close popup after injection — the overlay on the page shows progress
      setTimeout(() => window.close(), 500);
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M21.58 7.19c-.23-.86-.91-1.54-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42c-.86.23-1.54.91-1.77 1.77C2 8.75 2 12 2 12s0 3.25.42 4.81c.23.86.91 1.54 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42c.86-.23 1.54-.91 1.77-1.77C22 15.25 22 12 22 12s0-3.25-.42-4.81z"/><path d="M10 15l5-3-5-3v6z" fill="#111"/></svg>
        Scrape This Channel`;
      info.textContent = 'Error: ' + err.message;
    }
  };
}

load();
