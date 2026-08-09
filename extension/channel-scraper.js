// ═══════════════════════════════════════════════════
//  CHANNEL SCRAPER v5 — Scroll → Collect → Save
//  Phase 1: Scroll & collect video IDs (no downloads)
//  Phase 2: Send URLs to background for injection
//  STOP = stop scrolling, save what we have
// ═══════════════════════════════════════════════════

(async function channelScraper() {
  if (!location.hostname.includes('youtube.com')) {
    alert('Channel Scraper only works on YouTube.');
    return;
  }
  if (window.__moodboardScraping) return;
  window.__moodboardScraping = true;

  const seenIds = new Set();
  const allIds = [];
  let stopped = false, saving = false;

  // ─── OVERLAY ─────────────────────────────────
  const overlay = document.createElement('div');
  overlay.id = 'mb-scraper-overlay';
  overlay.innerHTML = `
    <div id="mb-s-inner">
      <div id="mb-s-title">MOODBOARD SCRAPER</div>
      <div id="mb-s-stats"><span id="mb-s-found">0</span> found · <span id="mb-s-saved">0</span> saved</div>
      <div id="mb-s-status">Scanning page...</div>
      <div id="mb-s-bar-bg"><div id="mb-s-bar"></div></div>
      <button id="mb-s-stop" class="mb-s-btn stop">⏹ STOP & SAVE</button>
    </div>`;
  const style = document.createElement('style');
  style.textContent = `
    #mb-scraper-overlay{position:fixed;bottom:24px;right:24px;z-index:999999;font-family:-apple-system,system-ui,sans-serif}
    #mb-s-inner{background:rgba(0,0,0,.92);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:20px 24px;min-width:280px;box-shadow:0 8px 40px rgba(0,0,0,.6)}
    #mb-s-title{font-size:11px;font-weight:700;letter-spacing:.15em;color:rgba(255,255,255,.4);margin-bottom:12px}
    #mb-s-stats{font-size:22px;font-weight:700;color:#fff;margin-bottom:4px}
    #mb-s-status{font-size:12px;color:rgba(255,255,255,.5);margin-bottom:14px}
    #mb-s-bar-bg{height:3px;background:rgba(255,255,255,.08);border-radius:2px;overflow:hidden;margin-bottom:14px}
    #mb-s-bar{height:100%;width:0%;border-radius:2px;transition:width .3s}
    .mb-s-btn{width:100%;padding:10px;border:none;border-radius:10px;font:600 12px -apple-system,system-ui,sans-serif;letter-spacing:.05em;cursor:pointer;transition:background .15s}
    .mb-s-btn.stop{background:rgba(255,70,70,.15);color:#ff6b6b}
    .mb-s-btn.stop:hover{background:rgba(255,70,70,.3)}
    .mb-s-btn.saving{background:rgba(66,133,244,.15);color:#82b1ff;pointer-events:none}
    .mb-s-btn.done{background:rgba(70,255,130,.15);color:#6bffa0}
  `;
  document.head.appendChild(style);
  document.body.appendChild(overlay);

  const $f = document.getElementById('mb-s-found');
  const $sv = document.getElementById('mb-s-saved');
  const $st = document.getElementById('mb-s-status');
  const $bar = document.getElementById('mb-s-bar');
  const $btn = document.getElementById('mb-s-stop');

  $btn.onclick = () => {
    if ($btn.dataset.done) {
      overlay.remove(); style.remove(); window.__moodboardScraping = false;
      return;
    }
    if (!saving) {
      stopped = true;
      $st.textContent = 'Stopping scroll... will save now.';
    }
  };

  // ─── VIDEO ID EXTRACTION ─────────────────────
  const ID_RE = /^[A-Za-z0-9_-]{11}$/;

  function vidId(src) {
    try {
      const u = new URL(src);
      if (u.hostname !== 'i.ytimg.com' && u.hostname !== 'img.youtube.com') return null;
      const s = u.pathname.split('/').filter(Boolean);
      for (let i = 0; i < s.length - 1; i++) {
        if (['vi', 'vi_webp', 'an_webp'].includes(s[i]) && ID_RE.test(s[i + 1])) return s[i + 1];
      }
    } catch {} return null;
  }

  function scan() {
    let n = 0;
    for (const img of document.querySelectorAll('img')) {
      const id = vidId(img.src || img.currentSrc || '');
      if (id && !seenIds.has(id)) { seenIds.add(id); allIds.push(id); n++; }
    }
    for (const a of document.querySelectorAll('a[href*="/watch?v="]')) {
      const m = (a.href || '').match(/[?&]v=([A-Za-z0-9_-]{11})/);
      if (m && !seenIds.has(m[1])) { seenIds.add(m[1]); allIds.push(m[1]); n++; }
    }
    $f.textContent = allIds.length;
    return n;
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ─── PHASE 1: SCROLL + COLLECT ───────────────
  async function scrollAndCollect() {
    const WAIT = 1800;
    const STALE_MAX = 3;
    let stale = 0;

    scan(); // initial scan
    $bar.style.background = '#4285f4';

    while (!stopped) {
      $st.textContent = `Found ${allIds.length} thumbnails. Scrolling...`;
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
      await sleep(WAIT);

      if (stopped) break;

      const n = scan();
      if (n > 0) {
        stale = 0;
        $bar.style.width = '50%';
      } else {
        stale++;
        $st.textContent = `Checking for more... (${stale}/${STALE_MAX})`;
        $bar.style.width = Math.min(80, 50 + (stale / STALE_MAX) * 30) + '%';
      }

      if (stale >= STALE_MAX) {
        // Final check
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
        await sleep(2500);
        if (scan() === 0) break;
        stale = 0;
      }
    }

    $st.textContent = `Scroll done. ${allIds.length} found. Saving...`;
  }

  // ─── PHASE 2: SAVE ──────────────────────────
  async function saveAll() {
    if (!allIds.length) return 0;

    saving = true;
    $btn.textContent = '⏳ SAVING...';
    $btn.classList.remove('stop');
    $btn.classList.add('saving');
    $bar.style.background = '#6bffa0';
    $bar.style.width = '0%';

    let saved = 0;

    for (let i = 0; i < allIds.length; i++) {
      const id = allIds[i];
      try {
        await chrome.runtime.sendMessage({
          action: 'scrape-thumbnail',
          url: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
          videoId: id
        });
        saved++;
      } catch (e) {
        console.warn('[Scraper] Failed to save', id, e.message);
      }

      $sv.textContent = saved;
      $bar.style.width = Math.round(((i + 1) / allIds.length) * 100) + '%';
      $st.textContent = `Saving ${i + 1}/${allIds.length}...`;

      // Tiny yield every 5 saves to keep UI responsive
      if (i % 5 === 4) await sleep(50);
    }

    saving = false;
    return saved;
  }

  // ─── GO ──────────────────────────────────────
  try {
    await scrollAndCollect();

    if (allIds.length === 0) {
      $st.textContent = 'No thumbnails found on this page.';
      $btn.textContent = 'DISMISS';
      $btn.dataset.done = '1';
      $btn.classList.remove('stop');
      $btn.classList.add('done');
      window.__moodboardScraping = false;
      return;
    }

    const saved = await saveAll();

    $bar.style.width = '100%';
    $bar.style.background = '#6bffa0';
    $st.textContent = `Done! ${saved} thumbnails saved to Moodboard.`;
    $btn.textContent = '✓ DISMISS';
    $btn.dataset.done = '1';
    $btn.classList.remove('saving');
    $btn.classList.add('done');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    $st.textContent = `Error: ${err.message}`;
    $btn.textContent = 'DISMISS';
    $btn.dataset.done = '1';
    $btn.classList.remove('stop', 'saving');
    $btn.classList.add('done');
  }
})();
