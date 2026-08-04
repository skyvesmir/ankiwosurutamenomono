/* 行単位のクラウド書き込み ＝ 送信待ちの箱（非module IIFE）
 *
 * なぜ作るか:
 *   これまでは学習データ全体（約3.3MB）を丸ごと user_data に上書きしていた。
 *   丸ごと上書きは「サーバーか手元のどちらかを捨てる」形なので、新旧の判定を
 *   どれだけ賢くしてもデータ消失の可能性が残る（消失事故の根本原因）。
 *   1問解くごとにその1枚分だけを送れば、スマホとPCで別のカードをやっても
 *   両方残る。どちらかを捨てる必要が原理的に無くなる。
 *
 * このファイルが持つもの:
 *   1. 送信待ちの箱（localStorage: vocaforge:outbox）
 *   2. card_states / review_logs / daily_stats への行単位の書き込み
 *   3. 読み込み用の取得関数（cloud-sync.js の初期同期が使う）
 *
 * 守っていること:
 *   - 箱のキーは Store.K に入れない。Store.reset()（ログアウト）は K の
 *     キーだけを消すので、箱は絶対に消えない。クラウド取り込み時も消さない。
 *   - 既存の丸ごと同期（cloud-sync.js）は止めない。並行で動かす。
 *   - updated_at_ms には「送信した時刻」ではなく
 *     「そのカードを実際に触った時刻」を入れる。ここを間違えると
 *     古い内容の送信でサーバー時刻だけが進み、新しいデータを潰す。
 *
 * 確認用: VFOutbox.pending()
 */
(function (global) {
  'use strict';

  // 箱のキー。Store.K には入れない（reset で消えないようにするため）。
  const OUTBOX_KEY = 'vocaforge:outbox';

  const TBL_CARD = 'card_states';
  const TBL_LOG = 'review_logs';
  const TBL_DAILY = 'daily_stats';

  const BASE_DELAY = 3000;              // 再試行の最小間隔
  const MAX_DELAY = 5 * 60 * 1000;      // 再試行の最大間隔（徐々に広げた上限）
  const PASS_LIMIT = 200;               // 1回のパスで送る最大件数（長時間占有しない）
  const WARN_TRIES = 5;                 // 何度も失敗する項目を知らせる閾値
  const PAGE = 1000;                    // 読み込み時のページ幅（PostgREST の既定上限）
  // 過去ログをまとめて箱に入れるときの上限。
  // ログは1件=1項目なので、これを超えると箱（localStorage）が膨らみすぎる。
  const LOG_BULK_LIMIT = 2000;

  // ---- 箱の読み書き ----
  function readBox() {
    try {
      const raw = localStorage.getItem(OUTBOX_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter(x => x && x.id && x.kind) : [];
    } catch (e) {
      console.warn('[VFOutbox] 箱の読み出しに失敗:', e && e.message);
      return [];
    }
  }
  function writeBox(items) {
    try {
      localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
      return true;
    } catch (e) {
      // 容量超過など。箱は消さずに諦める（次の機会に再度書き込む）。
      console.warn('[VFOutbox] 箱の保存に失敗（中身は保持）:', e && e.message);
      return false;
    }
  }
  function byCreatedAt(a, b) { return (a.createdAt || 0) - (b.createdAt || 0); }

  // 箱に入れる。id が同じものは「同じ行への書き込み」なので新しい方に差し替える。
  //   ・カード状態は最新の1件だけ送れば足りる（id は card:<カードID>）
  //   ・日次記録も最新の1件だけで足りる（id は daily:<日付>）
  //   ・復習ログは1件ごとに別 id（log:<カードID>@<時刻>）なので溜まる
  // これで「重複送信を防ぐ」と「箱が無限に膨らまない」を同時に満たす。
  function enqueueMany(list) {
    if (!list || !list.length) return 0;
    const box = readBox();
    const idx = Object.create(null);
    box.forEach((it, i) => { idx[it.id] = i; });
    let n = 0;
    const now = Date.now();
    list.forEach(function (e) {
      if (!e || !e.id || !e.kind) return;
      const item = {
        id: e.id, kind: e.kind, payload: e.payload,
        createdAt: e.createdAt || now, tries: 0
      };
      if (e.id in idx) box[idx[e.id]] = item;   // 差し替え（tries も 0 に戻す）
      else { idx[e.id] = box.length; box.push(item); }
      n++;
    });
    writeBox(box);
    return n;
  }

  // 送信成功した項目を箱から消す。
  // createdAt が変わっている場合は「送信中に新しい内容へ差し替わった」ということなので
  // 消さずに残す（消すと最新の内容が送られないまま失われる）。
  function removeItem(id, createdAt) {
    const box = readBox();
    const next = box.filter(it => !(it.id === id && it.createdAt === createdAt));
    if (next.length !== box.length) writeBox(next);
  }
  function bumpTries(id) {
    const box = readBox();
    let hit = null;
    box.forEach(it => { if (it.id === id) { it.tries = (it.tries || 0) + 1; hit = it; } });
    if (hit) {
      writeBox(box);
      if (hit.tries === WARN_TRIES) {
        console.warn('[VFOutbox] ' + id + ' の送信が ' + hit.tries + '回失敗しています（箱には保持したまま再試行を続けます）');
      }
    }
  }

  // ---- 接続 ----
  function auth() { return global.VFAuth || null; }
  function client() { const a = auth(); return (a && a.client) ? a.client : null; }
  function uid() {
    const a = auth();
    const u = (a && a.current) ? a.current() : null;
    return (u && u.uid) ? u.uid : null;
  }
  function isOffline() {
    return !!(global.navigator && global.navigator.onLine === false);
  }
  // 一意制約違反（もう入っている）
  function isDuplicate(err) {
    return !!(err && (err.code === '23505' || /duplicate key/i.test(err.message || '')));
  }
  // 通信・認証系の失敗＝このパスを中断して後でまとめて再試行する種類か
  function isTransient(err) {
    if (!err) return true;
    const msg = String(err.message || err);
    if (/Failed to fetch|NetworkError|network|timeout|fetch failed/i.test(msg)) return true;
    const code = String(err.code || '');
    if (code === '' || code === 'PGRST301') return true;   // JWT 期限切れなど
    if (/^5\d\d$/.test(code)) return true;
    return false;
  }
  function num(v) { const x = Number(v); return isFinite(x) ? x : 0; }
  // 数値が無い場合は 0 ではなく null を返す。
  // review_logs の s_before は「0 = 真の初回レビュー」という意味を持つため、
  // 未記録のログを 0 で埋めると optimizer.js が「初回」と誤認して
  // 先頭欠損の検出（学習データの品質チェック）が効かなくなる。
  // 未記録は未記録（NULL）のまま送るのが正しい。
  function numOrNull(v) {
    if (v === null || v === undefined || v === '') return null;
    const x = Number(v);
    return isFinite(x) ? x : null;
  }
  function strOrNull(v) {
    return (typeof v === 'string' && v !== '') ? v : null;
  }
  // 復習ログ1件を「送る形」に整える。手元のログ・箱の中身の両方から呼ぶ。
  // FSRS 最適化用の6項目（format / duration_ms / s_before / d_before /
  // s_after / d_after）を必ず含める。値が無いものは null（未記録）にする。
  function logPayload(g) {
    return {
      card_id: g.card_id, reviewed_at: num(g.reviewed_at), grade: num(g.grade),
      correct: !!g.correct, elapsed_days: num(g.elapsed_days),
      format: strOrNull(g.format),
      duration_ms: numOrNull(g.duration_ms),
      s_before: numOrNull(g.s_before), d_before: numOrNull(g.d_before),
      s_after: numOrNull(g.s_after), d_after: numOrNull(g.d_after)
    };
  }

  // ---- 送信: カード状態 ----
  // upsert する。ただしサーバーの updated_at_ms の方が新しい場合は上書きしない
  // （旧いデータで新しいデータを潰さないため）。
  // 一意制約の構成に依存しないよう on_conflict は使わず、
  // 「引いてから入れる／条件付きで更新する」形にしている。
  async function sendCard(p, user) {
    const db = client();
    const ts = num(p.updated_at_ms);
    const row = {
      user_id: user, card_id: p.card_id,
      state: p.state, due: num(p.due),
      stability: num(p.stability), difficulty: num(p.difficulty),
      reps: num(p.reps), lapses: num(p.lapses),
      last_review: num(p.last_review),
      suspended: !!p.suspended,
      updated_at_ms: ts
    };
    const cur = await db.from(TBL_CARD)
      .select('updated_at_ms').eq('user_id', user).eq('card_id', p.card_id).maybeSingle();
    if (cur.error) return { ok: false, error: cur.error, retry: isTransient(cur.error) };

    if (!cur.data) {
      const ins = await db.from(TBL_CARD).insert(row);
      if (!ins.error) return { ok: true };
      // 同時に別端末が入れた → 更新に回す
      if (isDuplicate(ins.error)) return await updateCard(db, row, ts);
      return { ok: false, error: ins.error, retry: isTransient(ins.error) };
    }

    const serverTs = Number(cur.data.updated_at_ms);
    if (isFinite(serverTs)) {
      // サーバーの方が新しい（または同じ）→ 上書きしない。送信済みとして箱から外す。
      if (serverTs >= ts) return { ok: true, skipped: 'server-newer' };
      return await updateCard(db, row, ts);
    }
    // サーバー側が未設定（NULL）→ 比較できないので条件なしで更新
    return await updateCard(db, row, null);
  }
  async function updateCard(db, row, guardTs) {
    let q = db.from(TBL_CARD).update(row).eq('user_id', row.user_id).eq('card_id', row.card_id);
    // 引いてから更新するまでの間に別端末がより新しい値を書いていた場合に
    // 潰さないための条件付き更新。0件更新なら「サーバーの方が新しかった」＝正しい結果。
    if (guardTs !== null) q = q.lt('updated_at_ms', guardTs);
    const res = await q;
    if (res.error) return { ok: false, error: res.error, retry: isTransient(res.error) };
    return { ok: true };
  }

  // ---- 送信: 復習ログ ----
  // 追記のみ。(user_id, card_id, reviewed_at) が同じものは無視する。
  async function sendLog(p, user) {
    const db = client();
    const cur = await db.from(TBL_LOG).select('card_id')
      .eq('user_id', user).eq('card_id', p.card_id).eq('reviewed_at', p.reviewed_at).limit(1);
    if (cur.error) return { ok: false, error: cur.error, retry: isTransient(cur.error) };
    if (cur.data && cur.data.length) return { ok: true, skipped: 'duplicate' };

    // FSRS 最適化用の6項目も一緒に送る。ここを落とすとサーバー側が NULL のまま
    // 溜まり、別端末からログを引いたときに最適化の学習データが壊れる。
    const ins = await db.from(TBL_LOG).insert({
      user_id: user, card_id: p.card_id, reviewed_at: p.reviewed_at,
      grade: p.grade, correct: !!p.correct, elapsed_days: num(p.elapsed_days),
      format: strOrNull(p.format),
      duration_ms: numOrNull(p.duration_ms),
      s_before: numOrNull(p.s_before), d_before: numOrNull(p.d_before),
      s_after: numOrNull(p.s_after), d_after: numOrNull(p.d_after)
    });
    if (!ins.error) return { ok: true };
    if (isDuplicate(ins.error)) return { ok: true, skipped: 'duplicate' };
    return { ok: false, error: ins.error, retry: isTransient(ins.error) };
  }

  // ---- 送信: 日次記録 ----
  // その日の分を丸ごと upsert する（1日分は小さい）。
  // ただし丸ごと置き換えると別端末が数えた分を捨ててしまうので、
  // サーバーにある同じ日の記録と項目の型別に合体してから書く（絶対に足し算しない）。
  async function sendDaily(p, user) {
    const db = client();
    const Store = global.Store;
    const cur = await db.from(TBL_DAILY).select('stats')
      .eq('user_id', user).eq('day', p.day).maybeSingle();
    if (cur.error) return { ok: false, error: cur.error, retry: isTransient(cur.error) };

    let stats = p.stats || {};
    if (cur.data) {
      if (Store && Store.mergeDailyRecord) stats = Store.mergeDailyRecord(stats, cur.data.stats);
      const upd = await db.from(TBL_DAILY).update({ stats: stats })
        .eq('user_id', user).eq('day', p.day);
      if (upd.error) return { ok: false, error: upd.error, retry: isTransient(upd.error) };
      return { ok: true };
    }
    const ins = await db.from(TBL_DAILY).insert({ user_id: user, day: p.day, stats: stats });
    if (!ins.error) return { ok: true };
    if (isDuplicate(ins.error)) {
      // 同時に別端末が入れた → 合体して更新に回す
      const again = await db.from(TBL_DAILY).select('stats')
        .eq('user_id', user).eq('day', p.day).maybeSingle();
      if (!again.error && again.data && Store && Store.mergeDailyRecord) {
        stats = Store.mergeDailyRecord(stats, again.data.stats);
      }
      const upd = await db.from(TBL_DAILY).update({ stats: stats })
        .eq('user_id', user).eq('day', p.day);
      if (upd.error) return { ok: false, error: upd.error, retry: isTransient(upd.error) };
      return { ok: true };
    }
    return { ok: false, error: ins.error, retry: isTransient(ins.error) };
  }

  function sendOne(item, user) {
    if (item.kind === 'card') return sendCard(item.payload || {}, user);
    if (item.kind === 'log') return sendLog(item.payload || {}, user);
    if (item.kind === 'daily') return sendDaily(item.payload || {}, user);
    // 未知の種類は捨てずに残すが、送りようがないので失敗扱いにする
    return Promise.resolve({ ok: false, error: { message: 'unknown kind: ' + item.kind }, retry: false });
  }

  // ---- 送信ループ ----
  // 箱に中身があるときだけ、古い順に送る。
  //   ・成功したものだけ箱から消す
  //   ・失敗したら消さずに残し、後で再試行（間隔は徐々に広げる）
  //   ・オフラインなら送らずに溜めるだけ
  let _flushing = false;
  let _timer = null;
  let _delay = BASE_DELAY;

  function schedule(ms) {
    if (_timer) clearTimeout(_timer);
    _timer = setTimeout(function () { _timer = null; flush(); }, Math.max(0, ms));
  }

  async function flush() {
    if (_flushing) return { ok: false, reason: 'busy' };
    const box0 = readBox();
    if (!box0.length) return { ok: true, sent: 0, failed: 0, left: 0 };   // 中身が無ければ何もしない
    if (isOffline()) {
      // オフライン → 送らずに溜めるだけ。online イベントで自動的に再開する。
      return { ok: false, reason: 'offline', left: box0.length };
    }
    const user = uid();
    if (!user || !client()) return { ok: false, reason: 'not-logged-in', left: box0.length };

    _flushing = true;
    let sent = 0, failed = 0, aborted = false;
    try {
      const batch = box0.slice().sort(byCreatedAt).slice(0, PASS_LIMIT);
      for (let i = 0; i < batch.length; i++) {
        const it = batch[i];
        if (isOffline()) { aborted = true; break; }
        let res;
        try { res = await sendOne(it, user); }
        catch (e) { res = { ok: false, error: e, retry: true }; }
        if (res && res.ok) {
          removeItem(it.id, it.createdAt);
          sent++;
        } else {
          failed++;
          bumpTries(it.id);
          if (res && res.retry) {
            // 通信・認証系の失敗はこの先も同じように失敗するのでパスを中断する
            aborted = true;
            console.warn('[VFOutbox] 送信を中断して後で再試行します:', (res.error && res.error.message) || res.error);
            break;
          }
          // 行ごとの失敗（項目の内容が原因）は、その項目を残したまま次へ進む。
          // 先頭の1件が全体を止めてしまうのを防ぐ。
          console.warn('[VFOutbox] ' + it.id + ' の送信に失敗:', (res.error && res.error.message) || res.error);
        }
      }
    } finally {
      _flushing = false;
    }

    // 間隔は徐々に広げる。成功したら元に戻す。
    if (failed === 0) _delay = BASE_DELAY;
    else _delay = Math.min(_delay * 2, MAX_DELAY);

    const left = readBox().length;
    if (left > 0) schedule((aborted || failed) ? _delay : 300);
    return { ok: failed === 0, sent: sent, failed: failed, left: left };
  }

  // ---- 読み込み（cloud-sync.js の初期同期が使う）----
  // 新テーブルの知識をこのファイルに閉じ込めるため、取得もここに置く。
  // 1000件ずつページで引く（PostgREST の既定上限が1000件のため）。
  async function fetchAll(table, columns) {
    const db = client();
    const user = uid();
    if (!db || !user) return { ok: false, error: 'not-logged-in' };
    const rows = [];
    for (let from = 0; ; from += PAGE) {
      const res = await db.from(table).select(columns).eq('user_id', user).range(from, from + PAGE - 1);
      if (res.error) return { ok: false, error: res.error.message || String(res.error) };
      const chunk = res.data || [];
      for (let i = 0; i < chunk.length; i++) rows.push(chunk[i]);
      if (chunk.length < PAGE) break;
      if (from > 400000) break;   // 保険（無限ループ防止）
    }
    return { ok: true, rows: rows };
  }

  // card_states を全件 → { カードID: 行 }
  async function fetchCardStates() {
    const r = await fetchAll(TBL_CARD,
      'card_id,state,due,stability,difficulty,reps,lapses,last_review,suspended,updated_at_ms');
    if (!r.ok) return r;
    const cards = Object.create(null);
    r.rows.forEach(function (x) { if (x && x.card_id != null) cards[x.card_id] = x; });
    return { ok: true, cards: cards, count: r.rows.length };
  }
  // review_logs を全件 → 手元のログと同じ形の配列
  async function fetchReviewLogs() {
    const r = await fetchAll(TBL_LOG,
      'card_id,reviewed_at,grade,correct,elapsed_days,format,duration_ms,s_before,d_before,s_after,d_after');
    if (!r.ok) return r;
    const logs = r.rows.map(function (x) {
      // 手元のログと同じ形にする。FSRS 最適化用の6項目も落とさずに持ち帰る。
      // サーバー側が NULL のもの（古い行）は入れない。0 を入れてしまうと
      // optimizer.js が s_before === 0 を「真の初回レビュー」と解釈するため、
      // 未記録が初回に化けて最適化の学習データを汚す。
      const o = {
        card_id: x.card_id, reviewed_at: num(x.reviewed_at), grade: x.grade,
        correct: !!x.correct, elapsed_days: num(x.elapsed_days)
      };
      if (typeof x.format === 'string' && x.format !== '') o.format = x.format;
      const opt = ['duration_ms', 's_before', 'd_before', 's_after', 'd_after'];
      for (let i = 0; i < opt.length; i++) {
        const k = opt[i];
        const v = numOrNull(x[k]);
        if (v !== null) o[k] = v;
      }
      return o;
    });
    return { ok: true, logs: logs, count: logs.length };
  }
  // daily_stats を全件 → { 日付: 日次レコード }
  async function fetchDailyStats() {
    const r = await fetchAll(TBL_DAILY, 'day,stats');
    if (!r.ok) return r;
    const daily = Object.create(null);
    r.rows.forEach(function (x) {
      if (!x || !x.day) return;
      daily[String(x.day)] = (x.stats && typeof x.stats === 'object') ? x.stats : {};
    });
    return { ok: true, daily: daily, count: r.rows.length };
  }

  // ---- 公開API ----
  const VFOutbox = {
    KEY: OUTBOX_KEY,

    // 1問解答したあとに呼ぶ。その1枚分だけを箱に入れる
    // （カード状態1件 + 復習ログ1件 + その日の日次記録1件）。
    //   a = { cardId, state, touchedAt, log, day, stats }
    //   touchedAt = そのカードを実際に触った時刻(ms)。送信時刻ではない。
    enqueueAnswer(a) {
      if (!a || !a.cardId) return 0;
      const now = Date.now();
      const touched = num(a.touchedAt) || now;
      const st = a.state || {};
      const items = [{
        id: 'card:' + a.cardId, kind: 'card', createdAt: now,
        payload: {
          card_id: a.cardId, state: st.state, due: st.due,
          stability: st.stability, difficulty: st.difficulty,
          reps: st.reps, lapses: st.lapses, last_review: st.last_review,
          suspended: !!st.suspended,
          updated_at_ms: touched
        }
      }];
      const lg = a.log;
      if (lg && lg.card_id != null && lg.reviewed_at != null) {
        items.push({
          id: 'log:' + lg.card_id + '@' + lg.reviewed_at, kind: 'log', createdAt: now,
          payload: logPayload(lg)
        });
      }
      if (a.day) {
        items.push({
          id: 'daily:' + a.day, kind: 'daily', createdAt: now,
          payload: { day: a.day, stats: a.stats || {} }
        });
      }
      const n = enqueueMany(items);
      schedule(500);   // 連続解答をまとめるため少しだけ待つ
      return n;
    },

    // 合体の結果「手元の方が新しかった」カードをまとめて箱に入れる（初期同期用）。
    //   list = [{ cardId, state }, ...]
    enqueueCards(list) {
      if (!Array.isArray(list) || !list.length) return 0;
      const now = Date.now();
      const Store = global.Store;
      const items = [];
      list.forEach(function (e) {
        if (!e || !e.cardId || !e.state) return;
        const st = e.state;
        const touched = (Store && Store.cardTouchedAt) ? Store.cardTouchedAt(st) : num(st.last_review);
        items.push({
          id: 'card:' + e.cardId, kind: 'card', createdAt: now,
          payload: {
            card_id: e.cardId, state: st.state, due: st.due,
            stability: st.stability, difficulty: st.difficulty,
            reps: st.reps, lapses: st.lapses, last_review: st.last_review,
            suspended: !!st.suspended,
            updated_at_ms: touched
          }
        });
      });
      const n = enqueueMany(items);
      schedule(500);
      return n;
    },

    // 日次記録をまとめて箱に入れる。
    //   list = [{ day, stats }, ...]
    // 日数分しかないので箱が膨らむ心配はない（id が日付なので重複もしない）。
    enqueueDaily(list) {
      if (!Array.isArray(list) || !list.length) return 0;
      const now = Date.now();
      const items = [];
      list.forEach(function (e) {
        if (!e || !e.day) return;
        items.push({
          id: 'daily:' + e.day, kind: 'daily', createdAt: now,
          payload: { day: e.day, stats: e.stats || {} }
        });
      });
      const n = enqueueMany(items);
      schedule(500);
      return n;
    },

    // 復習ログをまとめて箱に入れる。
    //   list = [{card_id, reviewed_at, grade, correct, elapsed_days,
    //             format, duration_ms, s_before, d_before, s_after, d_after}, ...]
    //   後半6項目は無くてもよい（無い場合は未記録=NULL として送る）
    // ログは1件=1項目なので、件数が多いと箱（localStorage）に入り切らない。
    // そのため上限を設け、超える場合は入れずに件数を知らせる。
    enqueueLogs(list, limit) {
      if (!Array.isArray(list) || !list.length) return 0;
      const cap = (typeof limit === 'number' && limit > 0) ? limit : LOG_BULK_LIMIT;
      if (list.length > cap) {
        console.warn('[VFOutbox] 復習ログ ' + list.length + '件は多すぎるため箱に入れませんでした'
          + '（上限 ' + cap + '件）。過去ログの移送は別途まとめて行う必要があります。');
        return 0;
      }
      const now = Date.now();
      const items = [];
      list.forEach(function (g) {
        if (!g || !g.card_id || !g.reviewed_at) return;
        items.push({
          id: 'log:' + g.card_id + '@' + g.reviewed_at, kind: 'log', createdAt: now,
          payload: logPayload(g)
        });
      });
      const n = enqueueMany(items);
      schedule(500);
      return n;
    },

    // 手元のデータを丸ごとサーバーへ反映させる。
    // 使いどころ: インポート直後 / クラウド側にまだ何も無い端末の初回ログイン。
    // 旧方式（user_data への丸ごと送信）の代わりに、行単位テーブルへ移送する。
    enqueueAllLocal(opts) {
      const Store = global.Store;
      const out = { cards: 0, daily: 0, logs: 0, logsSkipped: 0 };
      if (!Store) return out;
      try {
        const all = Store.getAllCards ? Store.getAllCards() : {};
        out.cards = VFOutbox.enqueueCards(Object.keys(all).map(function (id) {
          return { cardId: id, state: all[id] };
        }));
      } catch (e) {}
      try {
        const d = Store.getAllDaily ? Store.getAllDaily() : null;
        if (d) {
          out.daily = VFOutbox.enqueueDaily(Object.keys(d).map(function (k) {
            return { day: k, stats: d[k] };
          }));
        }
      } catch (e) {}
      try {
        const lg = Store.getLogs ? Store.getLogs() : [];
        const cap = (opts && typeof opts.logsLimit === 'number') ? opts.logsLimit : LOG_BULK_LIMIT;
        out.logs = VFOutbox.enqueueLogs(lg, cap);
        if (!out.logs && lg.length) out.logsSkipped = lg.length;
      } catch (e) {}
      console.log('[VFOutbox] 手元のデータを送信待ちに入れました'
        + '（カード ' + out.cards + '件 / 日次 ' + out.daily + '日分 / ログ ' + out.logs + '件'
        + (out.logsSkipped ? '・ログ ' + out.logsSkipped + '件は多すぎるため未投入' : '') + '）');
      return out;
    },

    flush: flush,

    // 確認用: 箱の中身の件数をコンソールに出す
    pending() {
      const box = readBox();
      const by = { card: 0, log: 0, daily: 0 };
      let maxTries = 0;
      box.forEach(function (it) {
        if (by[it.kind] !== undefined) by[it.kind]++;
        if ((it.tries || 0) > maxTries) maxTries = it.tries || 0;
      });
      const out = {
        total: box.length, card: by.card, log: by.log, daily: by.daily,
        maxTries: maxTries, online: !isOffline(), loggedIn: !!uid(), sending: _flushing
      };
      console.log('[VFOutbox] 送信待ち ' + out.total + '件'
        + '（カード ' + out.card + ' / ログ ' + out.log + ' / 日次 ' + out.daily + '）'
        + ' 最大試行 ' + out.maxTries
        + ' 送信可能=' + (out.online && out.loggedIn ? 'はい' : 'いいえ')
        + (out.sending ? ' [送信中]' : ''));
      return out;
    },

    // 新テーブルの読み込み（cloud-sync.js の初期同期が使う）
    remote: {
      fetchCardStates: fetchCardStates,
      fetchReviewLogs: fetchReviewLogs,
      fetchDailyStats: fetchDailyStats
    }
  };

  global.VFOutbox = VFOutbox;

  // オンラインに戻ったら自動で再開する
  try {
    global.addEventListener('online', function () {
      _delay = BASE_DELAY;
      schedule(0);
    });
  } catch (e) {}

  // 起動時に前回の残りがあれば、ログインが確定してから送り始める
  function kickIfPending() {
    if (readBox().length) schedule(1500);
  }
  if (global.VFAuth) kickIfPending();
  else {
    try {
      global.addEventListener('vfauth-ready', kickIfPending, { once: true });
    } catch (e) {}
  }
})(window);
