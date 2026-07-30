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
    // 日次記録。1日1レコード。復習ログ(logs)とは完全に別の保存領域で、
    // logs の2万件キャップの影響を受けない（＝日次記録に上限は無い）。
    // レコードの形は DAILY_SHAPE 参照。
    daily: NS + 'daily',
    seen: NS + 'seen',       // 導入済みカードID set（新規上限管理用）
    reviewCount: NS + 'review_count', // 累計復習回数（ログ上限キャップの影響を受けない永続カウンタ）
    updatedAt: NS + 'updated_at', // ローカルデータの最終更新時刻(ms)。自動同期の新旧判定に使う
    // サーバーから最後に受け取った時刻(ms)。端末時計を検証するための基準。
    lastSeenServerTime: NS + 'last_seen_server_time',
    // 日次記録の「総数を確定させたか」の印。{ '2026-07-29': {dueTotal:1, weakTotal:1} }
    // 日次レコードの項目名は設計側で確定済みなので、確定フラグはレコードの外に持つ。
    // dueTotal が 0（その日は期限カードが1枚も無かった）でも「確定済み」を表せるようにするため
    // 値そのものでは判定しない。
    dailyFixed: NS + 'daily_fixed'
  };

  // ---- 日次記録のスキーマ ----
  // 項目名は設計側で確定済み。増やしたり改名したりしない。
  // 旧版の answered / correct / typedAnswered / typedCorrect / sessions /
  // sessions80 / relearned は廃止項目なので復活させない
  // （「解答回数」系の数字は報酬計算に一切使わない方針）。
  const DAILY_SHAPE = {
    // ── 既存（そのまま）
    new: 0,              // 新規に開いた枚数
    review: 0,           // 復習した枚数

    // ── 期限カード（ミッション 1・2・3・4・5・8 と報酬計算の中核）
    dueTotal: 0,         // その日の期限カード総数。その日の最初に確定させ、以後変えない
    dueDone: 0,          // うち消化した枚数
    dueCorrect: 0,       // うち客観的に正解した枚数

    // ── 新規カード（ミッション 6・7）
    newFirstPassed: 0,   // 新規カードが初回復習を突破した数

    // ── セッション（ミッション 5）
    sessionStarts: [],   // [{ startedAt: ISO文字列, dueDone: 数 }, ...]

    // ── 弱点（ミッション 9）
    weakTotal: 0,        // その日の弱点対象カード数
    weakDone: 0,         // うち消化した数

    // ── カテゴリ（ミッション 10）
    categories: [],      // ["語根:身体", "単語:Section 3", ...] 重複なし

    // ── テーマ別の成績（素材ステージのブースト判定用）
    themes: {},          // { "身体": { done: 5, correct: 4 }, ... }

    // ── ゲーム版で使う枠（学習版では常に 0。UIには出さない）
    game: {
      stageClears: 0,    // 素材ステージのクリア回数
      bossChallenges: 0, // ボス挑戦の回数
      upgrades: 0,       // キャラまたは武器の強化を実行した回数
      dispatches: 0      // 「遊学」に出した回数
    }
  };

  // オフライン学習を信じる上限（72時間）。これより古い時刻は 72時間前に丸める。
  const OFFLINE_TRUST_MS = 72 * 60 * 60 * 1000;

  // 旧レコード（new/review しか無い）を現行スキーマへ広げる。
  // 足りない項目は 0 / [] / {} で埋めるだけ。過去分の遡り補完はしない（遡れない）。
  function normalizeDaily(rec) {
    const src = (rec && typeof rec === 'object' && !Array.isArray(rec)) ? rec : {};
    const num = (v) => (typeof v === 'number' && isFinite(v)) ? v : 0;
    const g = (src.game && typeof src.game === 'object' && !Array.isArray(src.game)) ? src.game : {};
    const out = {
      new: num(src.new),
      review: num(src.review),
      dueTotal: num(src.dueTotal),
      dueDone: num(src.dueDone),
      dueCorrect: num(src.dueCorrect),
      newFirstPassed: num(src.newFirstPassed),
      sessionStarts: Array.isArray(src.sessionStarts)
        ? src.sessionStarts.filter(x => x && typeof x === 'object' && !Array.isArray(x))
            .map(x => ({ startedAt: String(x.startedAt || ''), dueDone: num(x.dueDone) }))
        : [],
      weakTotal: num(src.weakTotal),
      weakDone: num(src.weakDone),
      categories: Array.isArray(src.categories)
        ? src.categories.filter(c => typeof c === 'string')
        : [],
      themes: {},
      game: {
        stageClears: num(g.stageClears),
        bossChallenges: num(g.bossChallenges),
        upgrades: num(g.upgrades),
        dispatches: num(g.dispatches)
      }
    };
    // themes: { テーマ名: {done, correct} }
    if (src.themes && typeof src.themes === 'object' && !Array.isArray(src.themes)) {
      Object.keys(src.themes).forEach(name => {
        const t = src.themes[name];
        if (!t || typeof t !== 'object' || Array.isArray(t)) return;
        out.themes[name] = { done: num(t.done), correct: num(t.correct) };
      });
    }
    // categories は重複なし
    const uniq = [];
    out.categories.forEach(c => { if (uniq.indexOf(c) === -1) uniq.push(c); });
    out.categories = uniq;
    return out;
  }

  // 日次レコード1件ぶんのマージ（同期・手動インポート共通）。
  // 数値は「大きい方」（その日の累計スナップショットなので加算してはいけない）。
  // 配列/オブジェクトの項目は Math.max が使えないので項目ごとに規則を決める。
  function mergeDailyRec(aRaw, bRaw) {
    const a = normalizeDaily(aRaw), b = normalizeDaily(bRaw);
    const out = {};
    ['new', 'review', 'dueTotal', 'dueDone', 'dueCorrect',
      'newFirstPassed', 'weakTotal', 'weakDone'].forEach(k => {
      out[k] = Math.max(a[k], b[k]);
    });
    // sessionStarts: startedAt をキーに和集合。同じ startedAt は dueDone の大きい方。
    const byStart = Object.create(null);
    const order = [];
    a.sessionStarts.concat(b.sessionStarts).forEach(s => {
      if (!s.startedAt) return;
      if (!(s.startedAt in byStart)) { byStart[s.startedAt] = s.dueDone; order.push(s.startedAt); }
      else if (s.dueDone > byStart[s.startedAt]) byStart[s.startedAt] = s.dueDone;
    });
    order.sort();
    out.sessionStarts = order.map(key => ({ startedAt: key, dueDone: byStart[key] }));
    // categories: 和集合（重複なし）
    out.categories = a.categories.slice();
    b.categories.forEach(c => { if (out.categories.indexOf(c) === -1) out.categories.push(c); });
    // themes: テーマごとに done / correct の大きい方
    out.themes = {};
    Object.keys(a.themes).concat(Object.keys(b.themes)).forEach(name => {
      if (out.themes[name]) return;
      const ta = a.themes[name] || { done: 0, correct: 0 };
      const tb = b.themes[name] || { done: 0, correct: 0 };
      out.themes[name] = { done: Math.max(ta.done, tb.done), correct: Math.max(ta.correct, tb.correct) };
    });
    // game: キーごとに大きい方
    out.game = {};
    Object.keys(a.game).forEach(k => { out.game[k] = Math.max(a.game[k], b.game[k]); });
    return out;
  }

  // ---- 時刻の扱い（B-5: オフライン学習を上限付きで信じる）----
  // 端末の時計はそのまま信じない。サーバーから最後に受け取った時刻
  // （lastSeenServerTime）を「実時間はこれ以降である」という基準として持ち、
  // ・基準より未来の時刻を持つセッションは捨てる
  // ・72時間より古いものは 72時間前に丸める
  // という2点だけをここで担保する（報酬計算そのものはサーバー側）。
  function serverTimeRef() { return load(K.lastSeenServerTime, 0) || 0; }

  // 記録時点で使う「信頼できる現在時刻」。
  // 端末時計が基準より過去に戻っていたら基準を採用する。
  function trustedNow(now) {
    const dev = (typeof now === 'number' && isFinite(now)) ? now : Date.now();
    const srv = serverTimeRef();
    return (srv && dev < srv) ? srv : dev;
  }

  // セッション開始時刻の検証と丸め。戻り値: 採用する ms、または null（捨てる）。
  function normalizeSessionTime(startedAtMs, now) {
    if (typeof startedAtMs !== 'number' || !isFinite(startedAtMs)) return null;
    const ref = trustedNow(now);
    // 未来の開始時刻はあり得ない（端末時計を先に進めた記録）→ 捨てる
    if (startedAtMs > ref + 5 * 60 * 1000) return null;
    // 72時間より古いものは 72時間前に丸める（オフライン分をまとめて送るとき）
    const floor = ref - OFFLINE_TRUST_MS;
    return (startedAtMs < floor) ? floor : startedAtMs;
  }

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

  // ---- マージ規則（クラウド同期と手動インポートの共通実装）----
  // 「同じユーザーの2つのスナップショット」を突き合わせる前提の規則。
  // cards / logs / daily / seen / reviewCount の決め方はここ1箇所にしか書かない。
  // mergeData()（同期）と importData('merge')（手動インポート）の両方がこれを使うため、
  // 経路によって結果が変わることはない。
  // settings は経路ごとに採用ルールが異なるため、呼び出し側で決める。
  // 引数はどちらも {cards, logs, daily, seen, reviewCount} 形。l=ローカル, r=相手側。
  // ---- 行単位同期（card_states）用のヘルパ ----
  // カードを「実際に触った時刻」(ms)。行単位同期の updated_at_ms と同じ意味。
  // 手元のカード状態には updated_at_ms が無い場合があるので last_review で代用する。
  function cardTouchedAt(c) {
    if (!c || typeof c !== 'object') return 0;
    const u = Number(c.updated_at_ms);
    if (isFinite(u) && u > 0) return u;
    const l = Number(c.last_review);
    return (isFinite(l) && l > 0) ? l : 0;
  }
  // サーバー行（card_states）を手元のカード状態の形に直す。
  // ・deck / group はサーバーに列が無い付随情報なので、手元にあれば引き継ぐ
  // ・is_leech もサーバーに列が無いので lapses と閾値から作り直す
  function adoptRemoteCard(b, localPrev, leechThr) {
    const n = (v) => { const x = Number(v); return isFinite(x) ? x : 0; };
    const lapses = n(b.lapses);
    const out = {
      state: b.state || 'new',
      stability: n(b.stability), difficulty: n(b.difficulty),
      due: n(b.due), last_review: n(b.last_review),
      reps: n(b.reps), lapses: lapses,
      is_leech: lapses >= (leechThr || 8),
      suspended: !!b.suspended,
      updated_at_ms: cardTouchedAt(b)
    };
    if (localPrev && typeof localPrev === 'object') {
      if (localPrev.deck !== undefined) out.deck = localPrev.deck;
      if (localPrev.group !== undefined) out.group = localPrev.group;
    }
    return out;
  }

  function mergeCore(l, r) {
    // 1) cards: card_id ごとに照合。片方にしか無いものは必ず残す。
    //    両方にある場合 last_review が新しい方 → reps が多い方 → r。
    const cards = {};
    const cardIds = Object.keys(l.cards);
    Object.keys(r.cards).forEach(id => { if (!(id in l.cards)) cardIds.push(id); });
    cardIds.forEach(id => {
      const a = l.cards[id], b = r.cards[id];
      if (!b) { cards[id] = a; return; }
      if (!a) { cards[id] = b; return; }
      const la = a.last_review || 0, lb = b.last_review || 0;
      if (la > lb) { cards[id] = a; return; }
      if (lb > la) { cards[id] = b; return; }
      const ra = a.reps || 0, rb2 = b.reps || 0;
      if (ra > rb2) { cards[id] = a; return; }
      cards[id] = b; // reps も同じ（または r が多い）→ r 採用
    });

    // 2) logs: card_id + reviewed_at をキーに重複除去して合併、reviewed_at 昇順。
    const seenLogKeys = Object.create(null);
    const logs = [];
    const pushLog = (x) => {
      if (!x || typeof x !== 'object') return;
      const key = String(x.card_id) + '@' + String(x.reviewed_at);
      if (seenLogKeys[key]) return;
      seenLogKeys[key] = 1;
      logs.push(x);
    };
    l.logs.forEach(pushLog);
    r.logs.forEach(pushLog);
    logs.sort((a, b) => (a.reviewed_at || 0) - (b.reviewed_at || 0));
    const mergedLogLen = logs.length; // 上限カット前の総数
    if (logs.length > 20000) logs.splice(0, logs.length - 20000);

    // 3) daily: 日付ごとに各カウンタの大きい方。
    //    日次カウンタは「その日の累計スナップショット」なので加算してはいけない
    //    （加算すると同じバックアップを取り込むだけで学習数が二重計上される）。
    const daily = {};
    const days = Object.keys(l.daily);
    Object.keys(r.daily).forEach(d => { if (!(d in l.daily)) days.push(d); });
    //    数値以外の項目（sessionStarts / categories / themes / game）は
    //    Math.max が使えないので mergeDailyRec() で項目ごとに合体する。
    days.forEach(day => {
      daily[day] = mergeDailyRec(l.daily[day], r.daily[day]);
    });

    // 4) seen: 和集合（値は新しい方＝大きい方）
    const seen = Object.assign({}, l.seen);
    Object.keys(r.seen).forEach(id => {
      if (!(id in seen) || (r.seen[id] || 0) > (seen[id] || 0)) seen[id] = r.seen[id];
    });

    // 5) reviewCount: 大きい方（合併後のログ総数も下限として考慮）
    const reviewCount = Math.max(l.reviewCount || 0, r.reviewCount || 0, mergedLogLen);

    return { cards, logs, daily, seen, reviewCount, mergedLogLen };
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
    // 読み出しは必ず normalizeDaily() を通すので、new/review しか無い旧レコードでも
    // 現行スキーマ（不足項目は 0 / [] / {}）で返る。過去分の遡り補完はしない。
    getDaily(now) {
      const all = load(K.daily, {});
      return normalizeDaily(all[todayStr(now)]);
    },
    // 既存の呼び出し元（session-answer.js）互換のためシグネチャ・挙動は変えない。
    incDaily(kind, now) {
      const all = load(K.daily, {});
      const t = todayStr(now);
      if (!all[t]) all[t] = { new: 0, review: 0 };
      all[t][kind] = (all[t][kind] || 0) + 1;
      save(K.daily, all);
    },
    getDailyHistory() {
      const all = load(K.daily, {});
      const out = {};
      Object.keys(all).forEach(d => { out[d] = normalizeDaily(all[d]); });
      return out;
    },
    // 生のまま（マイグレーションや同期の内部用）
    getDailyRaw() { return load(K.daily, {}); },

    // ---- 日次記録の更新（新項目用）----
    // incDaily() は壊さず、新項目はこちらで書く。
    // updater(rec) の中で rec を書き換える。rec は normalizeDaily 済み。
    updateDaily(now, updater) {
      const all = load(K.daily, {});
      const t = todayStr(now);
      const rec = normalizeDaily(all[t]);
      updater(rec);
      all[t] = rec;
      save(K.daily, all);
      return rec;
    },

    // 「その日の総数をもう確定させたか」の印。dueTotal が 0 の日
    // （期限カードが1枚も無かった日）も確定済みとして扱えるようにする。
    _dailyFixed(field, now) {
      const all = load(K.dailyFixed, {});
      const t = todayStr(now);
      return !!(all[t] && all[t][field]);
    },
    _markDailyFixed(field, now) {
      const all = load(K.dailyFixed, {});
      const t = todayStr(now);
      if (!all[t]) all[t] = {};
      all[t][field] = 1;
      // 古い印は残さない（当日と前日ぶんだけ持つ）
      const keep = {};
      keep[t] = all[t];
      const y = todayStr((typeof now === 'number' ? now : Date.now()) - 86400000);
      if (all[y]) keep[y] = all[y];
      _suspendDirty = true;   // 印は同期対象ではない
      try { save(K.dailyFixed, keep); } finally { _suspendDirty = false; }
    },

    // 期限カード総数。★その日の最初に見た時点で確定させ、後から一切増やさない。
    // 「新規を開くほど全消化が遠のく」逆転を防ぐため、新規カードの初回復習は
    // ここに足さない（newFirstPassed だけで数える）。
    setDailyDueTotal(n, now) {
      if (this._dailyFixed('dueTotal', now)) return null;   // 既に確定済み → 絶対に変えない
      const total = (typeof n === 'number' && isFinite(n) && n > 0) ? Math.floor(n) : 0;
      const rec = this.updateDaily(now, r => {
        if (r.dueTotal > 0) return;   // 他端末から同期された値があれば尊重する
        r.dueTotal = total;
      });
      this._markDailyFixed('dueTotal', now);
      return rec;
    },
    // 期限カードを1枚消化した。correct は「入力/選択した答えが合っていたか」の
    // 客観判定のみを渡すこと（FSRSのボタン=もう一度/難しい/できた/簡単 は混ぜない）。
    incDailyDueDone(correct, now) {
      return this.updateDaily(now, rec => {
        rec.dueDone += 1;
        if (correct) rec.dueCorrect += 1;
      });
    },
    // 新規カードが初回復習を突破した
    incDailyNewFirstPassed(now) {
      return this.updateDaily(now, rec => { rec.newFirstPassed += 1; });
    },

    // 弱点対象カード数（こちらもその日の最初に確定させ、後から変えない）
    setDailyWeakTotal(n, now) {
      if (this._dailyFixed('weakTotal', now)) return null;
      const total = (typeof n === 'number' && isFinite(n) && n > 0) ? Math.floor(n) : 0;
      const rec = this.updateDaily(now, r => {
        if (r.weakTotal > 0) return;
        r.weakTotal = total;
      });
      this._markDailyFixed('weakTotal', now);
      return rec;
    },
    incDailyWeakDone(now) {
      return this.updateDaily(now, rec => { rec.weakDone += 1; });
    },

    // カテゴリ（ミッション10「異なるカテゴリ2種類以上」判定用）。重複は入れない。
    addDailyCategory(category, now) {
      if (typeof category !== 'string' || !category) return null;
      return this.updateDaily(now, rec => {
        if (rec.categories.indexOf(category) === -1) rec.categories.push(category);
      });
    },
    // テーマ別成績（素材ステージのブースト判定用）。語根カードのみ呼ぶ。
    // correct は客観判定（ボタンではない）。
    addDailyTheme(theme, correct, now) {
      if (typeof theme !== 'string' || !theme) return null;
      return this.updateDaily(now, rec => {
        const t = rec.themes[theme] || (rec.themes[theme] = { done: 0, correct: 0 });
        t.done += 1;
        if (correct) t.correct += 1;
      });
    },

    // セッション記録。dueDone が 1 以上のセッションだけ入れる
    // （開いただけで何も消化しなかったセッションは記録しない）。
    // startedAtMs はサーバー基準時刻で検証し、未来なら捨て、72時間より古ければ丸める。
    addDailySession(startedAtMs, dueDone, now) {
      const done = (typeof dueDone === 'number' && isFinite(dueDone)) ? Math.floor(dueDone) : 0;
      if (done < 1) return null;                        // 消化ゼロは記録しない
      const ms = normalizeSessionTime(startedAtMs, now);
      if (ms === null) return null;                     // 未来の時刻 → 捨てる
      const startedAt = new Date(ms).toISOString();
      return this.updateDaily(now, rec => {
        const hit = rec.sessionStarts.filter(s => s.startedAt === startedAt)[0];
        if (hit) { if (done > hit.dueDone) hit.dueDone = done; return; }
        rec.sessionStarts.push({ startedAt, dueDone: done });
      });
    },
    // 保存済みの sessionStarts を現在のサーバー基準時刻で再検証する。
    // オフラインで貯まった分をまとめて送る直前に呼ぶ想定。
    // ・基準より未来の時刻 → 捨てる
    // ・72時間より古い時刻 → 72時間前に丸める
    reconcileDailySessions(now) {
      const all = load(K.daily, {});
      const days = Object.keys(all);
      if (!days.length) return 0;
      const ref = trustedNow(now);
      const floorMs = ref - OFFLINE_TRUST_MS;
      let changed = 0;
      days.forEach(day => {
        const rec = normalizeDaily(all[day]);
        if (!rec.sessionStarts.length) { all[day] = rec; return; }
        const kept = [];
        rec.sessionStarts.forEach(s => {
          const ms = Date.parse(s.startedAt);
          if (!isFinite(ms)) { changed++; return; }                 // 壊れた時刻 → 捨てる
          if (ms > ref + 5 * 60 * 1000) { changed++; return; }      // 未来 → 捨てる
          if (ms < floorMs) {                                      // 古すぎ → 72時間に丸める
            kept.push({ startedAt: new Date(floorMs).toISOString(), dueDone: s.dueDone });
            changed++;
            return;
          }
          kept.push(s);
        });
        rec.sessionStarts = kept;
        all[day] = rec;
      });
      if (changed) save(K.daily, all);
      return changed;
    },

    // ---- ゲーム版で使う枠（学習版では常に 0。UIには出さない）----
    // 読み書きできる器だけ用意しておく。
    getDailyGame(now) { return this.getDaily(now).game; },
    incDailyGame(kind, n, now) {
      if (!(kind in DAILY_SHAPE.game)) return null;
      const add = (typeof n === 'number' && isFinite(n)) ? Math.floor(n) : 1;
      return this.updateDaily(now, rec => { rec.game[kind] += add; });
    },

    // ---- サーバー基準時刻（端末時計を信じないための基準）----
    getLastSeenServerTime() { return serverTimeRef(); },
    setLastSeenServerTime(ms) {
      if (typeof ms !== 'number' || !isFinite(ms) || ms <= 0) return;
      if (ms <= serverTimeRef()) return;   // 基準は巻き戻さない
      _suspendDirty = true;                // 同期のトリガーにはしない
      try { save(K.lastSeenServerTime, ms); } finally { _suspendDirty = false; }
    },
    OFFLINE_TRUST_MS,

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
    // ---- ローカル と リモート の合体（マージ）----
    // 同期経路はこれを使う。「どちらか一方で全置換」をやめ、両端末の学習を残す。
    // remote: exportData().data と同形（+ 任意で updatedAt）
    // 戻り値: 合体後のデータ（exportData().data と同形。updatedAt を含む）
    mergeData(remote) {
      const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
      const r = isObj(remote) ? remote : {};
      const rCards = isObj(r.cards) ? r.cards : {};
      const rLogs = Array.isArray(r.logs) ? r.logs : [];
      const rDaily = isObj(r.daily) ? r.daily : {};
      const rSeen = isObj(r.seen) ? r.seen : {};
      const rSettings = isObj(r.settings) ? r.settings : {};
      const rCount = typeof r.reviewCount === 'number' ? r.reviewCount : rLogs.length;
      const rUpdatedAt = typeof r.updatedAt === 'number' ? r.updatedAt : 0;

      const lCards = load(K.cards, {});
      const lLogs = loadLogs();
      const lDaily = load(K.daily, {});
      const lSeen = load(K.seen, {});
      const lSettings = load(K.settings, {});
      const lCount = this.getReviewCount();
      const lUpdatedAt = this.getUpdatedAt();

      // 1)〜5) cards / logs / daily / seen / reviewCount は共通規則（mergeCore）で決める。
      //        手動インポートの 'merge' も同じ関数を通るので経路差は生じない。
      const core = mergeCore(
        { cards: lCards, logs: lLogs, daily: lDaily, seen: lSeen, reviewCount: lCount },
        { cards: rCards, logs: rLogs, daily: rDaily, seen: rSeen, reviewCount: rCount }
      );
      const cards = core.cards;
      const logs = core.logs;
      const daily = core.daily;
      const seen = core.seen;
      const reviewCount = core.reviewCount;

      // 6) settings: レコード全体の updatedAt が新しい側をそのまま採用（項目別マージしない）
      const settings = (rUpdatedAt > lUpdatedAt) ? rSettings : lSettings;

      // 7) updatedAt: 大きい方
      const updatedAt = Math.max(lUpdatedAt || 0, rUpdatedAt || 0);

      // ローカルへ保存（同期由来なので dirty 通知は出さない）
      _suspendDirty = true;
      try {
        save(K.cards, cards);
        saveLogs(logs);
        save(K.daily, daily);
        save(K.seen, seen);
        save(K.settings, settings);
        save(K.reviewCount, reviewCount);
      } finally {
        _suspendDirty = false;
      }
      this.setUpdatedAt(updatedAt);

      return { cards, logs, settings, daily, seen, reviewCount, updatedAt };
    },

    // ---- 行単位同期の読み込み（カード1枚ずつの合体）----
    // これまでは「サーバーか手元か、新しい方を採用してもう一方を捨てる」形だった。
    // 丸ごと入れ替えるとどちらかの学習が必ず消えるため、カードID単位で照合する。
    //   ・片方にしかない  → ある方を採用
    //   ・両方にある      → updated_at_ms が新しい方を採用
    //   ・完全に同じ時刻  → 何もしない（どちらでも同じ）
    // remoteCards: { [cardId]: card_states の1行 }
    // 戻り値: { total, fromServer, localNewer, added, same, localOnly, toPush }
    //   toPush = 手元の方が新しい（またはサーバーに無い）カードID。呼び出し側が箱に入れる。
    mergeCardStatesByTime(remoteCards) {
      const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
      const rc = isObj(remoteCards) ? remoteCards : {};
      const local = load(K.cards, {});
      const leechThr = this.getSettings().leechThreshold || 8;
      let fromServer = 0, localNewer = 0, added = 0, same = 0, localOnly = 0;
      const toPush = [];
      const out = {};
      const ids = Object.keys(local);
      Object.keys(rc).forEach(id => { if (!(id in local)) ids.push(id); });
      ids.forEach(id => {
        const a = local[id], b = rc[id];
        if (!b) {                       // 手元にしかない → 手元を採用（サーバーへ送る）
          out[id] = a; localOnly++; toPush.push(id); return;
        }
        if (!a) {                       // サーバーにしかない → 取得する
          out[id] = adoptRemoteCard(b, null, leechThr); added++; return;
        }
        const ta = cardTouchedAt(a), tb = cardTouchedAt(b);
        if (tb > ta) { out[id] = adoptRemoteCard(b, a, leechThr); fromServer++; return; }
        if (ta > tb) { out[id] = a; localNewer++; toPush.push(id); return; }
        out[id] = a; same++;            // 完全に同じ時刻 → 何もしない
      });
      // 同期由来の一括書き込みなので dirty 通知は出さない
      _suspendDirty = true;
      try { save(K.cards, out); } finally { _suspendDirty = false; }
      return {
        total: Object.keys(out).length,
        fromServer, localNewer, added, same, localOnly, toPush
      };
    },

    // 復習ログは追記のみ。手元のログは絶対に消さない。
    // 手元に無いものだけ足して reviewed_at の昇順に並べ直す。
    // 同一判定キーは (card_id, reviewed_at)。
    appendMissingLogs(remoteLogs) {
      const rl = Array.isArray(remoteLogs) ? remoteLogs : [];
      const logs = loadLogs();
      const keyOf = x => String(x.card_id) + '@' + String(x.reviewed_at);
      const seenKeys = Object.create(null);
      logs.forEach(x => { if (x && typeof x === 'object') seenKeys[keyOf(x)] = 1; });
      let added = 0;
      rl.forEach(x => {
        if (!x || typeof x !== 'object' || x.card_id == null || x.reviewed_at == null) return;
        const k = keyOf(x);
        if (seenKeys[k]) return;
        seenKeys[k] = 1;
        logs.push(x);
        added++;
      });
      logs.sort((a, b) => (a.reviewed_at || 0) - (b.reviewed_at || 0));
      const mergedLen = logs.length;
      if (logs.length > 20000) logs.splice(0, logs.length - 20000);
      _suspendDirty = true;
      try {
        saveLogs(logs);
        save(K.reviewCount, Math.max(load(K.reviewCount, 0) || 0, mergedLen));
      } finally { _suspendDirty = false; }
      return { added, total: logs.length };
    },

    // 日次記録は日付ごとに「項目の型別」で合体する（mergeDailyRec と同じ規則）。
    // 絶対に足し算しない。両端末が同じ学習を数えている可能性があるため。
    // dueTotal は「その日の期限カード総数」なので本来どの端末でも同じ値になるはず。
    // 食い違ったら大きい方を採用した上で呼び出し側に知らせる（確定処理のバグの兆候）。
    // remoteDaily: { '2026-07-30': 日次レコード, ... }
    // 戻り値: { days, changed, mismatches:[{day, local, remote}] }
    mergeDailyStatsRows(remoteDaily) {
      const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
      const rd = isObj(remoteDaily) ? remoteDaily : {};
      const ld = load(K.daily, {});
      const before = JSON.stringify(ld);
      const out = {};
      const mismatches = [];
      const days = Object.keys(ld);
      Object.keys(rd).forEach(d => { if (!(d in ld)) days.push(d); });
      days.forEach(day => {
        const a = ld[day], b = rd[day];
        if (a && b) {
          const na = normalizeDaily(a), nb = normalizeDaily(b);
          if (na.dueTotal !== nb.dueTotal) {
            mismatches.push({ day: day, local: na.dueTotal, remote: nb.dueTotal });
          }
        }
        out[day] = mergeDailyRec(a, b);
      });
      const after = JSON.stringify(out);
      _suspendDirty = true;
      try { save(K.daily, out); } finally { _suspendDirty = false; }
      return { days: Object.keys(out).length, changed: before !== after, mismatches: mismatches };
    },

    // 1日分の日次レコードを合体する規則を外へ出したもの（outbox.js が使う）。
    // 保存はしない。純粋な計算。
    mergeDailyRecord(a, b) { return mergeDailyRec(a, b); },

    // カードを「実際に触った時刻」(ms)。行単位同期の updated_at_ms に入れる値。
    cardTouchedAt(c) { return cardTouchedAt(c); },

    // exportData と同形のペイロードをそのまま適用（クラウド→ローカル反映用）
    // mode: 'replace' | 'merge'。通知を出さずに適用する。
    // 注意: 同期経路からは使わない（全置換はデータ消失につながるため）。
    //       インポート機能など、ユーザーが明示的に選んだ場合のみ。
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
          // cards / logs / daily / seen / reviewCount は同期経路と同じ共通規則で合体する。
          // （以前はここだけ「カードは取り込み側で上書き」「日次は加算」という別規則で、
          //   同じファイルを2回取り込むと日次が二重計上され、復習済みカードが
          //   古い状態に巻き戻ることがあった）
          const core = mergeCore(
            {
              cards: load(K.cards, {}),
              logs: loadLogs(),
              daily: load(K.daily, {}),
              seen: load(K.seen, {}),
              reviewCount: this.getReviewCount()
            },
            { cards: cards, logs: logs, daily: daily, seen: seen, reviewCount: inCount }
          );
          save(K.cards, core.cards);
          saveLogs(core.logs);
          save(K.daily, core.daily);
          save(K.seen, core.seen);
          save(K.reviewCount, core.reviewCount);
          // 設定は取り込み側で上書き（空なら現状維持）。
          // ※ mergeData（同期）は「レコードの updatedAt が新しい側を丸ごと採用」だが、
          //   手動インポートはユーザーが明示的に選んだ操作なので取り込み側を優先する。
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
