// Opt-in Gmail mappings. Native commands retain validation and sending policy.
var gmailShortcutsEnabled=false;
// Embedded compose keystrokes can be retargeted to a browser, document or
// shadow host. Follow only the focus/document chain, not every open composer.
function gmailComposerTypingTarget(event){
  const pending=[event.target,event.originalTarget,event.currentTarget,event.view?.document,...(event.composedPath?.() || [])],seen=new Set();
  while(pending.length && seen.size<64){
    const node=pending.shift();if(!node || seen.has(node))continue;seen.add(node);
    try{
      const doc=node.nodeType===9 || node.documentURI!==undefined?node:node.ownerDocument;
      if(String(doc?.designMode).toLowerCase()==='on' || doc?.documentURI?.includes('/messengercompose/') ||
        node.closest?.('.gm-inline-compose'))return true;
      // designMode editors are not reliably reported as contenteditable.
      if(doc && !seen.has(doc))pending.push(doc);
      if(doc?.defaultView?.frameElement)pending.push(doc.defaultView.frameElement);
      if(node.activeElement)pending.push(node.activeElement);
      if(node.shadowRoot?.activeElement)pending.push(node.shadowRoot.activeElement);
      if(node.contentDocument)pending.push(node.contentDocument);
    }catch(_){/* An inaccessible or closing frame is not a typing target. */}
  }
  return false;
}
function gmailTypingTarget(event){
  const target=event.target,doc=target?.ownerDocument;
  return !!(gmailComposerTypingTarget(event) || target?.isContentEditable || doc?.designMode==='on' ||
    doc?.documentURI?.includes('/messengercompose/') ||
    target?.closest?.('input:not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], search-textbox, panel, menupopup, [role="dialog"], [role="menu"]'));
}
function handleGmailShortcutHelpKey(event,panel,router){
  if(!panel || !(panel.open || ['open','showing'].includes(panel.state)))return false;
  router?.reset();
  event.stopImmediatePropagation();
  const scrollKey=!event.ctrlKey && !event.metaKey && !event.altKey &&
    ['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key);
  if(!scrollKey)event.preventDefault();
  if(event.key==='Escape')panel.hidePopup();
  return true;
}
function gmailShortcutAction(key,prefix=''){
  if(prefix==='*')return ({a:'select-all',n:'select-none',r:'select-read',u:'select-unread',s:'select-starred',t:'select-unstarred'})[key];
  if(prefix==='g')return ({i:'folder-inbox',t:'folder-sent',d:'folder-drafts',n:'page-next',p:'page-previous'})[key];
  return ({c:'compose',r:'reply',R:'reply-window',a:'reply-all',A:'reply-all-window',f:'forward',F:'forward-window',
    e:'archive','#':'delete','!':'spam',s:'star',I:'read',U:'unread',u:'back',j:'next',k:'previous',o:'open',Enter:'open',
    n:'message-next',p:'message-previous',';':'expand-all',':':'collapse-all',x:'toggle-selection',v:'move',l:'labels','/':'search',z:'undo',',':'toolbar',b:'snooze','?':'help'})[key];
}
function createGmailShortcutRouter(run,now=()=>Date.now()){
  let prefix='',deadline=0;
  return {handle(event){
    if(!gmailShortcutsEnabled || event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || gmailTypingTarget(event)){
      prefix='';return false;
    }
    const key=event.key;
    if(key==='Enter' && event.target?.closest?.('button, a, [role="button"]')){prefix='';return false;}
    if(key==='g' || key==='*'){prefix=key;deadline=now()+1000;event.preventDefault();event.stopImmediatePropagation();return true;}
    const action=gmailShortcutAction(key,now()<=deadline?prefix:'');prefix='';
    if(!action || !run(action))return false;
    event.preventDefault();event.stopImmediatePropagation();return true;
  },reset(){prefix='';}};
}
function installGmailComposeShortcuts(native){
  const documents=new Set();let closed=false;
  function key(event){
    if(closed || !gmailShortcutsEnabled || event.defaultPrevented || event.repeat || event.isComposing || event.altKey)return;
    const mac=/Mac/i.test(native.navigator?.platform || ''),accel=mac?event.metaKey&&!event.ctrlKey:event.ctrlKey&&!event.metaKey;
    if(!accel)return;
    const k=event.key?.toLowerCase();let command=null;
    if(k==='enter' && !event.shiftKey)command='cmd_sendButton';
    else if(event.shiftKey)command=({'7':'cmd_ol','8':'cmd_ul',l:'align-left',e:'align-center',r:'align-right'})[event.code==='Digit7'?'7':event.code==='Digit8'?'8':k];
    else command=({'[':'cmd_outdent',']':'cmd_indent','\\':'cmd_removeStyles'})[k];
    if(event.shiftKey && ['c','b','f'].includes(k)){
      event.preventDefault();event.stopImmediatePropagation();
      if(k==='f')native.document.getElementById('msgIdentity')?.focus();
      else {native.document.getElementById(k==='c'?'addr_ccShowAddressRowButton':'addr_bccShowAddressRowButton')?.click();native.document.getElementById(k==='c'?'ccAddrInput':'bccAddrInput')?.focus();}
      return;
    }
    if(!command)return;
    // Consume recognized shortcuts even while busy so native key bindings
    // cannot initiate a second send/save through a different command.
    event.preventDefault();event.stopImmediatePropagation();
    if(!native.gMsgCompose || native.gSendOperationInProgress || native.gSaveOperationInProgress)return;
    const align=command.startsWith('align-')?command.slice(6):null;
    const controller=native.document.commandDispatcher?.getControllerForCommand(align?'cmd_align':command);
    if(controller?.isCommandEnabled(align?'cmd_align':command)){if(align)native.doStatefulCommand('cmd_align',align);else native.goDoCommand(command);}
  }
  function watch(doc){if(doc && !documents.has(doc)){documents.add(doc);doc.addEventListener('keydown',key,true);}}
  function loaded(){watch(native.document.getElementById('messageEditor')?.contentDocument);}
  watch(native.document);loaded();native.addEventListener('load',loaded,true);
  return {close(){closed=true;native.removeEventListener('load',loaded,true);for(const doc of documents)doc.removeEventListener('keydown',key,true);documents.clear();}};
}
