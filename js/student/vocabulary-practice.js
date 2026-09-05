(async () => {
  const profile = await Auth.guard("student");
  if (!profile) return;

  const area = Utils.$("#practice-area");
  const progressEl = Utils.$("#practice-progress");

  const { data: queue, error } = await supabase.rpc("get_vocabulary_queue", { p_limit: 10 });
  if (error) {
    console.error("get_vocabulary_queue error:", error);
    Utils.showError(area, "Couldn't load vocabulary: " + (error.message || "unknown error"));
    return;
  }
  if (!queue || !queue.length) {
    progressEl.textContent = "";
    Utils.showEmpty(area, "🎉", "No words to review right now — you're all caught up!");
    return;
  }

  let index = 0;
  let masteredCount = 0;

  function renderCard() {
    const total = queue.length;
    progressEl.textContent = `${index + 1} / ${total} words to review`;
    const v = queue[index];

    area.innerHTML = `
      ${VocabCard.cardHTML(v)}
      <div class="practice-rating-row" id="rating-row" style="visibility:hidden;">
        <button class="rate-easy" data-rating="easy"><span class="emoji">😊</span>Easy</button>
        <button class="rate-okay" data-rating="okay"><span class="emoji">😐</span>Okay</button>
        <button class="rate-hard" data-rating="hard"><span class="emoji">😕</span>Need Practice</button>
      </div>
    `;

    VocabCard.wireCard(area, (isFlipped) => {
      Sound.click();
      Utils.$("#rating-row").style.visibility = isFlipped ? "visible" : "hidden";
    });

    Utils.$all("[data-rating]", area).forEach(btn => {
      btn.addEventListener("click", async () => {
        Utils.$all("[data-rating]", area).forEach(b => b.disabled = true);
        const { data } = await supabase.rpc("submit_vocabulary_review", { p_vocabulary_id: v.id, p_rating: btn.dataset.rating });
        if (data?.newly_mastered) { masteredCount++; Sound.correct(); } else { Sound.click(); }
        index++;
        if (index < queue.length) {
          renderCard();
        } else {
          showComplete();
        }
      });
    });
  }

  function showComplete() {
    progressEl.textContent = "";
    area.innerHTML = `
      <div class="game-result anim-pop">
        <div class="gr-emoji">🎉</div>
        <p style="font-weight:800; font-size:18px; margin:10px 0 4px;">Practice complete!</p>
        <p style="color:#8892a8; font-size:14px; margin:0 0 16px;">${masteredCount ? `${masteredCount} word(s) newly mastered · ` : ""}+${queue.length * 5} points earned</p>
        <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
          <button class="btn btn-secondary" onclick="location.reload()">Practice More</button>
          <button class="btn btn-primary" onclick="location.href='vocabulary.html'">Back to Vocabulary</button>
        </div>
      </div>`;
    Anim.confetti(20);
  }

  renderCard();
})();
