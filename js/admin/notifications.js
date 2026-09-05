(async () => {
  const profile = await Auth.guard("admin");
  if (!profile) return;

  Utils.$("#logout-link").addEventListener("click", (e) => { e.preventDefault(); Auth.logout(); });
  Utils.$("#hamburger")?.addEventListener("click", () => Utils.$("#sidebar").classList.toggle("open"));

  const [groupsRes, studentsRes] = await Promise.all([
    supabase.from("groups").select("id, name").order("name"),
    supabase.from("profiles").select("id, full_name").eq("role", "student").order("full_name")
  ]);
  Utils.$("#f-group").innerHTML = (groupsRes.data || []).map(g => `<option value="${g.id}">${Utils.escapeHtml(g.name)}</option>`).join("");
  Utils.$("#f-student").innerHTML = (studentsRes.data || []).map(s => `<option value="${s.id}">${Utils.escapeHtml(s.full_name)}</option>`).join("");

  Utils.$("#f-target").addEventListener("change", (e) => {
    Utils.$("#group-field").style.display = e.target.value === "group" ? "block" : "none";
    Utils.$("#student-field").style.display = e.target.value === "student" ? "block" : "none";
  });

  Utils.$("#btn-send").addEventListener("click", async () => {
    const statusEl = Utils.$("#send-status");
    const title = Utils.$("#f-title").value.trim();
    const message = Utils.$("#f-message").value.trim();
    const target = Utils.$("#f-target").value;
    if (!title || !message) { statusEl.textContent = "Title and message are required."; statusEl.style.color = "var(--a-danger)"; return; }

    const payload = {
      title, message,
      notif_type: Utils.$("#f-type").value,
      target_group_id: target === "group" ? Utils.$("#f-group").value : null,
      target_student_id: target === "student" ? Utils.$("#f-student").value : null,
      created_by: profile.id
    };
    statusEl.textContent = "Sending...";
    const { error } = await supabase.from("notifications").insert(payload);
    if (error) { statusEl.textContent = "Couldn't send: " + error.message; statusEl.style.color = "var(--a-danger)"; return; }
    statusEl.textContent = "Sent.";
    statusEl.style.color = "var(--a-success)";
    Utils.toast("Notification sent.", "success");
    Utils.$("#f-title").value = ""; Utils.$("#f-message").value = "";
    loadSent();
  });

  async function loadSent() {
    const tbody = Utils.$("#notif-body");
    const { data, error } = await supabase.from("notifications").select("*, groups(name), profiles!notifications_target_student_id_fkey(full_name)").order("created_at", { ascending: false }).limit(30);
    if (error) { Utils.showError(tbody, "Couldn't load sent notifications."); return; }
    if (!data.length) { tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="empty-icon">🔔</div><p>No notifications sent yet.</p></div></td></tr>`; return; }
    tbody.innerHTML = data.map(n => `
      <tr>
        <td>${Utils.escapeHtml(n.title)}</td>
        <td>${Utils.escapeHtml(n.notif_type)}</td>
        <td>${n.target_student_id ? Utils.escapeHtml(n.profiles?.full_name || "Student") : n.target_group_id ? Utils.escapeHtml(n.groups?.name || "Group") : "All Students"}</td>
        <td>${Utils.formatDate(n.created_at)}</td>
      </tr>
    `).join("");
  }

  loadSent();
})();
