#!/usr/bin/env bash
set -euo pipefail

cd /workspaces/HOLIFRIDAY
git checkout main
git pull

python3 <<'PY'
from pathlib import Path

p = Path("holifriday-app/src/App.tsx")
s = p.read_text(encoding="utf-8")

def replace_once(old, new, label):
    global s
    if old not in s:
        print(f"[skip] {label}")
        return False
    s = s.replace(old, new, 1)
    print(f"[ok] {label}")
    return True

s = s.replace("{boards.map(b => (", "{boards.filter(b => !b.archivedAt).map(b => (")
s = s.replace("{boards.map(b => {", "{boards.filter(b => !b.archivedAt).map(b => {")

replace_once(
    "const activeBoard = boards.find(b => b.id === activeId) || boards[0];",
    "const activeBoards = asArray(boards).filter((b: any) => !b.archivedAt);\n  const activeBoard = activeBoards.find((b: any) => b.id === activeId) || activeBoards[0] || boards[0];",
    "activeBoard archive-aware",
)

s = s.replace("getPlanningAnalysis(i,getOwnerCapacity(board,i.owner,6))", "getPlanningAnalysis(i,getOwnerCapacity(board,i.owner,8))")

if "function PMSuitePanel(" not in s:
    component = r'''
function PMSuitePanel({ boards, onPatchBoard, onSetBoards }: any) {
  const { dark } = useDark();
  const card = dark ? "#16213e" : "#fff";
  const bg = dark ? "#101827" : "#fafbff";
  const text = dark ? "#e0e0f0" : "#323338";
  const sub = dark ? "#8888aa" : "#676879";
  const bdr = dark ? "#2a2a4a" : "#eef1f7";
  const allBoards = asArray(boards);
  const activeBoards = allBoards.filter((b: any) => !b.archivedAt);
  const archivedBoards = allBoards.filter((b: any) => b.archivedAt);
  const [boardId, setBoardId] = useState(activeBoards[0]?.id || allBoards[0]?.id || "");
  const board = allBoards.find((b: any) => String(b.id) === String(boardId)) || activeBoards[0] || allBoards[0];
  const [newBoardName, setNewBoardName] = useState(board?.name || "");
  const [newBoardColor, setNewBoardColor] = useState(board?.color || "#0073ea");
  const [requestTitle, setRequestTitle] = useState("");
  const [requestOwner, setRequestOwner] = useState("");
  const [requestDue, setRequestDue] = useState("");
  const [requestNote, setRequestNote] = useState("");
  const [attachTaskId, setAttachTaskId] = useState("");
  const [attachName, setAttachName] = useState("");
  const [attachUrl, setAttachUrl] = useState("");
  const [reportText, setReportText] = useState("");

  useEffect(() => {
    if (board) {
      setNewBoardName(board.name || "");
      setNewBoardColor(board.color || "#0073ea");
    }
  }, [board?.id]);

  function updateBoards(updater) {
    if (!onSetBoards) {
      window.alert("Board-level update is not available in this view.");
      return;
    }
    onSetBoards((prev: any[]) => updater(asArray(prev)));
  }

  function cloneTask(item) {
    return {
      ...item,
      id: uid(),
      comments: asArray(item.comments).map(c => ({ ...c, id: uid() })),
      subtasks: asArray(item.subtasks).map(st => ({ ...st, id: uid() })),
      approvalHistory: asArray(item.approvalHistory).map(h => ({ ...h, id: uid() })),
    };
  }

  function cloneBoard(source, nameSuffix = " Copy") {
    const now = new Date().toISOString();
    return {
      ...source,
      id: uid(),
      name: `${source.name}${nameSuffix}`,
      archivedAt: "",
      createdFrom: source.name,
      createdAt: now,
      groups: asArray(source.groups).map(g => ({
        ...g,
        id: uid(),
        items: asArray(g.items).map(cloneTask),
      })),
      activityLogs: [],
    };
  }

  function saveBoardSettings() {
    if (!board) return;
    updateBoards(bs => bs.map(b => b.id === board.id ? { ...b, name: newBoardName.trim() || b.name, color: newBoardColor || b.color } : b));
  }

  function duplicateBoard() {
    if (!board) return;
    const copy = cloneBoard(board);
    updateBoards(bs => [...bs, copy]);
    window.alert(`Duplicated board: ${copy.name}`);
  }

  function archiveBoard() {
    if (!board) return;
    if (activeBoards.length <= 1 && !board.archivedAt) {
      window.alert("You need at least one active board. Create or restore another board before archiving this one.");
      return;
    }
    if (!window.confirm(`Archive board "${board.name}"? You can restore it later from this PM Suite tab.`)) return;
    updateBoards(bs => bs.map(b => b.id === board.id ? { ...b, archivedAt: new Date().toISOString() } : b));
  }

  function restoreBoard(restoreId) {
    updateBoards(bs => bs.map(b => b.id === restoreId ? { ...b, archivedAt: "" } : b));
  }

  function exportBoardJson() {
    if (!board) return;
    downloadText(`holifriday-board-${safeFileName(board.name)}.json`, JSON.stringify(board, null, 2), "application/json");
  }

  const templateDefs = [
    { name: "HEC-RAS Flood Study", color: "#579bfc", groups: ["Data Collection", "Hydrology", "HEC-RAS Model", "Maps & Report", "PM Review"] },
    { name: "Hydrology Report", color: "#0073ea", groups: ["Rainfall Data", "Frequency Analysis", "Model Setup", "Results", "Report Review"] },
    { name: "Software Sprint", color: "#00c875", groups: ["Backlog", "In Progress", "Review", "Done"] },
    { name: "Shopee Product Launch", color: "#fdab3d", groups: ["Product Setup", "Images", "Listing", "Pricing", "Launch"] },
    { name: "Engineering Report Review", color: "#a25ddc", groups: ["Draft", "Internal Check", "PM Review", "Revision", "Final"] },
  ];

  function createFromTemplate(tpl) {
    const color = tpl.color || GROUP_COLORS[allBoards.length % GROUP_COLORS.length];
    const newBoard = {
      id: uid(),
      name: tpl.name,
      color,
      resourceCapacity: {},
      groups: tpl.groups.map((g, i) => ({
        id: uid(),
        name: g,
        color: GROUP_COLORS[i % GROUP_COLORS.length],
        members: [],
        memberRoles: {},
        invites: [],
        items: [],
      })),
      activityLogs: [createActivityLog({ actorName: "Template", actorEmail: "", boardId: "", action: "board_created", newValue: tpl.name })],
    };
    updateBoards(bs => [...bs, newBoard]);
    window.alert(`Created template board: ${tpl.name}`);
  }

  const taskRecords = getBoardTaskRecords(allBoards.filter((b: any) => !b.archivedAt));
  const selectedBoardTasks = board ? asArray(board.groups).flatMap(g => asArray(g.items).map(item => ({ board, group: g, item }))) : [];

  const notifications = useMemo(() => {
    const today = new Date(new Date().toDateString());
    const out: any[] = [];
    for (const { board, group, item } of taskRecords) {
      const dueDate = parseDateOnly(item.due);
      if (isOpenPlanningTask(item) && isOverdue(item.due)) out.push({ type: "Overdue", icon: "⚠️", color: "#e2445c", board: board.name, task: item.name, text: `${item.name} is overdue.` });
      if (isOpenPlanningTask(item) && dueDate && diffDays(today, dueDate) === 0) out.push({ type: "Due Today", icon: "📍", color: "#fdab3d", board: board.name, task: item.name, text: `${item.name} is due today.` });
      if (["Ready for PM Review", "PM Reviewing", "Need Revision"].includes(item.status)) out.push({ type: "Review", icon: "✅", color: "#579bfc", board: board.name, task: item.name, text: `${item.name}: ${item.status}` });
      for (const c of asArray(item.comments)) {
        if (asArray(c.mentions).length > 0) out.push({ type: "Mention", icon: "💬", color: "#a25ddc", board: board.name, task: item.name, text: `${item.name}: ${c.text}` });
      }
      const range = getTaskRange(item);
      const owner = normalizeOwner(item.owner);
      if (range && owner !== "No owner") {
        for (let d = new Date(range.start); d <= range.end; d = addDays(d, 1)) {
          const dateKey = d.toISOString().slice(0, 10);
          if (isOwnerUnavailable(board, owner, dateKey)) {
            out.push({ type: "OFF Conflict", icon: "🏝️", color: "#676879", board: board.name, task: item.name, text: `${owner} is OFF on ${dateKey}, but ${item.name} is scheduled.` });
            break;
          }
        }
      }
    }
    return out.slice(0, 40);
  }, [boards]);

  function runAutomationRules() {
    updateBoards(bs => bs.map(b => ({
      ...b,
      groups: asArray(b.groups).map(g => ({
        ...g,
        items: asArray(g.items).map(item => {
          let next = { ...item };
          const tags = new Set(asArray(next.tags));
          const today = new Date(new Date().toDateString());
          const pm = parseDateOnly(next.pmReviewDate);
          if (isOpenPlanningTask(next) && isOverdue(next.due)) tags.add("Overdue");
          if (isOpenPlanningTask(next) && pm && diffDays(today, pm) <= 0 && !["Ready for PM Review", "PM Reviewing", "Need Revision"].includes(next.status)) next.status = "Ready for PM Review";
          if (next.status === "Approved") tags.add("Approved");
          next.tags = Array.from(tags);
          return next;
        })
      }))
    })));
    window.alert("Automation rules applied: overdue tags, PM review status, approved tags.");
  }

  function submitRequest() {
    if (!board || !requestTitle.trim()) return;
    const firstGroup = asArray(board.groups)[0];
    if (!firstGroup) return;
    const newTask = {
      id: uid(),
      name: requestTitle.trim(),
      owner: normalizeOwner(requestOwner),
      status: "Not Started",
      priority: "Medium",
      start: "",
      due: requestDue,
      pmReviewDate: "",
      effortHours: 4,
      reviewBufferDays: 1,
      revisionBufferDays: 1,
      tags: ["Request"],
      comments: requestNote.trim()
        ? [{ id: uid(), author: "Request Form", text: requestNote.trim(), mentions: extractMentions(requestNote), time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }]
        : [],
      subtasks: [],
      approvalHistory: [],
    };
    onPatchBoard?.(board.id, current => ({ ...current, groups: asArray(current.groups).map((g, idx) => idx === 0 ? { ...g, items: [newTask, ...asArray(g.items)] } : g) }));
    setRequestTitle(""); setRequestOwner(""); setRequestDue(""); setRequestNote("");
    window.alert("Request added as a new task.");
  }

  function addAttachmentLink() {
    if (!board || !attachTaskId || !attachUrl.trim()) return;
    const label = attachName.trim() || attachUrl.trim();
    const comment = { id: uid(), author: "Attachment", text: `📎 Attachment: ${label} ${attachUrl.trim()}`, mentions: [], time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) };
    onPatchBoard?.(board.id, current => ({
      ...current,
      groups: asArray(current.groups).map(g => ({
        ...g,
        items: asArray(g.items).map(item => String(item.id) === String(attachTaskId) ? { ...item, comments: [...asArray(item.comments), comment] } : item),
      }))
    }));
    setAttachName(""); setAttachUrl("");
    window.alert("Attachment link added as a task comment.");
  }

  function generateReport() {
    const boardsForReport = activeBoards;
    const rows = getBoardTaskRecords(boardsForReport);
    const total = rows.length;
    const done = rows.filter(r => ["Done", "Submitted", "Approved"].includes(r.item.status)).length;
    const overdue = rows.filter(r => isOpenPlanningTask(r.item) && isOverdue(r.item.due));
    const review = rows.filter(r => ["Ready for PM Review", "PM Reviewing", "Need Revision"].includes(r.item.status));
    const byOwner = new Map<string, number>();
    for (const r of rows) byOwner.set(normalizeOwner(r.item.owner), (byOwner.get(normalizeOwner(r.item.owner)) || 0) + 1);
    const ownerLines = Array.from(byOwner.entries()).sort((a,b)=>b[1]-a[1]).slice(0, 8).map(([owner, count]) => `- ${owner}: ${count} task(s)`).join("\n");
    const textReport = `HOLIFRIDAY Project Report\nGenerated: ${new Date().toLocaleString()}\n\nSummary\n- Active boards: ${boardsForReport.length}\n- Total tasks: ${total}\n- Completed: ${done}\n- Completion: ${total ? Math.round(done / total * 100) : 0}%\n- Overdue: ${overdue.length}\n- PM/Review queue: ${review.length}\n\nTop owners\n${ownerLines || "- No owners"}\n\nOverdue tasks\n${overdue.slice(0, 15).map(r => `- [${r.board.name}] ${r.item.name} • ${r.item.owner || "No owner"} • due ${r.item.due || "—"}`).join("\n") || "- None"}\n\nReview queue\n${review.slice(0, 15).map(r => `- [${r.board.name}] ${r.item.name} • ${r.item.status}`).join("\n") || "- None"}`;
    setReportText(textReport);
  }

  function exportExcelCsv() {
    const rows = [["Board","Group","Task","Owner","Status","Priority","Start","Due","PM Review","Effort Hours","Tags"]];
    for (const { board, group, item } of taskRecords) rows.push([board.name, group.name, item.name, item.owner, item.status, item.priority, item.start, item.due, item.pmReviewDate, String(getEffortHours(item)), asArray(item.tags).join("; ")]);
    downloadText("holifriday-tasks-export.csv", rows.map(r => r.map(csvCell).join(",")).join("\n"), "text/csv;charset=utf-8");
  }

  function exportCalendarIcs() {
    const events: string[] = [];
    for (const { board, item } of taskRecords) {
      if (item.due) events.push(icsEvent(`${item.name} due`, item.due, `${board.name} / ${item.status}`));
      if (item.pmReviewDate) events.push(icsEvent(`${item.name} PM Review`, item.pmReviewDate, `${board.name} / PM review`));
    }
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//HOLIFRIDAY//PM Suite//EN", ...events, "END:VCALENDAR"].join("\r\n");
    downloadText("holifriday-calendar.ics", ics, "text/calendar;charset=utf-8");
  }

  if (!board) return <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16, color: sub }}>No board available.</div>;

  const inputStyle = { border: `1px solid ${bdr}`, borderRadius: 8, padding: "8px 9px", background: card, color: text, fontSize: 12 } as any;
  const primaryBtn = { border: "none", borderRadius: 8, background: "#0073ea", color: "#fff", padding: "8px 12px", fontSize: 12, fontWeight: 900, cursor: "pointer" } as any;
  const secondaryBtn = { border: `1px solid ${bdr}`, borderRadius: 8, background: card, color: text, padding: "8px 12px", fontSize: 12, fontWeight: 900, cursor: "pointer" } as any;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14 }}>
        <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16, boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: text }}>⚙️ Board Settings + Archive</div>
          <div style={{ fontSize: 12, color: sub, marginTop: 3 }}>Rename, color, duplicate, archive/restore, export board.</div>
          <select value={String(board.id)} onChange={e => setBoardId(e.target.value)} style={{ ...inputStyle, width: "100%", marginTop: 12 }}>{allBoards.map((b: any) => <option key={b.id} value={String(b.id)}>{b.archivedAt ? "[Archived] " : ""}{b.name}</option>)}</select>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 70px", gap: 8, marginTop: 10 }}>
            <input value={newBoardName} onChange={e => setNewBoardName(e.target.value)} style={inputStyle} />
            <input type="color" value={newBoardColor} onChange={e => setNewBoardColor(e.target.value)} style={{ ...inputStyle, height: 36, padding: 3 }} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            <button onClick={saveBoardSettings} style={primaryBtn}>Save</button>
            <button onClick={duplicateBoard} style={secondaryBtn}>Duplicate</button>
            <button onClick={exportBoardJson} style={secondaryBtn}>Export Board</button>
            {board.archivedAt ? <button onClick={() => restoreBoard(board.id)} style={primaryBtn}>Restore</button> : <button onClick={archiveBoard} style={{ ...secondaryBtn, color: "#e2445c" }}>Archive</button>}
          </div>
          {archivedBoards.length > 0 && <div style={{ marginTop: 12, borderTop: `1px solid ${bdr}`, paddingTop: 10 }}><div style={{ fontSize: 11, fontWeight: 900, color: sub, marginBottom: 6 }}>Archived Boards</div>{archivedBoards.map((b: any) => <button key={b.id} onClick={() => restoreBoard(b.id)} style={{ ...secondaryBtn, marginRight: 6, marginBottom: 6 }}>Restore {b.name}</button>)}</div>}
        </div>

        <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16, boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: text }}>🔔 Notification Center</div>
          <div style={{ fontSize: 12, color: sub, marginTop: 3 }}>{notifications.length} item(s) need attention.</div>
          <div style={{ marginTop: 12, maxHeight: 260, overflow: "auto", display: "grid", gap: 8 }}>
            {notifications.length === 0 ? <div style={{ fontSize: 12, color: sub }}>No urgent notifications.</div> : notifications.map((n, i) => <div key={i} style={{ border: `1px solid ${bdr}`, borderLeft: `4px solid ${n.color}`, borderRadius: 9, padding: "8px 10px", background: bg }}><div style={{ fontSize: 12, fontWeight: 900, color: text }}>{n.icon} {n.type} <span style={{ color: sub }}>• {n.board}</span></div><div style={{ fontSize: 11, color: sub, marginTop: 3 }}>{n.text}</div></div>)}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14 }}>
        <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16 }}><div style={{ fontSize: 15, fontWeight: 900, color: text }}>📋 Duplicate / Template Library</div><div style={{ fontSize: 12, color: sub, marginTop: 3 }}>Create a new board from a repeatable workflow.</div><div style={{ display: "grid", gap: 8, marginTop: 12 }}>{templateDefs.map(t => <button key={t.name} onClick={() => createFromTemplate(t)} style={{ ...secondaryBtn, textAlign: "left" }}>+ {t.name}</button>)}</div></div>
        <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16 }}><div style={{ fontSize: 15, fontWeight: 900, color: text }}>⚡ Automation Rules</div><div style={{ fontSize: 12, color: sub, marginTop: 3 }}>MVP rules: overdue tag, PM review status, approved tag.</div><button onClick={runAutomationRules} style={{ ...primaryBtn, marginTop: 12 }}>Run Rules Now</button></div>
        <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16 }}><div style={{ fontSize: 15, fontWeight: 900, color: text }}>📤 Google Calendar / Excel Export</div><div style={{ fontSize: 12, color: sub, marginTop: 3 }}>Export CSV for Excel and ICS for Google Calendar import.</div><div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}><button onClick={exportExcelCsv} style={primaryBtn}>Export CSV</button><button onClick={exportCalendarIcs} style={secondaryBtn}>Export ICS</button></div></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 14 }}>
        <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16 }}><div style={{ fontSize: 15, fontWeight: 900, color: text }}>📝 Task Request Form</div><div style={{ display: "grid", gap: 8, marginTop: 12 }}><input value={requestTitle} onChange={e => setRequestTitle(e.target.value)} placeholder="Request title" style={inputStyle} /><input value={requestOwner} onChange={e => setRequestOwner(e.target.value)} placeholder="Owner / email" style={inputStyle} /><input type="date" value={requestDue} onChange={e => setRequestDue(e.target.value)} style={inputStyle} /><textarea value={requestNote} onChange={e => setRequestNote(e.target.value)} placeholder="Request detail" style={{ ...inputStyle, minHeight: 74 }} /><button onClick={submitRequest} style={primaryBtn}>Create Request Task</button></div></div>
        <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16 }}><div style={{ fontSize: 15, fontWeight: 900, color: text }}>📎 File Attachment Link</div><div style={{ fontSize: 12, color: sub, marginTop: 3 }}>MVP: store Drive/PDF/file URL as a task comment.</div><div style={{ display: "grid", gap: 8, marginTop: 12 }}><select value={attachTaskId} onChange={e => setAttachTaskId(e.target.value)} style={inputStyle}><option value="">Select task</option>{selectedBoardTasks.map(r => <option key={r.item.id} value={String(r.item.id)}>{r.item.name}</option>)}</select><input value={attachName} onChange={e => setAttachName(e.target.value)} placeholder="File label" style={inputStyle} /><input value={attachUrl} onChange={e => setAttachUrl(e.target.value)} placeholder="https://..." style={inputStyle} /><button onClick={addAttachmentLink} style={primaryBtn}>Add Attachment Link</button></div></div>
      </div>

      <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}><div><div style={{ fontSize: 15, fontWeight: 900, color: text }}>📊 Project Report Generator</div><div style={{ fontSize: 12, color: sub, marginTop: 3 }}>Generate a PM-ready text report.</div></div><div style={{ display: "flex", gap: 8 }}><button onClick={generateReport} style={primaryBtn}>Generate Report</button>{reportText && <button onClick={() => downloadText("holifriday-project-report.txt", reportText, "text/plain;charset=utf-8")} style={secondaryBtn}>Download TXT</button>}</div></div>
        {reportText && <textarea readOnly value={reportText} style={{ ...inputStyle, width: "100%", minHeight: 260, marginTop: 12, fontFamily: "monospace", whiteSpace: "pre" }} />}
      </div>
    </div>
  );
}

function safeFileName(value) { return asText(value, "board").replace(/[^a-z0-9_-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "board"; }
function csvCell(value) { const s = String(value ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function icsDate(dateKey) { return asText(dateKey).replace(/-/g, ""); }
function icsEscape(value) { return String(value ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n"); }
function icsEvent(summary, dateKey, description = "") { const uidText = `${Date.now()}-${Math.random().toString(36).slice(2)}@holifriday`; return ["BEGIN:VEVENT", `UID:${uidText}`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`, `DTSTART;VALUE=DATE:${icsDate(dateKey)}`, `SUMMARY:${icsEscape(summary)}`, `DESCRIPTION:${icsEscape(description)}`, "END:VEVENT"].join("\r\n"); }
function downloadText(filename, content, mime = "text/plain;charset=utf-8") { const blob = new Blob([content], { type: mime }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }
'''
    marker = "function Dashboard({ boards, onPatchBoard"
    idx = s.find(marker)
    if idx < 0:
        raise SystemExit("Cannot find Dashboard marker")
    s = s[:idx] + component + "\n" + s[idx:]
    print("[ok] PMSuitePanel inserted")
else:
    print("[skip] PMSuitePanel already exists")

replace_once(
    "function Dashboard({ boards, onPatchBoard }: any) {",
    "function Dashboard({ boards, onPatchBoard, onSetBoards }: any) {",
    "Dashboard onSetBoards prop",
)

replace_once(
    '["availability", "Availability"],\n            ["reviews", "Comments & Approval"],',
    '["availability", "Availability"],\n            ["pmSuite", "PM Suite"],\n            ["reviews", "Comments & Approval"],',
    "Dashboard PM Suite tab",
)

replace_once(
    '{dashTab === "availability" && <AvailabilityPanel boards={boards} onPatchBoard={onPatchBoard} />}\n      {dashTab === "reviews" && <DashboardReviewPanel boards={boards} />}',
    '{dashTab === "availability" && <AvailabilityPanel boards={boards} onPatchBoard={onPatchBoard} />}\n      {dashTab === "pmSuite" && <PMSuitePanel boards={boards} onPatchBoard={onPatchBoard} onSetBoards={onSetBoards} />}\n      {dashTab === "reviews" && <DashboardReviewPanel boards={boards} />}',
    "Dashboard PM Suite panel",
)

replace_once(
    '? <Dashboard boards={boards} onPatchBoard={patchBoardById} />',
    '? <Dashboard boards={boards} onPatchBoard={patchBoardById} onSetBoards={setBoards} />',
    "Pass setBoards to Dashboard",
)

p.write_text(s, encoding="utf-8")
print("Patch complete: PM Suite Pack")
PY

cd holifriday-app
npm run build

cd ..
git add -A
git commit -m "Add PM suite pack"
git push
