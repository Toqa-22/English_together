(async () => {
  const profile = await Auth.guard("student");
  if (!profile) return;

  const params = new URLSearchParams(location.search);
  const attemptId = params.get("attempt");
  const area = Utils.$("#result-area");

  const stored = JSON.parse(sessionStorage.getItem("ra_last_result") || "null");

  if (!attemptId) { window.location.href = "dashboard.html"; return; }

  // Prefer the freshly-submitted result (avoids a round trip); fall back to DB if page was reloaded.
  let result = stored && stored.attempt_id === attemptId ? stored : null;
  if (!result) {
    const { data } = await supabase.from("student_attempts").select("*").eq("id", attemptId).maybeSingle();
    if (!data) { Utils.showError(area, "Couldn't find that result."); return; }
    result = { attempt_id: data.id, score: data.score, total: data.total_questions, percentage: data.percentage, story_id: data.story_id };
  }

  const { data: review } = await supabase.rpc("get_attempt_review", { p_attempt_id: attemptId });
  const feedback = Utils.scoreFeedback(result.percentage);

  area.innerHTML = `
    <div class="result-emoji anim-pop">${feedback.emoji}</div>
    <div class="result-score" id="score-num">0</div>
    <p class="result-pct" id="score-total">/ ${result.total} · <span id="score-pct">0</span>%</p>
    <p class="result-feedback">${feedback.text}</p>
    <div class="result-review" id="review-list"></div>
    <div class="result-actions">
      <button class="btn btn-secondary" id="btn-retry">🔄 Try Again</button>
      <button class="btn btn-primary" id="btn-home">🏠 Back to Stories</button>
    </div>
  `;

  Anim.countUp(Utils.$("#score-num"), result.score, 700);
  Anim.countUp(Utils.$("#score-pct"), Math.round(result.percentage), 700);

  if (result.percentage >= 70) {
    Sound.storyComplete();
    Anim.confetti(28);
  } else {
    Sound.correct();
  }

  if (review && review.length) {
    Utils.$("#review-list").innerHTML = review.map(r => {
      const correctLabel = r.question_type === "true_false"
        ? (r.correct_answer ? "True" : "False")
        : (r.options?.[r.correct_answer] ? `${r.correct_answer}. ${r.options[r.correct_answer]}` : r.correct_answer);
      const yourLabel = r.question_type === "true_false"
        ? (r.selected_answer ? "True" : "False")
        : (r.options?.[r.selected_answer] ? `${r.selected_answer}. ${r.options[r.selected_answer]}` : r.selected_answer);
      return `
        <div class="review-item ${r.is_correct ? "correct" : "incorrect"} anim-fade-slide-up">
          <div class="review-q">${r.is_correct ? "✅" : "❌"} ${Utils.escapeHtml(r.question_text)}</div>
          <div class="review-a">Your answer: <strong>${Utils.escapeHtml(String(yourLabel))}</strong>${!r.is_correct ? ` · Correct answer: <strong>${Utils.escapeHtml(String(correctLabel))}</strong>` : ""}</div>
        </div>`;
    }).join("");
  }

  Utils.$("#btn-retry").addEventListener("click", () => { Sound.click(); window.location.href = `reading.html?story=${result.story_id}`; });
  Utils.$("#btn-home").addEventListener("click", () => { Sound.click(); window.location.href = "dashboard.html"; });

  sessionStorage.removeItem("ra_last_result");
})();
