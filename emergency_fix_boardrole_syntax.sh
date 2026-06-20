#!/usr/bin/env bash
set -euo pipefail

cd /workspaces/HOLIFRIDAY

python3 <<'PY'
from pathlib import Path
import re

p = Path("holifriday-app/src/App.tsx")
s = p.read_text(encoding="utf-8")

print("Before fix: lines with broken boardRole quote")
for i, line in enumerate(s.splitlines(), 1):
    if 'boardRole' in line and '\\"Admin\\"' in line:
        print(f"{i}: {line}")

# Fix the exact broken text in function signatures:
# boardRole = \"Admin\"  -> boardRole = "Admin"
s = s.replace(r'boardRole = \"Admin\"', 'boardRole = "Admin"')

# More robust cleanup in case there are multiple backslashes before quotes.
s = re.sub(
    r'boardRole\s*=\s*\\+"Admin"\\+',
    'boardRole = "Admin"',
    s,
)

# BoardView calculates boardRole inside the function, so it must NOT receive boardRole in props.
s = re.sub(
    r'function\s+BoardView\s*\(\{\s*boardRole\s*=\s*"Admin"\s*,\s*',
    'function BoardView({ ',
    s,
    count=1,
)

# Group should keep boardRole prop with a normal default.
s = re.sub(
    r'function\s+Group\s*\(\{\s*boardRole\s*=\s*"Admin"\s*,\s*',
    'function Group({ boardRole = "Admin", ',
    s,
    count=1,
)

# Clean extra spacing.
s = s.replace('",  group', '", group')
s = s.replace('{  board,', '{ board,')
s = s.replace('{  group,', '{ group,')

# Safety checks.
bad = []
for i, line in enumerate(s.splitlines(), 1):
    if line.lstrip().startswith("function ") and '\\"' in line:
        bad.append((i, line))

if bad:
    print("Still found invalid escaped quotes in function signatures:")
    for i, line in bad[:30]:
        print(f"{i}: {line}")
    raise SystemExit(1)

m = re.search(r'function\s+BoardView\s*\((.*?)\)\s*\{', s, flags=re.S)
if m and "boardRole" in m.group(1):
    print("BoardView signature still contains boardRole:")
    print(m.group(0)[:500])
    raise SystemExit(1)

# Final print for confirmation.
for i, line in enumerate(s.splitlines(), 1):
    if line.lstrip().startswith("function Group(") or line.lstrip().startswith("function BoardView("):
        print(f"{i}: {line}")

p.write_text(s, encoding="utf-8")
print("Emergency boardRole syntax fix complete.")
PY

cd holifriday-app
npm run build

cd ..
git add -A
git commit -m "Fix broken boardRole syntax in team minimal mode" || echo "Nothing to commit"
git push
