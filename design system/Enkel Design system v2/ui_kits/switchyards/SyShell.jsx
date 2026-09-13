const { AppShell, ShellHeader, TopBar, BottomTabs, Wordmark, SidebarNav } = window.ArtVentoryDesignSystem_f8dda9;
const SY_SECTIONS=[{id:'home',label:'My work'},{id:'projects',label:'Projects'},{id:'checklist',label:'Checklist'},{id:'schedule',label:'Schedule'},{id:'warehouse',label:'Warehouse'},{id:'library',label:'Library'},{id:'templates',label:'Templates'}];
function SyShell({ section, onSection, children, panel, onClosePanel, width='page', header }) {
  const label=(SY_SECTIONS.find(s=>s.id===section)||{}).label;
  return <AppShell width={width} header={header}
    rail={<><Wordmark name="switchyards" href="#" onClick={e=>{e.preventDefault();onSection('home');}}/><SidebarNav items={SY_SECTIONS} activeId={section} onSelect={onSection}/><div style={{marginTop:'auto',fontSize:13,letterSpacing:'0.143px',display:'flex',flexDirection:'column',gap:5}}><span>{SY.user.name}</span><span style={{color:'var(--text-muted)'}}>{SY.user.role} · {SY.user.market}</span></div></>}
    top={<TopBar title={label}/>} tabs={<BottomTabs items={SY_SECTIONS.slice(0,4)} activeId={section} onSelect={onSection}/>}
    drawer={panel} drawerTitle={label} onDrawerClose={onClosePanel}
    style={{fontFamily:'var(--font-helveticaneue)'}}>{children}</AppShell>;
}
function PageHead({ kicker, title, actions, children }) {
  return <div style={{display:'flex',flexDirection:'column',gap:21,marginBottom:42}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',gap:21}}><div style={{display:'flex',flexDirection:'column',gap:10}}>{kicker?<span style={{fontSize:13,letterSpacing:'0.143px',color:'var(--text-muted)'}}>{kicker}</span>:null}<h1 style={{margin:0,fontSize:40,lineHeight:1,letterSpacing:'0.44px',fontWeight:400}}>{title}</h1></div>{actions?<div style={{display:'flex',gap:10}}>{actions}</div>:null}</div>{children}</div>;
}
function useWide(min=1100){const [w,setW]=React.useState(window.innerWidth);React.useEffect(()=>{const f=()=>setW(window.innerWidth);window.addEventListener('resize',f);return()=>window.removeEventListener('resize',f);},[]);return w>=min;}
Object.assign(window,{SyShell,PageHead,useWide,SY_SECTIONS});
