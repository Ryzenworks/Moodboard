// ═══════════════════════════════════════════════════
//  MOODBOARD — Content Script: Image Detection
//  Captures the exact element under right-click.
//  Reports back to background.js on request.
// ═══════════════════════════════════════════════════

(function() {
  if (window.__moodboardDetect) return;
  window.__moodboardDetect = true;

  // Store the exact element chain from the right-click event
  let lastTarget = null;
  let lastX = 0, lastY = 0;

  // Capture exact right-click target + position
  document.addEventListener('contextmenu', e => {
    lastTarget = e.target;
    document.__moodboardLastTarget = e.target;
    lastX = e.clientX;
    lastY = e.clientY;
  }, true);

  // Find image from the exact clicked element, then expand search
  function findImageFromTarget() {
    if (!lastTarget) return findImageAtPoint(lastX, lastY);

    // 1. Check the clicked element itself
    const direct = extractImageFromElement(lastTarget);
    if (direct) return direct;

    // 2. Walk UP the DOM tree (clicked overlay on top of image)
    let parent = lastTarget.parentElement;
    for (let depth = 0; parent && depth < 6; depth++, parent = parent.parentElement) {
      const img = parent.querySelector('img[src]');
      if (img && img.src && img.naturalWidth > 10) return getBestSrc(img);
      // Check background image on parent
      const bgUrl = getBgImage(parent);
      if (bgUrl) return bgUrl;
    }

    // 3. Use elementsFromPoint at click coords (pierces overlays)
    return findImageAtPoint(lastX, lastY);
  }

  function extractImageFromElement(el) {
    if (!el) return null;

    // Direct <img>
    if (el.tagName === 'IMG' && el.src && el.naturalWidth > 1) return getBestSrc(el);

    // <video> poster
    if (el.tagName === 'VIDEO' && el.poster) return el.poster;

    // <canvas>
    if (el.tagName === 'CANVAS' && el.width > 10 && el.height > 10) {
      try { return el.toDataURL('image/png'); } catch {}
    }

    // <picture>/<source>
    if (el.tagName === 'PICTURE' || el.tagName === 'SOURCE') {
      const img = el.querySelector ? el.querySelector('img') : null;
      if (img && img.src) return getBestSrc(img);
      const srcset = el.getAttribute('srcset');
      if (srcset) return parseSrcset(srcset);
    }

    // Element has child img
    const childImg = el.querySelector && el.querySelector('img[src]');
    if (childImg && childImg.src && childImg.naturalWidth > 1) return getBestSrc(childImg);

    // CSS background-image
    const bgUrl = getBgImage(el);
    if (bgUrl) return bgUrl;

    return null;
  }

  function findImageAtPoint(x, y) {
    if (!x && !y) return null;
    const stack = document.elementsFromPoint(x, y);
    for (const el of stack) {
      const url = extractImageFromElement(el);
      if (url) return url;
    }
    // No "largest image" fallback — only return what's at the click point
    return null;
  }

  function getBgImage(el) {
    try {
      const bg = getComputedStyle(el).backgroundImage;
      if (bg && bg !== 'none' && !bg.includes('gradient') && !bg.includes('data:image/svg')) {
        const m = bg.match(/url\(["']?(.*?)["']?\)/);
        if (m && m[1]) return m[1];
      }
    } catch {}
    return null;
  }

  // Get the highest resolution src from an img element
  function getBestSrc(img) {
    if (img.srcset) {
      const best = parseSrcset(img.srcset);
      if (best) return best;
    }
    return img.currentSrc || img.src;
  }

  // Parse srcset and return the largest image URL
  function parseSrcset(srcset) {
    const entries = srcset.split(',').map(s => {
      const parts = s.trim().split(/\s+/);
      const url = parts[0];
      const descriptor = parts[1] || '0w';
      const val = parseFloat(descriptor) || 0;
      return { url, val };
    });
    entries.sort((a, b) => b.val - a.val);
    return entries[0]?.url || null;
  }

  // Listen for requests from background.js
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'detect-image') {
      const imgUrl = findImageFromTarget();
      sendResponse({ url: imgUrl });
    }
  });
})();
