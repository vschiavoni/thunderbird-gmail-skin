function conversationDateText(date,locale,now=new Date()) {
  const options={weekday:'short',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'};
  if(date.getFullYear()!==now.getFullYear())options.year='numeric';
  return date.toLocaleString(locale,options);
}

function stopConversationReadTimers(frames) {
  for (const frame of frames.values()) {
    try { frame.contentWindow?.ClearPendingReadTimer?.(); }
    catch (error) { console.warn('Thunder-G: could not cancel message read timer', error); }
  }
}

/* Independent conversation chrome; MIME, remote-content policy and attachments
 * remain in Thunderbird's about:message, never in privileged innerHTML. */
function independentMessageKey(message) {
  return JSON.stringify([message.folder?.URI,message.messageKey]);
}
function independentMessages(messages, anchor) {
  const physical=new Map();
  const subject=header=>String(header?.mime2DecodedSubject ?? header?.subject ?? '')
    .replace(/^\s*(?:(?:(?:re|fw|fwd)\s*:|\[!\])\s*)+/gi,'').normalize('NFC').trim().toLocaleLowerCase();
  const anchorSubject=subject(anchor);
  for(const message of [anchor,...messages]) {
    if(subject(message)!==anchorSubject)continue;
    if(message?.folder?.URI && message.messageKey !== undefined) physical.set(independentMessageKey(message),message);
  }
  const logical=new Map();
  // Keep the selected physical copy if a message is also in Sent/All Mail.
  for(const message of [anchor,...physical.values()]) {
    const key=message.messageId || independentMessageKey(message);
    if(!logical.has(key)) logical.set(key,message);
  }
  return [...logical.values()].sort((a,b)=>(a.dateInSeconds || 0)-(b.dateInSeconds || 0));
}
function independentFolderThread(header) {
  const messages=[];
  try {
    const thread=header.folder.msgDatabase.getThreadContainingMsgHdr(header);
    for(let i=0;i<thread.numChildren;i++) messages.push(thread.getChildHdrAt(i));
  } catch (_) { /* An unindexed/deleted folder still allows the selected message. */ }
  return independentMessages(messages,header);
}
function independentInboxFolder(headers, flags=Ci.nsMsgFolderFlags, removed=new Set()) {
  return headers.find(header=>!removed.has(independentMessageKey(header)) &&
    header.folder?.isSpecialFolder?.(flags.Inbox,false))?.folder || null;
}
function archiveConversationInbox(win, headers, Archiver=null) {
  const messages=conversationPhysicalMessages(headers).filter(header=>
    header.folder?.isSpecialFolder?.(Ci.nsMsgFolderFlags.Inbox,false));
  if(!messages.length)return;
  Archiver ||= ChromeUtils.importESModule('resource:///modules/MessageArchiver.sys.mjs').MessageArchiver;
  if(!Archiver.canArchive(messages,false))throw new Error(gmText("Archiving is disabled for this account."));
  const archiver=new Archiver();
  archiver.msgWindow=win.msgWindow;
  archiver.archiveMessages(messages);
}

function openConversationInbox(win, folder) {
  win.dispatchEvent(new win.CustomEvent('gm-open-label-view'));
  const bar=win.quickFilterBar;
  if(bar?.filterer?.clear){
    bar.filterer.clear();
    bar.updateSearch();
    bar.reflectFiltererState();
  }
  win.displayFolder(folder.URI);
}

function independentReferenceIds(header) {
  const normalize=value=>String(value || '').trim().replace(/^<|>$/g,'');
  const ids=new Set();
  if(header.messageId)ids.add(normalize(header.messageId));
  for(let i=0;i<(header.numReferences || 0);i++) {
    const id=normalize(header.getStringReference(i));if(id)ids.add(id);
  }
  return [...ids];
}
function independentSentFolders() {
  try {
    const configured=new Set(Array.from(MailServices.accounts.allIdentities,identity=>identity.fccFolderURI));
    return Array.from(MailServices.accounts.allFolders).filter(folder=>!folder.isServer &&
      (folder.isSpecialFolder(Ci.nsMsgFolderFlags.SentMail,false) || configured.has(folder.URI)));
  }catch(_){return []}
}
async function independentSentCandidates(win,folders,cancelled) {
  const candidates=[];let visited=0;
  for(const folder of folders) {
    if(cancelled())break;
    try {
      // Local summary headers only: no message-body or server searches.
      for(const header of folder.messages) {
        if(cancelled())return candidates;
        candidates.push({header,ids:independentReferenceIds(header)});
        if(++visited%200===0)await new Promise(resolve=>win.setTimeout(resolve,0));
      }
    }catch(_){/* An unavailable summary must not prevent reading the conversation. */}
  }
  return candidates;
}
// Only local summary metadata is retained; message bodies remain native.
function createSentCandidateCache(win,now=()=>Date.now(),limit=10000,ttl=30000) {
  let entry=null,pending=null,generation=0,closed=false,folderURIs=new Set();
  function invalidate(){generation++;entry=null;pending=null;}
  return {
    get(folders){
      if(closed)return Promise.resolve([]);
      folderURIs=new Set(folders.map(folder=>folder.URI));
      const key=JSON.stringify(folders.map(folder=>{
        let count=null;try{count=folder.getTotalMessages?.(false) ?? null}catch(_){}
        return [folder.URI,count];
      }));
      if(entry?.key===key && entry.expires>now())return Promise.resolve(entry.items);
      if(pending?.key===key)return pending.promise;
      const revision=generation,job={key};
      job.promise=independentSentCandidates(win,folders,()=>closed || revision!==generation).then(items=>{
        if(!closed && revision===generation && items.length<=limit)entry={key,items,expires:now()+ttl};
        return items;
      }).finally(()=>{if(pending===job)pending=null});
      pending=job;return job.promise;
    },
    invalidate,
    invalidateFolders(folders){
      if(!folders || folders.some(folder=>!folder?.URI || folderURIs.has(folder.URI)))invalidate();
    },
    close(){closed=true;invalidate();folderURIs.clear();}
  };
}
// Candidate arrays are immutable snapshots. Reuse their reference index while
// the bounded Sent cache owns the snapshot; weak keys release expired indexes.
var relatedSentIndexes=new WeakMap();
function independentRelatedSent(messages,candidates) {
  let byId=relatedSentIndexes.get(candidates);
  if(!byId){
    byId=new Map();
    for(const candidate of candidates)for(const id of candidate.ids) {
      if(!byId.has(id))byId.set(id,[]);byId.get(id).push(candidate);
    }
    relatedSentIndexes.set(candidates,byId);
  }
  const seen=new Set(),result=[...messages];
  const pending=messages.flatMap(independentReferenceIds),visited=new Set();
  for(let i=0;i<pending.length;i++) {
    const id=pending[i];if(visited.has(id))continue;visited.add(id);
    for(const candidate of byId.get(id) || []) {
      if(seen.has(candidate))continue;seen.add(candidate);
      result.push(candidate.header);pending.push(...candidate.ids);
    }
  }
  return result;
}
function independentConversation(win, header, gloda, sentFolders=[],sentCache=null) {
  const fallback=independentFolderThread(header);
  let finish,timer,settled=false,localDone=sentFolders.length===0,indexDone=!gloda,indexed=false;
  let sent=[],indexedMessages=[];
  const collections=[];
  const promise=new Promise(resolve=>{
    finish=()=>{
      if(settled)return;
      settled=true;if(timer!==undefined)win.clearTimeout(timer);
      collections.length=0;
      const messages=independentRelatedSent([...fallback,...indexedMessages],sent);
      resolve({messages:independentMessages(messages,header),indexed});
    };
    const complete=()=>{if(localDone && indexDone)finish()};
    if(sentFolders.length)(sentCache?sentCache.get(sentFolders):independentSentCandidates(win,sentFolders,()=>settled)).then(result=>{
      sent=result;localDone=true;complete();
    },()=>{localDone=true;complete()});
    if(!gloda){complete();return}
    const finishIndex=(messages=[],available=false)=>{
      if(settled || indexDone)return;
      if(timer!==undefined)win.clearTimeout(timer);
      indexedMessages=messages;indexed=available;indexDone=true;complete();
    };
    timer=win.setTimeout(()=>finishIndex(),2500);
    const listener=completeQuery=>({onItemsAdded(){},onItemsModified(){},onItemsRemoved(){},
      onQueryCompleted(collection){if(!settled && !indexDone) {try{completeQuery(collection)}catch(_){finishIndex()}}}});
    try {
      collections.push(gloda.getMessageCollectionForHeader(header,listener(collection=>{
        const conversation=collection.items[0]?.conversation;
        if(!conversation) {finishIndex();return}
        collections.push(conversation.getMessagesCollection(listener(result=>{
          finishIndex(result.items.map(item=>item.folderMessage).filter(Boolean),true);
        })));
      })));
    }catch(_){finishIndex()}
  });
  return {promise,cancel(){finish()}};
}
// Measure the contents, not body.scrollHeight: the latter includes the current
// viewport and leaves an artificial blank area when a short message is loaded.
function independentContentHeight(content) {
  if(!content?.body)return null;
  const range=content.createRange();
  range.selectNodeContents(content.body);
  const bounds=range.getBoundingClientRect(),body=content.body.getBoundingClientRect();
  const css=content.defaultView.getComputedStyle(content.body);
  return Math.max(48,Math.ceil(bounds.bottom-body.top+
    (parseFloat(css.marginTop)||0)+(parseFloat(css.marginBottom)||0)+(parseFloat(css.paddingBottom)||0)));
}
// Each card grows to fit its message. A second root scrollport can retain a
// small margin overflow and trap trackpad momentum inside the message viewer.
function lockIndependentViewport(content) {
  const root=content.documentElement,style=root.style;
  const value=style.getPropertyValue('overflow-y'),priority=style.getPropertyPriority('overflow-y');
  style.setProperty('overflow-y','hidden','important');
  if(content.scrollingElement)content.scrollingElement.scrollTop=0;
  return ()=>{
    try {
      if(value)style.setProperty('overflow-y',value,priority);
      else style.removeProperty('overflow-y');
    }catch(_){ /* The native message document may already have been destroyed. */ }
  };
}
// Native message viewers are separate browsing contexts. Hand off vertical wheel
// gestures explicitly when their content cannot consume them (notably macOS
// trackpad gestures over auto-sized plain-text messages).
function installIndependentScrollBridge(content, host, ignoreBrowsers = false) {
  const wheel = event => {
    if (event.defaultPrevented || !event.cancelable || event.ctrlKey || event.metaKey ||
        event.altKey || event.shiftKey || !event.deltaY ||
        Math.abs(event.deltaX || 0) > Math.abs(event.deltaY)) return;
    // The envelope must not steal gestures from an embedded native viewer.
    if (ignoreBrowsers && event.target?.closest?.('browser,iframe')) return;
    const view = content.defaultView;
    // The viewer is sized to its content: the conversation owns root scrolling.
    // Ignore residual body/root overflow from margins and rounding, but preserve
    // intentionally scrollable elements inside an HTML message.
    for (let node = event.target?.nodeType === 3 ? event.target.parentElement : event.target;
         node; node = node.parentElement) {
      if (node.nodeType !== 1) continue;
      if (node === content.scrollingElement || node === content.documentElement || node === content.body) continue;
      if (!['auto','scroll'].includes(view.getComputedStyle(node).overflowY)) continue;
      const max = node.scrollHeight - node.clientHeight;
      if (max > 1 && (event.deltaY > 0 ? node.scrollTop < max - 1 : node.scrollTop > 1)) return;
    }
    const max = Math.max(0, host.scrollHeight - host.clientHeight);
    if (event.deltaY > 0 ? host.scrollTop >= max : host.scrollTop <= 0) return;
    const unit = event.deltaMode === 1
      ? parseFloat(view.getComputedStyle(content.body).lineHeight) || 16
      : event.deltaMode === 2 ? host.clientHeight : 1;
    event.preventDefault();
    host.scrollTop = Math.max(0, Math.min(max, host.scrollTop + event.deltaY * unit));
  };
  content.addEventListener('wheel', wheel, {passive:false});
  return () => {
    try { content.removeEventListener('wheel', wheel); } catch (_) { /* Viewer already destroyed. */ }
  };
}
// RFC 5322 Sender describes an agent sending on behalf of From. It is
// header metadata, not a verified identity or a guess from relay hostnames.
function independentViaDomain(from,sender,parser) {
  try {
    const addresses=parser.parseDecodedHeader(sender || '');
    if(addresses.length!==1)return null;
    const domain=addresses[0].email?.split('@').at(-1)?.toLowerCase();
    const fromDomain=from.split('@').at(-1)?.toLowerCase();
    return domain && /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(domain) && domain.includes('.') && domain!==fromDomain?domain:null;
  }catch(_){return null;}
}
function independentSenderSelected(selection,sender) {
  return !!selection && !selection.isCollapsed &&
    (sender.contains?.(selection.anchorNode) || sender.contains?.(selection.focusNode));
}
function independentAvatar(address) {
  try { return MailServices.ab.cardForEmailAddress(address)?.photoURL || null; }
  catch (_) { return null; }
}
function independentTagKey(event) {
  if(typeof gmailComposerTypingTarget==='function' && gmailComposerTypingTarget(event))return null;
  const target=event.composedPath?.()[0] || event.target;
  if(event.defaultPrevented || event.isComposing || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ||
    target?.isContentEditable || target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]'))return null;
  return /^[0-9]$/.test(event.key || '')?Number(event.key):null;
}
function independentDkimStatus(header, live) {
  let data=live;
  if(!data)try {data=JSON.parse(header.getStringProperty('dkim_verifier@pl-result') || 'null')}catch(_){}
  const version=String(data?.version || '').split('.')[0];
  const result=version==='1'?data:['2','3'].includes(version)?data?.dkim?.[0]:null;
  const domain=result?.sdid || result?.SDID || '';
  if(result?.result==='SUCCESS') {
    const warning=Array.isArray(result.warnings) && result.warnings.length>0;
    return {tone:warning?'warning':'success',label:warning?gmText("DKIM verified · warning"):gmText("DKIM verified"),detail:domain};
  }
  if(result?.result==='PERMFAIL')return {tone:'failure',label:gmText("DKIM failed"),detail:result.errorType || ''};
  if(result?.result==='TEMPFAIL')return {tone:'warning',label:gmText("DKIM temporary error"),detail:result.errorType || ''};
  if(result?.result==='none' || result?.result==='NOSIG')return {tone:'warning',label:gmText("DKIM unsigned"),detail:''};
  return {tone:'warning',label:gmText("DKIM not checked"),detail:gmText("No saved DKIM Verifier result is available for this message")};
}
function independentBimiDomain(address,result,baseDomain) {
  const from=address.split('@').at(-1)?.toLowerCase();
  if(!from || !result?.dkim?.some(signature=>signature.result==='SUCCESS' && signature.sdid && baseDomain(signature.sdid.toLowerCase())===baseDomain(from)))return null;
  return from;
}
// Keep native message-menu actions and add compose actions scoped to this card.
// The header is captured here: expanding another card must never redirect Forward.
function installIndependentMessageActions(frame,header,isCurrent,runCommand){
  const doc=frame.contentDocument,popup=doc.getElementById('otherActionsPopup');
  const removers=[],items=[];
  function bind(node,command){
    const handler=event=>{
      if(!isCurrent())return;
      event.preventDefault();event.stopImmediatePropagation();
      popup?.hidePopup?.();runCommand(command,header);
    };
    node.addEventListener('command',handler,true);
    removers.push(()=>node.removeEventListener('command',handler,true));
  }
  if(popup && doc.createXULElement){
    const before=popup.firstChild;
    for(const [label,command] of [['Reply','cmd_replySender'],['Reply all','cmd_replyall'],['Forward','cmd_forwardInline']]){
      const item=doc.createXULElement('menuitem');
      item.id='gm-message-'+command;gmBindAction(item,'label',gmText(label),true);
      bind(item,command);popup.insertBefore(item,before);items.push(item);
    }
    const separator=doc.createXULElement('menuseparator');popup.insertBefore(separator,before);items.push(separator);
  }
  // Also honor an exposed native Forward button, independent of the global
  // forwarding preference (our conversation action always forwards inline).
  const forward=doc.getElementById('hdrForwardButton');if(forward)bind(forward,'cmd_forwardInline');
  return {close(){for(const remove of removers)remove();for(const item of items)item.remove();}};
}
// ContextMenuParent routes message-body events to about:3pane, even for our
// embedded readers. Use the originating message's menu and command controller.
function installIndependentContextMenu(win, resolve) {
  const original=win.openContextMenu;
  function openContextMenu(message,browser,...args) {
    const target=resolve(browser);
    if(!target)return original?.call(this,message,browser,...args) ?? false;
    const {window:messageWindow,activate}=target;
    const menu=messageWindow.mailContextMenu;
    const popup=messageWindow.document.getElementById('mailContext');
    // Never fall back to the inbox selection for one of our own messages.
    if(!menu || !popup)return true;
    activate();
    menu.setAsMessagePaneContextMenu(message.data,message.target.browsingContext);
    const ratio=messageWindow.devicePixelRatio || win.devicePixelRatio || 1;
    popup.openPopupAtScreen(message.data.context.screenXDevPx/ratio,
      message.data.context.screenYDevPx/ratio,true);
    return true;
  }
  win.openContextMenu=openContextMenu;
  return {close(){if(win.openContextMenu===openContextMenu)win.openContextMenu=original;}};
}

// Keep the conversation viewport stable across a local card update. Measure at
// update time, so scrolling performed while a Sent copy loads is respected.
function preserveReaderPosition(host,card,update) {
  const scroll=host.scrollTop || 0,top=card.getBoundingClientRect?.().top;
  update();
  const after=card.getBoundingClientRect?.().top;
  host.scrollTop=Number.isFinite(top) && Number.isFinite(after)?(host.scrollTop || 0)+after-top:scroll;
}
function pendingReplyText(value) {
  const text=String(value || '').replace(/\r\n/g,'\n');
  const signature=text.search(/\n-- ?\n/);
  const main=signature<0?text:text.slice(0,signature),sig=signature<0?'':text.slice(signature+1);
  const quote=main.search(/(?:^|\n)(?:On [^\n]+wrote:\n(?=>)|>)/);
  if(quote>=0){
    const quoted=main.slice(quote).trimStart().split('\n');
    if(/^On .+wrote:$/.test(quoted[0]))quoted.shift();
    // A bottom-posted or interleaved answer must never disappear with history.
    if(quoted.some(line=>line.trim() && !/^\s*>/.test(line)))return {body:main,quote:'',signature:sig};
    if(!main.slice(0,quote).trim())return {body:main,quote:'',signature:sig};
  }
  return {body:quote<0?main:main.slice(0,quote),quote:quote<0?'':main.slice(quote).trimStart(),signature:sig};
}

// Fold only unambiguous top-posted history. Keep bottom/inline replies and
// uncertain layouts expanded; signature text is not evidence of a new answer.
function foldableQuotedHistory(content,quotes) {
  if(!quotes.length || !content.createTreeWalker || !content.body)return false;
  const walker=content.createTreeWalker(content.body,4);let before=false,node;
  while((node=walker.nextNode())){
    if(!node.textContent?.trim() || node.parentElement?.closest('blockquote[type="cite"], .gmail_quote, .moz-cite-prefix, .moz-signature, script, style'))continue;
    if(node.compareDocumentPosition(quotes[0]) & 4)before=true;
    else return false;
  }
  return before;
}

function installIndependentReader(win) {
  const doc=win.document,layout=doc.getElementById('paneLayout');
  let closed=false,ticket=0,query=null,revealFrame=null,resolving=false;
  const host=doc.createElement('section');host.className='gm-independent-reader';host.hidden=true;
  gmBindAttribute(host, 'aria-label', () => gmText("Thunder-G conversation"));layout.append(host);
  const root=host.attachShadow({mode:'open'});
  const previews=createPreviewQueue(win);
  const sentCache=createSentCandidateCache(win);
  const style=doc.createElement('style');style.textContent=`
    :host { grid-area:message; display:block; min-width:0; min-height:0; overflow:auto;
      color:var(--layout-color-0,#202124); background:var(--layout-background-0,white);
      font:inherit; border-radius:0 0 1em 1em; }
    :host([hidden]) { display:none !important; }
    .conversation { --message-inset:56px; padding:14px 16px 20px; color-scheme:light dark; }
    h1 { margin:0 0 16px var(--message-inset); font-size:1.6em; line-height:1.4; font-weight:400; overflow-wrap:anywhere; user-select:text; cursor:text; }
    .snooze-notice{margin:-14px -16px 20px;padding:18px 16px 18px 72px;background:var(--layout-background-1,#f5f5f5);color:var(--layout-color-1,#5f6368);font-size:.95em;}
    .snooze-notice[hidden]{display:none}
    .scope,.status { font-size:.85em; opacity:.75; margin:0 0 8px var(--message-inset); }
    .title-tags { display:inline-flex; flex-wrap:wrap; gap:4px; margin-inline-start:10px; vertical-align:middle; font-size:.6em; font-weight:400; }
    .cards { display:flex; flex-direction:column; }
    article { position:relative; border-block-end:1px solid var(--layout-border-0,#eceff1); padding:10px 0; }
    article[data-active-message]::before { content:''; position:absolute; inset-inline-start:-8px;
      inset-block-start:10px; block-size:40px; inline-size:3px; border-radius:3px;
      background:var(--focus-outline-color,#1a73e8); pointer-events:none; }
    @media(forced-colors:active) { article[data-active-message]::before { background:Highlight; forced-color-adjust:none; } }
    article[data-expanded] { padding:10px 0 0; }
    article:last-child { border-block-end:0; }
    .card-header { display:flex; align-items:flex-start; gap:16px; min-block-size:40px; }
    article:not([data-expanded]) .address { display:none; }
    .toggle { display:flex; align-items:center; gap:16px; flex:1; min-width:0;
      text-align:start; font:inherit; color:inherit; background:transparent; border:0; cursor:pointer; padding:0; line-height:1.4; }
    .toggle:not([aria-disabled="true"]):hover { background:var(--treeitem-background-hover,#e9eef6); border-radius:.5em; }
    button:focus-visible { outline:2px solid var(--focus-outline-color,#1a73e8); outline-offset:2px; }
    .avatar { display:flex; align-items:center; justify-content:center; flex:0 0 40px;
      inline-size:40px; block-size:40px; border-radius:50%; background:#d3e3fd; color:#174ea6; font-weight:600; }
    .sender { display:grid; grid-template-columns:minmax(0,auto) minmax(0,1fr); flex:1; min-width:0; overflow:hidden; padding-block-start:1px; }
    .sender > .name { grid-column:1; grid-row:1; }
    .sender > :is(.address,.preview) { grid-column:1 / -1; grid-row:2; }
    .sender > .tags { grid-column:2; grid-row:1; align-self:center; margin:0 0 0 8px; }
    .message-meta { display:flex; flex-wrap:wrap; justify-content:flex-end; align-items:center; gap:6px 10px; max-inline-size:45%; }
    .dkim-status { display:inline-flex; align-items:center; font-size:.8em; line-height:1.5; padding:1px 7px; border-radius:4px; white-space:nowrap; }
    .dkim-status[data-tone="success"] { background:light-dark(#ceead6,#183e29); color:light-dark(#137333,#a8dab5); }
    .dkim-status[data-tone="warning"] { background:light-dark(#feefc3,#493617); color:light-dark(#8a4b00,#fdd663); }
    .dkim-status[data-tone="failure"] { background:light-dark(#fce8e6,#4c2524); color:light-dark(#b3261e,#f6aea9); }
    .avatar img { inline-size:100%; block-size:100%; border-radius:inherit; object-fit:cover; }
    .name,.address,.via { user-select:text; cursor:text; }
    .via { font-weight:400; margin-inline-start:.35em; }
    .name { display:block; font-weight:600; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
    .address { display:block; font-size:.85em; opacity:.75; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
    time { font-size:.85em; white-space:nowrap; opacity:.8; padding-block-start:2px; }
    .tags { display:flex; flex-wrap:wrap; gap:.35em; margin:4px 0 4px var(--message-inset); }
    .tags:empty { display:none; }
    .tag { display:inline-flex; align-items:center; gap:4px; max-inline-size:100%;
      box-sizing:border-box; font:400 .85em/1.25 var(--gm-ui-font, Arial,sans-serif);
      border-radius:.35em; padding:2px 6px; }
    .tag-label { display:inline-flex; align-items:center; min-block-size:1.25em; overflow-wrap:anywhere; }
    .tag-remove { appearance:none; display:inline-flex; align-items:center; justify-content:center; flex:none;
      box-sizing:border-box; inline-size:1.25em; block-size:1.25em;
      min-inline-size:0; min-block-size:0; margin:0; padding:0; border:0; border-radius:50%;
      font:inherit; line-height:1.25; background:transparent; color:inherit; cursor:pointer; }
    .tag-remove:hover { background:light-dark(#0002,#fff2); }
    .preview { display:block; margin:2px 0 0; font-size:.9em; font-weight:400; opacity:.75; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
    .actions { display:flex; flex-wrap:wrap; gap:.5em; margin:16px 0 4px var(--message-inset); }
    .actions button,.fallback { display:inline-flex; align-items:center; justify-content:center; gap:9px; min-block-size:36px; min-inline-size:104px; font:inherit;color:inherit; background:transparent; border:1px solid var(--layout-border-0,#dadce0); border-radius:1.5em; padding:6px 18px; cursor:pointer; }
    .gm-pending-recipients { background:var(--layout-background-1,#f8f9fa); border-bottom:1px solid var(--layout-border-0,#dadce0); padding:12px 10px; margin-bottom:12px; font-size:.9em; }
    .gm-permanent-sent-card .gm-permanent-reply{appearance:none;border:0;border-radius:50%;background:transparent;color:inherit;inline-size:32px;block-size:32px;padding:6px;cursor:pointer}
    .gm-permanent-reply > span{display:block;inline-size:20px;block-size:20px;background:currentColor;mask:var(--gm-default-reply-icon) center/contain no-repeat}
    .gm-permanent-sent-card .gm-permanent-reply:disabled{opacity:.4;cursor:default}
    .gm-sent-view-controls{display:flex;gap:8px;margin:8px 0 8px var(--message-inset)}
    .gm-open-saved-message{display:inline-flex;inline-size:auto!important;max-inline-size:max-content;min-inline-size:0;appearance:none;background:transparent;color:var(--layout-color-1,inherit);border:0;border-radius:4px;padding:4px 8px;font:inherit;font-size:.85em;line-height:1.4;cursor:pointer;text-align:start}
    .gm-open-saved-message:hover{background:light-dark(#20212414,#ffffff20)}
    .gm-sent-attachments{display:flex;flex-wrap:wrap;gap:12px;max-inline-size:548px;margin:8px 0 12px var(--message-inset);font-size:.9em}
    .gm-sent-attachments[hidden]{display:none}
    .gm-sent-attachment{position:relative;display:grid;grid-template-columns:1fr 1fr;inline-size:100px;max-inline-size:100%;border:1px solid var(--layout-border-0,#dadce0);border-radius:3px;overflow:hidden;background:var(--layout-background-0,#fff)}
    .gm-sent-attachment .gm-sent-attachment-preview{border:0;border-radius:0;margin:0;padding:0;inline-size:100%;grid-column:1 / -1;order:-1;display:flex;align-items:center;justify-content:center;block-size:60px;background:light-dark(#f8f9fa,#24262a);overflow:hidden}
    .gm-sent-attachment-preview img{inline-size:100%;block-size:100%;object-fit:contain;background:white}
    .gm-sent-attachment-preview .gm-sent-attachment-filetype{inline-size:32px;block-size:32px;object-fit:contain;background:transparent}
    .gm-sent-attachment-name img{inline-size:16px;block-size:16px;vertical-align:middle;margin-inline-end:5px}
    .gm-sent-attachment[data-kind="pdf"] .gm-sent-attachment-filetype{color:#d93025}
    .gm-attachment-heading{display:flex;align-items:center;gap:12px;margin:18px 0 8px var(--message-inset);border-top:1px solid var(--layout-border-0,#dadce0);padding-top:12px;font-size:.9em;font-weight:600}
    .gm-attachment-heading[hidden]{display:none}
    .gm-attachment-heading button{appearance:none;background:transparent;color:inherit;border:0;border-radius:50%;padding:4px 8px;font-size:18px;cursor:pointer}
    .gm-sent-attachment[data-filetype="word"]{--gm-file-color:#185abc}
    .gm-sent-attachment[data-filetype="sheet"]{--gm-file-color:#188038}
    .gm-sent-attachment[data-filetype="slides"]{--gm-file-color:#e8710a}
    .gm-sent-attachment[data-filetype="pdf"]{--gm-file-color:#d93025}

    .gm-sent-attachment .gm-sent-attachment-filetype{color:var(--gm-file-color,#697386)}
    .gm-sent-attachment-name{grid-column:1 / -1;display:block;padding:4px 6px;font-size:.85em;background:light-dark(#f5f5f5,#303134);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .gm-sent-attachment button{min-inline-size:0;font:inherit;font-size:.75em;color:inherit;background:transparent;border:1px solid var(--layout-border-0,#dadce0);border-radius:16px;padding:3px 4px;margin:3px 2px;cursor:pointer}
    .gm-sent-attachment button:disabled{opacity:.45;cursor:default}
    .gm-sent-attachment-status{grid-column:1 / -1;display:block;font-size:.85em;margin:0 8px 5px;overflow-wrap:anywhere}
    .gm-sent-attachment-status:empty{display:none}
    .gm-sent-rich-content { margin:0 10px 12px; overflow-wrap:anywhere; line-height:1.35; }
    .gm-sent-rich-content pre { white-space:pre-wrap; }
    .gm-sent-rich-content table { max-width:100%; }
    .gm-sent-rich-content blockquote { border-inline-start:2px solid #dadce0; padding-inline-start:1em; margin-inline-start:1em; }
    .gm-pending-text { margin:0 10px 12px; white-space:pre-wrap; overflow-wrap:anywhere; font:1em/1.35 var(--gm-code-font, monospace); }
    .gm-pending-signature { opacity:.65; }
    article { position:relative; }

    :is(.actions button) { position:relative; isolation:isolate; background:transparent !important; }
    :is(.actions button):is(:hover,:focus-visible) { background:transparent !important; }
    :is(.actions button)::before {
      content:''; position:absolute; inset:0; border-radius:inherit; z-index:-1;
      pointer-events:none; background:light-dark(#20212414,#ffffff20); opacity:0; transform:scale(.65);
    }
    :is(.actions button):is(:hover,:focus-visible):not(:disabled):is(:hover,:focus-visible) { background:transparent !important; }
    :is(.actions button):is(:hover,:focus-visible):not(:disabled)::before { opacity:1; transform:scale(1); }
    @media (prefers-reduced-motion:no-preference) {
      :is(.actions button):is(:hover,:focus-visible) { background:transparent !important; }
    :is(.actions button)::before { transition:transform 180ms cubic-bezier(.2,0,0,1), opacity 120ms ease-out; }
    }
    .body { display:flex; min-height:0; flex-direction:column; margin-inline-start:var(--message-inset); }
    .quote-toggle { align-self:flex-start; min-inline-size:22px; block-size:16px;
      padding:0 5px; margin:4px 0 8px; border:0; border-radius:3px;
      background:var(--treeitem-background-hover,#e8eaed); color:inherit; font:bold 14px/12px var(--gm-ui-font, sans-serif); cursor:pointer; }
    .history-gap { position:relative; display:flex; align-items:center; min-block-size:48px; margin:8px 0; }
    .history-gap::before { content:''; position:absolute; inset-inline:0; inset-block-start:50%; border-block-start:1px solid var(--layout-border-0,#e8eaed); }
    .history-expand { position:relative; display:inline-flex; align-items:center; justify-content:center;
      inline-size:40px; block-size:40px; margin:0; padding:0; border:1px solid var(--layout-border-0,#dadce0);
      border-radius:50%; background:var(--layout-background-0,#fff); color:inherit; font:600 .9em/1 var(--gm-ui-font, Arial,sans-serif); cursor:pointer; }
    .history-expand:hover { background:var(--treeitem-background-hover,#e9eef6); }
    .history-expand:focus-visible { outline:2px solid Highlight; outline-offset:2px; }
    .action-icon { display:inline-block; inline-size:20px; block-size:20px; background:currentColor; flex:none; }
    .action-icon.reply { mask:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20d%3D%22M9%205%203%2011l6%206%20M3%2011h9a7%207%200%200%201%207%207%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%221.8%22%20stroke-linejoin%3D%22round%22%20stroke-linecap%3D%22round%22%2F%3E%3C%2Fsvg%3E") center/contain no-repeat; }
    .action-icon.reply-all { mask:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20d%3D%22M7%205%201%2011l6%206%20M12%205l-6%206%206%206%20M6%2011h8a7%207%200%200%201%207%207%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%221.8%22%20stroke-linejoin%3D%22round%22%20stroke-linecap%3D%22round%22%2F%3E%3C%2Fsvg%3E") center/contain no-repeat; }
    .action-icon.forward { mask:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20d%3D%22M15%205l6%206-6%206%20M21%2011h-9a7%207%200%200%200-7%207%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%221.8%22%20stroke-linejoin%3D%22round%22%20stroke-linecap%3D%22round%22%2F%3E%3C%2Fsvg%3E") center/contain no-repeat; }

    browser { display:block; flex:none; inline-size:100%; block-size:24em; min-block-size:0; border:0; }
    [hidden] { display:none !important; }
    @media(max-width:650px) { .conversation { --message-inset:48px; padding:12px; } .toggle {gap:8px;} time {font-size:.75em;} h1 {font-size:1.4em;} .card-header {gap:8px;} }
  `;
  const layoutStyle=doc.createElement('style');layoutStyle.textContent=`
    #paneLayout.gm-independent-open > #messagePane { display:none !important; }
    #paneLayout > .gm-independent-reader { grid-area:message; min-width:0; min-height:0; }
    #paneLayout > .gm-independent-reader[hidden] { display:none !important; }
  `;doc.head.append(layoutStyle);
  const conversation=doc.createElement('div');conversation.className='conversation';
  const title=doc.createElement('h1'),scope=doc.createElement('p'),status=doc.createElement('p'),cards=doc.createElement('div');
  scope.className='scope';scope.hidden=true;
  status.className='status';status.setAttribute('role','status');cards.className='cards';
  const snoozeNotice=doc.createElement('div');snoozeNotice.className='snooze-notice';snoozeNotice.hidden=true;snoozeNotice.setAttribute('role','status');
  conversation.append(snoozeNotice,title,scope,status,cards);root.append(style,conversation);
  const removedInboxMessages=new Set();
  const titleTags=doc.createElement('span');titleTags.className='title-tags';gmBindAttribute(titleTags, 'aria-label', () => gmText("Labels in this conversation"));
  const cleanups=new Set(),tagRenderers=new Set(),securityRenderers=new Set(),frames=new Map(),messageDocs=new Map(),messageCards=new Map();let currentHeaders=[],actionHeader=null,activeHeader=null,activeCard=null,historyExpanded=false;
  const snoozeService=typeof thunderGSnooze!=='undefined'?thunderGSnooze:null;
  function refreshSnooze(){
    const reminder=typeof snoozeDisplayReminder==='function'?snoozeDisplayReminder(snoozeService,currentHeaders):null;
    snoozeNotice.hidden=!reminder;
    snoozeNotice.textContent=reminder?snoozeReminderText(reminder,gmLocale()):'';
  }
  const stopSnooze=snoozeService?.subscribe(refreshSnooze);
  const zoomResizers=new Map(),permanentBodies=new Set();let savedViewSequence=0;
  let messageZoom=null,thumbnailQueue=Promise.resolve();
  function zoomConversation(action) {
    if(closed || host.hidden)return false;
    const manager=win.top?.ZoomManager || win.ZoomManager;
    const method={increaseSize:'enlarge',reduceSize:'reduce',resetSize:'reset'}[action];
    const panes=[...frames.values()].map(frame=>frame.contentDocument.getElementById('messagepane')).filter(Boolean);
    if(manager && method && panes.length){
      manager[method](panes[0]);messageZoom=manager.getZoomForBrowser(panes[0]);
      for(const pane of panes)manager.setZoomForBrowser(pane,messageZoom);
      for(const body of permanentBodies)body.style.zoom=String(messageZoom);
      for(const resize of zoomResizers.values())resize();
    }
    if(method && !panes.length && permanentBodies.size){
      messageZoom=action==='resetSize'?1:Math.max(.3,Math.min(5,(messageZoom||1)*(action==='increaseSize'?1.1:1/1.1)));
      for(const body of permanentBodies)body.style.zoom=String(messageZoom);
    }
    return true;
  }
  function activateMessage(header) {
    const card=messageCards.get(header);
    if(closed || !card || activeCard===card)return;
    activeCard?.removeAttribute('data-active-message');activeCard?.removeAttribute('aria-current');
    activeHeader=header;activeCard=card;
    card.setAttribute('data-active-message','');card.setAttribute('aria-current','true');
  }
  const contextMenu=installIndependentContextMenu(win,browser=>{
    const header=messageDocs.get(browser?.ownerDocument);
    if(!header || browser.ownerDocument.getElementById('messagepane')!==browser)return null;
    return {window:browser.ownerDocument.defaultView,activate:()=>activateMessage(header)};
  });
  const actions=doc.createElement('div');actions.className='actions';actions.setAttribute('role','group');gmBindAttribute(actions, 'aria-label', () => gmText("Reply to conversation"));
  const buttons=[],pendingReplies=new Map(),pendingSentCopies=new Map();
  const normalizeSendId=value=>String(value || '').trim().replace(/^<|>$/g,'');
  function notifyLabelScope(){if(win.CustomEvent)win.dispatchEvent(new win.CustomEvent('gm-conversation-messages-changed'));}
  function reconcilePendingReplies() {
    for(const [id,entry] of pendingReplies) {
      if(entry.messageId && currentHeaders.some(header=>normalizeSendId(header.messageId)===normalizeSendId(entry.messageId))) {
        permanentBodies.delete(entry.body);entry.card.remove();pendingReplies.delete(id);
      }
    }
  }
  function sendFeedback(state,token) {
    if(closed || host.hidden || token!==ticket)return;
    if(['saving-draft','draft-saved','draft-error'].includes(state.state)) {
      permanentBodies.delete(pendingReplies.get(state.id)?.body);pendingReplies.get(state.id)?.card.remove();pendingReplies.delete(state.id);if(!pendingReplies.size)pendingSentCopies.clear();return;
    }
    let entry=pendingReplies.get(state.id);
    if(!entry) {
      const card=doc.createElement('article');card.className='gm-pending-reply';card.setAttribute('data-expanded','');
      let name=state.from || gmText("Me"),address='';
      try{const from=MailServices.headerParser.parseDecodedHeader(name)[0];name=from?.name || from?.email || name;address=from?.email || '';}catch(_){}
      const heading=text('div','card-header',''),toggle=text('div','toggle','');
      const initials=name.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toLocaleUpperCase();
      const avatar=text('span','avatar',initials),sender=text('span','sender',''),photo=independentAvatar(address);
      if(photo){const image=doc.createElement('img');image.alt='';image.setAttribute('src',photo);image.addEventListener('error',()=>avatar.replaceChildren(doc.createTextNode(initials)),{once:true});avatar.replaceChildren(image);}
      sender.append(text('span','name',name),text('span','address',address));toggle.append(avatar,sender);
      const meta=text('div','message-meta',''),date=new Date(state.date || Date.now());
      const time=text('time','',conversationDateText(date,gmLocale()));
      time.dateTime=date.toISOString();time.title=date.toLocaleString(gmLocale());
      const notice=text('span','dkim-status','');notice.setAttribute('role','status');meta.append(time,notice);heading.append(toggle,meta);
      const body=text('div','body gm-pending-body',''),recipients=text('div','gm-pending-recipients','');
      recipients.append(gmBindValue(text('strong', '', ''), 'textContent', () => gmText("To ")),text('span','',state.to || ''));
      if(state.cc)recipients.append(gmBindValue(text('span', '', ''), 'textContent', () => gmText(" · Cc $1", state.cc)));
      const rich=typeof permanentSentCardsEnabled!=='undefined' && permanentSentCardsEnabled && state.richBody?renderSentRichContent(doc,state.richBody,href=>{
        Cc['@mozilla.org/uriloader/external-protocol-service;1'].getService(Ci.nsIExternalProtocolService).loadURI(Services.io.newURI(href));
      }):null;
      const parts=pendingReplyText(state.body),message=text('pre','gm-pending-text',parts.body),signature=text('pre','gm-pending-text gm-pending-signature',parts.signature);
      body.append(recipients);if(rich)body.append(rich);else {body.append(message);if(parts.signature)body.append(signature);}
      if(!rich && parts.quote){
        const quoted=text('pre','gm-pending-text',parts.quote);quoted.hidden=true;
        const reveal=text('button','quote-toggle','…');reveal.type='button';gmBindAttribute(reveal, 'aria-label', () => gmText("Show quoted text"));reveal.setAttribute('aria-expanded','false');
        reveal.addEventListener('click',()=>{quoted.hidden=!quoted.hidden;entry.quoteExpanded=!quoted.hidden;reveal.setAttribute('aria-expanded',String(!quoted.hidden));gmBindAttribute(reveal, 'aria-label', () => quoted.hidden?gmText("Show quoted text"):gmText("Hide quoted text"));});
        body.append(quoted,reveal);
      }
      let attachmentControls=null;
      if(typeof permanentSentCardsEnabled!=='undefined' && permanentSentCardsEnabled){
        attachmentControls=text('div','gm-sent-attachments','');attachmentControls.hidden=!state.attachments?.length;
        for(const name of state.attachments || []){const row=text('div','gm-sent-attachment',''),filename=text('span','gm-sent-attachment-name',name);filename.insertBefore(nativeAttachmentIcon(doc,{name},16),filename.firstChild || null);row.append(filename);
          for(const label of ['Open','Save']){const button=text('button','',label);button.type='button';button.disabled=true;row.append(button);}
          row.append(text('span','gm-sent-attachment-status','Available when the saved message finishes loading.'));
          const placeholder=text('button','gm-sent-attachment-preview',''),icon=nativeAttachmentIcon(doc,{name},32);placeholder.type='button';placeholder.disabled=true;icon.className='gm-sent-attachment-filetype';placeholder.append(icon);row.append(placeholder);attachmentControls.append(row);}

      }else if(state.attachments?.length)body.append(text('div','address',state.attachments.join(' · ')));
      let savedButton=null,viewControls=null;
      if(typeof permanentSentCardsEnabled!=='undefined' && permanentSentCardsEnabled){
        permanentBodies.add(body);body.style.zoom=String(messageZoom || 1);
        viewControls=text('div','gm-sent-view-controls','');
        savedButton=text('button','gm-open-saved-message','Show saved formatting / attachments');savedButton.type='button';savedButton.disabled=true;
        savedButton.setAttribute('aria-expanded','false');savedButton.title='Show the saved message inside this card. No separate window opens.';
        savedButton.addEventListener('click',()=>{if(!closed && token===ticket && !savedButton.disabled)entry?.showSaved?.();});viewControls.append(savedButton);
      }
      card.append(heading,body);if(viewControls)card.append(viewControls);if(attachmentControls)card.append(attachmentControls);cards.append(card);entry={card,notice,body,savedButton,viewControls,attachmentControls};pendingReplies.set(state.id,entry);
      card.scrollIntoView({block:'nearest',inline:'nearest'});
    }
    entry.messageId=state.messageId;gmBindValue(entry.notice, "textContent", () => state.state==='sent'?gmText("Sent"):gmText("Sending…"));
    // A forward may have no References header. Match only the exact Message-ID
    // from this composer, including when the Sent copy arrived before feedback.
    for(const header of [...pendingSentCopies.values()])tagListener.msgAdded(header);
    if(state.state==='sent' && entry.messageId){
      // Recover even if the native notification arrived before this preview or
      // during a reader refresh. Exact-ID summary lookup only, never a scan.
      for(const folder of independentSentFolders())try{
        const header=folder.msgDatabase?.getMsgHdrForMessageID(normalizeSendId(entry.messageId));
        if(header && normalizeSendId(header.messageId)===normalizeSendId(entry.messageId))tagListener.msgAdded(header);
      }catch(_){/* A later copy notification may still hydrate the preview. */}
    }
    reconcilePendingReplies();
    if(!currentHeaders.length && pendingReplies.size){
      status.textContent=gmCount('$1 message','$1 messages',pendingReplies.size);status.hidden=false;
      gmBindValue(status,'title',()=>gmText('Waiting for the saved Sent copy before applying labels.'));
    }
  }
  function runCommand(command,target=actionHeader) {
    if(typeof inlineReplyEnabled!=='undefined' && inlineReplyEnabled && ['cmd_replySender','cmd_replyall','cmd_forwardInline'].includes(command)) {
      let composer=inlineComposeControllers.get(win);
      if(!composer){composer=createInlineComposeDeck(win);inlineComposeControllers.set(win,composer);}
      const token=ticket,labelHeaders=currentHeaders.slice();
      composer.open(target,command,{container:conversation,scrollHost:host,isCurrent:()=>token===ticket,
        labelMessages:()=>token===ticket?currentHeaders:labelHeaders,onSendState:state=>sendFeedback(state,token)});return;
    }
    const frame=frames.get(independentMessageKey(target || {}));
    const controller=frame?.contentWindow?.commandController;
    if(controller?.isCommandEnabled(command))controller.doCommand(command);
  }
  for(const [label,command,glyph] of [['Reply all','cmd_replyall','reply-all'],['Reply','cmd_replySender','reply'],['Forward','cmd_forwardInline','forward']]) {
    const button=text('button','',label);
    const icon=text('span','action-icon '+glyph,'');icon.setAttribute('aria-hidden','true');
    button.replaceChildren(icon,gmBindAction(text('span','',''),'textContent',label));button.type='button';button.disabled=true;buttons.push(button);
    button.addEventListener('click',()=>runCommand(command));actions.append(button);
  }
  conversation.append(actions);
  function updateActions(){for(const button of buttons)button.disabled=resolving || !frames.has(independentMessageKey(actionHeader || {}))}
  let titleTagSignature=null;
  const tagSignature=tags=>tags.map(tag=>[tag.key,tag.tag,tag.color || '']);
  function refreshTags(){
    refreshSnooze();
    for(const render of securityRenderers)render();
    // Snapshot label metadata once for this refresh, never cache assignments
    // across notifications. Each message renderer shares the same intersection.
    const definitions=typeof assignedTags==='function'?MailServices.tags.getAllTags():[];
    const groups=currentHeaders.map(header=>typeof assignedTags==='function'?assignedTags(header,definitions):[]);
    const byHeader=new Map(currentHeaders.map((header,index)=>[header,groups[index]]));
    const common=commonLabelKeys(groups),tags=new Map();
    for(const group of groups)for(const tag of group)tags.set(tag.key,tag);
    for(const render of tagRenderers)render(byHeader,common);
    const inbox=independentInboxFolder(currentHeaders,Ci.nsMsgFolderFlags,removedInboxMessages);
    const signature=JSON.stringify([inbox?.URI || null,gmText("Inbox"),tagSignature([...tags.values()].filter(tag=>common.has(tag.key)))]);
    if(signature===titleTagSignature)return;
    titleTagSignature=signature;
    titleTags.replaceChildren();
    if(inbox){
      const chip=text('span','tag gm-inbox-chip',gmText("Inbox"));
      chip.style.backgroundColor='light-dark(#e0e3e1,#444746)';
      chip.style.color='inherit';
      chip.setAttribute('role','link');
      chip.setAttribute('tabindex','0');
      chip.title=gmText("Open Inbox");
      chip.style.cursor='pointer';
      function navigate(event){
        if(event.target?.closest?.('button'))return;
        event.preventDefault();
        event.stopPropagation();
        openConversationInbox(win,inbox);
      }
      chip.addEventListener('click',navigate);
      chip.addEventListener('keydown',event=>{
        if(['Enter',' '].includes(event.key))navigate(event);
      });
      const remove=text('button','tag-remove','×');
      remove.type='button';
      remove.title=gmText("Remove label Inbox from this conversation");
      remove.setAttribute('aria-label',remove.title);
      remove.addEventListener('click',event=>{
        event.preventDefault();
        event.stopPropagation();
        try {
          archiveConversationInbox(win,currentHeaders.filter(header=>
            !removedInboxMessages.has(independentMessageKey(header))));
        }catch(error){
          status.hidden=false;
          status.textContent=error.message || gmText("Could not archive this conversation.");
        }
      });
      chip.append(remove);
      titleTags.append(chip);
    }
    if(typeof assignedTags!=='function')return;
    for(const tag of tags.values()) {
      if(!common.has(tag.key))continue;
      const chip=text('span','tag',tag.tag),colors=chipColors(tag.color);
      chip.style.backgroundColor=colors.background;chip.style.color=colors.foreground;
      chip.title=tag.tag;bindLabelNavigation(chip,tag,win);
      const remove=text('button','tag-remove','×');remove.type='button';
      remove.title=`Remove ${tag.tag} from this conversation`;remove.setAttribute('aria-label',remove.title);
      remove.addEventListener('click',event=>{
        event.preventDefault();event.stopPropagation();
        if(closed || chip.isConnected===false || !currentHeaders.length)return;
        try {
          applyConversationLabel(currentHeaders,tag.key,false,win,refreshTags);
          refreshTags();
        }catch(_){status.hidden=false;status.textContent='Could not remove the label from every message. Try again.';refreshTags();}
      });
      chip.append(remove);titleTags.append(chip);
    }
  }
  const tagListener={msgPropertyChanged(header,property){
    // Keyword and verification notifications are global. Other conversations
    // cannot change these cards; avoid rebuilding every chip and security badge.
    if(header && !currentHeaders.some(message=>independentMessageKey(message)===independentMessageKey(header) ||
      (message.messageId && message.messageId===header.messageId)))return;
    if(['keywords','label'].includes(property))refreshTags();
    if(property==='dkim_verifier@pl-result')for(const render of securityRenderers)render();
  }};
  let notifications=Ci.nsIMsgFolderNotificationService.msgPropertyChanged;
  for(const name of ['msgAdded','msgsDeleted','msgsMoveCopyCompleted','folderDeleted','folderRenamed','msgKeyChanged']){
    tagListener[name]=()=>sentCache.invalidate();notifications|=Ci.nsIMsgFolderNotificationService[name] || 0;
  }
  tagListener.msgsDeleted=headers=>sentCache.invalidateFolders(headers?Array.from(headers,header=>header.folder):null);
  tagListener.msgsMoveCopyCompleted=(move,headers,destination)=>{
    sentCache.invalidateFolders(headers?[...Array.from(headers,header=>header.folder),destination]:null);
    if(!move || !headers || destination?.isSpecialFolder?.(Ci.nsMsgFolderFlags.Inbox,false))return;
    for(const header of headers){
      if(header.folder?.isSpecialFolder?.(Ci.nsMsgFolderFlags.Inbox,false))
        removedInboxMessages.add(independentMessageKey(header));
    }
    if(!closed && currentHeaders.length)refreshTags();
  };
  tagListener.msgKeyChanged=(_oldKey,header)=>sentCache.invalidateFolders([header?.folder]);
  tagListener.msgAdded=header=>{
    sentCache.invalidateFolders([header?.folder]);
    if(closed || host.hidden || (!currentHeaders.length && !pendingReplies.size) || !header?.folder)return;
    // Draft saves also emit msgAdded. Only actual Sent copies can become a
    // sent message. Replies match References; forwards match this composer’s ID.
    if(!independentSentFolders().some(folder=>folder.URI===header.folder.URI))return;
    const sentId=normalizeSendId(header.messageId);
    const pendingMatch=sentId && [...pendingReplies].find(([,entry])=>normalizeSendId(entry.messageId)===sentId);
    const ownSend=!!pendingMatch;
    if(!currentHeaders.length && !ownSend){
      // A draft-only conversation has no native members until its Sent copy
      // arrives. Retain candidates but accept only this composer’s exact ID.
      if(sentId){if(pendingSentCopies.size>=20)pendingSentCopies.delete(pendingSentCopies.keys().next().value);pendingSentCopies.set(sentId,header);}
      return;
    }
    // Copy notifications can precede the transport callback supplying the ID.
    // Keep the preview until an exact match is possible instead of drawing twice.
    if(sentId && pendingReplies.size && !ownSend && [...pendingReplies.values()].some(entry=>!entry.messageId)){
      if(pendingSentCopies.size>=20)pendingSentCopies.delete(pendingSentCopies.keys().next().value);
      pendingSentCopies.set(sentId,header);return;
    }
    const related=ownSend?[...currentHeaders,header]:independentRelatedSent(currentHeaders,[{header,ids:independentReferenceIds(header)}]);
    if(!related.includes(header) && pendingReplies.size && sentId){
      if(pendingSentCopies.size>=20)pendingSentCopies.delete(pendingSentCopies.keys().next().value);
      pendingSentCopies.set(sentId,header);
    }else pendingSentCopies.delete(sentId);
    const next=independentMessages(related,currentHeaders[0] || header);
    if(next.length===currentHeaders.length){reconcilePendingReplies();return;}
    // Insert only the new card: existing viewers, scroll state and any other
    // unsent composer remain alive, even if the server reports an older date.
    const previous=next.at(-1)!==actionHeader?messageCards.get(actionHeader):null;
    previous?.removeAttribute('data-latest');
    const toggle=previous?.children[0]?.children[0];
    toggle?.removeAttribute('aria-disabled');if(toggle)toggle.title='';
    currentHeaders=next;actionHeader=next.at(-1);
    const following=messageCards.get(next[next.indexOf(header)+1]);
    const hydration=pendingMatch?.[1];
    if(pendingMatch)pendingReplies.delete(pendingMatch[0]);
    let card;
    if(hydration)preserveReaderPosition(host,hydration.card,()=>{card=buildCard(header,true,ticket,following,hydration)});
    else card=buildCard(header,true,ticket,following);
    updateActions();refreshTags();reconcilePendingReplies();
    status.textContent=gmCount('$1 message','$1 messages',next.length);status.hidden=false;
    gmBindValue(status,'title',()=>gmText('Conversation includes the saved Sent message.'));notifyLabelScope();
    if(revealFrame!==null)win.cancelAnimationFrame(revealFrame);
    if(hydration)return;
    const token=ticket;
    revealFrame=win.requestAnimationFrame(()=>{
      revealFrame=null;
      if(!closed && !host.hidden && token===ticket)card.scrollIntoView({block:'nearest',inline:'nearest'});
    });
  };
  if(MailServices.mfn)MailServices.mfn.addListener(tagListener,notifications);
  const stopLanguageRefresh=gmOnLanguageChange(refreshTags);
  win.addEventListener?.('focus',refreshTags);
  let hideCleanupFrame=null,hideCleanupTimer=null;
  function cancelHideCleanup(){
    if(hideCleanupFrame!==null)win.cancelAnimationFrame(hideCleanupFrame);
    if(hideCleanupTimer!==null)win.clearTimeout(hideCleanupTimer);
    hideCleanupFrame=null;
    hideCleanupTimer=null;
  }
  function clearCards(){titleTagSignature=null;cancelHideCleanup();removedInboxMessages.clear();pendingSentCopies.clear();pendingReplies.clear();permanentBodies.clear();if(revealFrame!==null)win.cancelAnimationFrame(revealFrame);revealFrame=null;for(const cleanup of cleanups)cleanup();cleanups.clear();cards.replaceChildren();tagRenderers.clear();securityRenderers.clear();messageDocs.clear();messageCards.clear();titleTags.replaceChildren();frames.clear();currentHeaders=[];actionHeader=null;activeHeader=null;activeCard=null;updateActions()}
  function text(tag,className,value){const node=doc.createElement(tag);node.className=className;node.textContent=value;return node}
  function buildCard(header,expand,token,before=null,hydration=null) {
    const permanent=!!hydration && typeof permanentSentCardsEnabled!=='undefined' && permanentSentCardsEnabled;
    const article=hydration?.card || doc.createElement('article');
    if(hydration){
      if(permanent){for(const child of [...article.children])if(child!==hydration.body && child!==hydration.viewControls && child!==hydration.attachmentControls)child.remove();}
      else article.replaceChildren();
      article.className=permanent?'gm-permanent-sent-card':'';
      hydration.header=header;if(hydration.savedButton)hydration.savedButton.disabled=true;
    }
    messageCards.set(header,article);
    const cardHeader=doc.createElement('div');cardHeader.className='card-header';
    const latest=header===actionHeader;
    const toggle=doc.createElement('button');toggle.type='button';toggle.className='toggle';toggle.setAttribute('aria-expanded','false');
    gmBindAttribute(toggle, 'aria-description', () => gmText("Number keys label this message. L labels the entire conversation."));
    if(latest) {article.setAttribute('data-latest','');toggle.setAttribute('aria-disabled','true');gmBindValue(toggle, "title", () => gmText("Most recent message"))}
    let name=header.mime2DecodedAuthor || header.author || gmText("Unknown sender"),address='';
    try {const from=MailServices.headerParser.parseDecodedHeader(name)[0];name=from?.name || from?.email || name;address=from?.email || ''}catch(_){}
    const initials=name.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toLocaleUpperCase();
    const preview=text('span','preview','');
    const isCurrent=()=>!closed && token===ticket;
    const updatePreview=()=>{preview.textContent=previews.get(header,isCurrent,()=>{})};
    preview.textContent=previews.get(header,isCurrent,updatePreview);
    const sender=text('span','sender',''),senderAddress=text('span','address',address),via=text('span','via','');
    via.hidden=true;senderAddress.append(via);sender.append(text('span','name',name),senderAddress,preview);
    const avatar=text('span','avatar',initials),photo=independentAvatar(address);
    if(photo) {
      const image=doc.createElement('img');image.alt='';image.setAttribute('src',photo);
      image.addEventListener('error',()=>avatar.replaceChildren(doc.createTextNode(initials)),{once:true});
      avatar.replaceChildren(image);
    }
    toggle.append(avatar,sender);
    const date=new Date((header.dateInSeconds || 0)*1000);
    const time=text('time','',conversationDateText(date,gmLocale()));time.dateTime=date.toISOString();time.title=date.toLocaleString(gmLocale());
    const meta=doc.createElement('div');meta.className='message-meta';
    const dkim=text('span','dkim-status','');dkim.setAttribute('role','status');
    let bimiTicket=0;
    async function refreshBimi(){
      const attempt=++bimiTicket;
      if(!photo)avatar.replaceChildren(doc.createTextNode(initials));
      if(photo || typeof independentBimiEnabled==='undefined' || !independentBimiEnabled || !liveDkim)return;
      let domain;try{domain=independentBimiDomain(address,liveDkim,host=>Services.eTLD.getBaseDomainFromHost(host));}catch(_){return;}
      if(!domain)return;
      try {const result=await verifyIndependentDkim(domain);
        if(!isCurrent() || attempt!==bimiTicket || !independentBimiEnabled || !result?.logo?.startsWith('data:image/svg+xml;base64,'))return;
        const image=doc.createElement('img');image.alt='';gmBindValue(image, "title", () => gmText("DNS-published BIMI logo"));image.setAttribute('src',result.logo);
        image.addEventListener('error',()=>{if(attempt===bimiTicket)avatar.replaceChildren(doc.createTextNode(initials));},{once:true});avatar.replaceChildren(image);
      }catch(_){}
    }
    if(typeof independentBimiListeners!=='undefined'){independentBimiListeners.add(refreshBimi);cleanups.add(()=>{bimiTicket++;independentBimiListeners.delete(refreshBimi);});}
    let liveDkim=null,dkimPending=typeof verifyIndependentDkim==='function',dkimUnavailable=false;
    function renderDkim(){const value=dkimPending?{label:gmText("DKIM checking…"),tone:'warning'}:dkimUnavailable?{label:gmText("DKIM unavailable"),tone:'warning',detail:gmText("DKIM Verifier integration unavailable")}:independentDkimStatus(header,liveDkim);dkim.textContent=value.label;dkim.setAttribute('data-tone',value.tone);dkim.title=[value.label,value.detail].filter(Boolean).join(' — ')}
    securityRenderers.add(renderDkim);renderDkim();meta.append(time,dkim);
    if(typeof verifyIndependentDkim==='function') {
      gmBindValue(dkim, "textContent", () => gmText("DKIM checking…"));
      Promise.resolve().then(()=>verifyIndependentDkim(header)).then(result=>{
        if(!isCurrent())return;dkimPending=false;liveDkim={...result,version:'2.1'};renderDkim();refreshBimi();
      },()=>{if(isCurrent()){dkimPending=false;dkimUnavailable=true;renderDkim();}});
    }
    cardHeader.append(toggle,meta);if(permanent)article.insertBefore(cardHeader,hydration.body);else article.append(cardHeader);
    const messageTags=doc.createElement('div');messageTags.className='tags';messageTags.setAttribute('aria-label','Labels on this message');
    sender.append(messageTags);
    let messageTagSignature=null;
    const renderMessageTags=(byHeader,common)=>{
      const tags=(byHeader.get(header) || []).filter(tag=>!common.has(tag.key));
      const signature=JSON.stringify(tagSignature(tags));
      if(signature===messageTagSignature)return;
      messageTagSignature=signature;
      messageTags.replaceChildren();
      for(const tag of tags){
        const chip=text('span','tag',''),label=text('span','tag-label',tag.tag),colors=chipColors(tag.color);
        chip.style.backgroundColor=colors.background;chip.style.color=colors.foreground;bindLabelNavigation(label,tag,win);
        const remove=text('button','tag-remove','×');remove.type='button';remove.setAttribute('aria-label',`Remove ${tag.tag} from this conversation`);
        remove.addEventListener('click',event=>{
          event.preventDefault();event.stopPropagation();if(closed || token!==ticket)return;
          try{applyConversationLabel(currentHeaders,tag.key,false,win,refreshTags);if(tag.key===`$label${header.label}`)header.label=0;refreshTags();}
          catch(_){remove.title='Could not remove label. Try again.';}
        });
        chip.append(label,remove);messageTags.append(chip);
      }
    };
    tagRenderers.add(renderMessageTags);
    const body=doc.createElement('div');body.className='body';body.hidden=true;article.append(body);
    let pendingBody=hydration?.body || null,savedView=false;
    const attachmentRegion=permanent?hydration.attachmentControls:text('div','gm-sent-attachments','');
    if(!permanent){attachmentRegion.hidden=true;article.append(attachmentRegion);}
    if(pendingBody){if(!permanent)article.append(pendingBody);body.style.position='absolute';body.style.visibility='hidden';body.style.inlineSize='100%';
      if(permanent){body.inert=true;body.style.blockSize='0';body.style.overflow='hidden';}}
    function revealSavedBody(){if(!pendingBody || permanent)return;preserveReaderPosition(host,article,()=>{pendingBody.remove();pendingBody=null;body.style.position='';body.style.visibility='';body.style.inlineSize='';});}
    let attachmentHeading=null;
    let browser=null,timeout=null,zoom=null,bodyResize=null,contentChanges=null,contentLoad=null,resizeFrame=null,ready=false,toggleQuotes=null,restoreCommands=null,focusCleanup=null,scrollCleanup=null,messageActions=null,defaultReplyControl=null,permanentReplyControl=null,permanentReplyButton=null,attachmentListenerCleanup=null;
    if(permanent){
      body.id='gm-saved-sent-body-'+(++savedViewSequence);
      hydration.savedButton?.setAttribute('aria-controls',body.id);
      hydration.showSaved=()=>{
        if(!isCurrent())return;
        preserveReaderPosition(host,article,()=>{
          savedView=!savedView;pendingBody.hidden=savedView;
          body.style.position=savedView?'':'absolute';body.style.visibility=savedView?'':'hidden';body.style.blockSize=savedView?'':'0';body.style.overflow=savedView?'':'hidden';body.inert=!savedView;
          hydration.savedButton.textContent=savedView?'Back to sent view':'Show saved formatting / attachments';hydration.savedButton.setAttribute('aria-expanded',String(savedView));
        });
        if(browser)zoomResizers.get(browser)?.();
      };
    }
    const quoteButton=text('button','quote-toggle','…');quoteButton.type='button';quoteButton.hidden=true;
    gmBindAttribute(quoteButton, 'aria-label', () => gmText("Show quoted text"));quoteButton.setAttribute('aria-expanded','false');
    quoteButton.addEventListener('click',()=>toggleQuotes?.());
    const error=gmBindValue(text('div', 'status', ''), 'textContent', () => gmText("Unable to display this message. Close and reopen it to retry. "));error.hidden=true;
    const fallback=gmBindValue(text('button', 'fallback', ''), 'textContent', () => permanent?gmText("Retry saved view"):gmText("Open in Thunderbird window"));fallback.type='button';
    fallback.addEventListener('click',()=>{
      if(permanent){if(isCurrent() && !browser)expandCard();return;}
      ChromeUtils.importESModule('resource:///modules/MailUtils.sys.mjs').MailUtils.openMessageInNewWindow(header);
    });error.append(fallback);
    if(permanent){
      const reply=text('button','gm-permanent-reply','');permanentReplyButton=reply;reply.type='button';reply.disabled=true;reply.append(text('span','',''));
      permanentReplyControl=installDefaultReplyControl(reply,command=>runCommand(command,header),()=>isCurrent() && ready,'click');meta.append(reply);
    }
    function renderAttachments(){
      if(!attachmentRegion || !ready || !browser || !isCurrent())return;
      const frame=browser,native=frame.contentWindow,attachments=Array.from(native.currentAttachments || []),region=attachmentRegion;
      region.replaceChildren();region.hidden=!attachments.length;
      if(!attachmentHeading){attachmentHeading=text('div','gm-attachment-heading','');article.insertBefore(attachmentHeading,region);}
      attachmentHeading.hidden=!attachments.length;attachmentHeading.replaceChildren(text('span','',attachments.length+' '+(attachments.length===1?'attachment':'attachments')));
      const saveAll=text('button','','↓');saveAll.type='button';saveAll.title='Save all attachments';saveAll.setAttribute('aria-label','Save all attachments');
      saveAll.disabled=!attachments.some(a=>a.hasFile && a.isAllowedURL) || typeof native.HandleMultipleAttachments!=='function';
      saveAll.addEventListener('click',()=>{if(saveAll.parentNode!==attachmentHeading || !isCurrent() || !ready || browser!==frame || saveAll.disabled)return;
        const current=Array.from(native.currentAttachments || []).filter(a=>attachments.includes(a) && a.hasFile && a.isAllowedURL);
        if(current.length)native.HandleMultipleAttachments(current,'save');});attachmentHeading.append(saveAll);

      for(const attachment of attachments){
        const row=text('div','gm-sent-attachment',''),name=String(attachment.name || 'Attachment');region.append(row);
        const filename=text('span','gm-sent-attachment-name',name);filename.title=name;filename.insertBefore(nativeAttachmentIcon(doc,attachment,16),filename.firstChild || null);row.append(filename);
        const kind=attachmentPreviewKind(attachment),fileType=attachmentFileType(attachment);row.setAttribute('data-kind',kind);row.setAttribute('data-filetype',fileType.kind);filename.setAttribute('data-badge',fileType.label);
        const previewBox=text('button','gm-sent-attachment-preview',''),filetype=nativeAttachmentIcon(doc,attachment,32);filetype.className='gm-sent-attachment-filetype';previewBox.type='button';previewBox.setAttribute('aria-label','Open '+name);previewBox.append(filetype);
        const status=text('span','gm-sent-attachment-status','');status.setAttribute('role','status');
        const buttons=[];
        function available(){return row.parentNode===region && isCurrent() && ready && browser===frame && Array.from(native.currentAttachments || []).includes(attachment) && attachment.hasFile && attachment.isAllowedURL;}
        for(const [label,method] of [['Open','open'],['Save','save']]){
          const button=text('button','',label);button.type='button';button.setAttribute('aria-label',label+' '+name);buttons.push(button);
          button.disabled=!available() || typeof attachment[method]!=='function';
          button.addEventListener('click',async()=>{
            if(button.disabled || !available())return;
            for(const control of buttons)control.disabled=true;status.textContent='';
            try{await attachment[method](win.top?.browsingContext || win.browsingContext);}
            catch(_){if(isCurrent() && browser===frame)status.textContent='Could not '+label.toLowerCase()+' this attachment. Try again or use the saved view.';}
            finally{for(const control of buttons)control.disabled=!available() || typeof attachment[control===buttons[0]?'open':'save']!=='function';}
          });row.append(button);
        }
        previewBox.disabled=!available() || typeof attachment.open!=='function';previewBox.addEventListener('click',()=>buttons[0].click());
        if(!available())status.textContent='Attachment unavailable.';row.append(status,previewBox);
        if(attachments.indexOf(attachment)<12)thumbnailQueue=thumbnailQueue.then(async()=>{
          try{const thumbnail=await attachmentThumbnail(doc,attachment,available);if(thumbnail && available()){const image=doc.createElement('img');image.alt='Preview of '+name;image.setAttribute('src',thumbnail);previewBox.replaceChildren(image);}}catch(error){if(available())previewBox.title='Preview unavailable: '+String(error?.message || error);}
        });
      }
    }
    function release(){
      attachmentListenerCleanup?.();attachmentListenerCleanup=null;
      if(attachmentRegion)for(const row of attachmentRegion.children)for(const child of row.children)if(child.tagName==='BUTTON' || child.tag==='button')child.disabled=true;
      if(permanentReplyButton)permanentReplyButton.disabled=true;
      if(permanent && hydration.savedButton)hydration.savedButton.disabled=false;
      try { browser?.contentWindow?.ClearPendingReadTimer?.(); } catch (_) {}
      if(timeout!==null)win.clearTimeout(timeout);timeout=null;
      bodyResize?.disconnect();bodyResize=null;
      contentChanges?.disconnect();contentChanges=null;
      contentLoad?.();contentLoad=null;toggleQuotes=null;
      if(resizeFrame!==null)win.cancelAnimationFrame(resizeFrame);resizeFrame=null;
      defaultReplyControl?.close();defaultReplyControl=null;
      messageActions?.close();messageActions=null;
      restoreCommands?.();restoreCommands=null;focusCleanup?.();focusCleanup=null;
      scrollCleanup?.();scrollCleanup=null;
      for(const [document,message] of messageDocs)if(message===header)messageDocs.delete(document);
      frames.delete(independentMessageKey(header));updateActions();
      zoom?.close();zoom=null;
      zoomResizers.delete(browser);
      browser?.remove();browser=null;ready=false;

    }
    function expandCard(){
      activateMessage(header);body.hidden=false;if(permanent && pendingBody){pendingBody.hidden=savedView;if(hydration.viewControls)hydration.viewControls.hidden=false;}attachmentRegion.hidden=!attachmentRegion.children.length;if(attachmentHeading)attachmentHeading.hidden=attachmentRegion.hidden;preview.hidden=true;article.setAttribute('data-expanded','');toggle.setAttribute('aria-expanded','true');error.hidden=true;
      browser=doc.createXULElement('browser');
      const frame=browser;
      browser.addEventListener('load',event=>{
        if(closed || token!==ticket || browser!==frame || event.target!==browser.contentDocument || browser.contentDocument.documentURI!=='about:message')return;
        try {
          messageDocs.set(browser.contentDocument,header);
          const controller=browser.contentWindow.commandController;
          if(controller) {
            const originals=new Map();
            for(const [name,replacement] of [
              ['_toggleMessageTagKey',number=>toggleTagNumber(header,number)],
              ['_toggleMessageTag',(key,add)=>setMessageTag(header,key,add)],
              ['_removeAllMessageTags',()=>toggleTagNumber(header,0)]]) {
              originals.set(name,controller[name]);controller[name]=(...args)=>{
                if(typeof gmailComposerHasFocus==='function' && gmailComposerHasFocus(win))return;
                return replacement(...args);
              };
            }
            restoreCommands=()=>{for(const [name,value] of originals)controller[name]=value};
          }
          browser.docShell.allowDNSPrefetch=false;
          zoom=installMailZoom(browser.contentWindow,ChromeUtils.importESModule('resource:///modules/UIFontSize.sys.mjs').UIFontSize,zoomConversation);
          if(Array.isArray(browser.contentWindow.gMessageListeners)){
            const listeners=browser.contentWindow.gMessageListeners,listener={onStartHeaders(){},onEndHeaders(){},onEndAttachments:renderAttachments};listeners.push(listener);
            attachmentListenerCleanup=()=>{const index=listeners.indexOf(listener);if(index>=0)listeners.splice(index,1);};
          }
          browser.contentWindow.displayMessage(header.folder.getUriForMsg(header));
        }catch(_){release();revealSavedBody();error.hidden=false}
      },true);
      browser.addEventListener('MsgLoaded',()=>{
        if(closed || token!==ticket || browser!==frame)return;
        if(timeout!==null)win.clearTimeout(timeout);timeout=null;ready=true;error.hidden=true;if(permanentReplyButton)permanentReplyButton.disabled=false;if(permanent && hydration.savedButton)hydration.savedButton.disabled=false;
        frames.set(independentMessageKey(header),frame);updateActions();renderAttachments();
        // Keep visual and keyboard order aligned, retaining native star behavior.
        const star=frame.contentDocument.getElementById('starMessageButton');
        const replyControl=frame.contentDocument.getElementById('hdrReplyToSenderButton');
        if(star && replyControl && star.parentNode===replyControl.parentNode)star.parentNode.insertBefore(star,replyControl);
        messageActions?.close();messageActions=installIndependentMessageActions(frame,header,isCurrent,runCommand);
        const replyButton=frame.contentDocument.getElementById('hdrReplyToSenderButton');
        defaultReplyControl?.close();defaultReplyControl=null;
        if(replyButton)defaultReplyControl=installDefaultReplyControl(replyButton,command=>runCommand(command,header),()=>!closed && token===ticket);
        const senderHeader=frame.contentWindow.currentHeaderData?.sender?.headerValue;
        const viaDomain=independentViaDomain(address,senderHeader,MailServices.headerParser);
        via.hidden=!viaDomain;via.textContent=viaDomain?`via ${viaDomain}`:'';
        gmBindValue(via, "title", () => viaDomain?gmText("Sending agent from the message’s Sender header (not an authentication result)"):'');
        // Style only the native envelope chrome. Remote-content and encryption
        // notifications and attachments remain present and functional.
        const frameStyle=browser.contentDocument.createElement('style');
        frameStyle.textContent=`
          #attachmentView, #attachment-splitter { display:none !important; }
          #messageHeader { display:flex !important; flex-wrap:wrap; align-items:center;
            border:0; background:transparent; padding:0; gap:0 8px; }
          #headerSenderToolbarContainer { order:2; flex:0 0 auto; margin-inline-start:auto; }
          #expandedtoRow { order:1; flex:1 1 auto; }
          #headerSubjectSecurityContainer { order:3; }
          #messageHeader > .message-header-row { min-block-size:0; margin-block:0; padding-block:0; }
          #header-view-toolbox, #header-view-toolbar { min-block-size:24px; padding:0; margin:0; }
          #expandedBoxSpacer { display:none !important; }
          #dkim_verifier_pl-messageDisplayAction-toolbarbutton { display:none !important; }
          /* The conversation already supplies sender, date, subject and actions.
             Keep recipients, security indicators, extension controls and notices. */
          #expandedfromRow, #expandedsubjectRow, #expandedtagsRow, #dateLabel, #dateLabelSubject,
          #hdrSmartReplyButton, #hdrReplyButton,
          #hdrReplyAllButton, #hdrReplyListButton, #hdrFollowupButton,
          #hdrForwardButton, #hdrArchiveButton, #hdrJunkButton, #hdrTrashButton {
            display:none !important;
          }
          #hdrReplyToSenderButton {
            display:inline-flex !important; min-inline-size:36px; min-block-size:36px;
            padding:8px !important; border:0 !important; border-radius:50% !important;
            background:transparent !important;
          }
          #hdrReplyToSenderButton > .toolbarbutton-icon {
            list-style-image:var(--gm-default-reply-icon,url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20d%3D%22M9%205%203%2011l6%206%20M3%2011h9a7%207%200%200%201%207%207%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%221.8%22%20stroke-linejoin%3D%22round%22%20stroke-linecap%3D%22round%22%2F%3E%3C%2Fsvg%3E")) !important; width:20px; height:20px;
          }
          #hdrReplyToSenderButton > .toolbarbutton-text { display:none !important; }
          #hdrReplyToSenderButton:hover { background:light-dark(#20212414,#ffffff20) !important; }
          #messagepaneboxwrapper, #messagepanebox { min-block-size:0; }
          #messagepane { min-block-size:0; flex:1; }
          .message-header-view-button { border-radius:16px !important; }
          #header-view-toolbar { column-gap:0 !important; align-items:center; }
          #starMessageButton { inline-size:36px !important; block-size:36px !important; min-inline-size:36px !important; padding:8px !important; margin:0 !important; border-radius:50% !important; }
          #starMessageButton img { inline-size:20px !important; block-size:20px !important; }
#otherActionsButton {
  min-inline-size:36px !important; max-inline-size:36px !important;
  min-block-size:36px !important; padding:8px !important;
  margin-inline:0 !important; border:0 !important;
  border-radius:50% !important; background:transparent !important;
  justify-content:center !important;
}
#otherActionsButton > .toolbarbutton-text,
#otherActionsButton > .toolbarbutton-menu-dropmarker { display:none !important; }
#otherActionsButton > .toolbarbutton-icon {
  margin:0 !important; width:16px !important; height:16px !important;
}
@media (prefers-reduced-motion:no-preference) {
  #hdrReplyToSenderButton, #otherActionsButton {
    transition:background-color 150ms cubic-bezier(.2,0,0,1) !important;
  }
}
#otherActionsButton:hover { background:light-dark(#20212414,#ffffff20) !important; }

    :is(#hdrReplyToSenderButton,#otherActionsButton) { position:relative; isolation:isolate; background:transparent !important; }
    :is(#hdrReplyToSenderButton,#otherActionsButton):is(:hover,:focus-visible) { background:transparent !important; }
    :is(#hdrReplyToSenderButton,#otherActionsButton)::before {
      content:''; position:absolute; inset:0; border-radius:inherit; z-index:-1;
      pointer-events:none; background:light-dark(#20212414,#ffffff20); opacity:0; transform:scale(.65);
    }
    :is(#hdrReplyToSenderButton,#otherActionsButton):is(:hover,:focus-visible):not(:disabled):is(:hover,:focus-visible) { background:transparent !important; }
    :is(#hdrReplyToSenderButton,#otherActionsButton):is(:hover,:focus-visible):not(:disabled)::before { opacity:1; transform:scale(1); }
    @media (prefers-reduced-motion:no-preference) {
      :is(#hdrReplyToSenderButton,#otherActionsButton):is(:hover,:focus-visible) { background:transparent !important; }
    :is(#hdrReplyToSenderButton,#otherActionsButton)::before { transition:transform 180ms cubic-bezier(.2,0,0,1), opacity 120ms ease-out; }
    }
#otherActionsButton:focus-visible { outline:2px solid Highlight !important; outline-offset:2px; }

        `;
        browser.contentDocument.documentElement.append(frameStyle);
        // Size the envelope to the rendered message; the conversation owns the
        // scrollbar. Read layout only: MIME content and its security stay native.
        const pane=browser.contentDocument.getElementById('messagepane');
        if(pane && messageZoom!==null)(win.top?.ZoomManager || win.ZoomManager)?.setZoomForBrowser(pane,messageZoom);
        const content=pane?.contentDocument;
        scrollCleanup?.();
        const envelopeScroll=installIndependentScrollBridge(browser.contentDocument,host,true);
        const bodyScroll=content ? installIndependentScrollBridge(content,host) : () => {};
        const unlockViewport=content ? lockIndependentViewport(content) : () => {};
        scrollCleanup=()=>{envelopeScroll();bodyScroll();unlockViewport();};
        if(content) {
          messageDocs.set(content,header);
          const activate=()=>activateMessage(header);
          content.addEventListener('pointerdown',activate,true);content.addEventListener('focusin',activate,true);
          focusCleanup=()=>{content.removeEventListener('pointerdown',activate,true);content.removeEventListener('focusin',activate,true)};
        }
        if(content?.body && win.ResizeObserver) {
          const resizeBody=()=>{
            resizeFrame=null;
            if(browser!==frame || closed || token!==ticket || body.hidden || (permanent && !savedView))return;
            const chrome=Math.max(0,frame.clientHeight-pane.clientHeight);
            const contentHeight=independentContentHeight(content);
            // Content rectangles use the message document's CSS pixels;
            // the enclosing browser height uses the unzoomed chrome's pixels.
            const height=Math.ceil(contentHeight*(pane.fullZoom || 1)+chrome);
            if(pendingBody && !permanent)preserveReaderPosition(host,article,()=>{frame.style.blockSize=height+'px';revealSavedBody();});
            else if(Math.abs(frame.clientHeight-height)>1)frame.style.blockSize=height+'px';
          };
          const scheduleResize=()=>{if(resizeFrame===null)resizeFrame=win.requestAnimationFrame(resizeBody)};
          zoomResizers.set(frame,scheduleResize);
          // Presentation only, in the disposable native viewer. Stored MIME and
          // message text are untouched, and the user can reveal every quote.
          const quotes=content.querySelectorAll('blockquote[type="cite"], .gmail_quote');
          if(currentHeaders.length>1 && quotes.length) {
            const quoteStyle=content.createElement('style');
            quoteStyle.textContent='@media screen { :root[data-gm-fold-quotes] :is(blockquote[type="cite"], .gmail_quote, .moz-cite-prefix) { display:none !important; } }';
            content.documentElement.append(quoteStyle);
            const folded=foldableQuotedHistory(content,quotes);
            if(folded)content.documentElement.setAttribute('data-gm-fold-quotes','');
            else {quoteButton.setAttribute('aria-expanded','true');gmBindAttribute(quoteButton,'aria-label',()=>gmText('Hide quoted text'));}
            quoteButton.hidden=false;
            toggleQuotes=()=>{
              const folded=quoteButton.getAttribute('aria-expanded')!=='true';
              if(folded)content.documentElement.removeAttribute('data-gm-fold-quotes');
              else content.documentElement.setAttribute('data-gm-fold-quotes','');
              quoteButton.setAttribute('aria-expanded',String(folded));
              gmBindAttribute(quoteButton, 'aria-label', () => folded?gmText("Hide quoted text"):gmText("Show quoted text"));
              gmBindValue(quoteButton, "title", () => folded?gmText("Hide quoted text"):gmText("Show quoted text"));scheduleResize();
            };
          }
          if(hydration?.quoteExpanded && toggleQuotes && quoteButton.getAttribute('aria-expanded')!=='true')toggleQuotes();
          bodyResize?.disconnect();
          bodyResize=new win.ResizeObserver(scheduleResize);
          bodyResize.observe(content.body);bodyResize.observe(pane);
          contentChanges=new win.MutationObserver(scheduleResize);
          contentChanges.observe(content.body,{childList:true,subtree:true,characterData:true,attributes:true});
          content.addEventListener('load',scheduleResize,true);
          contentLoad=()=>content.removeEventListener('load',scheduleResize,true);
          scheduleResize();
        }else revealSavedBody();
      },true);
      browser.setAttribute('src','about:message');
      body.replaceChildren(error,browser,quoteButton);
      timeout=win.setTimeout(()=>{if(!ready){release();revealSavedBody();error.hidden=false}},15000);
    }
    article.addEventListener('pointerdown',()=>activateMessage(header));
    article.addEventListener('focusin',()=>activateMessage(header));
    toggle.addEventListener('click',()=>{
      if(independentSenderSelected(win.getSelection?.(),sender))return;
      activateMessage(header);
      if(header===actionHeader)return;
      if(body.hidden) {
        if(browser) {body.hidden=false;if(permanent && pendingBody){pendingBody.hidden=savedView;if(hydration.viewControls)hydration.viewControls.hidden=false;}attachmentRegion.hidden=!attachmentRegion.children.length;if(attachmentHeading)attachmentHeading.hidden=attachmentRegion.hidden;preview.hidden=true;article.setAttribute('data-expanded','');toggle.setAttribute('aria-expanded','true');zoomResizers.get(browser)?.();}
        else expandCard();
      } else {
        // Retain a loaded frame while folded so footer Reply/Print still target
        // the latest message. All frames are released when leaving the reader.
        body.hidden=true;attachmentRegion.hidden=true;if(attachmentHeading)attachmentHeading.hidden=true;if(permanent && pendingBody){pendingBody.hidden=true;if(hydration.viewControls)hydration.viewControls.hidden=true;}preview.hidden=false;article.removeAttribute('data-expanded');toggle.setAttribute('aria-expanded','false');
      }
    });
    cleanups.add(()=>{if(permanent){permanentBodies.delete(pendingBody);hydration.showSaved=null;}permanentReplyControl?.close();permanentReplyControl=null;release();});if(!hydration){if(before)cards.insertBefore(article,before);else cards.append(article);}if(expand)expandCard();
    return article;
  }
  function render(headers,anchor,token,focusMessage=false){
    const pending=[...pendingReplies],savedCopies=[...pendingSentCopies];
    clearCards();currentHeaders=headers;refreshSnooze();
    actionHeader=headers.at(-1) || anchor;
    const selected=(focusMessage && headers.find(header=>independentMessageKey(header)===independentMessageKey(anchor))) || actionHeader;
    let selectedCard;
    for(const header of headers) {
      const card=buildCard(header,header===selected || header===actionHeader || header.isRead===false,token);
      if(header===selected)selectedCard=card;
    }
    if((typeof compactConversationsEnabled==='undefined' || compactConversationsEnabled) && headers.length>=6 && !historyExpanded){
      const hidden=headers.slice(1,-2).filter(header=>header!==selected && header.isRead!==false).map(header=>messageCards.get(header)).filter(Boolean);
      if(hidden.length){
        const gap=text('div','history-gap',''),expand=text('button','history-expand',String(hidden.length));
        expand.type='button';expand.setAttribute('aria-label',`Show ${hidden.length} earlier messages`);expand.title=`Show ${hidden.length} earlier messages`;
        expand.setAttribute('aria-expanded','false');
        for(const card of hidden)card.hidden=true;
        gap.append(expand);cards.insertBefore(gap,hidden[0]);
        expand.addEventListener('click',()=>{
          if(closed || token!==ticket)return;
          historyExpanded=true;
          const scroll=host.scrollTop;
          for(const card of hidden)card.hidden=false;
          expand.setAttribute('aria-expanded','true');gap.remove();host.scrollTop=scroll;
          hidden[0].querySelector?.('.toggle')?.focus();
        });
      }
    }
    activateMessage(selected);
    for(const [id,entry] of pending){cards.append(entry.card);pendingReplies.set(id,entry);if(typeof permanentSentCardsEnabled!=='undefined' && permanentSentCardsEnabled)permanentBodies.add(entry.body);}
    for(const [id,header] of savedCopies)pendingSentCopies.set(id,header);
    updateActions();refreshTags();reconcilePendingReplies();
    revealFrame=win.requestAnimationFrame(()=>{
      revealFrame=null;
      if(!closed && token===ticket)selectedCard?.scrollIntoView({block:'nearest',inline:'nearest'});
    });
  }
  function enrichConversation(headers,anchor,token,focusMessage) {
    const existing=new Map(currentHeaders.map(header=>[independentMessageKey(header),header]));
    if(!currentHeaders.every(header=>headers.some(next=>independentMessageKey(next)===independentMessageKey(header)))){
      render(headers,anchor,token,focusMessage);
      return;
    }
    // Keep the headers captured by existing viewers and their event handlers.
    currentHeaders=headers.map(header=>existing.get(independentMessageKey(header)) || header);
    const previous=messageCards.get(actionHeader);
    previous?.removeAttribute('data-latest');
    const previousToggle=previous?.children[0]?.children[0];
    previousToggle?.removeAttribute('aria-disabled');
    if(previousToggle)previousToggle.title='';
    actionHeader=currentHeaders.at(-1) || anchor;
    const selected=(focusMessage && currentHeaders.find(header=>
      independentMessageKey(header)===independentMessageKey(anchor))) || actionHeader;
    for(let index=currentHeaders.length-1;index>=0;index--){
      const header=currentHeaders[index];
      let card=messageCards.get(header);
      if(!card)card=buildCard(header,header===selected || header===actionHeader || header.isRead===false,
        token,messageCards.get(currentHeaders[index+1]));
      if(header===actionHeader){
        card.setAttribute('data-latest','');
        const toggle=card.children[0]?.children[0];
        toggle?.setAttribute('aria-disabled','true');
        if(card.getAttribute('data-expanded')===null)toggle?.click();
      }
    }
    updateActions();
    refreshTags();
    reconcilePendingReplies();
  }
  function setMessageTag(header,key,add) {
    if(closed || !currentHeaders.includes(header))return;
    activateMessage(header);
    applyConversationLabel(currentHeaders,key,add,win,refreshTags);
    if(!add && header.label && key===`$label${header.label}`)header.label=0;
    refreshTags();
  }
  function toggleTagNumber(header,number) {
    if(!header || !currentHeaders.includes(header))return;
    activateMessage(header);
    const tags=MailServices.tags.getAllTags();
    if(number===0) {
      for(const tag of tags)if(currentHeaders.some(message=>assignedTags(message,[tag]).length))setMessageTag(header,tag.key,false);
      return;
    }
    const tag=tags[number-1];if(!tag)return;
    const keys=(header.getStringProperty('keywords') || '').split(/\s+/);
    setMessageTag(header,tag.key,!(keys.includes(tag.key) || tag.key===`$label${header.label}`));
  }
  return {
    zoom:zoomConversation,
    handleTagKey(event) {
      const number=independentTagKey(event);
      if(number===null || host.hidden || closed)return false;
      const header=messageDocs.get(event.currentTarget) || messageDocs.get(event.target?.ownerDocument) || activeHeader;
      event.preventDefault();event.stopImmediatePropagation();
      try {toggleTagNumber(header,number)}catch(_){status.hidden=false;gmBindValue(status, "textContent", () => gmText("Could not update the label on this message. Try again."))}
      return true;
    },
    async open(header,options={}){
      const {focusMessage=false}=options || {},draft=options?.folder?options:options?.draft || null;
      if(closed)return;if(typeof inlineComposeControllers!=='undefined'){const composer=inlineComposeControllers.get(win);if(composer?.park)composer.park();else composer?.float();}const token=++ticket;query?.cancel();
      historyExpanded=false;resolving=true;host.hidden=false;layout.classList.add('gm-independent-open');host.scrollTop=0;
      gmBindValue(title, "textContent", () => header.mime2DecodedSubject || gmText("(No subject)"));title.append(titleTags);status.hidden=false;gmBindValue(status, "textContent", () => gmText("Loading conversation…"));
      // Start the native viewer immediately. Index/Sent lookups enrich the
      // conversation asynchronously rather than holding the body behind them.
      render(independentFolderThread(header).filter(message=>!draft || message.folder?.URI!==draft.folder?.URI),header,token,focusMessage);
      let gloda=null;
      try {if(Services.prefs.getBoolPref('mailnews.database.global.indexer.enabled',true))gloda=ChromeUtils.importESModule('resource:///modules/gloda/GlodaPublic.sys.mjs').Gloda}catch(_){}
      query=independentConversation(win,header,gloda,independentSentFolders(),sentCache);
      const result=await query.promise;
      if(closed || token!==ticket)return;
      resolving=false;
      // A Sent notification can arrive while the initial index query is still
      // running. Keep that confirmed message when the older query finishes.
      result.messages=independentMessages([...result.messages,...currentHeaders],header).filter(message=>!draft || message.folder?.URI!==draft.folder?.URI);
      const same=currentHeaders.length===result.messages.length && currentHeaders.every((message,index)=>independentMessageKey(message)===independentMessageKey(result.messages[index]));
      if(!same)enrichConversation(result.messages,header,token,focusMessage);else updateActions();
      status.textContent=gmCount('$1 message','$1 messages',result.messages.length);
      status.hidden=result.messages.length===1;
      gmBindValue(status, "title", () => result.indexed?'':gmText("Conversation assembled from this folder and locally available sent messages"));
      notifyLabelScope();
      if(draft && typeof resumeInlineDraft==='function'){
        const labelHeaders=currentHeaders.slice();
        await resumeInlineDraft(win,draft,{
          container:conversation,scrollHost:host,isCurrent:()=>!closed && token===ticket && !host.hidden,
          labelMessages:()=>token===ticket?currentHeaders:labelHeaders,onSendState:state=>sendFeedback(state,token)
        }).catch(error=>{if(!closed && token===ticket){status.hidden=false;status.textContent=error.message || 'Could not resume the saved draft.'}});
      }
    },
    hide(immediate=true){
      if(typeof inlineComposeControllers!=='undefined')inlineComposeControllers.get(win)?.float();
      ++ticket;query?.cancel();query=null;resolving=false;
      stopConversationReadTimers(frames);
      host.hidden=true;layout.classList.remove('gm-independent-open');
      cancelHideCleanup();
      if(immediate){clearCards();return;}
      // Paint the inbox before unloading potentially many native message viewers.
      hideCleanupFrame=win.requestAnimationFrame(()=>{
        hideCleanupFrame=null;
        hideCleanupTimer=win.setTimeout(()=>{
          hideCleanupTimer=null;
          if(host.hidden && !closed)clearCards();
        },0);
      });
    },
    close(){this.hide(true);closed=true;stopSnooze?.();contextMenu.close();sentCache.close();previews.close();win.removeEventListener?.('focus',refreshTags);MailServices.mfn?.removeListener(tagListener);stopLanguageRefresh();host.remove();layoutStyle.remove()},
    refresh:refreshTags,
    navigateMessage(direction){
      if(resolving || !currentHeaders.length)return;
      const index=currentHeaders.indexOf(activeHeader || actionHeader),target=currentHeaders[index+direction];
      if(!target)return;const card=messageCards.get(target),toggle=card?.querySelector('.toggle');
      if(card)card.hidden=false;
      if(toggle?.getAttribute('aria-expanded')!=='true')toggle?.click();
      activateMessage(target);toggle?.focus();card?.scrollIntoView({block:'nearest'});
    },
    expandAll(expand){
      if(resolving)return;
      historyExpanded=true;cards.querySelector?.('.history-gap')?.remove();
      for(const card of messageCards.values()){
        card.hidden=false;const toggle=card.querySelector('.toggle');
        if((toggle?.getAttribute('aria-expanded')==='true')!==expand)toggle?.click();
      }
    },
    compose(command,separate=false){
      const target=activeHeader || actionHeader;if(!target || resolving)return;
      if(separate){const controller=frames.get(independentMessageKey(target))?.contentWindow?.commandController;if(controller?.isCommandEnabled(command))controller.doCommand(command);}
      else runCommand(command,target);
    },
    print(){runCommand('cmd_print')},
    getMessages(){return resolving?[]:currentHeaders.slice()}
  };
}

// Resolve only visible list rows. Bound lookups and cached counts independently
// of mailbox size; reuse the reader's Sent metadata index and grouping rules.
function createConversationCountCache(resolve,changed,now=()=>Date.now(),limit=500,ttl=Infinity){
  const entries=new Map(),queue=[];let running=0,generation=0,closed=false;
  const key=header=>header.messageId || JSON.stringify([header.folder?.URI,header.messageKey]);
  function discard(id,entry){entry.stale=true;entries.delete(id);entry.cancel?.()}
  function pump(){
    while(!closed && running<2 && queue.length){
      const entry=queue.shift();if(entry.stale || entry.generation!==generation)continue;
      running++;entry.active=true;
      let job;
      try{job=resolve(entry.header);entry.cancel=()=>job.cancel?.()}
      catch(_){job={promise:Promise.reject(_)}}
      Promise.resolve(job.promise).then(result=>{
        if(closed || entry.stale || entry.generation!==generation)return;
        const messages=independentMessages(result.messages || [],entry.header);
        entry.count=messages.length;entry.messages=messages;
        entry.ids=new Set(messages.flatMap(independentReferenceIds));
        entry.folders=new Set(messages.map(message=>message.folder?.URI));
        entry.expires=now()+ttl;
      },()=>{if(!entry.stale && entry.generation===generation)entry.expires=now()+60000}).finally(()=>{
        running--;entry.active=false;entry.cancel=null;entry.pending=false;
        if(!closed && !entry.stale && entry.generation===generation)changed();
        pump();
      });
    }
  }
  return {
    get(header){
      if(closed || !header?.folder)return undefined;
      const id=key(header);let entry=entries.get(id);
      if(!entry || (!entry.pending && entry.expires<=now())){
        if(!entry){
          // Evict settled entries first; never retain an unbounded scroll queue.
          if(entries.size>=limit){
            const victim=[...entries].find(([,item])=>!item.pending);
            if(victim)discard(...victim);else return undefined;
          }
          entry={header,count:undefined,ids:new Set(independentReferenceIds(header)),folders:new Set([header.folder?.URI])};entries.set(id,entry);
        }
        entry.pending=true;entry.generation=generation;queue.push(entry);pump();
      }
      return entry.count;
    },
    // The resolved conversation, including your own replies from Sent. Read
    // state is taken from these headers when a row is drawn, so it stays live.
    messages(header){
      if(closed || !header?.folder)return undefined;
      const entry=entries.get(key(header));
      return entry && entry.count!==undefined?entry.messages:undefined;
    },
    invalidateMessages(headers){
      if(!headers){this.invalidate();return}
      const changed=Array.from(headers),ids=new Set(changed.flatMap(independentReferenceIds));
      const physical=new Set(changed.map(key));
      for(const [id,entry] of entries)if(physical.has(id) || [...entry.ids].some(value=>ids.has(value)))discard(id,entry);
    },
    invalidateFolder(folder){
      if(!folder?.URI){this.invalidate();return}
      for(const [id,entry] of entries)if(entry.folders.has(folder.URI))discard(id,entry);
    },
    invalidate(){generation++;queue.length=0;for(const [id,entry] of entries)discard(id,entry)},
    close(){closed=true;this.invalidate()},
  };
}
function installConversationCounts(win,mail=globalThis.MailServices,interfaces=typeof Ci==='undefined'?null:Ci){
  const parser=mail?.headerParser;
  let myAddresses=null,myAddressesAt=0;
  function isMe(email){
    if(!myAddresses || Date.now()-myAddressesAt>60000){
      myAddresses=new Set();myAddressesAt=Date.now();
      try{for(const identity of mail?.accounts?.allIdentities || [])if(identity?.email)myAddresses.add(String(identity.email).toLowerCase());}catch(_){}
    }
    return myAddresses.has(String(email || '').toLowerCase());
  }
  const participantOptions={parser,isMe,get meLabel(){return gmText("me");}};
  // Collapsed conversation rows only: an open thread lists each message itself.
  function conversationRow(view,row){
    return !(row.dataset.properties || '').split(' ').includes('dummy') &&
      !(view?.getLevel?.(row.index)>0) &&
      !(view?.isContainer?.(row.index) && view.isContainerOpen(row.index));
  }
  if(!mail?.accounts || !interfaces)return {render(row){
    const view=win.gDBView;
    if(conversationRow(view,row))renderConversationParticipants(win,row,nativeThreadMessages(view,row.index),participantOptions);
    else clearConversationParticipants(row);
    renderThreadCount(win,row);
  },close(){}};
  let gloda=null,closed=false,frame=null,invalidation=null;
  try{if(Services.prefs.getBoolPref('mailnews.database.global.indexer.enabled',true))
    gloda=ChromeUtils.importESModule('resource:///modules/gloda/GlodaPublic.sys.mjs').Gloda}catch(_){}
  const sentCache=createSentCandidateCache(win);
  const cache=createConversationCountCache(header=>independentConversation(win,header,gloda,independentSentFolders(),sentCache),schedule);
  function render(row){
    let count,messages=null;
    try{
      const view=win.gDBView;
      if(conversationRow(view,row)){
        const header=view?.getMsgHdrAt(row.index);
        count=cache.get(header);
        // Until the whole conversation resolves, show the native thread's people.
        messages=cache.messages(header) || nativeThreadMessages(view,row.index);
      }
    }catch(_){/* Row may have been recycled while the folder changed. */}
    try{
      if(messages)renderConversationParticipants(win,row,messages,participantOptions);
      else clearConversationParticipants(row);
    }catch(_){clearConversationParticipants(row);}
    renderThreadCount(win,row,count);
  }
  function schedule(){
    if(closed || frame!==null)return;
    frame=win.requestAnimationFrame(()=>{
      frame=null;if(closed)return;
      for(const row of win.document.querySelectorAll('#threadTree tr.table-layout, #threadTree tr.card-layout'))render(row);
    });
  }
  const changedMessages=new Set(),changedFolders=new Set(),deletedFolders=new Set();let unknown=false;
  function invalidate(headers,folders=[],deletedFolder=null){
    if(closed)return;
    if(!headers)unknown=true;else for(const header of headers)changedMessages.add(header);
    for(const folder of folders)changedFolders.add(folder);
    if(deletedFolder)deletedFolders.add(deletedFolder);
    if(invalidation!==null)return;
    invalidation=win.setTimeout(()=>{
      invalidation=null;if(closed)return;
      sentCache.invalidateFolders(unknown?null:[...changedFolders]);
      if(unknown)cache.invalidate();else cache.invalidateMessages([...changedMessages]);
      for(const folder of deletedFolders)cache.invalidateFolder(folder);
      changedMessages.clear();changedFolders.clear();deletedFolders.clear();unknown=false;schedule();
    },200);
  }
  const listener={
    msgAdded:header=>invalidate(header?[header]:null,[header?.folder]),
    msgsDeleted:headers=>{const items=headers?Array.from(headers):null;invalidate(items,items?.map(header=>header.folder))},
    msgsMoveCopyCompleted:(_move,headers,destination,destinationHeaders)=>{
      const items=headers?Array.from(headers):null;
      invalidate(items?[...items,...Array.from(destinationHeaders || [])]:null,[...(items?.map(header=>header.folder) || []),destination]);
    },
    msgKeyChanged:(_oldKey,header)=>invalidate(header?[header]:null,[header?.folder]),
    folderDeleted:folder=>invalidate([], [folder],folder),
  };
  let flags=0;
  for(const name of Object.keys(listener))flags|=interfaces.nsIMsgFolderNotificationService[name] || 0;
  mail.mfn?.addListener(listener,flags);
  return {render,close(){
    closed=true;mail.mfn?.removeListener(listener);
    if(frame!==null)win.cancelAnimationFrame(frame);
    if(invalidation!==null)win.clearTimeout(invalidation);
    cache.close();sentCache.close();
    for(const node of win.document.querySelectorAll('.gm-thread-count, .gm-participants'))node.remove();
    for(const node of win.document.querySelectorAll('.gm-native-thread-sender'))node.classList.remove('gm-native-thread-sender');
  }};
}
