/* 解答処理（session.js から切り出し／内容は無変更）
 * - 採点結果を FSRS に受け渡し
 * - Store への書き込み（カード状態 / ログ / 日次カウンタ）
 * - セッション集計の更新と次カードへの遷移
 *
 * 外部からの入口はこの1つ: window.__VFSession.applyGrade(card, q, grade, correct)
 */
(function () {
  'use strict';
  const VF = window.VF;
  const ns = (window.__VFSession = window.__VFSession || {});
  // 遅延解決ブリッジ: nextCard は session.js（後読み込み）で定義される
  function nextCard() { return ns.nextCard.apply(null, arguments); }

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
    else if (s.againIds[card.id] && (q.format === 'type-je' || q.format === 'cloze') && correct) { delete s.againIds[card.id]; }

    s.idx++;
    nextCard();
  }

  ns.applyGrade = applyGrade;
})();
