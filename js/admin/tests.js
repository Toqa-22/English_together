(async () => {
  const profile = await Auth.guard("admin");
  if (!profile) return;

  Utils.$("#logout-link").addEventListener("click", (e) => { e.preventDefault(); Auth.logout(); });
  Utils.$("#hamburger")?.addEventListener("click", () => Utils.$("#sidebar").classList.toggle("open"));

  const area = Utils.$("#tests-area");

  async function load() {
    area.innerHTML = `<div class="loading-state"><div class="spinner"></div></div>`;
    const [{ data: groups, error: gErr }, { data: activeTests, error: tErr }] = await Promise.all([
      supabase.from("groups").select("id, name, icon, color").order("name"),
      supabase.from("tests").select("*, test_reading_questions(id), test_listening_questions(id), test_vocabulary_items(id)").eq("active", true)
    ]);
    if (gErr || tErr) { Utils.showError(area, "Couldn't load tests."); return; }
    if (!groups || !groups.length) { Utils.showEmpty(area, "👥", "No groups yet — create one under Admin → Groups first."); return; }

    const testByGroup = Object.fromEntries((activeTests || []).map(t => [t.group_id, t]));

    area.innerHTML = groups.map(g => {
      const test = testByGroup[g.id];
      if (!test) {
        return `
          <div class="overview-card anim-fade-slide-up" style="border-top:4px solid ${g.color};">
            <div class="oc-icon">${g.icon || "👥"}</div>
            <p style="font-weight:800; font-size:16px; margin:8px 0 2px;">${Utils.escapeHtml(g.name)}</p>
            <p style="font-size:13px; color:#8892a8; margin:0 0 12px;">No test yet</p>
            <button class="btn btn-primary" style="padding:8px 14px; font-size:13px;" onclick="location.href='test-editor.html?group=${g.id}'">+ Create Test</button>
          </div>`;
      }
      const rCount = test.test_reading_questions?.length || 0;
      const lCount = test.test_listening_questions?.length || 0;
      const vCount = test.test_vocabulary_items?.length || 0;
      return `
        <div class="overview-card anim-fade-slide-up" style="border-top:4px solid ${g.color};">
          <div class="oc-icon">${g.icon || "👥"}</div>
          <p style="font-weight:800; font-size:16px; margin:8px 0 2px;">${Utils.escapeHtml(g.name)}</p>
          <p style="font-size:14px; margin:0 0 6px;">📝 ${Utils.escapeHtml(test.title)}</p>
          <p style="font-size:12px; color:#8892a8; margin:0 0 8px;">📖 ${rCount} reading · 🎧 ${lCount} listening · 🖼️ ${vCount}/10 vocabulary</p>
          <span class="badge-pill ${test.available ? "pill-success" : "pill-danger"}" style="margin-bottom:10px; display:inline-block;">${test.available ? "🔓 Available" : "🔒 Locked"}</span>
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:6px;">
            <button class="btn btn-secondary" style="padding:8px 14px; font-size:13px;" onclick="location.href='test-editor.html?id=${test.id}'">Edit</button>
            <button class="btn btn-secondary" style="padding:8px 14px; font-size:13px;" data-act="toggle-lock" data-id="${test.id}" data-available="${test.available}">${test.available ? "🔒 Lock" : "🔓 Unlock"}</button>
            <button class="btn btn-secondary" style="padding:8px 14px; font-size:13px; color:var(--a-danger); border-color:var(--a-danger);" data-act="archive" data-id="${test.id}">Archive</button>
          </div>
        </div>`;
    }).join("");

    Utils.$all('[data-act="toggle-lock"]', area).forEach(btn => {
      btn.addEventListener("click", async () => {
        const currentlyAvailable = btn.dataset.available === "true";
        const { error } = await supabase.from("tests").update({ available: !currentlyAvailable }).eq("id", btn.dataset.id);
        if (error) { Utils.toast("Couldn't update.", "error"); return; }
        Utils.toast(currentlyAvailable ? "Test locked." : "Test unlocked.", "success");
        load();
      });
    });

    Utils.$all('[data-act="archive"]', area).forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("Archive this test? Students will no longer see it, but every score already recorded stays on file. You'll be able to create a new test for this group right after.")) return;
        const testId = btn.dataset.id;

        // Delete the actual image files from Storage first — the RPC only clears
        // the database reference, it can't reach into Storage from SQL.
        try {
          const { data: items } = await supabase.from("test_vocabulary_items").select("image_url").eq("test_id", testId);
          const paths = (items || [])
            .map(i => i.image_url)
            .filter(Boolean)
            .map(url => {
              const marker = "/test-images/";
              const idx = url.indexOf(marker);
              return idx === -1 ? null : url.slice(idx + marker.length);
            })
            .filter(Boolean);
          if (paths.length) await supabase.storage.from("test-images").remove(paths);
        } catch (err) {
          console.error("Image cleanup failed (continuing to archive anyway):", err);
        }

        const { error } = await supabase.rpc("archive_test", { p_test_id: testId });
        if (error) { Utils.toast("Couldn't archive: " + error.message, "error"); return; }
        Utils.toast("Test archived.", "success");
        load();
      });
    });
  }

  load();
})();
