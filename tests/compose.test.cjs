const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const scope=require('./localization-context.cjs').createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/compose.js'),'utf8'),scope);
function preferences(initial={}) {
  const values=new Map(Object.entries(initial));
  const defaults={'mail.compose.autosave':true,'mail.compose.autosaveinterval':5};
  return {values,prefHasUserValue:key=>values.has(key),clearUserPref:key=>values.delete(key),
    getBoolPref:key=>values.has(key)?values.get(key):defaults[key],getIntPref:key=>values.has(key)?values.get(key):defaults[key],
    getStringPref:(key,fallback)=>values.get(key)??fallback,
    setBoolPref:(key,value)=>values.set(key,value),setIntPref:(key,value)=>values.set(key,value),setStringPref:(key,value)=>values.set(key,value)};
}
test('draft autosave uses native preferences and restores original values and user-pref presence',()=>{
  const prefs=preferences({'mail.compose.autosave':false});
  const controller=scope.createComposeAutosave(prefs);
  controller.set(true,1);assert.equal(prefs.getBoolPref('mail.compose.autosave'),true);
  assert.equal(prefs.getIntPref('mail.compose.autosaveinterval'),1);
  controller.set(true,10);controller.close();
  assert.equal(prefs.getBoolPref('mail.compose.autosave'),false);
  assert.equal(prefs.prefHasUserValue('mail.compose.autosaveinterval'),false);
  assert.equal(prefs.getIntPref('mail.compose.autosaveinterval'),5);
});
test('autosave snapshot survives an interrupted session and independent changes are preserved',()=>{
  const prefs=preferences({'mail.compose.autosave':false,'mail.compose.autosaveinterval':10});
  scope.createComposeAutosave(prefs).set(true,1);
  const restarted=scope.createComposeAutosave(prefs);restarted.set(true,2);
  prefs.setIntPref('mail.compose.autosaveinterval',8);restarted.close();
  assert.equal(prefs.getBoolPref('mail.compose.autosave'),false);
  assert.equal(prefs.getIntPref('mail.compose.autosaveinterval'),8);
  assert.equal(prefs.prefHasUserValue('extensions.thunderg.composeAutosaveSnapshot'),false);
});
test('invalid intervals cannot create zero-delay autosave loops and closed controllers do not write',()=>{
  const prefs=preferences(),controller=scope.createComposeAutosave(prefs);
  controller.set(true,0);assert.equal(prefs.getIntPref('mail.compose.autosaveinterval'),1);
  controller.close();controller.set(true,2);assert.equal(prefs.getIntPref('mail.compose.autosaveinterval'),5);
});
test('inline replies pass exact header, native reply type, identity and default account format to native composer',()=>{
 const types={ReplyToSender:1,ReplyAll:2,ForwardInline:3},Ci={nsIMsgCompType:types,nsIMsgCompFormat:{Default:0}};
 const identity={key:'account-signature-and-drafts'};const fields={};
 const Cc={'@mozilla.org/messengercompose/composeparams;1':{createInstance:()=>({})},'@mozilla.org/messengercompose/composefields;1':{createInstance:()=>fields}};
 const header={folder:{getUriForMsg:value=>{assert.equal(value,header);return 'imap-message://Sent#42'}}};
 for(const [command,type] of [['cmd_replySender',1],['cmd_replyall',2],['cmd_forwardInline',3]]){
  const params=scope.inlineReplyParams(header,command,{},Ci,Cc,{getIdentityForHeader(value,kind){assert.equal(value,header);assert.equal(kind,type);return [identity]}});
  assert.equal(params.type,type);assert.equal(params.identity,identity);assert.equal(params.originalMsgURI,'imap-message://Sent#42');assert.equal(params.composeFields,fields);assert.equal(params.format,0);
 }
 assert.throws(()=>scope.inlineReplyParams(header,'cmd_unsupported',{},Ci,Cc,{}));
});
test('inline compose preserves an open reply across navigation and guards dirty window/tab closure with native draft prompts',async()=>{
 let observer,frame,mayClose=false,paramsReceived;const events=new Map(),timers=new Map(),nativeEvents=new Map(),stateListeners=new Set();
 function element(tag){return {tag,style:{},dataset:{},children:[],events:{},getBoundingClientRect:()=>({width:0,height:0}),setAttribute(){},append(...values){for(const value of values){value.parentNode=this;this.children.push(value)}},replaceChildren(...values){this.children=[];this.append(...values)},moveBefore(value){if(value.parentNode)value.parentNode.children=value.parentNode.children.filter(item=>item!==value);this.append(value)},scrollIntoView(){this.revealed=true},isConnected:true,remove(){this.removed=true},focus(){this.focused=true},addEventListener(name,fn){this.events[name]=fn},removeEventListener(name){delete this.events[name]}};}
 const appChrome={XULBrowserWindow:{original:true}},oldChrome=appChrome.XULBrowserWindow;
 const mode={tryCloseTab:()=>true},tab={mode},main={document:{getElementById:()=>({tabInfo:[tab]})},docShell:{treeOwner:{QueryInterface(){return {getInterface:()=>appChrome}}}},addEventListener(name,fn){events.set(name,fn)},removeEventListener(name){events.delete(name)}};
 const native={addEventListener(name,fn){nativeEvents.set(name,fn)},removeEventListener(name){nativeEvents.delete(name)},document:{addEventListener(){},removeEventListener(){}},gMsgCompose:{compFields:{draftId:''},RegisterStateListener(fn){stateListeners.add(fn)},UnregisterStateListener(fn){stateListeners.delete(fn)}},GetCurrentEditor:()=>({}),ComposeCanClose:()=>mayClose,SetMsgBodyFrameFocus(){}};
 const sidebar={getBoundingClientRect:()=>({width:260,right:260,left:0})};
 const doc={getElementById:id=>id==='folderPane'?sidebar:null,documentElement:element('html'),createElement:element,createElementNS:(ns,tag)=>element(tag),createXULElement(){
  frame=element('browser');frame.browsingContext={};native.browsingContext=frame.browsingContext;
  frame.contentWindow=native;frame.contentDocument={getElementById:()=>null,documentURI:'chrome://messenger/content/messengercompose/messengercompose.xhtml',createElement:element,documentElement:element('html')};
  frame.loadURI=()=>{observer.observe(native);paramsReceived=native.arguments[0];nativeEvents.get('compose-window-init')?.();for(const listener of stateListeners)listener.NotifyComposeBodyReady?.();frame.events.load({target:frame.contentDocument})};return frame;
 }};
 const win={document:doc,browsingContext:{topChromeWindow:main},setTimeout(fn){timers.set(1,fn);return 1},clearTimeout(id){timers.delete(id)},addEventListener(name,fn){events.set('pane-'+name,fn)},removeEventListener(name){events.delete('pane-'+name)}};tab.chromeBrowser={contentWindow:win};
 const testScope=require('./localization-context.cjs').createContext({
  Ci:{nsIMsgCompType:{New:0,ReplyToSender:1,ReplyAll:2},nsIMsgCompFormat:{Default:0}},
  Cc:{'@mozilla.org/messengercompose/composeparams;1':{createInstance:()=>({})},'@mozilla.org/messengercompose/composefields;1':{createInstance:()=>({})}},
  MailServices:{},ChromeUtils:{importESModule:()=>({MailUtils:{getIdentityForHeader:()=>[{key:'chosen-account'}]}})},
  Services:{obs:{addObserver(value){observer=value},removeObserver(){}},io:{newURI:value=>value},scriptSecurityManager:{getSystemPrincipal:()=>({})}}
 });vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/compose.js'),'utf8'),testScope);
 let feedback;testScope.installInlineSendStatus=(native,clock,onState)=>{feedback=onState;return {close(){}}};
 const composer=testScope.createInlineCompose(win),header={mime2DecodedSubject:'Original',folder:{getUriForMsg:()=> 'imap-message://Sent#42'}};
 const inline=element('conversation'),scrollHost={hidden:false};
 composer.open(header,'cmd_replyall',{container:inline,scrollHost});assert.equal(composer.presentation,'inline');assert.equal(composer.active,true);assert.equal(paramsReceived.type,2);assert.equal(paramsReceived.identity.key,'chosen-account');assert.equal(appChrome.XULBrowserWindow,oldChrome);
 const controls=inline.children[0].children[0].children;
 assert.equal(controls[1].children[1].textContent,'Save draft');
 assert.equal(controls[2].children[1].textContent,'Detach reply');
 assert.equal(controls[3].children[1].textContent,'Separate window');
 assert.equal(controls[3].children[0].tag,'svg','window action has a window illustration, not a send arrow');
 const originalFrame=frame;
 feedback({state:'sending'});assert.equal(inline.children[0].hidden,false,'sending must never hide/destroy the embedded editor');assert.equal(frame.removed,undefined);
 feedback({state:'draft-error',error:'Connection failed',draftError:'Disk full'});assert.equal(inline.children[0].hidden,false);
 native.gMsgCompose.bodyModified=true;
 composer.float();assert.equal(composer.presentation,'floating');assert.equal(frame,originalFrame);assert.equal(native.gMsgCompose.bodyModified,true);
 assert.equal(controls[2].children.at(-1).textContent,'Return to conversation');
 composer.returnInline();assert.equal(composer.presentation,'inline');assert.equal(frame,originalFrame);
 composer.open({mime2DecodedSubject:'Another conversation'},'cmd_replySender');assert.equal(frame,originalFrame);assert.equal(composer.target,header);assert.equal(composer.command,'cmd_replyall');
 assert.equal(composer.close(),false);assert.equal(frame.removed,undefined,'cancel/save-in-progress must not destroy the editor');
 let prevented=false;events.get('close')({preventDefault(){prevented=true}});assert.equal(prevented,true);
 assert.equal(mode.tryCloseTab(tab),false,'closing a mail tab must honor native cancellation too');
 assert.equal(mode.tryCloseTab({}),true,'other tabs keep native behavior');
 // Native compose closes itself only after send/save has completed; the host then releases it.
 native.close();assert.equal(composer.active,false);assert.equal(originalFrame.removed,true);
 composer.open(null,'cmd_newMessage');assert.equal(paramsReceived.type,0);assert.equal(composer.presentation,'floating');assert.equal(composer.target,null);composer.returnInline();assert.equal(composer.presentation,'full');
 const fullPanel=doc.documentElement.children.at(-1);assert.equal(fullPanel.style.left,'12px','expanded composer uses a modal inset');
 sidebar.getBoundingClientRect=()=>({width:340,right:340,left:0});events.get('pane-resize')();assert.equal(fullPanel.style.left,'12px','expanded composer keeps its modal inset when the sidebar changes');
 composer.float();assert.equal(composer.presentation,'floating');const newFrame=frame;composer.minimize();assert.equal(frame,newFrame);assert.equal(composer.active,true);composer.minimize();assert.equal(frame,newFrame);composer.returnInline();assert.equal(composer.presentation,'full');assert.equal(frame,newFrame);
 composer.open(header,'cmd_replySender');assert.equal(composer.command,'cmd_newMessage','Reply must not replace an open new message');let closeSaves=0;testScope.saveInlineReplyDraft=async()=>{closeSaves++;throw new Error('Draft folder unavailable')};
 testScope.initialComposeText.set(native,'');native.GetCurrentEditor=()=>({outputToString:()=> 'A reply I wrote'});
 const closeControl=doc.documentElement.children.at(-1).children[0].children[4];
 await closeControl.events.click();assert.equal(composer.active,true,'failed close-save preserves reply');
 testScope.saveInlineReplyDraft=async()=>{closeSaves++;return 'draft://confirmed'};
 await closeControl.events.click();assert.equal(closeSaves,2);assert.equal(composer.active,false,'Close waits for saved draft');
 mayClose=true;assert.equal(composer.close(),true);assert.equal(composer.active,false);assert.equal(events.has('close'),false);
});
test('separate-window transfer waits for native draft completion and retains failures',async()=>{
 const draftScope=require('./localization-context.cjs').createContext({Ci:{nsIMsgCompDeliverMode:{SaveAsDraft:4}}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/compose.js'),'utf8'),draftScope);
 for(const success of [true,false]){
  let listener,unregistered=false,started=false;
  const compose={compFields:{draftId:''},RegisterStateListener(value){listener=value},UnregisterStateListener(value){assert.equal(value,listener);unregistered=true}};
  const native={gMsgCompose:compose,GenericSendMessage(mode){assert.equal(mode,4);started=true}};
  const pending=draftScope.saveInlineReplyDraft(native,{setTimeout,clearTimeout},1000);
  await Promise.resolve();assert.equal(started,true);assert.equal(unregistered,false);
  compose.compFields.draftId=success?'imap-message://Drafts#123':'';
  listener.ComposeProcessDone(success?0:1);
  if(success)assert.equal(await pending,'imap-message://Drafts#123');else await assert.rejects(pending,/Could not save/);
  assert.equal(unregistered,true);assert.equal(native.gMsgCompose,compose);
 }
 await assert.rejects(draftScope.saveInlineReplyDraft({gSaveOperationInProgress:true},{setTimeout,clearTimeout}),/Wait/);
});

test('new-message parameters preserve folder identity and native format without a reply URI',()=>{
 const custom={key:'custom-signature'},server={key:'server-signature'},Ci={nsIMsgCompType:{New:0},nsIMsgCompFormat:{Default:2}},Cc={
 '@mozilla.org/messengercompose/composeparams;1':{createInstance:()=>({})},
 '@mozilla.org/messengercompose/composefields;1':{createInstance:()=>({})}};
 const utils={getIdentityForServer(value){assert.equal(value,'server');return [server]}};
 for(const [folder,identity] of [[{customIdentity:custom,server:'server'},custom],[{server:'server'},server],[null,null]]){
  const params=scope.inlineNewMessageParams(folder,Ci,Cc,utils);
  assert.equal(params.type,0);assert.equal(params.format,2);assert.equal(params.identity,identity);
  assert.equal(params.originalMsgURI,undefined);assert.deepEqual(Object.keys(params.composeFields),[]);
 }
});
test('Write is opt-in, reuses the existing compose controller, and restores native commands',()=>{
 const native=[],opens=[],folder={server:{type:'imap'}};
 const controller={doCommand(...args){native.push(args);return 'native'}};
 const win={commandController:controller,gFolder:folder},original=controller.doCommand;
 let created=0;const composer={open(...args){opens.push(args)}};
 const hook=scope.installInlineNewMessage(win,()=>{created++;return composer});
 scope.inlineNewMessageEnabled=false;assert.equal(controller.doCommand('cmd_newMessage'),'native');
 scope.inlineNewMessageEnabled=true;controller.doCommand('cmd_newMessage');controller.doCommand('cmd_newMessage');
 assert.equal(created,1);assert.equal(opens.length,2);assert.equal(opens[0][0],null);assert.equal(opens[0][1],'cmd_newMessage');assert.equal(opens[0][2].folder,folder);
 controller.doCommand('cmd_forwardInline');controller.doCommand('cmd_newMessage',{shiftKey:true});
 folder.server.type='nntp';controller.doCommand('cmd_newMessage');assert.equal(native.length,4);
 scope.inlineNewMessageEnabled=false;controller.doCommand('cmd_newMessage');assert.equal(native.length,5);
 hook.close();assert.equal(controller.doCommand,original);
});

test('main-window Write and shortcut route to the active pane without affecting other tabs',()=>{
 const calls=[],opens=[],win={gFolder:{server:{type:'imap'}},commandController:{doCommand(){calls.push('pane-native')}}};
 const original=function(){calls.push('main-native')};
 const tabmail={currentAbout3Pane:win},main={MsgNewMessage:original,document:{getElementById:()=>tabmail}};
 win.browsingContext={topChromeWindow:main};
 const hook=scope.installInlineNewMessage(win,()=>({open(){opens.push('new')}}));
 scope.inlineNewMessageEnabled=true;main.MsgNewMessage({});assert.equal(opens.length,1);assert.equal(calls.length,0);
 tabmail.currentAbout3Pane={};main.MsgNewMessage({});assert.equal(calls.pop(),'main-native');
 tabmail.currentAbout3Pane=win;main.MsgNewMessage({shiftKey:true});assert.equal(calls.pop(),'main-native');
 scope.inlineNewMessageEnabled=false;main.MsgNewMessage({});assert.equal(calls.pop(),'main-native');
 hook.close();assert.equal(main.MsgNewMessage,original);
});

test('embedded attachment picker anchors to the mail window and preserves native file handling',async()=>{
 let resultCallback,initArgs,restored=0,added,files=[{name:'qa.txt'},{name:'qa2.txt'}],last;
 const original=()=>{},native={AttachFile:original,gMsgCompose:{},gAttachmentBucket:{itemCount:1},
  document:{l10n:{async formatValue(){return 'Attach files'}}},toggleAttachmentPane(mode){assert.equal(mode,'show');restored++},
  GetLastAttachDirectory:()=> 'previous-directory',FileToAttachment:file=>({name:file.name}),
  AddAttachments(items){added=items},SetLastAttachDirectory(file){last=file}};
 const picker={files,init(...args){initArgs=args},appendFilters(value){assert.equal(value,7)},open(callback){resultCallback=callback}};
 const classes={'@mozilla.org/filepicker;1':{createInstance:()=>picker}},interfaces={nsIFilePicker:{modeOpenMultiple:2,filterAll:7,returnOK:0}};
 const host={browsingContext:{host:true}},hook=scope.installEmbeddedAttachmentPicker(native,host,classes,interfaces);
 await native.AttachFile();assert.equal(initArgs[0],host.browsingContext);assert.equal(initArgs[1],'Attach files');assert.equal(initArgs[2],2);
 assert.equal(picker.displayDirectory,'previous-directory');assert.equal(restored,1);
 resultCallback(0);assert.equal(added.length,2);assert.equal(added[1].name,'qa2.txt');assert.equal(last,files[1]);
 added=null;await native.AttachFile();resultCallback(1);assert.equal(added,null,'Cancel leaves attachments unchanged');
 await native.AttachFile();hook.close();resultCallback(0);assert.equal(added,null,'late picker results cannot affect a closed compose window');assert.equal(native.AttachFile,original);
});

function composeEventTarget(){
 const listeners=new Map();return {listeners,addEventListener(name,fn){listeners.set(name,fn)},removeEventListener(name){listeners.delete(name)},emit(name,event={}){listeners.get(name)?.({type:name,...event})}};
}
test('draft status waits for native success, clears on edits, handles failure and edits during autosave, and cleans up',()=>{
 const document=composeEventTarget(),body=composeEventTarget(),native=Object.assign(composeEventTarget(),{document,GetCurrentEditor:()=>({document:body})});
 let listener;native.gMsgCompose={compFields:{draftId:'old-draft'},bodyModified:false,RegisterStateListener(value){listener=value},UnregisterStateListener(value){assert.equal(value,listener);listener=null}};
 const timers=new Map();let sequence=0;
 const clock={setTimeout(fn,delay){timers.set(++sequence,{fn,delay});return sequence},clearTimeout(id){timers.delete(id)}};
 const complete=()=>{for(const [id,task] of [...timers])if(task.delay===0){timers.delete(id);task.fn()}};
 const status={dataset:{},style:{}},modes={SaveAsDraft:4,AutoSaveAsDraft:7};
 const hook=scope.installComposeDraftStatus(native,status,clock,modes);
 assert.equal(status.textContent,'Not saved','an old draft URI is not evidence of a new save');
 native.emit('compose-send-message',{detail:{msgType:7}});assert.equal(status.textContent,'Saving…');
 listener.ComposeProcessDone(0);assert.equal(status.textContent,'Saving…','native flags must settle before showing success');complete();
 assert.equal(status.textContent,'✓ Saved');assert.match(status.style.color,/#137333/);
 body.emit('input');assert.equal(status.textContent,'Unsaved changes','body edits clear success immediately');
 native.emit('compose-send-message',{detail:{msgType:4}});listener.ComposeProcessDone(1);complete();assert.equal(status.textContent,'Save failed','a previous draft cannot hide a failure');
 native.emit('compose-send-message',{detail:{msgType:7}});body.emit('input');native.gMsgCompose.bodyModified=true;listener.ComposeProcessDone(0);complete();
 assert.equal(status.textContent,'Unsaved changes','typing during autosave is not reported as saved');
 native.gMsgCompose.bodyModified=false;native.emit('compose-send-message',{detail:{msgType:4}});listener.ComposeProcessDone(0);complete();assert.equal(status.textContent,'✓ Saved');
 document.emit('input',{isTrusted:false});document.emit('change',{isTrusted:true});assert.equal(status.textContent,'✓ Saved','native serialization and clean blur events do not clear success');
 native.gContentChanged=true;document.emit('attachments-added');assert.equal(status.textContent,'Unsaved changes');
 native.emit('compose-send-message',{detail:{msgType:0}});assert.equal(status.textContent,'Unsaved changes','sending is not draft saving');
 hook.close();assert.equal(timers.size,0);assert.equal(listener,null);assert.equal(body.listeners.size,0);assert.equal(document.listeners.size,0);assert.equal(native.listeners.size,0);
});

function floatingFixture(prefs,dir='ltr',testScope=scope) {
 function element(){return Object.assign(composeEventTarget(),{style:{},children:[],setAttribute(){},append(item){this.children.push(item)},remove(){this.removed=true},setPointerCapture(id){this.captured=id},hasPointerCapture(id){return this.captured===id},releasePointerCapture(){this.captured=null}})}
 const panel=element();panel.getBoundingClientRect=()=>({width:parseFloat(panel.style.width)||720,height:parseFloat(panel.style.height)||600});
 const win={document:{documentElement:{dir},createElement:element,createElementNS:element}};
 const hook=testScope.installFloatingComposeResize(win,panel,prefs),[corner,top,side]=panel.children;
 return {panel,hook,corner,top,side};
}
test('floating resize uses pointer capture, clamps to the message area, preserves dimensions and supports keyboard resizing',()=>{
 const {panel,hook,corner,top,side}=floatingFixture();
 const limits={maxWidth:900,maxHeight:700};hook.update(true,limits);assert.equal(panel.style.width,'720px');
 const event=(values={})=>({button:0,pointerId:1,clientX:200,clientY:200,preventDefault(){},stopPropagation(){},...values});
 corner.emit('pointerdown',event());assert.equal(corner.captured,1);
 corner.emit('pointermove',event({clientX:100,clientY:150}));assert.equal(panel.style.width,'820px');assert.equal(panel.style.height,'650px');
 corner.emit('pointermove',event({clientX:-200,clientY:-200}));assert.equal(panel.style.width,'900px');assert.equal(panel.style.height,'700px');
 corner.emit('pointerup');assert.equal(corner.captured,null);
 hook.update(false,limits);assert.equal(corner.hidden,true);
 panel.style.width='1200px';hook.update(true,limits);assert.equal(panel.style.width,'900px','detach/return retains the user choice');
 hook.update(true,{maxWidth:300,maxHeight:250});assert.equal(panel.style.width,'300px');assert.equal(panel.style.height,'250px','small viewports override minimum sizes');
 hook.update(true,limits);assert.equal(panel.style.width,'900px');
 corner.emit('keydown',event({key:'ArrowRight'}));assert.equal(panel.style.width,'884px');
 top.emit('pointerdown',event());top.emit('pointermove',event({clientX:100,clientY:250}));top.emit('pointercancel');assert.equal(panel.style.width,'884px');assert.equal(panel.style.height,'650px','top edge changes height only');
 side.emit('pointerdown',event());side.emit('pointermove',event({clientX:1000,clientY:1000}));side.emit('pointerup');assert.equal(panel.style.width,'420px');assert.equal(panel.style.height,'650px','side edge changes width only');
 hook.close();assert.ok(panel.children.every(handle=>handle.removed));
});

test('floating size survives new composers and restart without saving each drag frame or viewport adjustment',()=>{
 const key='extensions.thunderg.floatingComposeSize',prefs=preferences(),writes=[];
 const set=prefs.setStringPref;prefs.setStringPref=(name,value)=>{writes.push([name,value]);set(name,value)};
 const limits={maxWidth:900,maxHeight:700};
 const event=(values={})=>({button:0,pointerId:1,clientX:200,clientY:200,preventDefault(){},stopPropagation(){},...values});
 let f=floatingFixture(prefs);f.hook.update(true,limits);
 f.corner.emit('pointerdown',event());
 for(let step=1;step<=50;step++)f.corner.emit('pointermove',event({clientX:200-step*2,clientY:200-step}));
 assert.equal(writes.length,0,'pointer movement only changes the panel');
 f.corner.emit('pointerup',event());
 assert.equal(writes.length,1);assert.deepEqual(JSON.parse(prefs.getStringPref(key)),{width:820,height:650});
 f.hook.close();assert.equal(writes.length,1,'closing an unchanged panel does not write again');

 f=floatingFixture(prefs);f.hook.update(true,limits);
 assert.equal(f.panel.style.width,'820px');assert.equal(f.panel.style.height,'650px','a new composer reuses the chosen size');
 f.hook.update(true,{maxWidth:500,maxHeight:350});
 assert.equal(f.panel.style.width,'500px');assert.equal(f.panel.style.height,'350px');
 assert.equal(writes.length,1,'a smaller message area does not replace the preferred size');
 f.hook.update(true,limits);assert.equal(f.panel.style.width,'820px');assert.equal(f.panel.style.height,'650px');
 for(let count=0;count<3;count++)f.corner.emit('keydown',event({key:'ArrowRight'}));
 assert.equal(writes.length,1,'holding a resize key does not repeatedly persist');
 f.corner.emit('keyup',event({key:'ArrowRight'}));assert.equal(writes.length,2);
 assert.deepEqual(JSON.parse(prefs.getStringPref(key)),{width:772,height:650});
 f.corner.emit('keydown',event({key:'ArrowUp'}));f.corner.emit('blur');assert.equal(writes.length,3,'leaving the grip completes a keyboard gesture');
 f.corner.emit('keydown',event({key:'ArrowRight'}));f.hook.close();assert.equal(writes.length,4,'closing before keyup retains the latest choice');

 const restarted=require('./localization-context.cjs').createContext({});vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/compose.js'),'utf8'),restarted);
 f=floatingFixture(prefs,'rtl',restarted);f.hook.update(true,limits);
 assert.equal(f.panel.style.width,'756px');assert.equal(f.panel.style.height,'666px','a fresh extension context restores the stored preference');
 f.corner.emit('keydown',event({key:'ArrowLeft'}));f.corner.emit('keyup',event({key:'ArrowLeft'}));
 assert.equal(f.panel.style.width,'740px','RTL keyboard resizing remains mirrored');
 f.side.emit('pointerdown',event());f.side.emit('pointermove',event({clientX:230}));f.side.emit('pointerup',event());
 assert.deepEqual(JSON.parse(prefs.getStringPref(key)),{width:770,height:666},'RTL side grip follows its visual direction');
 f.hook.close();
});

test('invalid floating size preferences fall back safely and oversized drags save the visible result',()=>{
 const key='extensions.thunderg.floatingComposeSize',limits={maxWidth:900,maxHeight:700};
 for(const saved of ['broken JSON','null','{}','[]','{"width":"800","height":600}','{"width":0,"height":600}','{"width":800,"height":-1}','{"width":1e999,"height":600}']) {
  const prefs=preferences({[key]:saved}),f=floatingFixture(prefs);f.hook.update(true,limits);
  assert.equal(f.panel.style.width,'720px');assert.equal(f.panel.style.height,'600px');
  f.hook.close();assert.equal(prefs.getStringPref(key),saved,'opening a panel does not write over preferences');
 }
 const unavailable=floatingFixture({getStringPref(){throw new Error('unavailable')},setStringPref(){throw new Error('unavailable')}});
 unavailable.hook.update(true,limits);unavailable.corner.emit('keydown',{key:'ArrowRight',preventDefault(){},stopPropagation(){}});unavailable.hook.close();
 const prefs=preferences(),f=floatingFixture(prefs);f.hook.update(true,limits);
 const event=values=>({button:0,pointerId:1,clientX:200,clientY:200,preventDefault(){},stopPropagation(){},...values});
 f.corner.emit('pointerdown',event());f.corner.emit('pointermove',event({clientX:-10000,clientY:-10000}));f.corner.emit('pointerup',event());
 assert.deepEqual(JSON.parse(prefs.getStringPref(key)),{width:900,height:700},'remember the visible size, not how far the pointer overshot');
 f.hook.update(true,{maxWidth:1600,maxHeight:1000});assert.equal(f.panel.style.width,'900px');assert.equal(f.panel.style.height,'700px');f.hook.close();
});

function sendFixture({result='success',draftFails=false,busy=false}={}) {
 const events=new Map(),states=[],timers=new Map();let sendListener,saved=0,timerId=0;
 const modes={Now:0,Later:1,SaveAsDraft:4,Background:8};
 const compose={compFields:{from:'Me <me@example.org>',to:'You <you@example.org>',subject:'Re: Thread',messageId:''},
  addMsgSendListener(listener){sendListener=listener},removeMsgSendListener(listener){assert.equal(listener,sendListener);sendListener=null}};
 const native={gSendOperationInProgress:busy,gMsgCompose:compose,gAttachmentBucket:{itemChildren:[{attachment:{name:'notes.pdf'}}]},
  GetCurrentEditor:()=>({outputToString:()=>'<literal text> reply'}),
  addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name),
  async GenericSendMessage(mode){
   if(result==='preflight-cancel')return;
   events.get('compose-send-message')?.({detail:{msgType:mode}});
   if(busy)sendListener.onStartSending();
   if(mode!==modes.Now && mode!==modes.Background)return;
   if(result==='success'){
    sendListener.onStopSending('<outgoing-id>',0);compose.compFields.messageId='<outgoing-id>';
    events.get('aftersend')?.();
   }
   if(result==='server-error')sendListener.onStopSending('<failed>',0x80004005,'SMTP server refused the connection');
   if(result==='throw')throw new Error('network failed');
  }};
 const original=native.GenericSendMessage;
 const clock={setTimeout(fn){timers.set(++timerId,fn);return timerId},clearTimeout(id){timers.delete(id)}};
 const status=scope.installInlineSendStatus(native,clock,state=>states.push(state),async()=>{saved++;if(draftFails)throw new Error('disk full');return 'draft://42'},modes);
 return {native,states,status,original,modes,timers,fail(){sendListener.onStopSending('',1,'Send failed')},tick(){const pending=[...timers.values()];timers.clear();for(const fn of pending)fn()},get saved(){return saved}};
}
test('inline send shows an immediate snapshot and reports Sent only after native aftersend',async()=>{
 const f=sendFixture();await f.native.GenericSendMessage(f.modes.Now);
 assert.deepEqual(f.states.map(s=>s.state),['sending','sent']);
 assert.equal(f.states[0].body,'<literal text> reply');assert.equal(f.states[0].attachments[0],'notes.pdf');
 assert.equal(f.states[1].messageId,'<outgoing-id>');assert.equal(f.states[0].id,f.states[1].id);
 assert.equal(f.saved,0);f.status.close();assert.equal(f.native.GenericSendMessage,f.original);
});
test('native failure saves the real composer as a draft and exposes draft-save failure honestly',async()=>{
 for(const draftFails of [false,true]){
  const f=sendFixture({result:'failure',draftFails});await f.native.GenericSendMessage(f.modes.Now);
  assert.deepEqual(f.states.map(s=>s.state),['sending','saving-draft',draftFails?'draft-error':'draft-saved']);
  assert.equal(f.saved,1);if(!draftFails)assert.equal(f.states.at(-1).draftURI,'draft://42');f.status.close();
 }
 const f=sendFixture({result:'throw'});await assert.rejects(()=>f.native.GenericSendMessage(f.modes.Now));
 assert.equal(f.states.at(-1).state,'draft-saved');f.status.close();
});
test('preflight cancellation, draft autosave and queued mail do not pretend to send',async()=>{
 const cancelled=sendFixture({result:'preflight-cancel'});await cancelled.native.GenericSendMessage(cancelled.modes.Now);
 assert.equal(cancelled.states.length,0);assert.equal(cancelled.saved,0);cancelled.status.close();
 const f=sendFixture();await f.native.GenericSendMessage(f.modes.SaveAsDraft);await f.native.GenericSendMessage(f.modes.Later);
 assert.equal(f.states.length,0);assert.equal(f.saved,0);f.status.close();
});
test('native progress preference is restored after concurrent embedded sends without overwriting user changes',()=>{
 const prefs=preferences({'mailnews.show_send_progress':true});
 const a=scope.suppressInlineSendProgress(prefs),b=scope.suppressInlineSendProgress(prefs);
 assert.equal(prefs.getBoolPref('mailnews.show_send_progress'),false);a();a();
 assert.equal(prefs.getBoolPref('mailnews.show_send_progress'),false);b();
 assert.equal(prefs.getBoolPref('mailnews.show_send_progress'),true);
 const c=scope.suppressInlineSendProgress(prefs);prefs.setBoolPref('mailnews.show_send_progress',true);c();
 assert.equal(prefs.getBoolPref('mailnews.show_send_progress'),true);
});

test('failed-send recovery waits for native send and save operations to finish',async()=>{
 const f=sendFixture({result:'failure',busy:true});const sending=f.native.GenericSendMessage(f.modes.Now);
 await new Promise(setImmediate);f.native.gSaveOperationInProgress=true;f.fail();f.tick();await new Promise(setImmediate);assert.equal(f.saved,0);assert.equal(f.states.at(-1).state,'saving-draft');
 f.native.gSendOperationInProgress=false;f.native.gSaveOperationInProgress=true;f.tick();await new Promise(setImmediate);assert.equal(f.saved,0);
 f.native.gSaveOperationInProgress=false;f.tick();await sending;await new Promise(setImmediate);
 assert.equal(f.saved,1);assert.equal(f.states.at(-1).state,'draft-saved');f.status.close();
});
test('a later successful manual draft save clears a stale recovery failure notice',async()=>{
 const f=sendFixture({result:'failure',draftFails:true});await f.native.GenericSendMessage(f.modes.Now);
 assert.equal(f.states.at(-1).state,'draft-error');
 f.native.gMsgCompose.compFields.draftId='draft://manual';f.status.draftSaved();
 assert.equal(f.states.at(-1).state,'draft-saved');assert.equal(f.states.at(-1).draftURI,'draft://manual');f.status.close();
});
test('manual save during recovery avoids a duplicate save; closing cancels idle waiting',async()=>{
 const f=sendFixture({result:'failure',busy:true});const sending=f.native.GenericSendMessage(f.modes.Now);await new Promise(setImmediate);f.native.gSaveOperationInProgress=true;f.fail();f.tick();await new Promise(setImmediate);
 f.native.gMsgCompose.compFields.draftId='draft://manual';f.status.draftSaved();f.native.gSendOperationInProgress=false;f.native.gSaveOperationInProgress=false;f.tick();await sending;await new Promise(setImmediate);
 assert.equal(f.saved,0);assert.equal(f.states.at(-1).state,'draft-saved');f.status.close();
 const g=sendFixture({result:'failure',busy:true});const pending=g.native.GenericSendMessage(g.modes.Now);await new Promise(setImmediate);g.native.gSaveOperationInProgress=true;g.fail();g.tick();await new Promise(setImmediate);g.status.close();await pending;
 assert.equal(g.timers.size,0);assert.equal(g.saved,0);
});

test('failed send exposes native server details separately from draft recovery errors',async()=>{
 const f=sendFixture({result:'server-error',draftFails:true});await f.native.GenericSendMessage(f.modes.Now);
 assert.equal(f.states.at(-1).error,'SMTP server refused the connection');
 assert.equal(f.states.at(-1).draftError,'disk full');f.status.close();
 assert.equal(scope.inlineSendFailure(0x80004005),'Thunderbird error 0x80004005');
 assert.equal(scope.inlineSendFailure(undefined),'Thunderbird did not provide a failure reason.');
 assert.equal(scope.inlineSendFailure(1,'server\nrefused'),'server refused');
});

test('an active native transport is not treated as failed when GenericSendMessage returns',async()=>{
 const f=sendFixture({result:'failure',busy:true});await f.native.GenericSendMessage(f.modes.Now);
 assert.deepEqual(f.states.map(s=>s.state),['sending']);assert.equal(f.saved,0);
 assert.equal(f.native.gSendOperationInProgress,true);f.status.close();
});

test('discard moves a saved draft to recoverable Trash and preserves it on failure',async()=>{
 const native={gMsgCompose:{compFields:{draftId:'draft://42'}}};let listener,args;
 const header={folder:{deleteMessages(...values){args=values;listener=values[4]}}};
 const service={messageServiceFromURI:uri=>({messageURIToMsgHdr:value=>{assert.equal(uri,value);return header}})};
 const pending=scope.trashInlineDraft(native,service,{window:true});
 assert.equal(args[2],false,'never permanently delete draft storage');assert.equal(args[3],false);assert.equal(args[5],true,'allow native undo');
 listener.onStopCopy(0);await pending;
 const failed=scope.trashInlineDraft(native,service);listener.onStopCopy(1);await assert.rejects(failed,/Trash/);
 await scope.trashInlineDraft({gMsgCompose:{compFields:{draftId:''}}},{});
 await assert.rejects(scope.trashInlineDraft({...native,gSendOperationInProgress:true},service),/finish/);
});

test('inline composer readiness waits for native signature/body completion and unregisters cleanly',()=>{
 const events=new Map();let listener,removed;
 const native={addEventListener(name,fn){events.set(name,fn)},removeEventListener(name){events.delete(name)},gMsgCompose:{RegisterStateListener(value){listener=value},UnregisterStateListener(value){removed=value}}};
 const watcher=scope.watchInlineComposeBodyReady(native);assert.equal(watcher.ready,false);
 events.get('compose-window-init')();listener.NotifyComposeFieldsReady();assert.equal(watcher.ready,false);
 listener.NotifyComposeBodyReady();assert.equal(watcher.ready,true);watcher.close();assert.equal(removed,listener);assert.equal(events.size,0);
});
test('composer body styling uses a native sheet without editing document content',()=>{
 const calls=[],utils={USER_SHEET:1,loadSheetUsingURIString(...args){calls.push(['load',...args])},removeSheetUsingURIString(...args){calls.push(['remove',...args])}};
 const native={gMsgCompose:{composeHTML:false},document:{getElementById:()=>({contentWindow:{windowUtils:utils}})}};
 const style=scope.styleInlineComposeBody(native);assert.equal(calls[0][0],'load');assert.equal(calls[0][2],1);style.close();assert.equal(calls[1][0],'remove');assert.equal(calls[0][1],calls[1][1]);
});

test('embedded compose content resolves the native editor window before signature initialization',()=>{
 let editor=null;const native={content:null,document:{getElementById:id=>id==='messageEditor'?editor:null}};
 const previous=Object.getOwnPropertyDescriptor(native,'content');const bridge=scope.installEmbeddedComposeContent(native);
 assert.equal(native.content,null);const editorWindow={};editor={contentWindow:editorWindow};assert.equal(native.content,editorWindow);
 bridge.close();assert.deepEqual(Object.getOwnPropertyDescriptor(native,'content'),previous);
});

test('resuming a draft loads parameters directly without creating a native window',async()=>{
  const context=vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/compose.js'),'utf8'),context);
  let received,focused=false;
  const composer={active:false,open(header,command,placement){received={header,command,placement}},returnInline(){focused=true}};
  context.createInlineCompose=()=>composer;
  const win={},header={},container={},params={composeFields:{body:'Saved answer',draftId:'draft://42'}};
  await context.resumeInlineDraft(win,header,{container,isCurrent:()=>true},async()=>params);
  assert.equal(received.header,header);assert.equal(received.command,'cmd_editDraft');assert.equal(received.placement.params,params);assert.equal(received.placement.container,container);
  composer.active=true;
  await context.resumeInlineDraft(win,header,{container},()=>{throw Error('existing editor must not be replaced')});
  assert.equal(focused,true);
  composer.active=false;received=null;
  await context.resumeInlineDraft(win,header,{isCurrent:()=>false},async()=>params);
  assert.equal(received,null,'navigation during parsing cancels the pending editor');
});

test('compose header layout detects native grid while retaining the earlier flex path',()=>{
  const headers={};
  assert.equal(scope.inlineComposeUsesHeaderGrid({document:{getElementById:()=>headers},getComputedStyle:()=>({display:'grid'})}),true);
  assert.equal(scope.inlineComposeUsesHeaderGrid({document:{getElementById:()=>headers},getComputedStyle:()=>({display:'flex'})}),false);
  assert.equal(scope.inlineComposeUsesHeaderGrid({document:{getElementById:()=>null}}),false);
  const css=scope.inlineComposeGridCSS();
  assert.match(css,/grid-template-columns:0 36px minmax\(0,1fr\)/);
  assert.match(css,/#addressRowTo:has\(> #extraAddressRowsArea\)/);
  assert.match(css,/#extraAddressRowsArea \{ grid-column:4!important; grid-row:1!important/);
  assert.match(css,/#msgSubjectContainer \{ grid-column:2 \/ -1/);
});


test('resumed drafts scroll to the composer after layout and do not steal scroll after navigation',()=>{
  const frames=[],positions=[];
  const win={requestAnimationFrame:fn=>frames.push(fn)},panel={scrollIntoView:options=>positions.push(options)};
  let current=true;
  scope.revealInlineDraft(win,panel,()=>current);
  assert.equal(positions.length,0,'wait for the ready editor layout');
  frames.shift()();assert.equal(positions.length,1);assert.equal(positions[0].block,'start');assert.equal(positions[0].behavior,'instant');
  scope.revealInlineDraft(win,panel,()=>current);current=false;frames.shift()();
  assert.equal(positions.length,1,'a superseded draft must not change the new view scroll');
});

test('direct draft parsing restores saved fields, identity, body and attachments',async()=>{
  const identity={key:'account'},added=[],fields={addAttachment:a=>added.push(a)};
  const mime={headers:{'x-identity-key':['account'],from:['Me <me@example.org>'],to:['You <you@example.org>'],cc:['Cc <cc@example.org>'],bcc:['Hidden <hidden@example.org>'],subject:['Saved subject'],references:['<original>']},parts:[{contentType:'text/plain',body:'Saved answer, not a new reply'}],allUserAttachments:[{url:'imap://local?part=1.2',name:'notes.pdf',contentType:'application/pdf',size:42}]};
  const classes={'@mozilla.org/messengercompose/composeparams;1':{createInstance:()=>({})},'@mozilla.org/messengercompose/composefields;1':{createInstance:()=>fields},'@mozilla.org/messengercompose/attachment;1':{createInstance:()=>({})}};
  const interfaces={nsIMsgCompType:{Draft:9},nsIMsgCompFormat:{PlainText:1,HTML:2}};
  const modules={importESModule(){return {MsgHdrToMimeMessage(header,context,callback,download,options){assert.equal(download,true);assert.equal(options.saneBodySize,false);callback(header,mime)}}}};
  const services={accounts:{getIdentity:key=>key==='account'?identity:null}},header={folder:{getUriForMsg:()=> 'draft://42'}};
  const params=await scope.inlineDraftParams(header,services,interfaces,classes,modules);
  assert.equal(params.type,9);assert.equal(params.format,1);assert.equal(params.identity,identity);
  assert.equal(fields.draftId,'draft://42');assert.equal(fields.body,'Saved answer, not a new reply');assert.equal(fields.subject,'Saved subject');assert.equal(fields.bcc,'Hidden <hidden@example.org>');assert.equal(fields.references,'<original>');
  assert.equal(added.length,1);assert.equal(added[0].url,'imap://local?part=1.2');assert.equal(added[0].name,'notes.pdf');
  mime.parts=[{contentType:'text/html',body:'<p>Saved HTML<img src="cid:picture"></p>'},{contentType:'image/png',url:'imap://local?part=1.3',headers:{'content-id':['<picture>']}}];
  const html=await scope.inlineDraftParams(header,services,interfaces,classes,modules);assert.equal(html.format,2);assert.match(fields.body,/src="imap:\/\/local\?part=1.3"/);
  mime.isEncrypted=true;
  await assert.rejects(scope.inlineDraftParams(header,services,interfaces,classes,modules),/encrypted draft/);
});

test('change-driven autosave debounces edits, defers IME and in-flight saves, and cancels on disable',async()=>{
  function target(){const events={};return {events,addEventListener(name,fn){events[name]=fn},removeEventListener(name){delete events[name]},emit(name,extra={}){events[name]?.({type:name,isTrusted:true,...extra})}}}
  const document=target(),body=target(),native=target(),timers=new Map();let sequence=0,listener,saves=0;
  const clock={setTimeout(fn,delay){const id=++sequence;timers.set(id,{fn,delay});return id},clearTimeout(id){timers.delete(id)}};
  Object.assign(native,{document,gAutoSaveInterval:60000,gAutoSaveTimeout:99,clearTimeout(){},setTimeout(){},GetCurrentEditor:()=>({document:body}),gMsgCompose:{bodyModified:false,RegisterStateListener(value){listener=value},UnregisterStateListener(){},compFields:{}},async GenericSendMessage(mode){assert.equal(mode,7);saves++;native.emit('compose-send-message',{detail:{msgType:mode}});native.gMsgCompose.bodyModified=false}});
  const controller=scope.installChangeDrivenAutosave(native,clock,{AutoSaveAsDraft:7,SaveAsDraft:4});
  assert.equal(native.gAutoSaveInterval,0);assert.equal(timers.size,0,'idle editors have no save timer');
  let text='';native.GetCurrentEditor=()=>({document:body,outputToString:()=>text});
  function edit(){text+='x';native.gMsgCompose.bodyModified=true;body.emit('input')}
  async function tick(){const [id,job]=timers.entries().next().value;timers.delete(id);assert.equal(job.delay,1500);await job.fn()}
  edit();const first=[...timers.keys()][0];edit();assert.equal(timers.size,1);assert.equal(timers.has(first),false,'each edit restarts the pause');
  await tick();assert.equal(saves,1);assert.equal(timers.size,0);
  edit();listener.ComposeProcessDone(0);assert.equal(timers.size,1,'edits during save schedule the next save');await tick();assert.equal(saves,2);listener.ComposeProcessDone(0);assert.equal(timers.size,0);
  body.emit('compositionstart');edit();assert.equal(timers.size,0,'do not save partially composed input');body.emit('compositionend');assert.equal(timers.size,1);await tick();listener.ComposeProcessDone(0);
  document.emit('input',{isTrusted:false});assert.equal(timers.size,0,'synthetic native serialization does not start a save');
  native.gContentChanged=true;document.emit('attachments-added');assert.equal(timers.size,1);
  controller.setEnabled(false);assert.equal(timers.size,0);edit();assert.equal(timers.size,0);controller.setEnabled(true);assert.equal(timers.size,1);
  controller.close();assert.equal(timers.size,0);assert.equal(body.events.input,undefined);assert.equal(native.gAutoSaveInterval,60000,'cleanup restores the native interval');
});


test('new drafts require user text beyond initial quotation and signature',()=>{
  const initial='\nOn Monday, Jamie wrote:\n> Original mail\n-- Alex';
  assert.equal(scope.hasWrittenDraftText(initial,initial),false);
  assert.equal(scope.hasWrittenDraftText(initial,'  '+initial),false);
  assert.equal(scope.hasWrittenDraftText(initial,'x'+initial),true);
  assert.equal(scope.hasWrittenDraftText(initial,initial.slice(5)),false,'deleting initial quoted text alone is not a reply');
  assert.equal(scope.shouldSaveDraft({gMsgCompose:{compFields:{draftId:'existing'}},GetCurrentEditor:()=>({outputToString:()=>''})}),true,'clearing an existing draft can still be saved');
});

test('fixed autosave retains its deadline during typing and switching to Auto resets it to the editing pause',()=>{
  const events={},timers=new Map();let sequence=0,text='';
  const document={addEventListener(name,fn){events[name]=fn},removeEventListener(name){delete events[name]}};
  const native={document,gAutoSaveInterval:0,clearTimeout(){},GetCurrentEditor:()=>({document,outputToString:()=>text}),addEventListener(){},removeEventListener(){},gMsgCompose:{compFields:{},RegisterStateListener(){},UnregisterStateListener(){}}};
  const clock={setTimeout(fn,delay){timers.set(++sequence,{fn,delay});return sequence},clearTimeout(id){timers.delete(id)}};
  scope.configureChangeAutosave(true,'fixed',2);
  const controller=scope.installChangeDrivenAutosave(native,clock,{});
  text='a';events.input({type:'input',isTrusted:true});const deadline=[...timers.keys()][0];
  assert.equal(timers.get(deadline).delay,120000);
  text='ab';events.input({type:'input',isTrusted:true});assert.equal([...timers.keys()][0],deadline,'typing does not postpone a fixed interval');
  scope.configureChangeAutosave(true,'auto',2);assert.equal(timers.has(deadline),false);assert.equal([...timers.values()][0].delay,1500);
  const before=[...timers.keys()][0];text='abc';events.input({type:'input',isTrusted:true});assert.equal(timers.has(before),false,'Auto restarts on each edit');
  controller.close();scope.configureChangeAutosave(true,'auto');
});

test('embedded file drops attach once through native conversion from the panel, compose window and editor',()=>{
 const panel=composeEventTarget(),editor=Object.assign(composeEventTarget(),{document:{}}),native=composeEventTarget();
 let source=null,converted=0,hidden=0;const additions=[];
 Object.assign(native,{document:{getElementById:()=>({contentWindow:editor})},gMsgCompose:{},gAttachmentBucket:{},gDragService:{getCurrentSession:()=>({sourceNode:source})},
  envelopeDragObserver:{getValidAttachments(event){converted++;assert.equal(event.dataTransfer.types[0],'application/x-moz-file');return event.attachments},_hideDropOverlay(){hidden++}},
  AddAttachments(items){additions.push(items)}});
 const hook=scope.installEmbeddedAttachmentDrop(native,panel);
 function event(extra={}){return {dataTransfer:{types:['application/x-moz-file'],files:[]},attachments:[{name:'one.txt'},{name:'two.pdf'}],preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true},...extra}}
 for(const target of [panel,native,editor]){
  const over=event();target.emit('dragover',over);assert.equal(over.dataTransfer.dropEffect,'copy');
  // Event dispatch uses a copy, so test cancellation on the actual callback too.
  const drop=event();target.listeners.get('drop')(drop);assert.equal(drop.prevented,true);assert.equal(drop.stopped,true);
 }
 assert.equal(converted,3);assert.equal(additions.length,3);assert.equal(additions[0].length,2);assert.equal(hidden,3);
 for(const flags of [{gSendOperationInProgress:true},{gSaveOperationInProgress:true}]){
  Object.assign(native,flags);native.listeners.get('drop')(event());Object.assign(native,{gSendOperationInProgress:false,gSaveOperationInProgress:false});
 }
 for(const internal of [{ownerDocument:editor.document},{parentNode:native.gAttachmentBucket}]){source=internal;native.listeners.get('drop')(event());}
 source=null;
 const text=event({dataTransfer:{types:['text/plain'],files:[]}});native.listeners.get('drop')(text);assert.equal(text.prevented,undefined);
 const inline=event({target:{closest:()=>({id:'addInline'})}});native.listeners.get('drop')(inline);assert.equal(inline.prevented,undefined);
 assert.equal(additions.length,3,'sending, saving, internal moves, text and explicit inline targets stay native');
 const directory=event({attachments:[]});native.listeners.get('drop')(directory);assert.equal(directory.prevented,true);assert.equal(additions.length,3);
 const callback=native.listeners.get('drop');hook.close();for(const target of [panel,native,editor])assert.equal(target.listeners.size,0);
 callback(event());assert.equal(additions.length,3,'a closed composer cannot receive attachments');
});

function replyLabelFixture(){
 const s=require('./localization-context.cjs').createContext({Ci:{nsIMsgFolderNotificationService:{msgAdded:1}}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/labels.js'),'utf8'),s);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/compose.js'),'utf8'),s);
 let listener=null,sequence=0;const timers=new Map(),writes=[],definitions=[{key:'visit',tag:'visiting-phd'},{key:'project',tag:'Project'},{key:'$label1',tag:'Important'}];
 const services={tags:{getAllTags:()=>definitions},mfn:{addListener(value){listener=value},removeListener(value){assert.equal(listener,value);listener=null}}};
 const clock={setTimeout(fn,ms){timers.set(++sequence,{fn,ms});return sequence},clearTimeout(id){timers.delete(id)}};
 const folder={URI:'sent',isSpecialFolder:flag=>flag===512,addKeywordsToMessages(headers,keys){writes.push({headers,keys});for(const h of headers)h.keywords=[h.keywords,keys].filter(Boolean).join(' ')}};
 const header=(id,keywords='',where=folder)=>({messageId:id,keywords,folder:where,messageKey:++sequence,getStringProperty(){return this.keywords}});
 const sources=[header('incoming','visit project'),header('older-reply','visit')];sources[0].label=1;
 const native={gCurrentIdentity:{fccFolderURI:'sent'}},flags={SentMail:512,Drafts:1024};
 return {s,services,clock,folder,header,sources,native,flags,writes,definitions,timers,get listener(){return listener},start(){return s.installSentReplyLabels(native,sources,services,clock,flags)}};
}
test('new reply inherits defined conversation labels on its exact Sent copy, before or after transport success',()=>{
 for(const copyFirst of [true,false]){
  const f=replyLabelFixture(),watch=f.start(),copy=f.header('<reply-id>','existing visit');
  watch.update({state:'sending',messageId:''});
  if(copyFirst)f.listener.msgAdded(copy);
  assert.equal(f.writes.length,0,'never label a copy until send succeeds');
  watch.update({state:'sent',messageId:'reply-id'});
  if(!copyFirst)f.listener.msgAdded(copy);
  assert.equal(f.writes.length,1);assert.equal(f.writes[0].keys,'project $label1');assert.equal(f.writes[0].headers[0],copy);
  assert.equal(copy.keywords,'existing visit project $label1','existing labels are preserved');
  f.listener.msgAdded(copy);watch.update({state:'sent',messageId:'<reply-id>'});assert.equal(f.writes.length,1);
  watch.close();assert.equal(f.listener,null);assert.equal(f.timers.size,0);assert.equal(f.s.sentReplyLabelTrackers.size,0);
 }
});
test('reply inheritance excludes drafts, unrelated sends and deleted labels, and survives composer/reader disposal',()=>{
 const f=replyLabelFixture(),watch=f.start();
 f.listener.msgAdded(f.header('reply','',{URI:'drafts',isSpecialFolder:flag=>flag===1024}));
 f.listener.msgAdded(f.header('unrelated'));
 f.definitions.splice(1,1); // Project deleted while the send is in progress.
 watch.update({state:'sent',messageId:'reply'});assert.equal(f.writes.length,0);
 f.native.gCurrentIdentity=null;f.sources.length=0;
 const copy=f.header('reply');f.listener.msgAdded(copy);assert.equal(f.writes.length,1);assert.equal(f.writes[0].keys,'visit $label1');
 for(const task of [...f.timers.values()])task.fn();assert.equal(f.listener,null);assert.equal(f.s.sentReplyLabelTrackers.size,0);
});
test('failed sends and unlabelled conversations leave no inheritance listener behind',()=>{
 for(const state of ['saving-draft','draft-saved','draft-error']){
  const f=replyLabelFixture(),watch=f.start();f.listener.msgAdded(f.header('reply'));watch.update({state,messageId:'reply'});
  assert.equal(f.writes.length,0);assert.equal(f.listener,null);assert.equal(f.timers.size,0);
 }
 const f=replyLabelFixture();f.sources.length=0;const watch=f.start();assert.equal(f.listener,null);assert.equal(f.timers.size,0);watch.close();
});


test('forward MIME preparation includes body and attachments without copying recipients or draft identity',async()=>{
 const identity={key:'sender'},header={mime2DecodedSubject:'Original',folder:{getUriForMsg:()=> 'imap-message://Inbox#42'}};
 let mime={headers:{subject:['Original'],from:['Sender <sender@example.org>'],to:['Me <me@example.org>'],bcc:['private@example.org'],'x-identity-key':['wrong-account']},parts:[{contentType:'text/plain',body:'Original message text'}],allUserAttachments:[{url:'imap://local?part=1.2',name:'document.pdf',contentType:'application/pdf',size:217000}]};
 const interfaces={nsIMsgCompType:{ForwardInline:3},nsIMsgCompFormat:{PlainText:1,HTML:2}};
 const classes={'@mozilla.org/messengercompose/composeparams;1':{createInstance:()=>({})},'@mozilla.org/messengercompose/composefields;1':{createInstance:()=>({attachments:[],addAttachment(a){this.attachments.push(a)}})},'@mozilla.org/messengercompose/attachment;1':{createInstance:()=>({})}};
 const modules={importESModule(name){return name.includes('MimeMessage')?{MsgHdrToMimeMessage(h,c,done,download,options){assert.equal(download,true);assert.equal(options.saneBodySize,false);done(h,mime)}}:{MailUtils:{getIdentityForHeader(h,type){assert.equal(type,3);return [identity]}}}}};
 const load=()=>scope.inlineDraftParams(header,{},interfaces,classes,modules,true);
 let params=await load();let fields=params.composeFields;
 assert.equal(params.type,3);assert.equal(params.identity,identity);assert.equal(params.originalMsgURI,'imap-message://Inbox#42');
 assert.equal(fields.subject,'Fwd: Original');assert.match(fields.body,/Original message text/);assert.match(fields.body,/From: Sender <sender@example.org>/);
 for(const name of ['to','cc','bcc','from','draftId'])assert.equal(fields[name],undefined);
 assert.equal(fields.attachments.length,1);assert.equal(fields.attachments[0].name,'document.pdf');assert.equal(fields.attachments[0].url,'imap://local?part=1.2');
 mime.parts=[{contentType:'text/html',body:'<p>Original HTML<img src="cid:picture"></p>'},{contentType:'image/png',url:'imap://local?part=1.3',headers:{'content-id':['<picture>']}}];
 params=await load();assert.equal(params.format,2);assert.match(params.composeFields.body,/Sender &lt;sender@example.org&gt;/);assert.match(params.composeFields.body,/src="imap:\/\/local\?part=1.3"/);
 mime.isEncrypted=true;await assert.rejects(load(),/encrypted/);
 mime=null;await assert.rejects(load(),/Could not load/);
});
