(async () => {
  const profile = await Auth.guard("student");
  if (!profile) return;

  const area = Utils.$("#badge-area");
  try {
    const [badgesRes, earnedRes] = await Promise.all([
      supabase.from("badges").select("*").eq("active", true),
      supabase.from("student_badges").select("badge_id, earned_at").eq("student_id", profile.id)
    ]);
    const earnedMap = Object.fromEntries((earnedRes.data || []).map(e => [e.badge_id, e.earned_at]));
    const badges = badgesRes.data || [];

    if (!badges.length) { Utils.showEmpty(area, "🏆", "Complete activities to earn your first badge!"); return; }

    area.innerHTML = badges.map((b, i) => {
      const earned = earnedMap[b.id];
      return `
        <div class="badge-tile ${earned ? "anim-pop" : "locked"}" style="animation-delay:${i * 0.05}s">
          <div class="bi">${b.icon || "🏆"}</div>
          <div class="bn">${Utils.escapeHtml(b.name)}</div>
          <div class="bd">${Utils.escapeHtml(b.description || "")}</div>
          ${earned ? `<div class="bd" style="color:var(--s-success); margin-top:4px;">Earned ${Utils.formatDate(earned)}</div>` : `<div class="bd" style="margin-top:4px;">🔒 Not yet earned</div>`}
        </div>`;
    }).join("");
  } catch (err) {
    console.error(err);
    Utils.showError(area, "Couldn't load achievements.");
  }
})();
