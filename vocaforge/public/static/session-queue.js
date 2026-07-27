/* 学習キュー生成（session.js から切り出し／内容は無変更）
 * - 出題プールの抽出
 * - Retrievability 降順ソート
 * - reviewPerDay / newPerDay の上限適用
 * - セクション選択時の新規上限の例外
 * - 出題ゼロ時のフォールバック
 * - 弱点集中モードの対象抽出
 */
(function () {
  'use strict';
  const VF = window.VF;
  const ns = (window.__VFSession = window.__VFSession || {});

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
        // 1回あたりの個数は設定「セクション学習の新規カード数」で変更可能（下限10）
        newAllowed = Math.max(newAllowed, Math.max(10, settings.sectionNewLimit || 50));
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

  // ====== 弱点集中モード（ブートキャンプ） ======
  // 対象: 学習済みカードのうち「リーチ語 / 失敗が多い / FSRS難易度が高い」もの。
  // 復習期限に関係なく、最も弱い順に最大 WEAK_SESSION_SIZE 枚をドリル出題する。
  // 採点は通常と同じくFSRSに反映（早期復習はFSRSがelapsed_daysで正しく扱う）。
  const WEAK_SESSION_SIZE = 15;
  function weakPool() {
    const states = Store.getAllCards();
    const all = [].concat(VF.deckCards('words'), VF.deckCards('phrases'), VF.deckCards('etym'));
    const out = [];
    for (let i = 0; i < all.length; i++) {
      const c = all[i];
      const s = states[c.id];
      if (!s || s.state === 'new') continue;
      const lapses = s.lapses || 0;
      const diff = s.difficulty || 0;
      const leech = !!s.is_leech;
      // 弱点判定: リーチ or 失敗2回以上 or 難易度6.5以上（FSRS Dは1-10）
      if (!leech && lapses < 2 && diff < 6.5) continue;
      // 弱さスコア: リーチ最優先 → 失敗回数 → 難易度
      out.push({ c, score: (leech ? 1000 : 0) + lapses * 10 + diff });
    }
    out.sort((a, b) => b.score - a.score);
    return out.map(x => x.c);
  }
  window.__weakCount = function () { return weakPool().length; };

  ns.hasGlobalDueReviews = hasGlobalDueReviews;
  ns.buildQueue = buildQueue;
  ns.weakPool = weakPool;
  ns.WEAK_SESSION_SIZE = WEAK_SESSION_SIZE;
})();
