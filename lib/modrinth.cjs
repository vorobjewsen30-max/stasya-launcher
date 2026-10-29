// Modrinth supplies exact version pins and project-only dependencies. Resolve
// the complete required graph before downloading or modifying instance files.
function modFile(version) {
  const files=(version.files || []).filter(f=>/\.jar$/i.test(f.filename || '') && !/^(sources-jar|dev-jar|javadoc-jar|signature)$/.test(f.file_type || ''));
  return files.find(f=>f.primary) || files[0];
}
function artifactFile(version,kind='mod') {
  if(kind==='mod')return modFile(version);
  const files=(version.files || []).filter(f=>/\.zip$/i.test(f.filename || ''));
  return files.find(f=>f.primary) || files[0];
}
function compatible(version,instance,kind='mod') {
  return version.game_versions?.includes(instance.minecraft) && (kind!=='mod' || version.loaders?.includes(instance.loader)) && !['server_only','dedicated_server_only'].includes(version.environment);
}
function newestFirst(versions) {
  return [...versions].sort((a,b)=>(Date.parse(b.date_published)||0)-(Date.parse(a.date_published)||0) || String(b.id).localeCompare(String(a.id)));
}
function availableMods(versions,instance,kind='mod') {
  return newestFirst(versions.filter(v=>compatible(v,instance,kind) && artifactFile(v,kind) && !['draft','scheduled','unknown','archived'].includes(v.status)));
}
async function resolveMods(root,instance,{projectVersions,getVersion,getProjectType,kind='mod',progress=()=>{}}) {
  if(!compatible(root,instance,kind) || !artifactFile(root,kind))throw new Error('Проект не совместим с версией Minecraft и загрузчиком выбранной сборки');
  const projects=new Map(),versions=new Map([[root.id,Promise.resolve(root)]]);
  const kinds=new Map([[root.project_id,Promise.resolve(kind)]]);
  const projectKind=id=>{if(!kinds.has(id))kinds.set(id,getProjectType?Promise.resolve().then(()=>getProjectType(id)):Promise.resolve('mod'));return kinds.get(id);};
  const version=id=>{if(!versions.has(id))versions.set(id,Promise.resolve().then(()=>getVersion(id)));return versions.get(id);};
  const candidates=async id=>{const type=await projectKind(id);if(!projects.has(id))projects.set(id,Promise.resolve().then(()=>projectVersions(id,type)).then(v=>availableMods(v,instance,type)));return projects.get(id);};
  let attempts=0,lastError='Не удалось согласовать версии зависимостей';
  const conflicts=(assigned,forbidden)=>forbidden.some(d=>assigned.has(d.project) && (!d.version || assigned.get(d.project).id===d.version));
  async function solve(assigned,requirements,forbidden) {
    if(++attempts>500 || requirements.size>150)throw new Error('Слишком сложное дерево зависимостей: установка отменена без изменения модов');
    if(conflicts(assigned,forbidden))return null;
    for(const [id,pin]of requirements)if(pin && assigned.has(id) && assigned.get(id).id!==pin)return null;
    const missing=[...requirements].filter(([id])=>!assigned.has(id)).sort((a,b)=>Number(!!b[1])-Number(!!a[1]));
    if(!missing.length)return assigned;
    const [id,pin]=missing[0];
    const choices=pin?[await version(pin)]:await candidates(id);
    if(!choices.length)lastError='Не найдена совместимая обязательная зависимость: '+id;
    for(const current of choices) {
      const type=await projectKind(id);if(!['mod','resourcepack','shader'].includes(type))throw new Error('Неизвестный тип обязательной зависимости: '+type);
      if(current.project_id!==id || !compatible(current,instance,type) || !artifactFile(current,type)) {lastError='Несовместимая обязательная зависимость: '+(current.name || id);continue;}
      const next=new Map(assigned).set(id,current),required=new Map(requirements),blocked=[...forbidden];let invalid=false;
      progress({phase:'Подбираем моды и зависимости',detail:current.name || id});
      for(const dep of current.dependencies || []) {
        if(!['required','incompatible'].includes(dep.dependency_type))continue;
        const pinned=dep.version_id?await version(dep.version_id):null;
        const depProject=pinned?.project_id || dep.project_id;
        if(!depProject) {if(dep.dependency_type==='required')throw new Error('Modrinth не указал проект обязательной зависимости: '+(dep.file_name || current.name));continue;}
        if(pinned && dep.project_id && pinned.project_id!==dep.project_id)throw new Error('Некорректный проект зависимости в Modrinth');
        if(dep.dependency_type==='incompatible'){blocked.push({project:depProject,version:dep.version_id || null});continue;}
        const existing=required.get(depProject);
        if(existing && dep.version_id && existing!==dep.version_id){lastError='Конфликт обязательных версий зависимости: '+depProject;invalid=true;break;}
        required.set(depProject,dep.version_id || existing || null);
      }
      if(invalid)continue;
      const result=await solve(next,required,blocked);if(result)return result;
    }
    return null;
  }
  const plan=await solve(new Map(),new Map([[root.project_id,root.id]]),[]);
  if(!plan)throw new Error(lastError+'. Сборка не изменена.');
  for(const [id,v]of plan)plan.set(id,{...v,contentType:await projectKind(id)});
  return plan;
}
module.exports={modFile,artifactFile,compatible,newestFirst,availableMods,resolveMods};
