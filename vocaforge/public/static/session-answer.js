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

    // 弱点集中モードは「ドリル」であって復習スケジュールではない。
    // 期限に関係なく苦手カードを連続で出すモードなので、ここでの出来／不出来を
    // FSRS に入れると、まだ覚えていないカードの間隔が伸びたり、
    // 難易度・安定度が実際の記憶状態とズレたりする。
    // そのため、このモードでは FSRS のスケジューリングと最適化用ログを書かない。
    //   反映しない: stability / difficulty / due / state / last_review / 最適化ログ
    //   反映する  : reps / lapses / is_leech（弱点リストの選抜と統計に必要なため。
    //               ここを止めると弱点判定が更新されず、リストから卒業できなくなる）
    const isWeakDrill = s.deck === 'weak';

    const before = Store.getCard(card.id) || { state: 'new', stability: 0, difficulty: 0, reps: 0, lapses: 0 };
    const now = Date.now();
    const res = FSRS.schedule(before, grade, s.settings.requestRetention, now);

    const reps = (before.reps || 0) + 1;
    const lapses = (before.lapses || 0) + (grade === 1 ? 1 : 0);
    const leechThr = s.settings.leechThreshold || 8;
    const isLeech = lapses >= leechThr;

    const newState = isWeakDrill
      // 弱点ドリル: FSRS が決める4項目（state/stability/difficulty/due）と
      // last_review は before のまま据え置き、回数系だけ更新する。
      ? {
        state: before.state, stability: before.stability, difficulty: before.difficulty,
        due: before.due, last_review: before.last_review,
        reps, lapses, is_leech: isLeech,
        deck: card.deck, group: card.group,
        // last_review を据え置くので、cardTouchedAt() が「古いカード」と誤判定してしまう
        // （updated_at_ms が無いと last_review で代用する仕様のため）。
        // そのままだと同期のマージで reps/lapses の更新がサーバー側の値に負けて消える。
        // 触った時刻を明示して、手元の更新が正しく勝つようにする。
        updated_at_ms: now
      }
      : {
        state: res.state, stability: res.stability, difficulty: res.difficulty,
        due: res.due, last_review: res.last_review,
        reps, lapses, is_leech: isLeech,
        deck: card.deck, group: card.group
      };
    Store.setCard(card.id, newState);

    // ログ（FSRS最適化用フル情報）
    // 弱点ドリルの解答は optimizer.js の学習データに混ぜない。
    // 期限を無視した出題なので elapsed_days が実際の記憶間隔を表さず、
    // これを含めるとパラメータ推定が歪む。
    if (!isWeakDrill) {
      Store.addLog({
        card_id: card.id, reviewed_at: now, grade,
        format: q.format,
        elapsed_days: res.elapsed_days,
        duration_ms: now - s.current.shownAt,
        s_before: before.stability || 0, d_before: before.difficulty || 0,
        s_after: res.stability, d_after: res.difficulty
      });
    }

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
        // 弱点ドリルではログを送らない（ローカルの Store.addLog と揃える）。
        // ここで送ると、別端末が review_logs を引いたときに
        // 弱点ドリルの解答が最適化の学習データに混ざってしまう。
        // カード状態（state）は reps/lapses の更新を同期する必要があるので送る。
        // newState 側で stability/difficulty/due は据え置き済みなので、
        // サーバーのスケジュールが弱点ドリルで動くことはない。
        const payload = {
          cardId: card.id,
          state: newState,
          touchedAt: now,
          day: Store.todayStr(now),
          stats: Store.getDaily(now)
        };
        if (!isWeakDrill) {
          payload.log = {
            card_id: card.id, reviewed_at: now, grade: grade,
            // サーバーの correct 列には客観的な正解判定を入れる（ボタンは入れない）
            correct: !!correct,
            elapsed_days: res.elapsed_days,
            // FSRS 最適化に必要な情報。上の Store.addLog と同じ値を送る。
            // ここを送らないと review_logs 側が NULL のまま溜まり、
            // 別端末からログを引いたときに最適化の学習データが壊れる
            // （s_before が無いログは optimizer 側で「先頭欠損」を判定できない）。
            format: q.format,
            duration_ms: now - s.current.shownAt,
            s_before: before.stability || 0, d_before: before.difficulty || 0,
            s_after: res.stability, d_after: res.difficulty
          };
        }
        window.VFOutbox.enqueueAnswer(payload);
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
