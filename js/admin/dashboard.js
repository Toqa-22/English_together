(async () => {
  const profile = await Auth.guard("admin");
  if (!profile) return;

  Utils.$("#admin-name").textContent = profile.full_name;
  Utils.$("#logout-link").addEventListener("click", (e) => { e.preventDefault(); Auth.logout(); });
  Utils.$("#hamburger")?.addEventListener("click", () => Utils.$("#sidebar").classList.toggle("open"));

  const overviewGrid = Utils.$("#overview-grid");
  const activityBody = Utils.$("#activity-body");

  try {
    const [studentsRes, groupsRes, storiesRes, attemptsRes, streaksRes] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "student"),
      supabase.from("groups").select("id", { count: "exact", head: true }),
      supabase.from("stories").select("id", { count: "exact", head: true }),
      supabase.from("student_attempts")
        .select("id, score, total_questions, percentage, completed_at, student_id, story_id, profiles(full_name, groups(name)), stories(title)")
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(10),
      supabase.from("reading_streaks").select("id", { count: "exact", head: true }).gt("current_streak", 0)
    ]);

    const attempts = attemptsRes.data || [];
    const completedCount = attempts.length; // note: capped by limit(10) for the "recent" list; average computed separately below
    const { data: allCompleted } = await supabase.from("student_attempts").select("percentage").not("completed_at", "is", null);
    const avgScore = allCompleted && allCompleted.length
      ? Math.round(allCompleted.reduce((s, a) => s + Number(a.percentage), 0) / allCompleted.length)
      : 0;

    overviewGrid.innerHTML = `
      ${overviewCard("👨‍🎓", studentsRes.count || 0, "Total Students")}
      ${overviewCard("👥", groupsRes.count || 0, "Total Groups")}
      ${overviewCard("📚", storiesRes.count || 0, "Total Stories")}
      ${overviewCard("📖", allCompleted?.length || 0, "Completed Stories")}
      ${overviewCard("⭐", avgScore + "%", "Average Score")}
      ${overviewCard("🔥", streaksRes.count || 0, "Active Streaks")}
    `;

    if (!attempts.length) {
      activityBody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">📊</div><p>No activity yet.</p></div></td></tr>`;
    } else {
      activityBody.innerHTML = attempts.map(a => `
        <tr>
          <td>${Utils.escapeHtml(a.profiles?.full_name || "Unknown")}</td>
          <td>${Utils.escapeHtml(a.profiles?.groups?.name || "-")}</td>
          <td>${Utils.escapeHtml(a.stories?.title || "-")}</td>
          <td>${a.score}/${a.total_questions} (${a.percentage}%)</td>
          <td>${Utils.formatDate(a.completed_at)}</td>
          <td><span class="badge-pill ${a.percentage >= 70 ? 'pill-success' : a.percentage >= 50 ? 'pill-warning' : 'pill-danger'}">Completed</span></td>
        </tr>
      `).join("");
    }
  } catch (err) {
    console.error(err);
    Utils.showError(overviewGrid, "Couldn't load the dashboard. Please try again.");
    activityBody.innerHTML = "";
  }

  function overviewCard(icon, value, label) {
    return `<div class="overview-card anim-fade-slide-up">
      <div class="oc-icon">${icon}</div>
      <div class="oc-value">${value}</div>
      <div class="oc-label">${label}</div>
    </div>`;
  }
})();
