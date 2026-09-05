(async () => {
  const profile = await Auth.guard("admin");
  if (!profile) return;

  Utils.$("#logout-link").addEventListener("click", (e) => { e.preventDefault(); Auth.logout(); });
  Utils.$("#hamburger")?.addEventListener("click", () => Utils.$("#sidebar").classList.toggle("open"));

  const tbody = Utils.$("#listening-body");
  let allItems = [];

  async function load() {
    tbody.innerHTML = `<tr><td colspan="7"><div class="loading-state"><div class="spinner"></div></div></td></tr>`;
    const { data, error } = await supabase
      .from("listening_activities")
      .select("*, listening_questions(id, points)")
      .order("created_at", { ascending: false });
    if (error) { Utils.showError(tbody, "Couldn't load listening activities."); return; }
    allItems = data || [];
    render(allItems);
  }

  function render(list) {
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">🎧</div><p>No listening activities yet. Click "Add Listening" to create one.</p></div></td></tr>`;
      return;
    }
    tbody.innerHTML = list.map(item => {
      const totalPoints = (item.listening_questions || []).reduce((sum, q) => sum + (q.points || 0), 0);
      return `
      <tr>
        <td>🎧 ${Utils.escapeHtml(item.title)}</td>
        <td>${Utils.escapeHtml(item.difficulty || "-")}</td>
        <td>${item.estimated_minutes} min</td>
        <td>⭐ ${totalPoints}</td>
        <td>${item.listening_questions?.length || 0}</td>
        <td><span class="badge-pill ${item.active ? "pill-success" : "pill-danger"}">${item.active ? "Active" : "Inactive"}</span></td>
        <td style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="btn btn-secondary" style="padding:6px 10px; font-size:12px;" onclick="location.href='listening-editor.html?id=${item.id}'">Edit</button>
          <button class="btn btn-secondary" style="padding:6px 10px; font-size:12px;" onclick="location.href='listening-questions.html?listening=${item.id}'">Questions</button>
          <button class="btn btn-secondary" style="padding:6px 10px; font-size:12px;" data-act="duplicate" data-id="${item.id}">Duplicate</button>
          <button class="btn btn-secondary" style="padding:6px 10px; font-size:12px;" data-act="toggle" data-id="${item.id}" data-active="${item.active}">${item.active ? "Deactivate" : "Activate"}</button>
          <button class="btn btn-secondary" style="padding:6px 10px; font-size:12px; color:var(--a-danger); border-color:var(--a-danger);" data-act="delete" data-id="${item.id}">Delete</button>
        </td>
      </tr>
    `;
    }).join("");

    Utils.$all("[data-act='toggle']", tbody).forEach(btn => btn.addEventListener("click", () => toggleActive(btn.dataset.id, btn.dataset.active === "true")));
    Utils.$all("[data-act='delete']", tbody).forEach(btn => btn.addEventListener("click", () => remove(btn.dataset.id)));
    Utils.$all("[data-act='duplicate']", tbody).forEach(btn => btn.addEventListener("click", () => duplicate(btn.dataset.id)));
  }

  async function toggleActive(id, currentlyActive) {
    const { error } = await supabase.from("listening_activities").update({ active: !currentlyActive }).eq("id", id);
    if (error) { Utils.toast("Couldn't update.", "error"); return; }
    Utils.toast(currentlyActive ? "Deactivated." : "Activated.", "success");
    load();
  }

  async function remove(id) {
    if (!confirm("Delete this listening activity permanently? This also removes its questions and assignments.")) return;
    const { error } = await supabase.from("listening_activities").delete().eq("id", id);
    if (error) { Utils.toast("Couldn't delete.", "error"); return; }
    Utils.toast("Deleted.", "success");
    load();
  }

  async function duplicate(id) {
    const original = allItems.find(i => i.id === id);
    if (!original) return;
    const { data: newItem, error } = await supabase.from("listening_activities").insert({
      title: original.title + " (Copy)",
      description: original.description,
      youtube_video_id: original.youtube_video_id,
      thumbnail_url: original.thumbnail_url,
      difficulty: original.difficulty,
      estimated_minutes: original.estimated_minutes,
      active: false,
      created_by: profile.id
    }).select().single();
    if (error) { Utils.toast("Couldn't duplicate: " + error.message, "error"); return; }

    const { data: qs } = await supabase.from("listening_questions").select("*").eq("listening_id", id);
    if (qs && qs.length) {
      await supabase.from("listening_questions").insert(qs.map(q => ({
        listening_id: newItem.id, question_text: q.question_text, question_type: q.question_type,
        category: q.category, options: q.options, correct_answer: q.correct_answer, points: q.points, order_number: q.order_number
      })));
    }
    Utils.toast("Duplicated.", "success");
    load();
  }

  Utils.$("#search-input").addEventListener("input", Utils.debounce((e) => {
    const term = e.target.value.trim().toLowerCase();
    render(term ? allItems.filter(i => i.title.toLowerCase().includes(term)) : allItems);
  }, 200));

  load();
})();
