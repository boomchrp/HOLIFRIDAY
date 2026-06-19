from pathlib import Path
p=Path('holifriday-app/src/App.tsx')
s=p.read_text(encoding='utf-8')
def rep(a,b,label):
    global s
    if a not in s: raise SystemExit('missing '+label)
    s=s.replace(a,b,1)
code='''
function GanttWhatIfPanel({boards}:any){
  const {dark}=useDark();
  const card=dark?"#16213e":"#fff", text=dark?"#e0e0f0":"#323338", sub=dark?"#8888aa":"#676879", bdr=dark?"#2a2a4a":"#eef1f7";
  const [boardId,setBoardId]=useState(asArray(boards)[0]?.id);
  const [deadlineShift,setDeadlineShift]=useState(0);
  const [capacityScale,setCapacityScale]=useState(100);
  const board=asArray(boards).find(b=>b.id===boardId)||asArray(boards)[0];
  useEffect(()=>{if(board&&!asArray(boards).some(b=>b.id===boardId))setBoardId(board.id)},[boards,boardId]);
  if(!board)return null;
  const records=asArray(board.groups).flatMap(g=>asArray(g.items).map(i=>({group:g,item:i,range:getTaskRange(i)}))).filter(r=>r.range).slice(0,18);
  const start=records.length?new Date(Math.min(...records.map(r=>r.range.start.getTime()))):new Date();
  const end=records.length?new Date(Math.max(...records.map(r=>r.range.end.getTime()))):addDays(start,30);
  const total=Math.max(1,diffDays(start,end)+1);
  const open=asArray(board.groups).flatMap(g=>asArray(g.items)).filter(i=>!["Done","Submitted","Approved"].includes(i.status));
  const sim=open.map(i=>{const d=parseDateOnly(i.due);const due=d?formatDateOnly(addDays(d,Number(deadlineShift)||0)):i.due;const cap=Math.max(1,getOwnerCapacity(board,i.owner,6)*(Number(capacityScale)||100)/100);return getPlanningAnalysis({...i,due},cap)});
  const risk=sim.filter(a=>["At Risk","Invalid","Tight Review","Tight","Missing deadline"].includes(a.risk)).length;
  const delay=Math.max(0,...sim.map(a=>(a.totalNeededDays&&a.daysAvailable)?Math.max(0,a.totalNeededDays-a.daysAvailable):0));
  const level=risk>3||delay>3?"High Risk":risk>0?"Medium Risk":"Good";
  return <div style={{display:"grid",gridTemplateColumns:"minmax(360px,1.5fr) minmax(260px,.8fr)",gap:18,marginBottom:18}}>
    <div style={{background:card,border:`1px solid ${bdr}`,borderRadius:12,padding:16,boxShadow:"0 2px 8px rgba(0,0,0,.06)"}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap"}}><div><div style={{fontSize:14,fontWeight:900,color:text}}>🗓️ Gantt / Timeline</div><div style={{fontSize:12,color:sub,marginTop:3}}>Read-only view from task start and due dates.</div></div><select value={board.id} onChange={e=>setBoardId(Number(e.target.value))} style={{border:`1px solid ${bdr}`,borderRadius:8,padding:"6px 9px",fontSize:12,background:card,color:text}}>{asArray(boards).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
      <div style={{marginTop:14,display:"grid",gap:9}}>{records.length===0?<div style={{fontSize:12,color:sub}}>Add Start Date and Due Date first.</div>:records.map(r=>{const left=Math.max(0,diffDays(start,r.range.start))/total*100;const width=Math.max(3,(diffDays(r.range.start,r.range.end)+1)/total*100);const color=STATUS_OPTIONS.find(x=>x.label===r.item.status)?.color||r.group.color||"#579bfc";return <div key={`${r.group.id}-${r.item.id}`} style={{display:"grid",gridTemplateColumns:"180px 1fr",gap:10,alignItems:"center"}}><div style={{minWidth:0}}><div style={{fontSize:12,fontWeight:800,color:text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.item.name}</div><div style={{fontSize:10,color:sub}}>{r.item.owner||"No owner"}</div></div><div style={{height:20,background:dark?"#101828":"#f0f2f8",borderRadius:999,position:"relative"}}><div style={{position:"absolute",left:`${left}%`,width:`${Math.min(width,100-left)}%`,top:3,height:14,borderRadius:999,background:color}} /></div></div>})}</div>
    </div>
    <div style={{background:card,border:`1px solid ${bdr}`,borderRadius:12,padding:16,boxShadow:"0 2px 8px rgba(0,0,0,.06)"}}>
      <div style={{fontSize:14,fontWeight:900,color:text}}>🧪 What-if Simulator</div><div style={{fontSize:12,color:sub,marginTop:3}}>Try deadline and capacity without saving.</div>
      <label style={{display:"block",marginTop:12,fontSize:11,color:sub}}>Deadline shift days</label><input type="number" value={deadlineShift} onChange={e=>setDeadlineShift(Number(e.target.value)||0)} style={{width:"100%",padding:8,border:`1px solid ${bdr}`,borderRadius:8,background:card,color:text}} />
      <label style={{display:"block",marginTop:10,fontSize:11,color:sub}}>Capacity scale %</label><input type="number" value={capacityScale} onChange={e=>setCapacityScale(Number(e.target.value)||100)} style={{width:"100%",padding:8,border:`1px solid ${bdr}`,borderRadius:8,background:card,color:text}} />
      <div style={{marginTop:14,padding:12,borderRadius:10,background:level==="Good"?"#eafff3":level==="Medium Risk"?"#fff8e6":"#fdeef1"}}><div style={{fontSize:18,fontWeight:900,color:level==="Good"?"#00875a":level==="Medium Risk"?"#d4900a":"#e2445c"}}>{level}</div><div style={{fontSize:12,color:"#676879",marginTop:6}}>Risk tasks: {risk} • Est. delay: {delay} day(s)</div><div style={{fontSize:12,color:"#323338",marginTop:6,fontWeight:800}}>{level==="Good"?"Plan looks acceptable.":"Increase capacity or move deadline."}</div></div>
    </div>
  </div>;
}
'''
if 'function GanttWhatIfPanel(' not in s: rep('// SVG Donut chart',code+'\n// SVG Donut chart','component')
if '<GanttWhatIfPanel boards={boards}' not in s: rep('<PlanningSuitePanel boards={boards} onPatchBoard={onPatchBoard} />','<PlanningSuitePanel boards={boards} onPatchBoard={onPatchBoard} />\n      <GanttWhatIfPanel boards={boards} />','insert')
p.write_text(s,encoding='utf-8')
print('Applied simple Gantt and What-if')
