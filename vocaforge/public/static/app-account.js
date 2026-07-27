/* アカウント操作（app.js の bindSettings 内から切り出し／内容は無変更）
 * - ログイン
 * - ログアウト（未送信分のクラウド保存に失敗したら中止する）
 */
(function () {
  'use strict';
  const ns = (window.__VFApp = window.__VFApp || {});

  function bindAccount() {
    // ---- ログイン / ログアウト ----
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn && window.VFAuth) loginBtn.onclick = async () => {
      loginBtn.disabled = true;
      const res = await window.VFAuth.login();
      loginBtn.disabled = false;
      if (!res.ok && res.error !== 'auth/popup-closed-by-user' && res.error !== 'auth/cancelled-popup-request') {
        alert('ログインに失敗しました: ' + res.error);
      }
    };
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn && window.VFAuth) logoutBtn.onclick = async () => {
      // 何が起きるかを明示してから確認する
      const okToLogout = confirm(
        'ログアウトすると、この端末に保存されている学習データは削除されます。\n' +
        '（クラウドには保存済みなので、再ログインすれば戻ります）\n\n' +
        'ログアウトしますか？');
      if (!okToLogout) return;

      logoutBtn.disabled = true;
      // ログアウト後は Store.reset() でローカルデータが消えるため、
      // 先に未同期分をクラウドへ確実に保存する。
      // 保存に失敗した場合はログアウトを中止する（押し切る選択肢は用意しない）。
      if (window.VFSync && window.VFSync.flushBeforeLogout) {
        const r = await window.VFSync.flushBeforeLogout();
        if (!r.ok && !r.skipped) {
          alert(
            '未送信の学習データがあるためログアウトできません。\n' +
            '通信状態を確認してもう一度お試しください。');
          logoutBtn.disabled = false;
          return;
        }
      }
      await window.VFAuth.logout();
      logoutBtn.disabled = false;
    };
  }

  ns.bindAccount = bindAccount;
})();
