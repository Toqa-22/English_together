(async () => {
  const profile = await Auth.guard("student");
  if (!profile) return;
  StudentShared.applyYoungMode(profile);
  StudentShared.renderWeekCalendar(Utils.$("#week-cal"), profile);

  const summaryEl = Utils.$("#progress-summary");
  const historyBody = Utils.$("#history-body");

  try {
    const [attemptsRes, assignmentsRes, pointsRes, streakRes] = await Promise.all([
      supabase.from("student_attempts").select("*, stories(title, emoji)").eq("student_id", profile.id).order("completed_at", { ascending: false }),
      supabase.from("story_assignments").select("story_id").eq("group_id", profile.group_id).eq("assigned", true),
      supabase.from("points_transactions").select("points").eq("student_id", profile.id),
      supabase.from("reading_streaks").select("*").eq("student_id", profile.id).maybeSingle()
    ]);

    const attempts = (attemptsRes.data || []).filter(a => a.completed_at);
    const assignedCount = (assignmentsRes.data || []).length;
    const completedStoryIds = new Set(attempts.map(a => a.story_id));
    const avgScore = attempts.length ? Math.round(attempts.reduce((s, a) => s + Number(a.percentage), 0) / attempts.length) : 0;
    const bestScore = attempts.length ? Math.round(Math.max(...attempts.map(a => Number(a.percentage)))) : 0;
    const totalPoints = (pointsRes.data || []).reduce((s, p) => s + p.points, 0);

    summaryEl.innerHTML = `
      ${statCard("📚", completedStoryIds.size, "Completed")}
      ${statCard("⭐", totalPoints, "Points")}
      ${statCard("📈", avgScore + "%", "Avg Score")}
      ${statCard("🏅", bestScore + "%", "Best Score")}
      ${statCard("🔥", streakRes.data?.current_streak || 0, "Current Streak")}
      ${statCard("🏆", streakRes.data?.longest_streak || 0, "Longest Streak")}
    `;

    const pct = assignedCount ? Math.round((completedStoryIds.size / assignedCount) * 100) : 0;
    Utils.$("#overall-fill").style.width = pct + "%";
    Utils.$("#overall-label").textContent = `${completedStoryIds.size} of ${assignedCount} stories completed`;

    if (!attempts.length) {
      Utils.showEmpty(historyBody.closest(".card"), "📊", "Your reading journey starts here!");
    } else {
      historyBody.innerHTML = attempts.map(a => `
        <tr>
          <td>${a.stories?.emoji || "📖"} ${Utils.escapeHtml(a.stories?.title || "-")}</td>
          <td>${a.score}/${a.total_questions} (${Math.round(a.percentage)}%)</td>
          <td>${Utils.formatDate(a.completed_at)}</td>
          <td><span class="badge-pill ${a.percentage >= 70 ? "pill-success" : a.percentage >= 50 ? "pill-warning" : "pill-danger"}">Completed</span></td>
        </tr>
      `).join("");
    }
  } catch (err) {
    console.error(err);
    Utils.showError(summaryEl, "Couldn't load your progress.");
  }

  function statCard(icon, value, label) {
    return `<div class="stat-card anim-fade-slide-up"><div class="stat-icon">${icon}</div><div class="stat-value">${value}</div><div class="stat-label">${label}</div></div>`;
  }
})();
