#!/usr/bin/env bash
set -euo pipefail

cd /workspaces/HOLIFRIDAY

python3 <<'PY'
from pathlib import Path
import re

p = Path("holifriday-app/src/App.tsx")
s = p.read_text(encoding="utf-8")

matches = list(re.finditer(r"^function BoardView\s*\(", s, flags=re.M))
print(f"Found BoardView definitions: {len(matches)}")

if len(matches) <= 1:
    print("No duplicate BoardView found. Nothing to remove.")
    p.write_text(s, encoding="utf-8")
    raise SystemExit(0)

def find_function_end(text: str, start: int) -> int:
    # find first opening brace after function signature
    brace_start = text.find("{", start)
    if brace_start < 0:
        raise RuntimeError("Cannot find opening brace for BoardView")

    depth = 0
    i = brace_start
    in_str = None
    escape = False
    in_line_comment = False
    in_block_comment = False

    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""

        if in_line_comment:
            if ch == "\n":
                in_line_comment = False
            i += 1
            continue

        if in_block_comment:
            if ch == "*" and nxt == "/":
                in_block_comment = False
                i += 2
            else:
                i += 1
            continue

        if in_str:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == in_str:
                in_str = None
            i += 1
            continue

        if ch == "/" and nxt == "/":
            in_line_comment = True
            i += 2
            continue

        if ch == "/" and nxt == "*":
            in_block_comment = True
            i += 2
            continue

        if ch in ("'", '"', "`"):
            in_str = ch
            i += 1
            continue

        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                # include trailing semicolon/newlines if any
                end = i + 1
                while end < len(text) and text[end] in " \t\r\n;":
                    end += 1
                return end

        i += 1

    raise RuntimeError("Cannot find end of BoardView function")

# Keep the last BoardView definition, remove earlier duplicates.
remove_ranges = []
for m in matches[:-1]:
    start = m.start()
    end = find_function_end(s, start)
    remove_ranges.append((start, end))
    print(f"Removing duplicate BoardView block: chars {start}-{end}")

for start, end in reversed(remove_ranges):
    s = s[:start] + "\n\n" + s[end:]

# Safety: ensure exactly one remains.
remaining = list(re.finditer(r"^function BoardView\s*\(", s, flags=re.M))
print(f"Remaining BoardView definitions: {len(remaining)}")
if len(remaining) != 1:
    raise SystemExit("Fix failed: BoardView count is not 1")

p.write_text(s, encoding="utf-8")
print("Duplicate BoardView removed.")
PY

cd holifriday-app
npm run build

cd ..
git add -A
git commit -m "Fix duplicate BoardView after simple navigation update" || echo "Nothing to commit"
git push
