from pathlib import Path

path = Path("holifriday-app/src/App.tsx")
text = path.read_text(encoding="utf-8")


def replace_once(src, old, new, label):
    if old not in src:
        raise SystemExit(f"Cannot find marker: {label}")
    return src.replace(old, new, 1)

# 1) Persist resourceCapacity on each board
if "resourceCapacity:" not in text:
    text = replace_once(
        text,
        """    color: asText(board?.color, GROUP_COLORS[index % GROUP_COLORS.length]),
    groups: asArray(board?.groups).map((group, groupIndex) => normalizeGroup(group, groupIndex)),""",
        """    color: asText(board?.color, GROUP_COLORS[index % GROUP_COLORS.length]),
    resourceCapacity: board?.resourceCapacity && typeof board.resourceCapacity === "object" ? board.resourceCapacity : {},
    groups: asArray(board?.groups).map((group, groupIndex) => normalizeGroup(group, groupIndex)),""",
        "normalizeBoard resourceCapacity",
    )

# 2) Add capacity helper functions
helper_marker = """function getRequiredWorkDays(task, capacityHoursPerDay = 6) {
  const effort = getEffortHours(task);
  if (effort <= 0) return 0;
  const cap = Math.max(1, Number(capacityHoursPerDay) || 6);
  return Math.max(1, Math.ceil(effort / cap));
}
"""

helper_insert = helper_marker + """

function capacityKey(owner) {
  return memberRoleKey(normalizeOwner(owner));
}

function getBoardOwners(board) {
  const owners = [];
  for (const group of asArray(board?.groups)) {
    owners.push(...asArray(group?.members));
    for (const item of asArray(group?.items)) {
      const owner = normalizeOwner(item?.owner);
      if (owner && owner !== "No owner") owners.push(owner);
    }
  }
  return uniqueStrings(owners.map(normalizeOwner)).filter(o => o && o !== "No owner");
}

function getBoardResourceCapacity(board) {
  return board?.resourceCapacity && typeof board.resourceCapacity === "object"
    ? board.resourceCapacity
    : {};
}

function getOwnerCapacity(board, owner, fallback = 6) {
  const capMap = getBoardResourceCapacity(board);
  const entry = capMap[capacityKey(owner)];
  const raw = entry && typeof entry === "object" ? entry.hoursPerDay : entry;
  const n = Number(raw ?? fallback);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function setOwnerCapacityOnBoard(board, owner, hoursPerDay) {
  const n = Math.max(0, Number(hoursPerDay) || 0);
  const key = capacityKey(owner);
  return {
    ...board,
    resourceCapacity: {
      ...getBoardResourceCapacity(board),
      [key]: {
        owner: normalizeOwner(owner),
        hoursPerDay: n,
        updatedAt: new Date().toISOString(),
      },
    },
  };
}
"""

if "function getOwnerCapacity(" not in text:
    text = replace_once(text, helper_marker, helper_insert, "capacity helper functions")

# 3) Change PMPlanningView to support per-owner capacity
text = text.replace(
    "function PMPlanningView({ board, onOpen }: any) {",
    "function PMPlanningView({ board, onOpen, onUpdateCapacity }: any) {",
)

text = text.replace(
    "  const [capacity, setCapacity] = useState(6);",
    "  const [fallbackCapacity, setFallbackCapacity] = useState(6);",
)

old_risk = """  const [riskFilter, setRiskFilter] = useState("All");
  const tasks = useMemo(() => {"""
new_risk = """  const [riskFilter, setRiskFilter] = useState("All");
  const projectOwners = useMemo(() => getBoardOwners(board), [board]);

  function updateOwnerCapacity(owner, hoursPerDay) {
    if (!onUpdateCapacity) return;
    onUpdateCapacity(board.id, owner, hoursPerDay);
  }

  const tasks = useMemo(() => {"""

if "const projectOwners = useMemo(() => getBoardOwners(board), [board]);" not in text:
    text = replace_once(text, old_risk, new_risk, "PMPlanningView projectOwners")

text = text.replace(
    "      .map(i => ({ ...i, _analysis: getPlanningAnalysis(i, capacity) }))",
    "      .map(i => ({ ...i, _capacityHoursPerDay: getOwnerCapacity(board, i.owner, fallbackCapacity), _analysis: getPlanningAnalysis(i, getOwnerCapacity(board, i.owner, fallbackCapacity)) }))",
)

text = text.replace(
    "  }, [board, capacity, hideDone, riskFilter]);",
    "  }, [board, fallbackCapacity, hideDone, riskFilter]);",
)

text = text.replace(
    """            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#676879" }}>Capacity hr/day
              <input type="number" min={1} max={12} value={capacity} onChange={e => setCapacity(Math.max(1, Number(e.target.value) || 1))} style={{ width: 58, border: "1px solid #d8dbe4", borderRadius: 7, padding: "5px 7px", fontSize: 12 }} />
            </label>""",
    """            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#676879" }}>Default hr/day
              <input type="number" min={1} max={12} value={fallbackCapacity} onChange={e => setFallbackCapacity(Math.max(1, Number(e.target.value) || 1))} style={{ width: 58, border: "1px solid #d8dbe4", borderRadius: 7, padding: "5px 7px", fontSize: 12 }} />
            </label>""",
)

# 4) Add Team Capacity panel before PM Review Queue
capacity_panel_marker = """        <div style={{ padding: "14px 16px", borderBottom: "1px solid #eef1f7" }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#323338", marginBottom: 8 }}>PM Review Queue</div>"""

capacity_panel_insert = """        <div style={{ padding: "14px 16px", borderBottom: "1px solid #eef1f7" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 900, color: "#323338" }}>Team Capacity / Availability</div>
              <div style={{ marginTop: 2, fontSize: 11, color: "#98a1b3" }}>Set how many hours each person can spend on this project per day.</div>
            </div>
          </div>

          {projectOwners.length === 0 ? (
            <div style={{ fontSize: 12, color: "#98a1b3" }}>Assign owners to tasks first, then capacity settings will appear here.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
              {projectOwners.map(owner => {
                const cap = getOwnerCapacity(board, owner, fallbackCapacity);
                const ownerTasks = tasks.filter(t => normalizeOwner(t.owner) === normalizeOwner(owner));
                const ownerEffort = ownerTasks.reduce((sum, t) => sum + getEffortHours(t), 0);
                return (
                  <div key={owner} style={{ border: "1px solid #eef1f7", borderRadius: 10, background: "#fafbff", padding: "10px 12px" }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: "#323338", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{owner}</div>
                    <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="number"
                        min={0}
                        max={24}
                        step={0.5}
                        value={cap}
                        onChange={e => updateOwnerCapacity(owner, e.target.value)}
                        style={{ width: 72, border: "1px solid #d8dbe4", borderRadius: 7, padding: "5px 7px", fontSize: 12 }}
                      />
                      <span style={{ fontSize: 12, color: "#676879" }}>hr/day</span>
                    </div>
                    <div style={{ marginTop: 6, fontSize: 11, color: "#98a1b3" }}>{ownerTasks.length} active task(s) • {ownerEffort}h effort</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ padding: "14px 16px", borderBottom: "1px solid #eef1f7" }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#323338", marginBottom: 8 }}>PM Review Queue</div>"""

if "Team Capacity / Availability" not in text:
    text = replace_once(text, capacity_panel_marker, capacity_panel_insert, "Team Capacity panel")

# 5) Show capacity in task cards and table
text = text.replace(
    """                <div style={{ marginTop: 3, fontSize: 11, color: "#676879" }}>PM: {formatDateOnly(t._analysis.suggestedPmReview) || "—"} • Final: {formatDateOnly(t._analysis.finalDeadline) || "—"} • {t.owner || "Unassigned"}</div>""",
    """                <div style={{ marginTop: 3, fontSize: 11, color: "#676879" }}>PM: {formatDateOnly(t._analysis.suggestedPmReview) || "—"} • Final: {formatDateOnly(t._analysis.finalDeadline) || "—"} • {t.owner || "Unassigned"} • {t._capacityHoursPerDay}h/day</div>""",
)

text = text.replace(
    """                  <td style={{ padding: "10px 12px", borderBottom: "1px solid #eef1f7" }}>{getEffortHours(t) || "—"}h</td>""",
    """                  <td style={{ padding: "10px 12px", borderBottom: "1px solid #eef1f7" }}>{getEffortHours(t) || "—"}h<div style={{ fontSize: 10, color: "#98a1b3" }}>{t._capacityHoursPerDay}h/day</div></td>""",
)

# 6) Allow Dashboard to patch board capacity
text = text.replace(
    "function Dashboard({ boards }: any) {",
    "function Dashboard({ boards, onPatchBoard }: any) {",
)

text = text.replace(
    "? <Dashboard boards={boards} />",
    "? <Dashboard boards={boards} onPatchBoard={patchBoardById} />",
)

# Update PMPlanningView calls where found
for pattern in [
    "<PMPlanningView board={activeBoard} onOpen={",
    "<PMPlanningView board={selectedBoard} onOpen={",
    "<PMPlanningView board={board} onOpen={",
]:
    start = text.find(pattern)
    if start != -1 and "onUpdateCapacity" not in text[start:start + 260]:
        text = text.replace(
            pattern,
            pattern.replace(" onOpen={", " onUpdateCapacity={(boardId, owner, hours) => onPatchBoard?.(boardId, board => setOwnerCapacityOnBoard(board, owner, hours))} onOpen={"),
            1,
        )

path.write_text(text, encoding="utf-8")
print("Updated App.tsx with Team Capacity / Availability.")
