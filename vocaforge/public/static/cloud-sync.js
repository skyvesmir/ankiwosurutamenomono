/* クラウド同期マネージャ（非module IIFE）
 * - ログイン検知 → クラウド読み込み
 *   - クラウドが空: ローカル（ゲスト）データをそのままアップロードして引き継ぎ
 *   - ローカルが空: クラウドを取り込む
 *   - 両方にデータあり: Store.mergeData() で合体してから push（全置換はしない）
 *   - 時刻が完全に一致（＝何も変わっていない）: 何もしない
 * - 以降、ローカル更新（Store.onDirty）をデバウンスしてクラウドへ自動保存
 * window.VFSync 経由で状態を公開する。
 */
(function (global) {
  'use strict';

  const Store = global.Store;

  const VFSync = {
    enabled: false,     // クラウド同期が有効（ログイン済み＆初期同期完了）
    status: 'idle',     // 'idle' | 'syncing' | 'saved' | 'error'
    lastError: null,
    lastSavedAt: null,
    _listeners: [],
    _initializing: false,
    onChange(fn) {
      if (typeof fn === 'function') {
        this._listeners.push(fn);
        fn(this.snapshot());
      }
    },
    snapshot() {
      return { enabled: this.enabled, status: this.status, lastSavedAt: this.lastSavedAt, lastError: this.lastError };
    },
    _emit() {
      const s = this.snapshot();
      this._listeners.forEach(fn => { try { fn(s); } catch (e) {} });
    }
  };

  global.VFSync = VFSync;

  // VFAuth は module スクリプトで定義されるため cloud-sync.js より後に用意される。
  // 既に在ればすぐ、無ければ 'vfauth-ready' を待って初期化する。
  if (global.VFAuth) {
    setup(global.VFAuth);
  } else {
    global.addEventListener('vfauth-ready', function () {
      if (global.VFAuth) setup(global.VFAuth);
    }, { once: true });
  }

  // ===== ここから先は VFAuth 確定後に動く =====
  function setup(Auth) {

  // ---- 自動保存（デバウンス）----
  let saveTimer = null;
  function scheduleSave() {
    if (!VFSync.enabled) return;
    clearTimeout(saveTimer);
    // 引数なしで呼ぶ（Store の updatedAt がそのまま使われる）
    saveTimer = setTimeout(function () { pushNow(); }, 1500);
  }
  // 戻り値: {ok:boolean} — ログアウト前の「未同期分の保存確認」に使う
  // contentUpdatedAt を明示しない場合は Store の updatedAt（＝その内容が最後に
  // 変わった時刻）をそのまま送る。送信時刻(Date.now())は使わない。
  // これをしないと「古い内容を送っただけ」でサーバー時刻が進み、
  // 別端末の新しいデータを潰してしまう。
  // 送信は必ず1本ずつ直列に流す。
  // 並行して走ると「古い内容の送信が後着してサーバーを巻き戻す」順序逆転が起きるため。
  let _pushChain = Promise.resolve();
  function pushNow(contentUpdatedAt) {
    const run = _pushChain.then(
      () => doPush(contentUpdatedAt),
      () => doPush(contentUpdatedAt)
    );
    _pushChain = run.then(() => {}, () => {});
    return run;
  }

  async function doPush(contentUpdatedAt) {
    if (!VFSync.enabled || !Auth.current()) return { ok: false, skipped: true };
    VFSync.status = 'syncing'; VFSync._emit();
    const payload = Store.exportData().data;
    const stamp = (typeof contentUpdatedAt === 'number' && contentUpdatedAt > 0)
      ? contentUpdatedAt
      : (Store.getUpdatedAt ? Store.getUpdatedAt() : 0);
    const res = await Auth.saveCloud(payload, stamp);
    if (res.ok) {
      // サーバー由来の時刻を基準として保存（端末時計を検証するため）。
      noteServerTime(res.updatedAt);
      VFSync.status = 'saved';
      VFSync.lastSavedAt = Date.now();
      VFSync.lastError = null;
      // クラウドに反映済みの内容としてローカル時刻を確定（新旧判定のズレ防止）。
      // ただし送信を待っている間にユーザーが学習していた場合、ローカルの時刻は
      // すでに stamp より進んでいる。そこへ stamp を書くと時刻が巻き戻り、
      // 次回起動時に「クラウドと同じ＝送信不要」と誤判定して未送信分を取り残す。
      // そのため「進んでいなければ確定、進んでいたら触らず再送」に分ける。
      const after = Store.getUpdatedAt ? Store.getUpdatedAt() : 0;
      if (typeof res.updatedAt === 'number' && after <= res.updatedAt) {
        Store.setUpdatedAt(res.updatedAt);
      } else {
        // 送信中に更新された分は未送信として残っている → 改めて送る
        scheduleSave();
      }
    } else {
      VFSync.status = 'error';
      VFSync.lastError = res.error;
    }
    VFSync._emit();
    return { ok: !!res.ok, error: res.error };
  }
  // 外部から誤って引数（イベント等）が渡っても時刻を汚さないよう、数値だけ通す
  VFSync.flush = function (ms) { return pushNow(typeof ms === 'number' ? ms : undefined); };

  // ログアウト前の防御: 未同期分をクラウドへ確実に保存してから抜ける。
  // ログアウト後は Store.reset() でローカルが消えるため、ここでの保存失敗は
  // データ消失に直結する。失敗時は {ok:false} を返し、呼び出し側（app.js）が
  // ユーザーに確認する。
  VFSync.flushBeforeLogout = async function () {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!VFSync.enabled || !Auth.current()) return { ok: true, skipped: true };
    // 送信中にローカルが更新されると、その分は未送信のまま残る。
    // 「送った時刻 ≧ ローカルの時刻」になるまで送り直す（無限ループ防止に上限3回）。
    let last = { ok: false };
    for (let i = 0; i < 3; i++) {
      const before = Store.getUpdatedAt ? Store.getUpdatedAt() : 0;
      last = await pushNow(before);
      if (!last.ok) return last;                     // 通信失敗 → 呼び出し側が中止する
      const after = Store.getUpdatedAt ? Store.getUpdatedAt() : 0;
      if (after <= before) return last;              // 未送信分なし → 完了
      clearTimeout(saveTimer);                       // 再送は自前で行う
      saveTimer = null;
    }
    // 3回試しても追いつかない（＝送信中も学習が続いている）→ 消してよいとは言えない
    return { ok: false, error: 'flush-not-settled' };
  };

  // ローカル書き込みを監視 → クラウドへ反映
  Store.onDirty(() => scheduleSave());

  // ページを閉じる/バックグラウンドに移る直前に、保留中の保存を確定させる
  // （デバウンス待ち中の未保存分が失われないように）
  function flushIfPending() {
    if (VFSync.enabled && saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
      pushNow();
    }
  }
  global.addEventListener('visibilitychange', function () {
    if (global.document && global.document.visibilityState === 'hidden') flushIfPending();
  });
  global.addEventListener('pagehide', flushIfPending);

  // ---- ローカルにゲストデータが存在するか ----
  function localHasData() {
    const d = Store.exportData().data;
    return (d.cards && Object.keys(d.cards).length > 0) ||
           (Array.isArray(d.logs) && d.logs.length > 0) ||
           (d.daily && Object.keys(d.daily).length > 0) ||
           (d.seen && Object.keys(d.seen).length > 0);
  }
  function cloudHasData(data) {
    if (!data) return false;
    return (data.cards && Object.keys(data.cards).length > 0) ||
           (Array.isArray(data.logs) && data.logs.length > 0) ||
           (data.daily && Object.keys(data.daily).length > 0) ||
           (data.seen && Object.keys(data.seen).length > 0);
  }

  // ---- ログイン時の初期同期 ----
  // 多重起動を防ぐためのガード。
  // 以前は「例外が起きると _initializing が true のまま残る」ため、一度失敗すると
  // 同じページを開いている間は初期同期が二度と走らず、同期が無音で停止していた。
  // 現在は finally で必ず解除する。進行中に再度呼ばれた場合は、黙って捨てずに
  // 進行中の処理を待たせる（呼び出し側が「同期済み」と誤認しないように）。
  let _initPromise = null;
  function initialSync() {
    if (_initPromise) return _initPromise;
    VFSync._initializing = true;
    _initPromise = (async function () {
      try {
        return await runInitialSync();
      } catch (e) {
        // ネットワーク断・localStorage 容量超過などで途中失敗しても、
        // 状態を error にして次回のログイン/再試行を必ず受け付ける。
        VFSync.status = 'error';
        VFSync.lastError = (e && e.message) ? e.message : String(e);
        console.error('[VFSync] initialSync failed:', e);
        VFSync._emit();
      } finally {
        VFSync._initializing = false;
        _initPromise = null;
      }
    })();
    return _initPromise;
  }

  // サーバーから受け取った時刻を「実時間はこれ以降」という基準として記録し、
  // 保存済みのセッション記録を新しい基準で再検証する（未来を捨て、72時間で丸める）。
  function noteServerTime(ms) {
    if (typeof ms !== 'number' || !isFinite(ms) || ms <= 0) return;
    try {
      const before = Store.getLastSeenServerTime ? Store.getLastSeenServerTime() : 0;
      if (Store.setLastSeenServerTime) Store.setLastSeenServerTime(ms);
      if (ms > before && Store.reconcileDailySessions) {
        const n = Store.reconcileDailySessions(Date.now());
        if (n) console.info('[VFSync] session times reconciled: ' + n);
      }
    } catch (e) {}
  }

  // ---- ログイン時の読み込み: カード1枚ずつの「合体」----
  // これまでは「サーバーか手元か、新しい方を採用してもう一方を捨てる」形だった。
  // 丸ごと入れ替える処理はこの経路から完全に削除し、
  // カードID・ログ1件・日付ごとに新しい方を採用する形にした。
  // どちらかを捨てる場面が原理的に発生しないので、確認ダイアログも出さない。
  async function pullRows() {
    const OB = global.VFOutbox;
    if (!OB || !OB.remote) return { ok: false, error: 'outbox-unavailable' };

    const cs = await OB.remote.fetchCardStates();
    if (!cs.ok) return { ok: false, error: cs.error };
    const rl = await OB.remote.fetchReviewLogs();
    if (!rl.ok) return { ok: false, error: rl.error };
    const ds = await OB.remote.fetchDailyStats();
    if (!ds.ok) return { ok: false, error: ds.error };

    // 1) カード状態: カードID単位で updated_at_ms が新しい方を採用
    const cards = Store.mergeCardStatesByTime(cs.cards);
    // 2) 復習ログ: 手元に無いものだけ追加して時刻順に並べ直す（手元のログは消さない）
    const logs = Store.appendMissingLogs(rl.logs);
    // 3) 日次記録: 同じ日付は項目の型ごとに合体（絶対に足し算しない）
    const daily = Store.mergeDailyStatsRows(ds.daily);

    // dueTotal は「その日の期限カード総数」なので本来どの端末でも同じ値になるはず。
    // 食い違いは確定処理のバグの兆候なので、大きい方を採用した上で警告する。
    (daily.mismatches || []).forEach(function (m) {
      console.warn('[VFSync] dueTotal が食い違っています ' + m.day
        + ': 手元=' + m.local + ' サーバー=' + m.remote
        + ' → 大きい方を採用しました（確定処理のバグの可能性）');
    });

    // 5) 合体の結果「手元の方が新しかった」カードは箱に入れてサーバーへ反映する
    let queued = 0;
    const toPush = cards.toPush || [];
    if (toPush.length && OB.enqueueCards) {
      const all = Store.getAllCards();
      queued = OB.enqueueCards(toPush.map(function (id) {
        return { cardId: id, state: all[id] };
      }));
    }

    // 7) 合体の結果をログ出力する
    console.log('[VFSync] 合体: サーバーから ' + cards.fromServer + '件'
      + ' / 手元が新しい ' + cards.localNewer + '件'
      + ' / 新規取得 ' + cards.added + '件'
      + '（カード合計 ' + cards.total + '件・同時刻 ' + cards.same + '件'
      + '・手元のみ ' + cards.localOnly + '件'
      + '／ログ +' + logs.added + '件（計 ' + logs.total + '件）'
      + '／日次 ' + daily.days + '日分'
      + '／送信待ちに追加 ' + queued + '件）');

    return { ok: true, cards: cards, logs: logs, daily: daily, queued: queued, remoteCards: cs.cards };
  }

  async function runInitialSync() {
    VFSync.status = 'syncing'; VFSync._emit();

    // 1) 設定は従来どおり user_data から読む（ここはまだ変えない）。
    const res = await Auth.loadCloud();
    if (!res.ok) {
      VFSync.status = 'error';
      VFSync.lastError = res.error;
      VFSync._emit();
      return;
    }

    // サーバー由来の時刻を基準として保存し、貯まっていたセッション記録を再検証する。
    // ・基準より未来の時刻を持つセッションは捨てる
    // ・72時間より古いものは 72時間前に丸める
    noteServerTime(res.updatedAt);

    const cloud = res.data;            // null もしくは {cards,logs,settings,daily,seen}
    const cloudUpdatedAt = res.updatedAt || 0;
    const localUpdatedAt = Store.getUpdatedAt();
    const hasCloud = cloudHasData(cloud);
    const hasLocal = localHasData();

    let action = 'none';
    if (!hasCloud && hasLocal) action = 'push';
    else if (!hasLocal && hasCloud) action = 'pull';
    else if (hasCloud && hasLocal) action = (cloudUpdatedAt === localUpdatedAt) ? 'none' : 'merge';
    console.log('[VFSync] initialSync cloud=' + cloudUpdatedAt + ' local=' + localUpdatedAt + ' action=' + action);

    // 2) 行単位（card_states / review_logs / daily_stats）の合体。これが新しい本流。
    //    旧方式の取り込みより先に行う。後にすると旧方式が先に同じ内容を入れてしまい、
    //    合体の件数が実態を表さなくなる（旧方式を消したときに動くのはこちらなので、
    //    こちらが主役として動いていることをログで確認できるようにしておく）。
    //    失敗しても既存の丸ごと同期は止めない。
    const rows = await pullRows();
    if (!rows.ok) {
      console.warn('[VFSync] 行単位の読み込みに失敗しました（丸ごと同期は継続します）:', rows.error);
    }

    // 3) 旧方式（user_data の丸ごと保存）の内容も取り込む。
    //    ここは「合体」であって全置換ではないので、何も捨てない。
    //    行単位テーブルへの移行が済むまでの保険として残している。
    if (hasCloud) {
      Store.mergeData(Object.assign({}, cloud, { updatedAt: cloudUpdatedAt }));

      // 旧方式からだけ入ってきたカード（行単位テーブルにまだ無い過去分）も箱に入れる。
      // mergeCardStatesByTime は何度実行しても結果が変わらないので、取得済みの
      // サーバー内容ともう一度突き合わせ、まだ送っていない分だけ拾う。
      if (rows.ok && global.VFOutbox && global.VFOutbox.enqueueCards) {
        try {
          const already = Object.create(null);
          (rows.cards.toPush || []).forEach(function (id) { already[id] = 1; });
          const again = Store.mergeCardStatesByTime(rows.remoteCards);
          const extra = (again.toPush || []).filter(function (id) { return !already[id]; });
          if (extra.length) {
            const all2 = Store.getAllCards();
            const n = global.VFOutbox.enqueueCards(extra.map(function (id) {
              return { cardId: id, state: all2[id] };
            }));
            if (n) console.log('[VFSync] 旧方式から取り込んだ分を送信待ちに追加 ' + n + '件');
          }
        } catch (e) { /* 保険の処理なので失敗しても同期は続ける */ }
      }
    }

    // 4) 以降の自動保存を有効化。旧方式の丸ごと送信はこのチャンクでは止めない。
    VFSync.enabled = true;
    if (action === 'push' || action === 'merge') {
      const stamp = Math.max(cloudUpdatedAt, Store.getUpdatedAt() || 0, localUpdatedAt || 0);
      await pushNow(stamp);
    } else if (action === 'none' && !hasCloud && !hasLocal) {
      // どちらも空 → 何もしない（ページを開いただけでサーバー時刻を進めない）
      VFSync.status = 'idle';
      VFSync._emit();
    } else {
      // 時刻が完全に一致（何も変わっていない）／取り込むだけ → push しない
      VFSync.status = 'saved';
      VFSync.lastSavedAt = Date.now();
      VFSync._emit();
    }

    // 5) 箱に溜まっている分（手元が新しいカードを含む）を送り出す
    if (global.VFOutbox && global.VFOutbox.flush) {
      try { await global.VFOutbox.flush(); } catch (e) {}
    }

    const rowsBrought = !!(rows.ok && (rows.cards.fromServer || rows.cards.added || rows.logs.added || rows.daily.changed));
    if (hasCloud || rowsBrought) rerender();
    console.log('[VFSync] initialSync done action=' + action + ' local=' + Store.getUpdatedAt());
  }

  function rerender() {
    if (global.__go && global.VF && global.VF.STATE) {
      global.__go(global.VF.STATE.route || 'home');
    }
  }

  // ---- ログアウト直前のローカル退避（1世代だけ）----
  // Store.reset() で手元のデータが消えるため、その直前に丸ごと1世代だけ
  // vocaforge:last_logout_backup へ保存しておく。
  // 容量対策で logs は直近1000件のみ。保存に失敗してもログアウトは続行する。
  const LOGOUT_BACKUP_KEY = 'vocaforge:last_logout_backup';
  function backupBeforeReset() {
    try {
      if (!global.Store || !global.Store.exportData) return;
      const snap = Store.exportData();
      const d = snap.data || {};
      const logs = Array.isArray(d.logs) ? d.logs.slice(-1000) : [];
      const backup = {
        savedAt: Date.now(),
        updatedAt: Store.getUpdatedAt ? Store.getUpdatedAt() : 0,
        logsTruncated: Array.isArray(d.logs) && d.logs.length > logs.length,
        data: Object.assign({}, d, { logs: logs })
      };
      localStorage.setItem(LOGOUT_BACKUP_KEY, JSON.stringify(backup));
    } catch (e) {
      // 容量超過などで失敗してもログアウト自体は止めない
      console.warn('[VFSync] logout backup failed:', e);
    }
  }
  VFSync.backupBeforeReset = backupBeforeReset;

  // ---- ログイン状態に追従 ----
  // 「アプリ起動時の未ログイン検知(null)」と「実際のログアウト」を区別するため、
  // 直前まで実際にログインしていたかを wasLoggedIn で保持する。
  let wasLoggedIn = false;
  Auth.onChange((user) => {
    if (user) {
      wasLoggedIn = true;
      initialSync();
    } else {
      // null には2種類ある: ①起動時の未ログイン ②明示的ログアウト
      const doReset = wasLoggedIn;

      // 1. 先に同期を完全停止（Store.reset() の onDirty で自動アップロードが誤発火するのを防ぐ）
      clearTimeout(saveTimer);
      VFSync.enabled = false;
      VFSync.status = 'idle';
      VFSync.lastSavedAt = null;
      VFSync.lastError = null;
      VFSync._emit();
      wasLoggedIn = false;

      // 2. ログイン状態からのログアウト時のみ、ローカルデータを破棄しホームへ
      if (doReset) {
        backupBeforeReset(); // 万一に備えて1世代だけ手元に退避
        if (global.Store && global.Store.reset) global.Store.reset();
        if (global.__go) global.__go('home');
      }
    }
  });

  } // end setup()
})(window);
