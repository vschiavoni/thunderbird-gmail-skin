const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const scope = require('./localization-context.cjs').createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/labels.js'),'utf8'),scope);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/pagination.js'),'utf8'),scope);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/nested-labels.js'),'utf8'),scope);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/reading.js'),'utf8'),scope);
test('only unmodified left clicks on message text open reading mode',()=>{
  const event = {button:0,target:{closest:()=>null}};
  assert.equal(scope.isReadingClick(event),true);
  for(const key of ['metaKey','ctrlKey','altKey','shiftKey']) {
    assert.equal(scope.isReadingClick({...event,[key]:true}),false);
  }
  assert.equal(scope.isReadingClick({...event,button:2}),false);
  assert.equal(scope.isReadingClick({...event,target:{closest:()=>({})}}),false);
});
test('successful moves of the open message return to list; copies and other mail do not',()=>{
  const previous = {message:{key:42,folderURI:'imap://account/INBOX'}};
  const message = {messageKey:42,folder:{URI:'imap://account/INBOX'}};
  assert.equal(scope.readingMessageWasMoved(previous,true,[message]),true);
  assert.equal(scope.readingMessageWasMoved(previous,false,[message]),false);
  assert.equal(scope.readingMessageWasMoved(previous,true,[{...message,messageKey:43}]),false);
  assert.equal(scope.readingMessageWasMoved(previous,true,[{...message,folder:{URI:'imap://other/INBOX'}}]),false);
  assert.equal(scope.readingMessageWasMoved(null,true,[message]),false);
});
test('single click opens the current-tab reader, back restores the list, and double click opens no extra tab',()=>{
  const elements = [];
  function element() {
    const events = {};
    const item = {events, classList:{add(){},remove(){}}, style:{},
      setAttribute(){}, append(){}, replaceChildren(){}, remove(){}, focus(){}, hidePopup(){},
      addEventListener(name,fn){events[name]=fn}, removeEventListener(){}};
    elements.push(item); return item;
  }
  const layout = element(); layout.messagePaneVisible = true;
  layout.messagePaneSplitter = Object.assign(element(), {resizeDirection:"vertical",resizeWithWindow:true,width:400});
  const prefValues=new Map();
  const tree = element(); tree.scrollTop=120; tree.scrollLeft=0;
  tree.contains=()=>true; tree.table={body:element()};
  const folderTree=element(), heading=element(), countHeading=element();
  const messagePane={},messageBrowser={contentWindow:{getMessagePaneBrowser:()=>messagePane}},zoomCalls=[];
  const doc={getElementById:id=>({messageBrowser,paneLayout:layout,threadTree:tree,folderTree,threadPaneFolderName:heading,threadPaneFolderCountContainer:countHeading})[id],
    createElement:element,createElementNS:element,createXULElement:element,
    head:element(),documentElement:element()};
  const frameQueue=[]; let listener; let refreshes=0;
  scope.Ci={nsIMsgFolderNotificationService:{msgsMoveCopyCompleted:1}};
  scope.MailServices={mfn:{addListener(fn){listener=fn},removeListener(){}}};
  const hdr={messageKey:42,folder:{URI:'imap://account/INBOX'}};
  const win={document:doc,Services:{prefs:{getIntPref:(key,fallback)=>prefValues.get(key)??fallback,
      setIntPref:(key,value)=>prefValues.set(key,value)}},gFolder:hdr.folder,gDBView:{rowCount:3,getFlagsAt:()=>0,getMsgHdrAt:index=>({messageKey:42+index,folder:hdr.folder}),hdrForFirstSelectedMessage:hdr,getSelectedMsgHdrs:()=>[hdr,{messageKey:43,folder:hdr.folder}]},
    threadPane:{_onSelect(){refreshes++}},Event:class {},
    requestAnimationFrame:fn=>{frameQueue.push(fn);return frameQueue.length},
    cancelAnimationFrame(){},addEventListener(){},removeEventListener(){}};
  win.top={ZoomManager:{enlarge:browser=>zoomCalls.push(['enlarge',browser]),reduce:browser=>zoomCalls.push(['reduce',browser]),reset:browser=>zoomCalls.push(['reset',browser])}};
  const controller=scope.installReadingMode(win);
  assert.equal(controller.zoom('increaseSize'),false,'the inbox retains UI sizing');
  assert.equal(layout.messagePaneVisible,false,'startup must be list only');
  const row={index:0,dataset:{}};
  const stale={index:0,dataset:{}};
  tree.events.click({button:0,target:{closest:selector=>selector==='tr.table-layout'?stale:null}});
  stale.index=1;frameQueue.shift()();
  assert.equal(layout.messagePaneVisible,false,'recycled rows cannot redirect a deferred click');
  tree.events.click({button:0,target:{closest:selector=>selector==='tr.table-layout'?row:null}});
  const originalView=win.gDBView;win.gDBView={...originalView};frameQueue.shift()();
  assert.equal(layout.messagePaneVisible,false,'switching views cancels deferred opening');
  win.gDBView=originalView;

  tree.events.click({button:0,target:{closest:selector=>selector==='tr.table-layout'?row:null}});
  tree.events.click({button:0,target:{closest:selector=>selector==='.twisty'?{}:null}});
  frameQueue.shift()();
  assert.equal(layout.messagePaneVisible,false,'a thread-arrow click cancels a queued reader open');

  const draftRows=[];
  controller.setDraftOpener(row=>{draftRows.push(row.index);return true});
  tree.events.click({button:0,target:{closest:selector=>selector==='tr.table-layout'?row:null}});
  frameQueue.shift()();
  assert.deepEqual(draftRows,[0],'clicking the mail routes to its saved draft');
  assert.equal(layout.messagePaneVisible,false,'opening a draft keeps the conversation reader closed');
  assert.equal(refreshes,0,'draft editing does not render the conversation');
  controller.setDraftOpener(null);
  tree.events.click({button:0,target:{closest:selector=>selector==='tr.card-layout'?row:null}});
  frameQueue.shift()();
  assert.equal(layout.messagePaneVisible,true,'clicking a card row outside its subject opens the native reader');
  assert.equal(refreshes,1,'first single click explicitly displays the selected message');
  for(const action of ['increaseSize','reduceSize','resetSize'])assert.equal(controller.zoom(action),true);
  assert.deepEqual(zoomCalls,[['enlarge',messagePane],['reduce',messagePane],['reset',messagePane]],'the native reader zooms its message browser, never the chrome');
  let prevented=false, stopped=false;
  tree.events.dblclick({button:0,target:{closest:selector=>selector==='tr.table-layout'?row:null},
    preventDefault(){prevented=true},stopImmediatePropagation(){stopped=true}});
  assert.equal(prevented,true); assert.equal(stopped,true);
  tree.events.select();
  assert.equal(layout.messagePaneVisible,true,'a collapsed thread selecting multiple messages must keep the reader open');
  const css=elements.find(node=>node.textContent?.includes('#paneLayout.gm-reading')).textContent;
  assert.match(css,/folders folderPaneSplitter readingbar/);
  assert.match(css,/#paneLayout.gm-reading > :is\(#threadPane, #messagePaneSplitter\).*display:none/);
  layout.messagePaneSplitter.width=620;
  tree.events.click({button:0,target:{closest:selector=>selector==='tr.table-layout'?{index:1,dataset:{}}:null}});
  frameQueue.shift()();
  assert.equal(refreshes,2,'another row refreshes the open reader');
  win.gDBView.rowCount=3;
  win.gDBView.getFlagsAt=()=>0;
  win.gDBView.getMsgHdrAt=index=>({messageKey:42+index,folder:hdr.folder});
  const next=elements.find(node=>node.title==='Next message');
  next.events.click();
  assert.equal(tree.selectedIndex,2,'next selects the following row in this view');
  assert.equal(next.disabled,true,'last row disables Next');
  const previousButton=elements.find(node=>node.title==='Previous message');
  previousButton.events.click();
  assert.equal(tree.selectedIndex,1,'previous selects the preceding row');
  const orderedHeaders=[{messageKey:43,folder:hdr.folder},{messageKey:44,folder:hdr.folder},{messageKey:42,folder:hdr.folder}];
  win.gDBView.getMsgHdrAt=index=>orderedHeaders[index];
  next.events.click();
  assert.equal(tree.selectedIndex,1,'after sorting Next starts from the message identity, not its old row index');
  win.gDBView.getMsgHdrAt=index=>({messageKey:42+index,folder:hdr.folder});


  const back=elements.find(node=>node.title==='Back to message list');
  tree.selectedIndices=[0,1,2,3];
  let countRefreshes=0;
  win.threadPaneHeader={updateSelectedCount(){countRefreshes++}};
  back.events.click();
  assert.equal(tree.selectedIndices.length,0,'Back clears implicit conversation selection');
  assert.equal(countRefreshes,1,'Back refreshes the native Selected counter');
  assert.equal(layout.messagePaneVisible,false,'Back closes the current-tab reader');
  assert.equal(controller.zoom('increaseSize'),false,'Back returns shortcut control to UI sizing');
  while(frameQueue.length)frameQueue.shift()();
  tree.events.click({button:0,target:{closest:selector=>selector==='tr.table-layout'?row:null}});
  frameQueue.shift()();
  listener.msgsMoveCopyCompleted(true,[hdr]);
  assert.equal(layout.messagePaneVisible,false,'archive closes preview immediately');
  while(frameQueue.length)frameQueue.shift()();
  assert.equal(layout.messagePaneVisible,false,'deferred list restoration cannot reopen next message');
  layout.messagePaneSplitter.width=400; // Native layout reset after closing.
  tree.events.click({button:0,target:{closest:selector=>selector==='tr.table-layout'?row:null}});
  frameQueue.shift()();
  controller.close();
  assert.equal(layout.messagePaneVisible,true,'disabling skin restores original preference');
  layout.messagePaneSplitter.width=400;
  const restarted=scope.installReadingMode(win);
  tree.events.click({button:0,target:{closest:selector=>selector==='tr.table-layout'?row:null}});
  frameQueue.shift()();
  tree.selectedIndices=[0,1];
  heading.events.click({button:0});
  assert.equal(tree.selectedIndices.length,0,'folder title clears selected messages');
  assert.equal(layout.messagePaneVisible,false,'folder title returns to the list');
  tree.selectedIndices=[1];countHeading.events.click({button:0});
  assert.equal(tree.selectedIndices.length,0,'message count also clears selection');
  let independentOpens=0,independentHides=0,independentCloses=0,independentPrints=0;
  scope.installIndependentReader=()=>({print(){independentPrints++},open(){independentOpens++;return Promise.resolve()},hide(){independentHides++},close(){independentCloses++}});
  const beforeIndependent=refreshes;
  restarted.setIndependent(true);restarted.openIndex(0);
  assert.equal(independentOpens,1);
  const printMessage=elements.find(node=>node.title==='Print message');
  assert.equal(printMessage.hidden,false,'printing stays visible in independent reading mode');
  printMessage.events.click();assert.equal(independentPrints,1,'toolbar prints the message displayed by the independent reader');
  assert.equal(refreshes,beforeIndependent,'independent mode does not invoke native/Conversations selection display');
  assert.equal(layout.messagePaneVisible,false,'independent mode leaves the native preview collapsed');
  restarted.setIndependent(false);assert.equal(independentHides,1,'changing preference returns to list and cancels the custom reader');
  restarted.close();assert.equal(independentCloses,1);
});
test('checkbox selection shows bulk toolbar and archives native selection without opening reader',()=>{
  const nodes=[];
  function element(){
    const events={};
    const item={events,children:[],style:{},classList:{add(){},remove(){}},setAttribute(){},
      append(...items){this.children.push(...items)},replaceChildren(...items){this.children=items},prepend(item){this.children.unshift(item)},
      remove(){},focus(){},addEventListener(name,fn){(events[name]??=[]).push(fn)},removeEventListener(){}};
    nodes.push(item);return item;
  }
  const layout=element(), tree=element(), folders=element(), threadPane=element();
  tree.reset=()=>{};tree.contains=()=>true;tree.table={body:element()};
  const doc={getElementById:id=>({paneLayout:layout,threadTree:tree,folderTree:folders,threadPane})[id],
    createElement:element,createElementNS:element,createXULElement:element,head:element(),documentElement:element()};
  const columns=[{id:'flaggedCol',ordinal:1,hidden:false},{id:'selectCol',ordinal:2,hidden:true}];
  const messages=[{messageKey:1},{messageKey:2}];let selected=messages;const calls=[];const frames=[];
  scope.Ci={nsIMsgFolderNotificationService:{msgsMoveCopyCompleted:1}};
  scope.MailServices={mfn:{addListener(){},removeListener(){}}};
  const win={document:doc,gDBView:{getSelectedMsgHdrs:()=>selected},
    threadPane:{columns,updateColumns(){}},commandController:{isCommandEnabled:()=>true,
      doCommand:name=>calls.push([name,selected.slice()])},
    requestAnimationFrame:fn=>{frames.push(fn);return frames.length},cancelAnimationFrame(){},
    addEventListener(){},removeEventListener(){}};
  Object.defineProperty(tree,'selectedIndices',{set(){selected=[]}});
  const controller=scope.installReadingMode(win);
  assert.equal(columns[0].id,'flaggedCol');assert.equal(columns[1].hidden,true,'native copied visibility and order survive reader installation');
  columns.reverse();columns[0].hidden=false;win.threadPane.updateColumns();
  assert.equal(columns[0].id,'selectCol');assert.equal(columns[0].hidden,false,'later native view changes are preserved');
  const event={button:0,target:{closest:selector=>selector.includes('.selectcol-column')?{}:null}};
  for(const fn of tree.events.click)fn(event);
  while(frames.length)frames.shift()();
  const toolbar=threadPane.children[0];
  assert.equal(toolbar.hidden,false);assert.equal(toolbar.children[1].textContent,'2 selected');
  for (const title of ['Print conversation','Previous message','Next message'])
    assert.equal(nodes.find(n=>n.title===title).hidden,true,`${title} is hidden in bulk mode`);
  assert.equal(layout.messagePaneVisible,false);
  const checkboxGroup={className:'gm-inbox-select-group'},home={prepend(node){this.child=node}};
  controller.setSelectionControl(checkboxGroup,home);
  assert.equal(toolbar.children[0],checkboxGroup,'the actual checkbox remains visible on the bulk toolbar');
  const read=nodes.find(n=>n.title==='Mark as read');
  read.events.click[0]();
  assert.equal(calls.pop()[0],'cmd_markAsRead','unread selection must not invoke disabled mark-unread');
  assert.equal(home.child,checkboxGroup,'clearing selection restores the same checkbox to the inbox toolbar');
  selected=messages;messages.forEach(message=>message.isRead=true);
  for(const fn of tree.events.click)fn(event);
  while(frames.length)frames.shift()();
  assert.equal(read.title,'Mark as unread');
  // Simulate flags changing after the toolbar was drawn.
  messages[1].isRead=false;
  read.events.click[0]();
  assert.equal(calls.pop()[0],'cmd_markAsRead','mixed selection is marked read using current flags');
  selected=messages;messages.forEach(message=>message.isRead=true);
  for(const fn of tree.events.click)fn(event);
  while(frames.length)frames.shift()();
  read.events.click[0]();
  assert.equal(calls.pop()[0],'cmd_markAsUnread');
  selected=messages;
  for(const fn of tree.events.click)fn(event);
  while(frames.length)frames.shift()();
  const archive=nodes.find(n=>n.title==='Archive');archive.events.click[0]();
  assert.equal(calls[0][0],'cmd_archive');assert.equal(calls[0][1].length,2);
  assert.equal(toolbar.hidden,true);assert.equal(selected.length,0);
  controller.close();assert.equal(columns.find(c=>c.id==='selectCol').hidden,false,'disabling must not restore stale visibility');
});

test('navigation skips group headers, honors boundaries and current view order',()=>{
  const view={rowCount:4,getFlagsAt:index=>index===1?0x20000000:0,getMsgHdrAt:index=>({messageKey:index})};
  assert.equal(scope.adjacentMessageIndex(view,0,1),2);
  assert.equal(scope.adjacentMessageIndex(view,2,-1),0);
  assert.equal(scope.adjacentMessageIndex(view,0,-1),-1);
  assert.equal(scope.adjacentMessageIndex(view,3,1),-1);
});
test('L is restricted to unmodified mail browsing, never text entry or composition',()=>{
  const event={key:'l',target:{closest:()=>null}};
  assert.equal(scope.isLabelShortcut(event),true);
  for(const key of ['ctrlKey','metaKey','altKey','shiftKey','repeat','isComposing','defaultPrevented'])
    assert.equal(scope.isLabelShortcut({...event,[key]:true}),false,key);
  assert.equal(scope.isLabelShortcut({...event,key:'k'}),false);
  assert.equal(scope.isLabelShortcut({...event,target:{isContentEditable:true}}),false);
  assert.equal(scope.isLabelShortcut({...event,target:{closest:()=>({})}}),false);
});
test('label search supports substrings, case, spaces, Unicode and literal punctuation',()=>{
  assert.equal(scope.labelMatchesQuery('Project / UniNE',' unine '),true);
  assert.equal(scope.labelMatchesQuery('ＡＢＣ','abc'),true);
  assert.equal(scope.labelMatchesQuery('conf[2026]','['),true);
  assert.equal(scope.labelMatchesQuery('Project',''),true);
  assert.equal(scope.labelMatchesQuery('Project','other'),false);
});
test('label checkboxes distinguish all, some, none, legacy labels and exact keys',()=>{
  const msg=(keywords,label=0)=>({getStringProperty:()=>keywords,label});
  const state=messages=>JSON.parse(JSON.stringify(scope.labelAssignmentState({key:'one'},messages)));
  assert.deepEqual(state([msg('one'),msg('one two')]),{checked:true,mixed:false});
  assert.deepEqual(state([msg('one'),msg('two')]),{checked:false,mixed:true});
  assert.deepEqual(state([msg('onetwo')]),{checked:false,mixed:false});
  assert.deepEqual(state([]),{checked:false,mixed:false});
  assert.equal(scope.labelAssignmentState({key:'$label1'},[msg('',1)]).checked,true);
});
for(const independentMode of [false,true]) test(`label picker covers the full active scope (independent reader: ${independentMode})`,()=>{
  const nodes=[];
  function el(name){const events={}, attrs={};const n={name,events,children:[],style:{},value:'',isConnected:true,
    classList:{add(){},remove(){}},setAttribute(k,v){attrs[k]=v},getAttribute:k=>attrs[k],
    append(...children){this.children.push(...children)},prepend(x){this.children.unshift(x)},
    replaceChildren(...children){this.children=children},get childElementCount(){return this.children.length},
    addEventListener(k,f){(events[k]??=[]).push(f)},removeEventListener(){},remove(){},
    focus(){doc.activeElement=this},querySelectorAll(){return this.children.flatMap(x=>x.children.filter(y=>y.name==='input'))},
    openPopup(){this.events.popupshown?.forEach(f=>f())},hidePopup(){this.events.popuphidden?.forEach(f=>f())}};
    nodes.push(n);return n;}
  const layout=el(),tree=el(),folderTree=el(),threadPane=el();
  const keyEvents={};
  const doc={activeElement:tree,querySelectorAll:()=>[],addEventListener:(name,fn)=>keyEvents[name]=fn,removeEventListener(){},getElementById:id=>({paneLayout:layout,threadTree:tree,folderTree,threadPane})[id],
    createElement:el,createElementNS:(_ns,name)=>el(name),createXULElement:el,head:el(),documentElement:el()};
  const messages=[{messageKey:1,folder:{URI:'inbox'},getStringProperty:()=> 'one'},
    {messageKey:2,folder:{URI:'inbox'},getStringProperty:()=> ''}];let selected=messages;const calls=[];
  scope.Ci={nsIMsgFolderNotificationService:{msgsMoveCopyCompleted:1}};
  scope.MailServices={mfn:{addListener(){},removeListener(){}},tags:{getAllTags:()=>[
    {key:'one',tag:'Project One',color:'#ff0000'},{key:'two',tag:'Other'},
    {key:'child',tag:'Project One/Child'},{key:'leaf',tag:'Project One/Child/Leaf'}]}};
  const nativeCommands=[];
  const win={document:doc,top:{document:doc},gDBView:{rowCount:2,getFlagsAt:()=>0,getMsgHdrAt:i=>messages[i],getSelectedMsgHdrs:()=>selected},commandController:{_toggleMessageTag:(...args)=>calls.push(args),doCommand:name=>nativeCommands.push(name)},
    addEventListener(){},removeEventListener(){}};
  let conversationMessages=[...messages,{messageKey:1,folder:{URI:'Sent'},getStringProperty:()=>''}],refreshes=0;
  if(independentMode) {
    scope.installIndependentReader=()=>({open:()=>Promise.resolve(),getMessages:()=>conversationMessages,refresh(){refreshes++},hide(){},close(){}});
    for(const header of conversationMessages) {
      header.folder.addKeywordsToMessages=(headers,key)=>calls.push(['add',header.folder.URI,Array.from(headers,h=>h.messageKey),key]);
      header.folder.removeKeywordsFromMessages=(headers,key)=>calls.push(['remove',header.folder.URI,Array.from(headers,h=>h.messageKey),key]);
    }
  }
  const controller=scope.installReadingMode(win);
  if(independentMode) {
    controller.setIndependent(true);controller.openIndex(0);
    const pressL=()=>keyEvents.keydown({key:'l',target:{closest:()=>null},preventDefault(){},stopImmediatePropagation(){}});
    pressL();
    assert.ok(nodes.some(n=>n.textContent==='Label as:'));
    assert.equal(nodes.find(n=>n.className==='gm-label-scope').hidden,true,'scope remains in the accessible panel name');
    assert.equal(nodes.find(n=>n.name==='panel').getAttribute('aria-label'),'Label as — entire conversation, 3 messages, includes sent replies');
    const checkbox=nodes.find(n=>n.type==='checkbox' && n.getAttribute('aria-label')==='Project One');checkbox.checked=true;checkbox.events.change[0]();
    assert.deepEqual(JSON.parse(JSON.stringify(calls)),[['add','inbox',[1,2],'one'],['add','Sent',[1],'one']]);
    checkbox.checked=false;checkbox.events.change[0]();
    assert.deepEqual(JSON.parse(JSON.stringify(calls.slice(2))),[['remove','inbox',[1,2],'one'],['remove','Sent',[1],'one']]);
    assert.equal(refreshes,2,'message chips and title labels refresh after a conversation-wide write');
    conversationMessages=conversationMessages.slice(0,1);checkbox.checked=true;checkbox.events.change[0]();
    assert.equal(calls.length,4,'changing conversation membership invalidates the open picker');
    conversationMessages=[];pressL();
    assert.ok(nodes.some(n=>n.getAttribute?.('aria-label')?.includes('loading')),'loading must never imply a partial message count');
    assert.equal(nodes.find(n=>n.type==='search').disabled,true,'loading cannot fall back to labeling just the selected row');
    assert.ok(nodes.some(n=>n.textContent==='Conversation is still loading. Close this panel and try again.'));
    controller.close();return;
  }
  nodes.find(n=>n.title==='Labels… (L)').events.click[0]();
  assert.ok(nodes.some(n=>n.textContent==='Label as:'));
  assert.equal(nodes.find(n=>n.className==='gm-label-scope').hidden,true,'list selection does not claim to label a whole conversation');
  const search=nodes.find(n=>n.type==='search');assert.equal(doc.activeElement,search);
  const flat=nodes.find(n=>n.className==='gm-label-list');
  assert.deepEqual(flat.children.map(row=>row.children[1].textContent),['Project One','Other','Project One/Child','Project One/Child/Leaf']);
  assert.ok(flat.children.every(row=>row.children.length===2 && row.children[0].type==='checkbox'),'all labels share a single checkbox gutter, without disclosure buttons');
  assert.ok(flat.children.every(row=>row.style.paddingInlineStart===undefined),'nested paths have no extra indentation');
  search.value='Child';search.events.input[0]();
  assert.deepEqual(flat.children.map(row=>row.children[1].textContent),['Project One/Child','Project One/Child/Leaf'],'search preserves the full path at every nesting depth');
  search.value='';search.events.input[0]();
  const first=nodes.find(n=>n.type==='checkbox' && n.getAttribute('aria-label')==='Project One');assert.equal(first.indeterminate,true);
  first.checked=true;first.events.change[0]();assert.deepEqual(calls,[['one',true]]);
  first.checked=false;first.events.change[0]();assert.deepEqual(calls[1],['one',false]);
  search.value='Other';search.events.input[0]();
  const list=nodes.find(n=>n.className==='gm-label-list');assert.equal(list.childElementCount,1);
  const other=list.children[0].children.find(n=>n.type==='checkbox');selected=[messages[0]];
  other.checked=true;other.events.change[0]();assert.equal(calls.length,2);assert.equal(doc.activeElement,tree);
  nodes.find(n=>n.textContent==='Manage labels').events.click[0]();
  assert.deepEqual(nativeCommands,['cmd_manageTags']);
  nodes.find(n=>n.title==='Labels… (L)').events.click[0]();
  assert.ok(nodes.some(n=>n.textContent==='Label as:'),'a single native selection is labelled explicitly');
  assert.equal(nodes.find(n=>n.name==='panel').getAttribute('aria-label'),'Label as — 1 selected messages');
  selected=messages;nodes.find(n=>n.title==='Labels… (L)').events.click[0]();
  nodes.find(n=>n.textContent==='Create new').events.click[0]();
  assert.deepEqual(nativeCommands,['cmd_manageTags']);
  assert.ok(nodes.some(n=>n.className==='gm-new-label'));
  assert.equal(nodes.find(n=>n.getAttribute('aria-label')==='Parent label').disabled,true);
  const newName=nodes.find(n=>n.getAttribute('aria-label')==='New label name');
  const parentSelect=nodes.find(n=>n.getAttribute('aria-label')==='Parent label');
  const nest=nodes.find(n=>n.type==='checkbox' && !n.getAttribute('aria-label'));
  const form=nodes.find(n=>n.className==='gm-new-label');
  const additions=[];scope.MailServices.tags.addTag=(...args)=>additions.push(args);
  scope.MailServices.tags.getKeyForTag=()=> 'new-child-key';
  newName.value='Project One';form.events.submit[0]({preventDefault(){}});
  assert.equal(additions.length,0,'duplicate label must not be created');
  newName.value='New Child';nest.checked=true;parentSelect.value='Project One';
  form.events.submit[0]({preventDefault(){}});
  assert.deepEqual(additions,[['Project One/New Child','','']]);
  assert.deepEqual(calls.at(-1),['new-child-key',true],'apply only the child key to the exact selection');
  controller.close();
});
test('conversation scope resolves exact Conversations IDs across Inbox and Sent, deduplicating copies of the same header',()=>{
  const inbox={URI:'mailbox://test/Inbox'},sent={URI:'mailbox://test/Sent'};
  const headers=new Map([[11,{folder:inbox,messageKey:1}],[12,{folder:inbox,messageKey:2}],[13,{folder:sent,messageKey:1}]]);
  const doc=ids=>({querySelectorAll:()=>ids.map(id=>({getAttribute:()=>String(id)}))});
  const messages=scope.conversationLabelMessages(doc([11,12,13,13]),id=>headers.get(id));
  assert.equal(messages.length,3);assert.equal(messages[2].folder,sent);
  assert.equal(scope.conversationLabelMessages(doc([]),id=>headers.get(id)),null);
  assert.equal(scope.conversationLabelMessages(doc([11,999]),id=>headers.get(id)),null,'unresolved Sent must block partial labeling');
  assert.equal(scope.conversationLabelMessages(doc(['bad']),id=>headers.get(id)),null);
  assert.equal(scope.sameLabelMessages(messages,[messages[2],messages[0],messages[1]]),true);
  assert.equal(scope.sameLabelMessages(messages,messages.slice(0,2)),false);
});
test('conversation tag add/remove writes exact headers to every folder, including sent replies',()=>{
  const calls=[];
  function folder(URI){return {URI,addKeywordsToMessages:(messages,key)=>calls.push(['add',URI,messages.map(m=>m.messageKey),key]),
    removeKeywordsFromMessages:(messages,key)=>calls.push(['remove',URI,messages.map(m=>m.messageKey),key])};}
  const inbox=folder('Inbox'),sent=folder('Sent');
  const messages=[{folder:inbox,messageKey:1},{folder:sent,messageKey:1},{folder:inbox,messageKey:2}];
  scope.applyConversationLabel(messages,'srds_sc',true);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)),[['add','Inbox',[1,2],'srds_sc'],['add','Sent',[1],'srds_sc']]);
  calls.length=0;scope.applyConversationLabel(messages,'srds_sc',false);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)),[['remove','Inbox',[1,2],'srds_sc'],['remove','Sent',[1],'srds_sc']]);
  sent.addKeywordsToMessages=()=>{throw Error('read only')};
  assert.throws(()=>scope.applyConversationLabel(messages,'srds_sc',true),/read only/);
});

test('L accepts selection checkboxes and radio controls but still ignores writing fields and composer documents',()=>{
 const selector='input:not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], search-textbox';
 for(const type of ['checkbox','radio','text','search']){
  const target={closest:value=>{assert.equal(value,selector);return ['checkbox','radio'].includes(type)?null:{};}};
  assert.equal(scope.isLabelShortcut({key:'l',target}),['checkbox','radio'].includes(type));
 }
 assert.equal(scope.isLabelShortcut({key:'l',target:{ownerDocument:{documentURI:'chrome://messenger/content/messengercompose/messengercompose.xhtml'},closest:()=>null}}),false);
});

test('labels reach hidden physical Sent copies without matching subjects or scanning messages',()=>{
 const writes=[],inbox={URI:'Inbox',addKeywordsToMessages:(h,key)=>writes.push(['Inbox',h,key]),removeKeywordsFromMessages:(h,key)=>writes.push(['Inbox',h,key])};
 const sent={URI:'Sent',addKeywordsToMessages:(h,key)=>writes.push(['Sent',h,key]),removeKeywordsFromMessages:(h,key)=>writes.push(['Sent',h,key])};
 const original={folder:inbox,messageKey:1,messageId:'same'},copy={folder:sent,messageKey:2,messageId:'same'};
 sent.msgDatabase={getMsgHdrForMessageID(id){assert.equal(id,'same');return copy}};
 scope.independentSentFolders=()=>[sent];
 for(const add of [true,false]){
  writes.length=0;scope.applyConversationLabel([original],'test',add);
  assert.equal(writes.length,2);assert.equal(writes[1][1][0],copy);assert.equal(writes[1][2],'test');
 }
 const result=scope.conversationPhysicalMessages([original,copy],[sent]);assert.equal(result.length,2,'copies are not written twice');
 sent.msgDatabase.getMsgHdrForMessageID=()=>null;assert.equal(scope.conversationPhysicalMessages([original],[sent]).length,1);
 Object.defineProperty(sent,'msgDatabase',{get(){throw Error('offline')}});assert.equal(scope.conversationPhysicalMessages([original],[sent]).length,1);
 delete scope.independentSentFolders;
});
