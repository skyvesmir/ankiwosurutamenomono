/* FSRS-4.5 スケジューラ実装
 * 学習科学ガイド準拠: R(t,S)=(1+FACTOR·t/S)^DECAY, I(r,S)=(S/FACTOR)(r^(1/DECAY)-1)
 * Grade: 1=Again 2=Hard 3=Good 4=Easy
 * 参照: open-spaced-repetition / FSRS-4.5 default weights
 */
(function (global) {
  'use strict';

  // FSRS-4.5 デフォルトパラメータ(w0..w18)
  const W = [
    0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.0234, 1.616,
    0.1544, 1.0824, 1.9813, 0.0953, 0.2975, 2.2042, 0.2407, 2.9466, 0.5034, 0.6567
  ];
  const DECAY = -0.5;
  const FACTOR = Math.pow(0.9, 1 / DECAY) - 1; // = 19/81 ≈ 0.2346

  const clampD = (d) => Math.min(Math.max(d, 1), 10);

  // 想起可能性 R（経過日数 t, 安定度 S）
  function retrievability(t, S) {
    if (S <= 0) return 0;
    return Math.pow(1 + FACTOR * t / S, DECAY);
  }

  // 目標保持率 r から次回間隔（日）
  function intervalFromStability(S, requestRetention) {
    const r = requestRetention;
    const ivl = (S / FACTOR) * (Math.pow(r, 1 / DECAY) - 1);
    return Math.max(1, Math.round(ivl));
  }

  // 初回安定度
  function initStability(grade) {
    return Math.max(W[grade - 1], 0.1);
  }
  // 初回難易度
  function initDifficulty(grade) {
    return clampD(W[4] - Math.exp(W[5] * (grade - 1)) + 1);
  }
  // 難易度更新
  function nextDifficulty(D, grade) {
    const dNext = D - W[6] * (grade - 3);
    // mean reversion
    const d0easy = clampD(W[4] - Math.exp(W[5] * (4 - 1)) + 1);
    return clampD(W[7] * d0easy + (1 - W[7]) * dNext);
  }
  // 正答時の安定度増加
  function nextRecallStability(D, S, R, grade) {
    const hardPenalty = grade === 2 ? W[15] : 1;
    const easyBonus = grade === 4 ? W[16] : 1;
    return S * (1 + Math.exp(W[8]) * (11 - D) * Math.pow(S, -W[9]) *
      (Math.exp((1 - R) * W[10]) - 1) * hardPenalty * easyBonus);
  }
  // 失念時の安定度
  function nextForgetStability(D, S, R) {
    return W[11] * Math.pow(D, -W[12]) * (Math.pow(S + 1, W[13]) - 1) *
      Math.exp((1 - R) * W[14]);
  }

  /**
   * カードの記憶状態を更新する
   * @param {object} card - {state, stability, difficulty, last_review(ms)}
   * @param {number} grade - 1..4
   * @param {number} requestRetention - 目標保持率(0-1)
   * @param {number} now - epoch ms
   * @returns {object} {state, stability, difficulty, due(ms), elapsed_days, scheduled_days}
   */
  function schedule(card, grade, requestRetention, now) {
    now = now || Date.now();
    requestRetention = requestRetention || 0.9;
    const DAY = 86400000;
    const isNew = !card || card.state === 'new' || card.state == null;

    let S, D, elapsed;
    if (isNew) {
      D = initDifficulty(grade);
      S = initStability(grade);
      elapsed = 0;
    } else {
      elapsed = card.last_review ? Math.max(0, (now - card.last_review) / DAY) : 0;
      const R = retrievability(elapsed, card.stability);
      D = nextDifficulty(card.difficulty, grade);
      if (grade === 1) {
        S = nextForgetStability(D, card.stability, R);
      } else {
        S = nextRecallStability(D, card.stability, R, grade);
      }
      S = Math.max(S, 0.1);
    }

    // 学習段階の短い間隔（Again/Hard は当日〜短期）
    let scheduled;
    let state = 'review';
    if (grade === 1) {
      scheduled = 0; // 当日再出題（分単位扱い→キュー先頭）
      state = 'relearning';
    } else {
      scheduled = intervalFromStability(S, requestRetention);
    }
    const due = grade === 1 ? now + 60000 : now + scheduled * DAY;

    return {
      state,
      stability: S,
      difficulty: D,
      due,
      last_review: now,
      elapsed_days: Math.round(elapsed * 100) / 100,
      scheduled_days: scheduled
    };
  }

  // プレビュー: 各grade選択時の次回間隔（UI表示用）
  function preview(card, requestRetention, now) {
    const out = {};
    for (let g = 1; g <= 4; g++) {
      const r = schedule(card, g, requestRetention, now);
      out[g] = r.scheduled_days;
    }
    return out;
  }

  global.FSRS = { schedule, preview, retrievability, intervalFromStability };
})(window);
