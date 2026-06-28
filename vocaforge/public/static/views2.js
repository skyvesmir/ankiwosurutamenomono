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

      '<div class="text-xs text-slate-500 leading-relaxed bg-slate-900 border border-slate-800 rounded-xl p-3">' +
        '<i class="fas fa-circle-info mr-1"></i>本アプリは <b>FSRS-4.5</b> による分散学習と能動的想起を採用。' +
        'スラスラ解ける＝学べている、ではありません。忘れかけた頃の復習が最も記憶を強化します。</div>' +

      VF.nav('stats') + '</div>';
  };

  // ====== 一覧（ブラウズ） ======
  let browseFilter = { deck: 'words', group: 'all', q: '' };
  window.renderBrowse = function (deck) {
    if (deck) browseFilter.deck = deck;
    const d = browseFilter.deck;
    const tabs = [['words','英単語'],['phrases','英熟語'],['etym','語源']];
    const tabBtn = tabs.map(([k, l]) =>
      '<button data-browse-tab="' + k + '" class="px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap ' +
      (k === d ? 'bg-brand text-white' : 'bg-slate-800 text-slate-300') + '">' + l + '</button>').join('');

    let cards = VF.deckCards(d, 'all');
    const states = Store.getAllCards();
    const q = browseFilter.q.trim().toLowerCase();
    if (q) cards = cards.filter(c => c.term.toLowerCase().includes(q) || (c.meaning||'').toLowerCase().includes(q));
    const shown = cards.slice(0, 300);

    const rows = shown.map(c => {
      const s = states[c.id];
      const badge = !s || s.state === 'new'
        ? '<span class="text-[9px] text-slate-500">未</span>'
        : (s.stability >= 21 ? '<span class="text-[9px] text-emerald-400">成熟</span>'
          : '<span class="text-[9px] text-sky-400">学習中</span>');
      return '<button data-detail="' + c.id + '" data-deck="' + d + '" class="w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-slate-800 border-b border-slate-800/60">' +
        '<div class="flex-1 min-w-0"><div class="font-semibold text-sm truncate">' + esc(c.term) + '</div>' +
        '<div class="text-xs text-slate-400 truncate">' + esc(c.meaning) + '</div></div>' + badge + '</button>';
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
      '<div class="text-xs text-slate-400 mb-2">' + cards.length + ' 件' + (cards.length > 300 ? '（先頭300件表示）' : '') + '</div>' +
      '<div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">' + (rows || '<div class="p-6 text-center text-slate-500 text-sm">該当なし</div>') + '</div>' +
      VF.nav('browse') + '</div>';
  };

  window.__browseFilter = browseFilter;

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

    // ---- アカウント（Firebase認証）----
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

    return '<div class="max-w-xl mx-auto pb-24 px-4 pt-6">' +
      '<h1 class="text-xl font-extrabold mb-4">設定</h1>' +

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
        toggle('fmt-mc-ej', '選択：英 → 日', s.formats['mc-ej'], '英語を見て意味を選ぶ（認識）') +
        toggle('fmt-mc-je', '選択：日 → 英', s.formats['mc-je'], '日本語を見て英語を選ぶ') +
        toggle('fmt-type-je', '記入：日 → 英', s.formats['type-je'], '日本語を見て英語をタイプ（最強の想起）') +
      '</div>' +

      '<h2 class="text-sm font-bold text-slate-300 mb-2">学習動作</h2>' +
      '<div class="bg-slate-900 border border-slate-800 rounded-xl px-4 mb-4 divide-y divide-slate-800">' +
        toggle('interleave', 'インターリービング', s.interleave, 'カテゴリを混ぜて出題（交互練習で識別力↑）') +
        toggle('strictInput', '記入を厳密採点', s.strictInput, 'OFFなら大小文字・記号の差を許容') +
      '</div>' +

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

      '<div class="text-xs text-slate-500 text-center leading-relaxed">VocaForge ・ 英単語1900 / 英熟語1000 / 語源590<br>FSRS-4.5 × 能動的想起 × 分散学習</div>' +
      VF.nav('settings') + '</div>';
  };
})();
