(async () => {
  const profile = await Auth.guard("admin");
  if (!profile) return;

  Utils.$("#logout-link").addEventListener("click", (e) => { e.preventDefault(); Auth.logout(); });
  Utils.$("#hamburger")?.addEventListener("click", () => Utils.$("#sidebar").classList.toggle("open"));

  const params = new URLSearchParams(location.search);
  const storyId = params.get("id");

  // Load groups for the checkbox list, pre-checking whichever are already assigned (edit mode).
  const { data: groups } = await supabase.from("groups").select("id, name").order("name");
  let assignedGroupIds = new Set();
  if (storyId) {
    const { data: existingAssignments } = await supabase.from("story_assignments").select("group_id").eq("story_id", storyId);
    assignedGroupIds = new Set((existingAssignments || []).map(a => a.group_id));
  }
  Utils.$("#group-checkboxes").innerHTML = (groups || []).length
    ? (groups || []).map(g => `
        <label style="font-size:14px;"><input type="checkbox" class="group-cb" value="${g.id}" style="width:auto; margin-right:6px;" ${assignedGroupIds.has(g.id) ? "checked" : ""}> ${Utils.escapeHtml(g.name)}</label>
      `).join("")
    : `<span style="font-size:13px; color:#8892a8;">No groups yet — create one under Admin → Groups first.</span>`;

  if (storyId) {
    Utils.$("#page-title").textContent = "Edit Story";
    const { data: story, error } = await supabase.from("stories").select("*").eq("id", storyId).maybeSingle();
    if (error || !story) { Utils.toast("Story not found.", "error"); location.href = "stories.html"; return; }
    Utils.$("#f-title").value = story.title;
    Utils.$("#f-description").value = story.description || "";
    Utils.$("#f-content").value = story.content;
    Utils.$("#f-difficulty").value = story.difficulty || "easy";
    Utils.$("#f-minutes").value = story.estimated_minutes;
    Utils.$("#f-emoji").value = story.emoji || "";
    Utils.$("#f-unlock-order").value = story.unlock_order || "";
    Utils.$("#f-active").checked = story.active;
  }

  Utils.$("#story-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const saveBtn = Utils.$("#save-btn");
    const statusEl = Utils.$("#save-status");
    saveBtn.disabled = true;
    statusEl.style.color = "#8892a8";
    statusEl.textContent = "Saving...";

    const payload = {
      title: Utils.$("#f-title").value.trim(),
      description: Utils.$("#f-description").value.trim(),
      content: Utils.$("#f-content").value.trim(),
      difficulty: Utils.$("#f-difficulty").value,
      estimated_minutes: parseInt(Utils.$("#f-minutes").value, 10) || 5,
      emoji: Utils.$("#f-emoji").value.trim() || "📖",
      unlock_order: Utils.$("#f-unlock-order").value ? parseInt(Utils.$("#f-unlock-order").value, 10) : null,
      active: Utils.$("#f-active").checked
    };
    const selectedGroups = Utils.$all(".group-cb").filter(cb => cb.checked).map(cb => cb.value);

    try {
      let targetId = storyId;
      if (storyId) {
        const { error } = await supabase.from("stories").update(payload).eq("id", storyId);
        if (error) throw error;
      } else {
        payload.created_by = profile.id;
        const { data: newStory, error } = await supabase.from("stories").insert(payload).select().single();
        if (error) throw error;
        targetId = newStory.id;
      }

      // Sync group assignments: upsert selected, remove unselected.
      if (selectedGroups.length) {
        await supabase.from("story_assignments").upsert(
          selectedGroups.map(groupId => ({ story_id: targetId, group_id: groupId, assigned: true, available: true })),
          { onConflict: "story_id,group_id" }
        );
      }
      const toRemove = [...assignedGroupIds].filter(id => !selectedGroups.includes(id));
      if (toRemove.length) {
        await supabase.from("story_assignments").delete().eq("story_id", targetId).in("group_id", toRemove);
      }

      if (storyId) {
        Utils.toast("Story updated.", "success");
        statusEl.textContent = "Saved.";
        saveBtn.disabled = false;
      } else {
        Utils.toast("Story created. Now add questions.", "success");
        location.href = `questions.html?story=${targetId}`;
      }
    } catch (err) {
      console.error(err);
      statusEl.textContent = "Couldn't save story: " + err.message;
      statusEl.style.color = "var(--a-danger)";
      saveBtn.disabled = false;
    }
  });
})();
