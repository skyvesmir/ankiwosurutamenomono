/* VocaForge メインアプリ
 * 学習科学ガイド準拠の語彙トレーナー
 * - データ: words.json / phrases.json / etymology.json / meta.json
 * - 出題: mc-ej / mc-je / type-je（能動的想起の強制）
 * - スケジューリング: FSRS-4.5（分散学習・望ましい困難）
 */
(function () {
  'use strict';
  const app = document.getElementById('app');

  const DATA = { words: [], phrases: [], etym: [], meta: null, wordsFull: null };
  const STATE = { route: 'home', session: null };

  // ====== データ正規化 ======
  // すべてのカードを共通形 {id, term, meaning, hint, group, deck, sub} に変換
  // ターゲット1900：新DBから抽出済み（発音・品詞・補足・例文付き、並びはターゲット1900準拠）
  function normWord(w) {
    return { id: w.id, term: w.term, meaning: w.meaning, deck: 'words',
      group: w.section, groupLabel: (w.sectionCode || ('Section ' + w.section)),
      ipa: w.ipa, pos: w.pos, note: w.note, example: w.example, exampleJa: w.exampleJa, full: true };
  }
  // 全部バージョン（6559語）: 同じ新DBの全件
  function normWordFull(w) {
    return { id: w.id, term: w.term, meaning: w.meaning, deck: 'words',
      group: w.section, groupLabel: 'Section ' + w.section,
      ipa: w.ipa, pos: w.pos, note: w.note, example: w.example, exampleJa: w.exampleJa, full: true };
  }
  // Leapモード: Leap収録語の並びで出題（セクションは100語区切り）
  function normWordLeap(w) {
    return { id: w.id, term: w.term, meaning: w.meaning, deck: 'words',
      group: w.leapSection, groupLabel: 'Leap Section ' + w.leapSection,
      ipa: w.ipa, pos: w.pos, note: w.note, example: w.example, exampleJa: w.exampleJa, full: true };
  }
  // 現在の設定に応じた単語DB（target1900 | full | leap）
  function useFullWords() {
    return Store.getSettings().wordDataset === 'full' && !!DATA.wordsFull;
  }
  function useLeapWords() {
    return Store.getSettings().wordDataset === 'leap' && !!DATA.wordsLeap;
  }
  function wordSource() {
    if (useLeapWords()) return DATA.wordsLeap.map(normWordLeap);
    return useFullWords() ? DATA.wordsFull.map(normWordFull) : DATA.words.map(normWord);
  }
  function wordSections() {
    const m = DATA.meta || {};
    if (useLeapWords()) return Math.ceil(DATA.wordsLeap.length / 100);
    return useFullWords() ? (m.words_full_sections || 66) : (m.word_sections || 19);
  }
  // 全部バージョンの遅延ロード（5MBのため必要時のみ）
  async function loadFullWords() {
    if (DATA.wordsFull) return true;
    try {
      const r = await fetch('/static/data/words_full.json');
      DATA.wordsFull = await r.json();
      migrateSharedIds();
      return true;
    } catch (e) { return false; }
  }
  // Leapモードの遅延ロード（全部DB + Leap順序リスト）。
  // カードIDは全部DBと同一なので学習進捗は全モードで共有される。
  async function loadLeapWords() {
    if (DATA.wordsLeap) return true;
    const okFull = await loadFullWords();
    if (!okFull) return false;
    try {
      const r = await fetch('/static/data/words_leap.json');
      const leap = await r.json();
      const byId = {};
      DATA.wordsFull.forEach(w => { byId[w.id] = w; });
      DATA.wordsLeap = leap.ids.map((id, i) => Object.assign({}, byId[id], {
        leapNo: i + 1, leapSection: Math.floor(i / 100) + 1
      }));
      return true;
    } catch (e) { return false; }
  }
  // 旧仕様では全部バージョンの全カードが 'wf-番号' だったが、
  // 現仕様ではターゲット1900と共通の単語は 'w-N' を共有する。
  // 旧IDで残っている進捗（cards/seen/logs）を新IDへ付け替える。
  function migrateSharedIds() {
    if (!DATA.wordsFull || !Store.hasCardIdPrefix('wf-')) return;
    const mapping = {};
    for (const w of DATA.wordsFull) {
      if (w.id.indexOf('wf-') !== 0) mapping['wf-' + w.no] = w.id; // 共有語: 旧wf-番号 → w-N
    }
    const moved = Store.migrateCardIds(mapping);
    if (moved) console.info('[VF] dataset ID migration: ' + moved + ' cards merged');
  }
  // ターゲット1000：新DBから抽出済み（補足・例文付き、並びはターゲット1000準拠）
  function normPhrase(p) {
    return { id: p.id, term: p.term, meaning: p.meaning, deck: 'phrases',
      group: p.section, groupLabel: (p.sectionCode || ('Part ' + p.section)) +
        (p.sectionTitle ? '：' + p.sectionTitle : ''),
      note: p.note, example: p.example, exampleJa: p.exampleJa, full: true };
  }
  // 全部バージョンの熟語（補足・例文・例文訳付き・48セクション）
  function normPhraseFull(p) {
    return { id: p.id, term: p.term, meaning: p.meaning, deck: 'phrases',
      group: p.section, groupLabel: '#' + String(p.section).padStart(2, '0') + ' ' + (p.sectionTitle || ''),
      note: p.note, example: p.example, exampleJa: p.exampleJa, full: true };
  }
  // 現在の設定に応じた熟語DB（target1000 | full）
  function useFullPhrases() {
    return Store.getSettings().phraseDataset === 'full' && !!DATA.phrasesFull;
  }
  function phraseSource() {
    return useFullPhrases() ? DATA.phrasesFull.map(normPhraseFull) : DATA.phrases.map(normPhrase);
  }
  // 全部バージョン熟語の遅延ロード
  async function loadFullPhrases() {
    if (DATA.phrasesFull) return true;
    try {
      const r = await fetch('/static/data/phrases_full.json');
      DATA.phrasesFull = await r.json();
      return true;
    } catch (e) { return false; }
  }
  // 語源は「語源そのもの」を覚えるカードにする: 表=見出し, 裏=コアの意味
  // 同じコア意味（例「場所」）を持つ接辞・語根が複数あるため、
  // 派生的な意味(derived)を併記して識別しやすくする。
  function etymMeaning(e) {
    const core = (e.core || '').trim();
    const derived = (e.derived || '').trim();
    // 「コア（派生1、派生2…）」の形に。派生が無ければコアのみ。
    if (derived && derived !== core) return core + '（' + derived + '）';
    return core;
  }
  function normEtym(e) {
    const head = (e.variants || e.headword || '').replace(/`/g,'');
    // 意味でグルーピング: group は「カテゴリ:テーマ大分類」の複合キー
    const tg = e.themeGroup || ((e.theme || '').split('＞')[0].trim()) || 'その他';
    const grp = e.group || (e.category + ':' + tg);
    // hint: 語源言語など、どの接辞/語根かを区別する補助情報
    const origin = (e.origin || '').replace(/`[^`]*`/g, '').replace(/\s*\/\s*$/,'').trim();
    return {
      id: e.id, term: head, meaning: etymMeaning(e), hint: origin,
      deck: 'etym', sub: e.category, themeGroup: tg,
      group: grp, groupLabel: catLabel(e.category) + '・' + tg,
      etymRef: e
    };
  }
  function catLabel(c){ return c==='prefix'?'接頭辞':c==='suffix'?'接尾辞':'語根'; }

  function deckCards(deck, group) {
    let arr;
    if (deck === 'words') arr = wordSource();
    else if (deck === 'phrases') arr = phraseSource();
    else arr = DATA.etym.filter(e => e.learnable).map(normEtym);
    if (group != null && group !== 'all') arr = arr.filter(c => String(c.group) === String(group));
    return arr;
  }

  // ====== 起動 ======
  async function boot() {
    app.innerHTML = loadingHTML();
    try {
      const [w, p, e, m] = await Promise.all([
        fetch('/static/data/words_target.json').then(r => r.json()),
        fetch('/static/data/phrases_target.json').then(r => r.json()),
        fetch('/static/data/etymology.json').then(r => r.json()),
        fetch('/static/data/meta.json').then(r => r.json())
      ]);
      DATA.words = w; DATA.phrases = p; DATA.etym = e; DATA.meta = m;
      // 全部バージョン選択中なら先にロード（失敗しても1900で続行）
      // 旧 'wf-' IDの進捗が残っている場合もロードしてIDマイグレーションを実行
      if (Store.getSettings().wordDataset === 'full' || Store.hasCardIdPrefix('wf-')) await loadFullWords();
      if (Store.getSettings().wordDataset === 'leap') await loadLeapWords();
      // 熟語全部バージョン選択中、または既に pf- の進捗がある場合はロード
      if (Store.getSettings().phraseDataset === 'full' || Store.hasCardIdPrefix('pf-')) await loadFullPhrases();
      render();
      // 認証状態が変化したら設定画面を更新
      if (window.VFAuth) window.VFAuth.onChange(() => {
        if (STATE.route === 'settings') render();
      });
      // クラウド同期ステータスが変化したら設定画面を更新
      if (window.VFSync) window.VFSync.onChange(() => {
        if (STATE.route === 'settings') render();
      });
    } catch (err) {
      app.innerHTML = '<div class="p-8 text-center text-red-400">データ読み込み失敗: ' + err.message + '</div>';
    }
  }

  function loadingHTML() {
    return '<div class="min-h-screen flex flex-col items-center justify-center gap-4">' +
      '<div class="text-3xl font-extrabold tracking-tight"><span class="text-brand">Voca</span>Forge</div>' +
      '<i class="fas fa-circle-notch fa-spin text-2xl text-brand"></i>' +
      '<p class="text-slate-400 text-sm">語彙データを読み込み中…</p></div>';
  }

  // ====== ルーター ======
  function go(route, opts) { STATE.route = route; STATE.opts = opts || {}; render(); }
  window.__go = go;

  function render() {
    if (STATE.route === 'session') { return; } // セッションは自前描画
    if (STATE.route === 'home') app.innerHTML = renderHome();
    else if (STATE.route === 'decks') app.innerHTML = renderDecks(STATE.opts.deck);
    else if (STATE.route === 'stats') app.innerHTML = renderStats();
    else if (STATE.route === 'browse') app.innerHTML = renderBrowse(STATE.opts.deck);
    else if (STATE.route === 'settings') app.innerHTML = renderSettings();
    bindGlobal();
    window.scrollTo(0, 0);
  }

  // ナビ
  function nav(active) {
    const item = (id, icon, label) =>
      '<button data-nav="' + id + '" class="flex-1 flex flex-col items-center gap-1 py-2 ' +
      (active === id ? 'text-brand' : 'text-slate-400') + '">' +
      '<i class="fas ' + icon + ' text-lg"></i><span class="text-[10px] font-medium">' + label + '</span></button>';
    return '<nav class="fixed bottom-0 inset-x-0 z-40 bg-slate-900/95 backdrop-blur border-t border-slate-800 flex max-w-xl mx-auto">' +
      item('home', 'fa-house', 'ホーム') +
      item('decks', 'fa-layer-group', '学習') +
      item('browse', 'fa-list', '一覧') +
      item('stats', 'fa-chart-line', '統計') +
      item('settings', 'fa-gear', '設定') +
      '</nav>';
  }

  function bindGlobal() {
    document.querySelectorAll('[data-nav]').forEach(b => {
      b.onclick = () => {
        const t = b.getAttribute('data-nav');
        if (t === 'decks' || t === 'browse') go(t, { deck: 'words' });
        else go(t);
      };
    });
    document.querySelectorAll('[data-go]').forEach(b => {
      b.onclick = () => {
        const r = b.getAttribute('data-go');
        const d = b.getAttribute('data-deck');
        const g = b.getAttribute('data-group');
        if (r === 'session') { window.__startSession(d, g); return; }
        go(r, { deck: d, group: g });
      };
    });

    // フラッシュカードモード入口
    const fe = document.getElementById('flash-entry');
    if (fe) fe.onclick = () => window.__openFlash(window.__browseFilter.deck);

    // 一覧: タブ切替・検索・詳細
    document.querySelectorAll('[data-browse-tab]').forEach(b => {
      b.onclick = () => { window.__browseFilter.deck = b.getAttribute('data-browse-tab'); window.__browseFilter.q=''; go('browse', { deck: b.getAttribute('data-browse-tab') }); };
    });
    const bq = document.getElementById('browse-q');
    if (bq) {
      let t;
      bq.oninput = () => { clearTimeout(t); t = setTimeout(() => {
        window.__browseFilter.q = bq.value;
        window.__browseFilter.limit = window.__browsePage;
        const pos = bq.selectionStart;
        go('browse');
        const nb = document.getElementById('browse-q'); if (nb) { nb.focus(); nb.setSelectionRange(pos, pos); }
      }, 200); };
    }
    document.querySelectorAll('[data-detail]').forEach(b => {
      b.onclick = () => {
        const id = b.getAttribute('data-detail');
        const deck = b.getAttribute('data-deck');
        showDetail(id, deck);
      };
    });
    const bm = document.getElementById('browse-more');
    if (bm) bm.onclick = () => {
      const y = window.scrollY;
      window.__browseFilter.limit += window.__browsePage;
      go('browse');
      window.scrollTo(0, y);
    };

    // 設定操作
    bindSettings();
  }

  function showDetail(id, deck) {
    let card;
    if (deck === 'words') {
      card = wordSource().find(c => c.id === id);
      // 現在のデータセット外の単語（混同検出など）は全部DBから探す
      if (!card && DATA.wordsFull) {
        const w = DATA.wordsFull.find(x => x.id === id);
        if (w) card = normWordFull(w);
      }
    }
    else if (deck === 'phrases') {
      card = phraseSource().find(c => c.id === id);
      // 現在のデータセット外の熟語（混同検出など）は全部DBから探す
      if (!card && DATA.phrasesFull) {
        const p = DATA.phrasesFull.find(x => x.id === id);
        if (p) card = normPhraseFull(p);
      }
    }
    else { const e = DATA.etym.find(x => x.id === id); if (e) { window.__showEtymDetail(e); return; } }
    if (!card) return;
    const st = Store.getCard(id);
    const esc = window.__esc;
    // <br>を活かして複数品詞の改行を再現（エスケープ後に戻す）
    const br = s => esc(s).replace(/&lt;br&gt;/gi, '<br>');
    const stateLabel = !st || st.state === 'new' ? '未学習'
      : (st.stability >= 21 ? '成熟（記憶定着）' : '学習中');
    // 全部バージョン：CSVの列（発音記号・品詞・意味・補足・例文・例文訳）をそのまま表示
    const fullInfo = card.full ?
      ((card.ipa ? '<div class="text-sm text-slate-400 mt-1">' + br(card.ipa) + (card.pos ? ' <span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 ml-1">' + esc(card.pos) + '</span>' : '') + '</div>' : '') +
       '<div class="text-slate-300 mt-2 leading-relaxed">' + br(card.meaning) + '</div>' +
       (card.note ? '<div class="mt-3 bg-slate-800/50 rounded-xl p-3 text-xs text-slate-300 leading-relaxed"><div class="text-[10px] text-slate-500 mb-1"><i class="fas fa-circle-info mr-1"></i>補足</div>' + br(card.note) + '</div>' : '') +
       (card.example ? '<div class="mt-3 bg-slate-800/50 rounded-xl p-3 text-xs leading-relaxed"><div class="text-[10px] text-slate-500 mb-1"><i class="fas fa-quote-left mr-1"></i>例文</div>' +
         '<div class="text-slate-200">' + br(card.example) + '</div>' +
         (card.exampleJa ? '<div class="text-slate-400 mt-1.5">' + br(card.exampleJa) + '</div>' : '') + '</div>' : ''))
      : '<div class="text-slate-300 mt-2">' + br(card.meaning) + '</div>';
    const html =
      '<div id="vf-modal" class="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center">' +
        '<div class="bg-slate-900 w-full max-w-xl rounded-t-3xl sm:rounded-3xl border border-slate-800 p-6 max-h-[85vh] overflow-y-auto">' +
          '<div class="flex justify-between items-start mb-3"><div class="min-w-0 flex-1">' +
            '<div class="text-2xl font-extrabold">' + esc(card.term) + '</div>' +
            fullInfo + '</div>' +
            '<button id="vf-close" class="text-slate-400 ml-3"><i class="fas fa-xmark text-xl"></i></button></div>' +
          '<div class="flex gap-2 text-xs mt-4 flex-wrap">' +
            '<span class="px-2 py-1 rounded-full bg-slate-800">' + stateLabel + '</span>' +
            (st && st.due ? '<span class="px-2 py-1 rounded-full bg-slate-800">次回: ' + new Date(st.due).toLocaleDateString('ja-JP') + '</span>' : '') +
            (st && st.lapses ? '<span class="px-2 py-1 rounded-full bg-rose-500/20 text-rose-300">間違い ' + st.lapses + '回</span>' : '') +
          '</div></div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
    document.getElementById('vf-close').onclick = () => document.getElementById('vf-modal').remove();
    document.getElementById('vf-modal').onclick = e => { if (e.target.id === 'vf-modal') document.getElementById('vf-modal').remove(); };
  }

  function bindSettings() {
    // 外観テーマ切替
    document.querySelectorAll('[data-theme]').forEach(b => {
      b.onclick = () => {
        if (window.__applyTheme) window.__applyTheme(b.getAttribute('data-theme'));
        render(); // ボタンの選択状態を更新
      };
    });
    // 単語DB切替（ターゲット1900 / 全部バージョン / Leap）
    document.querySelectorAll('[data-dataset]').forEach(b => {
      b.onclick = async () => {
        const mode = b.getAttribute('data-dataset');
        if (mode === Store.getSettings().wordDataset) return;
        if ((mode === 'full' && !DATA.wordsFull) || (mode === 'leap' && !DATA.wordsLeap)) {
          b.innerHTML = '<i class="fas fa-circle-notch fa-spin text-lg"></i><span class="text-xs">読込中…</span>';
          const ok = mode === 'leap' ? await loadLeapWords() : await loadFullWords();
          if (!ok) { alert('データの読み込みに失敗しました'); render(); return; }
        }
        Store.setSettings({ wordDataset: mode });
        render();
      };
    });
    // 熟語DB切替（ターゲット1000 / 全部バージョン）
    document.querySelectorAll('[data-phrase-dataset]').forEach(b => {
      b.onclick = async () => {
        const mode = b.getAttribute('data-phrase-dataset');
        if (mode === Store.getSettings().phraseDataset) return;
        if (mode === 'full' && !DATA.phrasesFull) {
          b.innerHTML = '<i class="fas fa-circle-notch fa-spin text-lg"></i><span class="text-xs">読込中…</span>';
          const ok = await loadFullPhrases();
          if (!ok) { alert('データの読み込みに失敗しました'); render(); return; }
        }
        Store.setSettings({ phraseDataset: mode });
        render();
      };
    });
    document.querySelectorAll('[data-set]').forEach(el => {
      const key = el.getAttribute('data-set');
      if (el.type === 'checkbox') {
        el.onchange = () => {
          if (key.startsWith('fmt-')) {
            const f = key.slice(4);
            const s = Store.getSettings();
            s.formats[f] = el.checked;
            // 全部OFFは禁止
            if (!Object.values(s.formats).some(Boolean)) { s.formats[f] = true; el.checked = true; alert('最低1つの出題形式が必要です'); }
            Store.setSettings({ formats: s.formats });
          } else {
            Store.setSettings({ [key]: el.checked });
          }
        };
      } else if (el.type === 'range') {
        el.oninput = () => {
          if (key === 'requestRetention') {
            document.getElementById('rr-val').textContent = el.value + '%';
            Store.setSettings({ requestRetention: parseInt(el.value, 10) / 100 });
          } else if (key === 'newPerDay') {
            document.getElementById('np-val').textContent = el.value;
            Store.setSettings({ newPerDay: parseInt(el.value, 10) });
          }
        };
      }
    });
    // ---- FSRSパラメータ最適化 ----
    const optBtn = document.getElementById('fsrs-opt-btn');
    if (optBtn && window.FSRSOpt) optBtn.onclick = async () => {
      optBtn.disabled = true;
      const label = optBtn.innerHTML;
      optBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-2"></i>最適化中… 0%';
      try {
        const res = await FSRSOpt.optimize(pct => {
          optBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-2"></i>最適化中… ' + pct + '%';
        });
        if (!res.ok) {
          alert('復習履歴が足りません（' + res.reviews + ' / ' + res.needed + ' 件）。学習を続けてから再度お試しください。');
        } else if (res.applied) {
          const imp = res.before > 0 ? Math.round((1 - res.after / res.before) * 100) : 0;
          alert('最適化が完了しました！\n\n予測誤差（log loss）: ' + res.before.toFixed(4) + ' → ' + res.after.toFixed(4) +
            (imp > 0 ? '（' + imp + '%改善）' : '') +
            '\n対象レビュー: ' + res.reviews + ' 件' +
            (res.holdout ? '\n※未使用の新しい履歴で検証済み' : ''));
        } else {
          alert('現在の履歴ではデフォルトパラメータのほうが良好でした。\nパラメータは変更していません。履歴が増えたら再度お試しください。');
        }
      } catch (e) {
        alert('最適化に失敗しました: ' + e.message);
      }
      optBtn.disabled = false;
      optBtn.innerHTML = label;
      render();
    };
    const optReset = document.getElementById('fsrs-opt-reset');
    if (optReset && window.FSRSOpt) optReset.onclick = () => {
      if (confirm('個人パラメータを破棄してデフォルトに戻しますか？')) {
        FSRSOpt.resetToDefault();
        render();
      }
    };

    // ---- ログイン / ログアウト ----
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn && window.VFAuth) loginBtn.onclick = async () => {
      loginBtn.disabled = true;
      const res = await window.VFAuth.login();
      loginBtn.disabled = false;
      if (!res.ok && res.error !== 'auth/popup-closed-by-user' && res.error !== 'auth/cancelled-popup-request') {
        alert('ログインに失敗しました: ' + res.error);
      }
    };
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn && window.VFAuth) logoutBtn.onclick = async () => {
      await window.VFAuth.logout();
    };

    const rb = document.getElementById('reset-btn');
    if (rb) rb.onclick = () => {
      if (confirm('すべての学習進捗・統計を削除します。元に戻せません。よろしいですか？')) {
        Store.reset(); go('home');
      }
    };

    // ---- エクスポート ----
    const eb = document.getElementById('export-btn');
    if (eb) eb.onclick = () => {
      const payload = JSON.stringify(Store.exportData(), null, 2);
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const d = new Date();
      const stamp = d.getFullYear() + ('0'+(d.getMonth()+1)).slice(-2) + ('0'+d.getDate()).slice(-2) +
        '-' + ('0'+d.getHours()).slice(-2) + ('0'+d.getMinutes()).slice(-2);
      a.href = url;
      a.download = 'vocaforge-backup-' + stamp + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    // ---- インポート ----
    const ib = document.getElementById('import-btn');
    const ifile = document.getElementById('import-file');
    if (ib && ifile) {
      ib.onclick = () => ifile.click();
      ifile.onchange = () => {
        const file = ifile.files && ifile.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          let obj;
          try { obj = JSON.parse(reader.result); }
          catch (e) { alert('JSONとして読み込めませんでした'); ifile.value = ''; return; }
          const merge = confirm(
            'インポート方法を選んでください。\n\n' +
            '［OK］ 統合：現在のデータに取り込み分を足し合わせる\n' +
            '［キャンセル］ 置換：現在のデータを消して取り込み分で置き換える'
          );
          const res = Store.importData(obj, merge ? 'merge' : 'replace');
          if (res.ok) { alert('インポートが完了しました'); go('home'); }
          else { alert('インポート失敗: ' + res.error); }
          ifile.value = '';
        };
        reader.onerror = () => { alert('ファイルの読み込みに失敗しました'); ifile.value = ''; };
        reader.readAsText(file);
      };
    }
  }

  // 後続スクリプトで拡張
  window.VF = { DATA, STATE, go, deckCards, catLabel, nav, wordSections, useFullWords, loadFullWords, loadLeapWords, useFullPhrases, loadFullPhrases };
  window.__showCardDetail = showDetail;

  document.addEventListener('DOMContentLoaded', boot);
})();
