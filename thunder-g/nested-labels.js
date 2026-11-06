/* Hierarchy is encoded in native tag names. Tag keys and assignments never change. */
function nestedLabelTree(tags) {
  const nodes=tags.map(tag=>({tag,path:tag.tag,parent:null,children:[]}));
  const byPath=new Map(nodes.map(node=>[node.path,node]));
  const roots=[];
  for(const node of nodes) {
    let path=node.path;
    while(path.includes('/')) {
      path=path.slice(0,path.lastIndexOf('/'));
      if(byPath.has(path)){node.parent=byPath.get(path);break;}
    }
    (node.parent?node.parent.children:roots).push(node);
  }
  const compare=new Intl.Collator(undefined,{numeric:true}).compare;
  const sort=items=>{items.sort((a,b)=>compare(a.path,b.path));for(const item of items)sort(item.children)};
  sort(roots);return roots;
}
function nestedLabelRows(tags,query='',collapsed=new Set()) {
  const needle=query.trim().normalize('NFKC').toLocaleLowerCase(),rows=[];
  function visit(nodes,depth=0) {
    for(const node of nodes) {
      const match=!needle || node.path.normalize('NFKC').toLocaleLowerCase().includes(needle);
      if(match)rows.push({...node,depth,name:node.parent?node.path.slice(node.parent.path.length+1):node.path});
      // Search reveals matches even when their ancestors are collapsed.
      if(needle || !collapsed.has(node.path))visit(node.children,depth+1);
    }
  }
  visit(nestedLabelTree(tags));return rows;
}
function nestedLabelName(name,parent,tags) {
  name=name.trim();parent=parent || '';
  if(!name || name.split('/').some(part=>!part.trim()))throw new Error(gmText("Enter a label name without empty path segments."));
  if(parent && !tags.some(tag=>tag.tag===parent))throw new Error(gmText("The parent label no longer exists. Choose another label."));
  const path=parent && !name.startsWith(parent+'/')?`${parent}/${name}`:name;
  if(tags.some(tag=>tag.tag.normalize('NFKC').toLocaleLowerCase()===path.normalize('NFKC').toLocaleLowerCase()))throw new Error(gmText("A label with this name already exists."));
  return path;
}
// Visibility propagates upward so shown children retain their parent path.
// A selected label remains accessible even after its last unread message is read.
function sidebarLabelVisibleKeys(nodes,modes,unread,selectedKey=null) {
  const visible=new Set();
  function visit(node){
    const mode=modes.get(node.tag.key) || 'show';
    let childVisible=false;for(const child of node.children)if(visit(child))childVisible=true;
    const show=node.tag.key===selectedKey || mode==='show' || (mode==='unread' && (unread.get(node.tag.key) || 0)>0) || childVisible;
    if(show)visible.add(node.tag.key);return show;
  }
  for(const node of nodes)visit(node);
  return visible;
}
async function countUnreadLabelConversations(folders, keys, pause, isCurrent) {
  const parents=new Map(), tagged=[], unreadIds=[];
  function root(id) {
    while(parents.has(id)){
      const parent=parents.get(id);
      if(parents.has(parent))parents.set(id,parents.get(parent));
      id=parent;
    }
    return id;
  }
  let visited=0;
  for(const folder of folders){
    try {
      if(folder.isServer ||
          folder.isSpecialFolder(Ci.nsMsgFolderFlags.Virtual | Ci.nsMsgFolderFlags.Trash |
            Ci.nsMsgFolderFlags.Junk,false))continue;
      for(const header of folder.messages){
        if(++visited%250===0){
          await pause();
          if(!isCurrent())return null;
        }
        const keywords=(header.getStringProperty('keywords') || '').split(/\s+/);
        if(header.label)keywords.push('$label'+header.label);
        const labels=keywords.filter(key=>keys.has(key));
        if(!labels.length && header.isRead!==false)continue;
        const ids=independentReferenceIds(header).filter(Boolean);
        const id=ids[0] || Symbol();
        for(const related of ids){
          const from=root(related),to=root(id);
          if(from!==to)parents.set(from,to);
        }
        if(labels.length)tagged.push({id,labels});
        if(header.isRead===false)unreadIds.push(id);
      }
    }catch(_){/* Some folders have no available local summary. */}
  }
  const unreadRoots=new Set(unreadIds.map(root));
  const conversations=new Map();
  for(const {id,labels} of tagged){
    if(!unreadRoots.has(root(id)))continue;
    for(const key of labels){
      if(!conversations.has(key))conversations.set(key,new Set());
      conversations.get(key).add(root(id));
    }
  }
  return new Map([...conversations].map(([key,ids])=>[key,ids.size]));
}

function installNestedLabelSidebar(win,mailServices=MailServices,prefs=Services.prefs) {
  const doc=win.document,tree=doc.getElementById('folderTree');
  if(!tree)return {close(){}};
  const visibilityPref='extensions.thunderg.sidebarLabelVisibility';
  const menu=installSidebarLabelMenu(win,mailServices.tags,prefs);
  const saved=new Map(),rowStates=new Map(),vocabulary=new Map(),createButtons=new Map(),uriKeys=new Map(),unread=new Map();
  let closed=false,timer=null,definitionsDirty=true,rowsDirty=true,hierarchy=[],definitions=[],currentList=null,expanded=false,more=null,moreStyle=null;
  let countRevision=0,countTimer=null,counts=null;
  function showCounts(){
    if(!counts)return;
    for(const [key,row] of saved){
      const count=counts.get(key) || 0;
      row.unreadCount=count;
      unread.set(key,count);
    }
  }
  function scheduleCounts(){
    if(closed || !mailServices.accounts)return;
    const revision=++countRevision;
    if(countTimer!==null)win.clearTimeout(countTimer);
    countTimer=win.setTimeout(async()=>{
      countTimer=null;
      if(!saved.size)return;
      const isCurrent=()=>!closed && revision===countRevision;
      try {
        const result=await countUnreadLabelConversations(mailServices.accounts.allFolders,
          new Set(saved.keys()),()=>new Promise(resolve=>win.setTimeout(resolve,0)),isCurrent);
        if(result && isCurrent()){counts=result;showCounts();applyVisibility();}
      }catch(_){/* Account setup can briefly make folder summaries unavailable. */}
    },200);
  }
  function rename(node,text,tooltip=false) {
    if(!node)return;
    const attributes=['data-l10n-id','data-l10n-args','title','aria-label','tooltiptext'];
    if(!vocabulary.has(node))vocabulary.set(node,{text:node.textContent,tooltip,attributes:attributes.map(name=>[name,node.getAttribute(name)])});
    node.removeAttribute('data-l10n-id');node.removeAttribute('data-l10n-args');
    if(tooltip){gmBindAction(node,'title',text,true);gmBindAction(node,'tooltiptext',text,true);gmBindAction(node,'aria-label',text,true);}
    else if(node.textContent!==text)gmBindAction(node,'textContent',text);
  }
  function ensureMore(mode){
    if(!more){
      more=doc.createElement('button');more.type='button';more.className='gm-sidebar-more';more.hidden=true;
      more.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();expanded=!expanded;applyVisibility();});
      // Keep native tree keyboard navigation from treating this as a folder.
      more.addEventListener('keydown',event=>event.stopPropagation());
      moreStyle=doc.createElement('style');moreStyle.textContent=`
        #folderTree [data-gm-nested-label] .total-count{display:none!important}
        #folderTree .gm-sidebar-hidden{display:none!important}
        .gm-sidebar-more[hidden],[data-mode=tags].collapsed > .gm-sidebar-more{display:none!important}
        .gm-sidebar-more{display:flex;align-items:center;gap:16px;width:100%;padding:6px 18px;border:0;border-radius:20px;background:transparent;color:inherit;text-align:start;font:inherit;cursor:pointer}
        .gm-sidebar-more:hover{background:var(--treeitem-background-hover,#e9eef6)}
        .gm-sidebar-more:focus-visible{outline:2px solid var(--focus-outline-color,#1a73e8);outline-offset:-2px}
      `;doc.head.append(moreStyle);
    }
    if(more.parentNode!==mode.container)mode.container.append(more);
  }
  function applyVisibility(){
    if(closed || !currentList?.isConnected)return;
    const selectedKey=tree.selectedRow?.dataset?.tagKey || uriKeys.get(win.gFolder?.URI);
    const visible=sidebarLabelVisibleKeys(hierarchy,sidebarLabelModes(prefs),unread,selectedKey);
    let hiddenCount=0;
    for(const [key,row] of saved){
      const suppressed=!visible.has(key);if(suppressed)hiddenCount++;
      const hide=suppressed && !expanded;
      if(!rowStates.has(row))rowStates.set(row,{unselectable:row.classList.contains('unselectable'),aria:row.getAttribute('aria-hidden')});
      row.classList.toggle('gm-sidebar-hidden',hide);
      // Thunderbird's keyboard row list explicitly skips unselectable rows.
      row.classList.toggle('unselectable',hide || rowStates.get(row).unselectable);
      if(hide){if(row.getAttribute('aria-hidden')!=='true')row.setAttribute('aria-hidden','true');}
      else {const original=rowStates.get(row).aria;if(original===null)row.removeAttribute('aria-hidden');else row.setAttribute('aria-hidden',original);}
    }
    if(!more)return;
    if(!hiddenCount)expanded=false;
    more.hidden=hiddenCount===0;
    const label=expanded?gmText("Less"):gmText("More");
    const text=`${expanded?'⌃':'⌄'}  ${label}`;
    gmBindValue(more,'textContent',()=>`${expanded?'⌃':'⌄'}  ${gmText(expanded?'Less':'More')}`);
    gmBindAttribute(more, 'aria-label', () => expanded?gmText("Show fewer labels"):gmText("Show more labels"));more.setAttribute('aria-expanded',String(expanded));
  }
  function refresh(){
    timer=null;if(closed)return;
    const mode=win.folderPane?._modes?.tags;
    rename(mode?.containerHeader?.querySelector('.mode-name'),gmText("Labels"));
    const createButton=mode?.container?.querySelector('.mode-button');rename(createButton,gmText("Create new label"),true);
    if(createButton && !createButtons.has(createButton)){
      const createLabel=event=>{const handled=!win.dispatchEvent(new win.CustomEvent('gm-create-sidebar-label',{cancelable:true,detail:{anchor:createButton}}));if(handled){event.preventDefault();event.stopImmediatePropagation();}};
      createButton.addEventListener('click',createLabel,true);createButtons.set(createButton,createLabel);
    }
    for(const [node] of vocabulary)if(node.isConnected===false)vocabulary.delete(node);
    for(const [button,handler] of createButtons)if(button.isConnected===false){button.removeEventListener('click',handler,true);createButtons.delete(button);}
    const list=mode?.containerList;
    if(!list?.isConnected){
      if(currentList && !currentList.isConnected){saved.clear();rowStates.clear();uriKeys.clear();unread.clear();currentList=null;rowsDirty=true;more?.remove();menu.prune?.();}
      return;
    }
    if(currentList!==list){currentList=list;rowsDirty=true;}
    if(definitionsDirty){definitions=mailServices.tags.getAllTags();hierarchy=nestedLabelTree(definitions);definitionsDirty=false;rowsDirty=true;}
    if(rowsDirty){
      const previousKeys=new Set(saved.keys());
      const keys=new Set(definitions.map(tag=>tag.key));
      saved.clear();
      for(const row of list.querySelectorAll('[data-tag-key]'))saved.set(row.dataset.tagKey,row);
      for(const [key,row] of saved)if(!keys.has(key)){saved.delete(key);rowStates.delete(row);unread.delete(key);}
      const currentRows=new Set(saved.values());for(const [row] of rowStates)if(!currentRows.has(row))rowStates.delete(row);
      uriKeys.clear();
      for(const [key,row] of saved){if(row.uri)uriKeys.set(row.uri,key);unread.set(key,Math.max(0,row.unreadCount || 0));}
      observer.disconnect();
      function place(nodes,container){nodes.forEach((node,index)=>{
        const row=saved.get(node.tag.key);if(!row)return;
        if(container.children[index]!==row)container.insertBefore(row,container.children[index] || null);
        const name=node.parent?node.path.slice(node.parent.path.length+1):node.path;
        if(row.name!==name)row.name=name;if(row.fullName!==node.path)row.fullName=node.path;
        row.dataset.gmNestedLabel='true';menu.decorate(row,node.tag);place(node.children,row.childList);
      });}
      try{place(hierarchy,list);rowsDirty=false;}finally{observer.observe(tree,{childList:true,subtree:true});}
      menu.prune?.();
      if(previousKeys.size!==saved.size || [...saved.keys()].some(key=>!previousKeys.has(key)))scheduleCounts();
    }
    ensureMore(mode);showCounts();applyVisibility();
    for(const [node] of vocabulary)if(node.isConnected===false)vocabulary.delete(node);
    for(const [button,handler] of createButtons)if(button.isConnected===false){button.removeEventListener('click',handler,true);createButtons.delete(button);}
  }
  function schedule(){if(!closed && timer===null)timer=win.setTimeout(refresh,0);}
  const observer=new win.MutationObserver(records=>{
    let relevant=false;
    for(const record of records){
      if(record.target?.closest?.('[data-tag-key]'))rowsDirty=true;
      if(record.target===tree || record.target?.closest?.('[data-mode="tags"]'))relevant=true;
      for(const node of [...(record.addedNodes || []),...(record.removedNodes || [])]){
        if(node.matches?.('[data-tag-key],[data-mode="tags"]') || node.querySelector?.('[data-tag-key]')){rowsDirty=true;relevant=true;}
      }
    }
    if(relevant)schedule();
  });observer.observe(tree,{childList:true,subtree:true});
  const prefObserver={observe(_subject,_topic,name){if(name?.startsWith('mailnews.tags.'))definitionsDirty=true;schedule();}};
  prefs.addObserver('mailnews.tags.',prefObserver);prefs.addObserver(visibilityPref,prefObserver);
  const folderListener={onFolderIntPropertyChanged(folder,property,oldValue,newValue){
    if(oldValue===newValue || !['TotalUnreadMessages','TotalMessages'].includes(property))return;
    scheduleCounts();
    if(property!=='TotalUnreadMessages')return;
    const key=uriKeys.get(folder.URI);if(!key)return;
    unread.set(key,Math.max(0,newValue));schedule();
  }};
  const folderFlag=typeof Ci==='undefined'?null:Ci.nsIFolderListener?.intPropertyChanged;
  if(folderFlag!=null)mailServices.mailSession?.AddFolderListener(folderListener,folderFlag);
  const keywordListener={msgPropertyChanged(_header,property){
    if(property==='keywords' || property==='label')scheduleCounts();
  }};
  const propertyFlag=typeof Ci==='undefined'?null:Ci.nsIMsgFolderNotificationService?.msgPropertyChanged;
  if(propertyFlag!=null)mailServices.mfn?.addListener(keywordListener,propertyFlag);
  tree.addEventListener?.('select',schedule);schedule();
  return {refresh(){definitionsDirty=true;rowsDirty=true;schedule();},close(){
    closed=true;if(countTimer!==null)win.clearTimeout(countTimer);observer.disconnect();menu.close();prefs.removeObserver('mailnews.tags.',prefObserver);prefs.removeObserver(visibilityPref,prefObserver);
    if(folderFlag!=null)mailServices.mailSession?.RemoveFolderListener(folderListener);
    if(propertyFlag!=null)mailServices.mfn?.removeListener(keywordListener);
    tree.removeEventListener?.('select',schedule);if(timer!==null)win.clearTimeout(timer);
    more?.remove();moreStyle?.remove();
    for(const [row,state] of rowStates){row.classList.remove('gm-sidebar-hidden');row.classList.toggle('unselectable',state.unselectable);if(state.aria===null)row.removeAttribute('aria-hidden');else row.setAttribute('aria-hidden',state.aria);}
    const list=win.folderPane?._modes?.tags?.containerList;
    if(list?.isConnected)for(const tag of mailServices.tags.getAllTags()){const row=saved.get(tag.key);if(!row)continue;list.append(row);row.name=tag.tag;row.fullName=tag.tag;delete row.dataset.gmNestedLabel;if(counts && row.folder)row.unreadCount=row.folder.getNumUnread(row.classList.contains('collapsed'));}
    for(const [node,previous] of vocabulary){if(!previous.tooltip)node.textContent=previous.text;for(const [name,value] of previous.attributes){if(value===null)node.removeAttribute(name);else node.setAttribute(name,value);}}
    for(const [button,handler] of createButtons)button.removeEventListener('click',handler,true);
    createButtons.clear();vocabulary.clear();saved.clear();rowStates.clear();uriKeys.clear();unread.clear();hierarchy=[];definitions=[];
  }};
}
