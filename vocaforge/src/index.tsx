import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono()

app.use('/api/*', cors())

// ヘルスチェック / メタ情報
app.get('/api/health', (c) => c.json({ ok: true, name: 'VocaForge' }))

// メインページ（SPA）
app.get('/', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="theme-color" content="#0f172a">
  <link rel="icon" type="image/svg+xml" href="/static/favicon.svg">
  <title>VocaForge — 英語語彙 超強化トレーナー</title>
  <link rel="preconnect" href="https://cdn.jsdelivr.net">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">
  <link href="/static/style.css" rel="stylesheet">
  <script>
    tailwind.config = {
      theme: { extend: {
        colors: { brand: { DEFAULT:'#6366f1', dark:'#4f46e5' } },
        fontFamily: { sans: ['Inter','Noto Sans JP','sans-serif'] }
      }}
    }
  </script>
</head>
<body class="bg-slate-950 text-slate-100 font-sans antialiased">
  <div id="app"></div>
  <script type="module" src="/static/firebase-auth.js"></script>
  <script src="/static/fsrs.js"></script>
  <script src="/static/store.js"></script>
  <script src="/static/quiz.js"></script>
  <script src="/static/app.js"></script>
  <script src="/static/views.js"></script>
  <script src="/static/views2.js"></script>
  <script src="/static/session.js"></script>
  <script src="/static/flashcard.js"></script>
</body>
</html>`)
})

export default app
