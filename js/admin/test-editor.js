(async () => {
  const profile = await Auth.guard("admin");
  if (!profile) return;

  Utils.$("#logout-link").addEventListener("click", (e) => { e.preventDefault(); Auth.logout(); });
  Utils.$("#hamburger")?.addEventListener("click", () => Utils.$("#sidebar").classList.toggle("open"));

  const params = new URLSearchParams(location.search);
  let testId = params.get("id");
  const presetGroupId = params.get("group");
  const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

  const { data: groups } = await supabase.from("groups").select("id, name").order("name");
  Utils.$("#f-group").innerHTML = (groups || []).map(g => `<option value="${g.id}">${Utils.escapeHtml(g.name)}</option>`).join("");

  if (testId) {
    Utils.$("#page-title").textContent = "Edit Test";
    const { data: test, error } = await supabase.from("tests").select("*").eq("id", testId).maybeSingle();
    if (error || !test) { Utils.toast("Test not found.", "error"); location.href = "tests.html"; return; }

    Utils.$("#f-group").value = test.group_id;
    Utils.$("#f-title").value = test.title;
    Utils.$("#f-description").value = test.description || "";
    Utils.$("#f-reading-text").value = test.reading_text || "";
    Utils.$("#f-reading-timer").value = test.reading_time_limit_minutes || "";
    Utils.$("#f-listening-timer").value = test.listening_time_limit_minutes || "";
    Utils.$("#f-vocab-timer").value = test.vocabulary_time_limit_minutes || "";
    Utils.$("#f-video-id").value = test.listening_video_id || "";

    // Show the editable fields and load existing questions FIRST — this must never
    // be blocked by a failure below (e.g. a mismatched HTML/JS pair after an update),
    // or admin loses the ability to see/edit what they already created, which is
    // worse than a broken video preview.
    Utils.$("#sections-area").style.display = "block";
    loadReadingQuestions();
    loadListeningQuestions();
    loadVocabItems();

    try {
      updateVideoPreview(test.listening_video_id || "");
      // Don't trust listening_type alone to decide which tab to show — if an
      // older save (from before a bug fix) ever wrote the audio URL without
      // correctly updating this flag, the audio would silently stay hidden
      // behind the wrong tab even though the data is really there. Let the
      // actual presence of a URL decide instead, so this can't happen.
      const effectiveType = test.listening_audio_url ? "audio" : (test.listening_video_id ? "youtube" : (test.listening_type || "youtube"));
      setListeningType(effectiveType);
      if (test.listening_audio_url) {
        Utils.$("#audio-preview").src = test.listening_audio_url;
        Utils.$("#audio-preview").style.display = "block";
      }
    } catch (err) {
      console.error("Listening preview setup failed (the fields/questions above are unaffected):", err);
    }
  } else if (presetGroupId) {
    Utils.$("#f-group").value = presetGroupId;
    Utils.$("#f-group").disabled = false; // still locked visually via the note; selection just pre-filled
  }

  // ---------- Basic info save ----------
  Utils.$("#test-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const saveBtn = Utils.$("#save-btn");
    const statusEl = Utils.$("#save-status");
    saveBtn.disabled = true;
    statusEl.style.color = "#8892a8";
    statusEl.textContent = "Saving...";

    const payload = {
      title: Utils.$("#f-title").value.trim(),
      description: Utils.$("#f-description").value.trim() || null
    };

    try {
      if (testId) {
        const { data: updated, error } = await supabase.from("tests").update(payload).eq("id", testId).select();
        if (error) throw error;
        if (!updated || !updated.length) throw new Error("No rows were updated — check permissions or refresh the page.");
        statusEl.textContent = "Saved.";
      } else {
        payload.group_id = Utils.$("#f-group").value;
        payload.created_by = profile.id;
        const { data: newTest, error } = await supabase.from("tests").insert(payload).select().single();
        if (error) {
          if (error.message.includes("tests_one_active_per_group")) {
            throw new Error("This group already has an active test. Archive it from the Tests page first.");
          }
          throw error;
        }
        testId = newTest.id;
        Utils.toast("Test created. Now add content below.", "success");
        Utils.$("#sections-area").style.display = "block";
        Utils.$("#f-group").value = newTest.group_id;
        loadReadingQuestions();
        loadListeningQuestions();
        loadVocabItems();
        statusEl.textContent = "Saved.";
      }
    } catch (err) {
      console.error(err);
      statusEl.textContent = "Couldn't save: " + err.message;
      statusEl.style.color = "var(--a-danger)";
    } finally {
      saveBtn.disabled = false;
    }
  });

  // ---------- Reading text ----------
  Utils.$("#btn-save-reading-text").addEventListener("click", async () => {
    if (!testId) { Utils.toast("Save the test info first.", "error"); return; }
    const payload = {
      reading_text: Utils.$("#f-reading-text").value.trim(),
      reading_time_limit_minutes: Utils.$("#f-reading-timer").value ? parseInt(Utils.$("#f-reading-timer").value, 10) : null
    };
    const { data: updated, error } = await supabase.from("tests").update(payload).eq("id", testId).select();
    if (error) { Utils.toast("Couldn't save reading text: " + error.message, "error"); return; }
    if (!updated || !updated.length) { Utils.toast("Save didn't apply — refresh and try again.", "error"); return; }
    Utils.toast("Reading text saved.", "success");
  });

  Utils.$("#btn-save-vocab-timer").addEventListener("click", async () => {
    if (!testId) { Utils.toast("Save the test info first.", "error"); return; }
    const payload = { vocabulary_time_limit_minutes: Utils.$("#f-vocab-timer").value ? parseInt(Utils.$("#f-vocab-timer").value, 10) : null };
    const { data: updated, error } = await supabase.from("tests").update(payload).eq("id", testId).select();
    if (error) { Utils.toast("Couldn't save time limit: " + error.message, "error"); return; }
    if (!updated || !updated.length) { Utils.toast("Save didn't apply — refresh and try again.", "error"); return; }
    Utils.toast("Time limit saved.", "success");
  });

  // ---------- Listening: YouTube vs uploaded audio ----------
  let currentListeningType = "youtube";
  let pendingAudioUrl = null; // set once a file has been uploaded, before "Save Listening Source" is clicked

  function setListeningType(type) {
    currentListeningType = type;
    Utils.$all('[data-listening-type]').forEach(btn => btn.classList.toggle("active", btn.dataset.listeningType === type));
    Utils.$("#listening-youtube-block").style.display = type === "youtube" ? "block" : "none";
    Utils.$("#listening-audio-block").style.display = type === "audio" ? "block" : "none";
  }
  Utils.$all('[data-listening-type]').forEach(btn => {
    btn.addEventListener("click", () => setListeningType(btn.dataset.listeningType));
  });

  function updateVideoPreview(videoId) {
    const wrap = Utils.$("#video-preview-wrap");
    if (VIDEO_ID_RE.test(videoId)) {
      wrap.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}" allowfullscreen></iframe>`;
    } else {
      wrap.innerHTML = `<div class="video-preview-empty">Enter a valid video ID to preview</div>`;
    }
  }
  Utils.$("#f-video-id").addEventListener("input", (e) => {
    const raw = e.target.value.trim();
    const urlMatch = raw.match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{11})/);
    if (urlMatch) e.target.value = urlMatch[1];
    updateVideoPreview(e.target.value.trim());
  });

  Utils.$("#f-audio-file").addEventListener("change", async (e) => {
    if (!testId) { Utils.toast("Save the test info first.", "error"); e.target.value = ""; return; }
    const file = e.target.files[0];
    if (!file) return;
    const statusEl = Utils.$("#audio-status");
    if (!file.type.startsWith("audio/")) { statusEl.textContent = "Please choose an audio file."; statusEl.style.color = "var(--a-danger)"; return; }
    statusEl.style.color = "#8892a8";
    statusEl.textContent = "Uploading...";
    try {
      const path = `${testId}/audio-${Date.now()}-${file.name.replace(/[^a-z0-9.]/gi, "_")}`;
      const { error: uploadError } = await supabase.storage.from("test-images").upload(path, file);
      if (uploadError) throw uploadError;
      const { data: pub } = supabase.storage.from("test-images").getPublicUrl(path);
      pendingAudioUrl = pub.publicUrl;
      Utils.$("#audio-preview").src = pendingAudioUrl;
      Utils.$("#audio-preview").style.display = "block";
      statusEl.textContent = "Uploaded — click \"Save Listening Source\" to apply.";
      statusEl.style.color = "var(--a-success)";
    } catch (err) {
      console.error("Audio upload failed:", err);
      statusEl.textContent = "Upload failed: " + (err.message || err);
      statusEl.style.color = "var(--a-danger)";
    }
  });

  Utils.$("#btn-save-video").addEventListener("click", async () => {
    if (!testId) { Utils.toast("Save the test info first.", "error"); return; }
    let payload;
    if (currentListeningType === "youtube") {
      const videoId = Utils.$("#f-video-id").value.trim();
      if (videoId && !VIDEO_ID_RE.test(videoId)) { Utils.toast("That doesn't look like a valid 11-character YouTube video ID.", "error"); return; }
      payload = { listening_type: "youtube", listening_video_id: videoId || null, listening_audio_url: null };
    } else {
      const audioUrl = pendingAudioUrl || Utils.$("#audio-preview").src || null;
      if (!audioUrl) { Utils.toast("Upload an audio file first.", "error"); return; }
      payload = { listening_type: "audio", listening_audio_url: audioUrl, listening_video_id: null };
    }
    payload.listening_time_limit_minutes = Utils.$("#f-listening-timer").value ? parseInt(Utils.$("#f-listening-timer").value, 10) : null;
    // .select() is essential here — without it, a Postgres UPDATE that matches
    // zero rows (e.g. blocked silently by RLS) returns success with no error at
    // all, and the "saved" message would be a lie. Checking the returned array
    // length is the only way to actually know the write took effect.
    const { data: updated, error } = await supabase.from("tests").update(payload).eq("id", testId).select();
    if (error) { Utils.toast("Couldn't save: " + error.message, "error"); return; }
    if (!updated || !updated.length) {
      console.error("tests.update matched 0 rows", { testId, payload });
      Utils.toast("Save didn't apply — the test may no longer exist, or you may not have permission. Refresh and try again.", "error");
      return;
    }
    Utils.toast("Listening source saved.", "success");
  });

  // ---------- Reading questions (mirrors the story/listening question editor pattern) ----------
  let readingQuestions = [];
  async function loadReadingQuestions() {
    try {
      const { data, error } = await supabase.from("test_reading_questions").select("*").eq("test_id", testId).order("order_number");
      if (error) throw error;
      readingQuestions = data || [];
      renderQuestionList("reading-questions-list", readingQuestions, "test_reading_questions", loadReadingQuestions);
    } catch (err) {
      console.error("Couldn't load reading questions:", err);
      const el = Utils.$("#reading-questions-list");
      if (el) el.innerHTML = `<p style="font-size:13px; color:var(--a-danger);">Couldn't load reading questions: ${err.message || err}</p>`;
    }
  }

  let listeningQuestions = [];
  async function loadListeningQuestions() {
    try {
      const { data, error } = await supabase.from("test_listening_questions").select("*").eq("test_id", testId).order("order_number");
      if (error) throw error;
      listeningQuestions = data || [];
      renderQuestionList("listening-questions-list", listeningQuestions, "test_listening_questions", loadListeningQuestions);
    } catch (err) {
      console.error("Couldn't load listening questions:", err);
      const el = Utils.$("#listening-questions-list");
      if (el) el.innerHTML = `<p style="font-size:13px; color:var(--a-danger);">Couldn't load listening questions: ${err.message || err}</p>`;
    }
  }

  function renderQuestionList(containerId, questions, table, reload) {
    const listEl = Utils.$("#" + containerId);
    if (!questions.length) {
      listEl.innerHTML = `<p style="font-size:13px; color:#8892a8; margin:0 0 14px;">No questions yet.</p>`;
      return;
    }
    listEl.innerHTML = questions.map((q, idx) => questionCardHTML(q, idx, questions.length)).join("");
    questions.forEach(q => wireQuestionCard(q, table, questions, reload, listEl));
  }

  function questionCardHTML(q, idx, total) {
    const isTF = q.question_type === "true_false";
    const opts = q.options || { A: "", B: "", C: "", D: "" };
    return `
      <div class="card q-editor-card" data-id="${q.id}" style="margin-bottom:12px;">
        <div class="q-editor-row">
          <div class="reorder-col">
            <button data-act="up" ${idx === 0 ? "disabled" : ""}>▲</button>
            <button data-act="down" ${idx === total - 1 ? "disabled" : ""}>▼</button>
          </div>
          <div style="flex:1;">
            <div class="q-field" style="margin-bottom:8px;">
              <label>Question ${idx + 1}</label>
              <input type="text" class="f-text" value="${Utils.escapeHtml(q.question_text)}">
            </div>
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
              <div class="q-field" style="flex:1; min-width:140px;">
                <label>Type</label>
                <select class="f-type">
                  <option value="multiple_choice" ${!isTF ? "selected" : ""}>Multiple Choice</option>
                  <option value="true_false" ${isTF ? "selected" : ""}>True / False</option>
                </select>
              </div>
              <div class="q-field" style="max-width:110px;">
                <label>Points</label>
                <input type="number" class="f-points" min="1" value="${q.points ?? 10}">
              </div>
            </div>
            <div class="mc-block" style="display:${isTF ? "none" : "block"}; margin-top:10px;">
              <div class="q-opts-grid">
                ${["A","B","C","D"].map(k => `
                  <div class="q-field">
                    <label>Option ${k}</label>
                    <input type="text" class="f-opt" data-key="${k}" value="${Utils.escapeHtml(opts[k] || "")}">
                  </div>`).join("")}
              </div>
              <div class="q-field" style="margin-top:8px; max-width:160px;">
                <label>Correct Option</label>
                <select class="f-correct-mc">
                  ${["A","B","C","D"].map(k => `<option value="${k}" ${q.correct_answer === k ? "selected" : ""}>${k}</option>`).join("")}
                </select>
              </div>
            </div>
            <div class="tf-block" style="display:${isTF ? "block" : "none"}; margin-top:10px;">
              <div class="correct-marker">
                <label><input type="radio" name="tf-${q.id}" class="f-correct-tf" value="true" ${q.correct_answer === true ? "checked" : ""}> True is correct</label>
                <label><input type="radio" name="tf-${q.id}" class="f-correct-tf" value="false" ${q.correct_answer === false ? "checked" : ""}> False is correct</label>
              </div>
            </div>
            <div style="margin-top:12px; display:flex; gap:10px;">
              <button class="btn btn-primary" style="padding:8px 16px; font-size:13px;" data-act="save">Save</button>
              <button class="btn btn-secondary" style="padding:8px 16px; font-size:13px; color:var(--a-danger); border-color:var(--a-danger);" data-act="delete">Delete</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  function wireQuestionCard(q, table, questions, reload, listEl) {
    const card = listEl.querySelector(`[data-id="${q.id}"]`);
    if (!card) return;
    const typeSelect = card.querySelector(".f-type");
    typeSelect.addEventListener("change", () => {
      const isTF = typeSelect.value === "true_false";
      card.querySelector(".mc-block").style.display = isTF ? "none" : "block";
      card.querySelector(".tf-block").style.display = isTF ? "block" : "none";
    });
    card.querySelector('[data-act="save"]').addEventListener("click", async () => {
      const isTF = typeSelect.value === "true_false";
      const payload = {
        question_text: card.querySelector(".f-text").value.trim(),
        question_type: typeSelect.value,
        points: parseInt(card.querySelector(".f-points").value, 10) || 10,
      };
      if (isTF) {
        const checked = card.querySelector(".f-correct-tf:checked");
        payload.options = null;
        payload.correct_answer = checked ? checked.value === "true" : true;
      } else {
        const opts = {};
        card.querySelectorAll(".f-opt").forEach(inp => opts[inp.dataset.key] = inp.value.trim());
        payload.options = opts;
        payload.correct_answer = card.querySelector(".f-correct-mc").value;
      }
      const { error } = await supabase.from(table).update(payload).eq("id", q.id);
      if (error) { Utils.toast("Couldn't save question.", "error"); return; }
      Utils.toast("Question saved.", "success");
      reload();
    });
    card.querySelector('[data-act="delete"]').addEventListener("click", async () => {
      if (!confirm("Delete this question?")) return;
      await supabase.from(table).delete().eq("id", q.id);
      reload();
    });
    card.querySelectorAll('[data-act="up"], [data-act="down"]').forEach(btn => {
      btn.addEventListener("click", async () => {
        const dir = btn.dataset.act === "up" ? -1 : 1;
        const idx = questions.findIndex(x => x.id === q.id);
        const swapWith = questions[idx + dir];
        if (!swapWith) return;
        await Promise.all([
          supabase.from(table).update({ order_number: swapWith.order_number }).eq("id", q.id),
          supabase.from(table).update({ order_number: q.order_number }).eq("id", swapWith.id)
        ]);
        reload();
      });
    });
  }

  Utils.$("#btn-add-reading-q").addEventListener("click", async () => {
    if (!testId) { Utils.toast("Save the test info first.", "error"); return; }
    const nextOrder = readingQuestions.length ? Math.max(...readingQuestions.map(q => q.order_number)) + 1 : 1;
    await supabase.from("test_reading_questions").insert({
      test_id: testId, question_text: "New question", question_type: "multiple_choice",
      options: { A: "", B: "", C: "", D: "" }, correct_answer: "A", order_number: nextOrder
    });
    loadReadingQuestions();
  });

  Utils.$("#btn-add-listening-q").addEventListener("click", async () => {
    if (!testId) { Utils.toast("Save the test info first.", "error"); return; }
    const nextOrder = listeningQuestions.length ? Math.max(...listeningQuestions.map(q => q.order_number)) + 1 : 1;
    await supabase.from("test_listening_questions").insert({
      test_id: testId, question_text: "New question", question_type: "multiple_choice",
      options: { A: "", B: "", C: "", D: "" }, correct_answer: "A", order_number: nextOrder
    });
    loadListeningQuestions();
  });

  // ---------- Vocabulary picture items (max 10, enforced by DB trigger too) ----------
  let vocabItems = [];
  async function loadVocabItems() {
    try {
      const { data, error } = await supabase.from("test_vocabulary_items").select("*").eq("test_id", testId).order("order_number");
      if (error) throw error;
      vocabItems = data || [];
    } catch (err) {
      console.error("Couldn't load vocabulary items:", err);
      const el = Utils.$("#vocab-items-list");
      if (el) el.innerHTML = `<p style="font-size:13px; color:var(--a-danger);">Couldn't load vocabulary items: ${err.message || err}</p>`;
      return;
    }
    Utils.$("#vocab-count").textContent = `(${vocabItems.length}/10)`;
    Utils.$("#btn-add-vocab-item").disabled = vocabItems.length >= 10;

    const listEl = Utils.$("#vocab-items-list");
    if (!vocabItems.length) {
      listEl.innerHTML = `<p style="font-size:13px; color:#8892a8;">No images yet.</p>`;
      return;
    }
    listEl.innerHTML = vocabItems.map(v => `
      <div class="vocab-item-card" data-id="${v.id}">
        <img src="${v.image_url}" alt="">
        <div class="vi-fields">
          <input type="text" class="f-vi-word" value="${Utils.escapeHtml(v.word)}" placeholder="Word">
          <input type="number" class="f-vi-points" min="1" value="${v.points ?? 10}" style="max-width:80px;" placeholder="Points">
        </div>
        <button type="button" class="btn btn-secondary" style="padding:6px 10px; font-size:12px;" data-act="save-vi">Save</button>
        <button type="button" class="btn btn-secondary" style="padding:6px 10px; font-size:12px; color:var(--a-danger); border-color:var(--a-danger);" data-act="delete-vi">Delete</button>
      </div>
    `).join("");

    Utils.$all('[data-act="save-vi"]', listEl).forEach(btn => {
      btn.addEventListener("click", async () => {
        const card = btn.closest(".vocab-item-card");
        const word = card.querySelector(".f-vi-word").value.trim();
        const pts = parseInt(card.querySelector(".f-vi-points").value, 10) || 10;
        const { error } = await supabase.from("test_vocabulary_items").update({ word, points: pts }).eq("id", card.dataset.id);
        if (error) { Utils.toast("Couldn't save.", "error"); return; }
        Utils.toast("Saved.", "success");
        loadVocabItems();
      });
    });
    Utils.$all('[data-act="delete-vi"]', listEl).forEach(btn => {
      btn.addEventListener("click", async () => {
        const card = btn.closest(".vocab-item-card");
        const item = vocabItems.find(v => v.id === card.dataset.id);
        if (!confirm("Delete this image?")) return;
        if (item?.image_url) {
          const marker = "/test-images/";
          const idx = item.image_url.indexOf(marker);
          if (idx !== -1) await supabase.storage.from("test-images").remove([item.image_url.slice(idx + marker.length)]);
        }
        await supabase.from("test_vocabulary_items").delete().eq("id", card.dataset.id);
        loadVocabItems();
      });
    });
  }

  Utils.$("#btn-add-vocab-item").addEventListener("click", async () => {
    if (!testId) { Utils.toast("Save the test info first.", "error"); return; }
    const file = Utils.$("#f-vocab-image").files[0];
    const word = Utils.$("#f-vocab-word").value.trim();
    const statusEl = Utils.$("#vocab-status");
    if (!file || !word) { statusEl.textContent = "Pick an image and type the correct word."; statusEl.style.color = "var(--a-danger)"; return; }
    if (vocabItems.length >= 10) { statusEl.textContent = "This test already has 10 images — the maximum."; statusEl.style.color = "var(--a-danger)"; return; }

    const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!validTypes.includes(file.type)) { statusEl.textContent = "Please upload a PNG, JPG, or WEBP image."; statusEl.style.color = "var(--a-danger)"; return; }

    statusEl.style.color = "#8892a8";
    statusEl.textContent = "Uploading...";
    const path = `${testId}/${Date.now()}-${file.name.replace(/[^a-z0-9.]/gi, "_")}`;
    const { error: uploadError } = await supabase.storage.from("test-images").upload(path, file);
    if (uploadError) { statusEl.textContent = "Upload failed: " + uploadError.message; statusEl.style.color = "var(--a-danger)"; return; }
    const { data: pub } = supabase.storage.from("test-images").getPublicUrl(path);

    const nextOrder = vocabItems.length ? Math.max(...vocabItems.map(v => v.order_number)) + 1 : 1;
    const { error } = await supabase.from("test_vocabulary_items").insert({
      test_id: testId, word, image_url: pub.publicUrl, order_number: nextOrder
    });
    if (error) { statusEl.textContent = "Couldn't add: " + error.message; statusEl.style.color = "var(--a-danger)"; return; }

    Utils.$("#f-vocab-image").value = "";
    Utils.$("#f-vocab-word").value = "";
    statusEl.textContent = "Added.";
    statusEl.style.color = "var(--a-success)";
    loadVocabItems();
  });
})();
