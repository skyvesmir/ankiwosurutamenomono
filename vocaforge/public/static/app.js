/* VocaForge メインアプリ
 * 学習科学ガイド準拠の語彙トレーナー
 * - データ: words.json / phrases.json / etymology.json / meta.json
 * - 出題: mc-ej / mc-je / type-je（能動的想起の強制）
 * - スケジューリング: FSRS-4.5（分散学習・望ましい困難）
 */
(function () {
  'use strict';
  const app = document.getElementById('app');

  // 切り出し済みモジュール（このファイルより前に読み込まれる）
  //   app-data.js     … DATA / 正規化 / データセット切替
  //   app-router.js   … STATE / go / render / nav / 詳細モーダル / window.VF 公開
  //   app-settings.js … bindSettings
  const ns = (window.__VFApp = window.__VFApp || {});
  const DATA = ns.DATA;
  const STATE = ns.STATE;
  const render = ns.render;
  const loadFullWords = ns.loadFullWords;
  const loadLeapWords = ns.loadLeapWords;
  const loadFullPhrases = ns.loadFullPhrases;

  // ====== 起動 ======
  async function boot() {
    app.innerHTML = loadingHTML();
    try {
      const [w, p, e, m] = await Promise.all([
        fetch('/static/data/words_target.json').then(r => r.json()),
        fetch('/static/data/phrases_target.json').then(r => r.json()),
        fetch('/static/data/etymology.json').then(r => r.json()),
        fetch('/static/data/meta.json').then(r => r.json())
      ]);
      DATA.words = w; DATA.phrases = p; DATA.etym = e; DATA.meta = m;
      // 単語↔語源カードのリンク表（失敗しても続行：リンク非表示になるだけ）
      fetch('/static/data/etym_links.json').then(r => r.json())
        .then(l => { DATA.etymLinks = l; }).catch(() => {});
      // 全部バージョン選択中なら先にロード（失敗しても1900で続行）
      // 旧 'wf-' IDの進捗が残っている場合もロードしてIDマイグレーションを実行
      if (Store.getSettings().wordDataset === 'full' || Store.hasCardIdPrefix('wf-')) await loadFullWords();
      if (Store.getSettings().wordDataset === 'leap') await loadLeapWords();
      // 熟語全部バージョン選択中、または既に pf- の進捗がある場合はロード
      if (Store.getSettings().phraseDataset === 'full' || Store.hasCardIdPrefix('pf-')) await loadFullPhrases();
      render();
      // 認証状態が変化したら設定画面を更新
      if (window.VFAuth) window.VFAuth.onChange(() => {
        if (STATE.route === 'settings') render();
      });
      // クラウド同期ステータスが変化したら設定画面を更新
      if (window.VFSync) window.VFSync.onChange(() => {
        if (STATE.route === 'settings') render();
      });
    } catch (err) {
      app.innerHTML = '<div class="p-8 text-center text-red-400">データ読み込み失敗: ' + err.message + '</div>';
    }
  }

  function loadingHTML() {
    return '<div class="min-h-screen flex flex-col items-center justify-center gap-4">' +
      '<div class="text-3xl font-extrabold tracking-tight"><span class="text-brand">Voca</span>Forge</div>' +
      '<i class="fas fa-circle-notch fa-spin text-2xl text-brand"></i>' +
      '<p class="text-slate-400 text-sm">語彙データを読み込み中…</p></div>';
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
