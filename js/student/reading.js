(async () => {
  const profile = await Auth.guard("student");
  if (!profile) return;
  StudentShared.applyYoungMode(profile);

  const params = new URLSearchParams(location.search);
  const storyId = params.get("story");
  const contentArea = Utils.$("#content-area");

  if (!storyId) { window.location.href = "dashboard.html"; return; }

  const { data: story, error } = await supabase.from("stories").select("*").eq("id", storyId).maybeSingle();
  if (error || !story) {
    Utils.showError(contentArea, "This story isn't available. It may be locked or no longer assigned to your group.");
    return;
  }

  let finishedReading = false;
  const words = story.content.split(/(\s+)/); // keep whitespace tokens so layout matches original text

  contentArea.innerHTML = `
    <div class="story-hero anim-fade-slide-up">
      <div class="emoji anim-float">${story.emoji || "📖"}</div>
      <h1>${Utils.escapeHtml(story.title)}</h1>
      <p class="meta">${Utils.escapeHtml(story.difficulty)} · ${story.estimated_minutes} min read</p>
    </div>

    <div class="read-controls">
      <button id="btn-read">🔊 Read Aloud</button>
      <button id="btn-pause" disabled>⏸ Pause</button>
      <button id="btn-resume" disabled>▶ Resume</button>
      <button id="btn-stop" disabled>⏹ Stop</button>
    </div>

    <div class="card">
      <p class="story-text" id="story-text"></p>
    </div>

    <div id="vocab-section" style="display:none; margin-top:24px;">
      <h2 class="section-title" style="font-size:16px;">📖 New Words</h2>
      <div id="vocab-list" class="vocab-list"></div>
      <div style="text-align:center; margin-top:16px;">
        <a href="vocabulary-practice.html" class="btn btn-secondary">Practice Vocabulary →</a>
      </div>
    </div>

    <div class="finish-bar">
      <button class="btn btn-primary btn-large" id="btn-finish">I'm Finished Reading →</button>
    </div>
  `;

  // Render story text as clickable/highlightable spans, one per word token
  const textEl = Utils.$("#story-text");
  words.forEach((tok, i) => {
    const span = document.createElement("span");
    if (/\S/.test(tok)) { span.className = "word"; span.dataset.idx = i; }
    span.textContent = tok;
    textEl.appendChild(span);
  });

  // ---------- Read Aloud (Web Speech API) ----------
  const synth = window.speechSynthesis;
  let utterance = null;

  function clearHighlight() {
    Utils.$all(".word.speaking", textEl).forEach(el => el.classList.remove("speaking"));
  }

  function setControls({ reading, paused }) {
    Utils.$("#btn-read").disabled = reading;
    Utils.$("#btn-pause").disabled = !reading || paused;
    Utils.$("#btn-resume").disabled = !reading || !paused;
    Utils.$("#btn-stop").disabled = !reading;
  }

  Utils.$("#btn-read").addEventListener("click", () => {
    if (!synth) { Utils.toast("Read Aloud isn't supported in this browser.", "error"); return; }
    synth.cancel();
    utterance = new SpeechSynthesisUtterance(story.content);
    utterance.rate = 0.92;
    utterance.onboundary = (e) => {
      if (e.name !== "word" && e.name !== undefined) return;
      clearHighlight();
      // find the word token whose character offset matches e.charIndex
      let runningLen = 0;
      for (let i = 0; i < words.length; i++) {
        if (runningLen <= e.charIndex && e.charIndex < runningLen + words[i].length) {
          const span = textEl.querySelector(`[data-idx="${i}"]`);
          if (span) { span.classList.add("speaking"); span.scrollIntoView({ block: "center", behavior: "smooth" }); }
          break;
        }
        runningLen += words[i].length;
      }
    };
    utterance.onend = () => { clearHighlight(); setControls({ reading: false, paused: false }); };
    utterance.onerror = () => { clearHighlight(); setControls({ reading: false, paused: false }); };
    synth.speak(utterance);
    setControls({ reading: true, paused: false });
  });

  Utils.$("#btn-pause").addEventListener("click", () => { synth.pause(); setControls({ reading: true, paused: true }); });
  Utils.$("#btn-resume").addEventListener("click", () => { synth.resume(); setControls({ reading: true, paused: false }); });
  Utils.$("#btn-stop").addEventListener("click", () => { synth.cancel(); clearHighlight(); setControls({ reading: false, paused: false }); });

  window.addEventListener("beforeunload", () => synth && synth.cancel());

  // ---------- Finish reading -> reveal vocab -> unlock quiz ----------
  Utils.$("#btn-finish").addEventListener("click", async () => {
    if (synth) synth.cancel();
    Sound.click();

    if (!finishedReading) {
      finishedReading = true;
      const { data: vocab } = await supabase.from("vocabulary").select("*").eq("story_id", storyId).eq("active", true);
      if (vocab && vocab.length) {
        Utils.$("#vocab-section").style.display = "block";
        Utils.$("#vocab-list").className = "vocab-grid";
        Utils.$("#vocab-list").innerHTML = vocab.map((v, i) => `
          <div class="anim-fade-slide-up" style="animation-delay:${i * 0.05}s">${VocabCard.cardHTML(v)}</div>
        `).join("");
        Utils.$all("#vocab-list > div", document).forEach(tile => VocabCard.wireCard(tile));
        Utils.$("#vocab-section").scrollIntoView({ behavior: "smooth" });
      }
      const finishBtn = Utils.$("#btn-finish");
      finishBtn.textContent = "Start the Quiz →";
    } else {
      window.location.href = `quiz.html?story=${storyId}`;
    }
  });
})();
