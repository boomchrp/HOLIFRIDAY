#!/usr/bin/env bash
set -euo pipefail

cd /workspaces/HOLIFRIDAY

python3 <<'PY'
from pathlib import Path
import re

p = Path("holifriday-app/src/App.tsx")
s = p.read_text(encoding="utf-8")
lines = s.splitlines()

fixed = []
changed = 0

for i, line in enumerate(lines, 1):
    original = line
    stripped = line.lstrip()

    # Fix Group signature only.
    if stripped.startswith("function Group("):
        # boardRole = \"Admin\",  -> boardRole = "Admin",
        line = re.sub(
            r'boardRole\s*=\s*\\+"Admin"\\+\s*,\s*',
            'boardRole = "Admin", ',
            line,
        )
        # Also handle already partly fixed variants.
        line = re.sub(
            r'boardRole\s*=\s*"Admin"\s*,\s*',
            'boardRole = "Admin", ',
            line,
        )
        line = line.replace('",  group', '", group')
        line = line.replace('Admin",  group', 'Admin", group')
        if line != original:
            print(f"[ok] fixed Group signature line {i}")
            print("     before:", original)
            print("     after: ", line)
            changed += 1

    # Fix BoardView signature only.
    if stripped.startswith("function BoardView("):
        # BoardView already has const boardRole = getBoardRole(...) inside,
        # so remove boardRole prop completely from signature.
        line = re.sub(
            r'\{\s*boardRole\s*=\s*\\+"Admin"\\+\s*,\s*',
            '{ ',
            line,
        )
        line = re.sub(
            r'\{\s*boardRole\s*=\s*"Admin"\s*,\s*',
            '{ ',
            line,
        )
        line = line.replace('{  board,', '{ board,')
        if line != original:
            print(f"[ok] fixed BoardView signature line {i}")
            print("     before:", original)
            print("     after: ", line)
            changed += 1

    fixed.append(line)

s2 = "\n".join(fixed) + ("\n" if s.endswith("\n") else "")

# Absolute safety cleanup: no function signature should contain escaped quote.
bad = []
for i, line in enumerate(s2.splitlines(), 1):
    if line.lstrip().startswith("function ") and '\\"' in line:
        bad.append((i, line))

if bad:
    print("[FAIL] still found escaped quotes in function signatures:")
    for i, line in bad:
        print(f"{i}: {line}")
    raise SystemExit(1)

# BoardView must not receive boardRole prop.
m = re.search(r'function\s+BoardView\s*\((.*?)\)\s*\{', s2, flags=re.S)
if m and "boardRole" in m.group(1):
    print("[FAIL] BoardView signature still contains boardRole:")
    print(m.group(0)[:500])
    raise SystemExit(1)

# Group should have boardRole default, but use valid quotes.
m = re.search(r'function\s+Group\s*\((.*?)\)\s*\{', s2, flags=re.S)
if m:
    sig = m.group(0)
    if '\\"' in sig:
        print("[FAIL] Group signature still contains escaped quote:")
        print(sig[:500])
        raise SystemExit(1)
    if "boardRole" not in sig:
        print("[WARN] Group signature has no boardRole. Build may still pass, but role prop will not be used.")
else:
    print("[WARN] Group function signature not found.")

p.write_text(s2, encoding="utf-8")
print(f"Signature repair complete. Changed lines: {changed}")
PY

cd holifriday-app
npm run build

cd ..
git add -A
git commit -m "Repair invalid boardRole function signatures" || echo "Nothing to commit"
git push
