// ============================================================
// UTILS — shared helpers across student & admin pages
// ============================================================

const Utils = {
  $(sel, root = document) { return root.querySelector(sel); },
  $all(sel, root = document) { return [...root.querySelectorAll(sel)]; },

  showLoading(el, message = "Loading...") {
    el.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>${message}</p></div>`;
  },

  showError(el, message = "Something went wrong. Please try again.") {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>${message}</p></div>`;
  },

  showEmpty(el, icon, message) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">${icon}</div><p>${message}</p></div>`;
  },

  toast(message, type = "info") {
    const container = document.getElementById("toast-container") || (() => {
      const c = document.createElement("div");
      c.id = "toast-container";
      c.className = "toast-container";
      document.body.appendChild(c);
      return c;
    })();
    const el = document.createElement("div");
    el.className = `toast toast-${type}`;
    el.textContent = message;
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 300);
    }, 3200);
  },

  formatDate(iso) {
    if (!iso) return "-";
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  },

  scoreFeedback(pct) {
    if (pct >= 90) return { emoji: "🌟", text: "Excellent! You are a reading superstar!" };
    if (pct >= 70) return { emoji: "👏", text: "Great job! Keep it up!" };
    if (pct >= 50) return { emoji: "😊", text: "Good effort! Keep practicing!" };
    return { emoji: "💪", text: "Don't give up! Read the story again and try once more!" };
  },

  debounce(fn, ms = 300) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  },

  escapeHtml(str = "") {
    return str.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
};
