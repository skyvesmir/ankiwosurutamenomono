/* 画面描画（ホーム/デッキ/一覧/統計/設定） */
(function () {
  'use strict';
  const VF = window.VF;
  const esc = s => (s == null ? '' : String(s)).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  window.__esc = esc;

  // ====== ホーム ======
  function dueCounts(deck, group) {
    const cards = VF.deckCards(deck, group);
    const now = Date.now();
    const states = Store.getAllCards();
    let due = 0, fresh = 0;
    cards.forEach(c => {
      const s = states[c.id];
      if (!s || s.state === 'new') fresh++;
      else if (s.due <= now) due++;
    });
    return { total: cards.length, due, fresh };
  }

  window.renderHome = function () {
    const m = VF.DATA.meta;
    const allIds = [].concat(
      VF.deckCards('words').map(c => c.id),
      VF.deckCards('phrases').map(c => c.id),
      VF.deckCards('etym').map(c => c.id)
    );
    const st = Store.stats(allIds);
    const wd = dueCounts('words'), pd = dueCounts('phrases'), ed = dueCounts('etym');
    const totalDue = wd.due + pd.due + ed.due;

    const card = (deck, title, icon, color, d) =>
      '<button data-go="decks" data-deck="' + deck + '" class="text-left bg-slate-900 hover:bg-slate-800 transition rounded-2xl p-4 border border-slate-800">' +
        '<div class="flex items-center justify-between mb-2">' +
          '<span class="w-9 h-9 rounded-xl flex items-center justify-center ' + color + '"><i class="fas ' + icon + '"></i></span>' +
          (d.due > 0 ? '<span class="text-xs font-bold bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded-full">復習 ' + d.due + '</span>' : '') +
        '</div>' +
        '<div class="font-bold">' + title + '</div>' +
        '<div class="text-xs text-slate-400 mt-1">' + d.total + '語 ・ 未学習 ' + d.fresh + '</div>' +
        '<div class="mt-2 h-1.5 bg-slate-800 rounded-full overflow-hidden"><div class="h-full bg-brand" style="width:' +
          (d.total ? Math.round((d.total - d.fresh) / d.total * 100) : 0) + '%"></div></div>' +
      '</button>';

    return '<div class="max-w-xl mx-auto pb-24 px-4 pt-6">' +
      '<header class="flex items-center justify-between mb-5">' +
        '<div><h1 class="text-2xl font-extrabold tracking-tight"><span class="text-brand">Voca</span>Forge</h1>' +
        '<p class="text-xs text-slate-400">英語語彙 超強化トレーナー</p></div>' +
        '<div class="text-right"><div class="text-2xl font-extrabold text-amber-400">' + st.streak + '<span class="text-sm">日</span></div>' +
        '<div class="text-[10px] text-slate-400">連続学習</div></div>' +
      '</header>' +

      // 今日のおすすめ
      '<div class="bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl p-5 mb-5 shadow-lg shadow-indigo-900/40">' +
        '<div class="flex items-center justify-between">' +
          '<div><div class="text-sm opacity-90">今日の学習</div>' +
          '<div class="text-3xl font-extrabold">復習 ' + totalDue + ' 件</div>' +
          '<div class="text-xs opacity-80 mt-1">能動的想起 × 分散学習で記憶を定着</div></div>' +
          '<i class="fas fa-bolt text-4xl opacity-30"></i>' +
        '</div>' +
        '<button data-go="session" data-deck="mix" data-group="due" class="mt-4 w-full bg-white text-indigo-700 font-bold rounded-xl py-3 active:scale-95 transition">' +
          (totalDue > 0 ? '<i class="fas fa-play mr-2"></i>復習を開始' : '<i class="fas fa-plus mr-2"></i>新規学習を開始') + '</button>' +
      '</div>' +

      // サマリ
      '<div class="grid grid-cols-3 gap-2 mb-5 text-center">' +
        miniStat('学習済み', st.learned + '/' + st.total, 'fa-book') +
        miniStat('定着(成熟)', st.nMature, 'fa-seedling') +
        miniStat('保持率', st.retention == null ? '—' : st.retention + '%', 'fa-bullseye') +
      '</div>' +

      '<h2 class="text-sm font-bold text-slate-300 mb-2">デッキ</h2>' +
      '<div class="grid grid-cols-2 gap-3">' +
        card('words', '英単語', 'fa-font', 'bg-indigo-500/20 text-indigo-300', wd) +
        card('phrases', '英熟語', 'fa-quote-right', 'bg-emerald-500/20 text-emerald-300', pd) +
        card('etym', '語源（接辞・語根）', 'fa-dna', 'bg-amber-500/20 text-amber-300', ed) +
        '<button data-go="stats" class="text-left bg-slate-900 hover:bg-slate-800 transition rounded-2xl p-4 border border-slate-800">' +
          '<span class="w-9 h-9 rounded-xl flex items-center justify-center bg-sky-500/20 text-sky-300 mb-2"><i class="fas fa-chart-line"></i></span>' +
          '<div class="font-bold">学習統計</div><div class="text-xs text-slate-400 mt-1">進捗・保持率を確認</div></button>' +
      '</div>' +
      VF.nav('home') + '</div>';
  };

  function miniStat(label, val, icon) {
    return '<div class="bg-slate-900 border border-slate-800 rounded-xl py-3">' +
      '<i class="fas ' + icon + ' text-slate-500 text-xs"></i>' +
      '<div class="text-lg font-extrabold mt-0.5">' + val + '</div>' +
      '<div class="text-[10px] text-slate-400">' + label + '</div></div>';
  }

  // ====== デッキ選択（セクション一覧） ======
  window.renderDecks = function (deck) {
    deck = deck || 'words';
    const tabs = [['words','英単語'],['phrases','英熟語'],['etym','語源']];
    const groups = deckGroups(deck);

    const tabBtn = tabs.map(([d, l]) =>
      '<button data-go="decks" data-deck="' + d + '" class="px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap ' +
      (d === deck ? 'bg-brand text-white' : 'bg-slate-800 text-slate-300') + '">' + l + '</button>').join('');

    const list = groups.map(g => {
      const d = sectionDue(deck, g.key);
      return '<button data-go="session" data-deck="' + deck + '" data-group="' + g.key + '" ' +
        'class="w-full flex items-center gap-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl p-3 text-left">' +
        '<div class="flex-1"><div class="font-semibold text-sm">' + esc(g.label) + '</div>' +
        '<div class="text-xs text-slate-400 mt-0.5">' + g.count + '語 ・ 未学習 ' + d.fresh +
          (d.due > 0 ? ' ・ <span class="text-rose-300">復習 ' + d.due + '</span>' : '') + '</div>' +
        '<div class="mt-1.5 h-1 bg-slate-800 rounded-full overflow-hidden"><div class="h-full bg-brand" style="width:' +
          (g.count ? Math.round((g.count - d.fresh) / g.count * 100) : 0) + '%"></div></div></div>' +
        '<i class="fas fa-chevron-right text-slate-600"></i></button>';
    }).join('');

    return '<div class="max-w-xl mx-auto pb-24 px-4 pt-6">' +
      '<h1 class="text-xl font-extrabold mb-3">学習する</h1>' +
      '<div class="flex gap-2 overflow-x-auto pb-2 mb-3 no-scrollbar">' + tabBtn + '</div>' +
      '<button data-go="session" data-deck="' + deck + '" data-group="all" class="w-full bg-brand hover:bg-brand-dark text-white font-bold rounded-xl py-3 mb-3 active:scale-95 transition">' +
        '<i class="fas fa-shuffle mr-2"></i>全体からおまかせ出題</button>' +
      '<div class="space-y-2">' + list + '</div>' +
      VF.nav('decks') + '</div>';
  };

  function deckGroups(deck) {
    if (deck === 'etym') {
      return ['prefix','suffix','root'].map(c => {
        const arr = VF.deckCards('etym', c);
        return { key: c, label: VF.catLabel(c), count: arr.length };
      });
    }
    const m = VF.DATA.meta;
    if (deck === 'phrases') {
      // 英熟語ターゲット1000 公式パート構成に準拠
      return (m.phrase_parts || []).map(p => ({
        key: p.section,
        label: p.code + '：' + p.title + '（' + p.range[0] + '–' + p.range[1] + '）',
        count: p.count
      }));
    }
    const n = m.word_sections;
    const out = [];
    for (let i = 1; i <= n; i++) {
      const arr = VF.deckCards(deck, i);
      const lbl = 'Section ' + i + '（' + ((i-1)*100+1) + '–' + ((i-1)*100+arr.length) + '）';
      out.push({ key: i, label: lbl, count: arr.length });
    }
    return out;
  }

  function sectionDue(deck, group) {
    const cards = VF.deckCards(deck, group);
    const now = Date.now();
    const states = Store.getAllCards();
    let due = 0, fresh = 0;
    cards.forEach(c => {
      const s = states[c.id];
      if (!s || s.state === 'new') fresh++;
      else if (s.due <= now) due++;
    });
    return { due, fresh };
  }
  window.__sectionDue = sectionDue;
})();
