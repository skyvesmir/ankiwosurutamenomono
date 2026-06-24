/* localStorage 永続化層
 * - カード記憶状態（FSRS: S, D, due, state）
 * - 復習ログ（card_id, reviewed_at, grade, elapsed_days, duration_ms, S/D前後）
 * - 設定（目標保持率, 1日上限, 出題形式, インターリービング, 入力厳格度）
 * - 統計（日次学習数）
 */
(function (global) {
  'use strict';
  const NS = 'vocaforge:';
  const K = {
    cards: NS + 'cards',     // { [cardId]: {state,stability,difficulty,due,last_review,reps,lapses,is_leech,suspended} }
    logs: NS + 'logs',       // [ {card_id, reviewed_at, grade, elapsed_days, duration_ms, s_before,d_before,s_after,d_after} ]
    settings: NS + 'settings',
    daily: NS + 'daily',     // { 'YYYY-MM-DD': {new:n, review:n} }
    seen: NS + 'seen'        // 導入済みカードID set（新規上限管理用）
  };

  const DEFAULT_SETTINGS = {
    requestRetention: 0.9,
    newPerDay: 20,
    reviewPerDay: 200,
    interleave: true,
    strictInput: false,    // 入力採点: trueで完全一致, falseで正規化緩め
    formats: { 'mc-ej': true, 'mc-je': true, 'type-je': true }, // 有効な出題形式
    leechThreshold: 8
  };

  function load(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) { return fallback; }
  }
  function save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  function todayStr(now) {
    const d = new Date(now || Date.now());
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  const Store = {
    K,
    // ---- 設定 ----
    getSettings() {
      return Object.assign({}, DEFAULT_SETTINGS, load(K.settings, {}),
        { formats: Object.assign({}, DEFAULT_SETTINGS.formats, (load(K.settings, {}).formats || {})) });
    },
    setSettings(patch) {
      const s = Object.assign(this.getSettings(), patch);
      save(K.settings, s);
      return s;
    },

    // ---- カード状態 ----
    getAllCards() { return load(K.cards, {}); },
    getCard(id) { return this.getAllCards()[id] || null; },
    setCard(id, state) {
      const all = this.getAllCards();
      all[id] = state;
      save(K.cards, all);
    },

    // ---- 復習ログ ----
    getLogs() { return load(K.logs, []); },
    addLog(entry) {
      const logs = this.getLogs();
      logs.push(entry);
      // 上限管理（巨大化防止: 直近20000件）
      if (logs.length > 20000) logs.splice(0, logs.length - 20000);
      save(K.logs, logs);
    },

    // ---- 日次カウンタ ----
    getDaily(now) {
      const all = load(K.daily, {});
      const t = todayStr(now);
      return all[t] || { new: 0, review: 0 };
    },
    incDaily(kind, now) {
      const all = load(K.daily, {});
      const t = todayStr(now);
      if (!all[t]) all[t] = { new: 0, review: 0 };
      all[t][kind] = (all[t][kind] || 0) + 1;
      save(K.daily, all);
    },
    getDailyHistory() { return load(K.daily, {}); },

    // ---- 既出（導入済み）管理 ----
    getSeen() { return load(K.seen, {}); },
    markSeen(id) {
      const s = this.getSeen();
      s[id] = Date.now();
      save(K.seen, s);
    },

    // ---- 連続学習日数 ----
    streak() {
      const all = this.getDailyHistory();
      let count = 0;
      const d = new Date();
      while (true) {
        const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        const rec = all[key];
        if (rec && (rec.new + rec.review) > 0) { count++; d.setDate(d.getDate() - 1); }
        else break;
      }
      return count;
    },

    // ---- 全体統計 ----
    stats(allCardIds) {
      const cards = this.getAllCards();
      let nNew = 0, nLearning = 0, nReview = 0, nMature = 0, nLeech = 0;
      const total = allCardIds.length;
      allCardIds.forEach(id => {
        const c = cards[id];
        if (!c || c.state === 'new') { nNew++; return; }
        if (c.is_leech) nLeech++;
        if (c.state === 'relearning') { nLearning++; return; }
        if (c.stability >= 21) nMature++; else nReview++;
      });
      const logs = this.getLogs();
      const recent = logs.slice(-200);
      const correct = recent.filter(l => l.grade >= 3).length;
      const retention = recent.length ? Math.round(correct / recent.length * 100) : null;
      return {
        total, learned: total - nNew, nNew, nLearning, nReview, nMature, nLeech,
        retention, totalReviews: logs.length, streak: this.streak()
      };
    },

    todayStr,
    reset() {
      Object.values(K).forEach(k => localStorage.removeItem(k));
    },

    // ---- エクスポート / インポート ----
    // 学習データ（カード記憶状態・復習ログ・設定・日次統計・既出）をまとめて取り出す
    exportData() {
      return {
        app: 'vocaforge',
        type: 'vocaforge-backup',
        version: 1,
        exportedAt: new Date().toISOString(),
        data: {
          cards: load(K.cards, {}),
          logs: load(K.logs, []),
          settings: load(K.settings, {}),
          daily: load(K.daily, {}),
          seen: load(K.seen, {})
        }
      };
    },
    // mode: 'replace'（全置換）| 'merge'（カード/ログ/日次を統合）
    // 返り値: { ok, error }
    importData(obj, mode) {
      try {
        if (!obj || obj.type !== 'vocaforge-backup' || !obj.data) {
          return { ok: false, error: 'VocaForgeのバックアップファイルではありません' };
        }
        const d = obj.data;
        const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
        const cards = isObj(d.cards) ? d.cards : {};
        const logs = Array.isArray(d.logs) ? d.logs : [];
        const settings = isObj(d.settings) ? d.settings : {};
        const daily = isObj(d.daily) ? d.daily : {};
        const seen = isObj(d.seen) ? d.seen : {};

        if (mode === 'merge') {
          // カード: 取り込み側を優先して上書き統合
          save(K.cards, Object.assign({}, load(K.cards, {}), cards));
          // ログ: 連結して時刻順、上限管理
          const merged = load(K.logs, []).concat(logs)
            .sort((a, b) => (a.reviewed_at || 0) - (b.reviewed_at || 0));
          if (merged.length > 20000) merged.splice(0, merged.length - 20000);
          save(K.logs, merged);
          // 日次: 同日は新規/復習を合算
          const curDaily = load(K.daily, {});
          Object.keys(daily).forEach(day => {
            const a = curDaily[day] || { new: 0, review: 0 };
            const b = daily[day] || { new: 0, review: 0 };
            curDaily[day] = { new: (a.new || 0) + (b.new || 0), review: (a.review || 0) + (b.review || 0) };
          });
          save(K.daily, curDaily);
          // 既出: 統合
          save(K.seen, Object.assign({}, load(K.seen, {}), seen));
          // 設定は取り込み側で上書き（空なら現状維持）
          if (Object.keys(settings).length) save(K.settings, Object.assign(load(K.settings, {}), settings));
        } else {
          // replace: 完全置換
          save(K.cards, cards);
          save(K.logs, logs);
          save(K.daily, daily);
          save(K.seen, seen);
          save(K.settings, settings);
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, error: '読み込みに失敗しました（ファイルが壊れている可能性があります）' };
      }
    }
  };

  global.Store = Store;
})(window);
