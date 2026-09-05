(async () => {
  const profile = await Auth.guard("student");
  if (!profile) return;

  const area = Utils.$("#history-area");
  const { data, error } = await supabase
    .from("vocabulary_review_log")
    .select("*, vocabulary(word)")
    .eq("student_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) { Utils.showError(area, "Couldn't load your vocabulary history."); return; }
  if (!data || !data.length) { Utils.showEmpty(area, "📚", "No practice sessions yet — start reviewing to build your history!"); return; }

  const labels = { easy: "✓ Easy", okay: "😐 Okay", hard: "✕ Need Practice" };

  area.innerHTML = data.map(r => `
    <div class="vh-item anim-fade-slide-up">
      <div>
        <div class="vh-word">${Utils.escapeHtml(r.vocabulary?.word || "-")}</div>
        <div class="vh-date">${Utils.formatDate(r.created_at)}</div>
      </div>
      <div class="vh-result ${r.result}">${labels[r.result] || r.result}</div>
    </div>
  `).join("");
})();
