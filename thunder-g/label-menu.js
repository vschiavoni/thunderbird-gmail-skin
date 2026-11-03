const HIDDEN_MESSAGE_LABELS_PREF='extensions.thunderg.hiddenMessageLabels';
function hiddenMessageLabelKeys(prefs) {
  try {const value=JSON.parse(prefs?.getStringPref(HIDDEN_MESSAGE_LABELS_PREF,'[]') || '[]');return new Set(Array.isArray(value)?value.filter(key=>typeof key==='string'):[]);}catch(_){return new Set();}
}
const SIDEBAR_LABEL_VISIBILITY_PREF='extensions.thunderg.sidebarLabelVisibility';
function sidebarLabelModes(prefs) {
  try{
    const value=JSON.parse(prefs?.getStringPref(SIDEBAR_LABEL_VISIBILITY_PREF,'{}') || '{}');
    if(!value || Array.isArray(value) || typeof value!=='object')return new Map();
    return new Map(Object.entries(value).filter(([key,mode])=>key && ['hide','unread'].includes(mode)));
  }catch(_){return new Map();}
}
function setSidebarLabelMode(prefs,key,mode) {
  if(!['show','hide','unread'].includes(mode))throw new Error(gmText("Unknown label visibility."));
  const modes=sidebarLabelModes(prefs);
  if(mode==='show')modes.delete(key);else modes.set(key,mode);
  prefs.setStringPref(SIDEBAR_LABEL_VISIBILITY_PREF,JSON.stringify(Object.fromEntries(modes)));
}
function labelRenamePlan(tags,key,path) {
  const original=tags.find(tag=>tag.key===key);if(!original)throw new Error(gmText("This label no longer exists."));
  path=path.trim();if(!path || path.split('/').some(part=>!part.trim()))throw new Error(gmText("Enter a name without empty path segments."));
  if(path.startsWith(original.tag+'/'))throw new Error(gmText("A label cannot be nested under itself."));
  const plan=tags.filter(tag=>tag.key===key || tag.tag.startsWith(original.tag+'/')).map(tag=>({key:tag.key,before:tag.tag,after:path+tag.tag.slice(original.tag.length)}));
  const moved=new Set(plan.map(item=>item.key));
  const occupied=new Set(tags.filter(tag=>!moved.has(tag.key)).map(tag=>tag.tag.normalize('NFKC').toLocaleLowerCase()));
  for(const item of plan){const name=item.after.normalize('NFKC').toLocaleLowerCase();if(occupied.has(name))throw new Error(gmText("A label with that path already exists."));occupied.add(name);}
  return plan;
}
function renameNativeLabel(tags,key,path,service) {
  const plan=labelRenamePlan(tags,key,path),done=[];
  try{for(const item of plan){service.setTagForKey(item.key,item.after);done.push(item);}}
  catch(error){for(const item of done.reverse())service.setTagForKey(item.key,item.before);throw error;}
  return plan;
}
// Plan all moves before writing. Selected descendants travel with their selected
// ancestor once; stable tag keys keep every existing message assignment intact.
function bulkLabelMovePlan(tags,keys,parentKey) {
  const selected=new Set(keys),items=tags.filter(tag=>selected.has(tag.key));
  if(!items.length || items.length!==selected.size)throw new Error(gmText("A selected label no longer exists."));
  if(parentKey===undefined)return [];
  const parent=parentKey===null?null:tags.find(tag=>tag.key===parentKey);
  if(parentKey!==null && !parent)throw new Error(gmText("The parent label no longer exists."));
  const roots=items.filter(item=>!items.some(other=>other!==item && item.tag.startsWith(other.tag+'/')));
  if(parent && roots.some(root=>parent.tag===root.tag || parent.tag.startsWith(root.tag+'/')))
    throw new Error(gmText("A label cannot be nested under itself or its descendants."));
  const plan=[];
  for(const root of roots){
    const path=(parent?parent.tag+'/':'')+root.tag.split('/').at(-1);
    for(const tag of tags)if(tag.key===root.key || tag.tag.startsWith(root.tag+'/'))
      plan.push({key:tag.key,before:tag.tag,after:path+tag.tag.slice(root.tag.length)});
  }
  const moved=new Set(plan.map(item=>item.key));
  const names=new Set(tags.filter(tag=>!moved.has(tag.key)).map(tag=>tag.tag.normalize('NFKC').toLocaleLowerCase()));
  for(const item of plan){const name=item.after.normalize('NFKC').toLocaleLowerCase();if(names.has(name))throw new Error(gmText("A label with that path already exists."));names.add(name);}
  return plan.filter(item=>item.before!==item.after);
}
function applyBulkLabelChanges(service,prefs,keys,changes) {
  const tags=service.getAllTags(),selected=new Set(keys),items=tags.filter(tag=>selected.has(tag.key));
  const plan=bulkLabelMovePlan(tags,keys,changes.parentKey);
  if(changes.color!==undefined && changes.color!=='' && !/^#[0-9a-f]{6}$/i.test(changes.color))throw new Error(gmText("Choose a valid label color."));
  if(changes.sidebar!==undefined && !['show','unread','hide'].includes(changes.sidebar))throw new Error(gmText("Unknown label visibility."));
  const undo=[];
  function write(action,rollback){undo.push(rollback);action();}
  try{
    for(const item of plan)write(()=>service.setTagForKey(item.key,item.after),()=>service.setTagForKey(item.key,item.before));
    if(changes.color!==undefined)for(const item of items)
      write(()=>service.setColorForKey(item.key,changes.color),()=>service.setColorForKey(item.key,item.color || ''));
    if(changes.sidebar!==undefined){
      const before=prefs.getStringPref(SIDEBAR_LABEL_VISIBILITY_PREF,'{}'),modes=sidebarLabelModes(prefs);
      for(const key of selected){if(changes.sidebar==='show')modes.delete(key);else modes.set(key,changes.sidebar);}
      write(()=>prefs.setStringPref(SIDEBAR_LABEL_VISIBILITY_PREF,JSON.stringify(Object.fromEntries(modes))),()=>prefs.setStringPref(SIDEBAR_LABEL_VISIBILITY_PREF,before));
    }
    if(changes.messageHidden!==undefined){
      const before=prefs.getStringPref(HIDDEN_MESSAGE_LABELS_PREF,'[]'),hidden=hiddenMessageLabelKeys(prefs);
      for(const key of selected){if(changes.messageHidden)hidden.add(key);else hidden.delete(key);}
      write(()=>prefs.setStringPref(HIDDEN_MESSAGE_LABELS_PREF,JSON.stringify([...hidden])),()=>prefs.setStringPref(HIDDEN_MESSAGE_LABELS_PREF,before));
    }
  }catch(error){
    let failed=false;for(const rollback of undo.reverse())try{rollback()}catch(_){failed=true;}
    if(failed)throw new Error(gmText("$1 Some changes could not be restored; check the selected labels.", error.message));
    throw error;
  }
  return plan;
}
function selectedSidebarLabelKeys(tree,row) {
  const selected=Array.from(tree?.selection?.values?.() || []);
  if(!selected.includes(row))return [row.dataset.tagKey];
  return [...new Set(selected.map(item=>item.dataset?.tagKey).filter(Boolean))];
}

function installSidebarLabelMenu(win,service,prefs) {
  const doc=win.document,buttons=new Set();let currentKey=null,currentKeys=[];
  const panel=doc.createXULElement('panel');panel.className='gm-sidebar-label-popup';gmBindAttribute(panel, 'aria-label', () => gmText("Label options"));
  const content=doc.createElement('div');content.className='gm-sidebar-label-menu';panel.append(content);doc.documentElement.append(panel);
  const style=doc.createElement('style');style.textContent=`
    [data-tag-key] > .container > .name { min-width:0; }
    [data-tag-key] > .container > .folder-count-badge { flex:0 0 auto; }
    [data-tag-key] > .container .gm-label-more { opacity:0; box-sizing:border-box; flex:0 0 28px !important; min-width:28px !important; max-width:28px !important; min-inline-size:28px !important; max-inline-size:28px !important; margin-block:0; margin-inline:6px 0; padding:0; width:28px; height:28px; border:0; border-radius:50%; color:inherit; background:transparent; font-size:22px; cursor:pointer; }
    [data-tag-key] > .container:hover .gm-label-more,[data-tag-key] > .container:focus-within .gm-label-more,.gm-label-more[aria-expanded=true] { opacity:1; }
    [data-tag-key] > .container .gm-label-more:hover { background:var(--layout-background-2,#e8eaed); }
    .gm-sidebar-label-menu { min-width:240px; max-width:min(440px,80vw); max-height:80vh; overflow:auto; padding:8px 0; color:var(--layout-color-0,#202124); background:var(--layout-background-0,#fff); }
    .gm-sidebar-label-menu > button { display:block; box-sizing:border-box; width:100%; text-align:start; border:0; border-radius:0; padding:10px 22px; background:transparent; color:inherit; font:inherit; cursor:pointer; }
    .gm-sidebar-label-menu > button:hover,.gm-sidebar-label-menu > button:focus-visible { background:var(--layout-background-2,#f1f3f4); }
    .gm-sidebar-label-menu hr { border:0; border-top:1px solid var(--layout-border-0,#dadce0); margin:8px 0; }
    .gm-sidebar-label-menu p { margin:10px 22px; overflow-wrap:anywhere; }
    .gm-sidebar-label-menu form { margin:12px 22px; }
    .gm-sidebar-label-menu input[type=text] { box-sizing:border-box; width:100%; margin:10px 0; padding:8px; color:inherit; background:var(--layout-background-0,#fff); border:1px solid var(--layout-border-0,#888); border-radius:4px; font:inherit; }
    .gm-label-colors { display:grid; grid-template-columns:repeat(6,22px); gap:4px; padding:4px 22px 8px 42px; }
    .gm-label-colors button { appearance:none; box-sizing:border-box; width:22px; min-width:22px; max-width:22px; height:22px; min-height:22px; padding:0; margin:0; border:1px solid color-mix(in srgb,currentColor 15%,transparent); border-radius:50%; font:500 15px/20px sans-serif; cursor:pointer; }
    .gm-label-colors button:hover,.gm-label-colors button:focus-visible { outline:2px solid var(--layout-color-0,#202124); outline-offset:1px; }
    .gm-label-colors button[aria-pressed=true] { box-shadow:0 0 0 2px var(--layout-background-0,#fff),0 0 0 3px var(--layout-color-0,#202124); }
    .gm-sidebar-label-menu > .gm-color-back { width:auto; min-width:0; padding:4px 12px; font-size:.85em; }
    .gm-sidebar-label-menu form button { margin-inline-end:8px; padding:6px 12px; font:inherit; }
  `;doc.head.append(style);
  function tag(){const item=service.getAllTags().find(t=>t.key===currentKey);if(!item)throw new Error(gmText("This label no longer exists."));return item;}
  function targets(){
    const all=service.getAllTags(),items=currentKeys.map(key=>all.find(item=>item.key===key));
    if(items.some(item=>!item))throw new Error(gmText("A selected label no longer exists."));
    return items;
  }
  function apply(changes){applyBulkLabelChanges(service,prefs,currentKeys,changes);panel.hidePopup();}
  function text(value){const node=doc.createElement('p');gmBindAction(node,'textContent',value);content.append(node);return node;}
  function failure(error){const node=text(error.message || gmText("The label could not be updated."));node.setAttribute('role','alert');}
  function button(label,action){const node=doc.createElement('button');node.type='button';gmBindAction(node,'textContent',label);node.addEventListener('click',()=>{try{action();}catch(error){failure(error);}});content.append(node);return node;}
  function separator(){content.append(doc.createElement('hr'));}
  function home(){
    const item=tag(),items=targets(),bulk=items.length>1;content.replaceChildren();gmBindAttribute(panel, 'aria-label', () => bulk?gmText("Options for $1 selected labels", items.length):gmText("Options for $1", item.tag));
    if(bulk)text(gmText("$1 selected labels", items.length));
    button(gmText("Label color  ›"),colors);separator();text(gmText("In label list"));
    const modes=sidebarLabelModes(prefs),mode=items.every(item=>(modes.get(item.key) || 'show')===(modes.get(currentKey) || 'show'))?(modes.get(currentKey) || 'show'):null;
    for(const [title,value] of [[gmText("Show"),'show'],[gmText("Show if unread"),'unread'],[gmText("Hide"),'hide']]){
      const node=button(`${mode===value?'✓  ':'    '}${title}`,()=>apply({sidebar:value}));
      gmBindAttribute(node, 'aria-label', () => gmText("$1 in label list", title));node.setAttribute('role','menuitemradio');node.setAttribute('aria-checked',String(mode===value));
    }
    separator();text(gmText("In message list"));
    const hiddenKeys=hiddenMessageLabelKeys(prefs),hidden=items.every(item=>hiddenKeys.has(item.key)===hiddenKeys.has(currentKey))?hiddenKeys.has(currentKey):null;
    for(const [title,hide] of [[gmText("Show"),false],[gmText("Hide"),true]]){
      const node=button(`${hidden===hide?'✓  ':'    '}${title}`,()=>apply({messageHidden:hide}));
      node.setAttribute('aria-label',title);node.setAttribute('role','menuitemradio');node.setAttribute('aria-checked',String(hidden===hide));
    }
    separator();button(bulk?gmText("Edit selected labels…"):gmText("Edit"),()=>bulk?bulkEditor():editor(false));if(bulk)return;button(gmText("Remove label"),()=>{
      const item=tag();
      if(!Services.prompt.confirm(win.top,gmText("Remove label"),gmText("Remove “$1”? Emails and sublabels will be kept.", item.tag)))return;
      service.deleteKey(currentKey);panel.hidePopup();
    });button(gmText("Add sublabel"),()=>editor(true));
  }
  function colors(){
    const items=targets();content.replaceChildren();const back=button(gmText("‹ Back"),home);back.className='gm-color-back';text(gmText("Label color"));
    const grid=doc.createElement('div');grid.className='gm-label-colors';content.append(grid);
    grid.setAttribute('role','group');gmBindAttribute(grid, 'aria-label', () => gmText("Label colors"));
    for(const color of ['#cccccc','#6d9eeb','#76a5af','#8e7cc3','#c27ba0','#cc0000',
      '#666666','#1155cc','#134f5c','#674ea7','#a64d79','#990000',
      '#e69138','#f6b26b','#f1c232','#ffd966','#93c47d','#6aa84f',
      '#ff6d01','#fbbc04','#d5a6bd','#a64d79','#34a853','#0b804b',
      '#000000','#ffffff','#ead1dc','#a142f4','#4285f4','#24c1e0']){
      const preview=chipColors(color);
      const node=doc.createElement('button');node.type='button';node.textContent='a';
      node.style.backgroundColor=preview.background;node.style.color=preview.foreground;
      gmBindValue(node, "title", () => gmText("Label color $1", color));gmBindAttribute(node, 'aria-label', () => gmText("Set label color $1", color));
      node.setAttribute('aria-pressed',String(items.every(item=>(item.color || '').toLowerCase()===color)));
      node.addEventListener('click',()=>{try{apply({color});}catch(error){failure(error);}});grid.append(node);
    }
    const custom=doc.createElement('input');custom.type='color';custom.hidden=true;custom.value=/^#[0-9a-f]{6}$/i.test(tag().color)?tag().color:'#5f6368';gmBindAttribute(custom, 'aria-label', () => gmText("Custom label color"));
    custom.addEventListener('change',()=>{try{apply({color:custom.value});}catch(error){failure(error);}});
    content.append(custom);button(gmText("Add custom color"),()=>custom.click());
    button(gmText("Remove color"),()=>apply({color:''}));
  }
  function bulkEditor(){
    const tags=service.getAllTags(),items=targets();content.replaceChildren();button(gmText("‹ Back"),home);
    text(gmText("Edit $1 labels", items.length));text(gmText("Unchanged fields keep each label’s current value. Moving a parent also moves its descendants; color and visibility affect only selected labels."));
    const form=doc.createElement('form');content.append(form);
    function select(label,options){
      const wrap=doc.createElement('label');gmBindAction(wrap,'textContent',label);wrap.style.display='block';
      const node=doc.createElement('select');node.setAttribute('aria-label',label);node.style.cssText='display:block;width:100%;margin:6px 0 12px;font:inherit;color:inherit;background:var(--layout-background-0,#fff);';
      for(const [value,title] of options){const option=doc.createElement('option');option.value=value;if(/^\d+$/.test(value))option.textContent=title;else gmBindAction(option,'textContent',title);node.append(option);}
      wrap.append(node);form.append(wrap);return node;
    }
    const parents=tags.filter(parent=>!items.some(item=>parent.key===item.key || parent.tag.startsWith(item.tag+'/')));
    const parent=select(gmText("Parent label"),[['keep',gmText("Keep current parents")],['root',gmText("No parent (top level)")],...parents.map((tag,index)=>[String(index),tag.tag])]);
    const colorMode=select(gmText("Label color"),[['keep',gmText("Keep current colors")],['set',gmText("Set the same color")],['remove',gmText("Remove color")]]);
    const color=doc.createElement('input');color.type='color';color.value=/^#[0-9a-f]{6}$/i.test(items[0].color)?items[0].color:'#5f6368';gmBindAttribute(color, 'aria-label', () => gmText("Bulk label color"));color.hidden=true;form.append(color);
    colorMode.addEventListener('change',()=>{color.hidden=colorMode.value!=='set';});
    const sidebar=select(gmText("In label list"),[['keep',gmText("Keep current visibility")],['show',gmText("Show")],['unread',gmText("Show if unread")],['hide',gmText("Hide")]]);
    const message=select(gmText("In message list"),[['keep',gmText("Keep current visibility")],['show',gmText("Show")],['hide',gmText("Hide")]]);
    const preview=doc.createElement('p');preview.setAttribute('aria-live','polite');form.append(preview);
    const cancel=doc.createElement('button');cancel.type='button';gmBindValue(cancel, "textContent", () => gmText("Cancel"));cancel.addEventListener('click',()=>panel.hidePopup());
    const save=doc.createElement('button');save.type='submit';gmBindValue(save, "textContent", () => gmText("Apply to selected labels"));form.append(cancel,save);
    function changes(){return {
      parentKey:parent.value==='keep'?undefined:parent.value==='root'?null:parents[Number(parent.value)]?.key,
      color:colorMode.value==='keep'?undefined:colorMode.value==='remove'?'':color.value,
      sidebar:sidebar.value==='keep'?undefined:sidebar.value,
      messageHidden:message.value==='keep'?undefined:message.value==='hide'
    };}
    function review(){
      try{
        const plan=bulkLabelMovePlan(service.getAllTags(),currentKeys,changes().parentKey);
        gmBindValue(preview, "textContent", () => plan.length?plan.map(item=>`${item.before} → ${item.after}`).join('\n'):gmText("Label paths will stay unchanged."));
        preview.style.cssText='white-space:pre-wrap;max-height:140px;overflow:auto;margin-inline:0;';save.disabled=Object.values(changes()).every(value=>value===undefined);
      }catch(error){preview.textContent=error.message;save.disabled=true;}
    }
    form.addEventListener('change',review);review();
    form.addEventListener('submit',event=>{event.preventDefault();try{applyBulkLabelChanges(service,prefs,currentKeys,changes());panel.hidePopup();}catch(error){failure(error);}});
    parent.focus();
  }

  function editor(child){
    const item=tag();content.replaceChildren();button(gmText("‹  Back"),home);text(child?gmText("New sublabel"):gmText("Edit label"));
    text(child?gmText("Nest label under: $1", item.tag):gmText("Changing this path also updates its sublabels."));
    const form=doc.createElement('form'),label=doc.createElement('label'),input=doc.createElement('input');
    gmBindValue(label, "textContent", () => child?gmText("Label name"):gmText("Full label path"));input.type='text';input.value=child?'':item.tag;gmBindAttribute(input, 'aria-label', () => child?gmText("Sublabel name"):gmText("Full label path"));label.append(input);form.append(label);
    if(!child){
      const parentLabel=doc.createElement('label'),parent=doc.createElement('select');
      gmBindValue(parentLabel,'textContent',()=>gmText("Select parent label"));
      const root=doc.createElement('option');root.value='';gmBindValue(root,'textContent',()=>gmText("No parent (top level)"));parent.append(root);
      const parents=service.getAllTags()
        .filter(candidate=>candidate.key!==item.key && !candidate.tag.startsWith(item.tag+'/'))
        .sort((a,b)=>a.tag.localeCompare(b.tag,undefined,{numeric:true}));
      for(const candidate of parents){
        const option=doc.createElement('option');option.value=candidate.tag;option.textContent=candidate.tag;parent.append(option);
      }
      const syncParent=()=>{
        const path=input.value.trim();
        const parentPath=path.includes('/')?path.slice(0,path.lastIndexOf('/')):'';
        const match=parents.find(candidate=>candidate.tag===parentPath);
        parent.value=match?.tag || '';
      };
      syncParent();
      input.addEventListener('input',syncParent);
      parent.addEventListener('change',()=>{
        const name=input.value.trim().split('/').pop();
        input.value=parent.value?`${parent.value}/${name}`:name;
      });
      parentLabel.append(parent);form.append(parentLabel);
    }
    const save=doc.createElement('button');save.type='submit';gmBindValue(save, "textContent", () => child?gmText("Create"):gmText("Save"));const cancel=doc.createElement('button');cancel.type='button';gmBindValue(cancel, "textContent", () => gmText("Cancel"));cancel.addEventListener('click',()=>panel.hidePopup());form.append(cancel,save);content.append(form);
    form.addEventListener('submit',event=>{event.preventDefault();try{
      const current=tag(),tags=service.getAllTags();
      if(child)service.addTag(nestedLabelName(input.value,current.tag,tags),'','');
      else renameNativeLabel(tags,currentKey,input.value,service);
      panel.hidePopup();
    }catch(error){failure(error);}});input.focus();
  }
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();panel.hidePopup();}});
  panel.addEventListener('popuphidden',()=>{for(const node of buttons)node.setAttribute('aria-expanded','false');});
  panel.addEventListener('popupshown',()=>content.querySelector('button')?.focus());
  return {prune(){for(const node of buttons)if(node.isConnected===false){node.remove();buttons.delete(node);}},decorate(row,item){
    const existing=row.querySelector(':scope > .container > .gm-label-more');if(existing){gmBindAttribute(existing, 'aria-label', () => gmText("Options for $1", item.tag));return;}
    const more=doc.createElement('button');more.type='button';more.className='gm-label-more';more.textContent='⋮';gmBindAttribute(more, 'aria-label', () => gmText("Options for $1", item.tag));more.setAttribute('aria-haspopup','true');more.setAttribute('aria-expanded','false');
    more.addEventListener('mousedown',event=>event.stopPropagation());
    more.addEventListener('keydown',event=>{if(['Enter',' ','ArrowDown'].includes(event.key)){event.preventDefault();event.stopPropagation();more.click();}});
    more.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();currentKey=row.dataset.tagKey;currentKeys=selectedSidebarLabelKeys(doc.getElementById('folderTree'),row);try{home();more.setAttribute('aria-expanded','true');panel.openPopup(more,'after_start',0,0,false,false);}catch(error){console.error(error);}});
    row.querySelector(':scope > .container').append(more);buttons.add(more);
  },close(){panel.hidePopup();panel.remove();style.remove();for(const more of buttons)more.remove();buttons.clear();}};
}
