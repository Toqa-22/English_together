// ============================================================
// SHARED — story grid fetch + render, used by dashboard.html and stories.html
// ============================================================

const StudentShared = {
  async fetchAssignedStories(profile) {
    const [attemptsRes, assignmentsRes] = await Promise.all([
      supabase.from("student_attempts").select("story_id, completed_at").eq("student_id", profile.id),
      supabase.from("story_assignments").select("*, stories(*)").eq("group_id", profile.group_id).eq("assigned", true)
    ]);
    const completedIds = new Set((attemptsRes.data || []).filter(a => a.completed_at).map(a => a.story_id));
    const sorted = (assignmentsRes.data || [])
      .filter(a => a.stories && a.stories.active)
      .sort((a, b) => (a.stories.unlock_order || 999) - (b.stories.unlock_order || 999));
    return { sorted, completedIds };
  },

  storyStatus(a, idx, sorted, completedIds) {
    const now = new Date();
    const story = a.stories;
    if (completedIds.has(story.id)) return { status: "completed", label: "✓ Completed", pill: "pill-success" };
    if (!a.available) return { status: "locked", label: "🔒 Locked", pill: "pill-danger" };
    if (a.available_from && new Date(a.available_from) > now) return { status: "scheduled", label: "⏰ Coming Soon", pill: "pill-warning" };
    if (a.available_until && new Date(a.available_until) < now) return { status: "locked", label: "🔒 Locked", pill: "pill-danger" };
    if (story.unlock_order && story.unlock_order > 1) {
      const prev = sorted[idx - 1];
      if (prev && !completedIds.has(prev.stories.id)) return { status: "locked", label: "🔒 Locked", pill: "pill-danger" };
    }
    return { status: "available", label: "📖 Start Reading", pill: "pill-success" };
  },

  async renderStoryGrid(grid, profile) {
    try {
      const { sorted, completedIds } = await this.fetchAssignedStories(profile);
      if (!sorted.length) {
        Utils.showEmpty(grid, "📚", "No stories available yet.");
        return { sorted, completedIds };
      }
      grid.innerHTML = "";
      sorted.forEach((a, idx) => {
        const story = a.stories;
        const { label, pill, status } = this.storyStatus(a, idx, sorted, completedIds);
        const card = document.createElement("div");
        card.className = "story-card anim-fade-slide-up";
        card.style.animationDelay = (idx * 0.05) + "s";
        card.innerHTML = `
          <div class="story-cover">${story.emoji || "📖"}</div>
          <div class="story-body">
            <p class="story-title">${Utils.escapeHtml(story.title)}</p>
            <p class="story-meta">${story.estimated_minutes} min · ${Utils.escapeHtml(story.difficulty)}</p>
            <div class="story-status"><span class="badge-pill ${pill}">${label}</span></div>
          </div>
        `;
        if (status === "available" || status === "completed") {
          card.style.cursor = "pointer";
          card.addEventListener("click", () => {
            Sound.click();
            window.location.href = `reading.html?story=${story.id}`;
          });
        }
        grid.appendChild(card);
      });
      return { sorted, completedIds };
    } catch (err) {
      console.error(err);
      Utils.showError(grid, "Couldn't load your stories. Please try again.");
      return { sorted: [], completedIds: new Set() };
    }
  },

  /**
   * Group A (age ~3) gets a simplified, larger-touch-target experience.
   * Threshold: group's age_max <= 5 covers "Group A" without hard-coding its name,
   * so any future young-reader group gets the same treatment automatically.
   */
  isYoungGroup(profile) {
    const ageMax = profile.groups?.age_max;
    return typeof ageMax === "number" && ageMax <= 5;
  },

  applyYoungMode(profile) {
    if (this.isYoungGroup(profile)) document.body.classList.add("mode-young");
  },

  /**
   * Renders a Mon–Sun activity calendar into `container` based on which days
   * this week the student completed at least one story.
   */
  async renderWeekCalendar(container, profile) {
    const now = new Date();
    const day = now.getDay(); // 0 = Sunday
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(now); monday.setHours(0, 0, 0, 0); monday.setDate(now.getDate() + mondayOffset);
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23, 59, 59, 999);

    const { data } = await supabase
      .from("student_attempts")
      .select("completed_at")
      .eq("student_id", profile.id)
      .not("completed_at", "is", null)
      .gte("completed_at", monday.toISOString())
      .lte("completed_at", sunday.toISOString());

    const activeDates = new Set((data || []).map(a => new Date(a.completed_at).toDateString()));
    const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const todayStr = now.toDateString();

    container.innerHTML = labels.map((label, i) => {
      const d = new Date(monday); d.setDate(monday.getDate() + i);
      const done = activeDates.has(d.toDateString());
      const isToday = d.toDateString() === todayStr;
      return `
        <div class="week-day ${done ? "done" : ""} ${isToday ? "today" : ""}">
          <div class="wd-label">${label}</div>
          <div class="wd-circle">${done ? "✓" : "○"}</div>
        </div>`;
    }).join("");
  },

  /**
   * Renders the assigned listening activities grid — mirrors renderStoryGrid,
   * but listening has no unlock-order/sequential-mode concept (per spec),
   * so status is simpler: completed / locked / scheduled / available.
   */
  async renderListeningGrid(grid, profile) {
    try {
      const [attemptsRes, assignmentsRes] = await Promise.all([
        supabase.from("listening_attempts").select("listening_id, completed_at").eq("student_id", profile.id),
        supabase.from("listening_assignments").select("*, listening_activities(*)").eq("group_id", profile.group_id)
      ]);
      const completedIds = new Set((attemptsRes.data || []).filter(a => a.completed_at).map(a => a.listening_id));
      const items = (assignmentsRes.data || []).filter(a => a.listening_activities && a.listening_activities.active);

      if (!items.length) {
        Utils.showEmpty(grid, "🎧", "No listening activities available yet.");
        return { items, completedIds };
      }

      const now = new Date();
      grid.innerHTML = "";
      items.forEach((a, idx) => {
        const item = a.listening_activities;
        let label = "▶ Start Listening", pill = "pill-success", clickable = true;
        if (completedIds.has(item.id)) { label = "✓ Completed"; pill = "pill-success"; }
        else if (!a.available) { label = "🔒 Locked"; pill = "pill-danger"; clickable = false; }
        else if (a.available_from && new Date(a.available_from) > now) { label = "⏰ Coming Soon"; pill = "pill-warning"; clickable = false; }
        else if (a.available_until && new Date(a.available_until) < now) { label = "🔒 Locked"; pill = "pill-danger"; clickable = false; }

        const isAudio = item.listening_type === "audio";
        const thumb = item.thumbnail_url || (isAudio ? null : `https://i.ytimg.com/vi/${item.youtube_video_id}/hqdefault.jpg`);
        const card = document.createElement("div");
        card.className = "listening-card anim-fade-slide-up";
        card.style.animationDelay = (idx * 0.05) + "s";
        card.innerHTML = `
          <div class="listening-thumb">
            ${thumb ? `<img src="${thumb}" alt="" loading="lazy">` : `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:36px; background:linear-gradient(135deg, var(--s-secondary), var(--s-primary));">🎤</div>`}
            <div class="play-badge">🎧</div>
          </div>
          <div class="listening-body">
            <p class="story-title">${Utils.escapeHtml(item.title)}</p>
            <p class="story-meta">${item.estimated_minutes} min · ${Utils.escapeHtml(item.difficulty)}</p>
            <div class="story-status"><span class="badge-pill ${pill}">${label}</span></div>
          </div>
        `;
        if (clickable) {
          card.style.cursor = "pointer";
          card.addEventListener("click", () => {
            Sound.click();
            window.location.href = `listening-player.html?listening=${item.id}`;
          });
        }
        grid.appendChild(card);
      });
      return { items, completedIds };
    } catch (err) {
      console.error(err);
      Utils.showError(grid, "Couldn't load listening activities. Please try again.");
      return { items: [], completedIds: new Set() };
    }
  }
};
