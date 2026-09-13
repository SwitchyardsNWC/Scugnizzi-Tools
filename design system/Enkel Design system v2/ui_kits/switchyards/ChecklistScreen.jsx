const { Progress, StatusBadge, LivesIn, DateStamp, Button, Panel, PanelSection, Field, Refusal, TextLink, Select } = window.ArtVentoryDesignSystem_f8dda9;
function ChecklistScreen({ items, onToggle, selected, onSelect, project }) {
  const [filter,setFilter]=React.useState('all'); const [collapsed,setCollapsed]=React.useState({0:true}); const [tried,setTried]=React.useState(false); const wide=useWide();
  const fil=i=>filter==='all'||(filter==='open'&&!i.done)||(filter==='mine'&&i.owner==='Jared')||(filter==='required'&&i.required)||(filter==='unlinked'&&!i.lives);
  const tabs=[['all','All'],['open','Open'],['mine','Mine'],['required','Required'],['unlinked','Not yet linked']];
  const cur=items[1]; const reqOpen=cur.items.filter(i=>i.required&&!i.done);
  return <div>
    <PageHead kicker={project.name+' · '+SY.phases[project.phase]} title="Checklist" actions={<Button size="sm" onClick={()=>setTried(true)}>{'Close '+SY.phases[project.phase]}</Button>}>
      {tried?<Refusal title={reqOpen.length+' required items block '+SY.phases[project.phase]} action={<TextLink href="#" arrow onClick={e=>{e.preventDefault();setFilter('required');}}>Show required</TextLink>}>{reqOpen.map(i=><span key={i.id}>{i.title} — {i.lives?'not done':'not yet linked'}</span>)}</Refusal>:null}
      <div style={{display:'flex',gap:21,borderBottom:'1px solid var(--border-muted)'}}>{tabs.map(([id,l])=><button key={id} type="button" onClick={()=>setFilter(id)} style={{background:'none',border:0,borderBottom:filter===id?'1px solid #000':'1px solid transparent',padding:'5px 0',fontFamily:'inherit',fontSize:14,letterSpacing:'0.154px',color:filter===id?'var(--text-primary)':'var(--text-muted)',cursor:'pointer'}}>{l}</button>)}</div>
    </PageHead>
    <div style={{display:'flex',flexDirection:'column',gap:42}}>{items.map((g,gi)=>{const done=g.items.filter(i=>i.done).length; const req=g.items.filter(i=>i.required&&!i.done).length; const rows=g.items.filter(fil); const col=collapsed[gi];
      return <section key={gi}><div onClick={()=>setCollapsed({...collapsed,[gi]:!col})} style={{display:'grid',gridTemplateColumns:wide?'minmax(0,1fr) 260px':'minmax(0,1fr)',gap:wide?42:10,alignItems:'end',borderBottom:'1px solid var(--border-hairline)',paddingBottom:10,cursor:'pointer'}}><span style={{fontSize:18,lineHeight:1.15,letterSpacing:'0.198px',display:'flex',gap:10,alignItems:'baseline',flexWrap:'wrap'}}><span style={{color:'var(--text-muted)',fontSize:13}}>{col?'+':'−'}</span>{SY.phases[g.phase]}<DateStamp date={project.dates[g.phase]} now={SY.now} clock="phase" style={{marginLeft:10}}/></span><Progress done={done} total={g.items.length} required={req}/></div>
        {!col?rows.map(i=>{const liv=i.lives?<LivesIn kind={i.lives.kind} label={i.lives.label}/>:<LivesIn unlinked required={i.required} onClick={()=>onSelect(i.id)}/>;
          return <div key={i.id} onClick={()=>onSelect(i.id)} style={{display:'grid',gridTemplateColumns:wide?'21px minmax(0,2fr) minmax(0,1.5fr) 90px 90px minmax(160px,auto)':'21px minmax(0,1fr) minmax(150px,auto)',gap:21,alignItems:wide?'center':'start',padding:'10px 0',borderBottom:'1px solid var(--border-muted)',fontSize:14,letterSpacing:'0.154px',cursor:'pointer',background:selected===i.id?'var(--surface-row-hover)':'transparent'}}>
          <button type="button" aria-label={i.done?'Mark open':'Mark done'} onClick={e=>{e.stopPropagation();onToggle(i.id);}} style={{width:17,height:17,marginTop:wide?0:2,border:'1px solid var(--border-hairline)',background:i.done?'var(--text-primary)':'transparent',cursor:'pointer',padding:0,color:'#fff',fontSize:11,lineHeight:1}}>{i.done?'✓':''}</button>
          {wide?<React.Fragment>
            <span style={{color:i.done?'var(--text-muted)':'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{i.title}</span>
            <span style={{minWidth:0}}>{liv}</span>
            <span style={{fontSize:13,color:i.required?'var(--text-secondary)':'var(--text-muted)'}}>{i.required?'Required':'—'}</span>
            <span style={{fontSize:13,color:'var(--text-secondary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{i.owner}</span>
          </React.Fragment>:<span style={{minWidth:0,display:'flex',flexDirection:'column',gap:5}}>
            <span style={{color:i.done?'var(--text-muted)':'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{i.title}{i.required?<span style={{fontSize:13,color:'var(--text-muted)'}}> · required</span>:null}</span>
            <span style={{display:'flex',alignItems:'center',gap:10,minWidth:0,fontSize:13,letterSpacing:'0.143px'}}>{liv}<span style={{color:'var(--text-muted)',whiteSpace:'nowrap'}}>{i.owner}</span></span>
          </span>}
          <DateStamp date={i.due} now={SY.now} clock="phase" showRelative={!i.done} style={{marginTop:wide?0:2}}/>
        </div>;}):null}
        {!col&&!rows.length?<div style={{padding:'21px 0',fontSize:13,color:'var(--text-muted)'}}>No items match this filter.</div>:null}
      </section>;})}</div>
  </div>;
}
function ItemPanel({ item, onClose, onToggle, onLink }) {
  if(!item) return null; const gate=item.required&&!item.lives&&!item.done;
  return <Panel kicker={'Checklist item · '+SY.phases[item.phase]} title={item.title} onClose={onClose} footer={<>{gate?null:<Button size="sm" onClick={()=>onToggle(item.id)}>{item.done?'Mark open':'Mark done'}</Button>}<Button size="sm" variant="ghost">Add note</Button></>} style={{position:'sticky',top:0,height:'100vh'}}>
    {gate?<Refusal title="Can't mark done until it points at a real deliverable" action={<Button size="sm" variant="outline" onClick={()=>onLink(item.id)}>Link a board frame</Button>}><span>The template expects a Signage plan frame on the board.</span></Refusal>:null}
    <PanelSection title="Lives in">{item.lives?<LivesIn kind={item.lives.kind} label={item.lives.label}/>:<LivesIn unlinked required={item.required} onClick={()=>onLink(item.id)}/>}<span style={{fontSize:13,color:'var(--text-muted)'}}>From template: {item.required?'required':'optional'} · expects a board frame</span></PanelSection>
    <PanelSection title="Details"><Field label="Status"><StatusBadge status={item.done?'done':item.lives?'progress':'notstarted'}/></Field><Field label="Owner">{item.owner}</Field><Field label="Due"><DateStamp date={item.due} now={SY.now} clock="phase"/></Field><Field label="Required">{item.required?'Yes':'No'}</Field></PanelSection>
    <PanelSection title="Sub-tasks"><span style={{fontSize:13,color:'var(--text-muted)'}}>None. <TextLink href="#" style={{fontSize:13}}>Add one</TextLink></span></PanelSection>
  </Panel>;
}
Object.assign(window,{ChecklistScreen,ItemPanel});