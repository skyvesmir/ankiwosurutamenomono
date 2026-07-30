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
  <meta name="theme-color" content="#0b1020" id="meta-theme">
  <link rel="icon" type="image/svg+xml" href="/static/favicon.svg">
  <script>
    // テーマ初期化（FOUC防止のためheadで即時実行）
    (function () {
      var pref = null;
      try { pref = localStorage.getItem('vf-theme'); } catch (e) {}
      var dark = pref ? pref === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.add(dark ? 'dark' : 'light');
      window.__applyTheme = function (mode) { // 'dark' | 'light' | 'auto'
        try { mode === 'auto' ? localStorage.removeItem('vf-theme') : localStorage.setItem('vf-theme', mode); } catch (e) {}
        var d = mode === 'auto' ? window.matchMedia('(prefers-color-scheme: dark)').matches : mode === 'dark';
        document.documentElement.classList.toggle('dark', d);
        document.documentElement.classList.toggle('light', !d);
        var m = document.getElementById('meta-theme');
        if (m) m.setAttribute('content', d ? '#0b1020' : '#eef1f8');
      };
      window.__themeMode = function () {
        try { return localStorage.getItem('vf-theme') || 'auto'; } catch (e) { return 'auto'; }
      };
      // OS設定の変化に追従（auto時のみ）
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
        if (window.__themeMode() === 'auto') window.__applyTheme('auto');
      });
    })();
  </script>
  <title>VocaForge — 英語語彙 超強化トレーナー</title>
  <link rel="preconnect" href="https://cdn.jsdelivr.net">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">
  <link href="/static/style.css" rel="stylesheet">
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: { extend: {
        colors: { brand: { DEFAULT:'#6366f1', dark:'#4f46e5' } },
        fontFamily: { sans: ['Inter','Noto Sans JP','sans-serif'] }
      }}
    }
  </script>
</head>
<body class="text-slate-100 font-sans antialiased">
  <svg aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden" focusable="false">
    <filter id="lg-refract" x="0%" y="0%" width="100%" height="100%" color-interpolation-filters="sRGB">
      <feImage x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map"
        href="data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='560' height='56'%3E%3Cdefs%3E%3ClinearGradient id='gx' x1='0' y1='0' x2='1' y2='0'%3E%3Cstop offset='0' stop-color='%23000000'/%3E%3Cstop offset='1' stop-color='%23ff0000'/%3E%3C/linearGradient%3E%3ClinearGradient id='gy' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23000000'/%3E%3Cstop offset='1' stop-color='%230000ff'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='560' height='56' fill='url(%23gx)'/%3E%3Crect width='560' height='56' fill='url(%23gy)' style='mix-blend-mode:screen'/%3E%3Crect x='7' y='7' width='546' height='42' rx='21' fill='%237f007f' style='filter:blur(7px)'/%3E%3C/svg%3E"/>
      <feDisplacementMap in="SourceGraphic" in2="map" scale="44" xChannelSelector="R" yChannelSelector="B"/>
    </filter>
  </svg>
  <div id="app"></div>
  <script type="module" src="/static/supabase-auth.js"></script>
  <script src="/static/fsrs.js"></script>
  <script src="/static/store.js"></script>
  <script src="/static/optimizer.js"></script>
  <script src="/static/quiz.js"></script>
  <script src="/static/app-data.js"></script>
  <script src="/static/app-router.js"></script>
  <script src="/static/app-settings.js"></script>
  <script src="/static/app-account.js"></script>
  <script src="/static/views.js"></script>
  <script src="/static/views2-stats.js"></script>
  <script src="/static/views2-browse.js"></script>
  <script src="/static/views2-settings.js"></script>
  <script src="/static/views2.js"></script>
  <script src="/static/session-queue.js"></script>
  <script src="/static/session-format.js"></script>
  <script src="/static/session-answer.js"></script>
  <script src="/static/session.js"></script>
  <script src="/static/flashcard.js"></script>
  <script src="/static/outbox.js"></script>
  <script src="/static/cloud-sync.js"></script>
  <script src="/static/app.js"></script>
</body>
</html>`)
})

export default app
