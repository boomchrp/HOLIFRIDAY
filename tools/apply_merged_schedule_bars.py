from pathlib import Path
p=Path('holifriday-app/src/App.tsx')
s=p.read_text(encoding='utf-8')
start='''                <div key={owner} style={{ display: "grid", gridTemplateColumns: `220px repeat(${days}, minmax(46px, 1fr))`, minHeight: 72, borderBottom: "1px solid #f0f2f8", background: "#fff" }}>'''
end='''                </div>
              );
            })}'''
a=s.find(start)
if a<0: raise SystemExit('old daily grid block not found')
b=s.find(end,a)
if b<0: raise SystemExit('old block end not found')
b+=len('''                </div>''')
new='''                <div key={owner} style={{ display: "grid", gridTemplateColumns: "220px 1fr", minHeight: Math.max(76, ((tasksByOwner.get(owner) || []).length * 28) + 24), borderBottom: "1px solid #f0f2f8", background: "#fff" }}>
                  <div style={{ padding: "12px", borderRight: "1px solid #f0f2f8", position: "sticky", left: 0, background: "#fff", zIndex: 3 }}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: "#323338", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{owner}</div>
                    <div style={{ marginTop: 3, fontSize: 11, color: "#98a1b3" }}>{(tasksByOwner.get(owner) || []).length} scheduled tasks</div>
                  </div>
                  <div style={{ position: "relative", minHeight: Math.max(76, ((tasksByOwner.get(owner) || []).length * 28) + 24), display: "grid", gridTemplateColumns: `repeat(${days}, minmax(46px, 1fr))` }}>
                    {dayList.map(day => {
                      const key = day.toISOString().slice(0, 10);
                      const list = byDate.get(key) || [];
                      const loadHours = list.reduce((sum, t) => sum + (t._hoursPerDay || 0), 0);
                      const overloaded = loadHours > capacity;
                      const intensity = Math.min(loadHours / Math.max(maxLoad, capacity), 1);
                      return <div key={key} title={list.length ? `${Math.round(loadHours * 10) / 10}h • ${list.length} task(s)` : ""} style={{ borderLeft: "1px solid #f7f8fc", background: overloaded ? "#fff2d0" : list.length ? `rgba(0,115,234,${0.04 + intensity * 0.12})` : "#fff" }}>{overloaded && <div style={{ height: 4, background: "#fdab3d" }} />}</div>;
                    })}
                    {(tasksByOwner.get(owner) || []).map((task, idx) => {
                      const startIndex = Math.max(0, diffDays(today, task._start));
                      const endIndex = Math.min(days - 1, diffDays(today, task._end));
                      if (endIndex < 0 || startIndex >= days) return null;
                      const span = Math.max(1, endIndex - startIndex + 1);
                      const left = (startIndex / days) * 100;
                      const width = (span / days) * 100;
                      const color = STATUS_OPTIONS.find(s => s.label === task.status)?.color || task._groupColor || "#579bfc";
                      const totalDays = diffDays(task._start, task._end) + 1;
                      return <button key={task.id} onClick={() => onOpen(task)} title={`${task.name} • ${task._groupName} • ${totalDays} day(s)`} style={{ position: "absolute", left: `${left}%`, width: `calc(${width}% - 6px)`, top: 12 + idx * 28, height: 22, border: "none", borderRadius: totalDays > 1 ? 999 : 6, background: color, color: "#fff", boxShadow: "0 2px 6px rgba(0,0,0,.16)", padding: "0 8px", fontSize: 10, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: "left", zIndex: 2 }}>{task.name}</button>;
                    })}
                  </div>
                </div>'''
s=s[:a]+new+s[b:]
p.write_text(s,encoding='utf-8')
print('Applied merged schedule timeline bars')
