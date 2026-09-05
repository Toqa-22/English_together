(async () => {
  const profile = await Auth.guard("student");
  if (!profile) return;
  StudentShared.applyYoungMode(profile);

  Utils.$("#greeting").textContent = `Hello, ${profile.full_name.split(" ")[0]}! 👋`;
  Utils.$("#group-label").textContent = profile.groups ? profile.groups.name : "No group assigned yet";

  if (profile.groups?.meeting_link) {
    Utils.$("#meeting-section").style.display = "block";
    Utils.$("#meeting-link").href = profile.groups.meeting_link;
  }

  StudentShared.renderWeekCalendar(Utils.$("#week-cal"), profile);

  try {
    const [pointsRes, streakRes, badgesRes, notifRes, myRankRes, listeningAttemptsRes] = await Promise.all([
      supabase.from("points_transactions").select("points").eq("student_id", profile.id),
      supabase.from("reading_streaks").select("*").eq("student_id", profile.id).maybeSingle(),
      supabase.from("student_badges").select("id", { count: "exact", head: true }).eq("student_id", profile.id),
      supabase.from("notifications").select("id"),
      supabase.rpc("get_my_rank"),
      supabase.from("listening_attempts").select("listening_id, completed_at").eq("student_id", profile.id)
    ]);

    const totalPoints = (pointsRes.data || []).reduce((sum, p) => sum + p.points, 0);
    Anim.countUp(Utils.$("#stat-points"), totalPoints);
    Utils.$("#stat-streak").textContent = streakRes.data?.current_streak || 0;
    Utils.$("#stat-badges").textContent = badgesRes.count || 0;

    const listeningCompleted = new Set((listeningAttemptsRes.data || []).filter(a => a.completed_at).map(a => a.listening_id)).size;
    Anim.countUp(Utils.$("#stat-listening"), listeningCompleted);

    if (myRankRes.data) {
      Utils.$("#stat-rank").textContent = "#" + myRankRes.data.rank;
      Utils.$("#rank-num").textContent = "#" + myRankRes.data.rank;
    } else {
      Utils.$("#rank-num").textContent = "Unranked";
    }

    if ((notifRes.data || []).length) {
      const { data: reads } = await supabase.from("notification_reads").select("notification_id").eq("student_id", profile.id);
      const readIds = new Set((reads || []).map(r => r.notification_id));
      const hasUnread = notifRes.data.some(n => !readIds.has(n.id));
      Utils.$("#notif-dot").style.display = hasUnread ? "block" : "none";
    }
  } catch (err) {
    console.error(err);
  }

  const { completedIds } = await StudentShared.renderStoryGrid(Utils.$("#story-grid"), profile);
  Anim.countUp(Utils.$("#stat-completed"), completedIds.size);

  const { data: vocabStats } = await supabase.rpc("get_vocabulary_stats");
  if (vocabStats && vocabStats.total > 0) {
    Utils.$("#vocab-dashboard-card").style.display = "block";
    const pct = Math.round((vocabStats.known / vocabStats.total) * 100);
    Utils.$("#vocab-card-fraction").textContent = `${vocabStats.known} / ${vocabStats.total} words mastered`;
    Utils.$("#vocab-card-fill").style.width = pct + "%";
    Utils.$("#vocab-card-review").textContent = vocabStats.needs_review > 0 ? `🔄 ${vocabStats.needs_review} word(s) need review` : "All caught up!";
  }

  const { data: activeTest } = await supabase.from("tests").select("id, title").eq("active", true).maybeSingle();
  if (activeTest) {
    Utils.$("#test-section").style.display = "block";
    Utils.$("#test-status-label").textContent = activeTest.title;
  }
})();
