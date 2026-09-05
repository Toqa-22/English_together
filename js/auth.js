// ============================================================
// AUTH — pure database username/password auth, no Supabase Auth involved.
// A session is just a random token in the `sessions` table (see schema.sql),
// stored in localStorage and sent back as an `x-session-token` header on
// every request. RLS policies trust that header via current_profile_id().
// ============================================================

const Auth = {
  _setToken(token) {
    localStorage.setItem("ra_session_token", token || "");
    rebuildSupabaseClient(token);
  },

  // Pages live either at the site root (index.html) or one level deep
  // (student/*.html, admin/*.html). Computing this relatively — instead of
  // hardcoding "/index.html" — means logout/redirects still land correctly
  // even if the app isn't hosted at the domain root (e.g. a GitHub Pages
  // project site served from a subfolder).
  _indexPath() {
    return /\/(student|admin)\//.test(location.pathname) ? "../index.html" : "index.html";
  },

  async login(username, password) {
    username = username.trim();
    if (!username) throw new Error("Please enter your username.");

    const { data, error } = await supabase.rpc("login", { p_username: username, p_password: password });
    if (error) throw new Error(error.message || "Invalid username or password.");

    this._setToken(data.token);
    return data.profile;
  },

  async logout() {
    try { await supabase.rpc("logout"); } catch (e) { /* token may already be gone, fine either way */ }
    this._setToken(null);
    window.location.href = this._indexPath();
  },

  hasToken() {
    return !!localStorage.getItem("ra_session_token");
  },

  async getProfile() {
    if (!this.hasToken()) return null;
    const { data, error } = await supabase.rpc("get_current_profile");
    if (error || !data) return null;
    return data;
  },

  /**
   * Call at the top of every protected page.
   * requiredRole: "admin" | "student" | null (any logged-in user)
   * Redirects to the login page if unauthenticated, or to the correct home if wrong role.
   */
  async guard(requiredRole = null) {
    const profile = await this.getProfile();
    if (!profile) {
      this._setToken(null);
      window.location.href = this._indexPath();
      return null;
    }
    if (!profile.active) {
      await this.logout();
      return null;
    }
    if (requiredRole && profile.role !== requiredRole) {
      window.location.href = profile.role === "admin" ? "/admin/dashboard.html" : "/student/dashboard.html";
      return null;
    }
    return profile;
  }
};
