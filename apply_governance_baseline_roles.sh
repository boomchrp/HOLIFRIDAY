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

governance_component = r'''
function GovernancePanel({ boards, onPatchBoard }: any) {
  const { dark } = useDark();
  const card = dark ? "#16213e" : "#fff";
  const bg = dark ? "#101827" : "#fafbff";
  const text = dark ? "#e0e0f0" : "#323338";
  const sub = dark ? "#8888aa" : "#676879";
  const bdr = dark ? "#2a2a4a" : "#eef1f7";

  const boardList = asArray(boards).filter((b: any) => !b.archivedAt);
  const [boardId, setBoardId] = useState(boardList[0]?.id || "");
  const board = boardList.find((b: any) => String(b.id) === String(boardId)) || boardList[0];

  const [baselineName, setBaselineName] = useState("");
  const [selectedBaselineId, setSelectedBaselineId] = useState("");
  const [roleEmail, setRoleEmail] = useState("");
  const [roleName, setRoleName] = useState("");
  const [roleValue, setRoleValue] = useState("Editor");

  const inputStyle = { border: `1px solid ${bdr}`, borderRadius: 8, padding: "8px 9px", background: card, color: text, fontSize: 12 } as any;
  const primaryBtn = { border: "none", borderRadius: 8, background: "#0073ea", color: "#fff", padding: "8px 12px", fontSize: 12, fontWeight: 900, cursor: "pointer" } as any;
  const secondaryBtn = { border: `1px solid ${bdr}`, borderRadius: 8, background: card, color: text, padding: "8px 12px", fontSize: 12, fontWeight: 900, cursor: "pointer" } as any;

  useEffect(() => {
    if (boardList.length && !boardList.some((b: any) => String(b.id) === String(boardId))) {
      setBoardId(boardList[0].id);
    }
  }, [boardList.length, boardId]);

  const baselines = asArray(board?.planBaselines);
  const selectedBaseline = baselines.find((b: any) => String(b.id) === String(selectedBaselineId)) || baselines[0];
  const roleMap = board?.boardRoles && typeof board.boardRoles === "object" ? board.boardRoles : {};
  const roleRows = Object.values(roleMap);

  function taskSnapshot(item, group) {
    return {
      id: String(item.id),
      groupId: String(group.id),
      groupName: asText(group.name),
      name: asText(item.name),
      owner: asText(item.owner),
      status: asText(item.status),
      priority: asText(item.priority),
      start: asText(item.start),
      due: asText(item.due),
      pmReviewDate: asText(item.pmReviewDate),
      effortHours: Number(item.effortHours || 0),
    };
  }

  function boardTaskSnapshots(sourceBoard) {
    return asArray(sourceBoard?.groups).flatMap(group => asArray(group.items).map(item => taskSnapshot(item, group)));
  }

  function captureBaseline() {
    if (!board) return;
    const name = baselineName.trim() || `Baseline ${baselines.length + 1}`;
    const snapshot = {
      id: uid(),
      name,
      createdAt: new Date().toISOString(),
      taskCount: boardTaskSnapshots(board).length,
      tasks: boardTaskSnapshots(board),
    };
    onPatchBoard?.(board.id, current => ({
      ...current,
      planBaselines: [snapshot, ...asArray(current.planBaselines)].slice(0, 20),
    }));
    setBaselineName("");
    setSelectedBaselineId(String(snapshot.id));
    window.alert(`Baseline captured: ${name}`);
  }

  function deleteBaseline(id) {
    if (!board) return;
    if (!window.confirm("Delete this baseline?")) return;
    onPatchBoard?.(board.id, current => ({
      ...current,
      planBaselines: asArray(current.planBaselines).filter(b => String(b.id) !== String(id)),
    }));
  }

  function restoreBaselineDates() {
    if (!board || !selectedBaseline) return;
    if (!window.confirm(`Restore Start/Due/PM Review dates from "${selectedBaseline.name}"?`)) return;
    const baseMap = new Map(asArray(selectedBaseline.tasks).map(t => [String(t.id), t]));
    onPatchBoard?.(board.id, current => ({
      ...current,
      groups: asArray(current.groups).map(group => ({
        ...group,
        items: asArray(group.items).map(item => {
          const base = baseMap.get(String(item.id));
          if (!base) return item;
          return {
            ...item,
            start: base.start || "",
            due: base.due || "",
            pmReviewDate: base.pmReviewDate || "",
          };
        }),
      })),
    }));
  }

  const comparisonRows = useMemo(() => {
    if (!board || !selectedBaseline) return [];
    const current = boardTaskSnapshots(board);
    const currentMap = new Map(current.map(t => [String(t.id), t]));
    const baseMap = new Map(asArray(selectedBaseline.tasks).map(t => [String(t.id), t]));
    const ids = uniqueStrings([...Array.from(baseMap.keys()), ...Array.from(currentMap.keys())]);
    return ids.map(id => {
      const base: any = baseMap.get(id);
      const cur: any = currentMap.get(id);
      const baseDue = parseDateOnly(base?.due);
      const curDue = parseDateOnly(cur?.due);
      const dueShift = baseDue && curDue ? diffDays(baseDue, curDue) : null;
      const baseStart = parseDateOnly(base?.start);
      const curStart = parseDateOnly(cur?.start);
      const startShift = baseStart && curStart ? diffDays(baseStart, curStart) : null;
      const changes: string[] = [];
      if (!base) changes.push("New task");
      if (!cur) changes.push("Deleted / missing");
      if (base && cur) {
        if (base.owner !== cur.owner) changes.push("Owner changed");
        if (base.status !== cur.status) changes.push("Status changed");
        if (base.effortHours !== cur.effortHours) changes.push("Effort changed");
        if (startShift !== 0 && startShift !== null) changes.push(`Start ${startShift > 0 ? "+" : ""}${startShift}d`);
        if (dueShift !== 0 && dueShift !== null) changes.push(`Due ${dueShift > 0 ? "+" : ""}${dueShift}d`);
      }
      const risk = dueShift !== null && dueShift > 0 ? "Delay" : changes.length ? "Changed" : "On Baseline";
      return { id, base, cur, dueShift, startShift, changes, risk };
    }).sort((a, b) => {
      const aw = a.risk === "Delay" ? 2 : a.risk === "Changed" ? 1 : 0;
      const bw = b.risk === "Delay" ? 2 : b.risk === "Changed" ? 1 : 0;
      return bw - aw || Math.abs(b.dueShift || 0) - Math.abs(a.dueShift || 0);
    });
  }, [board, selectedBaselineId, boards]);

  function exportBaselineCsv() {
    if (!selectedBaseline) return;
    const rows = [["Task","Group","Baseline Start","Current Start","Start Shift","Baseline Due","Current Due","Due Shift","Baseline Status","Current Status","Baseline Owner","Current Owner","Changes"]];
    for (const r of comparisonRows) {
      rows.push([
        r.cur?.name || r.base?.name || "",
        r.cur?.groupName || r.base?.groupName || "",
        r.base?.start || "",
        r.cur?.start || "",
        r.startShift === null ? "" : String(r.startShift),
        r.base?.due || "",
        r.cur?.due || "",
        r.dueShift === null ? "" : String(r.dueShift),
        r.base?.status || "",
        r.cur?.status || "",
        r.base?.owner || "",
        r.cur?.owner || "",
        r.changes.join("; "),
      ]);
    }
    downloadText(`holifriday-baseline-${safeFileName(selectedBaseline.name)}.csv`, rows.map(r => r.map(csvCell).join(",")).join("\n"), "text/csv;charset=utf-8");
  }

  function addRole() {
    if (!board || !normalizeEmail(roleEmail)) return;
    const email = normalizeEmail(roleEmail);
    const key = memberRoleKey(email);
    const role = {
      email,
      name: roleName.trim() || memberLabel(email),
      role: roleValue,
      updatedAt: new Date().toISOString(),
    };
    onPatchBoard?.(board.id, current => ({
      ...current,
      boardRoles: {
        ...(current.boardRoles && typeof current.boardRoles === "object" ? current.boardRoles : {}),
        [key]: role,
      },
    }));
    setRoleEmail("");
    setRoleName("");
  }

  function removeRole(email) {
    if (!board || !email) return;
    const key = memberRoleKey(email);
    onPatchBoard?.(board.id, current => {
      const next = { ...(current.boardRoles && typeof current.boardRoles === "object" ? current.boardRoles : {}) };
      delete next[key];
      return { ...current, boardRoles: next };
    });
  }

  function permissionSummary(role) {
    const r = asText(role).toLowerCase();
    if (r === "admin") return "Full control: settings, archive/delete, automation, export";
    if (r === "editor") return "Can create/edit tasks and update plan";
    if (r === "reviewer") return "Can comment, review, approve/reject";
    if (r === "viewer") return "Read-only access";
    if (r === "client") return "Request form / comment only";
    return "Custom access";
  }

  if (!board) return <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16, color: sub }}>No active board available.</div>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 900, color: text }}>🛡️ Governance Center</div>
            <div style={{ fontSize: 12, color: sub, marginTop: 3 }}>Baseline / version control and board-level role management.</div>
          </div>
          <select value={String(board.id)} onChange={e => setBoardId(e.target.value)} style={inputStyle}>
            {boardList.map((b: any) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px,1fr) minmax(320px,1fr)", gap: 14 }}>
        <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: text }}>📌 Baseline / Version Plan</div>
          <div style={{ fontSize: 12, color: sub, marginTop: 3 }}>Capture current plan and compare later delay / change from baseline.</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginTop: 12 }}>
            <input value={baselineName} onChange={e => setBaselineName(e.target.value)} placeholder="Baseline name e.g. Contract Plan Rev.0" style={inputStyle} />
            <button onClick={captureBaseline} style={primaryBtn}>Capture Baseline</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, marginTop: 10 }}>
            <select value={String(selectedBaseline?.id || "")} onChange={e => setSelectedBaselineId(e.target.value)} style={inputStyle}>
              {baselines.length === 0 ? <option value="">No baseline yet</option> : baselines.map((b: any) => <option key={b.id} value={String(b.id)}>{b.name} • {new Date(b.createdAt).toLocaleDateString()} • {b.taskCount || asArray(b.tasks).length} tasks</option>)}
            </select>
            <button onClick={exportBaselineCsv} disabled={!selectedBaseline} style={secondaryBtn}>Export CSV</button>
            <button onClick={restoreBaselineDates} disabled={!selectedBaseline} style={{ ...secondaryBtn, color: "#e2445c" }}>Restore Dates</button>
          </div>

          {selectedBaseline && (
            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: sub }}>Selected: {selectedBaseline.name}</span>
              <button onClick={() => deleteBaseline(selectedBaseline.id)} style={{ border: "none", background: "transparent", color: "#e2445c", fontSize: 11, fontWeight: 900, cursor: "pointer" }}>Delete baseline</button>
            </div>
          )}
        </div>

        <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: text }}>🔐 Permission / Role Control</div>
          <div style={{ fontSize: 12, color: sub, marginTop: 3 }}>Board role matrix for Admin / Editor / Reviewer / Viewer / Client.</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 130px auto", gap: 8, marginTop: 12 }}>
            <input value={roleEmail} onChange={e => setRoleEmail(e.target.value)} placeholder="email@company.com" style={inputStyle} />
            <input value={roleName} onChange={e => setRoleName(e.target.value)} placeholder="Display name" style={inputStyle} />
            <select value={roleValue} onChange={e => setRoleValue(e.target.value)} style={inputStyle}>
              <option>Admin</option>
              <option>Editor</option>
              <option>Reviewer</option>
              <option>Viewer</option>
              <option>Client</option>
            </select>
            <button onClick={addRole} style={primaryBtn}>Add Role</button>
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            {roleRows.length === 0 ? <div style={{ fontSize: 12, color: sub }}>No board roles yet. Add at least one admin before sharing broadly.</div> : roleRows.map((r: any) => (
              <div key={r.email} style={{ display: "flex", gap: 10, alignItems: "center", border: `1px solid ${bdr}`, borderRadius: 9, padding: "8px 10px", background: bg }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: text }}>{r.name || memberLabel(r.email)} <span style={{ color: "#0073ea" }}>• {r.role}</span></div>
                  <div style={{ fontSize: 11, color: sub }}>{r.email} — {permissionSummary(r.role)}</div>
                </div>
                <button onClick={() => removeRole(r.email)} style={{ ...secondaryBtn, color: "#e2445c" }}>Remove</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 900, color: text }}>📊 Baseline Comparison</div>
        <div style={{ fontSize: 12, color: sub, marginTop: 3 }}>Shows delay, date shift, status change, owner change, deleted/new task.</div>
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 980, borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: "left", color: sub, background: bg }}>
                <th style={{ padding: 9 }}>Task</th>
                <th style={{ padding: 9 }}>Baseline Due</th>
                <th style={{ padding: 9 }}>Current Due</th>
                <th style={{ padding: 9 }}>Due Shift</th>
                <th style={{ padding: 9 }}>Baseline Start</th>
                <th style={{ padding: 9 }}>Current Start</th>
                <th style={{ padding: 9 }}>Status</th>
                <th style={{ padding: 9 }}>Owner</th>
                <th style={{ padding: 9 }}>Change</th>
              </tr>
            </thead>
            <tbody>
              {!selectedBaseline ? (
                <tr><td colSpan={9} style={{ padding: 20, textAlign: "center", color: sub }}>Capture a baseline first.</td></tr>
              ) : comparisonRows.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: 20, textAlign: "center", color: sub }}>No comparison rows.</td></tr>
              ) : comparisonRows.map(r => (
                <tr key={r.id} style={{ borderBottom: `1px solid ${bdr}`, background: r.risk === "Delay" ? "#fff4f6" : "transparent" }}>
                  <td style={{ padding: 9, fontWeight: 900, color: text }}>{r.cur?.name || r.base?.name || "Missing"}<div style={{ fontSize: 10, color: sub }}>{r.cur?.groupName || r.base?.groupName || "—"}</div></td>
                  <td style={{ padding: 9, color: sub }}>{r.base?.due || "—"}</td>
                  <td style={{ padding: 9, color: text }}>{r.cur?.due || "—"}</td>
                  <td style={{ padding: 9, fontWeight: 900, color: r.dueShift > 0 ? "#e2445c" : r.dueShift < 0 ? "#00a878" : sub }}>{r.dueShift === null ? "—" : `${r.dueShift > 0 ? "+" : ""}${r.dueShift}d`}</td>
                  <td style={{ padding: 9, color: sub }}>{r.base?.start || "—"}</td>
                  <td style={{ padding: 9, color: text }}>{r.cur?.start || "—"}</td>
                  <td style={{ padding: 9 }}>{r.base?.status || "—"} → <b>{r.cur?.status || "—"}</b></td>
                  <td style={{ padding: 9 }}>{r.base?.owner || "—"} → <b>{r.cur?.owner || "—"}</b></td>
                  <td style={{ padding: 9, color: sub }}>{r.changes.join(", ") || "No change"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ background: bg, border: `1px solid ${bdr}`, borderRadius: 12, padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 900, color: text }}>Role Policy Reminder</div>
        <div style={{ fontSize: 12, color: sub, marginTop: 4 }}>
          This version stores and displays board roles. For strict enforcement, the next step is to lock buttons/actions based on role, e.g. only Admin can archive/delete/automation, Reviewer can approve, Viewer is read-only.
        </div>
      </div>
    </div>
  );
}
'''

if "function GovernancePanel(" not in s:
    marker = "function PMSuitePanel("
    idx = s.find(marker)
    if idx < 0:
        marker = "function Dashboard("
        idx = s.find(marker)
    if idx < 0:
        raise SystemExit("Cannot find insertion marker")
    s = s[:idx] + governance_component + "\n" + s[idx:]
    print("[ok] GovernancePanel inserted")
else:
    print("[skip] GovernancePanel already exists")

replace_once(
    '["advanced", "Advanced PM"],\n            ["reviews", "Comments & Approval"],',
    '["advanced", "Advanced PM"],\n            ["governance", "Governance"],\n            ["reviews", "Comments & Approval"],',
    "Dashboard Governance tab after Advanced PM",
)

replace_once(
    '["pmSuite", "PM Suite"],\n            ["reviews", "Comments & Approval"],',
    '["pmSuite", "PM Suite"],\n            ["governance", "Governance"],\n            ["reviews", "Comments & Approval"],',
    "Dashboard Governance tab after PM Suite fallback",
)

replace_once(
    '{dashTab === "advanced" && <AdvancedPMPanel boards={boards} onPatchBoard={onPatchBoard} onSetBoards={onSetBoards} />}\n      {dashTab === "reviews" && <DashboardReviewPanel boards={boards} />}',
    '{dashTab === "advanced" && <AdvancedPMPanel boards={boards} onPatchBoard={onPatchBoard} onSetBoards={onSetBoards} />}\n      {dashTab === "governance" && <GovernancePanel boards={boards} onPatchBoard={onPatchBoard} />}\n      {dashTab === "reviews" && <DashboardReviewPanel boards={boards} />}',
    "Dashboard Governance panel after Advanced PM",
)

replace_once(
    '{dashTab === "pmSuite" && <PMSuitePanel boards={boards} onPatchBoard={onPatchBoard} onSetBoards={onSetBoards} />}\n      {dashTab === "reviews" && <DashboardReviewPanel boards={boards} />}',
    '{dashTab === "pmSuite" && <PMSuitePanel boards={boards} onPatchBoard={onPatchBoard} onSetBoards={onSetBoards} />}\n      {dashTab === "governance" && <GovernancePanel boards={boards} onPatchBoard={onPatchBoard} />}\n      {dashTab === "reviews" && <DashboardReviewPanel boards={boards} />}',
    "Dashboard Governance panel after PM Suite fallback",
)

# Make sure Dashboard can still receive setBoards from prior pack.
replace_once(
    "function Dashboard({ boards, onPatchBoard }: any) {",
    "function Dashboard({ boards, onPatchBoard, onSetBoards }: any) {",
    "Dashboard onSetBoards prop fallback",
)

p.write_text(s, encoding="utf-8")
print("Patch complete: Governance Pack")
PY

cd holifriday-app
npm run build

cd ..
git add -A
git commit -m "Add governance baseline and roles"
git push
