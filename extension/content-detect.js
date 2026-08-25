// ═══════════════════════════════════════════════════
//  MOODBOARD — Content Script: Image Detection
//  Captures the exact element under right-click.
//  Reports back to background.js on request.
// ═══════════════════════════════════════════════════

(function() {
  if (window.__moodboardDetect) return;
  window.__moodboardDetect = true;

  let lastTarget = null;
  let lastX = 0, lastY = 0;

  // Capture exact right-click target + position
  document.addEventListener('contextmenu', e => {
    lastTarget = e.target;
    lastX = e.clientX;
    lastY = e.clientY;
  }, true);

  function findImageFromTarget() {
    // 1. Check the clicked element itself
    if (lastTarget) {
      const direct = extractImageFromElement(lastTarget);
      if (direct) return direct;
    }

    // 2. elementsFromPoint — pierces overlays, finds the EXACT image
    //    under the click coords (Instagram, Pinterest, etc.)
    const pointResult = findImageAtPoint(lastX, lastY);
    if (pointResult) return pointResult;

    // 3. Walk UP from click target, pick LARGEST image (not first)
    //    This avoids grabbing profile pics on Instagram
    if (lastTarget) {
      let parent = lastTarget.parentElement;
      for (let depth = 0; parent && depth < 8; depth++, parent = parent.parentElement) {
        const largest = findLargestImage(parent);
        if (largest) return getBestSrc(largest);
        const bgUrl = getBgImage(parent);
        if (bgUrl) return bgUrl;
      }
    }

    return null;
  }

  function extractImageFromElement(el) {
    if (!el) return null;
    if (el.tagName === 'IMG' && el.src && el.naturalWidth > 1) return getBestSrc(el);
    if (el.tagName === 'VIDEO' && el.poster) return el.poster;
    if (el.tagName === 'CANVAS' && el.width > 10 && el.height > 10) {
      try { return el.toDataURL('image/png'); } catch {}
    }
    if (el.tagName === 'PICTURE' || el.tagName === 'SOURCE') {
      const img = el.querySelector ? el.querySelector('img') : null;
      if (img && img.src) return getBestSrc(img);
      const srcset = el.getAttribute('srcset');
      if (srcset) return parseSrcset(srcset);
    }
    const bgUrl = getBgImage(el);
    if (bgUrl) return bgUrl;
    return null;
  }

  function findImageAtPoint(x, y) {
    if (!x && !y) return null;
    const stack = document.elementsFromPoint(x, y);
    for (const el of stack) {
      // Direct img or video poster at the point
      if (el.tagName === 'IMG' && el.src && el.naturalWidth > 1) return getBestSrc(el);
      if (el.tagName === 'VIDEO' && el.poster) return el.poster;
      if (el.tagName === 'CANVAS' && el.width > 10 && el.height > 10) {
        try { return el.toDataURL('image/png'); } catch {}
      }
      // Background image at the point
      const bgUrl = getBgImage(el);
      if (bgUrl) return bgUrl;
    }
    return null;
  }

  // Find the LARGEST image inside a container (by pixel area)
  // Avoids grabbing tiny profile pics when the post image is nearby
  function findLargestImage(container) {
    const imgs = container.querySelectorAll('img[src]');
    if (!imgs.length) return null;
    let best = null, bestArea = 0;
    for (const img of imgs) {
      // Use naturalWidth if loaded, otherwise getBoundingClientRect
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const area = w * h;
      if (area > bestArea && w > 50 && h > 50) {
        bestArea = area;
        best = img;
      }
    }
    return best;
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

  function getBestSrc(img) {
    if (img.srcset) {
      const best = parseSrcset(img.srcset);
      if (best) return best;
    }
    return img.currentSrc || img.src;
  }

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

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'detect-image') {
      const imgUrl = findImageFromTarget();
      sendResponse({ url: imgUrl });
    }
  });
})();
