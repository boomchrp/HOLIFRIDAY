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

# 1) Availability helper functions
if "function getOwnerCapacityForDate(" not in s:
    helpers = r'''
function getOwnerResourceEntry(board, owner) {
  const capMap = getBoardResourceCapacity(board);
  const entry = capMap[capacityKey(owner)];
  return entry && typeof entry === "object" ? entry : { hoursPerDay: entry };
}

function getOwnerUnavailableDates(board, owner) {
  const entry = getOwnerResourceEntry(board, owner);
  return uniqueStrings(asArray(entry?.unavailableDates).map(d => asText(d)).filter(Boolean)).sort();
}

function getOwnerUnavailableReason(board, owner, dateKey) {
  const entry = getOwnerResourceEntry(board, owner);
  const reasons = entry?.unavailableReasons && typeof entry.unavailableReasons === "object" ? entry.unavailableReasons : {};
  return asText(reasons?.[dateKey], "");
}

function isOwnerUnavailable(board, owner, dateKey) {
  return getOwnerUnavailableDates(board, owner).includes(asText(dateKey));
}

function getOwnerCapacityForDate(board, owner, dateKey, fallback = 6) {
  return isOwnerUnavailable(board, owner, dateKey) ? 0 : getOwnerCapacity(board, owner, fallback);
}

function getDateRangeKeys(startDate, endDate) {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate || startDate);
  if (!start || !end) return [];
  const a = start <= end ? start : end;
  const b = start <= end ? end : start;
  const keys = [];
  for (let d = new Date(a); d <= b; d = addDays(d, 1)) keys.push(d.toISOString().slice(0, 10));
  return keys;
}

function setOwnerAvailabilityRangeOnBoard(board, owner, startDate, endDate, unavailable = true, reason = "") {
  const ownerName = normalizeOwner(owner);
  if (!ownerName || ownerName === "No owner") return board;
  const dates = getDateRangeKeys(startDate, endDate || startDate);
  if (dates.length === 0) return board;

  const key = capacityKey(ownerName);
  const capMap = getBoardResourceCapacity(board);
  const currentEntry = getOwnerResourceEntry(board, ownerName);
  const currentDates = new Set(getOwnerUnavailableDates(board, ownerName));
  const currentReasons = currentEntry?.unavailableReasons && typeof currentEntry.unavailableReasons === "object" ? { ...currentEntry.unavailableReasons } : {};
  const note = asText(reason, "");

  for (const dateKey of dates) {
    if (unavailable) {
      currentDates.add(dateKey);
      if (note) currentReasons[dateKey] = note;
    } else {
      currentDates.delete(dateKey);
      delete currentReasons[dateKey];
    }
  }

  return {
    ...board,
    resourceCapacity: {
      ...capMap,
      [key]: {
        ...currentEntry,
        owner: ownerName,
        hoursPerDay: getOwnerCapacity(board, ownerName, 6),
        unavailableDates: Array.from(currentDates).sort(),
        unavailableReasons: currentReasons,
        updatedAt: new Date().toISOString(),
      },
    },
  };
}

'''
    anchor = '''function setOwnerCapacityOnBoard(board, owner, hoursPerDay) {
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
'''
    if anchor not in s:
        raise SystemExit("Cannot find setOwnerCapacityOnBoard anchor")
    s = s.replace(anchor, anchor + "\n" + helpers, 1)
    print("[ok] availability helpers added")
else:
    print("[skip] availability helpers already exist")

# 2) Preserve resourceCapacity in fallback normalized boards
replace_once(
'''    name: asText(board?.name, `Board ${index + 1}`),
    color: asText(board?.color, GROUP_COLORS[index % GROUP_COLORS.length]),
    groups: asArray(board?.groups).map((group, groupIndex) => normalizeGroup(group, groupIndex)),''',
'''    name: asText(board?.name, `Board ${index + 1}`),
    color: asText(board?.color, GROUP_COLORS[index % GROUP_COLORS.length]),
    resourceCapacity: board?.resourceCapacity && typeof board.resourceCapacity === "object" ? board.resourceCapacity : {},
    groups: asArray(board?.groups).map((group, groupIndex) => normalizeGroup(group, groupIndex)),''',
"fallback normalizeBoards resourceCapacity"
)

# 3) Planning conflicts use daily availability capacity
replace_once(
'''const cap=getOwnerCapacity(board,owner,6);const h=taskDailyHours(item);for(let d=new Date(r.start);d<=r.end;d=addDays(d,1)){const date=d.toISOString().slice(0,10);const key=`${board.id}|${owner}|${date}`;const cur=daily.get(key)||{board,owner,date,cap,hours:0,tasks:[]};''',
'''const h=taskDailyHours(item);for(let d=new Date(r.start);d<=r.end;d=addDays(d,1)){const date=d.toISOString().slice(0,10);const cap=getOwnerCapacityForDate(board,owner,date,6);const key=`${board.id}|${owner}|${date}`;const cur=daily.get(key)||{board,owner,date,cap,hours:0,tasks:[]};''',
"planning conflicts availability capacity"
)

# 4) Team Schedule summary considers unavailable days
replace_once(
'''    const ownerCapacity = getOwnerCapacity(board, owner, capacity);
    const overloadDays = Array.from(byDate.values()).filter(v => v.reduce((s, t) => s + (t._hoursPerDay || 0), 0) > ownerCapacity).length;
    const overdue = list.filter(t => isOverdue(t.due) && t.status !== "Done").length;
    const dueSoon = list.filter(t => isDueSoon(t.due) && t.status !== "Done").length;
    return { owner, taskCount: list.length, loadHours, overloadDays, overdue, dueSoon };''',
'''    const overloadDays = Array.from(byDate.entries()).filter(([dateKey, v]) => {
      const load = v.reduce((s, t) => s + (t._hoursPerDay || 0), 0);
      return load > getOwnerCapacityForDate(board, owner, dateKey, capacity);
    }).length;
    const unavailableDays = dateKeys.filter(dateKey => isOwnerUnavailable(board, owner, dateKey)).length;
    const overdue = list.filter(t => isOverdue(t.due) && t.status !== "Done").length;
    const dueSoon = list.filter(t => isDueSoon(t.due) && t.status !== "Done").length;
    return { owner, taskCount: list.length, loadHours, overloadDays, unavailableDays, overdue, dueSoon };''',
"Team Schedule owner summary availability"
)

# 5) Team Schedule owner card shows unavailable days
replace_once(
'''                 {s.dueSoon > 0 && <span style={{ background: "#579bfc", color: "#fff", borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 800 }}>{s.dueSoon} due soon</span>}
                 {s.overloadDays === 0 && s.overdue === 0 && <span style={{ background: "#e6f9f1", color: "#00854d", borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 800 }}>OK</span>}''',
'''                 {s.dueSoon > 0 && <span style={{ background: "#579bfc", color: "#fff", borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 800 }}>{s.dueSoon} due soon</span>}
                 {s.unavailableDays > 0 && <span style={{ background: "#676879", color: "#fff", borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 800 }}>{s.unavailableDays} off</span>}
                 {s.overloadDays === 0 && s.overdue === 0 && s.unavailableDays === 0 && <span style={{ background: "#e6f9f1", color: "#00854d", borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 800 }}>OK</span>}''',
"Team Schedule unavailable badge"
)

# 6) Team Schedule row label includes availability count
replace_once(
'''                    <div style={{ marginTop: 3, fontSize: 11, color: "#98a1b3" }}>{(tasksByOwner.get(owner) || []).length} scheduled tasks</div>''',
'''                    <div style={{ marginTop: 3, fontSize: 11, color: "#98a1b3" }}>{(tasksByOwner.get(owner) || []).length} scheduled tasks • {getOwnerUnavailableDates(board, owner).length} off day(s)</div>''',
"Team Schedule row availability label"
)

# 7) Team Schedule day cells show unavailable days and set capacity to 0
replace_once(
'''                      const list = byDate.get(key) || [];
                      const loadHours = list.reduce((sum, t) => sum + (t._hoursPerDay || 0), 0);
                      const ownerCapacity = getOwnerCapacity(board, owner, capacity);
                      const overloaded = loadHours > ownerCapacity;
                      const intensity = Math.min(loadHours / Math.max(maxLoad, ownerCapacity), 1);
                      return <div key={key} title={list.length ? `${Math.round(loadHours * 10) / 10}h • ${list.length} task(s)` : ""} style={{ borderLeft: "1px solid #f7f8fc", background: overloaded ? "#fff2d0" : list.length ? `rgba(0,115,234,${0.04 + intensity * 0.12})` : "#fff" }}>{overloaded && <div style={{ height: 4, background: "#fdab3d" }} />}</div>;''',
'''                      const list = byDate.get(key) || [];
                      const loadHours = list.reduce((sum, t) => sum + (t._hoursPerDay || 0), 0);
                      const unavailable = isOwnerUnavailable(board, owner, key);
                      const ownerCapacity = getOwnerCapacityForDate(board, owner, key, capacity);
                      const overloaded = loadHours > ownerCapacity;
                      const intensity = Math.min(loadHours / Math.max(maxLoad, Math.max(ownerCapacity, 1)), 1);
                      const reason = getOwnerUnavailableReason(board, owner, key);
                      const title = unavailable
                        ? `${owner} unavailable${reason ? `: ${reason}` : ""}${list.length ? ` • ${Math.round(loadHours * 10) / 10}h scheduled` : ""}`
                        : (list.length ? `${Math.round(loadHours * 10) / 10}h / ${ownerCapacity}h • ${list.length} task(s)` : `${ownerCapacity}h available`);
                      return <div key={key} title={title} style={{ borderLeft: "1px solid #f7f8fc", background: unavailable ? "repeating-linear-gradient(135deg,#f1f3f7 0,#f1f3f7 6px,#e7eaf0 6px,#e7eaf0 12px)" : overloaded ? "#fff2d0" : list.length ? `rgba(0,115,234,${0.04 + intensity * 0.12})` : "#fff", position: "relative" }}>{unavailable ? <div style={{ position: "absolute", inset: "auto 4px 4px 4px", fontSize: 9, color: "#676879", fontWeight: 900, textAlign: "center" }}>OFF</div> : overloaded && <div style={{ height: 4, background: "#fdab3d" }} />}</div>;''',
"Team Schedule day cells availability"
)

# 8) Add AvailabilityPanel component
if "function AvailabilityPanel(" not in s:
    panel = r'''
function AvailabilityPanel({ boards, onPatchBoard }: any) {
  const { dark } = useDark();
  const card = dark ? "#16213e" : "#fff";
  const text = dark ? "#e0e0f0" : "#323338";
  const sub = dark ? "#8888aa" : "#676879";
  const bdr = dark ? "#2a2a4a" : "#eef1f7";
  const boardList = asArray(boards);
  const [boardId, setBoardId] = useState(boardList[0]?.id);
  const board = boardList.find(b => String(b.id) === String(boardId)) || boardList[0];
  const owners = useMemo(() => getBoardOwners(board), [board]);
  const [owner, setOwner] = useState("");
  const todayKey = new Date(new Date().toDateString()).toISOString().slice(0, 10);
  const [start, setStart] = useState(todayKey);
  const [end, setEnd] = useState(todayKey);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (board && !boardList.some(b => String(b.id) === String(boardId))) setBoardId(board.id);
  }, [board, boardId, boardList]);

  useEffect(() => {
    if (!owner && owners.length > 0) setOwner(owners[0]);
    if (owner && owners.length > 0 && !owners.includes(owner)) setOwner(owners[0]);
  }, [owners, owner]);

  if (!board) return null;

  const selectedOwner = owner || owners[0] || "";
  const upcomingByOwner = owners.map(o => {
    const dates = getOwnerUnavailableDates(board, o).filter(dateKey => {
      const d = parseDateOnly(dateKey);
      return d && d >= new Date(new Date().toDateString());
    });
    return { owner: o, dates };
  });

  function markUnavailable() {
    if (!selectedOwner || !start) return;
    onPatchBoard?.(board.id, current => setOwnerAvailabilityRangeOnBoard(current, selectedOwner, start, end || start, true, reason));
  }

  function clearUnavailable() {
    if (!selectedOwner || !start) return;
    onPatchBoard?.(board.id, current => setOwnerAvailabilityRangeOnBoard(current, selectedOwner, start, end || start, false, ""));
  }

  return (
    <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16, boxShadow: "0 2px 8px rgba(0,0,0,.06)", marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 900, color: text }}>🏝️ Team Availability Calendar</div>
          <div style={{ fontSize: 12, color: sub, marginTop: 3 }}>Mark leave / unavailable days. Workload capacity becomes 0 on those dates.</div>
        </div>
        <select value={String(board.id)} onChange={e => setBoardId(e.target.value)} style={{ border: `1px solid ${bdr}`, borderRadius: 8, padding: "7px 9px", background: card, color: text, fontSize: 12 }}>
          {boardList.map(b => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginTop: 14 }}>
        <label style={{ display: "grid", gap: 5, fontSize: 11, color: sub, fontWeight: 800 }}>Person
          <select value={selectedOwner} onChange={e => setOwner(e.target.value)} style={{ border: `1px solid ${bdr}`, borderRadius: 8, padding: "8px 9px", background: card, color: text, fontSize: 12 }}>
            {owners.length === 0 ? <option value="">No owner</option> : owners.map(o => <option key={o}>{o}</option>)}
          </select>
        </label>
        <label style={{ display: "grid", gap: 5, fontSize: 11, color: sub, fontWeight: 800 }}>Start
          <input type="date" value={start} onChange={e => setStart(e.target.value)} style={{ border: `1px solid ${bdr}`, borderRadius: 8, padding: "8px 9px", background: card, color: text, fontSize: 12 }} />
        </label>
        <label style={{ display: "grid", gap: 5, fontSize: 11, color: sub, fontWeight: 800 }}>End
          <input type="date" value={end} onChange={e => setEnd(e.target.value)} style={{ border: `1px solid ${bdr}`, borderRadius: 8, padding: "8px 9px", background: card, color: text, fontSize: 12 }} />
        </label>
        <label style={{ display: "grid", gap: 5, fontSize: 11, color: sub, fontWeight: 800 }}>Reason
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Leave, client visit, training…" style={{ border: `1px solid ${bdr}`, borderRadius: 8, padding: "8px 9px", background: card, color: text, fontSize: 12 }} />
        </label>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <button onClick={markUnavailable} disabled={!selectedOwner} style={{ border: "none", borderRadius: 8, background: "#e2445c", color: "#fff", padding: "8px 12px", fontSize: 12, fontWeight: 900, cursor: selectedOwner ? "pointer" : "not-allowed", opacity: selectedOwner ? 1 : .55 }}>Mark unavailable</button>
        <button onClick={clearUnavailable} disabled={!selectedOwner} style={{ border: `1px solid ${bdr}`, borderRadius: 8, background: card, color: text, padding: "8px 12px", fontSize: 12, fontWeight: 900, cursor: selectedOwner ? "pointer" : "not-allowed", opacity: selectedOwner ? 1 : .55 }}>Clear range</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10, marginTop: 14 }}>
        {upcomingByOwner.length === 0 ? (
          <div style={{ color: sub, fontSize: 12 }}>Assign owners first, then availability settings will appear here.</div>
        ) : upcomingByOwner.map(row => (
          <div key={row.owner} style={{ border: `1px solid ${bdr}`, borderRadius: 10, padding: "10px 12px", background: dark ? "#111827" : "#fafbff" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.owner}</div>
              <span style={{ background: row.dates.length ? "#676879" : "#00c875", color: "#fff", borderRadius: 999, padding: "1px 7px", fontSize: 10, fontWeight: 900 }}>{row.dates.length} off</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
              {row.dates.slice(0, 6).map(dateKey => <span key={dateKey} title={getOwnerUnavailableReason(board, row.owner, dateKey)} style={{ border: `1px solid ${bdr}`, borderRadius: 999, padding: "2px 7px", fontSize: 10, color: sub }}>{dateKey}</span>)}
              {row.dates.length === 0 && <span style={{ fontSize: 11, color: sub }}>No upcoming unavailable days.</span>}
              {row.dates.length > 6 && <span style={{ fontSize: 10, color: sub }}>+{row.dates.length - 6} more</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

'''
    marker = "function DashboardReviewPanel("
    if marker not in s:
        marker = "function PlanningSuitePanel({boards,onPatchBoard}:any)"
    pos = s.find(marker)
    if pos < 0:
        raise SystemExit("Cannot find insertion marker for AvailabilityPanel")
    s = s[:pos] + panel + "\n" + s[pos:]
    print("[ok] AvailabilityPanel added")
else:
    print("[skip] AvailabilityPanel already exists")

# 9) Dashboard tab for Availability
replace_once(
'''            ["planning", "Planning"],
            ["reviews", "Comments & Approval"],''',
'''            ["planning", "Planning"],
            ["availability", "Availability"],
            ["reviews", "Comments & Approval"],''',
"Dashboard Availability tab button"
)

replace_once(
'''      {dashTab === "planning" && <><PlanningSuitePanel boards={boards} onPatchBoard={onPatchBoard} /><GanttWhatIfPanel boards={boards} /></>}
      {dashTab === "reviews" && <DashboardReviewPanel boards={boards} />}''',
'''      {dashTab === "planning" && <><PlanningSuitePanel boards={boards} onPatchBoard={onPatchBoard} /><GanttWhatIfPanel boards={boards} /></>}
      {dashTab === "availability" && <AvailabilityPanel boards={boards} onPatchBoard={onPatchBoard} />}
      {dashTab === "reviews" && <DashboardReviewPanel boards={boards} />}''',
"Dashboard Availability tab panel"
)

p.write_text(s, encoding="utf-8")
print("Patch complete: Team Availability Calendar")
PY

cd holifriday-app
npm run build

cd ..
git add -A
git commit -m "Add team availability calendar"
git push
