/* VocaForge メインアプリ
 * 学習科学ガイド準拠の語彙トレーナー
 * - データ: words.json / phrases.json / etymology.json / meta.json
 * - 出題: mc-ej / mc-je / type-je（能動的想起の強制）
 * - スケジューリング: FSRS-4.5（分散学習・望ましい困難）
 */
(function () {
  'use strict';
  const $ = (sel, el) => (el || document).querySelector(sel);
  const app = document.getElementById('app');

  const DATA = { words: [], phrases: [], etym: [], meta: null };
  const STATE = { route: 'home', session: null };

  // ====== データ正規化 ======
  // すべてのカードを共通形 {id, term, meaning, hint, group, deck, sub} に変換
  function normWord(w) {
    return { id: w.id, term: w.term, meaning: w.meaning, deck: 'words',
      group: w.section, groupLabel: (w.sectionCode || ('Section ' + w.section)) };
  }
  function normPhrase(p) {
    return { id: p.id, term: p.term, meaning: p.meaning, deck: 'phrases',
      group: p.section, groupLabel: (p.sectionCode || ('Part ' + p.section)) +
        (p.sectionTitle ? '：' + p.sectionTitle : '') };
  }
  // 語源は「語源そのもの」を覚えるカードにする: 表=見出し, 裏=コアの意味
  function normEtym(e) {
    const head = (e.variants || e.headword || '').replace(/`/g,'');
    // 意味でグルーピング: group は「カテゴリ:テーマ大分類」の複合キー
    const tg = e.themeGroup || ((e.theme || '').split('＞')[0].trim()) || 'その他';
    const grp = e.group || (e.category + ':' + tg);
    return {
      id: e.id, term: head, meaning: e.core,
      deck: 'etym', sub: e.category, themeGroup: tg,
      group: grp, groupLabel: catLabel(e.category) + '・' + tg,
      etymRef: e
    };
  }
  function catLabel(c){ return c==='prefix'?'接頭辞':c==='suffix'?'接尾辞':'語根'; }

  function deckCards(deck, group) {
    let arr;
    if (deck === 'words') arr = DATA.words.map(normWord);
    else if (deck === 'phrases') arr = DATA.phrases.map(normPhrase);
    else arr = DATA.etym.filter(e => e.learnable).map(normEtym);
    if (group != null && group !== 'all') arr = arr.filter(c => String(c.group) === String(group));
    return arr;
  }

  // ====== 起動 ======
  async function boot() {
    app.innerHTML = loadingHTML();
    try {
      const [w, p, e, m] = await Promise.all([
        fetch('/static/data/words.json').then(r => r.json()),
        fetch('/static/data/phrases.json').then(r => r.json()),
        fetch('/static/data/etymology.json').then(r => r.json()),
        fetch('/static/data/meta.json').then(r => r.json())
      ]);
      DATA.words = w; DATA.phrases = p; DATA.etym = e; DATA.meta = m;
      render();
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

    // 設定操作
    bindSettings();
  }

  function showDetail(id, deck) {
    let card;
    if (deck === 'words') card = DATA.words.map(normWord).find(c => c.id === id);
    else if (deck === 'phrases') card = DATA.phrases.map(normPhrase).find(c => c.id === id);
    else { const e = DATA.etym.find(x => x.id === id); if (e) { window.__showEtymDetail(e); return; } }
    if (!card) return;
    const st = Store.getCard(id);
    const esc = window.__esc;
    const stateLabel = !st || st.state === 'new' ? '未学習'
      : (st.stability >= 21 ? '成熟（記憶定着）' : '学習中');
    const html =
      '<div id="vf-modal" class="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center">' +
        '<div class="bg-slate-900 w-full max-w-xl rounded-t-3xl sm:rounded-3xl border border-slate-800 p-6">' +
          '<div class="flex justify-between items-start mb-3"><div>' +
            '<div class="text-2xl font-extrabold">' + esc(card.term) + '</div>' +
            '<div class="text-slate-300 mt-2">' + esc(card.meaning) + '</div></div>' +
            '<button id="vf-close" class="text-slate-400"><i class="fas fa-xmark text-xl"></i></button></div>' +
          '<div class="flex gap-2 text-xs mt-4">' +
            '<span class="px-2 py-1 rounded-full bg-slate-800">' + stateLabel + '</span>' +
            (st && st.due ? '<span class="px-2 py-1 rounded-full bg-slate-800">次回: ' + new Date(st.due).toLocaleDateString('ja-JP') + '</span>' : '') +
            (st && st.lapses ? '<span class="px-2 py-1 rounded-full bg-rose-500/20 text-rose-300">間違い ' + st.lapses + '回</span>' : '') +
          '</div></div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
    document.getElementById('vf-close').onclick = () => document.getElementById('vf-modal').remove();
    document.getElementById('vf-modal').onclick = e => { if (e.target.id === 'vf-modal') document.getElementById('vf-modal').remove(); };
  }

  function bindSettings() {
    document.querySelectorAll('[data-set]').forEach(el => {
      const key = el.getAttribute('data-set');
      if (el.type === 'checkbox') {
        el.onchange = () => {
          if (key.startsWith('fmt-')) {
            const f = key.slice(4);
            const s = Store.getSettings();
            s.formats[f] = el.checked;
            // 全部OFFは禁止
            if (!Object.values(s.formats).some(Boolean)) { s.formats[f] = true; el.checked = true; alert('最低1つの出題形式が必要です'); }
            Store.setSettings({ formats: s.formats });
          } else {
            Store.setSettings({ [key]: el.checked });
          }
        };
      } else if (el.type === 'range') {
        el.oninput = () => {
          if (key === 'requestRetention') {
            document.getElementById('rr-val').textContent = el.value + '%';
            Store.setSettings({ requestRetention: parseInt(el.value, 10) / 100 });
          } else if (key === 'newPerDay') {
            document.getElementById('np-val').textContent = el.value;
            Store.setSettings({ newPerDay: parseInt(el.value, 10) });
          }
        };
      }
    });
    const rb = document.getElementById('reset-btn');
    if (rb) rb.onclick = () => {
      if (confirm('すべての学習進捗・統計を削除します。元に戻せません。よろしいですか？')) {
        Store.reset(); go('home');
      }
    };
  }

  // 後続スクリプトで拡張
  window.VF = { $, app, DATA, STATE, go, deckCards, normWord, normPhrase, normEtym, catLabel, nav, bindGlobal };

  document.addEventListener('DOMContentLoaded', boot);
})();
