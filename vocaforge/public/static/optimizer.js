/* FSRS-7 オンデバイス・パラメータ最適化
 *
 * 根拠（2026年7月 Web調査）:
 *  - srs-benchmark（Anki 1万人・7.3億レビュー）: 個人最適化したFSRSは
 *    デフォルトパラメータに対し84.3%のユーザーで優位（superiority表）。
 *    アルゴリズム自体の乗り換え（LSTM/RWKV等）より、まず「個人の履歴への
 *    フィッティング」が最大の改善要因。
 *  - Anki公式FAQ: 「レビュー数が倍になるごとに再最適化」を推奨。
 *  - 本実装は fsrs-optimizer（Python/PyTorch）の座標降下版。
 *    勾配計算の代わりに座標ごとの候補探索（coordinate descent）を使い、
 *    ブラウザ内で数秒で完了する。
 *  - 過学習ガード: 時系列ホールドアウト（古い75%で学習→新しい25%で検証）。
 *    srs-benchmarkのTimeSeriesSplitと同じ思想。検証で改善しなければ適用しない。
 *
 * 公開API: window.FSRSOpt = { status, optimize, applySaved, MIN_REVIEWS }
 */
(function (global) {
  'use strict';

  const MIN_REVIEWS = 300;   // これ未満では最適化しない（Anki公式は400前後を推奨）
  const DAY = 86400000;

  // 最適化対象のパラメータ（長期記憶に効く16個）。
  // 短期式(w16-24)・忘却曲線形状(w27-34)はノイズに過敏なためデフォルト固定。
  const OPT_IDX = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

  // パラメータごとの下限・上限（fsrs-optimizer の clamp 相当）
  const BOUNDS = {
    0: [0.001, 100], 1: [0.001, 100], 2: [0.001, 100], 3: [0.001, 100], // S0
    4: [1, 10], 5: [0.01, 4], 6: [0.01, 4],                              // 難易度
    7: [0.001, 5], 8: [0.001, 1.2], 9: [0.001, 5],                       // 長期SInc
    10: [0.001, 3], 11: [0.001, 1.5], 12: [0.001, 2.5], 13: [0.001, 3],  // 長期Sfail
    14: [0.2, 1], 15: [1, 5]                                             // Hard/Easy係数
  };

  // ---- レビュー履歴 → カード別シーケンス構築 ----
  // 各レビューに train/test フラグを付ける（時刻の75パーセンタイルで分割）
  // ログ上限キャップで先頭が削除された系列（最初のログの s_before > 0）は、
  // 「初回レビューからのリプレイ」前提が崩れ訓練データを歪めるため除外する。
  function buildSequences() {
    const logs = Store.getLogs().slice()
      .filter(l => l && l.card_id && l.grade >= 1 && l.grade <= 4 && l.reviewed_at)
      .sort((a, b) => a.reviewed_at - b.reviewed_at);
    if (!logs.length) return { seqs: [], total: 0, evaluable: 0, testN: 0, truncated: 0 };

    const cutoff = logs[Math.floor(logs.length * 0.75)].reviewed_at;
    const byCard = {};
    for (const l of logs) (byCard[l.card_id] = byCard[l.card_id] || []).push(l);

    const seqs = [];
    let evaluable = 0, testN = 0, truncated = 0;
    for (const id in byCard) {
      const arr = byCard[id];
      // 先頭欠損検出: 真の初回レビューは s_before === 0。
      // （s_before 未記録の旧ログは後方互換のため欠損扱いしない）
      if (typeof arr[0].s_before === 'number' && arr[0].s_before > 0) {
        truncated++;
        continue;
      }
      const seq = [];
      for (let i = 0; i < arr.length; i++) {
        const elapsed = i === 0 ? 0 : Math.max(0, (arr[i].reviewed_at - arr[i - 1].reviewed_at) / DAY);
        const isTest = arr[i].reviewed_at > cutoff;
        seq.push({ grade: arr[i].grade, elapsed, test: isTest });
        if (i > 0 && elapsed >= 0.5) { evaluable++; if (isTest) testN++; }
      }
      seqs.push(seq);
    }
    return { seqs, total: logs.length, evaluable, testN, truncated };
  }

  // ---- 損失計算: 候補パラメータで履歴をリプレイし log loss を測る ----
  // phase: 'train' | 'test' | 'all' … どのレビューを損失に算入するか
  function computeLoss(W, seqs, phase) {
    const eng = FSRS.makeEngine(W);
    let loss = 0, n = 0;
    for (let k = 0; k < seqs.length; k++) {
      const seq = seqs[k];
      let S = 0, D = 0;
      for (let i = 0; i < seq.length; i++) {
        const rv = seq[i];
        if (i === 0) {
          D = eng.initDifficulty(rv.grade);
          S = Math.max(eng.initStability(rv.grade), 0.001);
          continue;
        }
        const R = eng.retrievability(rv.elapsed, S);
        // 同日再出題（<0.5日）は「直前に見たばかり」でノイズが大きく評価から除外
        // （srs-benchmark も same-day review を評価から外している）
        if (rv.elapsed >= 0.5) {
          const inPhase = phase === 'all' || (phase === 'test') === !!rv.test;
          if (inPhase) {
            const y = rv.grade > 1 ? 1 : 0;
            const p = Math.min(Math.max(R, 1e-6), 1 - 1e-6);
            loss += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
            n++;
          }
        }
        D = eng.nextDifficulty(D, rv.grade);
        const base = rv.elapsed < 1 ? 16 : 7;
        S = Math.max(eng.stabilityUpdate(base, D, S, R, rv.grade), 0.001);
      }
    }
    return n ? loss / n : Infinity;
  }

  const clampP = (i, v) => {
    const b = BOUNDS[i];
    return b ? Math.min(Math.max(v, b[0]), b[1]) : v;
  };

  // ---- 座標降下法による最適化（非同期・進捗コールバック付き）----
  async function coordinateDescent(seqs, phase, onProgress) {
    const W = FSRS.defaultWeights.slice();
    let best = computeLoss(W, seqs, phase);
    const PASSES = 4;
    const CAND = [0.7, 0.85, 0.95, 1.05, 1.2, 1.45]; // 乗算候補
    let step = 0;
    const totalSteps = PASSES * OPT_IDX.length;

    for (let pass = 0; pass < PASSES; pass++) {
      let improvedInPass = false;
      for (const idx of OPT_IDX) {
        const orig = W[idx];
        let bestV = orig;
        for (const m of CAND) {
          const v = clampP(idx, orig * m);
          if (v === bestV) continue;
          W[idx] = v;
          const L = computeLoss(W, seqs, phase);
          if (L < best - 1e-6) { best = L; bestV = v; improvedInPass = true; }
        }
        W[idx] = bestV;
        step++;
        if (onProgress) onProgress(Math.round(step / totalSteps * 100));
        // UIをブロックしない
        await new Promise(r => setTimeout(r, 0));
      }
      if (!improvedInPass) break;
    }
    return { W, loss: best };
  }

  // ---- 公開API ----
  const FSRSOpt = {
    MIN_REVIEWS,

    // 現在の状態（設定画面表示用）
    status() {
      const s = Store.getSettings();
      const logs = Store.getLogs();
      // 累計回数（キャップの影響を受けない）。再最適化推奨判定に使う。
      const cum = (Store.getReviewCount ? Store.getReviewCount() : logs.length);
      const optimizedReviews = s.fsrsOptimizedReviews || 0;
      return {
        reviews: logs.length,
        active: !!(s.fsrsWeights && s.fsrsWeights.length),
        optimizedAt: s.fsrsOptimizedAt || null,
        optimizedReviews,
        ready: logs.length >= MIN_REVIEWS,
        // Anki公式推奨「レビュー数が倍になったら再最適化」（累計で判定）
        suggestReoptimize: optimizedReviews > 0 && cum >= optimizedReviews * 2
      };
    },

    // 保存済みパラメータを適用（起動時に呼ぶ）
    applySaved() {
      const s = Store.getSettings();
      if (s.fsrsWeights && FSRS.setWeights(s.fsrsWeights)) return true;
      return false;
    },

    // 最適化本体
    async optimize(onProgress) {
      const { seqs, total, evaluable, testN, truncated } = buildSequences();
      if (total < MIN_REVIEWS) {
        return { ok: false, reason: 'not_enough', reviews: total, needed: MIN_REVIEWS };
      }
      if (!seqs.length || !evaluable) {
        return { ok: false, reason: 'not_enough', reviews: total, needed: MIN_REVIEWS, truncated };
      }
      const defaultW = FSRS.defaultWeights.slice();

      // 十分なテストデータがあれば時系列ホールドアウトで検証
      const useHoldout = testN >= 50;
      const trainPhase = useHoldout ? 'train' : 'all';

      const before = computeLoss(defaultW, seqs, useHoldout ? 'test' : 'all');
      const { W } = await coordinateDescent(seqs, trainPhase, onProgress);
      const after = computeLoss(W, seqs, useHoldout ? 'test' : 'all');

      // 検証: 改善しなければ適用しない（過学習ガード）
      const threshold = useHoldout ? 0 : 0.02; // 全データ学習時は2%以上の改善を要求
      if (!(after < before * (1 - threshold))) {
        return {
          ok: true, applied: false, before, after,
          reviews: total, evaluable, holdout: useHoldout, truncated,
          reason: 'no_improvement'
        };
      }

      FSRS.setWeights(W);
      Store.setSettings({
        fsrsWeights: W,
        fsrsOptimizedAt: Date.now(),
        // 累計回数で記録（ログキャップ後も「レビュー数倍増で再最適化」判定が正しく働く）
        fsrsOptimizedReviews: (Store.getReviewCount ? Store.getReviewCount() : total)
      });
      return { ok: true, applied: true, before, after, weights: W, reviews: total, evaluable, holdout: useHoldout, truncated };
    },

    // デフォルトへ戻す
    resetToDefault() {
      FSRS.setWeights(FSRS.defaultWeights.slice());
      Store.setSettings({ fsrsWeights: null, fsrsOptimizedAt: null, fsrsOptimizedReviews: 0 });
    }
  };

  global.FSRSOpt = FSRSOpt;

  // ロード時に保存済み個人パラメータを適用
  try { FSRSOpt.applySaved(); } catch (e) { /* store未初期化なら無視 */ }
})(window);
