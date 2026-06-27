// Firebase 認証モジュール（ES module）
// 非moduleのIIFEスクリプト群とは window.VFAuth 経由で橋渡しする。
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js';

const firebaseConfig = {
  apiKey: 'AIzaSyB7gRd_ZIds2PpGZEQDhB7hfiGeIuRAPTQ',
  authDomain: 'vocaforge-94fd2.firebaseapp.com',
  projectId: 'vocaforge-94fd2',
  storageBucket: 'vocaforge-94fd2.firebasestorage.app',
  messagingSenderId: '54243812217',
  appId: '1:54243812217:web:d097dda2b86cea2a7545a8',
  measurementId: 'G-YM0CJGWWS7'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// ログイン状態をローカルに永続化（再訪時も維持）
setPersistence(auth, browserLocalPersistence).catch(() => {});

// 非moduleコードへ橋渡しするグローバルAPI
const VFAuth = {
  ready: false,
  user: null,
  // 現在ユーザー（{ uid, name, email, photo } または null）
  current() {
    return VFAuth.user;
  },
  // Googleログイン
  async login() {
    try {
      await signInWithPopup(auth, provider);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e && e.code ? e.code : String(e) };
    }
  },
  // ログアウト
  async logout() {
    try {
      await signOut(auth);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },
  // 状態変化時に呼ばれるコールバック登録（複数可）
  _listeners: [],
  onChange(fn) {
    if (typeof fn === 'function') {
      VFAuth._listeners.push(fn);
      // 登録時点の状態を即時通知
      if (VFAuth.ready) fn(VFAuth.user);
    }
  }
};

onAuthStateChanged(auth, (u) => {
  VFAuth.ready = true;
  VFAuth.user = u
    ? { uid: u.uid, name: u.displayName || '', email: u.email || '', photo: u.photoURL || '' }
    : null;
  VFAuth._listeners.forEach((fn) => {
    try { fn(VFAuth.user); } catch (_) {}
  });
});

window.VFAuth = VFAuth;
