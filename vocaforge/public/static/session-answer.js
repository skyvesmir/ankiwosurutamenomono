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

    // 日次カウンタ（既存。壊さない）
    const wasNew = before.state === 'new' || before.state == null;
    Store.incDaily(wasNew ? 'new' : 'review', now);

    // ---- 日次記録の新項目（記録のみ。表示側は変えない）----
    // 「正解」は FSRS のボタン（もう一度／難しい／できた／簡単）ではなく、
    // 「入力または選択した答えが合っていたか」の客観判定 = correct を使う。
    // grade は FSRS のスケジューリング専用で、記録には混ぜない。
    recordDaily(s, card, before, wasNew, correct, now);

    // ---- 行単位のクラウド書き込み（送信待ちの箱へ）----
    // 学習データ全体を丸ごと上書きするのをやめ、解いた1枚分だけを送る。
    // updated_at_ms には「送信した時刻」ではなく「このカードを触った時刻」= now を入れる。
    // 箱に入れるだけなので、オフラインでも失敗しても学習は止まらない。
    if (window.VFOutbox && window.VFOutbox.enqueueAnswer) {
      try {
        window.VFOutbox.enqueueAnswer({
          cardId: card.id,
          state: newState,
          touchedAt: now,
          log: {
            card_id: card.id, reviewed_at: now, grade: grade,
            // サーバーの correct 列には客観的な正解判定を入れる（ボタンは入れない）
            correct: !!correct,
            elapsed_days: res.elapsed_days
          },
          day: Store.todayStr(now),
          stats: Store.getDaily(now)
        });
      } catch (e) { /* 送信準備の失敗で学習を止めない */ }
    }

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

  // 日次記録の新項目をまとめて書く。失敗しても学習は止めない。
  function recordDaily(s, card, before, wasNew, correct, now) {
    try {
      const isNewFirst = (before.reps || 0) === 0;   // このカードの初回解答
      if (!wasNew) {
        // 既に学習済みのカード = 期限カードの消化。
        // 新規カードは（Again 後の再出題を含め）ここに入らない。
        // 新規の分は dueTotal/dueDone に足さず newFirstPassed だけで数える。
        Store.incDailyDueDone(!!correct, now);
      } else if (isNewFirst && correct) {
        // 新規カードが初回で客観的に正解できた = 初回復習を突破
        Store.incDailyNewFirstPassed(now);
      }

      // 弱点集中モードの消化数
      if (s.deck === 'weak') Store.incDailyWeakDone(now);

      // カテゴリ（ミッション10「異なるカテゴリ2種類以上」）: 全カード種が対象
      if (VF.categoryOf) {
        const cat = VF.categoryOf(card);
        if (cat) Store.addDailyCategory(cat, now);
      }
      // テーマ別成績（素材ステージのブースト判定）: 語根カードのみ
      if (VF.rootThemeOf) {
        const theme = VF.rootThemeOf(card.id);
        if (theme) Store.addDailyTheme(theme, !!correct, now);
      }

      // セッション記録（dueDone が 1 以上のセッションだけ入る）。
      // Store 側が startedAt を検証し、未来なら捨て、72時間より古ければ丸める。
      s._dueDone = (s._dueDone || 0) + (wasNew ? 0 : 1);
      if (s._dueDone >= 1) Store.addDailySession(s.startTs, s._dueDone, now);
    } catch (e) { /* 記録の失敗で学習を止めない */ }
  }

  ns.applyGrade = applyGrade;
  ns.recordDaily = recordDaily;
})();
