/* 一覧（ブラウズ）ビュー（views2.js から切り出し／内容は無変更） */
(function () {
  'use strict';
  const VF = window.VF;
  const esc = window.__esc;

  // ====== 一覧（ブラウズ） ======
  const BROWSE_PAGE = 100;
  let browseFilter = { deck: 'words', group: 'all', q: '', limit: BROWSE_PAGE };
  window.renderBrowse = function (deck) {
    if (deck) { browseFilter.deck = deck; browseFilter.limit = BROWSE_PAGE; }
    const d = browseFilter.deck;
    const tabs = [['words','英単語'],['phrases','英熟語'],['etym','語源']];
    const tabBtn = tabs.map(([k, l]) =>
      '<button data-browse-tab="' + k + '" class="px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap ' +
      (k === d ? 'bg-brand text-white' : 'bg-slate-800 text-slate-300') + '">' + l + '</button>').join('');

    let cards = VF.deckCards(d, 'all');
    const states = Store.getAllCards();
    const q = browseFilter.q.trim().toLowerCase();
    if (q) cards = cards.filter(c => c.term.toLowerCase().includes(q) || (c.meaning||'').toLowerCase().includes(q));
    const shown = cards.slice(0, browseFilter.limit);

    const rows = shown.map(c => {
      const s = states[c.id];
      const badge = !s || s.state === 'new'
        ? '<span class="text-[9px] text-slate-500">未</span>'
        : (s.stability >= 21 ? '<span class="text-[9px] text-emerald-400">成熟</span>'
          : '<span class="text-[9px] text-sky-400">学習中</span>');
      // 全部バージョン: 発音記号・品詞も1行に表示（<br>は行内では中黒に）
      const meta = c.full ?
        '<span class="text-[10px] text-slate-500 ml-1.5">' + esc((c.ipa || '').split('<br>')[0]) + '</span>' +
        (c.pos ? '<span class="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 ml-1">' + esc(c.pos) + '</span>' : '')
        : '';
      const meaning1 = (c.meaning || '').replace(/<br\s*\/?>/gi, ' ／ ');
      return '<button data-detail="' + c.id + '" data-deck="' + d + '" class="w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-slate-800 border-b border-slate-800/60">' +
        '<div class="flex-1 min-w-0"><div class="font-semibold text-sm truncate">' + esc(c.term) + meta + '</div>' +
        '<div class="text-xs text-slate-400 truncate">' + esc(meaning1) + '</div></div>' + badge + '</button>';
    }).join('');

    return '<div class="max-w-xl mx-auto pb-24 px-4 pt-6">' +
      '<h1 class="text-xl font-extrabold mb-3">語彙一覧</h1>' +
      // フラッシュカードモード入口
      '<button id="flash-entry" class="w-full mb-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-2xl py-3.5 px-4 flex items-center justify-between active:scale-[0.99] transition shadow-lg shadow-amber-900/30">' +
        '<span class="flex items-center gap-2"><i class="fas fa-clone text-lg"></i>フラッシュカードモード</span>' +
        '<span class="text-xs font-normal opacity-90">セクションを選んでめくる <i class="fas fa-chevron-right ml-1"></i></span>' +
      '</button>' +
      '<div class="flex gap-2 overflow-x-auto pb-2 mb-2 no-scrollbar">' + tabBtn + '</div>' +
      '<div class="relative mb-3"><i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm"></i>' +
      '<input id="browse-q" value="' + esc(browseFilter.q) + '" placeholder="検索（英語・日本語）" ' +
      'class="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-brand"></div>' +
      '<div class="text-xs text-slate-400 mb-2">' + cards.length + ' 件' + (cards.length > browseFilter.limit ? '（先頭' + browseFilter.limit + '件表示）' : '') + '</div>' +
      '<div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">' + (rows || '<div class="p-6 text-center text-slate-500 text-sm">該当なし</div>') + '</div>' +
      (cards.length > browseFilter.limit
        ? '<button id="browse-more" class="w-full mt-3 bg-slate-900 border border-slate-800 rounded-xl py-3 text-sm font-bold text-slate-300 active:scale-[0.99] transition">さらに' + Math.min(BROWSE_PAGE, cards.length - browseFilter.limit) + '件表示 <i class="fas fa-chevron-down ml-1"></i></button>'
        : '') +
      VF.nav('browse') + '</div>';
  };

  window.__browseFilter = browseFilter;
  window.__browsePage = BROWSE_PAGE;
})();
