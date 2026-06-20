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

# 1) Rename visible Kanban wording to Board. Keep internal lower-case "kanban" state if any.
visible_replacements = [
    ("⬡ Kanban", "⬡ Board"),
    ("Kanban", "Board"),
    ("KANBAN", "BOARD"),
    ("Advanced PM", "Planning"),
    ("Advanced PM Control Center", "Planning Control"),
    ("Governance", "Settings"),
    ("Governance Center", "Settings"),
    ("PM Suite", "Tools"),
    ("Status Board", "Board"),
    ("Team Calendar", "Team"),
    ("Comments & Approval", "Review"),
]
for a, b in visible_replacements:
    if a in s:
        s = s.replace(a, b)
        print(f"[ok] rename {a} -> {b}")

# 2) Add Home / Today page component.
home_component = r'''
function HomeTodayPage({ boards, activeBoard, currentUserEmail, onOpenBoard, onOpenReport, onCreateBoard, onQuickAddTask }: any) {
  const { dark } = useDark();
  const bg = dark ? "#0f0f1e" : "#f7f8fc";
  const card = dark ? "#16213e" : "#fff";
  const text = dark ? "#e0e0f0" : "#323338";
  const sub = dark ? "#8888aa" : "#676879";
  const bdr = dark ? "#2a2a4a" : "#eef1f7";

  const activeBoards = asArray(boards).filter((b: any) => !b.archivedAt);
  const taskRows = getBoardTaskRecords(activeBoards);
  const today = new Date(new Date().toDateString());
  const me = normalizeEmail(currentUserEmail);

  const overdue = taskRows.filter(r => isOpenPlanningTask(r.item) && isOverdue(r.item.due));
  const dueToday = taskRows.filter(r => {
    const due = parseDateOnly(r.item.due);
    return isOpenPlanningTask(r.item) && !!due && diffDays(today, due) === 0;
  });
  const reviewQueue = taskRows.filter(r => ["Ready for PM Review", "PM Reviewing", "Need Revision"].includes(r.item.status));
  const myTasks = taskRows.filter(r => me && normalizeEmail(r.item.owner) === me && isOpenPlanningTask(r.item));
  const offConflicts = taskRows.filter(r => {
    const range = getTaskRange(r.item);
    const owner = normalizeOwner(r.item.owner);
    if (!range || owner === "No owner") return false;
    for (let d = new Date(range.start); d <= range.end; d = addDays(d, 1)) {
      if (isOwnerUnavailable(r.board, owner, d.toISOString().slice(0, 10))) return true;
    }
    return false;
  });

  const nextItems = [...overdue, ...dueToday, ...reviewQueue, ...offConflicts]
    .filter((row, idx, arr) => arr.findIndex(x => x.item.id === row.item.id) === idx)
    .slice(0, 8);

  function StatCard({ title, value, hint, color, icon }: any) {
    return (
      <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 14, padding: 16, boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>{icon}</span>
          <span style={{ fontSize: 12, color: sub, fontWeight: 800 }}>{title}</span>
        </div>
        <div style={{ marginTop: 8, fontSize: 30, fontWeight: 900, color }}>{value}</div>
        <div style={{ marginTop: 3, fontSize: 11, color: sub }}>{hint}</div>
      </div>
    );
  }

  function ActionButton({ children, onClick, primary = false }: any) {
    return (
      <button onClick={onClick} style={{ border: primary ? "none" : `1px solid ${bdr}`, background: primary ? "#0073ea" : card, color: primary ? "#fff" : text, borderRadius: 10, padding: "9px 12px", fontSize: 12, fontWeight: 900, cursor: "pointer" }}>
        {children}
      </button>
    );
  }

  const noWorkYet = taskRows.length === 0;

  return (
    <div style={{ flex: 1, overflow: "auto", background: bg, padding: 24 }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 950, color: text, letterSpacing: -0.7 }}>Home</div>
            <div style={{ marginTop: 4, fontSize: 13, color: sub }}>Start here. These are the things that need attention today.</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <ActionButton primary onClick={onQuickAddTask}>+ New Task</ActionButton>
            <ActionButton onClick={onCreateBoard}>+ New Board</ActionButton>
            <ActionButton onClick={onOpenBoard}>Open Board</ActionButton>
            <ActionButton onClick={onOpenReport}>Open Report</ActionButton>
          </div>
        </div>

        {noWorkYet ? (
          <div style={{ background: card, border: `1px dashed ${bdr}`, borderRadius: 16, padding: 28, textAlign: "center", boxShadow: "0 2px 8px rgba(0,0,0,.04)" }}>
            <div style={{ fontSize: 34 }}>🌱</div>
            <div style={{ marginTop: 8, fontSize: 18, fontWeight: 900, color: text }}>No tasks yet</div>
            <div style={{ marginTop: 6, fontSize: 13, color: sub }}>Create your first task or start from a board template.</div>
            <div style={{ marginTop: 14, display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
              <ActionButton primary onClick={onQuickAddTask}>+ Create first task</ActionButton>
              <ActionButton onClick={onCreateBoard}>+ Create board</ActionButton>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 16 }}>
              <StatCard icon="⚠️" title="Overdue" value={overdue.length} hint="Tasks past due date" color="#e2445c" />
              <StatCard icon="📍" title="Due today" value={dueToday.length} hint="Tasks due today" color="#fdab3d" />
              <StatCard icon="✅" title="PM review" value={reviewQueue.length} hint="Waiting for review" color="#579bfc" />
              <StatCard icon="🏝️" title="OFF conflict" value={offConflicts.length} hint="Scheduled on unavailable days" color="#a25ddc" />
              <StatCard icon="👤" title="My tasks" value={myTasks.length} hint="Assigned to you" color="#00c875" />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "minmax(320px,1.3fr) minmax(280px,.8fr)", gap: 16 }}>
              <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 14, padding: 16, boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: text }}>Things to check</div>
                <div style={{ fontSize: 12, color: sub, marginTop: 3 }}>Focus on these first.</div>
                <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                  {nextItems.length === 0 ? (
                    <div style={{ padding: 18, borderRadius: 12, background: dark ? "#101827" : "#f3fff8", color: "#00a35a", fontSize: 13, fontWeight: 800 }}>All clear. No urgent items right now.</div>
                  ) : nextItems.map(({ board, group, item }) => {
                    const isLate = isOpenPlanningTask(item) && isOverdue(item.due);
                    const isReview = ["Ready for PM Review", "PM Reviewing", "Need Revision"].includes(item.status);
                    return (
                      <button key={`${board.id}-${group.id}-${item.id}`} onClick={() => onOpenBoard(board.id)} style={{ textAlign: "left", border: `1px solid ${bdr}`, borderLeft: `4px solid ${isLate ? "#e2445c" : isReview ? "#579bfc" : "#fdab3d"}`, borderRadius: 10, background: dark ? "#101827" : "#fff", padding: "10px 12px", cursor: "pointer" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <div style={{ fontSize: 13, fontWeight: 900, color: text, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                          <span style={{ fontSize: 10, fontWeight: 900, color: isLate ? "#e2445c" : "#0073ea", whiteSpace: "nowrap" }}>{item.status}</span>
                        </div>
                        <div style={{ marginTop: 4, fontSize: 11, color: sub }}>{board.name} / {group.name} • {item.owner || "No owner"} • due {item.due || "—"}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 14, padding: 16, boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: text }}>Simple workflow</div>
                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  {[
                    ["1", "Create task", "Add the work item and owner."],
                    ["2", "Set dates", "Add start, due, and PM review date."],
                    ["3", "Update status", "Move work through the board."],
                    ["4", "Review report", "Check Report when you need a summary."],
                  ].map(([n, title, hint]) => (
                    <div key={n} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <div style={{ width: 24, height: 24, borderRadius: 999, background: "#eef4ff", color: "#0073ea", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900 }}>{n}</div>
                      <div><div style={{ fontSize: 12, fontWeight: 900, color: text }}>{title}</div><div style={{ fontSize: 11, color: sub, marginTop: 2 }}>{hint}</div></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
'''

if "function HomeTodayPage(" not in s:
    idx = s.find("// ─── Sidebar")
    if idx < 0:
        idx = s.find("function Sidebar(")
    if idx < 0:
        raise SystemExit("Cannot find Sidebar marker")
    s = s[:idx] + home_component + "\n" + s[idx:]
    print("[ok] HomeTodayPage inserted")
else:
    print("[skip] HomeTodayPage already exists")

# 3) Simplify sidebar navigation.
old_nav = '{[["dashboard","📊","Dashboard"],["boards","📋","Boards"]].map(([v,icon,label]) => ('
new_nav = '{[["home","🏠","Home"],["boards","📋","Board"],["dashboard","📊","Report"]].map(([v,icon,label]) => ('
replace_once(old_nav, new_nav, "Sidebar simple nav")

# 4) Default to Home.
replace_once('const [activeView, setActiveView] = useState("boards"); // boards | dashboard',
             'const [activeView, setActiveView] = useState("home"); // home | boards | dashboard',
             "Default activeView Home")

# 5) Add Simple / Advanced mode state.
replace_once('const [dark, setDark] = useLocalStorage("holifriday_dark", false);',
             'const [dark, setDark] = useLocalStorage("holifriday_dark", false);\n  const [simpleMode, setSimpleMode] = useLocalStorage("holifriday_simple_mode", true);',
             "Simple mode state")

# 6) Add Simple / Advanced toggle + quick actions in top bar.
topbar_marker = '<div style={{ display: "flex", alignItems: "center", gap: 8 }}>\n            <button onClick={() => setGlobalSearchOpen(true)}'
topbar_insert = '''<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setSimpleMode((v: boolean) => !v)} title="Switch between simple and advanced mode" style={{ border: `1px solid ${dark ? "#2a2a4a" : "#d8dbe4"}`, background: simpleMode ? "#eef4ff" : dark ? "#1a1a2e" : "#fff", color: simpleMode ? "#1f5ecf" : dark ? "#e0e0f0" : "#323338", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
              {simpleMode ? "Simple mode" : "Advanced mode"}
            </button>
            <button onClick={() => {
              const name = window.prompt("Task name");
              if (!name?.trim()) return;
              const b = activeBoard;
              const g = asArray(b?.groups)[0];
              if (!b || !g) { window.alert("Create a board first."); return; }
              const newTask = { id: uid(), name: name.trim(), owner: "No owner", status: "Not Started", priority: "Medium", start: "", due: "", tags: [], comments: [], subtasks: [], approvalHistory: [] };
              patchBoardById(b.id, current => ({ ...current, groups: asArray(current.groups).map((group, idx) => idx === 0 ? { ...group, items: [newTask, ...asArray(group.items)] } : group) }));
              setActiveId(b.id); setActiveView("boards");
            }} style={{ border: "none", background: "#0073ea", color: "#fff", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>+ New Task</button>
            <button onClick={() => {
              const name = window.prompt("Board name");
              if (name?.trim()) addBoard(name.trim());
            }} style={{ border: `1px solid ${dark ? "#2a2a4a" : "#d8dbe4"}`, background: dark ? "#1a1a2e" : "#fff", color: dark ? "#e0e0f0" : "#323338", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>+ New Board</button>
            <button onClick={() => setGlobalSearchOpen(true)}'''
replace_once(topbar_marker, topbar_insert, "Topbar simple mode + quick actions")

# 7) Route Home page.
old_render = '''{activeView === "dashboard"
          ? <Dashboard boards={boards} onPatchBoard={patchBoardById} onSetBoards={setBoards} />
          : activeBoard && <BoardView board={activeBoard} onUpdate={updateBoard} onPatchBoard={patchBoardById} onCelebrate={celebrate} currentUserName={authUser.displayName || authUser.email} currentUserEmail={authUser.email} jumpItemId={jumpItemId} onJumpHandled={() => setJumpItemId(null)} />
        }'''
new_render = '''{activeView === "home"
          ? <HomeTodayPage
              boards={boards}
              activeBoard={activeBoard}
              currentUserEmail={authUser.email}
              onOpenBoard={(boardId?: any) => { if (boardId) setActiveId(boardId); setActiveView("boards"); }}
              onOpenReport={() => setActiveView("dashboard")}
              onCreateBoard={() => { const name = window.prompt("Board name"); if (name?.trim()) addBoard(name.trim()); }}
              onQuickAddTask={() => {
                const name = window.prompt("Task name");
                if (!name?.trim()) return;
                const b = activeBoard;
                const g = asArray(b?.groups)[0];
                if (!b || !g) { window.alert("Create a board first."); return; }
                const newTask = { id: uid(), name: name.trim(), owner: "No owner", status: "Not Started", priority: "Medium", start: "", due: "", tags: [], comments: [], subtasks: [], approvalHistory: [] };
                patchBoardById(b.id, current => ({ ...current, groups: asArray(current.groups).map((group, idx) => idx === 0 ? { ...group, items: [newTask, ...asArray(group.items)] } : group) }));
                setActiveId(b.id); setActiveView("boards");
              }}
            />
          : activeView === "dashboard"
            ? <Dashboard boards={boards} onPatchBoard={patchBoardById} onSetBoards={setBoards} simpleMode={simpleMode} />
            : activeBoard && <BoardView board={activeBoard} onUpdate={updateBoard} onPatchBoard={patchBoardById} onCelebrate={celebrate} currentUserName={authUser.displayName || authUser.email} currentUserEmail={authUser.email} jumpItemId={jumpItemId} onJumpHandled={() => setJumpItemId(null)} />
        }'''
replace_once(old_render, new_render, "Home route render")

# 8) Dashboard accepts simpleMode.
replace_once("function Dashboard({ boards, onPatchBoard, onSetBoards }: any) {",
             "function Dashboard({ boards, onPatchBoard, onSetBoards, simpleMode = true }: any) {",
             "Dashboard simpleMode prop")

# 9) Hide advanced dashboard tabs in Simple mode if possible.
tabs_pattern = '''[
            ["overview", "Overview"],
            ["planning", "Planning"],
            ["gantt", "Gantt / What-if"],
            ["team", "Team Load"],
            ["availability", "Availability"],
            ["pmSuite", "PM Suite"],
            ["advanced", "Advanced PM"],
            ["governance", "Governance"],
            ["reviews", "Comments & Approval"],
          ].map(([key, label]) => ('''
tabs_repl = '''(simpleMode
            ? [
                ["overview", "Overview"],
                ["team", "Team"],
                ["reviews", "Review"],
              ]
            : [
                ["overview", "Overview"],
                ["planning", "Planning"],
                ["gantt", "Timeline"],
                ["team", "Team"],
                ["availability", "Team Calendar"],
                ["pmSuite", "Tools"],
                ["advanced", "Planning Pro"],
                ["governance", "Settings"],
                ["reviews", "Review"],
              ]).map(([key, label]) => ('''
replace_once(tabs_pattern, tabs_repl, "Dashboard simple/advanced tabs")

# Additional likely label variants
s = s.replace('["advanced", "Advanced PM"]', '["advanced", "Planning Pro"]')
s = s.replace('["governance", "Governance"]', '["governance", "Settings"]')
s = s.replace('["pmSuite", "PM Suite"]', '["pmSuite", "Tools"]')
s = s.replace('["reviews", "Comments & Approval"]', '["reviews", "Review"]')
s = s.replace('["availability", "Availability"]', '["availability", "Team Calendar"]')
s = s.replace('["gantt", "Gantt / What-if"]', '["gantt", "Timeline"]')
s = s.replace('["team", "Team Load"]', '["team", "Team"]')

# 10) Clearer empty state in BoardView if no tasks.
empty_board_block = r'''
      {asArray(board.groups).flatMap(g => asArray(g.items)).length === 0 && (
        <div style={{ margin: "18px 20px", border: "1px dashed #d8dbe4", background: "#fff", borderRadius: 14, padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 30 }}>🌱</div>
          <div style={{ marginTop: 8, fontSize: 16, fontWeight: 900, color: "#323338" }}>No tasks yet</div>
          <div style={{ marginTop: 5, fontSize: 12, color: "#676879" }}>Start by adding your first task in the group below.</div>
        </div>
      )}
'''
if "Start by adding your first task in the group below" not in s:
    marker = "{board.groups.map(group =>"
    idx = s.find(marker)
    if idx >= 0:
        s = s[:idx] + empty_board_block + "\n        " + s[idx:]
        print("[ok] Board empty state inserted")
    else:
        print("[skip] Board empty state marker not found")
else:
    print("[skip] Board empty state already exists")

p.write_text(s, encoding="utf-8")
print("Simple navigation UX pack complete")
PY

cd holifriday-app
npm run build

cd ..
git add -A
git commit -m "Simplify navigation and add home dashboard"
git push
