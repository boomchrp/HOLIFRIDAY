#!/usr/bin/env bash
set -euo pipefail

cd /workspaces/HOLIFRIDAY
git checkout improve-firebase-security
git pull

python3 <<'PY'
from pathlib import Path

p = Path('holifriday-app/src/App.tsx')
s = p.read_text(encoding='utf-8')

# Fix previously inserted workspace badge if it is in a component without workspaceId scope
s = s.replace('\n          <WorkspaceBadge workspaceId={workspaceId} />', '')

# Add My Work + Critical Path components once
if 'function MyWorkView(' not in s:
    components = r'''
function MyWorkView({ board, currentUserEmail, currentUserName, onOpen }: any) {
  const today = new Date(new Date().toDateString());
  const meEmail = normalizeEmail(currentUserEmail);
  const meName = normalizeOwner(currentUserName || currentUserEmail);

  function isMine(owner) {
    const ownerText = normalizeOwner(owner);
    if (!meEmail && (!meName || meName === "No owner")) return true;
    return normalizeEmail(ownerText) === meEmail || ownerText.toLowerCase() === meName.toLowerCase();
  }

  const tasks = asArray(board?.groups)
    .flatMap(group => asArray(group.items).map(item => ({ ...item, _groupName: group.name, _groupColor: group.color })))
    .filter(item => isMine(item.owner))
    .filter(item => !["Done", "Submitted", "Approved"].includes(item.status))
    .map(item => ({ ...item, _analysis: getPlanningAnalysis(item, getOwnerCapacity(board, item.owner, 6)) }))
    .sort((a, b) => {
      const ad = parseDateOnly(a.due)?.getTime?.() || 9e15;
      const bd = parseDateOnly(b.due)?.getTime?.() || 9e15;
      return ad - bd;
    });

  const buckets = [
    { key: "overdue", title: "Overdue", icon: "⚠️", color: "#e2445c", items: tasks.filter(t => isOverdue(t.due)) },
    { key: "today", title: "Due Today", icon: "📍", color: "#fdab3d", items: tasks.filter(t => parseDateOnly(t.due) && diffDays(today, parseDateOnly(t.due)) === 0) },
    { key: "week", title: "This Week", icon: "📅", color: "#579bfc", items: tasks.filter(t => { const d = parseDateOnly(t.due); if (!d) return false; const n = diffDays(today, d); return n > 0 && n <= 7; }) },
    { key: "pm", title: "PM / Review", icon: "✅", color: "#a25ddc", items: tasks.filter(t => ["Ready for PM Review", "PM Reviewing", "Need Revision"].includes(t.status) || isPmReviewDueSoon(t)) },
    { key: "later", title: "Later / No Due", icon: "🧭", color: "#676879", items: tasks.filter(t => { const d = parseDateOnly(t.due); if (!d) return true; return diffDays(today, d) > 7; }) },
  ];

  const uniqueBuckets = buckets.map(b => ({ ...b, items: Array.from(new Map(b.items.map(i => [i.id, i])).values()) }));

  function TaskMiniCard({ item, color }: any) {
    const statusColor = STATUS_OPTIONS.find(s => s.label === item.status)?.color || "#c4c4c4";
    const due = parseDateOnly(item.due);
    const dueText = due ? `${item.due} (${diffDays(today, due)}d)` : "No due date";
    return (
      <button onClick={() => onOpen(item)} style={{ width: "100%", textAlign: "left", border: "1px solid #eef1f7", borderLeft: `4px solid ${color}`, borderRadius: 10, background: "#fff", padding: "10px 12px", cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#323338", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div>
            <div style={{ marginTop: 3, fontSize: 11, color: "#98a1b3" }}>{item._groupName} • {dueText}</div>
          </div>
          <span style={{ flexShrink: 0, background: statusColor, color: "#fff", borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 900 }}>{item.status}</span>
        </div>
        <div style={{ marginTop: 6, fontSize: 11, color: item._analysis.riskColor, fontWeight: 800 }}>{item._analysis.risk} • {item._analysis.reason}</div>
      </button>
    );
  }

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "20px 28px 28px", background: "#f6f7fb" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "#323338" }}>👤 My Work</h2>
          <div style={{ marginTop: 4, fontSize: 12, color: "#676879" }}>Personal task inbox for {meEmail || meName || "current user"}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span style={{ background: "#fff", border: "1px solid #eef1f7", borderRadius: 999, padding: "5px 10px", fontSize: 12, fontWeight: 800, color: "#323338" }}>{tasks.length} active</span>
          <span style={{ background: "#fdeef1", color: "#e2445c", borderRadius: 999, padding: "5px 10px", fontSize: 12, fontWeight: 800 }}>{uniqueBuckets[0].items.length} overdue</span>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div style={{ background: "#fff", border: "1px solid #eef1f7", borderRadius: 12, padding: 32, textAlign: "center", color: "#98a1b3" }}>No active tasks assigned to you.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          {uniqueBuckets.map(bucket => (
            <div key={bucket.key} style={{ background: "#fff", border: "1px solid #eef1f7", borderRadius: 12, padding: 14, boxShadow: "0 2px 8px rgba(0,0,0,.05)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: "#323338" }}>{bucket.icon} {bucket.title}</div>
                <span style={{ background: bucket.color, color: "#fff", borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 900 }}>{bucket.items.length}</span>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {bucket.items.length === 0 ? <div style={{ fontSize: 12, color: "#c4cad6", padding: "8px 0" }}>No tasks</div> : bucket.items.map(item => <TaskMiniCard key={`${bucket.key}-${item.id}`} item={item} color={bucket.color} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CriticalPathView({ board, onOpen }: any) {
  const today = new Date(new Date().toDateString());
  const active = asArray(board?.groups)
    .flatMap(group => asArray(group.items).map(item => ({ group, item, range: getTaskRange(item), analysis: getPlanningAnalysis(item, getOwnerCapacity(board, item.owner, 6)) })))
    .filter(r => !["Done", "Submitted", "Approved"].includes(r.item.status));

  const scored = active.map(r => {
    const riskWeight = r.analysis.risk === "At Risk" || r.analysis.risk === "Invalid" ? 60 : r.analysis.risk === "Tight Review" ? 45 : r.analysis.risk === "Tight" ? 30 : r.analysis.risk === "Missing deadline" ? 20 : 0;
    const slackPenalty = r.analysis.slackDays == null ? 0 : Math.max(0, 14 - r.analysis.slackDays);
    const effortScore = Math.min(20, getEffortHours(r.item) / 2);
    const overdueScore = isOverdue(r.item.due) ? 35 : 0;
    return { ...r, score: Math.round(riskWeight + slackPenalty + effortScore + overdueScore) };
  }).sort((a, b) => b.score - a.score);

  const critical = scored.filter(r => r.score > 0 || ["At Risk", "Invalid", "Tight Review", "Tight"].includes(r.analysis.risk)).slice(0, 12);
  const timeline = [...critical].sort((a, b) => {
    const ad = rDate(a);
    const bd = rDate(b);
    return ad - bd;
  });
  function rDate(r) { return (r.analysis.suggestedStart || r.range?.start || parseDateOnly(r.item.due) || today).getTime(); }

  const dates = timeline.flatMap(r => [r.analysis.suggestedStart, r.analysis.finalDeadline, r.range?.start, r.range?.end].filter(Boolean));
  const start = dates.length ? new Date(Math.min(...dates.map((d:any) => d.getTime()))) : today;
  const end = dates.length ? new Date(Math.max(...dates.map((d:any) => d.getTime()))) : addDays(today, 14);
  const total = Math.max(1, diffDays(start, end) + 1);

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "20px 28px 28px", background: "#f6f7fb" }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "#323338" }}>🧭 Critical Path</h2>
        <div style={{ marginTop: 4, fontSize: 12, color: "#676879" }}>Tasks most likely to affect the final deadline. This is schedule-risk based until dependencies are added.</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12, marginBottom: 16 }}>
        <div style={{ background: "#fff", border: "1px solid #eef1f7", borderRadius: 12, padding: 14 }}><div style={{ fontSize: 11, color: "#98a1b3", fontWeight: 800 }}>CRITICAL TASKS</div><div style={{ fontSize: 28, fontWeight: 900, color: "#e2445c" }}>{critical.length}</div></div>
        <div style={{ background: "#fff", border: "1px solid #eef1f7", borderRadius: 12, padding: 14 }}><div style={{ fontSize: 11, color: "#98a1b3", fontWeight: 800 }}>OVERDUE IN PATH</div><div style={{ fontSize: 28, fontWeight: 900, color: "#fdab3d" }}>{critical.filter(r => isOverdue(r.item.due)).length}</div></div>
        <div style={{ background: "#fff", border: "1px solid #eef1f7", borderRadius: 12, padding: 14 }}><div style={{ fontSize: 11, color: "#98a1b3", fontWeight: 800 }}>HIGHEST SCORE</div><div style={{ fontSize: 28, fontWeight: 900, color: "#0073ea" }}>{critical[0]?.score || 0}</div></div>
      </div>

      <div style={{ background: "#fff", border: "1px solid #eef1f7", borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,.05)", marginBottom: 16 }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid #eef1f7", fontSize: 14, fontWeight: 900, color: "#323338" }}>Critical Timeline</div>
        {timeline.length === 0 ? <div style={{ padding: 24, color: "#98a1b3", textAlign: "center" }}>No critical tasks detected.</div> : timeline.map((r, idx) => {
          const s = r.analysis.suggestedStart || r.range?.start || today;
          const e = r.analysis.finalDeadline || r.range?.end || s;
          const left = Math.max(0, diffDays(start, s)) / total * 100;
          const width = Math.max(3, (diffDays(s, e) + 1) / total * 100);
          const color = r.analysis.riskColor || STATUS_OPTIONS.find(x => x.label === r.item.status)?.color || "#579bfc";
          return <div key={r.item.id} style={{ display: "grid", gridTemplateColumns: "260px 1fr 70px", gap: 12, alignItems: "center", padding: "10px 14px", borderBottom: "1px solid #f5f6fb" }}>
            <button onClick={() => onOpen(r.item)} style={{ border: "none", background: "transparent", textAlign: "left", cursor: "pointer", minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: "#323338", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{idx + 1}. {r.item.name}</div>
              <div style={{ fontSize: 11, color: "#98a1b3" }}>{r.group.name} • {r.item.owner || "No owner"}</div>
            </button>
            <div style={{ height: 24, background: "#f0f2f8", borderRadius: 999, position: "relative" }}>
              <div style={{ position: "absolute", left: `${left}%`, width: `${Math.min(width, 100 - left)}%`, top: 4, height: 16, borderRadius: 999, background: color, boxShadow: "0 2px 6px rgba(0,0,0,.14)" }} />
            </div>
            <div style={{ textAlign: "right", fontSize: 11, fontWeight: 900, color }}>{r.score}</div>
          </div>;
        })}
      </div>

      <div style={{ background: "#fff", border: "1px solid #eef1f7", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid #eef1f7", fontSize: 14, fontWeight: 900, color: "#323338" }}>Why these tasks are critical</div>
        {critical.map(r => <button key={`why-${r.item.id}`} onClick={() => onOpen(r.item)} style={{ width: "100%", textAlign: "left", border: "none", borderBottom: "1px solid #f5f6fb", background: "#fff", padding: "11px 14px", cursor: "pointer" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><b style={{ color: "#323338", fontSize: 13 }}>{r.item.name}</b><span style={{ color: r.analysis.riskColor, fontWeight: 900, fontSize: 11 }}>{r.analysis.risk}</span></div>
          <div style={{ marginTop: 4, color: "#676879", fontSize: 11 }}>{r.analysis.reason}</div>
          <div style={{ marginTop: 4, color: "#98a1b3", fontSize: 10 }}>Suggested start: {formatDateOnly(r.analysis.suggestedStart) || "—"} • PM: {formatDateOnly(r.analysis.suggestedPmReview) || "—"} • Final: {formatDateOnly(r.analysis.finalDeadline) || "—"}</div>
        </button>)}
      </div>
    </div>
  );
}
'''
    marker = 'function PMPlanningView({ board, onOpen, onUpdateCapacity }: any) {'
    if marker not in s:
        raise SystemExit('Cannot find PMPlanningView marker')
    s = s.replace(marker, components + '\n' + marker, 1)

# Add view buttons
s = s.replace(
    '[["table","☰ Table"],["kanban","⬡ Kanban"],["calendar","🗓 Calendar"],["workload","👥 Workload"],["planning","🧠 Planning"]]',
    '[["table","☰ Table"],["kanban","⬡ Kanban"],["calendar","🗓 Calendar"],["mywork","👤 My Work"],["workload","👥 Workload"],["critical","🧭 Critical"],["planning","🧠 Planning"]]'
)

# Add keyboard shortcuts if not present
if 'setView("mywork")' not in s:
    s = s.replace(
        'if (e.key === "w" || e.key === "W") { setView("workload"); return; }',
        'if (e.key === "w" || e.key === "W") { setView("workload"); return; }\n      if (e.key === "m" || e.key === "M") { setView("mywork"); return; }\n      if (e.key === "x" || e.key === "X") { setView("critical"); return; }\n      if (e.key === "p" || e.key === "P") { setView("planning"); return; }'
    )

# Add render routes
old_route = '''      ) : view === "workload" ? (
        <TeamScheduleView board={filteredBoard} onOpen={handleOpenItem} />
      ) : view === "planning" ? (
        <PMPlanningView board={filteredBoard} onOpen={handleOpenItem} />
      ) : ('''
new_route = '''      ) : view === "mywork" ? (
        <MyWorkView board={board} currentUserEmail={currentUserEmail} currentUserName={currentUserName} onOpen={handleOpenItem} />
      ) : view === "workload" ? (
        <TeamScheduleView board={filteredBoard} onOpen={handleOpenItem} />
      ) : view === "critical" ? (
        <CriticalPathView board={board} onOpen={handleOpenItem} />
      ) : view === "planning" ? (
        <PMPlanningView board={filteredBoard} onOpen={handleOpenItem} />
      ) : ('''
if old_route in s:
    s = s.replace(old_route, new_route, 1)
elif '<MyWorkView board={board}' not in s:
    raise SystemExit('Cannot find view route block')

# Update shortcut hint
s = s.replace('["W","Workload"],["P","Planning"]', '["W","Workload"],["M","My Work"],["X","Critical"],["P","Planning"]')

p.write_text(s, encoding='utf-8')
print('Applied My Work and Critical Path')
PY

cd holifriday-app
npm run build

cd ..
git add -A
git commit -m "Add My Work and Critical Path views" || true
git push
