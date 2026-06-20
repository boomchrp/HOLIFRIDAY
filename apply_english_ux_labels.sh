#!/usr/bin/env bash
set -euo pipefail

cd /workspaces/HOLIFRIDAY
git checkout main
git pull

python3 <<'PY'
from pathlib import Path

p = Path("holifriday-app/src/App.tsx")
s = p.read_text(encoding="utf-8")
old = s

replacements = [
    # Quick guide
    ("<b>Overview</b> = ภาพรวมโปรเจค • <b>Tools</b> = เครื่องมือจัดการบอร์ด/report/export • <b>Planning</b> = automation / dependency / graph • <b>Control</b> = baseline / role",
     "<b>Overview</b> = main project status • <b>Tools</b> = board tools, reports, and exports • <b>Planning</b> = automation, dependencies, and charts • <b>Control</b> = baselines and team roles"),

    # PM Suite / Tools descriptions
    ("จัดการบอร์ด: เปลี่ยนชื่อ สี คัดลอก เก็บถาวร กู้คืน และ export",
     "Manage boards: rename, color, duplicate, archive, restore, and export."),
    ("สร้างบอร์ดใหม่จาก template ที่ใช้บ่อย",
     "Create a new board from common workflow templates."),
    ("กฎอัตโนมัติพื้นฐาน เช่น overdue, PM review, approved",
     "Basic automation rules such as overdue, PM review, and approved."),
    ("ดาวน์โหลดไฟล์สำหรับ Excel หรือ Google Calendar",
     "Download files for Excel or Google Calendar."),
    ("ใส่ลิงก์ไฟล์ เช่น Google Drive / PDF / Excel ไว้ใน task",
     "Add file links such as Google Drive, PDF, or Excel to a task."),
    ("สร้างสรุปโปรเจคแบบส่งต่อ PM ได้",
     "Generate a PM-ready project summary."),

    # Advanced / Planning descriptions
    ("ตั้งกฎอัตโนมัติ ลำดับงาน แก้วันงาน และดูกราฟสรุป",
     "Set automation rules, task order, task dates, and summary charts."),
    ("สร้างกฎเองแบบไม่ต้องเขียนโค้ด แล้วกดรันเมื่อพร้อม",
     "Create custom rules without code, then run them when ready."),
    ("Rule name เช่น Done → Notify PM",
     "Rule name, e.g. Done → Notify PM"),
    ("กำหนดว่างานไหนต้องเสร็จก่อน แล้วเลื่อนวันอัตโนมัติเมื่อมีดีเลย์",
     "Define which tasks must finish first, then auto-shift dates when delays happen."),
    ("+ งานก่อนหน้า",
     "+ predecessor task"),
    ("กราฟสรุปความคืบหน้า งานล่าช้า คิว PM review และความเสี่ยง",
     "Charts for progress, overdue work, PM review queue, and risk."),

    # Governance / Control descriptions
    ("เก็บแผนตั้งต้น เปรียบเทียบดีเลย์ และจัดการสิทธิ์คนในบอร์ด",
     "Save baseline plans, compare delays, and manage board roles."),
    ("บันทึกแผนปัจจุบันไว้เป็นจุดอ้างอิง แล้วใช้เทียบว่าดีเลย์หรือเปลี่ยนอะไรบ้าง",
     "Save the current plan as a reference, then compare delays and plan changes later."),
    ("ชื่อ snapshot เช่น Plan Rev.0",
     "Snapshot name, e.g. Plan Rev.0"),
    ("กำหนดบทบาทคนในบอร์ด เช่น Admin, Editor, Reviewer, Viewer, Client",
     "Assign board roles such as Admin, Editor, Reviewer, Viewer, and Client."),
    ("ตอนนี้ระบบเก็บและแสดง role แล้ว ขั้นถัดไปคือ lock ปุ่มตาม role เช่น Admin เท่านั้นที่ archive/delete/automation ได้, Reviewer approve ได้, Viewer ดูอย่างเดียว",
     "This version stores and displays roles. The next step is to lock actions by role, such as Admin-only archive/delete/automation, Reviewer approval, and Viewer read-only access."),
    ("ดูว่างานไหนเลื่อน เปลี่ยน owner/status หรือเพิ่ม/หายไปจากแผนตั้งต้น",
     "See which tasks shifted, changed owner/status, or were added/removed from the baseline."),

    # Mixed labels
    ("Quick Guide", "Quick Guide"),
    ("Things to Check", "Things to Check"),
    ("Board Control", "Board Control"),
    ("New Board Templates", "New Board Templates"),
    ("Auto Rule Builder", "Auto Rule Builder"),
    ("Task Order + Critical Path", "Task Order + Critical Path"),
    ("Simple Charts", "Simple Charts"),
    ("Plan Snapshot", "Plan Snapshot"),
    ("Team Roles", "Team Roles"),
    ("Plan Change Summary", "Plan Change Summary"),
]

changed = 0
for a, b in replacements:
    if a in s:
        s = s.replace(a, b)
        changed += 1

# Replace any remaining Thai quick-guide text fragments if they were split by formatting.
thai_fragments = {
    "ภาพรวมโปรเจค": "main project status",
    "เครื่องมือจัดการบอร์ด/report/export": "board tools, reports, and exports",
    "baseline / role": "baselines and roles",
}
for a, b in thai_fragments.items():
    if a in s:
        s = s.replace(a, b)
        changed += 1

# Safety check: report remaining Thai characters in App.tsx, but do not fail because product data may contain Thai in user content later.
remaining_thai = sorted(set(ch for ch in s if "\u0E00" <= ch <= "\u0E7F"))
if remaining_thai:
    print(f"Warning: Thai characters still found in App.tsx ({len(remaining_thai)} unique). They may be in unrelated text.")
else:
    print("No Thai characters remain in App.tsx.")

p.write_text(s, encoding="utf-8")
print(f"English UX text pass complete. Replacement groups changed: {changed}")
if s == old:
    print("No changes were needed; text may already be English.")
PY

cd holifriday-app
npm run build

cd ..
git add -A
git commit -m "Use English UX guide text" || echo "Nothing to commit"
git push
