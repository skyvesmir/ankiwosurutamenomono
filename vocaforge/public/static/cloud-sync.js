/* クラウド同期マネージャ（非module IIFE）
 * - ログイン検知 → クラウド読み込み
 *   - クラウドが空: ローカル（ゲスト）データをそのままアップロードして引き継ぎ
 *   - クラウドにデータあり: ユーザーに「マージ / クラウド優先 / ローカル優先」を確認
 * - 以降、ローカル更新（Store.onDirty）をデバウンスしてクラウドへ自動保存
 * window.VFSync 経由で状態を公開する。
 */
(function (global) {
  'use strict';

  const Store = global.Store;

  const VFSync = {
    enabled: false,     // クラウド同期が有効（ログイン済み＆初期同期完了）
    status: 'idle',     // 'idle' | 'syncing' | 'saved' | 'error'
    lastError: null,
    lastSavedAt: null,
    _listeners: [],
    _initializing: false,
    onChange(fn) {
      if (typeof fn === 'function') {
        this._listeners.push(fn);
        fn(this.snapshot());
      }
    },
    snapshot() {
      return { enabled: this.enabled, status: this.status, lastSavedAt: this.lastSavedAt, lastError: this.lastError };
    },
    _emit() {
      const s = this.snapshot();
      this._listeners.forEach(fn => { try { fn(s); } catch (e) {} });
    }
  };

  global.VFSync = VFSync;

  // VFAuth は module スクリプトで定義されるため cloud-sync.js より後に用意される。
  // 既に在ればすぐ、無ければ 'vfauth-ready' を待って初期化する。
  if (global.VFAuth) {
    setup(global.VFAuth);
  } else {
    global.addEventListener('vfauth-ready', function () {
      if (global.VFAuth) setup(global.VFAuth);
    }, { once: true });
  }

  // ===== ここから先は VFAuth 確定後に動く =====
  function setup(Auth) {

  // ---- 自動保存（デバウンス）----
  let saveTimer = null;
  function scheduleSave() {
    if (!VFSync.enabled) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(pushNow, 1500);
  }
  async function pushNow() {
    if (!VFSync.enabled || !Auth.current()) return;
    VFSync.status = 'syncing'; VFSync._emit();
    const payload = Store.exportData().data;
    const res = await Auth.saveCloud(payload);
    if (res.ok) {
      VFSync.status = 'saved';
      VFSync.lastSavedAt = Date.now();
      VFSync.lastError = null;
      // クラウドに反映済みの内容としてローカル時刻を確定（新旧判定のズレ防止）
      if (typeof res.updatedAt === 'number') Store.setUpdatedAt(res.updatedAt);
    } else {
      VFSync.status = 'error';
      VFSync.lastError = res.error;
    }
    VFSync._emit();
  }
  VFSync.flush = pushNow;

  // ローカル書き込みを監視 → クラウドへ反映
  Store.onDirty(() => scheduleSave());

  // ページを閉じる/バックグラウンドに移る直前に、保留中の保存を確定させる
  // （デバウンス待ち中の未保存分が失われないように）
  function flushIfPending() {
    if (VFSync.enabled && saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
      pushNow();
    }
  }
  global.addEventListener('visibilitychange', function () {
    if (global.document && global.document.visibilityState === 'hidden') flushIfPending();
  });
  global.addEventListener('pagehide', flushIfPending);

  // ---- ローカルにゲストデータが存在するか ----
  function localHasData() {
    const d = Store.exportData().data;
    return (d.cards && Object.keys(d.cards).length > 0) ||
           (Array.isArray(d.logs) && d.logs.length > 0) ||
           (d.daily && Object.keys(d.daily).length > 0) ||
           (d.seen && Object.keys(d.seen).length > 0);
  }
  function cloudHasData(data) {
    if (!data) return false;
    return (data.cards && Object.keys(data.cards).length > 0) ||
           (Array.isArray(data.logs) && data.logs.length > 0) ||
           (data.daily && Object.keys(data.daily).length > 0) ||
           (data.seen && Object.keys(data.seen).length > 0);
  }

  // ---- ログイン時の初期同期 ----
  async function initialSync() {
    if (VFSync._initializing) return;
    VFSync._initializing = true;
    VFSync.status = 'syncing'; VFSync._emit();

    const res = await Auth.loadCloud();
    if (!res.ok) {
      VFSync.status = 'error';
      VFSync.lastError = res.error;
      VFSync._initializing = false;
      VFSync._emit();
      return;
    }

    const cloud = res.data;            // null もしくは {cards,logs,settings,daily,seen}
    const cloudUpdatedAt = res.updatedAt || 0;
    const localUpdatedAt = Store.getUpdatedAt();
    const hasCloud = cloudHasData(cloud);
    const hasLocal = localHasData();

    if (!hasCloud) {
      // クラウドが空 → ゲスト（ローカル）データを引き継いでアップロード
      VFSync.enabled = true;
      await pushNow();
    } else if (!hasLocal) {
      // ローカルが空 → クラウドを取り込む
      Store.applyData(cloud, 'replace');
      Store.setUpdatedAt(cloudUpdatedAt);
      VFSync.enabled = true;
      VFSync.status = 'saved';
      VFSync.lastSavedAt = Date.now();
      VFSync._emit();
      rerender();
    } else {
      // 両方にデータあり → 確認ダイアログは出さず、
      // 「進んでいる方（最終更新が新しい方）」を自動採用する。
      if (cloudUpdatedAt > localUpdatedAt) {
        // クラウドの方が新しい → クラウドで上書き
        Store.applyData(cloud, 'replace');
        Store.setUpdatedAt(cloudUpdatedAt);
        VFSync.enabled = true;
        VFSync.status = 'saved';
        VFSync.lastSavedAt = Date.now();
        VFSync._emit();
        rerender();
      } else {
        // ローカルの方が新しい（または同時刻） → ローカルでクラウドを上書き
        VFSync.enabled = true;
        await pushNow();
        rerender();
      }
    }
    VFSync._initializing = false;
  }

  function rerender() {
    if (global.__go && global.VF && global.VF.STATE) {
      global.__go(global.VF.STATE.route || 'home');
    }
  }

  // ---- ログイン状態に追従 ----
  // 「アプリ起動時の未ログイン検知(null)」と「実際のログアウト」を区別するため、
  // 直前まで実際にログインしていたかを wasLoggedIn で保持する。
  let wasLoggedIn = false;
  Auth.onChange((user) => {
    if (user) {
      wasLoggedIn = true;
      initialSync();
    } else {
      // null には2種類ある: ①起動時の未ログイン ②明示的ログアウト
      const doReset = wasLoggedIn;

      // 1. 先に同期を完全停止（Store.reset() の onDirty で自動アップロードが誤発火するのを防ぐ）
      clearTimeout(saveTimer);
      VFSync.enabled = false;
      VFSync.status = 'idle';
      VFSync.lastSavedAt = null;
      VFSync.lastError = null;
      VFSync._emit();
      wasLoggedIn = false;

      // 2. ログイン状態からのログアウト時のみ、ローカルデータを破棄しホームへ
      if (doReset) {
        if (global.Store && global.Store.reset) global.Store.reset();
        if (global.__go) global.__go('home');
      }
    }
  });

  } // end setup()
})(window);
