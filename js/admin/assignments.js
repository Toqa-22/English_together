(async () => {
  const profile = await Auth.guard("admin");
  if (!profile) return;

  Utils.$("#logout-link").addEventListener("click", (e) => { e.preventDefault(); Auth.logout(); });
  Utils.$("#hamburger")?.addEventListener("click", () => Utils.$("#sidebar").classList.toggle("open"));

  let stories = [], listeningItems = [], groups = [];
  let viewType = "story"; // which table the "Current Assignments" list below is showing

  async function loadOptions() {
    const [storiesRes, listeningRes, groupsRes] = await Promise.all([
      supabase.from("stories").select("id, title, emoji").order("title"),
      supabase.from("listening_activities").select("id, title").order("title"),
      supabase.from("groups").select("id, name").order("name")
    ]);
    stories = storiesRes.data || [];
    listeningItems = listeningRes.data || [];
    groups = groupsRes.data || [];
    Utils.$("#group-checkboxes").innerHTML = groups.map(g => `
      <label style="font-size:14px;"><input type="checkbox" class="group-cb" value="${g.id}" style="width:auto; margin-right:6px;"> ${Utils.escapeHtml(g.name)}</label>
    `).join("");
    renderContentOptions();
  }

  function renderContentOptions() {
    const type = Utils.$("#f-type").value;
    Utils.$("#content-label").textContent = type === "story" ? "Story" : "Listening Activity";
    Utils.$("#f-story").innerHTML = type === "story"
      ? stories.map(s => `<option value="${s.id}">${s.emoji || "📖"} ${Utils.escapeHtml(s.title)}</option>`).join("")
      : listeningItems.map(l => `<option value="${l.id}">🎧 ${Utils.escapeHtml(l.title)}</option>`).join("");
  }

  Utils.$("#f-type").addEventListener("change", renderContentOptions);

  Utils.$("#f-availability").addEventListener("change", (e) => {
    Utils.$("#schedule-fields").style.display = e.target.value === "scheduled" ? "flex" : "none";
  });

  Utils.$("#btn-save-assignment").addEventListener("click", async () => {
    const statusEl = Utils.$("#assign-status");
    const type = Utils.$("#f-type").value;
    const contentId = Utils.$("#f-story").value;
    const selectedGroups = Utils.$all(".group-cb").filter(cb => cb.checked).map(cb => cb.value);
    const availability = Utils.$("#f-availability").value;

    if (!contentId || !selectedGroups.length) {
      statusEl.textContent = "Pick an item and at least one group.";
      statusEl.style.color = "var(--a-danger)";
      return;
    }

    const table = type === "story" ? "story_assignments" : "listening_assignments";
    const idField = type === "story" ? "story_id" : "listening_id";
    const conflictCols = type === "story" ? "story_id,group_id" : "listening_id,group_id";

    const rows = selectedGroups.map(groupId => ({
      [idField]: contentId,
      group_id: groupId,
      ...(type === "story" ? { assigned: true } : {}),
      available: availability !== "locked",
      available_from: availability === "scheduled" ? (Utils.$("#f-start").value || null) : null,
      available_until: availability === "scheduled" ? (Utils.$("#f-end").value || null) : null
    }));

    statusEl.textContent = "Saving...";
    const { error } = await supabase.from(table).upsert(rows, { onConflict: conflictCols });
    if (error) { statusEl.textContent = "Couldn't save: " + error.message; statusEl.style.color = "var(--a-danger)"; return; }
    statusEl.textContent = "Assignment saved.";
    statusEl.style.color = "var(--a-success)";
    Utils.toast("Assignment saved.", "success");
    if (viewType === type) loadAssignments();
  });

  Utils.$all(".tab-btn").forEach(tab => {
    tab.addEventListener("click", () => {
      Utils.$all(".tab-btn").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      viewType = tab.dataset.view;
      loadAssignments();
    });
  });

  async function loadAssignments() {
    const tbody = Utils.$("#assignments-body");
    Utils.$("#table-content-header").textContent = viewType === "story" ? "Story" : "Listening";
    tbody.innerHTML = `<tr><td colspan="5"><div class="loading-state"><div class="spinner"></div></div></td></tr>`;

    const table = viewType === "story" ? "story_assignments" : "listening_assignments";
    const contentSelect = viewType === "story" ? "stories(title, emoji)" : "listening_activities(title)";
    const { data, error } = await supabase.from(table).select(`*, ${contentSelect}, groups(name)`).order("created_at", { ascending: false });
    if (error) { Utils.showError(tbody, "Couldn't load assignments."); return; }
    if (!data.length) { tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">🎯</div><p>No assignments yet.</p></div></td></tr>`; return; }

    tbody.innerHTML = data.map(a => {
      const content = viewType === "story" ? a.stories : a.listening_activities;
      const icon = viewType === "story" ? (content?.emoji || "📖") : "🎧";
      let statusLabel = a.available ? "Available" : "Locked";
      let pill = a.available ? "pill-success" : "pill-danger";
      if (a.available_from && new Date(a.available_from) > new Date()) { statusLabel = "Scheduled"; pill = "pill-warning"; }
      const window = a.available_from || a.available_until
        ? `${a.available_from ? Utils.formatDate(a.available_from) : "-"} → ${a.available_until ? Utils.formatDate(a.available_until) : "-"}`
        : "-";
      return `
        <tr>
          <td>${icon} ${Utils.escapeHtml(content?.title || "-")}</td>
          <td>${Utils.escapeHtml(a.groups?.name || "-")}</td>
          <td><span class="badge-pill ${pill}">${statusLabel}</span></td>
          <td>${window}</td>
          <td>
            <button class="btn btn-secondary" style="padding:6px 10px; font-size:12px;" data-act="toggle" data-id="${a.id}" data-available="${a.available}">${a.available ? "Lock" : "Unlock"}</button>
          </td>
        </tr>`;
    }).join("");

    Utils.$all('[data-act="toggle"]', tbody).forEach(btn => {
      btn.addEventListener("click", async () => {
        const { error } = await supabase.from(table).update({ available: btn.dataset.available !== "true" }).eq("id", btn.dataset.id);
        if (error) { Utils.toast("Couldn't update.", "error"); return; }
        loadAssignments();
      });
    });
  }

  await loadOptions();
  await loadAssignments();
})();
