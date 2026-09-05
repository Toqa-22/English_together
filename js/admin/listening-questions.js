(async () => {
  const profile = await Auth.guard("admin");
  if (!profile) return;

  Utils.$("#logout-link").addEventListener("click", (e) => { e.preventDefault(); Auth.logout(); });
  Utils.$("#hamburger")?.addEventListener("click", () => Utils.$("#sidebar").classList.toggle("open"));

  const params = new URLSearchParams(location.search);
  const listeningId = params.get("listening");
  const listEl = Utils.$("#questions-list");

  if (!listeningId) { Utils.toast("No listening activity selected.", "error"); location.href = "listening.html"; return; }

  const { data: item } = await supabase.from("listening_activities").select("title").eq("id", listeningId).maybeSingle();
  if (item) Utils.$("#page-title").textContent = `Listening Questions — ${item.title}`;

  let questions = [];

  async function load() {
    const { data, error } = await supabase.from("listening_questions").select("*").eq("listening_id", listeningId).order("order_number");
    if (error) { Utils.showError(listEl, "Couldn't load questions."); return; }
    questions = data || [];
    render();
  }

  function render() {
    if (!questions.length) {
      Utils.showEmpty(listEl, "📝", 'No questions yet. Click "Add Question" below to create one.');
      return;
    }
    listEl.innerHTML = questions.map((q, i) => questionCard(q, i)).join("");
    questions.forEach(q => wireCard(q));
  }

  function questionCard(q, idx) {
    const isTF = q.question_type === "true_false";
    const opts = q.options || { A: "", B: "", C: "", D: "" };
    return `
      <div class="card q-editor-card" data-id="${q.id}">
        <div class="q-editor-row">
          <div class="reorder-col">
            <button data-act="up" ${idx === 0 ? "disabled" : ""}>▲</button>
            <button data-act="down" ${idx === questions.length - 1 ? "disabled" : ""}>▼</button>
          </div>
          <div style="flex:1;">
            <div class="q-field" style="margin-bottom:8px;">
              <label>Question ${idx + 1}</label>
              <input type="text" class="f-text" value="${Utils.escapeHtml(q.question_text)}">
            </div>
            <div style="display:flex; gap:10px;">
              <div class="q-field" style="flex:1;">
                <label>Type</label>
                <select class="f-type">
                  <option value="multiple_choice" ${!isTF ? "selected" : ""}>Multiple Choice</option>
                  <option value="true_false" ${isTF ? "selected" : ""}>True / False</option>
                </select>
              </div>
              <div class="q-field" style="flex:1;">
                <label>Category</label>
                <select class="f-category">
                  ${["main_idea","details","vocabulary","inference","true_false","sequence"].map(c =>
                    `<option value="${c}" ${q.category === c ? "selected" : ""}>${c.replace("_"," ")}</option>`).join("")}
                </select>
              </div>
              <div class="q-field" style="max-width:110px;">
                <label>Points</label>
                <input type="number" class="f-points" min="1" value="${q.points ?? 10}">
              </div>
            </div>
            <div class="mc-block" style="display:${isTF ? "none" : "block"};">
              <div class="q-opts-grid">
                ${["A","B","C","D"].map(k => `
                  <div class="q-field">
                    <label>Option ${k}</label>
                    <input type="text" class="f-opt" data-key="${k}" value="${Utils.escapeHtml(opts[k] || "")}">
                  </div>`).join("")}
              </div>
              <div class="q-field" style="margin-top:8px; max-width:160px;">
                <label>Correct Option</label>
                <select class="f-correct-mc">
                  ${["A","B","C","D"].map(k => `<option value="${k}" ${q.correct_answer === k ? "selected" : ""}>${k}</option>`).join("")}
                </select>
              </div>
            </div>
            <div class="tf-block" style="display:${isTF ? "block" : "none"};">
              <div class="correct-marker">
                <label><input type="radio" name="tf-${q.id}" class="f-correct-tf" value="true" ${q.correct_answer === true ? "checked" : ""}> True is correct</label>
                <label><input type="radio" name="tf-${q.id}" class="f-correct-tf" value="false" ${q.correct_answer === false ? "checked" : ""}> False is correct</label>
              </div>
            </div>
            <div style="margin-top:12px; display:flex; gap:10px;">
              <button class="btn btn-primary" style="padding:8px 16px; font-size:13px;" data-act="save">Save</button>
              <button class="btn btn-secondary" style="padding:8px 16px; font-size:13px; color:var(--a-danger); border-color:var(--a-danger);" data-act="delete">Delete</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  function wireCard(q) {
    const card = listEl.querySelector(`[data-id="${q.id}"]`);
    if (!card) return;

    const typeSelect = card.querySelector(".f-type");
    typeSelect.addEventListener("change", () => {
      const isTF = typeSelect.value === "true_false";
      card.querySelector(".mc-block").style.display = isTF ? "none" : "block";
      card.querySelector(".tf-block").style.display = isTF ? "block" : "none";
    });

    card.querySelector('[data-act="save"]').addEventListener("click", async () => {
      const isTF = typeSelect.value === "true_false";
      const payload = {
        question_text: card.querySelector(".f-text").value.trim(),
        question_type: typeSelect.value,
        category: card.querySelector(".f-category").value,
        points: parseInt(card.querySelector(".f-points").value, 10) || 10,
      };
      if (isTF) {
        const checked = card.querySelector(".f-correct-tf:checked");
        payload.options = null;
        payload.correct_answer = checked ? checked.value === "true" : true;
      } else {
        const opts = {};
        card.querySelectorAll(".f-opt").forEach(inp => opts[inp.dataset.key] = inp.value.trim());
        payload.options = opts;
        payload.correct_answer = card.querySelector(".f-correct-mc").value;
      }
      const { error } = await supabase.from("listening_questions").update(payload).eq("id", q.id);
      if (error) { Utils.toast("Couldn't save question.", "error"); return; }
      Utils.toast("Question saved.", "success");
      load();
    });

    card.querySelector('[data-act="delete"]').addEventListener("click", async () => {
      if (!confirm("Delete this question?")) return;
      const { error } = await supabase.from("listening_questions").delete().eq("id", q.id);
      if (error) { Utils.toast("Couldn't delete question.", "error"); return; }
      Utils.toast("Question deleted.", "success");
      load();
    });

    card.querySelectorAll('[data-act="up"], [data-act="down"]').forEach(btn => {
      btn.addEventListener("click", async () => {
        const dir = btn.dataset.act === "up" ? -1 : 1;
        const idx = questions.findIndex(x => x.id === q.id);
        const swapWith = questions[idx + dir];
        if (!swapWith) return;
        await Promise.all([
          supabase.from("listening_questions").update({ order_number: swapWith.order_number }).eq("id", q.id),
          supabase.from("listening_questions").update({ order_number: q.order_number }).eq("id", swapWith.id)
        ]);
        load();
      });
    });
  }

  Utils.$("#btn-add-question").addEventListener("click", async () => {
    const nextOrder = questions.length ? Math.max(...questions.map(q => q.order_number)) + 1 : 1;
    const { error } = await supabase.from("listening_questions").insert({
      listening_id: listeningId,
      question_text: "New question",
      question_type: "multiple_choice",
      category: "details",
      options: { A: "", B: "", C: "", D: "" },
      correct_answer: "A",
      order_number: nextOrder
    });
    if (error) { Utils.toast("Couldn't add question.", "error"); return; }
    load();
  });

  load();
})();
