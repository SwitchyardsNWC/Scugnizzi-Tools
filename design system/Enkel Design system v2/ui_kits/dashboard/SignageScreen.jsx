const { Stat, StatGrid, Delta, Num, Sparkline, BarList, Card, CardGrid, DataTable, StatusBadge, TextLink, Panel, PanelSection, Field, Progress, Button, Peek, DateStamp, EmptyState, Segmented } = window.ArtVentoryDesignSystem_f8dda9;
/* Signage: stage funnel (BarList, click = filter) + pieces table grouped by club; row → drawer. */
function SignageScreen({ go, stage, onStage, selected, onSelect, club }) {
  const all=DASH.signs; const clubName=id=>(DASH.clubs.find(c=>c.id===id)||{}).name;
  const rows=all.filter(s=>(!stage||s.stage===stage)&&(!club||s.club===club));
  const byStage=DASH.signageStages.map(st=>({key:st,label:st,value:all.filter(s=>s.stage===st).length,tone:st==='Installed'?2:6}));
  const inFab=all.filter(s=>s.stage==='Fabrication'); const spend=all.filter(s=>s.stage!=='Installed').reduce((a,s)=>a+s.cost,0);
  const late=all.filter(s=>s.stage!=='Installed'&&s.due<NOW);
  const aging=[...all].filter(s=>s.stage!=='Installed').sort((a,b)=>b.days-a.days).slice(0,5);
  const cols=[
    {key:'name',label:'Piece',nowrap:true,width:180,render:s=><Peek content={<><Field label="Vendor">{s.vendor}</Field><Field label="Owner">{s.owner}</Field><Field label="In stage">{s.days} days</Field></>}><span>{s.name}</span></Peek>},
    {key:'club',label:'Club',muted:true,nowrap:true,width:140,render:s=><TextLink href="#" onClick={e=>{e.preventDefault();e.stopPropagation();go('club',s.club);}}>{clubName(s.club)}</TextLink>},
    {key:'type',label:'Type',muted:true,nowrap:true,width:100},
    {key:'stage',label:'Stage',nowrap:true,width:120,render:s=><StatusBadge status={s.stage==='Installed'?'done':s.stage==='Brief'?'notstarted':'progress'} size="chip">{s.stage}</StatusBadge>},
    {key:'days',label:'Days in stage',numeric:true,render:s=><span style={{color:s.days>=10?'var(--data-3)':'inherit'}}>{s.days}</span>},
    {key:'vendor',label:'Vendor',muted:true,nowrap:true,width:150},
    {key:'cost',label:'Cost',numeric:true,render:s=>s.cost?fmtMoney(s.cost):'—'},
    {key:'due',label:'Due',render:s=><DateStamp date={s.due} now={NOW} clock="phase"/>},
    {key:'owner',label:'Owner',muted:true,nowrap:true,width:80},
  ];
  return <div style={{display:'flex',flexDirection:'column',gap:12}}>
    <StatGrid min={160}>
      <Stat label="In pipeline" value={all.length-byStage[4].value} unit="pieces" hint={byStage[4].value+' installed'}/>
      <Stat label="In fabrication" value={inFab.length} hint={fmtK(inFab.reduce((a,s)=>a+s.cost,0))+' committed'} onClick={()=>onStage('Fabrication')}/>
      <Stat label="Overdue" value={late.length} hint={late.length?late.map(s=>s.name).join(' · '):'Nothing late'} tone={late.length?4:1}/>
      <Stat label="Open spend" value={fmtK(spend)} hint="Not yet installed"/>
    </StatGrid>
    <CardGrid min={320}>
      <Card title="By stage" meta={all.length+' pieces'} updated="1 hr ago" footer={<span>{stage?<TextLink href="#" onClick={e=>{e.preventDefault();onStage(null);}}>Clear stage filter</TextLink>:'Click a stage to filter the table'}</span>}><BarList items={byStage} selectedKey={stage} onSelect={i=>onStage(stage===i.key?null:i.key)}/></Card>
      <Card title="Longest in stage" meta="Not installed" updated="1 hr ago"><BarList items={aging.map(s=>({key:s.id,label:s.name,meta:s.stage,value:s.days,tone:s.days>=10?3:6}))} format={v=>v+' d'} onSelect={i=>onSelect(i.key)}/></Card>
    </CardGrid>
    <Card title="Pieces" meta={rows.length+(stage?' in '+stage:'')} updated="1 hr ago"><div style={{margin:'-8px 0'}}><DataTable stickyHeader pinFirst columns={cols} rows={rows} selectedKey={selected} onRowClick={s=>onSelect(s.id===selected?null:s.id)} emptyText="No pieces at this stage."/></div></Card>
  </div>;
}
function SignDrawer({ id, onClose, go }) {
  const s=DASH.signs.find(x=>x.id===id); if(!s) return null; const c=DASH.clubs.find(x=>x.id===s.club);
  const idx=DASH.signageStages.indexOf(s.stage);
  return <Panel kicker={c.name+' · '+s.type} title={s.name} onClose={onClose} footer={<><Button size="sm" onClick={onClose}>{idx<4?'Move to '+DASH.signageStages[idx+1]:'Installed'}</Button><Button size="sm" variant="ghost" onClick={()=>{onClose();go('club',c.id);}}>Go to club</Button></>}>
    <Progress done={idx} total={4} label={s.stage+' · stage '+(idx+1)+' of 5'} tone={idx===4?'good':'primary'}/>
    <StatGrid min={120} gap={8}><Stat label="Days in stage" value={s.days} tone={s.days>=10?3:1}/><Stat label="Cost" value={s.cost?fmtMoney(s.cost):'—'}/></StatGrid>
    <PanelSection title="Details"><Field label="Vendor">{s.vendor}</Field><Field label="Owner">{s.owner}</Field><Field label="Due"><DateStamp date={s.due} now={NOW} clock="phase"/></Field><Field label="Club"><TextLink href="#" onClick={e=>{e.preventDefault();onClose();go('club',c.id);}}>{c.name}</TextLink></Field></PanelSection>
  </Panel>;
}
Object.assign(window,{SignageScreen,SignDrawer});
