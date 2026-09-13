const { Stat, StatGrid, Delta, Num, Sparkline, BarList, Card, CardGrid, DataTable, StatusBadge, TextLink, Panel, PanelSection, Field, Progress, Button, Peek, DateStamp, Segmented, FilterChip, EmptyState } = window.ArtVentoryDesignSystem_f8dda9;
/* Clubs: table with inline expand; row → full page. */
function ClubsScreen({ go, market, view }) {
  const [open,setOpen]=React.useState(null);
  const rows=DASH.clubs.filter(c=>!market||c.market===market);
  const cols=[
    {key:'name',label:'Club',nowrap:true,width:180,render:c=><TextLink href="#" onClick={e=>{e.preventDefault();e.stopPropagation();go('club',c.id);}}>{c.name}</TextLink>},
    {key:'market',label:'Market',muted:true,nowrap:true},
    {key:'occ',label:'Occupancy',numeric:true,render:c=>c.occ?c.occ+'%':'—'},
    {key:'trend',label:'7d',width:90,render:c=>c.occ?<Sparkline data={c.trend} height={18} width={72}/>:null},
    {key:'occDelta',label:'Δ occ.',numeric:true,render:c=>c.occ?<Delta value={c.occDelta} format={n=>(n>0?'+':'')+n+' pts'}/>:'—'},
    {key:'rev',label:'Revenue MTD',numeric:true,render:c=>c.rev?fmtMoney(c.rev):'—'},
    {key:'revDelta',label:'Δ rev.',numeric:true,render:c=>c.rev?<Delta value={c.revDelta}/>:'—'},
    {key:'projects',label:'Projects',numeric:true},
    {key:'status',label:'Status',render:c=><StatusBadge status={c.status} size="chip"/>},
  ];
  if(view==='cards') return <CardGrid min={260}>{rows.map(c=><Card key={c.id} title={c.name} meta={c.market} onClick={()=>go('club',c.id)}><Stat label="Occupancy" value={c.occ||'—'} unit={c.occ?'%':''} delta={c.occ?c.occDelta:undefined} spark={c.occ?c.trend:undefined}/><div style={{display:'flex',justifyContent:'space-between',fontSize:13,color:'var(--text-muted)'}}><span>{c.rev?fmtMoney(c.rev):'Not open'}</span><StatusBadge status={c.status} size="chip"/></div></Card>)}</CardGrid>;
  return <Card padding={16}><div style={{margin:'-8px 0'}}><DataTable stickyHeader pinFirst columns={cols} rows={rows} onRowClick={c=>setOpen(open===c.id?null:c.id)} expandedKey={open} renderExpanded={c=><ClubExpand c={c} go={go}/>}/></div></Card>;
}
function ClubExpand({ c, go }) {
  const ps=DASH.projects.filter(p=>p.club===c.id);
  return <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:24,paddingTop:12,paddingRight:16}}>
    <Stat label="Members" value={c.members} unit={'of '+c.cap} hint={c.cap-c.members+' seats free'}/>
    <Stat label="Revenue trend" value={c.rev?fmtK(c.rev):'—'} spark={c.revTrend} sparkKind="bars" tone={2}/>
    <div style={{display:'flex',flexDirection:'column',gap:8,fontSize:13}}><span style={{color:'var(--text-secondary)'}}>Projects · {ps.length}</span>{ps.map(p=><div key={p.id} style={{display:'flex',gap:8,alignItems:'baseline'}}><StatusBadge status={p.status} size="dot"/><TextLink href="#" onClick={e=>{e.preventDefault();e.stopPropagation();go('projects',p.id);}}>{p.name}</TextLink><span style={{color:'var(--text-muted)'}}>{p.phase}</span></div>)}{!ps.length?<span style={{color:'var(--text-muted)'}}>None.</span>:null}</div>
    <div style={{display:'flex',alignItems:'flex-end'}}><Button size="sm" variant="outline" onClick={e=>{e.stopPropagation();go('club',c.id);}}>Open {c.name}</Button></div>
  </div>;
}
/* Full-page drill for one club. */
function ClubScreen({ id, go, range }) {
  const c=DASH.clubs.find(x=>x.id===id); if(!c) return <EmptyState what="No such club." compact/>;
  const ps=DASH.projects.filter(p=>p.club===c.id);
  const days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  return <div style={{display:'flex',flexDirection:'column',gap:12}}>
    <StatGrid min={190}>
      <Stat label="Occupancy" value={c.occ} unit="%" delta={c.occDelta} deltaLabel={'pts vs prior '+range} spark={c.trend} size="lg"/>
      <Stat label="Members" value={c.members} unit={'of '+c.cap} hint={(c.cap-c.members)+' seats free'}/>
      <Stat label="Revenue MTD" value={fmtK(c.rev)} delta={c.revDelta} spark={c.revTrend} sparkKind="bars" tone={2}/>
      <Stat label="Open items" value={c.open} hint={ps.length+' projects'} onClick={()=>go('projects',ps[0]&&ps[0].id)}/>
    </StatGrid>
    <CardGrid min={320}>
      <Card title="Occupancy by day" meta="Last 7 days" updated={DASH.updated}><BarList items={c.trend.map((v,i)=>({label:days[i],value:v,tone:i===6?DASH.tone('occupancy',v,c.id):5}))} max={100} format={v=>v+'%'}/></Card>
      <Card title="Projects" meta={ps.length} footer={<><span>Lead {c.lead}</span><TextLink href="#" arrow onClick={e=>{e.preventDefault();go('projects');}}>All projects</TextLink></>}>
        <div style={{display:'flex',flexDirection:'column',gap:12}}>{ps.map(p=><div key={p.id} style={{display:'flex',flexDirection:'column',gap:6}}><div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'baseline'}}><TextLink href="#" onClick={e=>{e.preventDefault();go('projects',p.id);}}>{p.name}</TextLink><StatusBadge status={p.status} size="chip">{p.phase}</StatusBadge></div><Progress done={p.done} total={p.total} required={p.required}/></div>)}{!ps.length?<EmptyState what="No projects here." compact/>:null}</div>
      </Card>
      <Card title="Details"><Field label="Market">{c.market}</Field><Field label="Capacity"><Num>{c.cap}</Num></Field><Field label="Occupancy target">{DASH.target('occupancy',c.id)?<Num>{DASH.target('occupancy',c.id).warn+'%'}</Num>:'— (not open)'}</Field><Field label="Lead">{c.lead}</Field><Field label="Status"><StatusBadge status={c.status}/></Field></Card>
    </CardGrid>
  </div>;
}
Object.assign(window,{ClubsScreen,ClubScreen});
