// Supabase 認証＋データ保存モジュール（ES module）
// 旧 Firebase 実装を置き換えたもの。非moduleのIIFEスクリプト群とは
// window.VFAuth 経由で橋渡しする（インターフェースは Firebase 版と互換）。
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ==== 接続情報（要望によりコードに直書き）====
const SUPABASE_URL = 'https://rfgsiyosrggeeucwtazc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmZ3NpeW9zcmdnZWV1Y3d0YXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MTIxMzcsImV4cCI6MjA5ODQ4ODEzN30.myx8v5_E1AVu6SfJ6OSatcAulpL71ZzdtjBsSD2eQTY';

// 学習データを保存するテーブル名（下記スキーマを Supabase 側に用意しておく想定）
//   create table public.user_data (
//     user_id uuid primary key references auth.users(id) on delete cascade,
//     data jsonb,
//     updated_at timestamptz default now(),
//     updated_at_ms bigint
//   );
//   alter table public.user_data enable row level security;
//   create policy "own rows" on public.user_data
//     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
const TABLE = 'user_data';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,        // ログイン状態をローカルに永続化
    autoRefreshToken: true,
    detectSessionInUrl: true     // OAuth リダイレクト復帰時にURLからセッションを検出
  }
});

// Supabase の user オブジェクトを VFAuth 用の形に整形
function toVFUser(u) {
  if (!u) return null;
  const m = u.user_metadata || {};
  return {
    uid: u.id,
    name: m.full_name || m.name || '',
    email: u.email || '',
    photo: m.avatar_url || m.picture || ''
  };
}

// 非moduleコードへ橋渡しするグローバルAPI（Firebase 版と同一インターフェース）
const VFAuth = {
  ready: false,
  user: null,
  current() {
    return VFAuth.user;
  },
  // Google でログイン（Supabase OAuth・リダイレクト方式）
  async login() {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          // 現在のページに戻す（クエリ等は付けない）
          redirectTo: window.location.origin + window.location.pathname
        }
      });
      if (error) return { ok: false, error: error.message || String(error) };
      // 成功時はブラウザが Google 側へリダイレクトするため、ここには基本戻らない
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },
  // ログアウト
  async logout() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) return { ok: false, error: error.message || String(error) };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },
  // 状態変化時に呼ばれるコールバック登録（複数可）
  _listeners: [],
  onChange(fn) {
    if (typeof fn === 'function') {
      VFAuth._listeners.push(fn);
      // 登録時点の状態を即時通知
      if (VFAuth.ready) fn(VFAuth.user);
    }
  },

  // ---- Supabase DB 同期 ----
  // クラウドの学習データを取得（未ログイン/未保存なら null）
  // 返り値: { ok, data } | { ok:false, error }
  async loadCloud() {
    if (!VFAuth.user) return { ok: false, error: 'not-logged-in' };
    try {
      const { data: row, error } = await supabase
        .from(TABLE)
        .select('data, updated_at_ms')
        .eq('user_id', VFAuth.user.uid)
        .maybeSingle();
      if (error) return { ok: false, error: error.message || String(error) };
      if (!row) return { ok: true, data: null };
      return { ok: true, data: row.data || null, updatedAt: row.updated_at_ms || null };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },
  // クラウドへ学習データを保存
  //   payload: { cards, logs, settings, daily, seen }
  //   contentUpdatedAt: 任意。「その内容が最後に変更された時刻(ms)」。
  //     省略時のみ Date.now() を使う。指定された場合はその時刻を
  //     updated_at_ms / updated_at にそのまま書き込むので、
  //     古い内容を送っても «サーバー時刻だけが進んで新しいデータを潰す» 事故を防げる。
  async saveCloud(payload, contentUpdatedAt) {
    if (!VFAuth.user) return { ok: false, error: 'not-logged-in' };
    try {
      // undefined を確実に除去（jsonb に安全に載せるため）
      const cleanData = JSON.parse(JSON.stringify(payload));
      const nowMs = (typeof contentUpdatedAt === 'number' && isFinite(contentUpdatedAt) && contentUpdatedAt > 0)
        ? contentUpdatedAt
        : Date.now();
      const { error } = await supabase
        .from(TABLE)
        .upsert({
          user_id: VFAuth.user.uid,
          data: cleanData,
          updated_at: new Date(nowMs).toISOString(),
          updated_at_ms: nowMs
        }, { onConflict: 'user_id' });
      if (error) {
        console.error('Supabase saveCloud error:', error);
        return { ok: false, error: error.message || String(error) };
      }
      return { ok: true, updatedAt: nowMs };
    } catch (e) {
      console.error('Supabase saveCloud error:', e);
      return { ok: false, error: String(e) };
    }
  }
};

// 行単位同期（outbox.js）が card_states / review_logs / daily_stats を直接読み書きするため、
// クライアントをそのまま公開する。outbox.js は非module スクリプトなので import できない。
// 既存の loadCloud / saveCloud（user_data の丸ごと同期）には一切手を入れていない。
VFAuth.client = supabase;

// 状態変化を配信するヘルパ
function emit() {
  VFAuth._listeners.forEach((fn) => {
    try { fn(VFAuth.user); } catch (_) {}
  });
}

// 認証状態の変化を購読（初回セッション復元・ログイン・ログアウトすべてここに来る）
supabase.auth.onAuthStateChange((_event, session) => {
  VFAuth.ready = true;
  VFAuth.user = toVFUser(session && session.user ? session.user : null);
  emit();
});

// 起動直後に現在のセッションを一度取得しておく（購読が発火しないケースの保険）
supabase.auth.getSession().then(({ data }) => {
  VFAuth.ready = true;
  VFAuth.user = toVFUser(data && data.session ? data.session.user : null);
  emit();
}).catch(() => {
  VFAuth.ready = true;
  emit();
});

window.VFAuth = VFAuth;
// 非moduleスクリプト（cloud-sync.js など）は module より先に実行されるため、
// VFAuth が用意できたことを通知して初期化を促す。
try { window.dispatchEvent(new Event('vfauth-ready')); } catch (e) {}
