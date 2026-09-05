(async () => {
  const profile = await Auth.guard("student");
  if (!profile) return;
  StudentShared.applyYoungMode(profile);

  const params = new URLSearchParams(location.search);
  const storyId = params.get("story");
  const quizArea = Utils.$("#quiz-area");
  const warningEl = Utils.$("#quiz-warning");
  const submitBtn = Utils.$("#btn-submit");

  if (!storyId) { window.location.href = "dashboard.html"; return; }
  Utils.$("#btn-back").addEventListener("click", () => window.location.href = `reading.html?story=${storyId}`);

  // Fetch the story text so students can refer back to it while answering —
  // shown collapsible at the top, defaulting to open.
  const { data: story } = await supabase.from("stories").select("title, content, emoji").eq("id", storyId).maybeSingle();
  if (story) {
    Utils.$("#story-reference").style.display = "block";
    Utils.$("#story-reference-title").textContent = `${story.emoji || "📖"} ${story.title}`;
    Utils.$("#story-reference-body").textContent = story.content;
    Utils.$("#btn-toggle-story").addEventListener("click", () => {
      Utils.$("#story-reference").classList.toggle("collapsed");
    });
  }

  // questions_public view deliberately excludes correct_answer — grading happens server-side via RPC.
  const { data: questions, error } = await supabase
    .from("questions_public")
    .select("*")
    .eq("story_id", storyId)
    .order("order_number");

  if (error || !questions || !questions.length) {
    Utils.showError(quizArea, "Couldn't load the quiz questions.");
    submitBtn.style.display = "none";
    return;
  }

  const answers = {}; // question_id -> selected value

  quizArea.innerHTML = questions.map((q, i) => {
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
    const unanswered = questions.filter(q => !(q.id in answers)).map((q, idx) => questions.indexOf(q) + 1);
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
      const { data, error: rpcError } = await supabase.rpc("submit_attempt", {
        p_story_id: storyId,
        p_answers: payload
      });
      if (rpcError) throw rpcError;

      sessionStorage.setItem("ra_last_result", JSON.stringify({ ...data, story_id: storyId }));
      window.location.href = `result.html?attempt=${data.attempt_id}`;
    } catch (err) {
      console.error(err);
      Utils.toast("Couldn't submit your answers. Please try again.", "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Answers";
    }
  });
})();
