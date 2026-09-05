(async () => {
  const profile = await Auth.guard("admin");
  if (!profile) return;

  Utils.$("#logout-link").addEventListener("click", (e) => { e.preventDefault(); Auth.logout(); });
  Utils.$("#hamburger")?.addEventListener("click", () => Utils.$("#sidebar").classList.toggle("open"));

  const tbody = Utils.$("#history-body");
  let allTests = [];

  const { data: groups } = await supabase.from("groups").select("id, name").order("name");
  Utils.$("#filter-group").innerHTML = `<option value="">All Groups</option>` +
    (groups || []).map(g => `<option value="${g.id}">${Utils.escapeHtml(g.name)}</option>`).join("");

  async function load() {
    tbody.innerHTML = `<tr><td colspan="7"><div class="loading-state"><div class="spinner"></div></div></td></tr>`;
    // No .eq("active", ...) filter at all here — this page deliberately shows
    // every test ever created, active or archived, since archiving must never
    // make a test (or its students' marks) disappear from admin's view.
    const { data, error } = await supabase
      .from("tests")
      .select("*, groups(name), test_attempts(id, percentage)")
      .order("created_at", { ascending: false });
    if (error) { Utils.showError(tbody, "Couldn't load test history: " + error.message); return; }
    allTests = data || [];
    applyFilters();
  }

  function applyFilters() {
    const groupFilter = Utils.$("#filter-group").value;
    const statusFilter = Utils.$("#filter-status").value;
    let list = allTests;
    if (groupFilter) list = list.filter(t => t.group_id === groupFilter);
    if (statusFilter) list = list.filter(t => (statusFilter === "active") === t.active);
    render(list);
  }

  function render(list) {
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">🗂️</div><p>No tests found.</p></div></td></tr>`;
      return;
    }
    tbody.innerHTML = list.map(t => {
      const attempts = t.test_attempts || [];
      const avg = attempts.length ? Math.round(attempts.reduce((s, a) => s + Number(a.percentage), 0) / attempts.length) : null;
      return `
        <tr>
          <td>📝 ${Utils.escapeHtml(t.title)}</td>
          <td>${Utils.escapeHtml(t.groups?.name || "-")}</td>
          <td><span class="badge-pill ${t.active ? "pill-success" : "pill-danger"}">${t.active ? "Active" : "Archived"}</span></td>
          <td>${attempts.length}</td>
          <td>${avg === null ? "-" : avg + "%"}</td>
          <td>${Utils.formatDate(t.created_at)}</td>
          <td><button class="btn btn-secondary" style="padding:6px 10px; font-size:12px;" data-act="marks" data-id="${t.id}" data-title="${Utils.escapeHtml(t.title)}">View Marks</button></td>
        </tr>`;
    }).join("");

    Utils.$all('[data-act="marks"]', tbody).forEach(btn => {
      btn.addEventListener("click", () => loadMarks(btn.dataset.id, btn.dataset.title));
    });
  }

  async function loadMarks(testId, title) {
    const panel = Utils.$("#marks-panel");
    const marksBody = Utils.$("#marks-body");
    Utils.$("#marks-test-title").textContent = title;
    panel.style.display = "block";
    marksBody.innerHTML = `<tr><td colspan="4"><div class="loading-state"><div class="spinner"></div></div></td></tr>`;
    panel.scrollIntoView({ behavior: "smooth" });

    const { data, error } = await supabase
      .from("test_attempts")
      .select("*, profiles(full_name, username)")
      .eq("test_id", testId)
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false });
    if (error) { marksBody.innerHTML = `<tr><td colspan="4">Couldn't load marks: ${error.message}</td></tr>`; return; }
    if (!data.length) { marksBody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="empty-icon">📊</div><p>No completed attempts yet.</p></div></td></tr>`; return; }

    marksBody.innerHTML = data.map(a => `
      <tr>
        <td>${Utils.escapeHtml(a.profiles?.full_name || "-")} <span style="color:#b9c0d6; font-size:12px;">@${Utils.escapeHtml(a.profiles?.username || "")}</span></td>
        <td>⭐ ${a.total_score}/${a.total_possible}</td>
        <td>${Math.round(a.percentage)}%</td>
        <td>${Utils.formatDate(a.completed_at)}</td>
      </tr>
    `).join("");
  }

  Utils.$("#filter-group").addEventListener("change", applyFilters);
  Utils.$("#filter-status").addEventListener("change", applyFilters);

  load();
})();
