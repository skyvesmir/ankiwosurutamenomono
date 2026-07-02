# VocaForge — 英語語彙 超強化トレーナー

## プロジェクト概要
- **名称**: VocaForge
- **目的**: 英語語彙力の超強化（特定大学対策ではなく、汎用的な語彙力底上げ）
- **対象データ**:
  - 英単語 **1900語**（ターゲット1900 / 100語ごと全19セクション）
  - 英熟語 **1000語**（英熟語ターゲット1000 5訂版の公式パート構成に準拠：Part1 絶対覚えておきたい180 / Part2 グルーピングで覚える240 / Part3 形で覚える240 / Part4 文法・構文で覚える170 / Part5 ここで差がつく難熟語170）
  - 語源 **590件**（接頭辞140・接尾辞140・語根310。うち学習カード539件＋参照ノート51件）。接頭辞・接尾辞・語根それぞれを**意味（テーマ大分類：方向・位置／時間／数量・程度…）でグルーピング**し、単語のSection・熟語のPartと同じ選択単位として学習・フラッシュカードで扱える（全38グループ）
  - 語源の出題は**コア意味に派生的な意味を併記**（例「場所（位置、地方）」「場所（地形、論題）」）して識別性を確保。同じコア意味の接辞・語根（loc-とtop-など）が区別できるようにし、入力形式では語源言語をヒント表示（例「ラテン語 *locus*」）。これにより539カード全ての意味ラベルが一意になる
- **設計根拠**: 同梱の「暗記アプリ設計のための学習科学ガイド」に準拠

## 完成した機能
- **3つの出題形式**（学習科学ガイドの「能動的想起の強制」に対応）
  - 選択：英→日（英語を見て意味を選ぶ）
  - 選択：日→英（日本語を見て英語を選ぶ）
  - 記入：日→英（日本語を見て英語をタイプ。最も強力な想起）
- **フラッシュカードモード**（「一覧」タブから起動）
  - デッキ（単語/熟語/語源）とセクションを選んでカードをめくる自由閲覧モード
  - 表⇄裏のタップ/キーでフリップ、英→日／日→英の向き切替、シャッフル、「あとで」マーク
  - キーボード操作（← →で移動、Space/Enterでめくる、Escで終了）
  - めくり終わったらそのままテスト出題へ移行可能（定着）
  - 熟語のセクションは英熟語ターゲット1000の公式パート構成で選択
- **FSRS-4.5 スケジューラ**：分散学習・望ましい困難を内包した間隔反復。Again/Hard/Good/Easy の4段階自己評価。各評価で次回間隔をプレビュー表示。
- **復習キューの自動生成**：復習期限カードを優先し、1日の新規カード上限を尊重。
- **インターリービング**：カテゴリを混ぜて出題（交互練習）。設定でON/OFF。
- **記入の柔軟採点**：大小文字・記号・空白の差を許容（厳密採点も選択可）。熟語の `of/about` 等のスラッシュ表記両対応、スペル違いの検出。
- **リーチ（苦手カード）検出**：規定回数以上間違えたカードを統計で警告。
- **完全な復習ログ保存**：card_id・日時・評価・経過日数・所要時間・S/D前後値（将来のFSRSパラメータ最適化に対応）。
- **学習統計**：連続学習日数、直近保持率、総復習回数、記憶ステージ別件数、直近14日の学習量グラフ。
- **語彙一覧・検索・詳細**：全語彙をブラウズ・検索。語源カードは派生語・イメージ・覚え方・混同注意まで詳細表示。
- **設定**：目標保持率、1日の新規上限、出題形式のON/OFF、インターリービング、採点厳格度、データリセット。
- **データのエクスポート/インポート**：学習進捗・記憶状態・統計をJSONファイルに書き出し（エクスポート）、別端末・別ブラウザへ引き継ぎ可能（インポート）。インポートは「統合（足し合わせ）」「置換（上書き）」を選択でき、不正ファイルは自動で拒否する。
- **データはローカル完結**：学習進捗・FSRS状態・ログは localStorage に保存（サーバー不要・プライバシー保護）。バックアップはエクスポート機能で取得。
- **Supabase 認証（Googleログイン）**：「設定」タブの「アカウント」からGoogleアカウントでログイン／ログアウト可能。Supabase JS SDK v2（esm.sh CDN、ESモジュール）を `supabase-auth.js` で初期化し、`signInWithOAuth({provider:'google'})`（リダイレクト方式）を使用。ログイン状態は `persistSession` で永続化し、`window.VFAuth` 経由で非moduleのアプリ本体と橋渡しする。
- **クラウド同期（Supabase Database）**：ログインすると学習データ（カード記憶状態・ログ・設定・日次・既出）を Supabase の `user_data` テーブル（`user_id` 1行・`jsonb`）に自動同期。ローカル更新をデバウンス（約1.5秒）して `upsert` で保存し、複数端末間で進捗を共有できる。設定画面に同期ステータス（同期中／保存済み／エラー）を表示。
- **ゲストデータの引き継ぎと競合解決**：ログイン前（未ログイン=localStorage）に進めた学習データは、初回ログイン時に Supabase へ引き継ぐ。クラウド側にも既にデータがある場合は、ユーザーに「統合（マージ）／クラウド優先／この端末優先」を確認して適用する。

## 機能エントリ（URI）
- `GET /` — アプリ本体（SPA）
- `GET /api/health` — ヘルスチェック（`{ok:true,name:"VocaForge"}`）
- `GET /static/data/words.json` — 英単語1900件
- `GET /static/data/phrases.json` — 英熟語1000件
- `GET /static/data/etymology.json` — 語源590件
- `GET /static/data/meta.json` — 件数メタ情報

## データ構造
- **語彙カード（単語・熟語）**: `{id, no, term(英), meaning(日), section, sectionCode, sectionTitle, sectionRange}`（熟語のsectionは公式Part番号）
- **語源カード**: `{id, category(prefix/suffix/root), headword, variants, theme, themeGroup(意味大分類), group("category:themeGroup"複合キー), core(コア意味), derived, origin, image_hint, examples[], tips, confusion, importance, learnable}`
- **語源グループ（meta.etym_groups）**: `{category, theme, key, count}` — カテゴリ×意味大分類の選択単位（38グループ）
- **記憶状態（localStorage）**: `{state, stability(S), difficulty(D), due, last_review, reps, lapses, is_leech}`（FSRS）
- **クラウド行（Supabase `public.user_data`）**: `{user_id(uuid, PK), data(jsonb):{cards, logs, settings, daily, seen}, updated_at(timestamptz), updated_at_ms(bigint)}`
- **復習ログ（localStorage）**: `{card_id, reviewed_at, grade, format, elapsed_days, duration_ms, s_before/after, d_before/after}`
- **バックアップファイル（エクスポート/インポート）**: `{app:'vocaforge', type:'vocaforge-backup', version, exportedAt, data:{cards, logs, settings, daily, seen}}`

## 使い方
1. ホームの「復習を開始 / 新規学習を開始」で今日の学習を始める。または「学習」タブからデッキ・セクションを選ぶ。
2. 出題に答える（選択 or 入力）。答えると正解・意味が表示される。
3. 手応えを「もう一度／難しい／できた／簡単」で評価（キーボード 1〜4 でも可）。これで次回の復習日が決まる。
4. 毎日続けると「連続学習日数」が伸び、忘れかけたタイミングで自動的に復習が出題される。
5. 「統計」タブで保持率や進捗、「設定」タブで学習ペースや出題形式を調整できる。
6. 機種変更や別ブラウザへの引き継ぎは、「設定」タブ →「データの管理」からエクスポート（ファイル保存）／インポート（読み込み）で行う。

## 技術構成
- **バックエンド**: Hono（Cloudflare Pages / Workers）— 静的データ配信＋SPA配信
- **フロントエンド**: Vanilla JS（依存最小）＋ TailwindCSS（CDN）＋ Font Awesome
- **アルゴリズム**: FSRS-4.5（自前実装、デフォルト重み）
- **永続化**: ブラウザ localStorage
- **認証**: Supabase Auth（Google OAuth、JS SDK v2）
- **クラウド同期**: Supabase Database（`public.user_data` に学習データを1行=jsonbで保存、デバウンス自動同期）

## 未実装・今後の推奨ステップ
- 穴埋め（Cloze）形式カードの追加（ガイド推奨の最重要形式の一つ）
- 復習ログ1000件以上蓄積後のFSRSパラメータ自動最適化
- 音声読み上げ（TTS）による発音学習
- 例文・コロケーションの追加

## デプロイ
- **プラットフォーム**: Cloudflare Pages
- **ステータス**: ✅ ローカル稼働中（PM2 + wrangler pages dev, port 3000）
- **本番URL**: 未デプロイ
- **最終更新**: 2026-07-02（認証・クラウド同期を Firebase → Supabase に移行）
- **Supabase 側の設定（要対応）**:
  - Authentication → Providers で **Google を有効化**（Google Cloud の OAuth クライアントID/シークレットを登録）。
  - Authentication → URL Configuration の **Redirect URLs** に公開URL（`*.pages.dev` 本番／サンドボックス）と `http://localhost:3000` を追加。
  - **`user_data` テーブルを作成**し、RLS を有効化して「本人の行のみ読み書き可」ポリシーを設定（下記SQL参照）。

```sql
create table public.user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb,
  updated_at timestamptz default now(),
  updated_at_ms bigint
);
alter table public.user_data enable row level security;
create policy "own rows" on public.user_data
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

## ローカル実行
```bash
npm run build
pm2 start ecosystem.config.cjs
# http://localhost:3000
```
