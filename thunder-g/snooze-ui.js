function snoozeReturnedNotice(headers,now=Date.now()){
  let latest=0;
  for(const header of headers){
    const returned=Number(header.getStringProperty?.('thunderGSnoozeReturned'))||0;
    const seen=Number(header.getStringProperty?.('thunderGSnoozeSeen'))||0;
    if(returned>seen)latest=Math.max(latest,returned);
  }
  if(!latest)return null;
  const hours=Math.max(0,Math.floor((now-latest*1000)/3600000));
  const text=hours<1?gmText('Snoozed < 1 hour ago'):hours===1?gmText('Snoozed 1 hour ago'):hours<24?gmText('Snoozed $1 hours ago',hours):hours<48?gmText('Snoozed 1 day ago'):gmText('Snoozed $1 days ago',Math.floor(hours/24));
  return {text,returned:latest};
}
function acknowledgeSnoozeReturn(headers){
  for(const header of headers){
    const returned=header.getStringProperty?.('thunderGSnoozeReturned');
    if(Number(returned)>0&&header.getStringProperty('thunderGSnoozeSeen')!==returned)header.setStringProperty('thunderGSnoozeSeen',returned);
  }
}

function snoozeFormatDate(date,locale){
  return new Intl.DateTimeFormat(locale,{year:'numeric',month:'short',day:'numeric'}).format(date);
}
function snoozeParseDate(value,locale){
  const text=value.trim().toLocaleLowerCase(locale).replace(/[.,]/g,'').replace(/\s+/g,' ');
  let year,month,day,match;
  if((match=text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))){[,year,month,day]=match;}
  else if((match=text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/))){if(/^it\b/.test(locale))[,day,month,year]=match;else [,month,day,year]=match;}
  else {
    for(let i=0;i<12;i++){
      const names=['short','long'].map(style=>new Intl.DateTimeFormat(locale,{month:style}).format(new Date(2026,i,1)).toLocaleLowerCase(locale).replace(/[.,]/g,''));
      for(const name of names){
        const parts=text.split(' '),index=parts.indexOf(name);if(index<0)continue;
        const numbers=parts.filter((_,i)=>i!==index);if(numbers.length!==2||numbers.some(part=>!/^\d+$/.test(part)))continue;
        year=numbers.find(part=>part.length===4);day=numbers.find(part=>part.length<=2);month=i+1;
      }
    }
  }
  if(!year||!month||!day)return null;
  const date=new Date(Number(year),Number(month)-1,Number(day));
  return date.getFullYear()===Number(year)&&date.getMonth()===Number(month)-1&&date.getDate()===Number(day)?date:null;
}
function snoozeParseTime(value){
  const match=value.trim().match(/^(\d{1,2}):(\d{2})(?:\s*([ap])\.?m\.?)?$/i);
  if(!match)return null;
  let hours=Number(match[1]);const minutes=Number(match[2]);
  if(minutes>59)return null;
  if(match[3]){if(hours<1||hours>12)return null;hours=hours%12+(match[3].toLowerCase()==='p'?12:0);}
  else if(hours>23)return null;
  return {hours,minutes};
}
var snoozeTimePickerSequence=0;
function createSnoozeTimePicker(doc,panel,date,locale,onChange=()=>{}){
  let hours=date.getHours(),minutes=date.getMinutes(),open=false;
  const wrapper=doc.createElement('div');wrapper.className='gm-snooze-time';
  const trigger=doc.createElement('button');trigger.type='button';trigger.className='gm-snooze-time-trigger';trigger.setAttribute('aria-label',gmText('Time'));trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');
  const input=doc.createElement('input');input.type='text';input.className='gm-snooze-time-input';input.setAttribute('aria-label',gmText('Time'));input.autocomplete='off';input.spellcheck=false;
  function readInput(){const time=snoozeParseTime(input.value);if(time){hours=time.hours;minutes=time.minutes;}return time;}
  input.addEventListener('input',()=>{readInput();onChange();});
  input.addEventListener('change',()=>{if(readInput())update();});
  const icon=doc.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');
  const path=doc.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm1-13h-2v6l5 3 1-1.7-4-2.3V7z');icon.append(path);trigger.append(icon);
  const popup=doc.createElement('div');popup.id='gm-snooze-time-'+(++snoozeTimePickerSequence);popup.className='gm-snooze-time-popup';popup.hidden=true;popup.setAttribute('role','dialog');popup.setAttribute('aria-label',gmText('Time'));trigger.setAttribute('aria-controls',popup.id);
  wrapper.append(input,trigger,popup);
  const lists=[];
  function update(){
    const time=new Date(2026,0,1,hours,minutes);
    input.value=new Intl.DateTimeFormat(locale,{hour:'2-digit',minute:'2-digit'}).format(time);
    trigger.setAttribute('aria-label',gmText('Time')+': '+input.value);
    for(const list of lists){const selected=list.unit==='hours'?hours:minutes;for(const option of list.options){const active=Number(option.dataset.value)===selected;option.setAttribute('aria-selected',String(active));option.tabIndex=active?0:-1;}}
  }
  function select(unit,value){if(unit==='hours')hours=value;else minutes=value;update();onChange();}
  function hide(focus=true){if(!open)return;open=false;popup.hidden=true;trigger.setAttribute('aria-expanded','false');if(focus&&trigger.isConnected)trigger.focus();}
  function show(){
    if(open)return;
    readInput();popup.replaceChildren();lists.length=0;
    for(const [unit,label,count] of [['hours','Hours',24],['minutes','Minutes',60]]){
      const column=doc.createElement('div');column.className='gm-snooze-time-column';const heading=doc.createElement('div');heading.className='gm-snooze-time-heading';heading.textContent=gmText(label);column.append(heading);
      const list=doc.createElement('div');list.className='gm-snooze-time-list';list.setAttribute('role','listbox');list.setAttribute('aria-label',gmText(label));const options=[];
      for(let number=0;number<count;number++){
        const option=doc.createElement('button');option.type='button';option.className='gm-snooze-time-option';option.dataset.value=String(number);option.setAttribute('role','option');option.textContent=String(number).padStart(2,'0');option.onclick=()=>select(unit,number);options.push(option);list.append(option);
        option.addEventListener('keydown',event=>{
          const offsets={ArrowUp:-1,ArrowDown:1,PageUp:-5,PageDown:5};let next;
          if(event.key in offsets)next=(number+offsets[event.key]+count)%count;
          else if(event.key==='Home')next=0;else if(event.key==='End')next=count-1;else return;
          event.preventDefault();select(unit,next);options[next].focus();options[next].scrollIntoView({block:'nearest'});
        });
      }
      lists.push({unit,options,list});column.append(list);popup.append(column);
    }
    const done=doc.createElement('button');done.type='button';done.className='gm-snooze-time-done';done.textContent=gmText('Done');done.onclick=()=>hide();popup.append(done);
    update();open=true;popup.hidden=false;trigger.setAttribute('aria-expanded','true');
    const bounds=wrapper.getBoundingClientRect(),box=popup.getBoundingClientRect(),win=doc.defaultView;
    popup.style.left=Math.max(8,Math.min(bounds.left,win.innerWidth-box.width-8))+'px';
    popup.style.top=Math.max(8,bounds.bottom+box.height+8<=win.innerHeight?bounds.bottom+8:bounds.top-box.height-8)+'px';
    for(const {list,options,unit} of lists){const option=options[unit==='hours'?hours:minutes];list.scrollTop=option.offsetTop-list.offsetTop-(list.clientHeight-option.offsetHeight)/2;}
    lists[0].options[hours].focus();
  }
  trigger.onclick=()=>open?hide():show();
  trigger.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();show();}});
  popup.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();hide();}});
  panel.addEventListener('pointerdown',event=>{if(open&&!wrapper.contains(event.target))hide(false);});
  panel.addEventListener('close',()=>hide(false));update();
  return {element:wrapper,getTime:()=>snoozeParseTime(input.value),close:()=>hide(false)};
}

var SNOOZE_PICKER_CSS=`
.gm-snooze-menu,.gm-snooze-calendar-dialog{font:14px/20px Arial,sans-serif;color:#202124;background:#fff;border:0;box-sizing:border-box}
.gm-snooze-menu{position:fixed;inset:auto;margin:0;width:264px;padding:8px 0 0;border-radius:4px;box-shadow:0 8px 10px 1px #00000024,0 3px 14px 2px #0000001f,0 5px 5px -3px #0003;max-height:calc(100vh - 16px);overflow:auto}
.gm-snooze-sync-note{margin:8px 24px 4px;padding-top:8px;border-top:1px solid #8884;color:var(--layout-color,CanvasText);font-size:11px;line-height:16px;white-space:normal;max-width:260px;opacity:.8}
.gm-snooze-menu-heading{height:32px;box-sizing:border-box;padding:8px 24px 4px;color:#5f6368;font-weight:500}
.gm-snooze-menu .gm-snooze-option{display:flex;align-items:center;justify-content:space-between;gap:12px;appearance:none;width:100%;height:32px;border:0;border-radius:0;margin:0;padding:0 24px;background:transparent;color:inherit;font:inherit;text-align:start;white-space:nowrap;cursor:pointer}
.gm-snooze-menu .gm-snooze-option:hover,.gm-snooze-menu .gm-snooze-option:focus-visible{background:#f1f3f4;outline:none}
.gm-snooze-option-time{color:#5f6368;font-size:13px}
.gm-snooze-menu .gm-snooze-custom{border-top:1px solid #dadce0;margin-top:8px;height:48px;justify-content:flex-start;gap:16px}
.gm-snooze-unsnooze{height:48px!important;justify-content:flex-start!important;gap:16px!important}
.gm-snooze-custom svg,.gm-snooze-unsnooze svg{width:20px;height:20px;fill:#5f6368;flex-shrink:0}
.gm-snooze-calendar-dialog{width:560px;max-width:calc(100vw - 32px);max-height:calc(100vh - 32px);overflow:visible;margin:auto;padding:24px;border-radius:28px;box-shadow:none}
.gm-snooze-calendar-dialog::backdrop{background:rgba(32,33,36,.38)}
.gm-snooze-calendar-dialog h2{font:400 24px/32px Arial,sans-serif;margin:0 0 32px}
.gm-snooze-calendar-content{display:grid;grid-template-columns:224px minmax(0,1fr);gap:40px}
.gm-snooze-month{height:40px;display:flex;align-items:center;gap:8px}
.gm-snooze-month>span{flex:1;white-space:nowrap}
.gm-snooze-calendar-dialog button{appearance:none;box-sizing:border-box;min-inline-size:0;min-block-size:0;font:inherit;cursor:pointer}
.gm-snooze-calendar-dialog .gm-snooze-month-arrow{width:32px;min-inline-size:32px;max-inline-size:32px;flex:0 0 32px;height:32px;padding:0;border:0;border-radius:50%;background:transparent;color:#5f6368;font:28px/28px Arial,sans-serif}
.gm-snooze-days{display:grid;grid-template-columns:repeat(7,32px)}
.gm-snooze-weekday{height:32px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:500}
.gm-snooze-calendar-dialog .gm-snooze-day{width:28px;min-inline-size:28px;max-inline-size:28px;height:28px;justify-self:center;margin:2px;padding:0;border:1px solid transparent;border-radius:50%;background:transparent;color:#202124;font-size:12px}
.gm-snooze-calendar-dialog .gm-snooze-day.gm-snooze-outside,.gm-snooze-calendar-dialog .gm-snooze-day:disabled{color:#aaa}
.gm-snooze-calendar-dialog .gm-snooze-day:disabled{cursor:default}
.gm-snooze-calendar-dialog .gm-snooze-today{border-color:#1a73e8;color:#1a73e8}
.gm-snooze-calendar-dialog .gm-snooze-day[aria-selected="true"]{background:#0b57d0;border-color:#0b57d0;color:#fff}
.gm-snooze-calendar-dialog .gm-snooze-day:enabled:hover,.gm-snooze-calendar-dialog .gm-snooze-month-arrow:hover{background:#e8f0fe}
.gm-snooze-calendar-dialog .gm-snooze-day[aria-selected="true"]:hover{background:#0b57d0}
.gm-snooze-fields{display:flex;flex-direction:column;gap:36px;padding-top:8px}
.gm-snooze-fields input{box-sizing:border-box;width:100%;height:56px;padding:16px;border:1px solid #80868b;border-radius:4px;background:transparent;color:#202124;font:16px/24px Arial,sans-serif}
.gm-snooze-fields input:focus{outline:2px solid #1a73e8;outline-offset:-2px}
.gm-snooze-date-error{color:#b3261e;margin:0;font-size:12px}
.gm-snooze-calendar-footer{display:flex;justify-content:flex-end;gap:8px;margin-top:24px}
.gm-snooze-calendar-dialog .gm-snooze-cancel,.gm-snooze-calendar-dialog .gm-snooze-save{height:40px;padding:0 24px;border:0;border-radius:20px;font-weight:600;background:transparent;color:#0b57d0}
.gm-snooze-calendar-dialog .gm-snooze-save{background:#0b57d0;color:#fff}
.gm-snooze-calendar-dialog .gm-snooze-cancel:hover{background:#f1f3f4}
.gm-snooze-calendar-dialog .gm-snooze-save:hover{background:#084ab5;box-shadow:0 1px 2px #0003}
.gm-snooze-calendar-dialog button:focus-visible{outline:2px solid #1a73e8;outline-offset:2px}
.gm-snooze-calendar-dialog button:disabled,.gm-snooze-menu button:disabled{opacity:.6;cursor:default}
.gm-snooze-time{position:relative}
.gm-snooze-fields .gm-snooze-time-input{padding-right:48px}
.gm-snooze-calendar-dialog .gm-snooze-time-trigger{position:absolute;right:8px;top:8px;display:flex;align-items:center;justify-content:center;width:40px;height:40px;padding:10px;margin:0;border:0;border-radius:50%;background:transparent;color:#5f6368}
.gm-snooze-calendar-dialog .gm-snooze-time-trigger:hover{background:#f1f3f4}
.gm-snooze-time-trigger svg{width:20px;height:20px;flex-shrink:0;fill:#5f6368}
.gm-snooze-time-trigger[aria-expanded="true"]{outline:2px solid #1a73e8;outline-offset:-2px}
.gm-snooze-time-popup{position:fixed;inset:auto;margin:0;display:grid;grid-template-columns:1fr 1fr;gap:8px;box-sizing:border-box;width:248px;padding:12px;border:1px solid #dadce0;border-radius:12px;background:#fff;color:#202124;box-shadow:0 4px 16px #0003;font:14px/20px Arial,sans-serif}
.gm-snooze-time-popup[hidden]{display:none}
.gm-snooze-time-heading{text-align:center;padding:4px 0 8px;color:#5f6368;font-size:12px}
.gm-snooze-time-list{height:160px;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin}
.gm-snooze-calendar-dialog .gm-snooze-time-option{display:block;width:100%;height:32px;min-block-size:32px;margin:0;padding:0;border:0;border-radius:4px;background:transparent;color:#202124;text-align:center}
.gm-snooze-calendar-dialog .gm-snooze-time-option:hover{background:#f1f3f4}
.gm-snooze-calendar-dialog .gm-snooze-time-option[aria-selected="true"]{background:#d3e3fd;color:#0b57d0;font-weight:600}
.gm-snooze-calendar-dialog .gm-snooze-time-done{grid-column:1/-1;justify-self:end;height:32px;margin:4px 0 0;padding:0 16px;border:0;border-radius:16px;background:transparent;color:#0b57d0;font-weight:600}
.gm-snooze-calendar-dialog .gm-snooze-time-done:hover{background:#e8f0fe}
.gm-snooze-status{position:fixed;bottom:24px;left:24px;z-index:2147483647;display:flex;align-items:center;gap:24px;box-sizing:border-box;max-width:calc(100vw - 48px);padding:8px 12px 8px 24px;border-radius:4px;background:#323232;color:#fff;box-shadow:0 2px 8px #0003;font:14px/20px Arial,sans-serif}
.gm-snooze-status button{appearance:none;min-inline-size:0;min-block-size:0;margin:0;padding:8px 12px;border:0;border-radius:4px;background:transparent;color:#a8c7fa;font:600 14px/20px Arial,sans-serif;cursor:pointer}
.gm-snooze-status button:hover{background:#ffffff18}
@media(max-width:560px){.gm-snooze-calendar-content{grid-template-columns:1fr;gap:16px}.gm-snooze-calendar{justify-self:center}.gm-snooze-fields{gap:16px}}
`;

function createUnifiedSnoozedFolder(mail,helper,smartMailbox,flags){
  let folder=null,scope=null,updating=false;
  return function ensure(){
    if(updating)return folder;
    updating=true;
    try{
      const folders=[];
      for(const server of mail.accounts.allServers){
        const root=server.rootFolder;
        if(!server.hidden&&root.containsChildNamed('Thunder-G Snoozed'))folders.push(root.getChildNamed('Thunder-G Snoozed'));
      }
      const uris=folders.map(folder=>folder.URI).sort().join('|');
      if(!folder){
        const root=smartMailbox.rootFolder;
        if(root.containsChildNamed('Snoozed')){
          folder=root.getChildNamed('Snoozed');
          if(!(folder.flags&flags.Virtual))throw new Error('The unified Snoozed folder name is already in use.');
        }else{
          folder=helper.createNewVirtualFolder('Snoozed',root,folders,'ALL',false).virtualFolder;
          scope=uris;
        }
      }
      if(scope!==uris){
        const wrapped=helper.wrapVirtualFolder(folder);
        if(wrapped.searchFolderURIs.split('|').filter(Boolean).sort().join('|')!==uris){wrapped.searchFolders=folders;wrapped.onlineSearch=false;mail.accounts.saveVirtualFolders();}
        // This database may already belong to an active cross-folder view.
        // Forcing it closed here invalidates rows during rapid navigation.
        scope=uris;
      }
      return folder;
    }finally{updating=false;}
  };
}

function installSnoozedFolderMode(win,service,mail=globalThis.MailServices,prefs=globalThis.Services?.prefs){
  const doc=win.document,pane=win.folderPane,tree=doc.getElementById('folderTree');
  const menu=doc.getElementById('folderModesContextMenuPopup');
  if(win.gViewWrapper?.isSynthetic||!pane?._modes||!tree||!menu)return {close(){}};
  const name='gmSnoozed',pref='extensions.thunderg.snooze.folderMode';
  let closed=false,updating=false,unified=null,unifiedRow=null;
  let hiddenURIs=new Set();
  function hideStorageRows(){
    if(closed)return;
    for(const row of tree.querySelectorAll?.('li')||[])row.toggleAttribute('data-gm-snooze-storage',mode.active&&hiddenURIs.has(row.uri)&&row.modeName!==name);
  }
  function placeUnifiedRow(){
    if(closed)return;
    const smart=pane._modes.smart,integrated=!!(mode.active&&smart?.active&&smart.containerList);
    mode.container?.toggleAttribute('data-gm-snooze-integrated',integrated);
    if(!mode.active||!unified){unifiedRow?.remove();unifiedRow=null;return;}
    const target=integrated?smart.containerList:mode.containerList,destinationMode=integrated?'smart':name;
    if(!unifiedRow||unifiedRow.parentNode!==target||unifiedRow.modeName!==destinationMode||unifiedRow.uri!==unified.URI){
      unifiedRow?.remove();unifiedRow=pane._createFolderRow(destinationMode,unified,'folder');
      unifiedRow.name=gmText('Snoozed');unifiedRow.classList?.add('gm-unified-snoozed-row');target.append(unifiedRow);
    }
    if(integrated){const inboxURI=smart._folderTypes?.find(type=>type.type==='inbox')?.folderURI;const children=[...target.children],index=children.findIndex(row=>row.uri===inboxURI);const next=index>=0?children[index+1]:null;if(next&&next!==unifiedRow)target.insertBefore(unifiedRow,next);}
    if(mode.containerHeader)mode.containerHeader.hidden=true;
  }
  const mode={name,active:false,canBeCompact:false,
    init(){
      const heading=this.containerHeader.querySelector('.mode-name');
      heading.removeAttribute('data-l10n-id');heading.removeAttribute('data-l10n-args');
      heading.textContent=gmText('Snoozed');this.containerHeader.hidden=true;
      unified=service.unifiedFolder();
    },
    addFolder(){refresh();},removeFolder(){refresh();},changeAccountOrder(){refresh();},
  };
  pane._modes[name]=mode;
  const item=doc.createXULElement('menuitem');item.id='gm-snoozed-folder-mode';
  for(const [key,value] of Object.entries({class:'folder-pane-mode',value:name,type:'checkbox',closemenu:'none',label:gmText('Snoozed')}))item.setAttribute(key,value);
  menu.insertBefore(item,doc.getElementById('separatorAfterFolderModes'));
  const style=doc.createElement('style');style.textContent=`
    #folderTree [data-gm-snooze-storage],#folderTree > [data-mode="gmSnoozed"][data-gm-snooze-integrated],#folderTree [data-mode="gmSnoozed"] > .mode-container{display:none!important}
    #folderTree [data-mode="gmSnoozed"],#folderTree .gm-unified-snoozed-row{--gm-snoozed-icon-color:var(--layout-color,CanvasText);--gm-snoozed-clock:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm1-13h-2v6l5 3 1-1.7-4-2.3V7z'/%3E%3C/svg%3E")}
    #folderTree [data-mode="gmSnoozed"] .mode-name::before{content:"";display:inline-block;width:16px;height:16px;margin-inline-end:8px;vertical-align:-3px;background:var(--gm-snoozed-icon-color);mask:var(--gm-snoozed-clock) center/contain no-repeat}
    #folderTree [data-mode="gmSnoozed"] .icon,#folderTree .gm-unified-snoozed-row .icon{content:none!important;fill:var(--gm-snoozed-icon-color)!important;stroke:var(--gm-snoozed-icon-color)!important;--icon-color:var(--gm-snoozed-icon-color)!important;color:var(--gm-snoozed-icon-color)!important;background:var(--gm-snoozed-icon-color)!important;mask:var(--gm-snoozed-clock) center/contain no-repeat!important}
  `;doc.head.append(style);
  function refresh(){
    if(closed||updating)return;
    updating=true;
    try{
      hiddenURIs=new Set([...mail.accounts.allServers].flatMap(server=>!server.hidden&&server.rootFolder.containsChildNamed('Thunder-G Snoozed')?[server.rootFolder.getChildNamed('Thunder-G Snoozed').URI]:[]));
      if(mode.active){
        unified=service.unifiedFolder();
        placeUnifiedRow();
      }
      if(!mode.active)placeUnifiedRow();
      hideStorageRows();
      if(mode.active&&unified&&hiddenURIs.has(win.gFolder?.URI))win.displayFolder?.(unified.URI);
    }catch(error){console.error('Thunder-G unified Snoozed:',error);}
    finally{updating=false;}
  }
  function command(event){
    pane.toggleFolderMode(event);
    prefs?.setBoolPref(pref,pane.activeModes.includes(name));
    pane.updateContextCheckedFolderMode();refresh();
  }
  item.addEventListener('command',command);
  const unsubscribe=service.subscribe(refresh);
  const observer=win.MutationObserver?new win.MutationObserver(()=>{placeUnifiedRow();hideStorageRows();}):null;observer?.observe(tree,{childList:true,subtree:true});
  if(prefs?.getBoolPref(pref,true)!==false)pane.activeModes=[...pane.activeModes,name];
  pane.updateContextCheckedFolderMode();refresh();
  return {close(){
    closed=true;observer?.disconnect();unifiedRow?.remove();unifiedRow=null;for(const row of tree.querySelectorAll?.('[data-gm-snooze-storage]')||[])row.removeAttribute('data-gm-snooze-storage');unsubscribe();item.removeEventListener('command',command);item.remove();style.remove();
    if(mode.active)pane.activeModes=pane.activeModes.filter(value=>value!==name);
    delete pane._modes[name];
  }};
}

function installSnoozeUI(win,service,{onMoveAccepted=()=>{}}={}) {
  const doc=win.document;
  let dialog=null,toast=null,toastTimer=null,closed=false,operation=0;
  function dismissMenu(event){
    if(!dialog?.classList.contains('gm-snooze-menu'))return;
    if(event.type==='keydown'){
      if(event.key!=='Escape')return;
      event.preventDefault();event.stopImmediatePropagation();
      const anchor=dialog._snoozeAnchor;closeDialog();anchor?.focus();
    }else if(!dialog.contains(event.target)&&!dialog._snoozeAnchor?.contains(event.target))closeDialog();
  }
  doc.addEventListener('keydown',dismissMenu,true);doc.addEventListener('pointerdown',dismissMenu,true);
  const style=doc.createElement('style');style.textContent=SNOOZE_PICKER_CSS;doc.documentElement.append(style);
  const button=doc.createElement('button');button.className='gm-snoozed-folder';
  button.style.cssText='display:block;width:100%;text-align:start;padding:9px 24px;border:0;background:transparent;color:inherit;cursor:pointer';
  const folderMode=installSnoozedFolderMode(win,service);
  function refresh(){button.textContent=gmText('Snoozed')+' ('+service.list().length+')';}
  const unsubscribe=service.subscribe(refresh);refresh();
  function closeDialog(){
    const current=dialog;dialog=null;if(!current)return;
    if(current.localName==='dialog'&&current.open)current.close();
    else if(current.matches(':popover-open'))current.hidePopover();
    current.remove();
    if(current._snoozeAnchor?.isConnected)current._snoozeAnchor.focus();
  }
  function showStatus(message,{error=false,pending=false}={},onDismiss=()=>{}){
    if(toastTimer!==null)win.clearTimeout(toastTimer);
    toast?.remove();toast=doc.createElement('div');toast.className='gm-snooze-status';toast.setAttribute('role',error?'alert':'status');
    const text=doc.createElement('span');text.textContent=gmText(message);toast.append(text);
    const dismiss=doc.createElement('button');dismiss.type='button';dismiss.textContent=gmText('Dismiss');dismiss.onclick=()=>{onDismiss();toast?.remove();toast=null;if(toastTimer!==null)win.clearTimeout(toastTimer);toastTimer=null;};toast.append(dismiss);
    doc.documentElement.append(toast);
    toastTimer=win.setTimeout(()=>{toast?.remove();toast=null;toastTimer=null;},error?10000:pending?6000:4000);
  }
  function shell(title){
    closeDialog();dialog=doc.createElement('dialog');dialog.className='gm-snooze-dialog';dialog.setAttribute('role','dialog');
    dialog.style.cssText='color:var(--layout-color,CanvasText);background:var(--layout-background-0,Canvas);border:1px solid #8886;border-radius:18px;padding:24px;min-width:340px;max-width:640px;max-height:80vh;overflow:auto;box-shadow:0 12px 48px #0004';
    const heading=doc.createElement('h2');heading.textContent=title;dialog.append(heading);
    const dismiss=doc.createElement('button');dismiss.textContent=gmText('Close');dismiss.style.cssText='float:right';dismiss.onclick=closeDialog;dialog.append(dismiss);
    const current=dialog;dialog.addEventListener('close',()=>{if(dialog===current)closeDialog();});doc.documentElement.append(dialog);dialog.showModal();return dialog;
  }
  function addButton(parent,label,callback){const element=doc.createElement('button');element.textContent=label;element.style.cssText='padding:8px 12px;margin:4px';element.onclick=callback;parent.append(element);return element;}
  async function execute(parent,callback,{pending='Snoozing conversation…',success='Conversation snoozed',moves=true}={}){
    const ticket=++operation;
    let dismissed=false;
    const status=(message,options)=>{if(!closed&&!dismissed&&ticket===operation)showStatus(message,options,()=>{dismissed=true;});};
    const buttons=[...parent.querySelectorAll('button,input')].map(element=>({element,disabled:element.disabled}));buttons.forEach(({element})=>{if(!element.classList.contains('gm-snooze-cancel')&&element.textContent!==gmText('Close'))element.disabled=true;});
    let accepted=false;
    const ready=()=>{
      if(accepted||closed)return;accepted=true;
      if(moves){try{onMoveAccepted(parent._snoozeSelection);}catch(error){console.error('Thunder-G snooze selection:',error);}}
      if(dialog===parent)closeDialog();
      status(pending,{pending:true});
    };
    try{await callback(ready,()=>accepted||(!closed&&dialog===parent&&parent.isConnected));if(closed)return;ready();status(success);}
    catch(error){
      if(closed)return;
      if(error.code==='SNOOZE_CANCELLED')return;
      // Shutdown is a lifecycle event, not a validation error. In particular,
      // do not leave a modal open with the internal 'Snooze closed' message.
      if(error.code==='SNOOZE_CLOSED'||error.message==='Snooze closed'){if(dialog===parent)closeDialog();if(ticket===operation){toast?.remove();toast=null;if(toastTimer!==null)win.clearTimeout(toastTimer);toastTimer=null;}return;}
      if(accepted||dialog!==parent){status(error.message,{error:true});return;}
      buttons.forEach(({element,disabled})=>element.disabled=disabled);let note=parent.querySelector('[role="alert"]');if(!note){note=doc.createElement('p');note.setAttribute('role','alert');parent.append(note);}note.hidden=false;note.textContent=gmText(error.message);
    }
  }
  function choose(headers,job=null,anchor=null){
    if(closed)return;
    if(dialog?.classList.contains('gm-snooze-menu')&&anchor&&dialog._snoozeAnchor===anchor){closeDialog();return;}
    const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);tomorrow.setHours(8,0,0,0);
    const reminders=job?[job]:(service.forHeaders?.(headers)||[]);
    job=reminders[0]||null;
    const freshHeaders=job&&headers.length?headers.filter(header=>!service.forHeaders?.([header])?.length):headers;
    const apply=(panel,date)=>execute(panel,async(ready,shouldProceed)=>{
      for(const reminder of reminders)await service.reschedule(reminder.id,date.getTime(),freshHeaders.length?undefined:ready,shouldProceed);
      if(freshHeaders.length)await service.snooze(freshHeaders,date.getTime(),ready,shouldProceed);
    },{moves:freshHeaders.length>0});
    const fallback=doc.querySelector('.gm-reading-action[title="'+gmText('Snooze until…')+'"]');
    const bounds=(anchor||fallback)?.getBoundingClientRect();
    closeDialog();
    const menu=doc.createElement('div');dialog=menu;menu.className='gm-snooze-menu';menu.setAttribute('popover','auto');menu.setAttribute('role','menu');
    menu.setAttribute('aria-label',gmText('Snooze until…'));menu._snoozeAnchor=anchor||fallback;menu._snoozeSelection=captureSnoozeSelection(win);
    const heading=doc.createElement('div');heading.className='gm-snooze-menu-heading';heading.textContent=gmText('Snooze until…');menu.append(heading);
    const add=(label,date)=>{
      const row=doc.createElement('button');row.type='button';row.className='gm-snooze-option';row.setAttribute('role','menuitem');
      const name=doc.createElement('span'),time=doc.createElement('span');name.textContent=gmText(label);time.className='gm-snooze-option-time';
      time.textContent=new Intl.DateTimeFormat(gmLocale(),{weekday:'short'}).format(date)+', '+new Intl.DateTimeFormat(gmLocale(),{hour:'2-digit',minute:'2-digit'}).format(date);
      row.append(name,time);row.onclick=()=>apply(menu,date);menu.append(row);
    };
    const today=new Date(),later=new Date();later.setHours(18,0,0,0);
    if(later>today)add('Later today',later);
    add('Tomorrow',tomorrow);
    if(today.getDay()===1||today.getDay()===2){const date=new Date(tomorrow);date.setDate(date.getDate()+(3-date.getDay()+7)%7);add('Later this week',date);}
    if(today.getDay()<6){const date=new Date(tomorrow);date.setDate(date.getDate()+(6-date.getDay()+7)%7);add('This weekend',date);}
    const nextWeek=new Date(tomorrow);nextWeek.setDate(nextWeek.getDate()+(8-nextWeek.getDay())%7);add('Next week',nextWeek);
    const custom=doc.createElement('button');custom.type='button';custom.className='gm-snooze-option gm-snooze-custom';custom.setAttribute('role','menuitem');
    const icon=doc.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');
    const path=doc.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11zm-7-9H7v5h5v-5z');icon.append(path);
    const label=doc.createElement('span');label.textContent=gmText('Pick date & time');custom.append(icon,label);custom.onclick=()=>calendar(headers,job,tomorrow,apply);menu.append(custom);
    if(reminders.length){
      const unsnooze=doc.createElement('button');unsnooze.type='button';unsnooze.className='gm-snooze-option gm-snooze-unsnooze';unsnooze.setAttribute('role','menuitem');
      const icon=doc.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');
      const path=doc.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm3.6-12.2L12 11.4 8.4 7.8 7 9.2l3.6 3.6L7 16.4l1.4 1.4 3.6-3.6 3.6 3.6 1.4-1.4-3.6-3.6L17 9.2z');icon.append(path);
      const label=doc.createElement('span');label.textContent=gmText('Unsnooze');unsnooze.append(icon,label);
      unsnooze.onclick=()=>execute(menu,async(ready,shouldProceed)=>{if(service.cancelMany)await service.cancelMany(reminders.map(job=>job.id),ready,shouldProceed);else for(const reminder of reminders)await service.cancel(reminder.id,ready,shouldProceed);},{pending:'Returning conversation to Inbox…',success:'Snooze removed'});
      menu.append(unsnooze);
    }
    menu.addEventListener('keydown',event=>{
      const options=[...menu.querySelectorAll('button')];let index=options.indexOf(doc.activeElement);
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();options[(index+(event.key==='ArrowDown'?1:options.length-1)+options.length)%options.length].focus();}
      if(event.key==='Home'||event.key==='End'){event.preventDefault();options[event.key==='Home'?0:options.length-1].focus();}
    });
    menu.addEventListener('toggle',event=>{if(event.newState==='closed'&&dialog===menu){dialog=null;menu.remove();}});
    const syncNote=doc.createElement('p');syncNote.className='gm-snooze-sync-note';syncNote.textContent=gmText('Reminders stay in this profile. Gmail snooze and other clients do not sync.');menu.append(syncNote);
    doc.documentElement.append(menu);menu.showPopover();
    const width=menu.getBoundingClientRect().width,height=menu.getBoundingClientRect().height;
    menu.style.left=Math.max(8,Math.min(bounds?.left??(win.innerWidth-width)/2,win.innerWidth-width-8))+'px';
    menu.style.top=Math.max(8,Math.min(bounds?.bottom??(win.innerHeight-height)/2,win.innerHeight-height-8))+'px';
    menu.querySelector('button')?.focus();
  }
  function calendar(headers,job,tomorrow,apply){
    const anchor=dialog?._snoozeAnchor,selection=dialog?._snoozeSelection;
    closeDialog();
    const panel=doc.createElement('dialog');dialog=panel;panel._snoozeAnchor=anchor;panel._snoozeSelection=selection;panel.className='gm-snooze-calendar-dialog';panel.setAttribute('role','dialog');panel.setAttribute('aria-label',gmText('Pick date & time'));
    const heading=doc.createElement('h2');heading.textContent=gmText('Pick date & time');panel.append(heading);
    const content=doc.createElement('div');content.className='gm-snooze-calendar-content';
    const calendar=doc.createElement('div'),fields=doc.createElement('div');calendar.className='gm-snooze-calendar';fields.className='gm-snooze-fields';content.append(calendar,fields);panel.append(content);
    let selected=new Date(job?.due||tomorrow.getTime()),month=new Date(selected.getFullYear(),selected.getMonth(),1);
    const locale=gmLocale()||'en',firstDay=/^it\b/.test(locale)?1:0;
    const dateInput=doc.createElement('input');dateInput.type='text';dateInput.setAttribute('aria-label',gmText('Date'));dateInput.autocomplete='off';dateInput.spellcheck=false;fields.append(dateInput);
    dateInput.value=snoozeFormatDate(selected,locale);
    const timePicker=createSnoozeTimePicker(doc,panel,selected,locale,()=>{error.hidden=true;});fields.append(timePicker.element);
    const error=doc.createElement('p');error.className='gm-snooze-date-error';error.setAttribute('role','alert');error.hidden=true;fields.append(error);
    function invalid(message){error.textContent=gmText(message);error.hidden=false;}
    function draw(){
      calendar.replaceChildren();
      const bar=doc.createElement('div');bar.className='gm-snooze-month';const name=doc.createElement('span');name.setAttribute('aria-live','polite');name.textContent=new Intl.DateTimeFormat(locale,{month:'long',year:'numeric'}).format(month);bar.append(name);
      for(const [delta,label] of [[-1,'Previous month'],[1,'Next month']]){const button=doc.createElement('button');button.type='button';button.className='gm-snooze-month-arrow';button.setAttribute('aria-label',gmText(label));button.textContent=delta<0?'‹':'›';button.onclick=()=>{month=new Date(month.getFullYear(),month.getMonth()+delta,1);draw();calendar.querySelector(delta<0?'button':'button:last-of-type')?.focus();};bar.append(button);}
      calendar.append(bar);
      const grid=doc.createElement('div');grid.className='gm-snooze-days';grid.setAttribute('role','grid');grid.setAttribute('aria-label',name.textContent);
      for(let i=0;i<7;i++){const label=doc.createElement('span');label.className='gm-snooze-weekday';label.setAttribute('role','columnheader');label.textContent=new Intl.DateTimeFormat(locale,{weekday:'narrow'}).format(new Date(2026,10,1+(firstDay+i)%7));grid.append(label);}
      const start=new Date(month);start.setDate(1-(month.getDay()-firstDay+7)%7);
      const today=new Date();today.setHours(0,0,0,0);
      for(let i=0;i<42;i++){
        const date=new Date(start);date.setDate(date.getDate()+i);const day=doc.createElement('button');day.type='button';day.className='gm-snooze-day';day.setAttribute('role','gridcell');day.textContent=date.getDate();day.setAttribute('aria-label',new Intl.DateTimeFormat(locale,{dateStyle:'full'}).format(date));
        const active=date.getFullYear()===selected.getFullYear()&&date.getMonth()===selected.getMonth()&&date.getDate()===selected.getDate();
        day.setAttribute('aria-selected',String(active));day.tabIndex=active?0:-1;day.disabled=date<today;
        day.classList.toggle('gm-snooze-outside',date.getMonth()!==month.getMonth());day.classList.toggle('gm-snooze-today',date.getTime()===today.getTime());
        day.onclick=()=>{selected=new Date(date);dateInput.value=snoozeFormatDate(selected,locale);error.hidden=true;draw();calendar.querySelector('[aria-selected="true"]')?.focus();};
        day.addEventListener('keydown',event=>{
          const offsets={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7};if(!(event.key in offsets))return;event.preventDefault();
          const next=new Date(date);next.setDate(next.getDate()+offsets[event.key]);if(next<today)return;
          selected=next;month=new Date(next.getFullYear(),next.getMonth(),1);dateInput.value=snoozeFormatDate(selected,locale);draw();calendar.querySelector('[aria-selected="true"]')?.focus();
        });
        grid.append(day);
      }
      if(!grid.querySelector('[tabindex="0"]')){const first=grid.querySelector('button:not(:disabled):not(.gm-snooze-outside)');if(first)first.tabIndex=0;}
      calendar.append(grid);
    }
    dateInput.addEventListener('change',()=>{const date=snoozeParseDate(dateInput.value,locale);if(!date){invalid('Choose a valid date and time.');return;}selected=date;month=new Date(date.getFullYear(),date.getMonth(),1);error.hidden=true;draw();});
    const footer=doc.createElement('div');footer.className='gm-snooze-calendar-footer';
    const cancel=doc.createElement('button');cancel.type='button';cancel.className='gm-snooze-cancel';cancel.textContent=gmText('Cancel');cancel.onclick=closeDialog;
    const save=doc.createElement('button');save.type='button';save.className='gm-snooze-save';save.textContent=gmText('Save');
    save.onclick=()=>{const date=snoozeParseDate(dateInput.value,locale),time=timePicker.getTime();if(!date||!time){invalid('Choose a valid date and time.');return;}date.setHours(time.hours,time.minutes,0,0);if(date.getHours()!==time.hours||date.getMinutes()!==time.minutes){invalid('Choose a valid date and time.');return;}if(date.getTime()<=Date.now()){invalid('Choose a future date and time.');return;}apply(panel,date);};
    panel.addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.target===dateInput||event.target===timePicker.element.querySelector('input'))){event.preventDefault();save.click();}});
    footer.append(cancel,save);panel.append(footer);panel.addEventListener('cancel',event=>{event.preventDefault();event.stopPropagation();if(dialog===panel)closeDialog();});panel.addEventListener('close',()=>{if(dialog===panel)closeDialog();});draw();doc.documentElement.append(panel);panel.showModal();dateInput.focus();dateInput.select();
  }
  function manage(){
    const panel=shell(gmText('Snoozed'));panel._snoozeSelection=captureSnoozeSelection(win);
    const jobs=service.list();
    if(!jobs.length){const empty=doc.createElement('p');empty.textContent=gmText('No snoozed conversations.');panel.append(empty);}
    for(const job of jobs){
      const row=doc.createElement('div'),title=doc.createElement('p');row.style.cssText='border-top:1px solid #8884;padding:12px 0';
      title.textContent=(job.subject||gmText('(no subject)'))+' — '+new Date(job.due).toLocaleString();row.append(title);
      if(job.error){const error=doc.createElement('p');error.setAttribute('role','alert');error.textContent=gmText(job.error);row.append(error);}
      addButton(row,gmText('Change time'),()=>choose([],job));
      addButton(row,gmText('Unsnooze'),()=>execute(panel,(ready,shouldProceed)=>service.cancel(job.id,ready,shouldProceed),{pending:'Returning conversation to Inbox…',success:'Snooze removed'}));panel.append(row);
    }
  }
  button.onclick=manage;
  return {choose,close(){closed=true;doc.removeEventListener('keydown',dismissMenu,true);doc.removeEventListener('pointerdown',dismissMenu,true);folderMode.close();unsubscribe();closeDialog();button.remove();style.remove();toast?.remove();if(toastTimer!==null)win.clearTimeout(toastTimer);}};
}


function snoozeDisplayReminder(service,headers){
  const jobs=service?.forHeaders?.(headers)||[];
  return jobs.filter(job=>job.state!=='waking').sort((a,b)=>a.due-b.due)[0]||null;
}
function snoozeReminderText(job,locale,now=new Date()){
  const due=new Date(job.due),tomorrow=new Date(now);tomorrow.setDate(tomorrow.getDate()+1);
  const sameDay=date=>due.getFullYear()===date.getFullYear()&&due.getMonth()===date.getMonth()&&due.getDate()===date.getDate();
  const day=sameDay(now)?gmText('Today'):sameDay(tomorrow)?gmText('Tomorrow'):new Intl.DateTimeFormat(locale,{day:'numeric',month:'short',year:due.getFullYear()===now.getFullYear()?undefined:'numeric'}).format(due);
  const time=new Intl.DateTimeFormat(locale,{hour:'2-digit',minute:'2-digit'}).format(due);
  return gmText(job.state==='preparing'?'Snooze pending until $1':'Snoozed until $1',day+', '+time);
}


function captureSnoozeSelection(win){
  const view=win.gDBView,tree=win.document.getElementById('threadTree');
  return {view,indices:Array.from(tree?.selectedIndices||[]),keys:Array.from(view?.getSelectedMsgHdrs?.()||[],header=>JSON.stringify([header.folder?.URI,header.messageKey]))};
}
function snoozeSelectionUnchanged(win,context){
  if(!context||win.gDBView!==context.view)return false;
  const current=captureSnoozeSelection(win);
  return JSON.stringify(current.indices)===JSON.stringify(context.indices)&&JSON.stringify(current.keys)===JSON.stringify(context.keys);
}
