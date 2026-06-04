/* ════════════════════════════════════════════════════
   firebase-messaging-sw.js
   ─ Place this file at the ROOT of your web project ─
   e.g. alongside index.html

   Steps to complete FCM setup:
   1. Go to Firebase Console → Project Settings → Cloud Messaging
   2. Under "Web Push certificates", generate a Key Pair (VAPID key)
   3. Copy the VAPID public key into app.js  →  FCM_VAPID_KEY = '...'
   4. Deploy THIS file at your site root (same domain as the app)
════════════════════════════════════════════════════ */

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// ── Same config as in app.js ─────────────────────────
firebase.initializeApp({
  apiKey:            "AIzaSyBCUY1U0FDFpa_JMIRAhgZGsf9jqE5KN7k",
  authDomain:"friendsc-4992e.firebaseapp.com",
  projectId:"friendsc-4992e",
  storageBucket:"friendsc-4992e.firebasestorage.app",
  messagingSenderId:"1010467260080",
  appId:"1:1010467260080:web:8be403df695a4f84a31d75",
  databaseURL:"https://friendsc-4992e-default-rtdb.asia-southeast1.firebasedatabase.app/"
});

const messaging = firebase.messaging();

console.log('[SW] Loaded');

messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background message received:', payload);
  
  self.registration.showNotification(
    payload.notification?.title || 'Test',
    {
      body: payload.notification?.body || 'Test body'
    }
  );
});

// ── Background message handler ───────────────────────
// Fires when app is in background / closed
messaging.onBackgroundMessage(payload => {
  console.log('[SW] Background message:', payload);

  const n = payload.notification || {};
  const data = payload.data || {};

  const title = n.title || 'CampusBroz 🎓';
  const body  = n.body  || 'You have a new notification';

  self.registration.showNotification(title, {
    body,
    icon:  '/icon-192.png',   // add a 192×192 app icon at your root
    badge: '/icon-192.png',
    tag:   data.tag || 'campusbroz',
    data:  { url: data.url || '/' }
  });
});

// ── Notification click ───────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes(self.location.origin) && 'focus' in c) {
          c.postMessage({ type: 'NOTIF_CLICK', url });
          return c.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

console.log("FCM SW loaded");