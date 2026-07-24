/* 出題生成・採点ロジック
 * 4形式:
 *   mc-ej : 多肢選択 英→日（英語を見て日本語訳を選ぶ）
 *   mc-je : 多肢選択 日→英（日本語を見て英語を選ぶ）
 *   type-je: 記入 日→英（日本語を見て英語をタイプ）
 *   cloze  : 記入 例文穴埋め（例文中の出題語を空欄化してタイプ）※復習カード用
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

  // ====== 例文クローズ（穴埋め） ======
  // 主要な不規則変化（動詞の過去形/過去分詞・名詞の不規則複数）。
  // 原形 → 追加で許容する形。規則変化は inflections() が生成する。
  const IRREGULAR = {
    be: ['am','is','are','was','were','been','being'],
    have: ['has','had','having'], do: ['does','did','done'],
    go: ['went','gone'], get: ['got','gotten'], take: ['took','taken'],
    make: ['made'], come: ['came'], see: ['saw','seen'], know: ['knew','known'],
    give: ['gave','given'], find: ['found'], think: ['thought'], say: ['said'],
    tell: ['told'], become: ['became'], show: ['showed','shown'], leave: ['left'],
    feel: ['felt'], put: ['put'], bring: ['brought'], begin: ['began','begun'],
    keep: ['kept'], hold: ['held'], write: ['wrote','written'], stand: ['stood'],
    hear: ['heard'], let: ['let'], mean: ['meant'], set: ['set'], meet: ['met'],
    run: ['ran'], pay: ['paid'], sit: ['sat'], speak: ['spoke','spoken'],
    lie: ['lay','lain'], lay: ['laid'], lead: ['led'], read: ['read'],
    grow: ['grew','grown'], lose: ['lost'], fall: ['fell','fallen'],
    send: ['sent'], build: ['built'], understand: ['understood'],
    draw: ['drew','drawn'], break: ['broke','broken'], spend: ['spent'],
    cut: ['cut'], rise: ['rose','risen'], drive: ['drove','driven'],
    buy: ['bought'], wear: ['wore','worn'], choose: ['chose','chosen'],
    seek: ['sought'], throw: ['threw','thrown'], catch: ['caught'],
    deal: ['dealt'], win: ['won'], forget: ['forgot','forgotten'],
    fight: ['fought'], teach: ['taught'], eat: ['ate','eaten'],
    sell: ['sold'], strike: ['struck'], fly: ['flew','flown'],
    hide: ['hid','hidden'], shake: ['shook','shaken'], bear: ['bore','borne','born'],
    hit: ['hit'], cost: ['cost'], hurt: ['hurt'], shut: ['shut'], quit: ['quit'],
    swear: ['swore','sworn'], tear: ['tore','torn'], steal: ['stole','stolen'],
    freeze: ['froze','frozen'], forbid: ['forbade','forbidden'],
    arise: ['arose','arisen'], undergo: ['underwent','undergone'],
    overcome: ['overcame'], withdraw: ['withdrew','withdrawn'],
    sing: ['sang','sung'], ring: ['rang','rung'], sink: ['sank','sunk'],
    swim: ['swam','swum'], blow: ['blew','blown'], bend: ['bent'],
    lend: ['lent'], shoot: ['shot'], feed: ['fed'], bind: ['bound'],
    hang: ['hung'], stick: ['stuck'], swing: ['swung'], spring: ['sprang','sprung'],
    burst: ['burst'], spread: ['spread'], cast: ['cast'], shed: ['shed'],
    child: ['children'], man: ['men'], woman: ['women'], foot: ['feet'],
    tooth: ['teeth'], mouse: ['mice'], person: ['people'],
    criterion: ['criteria'], phenomenon: ['phenomena'], analysis: ['analyses'],
    crisis: ['crises'], hypothesis: ['hypotheses'], medium: ['media'],
    datum: ['data'], stimulus: ['stimuli'], fungus: ['fungi']
  };

  // 単語の活用形を列挙（完全一致ベースで誤ブランク化を防ぐ。creative≠create）
  function inflections(w) {
    w = w.toLowerCase();
    const out = new Set([w, w + 's', w + 'es', w + 'ed', w + 'd', w + 'ing']);
    if (IRREGULAR[w]) IRREGULAR[w].forEach(f => out.add(f));
    const last = w.slice(-1);
    if (last === 'e') out.add(w.slice(0, -1) + 'ing');            // make→making
    if (last === 'y') {
      out.add(w.slice(0, -1) + 'ies');                            // try→tries
      out.add(w.slice(0, -1) + 'ied');                            // try→tried
    }
    if (/[bcdfghjklmnpqrstvz]$/.test(w) && /[aeiou][bcdfghjklmnpqrstvz]$/.test(w)) {
      out.add(w + last + 'ed');                                   // stop→stopped
      out.add(w + last + 'ing');                                  // run→running
    }
    if (w.endsWith('f')) out.add(w.slice(0, -1) + 'ves');         // leaf→leaves
    if (w.endsWith('fe')) out.add(w.slice(0, -2) + 'ves');        // knife→knives
    return out;
  }

  /**
   * 例文から出題語をブランク化したクローズ問題素材を作る。
   * 語の活用形（-s/-ed/-ing 等）にも対応。多語熟語は各語の活用を許容して連続一致。
   * @returns {clozeText, surface} | null（例文中に語が見つからない場合）
   */
  function makeCloze(term, example) {
    if (!term || !example) return null;
    // 例文中の英単語トークンと位置を列挙
    const tokens = [];
    const re = /[A-Za-z][A-Za-z']*/g;
    let m;
    while ((m = re.exec(example)) !== null) tokens.push({ t: m[0], i: m.index });
    if (!tokens.length) return null;

    // term の許容形（括弧・スラッシュ展開）それぞれで連続一致を探す
    for (const variant of acceptableAnswers(term)) {
      // 熟語の目的語プレースホルダ「～」は先頭・末尾なら除去して照合
      // （例: "a piece of ～" → "a piece of"）。内部に残る場合は照合不可。
      let words = variant.toLowerCase().split(/\s+/).filter(Boolean);
      while (words.length && /^[～~]+$/.test(words[0])) words.shift();
      while (words.length && /^[～~]+$/.test(words[words.length - 1])) words.pop();
      // 末尾の動詞プレースホルダ「to do」「to doing」等は do/doing を除去して照合
      // （例: "be likely to do" → "be likely to"）。"make do" 等の実熟語を壊さないよう
      // 直前が to の場合のみ。oneself/others も同様のプレースホルダ扱い。
      if (words.length >= 3 && /^(do|doing)$/.test(words[words.length - 1]) && words[words.length - 2] === 'to')
        words.pop();
      while (words.length >= 2 && /^(oneself|others)$/.test(words[words.length - 1]))
        words.pop();
      if (!words.length || words.some(w => !/^[a-z][a-z']*$/.test(w))) continue;
      const formSets = words.map(inflections);
      // be動詞開始の熟語（be aware of 等）は、be の直後に副詞が挟まる形
      // （"is fully aware of"）を許容する（最大2語スキップ）。
      const allowSkipAfterBe = words[0] === 'be' && words.length >= 2;
      for (let i = 0; i + words.length <= tokens.length; i++) {
        let ok = true, ti = i;
        for (let j = 0; j < words.length; j++) {
          if (ti >= tokens.length) { ok = false; break; }
          if (formSets[j].has(tokens[ti].t.toLowerCase())) { ti++; continue; }
          // be の直後のみ、副詞などの挿入語を最大2語まで読み飛ばす
          if (allowSkipAfterBe && j === 1) {
            let skipped = 0, k = ti;
            while (skipped < 2 && k + 1 < tokens.length && !formSets[j].has(tokens[k].t.toLowerCase())) { k++; skipped++; }
            if (formSets[j].has(tokens[k].t.toLowerCase())) { ti = k + 1; continue; }
          }
          ok = false; break;
        }
        if (!ok) continue;
        const start = tokens[i].i;
        const endTok = tokens[ti - 1];
        const end = endTok.i + endTok.t.length;
        const surface = example.slice(start, end);
        const blank = '（　？　）';
        return { clozeText: example.slice(0, start) + blank + example.slice(end), surface };
      }
    }
    return null;
  }

  /**
   * 1枚のカードから問題を生成
   * @param card {id, term(英), meaning(日)}
   * @param format 'mc-ej'|'mc-je'|'type-je'|'cloze'
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

    if (format === 'cloze') {
      // 例文の穴埋め: 空欄に入る語（出題語の例文中の実際の形）をタイプさせる。
      // 採点は「例文中の表記そのまま」または「原形（term の許容形）」の両方を正解とする。
      const cz = makeCloze(card.term, card.example);
      if (!cz) return makeQuestion(card, 'type-je', pool); // フォールバック
      const acceptable = acceptableAnswers(card.term).concat([cz.surface]);
      return {
        format: 'cloze',
        cardId: card.id,
        questionLabel: '例文の空欄に入る英語を入力',
        prompt: cz.clozeText,
        promptJa: card.exampleJa || '',
        meaningHint: card.meaning,
        answer: cz.surface,
        term: card.term,
        acceptable
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

  global.Quiz = { makeQuestion, gradeTyped, shortMeaning, normalize, shuffle, editDistance, acceptableAnswers, makeCloze };
})(window);
