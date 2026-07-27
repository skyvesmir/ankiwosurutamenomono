/* 統計ビュー（views2.js から切り出し／内容は無変更） */
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

    // 弱点集中モードの起動ボタン（弱点があるときだけ表示）
    const weakDrillBtn = (window.__weakCount && window.__weakCount() > 0)
      ? '<button data-go="session" data-deck="weak" class="w-full bg-rose-500/15 text-rose-200 border border-rose-500/40 rounded-xl py-3 text-sm font-bold mb-4 active:scale-[0.99] transition">' +
          '<i class="fas fa-dumbbell mr-2"></i>弱点集中モードでドリルする（' + window.__weakCount() + '語）</button>'
      : '';

    const weakSection = weakDrillBtn + fsrsSection + missSection;

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
})();
