/* 出題生成・採点ロジック
 * 3形式:
 *   mc-ej : 多肢選択 英→日（英語を見て日本語訳を選ぶ）
 *   mc-je : 多肢選択 日→英（日本語を見て英語を選ぶ）
 *   type-je: 記入 日→英（日本語を見て英語をタイプ）
 * カードの素材: {id, prompt(英), answer(英 or 表記), meaning(日)} に正規化済み
 */
(function (global) {
  'use strict';

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // 日本語訳から代表的な短い意味を1つ抽出（選択肢の見やすさ用）
  function shortMeaning(m) {
    if (!m) return '';
    // 全部バージョンの複数品詞形式「【名】…<br>【動】…」は最初の品詞の意味を使う
    let s = m.split(/<br\s*\/?>/i)[0].replace(/【[^】]*】/g, '');
    // 区切り（；、，/）で分割し最初の塊
    s = s.split(/[；;]/)[0];
    s = s.replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '');
    s = s.split(/[、,]/)[0].trim();
    return s || m;
  }

  // 入力正規化（記入採点用）
  // 括弧は「中身を残して記号のみ除去」する（有無両形の生成は acceptableAnswers 側で行う）
  function normalize(s) {
    return (s || '').toLowerCase()
      .replace(/[～~]/g, '')
      .replace(/[()（）]/g, '')
      .replace(/[.．,，!！?？:：;；'’"”\-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // 許容解答の組合せ爆発を防ぐ上限
  const MAX_VARIANTS = 64;

  // 括弧グループを「中身を残す」「丸ごと除去」の両形に展開
  // 例: "on occasion(s)" → ["on occasions", "on occasion"]
  //     "(every) once in a while" → ["every once in a while", "once in a while"]
  function expandParens(s) {
    const m = s.match(/[(（]([^()（）]*)[)）]/);
    if (!m) return [s];
    const before = s.slice(0, m.index);
    const after = s.slice(m.index + m[0].length);
    const out = [];
    for (const rest of expandParens(after)) {
      out.push(before + m[1] + rest); // 中身を残す
      out.push(before + rest);        // グループごと除去
      if (out.length >= MAX_VARIANTS) break;
    }
    return out;
  }

  // スラッシュ区切りの選択肢をトークン単位で全展開（3択以上・複数箇所も対応）
  // 例: "look back on/upon/to" → ["look back on", "look back upon", "look back to"]
  function expandSlashes(s) {
    const tokens = s.split(/\s+/).filter(Boolean);
    let variants = [''];
    for (const tok of tokens) {
      const alts = tok.includes('/') ? tok.split('/').filter(Boolean) : [tok];
      const next = [];
      for (const v of variants) {
        for (const a of (alts.length ? alts : [tok])) {
          next.push(v ? v + ' ' + a : a);
          if (next.length >= MAX_VARIANTS) break;
        }
        if (next.length >= MAX_VARIANTS) break;
      }
      variants = next;
    }
    return variants;
  }

  // 英語の許容解答リストを作る（熟語の「(～)」「(s)」「A/B/C」等を考慮）
  function acceptableAnswers(term) {
    const base = (term || '').trim();
    const set = new Set([base]);
    for (const p of expandParens(base)) {
      for (const v of expandSlashes(p)) {
        set.add(v);
        if (set.size >= MAX_VARIANTS) break;
      }
      if (set.size >= MAX_VARIANTS) break;
    }
    return Array.from(set);
  }

  /**
   * 1枚のカードから問題を生成
   * @param card {id, term(英), meaning(日)}
   * @param format 'mc-ej'|'mc-je'|'type-je'
   * @param pool 同種カード配列（誤答生成元）
   */
  function makeQuestion(card, format, pool) {
    // 語源カードはコア意味が他とかぶりやすい（例「場所」）ので、
    // 意味は短縮せずそのまま（派生併記）使い、識別性を保つ。
    const isEtym = card.deck === 'etym';
    const meaningLabel = m => (isEtym ? (m || '') : shortMeaning(m));

    if (format === 'type-je') {
      return {
        format,
        cardId: card.id,
        questionLabel: '日本語に合う英語を入力',
        prompt: card.meaning,
        // 語源カードのヒント(origin: 語源言語など)は答えが分かってしまうため表示しない
        sub: isEtym ? '' : (card.hint || ''),
        answer: card.term,
        acceptable: acceptableAnswers(card.term)
      };
    }

    // 多肢選択: 誤答3つを同プールから抽出
    const distractors = shuffle(pool.filter(p => p.id !== card.id));
    const picked = [];
    const seen = new Set([card.term]);
    for (const d of distractors) {
      if (picked.length >= 3) break;
      const key = format === 'mc-ej' ? meaningLabel(d.meaning) : d.term;
      if (seen.has(key)) continue;
      seen.add(key);
      picked.push(d);
    }

    if (format === 'mc-ej') {
      const correct = meaningLabel(card.meaning);
      const opts = shuffle([{ t: correct, correct: true, full: card.meaning }]
        .concat(picked.map(p => ({ t: meaningLabel(p.meaning), correct: false, full: p.meaning }))));
      return {
        format, cardId: card.id,
        questionLabel: '英語の意味を選択',
        prompt: card.term,
        options: opts,
        answer: correct,
        meaning: card.meaning
      };
    } else { // mc-je
      const opts = shuffle([{ t: card.term, correct: true }]
        .concat(picked.map(p => ({ t: p.term, correct: false }))));
      return {
        format, cardId: card.id,
        questionLabel: '日本語に合う英語を選択',
        prompt: meaningLabel(card.meaning),
        promptFull: card.meaning,
        options: opts,
        answer: card.term,
        meaning: card.meaning
      };
    }
  }

  // 記入採点
  function gradeTyped(input, q) {
    const ni = normalize(input);
    if (!ni) return false;
    return q.acceptable.some(a => normalize(a) === ni);
  }

  // 編集距離（タイプミス許容ヒント用）
  function editDistance(a, b) {
    a = normalize(a); b = normalize(b);
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i].concat(new Array(b.length).fill(0)));
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++)
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return dp[a.length][b.length];
  }

  global.Quiz = { makeQuestion, gradeTyped, shortMeaning, normalize, shuffle, editDistance, acceptableAnswers };
})(window);
