#!/usr/bin/env bash
set -euo pipefail

cd /workspaces/HOLIFRIDAY
git checkout main
git pull || true

python3 <<'PY'
from pathlib import Path
import re

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

def fix_signature(src: str, func_name: str) -> str:
    pattern = rf"^function\s+{re.escape(func_name)}\([^\n]*\)\s*\{{"
    m = re.search(pattern, src, flags=re.M)
    if not m:
        print(f"[skip] {func_name} signature not found")
        return src
    old = m.group(0)
    new = old.replace('\\"', '"')

    if func_name == "BoardView":
        new = re.sub(r'\{\s*boardRole\s*=\s*"Admin"\s*,\s*', '{ ', new, count=1)
        new = new.replace('{  board,', '{ board,')

    if func_name == "Group":
        new = re.sub(r'\{\s*boardRole\s*=\s*"Admin"\s*,\s*', '{ boardRole = "Admin", ', new, count=1)
        new = new.replace('",  group', '", group').replace('Admin",  group', 'Admin", group')

    if new != old:
        print(f"[ok] repaired {func_name} signature")
        print("before:", old)
        print("after: ", new)
    return src[:m.start()] + new + src[m.end():]

# 0) Repair current build-breaking role signature issue.
s = fix_signature(s, "Group")
s = fix_signature(s, "BoardView")

# 1) Insert complete UX helper/pages.
complete_pack = r'''
function hfUxArray(value: any) {
  return Array.isArray(value) ? value : [];
}

function hfUxText(value: any) {
  return String(value ?? "");
}

function hfUxUid() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function hfUxDatePlus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function hfUxIsOpenTask(item: any) {
  return !["Done", "Approved", "Cancelled", "Archived"].includes(hfUxText(item?.status));
}

function hfUxIsOverdue(item: any) {
  if (!hfUxIsOpenTask(item) || !item?.due) return false;
  const d = new Date(`${item.due}T00:00:00`);
  const today = new Date(new Date().toDateString());
  return Number.isFinite(d.getTime()) && d < today;
}

function hfUxBoardProgress(board: any) {
  const tasks = hfUxArray(board?.groups).flatMap((g: any) => hfUxArray(g.items));
  const done = tasks.filter((t: any) => !hfUxIsOpenTask(t)).length;
  return {
    total: tasks.length,
    done,
    pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
  };
}

function hfUxTask(owner: string, name: string, dueOffset = 3, tags: string[] = []) {
  return {
    id: hfUxUid(),
    name,
    owner: owner || "No owner",
    status: "Not Started",
    priority: "Medium",
    start: hfUxDatePlus(0),
    due: hfUxDatePlus(dueOffset),
    pmReviewDate: hfUxDatePlus(Math.max(1, dueOffset - 1)),
    effortHours: 4,
    reviewBufferDays: 1,
    revisionBufferDays: 1,
    tags,
    comments: [],
    subtasks: [],
  };
}

function hfUxBuildTemplateBoard(type: string, ownerEmail: string, ownerName = "") {
  const owner = ownerEmail || ownerName || "No owner";
  const base: any = {
    id: hfUxUid(),
    name: type,
    archivedAt: "",
    createdAt: new Date().toISOString(),
    boardRoles: ownerEmail ? { [normalizeEmail(ownerEmail)]: { email: ownerEmail, name: ownerName || ownerEmail, role: "Admin" } } : {},
    groups: [],
  };

  if (type === "Engineering Report") {
    base.name = "Engineering Report Project";
    base.groups = [
      { id: hfUxUid(), name: "01 Data & Inputs", collapsed: false, memberRoles: {}, items: [
        hfUxTask(owner, "Collect input data and references", 2, ["Data"]),
        hfUxTask(owner, "Confirm design criteria and assumptions", 3, ["Criteria"]),
      ]},
      { id: hfUxUid(), name: "02 Analysis", collapsed: false, memberRoles: {}, items: [
        hfUxTask(owner, "Run model / calculation", 5, ["Analysis"]),
        hfUxTask(owner, "Export key figures and tables", 6, ["Figure"]),
      ]},
      { id: hfUxUid(), name: "03 Report", collapsed: false, memberRoles: {}, items: [
        hfUxTask(owner, "Draft methodology section", 7, ["Report"]),
        hfUxTask(owner, "Draft results and conclusion", 8, ["Report"]),
      ]},
      { id: hfUxUid(), name: "04 Review", collapsed: false, memberRoles: {}, items: [
        hfUxTask(owner, "PM review", 9, ["Review"]),
        hfUxTask(owner, "Final submission", 10, ["Deliverable"]),
      ]},
    ];
  } else if (type === "Client Review") {
    base.name = "Client Review Project";
    base.groups = [
      { id: hfUxUid(), name: "Client Requests", collapsed: false, memberRoles: {}, items: [
        hfUxTask(owner, "Collect client comments", 2, ["Request"]),
        hfUxTask(owner, "Classify comments by priority", 3, ["Review"]),
      ]},
      { id: hfUxUid(), name: "Internal Response", collapsed: false, memberRoles: {}, items: [
        hfUxTask(owner, "Prepare response table", 5, ["Response"]),
        hfUxTask(owner, "Send revised document to client", 7, ["Deliverable"]),
      ]},
    ];
  } else {
    base.name = "General Project";
    base.groups = [
      { id: hfUxUid(), name: "To Do", collapsed: false, memberRoles: {}, items: [
        hfUxTask(owner, "Define scope", 2, ["Planning"]),
        hfUxTask(owner, "Assign work", 3, ["Planning"]),
      ]},
      { id: hfUxUid(), name: "Doing", collapsed: false, memberRoles: {}, items: [] },
      { id: hfUxUid(), name: "Review", collapsed: false, memberRoles: {}, items: [] },
      { id: hfUxUid(), name: "Done", collapsed: false, memberRoles: {}, items: [] },
    ];
  }

  return base;
}

function PMAlertsPage({ boards, onOpenBoard }: any) {
  const rows = hfUxArray(boards).flatMap((board: any) =>
    hfUxArray(board.groups).flatMap((group: any) =>
      hfUxArray(group.items).map((item: any) => ({ board, group, item }))
    )
  );

  const blockers = rows.filter((r: any) => hfUxArray(r.item.tags).includes("Need Help") || ["Blocked", "Need Revision"].includes(r.item.status));
  const overdue = rows.filter((r: any) => hfUxIsOverdue(r.item));
  const review = rows.filter((r: any) => ["Ready for PM Review", "PM Reviewing", "Need Revision"].includes(r.item.status));

  function AlertSection({ title, items, icon, color }: any) {
    return (
      <div style={{ background: "#fff", border: "1px solid #eef1f7", borderRadius: 14, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span>{icon}</span>
          <b style={{ color: "#323338" }}>{title}</b>
          <span style={{ marginLeft: "auto", color, fontWeight: 950 }}>{items.length}</span>
        </div>
        {items.length === 0 ? (
          <div style={{ color: "#676879", fontSize: 12 }}>Nothing here.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {items.slice(0, 12).map((r: any) => (
              <div key={`${r.board.id}-${r.group.id}-${r.item.id}`} style={{ border: "1px solid #f1f2f6", borderLeft: `4px solid ${color}`, borderRadius: 10, padding: 10 }}>
                <div style={{ fontWeight: 900, fontSize: 13 }}>{r.item.name}</div>
                <div style={{ color: "#676879", fontSize: 11, marginTop: 3 }}>{r.board.name} / {r.group.name} • {r.item.owner || "No owner"} • due {r.item.due || "—"}</div>
                <button onClick={() => onOpenBoard?.(r.board.id, r.item.id)} style={{ marginTop: 8, border: "none", background: "#0073ea", color: "#fff", borderRadius: 8, padding: "6px 10px", fontSize: 11, fontWeight: 900, cursor: "pointer" }}>Open</button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflow: "auto", background: "#f7f8fc", padding: 24 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h1 style={{ margin: 0, color: "#323338" }}>PM Alerts</h1>
        <div style={{ color: "#676879", fontSize: 13, marginTop: 4, marginBottom: 16 }}>Blockers, overdue tasks, and PM review queue.</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14 }}>
          <AlertSection title="Need help / blockers" items={blockers} icon="🚨" color="#e2445c" />
          <AlertSection title="Overdue" items={overdue} icon="⏰" color="#fdab3d" />
          <AlertSection title="Ready for PM review" items={review} icon="👀" color="#579bfc" />
        </div>
      </div>
    </div>
  );
}

function PMReviewInboxPage({ boards, onPatchBoard, onOpenBoard, currentUserName }: any) {
  const rows = hfUxArray(boards).flatMap((board: any) =>
    hfUxArray(board.groups).flatMap((group: any) =>
      hfUxArray(group.items)
        .filter((item: any) => ["Ready for PM Review", "PM Reviewing", "Need Revision"].includes(item.status))
        .map((item: any) => ({ board, group, item }))
    )
  );

  function updateStatus(row: any, status: string, commentText = "") {
    onPatchBoard?.(row.board.id, (current: any) => ({
      ...current,
      groups: hfUxArray(current.groups).map((g: any) => ({
        ...g,
        items: hfUxArray(g.items).map((item: any) => {
          if (String(item.id) !== String(row.item.id)) return item;
          const comment = commentText ? { id: hfUxUid(), author: currentUserName || "PM", text: commentText, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) } : null;
          return {
            ...item,
            status,
            comments: comment ? [...hfUxArray(item.comments), comment] : hfUxArray(item.comments),
            approvalHistory: [...hfUxArray(item.approvalHistory), { id: hfUxUid(), from: item.status, to: status, by: currentUserName || "PM", at: new Date().toISOString() }],
          };
        })
      }))
    }));
  }

  return (
    <div style={{ flex: 1, overflow: "auto", background: "#f7f8fc", padding: 24 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h1 style={{ margin: 0, color: "#323338" }}>PM Review Inbox</h1>
        <div style={{ color: "#676879", fontSize: 13, marginTop: 4, marginBottom: 16 }}>Tasks waiting for PM decision.</div>
        {rows.length === 0 ? (
          <div style={{ background: "#fff", border: "1px dashed #d8dbe4", borderRadius: 14, padding: 30, textAlign: "center" }}>
            <div style={{ fontSize: 34 }}>🎉</div>
            <div style={{ fontWeight: 950, marginTop: 8 }}>No tasks waiting for review</div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {rows.map((r: any) => (
              <div key={`${r.board.id}-${r.group.id}-${r.item.id}`} style={{ background: "#fff", border: "1px solid #eef1f7", borderLeft: "4px solid #579bfc", borderRadius: 12, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 950, color: "#323338" }}>{r.item.name}</div>
                    <div style={{ color: "#676879", fontSize: 11, marginTop: 3 }}>{r.board.name} / {r.group.name} • {r.item.owner || "No owner"} • due {r.item.due || "—"}</div>
                  </div>
                  <span style={{ background: "#eef4ff", color: "#1f5ecf", borderRadius: 999, padding: "4px 8px", fontSize: 11, fontWeight: 900, height: 24 }}>{r.item.status}</span>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                  <button onClick={() => updateStatus(r, "Approved", "Approved by PM.")} style={{ border: "none", background: "#00c875", color: "#fff", borderRadius: 8, padding: "7px 10px", fontSize: 11, fontWeight: 900, cursor: "pointer" }}>Approve</button>
                  <button onClick={() => updateStatus(r, "Need Revision", window.prompt("What should be revised?", "Please revise and resubmit.") || "Please revise and resubmit.")} style={{ border: "none", background: "#e2445c", color: "#fff", borderRadius: 8, padding: "7px 10px", fontSize: 11, fontWeight: 900, cursor: "pointer" }}>Request Revision</button>
                  <button onClick={() => updateStatus(r, "PM Reviewing")} style={{ border: "none", background: "#579bfc", color: "#fff", borderRadius: 8, padding: "7px 10px", fontSize: 11, fontWeight: 900, cursor: "pointer" }}>Mark Reviewing</button>
                  <button onClick={() => onOpenBoard?.(r.board.id, r.item.id)} style={{ border: "1px solid #d8dbe4", background: "#fff", color: "#323338", borderRadius: 8, padding: "7px 10px", fontSize: 11, fontWeight: 900, cursor: "pointer" }}>Open task</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ClientViewPage({ boards, onPatchBoard, currentUserName, currentUserEmail }: any) {
  const activeBoards = hfUxArray(boards).filter((b: any) => !b.archivedAt);
  const [requestText, setRequestText] = useState("");
  const summary = activeBoards.reduce((acc: any, b: any) => {
    const pr = hfUxBoardProgress(b);
    acc.total += pr.total;
    acc.done += pr.done;
    return acc;
  }, { total: 0, done: 0 });
  const pct = summary.total ? Math.round((summary.done / summary.total) * 100) : 0;
  const deliverables = activeBoards.flatMap((b: any) => hfUxArray(b.groups).flatMap((g: any) => hfUxArray(g.items).filter((i: any) => hfUxArray(i.tags).includes("Deliverable")).map((i: any) => ({ board: b, group: g, item: i }))));

  function submitRequest() {
    const text = requestText.trim();
    if (!text) return window.alert("Add request detail first.");
    const board = activeBoards[0];
    if (!board) return window.alert("No board available.");
    onPatchBoard?.(board.id, (current: any) => {
      const groups = hfUxArray(current.groups);
      const firstGroup = groups[0] || { id: hfUxUid(), name: "Client Requests", collapsed: false, memberRoles: {}, items: [] };
      const requestItem = {
        id: hfUxUid(),
        name: text.slice(0, 80),
        owner: currentUserEmail || currentUserName || "Client",
        status: "Not Started",
        priority: "Medium",
        start: hfUxDatePlus(0),
        due: hfUxDatePlus(3),
        pmReviewDate: hfUxDatePlus(2),
        effortHours: 2,
        reviewBufferDays: 1,
        revisionBufferDays: 1,
        tags: ["Request"],
        comments: [{ id: hfUxUid(), author: currentUserName || currentUserEmail || "Client", text, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }],
        subtasks: [],
      };
      if (groups.length === 0) return { ...current, groups: [{ ...firstGroup, items: [requestItem] }] };
      return { ...current, groups: groups.map((g: any, idx: number) => idx === 0 ? { ...g, items: [requestItem, ...hfUxArray(g.items)] } : g) };
    });
    setRequestText("");
    window.alert("Request submitted.");
  }

  return (
    <div style={{ flex: 1, overflow: "auto", background: "#f7f8fc", padding: 24 }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <h1 style={{ margin: 0, color: "#323338" }}>Client View</h1>
        <div style={{ color: "#676879", fontSize: 13, marginTop: 4, marginBottom: 16 }}>Simple progress and request page for clients.</div>
        <div style={{ background: "#fff", border: "1px solid #eef1f7", borderRadius: 16, padding: 18, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14 }}>
            <div>
              <div style={{ color: "#676879", fontSize: 12, fontWeight: 800 }}>Overall progress</div>
              <div style={{ fontSize: 32, fontWeight: 950, color: "#323338" }}>{pct}%</div>
              <div style={{ color: "#676879", fontSize: 12 }}>{summary.done} of {summary.total} tasks complete</div>
            </div>
            <div style={{ flex: 1, height: 12, background: "#eef1f7", borderRadius: 999, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: "#00c875" }} />
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(280px,1fr) minmax(280px,1fr)", gap: 16 }}>
          <div style={{ background: "#fff", border: "1px solid #eef1f7", borderRadius: 14, padding: 16 }}>
            <div style={{ fontWeight: 950, marginBottom: 10 }}>Deliverables</div>
            {deliverables.length === 0 ? <div style={{ color: "#676879", fontSize: 12 }}>No deliverables marked yet.</div> : deliverables.map((r: any) => (
              <div key={r.item.id} style={{ border: "1px solid #f1f2f6", borderRadius: 10, padding: 10, marginBottom: 8 }}>
                <div style={{ fontWeight: 900 }}>{r.item.name}</div>
                <div style={{ color: "#676879", fontSize: 11 }}>{r.board.name} • {r.item.status}</div>
              </div>
            ))}
          </div>

          <div style={{ background: "#fff", border: "1px solid #eef1f7", borderRadius: 14, padding: 16 }}>
            <div style={{ fontWeight: 950 }}>Submit request</div>
            <div style={{ color: "#676879", fontSize: 12, marginTop: 3 }}>Use this instead of editing the internal plan.</div>
            <textarea value={requestText} onChange={e => setRequestText(e.target.value)} placeholder="Write your request or comment..." style={{ width: "100%", minHeight: 110, marginTop: 12, border: "1px solid #d8dbe4", borderRadius: 10, padding: 10, fontSize: 13 }} />
            <button onClick={submitRequest} style={{ marginTop: 10, border: "none", background: "#0073ea", color: "#fff", borderRadius: 9, padding: "9px 12px", fontSize: 12, fontWeight: 950, cursor: "pointer" }}>Send request</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectTemplatesPage({ onCreateTemplate, onBack }: any) {
  const templates = [
    { name: "Engineering Report", icon: "📘", desc: "Data, analysis, report, PM review, final submission." },
    { name: "Client Review", icon: "💬", desc: "Client comments, response table, revised submission." },
    { name: "General Project", icon: "📋", desc: "Simple To Do / Doing / Review / Done board." },
  ];

  return (
    <div style={{ flex: 1, overflow: "auto", background: "#f7f8fc", padding: 24 }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <button onClick={onBack} style={{ border: "1px solid #d8dbe4", background: "#fff", color: "#323338", borderRadius: 9, padding: "8px 11px", fontSize: 12, fontWeight: 900, cursor: "pointer", marginBottom: 14 }}>← Back</button>
        <h1 style={{ margin: 0, color: "#323338" }}>Project Templates</h1>
        <div style={{ color: "#676879", fontSize: 13, marginTop: 4, marginBottom: 16 }}>Start a project without building the board from scratch.</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14 }}>
          {templates.map(t => (
            <div key={t.name} style={{ background: "#fff", border: "1px solid #eef1f7", borderRadius: 16, padding: 18 }}>
              <div style={{ fontSize: 34 }}>{t.icon}</div>
              <div style={{ marginTop: 8, fontSize: 17, fontWeight: 950, color: "#323338" }}>{t.name}</div>
              <div style={{ marginTop: 6, fontSize: 12, color: "#676879", lineHeight: 1.5 }}>{t.desc}</div>
              <button onClick={() => onCreateTemplate(t.name)} style={{ marginTop: 14, border: "none", background: "#0073ea", color: "#fff", borderRadius: 9, padding: "9px 12px", fontSize: 12, fontWeight: 950, cursor: "pointer" }}>Use template</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
'''

if "function PMReviewInboxPage(" not in s:
    idx = s.find("function MyWorkPage(")
    if idx < 0:
        idx = s.find("function HomeTodayPage(")
    if idx < 0:
        idx = s.find("function Sidebar(")
    if idx < 0:
        raise SystemExit("Cannot find insertion point for UX complete pack")
    s = s[:idx] + complete_pack + "\n" + s[idx:]
    print("[ok] UX complete pack pages inserted")
else:
    print("[skip] UX complete pack pages already present")

# 2) Need Help popup in My Work.
need_help_old = 'quickStatus(row, "Need Revision", "Need help / blocker reported.")'
need_help_new = 'quickStatus(row, "Need Revision", window.prompt("What is blocking you?", "Need help / blocker reported.") || "Need help / blocker reported.")'
if need_help_old in s:
    s = s.replace(need_help_old, need_help_new)
    print("[ok] Need Help popup")
else:
    print("[skip] Need Help popup marker not found or already patched")

# 3) AppContent template function and navigation helpers.
create_template_fn = r'''
  function createProjectTemplate(type: string) {
    const board = hfUxBuildTemplateBoard(type, authUser?.email || "", authUser?.displayName || authUser?.email || "");
    setBoards(prev => [...hfUxArray(prev), board]);
    setActiveId(board.id);
    setActiveView("boards");
  }

  function openBoardFromUxPage(boardId: any, itemId: any = null) {
    if (boardId) setActiveId(boardId);
    setActiveView("boards");
    if (itemId) setJumpItemId(itemId);
  }
'''
if "function createProjectTemplate(type: string)" not in s:
    marker = '''  function handleGlobalNavigate(boardId: any, itemId: any) {
    setActiveId(boardId);
    setActiveView("boards");
    setJumpItemId(itemId);
  }
'''
    if marker in s:
        s = s.replace(marker, marker + create_template_fn, 1)
        print("[ok] template/create navigation functions inserted")
    else:
        idx = s.find("  return (", s.find("function AppContent("))
        if idx < 0:
            raise SystemExit("Cannot find AppContent return for template function")
        s = s[:idx] + create_template_fn + "\n" + s[idx:]
        print("[ok] template/create navigation functions inserted fallback")
else:
    print("[skip] template function already exists")

# 4) Archive-first board delete.
if "Archived first instead of permanently deleting" not in s:
    start = s.find("function deleteBoard")
    if start >= 0:
        end = s.find("\n  function ", start + 10)
        if end < 0:
            end = s.find("\nfunction ", start + 10)
        if end < 0:
            end = len(s)
        section = s[start:end]
        old = "    if (!target) return;"
        new = '''    if (!target) return;

    if (!target.archivedAt) {
      if (!window.confirm(`Archive board "${target.name}"? You can restore it later.`)) return;
      archiveBoard(target.id);
      window.alert("Archived first instead of permanently deleting. Restore it from archived boards if needed.");
      return;
    }'''
        if old in section:
            section = section.replace(old, new, 1)
            s = s[:start] + section + s[end:]
            print("[ok] archive-first deleteBoard")
        else:
            print("[skip] archive-first target marker not found")
    else:
        print("[skip] deleteBoard not found")
else:
    print("[skip] archive-first already present")

# 5) Sidebar nav entries.
sidebar_repls = [
    ('["home","🏠","Home"],["mywork","✅","My Work"],["boards","📋","Board"],["dashboard","📊","Report"]',
     '["home","🏠","Home"],["mywork","✅","My Work"],["boards","📋","Board"],["dashboard","📊","Report"],["reviewInbox","👀","Review"],["alerts","🚨","Alerts"],["client","🧾","Client"]'),
    ('["home", "🏠", "Home"], ["mywork", "✅", "My Work"], ["boards", "📋", "Board"], ["dashboard", "📊", "Report"]',
     '["home", "🏠", "Home"], ["mywork", "✅", "My Work"], ["boards", "📋", "Board"], ["dashboard", "📊", "Report"], ["reviewInbox", "👀", "Review"], ["alerts", "🚨", "Alerts"], ["client", "🧾", "Client"]'),
    ('["home","🏠","Home"],["boards","📋","Board"],["dashboard","📊","Report"]',
     '["home","🏠","Home"],["mywork","✅","My Work"],["boards","📋","Board"],["dashboard","📊","Report"],["reviewInbox","👀","Review"],["alerts","🚨","Alerts"],["client","🧾","Client"]'),
]
if '"reviewInbox"' not in s:
    nav_changed = False
    for old, new in sidebar_repls:
        if old in s:
            s = s.replace(old, new, 1)
            nav_changed = True
            print("[ok] sidebar Review/Alerts/Client entries")
            break
    if not nav_changed:
        print("[warn] sidebar nav marker not found")
else:
    print("[skip] sidebar review/client already exists")

# 6) Route pages before My Work/Home route.
if 'activeView === "reviewInbox"' not in s:
    route1 = '{activeView === "mywork"'
    route2 = '{activeView === "home"'
    route_prefix = '{activeView === "templates"\n          ? <ProjectTemplatesPage onCreateTemplate={createProjectTemplate} onBack={() => setActiveView("home")} />\n          : activeView === "reviewInbox"\n          ? <PMReviewInboxPage boards={boards} onPatchBoard={patchBoardById} onOpenBoard={openBoardFromUxPage} currentUserName={authUser.displayName || authUser.email} />\n          : activeView === "alerts"\n          ? <PMAlertsPage boards={boards} onOpenBoard={openBoardFromUxPage} />\n          : activeView === "client"\n          ? <ClientViewPage boards={boards} onPatchBoard={patchBoardById} currentUserName={authUser.displayName || authUser.email} currentUserEmail={authUser.email} />\n          : '
    if route1 in s:
        s = s.replace(route1, route_prefix + 'activeView === "mywork"', 1)
        print("[ok] routes for templates/review/alerts/client")
    elif route2 in s:
        s = s.replace(route2, route_prefix + 'activeView === "home"', 1)
        print("[ok] routes for templates/review/alerts/client fallback")
    else:
        print("[warn] route marker not found")
else:
    print("[skip] review/client routes already exist")

# 7) Add template quick button in topbar.
if 'setActiveView("templates")' not in s:
    marker = '<button onClick={addBoard}'
    if marker in s:
        s = s.replace(marker, '<button onClick={() => setActiveView("templates")} style={{ border: "1px solid #d8dbe4", background: "#fff", color: "#323338", borderRadius: 8, padding: "8px 10px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>Templates</button>\n            ' + marker, 1)
        print("[ok] topbar Templates button")
    else:
        print("[skip] topbar Templates button marker not found")
else:
    print("[skip] topbar Templates button already exists")

# 8) Ensure Team default to My Work effect exists if MyWorkPage exists.
if 'activeBoardMinimalPerms.isTeam && activeView === "home"' not in s and "function MyWorkPage(" in s:
    effect = r'''
  useEffect(() => {
    if (!boardsFirebaseLoaded || !authUser?.email || !activeBoard) return;
    if (activeBoardMinimalPerms?.isTeam && activeView === "home") {
      setActiveView("mywork");
    }
  }, [boardsFirebaseLoaded, authUser?.email, activeBoard?.id, activeBoardMinimalPerms?.isTeam, activeView]);
'''
    marker = '''  function handleGlobalNavigate(boardId: any, itemId: any) {
    setActiveId(boardId);
    setActiveView("boards");
    setJumpItemId(itemId);
  }
'''
    if marker in s:
        s = s.replace(marker, marker + effect, 1)
        print("[ok] team default My Work effect")
    else:
        print("[skip] team default effect marker not found")
else:
    print("[skip] team default My Work effect already exists")

# 9) Safety checks and save.
problem_sigs = []
for i, line in enumerate(s.splitlines(), 1):
    if (line.lstrip().startswith("function Group(") or line.lstrip().startswith("function BoardView(")) and '\\"' in line:
        problem_sigs.append((i, line))
if problem_sigs:
    for i, line in problem_sigs:
        print(f"[FAIL] broken signature line {i}: {line}")
    raise SystemExit(1)

required = [
    "function PMReviewInboxPage(",
    "function ClientViewPage(",
    "function ProjectTemplatesPage(",
    "function PMAlertsPage(",
    "function createProjectTemplate(type: string)",
]
for req in required:
    if req not in s:
        raise SystemExit(f"Missing required marker: {req}")

p.write_text(s, encoding="utf-8")
print("Complete practical UX pack applied.")
PY

cd holifriday-app
npm run build

cd ..
git add -A
git commit -m "Add complete practical UX workflow pack" || echo "Nothing to commit"
git push
