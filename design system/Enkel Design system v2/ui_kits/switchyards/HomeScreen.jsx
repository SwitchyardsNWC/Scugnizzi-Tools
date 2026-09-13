const { Kpi, KpiStrip, DateStamp, LivesIn, StatusBadge, Divider, TextLink, Progress } = window.ArtVentoryDesignSystem_f8dda9;
function HomeScreen({ tasks, onToggle, onOpenProject }) {
  const wide=useWide();
  const now=new Date(SY.now); const day=d=>Math.round((new Date(d)-now)/86400000);
  const groups=[['Overdue',t=>day(t.due)<0],['This week',t=>day(t.due)>=0&&day(t.due)<7],['Next week',t=>day(t.due)>=7&&day(t.due)<14],['Later',t=>day(t.due)>=14]];
  const open=tasks.filter(t=>!t.done); const overdue=open.filter(t=>day(t.due)<0).length;
  const proj=id=>SY.projects.find(p=>p.id===id);
  const week=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d,i)=>({d,n:open.filter(t=>{const k=day(t.due);return k>=i-3&&k<i-2;}).length}));
  return <div>
    <PageHead kicker={SY.user.role+' · '+SY.user.market} title="My work">
      <KpiStrip><Kpi value={open.length} label="Open tasks"/><Kpi value={overdue} label="Overdue" tone={overdue?'blocked':undefined}/><Kpi value={SY.projects.filter(p=>p.lead==='Jared').length} label="My projects" hint="of 6 in Atlanta"/><Kpi value="2" label="Waiting on you" hint="1 approval · 1 mention"/></KpiStrip>
    </PageHead>
    <div style={{display:'grid',gridTemplateColumns:wide?'minmax(0,1fr) 260px':'minmax(0,1fr)',gap:wide?84:42,alignItems:'start'}}>
      <div style={{display:'flex',flexDirection:'column',gap:42}}>
        {groups.map(([g,fn])=>{const rows=open.filter(fn); if(!rows.length) return null; return <section key={g}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',borderBottom:'1px solid var(--border-hairline)',paddingBottom:10,marginBottom:10}}><span style={{fontSize:18,lineHeight:1.15,letterSpacing:'0.198px',color:g==='Overdue'?'var(--status-blocked)':'var(--text-primary)'}}>{g}</span><span style={{fontSize:13,color:'var(--text-muted)'}}>{rows.length}</span></div>
          {rows.map(t=><div key={t.id} role="link" tabIndex={0} onClick={()=>onOpenProject(t.project)} onKeyDown={e=>{if(e.key==='Enter')onOpenProject(t.project);}}
            onMouseEnter={e=>{const s=e.currentTarget.style;s.background='var(--surface-row-hover)';s.boxShadow='inset 2px 0 0 var(--text-primary)';e.currentTarget.querySelector('[data-check]').style.borderColor='var(--text-primary)';}}
            onMouseLeave={e=>{const s=e.currentTarget.style;s.background='transparent';s.boxShadow='none';e.currentTarget.querySelector('[data-check]').style.borderColor='var(--border-muted)';}}
            style={{display:'grid',gridTemplateColumns:'17px minmax(0,1fr) auto',columnGap:21,rowGap:5,alignItems:'baseline',padding:'14px 21px 14px 10px',margin:'0 -21px 0 -10px',borderBottom:'1px solid var(--border-muted)',fontSize:14,lineHeight:1.2,letterSpacing:'0.154px',cursor:'pointer',transition:'background 120ms linear, box-shadow 120ms linear',outline:'none'}}>
            {/* Row 1 — the decision: check · title · due. Row 2 — the context, all graphite: project › where it lives · required. */}
            <button type="button" data-check aria-label="Mark done" onClick={e=>{e.stopPropagation();onToggle(t.id);}} style={{gridRow:'1 / span 2',alignSelf:'start',width:17,height:17,marginTop:2,border:'1px solid var(--border-muted)',borderRadius:'var(--radius-tags-sm,4px)',background:'var(--surface-paper)',cursor:'pointer',padding:0,transition:'border-color 120ms linear'}}/>
            <span style={{minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'var(--text-primary)'}}>{t.title}</span>
            <DateStamp date={t.due} now={SY.now} clock="phase"/>
            <span style={{gridColumn:2,display:'flex',alignItems:'baseline',gap:10,minWidth:0,fontSize:13,letterSpacing:'0.143px',color:'var(--text-muted)'}}><span style={{whiteSpace:'nowrap',flex:'0 0 auto'}}>{proj(t.project).name}</span><span style={{color:'var(--text-faint)',flex:'0 0 auto'}}>›</span><span onClick={e=>e.stopPropagation()} style={{minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.lives?<LivesIn kind={t.lives.kind} label={t.lives.label} style={{maxWidth:'100%',color:'var(--text-muted)',display:'inline-flex',verticalAlign:'bottom'}}/>:<LivesIn unlinked required={t.required}/>}</span></span>
            {t.required?<span style={{gridColumn:3,justifySelf:'end',fontSize:13,lineHeight:'14px',letterSpacing:'0.3px',textTransform:'uppercase',color:t.lives?'var(--text-muted)':'var(--status-risk)'}}>Required</span>:null}
          </div>)}
        </section>;})}
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:42}}>
        <section><div style={{fontSize:13,color:'var(--text-muted)',borderBottom:'1px solid var(--border-hairline)',paddingBottom:10,marginBottom:10}}>This week</div><div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:5,alignItems:'end',height:63}}>{week.map((w,i)=><div key={w.d} style={{display:'flex',flexDirection:'column',gap:5,alignItems:'center'}}><div style={{width:'100%',height:Math.max(4,w.n*14),background:i===3?'var(--text-primary)':'var(--color-fossil)'}}/><span style={{fontSize:13,color:i===3?'var(--text-primary)':'var(--text-muted)'}}>{w.d}</span></div>)}</div></section>
        <section><div style={{fontSize:13,color:'var(--text-muted)',borderBottom:'1px solid var(--border-hairline)',paddingBottom:10}}>My projects</div>{SY.projects.filter(p=>p.lead==='Jared').map(p=><a key={p.id} href="#" onClick={e=>{e.preventDefault();onOpenProject(p.id);}} style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,padding:'10px 0',borderBottom:'1px solid var(--border-muted)',color:'var(--text-primary)',fontSize:14}}><span style={{display:'flex',gap:10,alignItems:'center',minWidth:0}}><StatusBadge status={p.status} size="dot"/><span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.name}</span></span><span style={{fontSize:13,color:'var(--text-muted)',whiteSpace:'nowrap'}}>Lead</span></a>)}</section>
        <section><div style={{fontSize:13,color:'var(--text-muted)',borderBottom:'1px solid var(--border-hairline)',paddingBottom:10}}>Waiting on you</div><div style={{padding:'10px 0',borderBottom:'1px solid var(--border-muted)',fontSize:14,lineHeight:1.2}}>Maya asks to approve <TextLink href="#">White oak, rift</TextLink> for Westside.<div style={{fontSize:13,color:'var(--text-muted)',marginTop:5}}>2 days ago</div></div><div style={{padding:'10px 0',borderBottom:'1px solid var(--border-muted)',fontSize:14,lineHeight:1.2}}>Sam mentioned you on <TextLink href="#">Fall merch drop · print run</TextLink>.<div style={{fontSize:13,color:'var(--text-muted)',marginTop:5}}>yesterday</div></div></section>
      </div>
    </div>
  </div>;
}
Object.assign(window,{HomeScreen});