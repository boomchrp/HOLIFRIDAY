#!/usr/bin/env bash
set -euo pipefail

cd /workspaces/HOLIFRIDAY

python3 <<'PY'
from pathlib import Path
import re

p = Path("holifriday-app/src/App.tsx")
s = p.read_text(encoding="utf-8")
old = s

# 1) Fix broken escaped quotes in function parameter defaults:
#    boardRole = \"Admin\"  -> boardRole = "Admin"
s = s.replace('boardRole = \\"Admin\\"', 'boardRole = "Admin"')
s = s.replace('boardRole = \\\\"Admin\\\\"', 'boardRole = "Admin"')

# 2) BoardView should NOT receive boardRole as a prop because it calculates:
#    const boardRole = getBoardRole(board, currentUserEmail);
#    Remove only from BoardView signature to avoid redeclare errors.
s = re.sub(
    r'function\s+BoardView\s*\(\{\s*boardRole\s*=\s*"Admin"\s*,\s*',
    'function BoardView({ ',
    s,
    count=1,
)

# 3) Group should receive boardRole with a normal default.
s = re.sub(
    r'function\s+Group\s*\(\{\s*boardRole\s*=\s*"Admin"\s*,\s*',
    'function Group({ boardRole = "Admin", ',
    s,
    count=1,
)

# 4) Clean double spaces introduced by auto patch.
s = s.replace('",  group', '", group')
s = s.replace('{  board,', '{ board,')
s = s.replace('{  group,', '{ group,')

# 5) Safety scan for invalid escaped quote in function signatures.
bad = []
for i, line in enumerate(s.splitlines(), 1):
    if line.lstrip().startswith("function ") and '\\"' in line:
        bad.append((i, line))

if bad:
    print("Still found invalid escaped quotes in function signatures:")
    for i, line in bad[:20]:
        print(f"{i}: {line}")
    raise SystemExit(1)

# 6) Safety scan for BoardView receiving boardRole.
m = re.search(r'function\s+BoardView\s*\(([^)]*)\)', s, flags=re.S)
if m and "boardRole" in m.group(1):
    print("BoardView signature still contains boardRole:")
    print(m.group(0)[:500])
    raise SystemExit(1)

p.write_text(s, encoding="utf-8")

print("Fixed escaped boardRole quotes and BoardView signature.")
if s == old:
    print("No text changes were made; file may already be fixed.")
PY

cd holifriday-app
npm run build

cd ..
git add -A
git commit -m "Fix boardRole quote syntax" || echo "Nothing to commit"
git push
