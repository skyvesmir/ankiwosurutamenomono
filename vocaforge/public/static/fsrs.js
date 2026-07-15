/* FSRS-7 スケジューラ実装（2026年最終版）+ 個人最適化対応
 * 参照: open-spaced-repetition/srs-benchmark models/fsrs_v7.py, fsrs_v6.py
 * および同梱ガイド「暗記アルゴリズム大全」6-8節。
 *
 * FSRS-7の要点:
 *  - パラメータ35個（w0..w34）
 *  - 忘却曲線は「デュアルべき関数」: 独立した減衰率を持つ2本の曲線を S に応じて混合
 *  - 安定度更新は長期(base=7)/短期(base=16)の2系統。経過時間<1日は短期式を使用
 *  - 小数日インターバル対応（分・時間単位の短期復習でも整合する想起確率）
 *
 * v2での拡張（srs-benchmark / Anki本体の知見に基づく）:
 *  - setWeights(): オンデバイス最適化された個人パラメータへの差し替え
 *    （最適化済み vs デフォルトで84.3%のユーザーが優位: srs-benchmark superiority表）
 *  - makeEngine(W): 任意の重みで動く数式エンジン（optimizer.jsのリプレイ評価用）
 *  - スマートfuzz: 間隔±5%のランダム化。復習日の集中と「同じ並びで覚える」癖を防ぐ
 *    （Anki本体のfuzz factorと同じ発想）
 *
 * Grade: 1=Again 2=Hard 3=Good 4=Easy
 * 公開API: window.FSRS = { schedule, preview, retrievability, intervalFromStability,
 *                          setWeights, getWeights, defaultWeights, makeEngine }
 */
(function (global) {
  'use strict';

  // FSRS-7 デフォルトパラメータ（35個）
  // srs-benchmark models/fsrs_v7.py の init_w より（multi-user最適化値）
  const DEFAULT_W = [
    0.041, 2.4175, 4.1283, 11.9709,     // w0-3  初期安定度 S0(Again/Hard/Good/Easy)
    5.6385, 0.4468, 3.262,              // w4-6  難易度
    2.3054, 0.1688, 1.3325, 0.3524, 0.0049, 0.7503, 0.0896, 0.6625, 1.3, // w7-15 長期安定度
    0.882, 0.3072, 3.5875, 0.303, 0.0107, 0.2279, 2.6413, 0.5594, 1.3,   // w16-24 短期安定度
    2.5, 1.0,                           // w25-26 長期短期遷移関数（本実装では未使用: JSは1件逐次のため）
    0.0723, 0.1634, 0.5, 0.9555, 0.2245, 0.6232, 0.1362, 0.3862 // w27-34 デュアル忘却曲線
  ];

  const DAY = 86400000;
  const S_MIN = 0.001;
  const clampD = (d) => Math.min(Math.max(d, 1), 10);

  // 単一べき関数の想起確率
  function powerLawRetention(base, decay, tOverS) {
    const factor = Math.pow(base, 1 / decay) - 1;
    return Math.pow(1 + factor * tOverS, decay);
  }

  /**
   * 重み配列 W から FSRS-7 の数式一式を生成する。
   * デフォルトエンジン（スケジューリング用）と、optimizer のリプレイ評価
   * （候補パラメータでの損失計算）の両方で使う。
   */
  function makeEngine(W) {
    // デュアル忘却曲線のパラメータ（w27..w34）
    const DECAY1 = -W[27];   // decayはマイナス符号で渡す
    const DECAY2 = -W[28];
    const BASE1  = W[29];
    const BASE2  = W[30];
    const BW1    = W[31];    // base_weight1
    const BW2    = W[32];    // base_weight2
    const SWP1   = W[33];    // S weight power 1（マイナス符号で使用）
    const SWP2   = W[34];    // S weight power 2

    // デュアル忘却曲線: R = (wt1*R1 + wt2*R2)/(wt1+wt2)
    //  wt1 = BW1 * S^(-SWP1),  wt2 = BW2 * S^(SWP2)
    function retrievability(t, S) {
      if (S <= 0) return 0;
      if (t <= 0) return 1;
      const tOverS = t / S;
      const R1 = powerLawRetention(BASE1, DECAY1, tOverS);
      const R2 = powerLawRetention(BASE2, DECAY2, tOverS);
      const wt1 = BW1 * Math.pow(S, -SWP1);
      const wt2 = BW2 * Math.pow(S, SWP2);
      return (wt1 * R1 + wt2 * R2) / (wt1 + wt2);
    }

    // 目標保持率 requestRetention から次回間隔（日）を数値的に逆算。
    // デュアル忘却曲線は解析的に逆関数を持たないため、単調減少性を利用した二分探索で解く。
    function intervalFromStability(S, requestRetention) {
      const r = requestRetention;
      if (S <= 0) return 1;
      let lo = 0, hi = Math.max(S * 10, 1);
      let guard = 0;
      while (retrievability(hi, S) > r && guard < 60) { hi *= 2; guard++; }
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        const R = retrievability(mid, S);
        if (R > r) lo = mid; else hi = mid;
      }
      const ivl = (lo + hi) / 2;
      return Math.max(1, Math.round(ivl));
    }

    // 初回安定度 S0(grade) = w[grade-1]
    function initStability(grade) {
      return Math.max(W[grade - 1], S_MIN);
    }
    // 初回難易度 D0(grade) = w4 - exp(w5*(grade-1)) + 1
    function initDifficulty(grade) {
      return clampD(W[4] - Math.exp(W[5] * (grade - 1)) + 1);
    }
    // 難易度更新（線形ダンピング + 平均回帰）
    function nextDifficulty(D, grade) {
      const deltaD = -W[6] * (grade - 3);
      let nd = D + deltaD * (10 - D) / 9;
      const initEasy = W[4] - Math.exp(W[5] * (4 - 1)) + 1; // init_d(4)
      nd = 0.01 * initEasy + 0.99 * nd;
      return clampD(nd);
    }

    // 安定度更新の共通式（長期: base=7 / 短期: base=16）
    function stabilityUpdate(base, D, S, R, grade) {
      const wSincBase  = W[base];
      const wSincSExp  = W[base + 1];
      const wSincRMult = W[base + 2];
      const wFailMult  = W[base + 3];
      const wFailDExp  = W[base + 4];
      const wFailSExp  = W[base + 5];
      const wFailRMult = W[base + 6];
      const wHard      = W[base + 7];
      const wEasy      = W[base + 8];

      const hard = grade === 2 ? wHard : 1;
      const easy = grade === 4 ? wEasy : 1;

      const sFail = wFailMult * Math.pow(D, -wFailDExp) *
        (Math.pow(S + 1, wFailSExp) - 1) * Math.exp((1 - R) * wFailRMult);
      const pls = Math.min(S, sFail);

      if (grade > 1) {
        const sInc = 1 + Math.exp(wSincBase - 1.5) * (11 - D) *
          Math.pow(S, -wSincSExp) * (Math.exp((1 - R) * wSincRMult) - 1) * hard * easy;
        return Math.max(pls, S * sInc);
      }
      return pls;
    }

    return { retrievability, intervalFromStability, initStability, initDifficulty, nextDifficulty, stabilityUpdate };
  }

  // ---- アクティブな重みとエンジン ----
  let W = DEFAULT_W.slice();
  let engine = makeEngine(W);

  function setWeights(w) {
    if (!Array.isArray(w) || w.length !== DEFAULT_W.length) return false;
    for (let i = 0; i < w.length; i++) {
      if (typeof w[i] !== 'number' || !isFinite(w[i])) return false;
    }
    W = w.slice();
    engine = makeEngine(W);
    return true;
  }
  function getWeights() { return W.slice(); }

  // ---- スマートfuzz: 間隔±5%のランダム化（3日以上のみ・下限2日） ----
  // 復習が特定日に集中するのを均し、兄弟カードが毎回同じ並びで出るのを防ぐ。
  function applyFuzz(ivl) {
    if (ivl < 3) return ivl;
    const span = Math.max(1, Math.round(ivl * 0.05));
    const delta = Math.round((Math.random() * 2 - 1) * span);
    return Math.max(2, ivl + delta);
  }

  /**
   * カードの記憶状態を更新する（FSRS-7）
   * @param {object} card - {state, stability, difficulty, last_review(ms)}
   * @param {number} grade - 1..4
   * @param {number} requestRetention - 目標保持率(0-1)
   * @param {number} now - epoch ms
   * @returns {object} {state, stability, difficulty, due(ms), last_review, elapsed_days, scheduled_days}
   */
  function schedule(card, grade, requestRetention, now) {
    now = now || Date.now();
    requestRetention = requestRetention || 0.9;
    const isNew = !card || card.state === 'new' || card.state == null;

    let S, D, elapsed;
    if (isNew) {
      D = engine.initDifficulty(grade);
      S = engine.initStability(grade);
      elapsed = 0;
    } else {
      elapsed = card.last_review ? Math.max(0, (now - card.last_review) / DAY) : 0;
      const R = engine.retrievability(elapsed, card.stability);
      D = engine.nextDifficulty(card.difficulty, grade);
      // FSRS-7: 経過<1日は短期式(base=16)、それ以外は長期式(base=7)
      const base = elapsed < 1 ? 16 : 7;
      S = engine.stabilityUpdate(base, D, card.stability, R, grade);
      S = Math.max(S, S_MIN);
    }

    let scheduled;
    let state = 'review';
    if (grade === 1) {
      scheduled = 0; // 当日中に再出題
      state = 'relearning';
    } else {
      scheduled = applyFuzz(engine.intervalFromStability(S, requestRetention));
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

  // プレビュー: 各grade選択時の次回間隔（UI表示用・fuzzなし）
  function preview(card, requestRetention, now) {
    now = now || Date.now();
    requestRetention = requestRetention || 0.9;
    const out = {};
    const isNew = !card || card.state === 'new' || card.state == null;
    for (let g = 1; g <= 4; g++) {
      if (g === 1) { out[g] = 0; continue; }
      let S;
      if (isNew) {
        S = engine.initStability(g);
      } else {
        const elapsed = card.last_review ? Math.max(0, (now - card.last_review) / DAY) : 0;
        const R = engine.retrievability(elapsed, card.stability);
        const D = engine.nextDifficulty(card.difficulty, g);
        const base = elapsed < 1 ? 16 : 7;
        S = Math.max(engine.stabilityUpdate(base, D, card.stability, R, g), S_MIN);
      }
      out[g] = engine.intervalFromStability(S, requestRetention);
    }
    return out;
  }

  global.FSRS = {
    schedule, preview,
    retrievability: (t, S) => engine.retrievability(t, S),
    intervalFromStability: (S, r) => engine.intervalFromStability(S, r),
    setWeights, getWeights, makeEngine,
    defaultWeights: DEFAULT_W.slice(),
    version: 7, weights: W
  };
})(window);
