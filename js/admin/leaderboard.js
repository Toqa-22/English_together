(async () => {
  const profile = await Auth.guard("admin");
  if (!profile) return;

  Utils.$("#logout-link").addEventListener("click", (e) => { e.preventDefault(); Auth.logout(); });
  Utils.$("#hamburger")?.addEventListener("click", () => Utils.$("#sidebar").classList.toggle("open"));

  const tbody = Utils.$("#leaderboard-body");

  const { data: groups } = await supabase.from("groups").select("id, name").order("name");
  Utils.$("#filter-group").innerHTML = `<option value="">All Groups</option>` +
    (groups || []).map(g => `<option value="${g.id}">${Utils.escapeHtml(g.name)}</option>`).join("");

  async function load() {
    tbody.innerHTML = `<tr><td colspan="8"><div class="loading-state"><div class="spinner"></div></div></td></tr>`;
    const groupId = Utils.$("#filter-group").value || null;
    const { data, error } = await supabase.rpc("get_admin_leaderboard", { p_group_id: groupId });
    if (error) {
      console.error("get_admin_leaderboard error:", error);
      Utils.showError(tbody, "Couldn't load the leaderboard: " + (error.message || "unknown error"));
      return;
    }
    if (!data.length) { tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">🥇</div><p>No student activity yet.</p></div></td></tr>`; return; }

    tbody.innerHTML = data.map(row => {
      const medal = row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : row.rank;
      return `
        <tr>
          <td>${medal}</td>
          <td>${Utils.escapeHtml(row.full_name)} <span style="color:#b9c0d6; font-size:12px;">@${Utils.escapeHtml(row.username)}</span></td>
          <td>${Utils.escapeHtml(row.group_name || "-")}</td>
          <td>⭐ ${row.total_points}</td>
          <td>${row.completed_activities}</td>
          <td>${Math.round(row.avg_score)}%</td>
          <td>${row.last_activity ? Utils.formatDate(row.last_activity) : "-"}</td>
          <td><button class="btn btn-secondary" style="padding:6px 10px; font-size:12px;" onclick="location.href='student-details.html?id=${row.student_id}'">View</button></td>
        </tr>`;
    }).join("");
  }

  Utils.$("#filter-group").addEventListener("change", load);
  load();
})();
