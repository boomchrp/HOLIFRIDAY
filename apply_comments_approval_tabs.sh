#!/usr/bin/env bash
set -euo pipefail

cd /workspaces/HOLIFRIDAY
git checkout main
git pull

python3 <<'PY'
from pathlib import Path

p = Path("holifriday-app/src/App.tsx")
s = p.read_text(encoding="utf-8")

# Safety fix from older patch
s = s.replace('\n          <WorkspaceBadge workspaceId={workspaceId} />', '')

def replace_once(old, new, label):
    global s
    if old not in s:
        print(f"[skip] {label}")
        return False
    s = s.replace(old, new, 1)
    print(f"[ok] {label}")
    return True

# 1) Helper functions: mention extraction, mention rendering, approval history entry
if "function extractMentions(" not in s:
    helper = r'''
function extractMentions(text) {
  const raw = asText(text, "");
  const matches = raw.match(/@([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|[A-Za-z0-9._-]+)/g) || [];
  return uniqueStrings(matches.map(m => m.slice(1).replace(/[),.;:!?]+$/g, "").toLowerCase()).filter(Boolean));
}

function renderMentionText(text) {
  const raw = asText(text, "");
  const parts = raw.split(/(@[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|@[A-Za-z0-9._-]+)/g);
  return <>{parts.map((part, idx) => part.startsWith("@")
    ? <span key={idx} style={{ background: "#eef4ff", color: "#0073ea", borderRadius: 4, padding: "0 3px", fontWeight: 800 }}>{part}</span>
    : <React.Fragment key={idx}>{part}</React.Fragment>
  )}</>;
}

function createApprovalHistoryEntry(fromStatus, toStatus, by = "System") {
  return {
    id: uid(),
    fromStatus: asText(fromStatus, "—"),
    toStatus: asText(toStatus, "—"),
    action: asText(toStatus, "Status changed"),
    by: asText(by, "System"),
    at: new Date().toLocaleString([], { dateStyle: "short", timeStyle: "short" }),
  };
}
'''
    marker = "function TagPill({ label }: any) {\n"
    pos = s.find(marker)
    if pos < 0:
        raise SystemExit("Cannot find TagPill marker")
    s = s[:pos] + helper + "\n" + s[pos:]
    print("[ok] mention + approval helper functions added")
else:
    print("[skip] helper functions already exist")

# 2) Normalize comments with mentions
replace_once(
'''      text: asText(c?.text, ""),
      time: asText(c?.time, ""),''',
'''      text: asText(c?.text, ""),
      mentions: uniqueStrings([...asArray(c?.mentions), ...extractMentions(c?.text)]),
      time: asText(c?.time, ""),''',
"normalize comment mentions"
)

# 3) Normalize approvalHistory so it survives Firebase reload
if "approvalHistory: asArray(task?.approvalHistory)" not in s:
    replace_once(
'''    subtasks: asArray(task?.subtasks).map((s, i) => ({
      id: s?.id ?? uid(),
      name: asText(s?.name, `Subtask ${i + 1}`),
      done: !!s?.done,
    })),
    version,''',
'''    subtasks: asArray(task?.subtasks).map((s, i) => ({
      id: s?.id ?? uid(),
      name: asText(s?.name, `Subtask ${i + 1}`),
      done: !!s?.done,
    })),
    approvalHistory: asArray(task?.approvalHistory).map((h, i) => ({
      id: h?.id ?? uid(),
      fromStatus: asText(h?.fromStatus || h?.from, "—"),
      toStatus: asText(h?.toStatus || h?.to || h?.action, "—"),
      action: asText(h?.action || h?.toStatus || h?.to, "Status changed"),
      by: asText(h?.by || h?.actor || h?.author, "Unknown"),
      at: asText(h?.at || h?.time || h?.createdAt, ""),
      _sort: i,
    })).map(({ _sort, ...rest }) => rest),
    version,''',
"normalize approval history"
    )
else:
    print("[skip] approvalHistory already normalized")

# 4) Add approval history to PM quick actions and dashboard task patches
if "function patchTaskOnBoard(board,groupId,itemId,patch){return" in s:
    old = '''function patchTaskOnBoard(board,groupId,itemId,patch){return {...board,groups:asArray(board.groups).map(group=>group.id!==groupId?group:{...group,items:asArray(group.items).map(item=>item.id===itemId?{...item,...patch}:item)})};}'''
    new = '''function patchTaskOnBoard(board,groupId,itemId,patch){
  return {
    ...board,
    groups: asArray(board.groups).map(group => group.id !== groupId ? group : {
      ...group,
      items: asArray(group.items).map(item => {
        if (item.id !== itemId) return item;
        const next = { ...item, ...patch };
        if (patch?.status && patch.status !== item.status) {
          next.approvalHistory = [...asArray(item.approvalHistory), createApprovalHistoryEntry(item.status, patch.status, patch?.actorName || "PM Action")];
        }
        return next;
      })
    })
  };
}'''
    replace_once(old, new, "patchTaskOnBoard approval history")
else:
    print("[skip] patchTaskOnBoard already expanded or marker missing")

# 5) TaskPanel: status changes create approval history
replace_once(
'''    onUpdate({ ...item, ...patch });''',
'''    const nextPatch = patch?.status && patch.status !== item.status
      ? { ...patch, approvalHistory: [...asArray(item.approvalHistory), createApprovalHistoryEntry(item.status, patch.status, currentUserName || "You")] }
      : patch;
    onUpdate({ ...item, ...nextPatch });''',
"TaskPanel approval history on status change"
)

# 6) TaskPanel: add mentions to new comments
replace_once(
'''  function addComment() {
    if (!canComment || !comment.trim()) return;
    onUpdate({ ...item, comments: [...item.comments, { id: uid(), author: "You", text: comment.trim(), time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }] });
    setComment("");
  }''',
'''  function addComment() {
    if (!canComment || !comment.trim()) return;
    const text = comment.trim();
    onUpdate({ ...item, comments: [...asArray(item.comments), { id: uid(), author: currentUserName || "You", text, mentions: extractMentions(text), time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }] });
    setComment("");
  }''',
"TaskPanel comment mentions"
)

# 7) Render comments with mention highlight and mention chips
replace_once(
'''                  <div style={{ fontSize: 13, color: "#323338" }}>{c.text}</div>''',
'''                  <div style={{ fontSize: 13, color: "#323338", lineHeight: 1.45 }}>{renderMentionText(c.text)}</div>
                  {asArray(c.mentions).length > 0 && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                      {asArray(c.mentions).map(m => <span key={m} style={{ background: "#eef4ff", color: "#0073ea", borderRadius: 999, padding: "1px 7px", fontSize: 10, fontWeight: 800 }}>@{m}</span>)}
                    </div>
                  )}''',
"render highlighted mentions"
)

replace_once(
'''placeholder="Write a comment…"''',
'''placeholder="Write a comment… use @name or @email"''',
"comment input placeholder"
)

# 8) TaskPanel: render approval history
if "Approval History" not in s:
    replace_once(
'''            <div style={{ marginTop: 8, fontSize: 11, color: "#676879", lineHeight: 1.45 }}>{planning.reason}</div>
          </div>

          {/* Tags */}''',
'''            <div style={{ marginTop: 8, fontSize: 11, color: "#676879", lineHeight: 1.45 }}>{planning.reason}</div>
          </div>

          {/* Approval History */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#676879", marginBottom: 8 }}>Approval History ({asArray(item.approvalHistory).length})</div>
            {asArray(item.approvalHistory).length === 0 ? (
              <div style={{ background: "#f6f7fb", border: "1px solid #eef1f7", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "#98a1b3" }}>No approval actions yet.</div>
            ) : (
              <div style={{ background: "#f6f7fb", borderRadius: 8, padding: "8px 10px", display: "grid", gap: 6 }}>
                {asArray(item.approvalHistory).slice().reverse().slice(0, 8).map(h => (
                  <div key={h.id} style={{ borderBottom: "1px solid #e6e9ef", paddingBottom: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#323338" }}>{h.fromStatus} → {h.toStatus}</div>
                    <div style={{ fontSize: 10, color: "#98a1b3", marginTop: 2 }}>{h.by || "Unknown"} • {h.at || "—"}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tags */}''',
"TaskPanel approval history section"
    )
else:
    print("[skip] Approval History section already exists")

# 9) Dashboard Review panel
if "function DashboardReviewPanel(" not in s:
    panel = r'''
function DashboardReviewPanel({ boards }: any) {
  const { dark } = useDark();
  const card = dark ? "#16213e" : "#fff";
  const text = dark ? "#e0e0f0" : "#323338";
  const sub = dark ? "#8888aa" : "#676879";
  const bdr = dark ? "#2a2a4a" : "#eef1f7";
  const records = getBoardTaskRecords(boards);
  const mentionComments = records.flatMap(({ board, group, item }) =>
    asArray(item.comments).filter(c => asArray(c.mentions).length > 0).map(c => ({ board, group, item, comment: c }))
  ).slice(-12).reverse();
  const approvals = records.flatMap(({ board, group, item }) =>
    asArray(item.approvalHistory).map(h => ({ board, group, item, history: h }))
  ).slice(-12).reverse();

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 18, marginBottom: 18 }}>
      <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 900, color: text }}>💬 Mentions</div>
        <div style={{ fontSize: 12, color: sub, marginTop: 3 }}>Comments that include @name or @email.</div>
        {mentionComments.length === 0 ? <p style={{ fontSize: 12, color: sub }}>No mentions yet.</p> : mentionComments.map(r => (
          <div key={`${r.board.id}-${r.item.id}-${r.comment.id}`} style={{ marginTop: 9, padding: 10, border: `1px solid ${bdr}`, borderRadius: 9, background: dark ? "#111827" : "#fafbff" }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: text }}>{r.item.name}</div>
            <div style={{ fontSize: 11, color: sub }}>{r.board.name} • {r.group.name} • {r.comment.author}</div>
            <div style={{ fontSize: 12, color: text, marginTop: 5, lineHeight: 1.45 }}>{renderMentionText(r.comment.text)}</div>
          </div>
        ))}
      </div>

      <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 900, color: text }}>✅ Approval History</div>
        <div style={{ fontSize: 12, color: sub, marginTop: 3 }}>Recent submitted / approved / revision actions.</div>
        {approvals.length === 0 ? <p style={{ fontSize: 12, color: sub }}>No approval history yet.</p> : approvals.map(r => (
          <div key={`${r.board.id}-${r.item.id}-${r.history.id}`} style={{ marginTop: 9, padding: 10, border: `1px solid ${bdr}`, borderRadius: 9, background: dark ? "#111827" : "#fff" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.item.name}</div>
                <div style={{ fontSize: 11, color: sub }}>{r.history.by || "Unknown"} • {r.history.at || "—"}</div>
              </div>
              <span style={{ flexShrink: 0, background: "#eef4ff", color: "#0073ea", borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 900 }}>{r.history.toStatus}</span>
            </div>
            <div style={{ marginTop: 5, fontSize: 11, color: sub }}>{r.history.fromStatus} → {r.history.toStatus}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

'''
    marker = "function PlanningSuitePanel({boards,onPatchBoard}:any)"
    pos = s.find(marker)
    if pos < 0:
        raise SystemExit("Cannot find PlanningSuitePanel marker")
    s = s[:pos] + panel + "\n" + s[pos:]
    print("[ok] DashboardReviewPanel added")
else:
    print("[skip] DashboardReviewPanel already exists")

# 10) Better Dashboard Tabs
replace_once(
'''  const bdr  = dark ? "#2a2a4a" : "#f0f0f0";

  const allItems = boards.flatMap((b: any) => b.groups.flatMap((g: any) => g.items));''',
'''  const bdr  = dark ? "#2a2a4a" : "#f0f0f0";
  const [dashTab, setDashTab] = useState("overview");

  const allItems = boards.flatMap((b: any) => b.groups.flatMap((g: any) => g.items));''',
"Dashboard tab state"
)

if 'dashTab === "reviews"' not in s:
    replace_once(
'''      <h2 style={{ margin: "0 0 24px", fontSize: 20, fontWeight: 800, color: text }}>📊 Dashboard</h2>
      <PlanningSuitePanel boards={boards} onPatchBoard={onPatchBoard} />
      <GanttWhatIfPanel boards={boards} />

      {/* KPI cards */}''',
'''      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: text }}>📊 Dashboard</h2>
        <div style={{ display: "flex", gap: 6, background: card, border: `1px solid ${bdr}`, borderRadius: 999, padding: 4 }}>
          {[
            ["overview", "Overview"],
            ["planning", "Planning"],
            ["reviews", "Comments & Approval"],
          ].map(([key, label]) => (
            <button key={key} onClick={() => setDashTab(key)} style={{ border: "none", borderRadius: 999, padding: "6px 12px", background: dashTab === key ? "#0073ea" : "transparent", color: dashTab === key ? "#fff" : sub, fontSize: 12, fontWeight: 900, cursor: "pointer" }}>{label}</button>
          ))}
        </div>
      </div>

      {dashTab === "planning" && <><PlanningSuitePanel boards={boards} onPatchBoard={onPatchBoard} /><GanttWhatIfPanel boards={boards} /></>}
      {dashTab === "reviews" && <DashboardReviewPanel boards={boards} />}

      {dashTab === "overview" && <>
      {/* KPI cards */}''',
"Dashboard tab header"
    )

    signup_idx = s.find("// ─── Public Signup")
    if signup_idx < 0:
        raise SystemExit("Cannot find Public Signup marker")
    close_marker = "    </div>\n  );\n}\n\n"
    close_idx = s.rfind(close_marker, 0, signup_idx)
    if close_idx < 0:
        raise SystemExit("Cannot find Dashboard closing marker")
    s = s[:close_idx] + "      </>}\n" + s[close_idx:]
    print("[ok] Dashboard overview wrapped in tab")
else:
    print("[skip] Dashboard tabs already added")

p.write_text(s, encoding="utf-8")
print("Patch complete: mentions, approval history, dashboard tabs")
PY

cd holifriday-app
npm run build

cd ..
git add -A
git commit -m "Add mentions approval history and dashboard tabs"
git push
