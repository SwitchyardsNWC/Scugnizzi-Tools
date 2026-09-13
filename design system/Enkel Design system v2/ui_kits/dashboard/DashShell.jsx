const { AppShell, ShellHeader, TopBar, BottomTabs, Wordmark, SidebarNav, ThemeToggle, FilterBar, Segmented, Breadcrumb, EmptyState } = window.ArtVentoryDesignSystem_f8dda9;
const DASH_SECTIONS=[{id:'overview',label:'Overview'},{id:'clubs',label:'Clubs'},{id:'projects',label:'Projects'},{id:'warehouse',label:'Warehouse'},{id:'signage',label:'Signage'},{id:'team',label:'Team'}];
const fmtK=n=>n>=1e6?'$'+(n/1e6).toFixed(2)+'M':n>=1000?'$'+Math.round(n/1000)+'k':'$'+n;
const fmtMoney=n=>'$'+n.toLocaleString();
function DashShell({ section, onSection, children, drawer, onCloseDrawer, header, width='full' }) {
  const label=(DASH_SECTIONS.find(s=>s.id===section)||{}).label;
  return <AppShell width={width} ground="sunken" header={header}
    rail={<><Wordmark name="switchyards" href="#" onClick={e=>{e.preventDefault();onSection('overview');}}/><SidebarNav items={DASH_SECTIONS} activeId={section} onSelect={onSection}/><div style={{marginTop:'auto',fontSize:13,letterSpacing:'0.143px',display:'flex',flexDirection:'column',gap:12}}><ThemeToggle/><div style={{display:'flex',flexDirection:'column',gap:2}}><span>{DASH.user.name}</span><span style={{color:'var(--text-muted)'}}>{DASH.user.role} · {DASH.user.market}</span></div></div></>}
    top={<TopBar title={label}/>} tabs={<BottomTabs items={DASH_SECTIONS.slice(0,4)} activeId={section} onSelect={onSection}/>}
    drawer={drawer} drawerTitle={label} onDrawerClose={onCloseDrawer}>{children}</AppShell>;
}
/* Header = title row + optional filter row, both static above the scrolling main. */
function DashHeader({ title, kicker, crumbs, actions, filters, summary }) {
  return <div>
    {crumbs?<div style={{padding:'10px 24px 0'}}><Breadcrumb items={crumbs}/></div>:null}
    <ShellHeader title={title} kicker={crumbs?undefined:kicker} actions={actions} style={{padding:crumbs?'2px 24px 8px':'8px 24px',minHeight:crumbs?44:56}}/>
    {filters?<FilterBar summary={summary} style={{padding:'6px 24px 10px',borderTop:'1px solid var(--border-muted)'}}>{filters}</FilterBar>:null}
  </div>;
}
function NotBuilt({ what }) { return <EmptyState what={what+' — not built in this pass.'} compact/>; }
Object.assign(window,{DashShell,DashHeader,NotBuilt,DASH_SECTIONS,fmtK,fmtMoney});
