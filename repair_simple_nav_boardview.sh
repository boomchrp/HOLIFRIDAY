#!/usr/bin/env bash
set -euo pipefail

cd /workspaces/HOLIFRIDAY

python3 <<'PY'
from pathlib import Path
import re

p = Path("holifriday-app/src/App.tsx")
s = p.read_text(encoding="utf-8")

def scan_matching(text, start, open_ch, close_ch):
    depth = 0
    i = start
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

        if ch == open_ch:
            depth += 1
        elif ch == close_ch:
            depth -= 1
            if depth == 0:
                return i + 1

        i += 1

    raise RuntimeError(f"Cannot match {open_ch}{close_ch} from char {start}")

def line_start(text, idx):
    return text.rfind("\n", 0, idx) + 1

def consume_trailing_ws(text, idx):
    while idx < len(text) and text[idx] in " \t\r\n;":
        idx += 1
    return idx

def find_function_end(text, func_start):
    paren = text.find("(", func_start)
    if paren < 0:
        raise RuntimeError("Cannot find function parameter start")
    paren_end = scan_matching(text, paren, "(", ")")
    body_start = text.find("{", paren_end)
    if body_start < 0:
        raise RuntimeError("Cannot find function body start")
    body_end = scan_matching(text, body_start, "{", "}")
    return consume_trailing_ws(text, body_end)

def remove_range(text, start, end):
    return text[:start] + "\n\n" + text[end:]

# Step 1: remove true duplicate BoardView function declarations, keep the last/newest.
matches = list(re.finditer(r"^function\s+BoardView\s*\(", s, flags=re.M))
print(f"BoardView declarations before fix: {len(matches)}")

if len(matches) > 1:
    ranges = []
    for m in matches[:-1]:
        start = m.start()
        end = find_function_end(s, start)
        ranges.append((start, end))
        print(f"Scheduled duplicate BoardView removal: chars {start}-{end}")
    for start, end in reversed(ranges):
        s = remove_range(s, start, end)

# Step 2: remove orphaned old BoardView body that starts with only ') {'.
# This is the likely source of: TS1128 Declaration or statement expected at ') {'.
removed_orphan = 0
while True:
    orphan = None
    for m in re.finditer(r"(?m)^\s*\)\s*\{\s*$", s):
        lookahead = s[m.end(): m.end() + 1200]
        if 'const [view, setView] = useState("table")' in lookahead or "table | kanban | calendar | workload" in lookahead or "function BoardView" not in s[max(0, m.start()-80):m.start()]:
            orphan = m
            break

    if orphan is None:
        break

    start = line_start(s, orphan.start())
    brace = s.find("{", orphan.start(), orphan.end() + 5)
    if brace < 0:
        # fallback: remove just the orphan line
        end = s.find("\n", orphan.end())
        if end < 0:
            end = orphan.end()
        else:
            end += 1
        print(f"Removing orphan signature line only: chars {start}-{end}")
        s = remove_range(s, start, end)
        removed_orphan += 1
        continue

    try:
        end = scan_matching(s, brace, "{", "}")
        end = consume_trailing_ws(s, end)
        print(f"Removing orphaned BoardView body: chars {start}-{end}")
        s = remove_range(s, start, end)
        removed_orphan += 1
    except Exception as err:
        # fallback: remove until next top-level function or comment marker
        next_func = s.find("\nfunction ", orphan.end())
        if next_func < 0:
            next_func = s.find("\n// ───", orphan.end())
        if next_func < 0:
            raise
        print(f"Removing orphaned block by fallback: chars {start}-{next_func} ({err})")
        s = remove_range(s, start, next_func)
        removed_orphan += 1

print(f"Orphan blocks removed: {removed_orphan}")

# Step 3: final sanity checks.
matches_after = list(re.finditer(r"^function\s+BoardView\s*\(", s, flags=re.M))
print(f"BoardView declarations after fix: {len(matches_after)}")

if len(matches_after) != 1:
    raise SystemExit(f"Expected exactly one BoardView, found {len(matches_after)}")

bad_orphan = re.search(r"(?m)^\s*\)\s*\{\s*$", s)
if bad_orphan:
    line_no = s.count("\n", 0, bad_orphan.start()) + 1
    raise SystemExit(f"Still found orphan ') {{' at line {line_no}")

p.write_text(s, encoding="utf-8")
print("Repair complete.")
PY

cd holifriday-app
npm run build

cd ..
git add -A
git commit -m "Repair simple navigation BoardView cleanup" || echo "Nothing to commit"
git push
