(async () => {
  const profile = await Auth.guard("student");
  if (!profile) return;

  const [pointsRes, streakRes, badgesRes] = await Promise.all([
    supabase.from("points_transactions").select("points").eq("student_id", profile.id),
    supabase.from("reading_streaks").select("*").eq("student_id", profile.id).maybeSingle(),
    supabase.from("student_badges").select("id", { count: "exact", head: true }).eq("student_id", profile.id)
  ]);
  const totalPoints = (pointsRes.data || []).reduce((s, p) => s + p.points, 0);

  Utils.$("#profile-card").innerHTML = `
    <div class="profile-row"><span class="label">Name</span><strong>${Utils.escapeHtml(profile.full_name)}</strong></div>
    <div class="profile-row"><span class="label">Username</span><strong>${Utils.escapeHtml(profile.username)}</strong></div>
    <div class="profile-row"><span class="label">Group</span><strong>${Utils.escapeHtml(profile.groups?.name || "Not assigned")}</strong></div>
    ${profile.groups?.meeting_link ? `<div class="profile-row"><span class="label">Meeting</span><a href="${profile.groups.meeting_link}" target="_blank" rel="noopener noreferrer" style="color:var(--s-primary); font-weight:700;">🔗 Join Meeting</a></div>` : ""}
    <div class="profile-row"><span class="label">Points</span><strong>⭐ ${totalPoints}</strong></div>
    <div class="profile-row"><span class="label">Streak</span><strong>🔥 ${streakRes.data?.current_streak || 0} days</strong></div>
    <div class="profile-row"><span class="label">Badges</span><strong>🏆 ${badgesRes.count || 0}</strong></div>
  `;

  const soundToggle = Utils.$("#sound-toggle");
  soundToggle.checked = Sound.enabled;
  soundToggle.addEventListener("change", () => { Sound.toggle(); if (Sound.enabled) Sound.click(); });

  Utils.$("#btn-logout").addEventListener("click", () => Auth.logout());
})();
