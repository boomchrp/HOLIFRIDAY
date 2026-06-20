#!/usr/bin/env bash
set -euo pipefail

cd /workspaces/HOLIFRIDAY

python3 <<'PY'
from pathlib import Path
import re

p = Path("holifriday-app/src/App.tsx")
s = p.read_text(encoding="utf-8")

def fix_function_line(src: str, func_name: str) -> str:
    pattern = rf"^function\s+{re.escape(func_name)}\([^\n]*\)\s*\{{"
    m = re.search(pattern, src, flags=re.M)
    if not m:
        print(f"[skip] {func_name}: signature not found")
        return src

    old_line = m.group(0)
    new_line = old_line

    # Fix literal backslash-quote only on this function signature.
    # Example: boardRole = \"Admin\" -> boardRole = "Admin"
    new_line = new_line.replace('\\"', '"')

    if func_name == "BoardView":
        # BoardView calculates boardRole inside itself, so do not receive boardRole from props.
        new_line = re.sub(
            r'\{\s*boardRole\s*=\s*"Admin"\s*,\s*',
            '{ ',
            new_line,
            count=1,
        )
        new_line = new_line.replace('{  board,', '{ board,')

    if func_name == "Group":
        # Group should keep boardRole prop with normal quotes.
        new_line = re.sub(
            r'\{\s*boardRole\s*=\s*"Admin"\s*,\s*',
            '{ boardRole = "Admin", ',
            new_line,
            count=1,
        )
        new_line = new_line.replace('",  group', '", group')
        new_line = new_line.replace('Admin",  group', 'Admin", group')

    if new_line != old_line:
        line_no = src.count("\n", 0, m.start()) + 1
        print(f"[ok] fixed {func_name} signature line {line_no}")
        print("before:", old_line)
        print("after: ", new_line)
    else:
        print(f"[skip] {func_name}: no change needed")

    return src[:m.start()] + new_line + src[m.end():]

s = fix_function_line(s, "Group")
s = fix_function_line(s, "BoardView")

# Final exact checks only for the two problematic signatures.
for func_name in ["Group", "BoardView"]:
    m = re.search(rf"^function\s+{func_name}\([^\n]*\)\s*\{{", s, flags=re.M)
    if not m:
        raise SystemExit(f"{func_name} signature missing after fix")
    sig = m.group(0)
    print(f"[check] {func_name}: {sig}")
    if '\\"' in sig:
        raise SystemExit(f"{func_name} still has escaped quote: {sig}")
    if func_name == "BoardView" and "boardRole" in sig:
        raise SystemExit(f"BoardView still has boardRole prop: {sig}")

p.write_text(s, encoding="utf-8")
print("Fixed broken role signatures and saved App.tsx.")
PY

cd holifriday-app
npm run build

cd ..
git add -A
git commit -m "Fix broken role signatures" || echo "Nothing to commit"
git push
