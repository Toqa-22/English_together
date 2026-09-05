// ============================================================
// SUPABASE CLIENT
// This app does NOT use Supabase Auth — no email, anywhere, ever, not even
// hidden internally. Login is a plain database RPC (see js/auth.js) that
// returns a random session token, which we attach to every request as a
// custom `x-session-token` header. Postgres RLS policies read that header
// via `current_profile_id()` (defined in schema.sql) to know who's asking.
//
// NEVER put the service_role key here — anon key only.
// ============================================================
const SUPABASE_URL = "https://xbtgjeikjipzdjlhneds.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhidGdqZWlramlwemRqbGhuZWRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0MDc4NDAsImV4cCI6MjEwMjk4Mzg0MH0.DmQH6y30AERhD9e9DpVukySwYE7jxpAd29kGvo51t6I";

// The CDN script (loaded before this file) creates a global `supabase` — the
// library namespace, with .createClient(). We keep a reference to that
// factory under a different name (SupabaseLib) before overwriting `supabase`
// itself with the actual client instance, so we can rebuild the client later
// (with a fresh session-token header) without redeclaring `supabase` — doing
// that with `const`/`let` throws "Identifier 'supabase' has already been
// declared" in plain <script> tags, which is exactly what broke this before.
const SupabaseLib = window.supabase;

function rebuildSupabaseClient(token) {
  window.supabase = SupabaseLib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { "x-session-token": token || "" } }
  });
}

rebuildSupabaseClient(localStorage.getItem("ra_session_token"));
