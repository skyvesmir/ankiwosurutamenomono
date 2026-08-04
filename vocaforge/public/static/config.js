/* 接続設定（非module のクラシックスクリプト。他のどの script タグよりも先に読む）
 *
 * ここに置く値は「公開される前提」のものだけ。
 *   Supabase の anon key は、ブラウザに配る前提で発行されている公開鍵。
 *   秘密ではないので、隠す必要はない（隠しても意味がない）。
 *   実際の防御は Supabase 側の RLS（行レベルセキュリティ）が
 *   「auth.uid() = user_id」で行っている。anon key を持っているだけでは
 *   他人の行は1件も読めない。
 *
 * なぜコードから分離したか:
 *   ・接続先を切り替えるとき（検証用プロジェクトに向ける等）に
 *     supabase-auth.js 本体を触らずに済む
 *   ・「どのファイルに設定が書いてあるか」を1か所に固定できる
 *
 * このファイルは .gitignore に入れない。
 *   公開前提の値しか入っていないので、リポジトリに入っていて問題はない。
 *   逆に無視するとビルド後に config.js が消えてクラウド同期が死ぬ。
 *   壊れる方が有害。
 *
 * このファイルが読み込めない・壊れている場合:
 *   supabase-auth.js が「クラウド同期は使えません（ローカルのみ）」として
 *   動くようになっている。アプリは落ちない。学習はローカルで続けられる。
 */
window.VF_CONFIG = {
  SUPABASE_URL: 'https://rfgsiyosrggeeucwtazc.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmZ3NpeW9zcmdnZWV1Y3d0YXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MTIxMzcsImV4cCI6MjA5ODQ4ODEzN30.myx8v5_E1AVu6SfJ6OSatcAulpL71ZzdtjBsSD2eQTY'
};
