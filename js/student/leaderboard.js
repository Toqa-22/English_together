(async () => {
  const profile = await Auth.guard("student");
  if (!profile) return;

  const listEl = Utils.$("#leaderboard-list");
  const loadMoreBtn = Utils.$("#btn-load-more");
  const PAGE_SIZE = 20;
  let offset = 0;
  let rendered = false;

  const { data: myRank } = await supabase.rpc("get_my_rank");
  if (myRank) {
    Utils.$("#my-rank-card").style.display = "flex";
    Utils.$("#my-rank-num").textContent = "#" + myRank.rank;
    Utils.$("#my-rank-points").textContent = "⭐ " + myRank.total_points;
  }

  async function loadPage() {
    const { data, error } = await supabase.rpc("get_leaderboard", { p_limit: PAGE_SIZE, p_offset: offset });
    if (error) {
      Utils.showError(listEl, "Couldn't load the leaderboard.");
      return;
    }
    if (!data.length && offset === 0) {
      Utils.showEmpty(listEl, "🥇", "No rankings yet — be the first to earn points!");
      loadMoreBtn.style.display = "none";
      return;
    }
    if (!rendered) { listEl.innerHTML = ""; rendered = true; }

    data.forEach(row => {
      const medal = row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : row.rank;
      const rankCls = row.rank <= 3 ? `top${row.rank}` : "";
      const el = document.createElement("div");
      el.className = `lb-row anim-fade-slide-up ${row.is_you ? "is-you" : ""}`;
      el.innerHTML = `
        <div class="lb-rank ${rankCls}">${medal}</div>
        <div class="lb-name">${Utils.escapeHtml(row.display_name)}${row.is_you ? " (You)" : ""}</div>
        <div class="lb-stats">${row.completed_activities} completed · ${Math.round(row.avg_score)}% avg · 🏆 ${row.badge_count}</div>
        <div class="lb-points">⭐ ${row.total_points}</div>
      `;
      listEl.appendChild(el);
    });

    offset += data.length;
    loadMoreBtn.style.display = data.length === PAGE_SIZE ? "block" : "none";
  }

  loadMoreBtn.addEventListener("click", loadPage);
  await loadPage();
})();
