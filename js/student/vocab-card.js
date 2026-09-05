// ============================================================
// VOCAB CARD — shared flip-card markup + audio, used by the practice page,
// the post-story/post-listening vocabulary reveal, and the vocabulary
// browser. No images anywhere, no phonetic transcription — word, Arabic
// meaning, example sentence, and a speak-on-click audio button only.
// ============================================================

const VocabCard = {
  speak(text) {
    if (!window.speechSynthesis || !text) return;
    window.speechSynthesis.cancel(); // never overlap with a previous utterance
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  },

  /** Returns the flip-card HTML for one vocabulary word. */
  cardHTML(v) {
    return `
      <div class="flip-card-scene">
        <div class="flip-card" data-id="${v.id}">
          <div class="flip-card-face flip-card-front">
            <button class="flip-card-audio-btn" data-speak="${Utils.escapeHtml(v.word)}" title="Listen">🔊</button>
            <div class="flip-card-word">${Utils.escapeHtml(v.word)}</div>
            <div class="flip-card-hint">Tap the card to reveal the meaning</div>
          </div>
          <div class="flip-card-face flip-card-back">
            <div class="flip-card-arabic">${Utils.escapeHtml(v.arabic_meaning || "")}</div>
            ${v.example_sentence ? `
              <div class="flip-card-example-label">Example</div>
              <div class="flip-card-example">"${Utils.escapeHtml(v.example_sentence)}"</div>
              <button class="flip-card-audio-btn" data-speak="${Utils.escapeHtml(v.example_sentence)}">🔊 Listen to Example</button>
            ` : `<button class="flip-card-audio-btn" data-speak="${Utils.escapeHtml(v.word)}">🔊 Listen</button>`}
          </div>
        </div>
      </div>`;
  },

  /** Wires up flip-on-click and audio buttons (stopping propagation so audio doesn't also flip the card). */
  wireCard(container, onFlip) {
    const card = container.querySelector(".flip-card");
    if (card) {
      card.addEventListener("click", () => {
        card.classList.toggle("flipped");
        if (onFlip) onFlip(card.classList.contains("flipped"));
      });
    }
    container.querySelectorAll("[data-speak]").forEach(btn => {
      btn.addEventListener("click", (e) => { e.stopPropagation(); this.speak(btn.dataset.speak); });
    });
  }
};
