function SyApp(){
  const [section,setSection]=React.useState('home');
  const [tasks,setTasks]=React.useState(SY.tasks);
  const [checklist,setChecklist]=React.useState(SY.checklist);
  const [sel,setSel]=React.useState(null);
  const project=SY.projects[0];
  const go=s=>{setSection(s);setSel(null);};
  const toggleItem=id=>setChecklist(checklist.map(g=>({...g,items:g.items.map(i=>i.id===id&&!(i.required&&!i.lives&&!i.done)?{...i,done:!i.done}:i)})));
  const linkItem=id=>setChecklist(checklist.map(g=>({...g,items:g.items.map(i=>i.id===id?{...i,lives:{kind:'frame',label:i.title+' (board)'}}:i)})));
  const flat=checklist.flatMap(g=>g.items.map(i=>({...i,phase:g.phase})));
  let body,panel=null;
  if(section==='home') body=<HomeScreen tasks={tasks} onToggle={id=>setTasks(tasks.map(t=>t.id===id?{...t,done:!t.done}:t))} onOpenProject={()=>go('projects')}/>;
  else if(section==='projects'){body=<ProjectsScreen selected={sel} onSelect={setSel} onOpen={()=>go('checklist')}/>; if(sel) panel=<ProjectPanel id={sel} onClose={()=>setSel(null)} onOpen={()=>go('checklist')}/>;}
  else if(section==='checklist'){body=<ChecklistScreen items={checklist} onToggle={toggleItem} selected={sel} onSelect={setSel} project={project}/>; if(sel) panel=<ItemPanel item={flat.find(i=>i.id===sel)} onClose={()=>setSel(null)} onToggle={toggleItem} onLink={linkItem}/>;}
  else if(section==='schedule'){body=<ScheduleScreen selected={sel} onSelect={setSel} project={project}/>; if(sel) panel=<RowPanel id={sel} onClose={()=>setSel(null)}/>;}
  else body=<div><PageHead title={{warehouse:'Warehouse',library:'Library',templates:'Templates'}[section]}/><div style={{border:'1px dashed var(--border-muted)',padding:42,fontSize:13,color:'var(--text-muted)'}}>Described in FEATURES.md — not yet built this pass.</div></div>;
  const full=section==='projects'||section==='schedule';
  return <SyShell section={section} onSection={go} panel={panel} onClosePanel={()=>setSel(null)} width={full?'full':'page'}>{body}</SyShell>;
}
ReactDOM.createRoot(document.getElementById('root')).render(<SyApp/>);