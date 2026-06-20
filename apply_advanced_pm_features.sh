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

advanced_component = r'''
function AdvancedPMPanel({ boards, onPatchBoard, onSetBoards }: any) {
  const { dark } = useDark();
  const card = dark ? "#16213e" : "#fff";
  const bg = dark ? "#101827" : "#fafbff";
  const text = dark ? "#e0e0f0" : "#323338";
  const sub = dark ? "#8888aa" : "#676879";
  const bdr = dark ? "#2a2a4a" : "#eef1f7";

  const boardList = asArray(boards).filter((b: any) => !b.archivedAt);
  const [boardId, setBoardId] = useState(boardList[0]?.id || "");
  const board = boardList.find((b: any) => String(b.id) === String(boardId)) || boardList[0];

  const [ruleName, setRuleName] = useState("");
  const [trigger, setTrigger] = useState("status_done");
  const [action, setAction] = useState("add_tag");
  const [actionValue, setActionValue] = useState("Auto");
  const [targetGroup, setTargetGroup] = useState("");

  const inputStyle = { border: `1px solid ${bdr}`, borderRadius: 8, padding: "8px 9px", background: card, color: text, fontSize: 12 } as any;
  const primaryBtn = { border: "none", borderRadius: 8, background: "#0073ea", color: "#fff", padding: "8px 12px", fontSize: 12, fontWeight: 900, cursor: "pointer" } as any;
  const secondaryBtn = { border: `1px solid ${bdr}`, borderRadius: 8, background: card, color: text, padding: "8px 12px", fontSize: 12, fontWeight: 900, cursor: "pointer" } as any;

  useEffect(() => {
    if (boardList.length && !boardList.some((b: any) => String(b.id) === String(boardId))) {
      setBoardId(boardList[0].id);
    }
  }, [boardList.length, boardId]);

  const taskRows = useMemo(() => {
    if (!board) return [];
    return asArray(board.groups).flatMap(group => asArray(group.items).map(item => ({ board, group, item })));
  }, [board]);

  const taskById = useMemo(() => new Map(taskRows.map(r => [String(r.item.id), r.item])), [taskRows]);
  const rules = asArray(board?.automationRules);

  function patchTask(taskId, updater) {
    if (!board) return;
    onPatchBoard?.(board.id, current => ({
      ...current,
      groups: asArray(current.groups).map(group => ({
        ...group,
        items: asArray(group.items).map(item => {
          if (String(item.id) !== String(taskId)) return item;
          return typeof updater === "function" ? updater(item) : { ...item, ...updater };
        }),
      })),
    }));
  }

  function addDependency(taskId, predecessorId) {
    if (!taskId || !predecessorId || String(taskId) === String(predecessorId)) return;
    patchTask(taskId, item => {
      const deps = uniqueStrings([...asArray(item.dependencies).map(String), String(predecessorId)]);
      return { ...item, dependencies: deps };
    });
  }

  function removeDependency(taskId, predecessorId) {
    patchTask(taskId, item => ({ ...item, dependencies: asArray(item.dependencies).map(String).filter(id => id !== String(predecessorId)) }));
  }

  function dateKey(d) {
    return d.toISOString().slice(0, 10);
  }

  function taskDurationDays(item) {
    const r = getTaskRange(item);
    if (r) return Math.max(1, diffDays(r.start, r.end) + 1);
    return Math.max(1, getRequiredWorkDays(item, 8) || 1);
  }

  function autoShiftDependencies() {
    if (!board) return;
    onPatchBoard?.(board.id, current => {
      const groups = asArray(current.groups).map(group => ({
        ...group,
        items: asArray(group.items).map(item => ({ ...item })),
      }));
      const all = groups.flatMap(group => asArray(group.items));
      const byId = new Map(all.map(item => [String(item.id), item]));

      for (let pass = 0; pass < 6; pass++) {
        for (const item of all) {
          const deps = asArray(item.dependencies).map(String);
          if (deps.length === 0) continue;

          const predEnds = deps
            .map(id => parseDateOnly(byId.get(id)?.due))
            .filter(Boolean)
            .sort((a: any, b: any) => b.getTime() - a.getTime());

          const maxPredEnd = predEnds[0];
          const range = getTaskRange(item);
          if (!maxPredEnd || !range) continue;

          if (range.start <= maxPredEnd) {
            const duration = Math.max(1, diffDays(range.start, range.end) + 1);
            const nextStart = addDays(maxPredEnd, 1);
            const nextEnd = addDays(nextStart, duration - 1);
            item.start = dateKey(nextStart);
            item.due = dateKey(nextEnd);
          }
        }
      }

      return { ...current, groups };
    });
    window.alert("Dependency auto-shift applied.");
  }

  const criticalRows = useMemo(() => {
    const memo = new Map<string, number>();
    const visiting = new Set<string>();

    function score(id) {
      if (memo.has(id)) return memo.get(id) || 0;
      if (visiting.has(id)) return 0;
      visiting.add(id);
      const item = taskById.get(String(id));
      if (!item) return 0;
      const predScore = Math.max(0, ...asArray(item.dependencies).map(depId => score(String(depId))));
      const total = predScore + taskDurationDays(item);
      memo.set(String(id), total);
      visiting.delete(id);
      return total;
    }

    return taskRows
      .map(r => ({ ...r, criticalScore: score(String(r.item.id)), depCount: asArray(r.item.dependencies).length }))
      .sort((a, b) => b.criticalScore - a.criticalScore)
      .slice(0, 10);
  }, [taskRows, taskById]);

  function addAutomationRule() {
    if (!board) return;
    const rule = {
      id: uid(),
      name: ruleName.trim() || `${trigger} → ${action}`,
      trigger,
      action,
      value: actionValue,
      targetGroup,
      enabled: true,
      createdAt: new Date().toISOString(),
    };
    onPatchBoard?.(board.id, current => ({ ...current, automationRules: [...asArray(current.automationRules), rule] }));
    setRuleName("");
  }

  function removeAutomationRule(ruleId) {
    if (!board) return;
    onPatchBoard?.(board.id, current => ({ ...current, automationRules: asArray(current.automationRules).filter(r => r.id !== ruleId) }));
  }

  function triggerMatches(rule, item, currentBoard) {
    const today = new Date(new Date().toDateString());
    if (rule.trigger === "status_done") return item.status === "Done";
    if (rule.trigger === "status_approved") return item.status === "Approved";
    if (rule.trigger === "overdue") return isOpenPlanningTask(item) && isOverdue(item.due);
    if (rule.trigger === "due_today") {
      const due = parseDateOnly(item.due);
      return !!due && diffDays(today, due) === 0;
    }
    if (rule.trigger === "pm_review_due") {
      const pm = parseDateOnly(item.pmReviewDate);
      return !!pm && diffDays(today, pm) <= 0;
    }
    if (rule.trigger === "owner_off") {
      const range = getTaskRange(item);
      const owner = normalizeOwner(item.owner);
      if (!range || owner === "No owner") return false;
      for (let d = new Date(range.start); d <= range.end; d = addDays(d, 1)) {
        if (isOwnerUnavailable(currentBoard, owner, dateKey(d))) return true;
      }
      return false;
    }
    return false;
  }

  function runAutomationBuilder() {
    if (!board) return;
    onPatchBoard?.(board.id, current => {
      let groups = asArray(current.groups).map(group => ({
        ...group,
        items: asArray(group.items).map(item => ({ ...item })),
      }));
      const currentRules = asArray(current.automationRules).filter(rule => rule.enabled !== false);

      for (const rule of currentRules) {
        const movedItems: any[] = [];
        groups = groups.map(group => {
          const kept: any[] = [];
          for (const item of asArray(group.items)) {
            if (!triggerMatches(rule, item, current)) {
              kept.push(item);
              continue;
            }

            if (rule.action === "move_group") {
              movedItems.push(item);
              continue;
            }

            if (rule.action === "add_tag") {
              item.tags = uniqueStrings([...asArray(item.tags), rule.value || "Auto"]);
            } else if (rule.action === "set_status") {
              item.status = rule.value || item.status;
            } else if (rule.action === "add_comment") {
              item.comments = [...asArray(item.comments), {
                id: uid(),
                author: "Automation",
                text: rule.value || `Automation rule: ${rule.name}`,
                mentions: [],
                time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              }];
            } else if (rule.action === "notify_pm") {
              item.tags = uniqueStrings([...asArray(item.tags), "Notify PM"]);
              item.comments = [...asArray(item.comments), {
                id: uid(),
                author: "Automation",
                text: `Notify PM: ${rule.name}`,
                mentions: [],
                time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              }];
            } else if (rule.action === "mark_conflict") {
              item.tags = uniqueStrings([...asArray(item.tags), "Conflict"]);
              item.priority = item.priority === "Critical" ? item.priority : "High";
            }

            kept.push(item);
          }
          return { ...group, items: kept };
        });

        if (rule.action === "move_group" && movedItems.length > 0) {
          const targetName = rule.targetGroup || rule.value || "Automated";
          let target = groups.find(group => group.name === targetName);
          if (!target) {
            target = { id: uid(), name: targetName, color: GROUP_COLORS[groups.length % GROUP_COLORS.length], members: [], memberRoles: {}, invites: [], items: [] };
            groups.push(target);
          }
          target.items = [...asArray(target.items), ...movedItems];
        }
      }

      return { ...current, groups };
    });
    window.alert("Automation builder rules applied.");
  }

  const chartMetrics = useMemo(() => {
    return boardList.map((b: any) => {
      const items = asArray(b.groups).flatMap(g => asArray(g.items));
      const total = items.length;
      const done = items.filter(i => ["Done", "Submitted", "Approved"].includes(i.status)).length;
      const overdue = items.filter(i => isOpenPlanningTask(i) && isOverdue(i.due)).length;
      const review = items.filter(i => ["Ready for PM Review", "PM Reviewing", "Need Revision"].includes(i.status)).length;
      const risk = items.filter(i => i.status === "Stuck" || ["At Risk", "Invalid", "Tight Review"].includes(getPlanningAnalysis(i, getOwnerCapacity(b, i.owner, 8)).risk)).length;
      return { board: b, total, done, progress: total ? Math.round(done / total * 100) : 0, overdue, review, risk };
    });
  }, [boards]);

  const maxCount = Math.max(1, ...chartMetrics.flatMap(m => [m.total, m.overdue, m.review, m.risk]));

  function SmallBar({ label, value, max, color }: any) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "140px 1fr 44px", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: sub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
        <div style={{ height: 10, background: dark ? "#0f172a" : "#eef1f7", borderRadius: 999, overflow: "hidden" }}>
          <div style={{ width: `${Math.max(3, Math.min(100, (value / Math.max(max, 1)) * 100))}%`, background: color, height: "100%", borderRadius: 999 }} />
        </div>
        <div style={{ fontSize: 11, fontWeight: 900, color: text, textAlign: "right" }}>{value}</div>
      </div>
    );
  }

  if (!board) return <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16, color: sub }}>No active board available.</div>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 900, color: text }}>🧠 Advanced PM Control Center</div>
            <div style={{ fontSize: 12, color: sub, marginTop: 3 }}>Automation builder, real dependencies, editable timeline, and chart reports.</div>
          </div>
          <select value={String(board.id)} onChange={e => setBoardId(e.target.value)} style={inputStyle}>
            {boardList.map((b: any) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
          </select>
        </div>
      </div>

      <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 900, color: text }}>⚡ Automation Builder</div>
        <div style={{ fontSize: 12, color: sub, marginTop: 3 }}>Build simple no-code rules. Current MVP runs rules manually with the button.</div>
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1fr 1fr auto", gap: 8, marginTop: 12, alignItems: "center" }}>
          <input value={ruleName} onChange={e => setRuleName(e.target.value)} placeholder="Rule name" style={inputStyle} />
          <select value={trigger} onChange={e => setTrigger(e.target.value)} style={inputStyle}>
            <option value="status_done">Status is Done</option>
            <option value="status_approved">Status is Approved</option>
            <option value="due_today">Due date is Today</option>
            <option value="overdue">Task is Overdue</option>
            <option value="pm_review_due">PM Review date reached</option>
            <option value="owner_off">Owner is OFF</option>
          </select>
          <select value={action} onChange={e => setAction(e.target.value)} style={inputStyle}>
            <option value="add_tag">Add Tag</option>
            <option value="set_status">Set Status</option>
            <option value="move_group">Move Group</option>
            <option value="add_comment">Add Comment</option>
            <option value="notify_pm">Notify PM (comment/tag)</option>
            <option value="mark_conflict">Mark Conflict</option>
          </select>
          <input value={actionValue} onChange={e => setActionValue(e.target.value)} placeholder="Value / status / tag" style={inputStyle} />
          <input value={targetGroup} onChange={e => setTargetGroup(e.target.value)} placeholder="Target group" style={inputStyle} />
          <button onClick={addAutomationRule} style={primaryBtn}>Add Rule</button>
        </div>
        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          {rules.length === 0 ? <div style={{ fontSize: 12, color: sub }}>No custom automation rules yet.</div> : rules.map(rule => (
            <div key={rule.id} style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${bdr}`, borderRadius: 9, padding: "8px 10px", background: bg }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: text }}>{rule.name}</div>
                <div style={{ fontSize: 11, color: sub }}>{rule.trigger} → {rule.action} {rule.value ? `(${rule.value})` : ""} {rule.targetGroup ? `→ ${rule.targetGroup}` : ""}</div>
              </div>
              <button onClick={() => removeAutomationRule(rule.id)} style={{ ...secondaryBtn, color: "#e2445c" }}>Delete</button>
            </div>
          ))}
        </div>
        <button onClick={runAutomationBuilder} style={{ ...primaryBtn, marginTop: 12 }}>Run Builder Rules</button>
      </div>

      <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 900, color: text }}>🔗 Real Dependency + Critical Path</div>
            <div style={{ fontSize: 12, color: sub, marginTop: 3 }}>Set predecessor tasks and auto-shift dates when predecessors delay.</div>
          </div>
          <button onClick={autoShiftDependencies} style={primaryBtn}>Auto Shift From Dependencies</button>
        </div>
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr style={{ color: sub, textAlign: "left", background: bg }}><th style={{ padding: 9 }}>Task</th><th style={{ padding: 9 }}>Start</th><th style={{ padding: 9 }}>Due</th><th style={{ padding: 9 }}>PM Review</th><th style={{ padding: 9 }}>Dependencies</th><th style={{ padding: 9 }}>Add Predecessor</th></tr></thead>
            <tbody>{taskRows.map(r => (
              <tr key={r.item.id} style={{ borderBottom: `1px solid ${bdr}` }}>
                <td style={{ padding: 9, color: text, fontWeight: 800 }}>{r.item.name}<div style={{ color: sub, fontSize: 10 }}>{r.group.name}</div></td>
                <td style={{ padding: 9 }}><input type="date" value={r.item.start || ""} onChange={e => patchTask(r.item.id, { start: e.target.value })} style={inputStyle} /></td>
                <td style={{ padding: 9 }}><input type="date" value={r.item.due || ""} onChange={e => patchTask(r.item.id, { due: e.target.value })} style={inputStyle} /></td>
                <td style={{ padding: 9 }}><input type="date" value={r.item.pmReviewDate || ""} onChange={e => patchTask(r.item.id, { pmReviewDate: e.target.value })} style={inputStyle} /></td>
                <td style={{ padding: 9 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {asArray(r.item.dependencies).length === 0 ? <span style={{ color: sub }}>None</span> : asArray(r.item.dependencies).map(depId => <button key={depId} onClick={() => removeDependency(r.item.id, depId)} style={{ border: "none", borderRadius: 999, padding: "3px 8px", background: "#eef4ff", color: "#1f5ecf", fontSize: 10, cursor: "pointer" }}>{taskById.get(String(depId))?.name || "Missing"} ×</button>)}
                  </div>
                </td>
                <td style={{ padding: 9 }}>
                  <select value="" onChange={e => { addDependency(r.item.id, e.target.value); e.currentTarget.value = ""; }} style={inputStyle}>
                    <option value="">+ predecessor</option>
                    {taskRows.filter(o => String(o.item.id) !== String(r.item.id)).map(o => <option key={o.item.id} value={String(o.item.id)}>{o.item.name}</option>)}
                  </select>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 8 }}>
          {criticalRows.map((r, idx) => <div key={r.item.id} style={{ border: `1px solid ${bdr}`, borderLeft: `4px solid ${idx === 0 ? "#e2445c" : "#579bfc"}`, borderRadius: 9, padding: 10, background: bg }}><div style={{ fontSize: 12, fontWeight: 900, color: text }}>#{idx + 1} {r.item.name}</div><div style={{ fontSize: 11, color: sub, marginTop: 3 }}>Critical score: {r.criticalScore} day(s) • Dependencies: {r.depCount}</div></div>)}
        </div>
      </div>

      <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 900, color: text }}>📈 Dashboard Report Graphs</div>
        <div style={{ fontSize: 12, color: sub, marginTop: 3 }}>Progress by board, overdue, PM review queue, and risk chart.</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14, marginTop: 14 }}>
          <div style={{ border: `1px solid ${bdr}`, borderRadius: 10, padding: 12, background: bg }}><div style={{ fontSize: 12, fontWeight: 900, color: text, marginBottom: 10 }}>Progress by Board</div>{chartMetrics.map(m => <SmallBar key={m.board.id} label={m.board.name} value={m.progress} max={100} color="#00c875" />)}</div>
          <div style={{ border: `1px solid ${bdr}`, borderRadius: 10, padding: 12, background: bg }}><div style={{ fontSize: 12, fontWeight: 900, color: text, marginBottom: 10 }}>Overdue Trend / Count</div>{chartMetrics.map(m => <SmallBar key={m.board.id} label={m.board.name} value={m.overdue} max={maxCount} color="#e2445c" />)}</div>
          <div style={{ border: `1px solid ${bdr}`, borderRadius: 10, padding: 12, background: bg }}><div style={{ fontSize: 12, fontWeight: 900, color: text, marginBottom: 10 }}>PM Review Queue</div>{chartMetrics.map(m => <SmallBar key={m.board.id} label={m.board.name} value={m.review} max={maxCount} color="#579bfc" />)}</div>
          <div style={{ border: `1px solid ${bdr}`, borderRadius: 10, padding: 12, background: bg }}><div style={{ fontSize: 12, fontWeight: 900, color: text, marginBottom: 10 }}>Risk Chart</div>{chartMetrics.map(m => <SmallBar key={m.board.id} label={m.board.name} value={m.risk} max={maxCount} color="#fdab3d" />)}</div>
        </div>
      </div>
    </div>
  );
}
'''

if "function AdvancedPMPanel(" not in s:
    marker = "function PMSuitePanel("
    idx = s.find(marker)
    if idx < 0:
        marker = "function Dashboard("
        idx = s.find(marker)
    if idx < 0:
        raise SystemExit("Cannot find insertion marker")
    s = s[:idx] + advanced_component + "\n" + s[idx:]
    print("[ok] AdvancedPMPanel inserted")
else:
    print("[skip] AdvancedPMPanel already exists")

replace_once(
    '["pmSuite", "PM Suite"],\n            ["reviews", "Comments & Approval"],',
    '["pmSuite", "PM Suite"],\n            ["advanced", "Advanced PM"],\n            ["reviews", "Comments & Approval"],',
    "Dashboard Advanced PM tab",
)

replace_once(
    '{dashTab === "pmSuite" && <PMSuitePanel boards={boards} onPatchBoard={onPatchBoard} onSetBoards={onSetBoards} />}\n      {dashTab === "reviews" && <DashboardReviewPanel boards={boards} />}',
    '{dashTab === "pmSuite" && <PMSuitePanel boards={boards} onPatchBoard={onPatchBoard} onSetBoards={onSetBoards} />}\n      {dashTab === "advanced" && <AdvancedPMPanel boards={boards} onPatchBoard={onPatchBoard} onSetBoards={onSetBoards} />}\n      {dashTab === "reviews" && <DashboardReviewPanel boards={boards} />}',
    "Dashboard Advanced PM panel",
)

# Make sure Dashboard has onSetBoards and App passes setBoards in case previous pack was partially applied.
replace_once(
    "function Dashboard({ boards, onPatchBoard }: any) {",
    "function Dashboard({ boards, onPatchBoard, onSetBoards }: any) {",
    "Dashboard onSetBoards prop fallback",
)

replace_once(
    '? <Dashboard boards={boards} onPatchBoard={patchBoardById} />',
    '? <Dashboard boards={boards} onPatchBoard={patchBoardById} onSetBoards={setBoards} />',
    "Pass setBoards fallback",
)

p.write_text(s, encoding="utf-8")
print("Patch complete: Advanced PM features")
PY

cd holifriday-app
npm run build

cd ..
git add -A
git commit -m "Add advanced PM automation dependencies and charts"
git push
