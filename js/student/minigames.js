(async () => {
  const profile = await Auth.guard("student");
  if (!profile) return;
  StudentShared.applyYoungMode(profile);

  const storySelect = Utils.$("#story-select");
  const gameArea = Utils.$("#game-area");
  let completedStories = [];
  let allVocab = []; // vocab across all the student's assigned stories, used for distractors in picture choice
  let activeGame = "wordmatch";

  // Mini-games reinforce stories the student has already read — pull the completed list.
  const { data: assignments } = await supabase.from("story_assignments").select("story_id").eq("group_id", profile.group_id).eq("assigned", true);
  const { data: attempts } = await supabase.from("student_attempts").select("story_id").eq("student_id", profile.id).not("completed_at", "is", null);
  const completedIds = [...new Set((attempts || []).map(a => a.story_id))];

  if (!completedIds.length) {
    Utils.showEmpty(gameArea, "🎮", "Finish a story first to unlock its mini-games!");
    Utils.$("#story-select").style.display = "none";
    Utils.$("#game-tabs").style.display = "none";
    return;
  }

  const { data: stories } = await supabase.from("stories").select("id, title, content, emoji").in("id", completedIds);
  completedStories = stories || [];
  storySelect.innerHTML = completedStories.map(s => `<option value="${s.id}">${s.emoji || "📖"} ${Utils.escapeHtml(s.title)}</option>`).join("");

  const { data: vocabAll } = await supabase.from("vocabulary").select("*").in("story_id", (assignments || []).map(a => a.story_id));
  allVocab = vocabAll || [];

  async function awardGamePoints(gameName) {
    await supabase.from("points_transactions").insert({
      student_id: profile.id, points: 5, reason: `Mini-game: ${gameName}`, ref_type: "vocab"
    });
  }

  function showGameResult(emoji, message) {
    gameArea.innerHTML = `
      <div class="game-result anim-pop">
        <div class="gr-emoji">${emoji}</div>
        <p style="font-weight:700; font-size:16px; margin:10px 0;">${message}</p>
        <button class="btn btn-primary" id="btn-play-again">Play Again</button>
      </div>`;
    Utils.$("#btn-play-again").addEventListener("click", renderActiveGame);
  }

  // ---------- Game 1: Word Match ----------
  async function renderWordMatch() {
    const storyId = storySelect.value;
    const { data: vocab } = await supabase.from("vocabulary").select("*").eq("story_id", storyId);
    if (!vocab || vocab.length < 2) { Utils.showEmpty(gameArea, "🔤", "This story doesn't have enough vocabulary words yet."); return; }

    const words = shuffle([...vocab]);
    const defs = shuffle([...vocab]);
    let selectedWord = null, selectedDef = null, matched = 0;

    gameArea.innerHTML = `
      <p style="font-weight:700; margin:0 0 12px;">Match each word to its meaning</p>
      <div class="match-grid">
        <div class="match-col" id="word-col">${words.map(v => `<div class="match-tile" data-id="${v.id}">${Utils.escapeHtml(v.word)}</div>`).join("")}</div>
        <div class="match-col" id="def-col">${defs.map(v => `<div class="match-tile" data-id="${v.id}">${Utils.escapeHtml(v.definition)}</div>`).join("")}</div>
      </div>`;

    Utils.$all(".match-tile", Utils.$("#word-col")).forEach(t => t.addEventListener("click", () => pick(t, "word")));
    Utils.$all(".match-tile", Utils.$("#def-col")).forEach(t => t.addEventListener("click", () => pick(t, "def")));

    function pick(tile, kind) {
      if (tile.classList.contains("matched")) return;
      if (kind === "word") { Utils.$all(".match-tile", Utils.$("#word-col")).forEach(t => t.classList.remove("selected")); tile.classList.add("selected"); selectedWord = tile; }
      else { Utils.$all(".match-tile", Utils.$("#def-col")).forEach(t => t.classList.remove("selected")); tile.classList.add("selected"); selectedDef = tile; }
      Sound.click();
      if (selectedWord && selectedDef) {
        if (selectedWord.dataset.id === selectedDef.dataset.id) {
          selectedWord.classList.add("matched"); selectedDef.classList.add("matched");
          selectedWord.classList.remove("selected"); selectedDef.classList.remove("selected");
          Sound.correct();
          matched++;
          selectedWord = null; selectedDef = null;
          if (matched === vocab.length) { awardGamePoints("Word Match"); showGameResult("🌟", "All matched! +5 points"); }
        } else {
          selectedWord.classList.add("wrong"); selectedDef.classList.add("wrong");
          Sound.incorrect();
          setTimeout(() => {
            selectedWord?.classList.remove("wrong", "selected"); selectedDef?.classList.remove("wrong", "selected");
            selectedWord = null; selectedDef = null;
          }, 500);
        }
      }
    }
  }

  // ---------- Game 2: Story Order ----------
  async function renderStoryOrder() {
    const story = completedStories.find(s => s.id === storySelect.value);
    const lines = story.content.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length < 3) { Utils.showEmpty(gameArea, "📖", "This story is too short for the ordering game."); return; }
    const shuffled = shuffle(lines.map((text, idx) => ({ text, idx, key: `t${idx}` })));
    const answer = [];

    gameArea.innerHTML = `
      <p style="font-weight:700; margin:0 0 12px;">Tap the sentences in the order they happen in the story</p>
      <div class="order-list" id="answer-list"></div>
      <div class="order-list" id="pool-list" style="margin-top:14px;"></div>
      <div style="display:flex; gap:10px; margin-top:14px;">
        <button class="btn btn-secondary" id="btn-undo">Undo</button>
        <button class="btn btn-primary" id="btn-check-order">Check Order</button>
      </div>
    `;
    renderPool();

    function renderPool() {
      Utils.$("#pool-list").innerHTML = shuffled
        .filter(item => !answer.includes(item))
        .map(item => `<div class="order-tile" data-key="${item.key}">${Utils.escapeHtml(item.text)}</div>`).join("");
      Utils.$all(".order-tile", Utils.$("#pool-list")).forEach(tile => {
        tile.addEventListener("click", () => {
          const item = shuffled.find(s => s.key === tile.dataset.key);
          answer.push(item);
          Sound.click();
          renderAnswer(); renderPool();
        });
      });
    }
    function renderAnswer() {
      Utils.$("#answer-list").innerHTML = answer.map((item, i) => `
        <div class="order-tile placed"><span class="order-num">${i + 1}</span>${Utils.escapeHtml(item.text)}</div>
      `).join("");
    }
    Utils.$("#btn-undo").addEventListener("click", () => { answer.pop(); renderAnswer(); renderPool(); });
    Utils.$("#btn-check-order").addEventListener("click", () => {
      if (answer.length !== lines.length) { Utils.toast("Place every sentence first.", "error"); return; }
      const correct = answer.every((item, i) => item.idx === i);
      if (correct) { Sound.correct(); awardGamePoints("Story Order"); showGameResult("🌟", "Perfect order! +5 points"); }
      else { Sound.incorrect(); Utils.toast("Not quite right — try again!", "error"); answer.length = 0; renderAnswer(); renderPool(); }
    });
  }

  // ---------- Game 3: Find the Word ----------
  async function renderFindWord() {
    const storyId = storySelect.value;
    const story = completedStories.find(s => s.id === storyId);
    const { data: vocab } = await supabase.from("vocabulary").select("*").eq("story_id", storyId);
    if (!vocab || !vocab.length) { Utils.showEmpty(gameArea, "🔍", "No vocabulary words to search for in this story."); return; }
    const target = vocab[Math.floor(Math.random() * vocab.length)];

    const tokens = story.content.split(/(\s+)/);
    gameArea.innerHTML = `
      <p style="font-weight:700; margin:0 0 12px;">Tap the word: <span style="color:var(--s-primary);">${Utils.escapeHtml(target.word.toUpperCase())}</span></p>
      <p class="find-word-text" id="fw-text"></p>
    `;
    const textEl = Utils.$("#fw-text");
    tokens.forEach(tok => {
      const span = document.createElement("span");
      const clean = tok.replace(/[.,!?"]/g, "").toLowerCase();
      if (clean) {
        span.className = "fw-word";
        span.dataset.match = clean === target.word.toLowerCase() ? "1" : "0";
        span.addEventListener("click", () => {
          if (span.dataset.match === "1") { span.classList.add("correct"); Sound.correct(); awardGamePoints("Find the Word"); setTimeout(() => showGameResult("🌟", "Found it! +5 points"), 500); }
          else { span.classList.add("wrong"); Sound.incorrect(); setTimeout(() => span.classList.remove("wrong"), 500); }
        });
      }
      span.textContent = tok;
      textEl.appendChild(span);
    });
  }

  // ---------- Game 4: True or False (ungraded, uses check_answer RPC so answers stay hidden until tapped) ----------
  async function renderTrueFalse() {
    const storyId = storySelect.value;
    const { data: questions } = await supabase.from("questions_public").select("*").eq("story_id", storyId).eq("question_type", "true_false");
    if (!questions || !questions.length) { Utils.showEmpty(gameArea, "✓", "No true/false questions for this story."); return; }
    const q = questions[Math.floor(Math.random() * questions.length)];

    gameArea.innerHTML = `
      <p style="font-weight:700; font-size:18px; margin:0 0 20px; text-align:center;">${Utils.escapeHtml(q.question_text)}</p>
      <div class="tf-options" style="max-width:320px; margin:0 auto;">
        <div class="q-option" id="btn-true">✓ True</div>
        <div class="q-option" id="btn-false">✕ False</div>
      </div>
    `;
    Utils.$("#btn-true").addEventListener("click", () => answer(true));
    Utils.$("#btn-false").addEventListener("click", () => answer(false));

    async function answer(val) {
      const { data: isCorrect } = await supabase.rpc("check_answer", { p_question_id: q.id, p_selected: val });
      if (isCorrect) { Sound.correct(); awardGamePoints("True or False"); showGameResult("🌟", "Correct! +5 points"); }
      else { Sound.incorrect(); showGameResult("💪", "Not quite — give it another try!"); }
    }
  }

  // ---------- Game 5: Choose the Picture (large-tile multiple choice, ideal for young readers) ----------
  async function renderPictureChoice() {
    const storyId = storySelect.value;
    const { data: vocab } = await supabase.from("vocabulary").select("*").eq("story_id", storyId);
    if (!vocab || !vocab.length) { Utils.showEmpty(gameArea, "🖼️", "No vocabulary words for this story yet."); return; }
    const target = vocab[Math.floor(Math.random() * vocab.length)];
    const distractors = shuffle(allVocab.filter(v => v.id !== target.id)).slice(0, 3);
    const options = shuffle([target, ...distractors]);

    gameArea.innerHTML = `
      <p style="font-weight:700; font-size:17px; margin:0 0 16px; text-align:center;">Which word means: <br>"${Utils.escapeHtml(target.definition)}"</p>
      <div class="pic-choice-grid">
        ${options.map(v => `<div class="pic-choice-tile" data-id="${v.id}">📖<div class="pc-label">${Utils.escapeHtml(v.word)}</div></div>`).join("")}
      </div>
    `;
    Utils.$all(".pic-choice-tile", gameArea).forEach(tile => {
      tile.addEventListener("click", () => {
        if (tile.dataset.id === target.id) {
          tile.classList.add("correct"); Sound.correct(); awardGamePoints("Choose the Picture");
          setTimeout(() => showGameResult("🌟", "Great job! +5 points"), 500);
        } else {
          tile.classList.add("wrong"); Sound.incorrect();
          setTimeout(() => tile.classList.remove("wrong"), 500);
        }
      });
    });
  }

  function shuffle(arr) { return arr.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(p => p[1]); }

  // ---------- Game 6: Vocabulary Quiz — "What does WORD mean?" and "Choose the correct word" ----------
  async function renderVocabQuiz() {
    const storyId = storySelect.value;
    const { data: vocab } = await supabase.from("vocabulary").select("*").eq("story_id", storyId).eq("active", true);
    if (!vocab || vocab.length < 2) { Utils.showEmpty(gameArea, "📚", "This story doesn't have enough vocabulary words yet."); return; }

    const target = vocab[Math.floor(Math.random() * vocab.length)];
    const pool = allVocab.length >= 4 ? allVocab : vocab;
    const distractors = shuffle(pool.filter(v => v.id !== target.id)).slice(0, 3);
    const options = shuffle([target, ...distractors]);

    // Alternate between "meaning" quiz and "fill the blank" quiz for variety.
    const mode = Math.random() < 0.5 && target.example_sentence ? "blank" : "meaning";

    if (mode === "meaning") {
      gameArea.innerHTML = `
        <p style="font-weight:700; font-size:17px; margin:0 0 16px; text-align:center;">What does <span style="color:var(--s-primary); text-transform:uppercase;">${Utils.escapeHtml(target.word)}</span> mean?</p>
        <div class="q-options">
          ${options.map(v => `<div class="q-option" data-id="${v.id}" dir="rtl" style="text-align:right;">${Utils.escapeHtml(v.arabic_meaning || v.word)}</div>`).join("")}
        </div>
      `;
    } else {
      const blanked = target.example_sentence.replace(new RegExp(target.word, "i"), "____");
      gameArea.innerHTML = `
        <p style="font-weight:700; font-size:17px; margin:0 0 16px; text-align:center;">Choose the correct word:</p>
        <p style="font-size:16px; text-align:center; font-style:italic; margin:0 0 16px;">"${Utils.escapeHtml(blanked)}"</p>
        <div class="q-options">
          ${options.map(v => `<div class="q-option" data-id="${v.id}">${Utils.escapeHtml(v.word)}</div>`).join("")}
        </div>
      `;
    }

    Utils.$all(".q-option", gameArea).forEach(opt => {
      opt.addEventListener("click", async () => {
        if (opt.dataset.id === target.id) {
          opt.classList.add("selected"); Sound.correct();
          await supabase.rpc("submit_vocabulary_review", { p_vocabulary_id: target.id, p_rating: "easy" });
          setTimeout(() => showGameResult("🌟", "Correct! +5 points"), 500);
        } else {
          opt.style.borderColor = "var(--s-error)"; Sound.incorrect();
          setTimeout(() => { opt.style.borderColor = ""; }, 500);
        }
      });
    });
  }

  function renderActiveGame() {
    gameArea.innerHTML = `<div class="loading-state"><div class="spinner"></div></div>`;
    ({ wordmatch: renderWordMatch, storyorder: renderStoryOrder, findword: renderFindWord, truefalse: renderTrueFalse, picture: renderPictureChoice, vocabquiz: renderVocabQuiz }[activeGame])();
  }

  Utils.$all(".tab-btn", Utils.$("#game-tabs")).forEach(tab => {
    tab.addEventListener("click", () => {
      Utils.$all(".tab-btn", Utils.$("#game-tabs")).forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      activeGame = tab.dataset.game;
      renderActiveGame();
    });
  });
  storySelect.addEventListener("change", renderActiveGame);

  renderActiveGame();
})();
