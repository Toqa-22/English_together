(async () => {
  const profile = await Auth.guard("student");
  if (!profile) return;

  const area = Utils.$("#challenges-area");
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data: challenges } = await supabase
      .from("daily_challenges")
      .select("*")
      .eq("active", true)
      .lte("start_date", today)
      .or(`end_date.is.null,end_date.gte.${today}`);

    if (!challenges || !challenges.length) {
      Utils.showEmpty(area, "🎯", "No active challenges right now. Check back soon!");
      return;
    }

    const { data: progress } = await supabase.from("challenge_progress").select("*").eq("student_id", profile.id);
    const progressMap = Object.fromEntries((progress || []).map(p => [p.challenge_id, p]));

    area.innerHTML = challenges.map((c, i) => {
      const p = progressMap[c.id];
      const done = p?.completed;
      const pct = Math.min(100, Math.round(((p?.progress || 0) / c.target_value) * 100));
      return `
        <div class="card challenge-card anim-fade-slide-up" style="margin-bottom:12px; animation-delay:${i * 0.05}s;">
          <div class="ci">${done ? "✅" : "🎯"}</div>
          <div class="cbody">
            <p class="ct">${Utils.escapeHtml(c.title)}</p>
            <p class="cd">${Utils.escapeHtml(c.description || "")}</p>
            <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
            <p style="font-size:12px; color:#8892a8; margin:6px 0 0;">
              ${p?.progress || 0} / ${c.target_value} · ⭐ +${c.points_reward} ${done ? "· Completed!" : ""}
            </p>
          </div>
        </div>`;
    }).join("");
  } catch (err) {
    console.error(err);
    Utils.showError(area, "Couldn't load challenges.");
  }
})();
