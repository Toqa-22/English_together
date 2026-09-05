(async () => {
  const profile = await Auth.guard("admin");
  if (!profile) return;

  Utils.$("#logout-link").addEventListener("click", (e) => { e.preventDefault(); Auth.logout(); });
  Utils.$("#hamburger")?.addEventListener("click", () => Utils.$("#sidebar").classList.toggle("open"));

  const tbody = Utils.$("#students-body");
  let allStudents = [];
  let groups = [];

  async function loadGroups() {
    const { data } = await supabase.from("groups").select("*").order("name");
    groups = data || [];
    const filterSel = Utils.$("#filter-group");
    const formSel = Utils.$("#f-group");
    filterSel.innerHTML = `<option value="">All Groups</option>` + groups.map(g => `<option value="${g.id}">${Utils.escapeHtml(g.name)}</option>`).join("");
    formSel.innerHTML = groups.map(g => `<option value="${g.id}">${Utils.escapeHtml(g.name)}</option>`).join("");
  }

  async function load() {
    tbody.innerHTML = `<tr><td colspan="8"><div class="loading-state"><div class="spinner"></div></div></td></tr>`;
    const { data: students, error } = await supabase
      .from("profiles")
      .select("*, groups(name)")
      .eq("role", "student")
      .order("created_at", { ascending: false });
    if (error) { Utils.showError(tbody, "Couldn't load students."); return; }

    const { data: attempts } = await supabase.from("student_attempts").select("student_id, percentage, completed_at").not("completed_at", "is", null);
    const { data: points } = await supabase.from("points_transactions").select("student_id, points");

    const statsByStudent = {};
    (attempts || []).forEach(a => {
      statsByStudent[a.student_id] = statsByStudent[a.student_id] || { completed: 0, scores: [] };
      statsByStudent[a.student_id].completed++;
      statsByStudent[a.student_id].scores.push(Number(a.percentage));
    });
    const pointsByStudent = {};
    (points || []).forEach(p => { pointsByStudent[p.student_id] = (pointsByStudent[p.student_id] || 0) + p.points; });

    allStudents = (students || []).map(s => {
      const stats = statsByStudent[s.id] || { completed: 0, scores: [] };
      const avg = stats.scores.length ? Math.round(stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length) : 0;
      return { ...s, completed: stats.completed, avgScore: avg, points: pointsByStudent[s.id] || 0 };
    });
    applyFilters();
  }

  function applyFilters() {
    const term = Utils.$("#search-input").value.trim().toLowerCase();
    const groupFilter = Utils.$("#filter-group").value;
    const statusFilter = Utils.$("#filter-status").value;
    let list = allStudents;
    if (term) list = list.filter(s => s.full_name.toLowerCase().includes(term) || s.username.toLowerCase().includes(term));
    if (groupFilter) list = list.filter(s => s.group_id === groupFilter);
    if (statusFilter) list = list.filter(s => (statusFilter === "active") === s.active);
    render(list);
  }

  function render(list) {
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">👨‍🎓</div><p>No students found.</p></div></td></tr>`;
      return;
    }
    tbody.innerHTML = list.map(s => `
      <tr>
        <td>${Utils.escapeHtml(s.full_name)}</td>
        <td>${Utils.escapeHtml(s.username)}</td>
        <td>
          <select data-act="group" data-id="${s.id}" style="padding:4px 6px; border-radius:6px; border:1px solid #e5e8f5; font-size:12px;">
            <option value="">-- none --</option>
            ${groups.map(g => `<option value="${g.id}" ${g.id === s.group_id ? "selected" : ""}>${Utils.escapeHtml(g.name)}</option>`).join("")}
          </select>
        </td>
        <td>${s.completed}</td>
        <td>${s.avgScore}%</td>
        <td>⭐ ${s.points}</td>
        <td><span class="badge-pill ${s.active ? "pill-success" : "pill-danger"}">${s.active ? "Active" : "Inactive"}</span></td>
        <td style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="btn btn-secondary" style="padding:6px 10px; font-size:12px;" onclick="location.href='student-details.html?id=${s.id}'">View</button>
          <button class="btn btn-secondary" style="padding:6px 10px; font-size:12px;" data-act="toggle-active" data-id="${s.id}" data-active="${s.active}">${s.active ? "Deactivate" : "Activate"}</button>
          <button class="btn btn-secondary" style="padding:6px 10px; font-size:12px;" data-act="reset-password" data-id="${s.id}" data-username="${Utils.escapeHtml(s.username)}">Reset Password</button>
        </td>
      </tr>
    `).join("");

    Utils.$all('[data-act="group"]', tbody).forEach(sel => {
      sel.addEventListener("change", async () => {
        const { error } = await supabase.from("profiles").update({ group_id: sel.value || null }).eq("id", sel.dataset.id);
        if (error) { Utils.toast("Couldn't update group.", "error"); return; }
        Utils.toast("Group updated.", "success");
        load();
      });
    });
    Utils.$all('[data-act="toggle-active"]', tbody).forEach(btn => {
      btn.addEventListener("click", async () => {
        const currentlyActive = btn.dataset.active === "true";
        const { error } = await supabase.from("profiles").update({ active: !currentlyActive }).eq("id", btn.dataset.id);
        if (error) { Utils.toast("Couldn't update status.", "error"); return; }
        Utils.toast(currentlyActive ? "Student deactivated." : "Student activated.", "success");
        load();
      });
    });
    Utils.$all('[data-act="reset-password"]', tbody).forEach(btn => {
      btn.addEventListener("click", async () => {
        const newPw = prompt(`New password for "${btn.dataset.username}" (min 6 characters):`, "123456");
        if (newPw === null) return;
        if (newPw.length < 6) { Utils.toast("Password must be at least 6 characters.", "error"); return; }
        const { error } = await supabase.rpc("admin_reset_password", { p_profile_id: btn.dataset.id, p_new_password: newPw });
        if (error) { Utils.toast("Couldn't reset password.", "error"); return; }
        Utils.toast(`Password reset for "${btn.dataset.username}".`, "success");
      });
    });
  }

  Utils.$("#search-input").addEventListener("input", Utils.debounce(applyFilters, 200));
  Utils.$("#filter-group").addEventListener("change", applyFilters);
  Utils.$("#filter-status").addEventListener("change", applyFilters);

  // ---------- Add Student modal ----------
  const modal = Utils.$("#add-modal");
  Utils.$("#btn-add-student").addEventListener("click", () => { modal.style.display = "flex"; });
  Utils.$("#btn-cancel-add").addEventListener("click", () => { modal.style.display = "none"; });

  Utils.$("#add-student-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const statusEl = Utils.$("#add-status");
    const fullName = Utils.$("#f-full-name").value.trim();
    const username = Utils.$("#f-username").value.trim();
    const password = Utils.$("#f-password").value;
    const groupId = Utils.$("#f-group").value;

    if (!username || !fullName || password.length < 6) {
      statusEl.textContent = "Please fill all fields (password min 6 characters).";
      statusEl.style.color = "var(--a-danger)";
      return;
    }

    statusEl.style.color = "#8892a8";
    statusEl.textContent = "Creating account...";

    const { error } = await supabase.rpc("admin_create_student", {
      p_username: username, p_password: password, p_full_name: fullName, p_group_id: groupId || null
    });

    if (error) {
      statusEl.textContent = "Couldn't create student: " + (error.message || "unknown error");
      statusEl.style.color = "var(--a-danger)";
      return;
    }

    statusEl.textContent = "Student created.";
    Utils.toast(`Student "${username}" created.`, "success");
    modal.style.display = "none";
    Utils.$("#add-student-form").reset();
    Utils.$("#f-password").value = "123456";
    load();
  });

  await loadGroups();
  await load();
})();
