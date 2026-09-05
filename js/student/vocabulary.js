(async () => {
  const profile = await Auth.guard("student");
  if (!profile) return;

  const area = Utils.$("#vocab-area");
  let activeTab = "all";
  let searchTerm = "";
  let vocabItems = [];
  let progressMap = {};

  // Stats + weekly goal
  const { data: stats } = await supabase.rpc("get_vocabulary_stats");
  if (stats) {
    Utils.$("#vocab-stats").innerHTML = [
      ["📚", stats.total, "Total"],
      ["✓", stats.known, "Known"],
      ["📖", stats.learning, "Learning"],
      ["🔄", stats.needs_review, "Review"],
      ["🆕", stats.new, "New"]
    ].map(([icon, num, label]) => `
      <div class="vocab-stat-box"><div>${icon}</div><div class="vsb-num">${num}</div><div class="vsb-label">${label}</div></div>
    `).join("");

    if (stats.weekly_goal) {
      Utils.$("#weekly-goal-section").style.display = "block";
      const pct = Math.min(100, Math.round((stats.weekly_progress / stats.weekly_goal) * 100));
      Utils.$("#wg-count").textContent = `${stats.weekly_progress} / ${stats.weekly_goal}`;
      Utils.$("#wg-fill").style.width = pct + "%";
      const remaining = Math.max(0, stats.weekly_goal - stats.weekly_progress);
      Utils.$("#wg-remaining").textContent = remaining === 0 ? "🎉 Vocabulary goal complete!" : `${remaining} word(s) remaining`;
    }
  }

  // Word list (own group's story/listening vocab + standalone words)
  try {
    const [assignmentsRes, listeningAssignRes] = await Promise.all([
      supabase.from("story_assignments").select("story_id").eq("group_id", profile.group_id).eq("assigned", true),
      supabase.from("listening_assignments").select("listening_id").eq("group_id", profile.group_id)
    ]);
    const storyIds = (assignmentsRes.data || []).map(a => a.story_id);
    const listeningIds = (listeningAssignRes.data || []).map(a => a.listening_id);

    const orParts = ["and(story_id.is.null,listening_id.is.null)"];
    if (storyIds.length) orParts.push(`story_id.in.(${storyIds.join(",")})`);
    if (listeningIds.length) orParts.push(`listening_id.in.(${listeningIds.join(",")})`);

    const { data: vocab } = await supabase.from("vocabulary").select("*").eq("active", true).or(orParts.join(","));
    vocabItems = vocab || [];

    const { data: progress } = await supabase.from("vocabulary_progress").select("*").eq("student_id", profile.id);
    progressMap = Object.fromEntries((progress || []).map(p => [p.vocabulary_id, p]));
    render();
  } catch (err) {
    console.error(err);
    Utils.showError(area, "Couldn't load your vocabulary.");
  }

  function statusOf(v) { return progressMap[v.id]?.status || "NEW"; }

  function render() {
    let filtered = activeTab === "all" ? vocabItems : vocabItems.filter(v => statusOf(v) === activeTab);
    if (searchTerm) filtered = filtered.filter(v => v.word.toLowerCase().includes(searchTerm));

    if (!filtered.length) {
      Utils.showEmpty(area, "📖", vocabItems.length ? "No words match this filter." : "No vocabulary yet — finish a story or listening activity to unlock new words!");
      return;
    }
    area.innerHTML = filtered.map((v, i) => `
      <div class="vocab-tile anim-fade-slide-up" style="animation-delay:${i * 0.03}s">
        ${VocabCard.cardHTML(v)}
        <p style="font-size:11px; color:#b9c0d6; text-align:center; margin:10px 0 0;">${statusLabel(statusOf(v))}</p>
      </div>
    `).join("");
    Utils.$all(".vocab-tile", area).forEach(tile => VocabCard.wireCard(tile));
  }

  function statusLabel(s) {
    return { NEW: "🆕 New", LEARNING: "📖 Learning", KNOWN: "✓ Known", NEEDS_REVIEW: "🔄 Needs Review" }[s] || s;
  }

  Utils.$all(".tab-btn").forEach(tab => {
    tab.addEventListener("click", () => {
      Utils.$all(".tab-btn").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      activeTab = tab.dataset.tab;
      render();
    });
  });

  Utils.$("#search-input").addEventListener("input", Utils.debounce((e) => {
    searchTerm = e.target.value.trim().toLowerCase();
    render();
  }, 200));
})();
