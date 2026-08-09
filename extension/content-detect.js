// ═══════════════════════════════════════════════════
//  MOODBOARD — Content Script: Image Detection
//  Runs on every page. Tracks the cursor and detects
//  the image under right-click, even through overlays.
//  Reports back to background.js on request.
// ═══════════════════════════════════════════════════

(function() {
  if (window.__moodboardDetect) return;
  window.__moodboardDetect = true;

  let lastX = 0, lastY = 0;

  // Track mouse position (lightweight — just stores coords)
  document.addEventListener('mousemove', e => {
    lastX = e.clientX;
    lastY = e.clientY;
  }, { passive: true });

  // Also track contextmenu event to capture exact right-click position
  document.addEventListener('contextmenu', e => {
    lastX = e.clientX;
    lastY = e.clientY;
  }, true);

  // Find the best image at a given point
  function findImageAt(x, y) {
    // 1. Use elementsFromPoint to get ALL elements at click (pierces overlays)
    const stack = document.elementsFromPoint(x, y);

    for (const el of stack) {
      // Direct <img>
      if (el.tagName === 'IMG' && el.src && el.naturalWidth > 1) {
        return getBestSrc(el);
      }

      // <video> poster
      if (el.tagName === 'VIDEO' && el.poster) return el.poster;

      // <canvas> — capture as data URL
      if (el.tagName === 'CANVAS' && el.width > 10 && el.height > 10) {
        try { return el.toDataURL('image/png'); } catch {}
      }

      // <picture> / <source> with srcset
      if (el.tagName === 'PICTURE' || el.tagName === 'SOURCE') {
        const img = el.querySelector ? el.querySelector('img') : null;
        if (img && img.src) return getBestSrc(img);
        const srcset = el.getAttribute('srcset');
        if (srcset) return parseSrcset(srcset);
      }

      // Element contains an img child (common for overlays)
      const childImg = el.querySelector && el.querySelector('img[src]');
      if (childImg && childImg.src && childImg.naturalWidth > 1) {
        return getBestSrc(childImg);
      }

      // CSS background-image
      try {
        const bg = getComputedStyle(el).backgroundImage;
        if (bg && bg !== 'none' && !bg.includes('gradient') && !bg.includes('data:image/svg')) {
          const m = bg.match(/url\(["']?(.*?)["']?\)/);
          if (m && m[1]) return m[1];
        }
      } catch {}
    }

    // 2. Expand search area (some sites have large click targets)
    const offsets = [-20, 0, 20];
    for (const dx of offsets) {
      for (const dy of offsets) {
        if (dx === 0 && dy === 0) continue;
        const els = document.elementsFromPoint(x + dx, y + dy);
        for (const el of els) {
          if (el.tagName === 'IMG' && el.src && el.naturalWidth > 1) {
            return getBestSrc(el);
          }
        }
      }
    }

    return null;
  }

  // Get the highest resolution src from an img element
  function getBestSrc(img) {
    // Prefer srcset's largest image
    if (img.srcset) {
      const best = parseSrcset(img.srcset);
      if (best) return best;
    }
    // currentSrc may be higher res than src (from <picture>)
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
    // Sort by descriptor value descending (largest first)
    entries.sort((a, b) => b.val - a.val);
    return entries[0]?.url || null;
  }

  // Listen for requests from background.js
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'detect-image') {
      const imgUrl = findImageAt(lastX, lastY);
      sendResponse({ url: imgUrl });
    }
  });
})();
