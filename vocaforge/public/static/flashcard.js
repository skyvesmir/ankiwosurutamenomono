/* フラッシュカードモード
 * - デッキ（単語/熟語/語源）とセクションを選択
 * - カードをめくって表⇄裏を確認（自己採点なしの自由閲覧）
 * - 表裏の向き（英→日 / 日→英）切替、シャッフル、苦手チェック
 * 学習科学ガイド: 想起を促すため、まず表で「思い出してから」裏を見る運用を推奨
 */
(function () {
  'use strict';
  const VF = window.VF;
  const esc = window.__esc;
  const app = document.getElementById('app');

  const FC = {
    deck: 'words',
    group: null,
    front: 'term',   // 'term'(英→日) or 'meaning'(日→英)
    cards: [],
    idx: 0,
    flipped: false,
    shuffled: false,
    starred: {}      // このセッション内の「あとで」マーク
  };

  // ====== セクション選択画面 ======
  function openPicker(deck) {
    FC.deck = deck || FC.deck;
    VF.STATE.route = 'flash-pick';
    app.innerHTML = renderPicker();
    bindPicker();
    window.scrollTo(0, 0);
  }
  window.__openFlash = openPicker;

  function groups(deck) {
    const m = VF.DATA.meta;
    if (deck === 'etym') {
      // 接頭辞・接尾辞・語根それぞれを意味（テーマ大分類）でグルーピング
      return (m.etym_groups || []).map(g => ({
        key: g.key, cat: g.category, label: g.theme,
        count: g.count, sub: VF.catLabel(g.category)
      }));
    }
    if (deck === 'phrases') {
      // 全部バージョン: 意味カテゴリ刅48セクション
      if (VF.useFullPhrases()) {
        return (m.phrase_full_sections || []).map(s => ({
          key: s.section, label: '#' + String(s.section).padStart(2, '0') + ' ' + s.title, count: s.count, sub: ''
        }));
      }
      return (m.phrase_parts || []).map(p => ({
        key: p.section, label: p.code + '：' + p.title, count: p.count, sub: p.range[0] + '–' + p.range[1]
      }));
    }
    // 単語・全部バージョン: 意味カテゴリ別セクション（名前付き・可変長）
    if (VF.useFullWords() && (m.word_full_sections || []).length) {
      return m.word_full_sections.map(s => ({
        key: s.section, label: s.title, count: s.count, sub: ''
      }));
    }
    const out = [];
    for (let i = 1; i <= VF.wordSections(); i++) {
      const arr = VF.deckCards('words', i);
      out.push({ key: i, label: 'Section ' + i, count: arr.length, sub: ((i-1)*100+1) + '–' + ((i-1)*100+arr.length) });
    }
    return out;
  }

  function renderPicker() {
    const tabs = [['words', '英単語'], ['phrases', '英熟語'], ['etym', '語源']];
    const tabBtn = tabs.map(([d, l]) =>
      '<button data-fc-tab="' + d + '" class="px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap ' +
      (d === FC.deck ? 'bg-amber-500 text-white' : 'bg-slate-800 text-slate-300') + '">' + l + '</button>').join('');

    const gs = groups(FC.deck);
    let lastCat = null;
    const list = gs.map(g => {
      let header = '';
      if (FC.deck === 'etym' && g.cat && g.cat !== lastCat) {
        lastCat = g.cat;
        header = '<div class="text-xs font-bold text-amber-300 mt-3 mb-1 px-1">' + esc(VF.catLabel(g.cat)) + '</div>';
      }
      return header +
      '<button data-fc-sec="' + g.key + '" class="w-full flex items-center gap-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl p-3.5 text-left active:scale-[0.99] transition">' +
        '<span class="w-9 h-9 rounded-lg bg-amber-500/15 text-amber-300 flex items-center justify-center"><i class="fas fa-clone"></i></span>' +
        '<div class="flex-1 min-w-0"><div class="font-semibold text-sm truncate">' + esc(g.label) + '</div>' +
        '<div class="text-xs text-slate-400">' + g.count + '枚' + (g.sub ? ' ・ ' + g.sub : '') + '</div></div>' +
        '<i class="fas fa-chevron-right text-slate-600"></i></button>';
    }).join('');

    return '<div class="max-w-xl mx-auto pb-24 px-4 pt-6">' +
      '<div class="flex items-center gap-3 mb-4">' +
        '<button id="fc-back" class="text-slate-400 hover:text-white"><i class="fas fa-arrow-left text-lg"></i></button>' +
        '<h1 class="text-xl font-extrabold"><i class="fas fa-clone text-amber-400 mr-1"></i>フラッシュカード</h1></div>' +
      '<p class="text-xs text-slate-400 mb-4">セクションを選ぶとカードをめくって学習できます。まず表で思い出してから裏を確認しましょう（能動的想起）。</p>' +
      '<div class="flex gap-2 overflow-x-auto pb-2 mb-3 no-scrollbar">' + tabBtn + '</div>' +
      '<button data-fc-sec="all" class="w-full mb-3 bg-amber-500/15 text-amber-200 border border-amber-500/30 font-bold rounded-xl py-3 active:scale-[0.99]">' +
        '<i class="fas fa-layer-group mr-2"></i>全セクションまとめて</button>' +
      '<div class="space-y-2">' + list + '</div>' +
      VF.nav('browse') + '</div>';
  }

  function bindPicker() {
    document.getElementById('fc-back').onclick = () => VF.go('browse', { deck: FC.deck });
    document.querySelectorAll('[data-fc-tab]').forEach(b => {
      b.onclick = () => openPicker(b.getAttribute('data-fc-tab'));
    });
    document.querySelectorAll('[data-fc-sec]').forEach(b => {
      b.onclick = () => startFlash(FC.deck, b.getAttribute('data-fc-sec'));
    });
    document.querySelectorAll('[data-nav]').forEach(b => {
      b.onclick = () => { const t = b.getAttribute('data-nav'); VF.go(t === 'decks' || t === 'browse' ? t : t, { deck: 'words' }); };
    });
  }

  // ====== フラッシュカード本体 ======
  function startFlash(deck, group) {
    FC.deck = deck;
    FC.group = group;
    FC.cards = VF.deckCards(deck, group === 'all' ? 'all' : group);
    FC.idx = 0;
    FC.flipped = false;
    FC.shuffled = false;
    FC.starred = {};
    // 語源は英→日（接辞→コア意味）をデフォルトに
    VF.STATE.route = 'flash';
    renderCard();
  }

  function currentLabel() {
    if (FC.deck === 'etym') {
      if (FC.group === 'all') return '全グループ';
      const c = FC.cards[FC.idx];
      return c ? (VF.catLabel(c.sub) + '・' + c.themeGroup) : FC.group;
    }
    const m = VF.DATA.meta;
    if (FC.group === 'all') return FC.deck === 'words' ? '全Section' : '全Part';
    if (FC.deck === 'phrases') {
      if (VF.useFullPhrases()) {
        const s = (m.phrase_full_sections || []).find(x => String(x.section) === String(FC.group));
        return s ? '#' + String(s.section).padStart(2, '0') + ' ' + s.title : '#' + FC.group;
      }
      const p = (m.phrase_parts || []).find(x => String(x.section) === String(FC.group));
      return p ? p.code : 'Part ' + FC.group;
    }
    if (VF.useFullWords()) {
      const s = (m.word_full_sections || []).find(x => String(x.section) === String(FC.group));
      if (s) return s.title;
    }
    return 'Section ' + FC.group;
  }

  function renderCard() {
    const total = FC.cards.length;
    if (total === 0) { app.innerHTML = '<div class="p-10 text-center text-slate-400">カードがありません</div>'; return; }
    const card = FC.cards[FC.idx];
    const st = Store.getCard(card.id);
    const learned = st && st.state !== 'new';

    const frontText = FC.front === 'term' ? card.term : card.meaning;
    const backText = FC.front === 'term' ? card.meaning : card.term;
    const frontBig = FC.front === 'term';

    const dirLabel = FC.front === 'term' ? '英 → 日' : '日 → 英';
    const star = FC.starred[card.id];

    const head =
      '<div class="sticky top-0 bg-slate-950/90 backdrop-blur z-10 px-4 pt-4 pb-2">' +
        '<div class="max-w-xl mx-auto flex items-center gap-3">' +
          '<button id="fc-exit" class="text-slate-400 hover:text-white"><i class="fas fa-xmark text-xl"></i></button>' +
          '<div class="flex-1"><div class="text-xs text-slate-400">' + esc(currentLabel()) + '</div>' +
            '<div class="h-1.5 mt-1 bg-slate-800 rounded-full overflow-hidden"><div class="h-full bg-amber-400 transition-all" style="width:' + Math.round((FC.idx+1)/total*100) + '%"></div></div></div>' +
          '<span class="text-xs text-slate-400 tabular-nums">' + (FC.idx+1) + '/' + total + '</span>' +
        '</div></div>';

    const toolbar =
      '<div class="flex items-center justify-center gap-2 mb-4">' +
        '<button id="fc-dir" class="text-xs px-3 py-1.5 rounded-full bg-slate-800 text-slate-200"><i class="fas fa-right-left mr-1"></i>' + dirLabel + '</button>' +
        '<button id="fc-shuffle" class="text-xs px-3 py-1.5 rounded-full ' + (FC.shuffled ? 'bg-amber-500/20 text-amber-200' : 'bg-slate-800 text-slate-200') + '"><i class="fas fa-shuffle mr-1"></i>シャッフル</button>' +
        '<button id="fc-star" class="text-xs px-3 py-1.5 rounded-full ' + (star ? 'bg-rose-500/20 text-rose-200' : 'bg-slate-800 text-slate-200') + '"><i class="fa' + (star ? 's' : 'r') + ' fa-star mr-1"></i>あとで</button>' +
      '</div>';

    // カード（タップでフリップ）
    const etymHint = (card.deck === 'etym' && card.etymRef && FC.flipped)
      ? '<div class="mt-3 text-xs text-amber-300/80">タップで詳細（派生語・覚え方）</div>' : '';
    // <br>を活かす（複数品詞の意味・例文）
    const br = s => esc(s).replace(/&lt;br&gt;/gi, '<br>');
    // 全部バージョンの裏面：発音・品詞・補足・例文で「精緻化（深い処理）」を促す
    // （学習科学ガイド：想起のあとに文脈・用例を与えると記憶の手がかりが増える）
    const fullBack = (FC.flipped && card.full) ?
      ((card.ipa ? '<div class="mt-2 text-sm text-slate-400">' + br(card.ipa) +
          (card.pos ? ' <span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 ml-1">' + esc(card.pos) + '</span>' : '') + '</div>' : '') +
       (card.example ? '<div class="mt-4 text-left bg-slate-800/50 rounded-xl p-3 text-xs leading-relaxed">' +
          '<div class="text-[10px] text-slate-500 mb-1"><i class="fas fa-quote-left mr-1"></i>例文</div>' +
          '<div class="text-slate-200">' + br(card.example) + '</div>' +
          (card.exampleJa ? '<div class="text-slate-400 mt-1.5">' + br(card.exampleJa) + '</div>' : '') + '</div>' : '') +
       (card.note ? '<div class="mt-2 text-left bg-slate-800/50 rounded-xl p-3 text-[11px] text-slate-300 leading-relaxed">' +
          '<div class="text-[10px] text-slate-500 mb-1"><i class="fas fa-circle-info mr-1"></i>補足</div>' + br(card.note) + '</div>' : ''))
      : '';
    const cardFace = !FC.flipped
      ? '<div class="text-center">' +
          '<div class="text-[11px] text-slate-500 mb-3 uppercase tracking-wider">' + (FC.front==='term'?'英語':'意味') + '</div>' +
          '<div class="' + (frontBig ? 'text-4xl' : 'text-2xl') + ' font-extrabold leading-snug">' + (FC.front==='term' ? esc(frontText) : br(frontText)) + '</div>' +
          '<div class="mt-6 text-xs text-slate-500"><i class="fas fa-hand-pointer mr-1"></i>タップして答えを見る</div></div>'
      : '<div class="text-center w-full">' +
          '<div class="text-[11px] text-slate-500 mb-2 uppercase tracking-wider">' + (FC.front==='term'?'意味':'英語') + '</div>' +
          '<div class="' + (!frontBig ? 'text-3xl font-extrabold' : 'text-xl font-bold') + ' leading-relaxed">' + (FC.front==='term' ? br(backText) : esc(backText)) + '</div>' +
          fullBack +
          '<div class="mt-4 pt-4 border-t border-slate-800 text-sm text-slate-400">' + (FC.front==='term' ? esc(frontText) : br(frontText)) + '</div>' +
          etymHint + '</div>';

    const cardBox =
      '<div id="fc-card" class="relative bg-slate-900 border-2 ' + (FC.flipped ? 'border-amber-500/40' : 'border-slate-800') + ' rounded-3xl px-6 min-h-[300px] max-h-[62vh] overflow-y-auto flex items-center justify-center cursor-pointer select-none active:scale-[0.99] transition" style="padding-top:2rem;padding-bottom:2rem">' +
        cardFace +
        (learned ? '<span class="absolute top-3 right-3 text-[10px] px-2 py-0.5 rounded-full ' + (st.stability>=21?'bg-emerald-500/20 text-emerald-300':'bg-sky-500/20 text-sky-300') + '">' + (st.stability>=21?'成熟':'学習中') + '</span>' : '') +
      '</div>';

    const controls =
      '<div class="flex items-center gap-3 mt-5">' +
        '<button id="fc-prev" class="flex-1 bg-slate-800 text-slate-200 font-bold rounded-xl py-3.5 disabled:opacity-30" ' + (FC.idx===0?'disabled':'') + '><i class="fas fa-chevron-left mr-1"></i>前</button>' +
        '<button id="fc-flip" class="flex-[1.4] bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl py-3.5">' + (FC.flipped ? '<i class="fas fa-rotate-left mr-1"></i>戻す' : '<i class="fas fa-sync-alt mr-1"></i>めくる') + '</button>' +
        '<button id="fc-next" class="flex-1 bg-slate-800 text-slate-200 font-bold rounded-xl py-3.5">' + (FC.idx===total-1?'完了':'次') + '<i class="fas fa-chevron-right ml-1"></i></button>' +
      '</div>' +
      '<div class="text-center text-[11px] text-slate-500 mt-3">← → キーで移動 ・ スペース/Enterでめくる</div>';

    app.innerHTML = head +
      '<div class="max-w-xl mx-auto px-4 pt-3 pb-10">' + toolbar + cardBox + controls + '</div>';
    bindCard(card);
  }

  function bindCard(card) {
    const total = FC.cards.length;
    const flip = () => { FC.flipped = !FC.flipped; renderCard(); };
    const next = () => {
      if (FC.idx < total - 1) { FC.idx++; FC.flipped = false; renderCard(); }
      else finishFlash();
    };
    const prev = () => { if (FC.idx > 0) { FC.idx--; FC.flipped = false; renderCard(); } };

    document.getElementById('fc-exit').onclick = exit;
    document.getElementById('fc-flip').onclick = flip;
    document.getElementById('fc-next').onclick = next;
    document.getElementById('fc-prev').onclick = prev;
    const fcCard = document.getElementById('fc-card');
    fcCard.onclick = () => {
      if (FC.flipped && card.deck === 'etym' && card.etymRef) { window.__showEtymDetail(card.etymRef); return; }
      flip();
    };
    document.getElementById('fc-dir').onclick = () => {
      FC.front = FC.front === 'term' ? 'meaning' : 'term'; FC.flipped = false; renderCard();
    };
    document.getElementById('fc-shuffle').onclick = () => {
      const cur = FC.cards[FC.idx];
      if (!FC.shuffled) { FC.cards = Quiz.shuffle(FC.cards); FC.shuffled = true; }
      else { FC.cards = VF.deckCards(FC.deck, FC.group === 'all' ? 'all' : FC.group); FC.shuffled = false; }
      FC.idx = 0; FC.flipped = false; renderCard();
    };
    document.getElementById('fc-star').onclick = () => {
      FC.starred[card.id] = !FC.starred[card.id]; renderCard();
    };

    // キーボード
    FC._key = (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
      else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); }
      else if (e.key === 'Escape') exit();
    };
    document.removeEventListener('keydown', FC._keyPrev || (()=>{}));
    document.addEventListener('keydown', FC._key);
    FC._keyPrev = FC._key;
  }

  function cleanupKey() { if (FC._key) document.removeEventListener('keydown', FC._key); }

  function exit() { cleanupKey(); openPicker(FC.deck); }

  function finishFlash() {
    cleanupKey();
    const starred = Object.keys(FC.starred).filter(k => FC.starred[k]).length;
    app.innerHTML =
      '<div class="max-w-xl mx-auto min-h-screen flex flex-col items-center justify-center px-6 text-center">' +
        '<div class="w-20 h-20 rounded-full bg-amber-500/20 flex items-center justify-center mb-5">' +
          '<i class="fas fa-clone text-3xl text-amber-400"></i></div>' +
        '<h1 class="text-2xl font-extrabold mb-1">ひと通り確認完了！</h1>' +
        '<p class="text-slate-400 text-sm mb-2">' + FC.cards.length + ' 枚を確認しました。</p>' +
        (starred ? '<p class="text-amber-300 text-sm mb-6"><i class="fas fa-star mr-1"></i>「あとで」マーク ' + starred + ' 枚</p>' : '<div class="mb-6"></div>') +
        '<button id="fc-quiz" class="w-full bg-brand hover:bg-brand-dark text-white font-bold rounded-xl py-3.5 mb-2"><i class="fas fa-pen mr-2"></i>このセクションをテストで定着</button>' +
        (starred ? '<button id="fc-review-star" class="w-full bg-amber-500/15 text-amber-200 border border-amber-500/30 font-bold rounded-xl py-3.5 mb-2">「あとで」だけもう一度</button>' : '') +
        '<button id="fc-again" class="w-full bg-slate-800 text-slate-200 font-bold rounded-xl py-3.5 mb-2">もう一度めくる</button>' +
        '<button id="fc-home" class="w-full text-slate-400 font-bold py-3">一覧へ戻る</button>' +
      '</div>';
    document.getElementById('fc-again').onclick = () => startFlash(FC.deck, FC.group);
    document.getElementById('fc-home').onclick = () => VF.go('browse', { deck: FC.deck });
    document.getElementById('fc-quiz').onclick = () => window.__startSession(FC.deck, FC.group);
    const rs = document.getElementById('fc-review-star');
    if (rs) rs.onclick = () => {
      FC.cards = FC.cards.filter(c => FC.starred[c.id]);
      FC.idx = 0; FC.flipped = false; FC.starred = {};
      VF.STATE.route = 'flash'; renderCard();
    };
  }
})();
