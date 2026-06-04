/* ═══════════════════════════════════════════════════
   CampusVibes – app.js  (UPDATED)
   All fixes: Search, Delete, Club Members, Story Video, Profile Stats
═══════════════════════════════════════════════════ */

'use strict';

// ── FIREBASE CONFIG ──────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyBCUY1U0FDFpa_JMIRAhgZGsf9jqE5KN7k",
  authDomain: "friendsc-4992e.firebaseapp.com",
  projectId: "friendsc-4992e",
  storageBucket: "friendsc-4992e.firebasestorage.app",
  messagingSenderId: "1010467260080",
  appId: "1:1010467260080:web:8be403df695a4f84a31d75",
  measurementId: "G-QH3XDKPXPP",
  databaseURL: "https://friendsc-4992e-default-rtdb.asia-southeast1.firebasedatabase.app/"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();
const rtdb = firebase.database();

try {
  db.settings({ cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED, merge: true });
  firebase.firestore.setLogLevel('silent');
} catch(e) {}
db.enablePersistence({ synchronizeTabs: true })
  .catch(err => {
    if (err.code !== 'failed-precondition' && err.code !== 'unimplemented') {
      console.warn('Firestore persistence error:', err.code);
    }
  });

// ── CLOUDINARY CONFIG ────────────────────────────
const CLOUD_NAME = 'dqnulhh54';
const UPLOAD_PRESET = 'Friendsc';

// ── AVATARS ──────────────────────────────────────
const AVATARS = ['😎','🤓','🎓','😜','🦊','🐼','🦋','🐸','🌸','🎭','🦁','🐯',
                 '🐵','🦄','🐺','🦀','🎃','👻','🤖','👽','💀','🧠','🔥','⚡',
                 '🌈','🍕','🎮','🎵','🏆','🎨','🚀','🌙','⭐','💎','🎯','🎲'];
const CLUB_EMOJI = { tech:'💻', arts:'🎨', sports:'⚽', music:'🎵', debate:'🗣️', social:'🎉' };

// ── STATE ────────────────────────────────────────
let currentUser = null;
let currentUserData = null;
let currentChatId = null;
let currentChatUid = null;
let chatListener = null;
let datingProfiles = [];
let datingIdx = 0;
let searchDebounce = null;
let currentSearchFilter = 'all';
let currentNotesFilter  = 'all';
let notesSearchDebounce = null;
let friendsList    = [];   // confirmed friend uids
let pendingRequests = [];  // incoming request uids (other person sent to me)
let outgoingRequests = []; // uids I sent requests to

// ── DOM HELPERS ──────────────────────────────────
const $ = id => document.getElementById(id);
const show = el => (typeof el === 'string' ? $(el) : el).classList.add('show');
const hide = el => (typeof el === 'string' ? $(el) : el).classList.remove('show');
const openModal = id => $(id).classList.add('open');
const closeModal = id => $(id).classList.remove('open');

function playNotifSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.12);
    g.gain.setValueAtTime(0.25, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    o.start(); o.stop(ctx.currentTime + 0.35);
  } catch(e) {}
}


function toast(msg, type = 'info') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(() => t.classList.remove('show'), 2800);
}
function showLoading() { show('loading-overlay'); }
function hideLoading() { hide('loading-overlay'); }

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - (ts.toMillis ? ts.toMillis() : ts);
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

// Extract hashtags from text
function extractHashtags(text) {
  if (!text) return [];
  const matches = text.match(/#[a-zA-Z0-9_]+/g) || [];
  return [...new Set(matches.map(t => t.toLowerCase()))];
}

// Highlight hashtags in text
function highlightHashtags(text) {
  if (!text) return '';
  return escHtml(text).replace(/#([a-zA-Z0-9_]+)/g,
    '<span style="color:var(--accent3);font-weight:600">#$1</span>');
}

// ── CLOUDINARY UPLOAD ────────────────────────────
function showUploadProgress(label) {
  const bar = document.getElementById('upload-progress-bar');
  if (!bar) return;
  document.getElementById('upb-label').textContent = label || 'Uploading…';
  document.getElementById('upb-fill').style.width = '0%';
  document.getElementById('upb-pct').textContent = '0%';
  bar.classList.add('visible');
}
function updateUploadProgress(pct) {
  const fill = document.getElementById('upb-fill');
  const lbl  = document.getElementById('upb-pct');
  if (fill) fill.style.width = Math.min(pct,100) + '%';
  if (lbl)  lbl.textContent  = Math.round(Math.min(pct,100)) + '%';
}
function hideUploadProgress() {
  const bar = document.getElementById('upload-progress-bar');
  if (bar) bar.classList.remove('visible');
}

function uploadToCloudinary(file, resourceType, label) {
  resourceType = resourceType || 'auto';
  return new Promise(function(resolve, reject) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', UPLOAD_PRESET);
    fd.append('resource_type', resourceType);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://api.cloudinary.com/v1_1/' + CLOUD_NAME + '/' + resourceType + '/upload');
    const lbl = label || (file.type.startsWith('video') ? '🎬 Uploading video…' : '📸 Uploading image…');
    showUploadProgress(lbl);
    xhr.upload.onprogress = function(e) {
      if (e.lengthComputable) updateUploadProgress((e.loaded / e.total) * 100);
    };
    xhr.onload = function() {
      hideUploadProgress();
      try {
        const data = JSON.parse(xhr.responseText);
        if (data.error) { reject(new Error(data.error.message)); return; }
        resolve(data.secure_url);
      } catch(e) { reject(e); }
    };
    xhr.onerror = function() { hideUploadProgress(); reject(new Error('Upload failed')); };
    xhr.send(fd);
  });
}

// ══════════════════════════════════════
// AUTH
// ══════════════════════════════════════
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    btn.classList.add('active');
    $(`${btn.dataset.tab}-form`).classList.add('active');
  });
});

$('signup-btn').addEventListener('click', async () => {
  const name     = $('signup-name').value.trim();
  const username = $('signup-username').value.trim().replace('@','');
  const college  = $('signup-college').value.trim();
  const email    = $('signup-email').value.trim();
  const password = $('signup-password').value;
  if (!name || !username || !college || !email || !password) return toast('Fill all fields', 'error');
  showLoading();
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    await cred.user.updateProfile({ displayName: name });
    await db.collection('users').doc(cred.user.uid).set({
      uid: cred.user.uid, name, username, college,
      email, avatar: '😎', bio: '',
      posts: 0, friends: 0, clubs: [],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    toast('Welcome to CampusVibes! 🎓', 'success');
  } catch (e) {
    $('auth-error').textContent = e.message;
    hideLoading();
  }
});

$('login-btn').addEventListener('click', async () => {
  const email    = $('login-email').value.trim();
  const password = $('login-password').value;
  if (!email || !password) return toast('Fill all fields', 'error');
  showLoading();
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (e) {
    $('auth-error').textContent = e.message;
    hideLoading();
  }
});

const googleProvider = new firebase.auth.GoogleAuthProvider();
['google-login-btn','google-signup-btn'].forEach(id => {
  $(id)?.addEventListener('click', async () => {
    showLoading();
    try {
      const cred = await auth.signInWithPopup(googleProvider);
      const u = cred.user;
      const snap = await db.collection('users').doc(u.uid).get();
      if (!snap.exists) {
        await db.collection('users').doc(u.uid).set({
          uid: u.uid, name: u.displayName || 'Student',
          username: u.email.split('@')[0], college: 'My College',
          email: u.email, avatar: '😎', bio: '',
          posts: 0, friends: 0, clubs: [],
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
    } catch (e) {
      $('auth-error').textContent = e.message;
      hideLoading();
    }
  });
});

$('logout-btn').addEventListener('click', () => {
  if (confirm('Logout?')) auth.signOut();
});

auth.onAuthStateChanged(async user => {
  hideLoading();
  if (user) {
    currentUser = user;
    try {
      const snap = await db.collection('users').doc(user.uid).get();
      currentUserData = snap.data() || {
        uid: user.uid, name: user.displayName || 'Student',
        username: user.email?.split('@')[0] || 'user',
        college: 'My College', avatar: '😎', bio: ''
      };
    } catch (e) {
      currentUserData = {
        uid: user.uid, name: user.displayName || 'Student',
        username: user.email?.split('@')[0] || 'user',
        college: 'My College', avatar: '😎', bio: ''
      };
      toast('Connection issue — some features may be limited.', 'error');
    }
    $('auth-screen').classList.remove('active');
    $('app-screen').classList.add('active');
    lucide.createIcons();
    initApp();
  } else {
    currentUser = null;
    currentUserData = null;
    $('app-screen').classList.remove('active');
    $('auth-screen').classList.add('active');
    lucide.createIcons();
  }
});

// ══════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════
function initApp() {
  setupNav();
  loadProfile();
  loadFeed();
  loadStories();
  setupChats();
  setupSearch();
  setupGlobalVideoControl();
  setupNotifications();
  loadFriends();
  setupNotes();
  initFCM();
  lucide.createIcons();
}

// Global: when ANY video starts playing, pause all others
function setupGlobalVideoControl() {
  document.addEventListener('play', function(e) {
    if (e.target.tagName !== 'VIDEO') return;
    document.querySelectorAll('video').forEach(function(v) {
      if (v !== e.target && !v.paused) {
        v.pause();
        // Also reset custom player UI
        var wrap = v.closest('.post-video-wrap');
        if (wrap) {
          var btn = wrap.querySelector('.cv-play-pause');
          if (btn) btn.innerHTML = '&#9654;';
        }
      }
    });
  }, true); // capture phase so it fires before the video's own handlers
}

function setupNav() {
  document.querySelectorAll('[data-view]').forEach(el => {
    el.addEventListener('click', () => switchView(el.dataset.view));
  });
}

function switchView(view) {
  // Stop all playing videos before switching
  document.querySelectorAll('video').forEach(v => { try { v.pause(); } catch(e){} });
  document.querySelectorAll('.post-video-wrap.playing').forEach(w => w.classList.remove('playing'));
  document.querySelectorAll('.cv-play-pause').forEach(b => { b.innerHTML = '&#9654;'; });

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $(`view-${view}`)?.classList.add('active');
  document.querySelectorAll('.nav-item, .mnav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.view === view);
  });
  if (view === 'feed') { if (!$('feed-list').hasChildNodes() || $('feed-list').querySelector('.loading-spinner')) loadFeed(); }
  if (view === 'confessions') loadConfessions();
  if (view === 'memes') loadMemes();
  if (view === 'polls') loadPolls();
  if (view === 'clubs') loadClubs();
  if (view === 'chats') loadChatList();
  if (view === 'friends') loadFriendsView();
  if (view === 'profile') loadProfile();
  lucide.createIcons();
}

// ══════════════════════════════════════
// MODALS
// ══════════════════════════════════════
document.querySelectorAll('.modal-close').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('story-vid')?.pause();
    closeModal(btn.dataset.modal);
  });
});
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) {
      document.getElementById('story-vid')?.pause();
      overlay.classList.remove('open');
    }
  });
});

// ══════════════════════════════════════
// SEARCH SYSTEM
// ══════════════════════════════════════
function setupSearch() {
  $('search-back-btn')?.addEventListener('click', () => switchView('feed'));

  // Sidebar search
  const sidebarInput = $('sidebar-search-input');
  if (sidebarInput) {
    sidebarInput.addEventListener('input', e => {
      const q = e.target.value.trim();
      if (q.length > 0) {
        switchView('search');
        $('mobile-search-input') && ($('mobile-search-input').value = q);
        debouncedSearch(q);
      }
    });
    sidebarInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const q = sidebarInput.value.trim();
        if (q) { switchView('search'); debouncedSearch(q); }
      }
    });
  }

  // Mobile search (inside search view)
  const mobileInput = $('mobile-search-input');
  if (mobileInput) {
    mobileInput.addEventListener('input', e => {
      debouncedSearch(e.target.value.trim());
    });
  }

  // Feed search button
  $('feed-search-btn')?.addEventListener('click', () => switchView('search'));

  // Filter tabs
  document.querySelectorAll('.search-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.search-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentSearchFilter = tab.dataset.filter;
      const q = ($('mobile-search-input')?.value || $('sidebar-search-input')?.value || '').trim();
      if (q) debouncedSearch(q);
    });
  });
}

function debouncedSearch(q) {
  clearTimeout(searchDebounce);
  if (!q) {
    $('search-results').innerHTML = `<div class="search-empty-state"><span style="font-size:48px">🔍</span><p>Search for users, clubs, posts, memes, or hashtags</p></div>`;
    return;
  }
  $('search-results').innerHTML = `<div class="loading-spinner">Searching…</div>`;
  searchDebounce = setTimeout(() => performSearch(q), 350);
}

async function performSearch(q) {
  const qLow = q.toLowerCase();
  const results = { users: [], clubs: [], posts: [], memes: [], hashtags: [] };
  const filter = currentSearchFilter;

  try {
    const promises = [];

    // Users
    if (filter === 'all' || filter === 'users') {
      promises.push(
        db.collection('users').limit(50).get().then(snap => {
          snap.forEach(doc => {
            const d = doc.data();
            if ((d.name||'').toLowerCase().includes(qLow) ||
                (d.username||'').toLowerCase().includes(qLow) ||
                (d.college||'').toLowerCase().includes(qLow)) {
              results.users.push({id: doc.id, ...d});
            }
          });
        })
      );
    }

    // Clubs
    if (filter === 'all' || filter === 'clubs') {
      promises.push(
        db.collection('clubs').limit(50).get().then(snap => {
          snap.forEach(doc => {
            const d = doc.data();
            if ((d.name||'').toLowerCase().includes(qLow) ||
                (d.desc||'').toLowerCase().includes(qLow) ||
                (d.category||'').toLowerCase().includes(qLow)) {
              results.clubs.push({id: doc.id, ...d});
            }
          });
        })
      );
    }

    // Posts
    if (filter === 'all' || filter === 'posts' || filter === 'hashtags') {
      promises.push(
        db.collection('posts').orderBy('createdAt','desc').limit(100).get().then(snap => {
          snap.forEach(doc => {
            const d = doc.data();
            const text = (d.text||'').toLowerCase();
            if (filter === 'hashtags') {
              const isHashtag = q.startsWith('#') ? text.includes(q.toLowerCase()) : text.includes(`#${qLow}`);
              if (isHashtag) results.posts.push({id: doc.id, ...d});
            } else if (text.includes(qLow) || (d.name||'').toLowerCase().includes(qLow)) {
              results.posts.push({id: doc.id, ...d});
            }
          });
        })
      );
    }

    // Memes
    if (filter === 'all' || filter === 'memes') {
      promises.push(
        db.collection('memes').orderBy('createdAt','desc').limit(60).get().then(snap => {
          snap.forEach(doc => {
            const d = doc.data();
            if ((d.caption||'').toLowerCase().includes(qLow) ||
                (d.name||'').toLowerCase().includes(qLow)) {
              results.memes.push({id: doc.id, ...d});
            }
          });
        })
      );
    }

    // Hashtags: scan posts for matching hashtags
    if (filter === 'all' || filter === 'hashtags') {
      promises.push(
        db.collection('posts').orderBy('createdAt','desc').limit(200).get().then(snap => {
          const tagSet = new Set();
          snap.forEach(doc => {
            const tags = extractHashtags(doc.data().text || '');
            tags.forEach(t => {
              if (t.includes(qLow) || t.includes(`#${qLow}`)) tagSet.add(t);
            });
          });
          results.hashtags = [...tagSet].slice(0, 20);
        })
      );
    }

    await Promise.all(promises);
    renderSearchResults(results, q);
  } catch(e) {
    $('search-results').innerHTML = `<div class="search-empty-state"><p>Search failed: ${escHtml(e.message)}</p></div>`;
  }
}

function renderSearchResults(results, q) {
  const container = $('search-results');
  const filter = currentSearchFilter;
  const total = results.users.length + results.clubs.length + results.posts.length + results.memes.length + results.hashtags.length;

  if (total === 0) {
    container.innerHTML = `
      <div class="search-empty-state">
        <div class="search-empty-icon">🔍</div>
        <p>No results for <strong>"${escHtml(q)}"</strong></p>
        <small>Try different keywords or check spelling</small>
      </div>`;
    return;
  }

  let html = '';

  // ── Users ──
  if (results.users.length > 0 && (filter === 'all' || filter === 'users')) {
    html += `<div class="search-result-section">
      <div class="search-section-label">👤 People</div>
      <div class="search-people-grid">
      ${results.users.slice(0,8).map(u => {
        const uid = u.uid || u.id;
        const avatarHtml = u.profilePic
          ? `<img src="${escHtml(u.profilePic)}" class="search-avatar-img"/>`
          : `<span class="search-avatar-emoji">${u.avatar||'😎'}</span>`;
        return `<div class="search-person-card" data-uid="${uid}">
          <div class="search-person-avatar">${avatarHtml}</div>
          <div class="search-person-name">${escHtml(u.name||'Student')}</div>
          <div class="search-person-meta">@${escHtml(u.username||'user')}</div>
          <div class="search-person-college">🎓 ${escHtml((u.college||'').slice(0,20))}</div>
          <div class="search-person-action" data-uid="${uid}" data-name="${escHtml(u.name||'Student')}" data-avatar="${escHtml(u.avatar||'😎')}"></div>
        </div>`;
      }).join('')}
      </div>
    </div>`;
  }

  // ── Hashtags ──
  if (results.hashtags.length > 0 && (filter === 'all' || filter === 'hashtags')) {
    html += `<div class="search-result-section">
      <div class="search-section-label"># Trending Tags</div>
      <div class="search-hashtags-wrap">
        ${results.hashtags.map(t => `<span class="search-hashtag-chip" data-tag="${escHtml(t)}">${escHtml(t)}</span>`).join('')}
      </div>
    </div>`;
  }

  // ── Clubs ──
  if (results.clubs.length > 0 && (filter === 'all' || filter === 'clubs')) {
    html += `<div class="search-result-section">
      <div class="search-section-label">🏛️ Clubs</div>
      ${results.clubs.slice(0,6).map(c => `
        <div class="search-club-row" data-club-id="${c.id}">
          <div class="search-club-icon">${c.emoji||'🏛️'}</div>
          <div class="search-user-info">
            <strong>${escHtml(c.name)}</strong>
            <small>👥 ${c.members?.length||1} members · ${escHtml(c.category||'')}</small>
          </div>
          <button class="search-join-btn">Join</button>
        </div>`).join('')}
    </div>`;
  }

  // ── Posts ──
  if (results.posts.length > 0 && (filter === 'all' || filter === 'posts' || filter === 'hashtags')) {
    html += `<div class="search-result-section">
      <div class="search-section-label">📝 Posts</div>
      ${results.posts.slice(0,5).map(p => `
        <div class="search-post-row">
          <div class="search-post-avatar">${p.avatar||'😎'}</div>
          <div class="search-post-body">
            <div class="search-post-author"><strong>${escHtml(p.name||'Student')}</strong> <span class="search-post-time">${timeAgo(p.createdAt)}</span></div>
            ${p.text ? `<div class="search-post-text">${highlightHashtags(p.text.slice(0,120))}${p.text.length>120?'…':''}</div>` : ''}
            ${p.mediaUrl && !p.isVideo ? `<img class="search-post-thumb" src="${p.mediaUrl}" loading="lazy"/>` : ''}
          </div>
        </div>`).join('')}
    </div>`;
  }

  // ── Memes ──
  if (results.memes.length > 0 && (filter === 'all' || filter === 'memes')) {
    html += `<div class="search-result-section">
      <div class="search-section-label">😂 Memes</div>
      <div class="search-meme-grid">
        ${results.memes.slice(0,6).map(m => `
          <div class="search-meme-tile">
            <img src="${m.url}" loading="lazy" alt="meme"/>
            ${m.caption ? `<div class="search-meme-caption">${escHtml(m.caption.slice(0,30))}</div>` : ''}
          </div>`).join('')}
      </div>
    </div>`;
  }

  container.innerHTML = html;

  // Bind friend buttons inside person cards
  container.querySelectorAll('.search-person-action').forEach(el => {
    const uid    = el.dataset.uid;
    const name   = el.dataset.name;
    const avatar = el.dataset.avatar;
    el.innerHTML = buildFriendBtn(uid, name, avatar);
  });

  // User card click (not on action button)
  container.querySelectorAll('.search-person-card').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.search-person-action') || e.target.closest('.friend-btn')) return;
      toast(`Viewing ${el.querySelector('.search-person-name')?.textContent}'s profile`, 'info');
    });
  });

  container.querySelectorAll('[data-club-id]').forEach(el => {
    el.addEventListener('click', () => { switchView('clubs'); });
  });

  container.querySelectorAll('[data-tag]').forEach(el => {
    el.addEventListener('click', () => {
      const q2 = el.dataset.tag;
      $('sidebar-search-input') && ($('sidebar-search-input').value = q2);
      $('mobile-search-input')  && ($('mobile-search-input').value  = q2);
      performSearch(q2);
    });
  });
}


// ══════════════════════════════════════
// FEED
// ══════════════════════════════════════
$('new-post-btn').addEventListener('click', () => openModal('modal-post'));

let postMediaFile = null;
$('post-media-input').addEventListener('change', e => {
  postMediaFile = e.target.files[0];
  if (!postMediaFile) return;
  const url = URL.createObjectURL(postMediaFile);
  const isVideo = postMediaFile.type.startsWith('video');
  $('post-media-preview').innerHTML = isVideo
    ? `<video src="${url}" controls style="width:100%;border-radius:10px;max-height:200px"></video>`
    : `<img src="${url}" style="width:100%;border-radius:10px;max-height:200px;object-fit:cover"/>`;
});

$('submit-post-btn').addEventListener('click', async () => {
  const text = $('post-text').value.trim();
  if (!text && !postMediaFile) return toast('Write something!', 'error');
  try {
    let mediaUrl = '';
    let isVideo  = false;
    if (postMediaFile) {
      const rtype = postMediaFile.type.startsWith('video') ? 'video' : 'image';
      mediaUrl = await uploadToCloudinary(postMediaFile, rtype, '📝 Posting…');
      isVideo  = postMediaFile.type.startsWith('video');
    }
    const hashtags = extractHashtags(text);
    // Build object with NO null/undefined — Firestore rejects them
    const postData = {
      uid:      currentUser.uid,
      name:     currentUserData.name     || currentUser.displayName || 'Student',
      avatar:   currentUserData.avatar   || '😎',
      username: currentUserData.username || (currentUser.email ? currentUser.email.split('@')[0] : 'user'),
      college:  currentUserData.college  || '',
      text:     text     || '',
      hashtags: hashtags || [],
      mediaUrl: mediaUrl || '',
      isVideo:  isVideo,
      likes:    [],
      comments: 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    await db.collection('posts').add(postData);
    await db.collection('users').doc(currentUser.uid).update({
      posts: firebase.firestore.FieldValue.increment(1)
    });
    currentUserData.posts = (currentUserData.posts || 0) + 1;
    $('post-text').value = '';
    $('post-media-preview').innerHTML = '';
    postMediaFile = null;
    closeModal('modal-post');
    toast('Posted! 🔥', 'success');
    updateProfileStats();
  } catch(e) { toast(e.message, 'error'); }
});

function loadFeed() {
  const list = $('feed-list');
  list.innerHTML = '<div class="loading-spinner">Loading posts…</div>';
  const renderedIds = new Set();

  db.collection('posts').orderBy('createdAt','desc').limit(30)
    .onSnapshot(snap => {
      if (snap.empty) {
        list.innerHTML = '<div class="loading-spinner">No posts yet. Be the first! 🎉</div>';
        return;
      }
      const spinner = list.querySelector('.loading-spinner');
      if (spinner) spinner.remove();

      snap.docChanges().forEach(change => {
        const docId = change.doc.id;
        if (change.type === 'removed') {
          const el = list.querySelector('[data-post-id="' + docId + '"]');
          if (el) el.remove();
          renderedIds.delete(docId);
          return;
        }
        if (change.type === 'modified') {
          const existing = list.querySelector('[data-post-id="' + docId + '"]');
          if (existing) {
            const nd = change.doc.data();
            // Patch ONLY the count text node — never touch innerHTML so video is untouched
            const likeBtn = existing.querySelector('.like-btn');
            if (likeBtn) {
              const isLiked = nd.likes && nd.likes.includes(currentUser.uid);
              if (isLiked) likeBtn.classList.add('liked'); else likeBtn.classList.remove('liked');
              const lSpan = likeBtn.querySelector('.like-count');
              if (lSpan) lSpan.textContent = nd.likes ? nd.likes.length : 0;
            }
            const commBtn = existing.querySelector('.comment-toggle-btn');
            if (commBtn) {
              const cSpan = commBtn.querySelector('.comm-count');
              if (cSpan) cSpan.textContent = nd.comments || 0;
            }
            return; // No lucide.createIcons() — no full-doc reflow
          }
        }
        if (change.type === 'added' && !renderedIds.has(docId)) {
          const card = buildPostCard(docId, change.doc.data());
          card.dataset.postId = docId;
          if (change.newIndex === 0) list.prepend(card);
          else list.appendChild(card);
          renderedIds.add(docId);
          lucide.createIcons();
        }
      });
    });
}

function buildPostCard(id, d, showDelete = null) {
  const card = document.createElement('div');
  card.className = 'post-card';
  const liked = d.likes?.includes(currentUser.uid);
  const isOwner = (showDelete !== null) ? showDelete : (d.uid === currentUser.uid);

  card.innerHTML = `
    <div class="post-header">
      <div class="post-avatar">${d.avatar || '😎'}</div>
      <div class="post-meta">
        <strong>${d.name || 'Student'}</strong>
        <small>@${d.username || 'user'} · ${timeAgo(d.createdAt)}</small>
      </div>
      ${isOwner ? `<button class="post-delete-btn" data-id="${id}" title="Delete post"><i data-lucide="trash-2"></i></button>` : ''}
    </div>
    ${d.text ? `<div class="post-body">${highlightHashtags(d.text)}</div>` : ''}
    ${d.mediaUrl ? (d.isVideo
      ? (() => {
          const thumbUrl = d.mediaUrl.includes('/upload/')
            ? d.mediaUrl.replace('/upload/', '/upload/so_0,w_640,h_360,c_fill,f_jpg/').replace(/\.\w+$/, '.jpg')
            : '';
          return `<div class="post-video-wrap" data-src="${d.mediaUrl}">
           <img class="post-video-thumb" src="${thumbUrl}" loading="lazy" alt="video thumbnail"
             onerror="this.style.display='none'"
             style="width:100%;max-height:340px;object-fit:cover;border-radius:12px;display:block"/>
           <div class="video-play-overlay"><button class="video-play-btn" aria-label="Play video">&#9654;</button></div>
         </div>`;
        })()
      : `<img class="post-media" src="${d.mediaUrl}" loading="lazy" alt="post media"/>`) : ''}
    <div class="post-actions">
      <button class="action-btn like-btn ${liked?'liked':''}" data-id="${id}">
        <i data-lucide="heart"></i><span class="like-count">${d.likes?.length || 0}</span>
      </button>
      <button class="action-btn comment-toggle-btn" data-id="${id}">
        <i data-lucide="message-circle"></i><span class="comm-count">${d.comments || 0}</span>
      </button>
      <button class="action-btn share-btn">
        <i data-lucide="share-2"></i>
      </button>
    </div>
    <div class="post-comments" id="comments-${id}">
      <div class="comment-input-row">
        <input type="text" placeholder="Comment…" class="comment-input" id="ci-${id}"/>
        <button class="btn-sm comment-submit" data-id="${id}">Send</button>
      </div>
      <div class="comment-list" id="cl-${id}"></div>
    </div>
  `;

  // Delete post
  if (isOwner) {
    card.querySelector('.post-delete-btn')?.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Delete this post?')) return;
      try {
        await db.collection('posts').doc(id).delete();
        await db.collection('users').doc(currentUser.uid).update({
          posts: firebase.firestore.FieldValue.increment(-1)
        });
        currentUserData.posts = Math.max(0, (currentUserData.posts || 1) - 1);
        card.remove();
        toast('Post deleted', 'success');
        updateProfileStats();
      } catch(e) { toast(e.message, 'error'); }
    });
  }

  // Video play — custom player, only one video at a time
  const videoWrap = card.querySelector('.post-video-wrap');
  if (videoWrap) {
    videoWrap.addEventListener('click', function(e) {
      // Only the bare wrap click (not buttons) initializes the player
      if (e.target.closest('.custom-video-controls') || e.target.closest('.cv-center-tap')) return;
      var src = this.dataset.src || '';
      if (!src) return;
      if (this.classList.contains('playing')) return;

      // Pause any other playing video
      document.querySelectorAll('.post-video-wrap.playing').forEach(function(w) {
        var v = w.querySelector('video');
        if (v) v.pause();
        w.classList.remove('playing');
      });
      this.classList.add('playing');

      // Build player HTML — controls bar is OUTSIDE the tap overlay
      this.innerHTML =
        '<video class="post-video-active" src="' + src + '" playsinline' +
        ' style="width:100%;max-height:340px;border-radius:12px;display:block;background:#000"></video>' +
        '<div class="cv-center-tap" style="position:absolute;left:0;right:0;top:0;bottom:44px;z-index:5;cursor:pointer;display:flex;align-items:center;justify-content:center;">' +
          '<div class="cv-center-icon" style="opacity:0;transition:opacity 0.2s;font-size:48px;pointer-events:none;text-shadow:0 2px 10px rgba(0,0,0,.7)">▶</div>' +
        '</div>' +
        '<div class="custom-video-controls" style="position:relative;z-index:10;">' +
          '<button class="cv-btn cv-play-pause">▶</button>' +
          '<button class="cv-btn cv-stop">■</button>' +
          '<div class="cv-progress-wrap">' +
            '<div class="cv-progress-bar">' +
              '<div class="cv-progress-fill"></div>' +
              '<div class="cv-progress-knob"></div>' +
            '</div>' +
          '</div>' +
          '<button class="cv-btn cv-mute">🔊</button>' +
          '<button class="cv-btn cv-fullscreen">⛶</button>' +
        '</div>';

      var vid     = this.querySelector('video');
      var wrap    = this;
      var playBtn = this.querySelector('.cv-play-pause');
      var stopBtn = this.querySelector('.cv-stop');
      var muteBtn = this.querySelector('.cv-mute');
      var fsBtn   = this.querySelector('.cv-fullscreen');
      var fill    = this.querySelector('.cv-progress-fill');
      var knob    = this.querySelector('.cv-progress-knob');
      var bar     = this.querySelector('.cv-progress-bar');
      var centerTap  = this.querySelector('.cv-center-tap');
      var centerIcon = this.querySelector('.cv-center-icon');
      var controls   = this.querySelector('.custom-video-controls');

      wrap.style.position = 'relative';

      vid.play().catch(function(){});

      vid.addEventListener('play',    function() { playBtn.innerHTML = '⏸'; });
      vid.addEventListener('pause',   function() { playBtn.innerHTML = '▶'; });
      vid.addEventListener('ended',   function() { playBtn.innerHTML = '▶'; wrap.classList.remove('playing'); });
      vid.addEventListener('timeupdate', function() {
        if (!vid.duration) return;
        var pct = (vid.currentTime / vid.duration) * 100;
        fill.style.width = pct + '%';
        knob.style.left  = pct + '%';
      });

      // Center tap area — only toggles play/pause, never reaches controls
      var fadeTimer = null;
      centerTap.addEventListener('click', function(e) {
        e.stopPropagation();
        if (vid.paused) { vid.play().catch(function(){}); centerIcon.textContent = '▶'; }
        else            { vid.pause();                    centerIcon.textContent = '⏸'; }
        centerIcon.style.opacity = '1';
        clearTimeout(fadeTimer);
        fadeTimer = setTimeout(function() { centerIcon.style.opacity = '0'; }, 700);
      });

      // All control buttons: stopPropagation so clicks never bubble to videoWrap or centerTap
      controls.addEventListener('click', function(e) { e.stopPropagation(); });

      playBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        vid.paused ? vid.play().catch(function(){}) : vid.pause();
      });

      stopBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        vid.pause();
        vid.currentTime = 0;
        wrap.classList.remove('playing');
      });

      muteBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        vid.muted = !vid.muted;
        muteBtn.innerHTML = vid.muted ? '🔇' : '🔊';
      });

      fsBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        var wasPlaying = !vid.paused;
        var savedTime  = vid.currentTime;

        function onFSChange() {
          // Resume video after any fullscreen transition
          vid.currentTime = savedTime;
          if (wasPlaying) vid.play().catch(function(){});
          document.removeEventListener('fullscreenchange', onFSChange);
          document.removeEventListener('webkitfullscreenchange', onFSChange);
        }
        document.addEventListener('fullscreenchange', onFSChange);
        document.addEventListener('webkitfullscreenchange', onFSChange);

        if (vid.requestFullscreen)       vid.requestFullscreen().catch(function(){});
        else if (vid.webkitRequestFullscreen) vid.webkitRequestFullscreen();
      });

      // Progress scrub
      function scrub(clientX) {
        var rect = bar.getBoundingClientRect();
        var pct  = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        if (vid.duration) vid.currentTime = pct * vid.duration;
      }
      var dragging = false;
      bar.addEventListener('mousedown',  function(ev) { ev.stopPropagation(); dragging = true; scrub(ev.clientX); });
      document.addEventListener('mousemove', function(ev) { if (dragging) scrub(ev.clientX); });
      document.addEventListener('mouseup',   function() { dragging = false; });
      bar.addEventListener('touchstart', function(ev) { ev.stopPropagation(); scrub(ev.touches[0].clientX); }, {passive:true});
      bar.addEventListener('touchmove',  function(ev) { ev.stopPropagation(); scrub(ev.touches[0].clientX); }, {passive:true});
    });
  }

  // Like — optimistic UI, no page reload
  card.querySelector('.like-btn').addEventListener('click', async () => {
    const ref = db.collection('posts').doc(id);
    const btn = card.querySelector('.like-btn');
    const liked2 = btn.classList.contains('liked');
    // Optimistic update — only touch class + text node, never innerHTML (keeps video alive)
    const lSpan = btn.querySelector('.like-count');
    const curCount = lSpan ? (parseInt(lSpan.textContent) || 0) : 0;
    if (liked2) {
      btn.classList.remove('liked');
      if (lSpan) lSpan.textContent = Math.max(0, curCount - 1);
      d.likes = (d.likes || []).filter(u => u !== currentUser.uid);
    } else {
      btn.classList.add('liked');
      if (lSpan) lSpan.textContent = curCount + 1;
      d.likes = [...(d.likes || []), currentUser.uid];
    }
    try {
      await ref.update({
        likes: liked2
          ? firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
          : firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
      });
      // Send notification to post owner (not self)
      if (!liked2 && d.uid && d.uid !== currentUser.uid) {
        sendNotification(d.uid, 'like', 'liked your post ❤️', null, id);
      }
    } catch(e) { toast('Like failed', 'error'); }
  });

  // Comments toggle
  card.querySelector('.comment-toggle-btn').addEventListener('click', () => {
    const c = $(`comments-${id}`);
    c.classList.toggle('open');
    if (c.classList.contains('open')) loadComments(id);
  });

  // Submit comment — no page reload
  card.querySelector('.comment-submit').addEventListener('click', async () => {
    const inp = $(`ci-${id}`);
    const txt = inp.value.trim();
    if (!txt) return;
    inp.value = '';
    try {
      await db.collection('posts').doc(id).collection('comments').add({
        uid: currentUser.uid,
        name: currentUserData.name,
        avatar: currentUserData.avatar,
        text: txt,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      await db.collection('posts').doc(id).update({ comments: firebase.firestore.FieldValue.increment(1) });
      // onSnapshot modified handler updates the count — no manual increment here
      loadComments(id);
      // Send notification to post owner
      if (d.uid && d.uid !== currentUser.uid) {
        sendNotification(d.uid, 'comment', `commented: "${txt.slice(0,40)}" 💬`, null, id);
      }
    } catch(e) { toast(e.message, 'error'); }
  });

  // Share
  card.querySelector('.share-btn').addEventListener('click', () => {
    if (navigator.share) navigator.share({ title: 'CampusVibes Post', text: d.text || '' });
    else { navigator.clipboard.writeText(window.location.href); toast('Link copied!'); }
  });

  return card;
}

function loadComments(postId) {
  db.collection('posts').doc(postId).collection('comments')
    .orderBy('createdAt','asc').limit(20).get().then(snap => {
      const cl = $(`cl-${postId}`);
      if (!cl) return;
      cl.innerHTML = '';
      snap.forEach(doc => {
        const c = doc.data();
        const isCommentOwner = c.uid === currentUser.uid;
        const commentEl = document.createElement('div');
        commentEl.className = 'comment-item';
        commentEl.innerHTML = `
          <div class="c-avatar">${c.avatar || '😎'}</div>
          <div class="comment-body">
            <strong>${escHtml(c.name || 'Student')}</strong>
            ${escHtml(c.text)}
          </div>
          ${isCommentOwner ? `<button class="comment-delete-btn" title="Delete comment" style="margin-left:auto;flex-shrink:0;background:none;border:none;color:var(--muted);cursor:pointer;font-size:14px;padding:2px 6px;border-radius:6px;opacity:0.6" data-comment-id="${doc.id}" data-post-id="${postId}">🗑</button>` : ''}
        `;
        if (isCommentOwner) {
          commentEl.querySelector('.comment-delete-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm('Delete this comment?')) return;
            try {
              await db.collection('posts').doc(postId).collection('comments').doc(doc.id).delete();
              await db.collection('posts').doc(postId).update({ comments: firebase.firestore.FieldValue.increment(-1) });
              commentEl.remove();
              // Update comment count display
              const countBtn = document.querySelector(`.comment-toggle-btn[data-id="${postId}"]`);
              if (countBtn) {
                const curr = parseInt(countBtn.textContent.trim()) || 1;
                countBtn.innerHTML = `<i data-lucide="message-circle"></i> ${Math.max(0, curr - 1)}`;
                lucide.createIcons();
              }
              toast('Comment deleted', 'success');
            } catch(err) { toast(err.message, 'error'); }
          });
        }
        cl.appendChild(commentEl);
      });
    });
}

// ══════════════════════════════════════
// STORIES  (supports images + videos, auto-delete 24h)
// ══════════════════════════════════════
function loadStories() {
  const bar = $('story-bar');
  db.collection('stories')
    .where('expiresAt', '>', firebase.firestore.Timestamp.now())
    .orderBy('expiresAt').limit(20).onSnapshot(snap => {
      bar.querySelectorAll('.story:not(.add-story)').forEach(n => n.remove());
      snap.forEach(doc => {
        const d   = doc.data();
        const sid = doc.id;
        const isOwn = d.uid === currentUser.uid;
        const s = document.createElement('div');
        s.className = 'story';
        const isVid = d.isVideo;
        // Single ring colour: gradient for own, accent for others
        let thumb = '';
        if (d.mediaUrl && d.mediaUrl.includes('/upload/')) {
          if (isVid) {
            const t = d.mediaUrl.replace('/upload/', '/upload/so_0,w_80,h_80,c_fill,f_jpg/').replace(/\.\w+$/, '.jpg');
            thumb = `<img src="${t}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;position:absolute;inset:0" onerror="this.remove()"/>`;
          } else {
            const t = d.mediaUrl.replace('/upload/', '/upload/w_80,h_80,c_fill/');
            thumb = `<img src="${t}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;position:absolute;inset:0" onerror="this.remove()"/>`;
          }
        }
        const ringClass = isOwn ? 'story-ring-own' : (isVid ? 'story-ring-vid' : 'story-ring-img');
        s.innerHTML = `
          <div class="story-ring-wrap ${ringClass}">
            <div class="story-avatar-inner" style="position:relative;overflow:hidden;">
              ${thumb}
              ${isVid ? '<span class="story-vid-badge">▶</span>' : ''}
              <span style="font-size:20px;position:relative;z-index:1">${d.avatar||'😎'}</span>
            </div>
            ${isOwn ? `<button class="story-delete-btn" data-id="${sid}" title="Delete story">×</button>` : ''}
          </div>
          <span>${escHtml(d.name?.split(' ')[0] || 'User')}</span>`;
        // Delete button
        if (isOwn) {
          s.querySelector('.story-delete-btn').addEventListener('click', async e => {
            e.stopPropagation();
            if (!confirm('Delete this story?')) return;
            try {
              await db.collection('stories').doc(sid).delete();
              toast('Story deleted', 'success');
            } catch(err) { toast(err.message, 'error'); }
          });
        }
        s.addEventListener('click', ev => {
          if (ev.target.classList.contains('story-delete-btn')) return;
          viewStory(d, sid);
        });
        bar.appendChild(s);
      });

      // Auto-delete expired stories (runs client-side best effort)
      db.collection('stories')
        .where('expiresAt', '<=', firebase.firestore.Timestamp.now())
        .limit(20).get().then(expSnap => {
          expSnap.forEach(doc => doc.ref.delete().catch(() => {}));
        });
    });
}

$('add-story-btn').addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*,video/*';   // ← Now supports videos!
  input.onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    const isVideo = file.type.startsWith('video');
    // Don't block the UI with showLoading() — use progress bar only
    try {
      const url = await uploadToCloudinary(file, isVideo ? 'video' : 'image');
      const exp = new Date(Date.now() + 24*3600*1000);
      await db.collection('stories').add({
        uid:      currentUser.uid,
        name:     currentUserData.name   || currentUser.displayName || 'Student',
        avatar:   currentUserData.avatar || '😎',
        mediaUrl: url,
        isVideo:  !!isVideo,
        expiresAt: firebase.firestore.Timestamp.fromDate(exp),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      toast(isVideo ? '🎬 Video story posted! (24h)' : '📸 Story posted! (24h)', 'success');
    } catch(e) { toast(e.message, 'error'); }
  };
  input.click();
});

function viewStory(d) {
  const isVid = d.isVideo;
  if (isVid) {
    $('story-view-content').innerHTML =
      `<video id="story-vid" src="${d.mediaUrl}" autoplay muted playsinline
        style="width:100%;max-height:75vh;object-fit:contain;display:block;background:#000"></video>`;
    $('story-viewer-info').innerHTML = `
      <span style="font-size:26px">${d.avatar||'😎'}</span>
      <span>${escHtml(d.name||'User')}</span>
      <button id="story-sound-btn" onclick="(function(){var v=document.getElementById('story-vid');v.muted=!v.muted;document.getElementById('story-sound-btn').textContent=v.muted?'🔇':'🔊';})()"
        style="margin-left:auto;background:rgba(255,255,255,.18);border:none;color:#fff;border-radius:999px;padding:5px 12px;cursor:pointer;font-size:16px">🔇</button>`;
  } else {
    $('story-view-content').innerHTML =
      `<img src="${d.mediaUrl}" style="width:100%;max-height:75vh;object-fit:contain;display:block"/>`;
    $('story-viewer-info').innerHTML = `
      <span style="font-size:26px">${d.avatar||'😎'}</span>
      <span>${escHtml(d.name||'User')}</span>
      <span style="margin-left:auto;font-size:12px;opacity:.7">24h</span>`;
  }
  openModal('modal-story-view');
}

// ══════════════════════════════════════
// CONFESSIONS
// ══════════════════════════════════════
$('new-confession-btn').addEventListener('click', () => openModal('modal-confession'));
$('submit-confession-btn').addEventListener('click', async () => {
  const text = $('confession-text').value.trim();
  const category = $('confession-category').value;
  if (!text) return toast('Write something!', 'error');
  showLoading();
  try {
    await db.collection('confessions').add({
      text, category,
      college: currentUserData.college,
      likes: [], comments: 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    $('confession-text').value = '';
    closeModal('modal-confession');
    toast('Confession posted anonymously 👻', 'success');
    loadConfessions();
  } catch(e) { toast(e.message, 'error'); }
  hideLoading();
});

function loadConfessions() {
  const list = $('confession-list');
  list.innerHTML = '<div class="loading-spinner">Loading…</div>';
  db.collection('confessions').orderBy('createdAt','desc').limit(30)
    .onSnapshot(snap => {
      if (snap.empty) { list.innerHTML = '<div class="loading-spinner">No confessions yet. Be brave! 👻</div>'; return; }
      list.innerHTML = '';
      snap.forEach(doc => list.appendChild(buildConfessionCard(doc.id, doc.data())));
      lucide.createIcons();
    });
}

function buildConfessionCard(id, d) {
  const card = document.createElement('div');
  card.className = `confession-card ${d.category}`;
  const liked = d.likes?.includes(currentUser.uid);
  const catEmoji = {general:'💬',crush:'💘',academics:'📚',hostel:'🏠',drama:'🎭',funny:'😂'}[d.category]||'💬';
  card.innerHTML = `
    <span class="confession-tag">${catEmoji} ${d.category}</span>
    <p class="confession-text">${escHtml(d.text)}</p>
    <div class="confession-footer">
      <button class="action-btn conf-like ${liked?'liked':''}" data-id="${id}">
        <i data-lucide="heart"></i> ${d.likes?.length||0}
      </button>
      <span>${timeAgo(d.createdAt)}</span>
      <span>Anonymous</span>
    </div>
  `;
  card.querySelector('.conf-like').addEventListener('click', async () => {
    const liked2 = d.likes?.includes(currentUser.uid);
    await db.collection('confessions').doc(id).update({
      likes: liked2
        ? firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
        : firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
    });
  });
  return card;
}

// ══════════════════════════════════════
// MEMES
// ══════════════════════════════════════
$('new-meme-btn').addEventListener('click', () => openModal('modal-meme'));
$('meme-upload-zone').addEventListener('click', () => $('meme-file-input').click());
let memeFile = null;
$('meme-file-input').addEventListener('change', e => {
  memeFile = e.target.files[0];
  if (memeFile) {
    const url = URL.createObjectURL(memeFile);
    $('meme-preview-wrap').innerHTML = `<img src="${url}" style="width:100%;border-radius:10px;max-height:250px;object-fit:cover;margin-top:10px"/>`;
  }
});

$('submit-meme-btn').addEventListener('click', async () => {
  if (!memeFile) return toast('Select an image!', 'error');
  showLoading();
  try {
    const url = await uploadToCloudinary(memeFile, 'image');
    const caption = $('meme-caption').value.trim();
    await db.collection('memes').add({
      uid: currentUser.uid,
      name: currentUserData.name || currentUser.displayName || 'Student',
      avatar: currentUserData.avatar || '😎',
      college: currentUserData.college || '',
      url, caption: caption || '', likes: [],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    memeFile = null;
    $('meme-preview-wrap').innerHTML = '';
    $('meme-caption').value = '';
    closeModal('modal-meme');
    toast('Meme uploaded! 😂', 'success');
    loadMemes();
  } catch(e) { toast(e.message, 'error'); }
  hideLoading();
});

function loadMemes() {
  const grid = $('meme-grid');
  grid.innerHTML = '<div class="loading-spinner">Loading memes…</div>';
  db.collection('memes').orderBy('createdAt','desc').limit(40)
    .onSnapshot(snap => {
      if (snap.empty) { grid.innerHTML = '<div class="loading-spinner">No memes yet. Upload one! 😂</div>'; return; }
      grid.innerHTML = '';
      snap.forEach(doc => {
        const d = doc.data();
        const liked = d.likes?.includes(currentUser.uid);
        const isOwner = d.uid === currentUser.uid;
        const card = document.createElement('div');
        card.className = 'meme-card';
        card.innerHTML = `
          <img src="${d.url}" loading="lazy" alt="meme"/>
          <div class="meme-card-footer">
            <span class="meme-caption">${escHtml(d.caption || d.name)}</span>
            <div style="display:flex;align-items:center;gap:6px">
              <button class="action-btn meme-like ${liked?'liked':''}" data-id="${doc.id}">
                <i data-lucide="heart"></i> ${d.likes?.length||0}
              </button>
              ${isOwner ? `<button class="post-delete-btn meme-delete-btn" data-id="${doc.id}" style="margin-left:0" title="Delete meme"><i data-lucide="trash-2"></i></button>` : ''}
            </div>
          </div>`;
        card.querySelector('.meme-like').addEventListener('click', async e => {
          e.stopPropagation();
          const l = d.likes?.includes(currentUser.uid);
          await db.collection('memes').doc(doc.id).update({
            likes: l
              ? firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
              : firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
          });
          loadMemes();
        });
        if (isOwner) {
          card.querySelector('.meme-delete-btn')?.addEventListener('click', async e => {
            e.stopPropagation();
            if (!confirm('Delete this meme?')) return;
            await db.collection('memes').doc(doc.id).delete();
            toast('Meme deleted', 'success');
          });
        }
        grid.appendChild(card);
      });
      lucide.createIcons();
    });
}

// ══════════════════════════════════════
// POLLS
// ══════════════════════════════════════
$('new-poll-btn').addEventListener('click', () => openModal('modal-poll'));
$('add-poll-option-btn').addEventListener('click', () => {
  const wrap = $('poll-options-wrap');
  const count = wrap.querySelectorAll('input').length + 1;
  if (count > 5) return toast('Max 5 options');
  const inp = document.createElement('input');
  inp.type = 'text'; inp.className = 'poll-option-input'; inp.placeholder = `Option ${count}`;
  wrap.appendChild(inp);
});

$('submit-poll-btn').addEventListener('click', async () => {
  const question = $('poll-question').value.trim();
  const options = [...document.querySelectorAll('.poll-option-input')]
    .map(i => i.value.trim()).filter(Boolean);
  if (!question) return toast('Enter a question', 'error');
  if (options.length < 2) return toast('Add at least 2 options', 'error');
  showLoading();
  try {
    const optData = {};
    options.forEach(o => { optData[o] = 0; });
    await db.collection('polls').add({
      uid: currentUser.uid,
      name: currentUserData.name || currentUser.displayName || 'Student',
      avatar: currentUserData.avatar || '😎',
      question: question || '',
      options: optData,
      votes: {}, totalVotes: 0,
      college: currentUserData.college || '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    $('poll-question').value = '';
    $('poll-options-wrap').innerHTML = `<input type="text" class="poll-option-input" placeholder="Option 1"/><input type="text" class="poll-option-input" placeholder="Option 2"/>`;
    closeModal('modal-poll');
    toast('Poll launched! 📊', 'success');
    loadPolls();
  } catch(e) { toast(e.message, 'error'); }
  hideLoading();
});

function loadPolls() {
  const list = $('poll-list');
  list.innerHTML = '<div class="loading-spinner">Loading polls…</div>';
  db.collection('polls').orderBy('createdAt','desc').limit(20)
    .onSnapshot(snap => {
      if (snap.empty) { list.innerHTML = '<div class="loading-spinner">No polls yet. Create one! 📊</div>'; return; }
      list.innerHTML = '';
      snap.forEach(doc => list.appendChild(buildPollCard(doc.id, doc.data())));
      lucide.createIcons();
    });
}

function buildPollCard(id, d) {
  const card = document.createElement('div');
  card.className = 'poll-card';
  const myVote = d.votes?.[currentUser.uid];
  const total = d.totalVotes || 1;
  const isOwner = d.uid === currentUser.uid;
  let optHtml = '';
  Object.entries(d.options||{}).forEach(([opt, count]) => {
    const pct = Math.round((count / total) * 100);
    const voted = myVote === opt;
    optHtml += `
      <div class="poll-option ${myVote ? 'voted' : ''}" data-opt="${escHtml(opt)}">
        <div class="poll-option-bar" style="width:${myVote ? pct : 0}%"></div>
        <div class="poll-option-label">
          <span>${voted ? '✓ ' : ''}${escHtml(opt)}</span>
          ${myVote ? `<span class="poll-option-pct">${pct}%</span>` : ''}
        </div>
      </div>`;
  });
  card.innerHTML = `
    <div class="post-header" style="padding-bottom:0">
      <div class="post-avatar">${d.avatar||'😎'}</div>
      <div class="post-meta"><strong>${escHtml(d.name)}</strong><small>${timeAgo(d.createdAt)}</small></div>
      ${isOwner ? `<button class="post-delete-btn" data-id="${id}" title="Delete poll"><i data-lucide="trash-2"></i></button>` : ''}
    </div>
    <p class="poll-question">${escHtml(d.question)}</p>
    <div class="poll-options">${optHtml}</div>
    <div class="poll-footer"><span>${d.totalVotes||0} votes</span></div>
  `;
  if (!myVote) {
    card.querySelectorAll('.poll-option').forEach(el => {
      el.addEventListener('click', async () => {
        const opt = el.dataset.opt;
        await db.collection('polls').doc(id).update({
          [`options.${opt}`]: firebase.firestore.FieldValue.increment(1),
          [`votes.${currentUser.uid}`]: opt,
          totalVotes: firebase.firestore.FieldValue.increment(1)
        });
      });
    });
  }
  if (isOwner) {
    card.querySelector('.post-delete-btn')?.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Delete this poll?')) return;
      await db.collection('polls').doc(id).delete();
      card.remove();
      toast('Poll deleted', 'success');
    });
  }
  return card;
}


// ══════════════════════════════════════
// CLUBS  (with Members view)
// ══════════════════════════════════════
$('new-club-btn').addEventListener('click', () => openModal('modal-club'));
$('submit-club-btn').addEventListener('click', async () => {
  const name = $('club-name').value.trim();
  const desc = $('club-desc').value.trim();
  const cat  = $('club-category').value;
  if (!name) return toast('Club name required', 'error');
  showLoading();
  try {
    const clubRef = await db.collection('clubs').add({
      name: name || '',
      desc: desc || '',
      category: cat || 'social',
      emoji: CLUB_EMOJI[cat] || '🏛️',
      createdBy: currentUser.uid,
      college: currentUserData.college || '',
      members: [currentUser.uid],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    // Update user clubs array
    await db.collection('users').doc(currentUser.uid).update({
      clubs: firebase.firestore.FieldValue.arrayUnion(clubRef.id)
    });
    currentUserData.clubs = [...(currentUserData.clubs||[]), clubRef.id];
    $('club-name').value = ''; $('club-desc').value = '';
    closeModal('modal-club');
    toast('Club created! 🏛️', 'success');
    loadClubs();
    updateProfileStats();
  } catch(e) { toast(e.message, 'error'); }
  hideLoading();
});

function loadClubs() {
  const grid = $('club-grid');
  grid.innerHTML = '<div class="loading-spinner">Loading clubs…</div>';
  db.collection('clubs').orderBy('createdAt','desc').limit(30)
    .onSnapshot(snap => {
      if (snap.empty) { grid.innerHTML = '<div class="loading-spinner">No clubs yet. Create one! 🏛️</div>'; return; }
      grid.innerHTML = '';
      snap.forEach(doc => {
        const d = doc.data();
        const joined = d.members?.includes(currentUser.uid);
        const card = document.createElement('div');
        card.className = 'club-card';
        card.innerHTML = `
          <div class="club-emoji">${d.emoji || '🏛️'}</div>
          <div class="club-name">${escHtml(d.name)}</div>
          <div class="club-desc">${escHtml(d.desc || '')}</div>
          <div class="club-meta">
            <span>
              👥 ${d.members?.length || 1}
              <button class="club-card-members-btn" data-id="${doc.id}" data-name="${escHtml(d.name)}" data-emoji="${d.emoji||'🏛️'}">
                Members
              </button>
              ${d.createdBy === currentUser.uid ? `<button class="club-card-ban-btn" data-id="${doc.id}" style="margin-left:4px;background:#ff000018;border:1px solid #ff000030;color:#ff4444;font-size:11px;padding:3px 8px;border-radius:6px;cursor:pointer">🚫 Banned</button>` : ''}
            </span>
            <button class="club-join-btn ${joined?'joined':''}" data-id="${doc.id}" data-joined="${joined}">
              ${joined ? 'Joined ✓' : 'Join'}
            </button>
          </div>`;

        // View members
        card.querySelector('.club-card-members-btn').addEventListener('click', e => {
          e.stopPropagation();
          showClubMembers(doc.id, d.name, d.emoji || '🏛️', d.members || [], d.createdBy);
        });

        // View banned (owner only)
        card.querySelector('.club-card-ban-btn')?.addEventListener('click', async e => {
          e.stopPropagation();
          // Show only banned section
          const freshSnap = await db.collection('clubs').doc(doc.id).get();
          const fresh = freshSnap.data() || {};
          const bannedUids = fresh.banned || [];
          $('club-members-title').textContent = `🚫 Banned Users — ${d.name}`;
          const listEl = $('club-members-list');
          listEl.innerHTML = `<div style="padding:8px 0 12px;font-size:12px;color:#ff4444;font-weight:700">
            🔒 Admin Only · ${bannedUids.length} banned user${bannedUids.length!==1?'s':''}
          </div>`;
          openModal('modal-club-members');
          if (bannedUids.length === 0) {
            listEl.innerHTML = '<div style="text-align:center;padding:30px;color:var(--muted)">No banned users 🎉</div>';
            return;
          }
          const bu = await fetchUsersByUids(bannedUids);
          listEl.innerHTML = `<div style="padding:8px 0 12px;font-size:12px;color:#ff4444;font-weight:700">🔒 Admin Only · ${bannedUids.length} banned user${bannedUids.length!==1?'s':''}</div>`;
          if (!bu.length) { listEl.innerHTML += '<div style="text-align:center;padding:20px;color:var(--muted)">User data not found</div>'; return; }
          bu.forEach(u => addBannedRow(listEl, u, doc.id));
        });

        // Join/Leave
        card.querySelector('.club-join-btn').addEventListener('click', async e => {
          e.stopPropagation();
          const isJoined = e.target.dataset.joined === 'true';
          // Check if banned before joining
          if (!isJoined) {
            const clubSnap = await db.collection('clubs').doc(doc.id).get();
            const banned = clubSnap.data()?.banned || [];
            if (banned.includes(currentUser.uid)) {
              toast('You are banned from this club 🚫', 'error');
              return;
            }
          }
          await db.collection('clubs').doc(doc.id).update({
            members: isJoined
              ? firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
              : firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
          });
          // Update user clubs array
          await db.collection('users').doc(currentUser.uid).update({
            clubs: isJoined
              ? firebase.firestore.FieldValue.arrayRemove(doc.id)
              : firebase.firestore.FieldValue.arrayUnion(doc.id)
          });
          if (isJoined) {
            currentUserData.clubs = (currentUserData.clubs||[]).filter(c => c !== doc.id);
          } else {
            currentUserData.clubs = [...(currentUserData.clubs||[]), doc.id];
          }
          toast(isJoined ? 'Left club' : 'Joined club! 🎉', 'success');
          // Notify club owner when someone joins
          if (!isJoined && d.createdBy && d.createdBy !== currentUser.uid) {
            sendNotification(d.createdBy, 'club_join', `joined your club ${d.emoji||'🏛️'} ${d.name}`, null);
          }
          updateProfileStats();
        });

        // Club dashboard on click (only if member, else show info)
        card.addEventListener('click', () => {
          openClubDashboard(doc.id, { ...d, id: doc.id });
        });
        grid.appendChild(card);
      });
      lucide.createIcons();
    });
}

async function showClubMembers(clubId, clubName, emoji, memberUids, createdBy) {
  $('club-members-title').textContent = `${emoji} ${clubName} — Members`;
  $('club-members-list').innerHTML = '<div class="loading-spinner">Loading members…</div>';
  openModal('modal-club-members');

  const isOwner = createdBy === currentUser.uid;

  try {
    // Always refresh from Firestore for latest data
    const clubSnap2 = await db.collection('clubs').doc(clubId).get();
    const freshClub = clubSnap2.data() || {};
    memberUids = freshClub.members || memberUids || [];
    const bannedUids = freshClub.banned || [];

    const listEl = $('club-members-list');
    listEl.innerHTML = '';

    // ── Owner: show ban management header ─────
    if (isOwner) {
      const adminBanner = document.createElement('div');
      adminBanner.style.cssText = 'background:linear-gradient(135deg,#6c47ff22,#ff4ecd22);border:1px solid var(--border);border-radius:10px;padding:10px 14px;margin-bottom:12px;font-size:12px';
      adminBanner.innerHTML = `<div style="font-weight:700;margin-bottom:2px">👑 Admin View</div>
        <div style="color:var(--muted)">Members: <strong>${memberUids.length}</strong> &nbsp;|&nbsp; Banned: <strong style="color:${bannedUids.length>0?'#ff4444':'var(--muted)'}">${bannedUids.length}</strong></div>
        ${bannedUids.length>0?'<div style="font-size:11px;margin-top:4px;color:#ff8888">Scroll down to see banned users</div>':''}`;
      listEl.appendChild(adminBanner);
    }

    if (!memberUids || memberUids.length === 0) {
      listEl.innerHTML += '<p style="color:var(--muted);text-align:center;padding:20px">No members yet</p>';
      if (!isOwner || bannedUids.length === 0) return;
    }

    // Fetch up to 10 members at a time (Firestore limit)
    const chunks = [];
    for (let i = 0; i < memberUids.length; i += 10) {
      chunks.push(memberUids.slice(i, i + 10));
    }
    const allUsers = [];
    for (const chunk of chunks) {
      const snap = await db.collection('users').where('uid', 'in', chunk).get();
      snap.forEach(doc => allUsers.push(doc.data()));
    }

    if (allUsers.length === 0) {
      $('club-members-list').innerHTML = '<p style="color:var(--muted);text-align:center;padding:20px">No member profiles found</p>';
      return;
    }

    listEl.innerHTML = '';

    // If owner, show banned section header
    if (isOwner && bannedUids.length > 0) {
      const bannedHeader = document.createElement('div');
      bannedHeader.innerHTML = `<div style="padding:8px 0 4px;font-size:12px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Members (${allUsers.length})</div>`;
      listEl.appendChild(bannedHeader);
    }

    allUsers.forEach(u => {
      const isAdmin = u.uid === createdBy;
      const isSelf  = u.uid === currentUser.uid;
      const row = document.createElement('div');
      row.className = 'club-member-item';
      row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)';

      let actionBtns = '';
      if (isOwner && !isAdmin && !isSelf) {
        actionBtns = `
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button class="btn-kick" data-uid="${u.uid}" style="background:var(--surface2);border:1px solid var(--border);color:var(--text);font-size:11px;padding:4px 8px;border-radius:6px;cursor:pointer" title="Remove from club">Kick</button>
            <button class="btn-ban" data-uid="${u.uid}" style="background:#ff000020;border:1px solid #ff000040;color:#ff4444;font-size:11px;padding:4px 8px;border-radius:6px;cursor:pointer" title="Ban from club">Ban</button>
          </div>`;
      }

      const avatarHtml = u.profilePic
        ? `<img src="${escHtml(u.profilePic)}" style="width:36px;height:36px;border-radius:50%;object-fit:cover"/>`
        : `<span style="font-size:28px">${u.avatar||'😎'}</span>`;

      row.innerHTML = `
        <div style="flex-shrink:0">${avatarHtml}</div>
        <div style="flex:1;min-width:0">
          <strong style="font-size:14px">${escHtml(u.name||'Student')}</strong>
          ${isAdmin ? '<span style="font-size:10px;background:var(--accent);color:#fff;padding:2px 6px;border-radius:99px;margin-left:4px">Admin</span>' : ''}
          <div style="font-size:12px;color:var(--muted)">@${escHtml(u.username||'user')}</div>
        </div>
        ${actionBtns}
      `;

      if (isOwner && !isAdmin && !isSelf) {
        row.querySelector('.btn-kick')?.addEventListener('click', async () => {
          if (!confirm(`Remove ${u.name} from this club?`)) return;
          try {
            await db.collection('clubs').doc(clubId).update({
              members: firebase.firestore.FieldValue.arrayRemove(u.uid)
            });
            await db.collection('users').doc(u.uid).update({
              clubs: firebase.firestore.FieldValue.arrayRemove(clubId)
            });
            row.remove();
            toast(`${u.name} removed from club`, 'success');
          } catch(e) { toast(e.message, 'error'); }
        });

        row.querySelector('.btn-ban')?.addEventListener('click', async () => {
          if (!confirm(`Ban ${u.name} from this club? They will be removed and cannot rejoin.`)) return;
          try {
            await db.collection('clubs').doc(clubId).update({
              members: firebase.firestore.FieldValue.arrayRemove(u.uid),
              banned:  firebase.firestore.FieldValue.arrayUnion(u.uid)
            });
            await db.collection('users').doc(u.uid).update({
              clubs: firebase.firestore.FieldValue.arrayRemove(clubId)
            });
            row.remove();
            toast(`${u.name} banned from club 🚫`, 'success');
            // Add to banned section
            addBannedRow(listEl, u, clubId, clubName, emoji);
          } catch(e) { toast(e.message, 'error'); }
        });
      }

      listEl.appendChild(row);
    });

    // Show banned users section for owner
    if (isOwner && bannedUids.length > 0) {
      const bannedChunks = [];
      for (let i = 0; i < bannedUids.length; i += 10) bannedChunks.push(bannedUids.slice(i, i + 10));
      const bannedUsers = [];
      for (const chunk of bannedChunks) {
        const snap = await db.collection('users').where('uid', 'in', chunk).get();
        snap.forEach(doc => bannedUsers.push(doc.data()));
      }
      if (bannedUsers.length > 0) {
        const bannedSection = document.createElement('div');
        bannedSection.innerHTML = `<div style="padding:12px 0 4px;font-size:12px;color:#ff4444;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Banned (${bannedUsers.length})</div>`;
        listEl.appendChild(bannedSection);
        bannedUsers.forEach(u => addBannedRow(listEl, u, clubId, clubName, emoji));
      }
    }

  } catch(e) {
    $('club-members-list').innerHTML = `<p style="color:var(--danger);padding:20px">${escHtml(e.message)}</p>`;
  }
}

function addBannedRow(listEl, u, clubId) {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);opacity:0.7';
  const avatarHtml = u.profilePic
    ? `<img src="${escHtml(u.profilePic)}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;filter:grayscale(1)"/>`
    : `<span style="font-size:28px;filter:grayscale(1)">${u.avatar||'😎'}</span>`;
  row.innerHTML = `
    <div style="flex-shrink:0">${avatarHtml}</div>
    <div style="flex:1;min-width:0">
      <strong style="font-size:14px">${escHtml(u.name||'Student')}</strong>
      <span style="font-size:10px;background:#ff000020;color:#ff4444;padding:2px 6px;border-radius:99px;margin-left:4px">Banned</span>
      <div style="font-size:12px;color:var(--muted)">@${escHtml(u.username||'user')}</div>
    </div>
    <button class="btn-unban" data-uid="${u.uid}" style="background:#00ff0020;border:1px solid #00ff0040;color:#22cc44;font-size:11px;padding:4px 8px;border-radius:6px;cursor:pointer;flex-shrink:0">Unban</button>
  `;
  row.querySelector('.btn-unban')?.addEventListener('click', async () => {
    try {
      await db.collection('clubs').doc(clubId).update({
        banned: firebase.firestore.FieldValue.arrayRemove(u.uid)
      });
      row.remove();
      toast(`${u.name} unbanned ✅`, 'success');
    } catch(e) { toast(e.message, 'error'); }
  });
  listEl.appendChild(row);
}

// ══════════════════════════════════════
// CLUB CHAT (inline, within clubs view)
// ══════════════════════════════════════
let clubChatListener = null;

function openClubChat(clubId, clubName, emoji, memberUids, createdBy) {
  const chatId = `club_${clubId}`;

  // Build or reuse modal
  let modal = document.getElementById('modal-club-chat');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'modal-club-chat';
    modal.innerHTML = `
      <div class="modal modal-fullscreen" style="max-width:600px;display:flex;flex-direction:column;height:90vh">
        <div class="modal-header" style="flex-shrink:0">
          <button class="modal-close" id="club-chat-close">←</button>
          <h3 id="club-chat-title" style="flex:1"></h3>
          <span id="club-chat-member-count" style="font-size:12px;color:var(--muted)"></span>
        </div>
        <div class="chat-messages" id="club-chat-messages" style="flex:1;overflow-y:auto;padding:12px"></div>
        <div class="chat-input-bar" style="flex-shrink:0;padding:10px;border-top:1px solid var(--border);display:flex;gap:8px">
          <input type="text" id="club-chat-input" placeholder="Message the club…" style="flex:1"/>
          <button class="btn-send" id="club-chat-send"><i data-lucide="send"></i></button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('club-chat-close').addEventListener('click', () => {
      modal.classList.remove('open');
      if (clubChatListener) { clubChatListener.off(); clubChatListener = null; }
    });
    modal.addEventListener('click', e => {
      if (e.target === modal) {
        modal.classList.remove('open');
        if (clubChatListener) { clubChatListener.off(); clubChatListener = null; }
      }
    });
  }

  document.getElementById('club-chat-title').textContent = `${emoji} ${clubName}`;
  document.getElementById('club-chat-member-count').textContent = `👥 ${memberUids.length} members`;
  document.getElementById('club-chat-messages').innerHTML = '<div class="loading-spinner">Loading messages…</div>';
  modal.classList.add('open');
  lucide.createIcons();

  // Detach old listener
  if (clubChatListener) { clubChatListener.off(); clubChatListener = null; }

  const msgRef = rtdb.ref(`clubChats/${clubId}/messages`);
  clubChatListener = msgRef;

  msgRef.on('value', snap => {
    const msgs = snap.val() || {};
    const msgsEl = document.getElementById('club-chat-messages');
    if (!msgsEl) return;
    msgsEl.innerHTML = '';
    const sorted = Object.entries(msgs).sort((a, b) => a[1].ts - b[1].ts);
    if (sorted.length === 0) {
      msgsEl.innerHTML = '<div style="text-align:center;color:var(--muted);padding:30px 0;font-size:14px">No messages yet. Say hi! 👋</div>';
    } else {
      sorted.forEach(([key, m]) => msgsEl.appendChild(buildClubMsgBubble(m, key, clubId)));
    }
    msgsEl.scrollTop = msgsEl.scrollHeight;
    lucide.createIcons();
  });

  const sendBtn = document.getElementById('club-chat-send');
  const input   = document.getElementById('club-chat-input');

  // Remove old handlers by cloning
  const newSendBtn = sendBtn.cloneNode(true);
  sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);
  const newInput = input.cloneNode(true);
  input.parentNode.replaceChild(newInput, input);
  lucide.createIcons();

  const doSend = () => {
    const txt = document.getElementById('club-chat-input')?.value.trim();
    if (!txt) return;
    const msg = {
      uid:    currentUser.uid,
      name:   currentUserData.name   || 'Student',
      avatar: currentUserData.avatar || '😎',
      text:   txt,
      ts:     Date.now()
    };
    rtdb.ref(`clubChats/${clubId}/messages`).push(msg).catch(() => {});
    document.getElementById('club-chat-input').value = '';
  };

  document.getElementById('club-chat-send').addEventListener('click', doSend);
  document.getElementById('club-chat-input').addEventListener('keydown', e => { if (e.key === 'Enter') doSend(); });
}

function buildClubMsgBubble(m, key, clubId) {
  const mine = m.uid === currentUser?.uid;
  const wrap = document.createElement('div');
  wrap.className = `chat-msg ${mine ? 'mine' : ''}`;
  wrap.innerHTML = `
    ${!mine ? `<div class="msg-avatar">${m.avatar || '😎'}</div>` : ''}
    <div class="msg-inner">
      ${!mine ? `<div style="font-size:11px;color:var(--muted);margin-bottom:2px">${escHtml(m.name||'Student')}</div>` : ''}
      <div class="msg-bubble">${escHtml(m.text || '')}</div>
      <div class="msg-time">${new Date(m.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div>
    </div>
    ${mine ? `<button class="msg-delete-btn" style="display:none" data-key="${key}" title="Delete"><i data-lucide="trash-2"></i></button>` : ''}`;

  if (mine && key) {
    const bubble = wrap.querySelector('.msg-bubble');
    const delBtn = wrap.querySelector('.msg-delete-btn');
    let pressTimer = null;
    const showDel = () => { delBtn.style.display = 'flex'; setTimeout(() => { delBtn.style.display = 'none'; }, 3000); };
    bubble.addEventListener('mousedown',  () => { pressTimer = setTimeout(showDel, 800); });
    bubble.addEventListener('mouseup',    () => clearTimeout(pressTimer));
    bubble.addEventListener('mouseleave', () => clearTimeout(pressTimer));
    bubble.addEventListener('touchstart', () => { pressTimer = setTimeout(showDel, 800); }, { passive: true });
    bubble.addEventListener('touchend',   () => clearTimeout(pressTimer));
    delBtn.addEventListener('click', async () => {
      if (!confirm('Delete message?')) return;
      await rtdb.ref(`clubChats/${clubId}/messages/${key}`).remove().catch(() => {});
      wrap.remove();
    });
  }
  return wrap;
}

// ══════════════════════════════════════
// CLUB DASHBOARD (Full Features)
// ══════════════════════════════════════
function openClubDashboard(clubId, clubData) {
  let modal = document.getElementById('modal-club-dashboard');
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'modal-club-dashboard';
  const isOwner = clubData.createdBy === currentUser.uid;
  const isMember = (clubData.members || []).includes(currentUser.uid);

  modal.innerHTML = `
    <div class="modal modal-fullscreen" style="max-width:700px;display:flex;flex-direction:column;height:95vh;padding:0">
      <div style="background:linear-gradient(135deg,var(--accent),#ff4ecd);padding:20px 16px 16px;flex-shrink:0;border-radius:var(--radius) var(--radius) 0 0">
        <div style="display:flex;align-items:center;gap:12px">
          <span style="font-size:40px">${clubData.emoji||'🏛️'}</span>
          <div style="flex:1">
            <h2 style="color:#fff;font-size:20px;margin:0">${escHtml(clubData.name)}</h2>
            <div style="color:rgba(255,255,255,0.8);font-size:12px;margin-top:2px">👥 ${(clubData.members||[]).length} members · ${escHtml(clubData.category||'')}</div>
          </div>
          <button id="club-dash-close" style="background:rgba(255,255,255,0.2);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center">✕</button>
        </div>
        <div style="display:flex;gap:6px;margin-top:14px;overflow-x:auto;padding-bottom:4px" id="club-tab-bar">
          ${['💬 Chat','📢 Announce','📅 Events','🗳️ Polls','🖼️ Gallery','🏆 Leaderboard','👥 Members'].map((t,i)=>`
            <button class="club-tab-btn ${i===0?'active':''}" data-tab="${i}" style="white-space:nowrap;padding:6px 12px;border-radius:20px;border:none;cursor:pointer;font-size:12px;font-weight:600;transition:all 0.2s;${i===0?'background:#fff;color:var(--accent)':'background:rgba(255,255,255,0.2);color:#fff'}">${t}</button>
          `).join('')}
        </div>
      </div>
      <div id="club-dash-body" style="flex:1;overflow-y:auto;padding:0"></div>
    </div>`;

  document.body.appendChild(modal);

  // Tab switching
  modal.querySelectorAll('.club-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.club-tab-btn').forEach(b => {
        b.style.background = 'rgba(255,255,255,0.2)'; b.style.color = '#fff'; b.classList.remove('active');
      });
      btn.style.background = '#fff'; btn.style.color = 'var(--accent)'; btn.classList.add('active');
      renderClubTab(parseInt(btn.dataset.tab), clubId, clubData, isOwner, isMember);
    });
  });

  document.getElementById('club-dash-close').addEventListener('click', () => {
    modal.classList.remove('open');
    if (clubChatListener) { clubChatListener.off(); clubChatListener = null; }
  });
  modal.addEventListener('click', e => {
    if (e.target === modal) {
      modal.classList.remove('open');
      if (clubChatListener) { clubChatListener.off(); clubChatListener = null; }
    }
  });

  modal.classList.add('open');
  renderClubTab(0, clubId, clubData, isOwner, isMember);
}

function renderClubTab(tab, clubId, clubData, isOwner, isMember) {
  const body = document.getElementById('club-dash-body');
  if (!body) return;

  if (tab === 0) renderClubChat(body, clubId, clubData, isMember);
  else if (tab === 1) renderClubAnnouncements(body, clubId, clubData, isOwner);
  else if (tab === 2) renderClubEvents(body, clubId, clubData, isOwner);
  else if (tab === 3) renderClubPolls(body, clubId, clubData, isMember);
  else if (tab === 4) renderClubGallery(body, clubId, clubData, isMember);
  else if (tab === 5) renderClubLeaderboard(body, clubId, clubData);
  else if (tab === 6) showClubMembers(clubId, clubData.name, clubData.emoji, clubData.members || [], clubData.createdBy);
}

// ── Club Chat Tab ──
function renderClubChat(body, clubId, clubData, isMember) {
  if (!isMember) { body.innerHTML = '<div style="padding:40px;text-align:center;color:var(--muted)">Join the club to chat 💬</div>'; return; }
  body.innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%">
      <div class="chat-messages" id="club-dash-msgs" style="flex:1;overflow-y:auto;padding:12px;min-height:200px;max-height:calc(95vh - 240px)"></div>
      <div style="padding:10px;border-top:1px solid var(--border);display:flex;gap:8px;flex-shrink:0">
        <input type="text" id="club-dash-input" placeholder="Message the club…" style="flex:1;padding:10px 14px;border-radius:20px;border:1px solid var(--border);background:var(--surface2);color:var(--text);font-size:14px"/>
        <button id="club-dash-send" style="background:var(--accent);color:#fff;border:none;border-radius:50%;width:40px;height:40px;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center">➤</button>
      </div>
    </div>`;

  if (clubChatListener) { clubChatListener.off(); clubChatListener = null; }
  const msgRef = rtdb.ref(`clubChats/${clubId}/messages`);
  clubChatListener = msgRef;
  msgRef.on('value', snap => {
    const msgs = snap.val() || {};
    const el = document.getElementById('club-dash-msgs');
    if (!el) return;
    el.innerHTML = '';
    const sorted = Object.entries(msgs).sort((a,b) => a[1].ts - b[1].ts);
    if (!sorted.length) { el.innerHTML = '<div style="text-align:center;color:var(--muted);padding:30px">No messages yet. Say hi! 👋</div>'; }
    else sorted.forEach(([k,m]) => el.appendChild(buildClubMsgBubble(m, k, clubId)));
    el.scrollTop = el.scrollHeight;
  });

  const doSend = () => {
    const inp = document.getElementById('club-dash-input');
    const txt = inp?.value.trim(); if (!txt) return;
    inp.value = '';
    rtdb.ref(`clubChats/${clubId}/messages`).push({
      uid: currentUser.uid, name: currentUserData.name || 'Student',
      avatar: currentUserData.avatar || '😎', text: txt, ts: Date.now()
    }).catch(() => {});
  };
  document.getElementById('club-dash-send').addEventListener('click', doSend);
  document.getElementById('club-dash-input').addEventListener('keydown', e => { if (e.key === 'Enter') doSend(); });
}

// ── Club Announcements Tab ──
function renderClubAnnouncements(body, clubId, clubData, isOwner) {
  body.innerHTML = `<div style="padding:16px">
    ${isOwner ? `<div style="margin-bottom:16px">
      <textarea id="ann-text" rows="3" placeholder="📢 Write an announcement…" style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:var(--surface2);color:var(--text);font-size:14px;resize:none"></textarea>
      <button id="ann-submit" style="margin-top:8px;background:var(--accent);color:#fff;border:none;padding:8px 18px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600">Post Announcement</button>
    </div>` : ''}
    <div id="ann-list"><div class="loading-spinner">Loading…</div></div>
  </div>`;

  if (isOwner) {
    document.getElementById('ann-submit')?.addEventListener('click', async () => {
      const txt = document.getElementById('ann-text')?.value.trim();
      if (!txt) return;
      await db.collection('clubs').doc(clubId).collection('announcements').add({
        text: txt, authorName: currentUserData.name, authorAvatar: currentUserData.avatar,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      document.getElementById('ann-text').value = '';
      loadAnnouncements(clubId);
      toast('Announcement posted 📢', 'success');
    });
  }
  loadAnnouncements(clubId);
}

function loadAnnouncements(clubId) {
  const el = document.getElementById('ann-list'); if (!el) return;
  el.innerHTML = '<div class="loading-spinner">Loading…</div>';
  db.collection('clubs').doc(clubId).collection('announcements')
    .orderBy('createdAt','desc').limit(20).get().then(snap => {
      if (snap.empty) { el.innerHTML = '<div style="text-align:center;padding:30px;color:var(--muted)">No announcements yet 📢</div>'; return; }
      el.innerHTML = '';
      snap.forEach(doc => {
        const d = doc.data();
        const div = document.createElement('div');
        div.style.cssText = 'background:var(--surface2);border:1px solid var(--border);border-left:4px solid var(--accent);border-radius:10px;padding:12px 14px;margin-bottom:10px';
        div.innerHTML = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="font-size:22px">${d.authorAvatar||'😎'}</span>
          <div><strong style="font-size:13px">${escHtml(d.authorName||'Admin')}</strong><div style="font-size:11px;color:var(--muted)">${timeAgo(d.createdAt)}</div></div>
        </div><div style="font-size:14px">${escHtml(d.text)}</div>`;
        el.appendChild(div);
      });
    }).catch(e => { el.innerHTML = `<p style="color:var(--danger);padding:16px">${escHtml(e.message)}</p>`; });
}

// ── Club Events Tab ──
function renderClubEvents(body, clubId, clubData, isOwner) {
  body.innerHTML = `<div style="padding:16px">
    ${isOwner ? `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:16px">
      <div style="font-weight:700;margin-bottom:10px">📅 Create Event</div>
      <input id="ev-title" type="text" placeholder="Event name" style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:14px;margin-bottom:8px"/>
      <textarea id="ev-desc" rows="2" placeholder="Description…" style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:14px;resize:none;margin-bottom:8px"></textarea>
      <input id="ev-date" type="datetime-local" style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:14px;margin-bottom:8px"/>
      <input id="ev-loc" type="text" placeholder="📍 Location (optional)" style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:14px;margin-bottom:8px"/>
      <button id="ev-submit" style="background:var(--accent);color:#fff;border:none;padding:8px 18px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600">Add Event</button>
    </div>` : ''}
    <div id="ev-list"><div class="loading-spinner">Loading…</div></div>
  </div>`;

  if (isOwner) {
    document.getElementById('ev-submit')?.addEventListener('click', async () => {
      const title = document.getElementById('ev-title')?.value.trim();
      const desc  = document.getElementById('ev-desc')?.value.trim();
      const date  = document.getElementById('ev-date')?.value;
      const loc   = document.getElementById('ev-loc')?.value.trim();
      if (!title || !date) return toast('Title and date required', 'error');
      await db.collection('clubs').doc(clubId).collection('events').add({
        title, desc: desc||'', date, location: loc||'',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      document.getElementById('ev-title').value = '';
      document.getElementById('ev-desc').value = '';
      document.getElementById('ev-date').value = '';
      document.getElementById('ev-loc').value = '';
      loadClubEvents(clubId);
      toast('Event added! 📅', 'success');
    });
  }
  loadClubEvents(clubId);
}

function loadClubEvents(clubId) {
  const el = document.getElementById('ev-list'); if (!el) return;
  el.innerHTML = '<div class="loading-spinner">Loading…</div>';
  db.collection('clubs').doc(clubId).collection('events')
    .orderBy('createdAt','desc').limit(20).get().then(snap => {
      if (snap.empty) { el.innerHTML = '<div style="text-align:center;padding:30px;color:var(--muted)">No events yet 📅</div>'; return; }
      el.innerHTML = '';
      snap.forEach(doc => {
        const d = doc.data();
        const dt = d.date ? new Date(d.date).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
        const div = document.createElement('div');
        div.style.cssText = 'background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:10px;display:flex;gap:12px';
        div.innerHTML = `<div style="background:var(--accent);color:#fff;border-radius:10px;padding:8px 12px;text-align:center;flex-shrink:0;min-width:52px">
            <div style="font-size:20px">📅</div><div style="font-size:10px;font-weight:700">${dt.split(',')[0]||''}</div>
          </div>
          <div style="flex:1">
            <strong>${escHtml(d.title)}</strong>
            ${d.desc ? `<div style="font-size:13px;color:var(--muted);margin-top:2px">${escHtml(d.desc)}</div>` : ''}
            <div style="font-size:12px;color:var(--accent);margin-top:4px">🕐 ${escHtml(dt)} ${d.location?'· 📍'+escHtml(d.location):''}</div>
          </div>`;
        el.appendChild(div);
      });
    }).catch(e => { el.innerHTML = `<p style="color:var(--danger);padding:16px">${escHtml(e.message)}</p>`; });
}

// ── Club Polls Tab ──
function renderClubPolls(body, clubId, clubData, isMember) {
  body.innerHTML = `<div style="padding:16px">
    ${isMember ? `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:16px">
      <div style="font-weight:700;margin-bottom:10px">🗳️ Create Poll</div>
      <input id="cp-q" type="text" placeholder="Your question…" style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:14px;margin-bottom:8px"/>
      <div id="cp-opts">
        <input class="cp-opt" type="text" placeholder="Option 1" style="width:100%;padding:7px 12px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:13px;margin-bottom:6px"/>
        <input class="cp-opt" type="text" placeholder="Option 2" style="width:100%;padding:7px 12px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:13px;margin-bottom:6px"/>
      </div>
      <div style="display:flex;gap:8px;margin-top:4px">
        <button id="cp-add-opt" style="background:var(--surface);border:1px solid var(--border);color:var(--text);padding:6px 12px;border-radius:8px;cursor:pointer;font-size:13px">+ Option</button>
        <button id="cp-submit" style="background:var(--accent);color:#fff;border:none;padding:6px 16px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">Post Poll</button>
      </div>
    </div>` : ''}
    <div id="cp-list"><div class="loading-spinner">Loading…</div></div>
  </div>`;

  if (isMember) {
    document.getElementById('cp-add-opt')?.addEventListener('click', () => {
      const opts = document.getElementById('cp-opts');
      const inp = document.createElement('input');
      inp.className = 'cp-opt'; inp.type = 'text';
      inp.placeholder = `Option ${opts.children.length + 1}`;
      inp.style.cssText = 'width:100%;padding:7px 12px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:13px;margin-bottom:6px';
      opts.appendChild(inp);
    });
    document.getElementById('cp-submit')?.addEventListener('click', async () => {
      const q = document.getElementById('cp-q')?.value.trim();
      const opts = [...document.querySelectorAll('.cp-opt')].map(o => o.value.trim()).filter(Boolean);
      if (!q || opts.length < 2) return toast('Question + at least 2 options required', 'error');
      await db.collection('clubs').doc(clubId).collection('polls').add({
        question: q,
        options: opts.map(o => ({ text: o, votes: [] })),
        createdBy: currentUser.uid, createdByName: currentUserData.name,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      loadClubPolls(clubId);
      toast('Poll created! 🗳️', 'success');
    });
  }
  loadClubPolls(clubId);
}

function loadClubPolls(clubId) {
  const el = document.getElementById('cp-list'); if (!el) return;
  el.innerHTML = '<div class="loading-spinner">Loading…</div>';
  db.collection('clubs').doc(clubId).collection('polls')
    .orderBy('createdAt','desc').limit(15).get().then(snap => {
      if (snap.empty) { el.innerHTML = '<div style="text-align:center;padding:30px;color:#fff">No polls yet 🗳️</div>'; return; }
      el.innerHTML = '';
      snap.forEach(doc => {
        const d = doc.data();
        const totalVotes = (d.options||[]).reduce((s, o) => s + (o.votes||[]).length, 0);
        const div = document.createElement('div');
        div.style.cssText = 'background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:10px';
        div.innerHTML = `<div style="font-weight:700;margin-bottom:10px">${escHtml(d.question)}</div>
          ${(d.options||[]).map((o,i) => {
            const pct = totalVotes > 0 ? Math.round((o.votes||[]).length / totalVotes * 100) : 0;
            const voted = (o.votes||[]).includes(currentUser.uid);
            return `<div class="cp-vote-row" data-poll="${doc.id}" data-opt="${i}" style="margin-bottom:8px;cursor:pointer">
              <div style="display:flex;justify-content:space-between;margin-bottom:3px">
                <span style="font-size:13px;${voted?'font-weight:700;color:#fff':''}">${voted?'✓ ':''}${escHtml(o.text)}</span>
                <span style="font-size:12px;color:var(--muted)">${pct}% (${(o.votes||[]).length})</span>
              </div>
              <div style="background:var(--border);border-radius:99px;height:6px">
                <div style="background:${voted?'var(--accent)':'var(--muted)'};width:${pct}%;height:6px;border-radius:99px;transition:width 0.4s"></div>
              </div>
            </div>`;
          }).join('')}
          <div style="font-size:11px;color:#fff;margin-top:8px">by ${escHtml(d.createdByName||'Member')} · ${totalVotes} votes · ${timeAgo(d.createdAt)}</div>`;

        div.querySelectorAll('.cp-vote-row').forEach(row => {
          row.addEventListener('click', async () => {
            const optIdx = parseInt(row.dataset.opt);
            const pollRef = db.collection('clubs').doc(clubId).collection('polls').doc(doc.id);
            const fresh = await pollRef.get();
            const opts = fresh.data().options || [];
            // Remove from all, add to chosen
            opts.forEach((o,i) => { o.votes = (o.votes||[]).filter(u => u !== currentUser.uid); });
            opts[optIdx].votes.push(currentUser.uid);
            await pollRef.update({ options: opts });
            loadClubPolls(clubId);
          });
        });
        el.appendChild(div);
      });
    }).catch(e => { el.innerHTML = `<p style="color:var(--danger);padding:16px">${escHtml(e.message)}</p>`; });
}

// ── Club Gallery Tab ──
function renderClubGallery(body, clubId, clubData, isMember) {
  body.innerHTML = `<div style="padding:16px">
    ${isMember ? `<div style="margin-bottom:14px;display:flex;gap:8px;align-items:center">
      <label style="background:var(--accent);color:#fff;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">
        📸 Upload Photo
        <input type="file" id="gallery-upload" accept="image/*" hidden/>
      </label>
      <span style="font-size:12px;color:var(--muted)">Share moments with the club</span>
    </div>` : ''}
    <div id="gallery-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px"><div class="loading-spinner" style="grid-column:1/-1">Loading…</div></div>
  </div>`;

  if (isMember) {
    document.getElementById('gallery-upload')?.addEventListener('change', async e => {
      const file = e.target.files[0]; if (!file) return;
      showLoading();
      try {
        const url = await uploadToCloudinary(file, 'image', '🖼️ Uploading to gallery…');
        await db.collection('clubs').doc(clubId).collection('gallery').add({
          url, uploaderName: currentUserData.name, uploaderAvatar: currentUserData.avatar,
          uid: currentUser.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        loadClubGallery(clubId);
        toast('Photo added to gallery! 🖼️', 'success');
      } catch(err) { toast(err.message, 'error'); }
      hideLoading();
    });
  }
  loadClubGallery(clubId);
}

function loadClubGallery(clubId) {
  const grid = document.getElementById('gallery-grid'); if (!grid) return;
  grid.innerHTML = '<div class="loading-spinner" style="grid-column:1/-1">Loading…</div>';
  db.collection('clubs').doc(clubId).collection('gallery')
    .orderBy('createdAt','desc').limit(30).get().then(snap => {
      if (snap.empty) { grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--muted)">No photos yet 🖼️</div>'; return; }
      grid.innerHTML = '';
      snap.forEach(doc => {
        const d = doc.data();
        const tile = document.createElement('div');
        tile.style.cssText = 'position:relative;aspect-ratio:1;border-radius:8px;overflow:hidden;cursor:pointer;background:var(--surface2)';
        tile.innerHTML = `<img src="${d.url}" style="width:100%;height:100%;object-fit:cover" loading="lazy"/>
          <div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(0,0,0,0.7));padding:6px;font-size:10px;color:#fff">${escHtml(d.uploaderAvatar||'😎')} ${escHtml(d.uploaderName||'')}</div>`;
        tile.addEventListener('click', () => { window.open(d.url, '_blank'); });
        grid.appendChild(tile);
      });
    }).catch(e => { grid.innerHTML = `<p style="color:var(--danger);padding:16px;grid-column:1/-1">${escHtml(e.message)}</p>`; });
}

// ── Club Leaderboard Tab ──
function renderClubLeaderboard(body, clubId, clubData) {
  body.innerHTML = `<div style="padding:16px">
    <div style="font-size:13px;color:var(--muted);margin-bottom:14px">Most active members (by messages sent)</div>
    <div id="lb-list"><div class="loading-spinner">Loading…</div></div>
  </div>`;
  loadClubLeaderboard(clubId, clubData);
}

async function loadClubLeaderboard(clubId, clubData) {
  const el = document.getElementById('lb-list'); if (!el) return;
  try {
    // Count messages per user in clubChats
    const snap = await rtdb.ref(`clubChats/${clubId}/messages`).once('value');
    const msgs = snap.val() || {};
    const counts = {};
    Object.values(msgs).forEach(m => {
      if (m.uid) counts[m.uid] = (counts[m.uid] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a,b) => b[1] - a[1]).slice(0, 15);
    if (!sorted.length) { el.innerHTML = '<div style="text-align:center;padding:30px;color:var(--muted)">No activity yet 🏆</div>'; return; }

    // Fetch user info
    const uids = sorted.map(([uid]) => uid);
    const users = await fetchUsersByUids(uids);
    const userMap = {};
    users.forEach(u => { userMap[u.uid] = u; });

    const medals = ['🥇','🥈','🥉'];
    el.innerHTML = '';
    sorted.forEach(([uid, count], idx) => {
      const u = userMap[uid] || {};
      const div = document.createElement('div');
      div.style.cssText = `display:flex;align-items:center;gap:12px;padding:10px;border-radius:10px;margin-bottom:8px;${idx<3?'background:var(--surface2);border:1px solid var(--border)':''}`;
      div.innerHTML = `<div style="font-size:22px;flex-shrink:0;width:30px;text-align:center">${medals[idx]||`${idx+1}`}</div>
        <div style="font-size:26px;flex-shrink:0">${u.avatar||'😎'}</div>
        <div style="flex:1"><strong style="font-size:14px">${escHtml(u.name||uid.slice(0,8))}</strong><div style="font-size:12px;color:var(--muted)">${count} messages</div></div>
        <div style="font-size:20px;font-weight:800;color:var(--accent)">${count}</div>`;
      el.appendChild(div);
    });
  } catch(e) { el.innerHTML = `<p style="color:var(--danger);padding:16px">${escHtml(e.message)}</p>`; }
}

// ══════════════════════════════════════
// CHATS (Real-time with RTDB)
// ══════════════════════════════════════
function setupChats() {
  loadChatList();
}

function getChatId(uid1, uid2) {
  return [uid1, uid2].sort().join('_');
}

function loadChatList() {
  const list = $('chat-list');
  list.innerHTML = '<div class="loading-spinner">Loading…</div>';
  // No orderBy to avoid composite index requirement; sort client-side
  db.collection('chats')
    .where('members', 'array-contains', currentUser.uid)
    .onSnapshot(snap => {
      list.innerHTML = '';
      if (snap.empty) {
        list.innerHTML = '<div style="padding:20px;color:var(--muted);font-size:13px;text-align:center">No chats yet.<br/>Match someone in Dating! 💘</div>';
        return;
      }
      // Sort by lastMessageAt client-side (desc)
      const chatDocs = snap.docs.sort((a, b) => {
        const aT = a.data().lastMessageAt?.toMillis?.() || 0;
        const bT = b.data().lastMessageAt?.toMillis?.() || 0;
        return bT - aT;
      });
      chatDocs.forEach(doc => {
        const d = doc.data();
        const other = d.members.find(m => m !== currentUser.uid);
        const otherInfo = d.memberInfo?.[other] || { name: d.name || 'User', avatar: '😎' };
        // Fix 4: Count unread messages for this chat
        const isLastSenderMe = d.lastSenderId === currentUser.uid;
        const unreadCount = (!isLastSenderMe && d.unreadCount && d.unreadCount[currentUser.uid]) || 0;
        const item = document.createElement('div');
        item.className = 'chat-list-item';
        item.innerHTML = `
          <div class="chat-list-avatar">${otherInfo.avatar || '😎'}</div>
          <div class="chat-list-info">
            <strong>${escHtml(otherInfo.name || 'User')}</strong>
            <small class="${unreadCount > 0 ? 'chat-unread-preview' : ''}">${escHtml(d.lastMessage || 'Say hi!')}</small>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">
            <span class="chat-time">${timeAgo(d.lastMessageAt)}</span>
            ${unreadCount > 0 ? `<span class="chat-unread-badge">${unreadCount > 9 ? '9+' : unreadCount}</span>` : ''}
          </div>`;
        item.addEventListener('click', () => openChat(doc.id, other, otherInfo));
        list.appendChild(item);
      });
    });
}

function startChat(uid, name, avatar) {
  switchView('chats');
  setTimeout(() => openChat(getChatId(currentUser.uid, uid), uid, {name, avatar}), 300);
}

async function openChat(chatId, otherUid, otherInfo) {
  currentChatId = chatId;
  currentChatUid = otherUid;
  markChatRead(chatId);

  const chatRef = db.collection('chats').doc(chatId);
  const snap = await chatRef.get();
  if (!snap.exists) {
    await chatRef.set({
      members: [currentUser.uid, otherUid].filter(Boolean),
      memberInfo: {
        [currentUser.uid]: {
          name:   currentUserData.name   || currentUser.displayName || 'Student',
          avatar: currentUserData.avatar || '😎'
        },
        ...(otherUid ? { [otherUid]: {
          name:   (otherInfo && otherInfo.name)   ? String(otherInfo.name)   : 'User',
          avatar: (otherInfo && otherInfo.avatar) ? String(otherInfo.avatar) : '😎'
        }} : {})
      },
      lastMessage: '',
      lastMessageAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  const win = $('chat-window');
  win.innerHTML = `
    <div style="padding:14px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;">
      <span style="font-size:28px">${otherInfo.avatar||'😎'}</span>
      <strong>${escHtml(otherInfo.name||'User')}</strong>
    </div>
    <div class="chat-messages" id="desktop-chat-msgs"></div>
    <div class="chat-input-bar">
      <input type="text" id="desktop-chat-input" placeholder="Type a message…"/>
      <label class="btn-icon">
        <i data-lucide="image"></i>
        <input type="file" id="desktop-chat-media" accept="image/*,video/*" hidden/>
      </label>
      <button class="btn-send" id="desktop-chat-send"><i data-lucide="send"></i></button>
    </div>`;
  lucide.createIcons();

  $('desktop-chat-media').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    showLoading();
    try {
      const url = await uploadToCloudinary(file);
      await sendChatMessage(chatId, '', url, file.type.startsWith('video'));
    } catch(err) { toast(err.message, 'error'); }
    hideLoading();
  });

  $('desktop-chat-send').addEventListener('click', () => sendDesktopMsg(chatId));
  $('desktop-chat-input').addEventListener('keydown', e => { if(e.key==='Enter') sendDesktopMsg(chatId); });

  if (chatListener) chatListener.off();
  const msgRef = rtdb.ref(`chats/${chatId}/messages`);
  chatListener = msgRef;
  msgRef.on('value', snap => {
    const msgs = snap.val() || {};
    const el = $('desktop-chat-msgs');
    if (!el) return;
    el.innerHTML = '';
    Object.entries(msgs).sort((a,b)=>a[1].ts-b[1].ts).forEach(([key, m]) => {
      el.appendChild(buildMsgBubble({ ...m, key }));
    });
    el.scrollTop = el.scrollHeight;
    lucide.createIcons();
  });

  if (window.innerWidth < 768) {
    $('chat-window-title').textContent = otherInfo.name || 'Chat';
    openModal('modal-chat-window');
    const mmsgs = $('modal-chat-messages');
    msgRef.on('value', snap => {
      const msgs = snap.val() || {};
      mmsgs.innerHTML = '';
      Object.entries(msgs).sort((a,b)=>a[1].ts-b[1].ts).forEach(([key, m]) => mmsgs.appendChild(buildMsgBubble({ ...m, key })));
      mmsgs.scrollTop = mmsgs.scrollHeight;
      lucide.createIcons();
    });
    $('modal-chat-send').onclick = () => {
      const txt = $('modal-chat-input').value.trim(); if (!txt) return;
      sendChatMessage(chatId, txt); $('modal-chat-input').value = '';
    };
    $('modal-chat-input').onkeydown = e => { if(e.key==='Enter') $('modal-chat-send').click(); };
    $('modal-chat-media').onchange = async e => {
      const file = e.target.files[0]; if (!file) return;
      showLoading();
      try { const url = await uploadToCloudinary(file); await sendChatMessage(chatId,'',url,file.type.startsWith('video')); }
      catch(err){toast(err.message,'error');}
      hideLoading();
    };
  }
}

function sendDesktopMsg(chatId) {
  const inp = $('desktop-chat-input');
  const txt = inp?.value.trim(); if (!txt) return;
  sendChatMessage(chatId, txt);
  inp.value = '';
}

async function sendChatMessage(chatId, text, mediaUrl, isVideo) {
  mediaUrl = mediaUrl || '';
  isVideo  = !!isVideo;
  const msg = {
    uid:      currentUser.uid,
    name:     currentUserData.name   || currentUser.displayName || 'Student',
    avatar:   currentUserData.avatar || '😎',
    text:     text     || '',
    mediaUrl: mediaUrl,
    isVideo:  isVideo,
    ts:       Date.now(),
    read:     false
  };
  const msgRef = await rtdb.ref(`chats/${chatId}/messages`).push(msg);
  // Fix 4b: Track unread count for each member
  const chatMetaUpdate = {
    lastMessage: text || (mediaUrl ? '📎 Media' : ''),
    lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
    lastSenderId: currentUser.uid
  };
  // Increment unread count for recipients
  try {
    const chatSnap2 = await db.collection('chats').doc(chatId).get();
    const members2 = chatSnap2.exists ? (chatSnap2.data().members || []) : [];
    members2.filter(m => m && m !== currentUser.uid).forEach(uid => {
      chatMetaUpdate[`unreadCount.${uid}`] = firebase.firestore.FieldValue.increment(1);
    });
  } catch(e) {}
  await db.collection('chats').doc(chatId).set(chatMetaUpdate, { merge: true });
  // Send notification to other chat members
  try {
    const chatSnap = await db.collection('chats').doc(chatId).get();
    const chatData = chatSnap.data() || {};
    const members  = chatData.members || [];
    const others   = members.filter(m => m !== currentUser.uid);
    others.forEach(uid => {
      db.collection('notifications').add({
        toUid:    uid,
        fromUid:  currentUser.uid,
        fromName: currentUserData.name || 'Student',
        fromAvatar: currentUserData.avatar || '😎',
        type:     'message',
        text:     text ? text.slice(0, 60) : (mediaUrl ? '📎 Media' : ''),
        chatId:   chatId,
        read:     false,
        ts:       firebase.firestore.FieldValue.serverTimestamp()
      }).catch(() => {});
    });
  } catch(e) {}
}

// Mark messages read when chat is opened
function markChatRead(chatId) {
  rtdb.ref(`chats/${chatId}/messages`).once('value', snap => {
    const updates = {};
    snap.forEach(child => {
      if (child.val().uid !== currentUser.uid && !child.val().read) {
        updates[child.key + '/read'] = true;
      }
    });
    if (Object.keys(updates).length > 0) {
      rtdb.ref(`chats/${chatId}/messages`).update(updates).catch(() => {});
    }
  });
  // Mark notifications read
  db.collection('notifications')
    .where('toUid', '==', currentUser.uid)
    .where('chatId', '==', chatId)
    .where('read', '==', false)
    .get().then(snap => {
      snap.forEach(doc => doc.ref.update({ read: true }).catch(() => {}));
    }).catch(() => {});
  // Fix 4c: Reset unread count for this user
  db.collection('chats').doc(chatId).set(
    { [`unreadCount.${currentUser.uid}`]: 0 },
    { merge: true }
  ).catch(() => {});
}

async function startGroupChat(clubId, clubName, emoji) {
  const chatId = `club_${clubId}`;
  const chatRef = db.collection('chats').doc(chatId);
  const snap = await chatRef.get();
  if (!snap.exists) {
    await chatRef.set({
      type: 'group', clubId,
      name: `${emoji} ${clubName}`,
      members: [currentUser.uid],
      memberInfo: {},
      lastMessage: 'Welcome to the club chat!',
      lastMessageAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }
  openChat(chatId, null, { name: `${emoji} ${clubName}`, avatar: emoji });
}

function buildMsgBubble(m) {
  const mine = m.uid === currentUser?.uid;
  const wrap = document.createElement('div');
  wrap.className = `chat-msg ${mine ? 'mine' : ''}`;

  let content = m.text ? escHtml(m.text) : '';
  let media = '';
  if (m.mediaUrl) {
    media = m.isVideo
      ? `<div class="msg-media"><video src="${m.mediaUrl}" controls playsinline style="max-width:200px;border-radius:10px"></video></div>`
      : `<div class="msg-media"><img src="${m.mediaUrl}" style="max-width:200px;border-radius:10px" loading="lazy"/></div>`;
  }
  const tickHtml = mine
    ? `<span class="msg-tick ${m.read ? 'read' : ''}">${m.read ? '✓✓' : '✓'}</span>`
    : '';

  wrap.innerHTML = `
    ${!mine ? `<div class="msg-avatar">${m.avatar || '😎'}</div>` : ''}
    <div class="msg-inner">
      <div class="msg-bubble">${content}${media}</div>
      <div class="msg-time">${new Date(m.ts).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}${tickHtml}</div>
    </div>
    ${mine ? `<button class="msg-delete-btn" title="Delete" style="display:none" data-key="${escHtml(m.key||'')}"><i data-lucide="trash-2"></i></button>` : ''}`;

  // ── Long-press delete (3s hold) ──
  if (mine && m.key) {
    const bubble  = wrap.querySelector('.msg-bubble');
    const delBtn  = wrap.querySelector('.msg-delete-btn');
    let pressTimer = null;
    let hideTimer  = null;

    const showDelete = () => {
      delBtn.style.display = 'flex';
      wrap.classList.add('msg-delete-visible');
      clearTimeout(hideTimer);
      // Auto-hide after 4s
      hideTimer = setTimeout(() => {
        delBtn.style.display = 'none';
        wrap.classList.remove('msg-delete-visible');
      }, 3000);
    };

    const startPress = () => {
      pressTimer = setTimeout(showDelete, 1000);
    };
    const cancelPress = () => clearTimeout(pressTimer);

    bubble.addEventListener('mousedown',   startPress);
    bubble.addEventListener('mouseup',     cancelPress);
    bubble.addEventListener('mouseleave',  cancelPress);
    bubble.addEventListener('touchstart',  startPress, { passive: true });
    bubble.addEventListener('touchend',    cancelPress);
    bubble.addEventListener('touchcancel', cancelPress);

    delBtn.addEventListener('click', async () => {
      if (!confirm('Delete this message?')) return;
      try {
        await rtdb.ref(`chats/${currentChatId}/messages/${m.key}`).remove();
        wrap.classList.add('msg-deleting');
        setTimeout(() => wrap.remove(), 300);
      } catch(e) { toast('Could not delete message', 'error'); }
    });
  }

  return wrap;
}

// ══════════════════════════════════════
// PROFILE  (fixed real-time stats)
// ══════════════════════════════════════
function loadProfile() {
  if (!currentUserData) return;
  $('profile-name').textContent = currentUserData.name || 'Student';
  $('profile-username').textContent = `@${currentUserData.username || 'user'}`;
  $('profile-college').textContent = `🎓 ${currentUserData.college || 'My College'}`;
  // Fix 2: Show profile photo if set, else emoji avatar
  const avatarEl = $('profile-avatar-display');
  if (currentUserData.profilePic) {
    avatarEl.innerHTML = '<img src="' + currentUserData.profilePic + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>';
  } else {
    avatarEl.textContent = currentUserData.avatar || '😎';
  }
  $('profile-bio').value = currentUserData.bio || '';

  // Set initial values from cached data
  $('stat-posts').textContent = currentUserData.posts || 0;
  $('stat-friends').textContent = currentUserData.friends || 0;
  $('stat-clubs').textContent = (currentUserData.clubs || []).length;

  // REAL-TIME: fetch fresh from Firestore to get accurate stats
  db.collection('users').doc(currentUser.uid).get().then(snap => {
    if (!snap.exists) return;
    const fresh = snap.data();
    currentUserData = { ...currentUserData, ...fresh };

    // Count posts directly from collection for accuracy
    db.collection('posts').where('uid','==',currentUser.uid).get().then(postsSnap => {
      const postCount = postsSnap.size;
      $('stat-posts').textContent = postCount;
      // Also fix the Firestore counter if needed
      if (fresh.posts !== postCount) {
        db.collection('users').doc(currentUser.uid).update({ posts: postCount }).catch(() => {});
      }
    });

    // Fix 2b: Refresh avatar/profilePic from fresh Firestore data
    const freshAvatarEl = $('profile-avatar-display');
    if (fresh.profilePic) {
      freshAvatarEl.innerHTML = '<img src="' + fresh.profilePic + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>';
    } else if (fresh.avatar) {
      freshAvatarEl.textContent = fresh.avatar;
    }

    // Count friends from friends collection (accurate)
    db.collection('friends').doc(currentUser.uid).get().then(fSnap => {
      const fData = fSnap.exists ? fSnap.data() : {};
      const confirmedList = fData.confirmed || [];
      const friendCount = confirmedList.length;
      $('stat-friends').textContent = friendCount;
      // Also fix the Firestore counter if needed
      if (fresh.friends !== friendCount) {
        db.collection('users').doc(currentUser.uid).update({ friends: friendCount }).catch(() => {});
      }
    }).catch(() => {
      const friendCount = fresh.friends || 0;
      $('stat-friends').textContent = friendCount;
    });

    // Count clubs from live Firestore (user is a member)
    db.collection('clubs').where('members', 'array-contains', currentUser.uid).get().then(clubSnap => {
      const clubCount = clubSnap.size;
      $('stat-clubs').textContent = clubCount;
      // Sync the clubs array
      const clubIds = clubSnap.docs.map(d => d.id);
      if (JSON.stringify((fresh.clubs||[]).sort()) !== JSON.stringify(clubIds.sort())) {
        db.collection('users').doc(currentUser.uid).update({ clubs: clubIds }).catch(() => {});
        currentUserData.clubs = clubIds;
      }
    }).catch(() => {
      const clubCount = (fresh.clubs || []).length;
      $('stat-clubs').textContent = clubCount;
    });
  }).catch(e => console.warn('Profile load error:', e));

  // Badges
  const badges = [];
  if ((currentUserData.posts||0) >= 1)  badges.push('🎉 First Post');
  if ((currentUserData.posts||0) >= 10) badges.push('📝 Active Poster');
  if ((currentUserData.clubs||[]).length >= 1) badges.push('🏛️ Club Member');
  $('profile-badges').innerHTML = badges.map(b=>`<span class="badge-chip">${b}</span>`).join('');

  // Logout button (add once)
  if (!$('profile-logout-btn')) {
    const logoutBtn = document.createElement('button');
    logoutBtn.id = 'profile-logout-btn';
    logoutBtn.className = 'btn-logout-profile';
    logoutBtn.innerHTML = '<i data-lucide="log-out"></i> Logout';
    logoutBtn.style.cssText = 'margin-top:16px;display:flex;align-items:center;gap:8px;background:var(--surface2);border:1px solid var(--border);color:var(--muted);padding:10px 18px;border-radius:10px;cursor:pointer;font-size:14px;width:100%;justify-content:center;';
    logoutBtn.addEventListener('click', () => { if (confirm('Logout?')) auth.signOut(); });
    $('view-profile').querySelector('.profile-card').appendChild(logoutBtn);
    lucide.createIcons();
  }

  loadMyPosts();
}

// Helper to update stats in the profile view from cached data
function updateProfileStats() {
  if (!currentUser) return;
  // Recount posts live (no orderBy = no composite index needed)
  db.collection('posts').where('uid','==',currentUser.uid).get().then(snap => {
    const count = snap.size;
    if ($('stat-posts')) $('stat-posts').textContent = count;
    currentUserData.posts = count;
    // Refresh badges
    const badges = [];
    if (count >= 1)  badges.push('🎉 First Post');
    if (count >= 10) badges.push('📝 Active Poster');
    if ((currentUserData.clubs||[]).length >= 1) badges.push('🏛️ Club Member');
    if ($('profile-badges')) $('profile-badges').innerHTML = badges.map(b=>'<span class="badge-chip">'+b+'</span>').join('');
  }).catch(() => {});
  // Clubs from live Firestore
  db.collection('clubs').where('members','array-contains',currentUser.uid).get().then(snap => {
    if ($('stat-clubs')) $('stat-clubs').textContent = snap.size;
    currentUserData.clubs = snap.docs.map(d => d.id);
  }).catch(() => {
    if ($('stat-clubs')) $('stat-clubs').textContent = (currentUserData.clubs||[]).length;
  });
  // Friends from live Firestore
  db.collection('friends').doc(currentUser.uid).get().then(snap => {
    const confirmed = snap.exists ? (snap.data().confirmed || []) : [];
    if ($('stat-friends')) $('stat-friends').textContent = confirmed.length;
  }).catch(() => {});
}

function loadMyPosts() {
  const list = $('my-posts-list');
  list.innerHTML = '<div class="loading-spinner" style="padding:20px;font-size:13px">Loading your posts…</div>';
  // No orderBy — avoids requiring a composite Firestore index. Sort client-side instead.
  db.collection('posts').where('uid','==',currentUser.uid).limit(30).get()
    .then(snap => {
      list.innerHTML = '';
      if (snap.empty) {
        list.innerHTML = '<div style="padding:20px;color:var(--muted);font-size:13px;text-align:center">No posts yet. Share something! 🚀</div>';
        return;
      }
      // Sort newest-first client-side
      const docs = snap.docs.sort((a, b) => {
        const aT = a.data().createdAt?.toMillis?.() || 0;
        const bT = b.data().createdAt?.toMillis?.() || 0;
        return bT - aT;
      });
      docs.forEach(doc => list.appendChild(buildPostCard(doc.id, doc.data(), true)));
      $('stat-posts').textContent = snap.size;
      lucide.createIcons();
    }).catch(e => console.warn('loadMyPosts error:', e));
}

$('save-bio-btn').addEventListener('click', async () => {
  const bio = $('profile-bio').value.trim();
  await db.collection('users').doc(currentUser.uid).set({ bio }, { merge: true });
  currentUserData.bio = bio;
  toast('Bio saved!', 'success');
});

$('avatar-edit-btn').addEventListener('click', () => {
  const grid = $('avatar-grid');
  grid.innerHTML = AVATARS.map(a => `<div class="avatar-option" data-avatar="${a}">${a}</div>`).join('');
  grid.querySelectorAll('.avatar-option').forEach(el => {
    if (el.dataset.avatar === currentUserData.avatar) el.classList.add('selected');
    el.addEventListener('click', async () => {
      const av = el.dataset.avatar;
      await db.collection('users').doc(currentUser.uid).set({ avatar: av }, { merge: true });
      currentUserData.avatar = av;
      $('profile-avatar-display').textContent = av;
      closeModal('modal-avatar');
      toast('Avatar updated! 🎭', 'success');
    });
  });
  openModal('modal-avatar');
});

// ======================================
// EDIT PROFILE MODAL
// ======================================
$('edit-profile-btn') && $('edit-profile-btn').addEventListener('click', openEditProfileModal);

function openEditProfileModal() {
  if (!currentUserData) return;
  var nameEl  = $('edit-profile-name');
  var userEl  = $('edit-profile-username');
  var bioEl   = $('edit-profile-bio');
  var picPrev = $('edit-pic-preview');
  if (nameEl) nameEl.value = currentUserData.name || '';
  if (userEl) userEl.value = currentUserData.username || '';
  if (bioEl)  bioEl.value  = currentUserData.bio  || '';
  if (picPrev) {
    if (currentUserData.profilePic) {
      picPrev.innerHTML = '<img src="' + currentUserData.profilePic + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>';
    } else {
      picPrev.textContent = currentUserData.avatar || '\uD83D\uDE0E';
    }
  }
  openModal('modal-edit-profile');
  lucide.createIcons();
}

var _editProfilePicFile = null;
$('edit-profile-pic-input') && $('edit-profile-pic-input').addEventListener('change', function(e) {
  var file = e.target.files[0]; if (!file) return;
  _editProfilePicFile = file;
  var url = URL.createObjectURL(file);
  var prev = $('edit-pic-preview');
  if (prev) prev.innerHTML = '<img src="' + url + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>';
});

$('edit-pick-avatar-btn') && $('edit-pick-avatar-btn').addEventListener('click', function() {
  closeModal('modal-edit-profile');
  var grid = $('avatar-grid'); if (!grid) return;
  grid.innerHTML = AVATARS.map(function(a) { return '<div class="avatar-option" data-avatar="' + a + '">' + a + '</div>'; }).join('');
  grid.querySelectorAll('.avatar-option').forEach(function(el) {
    if (currentUserData && el.dataset.avatar === currentUserData.avatar) el.classList.add('selected');
    el.addEventListener('click', async function() {
      var av = el.dataset.avatar;
      await db.collection('users').doc(currentUser.uid).set({ avatar: av }, { merge: true });
      currentUserData.avatar = av;
      $('profile-avatar-display').textContent = av;
      var prev = $('edit-pic-preview'); if (prev) prev.textContent = av;
      closeModal('modal-avatar');
      setTimeout(openEditProfileModal, 80);
      toast('Avatar updated!', 'success');
    });
  });
  openModal('modal-avatar');
});

$('save-profile-btn') && $('save-profile-btn').addEventListener('click', async function() {
  var name     = ($('edit-profile-name') ? $('edit-profile-name').value  : '').trim();
  var username = ($('edit-profile-username') ? $('edit-profile-username').value : '').trim().replace('@','');
  var bio      = ($('edit-profile-bio')  ? $('edit-profile-bio').value   : '').trim();
  if (!name) return toast('Name cannot be empty', 'error');
  showLoading();
  try {
    var updates = { name: name, username: username, bio: bio };
    if (_editProfilePicFile) {
      var picUrl = await uploadToCloudinary(_editProfilePicFile, 'image', 'Uploading profile picture...');
      updates.profilePic = picUrl;
      _editProfilePicFile = null;
    }
    await db.collection('users').doc(currentUser.uid).set(updates, { merge: true });
    Object.assign(currentUserData, updates);
    if ($('profile-name'))    $('profile-name').textContent    = name;
    if ($('profile-username')) $('profile-username').textContent = '@' + username;
    if ($('profile-bio'))     $('profile-bio').value            = bio;
    if (updates.profilePic) {
      var dispEl = $('profile-avatar-display');
      if (dispEl) dispEl.innerHTML = '<img src="' + updates.profilePic + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>';
    }
    closeModal('modal-edit-profile');
    toast('Profile updated!', 'success');
  } catch(err) { toast(err.message, 'error'); }
  hideLoading();
});

// ══════════════════════════════════════
// FRIEND SYSTEM — fully fixed
// ══════════════════════════════════════

// Fetch user docs reliably by uid — works even if uid field missing
async function fetchUsersByUids(uids) {
  if (!uids || uids.length === 0) return [];
  const users = [];
  // Fetch each doc directly by its doc ID (uid = doc ID in /users collection)
  const promises = uids.map(uid =>
    db.collection('users').doc(uid).get()
      .then(snap => { if (snap.exists) users.push({ uid: snap.id, ...snap.data() }); })
      .catch(() => {})
  );
  await Promise.all(promises);
  return users;
}

function loadFriends() {
  if (!currentUser) return;
  // Real-time listener on my friends doc
  db.collection('friends').doc(currentUser.uid)
    .onSnapshot(snap => {
      const d = snap.data() || {};
      friendsList      = d.confirmed || [];
      pendingRequests  = d.incoming  || [];
      outgoingRequests = d.outgoing  || [];

      // Update nav badges
      updateBadge('friend-req-badge',        pendingRequests.length);
      updateBadge('friend-req-badge-mobile', pendingRequests.length);

      // If Friends view is currently open, re-render it
      const view = document.getElementById('view-friends');
      if (view && view.classList.contains('active')) {
        loadFriendsView();
      }
    }, err => console.warn('friends listener:', err));
}

async function loadFriendsView() {
  const reqSection = document.getElementById('friend-requests-section');
  const reqList    = document.getElementById('friend-requests-list');
  const fList      = document.getElementById('friends-list');
  if (!fList) return;

  // ── Pending incoming requests ─────────────────
  if (pendingRequests.length > 0) {
    if (reqSection) reqSection.style.display = '';
    const badge = document.getElementById('req-count-badge');
    if (badge) badge.textContent = pendingRequests.length;

    if (reqList) {
      reqList.innerHTML = '<div class="loading-spinner" style="padding:12px">Loading requests…</div>';
      try {
        const users = await fetchUsersByUids(pendingRequests);
        reqList.innerHTML = '';

        if (users.length === 0) {
          // Docs not saved yet — show basic rows with uid only
          pendingRequests.forEach(uid => {
            const row = document.createElement('div');
            row.className = 'friend-req-row';
            row.innerHTML = `
              <div class="friend-avatar"><span class="friend-avatar-emoji">😎</span></div>
              <div class="friend-info"><strong>New Friend Request</strong><small>${uid.slice(0,8)}…</small></div>
              <div class="friend-req-btns">
                <button class="friend-btn accept" onclick="acceptFriendRequest('${uid}');this.closest('.friend-req-row').remove()">Accept</button>
                <button class="friend-btn reject" onclick="rejectFriendRequest('${uid}');this.closest('.friend-req-row').remove()">Decline</button>
              </div>`;
            reqList.appendChild(row);
          });
          return;
        }

        users.forEach(u => {
          const row = document.createElement('div');
          row.className = 'friend-req-row';
          const avatarHtml = u.profilePic
            ? `<img src="${escHtml(u.profilePic)}" class="friend-avatar-img"/>`
            : `<span class="friend-avatar-emoji">${u.avatar || '😎'}</span>`;
          row.innerHTML = `
            <div class="friend-avatar">${avatarHtml}</div>
            <div class="friend-info">
              <strong>${escHtml(u.name || 'Student')}</strong>
              <small>@${escHtml(u.username || 'user')} · 🎓 ${escHtml(u.college || '')}</small>
            </div>
            <div class="friend-req-btns">
              <button class="friend-btn accept" onclick="acceptFriendRequest('${u.uid}');this.closest('.friend-req-row').remove()">Accept</button>
              <button class="friend-btn reject" onclick="rejectFriendRequest('${u.uid}');this.closest('.friend-req-row').remove()">Decline</button>
            </div>`;
          reqList.appendChild(row);
        });
      } catch(e) {
        reqList.innerHTML = `<p style="color:var(--danger);padding:12px">${escHtml(e.message)}</p>`;
      }
    }
  } else {
    if (reqSection) reqSection.style.display = 'none';
  }

  // ── Confirmed friends ─────────────────────────
  if (friendsList.length === 0) {
    fList.innerHTML = `
      <div class="friends-empty">
        <span style="font-size:40px">🤝</span>
        <p>No friends yet</p>
        <small>Search for classmates and send a request!</small>
      </div>`;
    return;
  }

  fList.innerHTML = '<div class="loading-spinner" style="padding:12px">Loading friends…</div>';
  try {
    const users = await fetchUsersByUids(friendsList);
    fList.innerHTML = '';

    if (users.length === 0) {
      fList.innerHTML = `
        <div class="friends-empty">
          <span style="font-size:40px">🤝</span>
          <p>No friends yet</p>
          <small>Search for classmates and send a request!</small>
        </div>`;
      return;
    }

    users.forEach(u => {
      const row = document.createElement('div');
      row.className = 'friend-row';
      const avatarHtml = u.profilePic
        ? `<img src="${escHtml(u.profilePic)}" class="friend-avatar-img"/>`
        : `<span class="friend-avatar-emoji">${u.avatar || '😎'}</span>`;
      row.innerHTML = `
        <div class="friend-avatar">${avatarHtml}</div>
        <div class="friend-info">
          <strong>${escHtml(u.name || 'Student')}</strong>
          <small>@${escHtml(u.username || 'user')} · 🎓 ${escHtml(u.college || '')}</small>
        </div>
        <div style="display:flex;gap:8px;flex-shrink:0">
          <button class="friend-btn msg"
            onclick="startChat('${u.uid}','${escHtml(u.name||'User')}','${escHtml(u.avatar||'😎')}');switchView('chats')"
            title="Message">💬</button>
          <button class="friend-btn unfriend small" onclick="unfriend('${u.uid}')">Remove</button>
        </div>`;
      fList.appendChild(row);
    });
  } catch(e) {
    fList.innerHTML = `<p style="color:var(--danger);padding:12px">${escHtml(e.message)}</p>`;
  }
}

async function sendFriendRequest(toUid, toName, toAvatar) {
  if (!currentUser) return;
  if (outgoingRequests.includes(toUid)) { toast('Request already sent 👍', 'info'); return; }
  if (friendsList.includes(toUid))      { toast('Already friends! 🎉', 'info'); return; }
  try {
    const batch = db.batch();
    // Write to target's incoming array
    batch.set(db.collection('friends').doc(toUid),
      { incoming: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) },
      { merge: true });
    // Write to my outgoing array
    batch.set(db.collection('friends').doc(currentUser.uid),
      { outgoing: firebase.firestore.FieldValue.arrayUnion(toUid) },
      { merge: true });
    await batch.commit();
    // Update local state immediately so button updates without waiting for snapshot
    outgoingRequests = [...outgoingRequests, toUid];
    sendNotification(toUid, 'friend_request', '🤝 sent you a friend request', null);
    toast('Friend request sent! 🤝', 'success');
    // Refresh any visible friend buttons on screen
    document.querySelectorAll(`.search-person-action[data-uid="${toUid}"]`).forEach(el => {
      el.innerHTML = buildFriendBtn(toUid, toName, toAvatar);
    });
  } catch(e) { toast(e.message, 'error'); }
}

async function acceptFriendRequest(fromUid) {
  if (!currentUser) return;
  try {
    const batch = db.batch();
    const myRef   = db.collection('friends').doc(currentUser.uid);
    const fromRef = db.collection('friends').doc(fromUid);
    batch.set(myRef,   {
      confirmed: firebase.firestore.FieldValue.arrayUnion(fromUid),
      incoming:  firebase.firestore.FieldValue.arrayRemove(fromUid)
    }, { merge: true });
    batch.set(fromRef, {
      confirmed: firebase.firestore.FieldValue.arrayUnion(currentUser.uid),
      outgoing:  firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
    }, { merge: true });
    // Increment friend count for both users safely
    batch.set(db.collection('users').doc(currentUser.uid),
      { friends: firebase.firestore.FieldValue.increment(1) }, { merge: true });
    batch.set(db.collection('users').doc(fromUid),
      { friends: firebase.firestore.FieldValue.increment(1) }, { merge: true });
    await batch.commit();
    // Update local state immediately
    friendsList     = [...friendsList, fromUid];
    pendingRequests = pendingRequests.filter(u => u !== fromUid);
    updateBadge('friend-req-badge',        pendingRequests.length);
    updateBadge('friend-req-badge-mobile', pendingRequests.length);
    sendNotification(fromUid, 'friend_accept', '✅ accepted your friend request', null);
    toast('Friend added! 🎉', 'success');
  } catch(e) { toast(e.message, 'error'); }
}

async function rejectFriendRequest(fromUid) {
  if (!currentUser) return;
  try {
    await Promise.all([
      db.collection('friends').doc(currentUser.uid).set(
        { incoming: firebase.firestore.FieldValue.arrayRemove(fromUid) }, { merge: true }),
      db.collection('friends').doc(fromUid).set(
        { outgoing: firebase.firestore.FieldValue.arrayRemove(currentUser.uid) }, { merge: true })
    ]);
    // Update local state immediately
    pendingRequests = pendingRequests.filter(u => u !== fromUid);
    updateBadge('friend-req-badge',        pendingRequests.length);
    updateBadge('friend-req-badge-mobile', pendingRequests.length);
    toast('Request declined', 'info');
  } catch(e) { toast(e.message, 'error'); }
}

async function unfriend(uid) {
  if (!currentUser || !confirm('Unfriend this person?')) return;
  try {
    await Promise.all([
      db.collection('friends').doc(currentUser.uid).set(
        { confirmed: firebase.firestore.FieldValue.arrayRemove(uid) }, { merge: true }),
      db.collection('friends').doc(uid).set(
        { confirmed: firebase.firestore.FieldValue.arrayRemove(currentUser.uid) }, { merge: true }),
      db.collection('users').doc(currentUser.uid).set(
        { friends: firebase.firestore.FieldValue.increment(-1) }, { merge: true }),
      db.collection('users').doc(uid).set(
        { friends: firebase.firestore.FieldValue.increment(-1) }, { merge: true })
    ]);
    // Update local state immediately
    friendsList = friendsList.filter(u => u !== uid);
    toast('Unfriended', 'info');
    // Re-render friends view
    const view = document.getElementById('view-friends');
    if (view && view.classList.contains('active')) loadFriendsView();
  } catch(e) { toast(e.message, 'error'); }
}

function getFriendStatus(uid) {
  if (!currentUser || uid === currentUser.uid) return 'self';
  if (friendsList.includes(uid))      return 'friend';
  if (pendingRequests.includes(uid))  return 'pending_received';
  if (outgoingRequests.includes(uid)) return 'pending_sent';
  return 'none';
}

function buildFriendBtn(uid, name, avatar) {
  const s = getFriendStatus(uid);
  if (s === 'self')             return '';
  if (s === 'friend')           return `<button class="friend-btn unfriend" onclick="unfriend('${uid}')">✓ Friends</button>`;
  if (s === 'pending_received') return `<button class="friend-btn accept" onclick="acceptFriendRequest('${uid}')">✅ Accept</button>
                                        <button class="friend-btn reject" onclick="rejectFriendRequest('${uid}')">✕</button>`;
  if (s === 'pending_sent')     return `<button class="friend-btn pending" disabled>Requested ✓</button>`;
  return `<button class="friend-btn add" onclick="sendFriendRequest('${uid}','${escHtml(name||'')}','${escHtml(avatar||'😎')}')">+ Add Friend</button>`;
}

// ══════════════════════════════════════
// CENTRALIZED NOTIFICATION SENDER
// ══════════════════════════════════════
function sendNotification(toUid, type, text, chatId, postId) {
  if (!currentUser || !toUid || toUid === currentUser.uid) return;
  db.collection('notifications').add({
    toUid,
    fromUid:        currentUser.uid,
    fromName:       currentUserData?.name       || 'Someone',
    fromAvatar:     currentUserData?.avatar     || '😎',
    fromProfilePic: currentUserData?.profilePic || null,
    type,
    text,
    chatId:  chatId || null,
    postId:  postId || null,
    read:    false,
    ts:      firebase.firestore.FieldValue.serverTimestamp()
  }).catch(() => {});
}

// ══════════════════════════════════════
// NOTIFICATION SYSTEM — real-time
// ══════════════════════════════════════
var _notifListener     = null;
var _chatBadgeListener = null;
var _notifCount        = 0;
var _prevNotifCount    = 0;

function setupNotifications() {
  if (!currentUser) return;
  if (_notifListener)     _notifListener();
  if (_chatBadgeListener) _chatBadgeListener();

  // ── Bell badge: unread notifications ──
  _notifListener = db.collection('notifications')
    .where('toUid', '==', currentUser.uid)
    .where('read',  '==', false)
    .orderBy('ts', 'desc')
    .limit(30)
    .onSnapshot(snap => {
      _prevNotifCount = _notifCount;
      _notifCount = snap.size;
      updateNotifBadge(_notifCount);
      snap.docChanges().forEach(change => {
        if (change.type !== 'added') return;
        const d   = change.doc.data();
        const tsMs = d.ts?.toMillis?.() || 0;
        if (Date.now() - tsMs < 7000) {
          showNotifToast(d, change.doc.id);
          if (_prevNotifCount === 0) playNotifSound();
        }
      });
    }, () => {});

  // ── Chat badge: unread messages ──
  _chatBadgeListener = db.collection('chats')
    .where('members', 'array-contains', currentUser.uid)
    .onSnapshot(snap => {
      let total = 0;
      snap.forEach(doc => {
        const d = doc.data();
        if (d.lastSenderId !== currentUser.uid) total += (d.unreadCount?.[currentUser.uid] || 0);
      });
      updateBadge('chat-badge', total);
      updateBadge('chat-badge-mobile', total);
    }, () => {});
}

function updateBadge(id, count) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent   = count > 99 ? '99+' : String(count);
  el.style.display = count > 0 ? 'flex' : 'none';
}

function updateNotifBadge(count) {
  updateBadge('notif-badge', count);
  updateBadge('notif-badge-mobile', count);
  if (count > 0) {
    ['notif-bell','notif-bell-mobile'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('bell-ring');
      void el.offsetWidth;
      el.classList.add('bell-ring');
    });
  }
}

function markAllNotifsRead() {
  db.collection('notifications')
    .where('toUid','==',currentUser.uid).where('read','==',false)
    .get().then(snap => {
      const batch = db.batch();
      snap.forEach(doc => batch.update(doc.ref, { read: true }));
      return batch.commit();
    }).then(() => {
      document.querySelectorAll('.notif-item.unread').forEach(el => el.classList.remove('unread'));
      document.querySelectorAll('.notif-unread-dot').forEach(el => el.remove());
      toast('All read ✓', 'success');
    }).catch(() => {});
}

function showNotifToast(d, docId) {
  document.querySelector('.notif-toast')?.remove();
  const t = document.createElement('div');
  t.className = 'notif-toast';
  const avatarHtml = d.fromProfilePic
    ? `<img src="${escHtml(d.fromProfilePic)}" class="notif-toast-avatar-img"/>`
    : `<span class="notif-toast-avatar-emoji">${d.fromAvatar||'😎'}</span>`;
  const icon = {like:'❤️',comment:'💬',friend_request:'🤝',friend_accept:'✅',message:'💬',match:'💖',club_join:'🏛️'}[d.type]||'🔔';
  t.innerHTML = `
    <div class="notif-toast-avatar">${avatarHtml}</div>
    <div class="notif-toast-body">
      <div class="notif-toast-name">${escHtml(d.fromName||'Someone')}</div>
      <div class="notif-toast-text">${icon} ${escHtml(d.text||'sent a notification')}</div>
    </div>
    <button class="notif-toast-close" onclick="this.parentElement.remove()">×</button>`;
  t.addEventListener('click', e => {
    if (e.target.classList.contains('notif-toast-close')) return;
    if (d.chatId) { switchView('chats'); setTimeout(() => { db.collection('chats').doc(d.chatId).get().then(snap => { if(!snap.exists)return; const cd=snap.data(); const other=(cd.members||[]).find(m=>m!==currentUser.uid); openChat(d.chatId,other,cd.memberInfo?.[other]||{name:'User',avatar:'😎'}); }); }, 200); }
    else if (d.type==='friend_request'||d.type==='friend_accept') switchView('friends');
    else if ((d.type==='like'||d.type==='comment') && d.postId) switchView('feed');
    else if (d.type==='club_join') switchView('clubs');
    t.remove();
    db.collection('notifications').doc(docId).update({ read: true }).catch(()=>{});
  });
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 5000);
}

function toggleNotifPanel() {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  if (panel.classList.toggle('open')) loadNotifPanel();
}

function loadNotifPanel() {
  const list = document.getElementById('notif-list');
  if (!list) return;
  list.innerHTML = '<div class="notif-loading"><div class="notif-skeleton"></div><div class="notif-skeleton"></div><div class="notif-skeleton"></div></div>';
  db.collection('notifications')
    .where('toUid','==',currentUser.uid)
    .orderBy('ts','desc').limit(40)
    .get().then(snap => {
      if (snap.empty) {
        list.innerHTML = `<div class="notif-empty"><span style="font-size:40px">🔔</span><p>No notifications yet</p><small>Likes, comments & friend requests appear here</small></div>`;
        return;
      }
      const batch = db.batch(); let hasUnread = false;
      snap.forEach(doc => { if(!doc.data().read){ batch.update(doc.ref,{read:true}); hasUnread=true; } });
      if (hasUnread) batch.commit().catch(()=>{});
      list.innerHTML = '';
      const unread = snap.docs.filter(d=>!d.data().read);
      const read   = snap.docs.filter(d=> d.data().read);
      if (unread.length) { const lbl=document.createElement('div'); lbl.className='notif-section-label'; lbl.textContent='New'; list.appendChild(lbl); unread.forEach(doc=>list.appendChild(buildNotifItem(doc))); }
      if (read.length)   { const lbl=document.createElement('div'); lbl.className='notif-section-label read-label'; lbl.textContent='Earlier'; list.appendChild(lbl); read.forEach(doc=>list.appendChild(buildNotifItem(doc))); }
    }).catch(err => { list.innerHTML = `<div style="padding:16px;color:var(--muted)">${escHtml(err.message)}</div>`; });
}

function buildNotifItem(doc) {
  const d = doc.data();
  const item = document.createElement('div');
  item.className = 'notif-item' + (d.read ? '' : ' unread');
  const icon = {like:'❤️',comment:'💬',friend_request:'🤝',friend_accept:'✅',message:'💬',match:'💖',club_join:'🏛️'}[d.type]||'🔔';
  const avatarHtml = d.fromProfilePic
    ? `<img src="${escHtml(d.fromProfilePic)}" class="notif-item-avatar-img"/>`
    : `<span class="notif-item-avatar-emoji">${d.fromAvatar||'😎'}</span>`;
  item.innerHTML = `
    <div class="notif-item-avatar-wrap">
      <div class="notif-item-avatar">${avatarHtml}</div>
      <span class="notif-type-badge">${icon}</span>
    </div>
    <div class="notif-item-body">
      <div class="notif-item-text"><strong>${escHtml(d.fromName||'Someone')}</strong> ${escHtml(d.text||'interacted with you')}</div>
      <div class="notif-item-time">${timeAgo(d.ts)}</div>
      ${d.type==='friend_request' ? `<div class="notif-friend-actions">
        <button class="friend-btn accept small" onclick="acceptFriendRequest('${d.fromUid}');this.closest('.notif-item').remove()">Accept</button>
        <button class="friend-btn reject small" onclick="rejectFriendRequest('${d.fromUid}');this.closest('.notif-item').remove()">Decline</button>
      </div>` : ''}
    </div>
    ${!d.read ? '<div class="notif-unread-dot"></div>' : ''}`;
  item.addEventListener('click', e => {
    if (e.target.closest('.notif-friend-actions')) return;
    doc.ref.update({ read: true }).catch(()=>{});
    item.classList.remove('unread');
    item.querySelector('.notif-unread-dot')?.remove();
    document.getElementById('notif-panel')?.classList.remove('open');
    if (d.chatId) { switchView('chats'); setTimeout(() => { db.collection('chats').doc(d.chatId).get().then(snap => { if(!snap.exists)return; const cd=snap.data(); const other=(cd.members||[]).find(m=>m!==currentUser.uid); openChat(d.chatId,other,cd.memberInfo?.[other]||{name:'User',avatar:'😎'}); }); }, 200); }
    else if (d.type==='friend_request'||d.type==='friend_accept') { switchView('friends'); }
    else if ((d.type==='like'||d.type==='comment') && d.postId) { switchView('feed'); toast(`Navigated to feed — find ${d.fromName}'s activity`, 'info'); }
    else if (d.type==='club_join') { switchView('clubs'); }
  });
  return item;
}

document.addEventListener('click', e => {
  const panel = document.getElementById('notif-panel');
  const bell  = document.getElementById('notif-bell');
  const bellM = document.getElementById('notif-bell-mobile');
  if (panel?.classList.contains('open') &&
      !panel.contains(e.target) &&
      !bell?.contains(e.target) &&
      !bellM?.contains(e.target)) {
    panel.classList.remove('open');
  }
});

// ══════════════════════════════════════
// NOTES HUB
// ══════════════════════════════════════

const NOTE_TYPE_LABELS = {
  study_notes: '📒 Study Notes',
  pyq:         '📝 PYQ',
  assignments: '📋 Assignment',
  pdf:         '📄 PDF'
};

const NOTE_TYPE_COLORS = {
  study_notes: '#4f8ef7',
  pyq:         '#f7a94f',
  assignments: '#7ed957',
  pdf:         '#e05cf7'
};

function setupNotes() {
  // Filter tabs
  document.querySelectorAll('.notes-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.notes-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentNotesFilter = tab.dataset.filter;
      loadNotes();
    });
  });

  // Search
  const searchInput = document.getElementById('notes-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(notesSearchDebounce);
      notesSearchDebounce = setTimeout(() => loadNotes(searchInput.value.trim()), 300);
    });
  }

  // Open modal
  document.getElementById('new-note-btn')?.addEventListener('click', () => {
    document.getElementById('note-title').value = '';
    document.getElementById('note-subject').value = '';
    document.getElementById('note-desc').value = '';
    document.getElementById('note-link').value = '';
    document.getElementById('note-type').value = 'study_notes';
    document.getElementById('note-file-preview').style.display = 'none';
    document.getElementById('note-file-preview').innerHTML = '';
    _selectedNoteFile = null;
    openModal('modal-note');
    lucide.createIcons();
  });

  // Upload zone click
  const zone = document.getElementById('note-upload-zone');
  const fileInput = document.getElementById('note-file-input');
  zone?.addEventListener('click', () => fileInput?.click());
  zone?.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone?.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone?.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f) handleNoteFileSelect(f);
  });
  fileInput?.addEventListener('change', () => {
    if (fileInput.files[0]) handleNoteFileSelect(fileInput.files[0]);
  });

  // Submit
  document.getElementById('submit-note-btn')?.addEventListener('click', submitNote);

  // Load on view switch (handled by nav)
  loadNotes();
}

let _selectedNoteFile = null;

function handleNoteFileSelect(file) {
  if (file.size > 20 * 1024 * 1024) { toast('File too large (max 20 MB)', 'error'); return; }
  _selectedNoteFile = file;
  const preview = document.getElementById('note-file-preview');
  preview.style.display = 'flex';
  const isImg = file.type.startsWith('image/');
  const ext = file.name.split('.').pop().toUpperCase();
  preview.innerHTML = isImg
    ? `<img src="${URL.createObjectURL(file)}" style="max-height:80px;border-radius:8px;margin-right:10px"/>
       <span>${escHtml(file.name)}</span>
       <button onclick="_selectedNoteFile=null;this.parentElement.style.display='none'" style="margin-left:auto;background:none;border:none;cursor:pointer;color:var(--muted);font-size:18px">✕</button>`
    : `<div class="note-file-icon">${ext}</div>
       <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(file.name)}</span>
       <button onclick="_selectedNoteFile=null;this.parentElement.style.display='none'" style="margin-left:8px;background:none;border:none;cursor:pointer;color:var(--muted);font-size:18px">✕</button>`;
  lucide.createIcons();
}

async function submitNote() {
  const title   = document.getElementById('note-title').value.trim();
  const subject = document.getElementById('note-subject').value.trim();
  const type    = document.getElementById('note-type').value;
  const desc    = document.getElementById('note-desc').value.trim();
  const link    = document.getElementById('note-link').value.trim();

  if (!title) { toast('Please add a title', 'error'); return; }
  if (!_selectedNoteFile && !link) { toast('Upload a file or paste a link', 'error'); return; }

  showLoading();
  try {
    let fileUrl = null, fileName = null, fileType = null;

    if (_selectedNoteFile) {
      fileUrl  = await uploadToCloudinary(_selectedNoteFile, 'raw', '📚 Uploading note…');
      fileName = _selectedNoteFile.name;
      fileType = _selectedNoteFile.type;
    }

    await db.collection('notes').add({
      title, subject, type, desc,
      fileUrl:  fileUrl  || link,
      fileName: fileName || null,
      fileType: fileType || null,
      isLink:   !_selectedNoteFile,
      uploaderUid:    currentUser.uid,
      uploaderName:   currentUserData?.name    || 'Anonymous',
      uploaderAvatar: currentUserData?.avatar  || '😎',
      college: currentUserData?.college || '',
      likes: 0,
      downloads: 0,
      ts: firebase.firestore.FieldValue.serverTimestamp()
    });

    closeModal('modal-note');
    toast('Note shared! 📚', 'success');
    _selectedNoteFile = null;
    loadNotes();
  } catch(e) {
    toast('Upload failed: ' + e.message, 'error');
  } finally {
    hideLoading();
  }
}

function loadNotes(searchQuery) {
  const grid = document.getElementById('notes-grid');
  if (!grid) return;
  grid.innerHTML = '<div class="loading-spinner">Loading notes…</div>';

  let query = db.collection('notes').orderBy('ts', 'desc').limit(60);
  if (currentNotesFilter !== 'all') {
    query = db.collection('notes').where('type', '==', currentNotesFilter).orderBy('ts', 'desc').limit(60);
  }

  query.get().then(snap => {
    let docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      docs = docs.filter(n =>
        (n.title   || '').toLowerCase().includes(q) ||
        (n.subject || '').toLowerCase().includes(q) ||
        (n.uploaderName || '').toLowerCase().includes(q) ||
        (n.desc    || '').toLowerCase().includes(q)
      );
    }

    if (!docs.length) {
      grid.innerHTML = `<div class="notes-empty">
        <span style="font-size:48px">📭</span>
        <p>No notes yet. Be the first to share!</p>
      </div>`;
      return;
    }

    grid.innerHTML = '';
    docs.forEach(note => grid.appendChild(buildNoteCard(note)));
    lucide.createIcons();
  }).catch(err => {
    grid.innerHTML = `<div class="notes-empty"><p>Error: ${escHtml(err.message)}</p></div>`;
  });
}

function buildNoteCard(note) {
  const card = document.createElement('div');
  card.className = 'note-card';
  const typeColor = NOTE_TYPE_COLORS[note.type] || '#4f8ef7';
  const typeLabel = NOTE_TYPE_LABELS[note.type] || note.type;
  const ext = note.fileName ? note.fileName.split('.').pop().toUpperCase() : (note.isLink ? 'LINK' : 'FILE');
  const isImg = note.fileType && note.fileType.startsWith('image/');
  const isPdf = note.fileType === 'application/pdf' || (note.fileName || '').endsWith('.pdf');

  card.innerHTML = `
    <div class="note-card-header">
      <span class="note-type-badge" style="background:${typeColor}20;color:${typeColor}">${typeLabel}</span>
      <span class="note-ext-tag">${ext}</span>
    </div>
    ${isImg ? `<img src="${escHtml(note.fileUrl)}" class="note-thumb" loading="lazy"/>` : ''}
    <div class="note-card-body">
      <div class="note-title">${escHtml(note.title)}</div>
      ${note.subject ? `<div class="note-subject">📖 ${escHtml(note.subject)}</div>` : ''}
      ${note.desc    ? `<div class="note-desc-text">${escHtml(note.desc)}</div>` : ''}
    </div>
    <div class="note-card-footer">
      <div class="note-uploader">
        <span class="note-avatar">${escHtml(note.uploaderAvatar || '😎')}</span>
        <span>${escHtml(note.uploaderName || 'Anonymous')}</span>
      </div>
      <div class="note-actions">
        <button class="note-like-btn" data-id="${note.id}" title="Helpful">
          <i data-lucide="thumbs-up"></i> <span>${note.likes || 0}</span>
        </button>
        <a class="note-download-btn" href="${escHtml(note.fileUrl)}" target="_blank" rel="noopener"
           title="${note.isLink ? 'Open link' : 'Download'}" data-id="${note.id}">
          <i data-lucide="${note.isLink ? 'external-link' : 'download'}"></i>
        </a>
      </div>
    </div>`;

  // Like
  card.querySelector('.note-like-btn').addEventListener('click', async (e) => {
    const btn   = e.currentTarget;
    const likeRef = db.collection('noteLikes').doc(`${note.id}_${currentUser.uid}`);
    const snap  = await likeRef.get();
    if (snap.exists) {
      await likeRef.delete();
      await db.collection('notes').doc(note.id).update({ likes: firebase.firestore.FieldValue.increment(-1) });
      btn.classList.remove('liked');
      btn.querySelector('span').textContent = Math.max(0, (note.likes || 0) - 1);
      note.likes = Math.max(0, (note.likes || 0) - 1);
    } else {
      await likeRef.set({ uid: currentUser.uid, noteId: note.id, ts: firebase.firestore.FieldValue.serverTimestamp() });
      await db.collection('notes').doc(note.id).update({ likes: firebase.firestore.FieldValue.increment(1) });
      btn.classList.add('liked');
      btn.querySelector('span').textContent = (note.likes || 0) + 1;
      note.likes = (note.likes || 0) + 1;
    }
  });

  // Check liked state
  db.collection('noteLikes').doc(`${note.id}_${currentUser.uid}`).get().then(s => {
    if (s.exists) card.querySelector('.note-like-btn')?.classList.add('liked');
  }).catch(() => {});

  // Track download
  card.querySelector('.note-download-btn')?.addEventListener('click', () => {
    db.collection('notes').doc(note.id).update({ downloads: firebase.firestore.FieldValue.increment(1) }).catch(() => {});
  });

  return card;
}

// ══════════════════════════════════════
// FCM PUSH NOTIFICATIONS
// ══════════════════════════════════════

// VAPID key — replace with your actual FCM VAPID public key from Firebase Console
// Project Settings → Cloud Messaging → Web Push certificates
const FCM_VAPID_KEY = 'BDCzLnVOJxMpv9RibP-NYCfdB9p2UTRvdfix1YQwsEUwdq_6ckY2siFtDhLVI3tSnO-LU_LEDMsF-aRGsVDS2fo';

let _fcmMessaging = null;

async function initFCM() {
  // Only show banner if not previously dismissed and notifications not already granted
  if (localStorage.getItem('fcm_dismissed') === '1') return;
  if (Notification.permission === 'granted') {
    await registerFCMToken();
    return;
  }
  if (Notification.permission === 'denied') return;

  // Show the soft-ask banner after a short delay
  setTimeout(() => {
    const banner = document.getElementById('fcm-banner');
    if (banner) banner.style.display = 'flex';
  }, 3000);

  document.getElementById('fcm-allow-btn')?.addEventListener('click', async () => {
    document.getElementById('fcm-banner').style.display = 'none';
    await requestFCMPermission();
  });

  document.getElementById('fcm-dismiss-btn')?.addEventListener('click', () => {
    document.getElementById('fcm-banner').style.display = 'none';
    localStorage.setItem('fcm_dismissed', '1');
  });
}

async function requestFCMPermission() {
  try {
    
    if (!("Notification" in window)) {
      toast("Notifications not supported on this browser", "info");
      return;
    }
    
    const permission = await Notification.requestPermission();
    
    if (permission !== "granted") {
      toast("Notifications blocked. Enable from browser settings.", "info");
      return;
    }
    
    await registerFCMToken();
    toast("🔔 Notifications enabled!", "success");
    
  } catch (e) {
    console.warn("FCM permission error:", e);
  }
}

async function registerFCMToken() {
  try {
    // Ensure service worker is registered (firebase-messaging-sw.js must exist at root)
    if (!('serviceWorker' in navigator)) {
      console.warn('Service workers not supported');
      return;
    }

    // Register the FCM service worker
    let swReg;
    try {
      swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    } catch(e) {
      // If SW not deployed yet, skip silently — won't break the app
      console.warn('FCM SW not found. Create firebase-messaging-sw.js at your root.', e.message);
      return;
    }

    if (!firebase.messaging) {
      console.warn('Firebase messaging not loaded');
      return;
    }

    _fcmMessaging = firebase.messaging();

    const token = await _fcmMessaging.getToken({
      vapidKey: FCM_VAPID_KEY,
      serviceWorkerRegistration: swReg
    });

    if (!token) { console.warn('No FCM token returned'); return; }

    // Save token to Firestore for server-side sends
    await db.collection('users').doc(currentUser.uid).update({
      fcmTokens: firebase.firestore.FieldValue.arrayUnion(token),
      notifEnabled: true
    });

    console.log('FCM token registered:', token.substring(0, 20) + '…');

    // Foreground message handler
    _fcmMessaging.onMessage(payload => {
      const n = payload.notification || {};
      showFCMForegroundNotif(n.title || 'CampusBroz', n.body || '', payload.data || {});
    });

  } catch(e) {
    console.warn('FCM token registration failed:', e.message);
  }
}

function showFCMForegroundNotif(title, body, data) {
  // Reuse existing in-app toast for foreground notifications
  toast(`🔔 ${title}: ${body}`, 'info');

  // Also try native Notification if tab is not focused
  if (document.visibilityState !== 'visible' && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'campusbroz-notif'
      });
    } catch(e) {}
  }
}

