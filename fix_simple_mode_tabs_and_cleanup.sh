#!/usr/bin/env bash
set -euo pipefail

ROOT="/workspaces/HOLIFRIDAY"
APP="$ROOT/holifriday-app"
SRC="$APP/src/App.tsx"

cd "$ROOT"

python3 <<'PY'
from pathlib import Path
import re

p = Path("/workspaces/HOLIFRIDAY/holifriday-app/src/App.tsx")
s = p.read_text(encoding="utf-8")

def replace_first_in_dashboard(pattern, repl, label):
    global s
    start = s.find("function Dashboard(")
    if start < 0:
      print(f"[skip] {label}: Dashboard not found")
      return False
    end = s.find("\nfunction ", start + 20)
    if end < 0:
      end = len(s)
    chunk = s[start:end]
    new_chunk, n = re.subn(pattern, repl, chunk, count=1, flags=re.S)
    if n:
      s = s[:start] + new_chunk + s[end:]
      print(f"[ok] {label}")
      return True
    print(f"[skip] {label}: pattern not found")
    return False

# 1) Make Simple / Advanced mode actually control dashboard tabs.
simple_tabs_block = '''{(simpleMode
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

# Replace the first dashboard tab array that starts with overview and maps key,label.
replace_first_in_dashboard(
    r"\{\s*\[\s*\[\s*['\"]overview['\"]\s*,\s*['\"]Overview['\"]\s*\][\s\S]*?\]\.map\(\(\[key,\s*label\]\)\s*=>\s*\(",
    simple_tabs_block,
    "Simple/Advanced dashboard tabs",
)

# 2) Add a clear empty state in BoardView if missing.
if "No tasks yet" not in s or "Start by adding your first task" not in s:
    start = s.find("function BoardView(")
    end = s.find("\nfunction ", start + 20) if start >= 0 else -1
    if start >= 0 and end > start:
        board_chunk = s[start:end]
        empty_block = '''
      {asArray(board.groups).flatMap(g => asArray(g.items)).length === 0 && (
        <div style={{ margin: "18px 20px", border: "1px dashed #d8dbe4", background: "#fff", borderRadius: 14, padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 30 }}>🌱</div>
          <div style={{ marginTop: 8, fontSize: 16, fontWeight: 900, color: "#323338" }}>No tasks yet</div>
          <div style={{ marginTop: 5, fontSize: 12, color: "#676879" }}>Start by adding your first task in the group below.</div>
        </div>
      )}
'''
        # Insert before first map of board.groups or before activity log button area if present.
        marker_candidates = [
            "{board.groups.map(group =>",
            "{asArray(board.groups).map(group =>",
            "board.groups.map(group =>",
            "asArray(board.groups).map(group =>",
        ]
        inserted = False
        for marker in marker_candidates:
            idx = board_chunk.find(marker)
            if idx >= 0:
                board_chunk = board_chunk[:idx] + empty_block + "\n      " + board_chunk[idx:]
                s = s[:start] + board_chunk + s[end:]
                print("[ok] Board empty state inserted")
                inserted = True
                break
        if not inserted:
            print("[skip] Board empty state: marker not found")
    else:
        print("[skip] Board empty state: BoardView not found")
else:
    print("[skip] Board empty state already exists")

# 3) Normalize visible labels in case some old text remains.
replacements = {
    "Kanban": "Board",
    "KANBAN": "BOARD",
    "Advanced PM": "Planning Pro",
    "Governance": "Settings",
    "PM Suite": "Tools",
    "Comments & Approval": "Review",
    "Gantt / What-if": "Timeline",
    "Team Load": "Team",
}
for a, b in replacements.items():
    if a in s:
        s = s.replace(a, b)
        print(f"[ok] renamed remaining '{a}' -> '{b}'")

# 4) Add SettingsPanel/GovernancePanel compatibility alias if needed.
# If a component was renamed but any old reference remains, keep a safe alias to avoid future patches breaking.
if "function GovernancePanel(" not in s and "<GovernancePanel" in s:
    if "function SettingsPanel(" in s:
        insert_at = s.find("function SettingsPanel(")
        alias = "function GovernancePanel(props: any) { return <SettingsPanel {...props} />; }\n\n"
        s = s[:insert_at] + alias + s[insert_at:]
        print("[ok] Added GovernancePanel compatibility alias")
    else:
        print("[warn] GovernancePanel referenced but no SettingsPanel found")

p.write_text(s, encoding="utf-8")
print("App patch pass complete.")
PY

cd "$APP"
npm run build

cd "$ROOT"

# 5) Clean temporary patch/audit files from repo and working tree.
git rm --ignore-unmatch \
  apply_simple_navigation_pack.sh \
  audit_holifriday_full.sh \
  fix_duplicate_boardview_after_simple_nav.sh \
  repair_simple_nav_boardview.sh \
  apply_pm_suite_pack.sh \
  apply_default_capacity_8h.sh \
  apply_english_ux_labels.sh \
  apply_governance_baseline_roles.sh \
  apply_advanced_pm_features.sh \
  HOLIFRIDAY_AUDIT_REPORT.txt \
  .github/workflows/apply-gantt-whatif.yml \
  .github/workflows/apply-merged-bars.yml \
  .github/workflows/apply-planning-suite-lite.yml \
  .github/workflows/rename-kanban-label.yml \
  .github/workflows/add-pm-suite-pack.yml \
  .github/workflows/apply-default-capacity-8.yml \
  2>/dev/null || true

rm -f \
  apply_simple_navigation_pack.sh \
  audit_holifriday_full.sh \
  fix_duplicate_boardview_after_simple_nav.sh \
  repair_simple_nav_boardview.sh \
  HOLIFRIDAY_AUDIT_REPORT.txt \
  2>/dev/null || true

# 6) Final sanity scan with fixed regex.
python3 <<'PY'
from pathlib import Path
import re

s = Path("/workspaces/HOLIFRIDAY/holifriday-app/src/App.tsx").read_text(encoding="utf-8", errors="replace")
checks = [
  ("BoardView count", len(re.findall(r"^function\s+BoardView\s*\(", s, re.M))),
  ("Dashboard count", len(re.findall(r"^function\s+Dashboard\s*\(", s, re.M))),
  ("Sidebar count", len(re.findall(r"^function\s+Sidebar\s*\(", s, re.M))),
  ("HomeTodayPage count", len(re.findall(r"^function\s+HomeTodayPage\s*\(", s, re.M))),
]
for name, value in checks:
    print(f"{name}: {value}")

fail = []
if checks[0][1] != 1: fail.append("BoardView count is not 1")
if checks[1][1] != 1: fail.append("Dashboard count is not 1")
if checks[2][1] != 1: fail.append("Sidebar count is not 1")
if "Kanban" in s or "KANBAN" in s: fail.append("Kanban text remains")
if "holifriday_simple_mode" not in s: fail.append("Simple mode setting missing")
if "HomeTodayPage" not in s: fail.append("Home page missing")

if fail:
    print("SANITY FAIL:")
    for x in fail: print("-", x)
    raise SystemExit(1)
print("SANITY PASS")
PY

git status --short

if ! git diff --cached --quiet || ! git diff --quiet; then
  git add -A
  git commit -m "Fix simple mode tabs and clean temporary patch files"
  git push
else
  echo "Nothing to commit"
fi
