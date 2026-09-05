(async () => {
  const profile = await Auth.guard("admin");
  if (!profile) return;

  Utils.$("#logout-link").addEventListener("click", (e) => { e.preventDefault(); Auth.logout(); });
  Utils.$("#hamburger")?.addEventListener("click", () => Utils.$("#sidebar").classList.toggle("open"));

  Utils.$("#acc-name").textContent = profile.full_name;
  Utils.$("#acc-username").textContent = profile.username;

  Utils.$("#btn-change-password").addEventListener("click", async () => {
    const pw = Utils.$("#new-password").value;
    const statusEl = Utils.$("#password-status");
    if (pw.length < 6) { statusEl.textContent = "Password must be at least 6 characters."; statusEl.style.color = "var(--a-danger)"; return; }
    const { error } = await supabase.rpc("change_own_password", { p_new_password: pw });
    if (error) { statusEl.textContent = "Couldn't update password: " + error.message; statusEl.style.color = "var(--a-danger)"; return; }
    statusEl.textContent = "Password updated.";
    statusEl.style.color = "var(--a-success)";
    Utils.$("#new-password").value = "";
  });
})();
