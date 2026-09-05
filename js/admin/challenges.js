(async () => {
  const profile = await Auth.guard("admin");
  if (!profile) return;

  Utils.$("#logout-link").addEventListener("click", (e) => { e.preventDefault(); Auth.logout(); });
  Utils.$("#hamburger")?.addEventListener("click", () => Utils.$("#sidebar").classList.toggle("open"));

  const tbody = Utils.$("#challenges-body");
  const modal = Utils.$("#challenge-modal");
  let groups = [];

  async function loadGroups() {
    const { data } = await supabase.from("groups").select("id, name").order("name");
    groups = data || [];
    Utils.$("#f-group").innerHTML = groups.map(g => `<option value="${g.id}">${Utils.escapeHtml(g.name)}</option>`).join("");
  }

  async function load() {
    tbody.innerHTML = `<tr><td colspan="8"><div class="loading-state"><div class="spinner"></div></div></td></tr>`;
    const { data, error } = await supabase.from("daily_challenges").select("*, groups(name)").order("created_at", { ascending: false });
    if (error) { Utils.showError(tbody, "Couldn't load challenges."); return; }
    if (!data.length) { tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">🎯</div><p>No challenges yet.</p></div></td></tr>`; return; }

    tbody.innerHTML = data.map(c => `
      <tr>
        <td>${Utils.escapeHtml(c.title)}</td>
        <td>${Utils.escapeHtml(c.challenge_type.replace("_", " "))}</td>
        <td>${c.target_value}</td>
        <td>⭐ ${c.points_reward}</td>
        <td>${c.group_id ? Utils.escapeHtml(c.groups?.name || "Group") : "All Students"}</td>
        <td>${Utils.formatDate(c.start_date)} → ${c.end_date ? Utils.formatDate(c.end_date) : "∞"}</td>
        <td><span class="badge-pill ${c.active ? "pill-success" : "pill-danger"}">${c.active ? "Active" : "Inactive"}</span></td>
        <td style="display:flex; gap:6px;">
          <button class="btn btn-secondary" style="padding:6px 10px; font-size:12px;" data-act="edit" data-id="${c.id}">Edit</button>
          <button class="btn btn-secondary" style="padding:6px 10px; font-size:12px;" data-act="toggle" data-id="${c.id}" data-active="${c.active}">${c.active ? "Deactivate" : "Activate"}</button>
          <button class="btn btn-secondary" style="padding:6px 10px; font-size:12px; color:var(--a-danger); border-color:var(--a-danger);" data-act="delete" data-id="${c.id}">Delete</button>
        </td>
      </tr>
    `).join("");

    Utils.$all('[data-act="edit"]', tbody).forEach(btn => btn.addEventListener("click", () => openModal(data.find(c => c.id === btn.dataset.id))));
    Utils.$all('[data-act="toggle"]', tbody).forEach(btn => btn.addEventListener("click", async () => {
      await supabase.from("daily_challenges").update({ active: btn.dataset.active !== "true" }).eq("id", btn.dataset.id);
      load();
    }));
    Utils.$all('[data-act="delete"]', tbody).forEach(btn => btn.addEventListener("click", async () => {
      if (!confirm("Delete this challenge?")) return;
      await supabase.from("daily_challenges").delete().eq("id", btn.dataset.id);
      Utils.toast("Challenge deleted.", "success");
      load();
    }));
  }

  function openModal(c) {
    Utils.$("#modal-title").textContent = c ? "Edit Challenge" : "+ Add Challenge";
    Utils.$("#f-id").value = c?.id || "";
    Utils.$("#f-title").value = c?.title || "";
    Utils.$("#f-desc").value = c?.description || "";
    Utils.$("#f-type").value = c?.challenge_type || "read_stories";
    Utils.$("#f-target").value = c?.target_value || 1;
    Utils.$("#f-reward").value = c?.points_reward || 20;
    Utils.$("#f-audience").value = c?.group_id ? "group" : "all";
    Utils.$("#group-field").style.display = c?.group_id ? "block" : "none";
    if (c?.group_id) Utils.$("#f-group").value = c.group_id;
    Utils.$("#f-start").value = c?.start_date || new Date().toISOString().slice(0, 10);
    Utils.$("#f-end").value = c?.end_date || "";
    Utils.$("#f-active").checked = c ? c.active : true;
    Utils.$("#challenge-status").textContent = "";
    modal.style.display = "flex";
  }

  Utils.$("#btn-add-challenge").addEventListener("click", () => openModal(null));
  Utils.$("#btn-cancel-challenge").addEventListener("click", () => modal.style.display = "none");
  Utils.$("#f-audience").addEventListener("change", (e) => {
    Utils.$("#group-field").style.display = e.target.value === "group" ? "block" : "none";
  });

  Utils.$("#challenge-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = Utils.$("#f-id").value;
    const audience = Utils.$("#f-audience").value;
    const payload = {
      title: Utils.$("#f-title").value.trim(),
      description: Utils.$("#f-desc").value.trim(),
      challenge_type: Utils.$("#f-type").value,
      target_value: parseInt(Utils.$("#f-target").value, 10),
      points_reward: parseInt(Utils.$("#f-reward").value, 10),
      group_id: audience === "group" ? Utils.$("#f-group").value : null,
      start_date: Utils.$("#f-start").value,
      end_date: Utils.$("#f-end").value || null,
      active: Utils.$("#f-active").checked
    };
    const statusEl = Utils.$("#challenge-status");
    statusEl.textContent = "Saving...";
    const { error } = id
      ? await supabase.from("daily_challenges").update(payload).eq("id", id)
      : await supabase.from("daily_challenges").insert(payload);
    if (error) { statusEl.textContent = "Couldn't save: " + error.message; statusEl.style.color = "var(--a-danger)"; return; }
    Utils.toast("Challenge saved.", "success");
    modal.style.display = "none";
    load();
  });

  await loadGroups();
  await load();
})();
