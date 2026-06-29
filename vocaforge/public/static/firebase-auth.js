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
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';

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
const db = getFirestore(app,'vocaforge');
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
  },

  // ---- Firestore 同期 ----
  // クラウドの学習データを取得（未ログイン/未保存なら null）
  // 返り値: { ok, data } | { ok:false, error }
  //   data: { cards, logs, settings, daily, seen } もしくは null（ドキュメント未作成）
  async loadCloud() {
    if (!VFAuth.user) return { ok: false, error: 'not-logged-in' };
    try {
      const snap = await getDoc(doc(db, 'users', VFAuth.user.uid));
      if (!snap.exists()) return { ok: true, data: null };
      const raw = snap.data() || {};
      const data = raw.data || null;
      return { ok: true, data, updatedAt: raw.updatedAtMs || null };
    } catch (e) {
      return { ok: false, error: e && e.code ? e.code : String(e) };
    }
  },
  // クラウドへ学習データを保存
  //   payload: { cards, logs, settings, daily, seen }
async saveCloud(payload) {
    if (!VFAuth.user) return { ok: false, error: 'not-logged-in' };
    try {
      // ★追加: Firestoreが拒否する undefined を弾くために、JSON変換を通して綺麗なデータにする
      const cleanData = JSON.parse(JSON.stringify(payload));
      
      await setDoc(doc(db, 'users', VFAuth.user.uid), {
        app: 'vocaforge',
        version: 1,
        updatedAtMs: Date.now(),
        data: cleanData  // ← ★浄化済みの綺麗なデータを渡すように変更！
      });
      return { ok: true };
    } catch (e) {
      // エラー処理
    }
  }


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
