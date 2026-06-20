#!/usr/bin/env bash
set -u

ROOT="/workspaces/HOLIFRIDAY"
APP="$ROOT/holifriday-app"
SRC="$APP/src/App.tsx"
REPORT="$ROOT/HOLIFRIDAY_AUDIT_REPORT.txt"

cd "$ROOT" || exit 1

{
  echo "HOLIFRIDAY AUDIT REPORT"
  echo "Generated: $(date)"
  echo "Root: $ROOT"
  echo "============================================================"
  echo

  echo "1) Git status"
  echo "------------------------------------------------------------"
  git status --short || true
  echo
  echo "Latest commits:"
  git log --oneline -8 || true
  echo

  echo "2) TypeScript / production build"
  echo "------------------------------------------------------------"
  if [ -d "$APP" ]; then
    cd "$APP" || exit 1
    npm run build
    BUILD_CODE=$?
    cd "$ROOT" || exit 1
    echo
    echo "Build exit code: $BUILD_CODE"
  else
    echo "ERROR: holifriday-app folder not found."
    BUILD_CODE=99
  fi
  echo

  echo "3) Static code health scan"
  echo "------------------------------------------------------------"
  python3 <<'PY'
from pathlib import Path
import re
from collections import Counter

src = Path("/workspaces/HOLIFRIDAY/holifriday-app/src/App.tsx")
if not src.exists():
    print("ERROR: App.tsx not found.")
    raise SystemExit(0)

s = src.read_text(encoding="utf-8", errors="replace")
lines = s.splitlines()

def count(pattern, flags=0):
    return len(re.findall(pattern, s, flags))

def exists(text):
    return text in s

def line_nums(pattern, flags=0):
    out = []
    rx = re.compile(pattern, flags)
    for i, line in enumerate(lines, 1):
        if rx.search(line):
            out.append(i)
    return out

checks = []

# Critical compile / structure checks
checks.append(("Exactly one BoardView function", count(r"^function\s+BoardView\s*\(", re.M) == 1, f"found at lines {line_nums(r'^function\s+BoardView\s*\(', re.M)}"))
checks.append(("No orphan ') {' top-level line", count(r"^\s*\)\s*\{\s*$", re.M) == 0, f"found at lines {line_nums(r'^\s*\)\s*\{\s*$', re.M)}"))
checks.append(("No duplicate Dashboard function", count(r"^function\s+Dashboard\s*\(", re.M) == 1, f"found at lines {line_nums(r'^function\s+Dashboard\s*\(', re.M)}"))
checks.append(("No duplicate Sidebar function", count(r"^function\s+Sidebar\s*\(", re.M) == 1, f"found at lines {line_nums(r'^function\s+Sidebar\s*\(', re.M)}"))

# Required feature components
components = [
    "Sidebar",
    "BoardView",
    "Dashboard",
    "PMSuitePanel",
    "AdvancedPMPanel",
    "GovernancePanel",
    "AvailabilityPanel",
    "DashboardReviewPanel",
]
for name in components:
    checks.append((f"Component exists: {name}", exists(f"function {name}("), ""))

# Simple UX features
checks.append(("Home / Today page exists", exists("function HomeTodayPage("), "expected HomeTodayPage component"))
checks.append(("Default view is Home", 'useState("home")' in s and "activeView" in s, "expected activeView default home"))
checks.append(("Sidebar has Home nav", '["home","🏠","Home"]' in s or '["home", "🏠", "Home"]' in s, "expected Home button"))
checks.append(("Simple / Advanced toggle exists", "holifriday_simple_mode" in s and "Simple mode" in s, "expected simple mode localStorage + button"))
checks.append(("Quick action New Task exists", "+ New Task" in s, "expected quick action"))
checks.append(("Quick action New Board exists", "+ New Board" in s, "expected quick action"))

# Rename checks
checks.append(("Visible Kanban removed", "Kanban" not in s and "KANBAN" not in s, "remaining visible Kanban strings should be renamed to Board"))
checks.append(("Advanced PM visible wording removed", "Advanced PM" not in s, "rename to Planning / Planning Pro"))
checks.append(("Governance visible wording removed", "Governance" not in s, "rename to Settings / Control"))
checks.append(("PM Suite visible wording removed", "PM Suite" not in s, "rename to Tools"))

# Delete / archive / restore
function_names = [
    "addBoard",
    "deleteBoard",
    "archiveBoard",
    "restoreBoard",
    "duplicateBoard",
    "exportBoardJson",
    "submitRequest",
    "addAttachmentLink",
    "generateReport",
    "exportExcelCsv",
    "exportCalendarIcs",
    "addAutomationRule",
    "runAutomationBuilder",
    "autoShiftDependencies",
    "captureBaseline",
    "restoreBaselineDates",
    "addRole",
    "removeRole",
]
for fn in function_names:
    checks.append((f"Function exists: {fn}", re.search(rf"\bfunction\s+{re.escape(fn)}\b|\bconst\s+{re.escape(fn)}\s*=", s) is not None, ""))

# Delete controls visible
checks.append(("Task delete button exists", "onDelete={onDelete}" in s or "onClick={onDelete}" in s, "task row should have delete"))
checks.append(("Group delete button exists", "onDelete={delGroup" in s or "delGroup(" in s, "group delete should exist"))
checks.append(("Board delete exists", "deleteBoard" in s and "onDelete={deleteBoard}" in s, "sidebar board delete should exist"))

# Persistence / sync
checks.append(("Firebase sync hook exists", "useSyncedBoards" in s, "expected cloud sync hook"))
checks.append(("Conflict merge dialog exists", "MergeConflictDialog" in s, "expected conflict handling"))
checks.append(("Global search exists", "GlobalSearch" in s and "Search all boards" in s, "expected global search"))

# Known MVP limitations
limitations = []
if "Attachment:" in s and "uploadBytes" not in s:
    limitations.append("File attachment is link-only; no real upload/storage yet.")
if "Export ICS" in s or "exportCalendarIcs" in s:
    if "google.calendar" not in s.lower() and "Calendar API" not in s:
        limitations.append("Google Calendar is ICS export only; no live two-way sync yet.")
if "Run Builder Rules" in s or "Run Custom Rules" in s:
    limitations.append("Automation Builder appears manual-run; not event-triggered in real time yet.")
if "boardRoles" in s and "permissionSummary" in s:
    limitations.append("Board roles are stored/displayed, but strict button/action enforcement may still be partial.")
if "planBaselines" in s:
    limitations.append("Baseline compares task snapshots, but full version history per field is not a complete audit trail.")

print("Checklist:")
for label, ok, detail in checks:
    icon = "PASS" if ok else "FAIL"
    print(f"[{icon}] {label}" + (f" — {detail}" if detail else ""))

print()
print("Counts:")
for name in ["BoardView","Dashboard","Sidebar","PMSuitePanel","AdvancedPMPanel","GovernancePanel","HomeTodayPage"]:
    print(f"- {name}: {count(r'^function\\s+' + name + r'\\s*\\(', re.M)}")

thai_chars = sorted(set(ch for ch in s if "\u0E00" <= ch <= "\u0E7F"))
print(f"- Thai characters in App.tsx: {len(thai_chars)} unique")
if thai_chars:
    thai_lines = []
    for i, line in enumerate(lines, 1):
        if any("\u0E00" <= ch <= "\u0E7F" for ch in line):
            thai_lines.append(i)
    print(f"  Thai text appears around lines: {thai_lines[:40]}{' ...' if len(thai_lines) > 40 else ''}")

print()
print("MVP limitations / not fully production-ready:")
if limitations:
    for item in limitations:
        print(f"- {item}")
else:
    print("- No obvious MVP limitation markers detected from static scan.")

print()
print("Temporary patch files in repo root:")
for path in sorted(Path('/workspaces/HOLIFRIDAY').glob('*.sh')):
    print(f"- {path.name}")

print()
print("Recommendation:")
fails = [label for label, ok, detail in checks if not ok]
if fails:
    print("Fix the FAIL items before adding new features.")
    for f in fails:
        print(f"- {f}")
else:
    print("Static scan passed. If build also passed, the app is safe to test in the browser.")
PY
  echo

  echo "4) Package / temp file check"
  echo "------------------------------------------------------------"
  echo "Root temporary scripts:"
  find "$ROOT" -maxdepth 1 -type f -name "*.sh" -printf "%f\n" | sort || true
  echo
  echo "Tracked temporary scripts:"
  git ls-files "*.sh" ".github/workflows/*.yml" | sort || true
  echo

  echo "5) Suggested manual browser test"
  echo "------------------------------------------------------------"
  cat <<'EOF'
Open the deployed site and test:

A. Basic navigation
- Home opens first
- Board opens active board
- Report opens dashboard/report page
- Simple mode / Advanced mode toggle works

B. Board functions
- Create board
- Rename board
- Duplicate board
- Archive board
- Restore board
- Delete board
- Export board JSON

C. Task functions
- Create task
- Edit task name
- Assign owner
- Change status
- Change priority
- Change due date
- Delete task
- Add comment
- Add subtask

D. Planning functions
- Add dependency
- Remove dependency
- Auto shift dates
- Create automation rule
- Run automation rule
- Generate report
- Export CSV
- Export ICS

E. Control functions
- Capture baseline
- Compare current vs baseline
- Restore dates from baseline
- Add role
- Remove role

F. Team functions
- Set capacity
- Set unavailable dates
- Confirm OFF day conflict appears
EOF

} > "$REPORT" 2>&1

cat "$REPORT"
echo
echo "Saved report to: $REPORT"
echo
echo "If build failed, send HOLIFRIDAY_AUDIT_REPORT.txt or paste the error section here."
