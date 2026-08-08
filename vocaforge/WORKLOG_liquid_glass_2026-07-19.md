# 作業ログ: Liquid Glass 統合の試み（2026-07-19 中止・全復元済み）

**状態: すべての変更は git checkout / ファイル削除で完全に復元済み。**
アプリは commit `6df7d24`（GitHub と同一）の状態で稼働中。GitHub への push は一切していない。

---

## どこまでやったか

### 1. リサーチフェーズ（完了）
- **Apple 参照画像 3 枚をローカル取得・視覚確認済み**（→ 復元時に削除）
  - Apple Newsroom: iOS 26 Music のガラスミニプレイヤー+タブバー
  - designboom: iOS 26 ホーム画面の透明アイコン
  - Apple Developer "Adopting Liquid Glass" ヒーロー画像（Mac/iPad/iPhone のサイドバーガラス）
- **Web 再現実装の調査（リンク・技術・学び）**
  - liquidGL (github.com/naughtyduk/liquidGL): WebGL + html2canvas スナップショット方式。全ブラウザ対応。共有 canvas 1 枚方式。ただし html2canvas 依存が必要
  - kube.io/blog/liquid-glass-css-svg/: Snell の法則で displacement map を事前計算 → feDisplacementMap。**Chrome 限定**（backdrop-filter: url() は Chromium のみ / WebKit bug #127102 / Firefox 未対応）
  - その他: Liquid Glass Studio、rxing365/html-liquid-glass-effect-webgl、AtomixGlass、liquid-glass.ybouane.com
- **ブラウザ互換性の結論**: クロスブラウザの屈折は WebGL2 必須。CSS の backdrop-filter blur/saturate は全ブラウザ OK
- PROGRESS.md に記録していた（→ 復元時に削除。内容はこのログに要約済み）

### 2. 実装フェーズ（動作する状態まで到達 → 復元で破棄）
すべて既存機能を触らないアドオン構成だった:
- **style.css 末尾に CSS レイヤー追記**: bounce（弾性 cubic-bezier）/ ripple（ポインタ座標から拡張）/ shimmer（@property + conic-gradient 回転光帯）/ highlight tracking（--shine-x/--shine-y）/ ダーク・ライト両テーマのガラストークン
- **新規 public/static/liquid-glass.js（約 17KB）**: WebGL2 エンジン
  - 全ガラス要素を SDF rounded-rect として単一共有 canvas に描画
  - smooth-min による近接モーフィング / ベゼル帯のみの屈折+RGB 色収差 / リムスペキュラ
  - 要素間光相互作用（複数エミッタ、距離減衰 × 法線角度、スクロール・リサイズ追従）
  - 背景は html2canvas を使わず style.css の radial-gradient を GLSL で数式再現（依存ゼロ）
  - WebGL2 不可 → CSS フォールバック / モバイル段階的縮退 / MutationObserver で innerHTML 再描画に追従
- **src/index.tsx に script タグ 1 行追加**
- 構文・シェーダ構造の自動テスト全 PASS、実ブラウザ（PlaywrightConsoleCapture）で「mode: WebGL2」起動確認、シェーダコンパイルエラーなし

### 3. 検証フェーズ（途中で中止）
- テストページのスクリーンショット取得（ダーク/ライト/発光状態）まで実施
- **中止時点の見た目の問題**: ユーザーの知る Liquid Glass とはかけ離れていた。
  - 撮影結果ではカードの縁に WebGL の縁取りが「白っぽい膨らんだ枠」として出ており、Apple の「クリアなガラスの内側で背景がレンズ状に歪む」質感になっていなかった
  - 背景をシェーダ内で数式再現する方式のため、**実際のページコンテンツ（テキスト・カード）は屈折しない**。Apple の本物は背後のコンテンツそのものが歪む。ここが本質的な乖離

## 次にやるなら（教訓）
1. 「背景グラデーション再現」方式では本物感が出ない。**実 DOM を屈折させる**必要がある → liquidGL 同様のスナップショット方式（html2canvas 相当を自前実装するか、依存許可をもらう）が現実的
2. WebGL の描画を「縁の帯」に限定しても、アルファ合成が枠っぽく見える。ガラス面全体を WebGL で描き、その上にテキストを DOM で重ねる構造（liquidGL の構造）のほうが Apple に近い
3. サンドボックスはメモリ 1GB で npm install / スクリーンショット環境構築が不安定。視覚検証は外部サービス（image.thum.io）+ PlaywrightConsoleCapture が有効だった

## 途中で渡された Apple 公式 Zip（Landmarks サンプル）について
- 内容: SwiftUI の公式サンプル。`GlassEffectContainer` / `.glassEffect(.regular, in: .rect(...))` / `.glassEffectID`（モーフィング用 ID）/ `.buttonStyle(.glass)` の使用例を確認した
- **参考になった点（限定的）**: API の使い方から「ガラスは装飾でなく、コンテナ内の要素同士がアニメーションで形状ブレンドする」という設計思想の裏付けが取れた。可読性確保のため画像上にグラデーションを敷く `ReadabilityRoundedRectangle` パターンも確認
- **参考にならなかった点**: 視覚効果の実装本体（屈折・ハイライトのレンダリング）は SwiftUI ランタイム内部にあり、コードからは一切見えない。Web 移植に必要なシェーダ的知見はゼロ。ユーザーの予想どおり「多分参考にならない」がほぼ正しい

## 復元の内訳
- `git checkout --` : vocaforge/public/static/style.css, vocaforge/src/index.tsx
- 削除: public/static/liquid-glass.js, public/static/lg-test.html, PROGRESS.md, research/（参照画像・スクリーンショット含む）, dist 内の生成物
- 再ビルド + PM2 再起動済み。root 200 / liquid-glass.js 404 を確認
