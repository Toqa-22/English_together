(async () => {
  const profile = await Auth.guard("admin");
  if (!profile) return;

  Utils.$("#logout-link").addEventListener("click", (e) => { e.preventDefault(); Auth.logout(); });
  Utils.$("#hamburger")?.addEventListener("click", () => Utils.$("#sidebar").classList.toggle("open"));

  const params = new URLSearchParams(location.search);
  const listeningId = params.get("id");
  const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
  let currentListeningType = "youtube";
  let pendingAudioUrl = null;

  // Load groups for the checkbox list, pre-checking whichever are already assigned (edit mode).
  const { data: groups } = await supabase.from("groups").select("id, name").order("name");
  let assignedGroupIds = new Set();
  if (listeningId) {
    const { data: existingAssignments } = await supabase.from("listening_assignments").select("group_id").eq("listening_id", listeningId);
    assignedGroupIds = new Set((existingAssignments || []).map(a => a.group_id));
  }
  Utils.$("#group-checkboxes").innerHTML = (groups || []).length
    ? (groups || []).map(g => `
        <label style="font-size:14px;"><input type="checkbox" class="group-cb" value="${g.id}" style="width:auto; margin-right:6px;" ${assignedGroupIds.has(g.id) ? "checked" : ""}> ${Utils.escapeHtml(g.name)}</label>
      `).join("")
    : `<span style="font-size:13px; color:#8892a8;">No groups yet — create one under Admin → Groups first.</span>`;

  if (listeningId) {
    Utils.$("#page-title").textContent = "Edit Listening";
    const { data: item, error } = await supabase.from("listening_activities").select("*").eq("id", listeningId).maybeSingle();
    if (error || !item) { Utils.toast("Not found.", "error"); location.href = "listening.html"; return; }
    Utils.$("#f-title").value = item.title;
    Utils.$("#f-description").value = item.description || "";
    Utils.$("#f-video-id").value = item.youtube_video_id || "";
    Utils.$("#f-difficulty").value = item.difficulty || "easy";
    Utils.$("#f-minutes").value = item.estimated_minutes;
    Utils.$("#f-thumbnail").value = item.thumbnail_url || "";
    Utils.$("#f-active").checked = item.active;
    updatePreview(item.youtube_video_id || "");
    // Same self-healing logic as the Tests editor: trust the actual data over a
    // possibly-stale flag, so a real audio URL always shows the audio tab.
    const effectiveType = item.audio_url ? "audio" : (item.youtube_video_id ? "youtube" : (item.listening_type || "youtube"));
    setListeningType(effectiveType);
    if (item.audio_url) {
      pendingAudioUrl = item.audio_url;
      Utils.$("#audio-preview").src = item.audio_url;
      Utils.$("#audio-preview").style.display = "block";
    }
  }

  // ---------- YouTube vs Audio tab toggle ----------
  function setListeningType(type) {
    currentListeningType = type;
    Utils.$all('[data-listening-type]').forEach(btn => btn.classList.toggle("active", btn.dataset.listeningType === type));
    Utils.$("#listening-youtube-block").style.display = type === "youtube" ? "block" : "none";
    Utils.$("#listening-audio-block").style.display = type === "audio" ? "block" : "none";
  }
  Utils.$all('[data-listening-type]').forEach(btn => {
    btn.addEventListener("click", () => setListeningType(btn.dataset.listeningType));
  });

  function updatePreview(videoId) {
    const wrap = Utils.$("#preview-wrap");
    if (VIDEO_ID_RE.test(videoId)) {
      wrap.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}" allowfullscreen></iframe>`;
    } else {
      wrap.innerHTML = `<div class="video-preview-empty">Enter a valid video ID to preview</div>`;
    }
  }

  Utils.$("#f-video-id").addEventListener("input", (e) => {
    // Guard against someone pasting a full YouTube URL instead of just the ID.
    const raw = e.target.value.trim();
    const urlMatch = raw.match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{11})/);
    if (urlMatch) { e.target.value = urlMatch[1]; }
    updatePreview(e.target.value.trim());
  });

  // ---------- Audio upload — happens immediately on file selection, reusing the
  // same "test-images" Storage bucket (a bucket just holds files; it isn't
  // restricted to any one content type) under a "listening/" path prefix. ----------
  Utils.$("#f-audio-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const statusEl = Utils.$("#audio-status");
    if (!file.type.startsWith("audio/")) { statusEl.textContent = "Please choose an audio file."; statusEl.style.color = "var(--a-danger)"; return; }
    statusEl.style.color = "#8892a8";
    statusEl.textContent = "Uploading...";
    try {
      const scope = listeningId || `new-${Date.now()}`;
      const path = `listening/${scope}/${Date.now()}-${file.name.replace(/[^a-z0-9.]/gi, "_")}`;
      const { error: uploadError } = await supabase.storage.from("test-images").upload(path, file);
      if (uploadError) throw uploadError;
      const { data: pub } = supabase.storage.from("test-images").getPublicUrl(path);
      pendingAudioUrl = pub.publicUrl;
      Utils.$("#audio-preview").src = pendingAudioUrl;
      Utils.$("#audio-preview").style.display = "block";
      statusEl.textContent = "Uploaded.";
      statusEl.style.color = "var(--a-success)";
    } catch (err) {
      console.error("Audio upload failed:", err);
      statusEl.textContent = "Upload failed: " + (err.message || err);
      statusEl.style.color = "var(--a-danger)";
    }
  });

  Utils.$("#listening-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const saveBtn = Utils.$("#save-btn");
    const statusEl = Utils.$("#save-status");

    let videoId = null, audioUrl = null;
    if (currentListeningType === "youtube") {
      videoId = Utils.$("#f-video-id").value.trim();
      if (!VIDEO_ID_RE.test(videoId)) {
        statusEl.textContent = "That doesn't look like a valid YouTube video ID (must be exactly 11 characters).";
        statusEl.style.color = "var(--a-danger)";
        return;
      }
    } else {
      audioUrl = pendingAudioUrl;
      if (!audioUrl) {
        statusEl.textContent = "Upload an audio file first.";
        statusEl.style.color = "var(--a-danger)";
        return;
      }
    }

    saveBtn.disabled = true;
    statusEl.style.color = "#8892a8";
    statusEl.textContent = "Saving...";

    const payload = {
      title: Utils.$("#f-title").value.trim(),
      description: Utils.$("#f-description").value.trim(),
      listening_type: currentListeningType,
      youtube_video_id: videoId,
      audio_url: audioUrl,
      difficulty: Utils.$("#f-difficulty").value,
      estimated_minutes: parseInt(Utils.$("#f-minutes").value, 10) || 5,
      thumbnail_url: Utils.$("#f-thumbnail").value.trim() || null,
      active: Utils.$("#f-active").checked
    };
    const selectedGroups = Utils.$all(".group-cb").filter(cb => cb.checked).map(cb => cb.value);

    try {
      let targetId = listeningId;
      if (listeningId) {
        // .select() is essential — without it, an UPDATE that matches zero rows
        // (e.g. silently blocked by RLS) reports success with no error at all.
        const { data: updated, error } = await supabase.from("listening_activities").update(payload).eq("id", listeningId).select();
        if (error) throw error;
        if (!updated || !updated.length) throw new Error("No rows were updated — check permissions or refresh the page.");
      } else {
        payload.created_by = profile.id;
        const { data: newItem, error } = await supabase.from("listening_activities").insert(payload).select().single();
        if (error) throw error;
        targetId = newItem.id;
      }

      // Sync group assignments: upsert selected, remove unselected.
      if (selectedGroups.length) {
        await supabase.from("listening_assignments").upsert(
          selectedGroups.map(groupId => ({ listening_id: targetId, group_id: groupId, available: true })),
          { onConflict: "listening_id,group_id" }
        );
      }
      const toRemove = [...assignedGroupIds].filter(id => !selectedGroups.includes(id));
      if (toRemove.length) {
        await supabase.from("listening_assignments").delete().eq("listening_id", targetId).in("group_id", toRemove);
      }

      if (listeningId) {
        Utils.toast("Saved.", "success");
        statusEl.textContent = "Saved.";
        saveBtn.disabled = false;
      } else {
        Utils.toast("Created. Now add questions.", "success");
        location.href = `listening-questions.html?listening=${targetId}`;
      }
    } catch (err) {
      console.error(err);
      statusEl.textContent = "Couldn't save: " + err.message;
      statusEl.style.color = "var(--a-danger)";
      saveBtn.disabled = false;
    }
  });
})();
