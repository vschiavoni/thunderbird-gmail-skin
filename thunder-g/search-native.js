function gmailFolderMatches(folder,value,flags) {
  const aliases={inbox:flags.Inbox,sent:flags.SentMail,drafts:flags.Drafts,
    trash:flags.Trash,spam:flags.Junk,archive:flags.Archive};
  if(value==='anywhere')return true;
  if(value==='snoozed')return folder.name==='Thunder-G Snoozed';
  if(aliases[value])return folder.isSpecialFolder(aliases[value],true);
  const path=folder.URI.split('/').slice(3).map(part=>{
    try{return decodeURIComponent(part)}catch(_){return part}
  }).join('/').toLowerCase();
  return path===value || folder.name.toLowerCase()===value;
}

function gmailMetadataMatch(atom,header,context) {
  const {field,value}=atom,needle=value.toLowerCase();
  const contains=text=>String(text || '').toLowerCase().includes(needle);
  if(['from','to','cc','bcc'].includes(field)){
    const text=({from:header.mime2DecodedAuthor || header.author,
      to:header.mime2DecodedRecipients || header.recipients,cc:header.ccList,bcc:header.bccList})[field];
    if(needle!=='me')return contains(text);
    const addresses=context.addresses(text || '');
    return addresses.some(address=>context.identities.has(address.toLowerCase()));
  }
  if(field==='subject')return contains(header.mime2DecodedSubject);
  if(field==='label'){
    const keys=header.getStringProperty('keywords').split(' ');
    return context.tags.some(tag=>tag.tag.toLowerCase()===needle &&
      (keys.includes(tag.key) || (header.label && tag.key==='$label'+header.label)));
  }
  if(field==='is')return needle==='starred'?header.isFlagged:needle==='read'?header.isRead:!header.isRead;
  if(field==='in')return gmailFolderMatches(header.folder,needle,context.flags);
  if(field==='has'){
    if(needle==='attachment')return !!(header.flags & context.attachmentFlag);
    const keys=header.getStringProperty('keywords').split(' ');
    if(needle==='userlabels' || needle==='nouserlabels'){
      const any=context.tags.some(tag=>keys.includes(tag.key) || (header.label && tag.key==='$label'+header.label));
      return needle==='userlabels'?any:!any;
    }
    return header.isFlagged && (header.getStringProperty('thundergStarMarker') || 'yellow-star')===needle;
  }
  if(['size','larger','smaller'].includes(field))
    return field==='smaller'?header.messageSize<atom.bytes:field==='size'?header.messageSize>=atom.bytes:header.messageSize>atom.bytes;
  const time=header.dateInSeconds*1000;
  return ['before','older','older_than'].includes(field)?time<atom.time:time>atom.time;
}

function createGmailSearchView(query,ast,environment) {
  const {folders,searchAtom,searchAll,attachmentNames,yieldControl,sort}=environment;
  let generation=0,listener=null,complete=null,controller=null;
  const headers=new Map(),progressListeners=new Set();
  let searching=false;
  function progress(value){searching=value;for(const notify of progressListeners)notify(value)}
  function finish(status=0){
    const target=listener,callback=complete;
    listener=null;complete=null;
    target?.onSearchDone(status);callback?.();progress(false);
  }
  return {
    customColumns:[],defaultSort:sort,
    subscribeProgress(notify){progressListeners.add(notify);notify(searching);return ()=>progressListeners.delete(notify)},
    getDefaultSetting(){return undefined},
    getPersistedSetting(name){return this.getDefaultSetting(name)},
    setPersistedSetting(){},
    getMsgHdrForMessageID(id){return [...headers.values()].find(header=>header.messageId===id) || null},
    search(target,callback){
      this.abortSearch();
      environment.onStart?.(this);
      const revision=++generation;
      controller=new environment.AbortController();
      const signal=controller.signal;
      listener=target;complete=callback;headers.clear();
      target.onNewSearch();progress(true);
      const current=()=>revision===generation && !signal.aborted;
      (async()=>{
        const atoms=gmailSearchAtoms(ast),matches=new Map(atoms.map(atom=>[atom,new Map()]));
        const completed=new Set(),candidates=new Map();
        // Unknown is distinct from false: never publish a message until every
        // condition needed to prove its match (including exclusions) is known.
        function truth(node,key){
          if(node.type==='atom')return matches.get(node).has(key)?true:completed.has(node)?false:null;
          if(node.type==='not'){const value=truth(node.child,key);return value===null?null:!value}
          const values=node.children.map(child=>truth(child,key));
          if(node.type==='and')return values.includes(false)?false:values.includes(null)?null:true;
          return values.includes(true)?true:values.includes(null)?null:false;
        }
        function publish(header){
          const key=gmailSearchKey(header);
          if(!current() || headers.has(key) || truth(ast,key)!==true)return;
          headers.set(key,header);listener.onSearchHit(header,header.folder);
        }
        for(const atom of atoms){
          if(!current())return;
          const set=matches.get(atom);
          let pending=Promise.resolve(),batch=0;
          const receive=header=>{
            if(!current())return;
            const key=gmailSearchKey(header);
            if(set.has(key))return;
            set.set(key,header);candidates.set(key,header);publish(header);
          };
          const consume=atom.field==='filename'?header=>{
            pending=pending.then(async()=>{
              if(!current())return;
              const names=await attachmentNames(header,signal);
              if(names.some(name=>name.toLowerCase().includes(atom.value.toLowerCase())))receive(header);
            });
            // Attach a rejection handler immediately while native search continues.
            pending.catch(()=>{});
          }:receive;
          const hits=await searchAtom(atom,folders,signal,consume);
          if(!current())return;
          // Also accept non-streaming search adapters used by other callers.
          for(const header of hits || []){consume(header);if(++batch%200===0)await yieldControl()}
          await pending;
          if(!current())return;
          completed.add(atom);
          for(const header of candidates.values()){publish(header);if(++batch%200===0)await yieldControl()}
        }
        const hasNegation=node=>node.type==='not' || node.children?.some(hasNegation);
        if(hasNegation(ast)){
          const hits=await searchAll(folders,signal,header=>publish(header));
          let batch=0;
          for(const header of hits || []){publish(header);if(++batch%200===0)await yieldControl()}
        }
        if(current())finish();
      })().catch(error=>{
        if(!current())return;
        environment.reportError(error);finish(environment.failureCode);
      });
    },
    abortSearch(){generation++;controller?.abort();controller=null;headers.clear();finish();environment.onStop?.(this);},
  };
}

// Experimental presentation adapter: reuse the native list, never copy mail.
function installInPlaceSearch(pane, beforeSearch = () => {}, onUnload = () => {}) {
  let active = null, closed = false, restoring = false;
  const tree = pane.document.getElementById('folderTree');
  const host = pane.document.querySelector('.list-header-bar-container-start');
  if (!tree || !host || typeof pane.restoreState !== 'function') return null;
  function release(restore) {
    if (!active) return;
    const previous = active; active = null;
    previous.view.abortSearch(); previous.status?.close(); previous.back.remove();
    beforeSearch(pane);
    pane.gViewWrapper?.close(); pane.gViewWrapper = null; pane.gDBView = null;
    pane.threadTree.view = null;
    pane.paneLayout.folderPaneSplitter.isDisabled = previous.splitterDisabled;
    if (restore && !closed) {
      restoring = true;
      try {
        pane.folderPane.handleEvent({type:'select'});
        if (pane.gFolder?.URI === previous.folderURI) {
          pane.threadTree.scrollTop = previous.scrollTop;
          if (previous.selected && pane.gDBView?.findIndexOfMsgHdr) {
            const index = pane.gDBView.findIndexOfMsgHdr(previous.selected, true);
            if (index >= 0 && index < pane.gDBView.rowCount) pane.threadTree.selectedIndex = index;
          }
        }
      } finally { restoring = false; }
    }
  }
  function folderSelected() { if (active && !restoring) release(false); }
  tree.addEventListener('select', folderSelected, true);
  function open(view, source) {
    if (closed) throw new Error('Search pane is closed.');
    // Keep only the initial return point across repeated searches.
    const previous = active || {folderURI:pane.gFolder?.URI, scrollTop:pane.threadTree.scrollTop,
      selected:pane.gDBView?.hdrForFirstSelectedMessage,
      splitterDisabled:pane.paneLayout.folderPaneSplitter.isDisabled};
    if (!previous.folderURI) return false;
    if (active) {active.view.abortSearch();active.status?.close();active.back.remove();active=null;}
    beforeSearch(pane);pane.threadPane.saveSelection();pane.messagePane?.clearAll();pane.gViewWrapper?.close();pane.gFolder=null;
    const back=pane.document.createElement('button');back.type='button';back.className='gm-search-return';
    back.textContent='← Back to mail';back.title='Return to the previous folder';
    back.style.cssText='border:0;border-radius:18px;padding:8px 12px;background:transparent;color:inherit;cursor:pointer;';
    back.addEventListener('click',()=>release(true));
    active={...previous,view,back,status:null};
    try {
      pane.restoreState({syntheticView:view,folderPaneVisible:true,messagePaneVisible:false,title:'Search · '+source});
      // Synthetic tabs normally disable sidebar navigation; this pane retains it.
      pane.paneLayout.folderPaneSplitter.isDisabled=false;
      host.prepend(back);active.status=installGmailSearchStatus(pane);
      return true;
    } catch(error) {release(true);throw error;}
  }
  function unload(){closed=true;release(false);tree.removeEventListener('select',folderSelected,true);pane.removeEventListener('unload',unload);onUnload();}
  pane.addEventListener('unload',unload,{once:true});
  return {open,reset(){release(true)},close(){release(true);unload()}};
}

// Diagnostic counters stay local and contain no queries or message content.
function instrumentInPlaceSearch(view, pane, now = () => pane.performance.now()) {
  const original = view.search;
  view.search = function(listener, done) {
    const started=now(), metrics={firstResultMs:null,elapsedMs:null,matches:0};
    pane._gmSearchMetrics=metrics;
    return original.call(this,{
      onNewSearch(){listener.onNewSearch();},
      onSearchHit(header,folder){if(metrics.firstResultMs===null)metrics.firstResultMs=now()-started;metrics.matches++;listener.onSearchHit(header,folder);},
      onSearchDone(status){metrics.elapsedMs=now()-started;metrics.status=status;listener.onSearchDone(status);}
    },done);
  };
}

function installGmailSearch(win,mail,interfaces=Ci,components=Cc,modules=ChromeUtils,configuration={}) {
  const views=new Set(),searchBars=new Set(),inPlacePanes=new Map();
  let sequence=0,closed=false;
  const matchers=new Map(),customId='thunder-g-gmail-search';
  mail.filters.addCustomTerm({id:customId,name:'Thunder-G search',needsBody:false,
    getEnabled:()=>true,getAvailable:()=>true,
    getAvailableOperators:(_scope,length)=>{if(length)length.value=1;return [interfaces.nsMsgSearchOp.Is]},
    match:(header,value)=>matchers.get(value)?.(header) || false,
  });
  const {GlodaSyntheticView}=modules.importESModule('resource:///modules/gloda/GlodaSyntheticView.sys.mjs');
  const {MsgHdrToMimeMessage}=modules.importESModule('resource:///modules/gloda/MimeMessage.sys.mjs');
  function report(error){win.Services.prompt.alert(win,'Thunder-G search',String(error.message || error));}
  function nativeSearch(atom,folders,signal,onHit){
    return new Promise((resolve,reject)=>{
      if(signal.aborted){resolve([]);return;}
      const session=components['@mozilla.org/messenger/searchSession;1'].createInstance(interfaces.nsIMsgSearchSession);
      const id='thunder-g-search-'+Date.now()+'-'+(++sequence),hits=[];
      const metadata={
        flags:interfaces.nsMsgFolderFlags,attachmentFlag:interfaces.nsMsgMessageFlags.Attachment,
        tags:mail.tags.getAllTags(),
        identities:new Set(Array.from(mail.accounts.allIdentities,identity=>identity.email.toLowerCase())),
        addresses:text=>mail.headerParser.extractHeaderAddressMailboxes(text).split(',').map(value=>value.trim()),
      };
      let registered=false,done=false;
      function term(attribute,value){
        const item=session.createTerm();item.attrib=attribute;item.op=interfaces.nsMsgSearchOp.Contains;
        item.booleanAnd=false;
        const searchValue=item.value;searchValue.attrib=attribute;searchValue.str=value;item.value=searchValue;
        session.appendTerm(item);
        return item;
      }
      function finish(error){
        if(done)return;done=true;
        signal.removeEventListener('abort',abort);
        session.unregisterListener(observer);
        if(registered)matchers.delete(id);
        if(error)reject(error);else resolve(hits);
      }
      const abort=()=>{try{session.interruptSearch()}finally{finish()}};
      const observer={onNewSearch(){},onSearchHit(header){if(onHit)onHit(header);else hits.push(header)},
        onSearchDone(status){finish(status && !signal.aborted?new Error('Search could not read one or more folders.'):null)}};
      try{
        if(atom?.field==='text'){
          for(const attribute of ['Sender','ToOrCC','Subject','Body'])term(interfaces.nsMsgSearchAttrib[attribute],atom.value);
        }else if(atom?.field==='filename'){
          const item=session.createTerm();item.attrib=interfaces.nsMsgSearchAttrib.HasAttachmentStatus;
          item.op=interfaces.nsMsgSearchOp.Is;item.booleanAnd=true;
          const value=item.value;value.attrib=item.attrib;value.status=interfaces.nsMsgMessageFlags.Attachment;item.value=value;
          session.appendTerm(item);
        }else{
          matchers.set(id,header=>!atom || gmailMetadataMatch(atom,header,metadata));registered=true;
          const item=session.createTerm();item.attrib=interfaces.nsMsgSearchAttrib.Custom;
          item.customId=customId;item.op=interfaces.nsMsgSearchOp.Is;item.booleanAnd=true;
          const value=item.value;value.attrib=item.attrib;value.str=id;item.value=value;
          session.appendTerm(item);
        }
        for(const folder of folders)session.addScopeTerm(interfaces.nsMsgSearchScope.offlineMail,folder);
        session.registerListener(observer,interfaces.nsIMsgSearchSession.allNotifications);
        signal.addEventListener('abort',abort,{once:true});
        session.search(win.msgWindow || null);
      }catch(error){finish(error);}
    });
  }
  function attachmentNames(header,signal){
    if(signal.aborted)return Promise.resolve([]);
    return new Promise((resolve,reject)=>{
      const abort=()=>resolve([]);
      signal.addEventListener('abort',abort,{once:true});
      try{
        // false prevents a server download when a message is not locally available.
        MsgHdrToMimeMessage(header,null,(_header,message)=>{
          signal.removeEventListener('abort',abort);
          if(signal.aborted){resolve([]);return;}
          if(!message){reject(new Error('Download messages for offline use to search attachment names.'));return;}
          resolve((message.allAttachments || []).map(item=>item.name || ''));
        },false,{saneBodySize:true});
      }catch(error){signal.removeEventListener('abort',abort);reject(error);}
    });
  }
  function run(source){
    const ast=parseGmailSearch(source);
    const includeAll=gmailSearchAtoms(ast).some(atom=>atom.field==='in' &&
      ['anywhere','spam','trash'].includes(atom.value.toLowerCase()));
    const folders=Array.from(mail.accounts.allFolders).filter(folder=>!folder.isServer &&
      !(folder.flags & interfaces.nsMsgFolderFlags.Virtual) &&
      (includeAll || !folder.isSpecialFolder(interfaces.nsMsgFolderFlags.Junk|interfaces.nsMsgFolderFlags.Trash,true)));
    const tabmail=win.document.getElementById('tabmail');
    if(!tabmail)throw new Error('Open a Thunderbird mail window first.');
    if(!folders.length)throw new Error('No searchable mail folders are available.');
    const view=createGmailSearchView(source,ast,{
      AbortController:win.AbortController,folders,searchAtom:nativeSearch,searchAll:(items,signal,onHit)=>nativeSearch(null,items,signal,onHit),
      attachmentNames,yieldControl:()=>new Promise(resolve=>win.setTimeout(resolve,0)),
      sort:[[interfaces.nsMsgViewSortType.byDate,interfaces.nsMsgViewSortOrder.descending]],
      reportError:report,failureCode:0x80004005,
      onStart:view=>views.add(view),onStop:view=>views.delete(view),
    });
    // Use native list defaults so the usual row actions, labels and reader work.
    view.DEFAULT_COLUMN_STATES=GlodaSyntheticView.prototype.DEFAULT_COLUMN_STATES;
    const getDefault=view.getDefaultSetting;
    view.getDefaultSetting=function(name){return name==='columns'?this.DEFAULT_COLUMN_STATES:getDefault(name)};
    views.add(view);
    if (configuration.enabled?.()) {
      const pane=tabmail.currentAbout3Pane;
      if (pane) {
        let adapter=inPlacePanes.get(pane);
        if (!adapter) {adapter=installInPlaceSearch(pane,configuration.beforeSearch,()=>inPlacePanes.delete(pane));if(adapter)inPlacePanes.set(pane,adapter);}
        if (adapter) {instrumentInPlaceSearch(view,pane);if(adapter.open(view,source))return;}
      }
    }
    tabmail.openTab('mail3PaneTab',{folderPaneVisible:false,syntheticView:view,
      title:'Local search · '+source});
  }
  function search(event){
    if(closed || typeof event.detail!=='string')return;
    // Plain searches retain Thunderbird's indexed search behavior.
    if(!configuration.enabled?.() && !/(?:^|\s|[({-])[a-z_]+:|\b(?:OR|AND)\b|[{}"()]|(?:^|\s)-/i.test(event.detail))return;
    if(!event.detail.trim())return;
    event.preventDefault();event.stopImmediatePropagation();
    try{run(event.detail)}catch(error){report(error)}
    win.document.getElementById('PopupGlodaAutocomplete')?.hidePopup();
  }
  function watch(){
    for(const bar of win.document.querySelectorAll('global-search-bar')){
      if(searchBars.has(bar))continue;
      bar.addEventListener('search',search,true);searchBars.add(bar);
    }
  }
  const observer=new win.MutationObserver(records=>{
    for(const bar of searchBars)if(!bar.isConnected){bar.removeEventListener('search',search,true);searchBars.delete(bar);}
    if(records.some(record=>Array.from(record.addedNodes).some(node=>
        node.matches?.('global-search-bar') || node.querySelector?.('global-search-bar'))))watch();
  });
  observer.observe(win.document.documentElement,{childList:true,subtree:true});watch();
  return {settingsChanged(){if(!configuration.enabled?.())for(const adapter of inPlacePanes.values())adapter.reset();},close(){
    closed=true;observer.disconnect();
    for(const adapter of inPlacePanes.values())adapter.close();inPlacePanes.clear();
    for(const bar of searchBars)bar.removeEventListener('search',search,true);
    for(const view of views)view.abortSearch();
    searchBars.clear();views.clear();
  }};
}

// Attach only to our synthetic result tabs; normal folder headers stay untouched.
function installGmailSearchStatus(win){
  const view=win.gViewWrapper?._syntheticView;
  const host=win.document.querySelector('.list-header-bar-container-start');
  if(!view?.subscribeProgress || !host)return {close(){}};
  const status=win.document.createElement('span');status.className='gm-search-status';
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  status.style.cssText='margin-inline:12px;font-size:.9em;color:var(--layout-color,CanvasText);';
  status.textContent='Searching…';host.append(status);
  const unsubscribe=view.subscribeProgress(active=>{status.hidden=!active});
  return {close(){unsubscribe();status.remove()}};
}
