(async () => {
  const profile = await Auth.guard("student");
  if (!profile) return;

  const params = new URLSearchParams(location.search);
  const attemptId = params.get("attempt");
  const area = Utils.$("#result-area");

  const stored = JSON.parse(sessionStorage.getItem("ra_last_listening_result") || "null");

  if (!attemptId) { window.location.href = "listening.html"; return; }

  let result = stored && stored.attempt_id === attemptId ? stored : null;
  if (!result) {
    const { data } = await supabase.from("listening_attempts").select("*").eq("id", attemptId).maybeSingle();
    if (!data) { Utils.showError(area, "Couldn't find that result."); return; }
    result = { attempt_id: data.id, score: data.score, total: data.total_questions, percentage: data.percentage, listening_id: data.listening_id };
  }

  const { data: review } = await supabase.rpc("get_listening_attempt_review", { p_attempt_id: attemptId });
  const feedback = Utils.scoreFeedback(result.percentage);

  area.innerHTML = `
    <div class="result-emoji anim-pop">🎧</div>
    <div class="result-score" id="score-num">0</div>
    <p class="result-pct" id="score-total">/ ${result.total} · <span id="score-pct">0</span>%</p>
    <p class="result-feedback">${feedback.text}</p>
    <div class="result-review" id="review-list"></div>
    <div id="vocab-section" style="display:none; margin-top:24px; text-align:left;">
      <h2 class="section-title" style="font-size:16px;">🎧 Listening Vocabulary</h2>
      <div id="vocab-list" class="vocab-grid"></div>
      <div style="text-align:center; margin-top:16px;">
        <a href="vocabulary-practice.html" class="btn btn-secondary">Practice Vocabulary →</a>
      </div>
    </div>
    <div class="result-actions">
      <button class="btn btn-secondary" id="btn-retry">🔄 Try Again</button>
      <button class="btn btn-primary" id="btn-listening">🎧 Back to Listening</button>
      <button class="btn btn-secondary" id="btn-home">🏠 Dashboard</button>
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

  const { data: vocab } = await supabase.from("vocabulary").select("*").eq("listening_id", result.listening_id).eq("active", true);
  if (vocab && vocab.length) {
    Utils.$("#vocab-section").style.display = "block";
    Utils.$("#vocab-list").innerHTML = vocab.map((v, i) => `
      <div class="anim-fade-slide-up" style="animation-delay:${i * 0.05}s">${VocabCard.cardHTML(v)}</div>
    `).join("");
    Utils.$all("#vocab-list > div", document).forEach(tile => VocabCard.wireCard(tile));
  }

  Utils.$("#btn-retry").addEventListener("click", () => { Sound.click(); window.location.href = `listening-player.html?listening=${result.listening_id}`; });
  Utils.$("#btn-listening").addEventListener("click", () => { Sound.click(); window.location.href = "listening.html"; });
  Utils.$("#btn-home").addEventListener("click", () => { Sound.click(); window.location.href = "dashboard.html"; });

  sessionStorage.removeItem("ra_last_listening_result");
})();
