(async () => {
  const profile = await Auth.guard("student");
  if (!profile) return;

  const params = new URLSearchParams(location.search);
  const attemptId = params.get("attempt");
  const area = Utils.$("#result-area");
  if (!attemptId) { window.location.href = "dashboard.html"; return; }

  const stored = JSON.parse(sessionStorage.getItem("ra_last_test_result") || "null");
  let result = stored && stored.attempt_id === attemptId ? stored : null;
  if (!result) {
    const { data } = await supabase.from("test_attempts").select("*").eq("id", attemptId).maybeSingle();
    if (!data) { Utils.showError(area, "Couldn't find that result."); return; }
    result = {
      attempt_id: data.id, total_score: data.total_score, total_possible: data.total_possible, percentage: data.percentage,
      reading_score: data.reading_score, reading_total: data.reading_total,
      listening_score: data.listening_score, listening_total: data.listening_total,
      vocabulary_score: data.vocabulary_score, vocabulary_total: data.vocabulary_total
    };
  }

  const feedback = Utils.scoreFeedback(result.percentage);

  area.innerHTML = `
    <div class="result-emoji anim-pop">${feedback.emoji}</div>
    <div class="result-score" id="score-num">0</div>
    <p class="result-pct">/ ${result.total_possible} points · <span id="score-pct">0</span>%</p>
    <p class="result-feedback">${feedback.text}</p>
    <div class="test-section-scores">
      <div class="tsb"><div class="num">${result.reading_score}/${result.reading_total}</div><div class="label">📖 Reading</div></div>
      <div class="tsb"><div class="num">${result.listening_score}/${result.listening_total}</div><div class="label">🎧 Listening</div></div>
      <div class="tsb"><div class="num">${result.vocabulary_score}/${result.vocabulary_total}</div><div class="label">🖼️ Vocabulary</div></div>
    </div>
    <div class="result-actions">
      <button class="btn btn-primary" onclick="location.href='dashboard.html'">🏠 Dashboard</button>
    </div>
  `;

  Anim.countUp(Utils.$("#score-num"), result.total_score, 700);
  Anim.countUp(Utils.$("#score-pct"), Math.round(result.percentage), 700);

  if (result.percentage >= 70) { Sound.storyComplete(); Anim.confetti(28); }
  else { Sound.correct(); }

  sessionStorage.removeItem("ra_last_test_result");
})();
