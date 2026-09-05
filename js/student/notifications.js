(async () => {
  const profile = await Auth.guard("student");
  if (!profile) return;

  const area = Utils.$("#notif-area");
  try {
    const [notifRes, readsRes] = await Promise.all([
      supabase.from("notifications").select("*").order("created_at", { ascending: false }),
      supabase.from("notification_reads").select("notification_id").eq("student_id", profile.id)
    ]);
    const readIds = new Set((readsRes.data || []).map(r => r.notification_id));
    const notifications = notifRes.data || [];

    if (!notifications.length) { Utils.showEmpty(area, "🔔", "You're all caught up!"); return; }

    const iconFor = t => ({ announcement: "📣", new_story: "📖", challenge: "🎯", reminder: "⏰", schedule: "🗓️" }[t] || "🔔");

    area.innerHTML = notifications.map(n => {
      const unread = !readIds.has(n.id);
      return `
        <div class="notif-item ${unread ? "unread" : ""}" data-id="${n.id}">
          <div class="ni">${iconFor(n.notif_type)}</div>
          <div style="flex:1;">
            <p class="nt" dir="auto">${Utils.escapeHtml(n.title)}</p>
            ${n.notif_type === "schedule" && Array.isArray(n.data) && n.data.length ? renderScheduleTable(n.data) : `<p class="nm" dir="auto">${Utils.escapeHtml(n.message)}</p>`}
            <p class="nd">${Utils.formatDate(n.created_at)}</p>
          </div>
        </div>`;
    }).join("");

    function renderScheduleTable(rows) {
      return `
        <table class="notif-table" dir="auto">
          <thead><tr><th>اليوم</th><th>المجموعة</th><th>الصفوف</th><th>الوقت</th></tr></thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td>${Utils.escapeHtml(r.day || "")}</td>
                <td>${Utils.escapeHtml(r.group || "")}</td>
                <td>${Utils.escapeHtml(r.grades || "")}</td>
                <td>${Utils.escapeHtml(r.time || "")}</td>
              </tr>`).join("")}
          </tbody>
        </table>`;
    }

    // Mark all visible unread notifications as read
    const toMark = notifications.filter(n => !readIds.has(n.id));
    if (toMark.length) {
      await supabase.from("notification_reads").insert(
        toMark.map(n => ({ notification_id: n.id, student_id: profile.id }))
      );
    }
  } catch (err) {
    console.error(err);
    Utils.showError(area, "Couldn't load notifications.");
  }
})();
