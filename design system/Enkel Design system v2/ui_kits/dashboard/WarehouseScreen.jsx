const { Stat, StatGrid, Delta, Num, Sparkline, BarList, Card, CardGrid, DataTable, StatusBadge, TextLink, Panel, PanelSection, Field, Progress, Button, Peek, HeatGrid, EmptyState, Refusal } = window.ArtVentoryDesignSystem_f8dda9;
/* Warehouse: stats → bin map (HeatGrid) + stock table with inline expand; bin/row → item drawer. */
const BIN_ROWS='ABCDEFGH';
function warehouseBins(){const W=DASH.warehouse;const byBin=Object.fromEntries(W.items.map(i=>[i.bin,i]));const cells=[];
  for(let r=0;r<8;r++)for(let c=1;c<=12;c++){const id=BIN_ROWS[r]+'-'+String(c).padStart(2,'0');const it=byBin[id];const seed=(r*12+c)*7919%97;const filled=it||seed>29;
    cells.push({key:id,label:'Bin '+id,item:it,meta:it?it.name+' · '+it.qty+' on hand':filled?'Stocked · misc':'Empty',tone:it?(DASH.tone('stock',it.qty/it.min)===1?5:DASH.tone('stock',it.qty/it.min)):filled?5:'var(--data-track)'});}
  return cells;}
function WarehouseScreen({ go, selected, onSelect }) {
  const W=DASH.warehouse; const cells=React.useMemo(warehouseBins,[]);
  const low=W.items.filter(i=>i.qty<i.min); const reserved=W.items.filter(i=>i.reserved).length;
  const cols=[
    {key:'name',label:'Item',nowrap:true,width:220},
    {key:'cat',label:'Category',muted:true,nowrap:true,width:110},
    {key:'bin',label:'Bin',numeric:true},
    {key:'qty',label:'On hand',numeric:true,render:i=><span style={{color:i.qty<i.min?'var(--data-'+DASH.tone('stock',i.qty/i.min)+')':'inherit'}}>{i.qty}</span>},
    {key:'min',label:'Min',numeric:true},
    {key:'pulls',label:'Pulls 7d',width:90,render:i=><Sparkline data={i.pulls} kind="bars" height={18} width={72} tone={5}/>},
    {key:'reserved',label:'Reserved for',muted:true,nowrap:true,width:180,render:i=>i.reserved?(DASH.projects.find(p=>p.id===i.reserved)||{}).name:'—'},
    {key:'status',label:'',render:i=><StatusBadge status={i.qty<i.min?(DASH.tone('stock',i.qty/i.min)===4?'blocked':'risk'):'ontrack'} size="dot"/>},
  ];
  return <div style={{display:'flex',flexDirection:'column',gap:12}}>
    <StatGrid min={160}>
      <Stat label="Fill" value={W.fill} unit="%" delta={W.fillDelta} invert deltaLabel="pts vs last week" hint={DASH.target('fill').warn+'% warn'} spark={[62,64,63,66,67,69,W.fill]} tone={DASH.tone('fill',W.fill)===1?5:DASH.tone('fill',W.fill)}/>
      <Stat label="Free bins" value={W.free} unit={'of '+W.bins}/>
      <Stat label="Below minimum" value={low.length} unit="items" hint={low.filter(i=>DASH.tone('stock',i.qty/i.min)===4).length+' critical'} onClick={()=>onSelect(low[0].id)}/>
      <Stat label="Pulls this week" value={W.pulls7.reduce((a,b)=>a+b,0)} spark={W.pulls7} sparkKind="bars" tone={5} hint={reserved+' items reserved'}/>
    </StatGrid>
    <CardGrid min={320}>
      <Card title="Bin map" meta="Rows A–H · 12 bins" updated={W.updated} footer={<span>Hover a bin · click to open the item</span>}>
        {HeatGrid?<HeatGrid columns={12} size={26} cells={cells} selectedKey={selected?(W.items.find(i=>i.id===selected)||{}).bin:undefined} onSelect={c=>c.item?onSelect(c.item.id):null} legend={[{label:'Stocked',tone:5},{label:'Below min',tone:3},{label:'Critical',tone:4},{label:'Empty',tone:'var(--data-track)'}]}/>:<EmptyState what="Bin map needs a bundle rebuild." compact/>}
      </Card>
      <Card title="Pulls by day" meta="Last 7 days" updated={W.updated}><BarList items={W.pulls7.map((v,i)=>({label:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i],value:v,tone:i===6?1:5}))}/></Card>
    </CardGrid>
    <Card title="Stock" meta={W.items.length+' items'} updated={W.updated} padding={16}><div style={{margin:'-8px 0'}}><DataTable stickyHeader pinFirst columns={cols} rows={W.items} selectedKey={selected} onRowClick={i=>onSelect(i.id===selected?null:i.id)}/></div></Card>
  </div>;
}
function ItemDrawer({ id, onClose, go }) {
  const i=DASH.warehouse.items.find(x=>x.id===id); if(!i) return null;
  const p=i.reserved?DASH.projects.find(x=>x.id===i.reserved):null; const short=i.qty<i.min;
  return <Panel kicker={i.cat+' · bin '+i.bin} title={i.name} onClose={onClose} footer={<><Button size="sm">Reorder</Button>{p?<Button size="sm" variant="ghost" onClick={()=>{onClose();go('projects',p.id);}}>Open project</Button>:null}</>}>
    {short?<Refusal title={(i.min-i.qty)+' short of minimum'}><span>Min {i.min}, {i.qty} on hand{p?' — '+p.name+' has a claim on this.':'.'}</span></Refusal>:null}
    <StatGrid min={120} gap={8}><Stat label="On hand" value={i.qty} unit={'min '+i.min}/><Stat label="Pulls 7d" value={i.pulls.reduce((a,b)=>a+b,0)} spark={i.pulls} sparkKind="bars" tone={5}/></StatGrid>
    <PanelSection title="Details"><Field label="Bin"><Num>{i.bin}</Num></Field><Field label="Category">{i.cat}</Field><Field label="Reserved for">{p?<TextLink href="#" onClick={e=>{e.preventDefault();onClose();go('projects',p.id);}}>{p.name}</TextLink>:'—'}</Field></PanelSection>
  </Panel>;
}
Object.assign(window,{WarehouseScreen,ItemDrawer});
