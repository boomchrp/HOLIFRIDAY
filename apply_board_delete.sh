#!/usr/bin/env bash
set -euo pipefail

cd /workspaces/HOLIFRIDAY
git checkout main
git pull

python3 <<'PY'
from pathlib import Path

p = Path('holifriday-app/src/App.tsx')
s = p.read_text(encoding='utf-8')

def replace_once(old, new, label):
    global s
    if old not in s:
        print(f'[skip] {label}')
        return False
    s = s.replace(old, new, 1)
    print(f'[ok] {label}')
    return True

replace_once(
'''function Sidebar({ boards, activeId, activeView, onSelect, onAdd, onChangeView }) {''',
'''function Sidebar({ boards, activeId, activeView, onSelect, onAdd, onDelete, onChangeView }) {''',
'Sidebar onDelete prop'
)

old_board_list = '''        {boards.map(b => (
          <button key={b.id} onClick={() => { onSelect(b.id); onChangeView("boards"); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: open ? "9px 14px" : "9px 0", justifyContent: open ? "flex-start" : "center", background: activeId === b.id && activeView === "boards" ? "rgba(255,255,255,.12)" : "none", border: "none", cursor: "pointer", transition: "background .15s" }}
            onMouseEnter={e => { if (!(activeId === b.id && activeView === "boards")) e.currentTarget.style.background = "rgba(255,255,255,.06)"; }}
            onMouseLeave={e => { if (!(activeId === b.id && activeView === "boards")) e.currentTarget.style.background = "none"; }}
          >
            <div style={{ width: 10, height: 10, borderRadius: 3, background: b.color, flexShrink: 0 }} />
            {open && <span style={{ fontSize: 13, color: activeId === b.id && activeView === "boards" ? "#fff" : "rgba(255,255,255,.55)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.name}</span>}
          </button>
        ))}'''

new_board_list = '''        {boards.map(b => {
          const active = activeId === b.id && activeView === "boards";
          return (
            <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 4, paddingRight: open ? 8 : 0 }}>
              <button onClick={() => { onSelect(b.id); onChangeView("boards"); }} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10, padding: open ? "9px 6px 9px 14px" : "9px 0", justifyContent: open ? "flex-start" : "center", background: active ? "rgba(255,255,255,.12)" : "none", border: "none", cursor: "pointer", transition: "background .15s", borderRadius: open ? "0 8px 8px 0" : 0 }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,.06)"; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = "none"; }}
              >
                <div style={{ width: 10, height: 10, borderRadius: 3, background: b.color, flexShrink: 0 }} />
                {open && <span style={{ fontSize: 13, color: active ? "#fff" : "rgba(255,255,255,.55)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.name}</span>}
              </button>
              {open && boards.length > 1 && (
                <button
                  title={`Delete board: ${b.name}`}
                  aria-label={`Delete board ${b.name}`}
                  onClick={e => { e.preventDefault(); e.stopPropagation(); onDelete?.(b.id); }}
                  style={{ width: 26, height: 26, borderRadius: 7, border: "1px solid rgba(255,255,255,.10)", background: "rgba(255,255,255,.04)", color: "rgba(255,255,255,.35)", cursor: "pointer", fontSize: 15, lineHeight: 1, flexShrink: 0 }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(226,68,92,.22)"; e.currentTarget.style.color = "#fff"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,.04)"; e.currentTarget.style.color = "rgba(255,255,255,.35)"; }}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}'''

replace_once(old_board_list, new_board_list, 'Sidebar board delete UI')

if 'const deleteBoard = boardId =>' not in s:
    old_add_board_tail = '''  const addBoard = name => {
    const color = GROUP_COLORS[boards.length % GROUP_COLORS.length];
    const nb = {
      id: uid(),
      name,
      color,
      groups: [{ id: uid(), name: "General", color, members: [], memberRoles: {}, invites: [], items: [] }],
      activityLogs: [],
    };
    setBoards(bs => [...bs, nb]);
    setActiveId(nb.id);
    setActiveView("boards");
  };

  useEffect(() => {'''

    new_add_board_tail = '''  const addBoard = name => {
    const color = GROUP_COLORS[boards.length % GROUP_COLORS.length];
    const nb = {
      id: uid(),
      name,
      color,
      groups: [{ id: uid(), name: "General", color, members: [], memberRoles: {}, invites: [], items: [] }],
      activityLogs: [],
    };
    setBoards(bs => [...bs, nb]);
    setActiveId(nb.id);
    setActiveView("boards");
  };

  const deleteBoard = boardId => {
    const target = asArray(boards).find(b => b.id === boardId);
    if (!target) return;

    if (asArray(boards).length <= 1) {
      window.alert("You need at least one board. Create another board before deleting this one.");
      return;
    }

    const taskCount = asArray(target.groups).reduce((sum, g) => sum + asArray(g.items).length, 0);
    const ok = window.confirm(`Delete board "${target.name}"?\\n\\nThis will permanently remove ${asArray(target.groups).length} group(s) and ${taskCount} task(s) from this shared workspace.\\n\\nTip: export a backup first if you may need it later.`);
    if (!ok) return;

    const nextBoards = asArray(boards).filter(b => b.id !== boardId);
    setBoards(nextBoards);

    if (activeId === boardId) {
      setActiveId(nextBoards[0]?.id || INITIAL_BOARDS[0].id);
      setActiveView(nextBoards.length > 0 ? "boards" : "dashboard");
    }
  };

  useEffect(() => {'''
    replace_once(old_add_board_tail, new_add_board_tail, 'deleteBoard function')
else:
    print('[skip] deleteBoard function already exists')

replace_once(
'''<Sidebar boards={boards} activeId={activeId} activeView={activeView} onSelect={setActiveId} onAdd={addBoard} onChangeView={setActiveView} />''',
'''<Sidebar boards={boards} activeId={activeId} activeView={activeView} onSelect={setActiveId} onAdd={addBoard} onDelete={deleteBoard} onChangeView={setActiveView} />''',
'pass deleteBoard to Sidebar'
)

p.write_text(s, encoding='utf-8')
print('Patch complete: Board delete button')
PY

cd holifriday-app
npm run build

cd ..
git add -A
git commit -m "Add board delete action"
git push
