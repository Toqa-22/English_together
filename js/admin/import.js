(async () => {
  const profile = await Auth.guard("admin");
  if (!profile) return;

  Utils.$("#logout-link").addEventListener("click", (e) => { e.preventDefault(); Auth.logout(); });
  Utils.$("#hamburger")?.addEventListener("click", () => Utils.$("#sidebar").classList.toggle("open"));

  const textarea = Utils.$("#json-input");
  const statusEl = Utils.$("#import-status");
  const resultEl = Utils.$("#import-result");
  let activeType = "story";

  const EXAMPLES = {
    story: {
      type: "story",
      title: "The Lost Kitten",
      description: "Emma helps reunite a kitten with its owner.",
      content: "Emma was walking home from school when she heard a small sound near a tree. She looked carefully and saw a little kitten hiding under some leaves.\n\nThe kitten looked scared and hungry. Emma picked it up gently and looked for its owner.",
      difficulty: "easy",
      estimated_minutes: 6,
      emoji: "🐈",
      groups: ["Group B"],
      questions: [
        {
          question_text: "Where did Emma find the kitten?",
          question_type: "multiple_choice",
          options: { A: "Near a school", B: "Near a tree", C: "In a house", D: "In a park" },
          correct_answer: "B",
          points: 10,
          category: "details"
        },
        {
          question_text: "The kitten was found by Emma.",
          question_type: "true_false",
          correct_answer: true,
          points: 10,
          category: "details"
        }
      ],
      vocabulary: [
        { word: "gently", arabic_meaning: "برفق", example_sentence: "Emma picked it up gently." }
      ]
    },
    listening: {
      type: "listening",
      title: "Explore the Rainforest!",
      description: "Learn about rainforests around the world.",
      youtube_video_id: "KMdD6TTDZ_g",
      difficulty: "easy",
      estimated_minutes: 5,
      groups: ["Group B"],
      questions: [
        {
          question_text: "What is this video mainly about?",
          question_type: "multiple_choice",
          options: { A: "Rainforests around the world", B: "How to build a treehouse", C: "Ocean animals", D: "Desert plants" },
          correct_answer: "A",
          points: 10,
          category: "main_idea"
        }
      ],
      vocabulary: [
        { word: "habitat", arabic_meaning: "الموطن", example_sentence: "A rainforest is a habitat for many animals." }
      ]
    },
    vocabulary: {
      type: "vocabulary",
      words: [
        { word: "cat", arabic_meaning: "قطة", example_sentence: "The cat is sleeping.", difficulty: "easy", category: "Animals" },
        { word: "happy", arabic_meaning: "سعيد", example_sentence: "She is happy today.", difficulty: "easy", category: "Feelings" }
      ]
    }
  };

  function loadExample() {
    textarea.value = JSON.stringify(EXAMPLES[activeType], null, 2);
  }

  Utils.$all(".tab-btn").forEach(tab => {
    tab.addEventListener("click", () => {
      Utils.$all(".tab-btn").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      activeType = tab.dataset.type;
      loadExample();
    });
  });
  Utils.$("#btn-load-example").addEventListener("click", loadExample);
  loadExample(); // show an example immediately, so the expected format is obvious from the start

  function showResult(message, ok) {
    resultEl.style.display = "block";
    resultEl.className = "import-result " + (ok ? "success" : "error");
    resultEl.textContent = message;
  }

  async function resolveGroupIds(names) {
    if (!names || !names.length) return [];
    const { data: groups } = await supabase.from("groups").select("id, name");
    const byName = Object.fromEntries((groups || []).map(g => [g.name.toLowerCase(), g.id]));
    const ids = [];
    const missing = [];
    for (const name of names) {
      const id = byName[String(name).toLowerCase()];
      if (id) ids.push(id); else missing.push(name);
    }
    if (missing.length) throw new Error(`Unknown group name(s): ${missing.join(", ")}. Check spelling against Admin → Groups.`);
    return ids;
  }

  async function importStory(data) {
    if (!data.title || !data.content) throw new Error("A story needs at least 'title' and 'content'.");
    const groupIds = await resolveGroupIds(data.groups);

    const { data: story, error: storyErr } = await supabase.from("stories").insert({
      title: data.title,
      description: data.description || null,
      content: data.content,
      difficulty: data.difficulty || "easy",
      estimated_minutes: data.estimated_minutes || 5,
      emoji: data.emoji || "📖",
      active: true,
      created_by: profile.id
    }).select().single();
    if (storyErr) throw storyErr;

    let qCount = 0, vCount = 0;
    if (Array.isArray(data.questions) && data.questions.length) {
      const rows = data.questions.map((q, i) => ({
        story_id: story.id,
        question_text: q.question_text,
        question_type: q.question_type,
        options: q.question_type === "true_false" ? null : q.options,
        correct_answer: q.correct_answer,
        points: q.points || 10,
        category: q.category || "details",
        order_number: i + 1
      }));
      const { error } = await supabase.from("questions").insert(rows);
      if (error) throw error;
      qCount = rows.length;
    }
    if (Array.isArray(data.vocabulary) && data.vocabulary.length) {
      const rows = data.vocabulary.map(v => ({
        story_id: story.id,
        word: v.word,
        arabic_meaning: v.arabic_meaning || "",
        example_sentence: v.example_sentence || "",
        definition: v.definition || null,
        difficulty: v.difficulty || "easy",
        category: v.category || null,
        active: true
      }));
      const { error } = await supabase.from("vocabulary").insert(rows);
      if (error) throw error;
      vCount = rows.length;
    }
    if (groupIds.length) {
      const { error } = await supabase.from("story_assignments").insert(
        groupIds.map(gid => ({ story_id: story.id, group_id: gid, assigned: true, available: true }))
      );
      if (error) throw error;
    }

    return `✅ Created story "${story.title}" with ${qCount} question(s) and ${vCount} vocabulary word(s)` +
      (groupIds.length ? `, assigned to ${data.groups.join(", ")}.` : " (not assigned to any group yet).");
  }

  async function importListening(data) {
    if (!data.title || !data.youtube_video_id) throw new Error("A listening activity needs at least 'title' and 'youtube_video_id'.");
    if (!/^[A-Za-z0-9_-]{11}$/.test(data.youtube_video_id)) throw new Error("'youtube_video_id' must be the 11-character video ID, not a full URL.");
    const groupIds = await resolveGroupIds(data.groups);

    const { data: item, error: itemErr } = await supabase.from("listening_activities").insert({
      title: data.title,
      description: data.description || null,
      youtube_video_id: data.youtube_video_id,
      difficulty: data.difficulty || "easy",
      estimated_minutes: data.estimated_minutes || 5,
      active: true,
      created_by: profile.id
    }).select().single();
    if (itemErr) throw itemErr;

    let qCount = 0, vCount = 0;
    if (Array.isArray(data.questions) && data.questions.length) {
      const rows = data.questions.map((q, i) => ({
        listening_id: item.id,
        question_text: q.question_text,
        question_type: q.question_type,
        options: q.question_type === "true_false" ? null : q.options,
        correct_answer: q.correct_answer,
        points: q.points || 10,
        category: q.category || "details",
        order_number: i + 1
      }));
      const { error } = await supabase.from("listening_questions").insert(rows);
      if (error) throw error;
      qCount = rows.length;
    }
    if (Array.isArray(data.vocabulary) && data.vocabulary.length) {
      const rows = data.vocabulary.map(v => ({
        listening_id: item.id,
        word: v.word,
        arabic_meaning: v.arabic_meaning || "",
        example_sentence: v.example_sentence || "",
        definition: v.definition || null,
        difficulty: v.difficulty || "easy",
        category: v.category || null,
        active: true
      }));
      const { error } = await supabase.from("vocabulary").insert(rows);
      if (error) throw error;
      vCount = rows.length;
    }
    if (groupIds.length) {
      const { error } = await supabase.from("listening_assignments").insert(
        groupIds.map(gid => ({ listening_id: item.id, group_id: gid, available: true }))
      );
      if (error) throw error;
    }

    return `✅ Created listening activity "${item.title}" with ${qCount} question(s) and ${vCount} vocabulary word(s)` +
      (groupIds.length ? `, assigned to ${data.groups.join(", ")}.` : " (not assigned to any group yet).");
  }

  async function importVocabulary(data) {
    if (!Array.isArray(data.words) || !data.words.length) throw new Error("A vocabulary batch needs a non-empty 'words' array.");
    const rows = data.words.map(v => {
      if (!v.word || !v.arabic_meaning) throw new Error(`Each word needs 'word' and 'arabic_meaning' — check: ${JSON.stringify(v)}`);
      return {
        word: v.word,
        arabic_meaning: v.arabic_meaning,
        example_sentence: v.example_sentence || "",
        definition: v.definition || null,
        difficulty: v.difficulty || "easy",
        category: v.category || null,
        active: true
      };
    });
    const { error } = await supabase.from("vocabulary").insert(rows);
    if (error) throw error;
    return `✅ Created ${rows.length} standalone vocabulary word(s).`;
  }

  Utils.$("#btn-import").addEventListener("click", async () => {
    const btn = Utils.$("#btn-import");
    resultEl.style.display = "none";
    statusEl.textContent = "";
    let data;
    try {
      data = JSON.parse(textarea.value);
    } catch (err) {
      showResult("Invalid JSON: " + err.message, false);
      return;
    }
    if (!data.type) { showResult("Missing 'type' field — must be \"story\", \"listening\", or \"vocabulary\".", false); return; }

    btn.disabled = true;
    statusEl.textContent = "Importing...";
    try {
      let message;
      if (data.type === "story") message = await importStory(data);
      else if (data.type === "listening") message = await importListening(data);
      else if (data.type === "vocabulary") message = await importVocabulary(data);
      else throw new Error(`Unknown type "${data.type}" — must be "story", "listening", or "vocabulary".`);
      showResult(message, true);
      statusEl.textContent = "";
    } catch (err) {
      console.error("Import failed:", err);
      showResult("❌ Import failed: " + (err.message || err), false);
      statusEl.textContent = "";
    } finally {
      btn.disabled = false;
    }
  });
})();
