/* 統計・一覧・設定ビュー */
(function () {
  'use strict';
  const VF = window.VF;
  const esc = window.__esc;

  // ====== 統計 ======
  window.renderStats = function () {
    const allIds = [].concat(
      VF.deckCards('words').map(c => c.id),
      VF.deckCards('phrases').map(c => c.id),
      VF.deckCards('etym').map(c => c.id));
    const st = Store.stats(allIds);
    const hist = Store.getDailyHistory();

    // ====== 弱点単語一覧 ======
    // 全カードを共通形で集約し、学習状態と結合
    const allCards = [].concat(
      VF.deckCards('words'), VF.deckCards('phrases'), VF.deckCards('etym'));
    const states = Store.getAllCards();
    const deckJa = { words: '単語', phrases: '熟語', etym: '語源' };

    // 学習済みカードの共通情報を収集
    const learned = [];
    for (let i = 0; i < allCards.length; i++) {
      const c = allCards[i];
      const s = states[c.id];
      if (!s || s.state === 'new') continue;
      learned.push({
        term: c.term, meaning: c.meaning, deck: c.deck,
        lapses: s.lapses || 0,
        leech: !!s.is_leech,
        diff: s.difficulty || 0,
        stab: s.stability || 0,
        state: s.state,
      });
    }

    // 弱点行を描画する共通関数（右側の指標は render で切替）
    const weakRowsHtml = function (list, render) {
      return list.map((w, i) =>
        '<div class="flex items-center gap-3 py-2 ' + (i ? 'border-t border-slate-800' : '') + '">' +
          '<span class="text-xs text-slate-600 w-5 text-right shrink-0">' + (i + 1) + '</span>' +
          '<div class="min-w-0 flex-1">' +
            '<div class="font-bold text-sm truncate">' + esc(w.term) +
              (w.leech ? ' <span class="text-[9px] font-bold text-rose-400 bg-rose-500/10 rounded px-1 py-0.5 align-middle">リーチ</span>' : '') +
            '</div>' +
            '<div class="text-[11px] text-slate-400 truncate">' + esc(w.meaning) + '</div>' +
          '</div>' +
          '<div class="text-right shrink-0">' +
            render(w) +
            '<div class="text-[9px] text-slate-500">' + (deckJa[w.deck] || w.deck) + '</div>' +
          '</div>' +
        '</div>').join('');
    };
    const weakBox = function (title, sub, rows, empty) {
      return '<h2 class="text-sm font-bold text-slate-300 mb-2">' + title +
        ' <span class="text-[10px] text-slate-500 font-normal">' + sub + '</span></h2>' +
        (rows
          ? '<div class="bg-slate-900 border border-slate-800 rounded-xl p-3 mb-4">' + rows + '</div>'
          : '<div class="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-4 text-center text-xs text-slate-500">' +
            '<i class="fas fa-circle-check text-emerald-400 mr-1"></i>' + empty + '</div>');
    };

    // --- リスト1: FSRS状態による弱点（リーチ / 難易度が高い / 記憶が定着していない）---
    const fsrsWeak = learned.filter(w =>
      w.leech || w.diff >= 7 || w.stab < 21
    ).map(w => {
      // スコア: リーチ最優先 → 難易度が高い → 記憶が浅い(stabilityが低い)
      const score = (w.leech ? 100000 : 0) + w.diff * 1000 + (21 - Math.min(w.stab, 21)) * 10;
      return Object.assign({}, w, { score });
    });
    fsrsWeak.sort((a, b) => b.score - a.score);
    const fsrsTop = fsrsWeak.slice(0, 30);
    const fsrsRows = weakRowsHtml(fsrsTop, w => {
      const mature = w.stab >= 21;
      const label = mature ? '成熟' : '学習中';
      const days = w.stab >= 1 ? Math.round(w.stab) + '日' : '<1日';
      return '<div class="text-xs font-bold ' + (mature ? 'text-emerald-300' : 'text-sky-300') + '">' +
        '難' + w.diff.toFixed(1) + '<span class="text-[9px] text-slate-500 font-normal"> / ' + label + '</span></div>';
    });
    const fsrsSection = weakBox(
      '弱点単語一覧（FSRS状態）',
      '（リーチ・高難易度・記憶が浅い順・上位30）',
      fsrsRows,
      'FSRS状態で見た弱点カードはありません。記憶がよく定着しています！');

    // --- リスト2: ミス回数による弱点（間違えた回数が多い順）---
    const missWeak = learned.filter(w => w.lapses >= 1);
    missWeak.sort((a, b) => (b.lapses - a.lapses) || (b.diff - a.diff));
    const missTop = missWeak.slice(0, 30);
    const missRows = weakRowsHtml(missTop, w =>
      '<div class="text-xs font-bold text-rose-300">' + w.lapses +
        '<span class="text-[9px] text-slate-500 font-normal">回ミス</span></div>');
    const missSection = weakBox(
      '弱点単語一覧（ミス回数）',
      '（間違いが多い順・上位30）',
      missRows,
      'まだ間違えたカードはありません。この調子！');

    const weakSection = fsrsSection + missSection;

    // 直近14日バー
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = Store.todayStr(d.getTime());
      const rec = hist[key] || { new: 0, review: 0 };
      days.push({ key, label: (d.getMonth()+1) + '/' + d.getDate(), n: rec.new + rec.review });
    }
    const max = Math.max(1, ...days.map(d => d.n));
    const bars = days.map(d =>
      '<div class="flex flex-col items-center gap-1 flex-1">' +
      '<div class="w-full flex items-end justify-center" style="height:90px">' +
        '<div class="w-3/4 rounded-t ' + (d.n ? 'bg-brand' : 'bg-slate-800') + '" style="height:' + Math.max(4, d.n / max * 90) + 'px" title="' + d.n + '件"></div>' +
      '</div><span class="text-[8px] text-slate-500">' + d.label + '</span></div>').join('');

    const ring = (label, val, total, color) => {
      const pct = total ? Math.round(val / total * 100) : 0;
      return '<div class="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">' +
        '<div class="text-2xl font-extrabold ' + color + '">' + val + '</div>' +
        '<div class="text-[10px] text-slate-400">' + label + '</div>' +
        '<div class="mt-1 h-1 bg-slate-800 rounded-full overflow-hidden"><div class="h-full ' + color.replace('text-','bg-') + '" style="width:' + pct + '%"></div></div></div>';
    };

    return '<div class="max-w-xl mx-auto pb-24 px-4 pt-6">' +
      '<h1 class="text-xl font-extrabold mb-4">学習統計</h1>' +

      '<div class="grid grid-cols-3 gap-2 mb-4">' +
        '<div class="bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl p-3 text-center">' +
          '<div class="text-2xl font-extrabold">' + st.streak + '</div><div class="text-[10px] opacity-90">連続日数</div></div>' +
        '<div class="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">' +
          '<div class="text-2xl font-extrabold text-sky-300">' + (st.retention == null ? '—' : st.retention + '%') + '</div><div class="text-[10px] text-slate-400">直近保持率</div></div>' +
        '<div class="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">' +
          '<div class="text-2xl font-extrabold text-emerald-300">' + st.totalReviews + '</div><div class="text-[10px] text-slate-400">総復習回数</div></div>' +
      '</div>' +

      '<h2 class="text-sm font-bold text-slate-300 mb-2">学習量（直近14日）</h2>' +
      '<div class="bg-slate-900 border border-slate-800 rounded-xl p-3 mb-4"><div class="flex gap-0.5">' + bars + '</div></div>' +

      '<h2 class="text-sm font-bold text-slate-300 mb-2">記憶ステージ</h2>' +
      '<div class="grid grid-cols-2 gap-2 mb-4">' +
        ring('学習済み', st.learned, st.total, 'text-indigo-300') +
        ring('成熟(21日+)', st.nMature, st.total, 'text-emerald-300') +
        ring('復習中', st.nReview, st.total, 'text-sky-300') +
        ring('再学習', st.nLearning, st.total, 'text-amber-300') +
      '</div>' +

      (st.nLeech > 0 ? '<div class="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 mb-4 text-sm">' +
        '<i class="fas fa-triangle-exclamation text-rose-400 mr-2"></i>苦手カード（リーチ）が <b>' + st.nLeech + '</b> 件。' +
        '何度も間違えるカードです。意味を分割・言い換えると覚えやすくなります。</div>' : '') +

      weakSection +

      '<div class="text-xs text-slate-500 leading-relaxed bg-slate-900 border border-slate-800 rounded-xl p-3">' +
        '<i class="fas fa-circle-info mr-1"></i>本アプリは <b>FSRS-7</b> による分散学習と能動的想起を採用。' +
        'スラスラ解ける＝学べている、ではありません。忘れかけた頃の復習が最も記憶を強化します。</div>' +

      VF.nav('stats') + '</div>';
  };

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

  // ====== 設定 ======
  // クラウド同期ステータス表示
  function syncStatusHtml() {
    const sync = window.VFSync;
    if (!sync) return '';
    let icon, text, cls;
    switch (sync.status) {
      case 'syncing':
        icon = 'fa-cloud-arrow-up fa-fade'; text = 'クラウドと同期中…'; cls = 'text-sky-300'; break;
      case 'saved':
        icon = 'fa-cloud-check'; cls = 'text-emerald-300';
        text = 'クラウドに保存済み' + (sync.lastSavedAt ? '（' + new Date(sync.lastSavedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) + '）' : '');
        break;
      case 'error':
        icon = 'fa-cloud-exclamation'; text = '同期エラー: ' + (sync.lastError || '不明'); cls = 'text-rose-300'; break;
      default:
        icon = 'fa-cloud'; text = 'クラウド同期は自動で行われます'; cls = 'text-slate-400';
    }
    return '<div class="flex items-center gap-2 text-xs ' + cls + ' bg-slate-800/60 rounded-lg px-3 py-2 mb-3">' +
      '<i class="fas ' + icon + '"></i><span>' + text + '</span></div>';
  }

  window.renderSettings = function () {
    const s = Store.getSettings();
    const toggle = (id, label, checked, desc) =>
      '<label class="flex items-center justify-between py-3 cursor-pointer">' +
      '<span><span class="text-sm font-medium">' + label + '</span>' +
      (desc ? '<span class="block text-xs text-slate-400 mt-0.5">' + desc + '</span>' : '') + '</span>' +
      '<input type="checkbox" data-set="' + id + '" ' + (checked ? 'checked' : '') + ' class="w-11 h-6 appearance-none rounded-full bg-slate-700 checked:bg-brand relative transition cursor-pointer toggle"></label>';

    // ---- アカウント（Supabase認証）----
    const auth = window.VFAuth;
    const user = auth && auth.current ? auth.current() : null;
    let accountHtml;
    if (user) {
      const avatar = user.photo
        ? '<img src="' + esc(user.photo) + '" alt="" class="w-11 h-11 rounded-full" referrerpolicy="no-referrer">'
        : '<div class="w-11 h-11 rounded-full bg-brand/20 text-brand flex items-center justify-center"><i class="fas fa-user"></i></div>';
      accountHtml =
        '<div class="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-4">' +
          '<div class="flex items-center gap-3 mb-3">' + avatar +
            '<div class="min-w-0"><div class="text-sm font-bold truncate">' + esc(user.name || 'ユーザー') + '</div>' +
            '<div class="text-xs text-slate-400 truncate">' + esc(user.email || '') + '</div></div>' +
            '<i class="fas fa-circle-check text-emerald-400 ml-auto"></i>' +
          '</div>' +
          syncStatusHtml() +
          '<button id="logout-btn" class="w-full bg-slate-800 text-slate-300 border border-slate-700 rounded-xl py-2.5 text-sm font-bold">' +
            '<i class="fas fa-right-from-bracket mr-2"></i>ログアウト</button>' +
        '</div>';
    } else {
      accountHtml =
        '<div class="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-4">' +
          '<p class="text-xs text-slate-400 mb-3 leading-relaxed">Googleアカウントでログインすると、アカウントと紐づけて管理できます。</p>' +
          '<button id="login-btn" class="w-full bg-white text-slate-800 rounded-xl py-3 text-sm font-bold flex items-center justify-center gap-2">' +
            '<i class="fab fa-google text-[#4285F4]"></i>Googleでログイン</button>' +
        '</div>';
    }

    // ---- 外観テーマ ----
    const themeMode = (window.__themeMode && window.__themeMode()) || 'auto';
    const themeBtn = (mode, icon, label) =>
      '<button data-theme="' + mode + '" class="flex-1 flex flex-col items-center gap-1 py-3 rounded-xl border transition ' +
      (themeMode === mode
        ? 'bg-brand/15 border-brand/50 text-brand font-bold'
        : 'bg-slate-800 border-transparent text-slate-300') + '">' +
      '<i class="fas ' + icon + ' text-lg"></i><span class="text-xs">' + label + '</span></button>';
    const themeHtml =
      '<div class="bg-slate-900 border border-slate-800 rounded-xl p-3 mb-4 flex gap-2">' +
        themeBtn('light', 'fa-sun', 'ライト') +
        themeBtn('auto', 'fa-circle-half-stroke', '自動') +
        themeBtn('dark', 'fa-moon', 'ダーク') +
      '</div>';

    return '<div class="max-w-xl mx-auto pb-24 px-4 pt-6">' +
      '<h1 class="text-xl font-extrabold mb-4">設定</h1>' +

      '<h2 class="text-sm font-bold text-slate-300 mb-2">外観</h2>' +
      themeHtml +

      '<h2 class="text-sm font-bold text-slate-300 mb-2">単語データベース</h2>' +
      (function () {
        const ds = s.wordDataset || 'target1900';
        const opt = (mode, title, desc, count) =>
          '<button data-dataset="' + mode + '" class="w-full flex items-center gap-3 p-3 rounded-xl border text-left transition ' +
          (ds === mode ? 'bg-brand/15 border-brand/50' : 'bg-slate-800 border-transparent') + '">' +
            '<i class="fas ' + (ds === mode ? 'fa-circle-check text-brand' : 'fa-circle text-slate-600') + '"></i>' +
            '<span class="flex-1"><span class="text-sm font-bold block">' + title + '</span>' +
            '<span class="text-xs text-slate-400">' + desc + '</span></span>' +
            '<span class="text-xs font-bold text-slate-400">' + count + '</span>' +
          '</button>';
        return '<div class="bg-slate-900 border border-slate-800 rounded-xl p-3 mb-4 space-y-2">' +
          opt('target1900', 'ターゲット1900', '書籍と同じ並び・全19セクション（発音・品詞・例文つき）', '1900語') +
          opt('full', '全部バージョン', '新データベース全収録／全66セクション（発音・品詞・例文つき）', '6559語') +
          opt('leap', 'Leap', 'Leap収録語の並び・全23セクション（発音・品詞・例文つき）', '2297語') +
          '<p class="text-[11px] text-slate-500 leading-relaxed px-1">同じ単語の学習進捗はすべてのバージョンで共有されます。切替はいつでも可能です。</p>' +
        '</div>';
      })() +

      '<h2 class="text-sm font-bold text-slate-300 mb-2">熟語データベース</h2>' +
      (function () {
        const ds = s.phraseDataset || 'target1000';
        const opt = (mode, title, desc, count) =>
          '<button data-phrase-dataset="' + mode + '" class="w-full flex items-center gap-3 p-3 rounded-xl border text-left transition ' +
          (ds === mode ? 'bg-brand/15 border-brand/50' : 'bg-slate-800 border-transparent') + '">' +
            '<i class="fas ' + (ds === mode ? 'fa-circle-check text-brand' : 'fa-circle text-slate-600') + '"></i>' +
            '<span class="flex-1"><span class="text-sm font-bold block">' + title + '</span>' +
            '<span class="text-xs text-slate-400">' + desc + '</span></span>' +
            '<span class="text-xs font-bold text-slate-400">' + count + '</span>' +
          '</button>';
        return '<div class="bg-slate-900 border border-slate-800 rounded-xl p-3 mb-4 space-y-2">' +
          opt('target1000', 'ターゲット1000', '書籍と同じ並び・Part 1〜5構成（補足・例文つき）', '1000熟語') +
          opt('full', '全部バージョン', '新データベース全収録／意味カテゴリ別 全48セクション（補足・例文つき）', '3238熟語') +
          '<p class="text-[11px] text-slate-500 leading-relaxed px-1">同じ熟語の学習進捗は両バージョンで共有されます。切替はいつでも可能です。</p>' +
        '</div>';
      })() +

      '<h2 class="text-sm font-bold text-slate-300 mb-2">アカウント</h2>' +
      accountHtml +

      '<div class="bg-slate-900 border border-slate-800 rounded-xl px-4 mb-4 divide-y divide-slate-800">' +
        '<div class="py-3"><div class="text-sm font-medium mb-2">目標保持率 <span class="text-brand font-bold" id="rr-val">' + Math.round(s.requestRetention*100) + '%</span></div>' +
          '<input type="range" min="80" max="97" value="' + Math.round(s.requestRetention*100) + '" data-set="requestRetention" class="w-full accent-indigo-500">' +
          '<div class="text-xs text-slate-400 mt-1">高いほど復習頻度↑・記憶確実。低いほど効率重視。推奨90%。</div></div>' +
        '<div class="py-3"><div class="text-sm font-medium mb-2">1日の新規カード上限 <span class="text-brand font-bold" id="np-val">' + s.newPerDay + '</span></div>' +
          '<input type="range" min="5" max="80" step="5" value="' + s.newPerDay + '" data-set="newPerDay" class="w-full accent-indigo-500">' +
          '<div class="text-xs text-slate-400 mt-1">燃え尽き防止。毎日続けられるペースに（分散効果）。</div></div>' +
      '</div>' +

      '<h2 class="text-sm font-bold text-slate-300 mb-2">出題形式</h2>' +
      '<div class="bg-slate-900 border border-slate-800 rounded-xl px-4 mb-4 divide-y divide-slate-800">' +
        toggle('fmt-mc-ej', '選択：英 → 日', s.formats['mc-ej'], '英語を見て意味を選ぶ（認識）※新規カード用') +
        toggle('fmt-mc-je', '選択：日 → 英', s.formats['mc-je'], '日本語を見て英語を選ぶ ※新規カード用') +
        '<div class="py-3"><p class="text-[11px] text-slate-500 leading-relaxed">未学習カードは上記の選択式から出題され、復習カードは必ず記入式（日本語→英語タイプ）で出題されます（能動的想起の強制）。</p></div>' +
      '</div>' +

      '<h2 class="text-sm font-bold text-slate-300 mb-2">学習動作</h2>' +
      '<div class="bg-slate-900 border border-slate-800 rounded-xl px-4 mb-4 divide-y divide-slate-800">' +
        toggle('interleave', 'インターリービング', s.interleave, 'カテゴリを混ぜて出題（交互練習で識別力↑）') +
        toggle('strictInput', '記入を厳密採点', s.strictInput, 'OFFなら大小文字・記号の差を許容') +
      '</div>' +

      '<h2 class="text-sm font-bold text-slate-300 mb-2">アルゴリズムの個人最適化</h2>' +
      (function () {
        var st = window.FSRSOpt ? FSRSOpt.status() : null;
        if (!st) return '';
        var body;
        if (st.active) {
          var d = st.optimizedAt ? new Date(st.optimizedAt) : null;
          var dateStr = d ? (d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate()) : '';
          body = '<div class="flex items-center gap-2 mb-2"><i class="fas fa-circle-check text-emerald-400"></i>' +
            '<span class="text-sm font-bold text-emerald-300">個人パラメータ適用中</span></div>' +
            '<p class="text-xs text-slate-400 mb-3">' + dateStr + ' に ' + st.optimizedReviews + ' 件の履歴で最適化済み。' +
            (st.suggestReoptimize ? ' <span class="text-amber-300 font-bold">履歴が2倍になりました。再最適化を推奨します。</span>' : '') + '</p>';
        } else if (st.ready) {
          body = '<p class="text-xs text-slate-400 mb-3">復習履歴 ' + st.reviews + ' 件。あなたの記憶パターンに合わせてFSRS-7のパラメータを調整できます（ベンチマークでは約84%の学習者で予測精度が向上）。処理はこの端末内で完結します。</p>';
        } else {
          body = '<p class="text-xs text-slate-400 mb-3">復習履歴 ' + st.reviews + ' / ' + (window.FSRSOpt ? FSRSOpt.MIN_REVIEWS : 300) + ' 件。履歴がたまるとあなた専用のパラメータに最適化できます。まずは学習を続けましょう！</p>';
        }
        return '<div class="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-4">' + body +
          '<button id="fsrs-opt-btn" class="w-full bg-brand/10 text-brand border border-brand/30 rounded-xl py-3 text-sm font-bold' + (st.ready ? '' : ' opacity-40 pointer-events-none') + '">' +
            '<i class="fas fa-wand-magic-sparkles mr-2"></i>' + (st.active ? '再最適化する' : 'いますぐ最適化する') + '</button>' +
          (st.active ? '<button id="fsrs-opt-reset" class="w-full mt-2 text-slate-400 text-xs font-bold py-2">デフォルトパラメータに戻す</button>' : '') +
        '</div>';
      })() +

      '<h2 class="text-sm font-bold text-slate-300 mb-2">データの管理</h2>' +
      '<div class="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-4">' +
        '<p class="text-xs text-slate-400 mb-3 leading-relaxed">学習の進捗・記憶状態・統計をファイルに保存（エクスポート）し、別の端末やブラウザに引き継げます（インポート）。</p>' +
        '<button id="export-btn" class="w-full bg-brand/10 text-brand border border-brand/30 rounded-xl py-3 text-sm font-bold mb-2">' +
          '<i class="fas fa-file-export mr-2"></i>学習データをエクスポート</button>' +
        '<button id="import-btn" class="w-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 rounded-xl py-3 text-sm font-bold">' +
          '<i class="fas fa-file-import mr-2"></i>学習データをインポート</button>' +
        '<input type="file" id="import-file" accept="application/json,.json" class="hidden">' +
      '</div>' +

      '<button id="reset-btn" class="w-full bg-rose-500/10 text-rose-300 border border-rose-500/30 rounded-xl py-3 text-sm font-bold mb-3">' +
        '<i class="fas fa-trash mr-2"></i>学習データをすべてリセット</button>' +

      '<div class="text-xs text-slate-500 text-center leading-relaxed">VocaForge ・ 英単語1900 / 英熟語1000 / 語源590<br>FSRS-7（個人最適化対応）× 能動的想起 × 分散学習</div>' +
      VF.nav('settings') + '</div>';
  };
})();
