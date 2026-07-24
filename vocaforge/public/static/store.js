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
    seen: NS + 'seen',       // 導入済みカードID set（新規上限管理用）
    reviewCount: NS + 'review_count', // 累計復習回数（ログ上限キャップの影響を受けない永続カウンタ）
    updatedAt: NS + 'updated_at' // ローカルデータの最終更新時刻(ms)。自動同期の新旧判定に使う
  };

  const DEFAULT_SETTINGS = {
    requestRetention: 0.9,
    newPerDay: 20,
    reviewPerDay: 200,
    interleave: true,
    strictInput: false,    // 入力採点: trueで完全一致, falseで正規化緩め
    formats: { 'mc-ej': true, 'mc-je': true, 'type-je': true, 'cloze': true }, // 有効な出題形式（cloze=例文穴埋め・復習用）
    leechThreshold: 8,
    sectionNewLimit: 50, // セクション明示選択時の1回あたり新規カード数（下限10）
    wordDataset: 'target1900', // 単語DB: 'target1900'(1900語) | 'full'(発音/品詞/例文付き) | 'leap'
    phraseDataset: 'target1000' // 熟語DB: 'target1000'(1000熟語) | 'full'(3238熟語・補足/例文付き)
  };

  function load(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) { return fallback; }
  }
  // 書き込み時に変更を通知（クラウド同期トリガー用）。
  // _suspendDirty 中（インポート/同期適用中）は通知しない。
  let _dirtyHandlers = [];
  let _suspendDirty = false;
  function save(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
    // 学習データが変わったら最終更新時刻を刻む（updatedAt 自身の書き込みは除外）。
    // suspendDirty 中（クラウドからの適用中）は別途 setUpdatedAt() で時刻を合わせる。
    if (!_suspendDirty && key !== K.updatedAt) {
      try { localStorage.setItem(K.updatedAt, JSON.stringify(Date.now())); } catch (e) {}
      _dirtyHandlers.forEach(fn => { try { fn(key); } catch (e) {} });
    }
  }

  // ログのメモリキャッシュ。
  // ログは最大約3.3MB（2万件）に肥大化し、毎解答の JSON.parse が実測 ~45ms かかるため、
  // 一度パースした配列を保持して再パースを排除する（stringifyは書き込みに必要なので残る）。
  // 注意: getLogs() はこのキャッシュ配列をそのまま返す。外部で要素を変更する場合は
  // 必ず slice() してから使うこと（optimizer.js は既に slice 済み）。
  let _logsCache = null;
  function loadLogs() {
    if (_logsCache === null) _logsCache = load(K.logs, []);
    return _logsCache;
  }
  function saveLogs(logs) {
    _logsCache = logs;
    save(K.logs, logs);
  }

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
    getLogs() { return loadLogs(); },
    // 累計復習回数（キャップ削除後も正確な総数を保つ）
    getReviewCount() {
      // 既存ユーザーの移行: カウンタ未初期化（またはログ数未満）なら現ログ数を下限とする
      return Math.max(load(K.reviewCount, 0) || 0, this.getLogs().length);
    },
    addLog(entry) {
      const logs = loadLogs();
      // 累計カウンタ更新（キャップ前に確定させる）
      const cnt = Math.max(load(K.reviewCount, 0) || 0, logs.length) + 1;
      save(K.reviewCount, cnt);
      logs.push(entry);
      // 上限管理（巨大化防止: 直近20000件）
      if (logs.length > 20000) logs.splice(0, logs.length - 20000);
      saveLogs(logs);
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

    // ---- カードIDマイグレーション ----
    // mapping: { oldId: newId }。cards / seen / logs の ID を付け替える。
    // 旧IDと新IDの両方に進捗がある場合は last_review が新しい方を残す。
    migrateCardIds(mapping) {
      const ids = Object.keys(mapping);
      if (!ids.length) return 0;
      let moved = 0;
      const cards = this.getAllCards();
      for (const oldId of ids) {
        const newId = mapping[oldId];
        if (!cards[oldId]) continue;
        const oldC = cards[oldId], newC = cards[newId];
        if (!newC || (oldC.last_review || 0) > (newC.last_review || 0)) {
          cards[newId] = oldC;
        }
        delete cards[oldId];
        moved++;
      }
      if (moved) save(K.cards, cards);
      const seen = load(K.seen, {});
      let seenMoved = false;
      for (const oldId of ids) {
        if (oldId in seen) {
          const newId = mapping[oldId];
          if (!(newId in seen) || seen[oldId] > seen[newId]) seen[newId] = seen[oldId];
          delete seen[oldId];
          seenMoved = true;
        }
      }
      if (seenMoved) save(K.seen, seen);
      const logs = this.getLogs();
      let logMoved = false;
      for (const l of logs) {
        if (l.card_id && mapping[l.card_id]) { l.card_id = mapping[l.card_id]; logMoved = true; }
      }
      if (logMoved) saveLogs(logs);
      return moved;
    },
    // 進捗の中に prefix で始まる ID があるか（マイグレーション要否の判定用）
    hasCardIdPrefix(prefix) {
      const cards = this.getAllCards();
      for (const id in cards) if (id.indexOf(prefix) === 0) return true;
      const seen = load(K.seen, {});
      for (const id in seen) if (id.indexOf(prefix) === 0) return true;
      return false;
    },

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
        retention, totalReviews: this.getReviewCount(), streak: this.streak()
      };
    },

    todayStr,

    // ---- ローカル最終更新時刻（自動同期の新旧判定用）----
    getUpdatedAt() { return load(K.updatedAt, 0) || 0; },
    // クラウドから取り込んだ直後などに、時刻をクラウド側と一致させる
    setUpdatedAt(ms) {
      try { localStorage.setItem(K.updatedAt, JSON.stringify(ms || Date.now())); } catch (e) {}
    },

    reset() {
      Object.values(K).forEach(k => localStorage.removeItem(k));
      _logsCache = null; // メモリキャッシュも破棄
      _dirtyHandlers.forEach(fn => { try { fn('reset'); } catch (e) {} });
    },

    // ---- クラウド同期サポート ----
    // 書き込み発生時に呼ばれるハンドラを登録（クラウド同期トリガー）
    onDirty(fn) { if (typeof fn === 'function') _dirtyHandlers.push(fn); },
    // 同期適用などローカル一括書き換え中はダーティ通知を止める
    suspendDirty(flag) { _suspendDirty = !!flag; },
    // exportData と同形のペイロードをそのまま適用（クラウド→ローカル反映用）
    // mode: 'replace' | 'merge'。通知を出さずに適用する。
    applyData(payload, mode) {
      _suspendDirty = true;
      let res;
      try {
        res = this.importData({ type: 'vocaforge-backup', data: payload }, mode || 'replace');
      } finally {
        _suspendDirty = false;
      }
      return res;
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
          logs: loadLogs(),
          settings: load(K.settings, {}),
          daily: load(K.daily, {}),
          seen: load(K.seen, {}),
          reviewCount: this.getReviewCount()
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
        const inCount = typeof d.reviewCount === 'number' ? d.reviewCount : logs.length;

        if (mode === 'merge') {
          // カード: 取り込み側を優先して上書き統合
          save(K.cards, Object.assign({}, load(K.cards, {}), cards));
          // ログ: 連結して時刻順、上限管理
          const merged = loadLogs().concat(logs)
            .sort((a, b) => (a.reviewed_at || 0) - (b.reviewed_at || 0));
          const mergedLen = merged.length; // キャップ前の連結総数
          if (merged.length > 20000) merged.splice(0, merged.length - 20000);
          saveLogs(merged);
          // 累計カウンタ: 重複不明のため「双方の累計と連結総数の最大値」を採用（過小評価を防ぐ）
          save(K.reviewCount, Math.max(this.getReviewCount(), inCount, mergedLen));
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
          saveLogs(logs.slice());
          save(K.daily, daily);
          save(K.seen, seen);
          save(K.settings, settings);
          save(K.reviewCount, Math.max(inCount, logs.length));
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, error: '読み込みに失敗しました（ファイルが壊れている可能性があります）' };
      }
    }
  };

  global.Store = Store;
})(window);
