const { Stat, StatGrid, Delta, Num, Sparkline, BarList, Card, CardGrid, DataTable, StatusBadge, TextLink, Panel, PanelSection, Field, Progress, Button, Peek, DateStamp } = window.ArtVentoryDesignSystem_f8dda9;
const NOW='2026-09-06';
function sum(a,f){return a.reduce((s,x)=>s+f(x),0);}
function OverviewScreen({ go, openDrawer, range }) {
  const live=DASH.clubs.filter(c=>c.status!=='notstarted');
  const occ=Math.round(sum(live,c=>c.members)/sum(live,c=>c.cap)*100);
  const rev=sum(live,c=>c.rev);
  const onTrack=DASH.projects.filter(p=>['ontrack','done'].includes(p.status)).length;
  const blocked=DASH.projects.filter(p=>p.status==='blocked'||p.status==='risk');
  const open=sum(DASH.projects,p=>p.total-p.done), req=sum(DASH.projects,p=>p.required);
  const byOcc=[...live].sort((a,b)=>b.occ-a.occ).map(c=>({key:c.id,label:c.name,value:c.occ,meta:c.members+' / '+c.cap,tone:DASH.tone('occupancy',c.occ,c.id)}));
  const dueSoon=[...DASH.projects].filter(p=>p.status!=='done').sort((a,b)=>a.due.localeCompare(b.due)).slice(0,5);
  return <div style={{display:'flex',flexDirection:'column',gap:12}}>
    <StatGrid min={190}>
      <Stat label="Occupancy" value={occ} unit="%" delta={1.4} deltaLabel={'vs prior '+range} spark={[74,75,77,76,78,79,occ]} onClick={()=>go('clubs')}/>
      <Stat label="Revenue MTD" value={fmtK(rev)} delta={2.1} deltaLabel={'vs prior '+range} spark={[44,47,46,50,52,55,58]} sparkKind="bars" tone={2} onClick={()=>openDrawer('revenue')}/>
      <Stat label="Projects on track" value={onTrack} unit={'of '+DASH.projects.length} hint={blocked.length+' at risk or blocked'} onClick={()=>go('projects')}/>
      <Stat label="Open checklist items" value={open} delta={-6} invert deltaLabel="this week" hint={req+' required'} onClick={()=>go('projects')}/>
      <Stat label="Warehouse fill" value={DASH.warehouse.fill} unit="%" delta={DASH.warehouse.fillDelta} invert deltaLabel="pts" spark={DASH.warehouse.pulls7} sparkKind="bars" tone={5} onClick={()=>go('warehouse')}/>
      <Stat label="Budget spent" value={Math.round(DASH.budget.spent/DASH.budget.total*100)} unit="%" hint={fmtK(DASH.budget.spent)+' of '+fmtK(DASH.budget.total)} spark={DASH.budget.spark} tone={1} onClick={()=>openDrawer('budget')}/>
    </StatGrid>
    <CardGrid min={320}>
      <Card title="Occupancy by club" meta="Today" updated={DASH.updated} footer={<TextLink href="#" arrow onClick={e=>{e.preventDefault();go('clubs');}}>All clubs</TextLink>}><BarList max={100} format={v=>v+'%'} items={byOcc} onSelect={i=>go('club',i.key)}/></Card>
      <Card title="Needs attention" meta={blocked.length} updated={DASH.updated} footer={<TextLink href="#" arrow onClick={e=>{e.preventDefault();go('projects');}}>All projects</TextLink>}>
        <div style={{display:'flex',flexDirection:'column'}}>{blocked.map((p,i)=><button key={p.id} type="button" onClick={()=>go('projects',p.id)} onMouseEnter={e=>{e.currentTarget.style.background='var(--surface-row-hover)';}} onMouseLeave={e=>{e.currentTarget.style.background='transparent';}} style={{display:'grid',gridTemplateColumns:'auto minmax(0,1fr) auto',gap:10,alignItems:'baseline',padding:'8px 0',border:0,borderBottom:i<blocked.length-1?'1px solid var(--border-muted)':0,background:'transparent',color:'var(--text-primary)',textAlign:'left',cursor:'pointer',fontFamily:'inherit',fontSize:14,letterSpacing:'0.154px',transition:'background 120ms linear',width:'100%'}}><StatusBadge status={p.status} size="dot"/><span style={{minWidth:0}}><div style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.name}</div><div style={{fontSize:13,color:'var(--text-muted)',letterSpacing:'0.143px',marginTop:2}}>{p.note}</div></span><DateStamp date={p.due} now={NOW} clock="phase"/></button>)}</div>
      </Card>
      <Card title="Signage pipeline" meta={sum(DASH.signage,s=>s.value)+' pieces'} updated="1 hr ago" footer={<TextLink href="#" arrow onClick={e=>{e.preventDefault();go('signage');}}>Pipeline</TextLink>}><BarList items={DASH.signage} tone={6}/></Card>
      <Card title="Team load" meta="Open items" updated={DASH.updated} footer={<TextLink href="#" arrow onClick={e=>{e.preventDefault();go('team');}}>Team</TextLink>}>
        <div style={{display:'flex',flexDirection:'column',gap:10}}>{DASH.team.map(t=><Progress key={t.id} done={t.load} total={100} label={<span>{t.name} <span style={{color:'var(--text-muted)'}}>· {t.role}</span></span>} required={t.required} tone={['primary','primary','primary','warn','bad'][DASH.tone('load',t.load)]}/>)}</div>
      </Card>
      <Card title="Low stock" meta={DASH.warehouse.low.length} updated={DASH.warehouse.updated} footer={<TextLink href="#" arrow onClick={e=>{e.preventDefault();go('warehouse');}}>Warehouse</TextLink>}><BarList items={DASH.warehouse.low.map(l=>({...l,meta:'min '+l.min,tone:DASH.tone('stock',l.value/l.min)}))} max={12} tone={5}/></Card>
      <Card title="Due next" meta={dueSoon.length} updated={DASH.updated}>
        <div style={{margin:'-8px 0'}}><DataTable density="compact" rows={dueSoon} onRowClick={p=>go('projects',p.id)} columns={[{key:'name',label:'Project',nowrap:true,width:200,render:p=><Peek content={<><Field label="Lead">{p.lead}</Field><Field label="Phase">{p.phase}</Field><Field label="Progress">{p.done} of {p.total}</Field></>}><span>{p.name}</span></Peek>},{key:'phase',label:'Phase',muted:true},{key:'due',label:'Due',render:p=><DateStamp date={p.due} now={NOW} showRelative={false}/>},{key:'status',label:'',render:p=><StatusBadge status={p.status} size="dot"/>}]}/></div>
      </Card>
    </CardGrid>
  </div>;
}
/* Drawer content for KPI drills. */
function KpiDrawer({ kind, onClose, go }) {
  if(kind==='revenue'){const live=DASH.clubs.filter(c=>c.rev>0).sort((a,b)=>b.rev-a.rev);
    return <Panel kicker="Revenue · month to date" title={fmtMoney(live.reduce((s,c)=>s+c.rev,0))} onClose={onClose} footer={<Button size="sm" variant="outline" onClick={()=>{onClose();go('clubs');}}>Open clubs</Button>}>
      <Stat label="vs prior period" value="+2.1" unit="%" spark={[44,47,46,50,52,55,58]} sparkKind="bars" tone={2}/>
      <PanelSection title="By club"><BarList items={live.map(c=>({key:c.id,label:c.name,value:c.rev}))} format={fmtMoney} tone={2} onSelect={i=>{onClose();go('club',i.key);}}/></PanelSection>
      <PanelSection title="Movers">{live.map(c=><Field key={c.id} label={c.name}><Delta value={c.revDelta}/></Field>)}</PanelSection>
    </Panel>;}
  if(kind==='budget'){const b=DASH.budget;const ps=[...DASH.projects].filter(p=>p.budget>0).sort((a,b)=>b.spent-a.spent);
    return <Panel kicker="Budget · all active projects" title={fmtK(b.spent)+' of '+fmtK(b.total)} onClose={onClose} footer={<Button size="sm" variant="outline" onClick={()=>{onClose();go('projects');}}>Open projects</Button>}>
      <Progress done={b.spent} total={b.total} label={Math.round(b.spent/b.total*100)+'% spent · '+fmtK(b.total-b.spent)+' remaining'} tone="primary"/>
      <PanelSection title="Spent by project"><BarList items={ps.map(p=>({key:p.id,label:p.name,value:p.spent,meta:'of '+fmtK(p.budget),tone:DASH.tone('budget',p.spent/p.budget)}))} format={fmtK} onSelect={i=>{onClose();go('projects',i.key);}}/></PanelSection>
    </Panel>;}
  return null;
}
Object.assign(window,{OverviewScreen,KpiDrawer,NOW});
