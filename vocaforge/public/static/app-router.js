/* 画面遷移・描画・ナビ・カード詳細（app.js から切り出し／内容は無変更）
 * 注: window.VF の公開はこのファイルで行う。views.js / session*.js /
 *     flashcard.js は読み込み時に window.VF を捕捉するため、
 *     それらより前に実行される必要がある（app.js は最後に読み込まれる）。
 */
(function () {
  'use strict';
  const ns = (window.__VFApp = window.__VFApp || {});
  const app = document.getElementById('app');
  const DATA = ns.DATA;
  const wordSource = ns.wordSource;
  const phraseSource = ns.phraseSource;
  const deckCards = ns.deckCards;
  const catLabel = ns.catLabel;
  const wordSections = ns.wordSections;
  const useFullWords = ns.useFullWords;
  const loadFullWords = ns.loadFullWords;
  const loadLeapWords = ns.loadLeapWords;
  const useFullPhrases = ns.useFullPhrases;
  const loadFullPhrases = ns.loadFullPhrases;
  const etymCardsFor = ns.etymCardsFor;
  // 遅延解決ブリッジ: bindSettings は app-settings.js（後読み込み）で定義される
  function bindSettings() { return ns.bindSettings.apply(null, arguments); }

  const STATE = { route: 'home', session: null };

  // ====== ルーター ======
  function go(route, opts) { STATE.route = route; STATE.opts = opts || {}; render(); }
  window.__go = go;

  function render() {
    if (STATE.route === 'session') { return; } // セッションは自前描画
    if (STATE.route === 'home') app.innerHTML = renderHome();
    else if (STATE.route === 'decks') app.innerHTML = renderDecks(STATE.opts.deck);
    else if (STATE.route === 'stats') app.innerHTML = renderStats();
    else if (STATE.route === 'browse') app.innerHTML = renderBrowse(STATE.opts.deck);
    else if (STATE.route === 'settings') app.innerHTML = renderSettings();
    bindGlobal();
    window.scrollTo(0, 0);
  }

  // ナビ
  function nav(active) {
    const item = (id, icon, label) =>
      '<button data-nav="' + id + '" class="flex-1 flex flex-col items-center gap-1 py-2 ' +
      (active === id ? 'text-brand' : 'text-slate-400') + '">' +
      '<i class="fas ' + icon + ' text-lg"></i><span class="text-[10px] font-medium">' + label + '</span></button>';
    return '<nav class="fixed bottom-0 inset-x-0 z-40 bg-slate-900/95 backdrop-blur border-t border-slate-800 flex max-w-xl mx-auto">' +
      item('home', 'fa-house', 'ホーム') +
      item('decks', 'fa-layer-group', '学習') +
      item('browse', 'fa-list', '一覧') +
      item('stats', 'fa-chart-line', '統計') +
      item('settings', 'fa-gear', '設定') +
      '</nav>';
  }

  function bindGlobal() {
    document.querySelectorAll('[data-nav]').forEach(b => {
      b.onclick = () => {
        const t = b.getAttribute('data-nav');
        if (t === 'decks' || t === 'browse') go(t, { deck: 'words' });
        else go(t);
      };
    });
    document.querySelectorAll('[data-go]').forEach(b => {
      b.onclick = () => {
        const r = b.getAttribute('data-go');
        const d = b.getAttribute('data-deck');
        const g = b.getAttribute('data-group');
        if (r === 'session') { window.__startSession(d, g); return; }
        go(r, { deck: d, group: g });
      };
    });

    // フラッシュカードモード入口
    const fe = document.getElementById('flash-entry');
    if (fe) fe.onclick = () => window.__openFlash(window.__browseFilter.deck);

    // 一覧: タブ切替・検索・詳細
    document.querySelectorAll('[data-browse-tab]').forEach(b => {
      b.onclick = () => { window.__browseFilter.deck = b.getAttribute('data-browse-tab'); window.__browseFilter.q=''; go('browse', { deck: b.getAttribute('data-browse-tab') }); };
    });
    const bq = document.getElementById('browse-q');
    if (bq) {
      let t;
      bq.oninput = () => { clearTimeout(t); t = setTimeout(() => {
        window.__browseFilter.q = bq.value;
        window.__browseFilter.limit = window.__browsePage;
        const pos = bq.selectionStart;
        go('browse');
        const nb = document.getElementById('browse-q'); if (nb) { nb.focus(); nb.setSelectionRange(pos, pos); }
      }, 200); };
    }
    document.querySelectorAll('[data-detail]').forEach(b => {
      b.onclick = () => {
        const id = b.getAttribute('data-detail');
        const deck = b.getAttribute('data-deck');
        showDetail(id, deck);
      };
    });
    const bm = document.getElementById('browse-more');
    if (bm) bm.onclick = () => {
      const y = window.scrollY;
      window.__browseFilter.limit += window.__browsePage;
      go('browse');
      window.scrollTo(0, y);
    };

    // 設定操作
    bindSettings();
  }

  function showDetail(id, deck) {
    let card;
    if (deck === 'words') {
      card = wordSource().find(c => c.id === id);
      // 現在のデータセット外の単語（混同検出など）は全部DBから探す
      if (!card && DATA.wordsFull) {
        const w = DATA.wordsFull.find(x => x.id === id);
        if (w) card = normWordFull(w);
      }
    }
    else if (deck === 'phrases') {
      card = phraseSource().find(c => c.id === id);
      // 現在のデータセット外の熟語（混同検出など）は全部DBから探す
      if (!card && DATA.phrasesFull) {
        const p = DATA.phrasesFull.find(x => x.id === id);
        if (p) card = normPhraseFull(p);
      }
    }
    else { const e = DATA.etym.find(x => x.id === id); if (e) { window.__showEtymDetail(e); return; } }
    if (!card) return;
    const st = Store.getCard(id);
    const esc = window.__esc;
    // <br>を活かして複数品詞の改行を再現（エスケープ後に戻す）
    const br = s => esc(s).replace(/&lt;br&gt;/gi, '<br>');
    const stateLabel = !st || st.state === 'new' ? '未学習'
      : (st.stability >= 21 ? '成熟（記憶定着）' : '学習中');
    // 全部バージョン：CSVの列（発音記号・品詞・意味・補足・例文・例文訳）をそのまま表示
    const fullInfo = card.full ?
      ((card.ipa ? '<div class="text-sm text-slate-400 mt-1">' + br(card.ipa) + (card.pos ? ' <span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 ml-1">' + esc(card.pos) + '</span>' : '') + '</div>' : '') +
       '<div class="text-slate-300 mt-2 leading-relaxed">' + br(card.meaning) + '</div>' +
       (card.note ? '<div class="mt-3 bg-slate-800/50 rounded-xl p-3 text-xs text-slate-300 leading-relaxed"><div class="text-[10px] text-slate-500 mb-1"><i class="fas fa-circle-info mr-1"></i>補足</div>' + br(card.note) + '</div>' : '') +
       (card.example ? '<div class="mt-3 bg-slate-800/50 rounded-xl p-3 text-xs leading-relaxed"><div class="text-[10px] text-slate-500 mb-1"><i class="fas fa-quote-left mr-1"></i>例文</div>' +
         '<div class="text-slate-200">' + br(card.example) + '</div>' +
         (card.exampleJa ? '<div class="text-slate-400 mt-1.5">' + br(card.exampleJa) + '</div>' : '') + '</div>' : '') +
       (card.etym || etymCardsFor(card.id).length ? '<div class="mt-3 bg-slate-800/50 rounded-xl p-3 text-xs text-slate-300 leading-relaxed"><div class="text-[10px] text-slate-500 mb-1"><i class="fas fa-dna mr-1"></i>語源</div>' + (card.etym ? br(card.etym) : '') + etymLinkChips(card.id) + '</div>' : '') +
       (card.syn ? '<div class="mt-3 bg-slate-800/50 rounded-xl p-3 text-xs text-slate-300 leading-relaxed"><div class="text-[10px] text-slate-500 mb-1"><i class="fas fa-tags mr-1"></i>類義語グループ</div>' + br(card.syn) + '</div>' : ''))
      : '<div class="text-slate-300 mt-2">' + br(card.meaning) + '</div>';
    const html =
      '<div id="vf-modal" class="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center">' +
        '<div class="bg-slate-900 w-full max-w-xl rounded-t-3xl sm:rounded-3xl border border-slate-800 p-6 max-h-[85vh] overflow-y-auto">' +
          '<div class="flex justify-between items-start mb-3"><div class="min-w-0 flex-1">' +
            '<div class="text-2xl font-extrabold">' + esc(card.term) + '</div>' +
            fullInfo + '</div>' +
            '<button id="vf-close" class="text-slate-400 ml-3"><i class="fas fa-xmark text-xl"></i></button></div>' +
          '<div class="flex gap-2 text-xs mt-4 flex-wrap">' +
            '<span class="px-2 py-1 rounded-full bg-slate-800">' + stateLabel + '</span>' +
            (st && st.due ? '<span class="px-2 py-1 rounded-full bg-slate-800">次回: ' + new Date(st.due).toLocaleDateString('ja-JP') + '</span>' : '') +
            (st && st.lapses ? '<span class="px-2 py-1 rounded-full bg-rose-500/20 text-rose-300">間違い ' + st.lapses + '回</span>' : '') +
          '</div></div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
    document.getElementById('vf-close').onclick = () => document.getElementById('vf-modal').remove();
    document.getElementById('vf-modal').onclick = e => { if (e.target.id === 'vf-modal') document.getElementById('vf-modal').remove(); };
    bindEtymChips(document.getElementById('vf-modal'));
  }

  // 語源カードへのリンクチップ（タップで語源詳細モーダルを開く）
  function etymLinkChips(cardId) {
    const list = etymCardsFor(cardId);
    if (!list.length) return '';
    return '<div class="flex flex-wrap gap-1.5 mt-2">' + list.map(e =>
      '<button data-etym-link="' + esc2(e.id) + '" class="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 active:scale-95 transition">' +
        '<i class="fas fa-dna text-[9px]"></i>' + esc2((e.headword || '').split('（')[0]) +
        '<span class="font-normal opacity-80">' + esc2((e.core || '').slice(0, 8)) + '</span></button>').join('') + '</div>';
  }
  window.__etymLinkChips = etymLinkChips;
  function esc2(s){ return (s == null ? '' : String(s)).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
  // チップのクリックをバインド（root要素配下の [data-etym-link] 全て）
  function bindEtymChips(root) {
    if (!root) return;
    root.querySelectorAll('[data-etym-link]').forEach(b => {
      b.onclick = (ev) => {
        ev.stopPropagation();
        const e = DATA.etym.find(x => x.id === b.getAttribute('data-etym-link'));
        if (e && window.__showEtymDetail) window.__showEtymDetail(e);
      };
    });
  }
  window.__bindEtymChips = bindEtymChips;

  window.VF = { DATA, STATE, go, deckCards, catLabel, nav, wordSections, useFullWords, loadFullWords, loadLeapWords, useFullPhrases, loadFullPhrases, etymCardsFor };
  window.__showCardDetail = showDetail;

  ns.STATE = STATE;
  ns.go = go;
  ns.render = render;
  ns.nav = nav;
  ns.bindGlobal = bindGlobal;
  ns.showDetail = showDetail;
  ns.etymLinkChips = etymLinkChips;
  ns.bindEtymChips = bindEtymChips;
})();
