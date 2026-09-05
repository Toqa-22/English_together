(async () => {
  const profile = await Auth.guard("student");
  if (!profile) return;

  const params = new URLSearchParams(location.search);
  const listeningId = params.get("listening");
  const contentArea = Utils.$("#content-area");

  if (!listeningId) { window.location.href = "listening.html"; return; }

  const [{ data: item, error: itemError }, { data: questions, error: qError }] = await Promise.all([
    supabase.from("listening_activities").select("*").eq("id", listeningId).maybeSingle(),
    // listening_questions_public deliberately excludes correct_answer — grading happens server-side via RPC.
    supabase.from("listening_questions_public").select("*").eq("listening_id", listeningId).order("order_number")
  ]);

  if (itemError || !item) {
    Utils.showError(contentArea, "This activity isn't available. It may be locked or no longer assigned to your group.");
    return;
  }
  if (qError || !questions || !questions.length) {
    Utils.showError(contentArea, "Couldn't load the questions for this activity.");
    return;
  }

  const answers = {}; // question_id -> selected value

  const questionsHtml = questions.map((q, i) => {
    let optionsHtml;
    if (q.question_type === "true_false") {
      optionsHtml = `
        <div class="tf-options">
          <div class="q-option" data-q="${q.id}" data-val="true">✓ True</div>
          <div class="q-option" data-q="${q.id}" data-val="false">✕ False</div>
        </div>`;
    } else {
      const opts = q.options || {};
      optionsHtml = `<div class="q-options">${Object.entries(opts).map(([key, text]) => `
        <div class="q-option" data-q="${q.id}" data-val="${Utils.escapeHtml(key)}">
          <strong>${key}.</strong> ${Utils.escapeHtml(text)}
        </div>`).join("")}</div>`;
    }
    return `
      <div class="card q-card anim-fade-slide-up" style="animation-delay:${i * 0.04}s">
        <div class="q-count">Question ${i + 1} of ${questions.length}</div>
        <p class="q-text">${Utils.escapeHtml(q.question_text)}</p>
        ${optionsHtml}
      </div>`;
  }).join("");

  contentArea.innerHTML = `
    <div class="story-hero anim-fade-slide-up">
      <h1>🎧 ${Utils.escapeHtml(item.title)}</h1>
      <p class="meta">${Utils.escapeHtml(item.difficulty)} · ${item.estimated_minutes} min · ⭐ ${item.points_reward} points</p>
    </div>

    ${item.description ? `<p style="text-align:center; color:#6b7690; margin-bottom:16px;">${Utils.escapeHtml(item.description)}</p>` : ""}

    ${item.listening_type === "audio" && item.audio_url ? `
      <div class="card anim-fade-slide-up" style="text-align:center;">
        <p style="font-weight:700; margin:0 0 12px;">🎤 Listen carefully</p>
        <audio controls style="width:100%;" src="${item.audio_url}"></audio>
      </div>
    ` : `
      <div class="video-embed-wrap anim-fade-slide-up">
        <iframe
          src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(item.youtube_video_id)}?rel=0&modestbranding=1"
          title="${Utils.escapeHtml(item.title)}"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen>
        </iframe>
      </div>
    `}

    <!-- Questions sit directly under the video — watch and answer together,
         no separate "finished watching" gate before seeing them. -->
    <div class="quiz-progress-bar" style="margin-top:20px;"><div class="quiz-progress-fill anim-fill" id="progress-fill" style="width:0%"></div></div>

    <div id="quiz-area">${questionsHtml}</div>

    <div class="quiz-warning" id="quiz-warning"></div>

    <div style="display:flex; justify-content:center; margin-top:12px;">
      <button class="btn btn-primary btn-large" id="btn-submit">Submit Answers</button>
    </div>
  `;

  const quizArea = Utils.$("#quiz-area");
  const warningEl = Utils.$("#quiz-warning");
  const submitBtn = Utils.$("#btn-submit");

  Utils.$all(".q-option", quizArea).forEach(opt => {
    opt.addEventListener("click", () => {
      const qid = opt.dataset.q;
      const val = opt.dataset.val;
      answers[qid] = val === "true" ? true : val === "false" ? false : val;
      Utils.$all(`.q-option[data-q="${qid}"]`, quizArea).forEach(o => o.classList.remove("selected"));
      opt.classList.add("selected");
      Sound.click();
      updateProgress();
    });
  });

  function updateProgress() {
    const pct = Math.round((Object.keys(answers).length / questions.length) * 100);
    Utils.$("#progress-fill").style.width = pct + "%";
  }

  submitBtn.addEventListener("click", async () => {
    const unanswered = questions.filter(q => !(q.id in answers)).map((q) => questions.indexOf(q) + 1);
    if (unanswered.length) {
      warningEl.textContent = `⚠ Please answer question${unanswered.length > 1 ? "s" : ""} ${unanswered.join(", ")}.`;
      const firstUnanswered = quizArea.querySelectorAll(".q-card")[unanswered[0] - 1];
      firstUnanswered?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    warningEl.textContent = "";
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";

    try {
      const payload = questions.map(q => ({ question_id: q.id, selected: answers[q.id] }));
      const { data, error: rpcError } = await supabase.rpc("submit_listening_attempt", {
        p_listening_id: listeningId,
        p_answers: payload
      });
      if (rpcError) throw rpcError;

      sessionStorage.setItem("ra_last_listening_result", JSON.stringify({ ...data, listening_id: listeningId }));
      window.location.href = `listening-result.html?attempt=${data.attempt_id}`;
    } catch (err) {
      console.error(err);
      Utils.toast("Couldn't submit your answers. Please try again.", "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Answers";
    }
  });
})();
