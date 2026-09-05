const Anim = {
  confetti(count = 24) {
    const colors = ["#6C63E8", "#55B7E8", "#FFD85A", "#43C98B", "#E96A76"];
    for (let i = 0; i < count; i++) {
      const el = document.createElement("div");
      el.className = "confetti-piece";
      el.style.left = Math.random() * 100 + "vw";
      el.style.background = colors[Math.floor(Math.random() * colors.length)];
      el.style.animationDelay = (Math.random() * 0.4) + "s";
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 2600);
    }
  },

  countUp(el, target, duration = 800) {
    const start = 0;
    const startTime = performance.now();
    function tick(now) {
      const progress = Math.min((now - startTime) / duration, 1);
      const val = Math.round(start + (target - start) * progress);
      el.textContent = val;
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
};
