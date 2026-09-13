const { Segmented, FilterChip, Select, Button, ApplyTheme, GetTheme } = window.ArtVentoryDesignSystem_f8dda9;
if(ApplyTheme&&GetTheme)ApplyTheme(GetTheme());
function DashApp() {
  const [route,setRoute]=React.useState(()=>{try{return JSON.parse(localStorage.getItem('enkel-dash-route'))||{section:'overview'};}catch(e){return {section:'overview'};}});
  const [drawer,setDrawer]=React.useState(null);
  const [range,setRange]=React.useState('30d');
  const [market,setMarket]=React.useState(null);
  const [view,setView]=React.useState('table');
  const [status,setStatus]=React.useState(null);
  const [phase,setPhase]=React.useState(null);
  const [stage,setStage]=React.useState(null);
  React.useEffect(()=>{try{localStorage.setItem('enkel-dash-route',JSON.stringify(route));}catch(e){}},[route]);
  const go=(section,id)=>{setDrawer(null);if(section==='club')setRoute({section:'clubs',club:id});else if(section==='projects'&&id){setRoute({section:'projects'});setDrawer({kind:'project',id});}else setRoute({section});};
  const onSection=s=>{setDrawer(null);setRoute({section:s});};
  const s=route.section; const club=s==='clubs'&&route.club?DASH.clubs.find(c=>c.id===route.club):null;
  const rangeCtl=<Segmented size="sm" ariaLabel="Period" options={['7d','30d','90d']} value={range} onChange={setRange}/>;
  const markets=[...new Set(DASH.clubs.map(c=>c.market))];
  let header, body, drawerEl=null, width='full';
  if(s==='overview'){
    header=<DashHeader title="Overview" kicker="Switchyards · all markets" actions={<Button size="sm" variant="outline">Export</Button>} summary={DASH.clubs.filter(c=>c.status!=='notstarted').length+' open clubs · '+DASH.projects.length+' projects · updated '+DASH.updated} filters={<>{rangeCtl}{market?<FilterChip label="Market" value={market} onRemove={()=>setMarket(null)}/>:<Segmented size="sm" ariaLabel="Market" options={[{value:'all',label:'All markets'},...markets.map(m=>({value:m,label:m}))]} value="all" onChange={v=>{setMarket(v==='all'?null:v);setRoute({section:'clubs'});}}/>}</>}/>;
    body=<OverviewScreen go={go} openDrawer={k=>setDrawer({kind:k})} range={range}/>;
    if(drawer&&drawer.kind!=='project') drawerEl=<KpiDrawer kind={drawer.kind} onClose={()=>setDrawer(null)} go={go}/>;
  } else if(s==='clubs'&&club){
    header=<DashHeader title={club.name} crumbs={[{label:'Overview',onClick:()=>onSection('overview')},{label:'Clubs',onClick:()=>onSection('clubs')},{label:club.name}]} actions={<Button size="sm" variant="outline">Export</Button>} filters={rangeCtl} summary={'Lead '+club.lead+' · updated '+DASH.updated}/>;
    body=<ClubScreen id={club.id} go={go} range={range}/>;
  } else if(s==='clubs'){
    const rows=DASH.clubs.filter(c=>!market||c.market===market);
    header=<DashHeader title="Clubs" kicker="Occupancy · revenue · projects" actions={<Segmented size="sm" ariaLabel="View" options={[{value:'table',label:'Table'},{value:'cards',label:'Cards'}]} value={view} onChange={setView}/>} summary={rows.length+' clubs · updated '+DASH.updated} filters={<>{rangeCtl}{market?<FilterChip label="Market" value={market} onRemove={()=>setMarket(null)}/>:<Segmented size="sm" ariaLabel="Market" options={[{value:'all',label:'All markets'},...markets.map(m=>({value:m,label:m}))]} value="all" onChange={v=>setMarket(v==='all'?null:v)}/>}</>}/>;
    body=<ClubsScreen go={go} market={market} view={view}/>;
  } else if(s==='projects'){
    const n=DASH.projects.filter(p=>(!status||(status==='attention'?['risk','blocked'].includes(p.status):p.status===status))&&(!phase||p.phase===phase)).length;
    header=<DashHeader title="Projects" kicker="All clubs" actions={<Button size="sm">Start a project</Button>} summary={n+' of '+DASH.projects.length+' projects'} filters={<><Segmented size="sm" ariaLabel="Status" options={[{value:'all',label:'All'},{value:'attention',label:'Needs attention'},{value:'ontrack',label:'On track'},{value:'done',label:'Done'}]} value={status||'all'} onChange={v=>setStatus(v==='all'?null:v)}/><Select options={[{value:'',label:'Any phase'},...DASH.phases.map(p=>({value:p,label:p}))]} value={phase||''} onChange={e=>setPhase(e.target.value||null)} style={{width:150}}/></>}/>;
    body=<DashProjectsScreen selected={drawer&&drawer.kind==='project'?drawer.id:null} onSelect={id=>setDrawer(id?{kind:'project',id}:null)} status={status} phase={phase}/>;
    if(drawer&&drawer.kind==='project') drawerEl=<ProjectDrawer id={drawer.id} onClose={()=>setDrawer(null)} go={go}/>;
  } else if(s==='warehouse'){
    const W=DASH.warehouse;
    header=<DashHeader title="Warehouse" kicker="Stock · bins · pulls" actions={<Button size="sm" variant="outline">Export</Button>} summary={W.items.length+' items · '+W.free+' free bins · updated '+W.updated} filters={rangeCtl}/>;
    body=<WarehouseScreen go={go} selected={drawer&&drawer.kind==='item'?drawer.id:null} onSelect={id=>setDrawer(id?{kind:'item',id}:null)}/>;
    if(drawer&&drawer.kind==='item') drawerEl=<ItemDrawer id={drawer.id} onClose={()=>setDrawer(null)} go={go}/>;
  } else if(s==='signage'){
    header=<DashHeader title="Signage" kicker="Pipeline · all clubs" actions={<Button size="sm">Add a piece</Button>} summary={DASH.signs.filter(x=>x.stage!=='Installed').length+' in pipeline · updated 1 hr ago'} filters={<>{stage?<FilterChip label="Stage" value={stage} onRemove={()=>setStage(null)}/>:<Segmented size="sm" ariaLabel="Stage" options={[{value:'all',label:'All stages'},...DASH.signageStages.map(x=>({value:x,label:x}))]} value="all" onChange={v=>setStage(v==='all'?null:v)}/>}{market?<FilterChip label="Market" value={market} onRemove={()=>setMarket(null)}/>:null}</>}/>;
    body=<SignageScreen go={go} stage={stage} onStage={setStage} club={null} selected={drawer&&drawer.kind==='sign'?drawer.id:null} onSelect={id=>setDrawer(id?{kind:'sign',id}:null)}/>;
    if(drawer&&drawer.kind==='sign') drawerEl=<SignDrawer id={drawer.id} onClose={()=>setDrawer(null)} go={go}/>;
  } else if(s==='team'){
    header=<DashHeader title="Team" kicker="Workload · this week" summary={DASH.team.length+' people · updated '+DASH.updated} filters={rangeCtl}/>;
    body=<TeamScreen go={go}/>;
  } else {
    const label=(DASH_SECTIONS.find(x=>x.id===s)||{}).label;
    header=<DashHeader title={label}/>; body=<NotBuilt what={label}/>;
  }
  return <DashShell section={s} onSection={onSection} header={header} drawer={drawerEl} onCloseDrawer={()=>setDrawer(null)} width={width}>{body}</DashShell>;
}
ReactDOM.createRoot(document.getElementById('root')).render(<DashApp/>);
