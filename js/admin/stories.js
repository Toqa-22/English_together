(async () => {
  const profile = await Auth.guard("admin");
  if (!profile) return;

  Utils.$("#logout-link").addEventListener("click", (e) => { e.preventDefault(); Auth.logout(); });
  Utils.$("#hamburger")?.addEventListener("click", () => Utils.$("#sidebar").classList.toggle("open"));

  const tbody = Utils.$("#stories-body");
  let allStories = [];

  async function load() {
    tbody.innerHTML = `<tr><td colspan="7"><div class="loading-state"><div class="spinner"></div></div></td></tr>`;
    const { data: stories, error } = await supabase
      .from("stories")
      .select("*, questions(id), story_assignments(groups(name))")
      .order("created_at", { ascending: false });

    if (error) { Utils.showError(tbody, "Couldn't load stories."); return; }
    allStories = stories || [];
    render(allStories);
  }

  function render(list) {
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">📚</div><p>No stories yet. Click "Add Story" to create one.</p></div></td></tr>`;
      return;
    }
    tbody.innerHTML = list.map(s => {
      const groupNames = (s.story_assignments || []).map(a => a.groups?.name).filter(Boolean).join(", ") || "— none —";
      return `
      <tr>
        <td>${s.emoji || "📖"} ${Utils.escapeHtml(s.title)}</td>
        <td>${Utils.escapeHtml(groupNames)}</td>
        <td>${Utils.escapeHtml(s.difficulty || "-")}</td>
        <td>${s.questions?.length || 0}</td>
        <td><span class="badge-pill ${s.active ? "pill-success" : "pill-danger"}">${s.active ? "Active" : "Locked"}</span></td>
        <td>${Utils.formatDate(s.created_at)}</td>
        <td style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="btn btn-secondary" style="padding:6px 10px; font-size:12px;" onclick="location.href='story-editor.html?id=${s.id}'">Edit</button>
          <button class="btn btn-secondary" style="padding:6px 10px; font-size:12px;" onclick="location.href='questions.html?story=${s.id}'">Questions</button>
          <button class="btn btn-secondary" style="padding:6px 10px; font-size:12px;" data-action="duplicate" data-id="${s.id}">Duplicate</button>
          <button class="btn btn-secondary" style="padding:6px 10px; font-size:12px;" data-action="toggle" data-id="${s.id}" data-active="${s.active}">${s.active ? "Lock" : "Unlock"}</button>
          <button class="btn btn-secondary" style="padding:6px 10px; font-size:12px; color:var(--a-danger); border-color:var(--a-danger);" data-action="delete" data-id="${s.id}">Delete</button>
        </td>
      </tr>
    `;
    }).join("");

    Utils.$all("[data-action='toggle']", tbody).forEach(btn => btn.addEventListener("click", () => toggleActive(btn.dataset.id, btn.dataset.active === "true")));
    Utils.$all("[data-action='delete']", tbody).forEach(btn => btn.addEventListener("click", () => remove(btn.dataset.id)));
    Utils.$all("[data-action='duplicate']", tbody).forEach(btn => btn.addEventListener("click", () => duplicate(btn.dataset.id)));
  }

  async function toggleActive(id, currentlyActive) {
    const { error } = await supabase.from("stories").update({ active: !currentlyActive }).eq("id", id);
    if (error) { Utils.toast("Couldn't update story.", "error"); return; }
    Utils.toast(currentlyActive ? "Story locked." : "Story unlocked.", "success");
    load();
  }

  async function remove(id) {
    if (!confirm("Delete this story permanently? This also removes its questions, vocabulary, and assignments.")) return;
    const { error } = await supabase.from("stories").delete().eq("id", id);
    if (error) { Utils.toast("Couldn't delete story.", "error"); return; }
    Utils.toast("Story deleted.", "success");
    load();
  }

  async function duplicate(id) {
    const original = allStories.find(s => s.id === id);
    if (!original) return;
    const { data: newStory, error } = await supabase.from("stories").insert({
      title: original.title + " (Copy)",
      description: original.description,
      content: original.content,
      difficulty: original.difficulty,
      estimated_minutes: original.estimated_minutes,
      emoji: original.emoji,
      active: false,
      created_by: profile.id
    }).select().single();
    if (error) { Utils.toast("Couldn't duplicate story.", "error"); return; }

    const { data: qs } = await supabase.from("questions").select("*").eq("story_id", id);
    if (qs && qs.length) {
      await supabase.from("questions").insert(qs.map(q => ({
        story_id: newStory.id, question_text: q.question_text, question_type: q.question_type,
        category: q.category, options: q.options, correct_answer: q.correct_answer, points: q.points, order_number: q.order_number
      })));
    }
    Utils.toast("Story duplicated.", "success");
    load();
  }

  Utils.$("#search-input").addEventListener("input", Utils.debounce((e) => {
    const term = e.target.value.trim().toLowerCase();
    render(term ? allStories.filter(s => s.title.toLowerCase().includes(term)) : allStories);
  }, 200));

  load();
})();
