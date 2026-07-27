/* 語彙データの保持・正規化・データセット切替（app.js から切り出し／内容は無変更） */
(function () {
  'use strict';
  const ns = (window.__VFApp = window.__VFApp || {});

  const DATA = { words: [], phrases: [], etym: [], meta: null, wordsFull: null, etymLinks: null };

  // ====== データ正規化 ======
  // すべてのカードを共通形 {id, term, meaning, hint, group, deck, sub} に変換
  // ターゲット1900：新DBから抽出済み（発音・品詞・補足・例文付き、並びはターゲット1900準拠）
  function normWord(w) {
    return { id: w.id, term: w.term, meaning: w.meaning, deck: 'words',
      group: w.section, groupLabel: (w.sectionCode || ('Section ' + w.section)),
      ipa: w.ipa, pos: w.pos, note: w.note, example: w.example, exampleJa: w.exampleJa, full: true };
  }
  // 全部バージョン（6559語）: 意味カテゴリ別 全53セクション（例「#01 重要な・ささいな」）
  function wordFullSectionTitle(sec) {
    const arr = (DATA.meta && DATA.meta.word_full_sections) || [];
    const s = arr.find(x => x.section === sec);
    return s ? s.title : ('Section ' + sec);
  }
  function normWordFull(w) {
    return { id: w.id, term: w.term, meaning: w.meaning, deck: 'words',
      group: w.section, groupLabel: wordFullSectionTitle(w.section),
      ipa: w.ipa, pos: w.pos, note: w.note, example: w.example, exampleJa: w.exampleJa,
      etym: w.etym, syn: w.syn, full: true };
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
    return useFullWords() ? (m.words_full_sections || 53) : (m.word_sections || 19);
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
      // ターゲット1900を先に索引化し、全部DBで上書き。
      // （全部DBの再編成で削除された語もターゲット側から補完できる）
      (DATA.words || []).forEach(w => { byId[w.id] = w; });
      DATA.wordsFull.forEach(w => { byId[w.id] = w; });
      DATA.wordsLeap = leap.ids.filter(id => byId[id]).map((id, i) => Object.assign({}, byId[id], {
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

  // 後続スクリプトで拡張
  // 単語カードID → 関連する語源カード（etymology.jsonのエントリ）の配列
  function etymCardsFor(cardId) {
    if (!DATA.etymLinks || !DATA.etym.length) return [];
    const ids = DATA.etymLinks[cardId];
    if (!ids) return [];
    const out = [];
    for (const id of ids) {
      const e = DATA.etym.find(x => x.id === id);
      if (e) out.push(e);
    }
    return out;
  }

  ns.DATA = DATA;
  ns.normWord = normWord;
  ns.wordFullSectionTitle = wordFullSectionTitle;
  ns.normWordFull = normWordFull;
  ns.normWordLeap = normWordLeap;
  ns.useFullWords = useFullWords;
  ns.useLeapWords = useLeapWords;
  ns.wordSource = wordSource;
  ns.wordSections = wordSections;
  ns.loadFullWords = loadFullWords;
  ns.loadLeapWords = loadLeapWords;
  ns.migrateSharedIds = migrateSharedIds;
  ns.normPhrase = normPhrase;
  ns.normPhraseFull = normPhraseFull;
  ns.useFullPhrases = useFullPhrases;
  ns.phraseSource = phraseSource;
  ns.loadFullPhrases = loadFullPhrases;
  ns.etymMeaning = etymMeaning;
  ns.normEtym = normEtym;
  ns.catLabel = catLabel;
  ns.deckCards = deckCards;
  ns.etymCardsFor = etymCardsFor;
})();
