(async () => {
  const profile = await Auth.guard("admin");
  if (!profile) return;

  Utils.$("#logout-link").addEventListener("click", (e) => { e.preventDefault(); Auth.logout(); });
  Utils.$("#hamburger")?.addEventListener("click", () => Utils.$("#sidebar").classList.toggle("open"));

  const params = new URLSearchParams(location.search);
  const studentId = params.get("id");
  const area = Utils.$("#detail-area");
  if (!studentId) { location.href = "students.html"; return; }

  try {
    const [studentRes, attemptsRes, badgesRes, streakRes] = await Promise.all([
      supabase.from("profiles").select("*, groups(name)").eq("id", studentId).maybeSingle(),
      supabase.from("student_attempts").select("*, stories(title, emoji)").eq("student_id", studentId).order("completed_at", { ascending: false }),
      supabase.from("student_badges").select("*, badges(name, icon)").eq("student_id", studentId),
      supabase.from("reading_streaks").select("*").eq("student_id", studentId).maybeSingle()
    ]);

    const student = studentRes.data;
    if (!student) { Utils.showError(area, "Student not found."); return; }
    Utils.$("#page-title").textContent = student.full_name;

    const completed = (attemptsRes.data || []).filter(a => a.completed_at);
    const avgScore = completed.length ? Math.round(completed.reduce((s, a) => s + Number(a.percentage), 0) / completed.length) : 0;
    const bestScore = completed.length ? Math.round(Math.max(...completed.map(a => Number(a.percentage)))) : 0;
    const { data: assignedRows } = await supabase.from("story_assignments").select("story_id").eq("group_id", student.group_id).eq("assigned", true);

    area.innerHTML = `
      <div class="overview-grid">
        <div class="overview-card"><div class="oc-icon">👥</div><div class="oc-value">${Utils.escapeHtml(student.groups?.name || "-")}</div><div class="oc-label">Group</div></div>
        <div class="overview-card"><div class="oc-icon">📚</div><div class="oc-value">${completed.length} / ${(assignedRows || []).length}</div><div class="oc-label">Stories Completed</div></div>
        <div class="overview-card"><div class="oc-icon">📈</div><div class="oc-value">${avgScore}%</div><div class="oc-label">Average Score</div></div>
        <div class="overview-card"><div class="oc-icon">🏅</div><div class="oc-value">${bestScore}%</div><div class="oc-label">Best Score</div></div>
        <div class="overview-card"><div class="oc-icon">🔥</div><div class="oc-value">${streakRes.data?.current_streak || 0}</div><div class="oc-label">Current Streak</div></div>
        <div class="overview-card"><div class="oc-icon">🏆</div><div class="oc-value">${(badgesRes.data || []).length}</div><div class="oc-label">Badges</div></div>
      </div>

      <div style="display:flex; gap:8px; margin: 8px 0 16px; flex-wrap:wrap;">
        ${(badgesRes.data || []).map(b => `<span class="badge-pill pill-success">${b.badges.icon} ${Utils.escapeHtml(b.badges.name)}</span>`).join("") || "<span style='color:#8892a8; font-size:13px;'>No badges yet</span>"}
      </div>

      <h2 class="section-title" style="font-size:16px;">Attempt History</h2>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>Story</th><th>Score</th><th>Date</th><th></th></tr></thead>
          <tbody id="attempts-body">
            ${completed.length ? completed.map(a => `
              <tr>
                <td>${a.stories?.emoji || "📖"} ${Utils.escapeHtml(a.stories?.title || "-")}</td>
                <td>${a.score}/${a.total_questions} (${Math.round(a.percentage)}%)</td>
                <td>${Utils.formatDate(a.completed_at)}</td>
                <td><button class="btn btn-secondary" style="padding:6px 10px; font-size:12px;" data-act="review" data-id="${a.id}">Review Answers</button></td>
              </tr>
            `).join("") : `<tr><td colspan="4"><div class="empty-state"><div class="empty-icon">📊</div><p>No completed attempts yet.</p></div></td></tr>`}
          </tbody>
        </table>
      </div>

      <div id="review-panel" style="margin-top:16px;"></div>

      <h2 class="section-title" style="font-size:16px; margin-top:24px;">📚 Vocabulary</h2>
      <div id="vocab-analytics-panel"><div class="loading-state"><div class="spinner"></div></div></div>
    `;

    supabase.rpc("get_student_vocabulary_analytics", { p_student_id: studentId }).then(({ data: vocabData, error: vocabError }) => {
      const panel = Utils.$("#vocab-analytics-panel");
      if (vocabError || !vocabData) { Utils.showError(panel, "Couldn't load vocabulary analytics."); return; }
      panel.innerHTML = `
        <div class="overview-grid">
          <div class="overview-card"><div class="oc-icon">📚</div><div class="oc-value">${vocabData.total}</div><div class="oc-label">Total Words</div></div>
          <div class="overview-card"><div class="oc-icon">✓</div><div class="oc-value">${vocabData.known}</div><div class="oc-label">Known</div></div>
          <div class="overview-card"><div class="oc-icon">📖</div><div class="oc-value">${vocabData.learning}</div><div class="oc-label">Learning</div></div>
          <div class="overview-card"><div class="oc-icon">🔄</div><div class="oc-value">${vocabData.needs_review}</div><div class="oc-label">Needs Review</div></div>
          <div class="overview-card"><div class="oc-icon">🎯</div><div class="oc-value">${vocabData.avg_accuracy}%</div><div class="oc-label">Avg Accuracy</div></div>
        </div>
        ${vocabData.hardest_words?.length ? `
          <p style="font-size:13px; margin:8px 0 0;"><strong>Most difficult words:</strong> ${vocabData.hardest_words.map(w => Utils.escapeHtml(w)).join(", ")}</p>
        ` : ""}
      `;
    });

    Utils.$all('[data-act="review"]', area).forEach(btn => {
      btn.addEventListener("click", async () => {
        const panel = Utils.$("#review-panel");
        panel.innerHTML = `<div class="loading-state"><div class="spinner"></div></div>`;
        const { data: review, error } = await supabase.rpc("get_attempt_review", { p_attempt_id: btn.dataset.id });
        if (error || !review) { panel.innerHTML = `<div class="empty-state"><p>Couldn't load answers.</p></div>`; return; }
        panel.innerHTML = `
          <div class="card">
            <p style="font-weight:700; margin:0 0 12px;">Answer Review</p>
            ${review.map(r => {
              const correctLabel = r.question_type === "true_false" ? (r.correct_answer ? "True" : "False") : (r.options?.[r.correct_answer] ?? r.correct_answer);
              const selLabel = r.question_type === "true_false" ? (r.selected_answer ? "True" : "False") : (r.options?.[r.selected_answer] ?? r.selected_answer);
              return `<div style="padding:10px 0; border-top:1px solid #F0F1F8;">
                <p style="font-weight:600; font-size:14px; margin:0 0 4px;">${r.is_correct ? "✅" : "❌"} ${Utils.escapeHtml(r.question_text)}</p>
                <p style="font-size:13px; color:#6b7690; margin:0;">Student answered: <strong>${Utils.escapeHtml(String(selLabel))}</strong>${!r.is_correct ? ` · Correct: <strong>${Utils.escapeHtml(String(correctLabel))}</strong>` : ""}</p>
              </div>`;
            }).join("")}
          </div>`;
      });
    });
  } catch (err) {
    console.error(err);
    Utils.showError(area, "Couldn't load student details.");
  }
})();
