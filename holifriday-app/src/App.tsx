import { useState, useRef, useEffect, useCallback, useMemo } from "react";

// ─── Constants ───────────────────────────────────────────────────────────────

const GROUP_COLORS = ["#0073ea","#e2445c","#00c875","#fdab3d","#a25ddc","#ff642e","#579bfc","#bb3354","#9d50dd","#ffcb00"];
const CONFETTI_COLORS = ["#e2445c","#00c875","#fdab3d","#0073ea","#a25ddc","#ffcb00","#ff642e","#579bfc"];
const OWNER_POOL = ["Alice","Bob","Carol","Dave","Eve","Frank"];
const TAG_OPTIONS = [
  { label: "Design",    color: "#a25ddc" },
  { label: "Dev",       color: "#0073ea" },
  { label: "Marketing", color: "#fdab3d" },
  { label: "Research",  color: "#579bfc" },
  { label: "Urgent",    color: "#e2445c" },
  { label: "Review",    color: "#00c875" },
];
const STATUS_OPTIONS = [
  { label: "Done",           color: "#00c875" },
  { label: "Working on it",  color: "#fdab3d" },
  { label: "Stuck",          color: "#e2445c" },
  { label: "Not Started",    color: "#c4c4c4" },
];
const PRIORITY_OPTIONS = [
  { label: "Critical", color: "#e2445c" },
  { label: "High",     color: "#fdab3d" },
  { label: "Medium",   color: "#579bfc" },
  { label: "Low",      color: "#c4c4c4" },
];

const INITIAL_BOARDS = [
  {
    id: 1, name: "🌴 HOLIFRIDAY Planner", color: "#e2445c",
    groups: [
      {
        id: 10, name: "Planning", color: "#579bfc",
        items: [
          { id: 100, name: "Market Research",      owner: "Alice", status: "Done",          priority: "High",     due: "2026-06-10", tags: ["Research"], comments: [], subtasks: [] },
          { id: 101, name: "Competitive Analysis", owner: "Bob",   status: "Working on it", priority: "Medium",   due: "2026-06-18", tags: ["Research","Marketing"], comments: [], subtasks: [] },
          { id: 102, name: "Define MVP scope",     owner: "Carol", status: "Not Started",   priority: "Critical", due: "2026-06-22", tags: ["Dev"], comments: [], subtasks: [] },
        ],
      },
      {
        id: 11, name: "Development", color: "#00c875",
        items: [
          { id: 103, name: "Design Mockups",  owner: "Carol", status: "Stuck",         priority: "Critical", due: "2026-06-20", tags: ["Design"], comments: [], subtasks: [{ id: 1031, name: "Wireframes", done: true }, { id: 1032, name: "Hi-fi mockup", done: false }] },
          { id: 104, name: "Backend API",     owner: "Dave",  status: "Not Started",   priority: "High",     due: "2026-06-30", tags: ["Dev"], comments: [], subtasks: [] },
          { id: 105, name: "Frontend Build",  owner: "Eve",   status: "Working on it", priority: "High",     due: "2026-07-05", tags: ["Dev","Design"], comments: [], subtasks: [] },
        ],
      },
    ],
  },
  {
    id: 2, name: "📣 Marketing Q3", color: "#00c875",
    groups: [
      {
        id: 20, name: "Campaigns", color: "#fdab3d",
        items: [
          { id: 200, name: "Email drip series",    owner: "Frank", status: "Working on it", priority: "High",   due: "2026-06-25", tags: ["Marketing"], comments: [], subtasks: [] },
          { id: 201, name: "Social media calendar",owner: "Alice", status: "Done",          priority: "Medium", due: "2026-06-15", tags: ["Marketing"], comments: [], subtasks: [] },
        ],
      },
    ],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid() { return Date.now() + Math.random(); }

function useLocalStorage(key, init) {
  const [val, setVal] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : init; }
    catch { return init; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }, [key, val]);
  return [val, setVal];
}

function useClickOutside(ref, cb) {
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) cb(); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [ref, cb]);
}

function useCelebration() {
  const [cel, setCel] = useState(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const celebrate = useCallback((taskName, originX) => {
    if (t.current) clearTimeout(t.current);
    setCel({ taskName, originX });
    t.current = setTimeout(() => setCel(null), 2600);
  }, []);
  return { cel, celebrate };
}

function isOverdue(due) {
  if (!due) return false;
  return new Date(due) < new Date(new Date().toDateString());
}
function isDueSoon(due) {
  if (!due) return false;
  const diff = (new Date(due).getTime() - new Date(new Date().toDateString()).getTime()) / 86400000;
  return diff >= 0 && diff <= 2;
}

// ─── UI Primitives ───────────────────────────────────────────────────────────

function Avatar({ name, size = 28 }) {
  const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: `hsl(${hue},55%,52%)`, color: "#fff", fontSize: size * 0.38, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, userSelect: "none" }}>
      {initials}
    </div>
  );
}

function InlineEdit({ value, onChange, style = {}, placeholder = "…" }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => { if (editing) ref.current?.select(); }, [editing]);
  useEffect(() => { if (!editing) setVal(value); }, [value, editing]);
  function commit() { onChange(val.trim() || value); setEditing(false); }
  if (editing) return <input ref={ref} value={val} onChange={e => setVal(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }} style={{ border: "1.5px solid #0073ea", borderRadius: 4, padding: "2px 6px", fontSize: "inherit", fontWeight: "inherit", width: "100%", outline: "none", ...style }} />;
  return <span onClick={() => setEditing(true)} style={{ cursor: "text", ...style }}>{value || <span style={{ color: "#aaa" }}>{placeholder}</span>}</span>;
}

function Dropdown({ value, options, onChange, width = 140 }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useClickOutside(ref, () => setOpen(false));
  const opt = options.find(o => o.label === value) || options[options.length - 1];
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button onClick={() => setOpen(v => !v)} style={{ width, padding: "3px 8px", borderRadius: 4, background: opt.color, color: "#fff", border: "none", fontWeight: 700, fontSize: 11, cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {opt.label}
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 1000, background: "#fff", borderRadius: 6, boxShadow: "0 6px 24px rgba(0,0,0,.18)", border: "1px solid #e6e9ef", minWidth: width, overflow: "hidden" }}>
          {options.map(o => (
            <button key={o.label} onClick={() => { onChange(o.label); setOpen(false); }} style={{ display: "block", width: "100%", padding: "7px 10px", textAlign: "left", border: "none", cursor: "pointer", background: o.color, color: "#fff", fontWeight: 700, fontSize: 11 }}
              onMouseEnter={e => e.currentTarget.style.filter = "brightness(1.1)"}
              onMouseLeave={e => e.currentTarget.style.filter = ""}
            >{o.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Confetti & Toast ─────────────────────────────────────────────────────────

function Confetti({ show, originX }) {
  const pieces = useRef([]);
  if (show && pieces.current.length === 0) {
    pieces.current = Array.from({ length: 52 }, (_, i) => ({
      id: i,
      x: (originX || window.innerWidth / 2) + (Math.random() - 0.5) * 140,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: Math.random() * 0.45,
      size: 7 + Math.random() * 8,
      drift: (Math.random() - 0.5) * 220,
      rot: Math.random() * 360,
    }));
  }
  if (!show) { pieces.current = []; return null; }
  return (
    <>
      <style>{`
        @keyframes cFall { 0%{opacity:1;transform:translateY(0) translateX(0) rotate(0deg)} 100%{opacity:0;transform:translateY(110vh) translateX(var(--cd)) rotate(800deg)} }
        @keyframes toastIn { 0%{transform:translateY(30px) scale(.9);opacity:0} 15%{transform:translateY(0) scale(1);opacity:1} 80%{opacity:1} 100%{opacity:0;transform:translateY(-8px)} }
        @keyframes slideIn { from{transform:translateX(100%);opacity:0} to{transform:translateX(0);opacity:1} }
        @keyframes fadeIn  { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
      `}</style>
      {pieces.current.map(p => (
        <div key={p.id} style={{ position: "fixed", left: p.x, top: -20, width: p.size, height: p.size * 0.55, background: p.color, borderRadius: 2, zIndex: 9999, pointerEvents: "none", animation: `cFall 1.5s ease-in ${p.delay}s forwards`, transform: `rotate(${p.rot}deg)`, "--cd": `${p.drift}px` } as any} />
      ))}
    </>
  );
}

function Toast({ show, taskName }) {
  if (!show) return null;
  const msgs = ["🎉 ยอดเยี่ยมมาก!", "🚀 เสร็จแล้ว!", "✅ เก่งมากเลย!", "🏆 สำเร็จ!", "💪 ทำได้เลย!"];
  const msg = useRef(msgs[Math.floor(Math.random() * msgs.length)]).current;
  return (
    <div style={{ position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)", background: "#1f1f3b", color: "#fff", borderRadius: 14, padding: "14px 24px", zIndex: 9998, boxShadow: "0 8px 32px rgba(0,0,0,.28)", display: "flex", alignItems: "center", gap: 12, minWidth: 260, animation: "toastIn 2.6s ease forwards", pointerEvents: "none" }}>
      <div style={{ fontSize: 28 }}>🎊</div>
      <div>
        <div style={{ fontWeight: 800, fontSize: 15 }}>{msg}</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,.5)", marginTop: 2 }}>"{taskName}" เสร็จแล้ว</div>
      </div>
    </div>
  );
}

// ─── Tag Pill ─────────────────────────────────────────────────────────────────

function TagPill({ label }: any) {
  const t = TAG_OPTIONS.find(t => t.label === label);
  const color = t?.color || "#888";
  return <span style={{ background: color + "22", color, border: `1px solid ${color}55`, borderRadius: 20, padding: "1px 7px", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}>{label}</span>;
}

// ─── Task Detail Panel ────────────────────────────────────────────────────────

function TaskPanel({ item, onUpdate, onClose }) {
  const [comment, setComment] = useState("");
  const [newSub, setNewSub] = useState("");

  function addComment() {
    if (!comment.trim()) return;
    onUpdate({ ...item, comments: [...item.comments, { id: uid(), author: "You", text: comment.trim(), time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }] });
    setComment("");
  }
  function addSubtask() {
    if (!newSub.trim()) return;
    onUpdate({ ...item, subtasks: [...item.subtasks, { id: uid(), name: newSub.trim(), done: false }] });
    setNewSub("");
  }
  function toggleSub(id) {
    onUpdate({ ...item, subtasks: item.subtasks.map(s => s.id === id ? { ...s, done: !s.done } : s) });
  }
  function delSub(id) {
    onUpdate({ ...item, subtasks: item.subtasks.filter(s => s.id !== id) });
  }
  function toggleTag(label) {
    const tags = item.tags.includes(label) ? item.tags.filter(t => t !== label) : [...item.tags, label];
    onUpdate({ ...item, tags });
  }

  const doneSubs = item.subtasks.filter(s => s.done).length;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, display: "flex" }}>
      <div onClick={onClose} style={{ flex: 1, background: "rgba(0,0,0,.35)" }} />
      <div style={{ width: 420, background: "#fff", boxShadow: "-4px 0 32px rgba(0,0,0,.15)", display: "flex", flexDirection: "column", animation: "slideIn .22s ease", overflowY: "auto" }}>
        {/* Header */}
        <div style={{ padding: "20px 24px 14px", borderBottom: "1px solid #e6e9ef" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <InlineEdit value={item.name} onChange={v => onUpdate({ ...item, name: v })} style={{ fontSize: 18, fontWeight: 700, color: "#323338", flex: 1 }} />
            <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#aaa", lineHeight: 1, flexShrink: 0 }}>×</button>
          </div>
        </div>

        <div style={{ flex: 1, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 22 }}>
          {/* Fields */}
          <div style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: "10px 12px", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#676879", fontWeight: 600 }}>Status</span>
            <Dropdown value={item.status} options={STATUS_OPTIONS} onChange={v => onUpdate({ ...item, status: v })} width={150} />
            <span style={{ fontSize: 12, color: "#676879", fontWeight: 600 }}>Priority</span>
            <Dropdown value={item.priority} options={PRIORITY_OPTIONS} onChange={v => onUpdate({ ...item, priority: v })} width={110} />
            <span style={{ fontSize: 12, color: "#676879", fontWeight: 600 }}>Owner</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Avatar name={item.owner} size={22} /><span style={{ fontSize: 13 }}>{item.owner}</span></div>
            <span style={{ fontSize: 12, color: "#676879", fontWeight: 600 }}>Due Date</span>
            <input type="date" value={item.due} onChange={e => onUpdate({ ...item, due: e.target.value })} style={{ border: "1px solid #e6e9ef", borderRadius: 4, padding: "4px 8px", fontSize: 13, outline: "none" }} />
          </div>

          {/* Tags */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#676879", marginBottom: 8 }}>Tags</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {TAG_OPTIONS.map(t => {
                const active = item.tags.includes(t.label);
                return (
                  <button key={t.label} onClick={() => toggleTag(t.label)} style={{ background: active ? t.color + "22" : "#f6f7fb", color: active ? t.color : "#aaa", border: `1.5px solid ${active ? t.color + "66" : "#e6e9ef"}`, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Subtasks */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#676879", marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
              <span>Subtasks</span>
              {item.subtasks.length > 0 && <span style={{ color: "#00c875" }}>{doneSubs}/{item.subtasks.length}</span>}
            </div>
            {item.subtasks.length > 0 && (
              <div style={{ background: "#f6f7fb", borderRadius: 8, padding: "8px 10px", marginBottom: 8 }}>
                {item.subtasks.length > 0 && (
                  <div style={{ height: 4, background: "#e6e9ef", borderRadius: 2, marginBottom: 10, overflow: "hidden" }}>
                    <div style={{ width: `${(doneSubs / item.subtasks.length) * 100}%`, height: "100%", background: "#00c875", transition: "width .3s" }} />
                  </div>
                )}
                {item.subtasks.map(s => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid #eee" }}>
                    <input type="checkbox" checked={s.done} onChange={() => toggleSub(s.id)} style={{ accentColor: "#00c875" }} />
                    <span style={{ flex: 1, fontSize: 13, color: s.done ? "#aaa" : "#323338", textDecoration: s.done ? "line-through" : "none" }}>{s.name}</span>
                    <button onClick={() => delSub(s.id)} style={{ background: "none", border: "none", color: "#ddd", cursor: "pointer", fontSize: 14 }}>×</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 6 }}>
              <input value={newSub} onChange={e => setNewSub(e.target.value)} onKeyDown={e => e.key === "Enter" && addSubtask()} placeholder="Add subtask…" style={{ flex: 1, border: "1px solid #e6e9ef", borderRadius: 6, padding: "6px 10px", fontSize: 13, outline: "none" }} />
              <button onClick={addSubtask} style={{ background: "#0073ea", color: "#fff", border: "none", borderRadius: 6, padding: "6px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>+</button>
            </div>
          </div>

          {/* Comments */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#676879", marginBottom: 10 }}>Comments ({item.comments.length})</div>
            {item.comments.map(c => (
              <div key={c.id} style={{ display: "flex", gap: 8, marginBottom: 12, animation: "fadeIn .2s ease" }}>
                <Avatar name={c.author} size={28} />
                <div style={{ background: "#f6f7fb", borderRadius: 8, padding: "8px 12px", flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#323338", marginBottom: 2 }}>{c.author} <span style={{ color: "#aaa", fontWeight: 400 }}>{c.time}</span></div>
                  <div style={{ fontSize: 13, color: "#323338" }}>{c.text}</div>
                </div>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <Avatar name="You" size={28} />
              <div style={{ flex: 1, display: "flex", gap: 6 }}>
                <input value={comment} onChange={e => setComment(e.target.value)} onKeyDown={e => e.key === "Enter" && addComment()} placeholder="Write a comment…" style={{ flex: 1, border: "1px solid #e6e9ef", borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none" }} />
                <button onClick={addComment} style={{ background: "#0073ea", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Send</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Kanban Card ──────────────────────────────────────────────────────────────

function KanbanCard({ item, onUpdate, onOpen }: any) {
  const overdue = isOverdue(item.due) && item.status !== "Done";
  const soon    = isDueSoon(item.due) && item.status !== "Done" && !overdue;
  const stat    = STATUS_OPTIONS.find(s => s.label === item.status);
  return (
    <div onClick={() => onOpen(item)} style={{ background: "#fff", borderRadius: 10, boxShadow: "0 2px 8px rgba(0,0,0,.08)", padding: "12px 14px", marginBottom: 8, cursor: "pointer", borderLeft: `3px solid ${stat?.color || "#ccc"}`, transition: "transform .12s, box-shadow .12s" }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 6px 18px rgba(0,0,0,.13)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,.08)"; }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: "#323338", marginBottom: 8 }}>{item.name}</div>
      {item.tags.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>{item.tags.map(t => <TagPill key={t} label={t} />)}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between" }}>
        <Avatar name={item.owner} size={22} />
        {item.due && <span style={{ fontSize: 10, fontWeight: 700, color: overdue ? "#e2445c" : soon ? "#fdab3d" : "#aaa" }}>{overdue ? "⚠ " : soon ? "⏰ " : ""}{item.due}</span>}
      </div>
      {item.subtasks.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 11, color: "#aaa" }}>
          ✅ {item.subtasks.filter(s => s.done).length}/{item.subtasks.length} subtasks
        </div>
      )}
    </div>
  );
}

function KanbanView({ board, onUpdate, onCelebrate }) {
  function updItem(groupId, updated) {
    if (updated.status === "Done") {
      const old = board.groups.flatMap(g => g.items).find(i => i.id === updated.id);
      if (old?.status !== "Done") onCelebrate(updated.name, window.innerWidth / 2);
    }
    onUpdate({ ...board, groups: board.groups.map(g => g.id === groupId ? { ...g, items: g.items.map(i => i.id === updated.id ? updated : i) } : g) });
  }

  const [panelItem, setPanelItem] = useState(null);
  const panelGroup = board.groups.find(g => g.items.some(i => i.id === panelItem?.id));

  return (
    <div style={{ flex: 1, overflowX: "auto", padding: "24px 28px", display: "flex", gap: 16, alignItems: "flex-start" }}>
      {panelItem && panelGroup && (
        <TaskPanel item={panelItem} onUpdate={u => { updItem(panelGroup.id, u); setPanelItem(u); }} onClose={() => setPanelItem(null)} />
      )}
      {STATUS_OPTIONS.map(col => {
        const allItems = board.groups.flatMap(g => g.items.filter(i => i.status === col.label).map(i => ({ ...i, _gid: g.id })));
        return (
          <div key={col.label} style={{ minWidth: 240, maxWidth: 280, flex: "0 0 260px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: col.color }} />
              <span style={{ fontWeight: 700, fontSize: 13, color: "#323338" }}>{col.label}</span>
              <span style={{ fontSize: 11, color: "#aaa", marginLeft: "auto", background: "#f0f0f0", borderRadius: 10, padding: "1px 7px" }}>{allItems.length}</span>
            </div>
            <div style={{ background: "#f6f7fb", borderRadius: 10, padding: "8px", minHeight: 120 }}>
              {allItems.map(item => (
                <KanbanCard key={item.id} item={item} onUpdate={u => updItem(item._gid, u)} onOpen={setPanelItem} />
              ))}
              {allItems.length === 0 && <div style={{ textAlign: "center", color: "#ddd", fontSize: 12, paddingTop: 20 }}>No tasks</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({ boards }) {
  const allItems = boards.flatMap(b => b.groups.flatMap(g => g.items));
  const byStatus = STATUS_OPTIONS.map(s => ({ ...s, count: allItems.filter(i => i.status === s.label).length }));
  const byPriority = PRIORITY_OPTIONS.map(p => ({ ...p, count: allItems.filter(i => i.priority === p.label).length }));
  const overdueItems = allItems.filter(i => isOverdue(i.due) && i.status !== "Done");
  const soonItems    = allItems.filter(i => isDueSoon(i.due) && i.status !== "Done" && !isOverdue(i.due));
  const maxCount = Math.max(...byStatus.map(s => s.count), 1);

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
      <h2 style={{ margin: "0 0 24px", fontSize: 20, fontWeight: 800, color: "#323338" }}>📊 Dashboard</h2>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 14, marginBottom: 28 }}>
        {[
          { label: "Total Tasks",   value: allItems.length,                                    color: "#0073ea", icon: "📋" },
          { label: "Done",          value: allItems.filter(i => i.status === "Done").length,    color: "#00c875", icon: "✅" },
          { label: "In Progress",   value: allItems.filter(i => i.status === "Working on it").length, color: "#fdab3d", icon: "🔄" },
          { label: "Stuck",         value: allItems.filter(i => i.status === "Stuck").length,   color: "#e2445c", icon: "🚨" },
          { label: "Overdue",       value: overdueItems.length,                                 color: "#e2445c", icon: "⚠️" },
          { label: "Due Soon",      value: soonItems.length,                                    color: "#fdab3d", icon: "⏰" },
        ].map(c => (
          <div key={c.label} style={{ background: "#fff", borderRadius: 12, padding: "16px 18px", boxShadow: "0 2px 8px rgba(0,0,0,.06)", borderTop: `3px solid ${c.color}` }}>
            <div style={{ fontSize: 22 }}>{c.icon}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: c.color, margin: "4px 0 2px" }}>{c.value}</div>
            <div style={{ fontSize: 11, color: "#676879", fontWeight: 600 }}>{c.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 28 }}>
        {/* Status chart */}
        <div style={{ background: "#fff", borderRadius: 12, padding: "20px 22px", boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#323338", marginBottom: 16 }}>Status Breakdown</div>
          {byStatus.map(s => (
            <div key={s.label} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: "#676879" }}>{s.label}</span>
                <span style={{ fontWeight: 700, color: s.color }}>{s.count}</span>
              </div>
              <div style={{ height: 8, background: "#f0f0f0", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${(s.count / maxCount) * 100}%`, height: "100%", background: s.color, borderRadius: 4, transition: "width .5s" }} />
              </div>
            </div>
          ))}
        </div>

        {/* Priority chart */}
        <div style={{ background: "#fff", borderRadius: 12, padding: "20px 22px", boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#323338", marginBottom: 16 }}>Priority Breakdown</div>
          {byPriority.map(p => (
            <div key={p.label} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: "#676879" }}>{p.label}</span>
                <span style={{ fontWeight: 700, color: p.color }}>{p.count}</span>
              </div>
              <div style={{ height: 8, background: "#f0f0f0", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${(p.count / Math.max(...byPriority.map(x => x.count), 1)) * 100}%`, height: "100%", background: p.color, borderRadius: 4, transition: "width .5s" }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Overdue & soon */}
      {(overdueItems.length > 0 || soonItems.length > 0) && (
        <div style={{ background: "#fff", borderRadius: 12, padding: "20px 22px", boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#323338", marginBottom: 14 }}>⚠️ Needs Attention</div>
          {[...overdueItems.map(i => ({ ...i, _type: "overdue" })), ...soonItems.map(i => ({ ...i, _type: "soon" }))].map(i => (
            <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #f0f0f0" }}>
              <Avatar name={i.owner} size={24} />
              <span style={{ flex: 1, fontSize: 13, color: "#323338" }}>{i.name}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: i._type === "overdue" ? "#e2445c" : "#fdab3d", background: i._type === "overdue" ? "#fde8ec" : "#fff8ec", borderRadius: 20, padding: "2px 8px" }}>
                {i._type === "overdue" ? "Overdue" : "Due Soon"} · {i.due}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Table Row ────────────────────────────────────────────────────────────────

function ItemRow({ item, groupColor, onUpdate, onDelete, onCelebrate, onOpen }: any) {
  const [hovered, setHovered] = useState(false);
  const [ownerOpen, setOwnerOpen] = useState(false);
  const ownerRef = useRef<HTMLTableCellElement | null>(null);
  const statusRef = useRef<HTMLTableCellElement | null>(null);
  useClickOutside(ownerRef, () => setOwnerOpen(false));

  const overdue = isOverdue(item.due) && item.status !== "Done";
  const soon    = isDueSoon(item.due) && item.status !== "Done" && !overdue;

  function upd(patch) {
    if (patch.status === "Done" && item.status !== "Done") {
      const rect = statusRef.current?.getBoundingClientRect();
      onCelebrate(item.name, rect ? rect.left + rect.width / 2 : undefined);
    }
    onUpdate({ ...item, ...patch });
  }

  return (
    <tr onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ background: hovered ? "#f0f4ff" : "#fff", transition: "background .12s" }}>
      <td style={{ width: 4, padding: 0 }}><div style={{ width: 4, minHeight: 38, background: groupColor }} /></td>
      <td style={{ width: 32, textAlign: "center", padding: "0 4px" }}><input type="checkbox" style={{ accentColor: "#0073ea" }} /></td>
      <td style={{ padding: "6px 8px", minWidth: 200 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <InlineEdit value={item.name} onChange={v => upd({ name: v })} style={{ fontSize: 13, color: "#323338" }} />
          {item.comments.length > 0 && <span style={{ fontSize: 10, color: "#aaa" }}>💬{item.comments.length}</span>}
          {item.subtasks.length > 0 && <span style={{ fontSize: 10, color: "#aaa" }}>✅{item.subtasks.filter(s => s.done).length}/{item.subtasks.length}</span>}
        </div>
        {item.tags.length > 0 && <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>{item.tags.map(t => <TagPill key={t} label={t} />)}</div>}
      </td>
      <td style={{ padding: "4px 8px", width: 110 }} ref={ownerRef}>
        <div style={{ position: "relative" }}>
          <div onClick={() => setOwnerOpen(v => !v)} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <Avatar name={item.owner} /><span style={{ fontSize: 12, color: "#676879" }}>{item.owner}</span>
          </div>
          {ownerOpen && (
            <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 1000, background: "#fff", borderRadius: 6, boxShadow: "0 6px 24px rgba(0,0,0,.18)", border: "1px solid #e6e9ef", minWidth: 130, overflow: "hidden" }}>
              {OWNER_POOL.map(name => (
                <div key={name} onClick={() => { upd({ owner: name }); setOwnerOpen(false); }}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#f0f4ff"}
                  onMouseLeave={e => e.currentTarget.style.background = ""}
                >
                  <Avatar name={name} size={22} /><span style={{ fontSize: 12 }}>{name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </td>
      <td ref={statusRef} style={{ padding: "4px 8px", width: 152 }}>
        <Dropdown value={item.status} options={STATUS_OPTIONS} onChange={v => upd({ status: v })} width={140} />
      </td>
      <td style={{ padding: "4px 8px", width: 110 }}>
        <Dropdown value={item.priority} options={PRIORITY_OPTIONS} onChange={v => upd({ priority: v })} width={98} />
      </td>
      <td style={{ padding: "4px 8px", width: 128 }}>
        <input type="date" value={item.due} onChange={e => upd({ due: e.target.value })}
          style={{ border: `1px solid ${overdue ? "#e2445c" : soon ? "#fdab3d" : "#e6e9ef"}`, background: overdue ? "#fde8ec" : soon ? "#fff8ec" : "#fff", borderRadius: 4, padding: "3px 6px", fontSize: 12, color: overdue ? "#e2445c" : soon ? "#d4900a" : "#323338", outline: "none" }} />
      </td>
      <td style={{ padding: "0 4px", width: 56, textAlign: "center" }}>
        <button onClick={() => onOpen(item)} style={{ background: "none", border: "none", color: hovered ? "#0073ea" : "#ddd", cursor: "pointer", fontSize: 14, transition: "color .15s" }} title="Open detail">⬡</button>
        <button onClick={onDelete} style={{ background: "none", border: "none", color: hovered ? "#e2445c" : "#ddd", cursor: "pointer", fontSize: 16, transition: "color .15s" }}>×</button>
      </td>
    </tr>
  );
}

// ─── Group (Table) ────────────────────────────────────────────────────────────

function Group({ group, onUpdate, onDelete, onCelebrate, onOpenItem }: any) {
  const [collapsed, setCollapsed] = useState(false);
  const updGroup = patch => onUpdate({ ...group, ...patch });
  const updItem  = item => updGroup({ items: group.items.map(i => i.id === item.id ? item : i) });
  const delItem  = id   => updGroup({ items: group.items.filter(i => i.id !== id) });
  const addItem  = ()   => updGroup({ items: [...group.items, { id: uid(), name: "New Task", owner: "Alice", status: "Not Started", priority: "Medium", due: "", tags: [], comments: [], subtasks: [] }] });
  const done = group.items.filter(i => i.status === "Done").length;

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <button onClick={() => setCollapsed(v => !v)} style={{ background: "none", border: "none", cursor: "pointer", color: "#676879", fontSize: 12, padding: 2 }}>{collapsed ? "▶" : "▼"}</button>
        <div style={{ width: 12, height: 12, borderRadius: 3, background: group.color, flexShrink: 0 }} />
        <InlineEdit value={group.name} onChange={v => updGroup({ name: v })} style={{ fontWeight: 700, fontSize: 14, color: group.color }} />
        <span style={{ fontSize: 11, color: "#aaa", marginLeft: 4 }}>{group.items.length} items · {done} done</span>
        {group.items.length > 0 && (
          <div style={{ flex: 1, maxWidth: 80, height: 6, background: "#e6e9ef", borderRadius: 3, overflow: "hidden", marginLeft: 6 }}>
            <div style={{ width: `${(done / group.items.length) * 100}%`, height: "100%", background: "#00c875", transition: "width .3s" }} />
          </div>
        )}
        <button onClick={onDelete} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#c4c4c4", fontSize: 15, padding: "0 4px" }}>🗑</button>
      </div>
      {!collapsed && (
        <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid #e6e9ef", boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f6f7fb" }}>
                <th style={{ width: 4, padding: 0 }} /><th style={{ width: 32 }} />
                {["TASK","OWNER","STATUS","PRIORITY","DUE DATE",""].map(h => (
                  <th key={h} style={{ padding: "7px 8px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#676879", letterSpacing: .5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {group.items.map(item => (
                <ItemRow key={item.id} item={item} groupColor={group.color}
                  onUpdate={updItem} onDelete={() => delItem(item.id)}
                  onCelebrate={onCelebrate} onOpen={onOpenItem} />
              ))}
            </tbody>
          </table>
          <button onClick={addItem} style={{ width: "100%", padding: "9px 40px", textAlign: "left", background: "#fff", border: "none", borderTop: "1px solid #f0f0f0", color: "#676879", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
            onMouseEnter={e => e.currentTarget.style.background = "#f0f4ff"}
            onMouseLeave={e => e.currentTarget.style.background = "#fff"}
          ><span style={{ fontSize: 16, color: "#0073ea" }}>+</span> Add Task</button>
        </div>
      )}
    </div>
  );
}

// ─── Board View ───────────────────────────────────────────────────────────────

function BoardView({ board, onUpdate, onCelebrate }) {
  const [view, setView] = useState("table"); // table | kanban
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterPriority, setFilterPriority] = useState("All");
  const [panelItem, setPanelItem] = useState(null);

  const updBoard = patch => onUpdate({ ...board, ...patch });
  const updGroup = g => updBoard({ groups: board.groups.map(x => x.id === g.id ? g : x) });
  const delGroup = id => updBoard({ groups: board.groups.filter(g => g.id !== id) });
  const addGroup = ()  => updBoard({ groups: [...board.groups, { id: uid(), name: "New Group", color: GROUP_COLORS[board.groups.length % GROUP_COLORS.length], items: [] }] });

  const filteredBoard = useMemo(() => ({
    ...board,
    groups: board.groups.map(g => ({
      ...g,
      items: g.items.filter(i =>
        (search === "" || i.name.toLowerCase().includes(search.toLowerCase()) || i.owner.toLowerCase().includes(search.toLowerCase())) &&
        (filterStatus === "All" || i.status === filterStatus) &&
        (filterPriority === "All" || i.priority === filterPriority)
      ),
    })),
  }), [board, search, filterStatus, filterPriority]);

  const allItems = board.groups.flatMap(g => g.items);
  const done = allItems.filter(i => i.status === "Done").length;
  const stuck = allItems.filter(i => i.status === "Stuck").length;

  function handleOpenItem(item) {
    setPanelItem(item);
  }
  function handlePanelUpdate(updated) {
    const g = board.groups.find(g => g.items.some(i => i.id === updated.id));
    if (g) updGroup({ ...g, items: g.items.map(i => i.id === updated.id ? updated : i) });
    setPanelItem(updated);
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {panelItem && <TaskPanel item={panelItem} onUpdate={handlePanelUpdate} onClose={() => setPanelItem(null)} />}

      {/* Top bar */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e6e9ef", padding: "12px 28px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ width: 14, height: 14, borderRadius: 4, background: board.color, flexShrink: 0 }} />
        <InlineEdit value={board.name} onChange={v => updBoard({ name: v })} style={{ fontSize: 18, fontWeight: 700, color: "#323338" }} />
        <div style={{ display: "flex", gap: 6, marginLeft: 8 }}>
          <span style={{ background: "#e6f9f1", color: "#00c875", fontSize: 11, fontWeight: 700, borderRadius: 20, padding: "2px 10px" }}>{done} done</span>
          {stuck > 0 && <span style={{ background: "#fde8ec", color: "#e2445c", fontSize: 11, fontWeight: 700, borderRadius: 20, padding: "2px 10px" }}>{stuck} stuck</span>}
          <span style={{ background: "#f0f4ff", color: "#676879", fontSize: 11, fontWeight: 700, borderRadius: 20, padding: "2px 10px" }}>{allItems.length} total</span>
        </div>
        {/* View toggle */}
        <div style={{ display: "flex", gap: 4, marginLeft: "auto", background: "#f6f7fb", borderRadius: 8, padding: 3 }}>
          {[["table","☰ Table"],["kanban","⬡ Kanban"]].map(([v,label]) => (
            <button key={v} onClick={() => setView(v)} style={{ background: view === v ? "#fff" : "none", border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: 700, color: view === v ? "#0073ea" : "#676879", cursor: "pointer", boxShadow: view === v ? "0 1px 4px rgba(0,0,0,.1)" : "none" }}>{label}</button>
          ))}
        </div>
        <button onClick={addGroup} style={{ background: "#0073ea", color: "#fff", border: "none", borderRadius: 20, padding: "7px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
          onMouseEnter={e => e.currentTarget.style.background = "#0060c0"}
          onMouseLeave={e => e.currentTarget.style.background = "#0073ea"}
        >+ New Group</button>
      </div>

      {/* Filter bar */}
      <div style={{ background: "#fafbfc", borderBottom: "1px solid #f0f0f0", padding: "8px 28px", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 13 }}>🔍</span>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks or owners…" style={{ border: "1px solid #e6e9ef", borderRadius: 6, padding: "5px 10px", fontSize: 13, outline: "none", width: 200 }} />
        <span style={{ fontSize: 12, color: "#676879", marginLeft: 8 }}>Status:</span>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ border: "1px solid #e6e9ef", borderRadius: 6, padding: "5px 8px", fontSize: 12, outline: "none", background: "#fff" }}>
          <option>All</option>
          {STATUS_OPTIONS.map(s => <option key={s.label}>{s.label}</option>)}
        </select>
        <span style={{ fontSize: 12, color: "#676879" }}>Priority:</span>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={{ border: "1px solid #e6e9ef", borderRadius: 6, padding: "5px 8px", fontSize: 12, outline: "none", background: "#fff" }}>
          <option>All</option>
          {PRIORITY_OPTIONS.map(p => <option key={p.label}>{p.label}</option>)}
        </select>
        {(search || filterStatus !== "All" || filterPriority !== "All") && (
          <button onClick={() => { setSearch(""); setFilterStatus("All"); setFilterPriority("All"); }} style={{ background: "none", border: "1px solid #e6e9ef", borderRadius: 6, padding: "5px 10px", fontSize: 12, color: "#676879", cursor: "pointer" }}>Clear</button>
        )}
      </div>

      {/* Content */}
      {view === "kanban" ? (
        <KanbanView board={filteredBoard} onUpdate={onUpdate} onCelebrate={onCelebrate} />
      ) : (
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
          {filteredBoard.groups.length === 0 || filteredBoard.groups.every(g => g.items.length === 0 && board.groups.find(bg => bg.id === g.id)?.items.length === 0) ? (
            <div style={{ textAlign: "center", paddingTop: 80, color: "#c4c4c4" }}>
              <div style={{ fontSize: 48 }}>📋</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginTop: 12 }}>No groups yet</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Click "+ New Group" to get started.</div>
            </div>
          ) : (
            filteredBoard.groups.map(g => (
              <Group key={g.id} group={g} onUpdate={updGroup} onDelete={() => delGroup(g.id)} onCelebrate={onCelebrate} onOpenItem={handleOpenItem} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ boards, activeId, activeView, onSelect, onAdd, onChangeView }) {
  const [open, setOpen] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { if (adding) inputRef.current?.focus(); }, [adding]);

  function confirmAdd() {
    const n = newName.trim(); if (n) onAdd(n);
    setNewName(""); setAdding(false);
  }

  return (
    <div style={{ width: open ? 220 : 44, background: "#1f1f3b", display: "flex", flexDirection: "column", transition: "width .2s", flexShrink: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 10px", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
        <div style={{ width: 26, height: 26, borderRadius: 8, background: "#e2445c", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: 14, flexShrink: 0 }}>H</div>
        {open && <span style={{ color: "#fff", fontWeight: 800, fontSize: 17, letterSpacing: -0.5 }}>HOLIFRIDAY</span>}
        <button onClick={() => setOpen(v => !v)} style={{ marginLeft: "auto", background: "none", border: "none", color: "rgba(255,255,255,.3)", cursor: "pointer", fontSize: 16, flexShrink: 0 }}>{open ? "‹" : "›"}</button>
      </div>

      {/* Nav */}
      <div style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
        {[["dashboard","📊","Dashboard"],["boards","📋","Boards"]].map(([v,icon,label]) => (
          <button key={v} onClick={() => onChangeView(v)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: open ? "8px 14px" : "8px 0", justifyContent: open ? "flex-start" : "center", background: activeView === v ? "rgba(255,255,255,.12)" : "none", border: "none", cursor: "pointer", color: activeView === v ? "#fff" : "rgba(255,255,255,.45)", fontSize: 13, transition: "background .15s" }}
            onMouseEnter={e => { if (activeView !== v) e.currentTarget.style.background = "rgba(255,255,255,.06)"; }}
            onMouseLeave={e => { if (activeView !== v) e.currentTarget.style.background = "none"; }}
          >
            <span style={{ fontSize: 15 }}>{icon}</span>{open && label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", paddingTop: 8 }}>
        {open && <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.25)", letterSpacing: 1.2, padding: "4px 14px 6px", textTransform: "uppercase" }}>Boards</div>}
        {boards.map(b => (
          <button key={b.id} onClick={() => { onSelect(b.id); onChangeView("boards"); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: open ? "9px 14px" : "9px 0", justifyContent: open ? "flex-start" : "center", background: activeId === b.id && activeView === "boards" ? "rgba(255,255,255,.12)" : "none", border: "none", cursor: "pointer", transition: "background .15s" }}
            onMouseEnter={e => { if (!(activeId === b.id && activeView === "boards")) e.currentTarget.style.background = "rgba(255,255,255,.06)"; }}
            onMouseLeave={e => { if (!(activeId === b.id && activeView === "boards")) e.currentTarget.style.background = "none"; }}
          >
            <div style={{ width: 10, height: 10, borderRadius: 3, background: b.color, flexShrink: 0 }} />
            {open && <span style={{ fontSize: 13, color: activeId === b.id && activeView === "boards" ? "#fff" : "rgba(255,255,255,.55)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.name}</span>}
          </button>
        ))}
        {open && (adding ? (
          <div style={{ padding: "6px 10px", display: "flex", gap: 6 }}>
            <input ref={inputRef} value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") confirmAdd(); if (e.key === "Escape") setAdding(false); }} placeholder="Board name…" style={{ flex: 1, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)", borderRadius: 4, padding: "5px 8px", color: "#fff", fontSize: 12, outline: "none" }} />
            <button onClick={confirmAdd} style={{ background: "#0073ea", color: "#fff", border: "none", borderRadius: 4, padding: "4px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Add</button>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", background: "none", border: "none", color: "rgba(255,255,255,.3)", cursor: "pointer", fontSize: 12 }}
            onMouseEnter={e => e.currentTarget.style.color = "rgba(255,255,255,.6)"}
            onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,.3)"}
          ><span style={{ fontSize: 16 }}>+</span> Add Board</button>
        ))}
      </div>

      <div style={{ padding: open ? "10px 14px" : "10px 7px", borderTop: "1px solid rgba(255,255,255,.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Avatar name="You" size={28} />
          {open && <span style={{ fontSize: 12, color: "rgba(255,255,255,.5)" }}>HOLIFRIDAY Workspace</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  useEffect(() => { document.title = "HOLIFRIDAY"; }, []);
  const [boards, setBoards] = useLocalStorage("holifriday_boards", INITIAL_BOARDS);
  const [activeId, setActiveId] = useState(INITIAL_BOARDS[0].id);
  const [activeView, setActiveView] = useState("boards"); // boards | dashboard
  const { cel, celebrate } = useCelebration();

  const activeBoard = boards.find(b => b.id === activeId) || boards[0];
  const updateBoard = updated => setBoards(bs => bs.map(b => b.id === updated.id ? updated : b));
  const addBoard = name => {
    const nb = { id: uid(), name, color: GROUP_COLORS[boards.length % GROUP_COLORS.length], groups: [] };
    setBoards(bs => [...bs, nb]); setActiveId(nb.id);
  };

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "'Figtree','Roboto',sans-serif", overflow: "hidden" }}>
      <style>{`* { box-sizing: border-box; } body { margin: 0; }`}</style>
      <Confetti show={!!cel} originX={cel?.originX} />
      <Toast show={!!cel} taskName={cel?.taskName} />
      <Sidebar boards={boards} activeId={activeId} activeView={activeView} onSelect={setActiveId} onAdd={addBoard} onChangeView={setActiveView} />
      {activeView === "dashboard"
        ? <Dashboard boards={boards} />
        : activeBoard && <BoardView board={activeBoard} onUpdate={updateBoard} onCelebrate={celebrate} />
      }
    </div>
  );
}
