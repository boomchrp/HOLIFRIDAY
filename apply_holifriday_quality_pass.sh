#!/usr/bin/env bash
set -euo pipefail

cd /workspaces/HOLIFRIDAY
git checkout improve-firebase-security
git pull

python3 <<'PY'
from pathlib import Path
import re

APP = Path('holifriday-app/src/App.tsx')
s = APP.read_text(encoding='utf-8')

def replace_once(old, new, label):
    global s
    if old not in s:
        print(f'[skip] {label}: marker not found')
        return False
    s = s.replace(old, new, 1)
    print(f'[ok] {label}')
    return True

# 1) Fix normalizeTask so planning fields are not dropped after Firebase reload
if 'pmReviewDate: asText(task?.pmReviewDate' not in s:
    replace_once(
'''    start: asText(task?.start, ""),
    due: asText(task?.due, ""),
    tags: asArray(task?.tags).filter(t => typeof t === "string"),''',
'''    start: asText(task?.start, ""),
    due: asText(task?.due, ""),
    pmReviewDate: asText(task?.pmReviewDate, ""),
    effortHours: numberOrDefault(task?.effortHours, 0),
    reviewBufferDays: numberOrDefault(task?.reviewBufferDays, 1),
    revisionBufferDays: numberOrDefault(task?.revisionBufferDays, 1),
    tags: asArray(task?.tags).filter(t => typeof t === "string"),''',
    'normalizeTask planning fields')
else:
    print('[skip] normalizeTask planning fields already fixed')

# 2) Fix What-if delay. getPlanningAnalysis returns slackDays, not totalNeededDays/daysAvailable.
s = re.sub(
    r'  const delay=Math\.max\(0,\.\.\.sim\.map\(\(a:any\)=>\(\(a\.totalNeededDays\|\|0\)&&\(a\.daysAvailable\|\|0\)\)\?Math\.max\(0,\(a\.totalNeededDays\|\|0\)-\(a\.daysAvailable\|\|0\)\):0\)\);',
    '  const delay=Math.max(0,...sim.map((a:any)=>a.slackDays!=null?Math.max(0,-a.slackDays):0));',
    s,
    count=1,
)
s = s.replace(
    '  const delay=Math.max(0,...sim.map(a=>(a.totalNeededDays&&a.daysAvailable)?Math.max(0,a.totalNeededDays-a.daysAvailable):0));',
    '  const delay=Math.max(0,...sim.map((a:any)=>a.slackDays!=null?Math.max(0,-a.slackDays):0));'
)
print('[ok] What-if delay calculation checked')

APP.write_text(s, encoding='utf-8')

# 3) Apply merged schedule bars using the existing small patch script, if it has not been applied yet.
s = APP.read_text(encoding='utf-8')
merged_script = Path('tools/apply_merged_schedule_bars.py')
if 'left: `${left}%`, width: `calc(${width}% - 6px)`' not in s and merged_script.exists():
    ns = {'__name__': '__quality_pass__'}
    exec(merged_script.read_text(encoding='utf-8'), ns)
    print('[ok] merged schedule bars applied')
else:
    print('[skip] merged schedule bars already applied or patch script missing')

# Reload after possible merged-bar patch
s = APP.read_text(encoding='utf-8')

# 4) Team Schedule should use per-owner capacity
s = s.replace(
'''return { ...item, _start: range.start, _end: range.end, _duration: duration, _effortHours: effort, _hoursPerDay: duration > 0 ? (effort > 0 ? effort / duration : 1) : 0, _analysis: getPlanningAnalysis(item, capacity) };''',
'''return { ...item, _start: range.start, _end: range.end, _duration: duration, _effortHours: effort, _hoursPerDay: duration > 0 ? (effort > 0 ? effort / duration : 1) : 0, _ownerCapacity: getOwnerCapacity(board, item.owner, capacity), _analysis: getPlanningAnalysis(item, getOwnerCapacity(board, item.owner, capacity)) };'''
)
s = s.replace(
'''    const overloadDays = Array.from(byDate.values()).filter(v => v.reduce((s, t) => s + (t._hoursPerDay || 0), 0) > capacity).length;''',
'''    const ownerCapacity = getOwnerCapacity(board, owner, capacity);
    const overloadDays = Array.from(byDate.values()).filter(v => v.reduce((s, t) => s + (t._hoursPerDay || 0), 0) > ownerCapacity).length;'''
)
s = s.replace(
'''                    const overloaded = loadHours > capacity;
                    const intensity = Math.min(loadHours / Math.max(maxLoad, capacity), 1);''',
'''                    const ownerCapacity = getOwnerCapacity(board, owner, capacity);
                    const overloaded = loadHours > ownerCapacity;
                    const intensity = Math.min(loadHours / Math.max(maxLoad, ownerCapacity), 1);'''
)
s = s.replace(
'''                      const overloaded = loadHours > capacity;
                      const intensity = Math.min(loadHours / Math.max(maxLoad, capacity), 1);''',
'''                      const ownerCapacity = getOwnerCapacity(board, owner, capacity);
                      const overloaded = loadHours > ownerCapacity;
                      const intensity = Math.min(loadHours / Math.max(maxLoad, ownerCapacity), 1);'''
)
print('[ok] Team Schedule per-owner capacity checked')

# 7) Safe workspace isolation: default workspace keeps current old data path. Non-main workspace uses isolated path via ?workspace=xxx.
if 'function normalizeWorkspaceId(' not in s:
    s = s.replace(
'''const SHARED_BOARDS_PATH = "holifriday/sharedBoards/main";''',
'''const SHARED_BOARDS_PATH = "holifriday/sharedBoards/main";
const DEFAULT_WORKSPACE_ID = "main";
function normalizeWorkspaceId(value) {
  const raw = asText(value, DEFAULT_WORKSPACE_ID).trim().toLowerCase();
  return raw.replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || DEFAULT_WORKSPACE_ID;
}
function getWorkspaceIdFromLocation() {
  try { return normalizeWorkspaceId(new URLSearchParams(window.location.search).get("workspace") || DEFAULT_WORKSPACE_ID); }
  catch { return DEFAULT_WORKSPACE_ID; }
}
function getBoardsPath(workspaceId = DEFAULT_WORKSPACE_ID) {
  const id = normalizeWorkspaceId(workspaceId);
  return id === DEFAULT_WORKSPACE_ID ? SHARED_BOARDS_PATH : `holifriday/workspaces/${id}/boards`;
}''')
    s = s.replace(
'''function useSyncedBoards(key, init, uid) {
  const dbPath = firebaseDb ? SHARED_BOARDS_PATH : null;''',
'''function useSyncedBoards(key, init, uid, workspaceId = DEFAULT_WORKSPACE_ID) {
  const dbPath = firebaseDb ? getBoardsPath(workspaceId) : null;''')
    s = s.replace(
'''function AppContent() {''',
'''function WorkspaceBadge({ workspaceId }: { workspaceId: string }) {
  if (!workspaceId || workspaceId === DEFAULT_WORKSPACE_ID) return null;
  return <span style={{ background: "#eef4ff", color: "#0073ea", borderRadius: 999, padding: "2px 9px", fontSize: 11, fontWeight: 800 }}>Workspace: {workspaceId}</span>;
}

function AppContent() {''')
    s = s.replace(
'''  const [boards, setBoards, boardsReady, boardsFirebaseLoaded, boardsLoadedUid, boardsLoadError] = useSyncedBoards("holifriday_boards", INITIAL_BOARDS, authUser?.uid);''',
'''  const [workspaceId] = useState(() => getWorkspaceIdFromLocation());
  const [boards, setBoards, boardsReady, boardsFirebaseLoaded, boardsLoadedUid, boardsLoadError] = useSyncedBoards("holifriday_boards", INITIAL_BOARDS, authUser?.uid, workspaceId);''')
    s = s.replace(
'''      const snap = await get(dbRef(firebaseDb, SHARED_BOARDS_PATH));''',
'''      const snap = await get(dbRef(firebaseDb, getBoardsPath(workspaceId)));''')
    s = s.replace(
'''        <div style={{ display: "flex", gap: 6, marginLeft: 8 }}>''',
'''        <div style={{ display: "flex", gap: 6, marginLeft: 8, alignItems: "center", flexWrap: "wrap" }}>
          <WorkspaceBadge workspaceId={workspaceId} />''',
    1)
    print('[ok] safe workspace isolation added')
else:
    print('[skip] workspace isolation already exists')

APP.write_text(s, encoding='utf-8')

# 5) Refactor groundwork: document safe component split order without breaking App.tsx yet.
plan = Path('holifriday-app/src/REFRACTOR_PLAN.md')
plan.write_text('''# HOLIFRIDAY Refactor Plan\n\nSafe order:\n\n1. Move pure planning helpers to `src/lib/planning.ts`.\n2. Move `PlanningSuitePanel` to `src/components/PlanningSuitePanel.tsx`.\n3. Move `GanttWhatIfPanel` to `src/components/GanttWhatIfPanel.tsx`.\n4. Move `TeamScheduleView` to `src/components/TeamScheduleView.tsx`.\n5. Keep `App.tsx` as the coordinator only.\n\nDo not move all components in one commit. Build after each step.\n''', encoding='utf-8')
print('[ok] refactor plan added')

# 6) Clean old one-off patch workflows/scripts after features are already applied.
for rel in [
    '.github/workflows/apply-team-capacity.yml',
    '.github/workflows/apply-planning-suite-lite.yml',
    '.github/workflows/apply-gantt-whatif.yml',
    '.github/workflows/apply-merged-bars.yml',
    'tools/apply_team_capacity_feature.py',
    'tools/fix_team_capacity_build.py',
    'tools/apply_planning_suite_lite.py',
    'tools/apply_gantt_whatif_simple.py',
    'tools/apply_merged_schedule_bars.py',
]:
    fp = Path(rel)
    if fp.exists():
        fp.unlink()
        print('[ok] removed', rel)

print('Quality pass completed')
PY

cd holifriday-app
npm run build

cd ..
git add -A
if git diff --cached --quiet; then
  echo "No changes to commit."
else
  git commit -m "Apply HOLIFRIDAY quality fixes"
  git push
fi
