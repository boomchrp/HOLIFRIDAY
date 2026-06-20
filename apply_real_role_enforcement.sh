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

role_helpers = r'''
function normalizeBoardAccessRole(value) {
  const v = asText(value || "Viewer").trim().toLowerCase();
  if (v === "admin") return "Admin";
  if (v === "editor") return "Editor";
  if (v === "reviewer") return "Reviewer";
  if (v === "client") return "Client";
  if (v === "viewer" || v === "view") return "Viewer";
  return "Viewer";
}

function getBoardRole(board, email) {
  const roleMap = board?.boardRoles && typeof board.boardRoles === "object" ? board.boardRoles : {};
  const rows: any[] = Object.values(roleMap);
  const normalizedEmail = normalizeEmail(email);
  if (rows.length === 0) return "Admin"; // legacy boards: keep owner/editor workflow unlocked
  if (!normalizedEmail) return "Viewer";
  const direct = roleMap[memberRoleKey(normalizedEmail)] || roleMap[normalizedEmail];
  if (direct) return normalizeBoardAccessRole(direct.role || direct);
  const found: any = rows.find((r: any) => normalizeEmail(r?.email) === normalizedEmail);
  return found ? normalizeBoardAccessRole(found.role) : "Viewer";
}

function getBoardPermissions(role) {
  const r = normalizeBoardAccessRole(role);
  return {
    role: r,
    canAdmin: r === "Admin",
    canEdit: r === "Admin" || r === "Editor",
    canReview: r === "Admin" || r === "Editor" || r === "Reviewer",
    canComment: r === "Admin" || r === "Editor" || r === "Reviewer" || r === "Client",
    canRequest: r === "Admin" || r === "Editor" || r === "Client",
    canView: true,
  };
}

function stripReviewAllowedFields(item) {
  const {
    status,
    comments,
    approvalHistory,
    updatedAt,
    updatedBy,
    version,
    ...rest
  } = item || {};
  return rest;
}

function isReviewOnlyBoardChange(prevBoard, nextBoard) {
  if (!prevBoard || !nextBoard) return false;
  const prevGroups = asArray(prevBoard.groups);
  const nextGroups = asArray(nextBoard.groups);
  if (prevGroups.length !== nextGroups.length) return false;

  const prevBoardMeta = { ...prevBoard, groups: undefined, activityLogs: undefined };
  const nextBoardMeta = { ...nextBoard, groups: undefined, activityLogs: undefined };
  if (JSON.stringify(prevBoardMeta) !== JSON.stringify(nextBoardMeta)) return false;

  for (const prevGroup of prevGroups) {
    const nextGroup = nextGroups.find(g => String(g.id) === String(prevGroup.id));
    if (!nextGroup) return false;

    const prevGroupMeta = { ...prevGroup, items: undefined };
    const nextGroupMeta = { ...nextGroup, items: undefined };
    if (JSON.stringify(prevGroupMeta) !== JSON.stringify(nextGroupMeta)) return false;

    const prevItems = asArray(prevGroup.items);
    const nextItems = asArray(nextGroup.items);
    if (prevItems.length !== nextItems.length) return false;

    for (const prevItem of prevItems) {
      const nextItem = nextItems.find(i => String(i.id) === String(prevItem.id));
      if (!nextItem) return false;
      if (JSON.stringify(stripReviewAllowedFields(prevItem)) !== JSON.stringify(stripReviewAllowedFields(nextItem))) return false;
    }
  }
  return true;
}

function isClientRequestOnlyBoardChange(prevBoard, nextBoard) {
  if (!prevBoard || !nextBoard) return false;
  const prevGroups = asArray(prevBoard.groups);
  const nextGroups = asArray(nextBoard.groups);
  if (prevGroups.length !== nextGroups.length) return false;

  let addedRequestCount = 0;
  for (const prevGroup of prevGroups) {
    const nextGroup = nextGroups.find(g => String(g.id) === String(prevGroup.id));
    if (!nextGroup) return false;

    const prevGroupMeta = { ...prevGroup, items: undefined };
    const nextGroupMeta = { ...nextGroup, items: undefined };
    if (JSON.stringify(prevGroupMeta) !== JSON.stringify(nextGroupMeta)) return false;

    const prevItems = asArray(prevGroup.items);
    const nextItems = asArray(nextGroup.items);
    const prevIds = new Set(prevItems.map(i => String(i.id)));
    const nextExisting = nextItems.filter(i => prevIds.has(String(i.id)));
    if (nextExisting.length !== prevItems.length) return false;

    for (const prevItem of prevItems) {
      const nextItem = nextItems.find(i => String(i.id) === String(prevItem.id));
      if (!nextItem || JSON.stringify(prevItem) !== JSON.stringify(nextItem)) return false;
    }

    const added = nextItems.filter(i => !prevIds.has(String(i.id)));
    for (const item of added) {
      if (!asArray(item.tags).includes("Request")) return false;
      addedRequestCount += 1;
    }
  }
  return addedRequestCount === 1;
}

function canApplyBoardMutation(prevBoard, nextBoard, email, silent = false) {
  const role = getBoardRole(prevBoard, email);
  const permissions = getBoardPermissions(role);

  if (permissions.canAdmin) return true;

  const prevRoles = prevBoard?.boardRoles || {};
  const nextRoles = nextBoard?.boardRoles || {};
  const rolesChanged = JSON.stringify(prevRoles) !== JSON.stringify(nextRoles);
  const archiveChanged = asText(prevBoard?.archivedAt) !== asText(nextBoard?.archivedAt);

  if (rolesChanged || archiveChanged) {
    if (!silent) window.alert(`Permission denied: ${role} cannot change board roles or archive settings.`);
    return false;
  }

  if (permissions.canEdit) return true;

  if (permissions.canReview && isReviewOnlyBoardChange(prevBoard, nextBoard)) return true;
  if (permissions.canRequest && isClientRequestOnlyBoardChange(prevBoard, nextBoard)) return true;

  if (!silent) window.alert(`Permission denied: your board role is ${role}.`);
  return false;
}

function canApplyBoardsMutation(prevBoards, nextBoards, email, silent = false) {
  const prevList = asArray(prevBoards);
  const nextList = asArray(nextBoards);
  const prevById = new Map(prevList.map(b => [String(b.id), b]));
  const nextById = new Map(nextList.map(b => [String(b.id), b]));

  for (const prevBoard of prevList) {
    if (!nextById.has(String(prevBoard.id))) {
      const role = getBoardRole(prevBoard, email);
      if (!getBoardPermissions(role).canAdmin) {
        if (!silent) window.alert(`Permission denied: only Admin can delete board "${prevBoard.name}".`);
        return false;
      }
    }
  }

  for (const nextBoard of nextList) {
    const prevBoard = prevById.get(String(nextBoard.id));
    if (!prevBoard) continue; // creating a new board is allowed
    if (!canApplyBoardMutation(prevBoard, nextBoard, email, silent)) return false;
  }

  return true;
}
'''

if "function normalizeBoardAccessRole(" not in s:
    marker = "function HomeTodayPage("
    idx = s.find(marker)
    if idx < 0:
        marker = "function Sidebar("
        idx = s.find(marker)
    if idx < 0:
        idx = s.find("function AppContent(")
    if idx < 0:
        raise SystemExit("Cannot find insertion marker for role helpers")
    s = s[:idx] + role_helpers + "\n" + s[idx:]
    print("[ok] role helpers inserted")
else:
    print("[skip] role helpers already present")

# Guard all patchBoardById / updateBoard changes through applyBoardPatch.
if "canApplyBoardMutation(localPrevBoard, localNextRaw, authUser?.email)" not in s:
    replace_once(
        "const localNextRaw = updater(localPrevBoard);\n    const localNextBoard = stampBoardTaskMetadata(localPrevBoard, localNextRaw, actorEmail);",
        "const localNextRaw = updater(localPrevBoard);\n    if (!canApplyBoardMutation(localPrevBoard, localNextRaw, authUser?.email)) return;\n    const localNextBoard = stampBoardTaskMetadata(localPrevBoard, localNextRaw, actorEmail);",
        "role guard in applyBoardPatch",
    )
else:
    print("[skip] applyBoardPatch already guarded")

# Add guardedSetBoards wrapper after patchBoardById.
guarded_set_boards = r'''
  const guardedSetBoards = (updater: any) => {
    setBoards(prevBoards => {
      const nextBoards = typeof updater === "function" ? updater(prevBoards) : updater;
      return canApplyBoardsMutation(prevBoards, nextBoards, authUser?.email) ? nextBoards : prevBoards;
    });
  };
'''
if "const guardedSetBoards = (updater" not in s:
    replace_once(
        "  const patchBoardById = (boardId, updater) => {\n    applyBoardPatch(boardId, updater);\n  };\n",
        "  const patchBoardById = (boardId, updater) => {\n    applyBoardPatch(boardId, updater);\n  };\n" + guarded_set_boards,
        "guardedSetBoards wrapper",
    )
else:
    print("[skip] guardedSetBoards already exists")

# Guard deleteBoard directly.
if "only Admin can delete this board" not in s:
    replace_once(
        "    if (!target) return;\n\n    if (asArray(boards).length <= 1) {",
        "    if (!target) return;\n\n    const deleteRole = getBoardRole(target, authUser?.email);\n    if (!getBoardPermissions(deleteRole).canAdmin) {\n      window.alert(\"Permission denied: only Admin can delete this board.\");\n      return;\n    }\n\n    if (asArray(boards).length <= 1) {",
        "admin guard in deleteBoard",
    )
else:
    print("[skip] deleteBoard already guarded")

# Pass guardedSetBoards/currentUserEmail to Dashboard.
s = s.replace(
    '<Dashboard boards={boards} onPatchBoard={patchBoardById} onSetBoards={setBoards} simpleMode={simpleMode} />',
    '<Dashboard boards={boards} onPatchBoard={patchBoardById} onSetBoards={guardedSetBoards} simpleMode={simpleMode} currentUserEmail={authUser.email} />'
)
s = s.replace(
    '<Dashboard boards={boards} onPatchBoard={patchBoardById} onSetBoards={setBoards} />',
    '<Dashboard boards={boards} onPatchBoard={patchBoardById} onSetBoards={guardedSetBoards} currentUserEmail={authUser.email} />'
)

# Dashboard signature and panel propagation.
s = s.replace(
    "function Dashboard({ boards, onPatchBoard, onSetBoards, simpleMode = true }: any) {",
    "function Dashboard({ boards, onPatchBoard, onSetBoards, simpleMode = true, currentUserEmail = '' }: any) {"
)
s = s.replace(
    "function Dashboard({ boards, onPatchBoard, onSetBoards }: any) {",
    "function Dashboard({ boards, onPatchBoard, onSetBoards, currentUserEmail = '' }: any) {"
)

panel_replacements = {
    '<PMSuitePanel boards={boards} onPatchBoard={onPatchBoard} onSetBoards={onSetBoards} />':
    '<PMSuitePanel boards={boards} onPatchBoard={onPatchBoard} onSetBoards={onSetBoards} currentUserEmail={currentUserEmail} />',
    '<AdvancedPMPanel boards={boards} onPatchBoard={onPatchBoard} onSetBoards={onSetBoards} />':
    '<AdvancedPMPanel boards={boards} onPatchBoard={onPatchBoard} onSetBoards={onSetBoards} currentUserEmail={currentUserEmail} />',
    '<GovernancePanel boards={boards} onPatchBoard={onPatchBoard} />':
    '<GovernancePanel boards={boards} onPatchBoard={onPatchBoard} currentUserEmail={currentUserEmail} />',
    '<SettingsPanel boards={boards} onPatchBoard={onPatchBoard} />':
    '<SettingsPanel boards={boards} onPatchBoard={onPatchBoard} currentUserEmail={currentUserEmail} />',
}
for old, new in panel_replacements.items():
    if old in s:
        s = s.replace(old, new)
        print(f"[ok] propagated currentUserEmail for {old.split()[0][1:]}")

# BoardView computes role permissions.
if "const boardRole = getBoardRole(board, currentUserEmail);" not in s:
    replaced = False
    for marker in [
        '  const [activityOpen, setActivityOpen] = useState(false);\n',
        '  const [panelItem, setPanelItem] = useState(null);\n',
        '  const [filterOwner, setFilterOwner] = useState("All");\n',
    ]:
        if marker in s:
            s = s.replace(marker, marker + '  const boardRole = getBoardRole(board, currentUserEmail);\n  const boardPermissions = getBoardPermissions(boardRole);\n', 1)
            print("[ok] BoardView role permissions")
            replaced = True
            break
    if not replaced:
        print("[warn] could not insert BoardView role permissions")
else:
    print("[skip] BoardView role permissions already present")

# Add a role badge in BoardView header if there is a suitable marker.
if "Your role:" not in s:
    role_badge = '<span style={{ background: boardPermissions.canEdit ? "#e8fff3" : boardPermissions.canReview ? "#eef4ff" : "#f6f7fb", color: boardPermissions.canEdit ? "#00a35a" : boardPermissions.canReview ? "#1f5ecf" : "#676879", borderRadius: 999, padding: "3px 9px", fontSize: 11, fontWeight: 900 }}>Your role: {boardRole}</span>'
    # Put next to Activity Log button if possible.
    if '<button onClick={() => setActivityOpen(true)' in s:
        s = s.replace('<button onClick={() => setActivityOpen(true)', role_badge + '\n          <button onClick={() => setActivityOpen(true)', 1)
        print("[ok] BoardView role badge")
    else:
        print("[skip] BoardView role badge marker not found")

# GroupTable accepts boardRole and enforces permissions.
s = re.sub(r"function GroupTable\(\{\s*", "function GroupTable({ boardRole = \"Admin\", ", s, count=1)

old_perm = '''  const currentRole = normalizeRole(group.memberRoles?.[memberRoleKey(normalizedUserEmail)] || "editor");
  const canManage = !normalizedUserEmail || currentRole === "editor";
  const canEditTask = canManage;
  const canEditStatus = true;'''
new_perm = '''  const currentRole = normalizeRole(group.memberRoles?.[memberRoleKey(normalizedUserEmail)] || "editor");
  const boardPermissions = getBoardPermissions(boardRole);
  const canManage = boardPermissions.canAdmin && (!normalizedUserEmail || currentRole === "editor");
  const canEditTask = boardPermissions.canEdit && (!normalizedUserEmail || currentRole === "editor");
  const canEditStatus = boardPermissions.canEdit || boardPermissions.canReview;'''
replace_once(old_perm, new_perm, "GroupTable permission logic")

# Pass boardRole to GroupTable instances.
s = re.sub(r"(<GroupTable\b(?![^>]*boardRole=))", r"\1 boardRole={boardRole}", s)

# Guard PMSuite/Advanced/Governance direct UI signatures with currentUserEmail where possible.
s = s.replace("function PMSuitePanel({ boards, onPatchBoard, onSetBoards }: any) {", "function PMSuitePanel({ boards, onPatchBoard, onSetBoards, currentUserEmail = '' }: any) {")
s = s.replace("function AdvancedPMPanel({ boards, onPatchBoard, onSetBoards }: any) {", "function AdvancedPMPanel({ boards, onPatchBoard, onSetBoards, currentUserEmail = '' }: any) {")
s = s.replace("function GovernancePanel({ boards, onPatchBoard }: any) {", "function GovernancePanel({ boards, onPatchBoard, currentUserEmail = '' }: any) {")
s = s.replace("function SettingsPanel({ boards, onPatchBoard }: any) {", "function SettingsPanel({ boards, onPatchBoard, currentUserEmail = '' }: any) {")

# Add admin guard for role add/remove in GovernancePanel if currentUserEmail is now present.
if "Only Admin can change board roles" not in s:
    s = s.replace(
        "  function addRole() {\n    if (!board || !normalizeEmail(roleEmail)) return;",
        "  function addRole() {\n    if (!board || !normalizeEmail(roleEmail)) return;\n    if (!getBoardPermissions(getBoardRole(board, currentUserEmail)).canAdmin) { window.alert(\"Only Admin can change board roles.\"); return; }",
        1
    )
    s = s.replace(
        "  function removeRole(email) {\n    if (!board || !email) return;",
        "  function removeRole(email) {\n    if (!board || !email) return;\n    if (!getBoardPermissions(getBoardRole(board, currentUserEmail)).canAdmin) { window.alert(\"Only Admin can change board roles.\"); return; }",
        1
    )
    print("[ok] Governance role add/remove admin guard")
else:
    print("[skip] role add/remove already guarded")

# Build-time sanity checks.
if "function normalizeBoardAccessRole(" not in s:
    raise SystemExit("role helpers missing")
if "const guardedSetBoards = (updater" not in s:
    raise SystemExit("guardedSetBoards missing")
if "canApplyBoardMutation(localPrevBoard" not in s:
    raise SystemExit("applyBoardPatch guard missing")

p.write_text(s, encoding="utf-8")
print("Real role enforcement patch complete.")
PY

cd holifriday-app
npm run build

cd ..
git add -A
git commit -m "Enforce board roles on mutations" || echo "Nothing to commit"
git push
