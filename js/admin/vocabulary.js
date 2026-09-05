(async () => {
  const profile = await Auth.guard("admin");
  if (!profile) return;

  Utils.$("#logout-link").addEventListener("click", (e) => { e.preventDefault(); Auth.logout(); });
  Utils.$("#hamburger")?.addEventListener("click", () => Utils.$("#sidebar").classList.toggle("open"));

  const tbody = Utils.$("#vocab-body");
  const modal = Utils.$("#word-modal");
  let allWords = [];
  let stories = [], listeningItems = [];

  async function loadOptions() {
    const [storiesRes, listeningRes] = await Promise.all([
      supabase.from("stories").select("id, title").order("title"),
      supabase.from("listening_activities").select("id, title").order("title")
    ]);
    stories = storiesRes.data || [];
    listeningItems = listeningRes.data || [];
    const storyOpts = stories.map(s => `<option value="${s.id}">${Utils.escapeHtml(s.title)}</option>`).join("");
    const listeningOpts = listeningItems.map(l => `<option value="${l.id}">${Utils.escapeHtml(l.title)}</option>`).join("");
    Utils.$("#f-story").innerHTML = `<option value="">— none —</option>` + storyOpts;
    Utils.$("#f-listening").innerHTML = `<option value="">— none —</option>` + listeningOpts;
    Utils.$("#filter-story").innerHTML = `<option value="">All Stories</option>` + storyOpts;
    Utils.$("#filter-listening").innerHTML = `<option value="">All Listening</option>` + listeningOpts;
  }

  async function load() {
    tbody.innerHTML = `<tr><td colspan="7"><div class="loading-state"><div class="spinner"></div></div></td></tr>`;
    const { data, error } = await supabase.from("vocabulary").select("*, stories(title), listening_activities(title)").order("created_at", { ascending: false });
    if (error) { Utils.showError(tbody, "Couldn't load vocabulary."); return; }
    allWords = data || [];
    applyFilters();
  }

  function applyFilters() {
    const term = Utils.$("#search-input").value.trim().toLowerCase();
    const storyFilter = Utils.$("#filter-story").value;
    const listeningFilter = Utils.$("#filter-listening").value;
    const statusFilter = Utils.$("#filter-status").value;
    let list = allWords;
    if (term) list = list.filter(v => v.word.toLowerCase().includes(term) || (v.arabic_meaning || "").includes(term));
    if (storyFilter) list = list.filter(v => v.story_id === storyFilter);
    if (listeningFilter) list = list.filter(v => v.listening_id === listeningFilter);
    if (statusFilter) list = list.filter(v => (statusFilter === "active") === v.active);
    render(list);
  }

  function render(list) {
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">📖</div><p>No vocabulary words found.</p></div></td></tr>`;
      return;
    }
    tbody.innerHTML = list.map(v => {
      const belongsTo = [v.stories?.title, v.listening_activities?.title].filter(Boolean).join(" + ") || "— standalone —";
      return `
        <tr>
          <td><strong>${Utils.escapeHtml(v.word)}</strong></td>
          <td dir="rtl">${Utils.escapeHtml(v.arabic_meaning || "")}</td>
          <td>${Utils.escapeHtml(belongsTo)}</td>
          <td>${Utils.escapeHtml(v.difficulty || "-")}</td>
          <td>${Utils.escapeHtml(v.category || "-")}</td>
          <td><span class="badge-pill ${v.active ? "pill-success" : "pill-danger"}">${v.active ? "Active" : "Inactive"}</span></td>
          <td style="display:flex; gap:6px; flex-wrap:wrap;">
            <button class="btn btn-secondary" style="padding:6px 10px; font-size:12px;" data-act="edit" data-id="${v.id}">Edit</button>
            <button class="btn btn-secondary" style="padding:6px 10px; font-size:12px;" data-act="toggle" data-id="${v.id}" data-active="${v.active}">${v.active ? "Deactivate" : "Activate"}</button>
            <button class="btn btn-secondary" style="padding:6px 10px; font-size:12px; color:var(--a-danger); border-color:var(--a-danger);" data-act="delete" data-id="${v.id}">Delete</button>
          </td>
        </tr>`;
    }).join("");

    Utils.$all('[data-act="edit"]', tbody).forEach(btn => btn.addEventListener("click", () => openModal(allWords.find(v => v.id === btn.dataset.id))));
    Utils.$all('[data-act="toggle"]', tbody).forEach(btn => btn.addEventListener("click", async () => {
      await supabase.from("vocabulary").update({ active: btn.dataset.active !== "true" }).eq("id", btn.dataset.id);
      load();
    }));
    Utils.$all('[data-act="delete"]', tbody).forEach(btn => btn.addEventListener("click", async () => {
      if (!confirm("Delete this vocabulary word? This removes all student progress on it too.")) return;
      await supabase.from("vocabulary").delete().eq("id", btn.dataset.id);
      Utils.toast("Deleted.", "success");
      load();
    }));
  }

  function updatePreview() {
    const v = {
      word: Utils.$("#f-word").value || "word",
      arabic_meaning: Utils.$("#f-arabic").value || "المعنى بالعربية",
      example_sentence: Utils.$("#f-example").value
    };
    Utils.$("#preview-wrap").innerHTML = VocabCard.cardHTML(v);
    VocabCard.wireCard(Utils.$("#preview-wrap"));
  }
  ["f-word", "f-arabic", "f-example"].forEach(id => Utils.$("#" + id).addEventListener("input", updatePreview));

  function openModal(v) {
    Utils.$("#modal-title").textContent = v ? "Edit Word" : "+ Add Word";
    Utils.$("#f-id").value = v?.id || "";
    Utils.$("#f-word").value = v?.word || "";
    Utils.$("#f-arabic").value = v?.arabic_meaning || "";
    Utils.$("#f-definition").value = v?.definition || "";
    Utils.$("#f-example").value = v?.example_sentence || "";
    Utils.$("#f-difficulty").value = v?.difficulty || "easy";
    Utils.$("#f-category").value = v?.category || "";
    Utils.$("#f-story").value = v?.story_id || "";
    Utils.$("#f-listening").value = v?.listening_id || "";
    Utils.$("#f-active").checked = v ? v.active : true;
    Utils.$("#word-status").textContent = "";
    updatePreview();
    modal.style.display = "flex";
  }

  Utils.$("#btn-add-word").addEventListener("click", () => openModal(null));
  Utils.$("#btn-cancel-word").addEventListener("click", () => modal.style.display = "none");

  Utils.$("#word-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = Utils.$("#f-id").value;
    const payload = {
      word: Utils.$("#f-word").value.trim(),
      arabic_meaning: Utils.$("#f-arabic").value.trim(),
      definition: Utils.$("#f-definition").value.trim() || null,
      example_sentence: Utils.$("#f-example").value.trim(),
      difficulty: Utils.$("#f-difficulty").value,
      category: Utils.$("#f-category").value.trim() || null,
      story_id: Utils.$("#f-story").value || null,
      listening_id: Utils.$("#f-listening").value || null,
      active: Utils.$("#f-active").checked
    };
    const statusEl = Utils.$("#word-status");
    statusEl.textContent = "Saving...";
    const { error } = id
      ? await supabase.from("vocabulary").update(payload).eq("id", id)
      : await supabase.from("vocabulary").insert(payload);
    if (error) { statusEl.textContent = "Couldn't save: " + error.message; statusEl.style.color = "var(--a-danger)"; return; }
    Utils.toast("Word saved.", "success");
    modal.style.display = "none";
    load();
  });

  Utils.$("#search-input").addEventListener("input", Utils.debounce(applyFilters, 200));
  Utils.$("#filter-story").addEventListener("change", applyFilters);
  Utils.$("#filter-listening").addEventListener("change", applyFilters);
  Utils.$("#filter-status").addEventListener("change", applyFilters);

  await loadOptions();
  await load();
})();
