const { Stat, StatGrid, Delta, Num, Sparkline, BarList, Card, CardGrid, DataTable, StatusBadge, TextLink, Panel, PanelSection, Field, Progress, Button, Peek, DateStamp, EmptyState } = window.ArtVentoryDesignSystem_f8dda9;
/* Team: per-person workload table with inline expand (projects + clubs), plus load cards. Threshold from data.targets.load. */
const LOAD_TONE=t=>['primary','primary','primary','warn','bad'][t];
function TeamScreen({ go }) {
  const [open,setOpen]=React.useState(null);
  const T=DASH.team; const cap=T.reduce((a,t)=>a+t.capacity,0); const openAll=T.reduce((a,t)=>a+t.open,0);
  const over=T.filter(t=>DASH.tone('load',t.load)>1); const req=T.reduce((a,t)=>a+t.required,0);
  const cols=[
    {key:'name',label:'Person',nowrap:true,width:160,render:t=><span>{t.name} <span style={{color:'var(--text-muted)'}}>· {t.role}</span></span>},
    {key:'market',label:'Market',muted:true,nowrap:true,width:150},
    {key:'load',label:'Load',width:160,render:t=><Progress done={t.load} total={100} label={false} tone={LOAD_TONE(DASH.tone('load',t.load))}/>},
    {key:'loadn',label:'',numeric:true,render:t=><span style={{color:DASH.tone('load',t.load)>1?'var(--data-'+DASH.tone('load',t.load)+')':'inherit'}}>{t.load}%</span>},
    {key:'open',label:'Open',numeric:true,render:t=>t.open+' / '+t.capacity},
    {key:'week',label:'7d',width:90,render:t=><Sparkline data={t.week} height={18} width={72}/>},
    {key:'required',label:'Required',numeric:true,render:t=>t.required?<span style={{color:'var(--status-blocked)'}}>{t.required}</span>:'0'},
    {key:'projects',label:'Projects',numeric:true,render:t=>t.projects.length},
    {key:'clubs',label:'Clubs',muted:true,nowrap:true,width:220,render:t=>t.clubs.length?t.clubs.map(c=>(DASH.clubs.find(x=>x.id===c)||{}).name).join(', '):'—'},
  ];
  return <div style={{display:'flex',flexDirection:'column',gap:12}}>
    <StatGrid min={160}>
      <Stat label="Team load" value={Math.round(openAll/cap*100)} unit="%" hint={openAll+' open of '+cap+' capacity'} spark={T[0].week.map((_,i)=>T.reduce((a,t)=>a+t.week[i],0))} tone={5}/>
      <Stat label="Over threshold" value={over.length} unit={'of '+T.length} hint={over.length?over.map(t=>t.name).join(' · ')+' ≥ '+DASH.target('load').warn+'%':'Nobody above '+DASH.target('load').warn+'%'} tone={over.length?3:1} onClick={()=>setOpen(over[0]&&over[0].id)}/>
      <Stat label="Required open" value={req} hint="Gate the next phase" onClick={()=>go('projects')}/>
      <Stat label="Unassigned" value={DASH.projects.filter(p=>!T.some(t=>t.projects.includes(p.id))).length} unit="projects" hint="Need an owner"/>
    </StatGrid>
    <Card title="Workload" meta={T.length+' people'} updated={DASH.updated} footer={<span>Load = open ÷ capacity · amber at {DASH.target('load').warn}%, brick at {DASH.target('load').bad}% · click a row for their projects</span>}><div style={{margin:'-8px 0'}}><DataTable stickyHeader pinFirst columns={cols} rows={T} onRowClick={t=>setOpen(open===t.id?null:t.id)} expandedKey={open} renderExpanded={t=><TeamExpand t={t} go={go}/>}/></div></Card>
    <CardGrid min={260}>{T.map(t=>{const ps=t.projects.map(id=>DASH.projects.find(p=>p.id===id)).filter(Boolean);
      return <Card key={t.id} title={t.name} meta={t.role} updated={DASH.updated} onClick={()=>setOpen(open===t.id?null:t.id)}><Stat label="Load" value={t.load} unit="%" hint={t.open+' open · '+t.required+' required'} spark={t.week} tone={DASH.tone('load',t.load)===1?1:DASH.tone('load',t.load)}/><BarList items={ps.map(p=>({key:p.id,label:p.name,value:p.total-p.done,meta:p.phase,tone:['risk','blocked'].includes(p.status)?4:5}))} format={v=>v+' open'} tone={5}/>{!ps.length?<span style={{fontSize:13,color:'var(--text-muted)'}}>No projects assigned.</span>:null}</Card>;})}</CardGrid>
  </div>;
}
function TeamExpand({ t, go }) {
  const ps=t.projects.map(id=>DASH.projects.find(p=>p.id===id)).filter(Boolean);
  return <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:24,paddingTop:12,paddingRight:16}}>
    <div style={{display:'flex',flexDirection:'column',gap:8,fontSize:13}}><span style={{color:'var(--text-secondary)'}}>Projects · {ps.length}</span>{ps.map(p=><div key={p.id} style={{display:'flex',flexDirection:'column',gap:4}}><div style={{display:'flex',gap:8,alignItems:'baseline'}}><StatusBadge status={p.status} size="dot"/><TextLink href="#" onClick={e=>{e.preventDefault();e.stopPropagation();go('projects',p.id);}}>{p.name}</TextLink><span style={{color:'var(--text-muted)'}}>{p.phase}</span></div><Progress done={p.done} total={p.total} required={p.required} label={false}/></div>)}{!ps.length?<span style={{color:'var(--text-muted)'}}>None.</span>:null}</div>
    <div style={{display:'flex',flexDirection:'column',gap:8,fontSize:13}}><span style={{color:'var(--text-secondary)'}}>Clubs · {t.clubs.length}</span>{t.clubs.map(c=>{const club=DASH.clubs.find(x=>x.id===c);return club?<div key={c} style={{display:'flex',gap:8,alignItems:'baseline'}}><TextLink href="#" onClick={e=>{e.preventDefault();e.stopPropagation();go('club',c);}}>{club.name}</TextLink><span style={{color:'var(--text-muted)'}}>{club.occ?club.occ+'%':'not open'}</span></div>:null;})}{!t.clubs.length?<span style={{color:'var(--text-muted)'}}>None.</span>:null}</div>
    <Stat label="Capacity" value={t.capacity} unit="items / week" hint={(t.capacity-t.open)+' headroom'}/>
  </div>;
}
Object.assign(window,{TeamScreen});
