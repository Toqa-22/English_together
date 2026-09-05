(async () => {
  const profile = await Auth.guard("admin");
  if (!profile) return;

  Utils.$("#logout-link").addEventListener("click", (e) => { e.preventDefault(); Auth.logout(); });
  Utils.$("#hamburger")?.addEventListener("click", () => Utils.$("#sidebar").classList.toggle("open"));

  const overviewGrid = Utils.$("#overview-grid");

  try {
    const [studentsRes, groupsRes, attemptsRes, badgesRes, challengesRes, vocabRes, pointsRes] = await Promise.all([
      supabase.from("profiles").select("id, group_id, active").eq("role", "student"),
      supabase.from("groups").select("id, name"),
      supabase.from("student_attempts").select("student_id, percentage, completed_at").not("completed_at", "is", null),
      supabase.from("student_badges").select("id"),
      supabase.from("challenge_progress").select("completed"),
      supabase.from("vocabulary_progress").select("known"),
      supabase.from("points_transactions").select("student_id, points")
    ]);

    const students = studentsRes.data || [];
    const groups = groupsRes.data || [];
    const attempts = attemptsRes.data || [];
    const activeStudentIds = new Set(attempts.map(a => a.student_id));
    const avgScore = attempts.length ? Math.round(attempts.reduce((s, a) => s + Number(a.percentage), 0) / attempts.length) : 0;
    const completionRate = students.length ? Math.round((activeStudentIds.size / students.length) * 100) : 0;

    overviewGrid.innerHTML = [
      ["👨‍🎓", students.length, "Total Students"],
      ["👥", groups.length, "Total Groups"],
      ["📖", attempts.length, "Stories Completed"],
      ["📈", avgScore + "%", "Average Score"],
      ["🔥", completionRate + "%", "Active Students"],
      ["⭐", (pointsRes.data || []).reduce((s, p) => s + p.points, 0), "Points Earned"],
      ["🏆", (badgesRes.data || []).length, "Badges Earned"],
      ["🎯", (challengesRes.data || []).filter(c => c.completed).length, "Challenges Completed"],
      ["📚", (vocabRes.data || []).filter(v => v.known).length, "Words Learned"]
    ].map(([icon, value, label]) => `
      <div class="overview-card anim-fade-slide-up"><div class="oc-icon">${icon}</div><div class="oc-value">${value}</div><div class="oc-label">${label}</div></div>
    `).join("");

    // Average score by group
    const scoreByGroup = {};
    const studentGroupMap = Object.fromEntries(students.map(s => [s.id, s.group_id]));
    attempts.forEach(a => {
      const gid = studentGroupMap[a.student_id];
      if (!gid) return;
      scoreByGroup[gid] = scoreByGroup[gid] || [];
      scoreByGroup[gid].push(Number(a.percentage));
    });
    renderBars("#chart-group-scores", groups.map(g => ({
      label: g.name,
      value: scoreByGroup[g.id]?.length ? Math.round(scoreByGroup[g.id].reduce((a, b) => a + b, 0) / scoreByGroup[g.id].length) : 0,
      max: 100, suffix: "%"
    })));

    // Points by group
    const pointsByGroup = {};
    (pointsRes.data || []).forEach(p => {
      const gid = studentGroupMap[p.student_id];
      if (!gid) return;
      pointsByGroup[gid] = (pointsByGroup[gid] || 0) + p.points;
    });
    const maxPoints = Math.max(1, ...Object.values(pointsByGroup));
    renderBars("#chart-points", groups.map(g => ({ label: g.name, value: pointsByGroup[g.id] || 0, max: maxPoints, suffix: "" })));

    // Skill breakdown via question categories (admin can see all student_answers)
    const { data: answers } = await supabase.from("student_answers").select("is_correct, questions(category)");
    const skillTotals = {};
    (answers || []).forEach(a => {
      const cat = a.questions?.category || "other";
      skillTotals[cat] = skillTotals[cat] || { correct: 0, total: 0 };
      skillTotals[cat].total++;
      if (a.is_correct) skillTotals[cat].correct++;
    });
    renderBars("#chart-skills", Object.entries(skillTotals).map(([cat, v]) => ({
      label: cat.replace("_", " "), value: v.total ? Math.round((v.correct / v.total) * 100) : 0, max: 100, suffix: "%"
    })));
  } catch (err) {
    console.error(err);
    Utils.showError(overviewGrid, "Couldn't load analytics.");
  }

  function renderBars(sel, rows) {
    const el = Utils.$(sel);
    if (!rows.length) { el.innerHTML = `<p style="font-size:13px; color:#8892a8;">No data yet.</p>`; return; }
    el.innerHTML = rows.map(r => `
      <div class="bar-row">
        <div class="bar-label">${Utils.escapeHtml(r.label)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${r.max ? Math.round((r.value / r.max) * 100) : 0}%"></div></div>
        <div class="bar-value">${r.value}${r.suffix}</div>
      </div>
    `).join("");
  }

  // ---------- Vocabulary group analytics ----------
  const { data: vocabGroups } = await supabase.from("groups").select("id, name").order("name");
  const groupSelect = Utils.$("#vocab-group-select");
  groupSelect.innerHTML = (vocabGroups || []).map(g => `<option value="${g.id}">${Utils.escapeHtml(g.name)}</option>`).join("");

  async function loadVocabAnalytics() {
    const area = Utils.$("#vocab-analytics-area");
    const groupId = groupSelect.value;
    if (!groupId) { Utils.showEmpty(area, "📚", "No groups yet."); return; }
    area.innerHTML = `<div class="loading-state"><div class="spinner"></div></div>`;
    const { data, error } = await supabase.rpc("get_group_vocabulary_analytics", { p_group_id: groupId });
    if (error || !data) { Utils.showError(area, "Couldn't load vocabulary analytics."); return; }
    area.innerHTML = `
      <div class="overview-grid">
        <div class="overview-card"><div class="oc-icon">📚</div><div class="oc-value">${data.total_words}</div><div class="oc-label">Total Words</div></div>
        <div class="overview-card"><div class="oc-icon">✓</div><div class="oc-value">${data.avg_mastery}%</div><div class="oc-label">Average Mastery</div></div>
        <div class="overview-card"><div class="oc-icon">🎯</div><div class="oc-value">${data.avg_accuracy}%</div><div class="oc-label">Average Accuracy</div></div>
        <div class="overview-card"><div class="oc-icon">🔄</div><div class="oc-value">${data.needs_review}</div><div class="oc-label">Words Needing Review</div></div>
        <div class="overview-card"><div class="oc-icon">😕</div><div class="oc-value" style="font-size:15px;">${data.hardest_word ? Utils.escapeHtml(data.hardest_word) : "—"}</div><div class="oc-label">Most Difficult Word</div></div>
      </div>`;
  }

  groupSelect.addEventListener("change", loadVocabAnalytics);
  if (groupSelect.value) loadVocabAnalytics();
})();
