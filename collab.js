// ── Moodboard Real-Time Collaboration Engine ──
// Uses Firebase Firestore + Storage + Auth + Realtime Database
// Zero dependencies beyond the Firebase SDK loaded in index.html
'use strict';

(function () {
  // ── State ──
  let _room = null;         // { id, permission, ownerId, unsubImages, unsubPresence }
  let _userId = null;       // Anonymous UID after sign-in
  let _userName = null;     // "User 1", "User 2", etc.
  let _userColor = null;    // Assigned hex color
  let _presenceRef = null;  // RTDB reference for onDisconnect
  let _heartbeat = null;    // setInterval handle
  let _isOwner = false;
  let _suppressRemote = new Set(); // IDs to ignore in next onSnapshot (we just pushed them)
  let _localBackupImgs = null; // Backup of local board images before joining room

  const COLORS = ['#e53935','#fb8c00','#43a047','#1e88e5','#8e24aa','#d81b60','#00897b','#fdd835','#6d4c41','#546e7a'];

  // ── Firebase refs (lazy-init) ──
  let _db = null, _storage = null, _auth = null, _rtdb = null;

  function initFirebase() {
    if (_db) return true;
    if (typeof firebase === 'undefined' || !firebase.app) {
      console.warn('[Collab] Firebase SDK not loaded');
      return false;
    }
    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }
      _db = firebase.firestore();
      _storage = firebase.storage();
      _auth = firebase.auth();
      _rtdb = firebase.database();
      return true;
    } catch (e) {
      console.error('[Collab] Firebase init failed:', e);
      toast('Firebase setup error — check firebase-config.js');
      return false;
    }
  }

  // ── Helpers ──
  function collabActive() { return !!_room; }
  function canEdit() { return _isOwner || (_room && (_room.permission === 'editor' || _room.permission === 'full')); }
  function canAddDelete() { return _isOwner || (_room && _room.permission === 'full'); }
  function shortId() { return Math.random().toString(36).substr(2, 6).toUpperCase(); }

  // Check if the firebase config has been filled in
  function isConfigured() {
    return typeof firebaseConfig !== 'undefined' &&
           firebaseConfig.apiKey &&
           firebaseConfig.apiKey !== 'YOUR_API_KEY';
  }

  // ── Upload image to Firebase Storage ──
  async function uploadImage(roomId, imageId, src) {
    // If it's already a URL (not base64), no upload needed
    if (src.startsWith('http://') || src.startsWith('https://')) return src;

    // Extract mime type and data from base64
    const match = src.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (!match) return src; // Can't parse, store as-is (will hit Firestore limit on large images)

    const mime = match[1];
    const ext = mime.split('/')[1] === 'jpeg' ? 'jpg' : mime.split('/')[1] || 'png';
    const raw = atob(match[2]);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    const blob = new Blob([arr], { type: mime });

    const ref = _storage.ref(`rooms/${roomId}/${imageId}.${ext}`);
    await ref.put(blob);
    return await ref.getDownloadURL();
  }

  // ── Delete image from Firebase Storage ──
  async function deleteStorageImage(roomId, imageId) {
    try {
      // Try common extensions
      for (const ext of ['png', 'jpg', 'gif', 'webp']) {
        try {
          await _storage.ref(`rooms/${roomId}/${imageId}.${ext}`).delete();
          return;
        } catch (e) { /* not found, try next */ }
      }
    } catch (e) { /* ignore */ }
  }

  // ── Sign in anonymously ──
  async function ensureAuth() {
    if (_auth.currentUser) {
      _userId = _auth.currentUser.uid;
      return;
    }
    const cred = await _auth.signInAnonymously();
    _userId = cred.user.uid;
  }

  // ── PRESENCE ──
  function setupPresence(roomId) {
    if (!_rtdb) return;

    _userName = 'User ' + shortId().slice(0, 2);
    _userColor = COLORS[Math.floor(Math.random() * COLORS.length)];

    const presPath = `rooms/${roomId}/presence/${_userId}`;
    _presenceRef = _rtdb.ref(presPath);

    // Write presence data
    const data = { name: _userName, color: _userColor, joinedAt: firebase.database.ServerValue.TIMESTAMP };
    _presenceRef.set(data);

    // Auto-remove on disconnect
    _presenceRef.onDisconnect().remove();

    // Heartbeat — update every 30s
    _heartbeat = setInterval(() => {
      if (_presenceRef) _presenceRef.update({ lastSeen: firebase.database.ServerValue.TIMESTAMP });
    }, 30000);

    // Listen for others
    const roomPresRef = _rtdb.ref(`rooms/${roomId}/presence`);
    roomPresRef.on('value', snap => {
      const users = snap.val() || {};
      renderPresence(users);
    });

    // Store ref for cleanup
    _room._presRef = roomPresRef;
  }

  function teardownPresence() {
    if (_heartbeat) { clearInterval(_heartbeat); _heartbeat = null; }
    if (_presenceRef) {
      _presenceRef.remove().catch(() => {});
      _presenceRef.onDisconnect().cancel().catch(() => {});
      _presenceRef = null;
    }
    if (_room && _room._presRef) {
      _room._presRef.off();
      _room._presRef = null;
    }
  }

  function renderPresence(users) {
    const bar = document.getElementById('collab-users');
    if (!bar) return;
    bar.innerHTML = '';
    const uids = Object.keys(users);
    uids.forEach(uid => {
      const u = users[uid];
      const dot = document.createElement('div');
      dot.className = 'presence-dot';
      dot.style.background = u.color || '#888';
      dot.title = u.name + (uid === _userId ? ' (you)' : '');
      dot.textContent = (u.name || '?')[0].toUpperCase();
      bar.appendChild(dot);
    });
    // Update count
    const countEl = document.getElementById('collab-user-count');
    if (countEl) countEl.textContent = uids.length + ' online';
  }

  // ── CREATE ROOM ──
  async function createRoom(permission) {
    console.log('[Collab] createRoom called, permission:', permission);

    if (!initFirebase()) {
      toast('Firebase SDK failed to load — are you online?');
      console.error('[Collab] initFirebase returned false');
      return;
    }
    if (!isConfigured()) {
      toast('Please configure firebase-config.js first');
      console.error('[Collab] firebaseConfig not configured');
      return;
    }

    try {
      await ensureAuth();
      const roomId = shortId();

      // Show progress
      if (typeof showProg === 'function') showProg('Creating room...', imgs.length || 1);

      // Create room document
      await _db.collection('rooms').doc(roomId).set({
        owner: _userId,
        permission: permission,
        created: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Sync metadata only — NO image uploads to Storage
      // URL images keep their src (visible to everyone)
      // Base64 images get a 'local' marker (only visible to owner)
      const batch_size = 400;
      let batch = _db.batch();
      let batchCount = 0;

      for (let i = 0; i < imgs.length; i++) {
        const im = imgs[i];
        if (typeof updProg === 'function') updProg(i + 1, imgs.length);

        // Only sync the URL if it's a web URL, otherwise mark as local
        const isUrl = im.src && (im.src.startsWith('http://') || im.src.startsWith('https://'));
        const syncSrc = isUrl ? im.src : 'local';

        const docRef = _db.collection('rooms').doc(roomId).collection('images').doc(im.id);
        batch.set(docRef, {
          src: syncSrc,
          filename: im.filename,
          timestamp: im.timestamp,
          viewCount: im.viewCount || 0,
          categories: im.categories || [],
          note: im.note || '',
          fav: im.fav || false,
          manualOrder: im.manualOrder || i,
          palette: im.palette || [],
          hash: im.hash || '',
          uploadedBy: _userId
        });

        batchCount++;
        if (batchCount >= batch_size) {
          await batch.commit();
          batch = _db.batch();
          batchCount = 0;
        }
      }

      if (batchCount > 0) await batch.commit();
      if (typeof hideProg === 'function') hideProg();

      // Now join the room we just created
      _isOwner = true;
      await joinRoomInternal(roomId, permission);

      // Copy link to clipboard
      const url = new URL(window.location.href);
      url.search = '?room=' + roomId;
      try {
        await navigator.clipboard.writeText(url.toString());
        toast('Room created! Code: ' + roomId + ' (copied)');
      } catch (e) {
        toast('Room created! Share this code: ' + roomId);
      }

      closeCollabModal();
    } catch (e) {
      if (typeof hideProg === 'function') hideProg();
      console.error('[Collab] createRoom failed:', e);
      toast('Failed to create room: ' + e.message);
    }
  }

  // ── JOIN ROOM ──
  async function joinRoom(roomId) {
    if (!initFirebase()) return;
    if (!isConfigured()) {
      toast('Please configure firebase-config.js first');
      return;
    }

    try {
      await ensureAuth();

      // Check room exists
      const roomDoc = await _db.collection('rooms').doc(roomId).get();
      if (!roomDoc.exists) {
        toast('Room not found: ' + roomId);
        return;
      }

      const data = roomDoc.data();
      _isOwner = data.owner === _userId;

      if (typeof showProg === 'function') showProg('Joining room...', 1);

      await joinRoomInternal(roomId, data.permission);

      if (typeof hideProg === 'function') hideProg();
      toast('Joined room ' + roomId);
      closeCollabModal();
    } catch (e) {
      if (typeof hideProg === 'function') hideProg();
      console.error('[Collab] joinRoom failed:', e);
      toast('Failed to join room: ' + e.message);
    }
  }

  // ── Internal join — setup listeners ──
  async function joinRoomInternal(roomId, permission) {
    // Tear down any existing room
    if (_room) await leaveRoom(true);

    _room = { id: roomId, permission: permission };

    // Load initial images from Firestore
    const snapshot = await _db.collection('rooms').doc(roomId).collection('images').get();

    if (!_isOwner) {
      if (!_localBackupImgs && imgs.length > 0) {
        _localBackupImgs = imgs.slice();
      }
      // Replace local state with room data
      imgs.length = 0;
      hashSet.clear();
      imgMap.clear();
    }

    snapshot.forEach(doc => {
      const d = doc.data();
      const id = doc.id;
      if (!imgMap.has(id)) {
        const im = {
          id: id,
          src: d.src || '',
          filename: d.filename || 'image.png',
          timestamp: d.timestamp || Date.now(),
          viewCount: d.viewCount || 0,
          categories: d.categories || [],
          note: d.note || '',
          fav: d.fav || false,
          manualOrder: d.manualOrder || imgs.length,
          palette: d.palette || [],
          hash: d.hash || ''
        };
        imgs.push(im);
        imgMap.set(im.id, im);
        if (im.hash) hashSet.add(im.hash);
      }
    });

    if (!_isOwner) {
      render();
    }

    // Setup real-time listener for changes
    const unsubImages = _db.collection('rooms').doc(roomId).collection('images')
      .onSnapshot(snap => {
        snap.docChanges().forEach(change => {
          const id = change.doc.id;
          const d = change.doc.data();

          // Skip changes we just pushed
          if (_suppressRemote.has(id)) {
            _suppressRemote.delete(id);
            return;
          }

          if (change.type === 'added') {
            // Only add if we don't already have it
            if (!imgMap.has(id)) {
              const im = {
                id: id,
                src: d.src || '',
                filename: d.filename || 'image.png',
                timestamp: d.timestamp || Date.now(),
                viewCount: d.viewCount || 0,
                categories: d.categories || [],
                note: d.note || '',
                fav: d.fav || false,
                manualOrder: d.manualOrder || imgs.length,
                palette: d.palette || [],
                hash: d.hash || ''
              };
              imgs.push(im);
              imgMap.set(im.id, im);
              if (im.hash) hashSet.add(im.hash);

              // Add categories to local list
              im.categories.forEach(c => { if (typeof addCat === 'function') addCat(c); });

              // Insert card into DOM without full re-render
              if (typeof mkCard === 'function' && document.getElementById('grid')) {
                filtered = doFilter();
                sorted = doSort(filtered);
                const card = mkCard(im);
                card.style.animation = 'cardIn 180ms cubic-bezier(.2,0,.4,1)';
                const cols = document.querySelectorAll('.grid-col');
                if (cols.length) {
                  let shortest = cols[0], minH = cols[0].offsetHeight;
                  for (let c = 1; c < cols.length; c++) {
                    if (cols[c].offsetHeight < minH) { minH = cols[c].offsetHeight; shortest = cols[c]; }
                  }
                  shortest.prepend(card);
                }
                morphText(document.getElementById('imgCount'), filtered.length + ' images');
              }
            }
          } else if (change.type === 'modified') {
            const im = imgMap.get(id);
            if (im) {
              // Update metadata fields (but not src — that doesn't change)
              if (d.categories) im.categories = d.categories;
              if (d.note !== undefined) im.note = d.note;
              if (d.fav !== undefined) im.fav = d.fav;
              if (d.manualOrder !== undefined) im.manualOrder = d.manualOrder;
              if (d.palette) im.palette = d.palette;
              if (d.filename) im.filename = d.filename;
              if (d.viewCount !== undefined) im.viewCount = d.viewCount;

              // Update the card DOM
              if (typeof updateCardMeta === 'function') updateCardMeta(id);

              // Update fav badge
              const card = document.querySelector('[data-id="' + id + '"]');
              if (card) {
                const badges = card.querySelector('.badges');
                const favBtn = card.querySelector('.ov-fav');
                if (im.fav) {
                  if (badges && !badges.querySelector('.badge-fav')) {
                    const b = document.createElement('div');
                    b.className = 'badge-icon badge-fav';
                    b.innerHTML = ICO.star;
                    badges.prepend(b);
                  }
                  if (favBtn) favBtn.innerHTML = ICO.star;
                } else {
                  const bf = badges && badges.querySelector('.badge-fav');
                  if (bf) bf.remove();
                  if (favBtn) favBtn.innerHTML = ICO.starO;
                }
              }

              // Re-sort and filter
              filtered = doFilter();
              sorted = doSort(filtered);

              // Sync categories to local cat list
              im.categories.forEach(c => { if (typeof addCat === 'function') addCat(c); });
            }
          } else if (change.type === 'removed') {
            const im = imgMap.get(id);
            if (im) {
              if (im.hash) hashSet.delete(im.hash);
              const idx = imgs.findIndex(x => x.id === id);
              if (idx > -1) imgs.splice(idx, 1);
              imgMap.delete(id);

              // Animate card removal
              const el = document.querySelector('[data-id="' + id + '"]');
              if (el) {
                el.style.opacity = '0';
                el.style.transform = 'scale(.9)';
                setTimeout(() => el.remove(), 180);
              }

              filtered = doFilter();
              sorted = doSort(filtered);
              morphText(document.getElementById('imgCount'), filtered.length + ' images');
            }
          }
        });
      }, err => {
        console.error('[Collab] Snapshot error:', err);
        toast('Connection lost — trying to reconnect...');
      });

    _room.unsubImages = unsubImages;

    // Setup presence
    setupPresence(roomId);

    // Update UI
    updateCollabUI();
    applyPermissionRestrictions();

    // Update URL without reload
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomId);
    history.replaceState(null, '', url.toString());
  }

  // ── LEAVE ROOM ──
  async function leaveRoom(silent) {
    if (!_room) return;

    // Unsubscribe Firestore listener
    if (_room.unsubImages) { _room.unsubImages(); _room.unsubImages = null; }

    // Teardown presence
    teardownPresence();

    const wasRoom = _room.id;
    _room = null;
    _isOwner = false;
    _suppressRemote.clear();

    // Remove permission restrictions
    document.body.classList.remove('collab-readonly', 'collab-no-add');

    // Update UI
    updateCollabUI();

    // Remove room from URL
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    history.replaceState(null, '', url.pathname);

    // Reload from IndexedDB or local backup
    if (!silent) {
      try {
        if (_localBackupImgs && _localBackupImgs.length > 0) {
          imgs = _localBackupImgs.slice();
          _localBackupImgs = null;
        } else {
          imgs = await dbLoad();
        }
        hashSet.clear();
        imgMap.clear();
        imgs.forEach(i => {
          if (i.hash) hashSet.add(i.hash);
          imgMap.set(i.id, i);
        });
        render();
        toast('Left room ' + wasRoom);
      } catch (e) {
        toast('Left room');
      }
    }
  }

  // ── DELETE ROOM (owner only) ──
  async function deleteRoom() {
    if (!_room || !_isOwner) return;
    const roomId = _room.id;

    try {
      // Delete all images subcollection
      const snap = await _db.collection('rooms').doc(roomId).collection('images').get();
      const batch = _db.batch();
      snap.forEach(doc => batch.delete(doc.ref));
      await batch.commit();

      // Delete room document
      await _db.collection('rooms').doc(roomId).delete();

      // Delete storage folder (best effort)
      // Firebase Storage doesn't support folder deletion, so we skip this

      // Clean up RTDB presence
      await _rtdb.ref(`rooms/${roomId}`).remove();

      await leaveRoom();
      toast('Room deleted');
    } catch (e) {
      console.error('[Collab] deleteRoom failed:', e);
      toast('Failed to delete room');
    }
  }

  // ── SYNC HOOKS — called from index.html mutation points ──

  // Called after addOne() adds an image locally
  window._collabSyncAdd = async function (im) {
    if (!_room) return;
    if (!canAddDelete()) return;

    _suppressRemote.add(im.id);

    try {
      // URL images sync as-is, base64 images get a 'local' marker
      const isUrl = im.src && (im.src.startsWith('http://') || im.src.startsWith('https://'));
      const syncSrc = isUrl ? im.src : 'local';

      await _db.collection('rooms').doc(_room.id).collection('images').doc(im.id).set({
        src: syncSrc,
        filename: im.filename,
        timestamp: im.timestamp,
        viewCount: im.viewCount || 0,
        categories: im.categories || [],
        note: im.note || '',
        fav: im.fav || false,
        manualOrder: im.manualOrder || 0,
        palette: im.palette || [],
        hash: im.hash || '',
        uploadedBy: _userId
      });
    } catch (e) {
      console.error('[Collab] syncAdd failed:', e);
      _suppressRemote.delete(im.id);
    }
  };

  // Called after delImg() deletes locally
  window._collabSyncDelete = async function (id) {
    if (!_room) return;
    if (!canAddDelete()) return;

    _suppressRemote.add(id);

    try {
      await _db.collection('rooms').doc(_room.id).collection('images').doc(id).delete();
      deleteStorageImage(_room.id, id);
    } catch (e) {
      console.error('[Collab] syncDelete failed:', e);
      _suppressRemote.delete(id);
    }
  };

  // Called after metadata changes (categories, note, fav, manualOrder)
  window._collabSyncUpdate = async function (id, fields) {
    if (!_room) return;
    if (!canEdit()) return;

    _suppressRemote.add(id);

    try {
      await _db.collection('rooms').doc(_room.id).collection('images').doc(id).update(fields);
    } catch (e) {
      console.error('[Collab] syncUpdate failed:', e);
      _suppressRemote.delete(id);
    }
  };

  // Batch update (for multi-select operations)
  window._collabSyncBatch = async function (ids, fields) {
    if (!_room) return;
    if (!canEdit()) return;

    try {
      const batch = _db.batch();
      ids.forEach(id => {
        _suppressRemote.add(id);
        const ref = _db.collection('rooms').doc(_room.id).collection('images').doc(id);
        batch.update(ref, fields);
      });
      await batch.commit();
    } catch (e) {
      console.error('[Collab] syncBatch failed:', e);
      ids.forEach(id => _suppressRemote.delete(id));
    }
  };

  // Check if collab is active (used by index.html to decide whether to call sync hooks)
  window._collabActive = function () { return collabActive(); };
  window._collabCanEdit = function () { return canEdit(); };
  window._collabCanAddDelete = function () { return canAddDelete(); };

  // ── UI ──
  function updateCollabUI() {
    const bar = document.getElementById('collab-bar');
    const btn = document.getElementById('collabBtn');
    if (!bar) return;

    if (_room) {
      bar.style.display = 'flex';
      document.getElementById('collab-room-id').textContent = _room.id;

      const permEl = document.getElementById('collab-perm');
      if (permEl) {
        const labels = { view: '👁️ View Only', editor: '✏️ Editor', full: '🔓 Full Access' };
        permEl.textContent = labels[_room.permission] || _room.permission;
      }

      if (btn) btn.classList.add('active');

      // Show/hide owner controls
      const ownerCtrls = document.getElementById('collab-owner-controls');
      if (ownerCtrls) ownerCtrls.style.display = _isOwner ? 'flex' : 'none';
    } else {
      bar.style.display = 'none';
      if (btn) btn.classList.remove('active');
    }
  }

  function applyPermissionRestrictions() {
    if (!_room) {
      document.body.classList.remove('collab-readonly', 'collab-no-add');
      return;
    }

    if (!canEdit()) {
      document.body.classList.add('collab-readonly');
      document.body.classList.add('collab-no-add');
    } else if (!canAddDelete()) {
      document.body.classList.remove('collab-readonly');
      document.body.classList.add('collab-no-add');
    } else {
      document.body.classList.remove('collab-readonly', 'collab-no-add');
    }
  }

  function openCollabModal() {
    const m = document.getElementById('collab-modal');
    if (m) m.style.display = 'flex';
  }

  function closeCollabModal() {
    const m = document.getElementById('collab-modal');
    if (m) m.style.display = 'none';
  }

  // ── INIT — bind UI events, check URL for room param ──
  function initCollab() {
    console.log('[Collab] initCollab running...');

    // Collab button in topbar
    const btn = document.getElementById('collabBtn');
    if (btn) {
      console.log('[Collab] collabBtn found, attaching handler');
      btn.onclick = () => {
        if (_room) {
          // Already in a room — show the bar or leave
          const bar = document.getElementById('collab-bar');
          if (bar && bar.style.display === 'none') updateCollabUI();
          else openCollabModal();
        } else {
          openCollabModal();
        }
      };
    } else {
      console.warn('[Collab] collabBtn NOT found in DOM');
    }

    // Create room button
    const createBtn = document.getElementById('collab-create-btn');
    if (createBtn) {
      console.log('[Collab] collab-create-btn found, attaching handler');
      createBtn.onclick = async () => {
        const permSelect = document.getElementById('collab-perm-select');
        const perm = permSelect ? permSelect.value : 'full';
        console.log('[Collab] Create button clicked, perm:', perm);
        createBtn.disabled = true;
        createBtn.textContent = 'Creating...';
        try {
          await createRoom(perm);
        } catch(e) {
          console.error('[Collab] createRoom error:', e);
          toast('Error: ' + e.message);
        }
        createBtn.disabled = false;
        createBtn.textContent = 'Create & Copy Link';
      };
    } else {
      console.warn('[Collab] collab-create-btn NOT found in DOM');
    }

    // Join room button
    const joinBtn = document.getElementById('collab-join-btn');
    if (joinBtn) {
      joinBtn.onclick = () => {
        const input = document.getElementById('collab-join-input');
        const code = input ? input.value.trim().toUpperCase() : '';
        if (!code) { toast('Enter a room code'); return; }
        joinRoom(code);
      };
    }

    // Join input — enter key
    const joinInput = document.getElementById('collab-join-input');
    if (joinInput) {
      joinInput.onkeydown = e => {
        if (e.key === 'Enter') {
          const joinBtn2 = document.getElementById('collab-join-btn');
          if (joinBtn2) joinBtn2.click();
        }
      };
    }

    // Leave room button
    const leaveBtn = document.getElementById('collab-leave-btn');
    if (leaveBtn) leaveBtn.onclick = () => leaveRoom();

    // Delete room button
    const deleteBtn = document.getElementById('collab-delete-btn');
    if (deleteBtn) deleteBtn.onclick = () => {
      if (confirm('Delete this room? All shared data will be lost.')) deleteRoom();
    };

    // Copy link button
    const copyBtn = document.getElementById('collab-copy-btn');
    if (copyBtn) {
      copyBtn.onclick = () => {
        if (!_room) return;
        const url = new URL(window.location.href);
        url.searchParams.set('room', _room.id);
        navigator.clipboard.writeText(url.toString())
          .then(() => toast('Link copied!'))
          .catch(() => toast('Code: ' + _room.id));
      };
    }

    // Close modal
    const closeBtn = document.getElementById('collab-modal-close');
    if (closeBtn) closeBtn.onclick = closeCollabModal;
    const modal = document.getElementById('collab-modal');
    if (modal) modal.onclick = e => { if (e.target === modal) closeCollabModal(); };

    // Tab switching
    document.querySelectorAll('.collab-tab-btn').forEach(tab => {
      tab.onclick = () => {
        document.querySelectorAll('.collab-tab-btn').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.collab-tab-panel').forEach(p => p.style.display = 'none');
        tab.classList.add('active');
        const panel = document.getElementById(tab.dataset.tab);
        if (panel) panel.style.display = 'block';
      };
    });

    // Keyboard shortcut: Ctrl+Shift+C
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        if (_room) updateCollabUI();
        else openCollabModal();
      }
    });

    // Check URL for ?room= parameter
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      // Wait for moodboard to be ready, then join
      const waitAndJoin = () => {
        if (window.__moodboardReady) {
          joinRoom(roomParam.toUpperCase());
        } else {
          setTimeout(waitAndJoin, 200);
        }
      };
      waitAndJoin();
    }
  }

  // Auto-init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCollab);
  } else {
    // DOM already loaded — wait a tick for index.html's own script to finish
    setTimeout(initCollab, 100);
  }

  // Expose for debugging
  window._collab = {
    createRoom, joinRoom, leaveRoom, deleteRoom,
    get active() { return collabActive(); },
    get room() { return _room; },
    get isOwner() { return _isOwner; }
  };
})();
