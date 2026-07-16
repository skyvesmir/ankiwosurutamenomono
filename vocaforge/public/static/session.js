/* 学習セッション本体
 * - キュー生成（復習優先 + 新規上限）
 * - 出題（mc-ej/mc-je/type-je をカードごとに選択）
 * - 採点 → FSRS更新 → ログ保存 → リーチ検出
 */
(function () {
  'use strict';
  const VF = window.VF;
  const esc = window.__esc;
  // <br>を活かす（全部バージョンの複数品詞意味「【名】…<br>【動】…」用）
  const br = s => esc(s).replace(/&lt;br&gt;/gi, '<br>');
  const app = document.getElementById('app');

  // 復習が残っているか（全デッキ横断）。新規学習の解禁判定に使う。
  function hasGlobalDueReviews(now) {
    now = now || Date.now();
    const states = Store.getAllCards();
    const all = [].concat(VF.deckCards('words'), VF.deckCards('phrases'), VF.deckCards('etym'));
    for (let i = 0; i < all.length; i++) {
      const s = states[all[i].id];
      if (s && s.state !== 'new' && s.due <= now) return true;
    }
    return false;
  }
  window.__hasGlobalDueReviews = hasGlobalDueReviews;

  function buildQueue(deck, group) {
    const settings = Store.getSettings();
    const now = Date.now();
    const states = Store.getAllCards();
    const daily = Store.getDaily(now);

    // 対象カードプール
    let pool;
    if (deck === 'mix') {
      pool = [].concat(VF.deckCards('words'), VF.deckCards('phrases'), VF.deckCards('etym'));
    } else {
      pool = VF.deckCards(deck, group);
    }

    const due = [], fresh = [];
    pool.forEach(c => {
      const s = states[c.id];
      if (!s || s.state === 'new') fresh.push(c);
      else if (s.due <= now) due.push(c);
    });

    // 復習の並び: Retrievability降順（想起確率が高い順）
    // Anki公式シミュレーション（forums.ankiweb.net "Improving sort orders"）で、
    // 同じ保持率を最少の学習時間で維持できる最良の並びと結論づけられた方式。
    // 想起確率が高いうちに復習するほど1回あたりの成功率が高く、
    // 失敗→再学習のコストを最小化できる（バックログ時に特に有効）。
    const rNow = {};
    due.forEach(c => {
      const st = states[c.id];
      const elapsed = st.last_review ? Math.max(0, (now - st.last_review) / 86400000) : 0;
      rNow[c.id] = FSRS.retrievability(elapsed, st.stability || 0.001);
    });
    due.sort((a, b) => rNow[b.id] - rNow[a.id]);

    let revAllowed = Math.max(0, settings.reviewPerDay - daily.review);
    const dueQueue = due.slice(0, revAllowed);

    // 復習専用モード: ①ホームの「復習を開始」(group==='due') か ②復習がまだ残っている間は新規を出さない
    const reviewOnly = (group === 'due');

    // 新規学習は「復習が終わってから」解禁する。
    //  - この対象プール内に未消化の復習があるうちは新規を出さない
    //  - 全デッキで見ても復習が残っていれば新規は出さない（復習優先の徹底）
    let queue;
    if (reviewOnly) {
      queue = dueQueue; // 復習だけ
    } else if (dueQueue.length > 0 || hasGlobalDueReviews(now)) {
      // まだ復習が残っている → 復習を優先し、新規は出さない
      queue = dueQueue;
    } else {
      // 復習が片付いた → ここで初めて新規を解禁
      let newAllowed = Math.max(0, settings.newPerDay - daily.new);
      if (group && group !== 'due' && group !== 'all' && deck !== 'mix') {
        // 特定セクションを明示選択した場合は上限を緩める（学習意欲尊重）
        newAllowed = Math.max(newAllowed, 50);
      }
      queue = fresh.slice(0, newAllowed);
    }

    // 何も無ければ（=その日完了）フォールバック
    if (queue.length === 0 && !reviewOnly) {
      // 復習が無く新規も上限に達した → 全体から期限近い順に少し出す
      queue = pool.map(c => ({ c, due: (states[c.id] ? states[c.id].due : Infinity) }))
        .sort((a, b) => a.due - b.due).slice(0, 20).map(x => x.c);
    }

    if (settings.interleave) queue = Quiz.shuffle(queue);
    // プール（誤答生成用）は形式別に十分な数が要る
    return { queue, pool, settings, reviewOnly, dueTotal: due.length };
  }

  // 出題形式の選択ルール:
  //  - 未学習（new）: まだ答えを知らないので必ず「記入以外」（選択式）で出す
  //  - 復習（learning/review）: 能動的想起を強制するため必ず「記入式」で出す
  function pickFormat(settings, isReview) {
    if (isReview) return 'type-je';
    const enabled = Object.keys(settings.formats)
      .filter(k => settings.formats[k] && k !== 'type-je');
    if (enabled.length === 0) return 'mc-ej'; // 記入のみ有効でも新規は選択式にフォールバック
    return enabled[Math.floor(Math.random() * enabled.length)];
  }

  function start(deck, group) {
    const { queue, pool, settings, reviewOnly } = buildQueue(deck, group);
    if (queue.length === 0) {
      app.innerHTML = emptyState(reviewOnly);
      bindBack();
      return;
    }
    VF.STATE.route = 'session';
    VF.STATE.session = {
      deck, group, pool, settings,
      queue, idx: 0, total: queue.length,
      correct: 0, answered: 0, startTs: Date.now(),
      reAdd: [],
      againIds: {} // Again を選んだカードID → 再出題時は必ず記入式(type-je)
    };
    nextCard();
  }
  window.__startSession = start;

  function nextCard() {
    const s = VF.STATE.session;
    if (s.idx >= s.queue.length) {
      // 当日再出題（Again）を末尾に回収
      if (s.reAdd.length) { s.queue = s.queue.concat(s.reAdd); s.reAdd = []; }
      if (s.idx >= s.queue.length) return finish();
    }
    const card = s.queue[s.idx];
    // 未学習 or 復習かで形式を決定。Again再出題も必ず記入式。
    const cardState = Store.getCard(card.id);
    const isReview = !!(cardState && cardState.state && cardState.state !== 'new');
    const format = (s.againIds && s.againIds[card.id]) ? 'type-je' : pickFormat(s.settings, isReview);
    // プールは同deck内（mixは同サブグループ寄せ）
    let pool = s.pool;
    if (card.deck) pool = s.pool.filter(p => p.deck === card.deck);
    if (pool.length < 4) pool = s.pool;
    const q = Quiz.makeQuestion(card, format, pool);
    s.current = { card, q, shownAt: Date.now() };
    renderQuestion(q, card);
  }

  // ====== 出題描画 ======
  function renderQuestion(q, card) {
    const s = VF.STATE.session;
    const progress = Math.round(s.idx / s.total * 100);
    const head =
      '<div class="sticky top-0 bg-slate-950/90 backdrop-blur z-10 px-4 pt-4 pb-2">' +
        '<div class="max-w-xl mx-auto flex items-center gap-3">' +
          '<button id="sess-quit" class="text-slate-400 hover:text-white"><i class="fas fa-xmark text-xl"></i></button>' +
          '<div class="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden"><div class="h-full bg-brand transition-all" style="width:' + progress + '%"></div></div>' +
          '<span class="text-xs text-slate-400 tabular-nums">' + Math.min(s.idx+1, s.total) + '/' + s.total + '</span>' +
        '</div></div>';

    const tag = card.deck === 'words' ? '英単語' : card.deck === 'phrases' ? '英熟語' : (VF.catLabel(card.sub) + '・' + (card.themeGroup || ''));
    const tagIcon = card.deck === 'words' ? 'fa-font' : card.deck === 'phrases' ? 'fa-link' : 'fa-tag';
    const tagColor = card.deck === 'words' ? 'bg-sky-500/20 text-sky-300 border-sky-500/40' : card.deck === 'phrases' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40';
    const fmtBadge = '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">' + q.questionLabel + '</span>';
    // 英単語/英熟語タグ：問題文の直下に大きめに表示（わかりやすく）
    const deckBadge = '<div class="flex justify-center mt-3"><span class="inline-flex items-center gap-1.5 text-sm font-bold px-3.5 py-1 rounded-full border ' + tagColor + '"><i class="fas ' + tagIcon + ' text-xs"></i>' + tag + '</span></div>';

    let body;
    if (q.format === 'type-je') {
      body =
        '<div class="text-center mb-6"><div class="text-xs text-slate-400 mb-2">この意味の英語は？</div>' +
        '<div class="text-2xl font-bold leading-relaxed">' + br(q.prompt) + '</div>' +
        (q.sub ? '<div class="text-xs text-slate-400 mt-2"><i class="fas fa-lightbulb mr-1"></i>' + esc(q.sub) + '</div>' : '') +
        deckBadge +
        '</div>' +
        '<input id="type-input" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" ' +
        'placeholder="英語を入力…" class="w-full bg-slate-900 border-2 border-slate-700 focus:border-brand rounded-xl px-4 py-4 text-lg text-center focus:outline-none">' +
        '<button id="type-submit" class="mt-4 w-full bg-brand hover:bg-brand-dark text-white font-bold rounded-xl py-3.5 active:scale-95 transition">解答する</button>' +
        '<button id="type-dontknow" class="mt-2 w-full text-slate-400 text-sm py-2">わからない</button>';
    } else {
      const promptBig = q.format === 'mc-ej'
        ? '<div class="text-3xl font-extrabold">' + esc(q.prompt) + '</div>'
        : '<div class="text-2xl font-bold leading-relaxed">' + esc(q.prompt) + '</div>';
      const opts = q.options.map((o, i) =>
        '<button data-opt="' + i + '" class="opt w-full text-left bg-slate-900 hover:bg-slate-800 border-2 border-slate-800 rounded-xl px-4 py-3.5 font-medium transition active:scale-[0.99]">' +
        '<span class="text-slate-500 mr-2">' + 'ABCD'[i] + '.</span>' + esc(o.t) + '</button>').join('');
      body =
        '<div class="text-center mb-6"><div class="text-xs text-slate-400 mb-2">' +
          (q.format === 'mc-ej' ? 'この英語の意味は？' : 'この意味の英語は？') + '</div>' + promptBig + deckBadge + '</div>' +
        '<div class="space-y-2.5">' + opts + '</div>';
    }

    app.innerHTML = head +
      '<div class="max-w-xl mx-auto px-4 pt-4 pb-8">' +
        '<div class="flex items-center gap-2 justify-center mb-5">' + fmtBadge + '</div>' +
        body +
        '<div id="feedback"></div>' +
      '</div>';

    bindQuestion(q, card);
  }

  function bindQuestion(q, card) {
    $('#sess-quit').onclick = quit;
    if (q.format === 'type-je') {
      const input = $('#type-input');
      input.focus();
      const submit = () => {
        const val = input.value;
        if (!val.trim()) { input.focus(); return; }
        const ok = Quiz.gradeTyped(val, q);
        revealTyped(q, card, ok, val);
      };
      $('#type-submit').onclick = submit;
      input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
      $('#type-dontknow').onclick = () => revealTyped(q, card, false, '');
    } else {
      document.querySelectorAll('.opt').forEach((b, i) => {
        b.onclick = () => revealMC(q, card, i);
      });
    }
  }

  // ====== 採点・フィードバック（選択） ======
  function revealMC(q, card, chosenIdx) {
    const chosen = q.options[chosenIdx];
    const correct = chosen.correct;
    document.querySelectorAll('.opt').forEach((b, i) => {
      b.disabled = true;
      const o = q.options[i];
      if (o.correct) b.className = 'opt w-full text-left bg-emerald-500/15 border-2 border-emerald-500 rounded-xl px-4 py-3.5 font-medium';
      else if (i === chosenIdx) b.className = 'opt w-full text-left bg-rose-500/15 border-2 border-rose-500 rounded-xl px-4 py-3.5 font-medium';
      else b.className = 'opt w-full text-left bg-slate-900 border-2 border-slate-800 rounded-xl px-4 py-3.5 font-medium opacity-50';
    });
    showGrading(card, q, correct, correct ? 3 : 1);
  }

  // 混同検出: 入力が出題とは別のDB内単語・熟語と一致していないか調べる
  function findConfusedEntry(input, card) {
    const ni = Quiz.normalize(input);
    if (!ni || ni.length < 2) return null;
    // 単語: 全部DBがロード済みならそちら（6559語）、なければ現行DB
    const words = VF.DATA.wordsFull || VF.DATA.words || [];
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (w.id !== card.id && Quiz.normalize(w.term) === ni)
        return { id: w.id, deck: 'words', term: w.term, meaning: w.meaning };
    }
    const phrases = VF.DATA.phrases || [];
    for (let i = 0; i < phrases.length; i++) {
      const p = phrases[i];
      if (p.id === card.id) continue;
      const acc = Quiz.acceptableAnswers(p.term);
      for (let j = 0; j < acc.length; j++) {
        if (Quiz.normalize(acc[j]) === ni)
          return { id: p.id, deck: 'phrases', term: p.term, meaning: p.meaning };
      }
    }
    return null;
  }

  // ====== 採点・フィードバック（記入） ======
  function revealTyped(q, card, ok, val) {
    const input = $('#type-input');
    if (input) {
      input.disabled = true;
      input.className = 'w-full border-2 rounded-xl px-4 py-4 text-lg text-center ' +
        (ok ? 'bg-emerald-500/15 border-emerald-500' : 'bg-rose-500/15 border-rose-500');
    }
    const sb = $('#type-submit'); if (sb) sb.style.display = 'none';
    const dk = $('#type-dontknow'); if (dk) dk.style.display = 'none';
    // タイプミス（編集距離1）はHard扱いの選択肢を出す
    const close = !ok && val && Quiz.editDistance(val, q.answer) <= 1 && Quiz.normalize(val).length > 2;
    // 混同検出: 不正解かつタイプミスではない場合、DB内の別の語と一致していないか
    const confused = (!ok && !close && val) ? findConfusedEntry(val, card) : null;
    showGrading(card, q, ok, ok ? 3 : 1, { typed: val, close, confused });
  }

  // 共通: 正解表示＋自己評価ボタン
  function showGrading(card, q, correct, autoGrade, extra) {
    extra = extra || {};
    const s = VF.STATE.session;
    const detailBtn = card.deck === 'etym'
      ? '<button id="etym-more" class="mt-3 text-xs text-amber-300"><i class="fas fa-dna mr-1"></i>語源の詳細を見る</button>' : '';
    // 混同していた別の単語・熟語の案内（記入式で別のDB語を入力した場合）
    const confusedBlock = extra.confused
      ? '<div class="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">' +
          '<div class="flex items-center gap-2 text-amber-300 text-xs font-bold mb-1">' +
            '<i class="fas fa-shuffle"></i>混同しているかも？</div>' +
          '<div class="text-sm">入力した「<span class="font-bold">' + esc(extra.confused.term) + '</span>」は別の' +
            (extra.confused.deck === 'phrases' ? '熟語' : '単語') + 'です（' +
            esc(Quiz.shortMeaning(extra.confused.meaning)) + '）</div>' +
          '<button id="confused-more" class="mt-2 text-xs text-amber-300">' +
            '<i class="fas fa-magnifying-glass mr-1"></i>「' + esc(extra.confused.term) + '」の詳細を見る</button>' +
        '</div>'
      : '';

    const answerBlock =
      '<div class="mt-6 rounded-xl border ' + (correct ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-rose-500/40 bg-rose-500/5') + ' p-4">' +
        '<div class="flex items-center gap-2 mb-2 ' + (correct ? 'text-emerald-400' : 'text-rose-400') + '">' +
          '<i class="fas ' + (correct ? 'fa-circle-check' : 'fa-circle-xmark') + '"></i>' +
          '<span class="font-bold">' + (correct ? '正解！' : (extra.close ? 'おしい！スペル違い' : '不正解')) + '</span></div>' +
        '<div class="text-lg font-bold">' + esc(card.term) + '</div>' +
        '<div class="text-sm text-slate-300 mt-1">' + br(card.meaning) + '</div>' +
        detailBtn +
        confusedBlock +
      '</div>';

    // 自己評価ボタン（FSRS Grade 1-4）。プレビュー間隔を表示
    const st = Store.getCard(card.id);
    const pv = FSRS.preview(st, s.settings.requestRetention);
    const gradeBtn = (g, label, color) =>
      '<button data-grade="' + g + '" class="flex-1 ' + color + ' rounded-xl py-3 font-bold text-sm active:scale-95 transition">' +
      label + '<span class="block text-[10px] font-normal opacity-80 mt-0.5">' + fmtIvl(pv[g]) + '</span></button>';

    const grading =
      '<div class="mt-5"><div class="text-xs text-slate-400 text-center mb-2">手応えは？（次回の復習間隔が変わります）</div>' +
      '<div class="flex gap-2">' +
        gradeBtn(1, 'もう一度', 'bg-rose-500/20 text-rose-200') +
        gradeBtn(2, '難しい', 'bg-amber-500/20 text-amber-200') +
        gradeBtn(3, 'できた', 'bg-emerald-500/20 text-emerald-200') +
        gradeBtn(4, '簡単', 'bg-sky-500/20 text-sky-200') +
      '</div></div>';

    $('#feedback').innerHTML = answerBlock + grading;
    $('#feedback').scrollIntoView({ behavior: 'smooth', block: 'center' });

    // デフォルト推奨をハイライト
    const def = correct ? (extra.close ? 2 : 3) : 1;
    const defBtn = document.querySelector('[data-grade="' + def + '"]');
    if (defBtn) defBtn.classList.add('ring-2', 'ring-white/60');

    document.querySelectorAll('[data-grade]').forEach(b => {
      b.onclick = () => applyGrade(card, q, parseInt(b.getAttribute('data-grade'), 10), correct);
    });
    const em = $('#etym-more');
    if (em) em.onclick = () => showEtymDetail(card.etymRef);
    const cm = $('#confused-more');
    if (cm) cm.onclick = () => window.__showCardDetail(extra.confused.id, extra.confused.deck);

    // キーボード 1-4
    s._keyHandler = (e) => {
      if (e.key >= '1' && e.key <= '4') {
        applyGrade(card, q, parseInt(e.key, 10), correct);
      }
    };
    document.addEventListener('keydown', s._keyHandler);
  }

  function applyGrade(card, q, grade, correct) {
    const s = VF.STATE.session;
    if (s._keyHandler) { document.removeEventListener('keydown', s._keyHandler); s._keyHandler = null; }

    const before = Store.getCard(card.id) || { state: 'new', stability: 0, difficulty: 0, reps: 0, lapses: 0 };
    const now = Date.now();
    const res = FSRS.schedule(before, grade, s.settings.requestRetention, now);

    const reps = (before.reps || 0) + 1;
    const lapses = (before.lapses || 0) + (grade === 1 ? 1 : 0);
    const leechThr = s.settings.leechThreshold || 8;
    const isLeech = lapses >= leechThr;

    const newState = {
      state: res.state, stability: res.stability, difficulty: res.difficulty,
      due: res.due, last_review: res.last_review,
      reps, lapses, is_leech: isLeech,
      deck: card.deck, group: card.group
    };
    Store.setCard(card.id, newState);

    // ログ（FSRS最適化用フル情報）
    Store.addLog({
      card_id: card.id, reviewed_at: now, grade,
      format: q.format,
      elapsed_days: res.elapsed_days,
      duration_ms: now - s.current.shownAt,
      s_before: before.stability || 0, d_before: before.difficulty || 0,
      s_after: res.stability, d_after: res.difficulty
    });

    // 日次カウンタ
    const wasNew = before.state === 'new' || before.state == null;
    Store.incDaily(wasNew ? 'new' : 'review', now);

    // セッション集計
    s.answered++;
    if (correct) s.correct++;
    // Again は当日中に再出題。再出題時は必ず記入式で出すためマークする
    if (grade === 1) { s.reAdd.push(card); s.againIds[card.id] = true; }
    // 記入式で正解できたら Again マークを解除（定着とみなす）
    else if (s.againIds[card.id] && q.format === 'type-je' && correct) { delete s.againIds[card.id]; }

    s.idx++;
    nextCard();
  }

  // ====== 完了画面 ======
  function finish() {
    const s = VF.STATE.session;
    const acc = s.answered ? Math.round(s.correct / s.answered * 100) : 0;
    const mins = Math.max(1, Math.round((Date.now() - s.startTs) / 60000));
    VF.STATE.route = 'home';
    app.innerHTML =
      '<div class="max-w-xl mx-auto min-h-screen flex flex-col items-center justify-center px-6 text-center">' +
        '<div class="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mb-5">' +
          '<i class="fas fa-check text-4xl text-emerald-400"></i></div>' +
        '<h1 class="text-2xl font-extrabold mb-1">セッション完了！</h1>' +
        '<p class="text-slate-400 text-sm mb-6">よく頑張りました。継続が記憶を作ります。</p>' +
        '<div class="grid grid-cols-3 gap-3 w-full mb-8">' +
          stat(s.answered, '解答数') + stat(acc + '%', '正答率') + stat(mins + '分', '学習時間') +
        '</div>' +
        '<button id="again-btn" class="w-full bg-brand hover:bg-brand-dark text-white font-bold rounded-xl py-3.5 mb-2">続けて学習</button>' +
        '<button id="home-btn" class="w-full bg-slate-800 text-slate-200 font-bold rounded-xl py-3.5">ホームへ</button>' +
      '</div>';
    $('#home-btn').onclick = () => VF.go('home');
    $('#again-btn').onclick = () => start(s.deck, s.group);
  }
  function stat(v, l) {
    return '<div class="bg-slate-900 border border-slate-800 rounded-xl py-4"><div class="text-2xl font-extrabold">' + v + '</div><div class="text-xs text-slate-400 mt-0.5">' + l + '</div></div>';
  }

  function emptyState(reviewOnly) {
    const msg = reviewOnly
      ? '復習期限のカードはありません。お疲れさま！新規学習はホームから始められます。'
      : '復習も新規もありません。新規カードの上限は設定で増やせます。';
    return '<div class="max-w-xl mx-auto min-h-screen flex flex-col items-center justify-center px-6 text-center">' +
      '<i class="fas fa-mug-hot text-5xl text-slate-600 mb-4"></i>' +
      '<h1 class="text-xl font-extrabold mb-1">' + (reviewOnly ? '復習は完了！' : '今日の分は完了！') + '</h1>' +
      '<p class="text-slate-400 text-sm mb-6">' + msg + '</p>' +
      '<button id="back-btn" class="bg-brand text-white font-bold rounded-xl py-3 px-8">戻る</button></div>';
  }
  function bindBack() { const b = $('#back-btn'); if (b) b.onclick = () => VF.go('home'); }

  function quit() {
    if (VF.STATE.session && VF.STATE.session.answered > 0 ? confirm('学習を終了しますか？（進捗は保存済み）') : true) {
      const s = VF.STATE.session;
      if (s && s._keyHandler) document.removeEventListener('keydown', s._keyHandler);
      VF.go('home');
    }
  }

  // 語源詳細モーダル
  function showEtymDetail(e) {
    if (!e) return;
    const ex = (e.examples || []).map(x =>
      '<div class="flex items-center justify-between py-1.5 border-b border-slate-800/60 text-sm">' +
      '<span class="font-semibold">' + esc(x.word) + '</span>' +
      '<span class="text-slate-400 text-xs">' + esc(x.ja) + ' ・ ' + esc(x.level) + '</span></div>').join('');
    const html =
      '<div id="etym-modal" class="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4">' +
        '<div class="bg-slate-900 w-full max-w-xl rounded-t-3xl sm:rounded-3xl border border-slate-800 max-h-[85vh] overflow-y-auto">' +
          '<div class="sticky top-0 bg-slate-900 px-5 py-4 border-b border-slate-800 flex items-center justify-between">' +
            '<div><span class="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">' + VF.catLabel(e.category) + '</span> ' +
            '<span class="font-extrabold text-lg ml-1">' + esc((e.variants||e.headword).replace(/`/g,'')) + '</span></div>' +
            '<button id="close-modal" class="text-slate-400"><i class="fas fa-xmark text-xl"></i></button></div>' +
          '<div class="px-5 py-4 space-y-3 text-sm">' +
            row('コアの意味', e.core) + row('派生的な意味', e.derived) + row('語源', e.origin) +
            (e.image_hint ? '<div class="bg-slate-800/50 rounded-xl p-3"><div class="text-xs text-slate-400 mb-1">イメージ</div>' + esc(e.image_hint) + '</div>' : '') +
            (ex ? '<div><div class="text-xs text-slate-400 mb-1">代表的な派生語</div>' + ex + '</div>' : '') +
            (e.tips ? row('覚え方', e.tips) : '') + (e.confusion ? row('混同注意', e.confusion) : '') +
          '</div></div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
    $('#close-modal').onclick = () => $('#etym-modal').remove();
    $('#etym-modal').onclick = (ev) => { if (ev.target.id === 'etym-modal') $('#etym-modal').remove(); };
  }
  function row(label, val) {
    if (!val) return '';
    return '<div><div class="text-xs text-slate-400">' + label + '</div><div>' + esc(val) + '</div></div>';
  }
  window.__showEtymDetail = showEtymDetail;

  function $(s, el) { return (el || document).querySelector(s); }
  function fmtIvl(d) {
    if (d == null) return '';
    if (d < 1) return '今日';
    if (d === 1) return '1日後';
    if (d < 30) return d + '日後';
    if (d < 365) return Math.round(d / 30) + 'ヶ月後';
    return (Math.round(d / 36.5) / 10) + '年後';
  }
})();
