#!/usr/bin/env bash
set -euo pipefail

cd /workspaces/HOLIFRIDAY
git checkout main
git pull

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

team_helpers_and_page = r'''
function teamMinimalNormalizeRole(value) {
  const v = asText(value || "Viewer").trim().toLowerCase();
  if (v === "admin") return "Admin";
  if (v === "editor") return "Editor";
  if (v === "reviewer") return "Reviewer";
  if (v === "client") return "Client";
  if (v === "viewer" || v === "view") return "Viewer";
  return "Viewer";
}

function teamMinimalRole(board, email) {
  const normalizedEmail = normalizeEmail(email);
  const roleMap = board?.boardRoles && typeof board.boardRoles === "object" ? board.boardRoles : {};
  const rows: any[] = Object.values(roleMap);

  // Existing boards without role matrix remain fully editable for the owner/admin workflow.
  if (rows.length === 0) return "Admin";
  if (!normalizedEmail) return "Viewer";

  const direct: any = roleMap[memberRoleKey(normalizedEmail)] || roleMap[normalizedEmail];
  if (direct) return teamMinimalNormalizeRole(direct.role || direct);

  const found: any = rows.find((r: any) => normalizeEmail(r?.email) === normalizedEmail);
  return found ? teamMinimalNormalizeRole(found.role) : "Viewer";
}

function teamMinimalPermissions(role) {
  const r = teamMinimalNormalizeRole(role);
  return {
    role: r,
    canAdmin: r === "Admin",
    canEdit: r === "Admin" || r === "Editor",
    canReview: r === "Admin" || r === "Editor" || r === "Reviewer",
    canComment: r === "Admin" || r === "Editor" || r === "Reviewer" || r === "Client",
    canRequest: r === "Admin" || r === "Editor" || r === "Client",
    isTeam: r !== "Admin",
  };
}

function teamMinimalIsMine(item, email, name = "") {
  const owner = asText(item?.owner);
  const emailKey = normalizeEmail(email);
  const nameKey = asText(name).trim().toLowerCase();
  return !!owner && (
    normalizeEmail(owner) === emailKey ||
    owner.trim().toLowerCase() === nameKey ||
    owner.trim().toLowerCase() === emailKey
  );
}

function teamMinimalTaskRows(boards, email, name = "") {
  const rows: any[] = [];
  for (const board of asArray(boards).filter((b: any) => !b.archivedAt)) {
    for (const group of asArray(board.groups)) {
      for (const item of asArray(group.items)) {
        if (teamMinimalIsMine(item, email, name)) rows.push({ board, group, item });
      }
    }
  }
  return rows;
}

function MyWorkPage({ boards, currentUserEmail, currentUserName, onPatchBoard, onOpenBoard, onOpenReport }: any) {
  const { dark } = useDark();
  const bg = dark ? "#0f0f1e" : "#f7f8fc";
  const card = dark ? "#16213e" : "#fff";
  const text = dark ? "#e0e0f0" : "#323338";
  const sub = dark ? "#8888aa" : "#676879";
  const bdr = dark ? "#2a2a4a" : "#eef1f7";

  const [checkTaskId, setCheckTaskId] = useState("");
  const [doneText, setDoneText] = useState("");
  const [blockerText, setBlockerText] = useState("");
  const [showDone, setShowDone] = useLocalStorage("holifriday_mywork_show_done", false);

  const myRows = teamMinimalTaskRows(boards, currentUserEmail, currentUserName);
  const openRows = myRows.filter(r => isOpenPlanningTask(r.item));
  const doneRows = myRows.filter(r => !isOpenPlanningTask(r.item));
  const displayRows = (showDone ? myRows : openRows).sort((a, b) => {
    const ad = a.item.due || "9999-99-99";
    const bd = b.item.due || "9999-99-99";
    return ad.localeCompare(bd);
  });
  const today = new Date(new Date().toDateString());
  const overdue = openRows.filter(r => isOverdue(r.item.due));
  const dueToday = openRows.filter(r => {
    const d = parseDateOnly(r.item.due);
    return d && diffDays(today, d) === 0;
  });
  const review = myRows.filter(r => ["Ready for PM Review", "PM Reviewing", "Need Revision"].includes(r.item.status));

  const selectedForCheck = checkTaskId || displayRows[0]?.item?.id || "";

  function patchTask(row, patch) {
    if (!row?.board?.id || !row?.item?.id) return;
    onPatchBoard?.(row.board.id, current => ({
      ...current,
      groups: asArray(current.groups).map(g => ({
        ...g,
        items: asArray(g.items).map(item => {
          if (String(item.id) !== String(row.item.id)) return item;
          const nextPatch = patch?.status && patch.status !== item.status
            ? { ...patch, approvalHistory: [...asArray(item.approvalHistory), createApprovalHistoryEntry(item.status, patch.status, currentUserName || "You")] }
            : patch;
          return { ...item, ...nextPatch };
        })
      }))
    }));
  }

  function quickStatus(row, status, commentText = "") {
    const comment = commentText.trim()
      ? { id: uid(), author: currentUserName || currentUserEmail || "You", text: commentText.trim(), mentions: extractMentions(commentText), time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }
      : null;
    patchTask(row, {
      status,
      comments: comment ? [...asArray(row.item.comments), comment] : asArray(row.item.comments),
      tags: status === "Need Revision" ? uniqueStrings([...asArray(row.item.tags), "Need Help"]) : asArray(row.item.tags),
    });
  }

  function submitCheckIn() {
    const row = myRows.find(r => String(r.item.id) === String(selectedForCheck));
    if (!row) {
      window.alert("Select a task first.");
      return;
    }
    if (!doneText.trim() && !blockerText.trim()) {
      window.alert("Add a short update first.");
      return;
    }
    const textLines = [
      "Daily check-in",
      doneText.trim() ? `Done: ${doneText.trim()}` : "",
      blockerText.trim() ? `Blocker: ${blockerText.trim()}` : "",
    ].filter(Boolean);
    const comment = {
      id: uid(),
      author: currentUserName || currentUserEmail || "You",
      text: textLines.join("\\n"),
      mentions: extractMentions(textLines.join("\\n")),
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    patchTask(row, { comments: [...asArray(row.item.comments), comment] });
    setDoneText("");
    setBlockerText("");
    window.alert("Check-in submitted.");
  }

  function StatCard({ title, value, color, icon }: any) {
    return (
      <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 14, padding: 14 }}>
        <div style={{ fontSize: 18 }}>{icon}</div>
        <div style={{ marginTop: 5, fontSize: 26, fontWeight: 950, color }}>{value}</div>
        <div style={{ fontSize: 11, color: sub, fontWeight: 800 }}>{title}</div>
      </div>
    );
  }

  function StatusButton({ children, onClick, color = "#0073ea" }: any) {
    return (
      <button onClick={onClick} style={{ border: "none", borderRadius: 8, background: color, color: "#fff", padding: "7px 10px", fontSize: 11, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap" }}>
        {children}
      </button>
    );
  }

  return (
    <div style={{ flex: 1, overflow: "auto", background: bg, padding: 24 }}>
      <div style={{ maxWidth: 1160, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 950, color: text, letterSpacing: -0.7 }}>My Work</div>
            <div style={{ marginTop: 4, fontSize: 13, color: sub }}>Only your tasks. Update with one click.</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => setShowDone((v: boolean) => !v)} style={{ border: `1px solid ${bdr}`, background: card, color: text, borderRadius: 9, padding: "8px 11px", fontSize: 12, fontWeight: 900, cursor: "pointer" }}>
              {showDone ? "Hide done" : "Show done"}
            </button>
            <button onClick={onOpenReport} style={{ border: `1px solid ${bdr}`, background: card, color: text, borderRadius: 9, padding: "8px 11px", fontSize: 12, fontWeight: 900, cursor: "pointer" }}>Open Report</button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 16 }}>
          <StatCard icon="📌" title="Open tasks" value={openRows.length} color="#0073ea" />
          <StatCard icon="⚠️" title="Overdue" value={overdue.length} color="#e2445c" />
          <StatCard icon="📍" title="Due today" value={dueToday.length} color="#fdab3d" />
          <StatCard icon="✅" title="Review queue" value={review.length} color="#579bfc" />
          <StatCard icon="🏁" title="Done" value={doneRows.length} color="#00c875" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(320px,1.25fr) minmax(280px,.75fr)", gap: 16 }}>
          <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 14, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 950, color: text }}>Task list</div>
                <div style={{ fontSize: 12, color: sub, marginTop: 2 }}>Use the buttons. No need to open the full board.</div>
              </div>
            </div>

            {displayRows.length === 0 ? (
              <div style={{ padding: 28, textAlign: "center", border: `1px dashed ${bdr}`, borderRadius: 14 }}>
                <div style={{ fontSize: 30 }}>🎉</div>
                <div style={{ marginTop: 8, fontSize: 16, fontWeight: 900, color: text }}>No assigned tasks</div>
                <div style={{ marginTop: 5, fontSize: 12, color: sub }}>When PM assigns work to you, it will appear here.</div>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 9 }}>
                {displayRows.map(row => {
                  const item = row.item;
                  const late = isOpenPlanningTask(item) && isOverdue(item.due);
                  const due = parseDateOnly(item.due);
                  const todayDue = due && diffDays(today, due) === 0;
                  return (
                    <div key={`${row.board.id}-${row.group.id}-${item.id}`} style={{ border: `1px solid ${bdr}`, borderLeft: `4px solid ${late ? "#e2445c" : todayDue ? "#fdab3d" : "#0073ea"}`, borderRadius: 12, padding: 12, background: dark ? "#101827" : "#fff" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 950, color: text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                          <div style={{ marginTop: 3, fontSize: 11, color: sub }}>{row.board.name} / {row.group.name} • due {item.due || "—"}</div>
                        </div>
                        <span style={{ height: 22, background: late ? "#fde8ec" : "#eef4ff", color: late ? "#e2445c" : "#1f5ecf", borderRadius: 999, padding: "3px 8px", fontSize: 10, fontWeight: 900, whiteSpace: "nowrap" }}>{item.status}</span>
                      </div>
                      <div style={{ marginTop: 10, display: "flex", gap: 7, flexWrap: "wrap" }}>
                        <StatusButton onClick={() => quickStatus(row, "In Progress")} color="#0073ea">Start</StatusButton>
                        <StatusButton onClick={() => quickStatus(row, "Done")} color="#00c875">Done</StatusButton>
                        <StatusButton onClick={() => quickStatus(row, "Need Revision", "Need help / blocker reported.")} color="#e2445c">Need Help</StatusButton>
                        <StatusButton onClick={() => quickStatus(row, "Ready for PM Review")} color="#579bfc">Send to Review</StatusButton>
                        <button onClick={() => onOpenBoard(row.board.id)} style={{ border: `1px solid ${bdr}`, background: card, color: text, borderRadius: 8, padding: "7px 10px", fontSize: 11, fontWeight: 900, cursor: "pointer" }}>Open</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 14, padding: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 950, color: text }}>Daily check-in</div>
              <div style={{ fontSize: 12, color: sub, marginTop: 2 }}>Send one short update to the task comments.</div>
              <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                <select value={String(selectedForCheck)} onChange={e => setCheckTaskId(e.target.value)} style={{ border: `1px solid ${bdr}`, borderRadius: 8, padding: "8px 9px", background: card, color: text, fontSize: 12 }}>
                  {myRows.map(row => <option key={row.item.id} value={String(row.item.id)}>{row.item.name}</option>)}
                </select>
                <textarea value={doneText} onChange={e => setDoneText(e.target.value)} placeholder="What did you work on?" style={{ border: `1px solid ${bdr}`, borderRadius: 8, padding: 9, background: card, color: text, minHeight: 72, fontSize: 12 }} />
                <textarea value={blockerText} onChange={e => setBlockerText(e.target.value)} placeholder="Any blocker? Leave blank if none." style={{ border: `1px solid ${bdr}`, borderRadius: 8, padding: 9, background: card, color: text, minHeight: 72, fontSize: 12 }} />
                <button onClick={submitCheckIn} style={{ border: "none", borderRadius: 9, background: "#0073ea", color: "#fff", padding: "9px 12px", fontSize: 12, fontWeight: 950, cursor: "pointer" }}>Submit check-in</button>
              </div>
            </div>

            <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 14, padding: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 950, color: text }}>How to use</div>
              <div style={{ marginTop: 10, display: "grid", gap: 9 }}>
                {[
                  ["1", "Start when you begin work."],
                  ["2", "Done when your part is finished."],
                  ["3", "Need Help if you are blocked."],
                  ["4", "Send to Review when PM should check."],
                ].map(([n, msg]) => (
                  <div key={n} style={{ display: "flex", gap: 9 }}>
                    <div style={{ width: 22, height: 22, borderRadius: 999, background: "#eef4ff", color: "#0073ea", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 950 }}>{n}</div>
                    <div style={{ fontSize: 12, color: sub, lineHeight: 1.45 }}>{msg}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
'''

if "function MyWorkPage(" not in s:
    # Insert before Sidebar or before HomeTodayPage.
    idx = s.find("function HomeTodayPage(")
    if idx < 0:
        idx = s.find("// ─── Sidebar")
    if idx < 0:
        idx = s.find("function Sidebar(")
    if idx < 0:
        raise SystemExit("Cannot find insertion point for MyWorkPage")
    s = s[:idx] + team_helpers_and_page + "\n" + s[idx:]
    print("[ok] MyWorkPage inserted")
else:
    print("[skip] MyWorkPage already exists")

# Sidebar navigation: add My Work.
nav_variants = [
    ('[["home","🏠","Home"],["boards","📋","Board"],["dashboard","📊","Report"]]',
     '[["home","🏠","Home"],["mywork","✅","My Work"],["boards","📋","Board"],["dashboard","📊","Report"]]'),
    ('[["home", "🏠", "Home"], ["boards", "📋", "Board"], ["dashboard", "📊", "Report"]]',
     '[["home", "🏠", "Home"], ["mywork", "✅", "My Work"], ["boards", "📋", "Board"], ["dashboard", "📊", "Report"]]'),
    ('[["dashboard","📊","Dashboard"],["boards","📋","Boards"]]',
     '[["home","🏠","Home"],["mywork","✅","My Work"],["boards","📋","Board"],["dashboard","📊","Report"]]'),
]
if '"mywork"' not in s:
    changed = False
    for old, new in nav_variants:
        if old in s:
            s = s.replace(old, new, 1)
            print("[ok] Sidebar My Work nav")
            changed = True
            break
    if not changed:
        print("[warn] Sidebar nav pattern not found")
else:
    print("[skip] Sidebar already has My Work")

# AppContent: add current role/permissions after activeBoard.
if "const activeBoardMinimalRole = teamMinimalRole(activeBoard, authUser?.email);" not in s:
    marker = "  const activeBoard = activeBoards.find((b: any) => b.id === activeId) || activeBoards[0] || boards[0];\n"
    replacement = marker + "  const activeBoardMinimalRole = teamMinimalRole(activeBoard, authUser?.email);\n  const activeBoardMinimalPerms = teamMinimalPermissions(activeBoardMinimalRole);\n"
    replace_once(marker, replacement, "active board minimal role")
else:
    print("[skip] active board role already exists")

# Default team users to My Work.
default_effect = r'''
  useEffect(() => {
    if (!boardsFirebaseLoaded || !authUser?.email || !activeBoard) return;
    if (activeBoardMinimalPerms.isTeam && activeView === "home") {
      setActiveView("mywork");
    }
  }, [boardsFirebaseLoaded, authUser?.email, activeBoard?.id, activeBoardMinimalPerms.isTeam, activeView]);
'''
if "activeBoardMinimalPerms.isTeam && activeView === \"home\"" not in s:
    marker = '''  function handleGlobalNavigate(boardId: any, itemId: any) {
    setActiveId(boardId);
    setActiveView("boards");
    setJumpItemId(itemId);
  }
'''
    if marker in s:
        s = s.replace(marker, marker + default_effect, 1)
        print("[ok] default team user to My Work")
    else:
        # fallback after global search state
        marker2 = "  const [jumpItemId, setJumpItemId] = useState<any>(null);\n"
        s = s.replace(marker2, marker2 + default_effect, 1)
        print("[ok] default team user to My Work fallback")
else:
    print("[skip] default team user effect already exists")

# Route My Work page before Home.
if 'activeView === "mywork"' not in s:
    old = '{activeView === "home"\n          ? <HomeTodayPage'
    new = '{activeView === "mywork"\n          ? <MyWorkPage boards={boards} currentUserEmail={authUser.email} currentUserName={authUser.displayName || authUser.email} onPatchBoard={patchBoardById} onOpenBoard={(boardId?: any) => { if (boardId) setActiveId(boardId); setActiveView("boards"); }} onOpenReport={() => setActiveView("dashboard")} />\n          : activeView === "home"\n          ? <HomeTodayPage'
    if old in s:
        s = s.replace(old, new, 1)
        print("[ok] My Work route")
    else:
        print("[warn] My Work route marker not found")
else:
    print("[skip] My Work route already exists")

# If default view still boards, change to home; team redirect handles mywork.
s = s.replace('const [activeView, setActiveView] = useState("boards"); // boards | dashboard',
              'const [activeView, setActiveView] = useState("home"); // home | mywork | boards | dashboard')

# Dashboard: force non-admin to simple mode and pass current email.
s = s.replace('simpleMode={simpleMode} currentUserEmail={authUser.email}', 'simpleMode={simpleMode || activeBoardMinimalPerms.isTeam} currentUserEmail={authUser.email}')
s = s.replace('simpleMode={simpleMode} />', 'simpleMode={simpleMode || activeBoardMinimalPerms.isTeam} />')
s = s.replace('simpleMode={simpleMode}', 'simpleMode={simpleMode || activeBoardMinimalPerms.isTeam}')

# Topbar simple/advanced toggle: non-admin sees Team mode and cannot toggle advanced.
if "Team mode" not in s:
    s = s.replace(
        'onClick={() => setSimpleMode((v: boolean) => !v)} title="Switch between simple and advanced mode"',
        'onClick={() => { if (activeBoardMinimalPerms.canAdmin) setSimpleMode((v: boolean) => !v); }} title={activeBoardMinimalPerms.canAdmin ? "Switch between simple and advanced mode" : "Team users stay in minimal mode"}',
        1
    )
    s = s.replace(
        '{simpleMode ? "Simple mode" : "Advanced mode"}',
        '{activeBoardMinimalPerms.isTeam ? "Team mode" : simpleMode ? "Simple mode" : "Advanced mode"}',
        1
    )
    print("[ok] Team mode toggle behavior")
else:
    print("[skip] Team mode toggle already exists")

# Add quick status labels if old strings exist.
s = s.replace("Need Help / blocker reported.", "Need help / blocker reported.")

# Basic sanity
needed = [
    "function MyWorkPage(",
    '"mywork"',
    "activeBoardMinimalPerms.isTeam",
    "Daily check-in",
    "Send to Review",
]
for n in needed:
    if n not in s:
        raise SystemExit(f"Missing expected patch marker: {n}")

p.write_text(s, encoding="utf-8")
print("Team Minimal Mode patch complete.")
PY

cd holifriday-app
npm run build

cd ..
git add -A
git commit -m "Add team minimal my work mode" || echo "Nothing to commit"
git push
