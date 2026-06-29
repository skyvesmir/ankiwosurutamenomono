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
  const Auth = global.VFAuth;

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

  if (!Auth) { global.VFSync = VFSync; return; }

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
    } else {
      VFSync.status = 'error';
      VFSync.lastError = res.error;
    }
    VFSync._emit();
  }
  VFSync.flush = pushNow;

  // ローカル書き込みを監視 → クラウドへ反映
  Store.onDirty(() => scheduleSave());

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
    const hasCloud = cloudHasData(cloud);
    const hasLocal = localHasData();

    if (!hasCloud) {
      // クラウドが空 → ゲスト（ローカル）データを引き継いでアップロード
      VFSync.enabled = true;
      await pushNow();
    } else if (!hasLocal) {
      // ローカルが空 → クラウドを取り込む
      Store.applyData(cloud, 'replace');
      VFSync.enabled = true;
      VFSync.status = 'saved';
      VFSync.lastSavedAt = Date.now();
      VFSync._emit();
      rerender();
    } else {
      // 両方にデータあり → ユーザーに選択させる
      const choice = askConflict();
      if (choice === 'merge') {
        // クラウドを土台にローカルを統合 → 統合結果をアップロード
        Store.applyData(cloud, 'replace');   // まずクラウドを反映
        // ローカル退避分を merge で足し戻す
        Store.applyData(localSnapshot, 'merge');
        VFSync.enabled = true;
        await pushNow();
        rerender();
      } else if (choice === 'cloud') {
        Store.applyData(cloud, 'replace');
        VFSync.enabled = true;
        VFSync.status = 'saved';
        VFSync.lastSavedAt = Date.now();
        VFSync._emit();
        rerender();
      } else { // 'local'
        VFSync.enabled = true;
        await pushNow();   // ローカルでクラウドを上書き
        rerender();
      }
    }
    VFSync._initializing = false;
  }

  // 競合解決の選択（マージ / クラウド優先 / ローカル優先）
  let localSnapshot = null;
  function askConflict() {
    // 比較用にローカルの現状を退避（merge 用）
    localSnapshot = Store.exportData().data;
    // confirm を2段で使い、3択を表現する
    const a = global.confirm(
      'この端末（ログイン前）の学習データと、クラウドに保存済みのデータの両方が見つかりました。\n\n' +
      '［OK］ 2つを統合する（おすすめ）\n' +
      '［キャンセル］ どちらか一方を選ぶ'
    );
    if (a) return 'merge';
    const b = global.confirm(
      'どちらのデータを優先しますか？\n\n' +
      '［OK］ クラウドのデータを使う（この端末の未ログイン分は破棄）\n' +
      '［キャンセル］ この端末のデータを使う（クラウドを上書き）'
    );
    return b ? 'cloud' : 'local';
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

  global.VFSync = VFSync;
})(window);
