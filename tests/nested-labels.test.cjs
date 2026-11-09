const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const scope=require('./localization-context.cjs').createContext({});vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/nested-labels.js'),'utf8'),scope);
const tags=['Other','Work/PhD/Project','Work','Work/PhD','Workshops/2026','Work/Teaching'].map((tag,i)=>({key:`key${i}`,tag}));
test('hierarchy uses whole path segments and preserves native keys and full paths',()=>{
 const rows=scope.nestedLabelRows(tags);
 assert.deepEqual(Array.from(rows,r=>[r.path,r.depth,r.name]),[
  ['Other',0,'Other'],['Work',0,'Work'],['Work/PhD',1,'PhD'],['Work/PhD/Project',2,'Project'],['Work/Teaching',1,'Teaching'],['Workshops/2026',0,'Workshops/2026']]);
 assert.equal(rows.find(r=>r.path==='Work/PhD/Project').tag,tags[1]);
 assert.equal(scope.nestedLabelRows(tags,'',new Set(['Work'])).length,3);
 assert.deepEqual(Array.from(scope.nestedLabelRows(tags,'project',new Set(['Work'])),r=>r.path),['Work/PhD/Project']);
 assert.equal(scope.nestedLabelRows(tags,'WORK/PHD').length,2);
});
test('nested creation validates duplicates, missing parents and empty segments without changing tags',()=>{
 assert.equal(scope.nestedLabelName('  New project  ','Work/PhD',tags),'Work/PhD/New project');
 assert.equal(scope.nestedLabelName('Loose/Path','',tags),'Loose/Path');
 assert.throws(()=>scope.nestedLabelName('','Work',tags),/label name/);
 assert.throws(()=>scope.nestedLabelName('A//B','Work',tags),/empty path/);
 assert.throws(()=>scope.nestedLabelName('project','Work/PhD',tags),/already exists/);
 assert.throws(()=>scope.nestedLabelName('Child','Deleted',tags),/no longer exists/);
 assert.equal(tags.length,6);
});

test('a full path under the selected parent is used as entered',()=>{
 assert.equal(scope.nestedLabelName('Work/PhD/New project','Work/PhD',tags),'Work/PhD/New project');
 assert.throws(()=>scope.nestedLabelName('Work/PhD/Project','Work/PhD',tags),/already exists/);
});

test('sidebar visibility keeps parent paths and selected labels reachable',()=>{
 const definitions=[{key:'p',tag:'Parent',color:'#00aabb'},{key:'c',tag:'Parent/Child',color:''},{key:'u',tag:'Unread'},{key:'s',tag:'Shown'}];
 const tree=scope.nestedLabelTree(definitions),modes=new Map([['p','hide'],['c','hide'],['u','unread']]);
 assert.deepEqual([...scope.sidebarLabelVisibleKeys(tree,modes,new Map())],['s']);
 modes.set('c','show');const visible=scope.sidebarLabelVisibleKeys(tree,modes,new Map([['u',2]]));
 assert.equal(visible.has('p'),true);assert.equal(visible.has('c'),true);assert.equal(visible.has('u'),true);
 modes.set('c','hide');assert.equal(scope.sidebarLabelVisibleKeys(tree,modes,new Map(),'u').has('u'),true);
});
test('More/Less uses native unread notifications without rebuilding definitions and restores native rows',()=>{
 function node(){
  const attrs=new Map(),classes=new Set();
  return {children:[],dataset:{},events:{},isConnected:true,hidden:false,textContent:'',
   classList:{contains:value=>classes.has(value),add:value=>classes.add(value),remove:value=>classes.delete(value),toggle(value,on){if(on)classes.add(value);else classes.delete(value)}},
   append(item){if(item.parentNode)item.parentNode.children=item.parentNode.children.filter(child=>child!==item);item.parentNode=this;this.children.push(item);item.isConnected=true},
   insertBefore(item,before){if(item===before)return;if(item.parentNode)item.parentNode.children=item.parentNode.children.filter(child=>child!==item);item.parentNode=this;const i=this.children.indexOf(before);this.children.splice(i<0?this.children.length:i,0,item)},
   remove(){this.isConnected=false;if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(child=>child!==this)},
   setAttribute:(key,value)=>attrs.set(key,value),getAttribute:key=>attrs.get(key)??null,removeAttribute:key=>attrs.delete(key),
   addEventListener(name,fn){this.events[name]=fn},removeEventListener(name){delete this.events[name]},
   querySelectorAll(){return this.children.flatMap(child=>[...(child.dataset.tagKey?[child]:[]),...child.querySelectorAll()])},querySelector(){return this.querySelectorAll()[0] || null}};
 }
 const definitions=[{key:'p',tag:'Parent',color:'#00aabb'},{key:'c',tag:'Parent/Child',color:''},{key:'u',tag:'Unread'},{key:'s',tag:'Shown'}];
 const list=node(),container=node(),header=node(),name=node(),create=node(),tree=node(),head=node();container.append(header);container.append(list);
 header.querySelector=()=>name;container.querySelector=()=>create;
 const rows=new Map(definitions.map(tag=>{const row=node();row.dataset.tagKey=tag.key;row.uri='tag://'+tag.key;row.unreadCount=0;row.childList=node();row.append(row.childList);list.append(row);return [tag.key,row]}));
 const values=new Map([['extensions.thunderg.sidebarLabelVisibility','{"p":"hide","c":"hide","u":"unread"}']]),prefListeners=new Map();
 const prefs={getStringPref:(key,fallback)=>values.get(key)??fallback,setStringPref(key,value){values.set(key,value);prefListeners.get(key)?.observe(null,'nsPref:changed',key)},addObserver:(key,value)=>prefListeners.set(key,value),removeObserver:key=>prefListeners.delete(key)};
 const timers=new Map();let seq=0,reads=0,folderListener,removed=false;
 const services={tags:{getAllTags(){reads++;return definitions}},mailSession:{AddFolderListener(listener){folderListener=listener},RemoveFolderListener(listener){assert.equal(listener,folderListener);removed=true}}};
 const win={document:{head,getElementById:()=>tree,createElement:node},folderPane:{_modes:{tags:{container,containerHeader:header,containerList:list}}},
  MutationObserver:class{observe(){}disconnect(){}},setTimeout(fn){timers.set(++seq,fn);return seq},clearTimeout:id=>timers.delete(id)};
 const local=require('./localization-context.cjs').createContext({Ci:{nsIFolderListener:{intPropertyChanged:1}}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/label-menu.js'),'utf8'),local);
 local.installSidebarLabelMenu=()=>({decorate(){},close(){},prune(){}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/nested-labels.js'),'utf8'),local);
 const controller=local.installNestedLabelSidebar(win,services,prefs);
 const flush=()=>{const pending=[...timers.values()];timers.clear();for(const fn of pending)fn()};flush();
 assert.equal(rows.get('p').dataset.gmUncoloredLabel,'false','explicit parent color stays intact');
 assert.equal(rows.get('c').dataset.gmUncoloredLabel,'true','new uncolored sublabels use the gray icon fallback');
 assert.equal(rows.get('u').dataset.gmUncoloredLabel,'true','missing color also uses gray');
 assert.equal(definitions[1].color,'','presentation does not rewrite stored colors');
 definitions[1].color='#cc33aa';controller.refresh();flush();
 assert.equal(rows.get('c').dataset.gmUncoloredLabel,'false','choosing a color restores native explicit-color rendering');
 definitions[1].color='';controller.refresh();flush();
 assert.equal(rows.get('c').dataset.gmUncoloredLabel,'true','Remove color returns the icon to gray');
 const more=container.children.at(-1),event={preventDefault(){},stopPropagation(){}};
 assert.equal(rows.get('p').classList.contains('gm-sidebar-hidden'),true);assert.equal(rows.get('u').classList.contains('unselectable'),true);
 assert.equal(more.hidden,false);assert.match(more.textContent,/More/);more.events.click(event);
 assert.equal(rows.get('u').classList.contains('gm-sidebar-hidden'),false);assert.match(more.textContent,/Less/);
 more.events.click(event);const initialReads=reads;
 folderListener.onFolderIntPropertyChanged({URI:'tag://u'},'TotalUnreadMessages',0,2);
 folderListener.onFolderIntPropertyChanged({URI:'tag://u'},'TotalUnreadMessages',2,3);assert.equal(timers.size,1);flush();
 assert.equal(rows.get('u').classList.contains('gm-sidebar-hidden'),false);assert.equal(reads,initialReads,'unread updates do not reload/sort label definitions');
 tree.selectedRow=rows.get('u');folderListener.onFolderIntPropertyChanged({URI:'tag://u'},'TotalUnreadMessages',3,0);flush();
 assert.equal(rows.get('u').classList.contains('gm-sidebar-hidden'),false,'selected label remains reachable');
 tree.selectedRow=null;tree.events.select();flush();assert.equal(rows.get('u').classList.contains('gm-sidebar-hidden'),true);
 controller.close();assert.equal(removed,true);assert.equal(prefListeners.size,0);assert.equal(more.isConnected,false);
 for(const row of rows.values()){assert.equal(row.dataset.gmUncoloredLabel,undefined,'disable removes the color override marker');assert.equal(row.classList.contains('gm-sidebar-hidden'),false);assert.equal(row.classList.contains('unselectable'),false)}
});


test('uncolored sidebar icons override native pink while message chips retain the neutral palette',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../chrome/gmail-columns.css'),'utf8');
 assert.match(css,/#folderTree \[data-gm-uncolored-label="true"\] > \.container > \.icon\s*\{[^}]*--icon-color: #5f6368 !important;/);
 const colors=require('./localization-context.cjs').createContext({});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/labels.js'),'utf8'),colors);
 assert.deepEqual(colors.chipColors(''),colors.chipColors('#80868b'));
});
