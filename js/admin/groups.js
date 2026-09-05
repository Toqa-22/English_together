(async () => {
  const profile = await Auth.guard("admin");
  if (!profile) return;

  Utils.$("#logout-link").addEventListener("click", (e) => { e.preventDefault(); Auth.logout(); });
  Utils.$("#hamburger")?.addEventListener("click", () => Utils.$("#sidebar").classList.toggle("open"));

  const area = Utils.$("#groups-area");
  const modal = Utils.$("#group-modal");

  async function load() {
    area.innerHTML = `<div class="loading-state"><div class="spinner"></div></div>`;
    const { data: groups, error } = await supabase.from("groups").select("*").order("name");
    if (error) { Utils.showError(area, "Couldn't load groups."); return; }

    const { data: students } = await supabase.from("profiles").select("id, group_id").eq("role", "student");
    const { data: assignments } = await supabase.from("story_assignments").select("group_id");
    const { data: goals } = await supabase.from("vocabulary_weekly_goals").select("group_id, target_words");
    const goalMap = Object.fromEntries((goals || []).map(g => [g.group_id, g.target_words]));
    groups.forEach(g => { g.vocab_goal = goalMap[g.id]; });

    if (!groups.length) { Utils.showEmpty(area, "👥", "No groups yet. Click \"Add Group\" to create one."); return; }

    area.innerHTML = groups.map(g => {
      const studentCount = (students || []).filter(s => s.group_id === g.id).length;
      const storyCount = (assignments || []).filter(a => a.group_id === g.id).length;
      const ageLabel = (g.age_min || g.age_max) ? `Ages ${g.age_min ?? "?"}-${g.age_max ?? "?"} · ` : "";
      return `
        <div class="overview-card anim-fade-slide-up" style="border-top:4px solid ${g.color};">
          <div class="oc-icon">${g.icon || "👥"}</div>
          <p style="font-weight:800; font-size:16px; margin:8px 0 2px;">${Utils.escapeHtml(g.name)}</p>
          <p style="font-size:12px; color:#8892a8; margin:0 0 10px;">${ageLabel}${g.active ? "Active" : "Inactive"}</p>
          <p style="font-size:13px; margin:0;">👨‍🎓 ${studentCount} students · 📚 ${storyCount} stories assigned</p>
          <p style="font-size:12px; margin:8px 0 0;">
            ${g.meeting_link
              ? `🔗 Meeting link set · <span class="badge-pill ${g.meeting_link_visible ? "pill-success" : "pill-danger"}">${g.meeting_link_visible ? "Visible to students" : "Hidden from students"}</span>`
              : `<span style="color:#b9c0d6;">No meeting link set</span>`}
          </p>
          <div style="display:flex; gap:8px; margin-top:12px;">
            <button class="btn btn-secondary" style="padding:6px 10px; font-size:12px;" data-act="edit" data-id="${g.id}">Edit</button>
            <button class="btn btn-secondary" style="padding:6px 10px; font-size:12px; color:var(--a-danger); border-color:var(--a-danger);" data-act="delete" data-id="${g.id}" data-count="${studentCount}">Delete</button>
          </div>
        </div>`;
    }).join("");

    Utils.$all('[data-act="edit"]', area).forEach(btn => btn.addEventListener("click", () => openModal(groups.find(g => g.id === btn.dataset.id))));
    Utils.$all('[data-act="delete"]', area).forEach(btn => btn.addEventListener("click", () => remove(btn.dataset.id, parseInt(btn.dataset.count, 10))));
  }

  function openModal(group) {
    Utils.$("#modal-title").textContent = group ? "Edit Group" : "+ Add Group";
    Utils.$("#f-group-id").value = group?.id || "";
    Utils.$("#f-name").value = group?.name || "";
    Utils.$("#f-desc").value = group?.description || "";
    Utils.$("#f-age-min").value = group?.age_min ?? "";
    Utils.$("#f-age-max").value = group?.age_max ?? "";
    Utils.$("#f-color").value = group?.color || "#6C63E8";
    Utils.$("#f-icon").value = group?.icon || "";
    Utils.$("#f-meeting-link").value = group?.meeting_link || "";
    Utils.$("#f-meeting-visible").checked = group?.meeting_link_visible || false;
    Utils.$("#f-vocab-goal").value = group?.vocab_goal ?? 10;
    Utils.$("#f-active").checked = group ? group.active : true;
    Utils.$("#group-status").textContent = "";
    modal.style.display = "flex";
  }

  Utils.$("#btn-add-group").addEventListener("click", () => openModal(null));
  Utils.$("#btn-cancel-group").addEventListener("click", () => modal.style.display = "none");

  Utils.$("#group-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = Utils.$("#f-group-id").value;
    const meetingLink = Utils.$("#f-meeting-link").value.trim();
    const statusEl = Utils.$("#group-status");

    if (meetingLink && !/^https?:\/\//i.test(meetingLink)) {
      statusEl.textContent = "Meeting link must start with http:// or https://";
      statusEl.style.color = "var(--a-danger)";
      return;
    }

    const ageMinVal = Utils.$("#f-age-min").value;
    const ageMaxVal = Utils.$("#f-age-max").value;
    const payload = {
      name: Utils.$("#f-name").value.trim(),
      description: Utils.$("#f-desc").value.trim(),
      age_min: ageMinVal === "" ? null : parseInt(ageMinVal, 10),
      age_max: ageMaxVal === "" ? null : parseInt(ageMaxVal, 10),
      color: Utils.$("#f-color").value,
      icon: Utils.$("#f-icon").value.trim() || "👥",
      meeting_link: meetingLink || null,
      meeting_link_visible: Utils.$("#f-meeting-visible").checked,
      active: Utils.$("#f-active").checked
    };
    statusEl.textContent = "Saving...";
    const { error, data: savedGroup } = id
      ? await supabase.from("groups").update(payload).eq("id", id).select().single()
      : await supabase.from("groups").insert(payload).select().single();
    if (error) { statusEl.textContent = "Couldn't save: " + error.message; statusEl.style.color = "var(--a-danger)"; return; }

    const vocabGoal = parseInt(Utils.$("#f-vocab-goal").value, 10) || 10;
    const targetGroupId = id || savedGroup?.id;
    if (targetGroupId) {
      await supabase.from("vocabulary_weekly_goals").upsert(
        { group_id: targetGroupId, target_words: vocabGoal },
        { onConflict: "group_id" }
      );
    }

    Utils.toast("Group saved.", "success");
    modal.style.display = "none";
    load();
  });

  async function remove(id, studentCount) {
    if (studentCount > 0) {
      Utils.toast(`Move ${studentCount} student(s) out of this group first.`, "error");
      return;
    }
    if (!confirm("Delete this group? Story assignments to it will also be removed.")) return;
    const { error } = await supabase.from("groups").delete().eq("id", id);
    if (error) { Utils.toast("Couldn't delete group.", "error"); return; }
    Utils.toast("Group deleted.", "success");
    load();
  }

  load();
})();
