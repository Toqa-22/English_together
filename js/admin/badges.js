(async () => {
  const profile = await Auth.guard("admin");
  if (!profile) return;

  Utils.$("#logout-link").addEventListener("click", (e) => { e.preventDefault(); Auth.logout(); });
  Utils.$("#hamburger")?.addEventListener("click", () => Utils.$("#sidebar").classList.toggle("open"));

  const area = Utils.$("#badges-area");
  const modal = Utils.$("#badge-modal");

  async function load() {
    area.innerHTML = `<div class="loading-state"><div class="spinner"></div></div>`;
    const { data: badges, error } = await supabase.from("badges").select("*").order("created_at");
    if (error) { Utils.showError(area, "Couldn't load badges."); return; }
    if (!badges.length) { Utils.showEmpty(area, "🏆", "No badges yet."); return; }

    const { data: earnedCounts } = await supabase.from("student_badges").select("badge_id");
    const counts = {};
    (earnedCounts || []).forEach(e => counts[e.badge_id] = (counts[e.badge_id] || 0) + 1);

    area.innerHTML = badges.map(b => `
      <div class="overview-card anim-fade-slide-up">
        <div class="oc-icon">${b.icon || "🏆"}</div>
        <p style="font-weight:800; font-size:15px; margin:8px 0 2px;">${Utils.escapeHtml(b.name)}</p>
        <p style="font-size:12px; color:#8892a8; margin:0 0 8px;">${Utils.escapeHtml(b.description || "")}</p>
        <p style="font-size:12px; margin:0 0 10px;">Requirement: ${Utils.escapeHtml(b.requirement_type.replace("_", " "))} ≥ ${b.requirement_value}<br>Earned by ${counts[b.id] || 0} student(s)</p>
        <span class="badge-pill ${b.active ? "pill-success" : "pill-danger"}" style="margin-bottom:10px; display:inline-block;">${b.active ? "Active" : "Inactive"}</span>
        <div style="display:flex; gap:8px; margin-top:8px;">
          <button class="btn btn-secondary" style="padding:6px 10px; font-size:12px;" data-act="edit" data-id="${b.id}">Edit</button>
          <button class="btn btn-secondary" style="padding:6px 10px; font-size:12px;" data-act="toggle" data-id="${b.id}" data-active="${b.active}">${b.active ? "Disable" : "Enable"}</button>
        </div>
      </div>
    `).join("");

    Utils.$all('[data-act="edit"]', area).forEach(btn => btn.addEventListener("click", () => openModal(badges.find(b => b.id === btn.dataset.id))));
    Utils.$all('[data-act="toggle"]', area).forEach(btn => btn.addEventListener("click", async () => {
      await supabase.from("badges").update({ active: btn.dataset.active !== "true" }).eq("id", btn.dataset.id);
      load();
    }));
  }

  function openModal(b) {
    Utils.$("#modal-title").textContent = b ? "Edit Badge" : "+ Add Badge";
    Utils.$("#f-id").value = b?.id || "";
    Utils.$("#f-name").value = b?.name || "";
    Utils.$("#f-desc").value = b?.description || "";
    Utils.$("#f-icon").value = b?.icon || "";
    Utils.$("#f-req-type").value = b?.requirement_type || "stories_completed";
    Utils.$("#f-req-value").value = b?.requirement_value || 1;
    Utils.$("#f-active").checked = b ? b.active : true;
    Utils.$("#badge-status").textContent = "";
    modal.style.display = "flex";
  }

  Utils.$("#btn-add-badge").addEventListener("click", () => openModal(null));
  Utils.$("#btn-cancel-badge").addEventListener("click", () => modal.style.display = "none");

  Utils.$("#badge-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = Utils.$("#f-id").value;
    const payload = {
      name: Utils.$("#f-name").value.trim(),
      description: Utils.$("#f-desc").value.trim(),
      icon: Utils.$("#f-icon").value.trim() || "🏆",
      requirement_type: Utils.$("#f-req-type").value,
      requirement_value: parseInt(Utils.$("#f-req-value").value, 10),
      active: Utils.$("#f-active").checked
    };
    const statusEl = Utils.$("#badge-status");
    statusEl.textContent = "Saving...";
    const { error } = id
      ? await supabase.from("badges").update(payload).eq("id", id)
      : await supabase.from("badges").insert(payload);
    if (error) { statusEl.textContent = "Couldn't save: " + error.message; statusEl.style.color = "var(--a-danger)"; return; }
    Utils.toast("Badge saved.", "success");
    modal.style.display = "none";
    load();
  });

  load();
})();
