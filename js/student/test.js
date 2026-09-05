(async () => {
  const profile = await Auth.guard("student");
  if (!profile) return;

  const content = Utils.$("#content-area");
  const answers = { reading: {}, listening: {}, vocabulary: {} };
  let test, readingQ, listeningQ, vocabItems, wordPool;

  const { data: activeTest, error } = await supabase.from("tests").select("*").eq("active", true).maybeSingle();
  if (error || !activeTest) {
    Utils.showEmpty(content, "📝", "No test available for your group right now.");
    return;
  }
  test = activeTest;

  const [{ data: rQ }, { data: lQ }, { data: vItems }, { data: words }] = await Promise.all([
    supabase.from("test_reading_questions_public").select("*").eq("test_id", test.id).order("order_number"),
    supabase.from("test_listening_questions_public").select("*").eq("test_id", test.id).order("order_number"),
    supabase.from("test_vocabulary_items_public").select("*").eq("test_id", test.id).order("order_number"),
    supabase.rpc("get_test_vocab_words", { p_test_id: test.id })
  ]);
  readingQ = rQ || [];
  listeningQ = lQ || [];
  vocabItems = (vItems || []).filter(v => v.image_url); // archived items have image_url cleared
  wordPool = words || [];

  function renderQuestionForm(questions, sectionAnswers) {
    return questions.map((q, i) => {
      let optionsHtml;
      if (q.question_type === "true_false") {
        optionsHtml = `<div class="tf-options">
          <div class="q-option" data-q="${q.id}" data-val="true">✓ True</div>
          <div class="q-option" data-q="${q.id}" data-val="false">✕ False</div>
        </div>`;
      } else {
        const opts = q.options || {};
        optionsHtml = `<div class="q-options">${Object.entries(opts).map(([key, text]) => `
          <div class="q-option" data-q="${q.id}" data-val="${Utils.escapeHtml(key)}"><strong>${key}.</strong> ${Utils.escapeHtml(text)}</div>
        `).join("")}</div>`;
      }
      return `
        <div class="card q-card anim-fade-slide-up" style="animation-delay:${i * 0.04}s">
          <div class="q-count">Question ${i + 1} of ${questions.length}</div>
          <p class="q-text">${Utils.escapeHtml(q.question_text)}</p>
          ${optionsHtml}
        </div>`;
    }).join("");
  }

  function wireQuestionForm(container, sectionAnswers) {
    Utils.$all(".q-option", container).forEach(opt => {
      opt.addEventListener("click", () => {
        const qid = opt.dataset.q, val = opt.dataset.val;
        sectionAnswers[qid] = val === "true" ? true : val === "false" ? false : val;
        Utils.$all(`.q-option[data-q="${qid}"]`, container).forEach(o => o.classList.remove("selected"));
        opt.classList.add("selected");
        Sound.click();
      });
    });
  }

  // ---------- Section timer (shared across reading/listening/vocabulary) ----------
  let timerInterval = null;
  function clearSectionTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }
  function startSectionTimer(minutes, onExpire) {
    clearSectionTimer();
    if (!minutes) return; // no limit set for this section
    let remaining = minutes * 60;
    function tick() {
      const el = Utils.$("#section-timer");
      if (el) {
        const m = Math.floor(remaining / 60), s = remaining % 60;
        el.innerHTML = `⏱ ${m}:${String(s).padStart(2, "0")} remaining`;
        el.classList.toggle("low", remaining <= 30);
      }
      if (remaining <= 0) {
        clearSectionTimer();
        Sound.incorrect();
        onExpire();
        return;
      }
      remaining--;
    }
    tick();
    timerInterval = setInterval(tick, 1000);
  }
  function timerBadgeHtml(minutes) {
    return minutes ? `<div class="section-timer" id="section-timer"></div>` : "";
  }

  // ---------- Section 1: Reading ----------
  function renderReading() {
    content.innerHTML = `
      ${timerBadgeHtml(test.reading_time_limit_minutes)}
      ${test.reading_text ? `<div class="card"><p class="story-text">${Utils.escapeHtml(test.reading_text)}</p></div>` : ""}
      <div style="margin-top:16px;">${readingQ.length ? renderQuestionForm(readingQ, answers.reading) : `<p style="text-align:center; color:#8892a8;">No reading questions.</p>`}</div>
      <div class="quiz-warning" id="warn"></div>
      <div class="finish-bar"><button class="btn btn-primary btn-large" id="btn-next">Continue to Listening →</button></div>
    `;
    wireQuestionForm(content, answers.reading);
    startSectionTimer(test.reading_time_limit_minutes, () => goToListening(true));

    Utils.$("#btn-next").addEventListener("click", () => goToListening(false));
    function goToListening(force) {
      if (!force) {
        const unanswered = readingQ.filter(q => !(q.id in answers.reading));
        if (unanswered.length) { Utils.$("#warn").textContent = "⚠ Please answer every question before continuing."; return; }
      }
      clearSectionTimer();
      Sound.click();
      Utils.$("#step-reading").classList.replace("active", "done");
      Utils.$("#step-listening").classList.add("active");
      renderListening();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  // ---------- Section 2: Listening ----------
  function renderListening() {
    let mediaHtml = "";
    if (test.listening_type === "audio" && test.listening_audio_url) {
      mediaHtml = `
        <div class="card anim-fade-slide-up" style="text-align:center;">
          <p style="font-weight:700; margin:0 0 12px;">🎤 Listen carefully</p>
          <audio controls style="width:100%;" src="${test.listening_audio_url}"></audio>
        </div>`;
    } else if (test.listening_video_id) {
      mediaHtml = `
        <div class="video-embed-wrap anim-fade-slide-up">
          <iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(test.listening_video_id)}?rel=0&modestbranding=1" allowfullscreen></iframe>
        </div>`;
    }
    content.innerHTML = `
      ${timerBadgeHtml(test.listening_time_limit_minutes)}
      ${mediaHtml}
      <div style="margin-top:16px;">${listeningQ.length ? renderQuestionForm(listeningQ, answers.listening) : `<p style="text-align:center; color:#8892a8;">No listening questions.</p>`}</div>
      <div class="quiz-warning" id="warn"></div>
      <div class="finish-bar"><button class="btn btn-primary btn-large" id="btn-next">Continue to Vocabulary →</button></div>
    `;
    wireQuestionForm(content, answers.listening);
    startSectionTimer(test.listening_time_limit_minutes, () => goToVocab(true));

    Utils.$("#btn-next").addEventListener("click", () => goToVocab(false));
    function goToVocab(force) {
      if (!force) {
        const unanswered = listeningQ.filter(q => !(q.id in answers.listening));
        if (unanswered.length) { Utils.$("#warn").textContent = "⚠ Please answer every question before continuing."; return; }
      }
      clearSectionTimer();
      Sound.click();
      Utils.$("#step-listening").classList.replace("active", "done");
      Utils.$("#step-vocab").classList.add("active");
      remainingWords = [...wordPool];
      vocabIndex = 0;
      startSectionTimer(test.vocabulary_time_limit_minutes, () => { clearSectionTimer(); submitAll(); });
      renderVocabStep();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  // ---------- Section 3: Vocabulary (picture -> word, one at a time) ----------
  let remainingWords = [];
  let vocabIndex = 0;

  function renderVocabStep() {
    if (!vocabItems.length) { submitAll(); return; }
    if (vocabIndex >= vocabItems.length) { submitAll(); return; }

    const item = vocabItems[vocabIndex];
    const options = shuffle([...remainingWords]);

    content.innerHTML = `
      ${timerBadgeHtml(test.vocabulary_time_limit_minutes)}
      <p style="text-align:center; font-size:13px; color:#8892a8; margin-bottom:12px;">Image ${vocabIndex + 1} of ${vocabItems.length}</p>
      <div class="test-pic-wrap anim-fade-slide-up">
        <img src="${item.image_url}" alt="">
        <p style="font-weight:700; margin-bottom:16px;">Which word matches this picture?</p>
        <div class="test-word-options">
          ${options.map(w => `<div class="q-option" data-word="${Utils.escapeHtml(w)}">${Utils.escapeHtml(w)}</div>`).join("")}
        </div>
      </div>
    `;

    Utils.$all(".q-option", content).forEach(opt => {
      opt.addEventListener("click", () => {
        const word = opt.dataset.word;
        answers.vocabulary[item.id] = word;
        remainingWords = remainingWords.filter(w => w !== word);
        Sound.click();
        vocabIndex++;
        renderVocabStep();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });
  }

  function shuffle(arr) { return arr.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(p => p[1]); }

  // ---------- Submit everything ----------
  async function submitAll() {
    clearSectionTimer();
    content.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Submitting your test...</p></div>`;
    const readingPayload = readingQ.map(q => ({ question_id: q.id, selected: answers.reading[q.id] }));
    const listeningPayload = listeningQ.map(q => ({ question_id: q.id, selected: answers.listening[q.id] }));
    const vocabPayload = vocabItems.map(v => ({ item_id: v.id, selected_word: answers.vocabulary[v.id] || "" }));

    const { data, error: subErr } = await supabase.rpc("submit_test_attempt", {
      p_test_id: test.id,
      p_reading_answers: readingPayload,
      p_listening_answers: listeningPayload,
      p_vocabulary_answers: vocabPayload
    });

    if (subErr) {
      console.error(subErr);
      Utils.showError(content, "Couldn't submit your test: " + subErr.message);
      return;
    }
    sessionStorage.setItem("ra_last_test_result", JSON.stringify(data));
    window.location.href = `test-result.html?attempt=${data.attempt_id}`;
  }

  renderReading();
})();
