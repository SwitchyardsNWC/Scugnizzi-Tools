const { Stat, StatGrid, Delta, Num, Sparkline, BarList, Card, CardGrid, DataTable, StatusBadge, TextLink, Panel, PanelSection, Field, Progress, Button, Peek, DateStamp, Refusal, LivesIn } = window.ArtVentoryDesignSystem_f8dda9;
/* Projects: table; row → drawer inspector. */
function DashProjectsScreen({ selected, onSelect, status, phase }) {
  const rows=DASH.projects.filter(p=>(!status||(status==='attention'?['risk','blocked'].includes(p.status):p.status===status))&&(!phase||p.phase===phase));
  const club=id=>(DASH.clubs.find(c=>c.id===id)||{}).name;
  const cols=[
    {key:'name',label:'Project',nowrap:true,width:220,render:p=><Peek content={<><Field label="Club">{club(p.club)}</Field><Field label="Lead">{p.lead}</Field><Field label="Note">{p.note}</Field></>}><span>{p.name}</span></Peek>},
    {key:'club',label:'Club',muted:true,nowrap:true,width:130,render:p=>club(p.club)},
    {key:'phase',label:'Phase',nowrap:true,width:90},
    {key:'progress',label:'Progress',width:160,render:p=><Progress done={p.done} total={p.total} label={false}/>},
    {key:'done',label:'Done',numeric:true,render:p=>p.done+' / '+p.total},
    {key:'required',label:'Req. open',numeric:true,render:p=>p.required?<span style={{color:'var(--status-blocked)'}}>{p.required}</span>:'0'},
    {key:'spent',label:'Spent',numeric:true,render:p=>fmtK(p.spent)},
    {key:'budget',label:'Budget',numeric:true,render:p=>fmtK(p.budget)},
    {key:'due',label:'Due',render:p=><DateStamp date={p.due} now={NOW} clock="phase"/>},
    {key:'lead',label:'Lead',muted:true,nowrap:true},
    {key:'status',label:'Status',render:p=><StatusBadge status={p.status} size="chip"/>},
  ];
  return <Card><div style={{margin:'-8px 0'}}><DataTable stickyHeader pinFirst columns={cols} rows={rows} selectedKey={selected} onRowClick={p=>onSelect(p.id===selected?null:p.id)} emptyText="No projects match this filter."/></div></Card>;
}
function ProjectDrawer({ id, onClose, go }) {
  const p=DASH.projects.find(x=>x.id===id); if(!p) return null;
  const c=DASH.clubs.find(x=>x.id===p.club);
  return <Panel kicker={c.name+' · '+p.phase} title={p.name} onClose={onClose} footer={<><Button size="sm" onClick={onClose}>Open checklist</Button><Button size="sm" variant="ghost" onClick={()=>{onClose();go('club',c.id);}}>Go to club</Button></>}>
    {p.required?<Refusal title={p.required+' required item'+(p.required>1?'s':'')+' block '+p.phase} action={<TextLink href="#" arrow>Show them</TextLink>}><span>{p.note}</span></Refusal>:null}
    <Progress done={p.done} total={p.total} required={p.required}/>
    <StatGrid min={120} gap={8}><Stat label="Spent" value={fmtK(p.spent)} unit={'of '+fmtK(p.budget)}/><Stat label="Remaining" value={Math.round((1-p.spent/p.budget)*100)} unit="%" invert/></StatGrid>
    <PanelSection title="Details"><Field label="Status"><StatusBadge status={p.status}/></Field><Field label="Lead">{p.lead}</Field><Field label="Due"><DateStamp date={p.due} now={NOW} clock="phase"/></Field><Field label="Club"><TextLink href="#" onClick={e=>{e.preventDefault();onClose();go('club',c.id);}}>{c.name}</TextLink></Field></PanelSection>
    <PanelSection title="Lives in"><LivesIn kind="page" label="Project doc · overview"/><LivesIn kind="row" label={'Schedule · '+p.phase}/></PanelSection>
    <PanelSection title="Note"><span style={{fontSize:13,lineHeight:1.4,color:'var(--text-secondary)'}}>{p.note}</span></PanelSection>
  </Panel>;
}
Object.assign(window,{DashProjectsScreen,ProjectDrawer});
