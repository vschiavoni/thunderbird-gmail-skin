const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../thunder-g/independent-reader.js'),'utf8');
function context(extra={}) {const scope=require('./localization-context.cjs').createContext(extra);vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/label-navigation.js'),'utf8'),scope);vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/labels.js'),'utf8').split('function commonLabelKeys')[1].replace(/^/,'function commonLabelKeys'),scope);vm.runInContext(source,scope);return scope;}
function message(key,id,folder='inbox',date=key){return {messageKey:key,messageId:id,dateInSeconds:date,folder:{URI:folder},mime2DecodedSubject:'Subject',mime2DecodedAuthor:'Sender',getStringProperty(name){return name==='keywords' && this.tagged?'work':''}}}
test('conversation grouping deduplicates physical and logical copies, retains selected copy and sorts by date',()=>{
  const scope=context(),anchor=message(1,'same','inbox',20),sent=message(2,'other','sent',10);
  const result=scope.independentMessages([message(3,'same','allmail',20),sent,anchor],anchor);
  assert.equal(result.length,2);assert.equal(result[0],sent);assert.equal(result[1],anchor);
  const blank1=message(4,''),blank2=message(5,'');
  assert.equal(scope.independentMessages([blank1,blank2],anchor).length,3,'missing message ids must not collapse unrelated mail');
});
test('unavailable index returns real folder thread without matching by subject',async()=>{
  const scope=context(),anchor=message(1,'a'),reply=message(2,'b');
  anchor.folder.msgDatabase={getThreadContainingMsgHdr:()=>({numChildren:2,getChildHdrAt:i=>[anchor,reply][i]})};
  const query=scope.independentConversation({},anchor,null),result=await query.promise;
  assert.equal(result.indexed,false);assert.equal(result.messages.length,2);
});
test('index queries include Sent and cancel stale conversations; timeouts preserve fallback',async()=>{
  const scope=context(),anchor=message(1,'a'),sent=message(2,'b','sent');
  let first,second,timer,cleared=false;
  const win={setTimeout(fn){timer=fn;return 1},clearTimeout(){cleared=true}};
  const gloda={getMessageCollectionForHeader(header,listener){assert.equal(header,anchor);first=listener;return {}}};
  let query=scope.independentConversation(win,anchor,gloda);
  first.onQueryCompleted({items:[{conversation:{getMessagesCollection(listener){second=listener;return {}}}}]});
  second.onQueryCompleted({items:[{folderMessage:sent},{folderMessage:anchor},{folderMessage:null}]});
  let result=await query.promise;assert.equal(result.indexed,true);assert.equal(result.messages.length,2);assert.equal(cleared,true);
  query=scope.independentConversation(win,anchor,gloda);query.cancel();
  first.onQueryCompleted({items:[]});result=await query.promise;assert.equal(result.indexed,false);assert.equal(result.messages[0],anchor);
  query=scope.independentConversation(win,anchor,gloda);timer();result=await query.promise;assert.equal(result.messages.length,1);assert.equal(result.indexed,false);
});
function readerFixture({photo=null,tagged=false,verifyIndependentDkim}={}) {
  function node(tag='div') {
    const attrs=new Map(),classes=new Set(),css=new Map();
    return {tag,children:[],events:{},style:{
      getPropertyValue:key=>css.get(key)?.value||'',getPropertyPriority:key=>css.get(key)?.priority||'',
      setProperty(key,value,priority=''){css.set(key,{value,priority})},removeProperty:key=>css.delete(key)},hidden:false,classList:{add:key=>classes.add(key),remove:key=>classes.delete(key),contains:key=>classes.has(key)},
      append(...items){for(const item of items){item.parentNode=this;this.children.push(item)}},
      insertBefore(item,before){item.parentNode=this;this.children.splice(this.children.indexOf(before),0,item)},
      replaceChildren(...items){this.children=[];this.append(...items)},remove(){this.removed=true;if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(item=>item!==this)},
      setAttribute:(key,value)=>attrs.set(key,value),getAttribute:key=>attrs.get(key),removeAttribute:key=>attrs.delete(key),
      scrollIntoView(options){this.scrolled=options},
      attachShadow(){this.shadow=node('shadow');return this.shadow},
      addEventListener(name,fn){(this.events[name]??=[]).push(fn)},removeEventListener(name,fn){this.events[name]=(this.events[name] || []).filter(item=>item!==fn)},
      emit(name,event={}){for(const fn of this.events[name] || [])fn(event)}};
  }
  const layout=node(),head=node(),browsers=[],loads=[],commands=[],timers=new Map(),animationFrames=new Map(),removals=[];
  const resizes=[],mutations=[];let seq=0,zoomClosed=0,tagListener,removedListener;
  const doc={getElementById:id=>id==='paneLayout'?layout:null,createElement:node,createTextNode:value=>({textContent:value}),head,
    createXULElement(tag){
      const browser=node(tag);browser.clientHeight=500;browser.docShell={allowDNSPrefetch:true};
      const content=node('content');content.bottom=1208;content.quotes=[];
      content.createTreeWalker=()=>{let done=false;return {nextNode(){if(done)return null;done=true;return {textContent:'New answer',parentElement:{closest:()=>null},compareDocumentPosition:()=>4}}}};
      content.querySelectorAll=()=>content.quotes;content.createElement=node;content.documentElement=node();
      content.body={scrollHeight:2000,getBoundingClientRect:()=>({top:8})};
      content.createRange=()=>({selectNodeContents(){},getBoundingClientRect:()=>({bottom:content.bottom})});
      content.defaultView={getComputedStyle:()=>({marginTop:'8px',marginBottom:'8px',paddingBottom:'0px'})};
      const pane={clientHeight:400,contentDocument:content};
      browser.contentDocument={...node('document'),documentURI:'about:message',createElement:node,documentElement:node(),getElementById:id=>id==='messagepane'?pane:id==='hdrReplyToSenderButton'?browser.replyButton:null};
      browser.contentWindow={displayMessage:uri=>{loads.push(uri);browser.uri=uri},commandController:{isCommandEnabled:()=>true,doCommand:name=>commands.push([name,browser.uri])}};
      browser.replyButton=node('button');browser.pane=pane;browser.content=content;browsers.push(browser);return browser;
    }};
  const tags=[{key:'work',tag:'Work',color:'#336699'}];
  const scope=context({verifyIndependentDkim,Services:{prefs:{getBoolPref:()=>false}},Ci:{nsIMsgFolderNotificationService:{msgPropertyChanged:1}},
    MailServices:{headerParser:{parseDecodedHeader:name=>[{name,email:`${name.toLowerCase()}@example.org`}]},
      ab:{cardForEmailAddress:()=>photo?{photoURL:photo}:null},tags:{getAllTags:()=>tags},
      mfn:{addListener(fn){tagListener=fn},removeListener(fn){removedListener=fn}}},
    assignedTags:header=>header.tagged?tags:[],chipColors:()=>({background:'#ddeeff',foreground:'#123456'}),
    applyConversationLabel(headers,key,add){removals.push({headers,key,add});for(const header of headers)header.tagged=add},
    createPreviewQueue:()=>({get:()=>'<img src=x onerror=bad()>',close(){}}),
    cachedMessagePreview:()=>'<img src=x onerror=bad()>',installMailZoom:()=>({close(){zoomClosed++}}),ChromeUtils:{importESModule:()=>({UIFontSize:{}})}});
  const win={document:doc,
    ResizeObserver:class{constructor(fn){this.fn=fn;this.disconnected=false;resizes.push(this)}observe(){}disconnect(){this.disconnected=true}},
    MutationObserver:class{constructor(fn){this.fn=fn;this.disconnected=false;mutations.push(this)}observe(){}disconnect(){this.disconnected=true}},
    requestAnimationFrame(fn){animationFrames.set(++seq,fn);return seq},cancelAnimationFrame:id=>animationFrames.delete(id),
    setTimeout(fn){timers.set(++seq,fn);return seq},clearTimeout:id=>timers.delete(id)};
  const reader=scope.installIndependentReader(win),anchor=message(1,'a');anchor.tagged=tagged;
  const prepare=header=>{header.folder.getUriForMsg=h=>`mailbox://${h.folder.URI}/${h.messageKey}`;return header};prepare(anchor);
  const conversation=layout.children[0].shadow.children[1],cards=conversation.children[3],actions=conversation.children[4];
  const flush=()=>{const pending=[...animationFrames.values()];animationFrames.clear();for(const fn of pending)fn()};
  function loaded(browser=browsers.at(-1)){browser.emit('load',{target:browser.contentDocument});browser.emit('MsgLoaded');flush()}
  return {scope,win,reader,anchor,prepare,layout,browsers,loads,commands,removals,timers,animationFrames,resizes,mutations,conversation,cards,actions,flush,loaded,
    get tagListener(){return tagListener},get removedListener(){return removedListener},get zoomClosed(){return zoomClosed}};
}
test('reader keeps one footer after all cards, restores print, and delegates commands to native message',async()=>{
  const f=readerFixture();f.anchor.mime2DecodedSubject='<script>bad()</script>';await f.reader.open(f.anchor);
  assert.equal(f.conversation.children[0].textContent,'<script>bad()</script>');
  assert.equal(f.layout.classList.contains('gm-independent-open'),true);
  assert.equal(f.browsers[0].getAttribute('src'),'about:message');assert.equal(f.browsers[0].getAttribute('disablesecurity'),undefined);
  f.loaded();assert.deepEqual(f.loads,['mailbox://inbox/1']);assert.equal(f.browsers[0].docShell.allowDNSPrefetch,false);assert.equal(f.timers.size,0);
  assert.deepEqual(f.actions.children.map(button=>button.textContent),['Reply all','Reply','Forward']);
  assert.equal(f.conversation.children.at(-1),f.actions,'reply controls follow the entire conversation');
  f.actions.children[1].emit('click');f.reader.print();
  assert.deepEqual(f.commands,[['cmd_replySender','mailbox://inbox/1'],['cmd_print','mailbox://inbox/1']]);
  const envelopeStyle=f.browsers[0].contentDocument.documentElement.children[0].textContent;
  assert.match(envelopeStyle,/#expandedfromRow/);
  assert.doesNotMatch(envelopeStyle,/#messageHeader\s*\{[^}]*display:\s*none/);
  f.reader.close();assert.equal(f.zoomClosed,1);assert.equal(f.browsers[0].removed,true);assert.equal(f.removedListener,f.tagListener);
});
test('short messages shrink independently of viewport, growing images and pane resizing refit without retained blank space',async()=>{
  const f=readerFixture();await f.reader.open(f.anchor);f.loaded();const frame=f.browsers[0];
  assert.equal(frame.style.blockSize,'1316px');
  frame.content.bottom=108;frame.content.body.scrollHeight=2000;f.resizes[0].fn();f.flush();
  assert.equal(frame.style.blockSize,'216px','short content is measured rather than the old 2000px viewport');
  frame.pane.fullZoom=2;f.resizes[0].fn();f.flush();
  assert.equal(frame.style.blockSize,'332px','message height includes content zoom without scaling envelope chrome');
  frame.pane.fullZoom=1;
  frame.content.bottom=1808;frame.content.emit('load');f.flush();assert.equal(frame.style.blockSize,'1916px');
  frame.content.bottom=908;f.mutations[0].fn();f.flush();assert.equal(frame.style.blockSize,'1016px');
  f.resizes[0].fn();assert.equal(f.animationFrames.size,1);f.reader.hide();assert.equal(f.animationFrames.size,0);
  assert.equal(f.resizes[0].disconnected,true);assert.equal(f.mutations[0].disconnected,true);assert.equal(frame.content.events.load.length,0);
});
test('opening a specific conversation message expands and reveals that message while keeping latest-reply actions available',async()=>{
  const f=readerFixture();const middle=f.prepare(message(2,'b','sent',2)),latest=f.prepare(message(3,'c','sent',3));
  f.anchor.folder.msgDatabase={getThreadContainingMsgHdr:()=>({numChildren:3,getChildHdrAt:i=>[latest,f.anchor,middle][i]})};
  await f.reader.open(f.anchor,{focusMessage:true});f.flush();
  assert.equal(f.cards.children.length,3);assert.equal(f.conversation.children[2].textContent,'3 messages');
  assert.equal(f.browsers.length,2,'the selected message and latest reply are available');
  assert.equal(f.cards.children[0].children[1].hidden,false);assert.equal(f.cards.children[1].children[1].hidden,true);
  assert.equal(f.cards.children[2].children[1].hidden,false);
  assert.equal(f.cards.children[0].scrolled.block,'nearest','the selected message is brought into view');
  assert.equal(f.cards.children[2].scrolled,undefined,'the newest reply must not steal the viewport');
  assert.equal(f.actions.children[1].disabled,true);f.loaded();
  f.actions.children[0].emit('click');assert.deepEqual(f.commands,[['cmd_replyall','mailbox://sent/3']]);
  const toggle=f.cards.children[1].children[0].children[0];toggle.emit('click');assert.equal(f.browsers.length,3);
  f.loaded();toggle.emit('click');assert.notEqual(f.browsers[2].removed,true);assert.equal(f.actions.children[1].disabled,false);
  toggle.emit('click');assert.equal(f.browsers.length,3,'reopening a folded message reuses its native frame');
  const latestToggle=f.cards.children[2].children[0].children[0];latestToggle.emit('click');
  assert.equal(f.cards.children[2].children[1].hidden,false,'latest message cannot accidentally be folded away');
  f.actions.children[1].emit('click');assert.deepEqual(f.commands.at(-1),['cmd_replySender','mailbox://sent/3']);
  f.reader.close();
});
test('title labels have an accessible X that removes the label across the conversation',async()=>{
  const f=readerFixture({tagged:true});const sent=f.prepare(message(2,'reply','sent',2));sent.tagged=true;
  f.anchor.folder.msgDatabase={getThreadContainingMsgHdr:()=>({numChildren:2,getChildHdrAt:i=>[f.anchor,sent][i]})};
  await f.reader.open(f.anchor);
  const tags=f.conversation.children[0].children[0],remove=tags.children[0].children[0];
  assert.equal(remove.textContent,'×');assert.equal(remove.getAttribute('aria-label'),'Remove Work from this conversation');
  remove.emit('click',{preventDefault(){},stopPropagation(){}});
  assert.equal(f.removals.length,1);assert.equal(f.removals[0].headers.length,2);assert.equal(f.removals[0].key,'work');assert.equal(tags.children.length,0);
  f.anchor.tagged=true;sent.tagged=true;f.tagListener.msgPropertyChanged(f.anchor,'keywords');assert.equal(tags.children.length,1);
  const stale=tags.children[0].children[0];f.reader.hide();stale.emit('click',{preventDefault(){},stopPropagation(){}});assert.equal(f.removals.length,1);
  f.reader.close();
});
test('sender uses the existing contact photo and falls back to initials when unavailable',async()=>{
  const f=readerFixture({photo:'file:///profile/Photos/sender.jpg'});await f.reader.open(f.anchor);
  const avatar=f.cards.children[0].children[0].children[0].children[0];assert.equal(avatar.children[0].getAttribute('src'),'file:///profile/Photos/sender.jpg');
  avatar.children[0].emit('error');assert.equal(avatar.children[0].textContent,'S');f.reader.close();
  const empty=readerFixture();await empty.reader.open(empty.anchor);assert.equal(empty.cards.children[0].children[0].children[0].children[0].textContent,'S');empty.reader.close();
});
function references(header,...ids) {header.numReferences=ids.length;header.getStringReference=i=>ids[i];return header}
test('local sent summaries recover own replies without a global index and never group by subject',async()=>{
  const scope=context(),anchor=references(message(1,'inbound','inbox',20),'<root>');
  const parent=message(2,'root','sent',10),outgoing=references(message(3,'my-reply','sent',30),'inbound');
  const second=references(message(4,'my-followup','sent',40),'my-reply');
  const unrelated=message(5,'other','sent',50);unrelated.mime2DecodedSubject=anchor.mime2DecodedSubject;
  const copy=references(message(6,'my-reply','custom-sent',30),'inbound');
  const result=await scope.independentConversation({},anchor,null,[{messages:[second,unrelated,outgoing,parent]},{messages:[copy]},{get messages(){throw Error('unavailable')}}]).promise;
  assert.equal(result.indexed,false);
  assert.deepEqual(Array.from(result.messages,h=>h.messageId),['root','inbound','my-reply','my-followup']);
  assert.equal(result.messages.at(-1),second,'latest sent reply becomes the last message');
});
test('sent replies supplement an incomplete global index rather than disappearing when the index returns first',async()=>{
  const scope=context(),anchor=message(1,'a'),sent=references(message(2,'b','sent',2),'a');
  let lookup,conversation;
  const win={setTimeout:()=>1,clearTimeout(){}};
  const gloda={getMessageCollectionForHeader(header,listener){lookup=listener;return {}}};
  const query=scope.independentConversation(win,anchor,gloda,[{messages:[sent]}]);
  lookup.onQueryCompleted({items:[{conversation:{getMessagesCollection(listener){conversation=listener;return {}}}}]});
  conversation.onQueryCompleted({items:[{folderMessage:anchor}]});
  const result=await query.promise;assert.equal(result.indexed,true);
  assert.deepEqual(Array.from(result.messages,h=>h.messageId),['a','b']);
});
test('local Sent scanning yields and stops when the conversation is left',async()=>{
  const scope=context(),anchor=message(1,'a');let yields=0;
  const win={setTimeout(){yields++;return 1},clearTimeout(){}};
  const sent=Array.from({length:1000},(_,i)=>references(message(i+2,`sent-${i}`,'sent'),'a'));
  const query=scope.independentConversation(win,anchor,null,[{messages:sent}]);
  assert.equal(yields,1,'a large Sent folder does not block the UI');query.cancel();
  const result=await query.promise;assert.equal(result.messages.length,1);
});
test('Sent discovery includes configured custom destinations and folders marked Sent across accounts',()=>{
  const custom={URI:'custom',isSpecialFolder:()=>false},sent={URI:'sent',isSpecialFolder:flag=>flag===512},other={URI:'inbox',isSpecialFolder:()=>false};
  const scope=context({Ci:{nsMsgFolderFlags:{SentMail:512}},MailServices:{accounts:{allIdentities:[{fccFolderURI:'custom'}],allFolders:[other,custom,sent]}}});
  assert.deepEqual(Array.from(scope.independentSentFolders()),[custom,sent]);
});
test('Gmail layout keeps previews with the sender and folds quoted history behind a reversible control',async()=>{
  const f=readerFixture(),old=f.prepare(message(2,'older','inbox',0));
  f.anchor.folder.msgDatabase={getThreadContainingMsgHdr:()=>({numChildren:2,getChildHdrAt:i=>[old,f.anchor][i]})};
  await f.reader.open(f.anchor);
  const older=f.cards.children[0],sender=older.children[0].children[0].children[1];
  assert.equal(sender.children[2].className,'preview','collapsed preview shares the sender column');
  const frame=f.browsers[0];frame.content.quotes=[{}];f.loaded();
  const body=f.cards.children[1].children[1],quoteButton=body.children[2];
  assert.equal(quoteButton.hidden,false);assert.equal(quoteButton.getAttribute('aria-label'),'Show quoted text');
  assert.equal(frame.content.documentElement.getAttribute('data-gm-fold-quotes'),'');
  quoteButton.emit('click');f.flush();
  assert.equal(frame.content.documentElement.getAttribute('data-gm-fold-quotes'),undefined);
  assert.equal(quoteButton.getAttribute('aria-label'),'Hide quoted text');
  quoteButton.emit('click');f.flush();assert.equal(frame.content.documentElement.getAttribute('data-gm-fold-quotes'),'');
  f.reader.close();
});
test('title aggregates labels across incoming and sent cards and stays synchronized with native changes',async()=>{
  const f=readerFixture({tagged:true}),sent=f.prepare(message(2,'sent','sent',2));
  f.anchor.folder.msgDatabase={getThreadContainingMsgHdr:()=>({numChildren:2,getChildHdrAt:i=>[f.anchor,sent][i]})};
  await f.reader.open(f.anchor);
  const titleTags=f.conversation.children[0].children[0];
  assert.equal(titleTags.className,'title-tags');assert.equal(titleTags.children.length,0,'message-only label is absent from title');
  const unrelated=message(999,'unrelated','other',3),beforeTags=titleTags.children;
  f.tagListener.msgPropertyChanged(unrelated,'keywords');assert.equal(titleTags.children,beforeTags,'unrelated notifications must not rebuild the visible title');
  assert.equal(f.cards.children[0].children[0].children[0].children[1].children[3].children.length,1);
  f.anchor.tagged=false;sent.tagged=true;f.tagListener.msgPropertyChanged(sent,'keywords');
  assert.equal(titleTags.children.length,0,'sent-only labels stay on the sent message');
  const sentTags=f.cards.children[1].children[0].children[0].children[1].children[3];
  assert.equal(sentTags.children.length,1);
  sentTags.children[0].children[1].emit('click',{preventDefault(){},stopPropagation(){}});
  assert.equal(f.removals.at(-1).headers.length,1);assert.equal(f.removals.at(-1).headers[0],sent);
  assert.equal(sentTags.children.length,0);
  sent.tagged=false;f.tagListener.msgPropertyChanged(sent,'keywords');assert.equal(titleTags.children.length,0);
  f.reader.close();
});
test('numeric shortcuts and native tag menu target the opened Sent reply, never the first inbox message',async()=>{
  const f=readerFixture(),sent=f.prepare(message(2,'sent','sent',2)),latest=f.prepare(message(3,'latest','inbox',3));
  f.anchor.folder.msgDatabase={getThreadContainingMsgHdr:()=>({numChildren:3,getChildHdrAt:i=>[f.anchor,sent,latest][i]})};
  await f.reader.open(f.anchor);f.loaded();
  const active=()=>f.cards.children.filter(card=>card.getAttribute('aria-current')==='true');
  assert.deepEqual(active(),[f.cards.children[2]],'the latest message starts as the visible numeric-tag target');
  assert.equal(f.cards.children[2].getAttribute('data-active-message'),'');
  const toggle=f.cards.children[1].children[0].children[0];toggle.emit('click');f.loaded();
  assert.deepEqual(active(),[f.cards.children[1]],'opening a Sent reply moves the marker to the exact target');
  assert.equal(f.cards.children[2].getAttribute('data-active-message'),undefined);
  const event=()=>({key:'1',target:{closest:()=>null},preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true}});
  const key=event();assert.equal(f.reader.handleTagKey(key),true);assert.equal(key.prevented,true);
  assert.equal(sent.tagged,true);assert.notEqual(f.anchor.tagged,true);assert.notEqual(latest.tagged,true);
  assert.equal(f.removals[0].headers[0],sent);
  f.reader.handleTagKey(event());assert.equal(sent.tagged,false,'pressing 1 twice toggles only that reply');
  const frame=f.browsers.at(-1);frame.contentWindow.commandController._toggleMessageTagKey(1);
  assert.equal(f.removals.at(-1).headers[0],sent,'native menu and command routing also use the exact embedded header');
  frame.contentWindow.commandController._toggleMessageTag('work',false);assert.equal(sent.tagged,false);
  f.cards.children[2].emit('pointerdown');f.reader.handleTagKey(event());assert.equal(latest.tagged,true);
  assert.deepEqual(active(),[f.cards.children[2]]);
  // Events originating inside another message use that document, even if focus tracking was stale.
  f.reader.handleTagKey({...event(),currentTarget:frame.contentDocument});assert.equal(sent.tagged,true);
  assert.deepEqual(active(),[f.cards.children[1]],'document-based key routing also corrects the visible marker');
  f.cards.children[0].emit('focusin');assert.deepEqual(active(),[f.cards.children[0]],'keyboard focus on a folded card selects only that message');
  assert.notEqual(f.anchor.tagged,true,'moving focus never changes labels');
  frame.content.emit('focusin');assert.deepEqual(active(),[f.cards.children[1]],'focus inside native message content restores its marker');
  f.cards.children[2].emit('pointerdown');frame.contentWindow.commandController._toggleMessageTag('work',false);
  assert.deepEqual(active(),[f.cards.children[1]],'native tag menu and marker agree even after stale focus');
  assert.equal(f.reader.handleTagKey({...event(),ctrlKey:true}),false);
  assert.equal(f.reader.handleTagKey({...event(),target:{closest:()=>({})}}),false);
  assert.equal(f.reader.handleTagKey({...event(),key:'l'}),false,'L remains reserved for the whole-conversation picker');
  f.reader.close();assert.equal(frame.contentWindow.commandController._toggleMessageTagKey,undefined,'native controller is restored on teardown');
});
test('DKIM chips use verifier results with warnings and missing evidence kept distinct from verified success',()=>{
  const scope=context();
  const status=data=>scope.independentDkimStatus({getStringProperty:key=>{assert.equal(key,'dkim_verifier@pl-result');return typeof data==='string'?data:JSON.stringify(data)}});
  assert.equal(status({version:'3.0',dkim:[{result:'SUCCESS',sdid:'example.org'}]}).tone,'success');
  assert.equal(status({version:'3.0',dkim:[{result:'SUCCESS',warnings:[{name:'weak-key'}]}]}).tone,'warning');
  assert.equal(status({version:'2.0',dkim:[{result:'PERMFAIL'}]}).tone,'failure');
  assert.equal(status({version:'3.0',dkim:[{result:'TEMPFAIL'}]}).tone,'warning');
  assert.equal(status({version:'3.0',dkim:[{result:'none'}]}).label,'DKIM unsigned');
  assert.equal(status({version:'1.0',result:'SUCCESS'}).label,'DKIM verified');
  for(const invalid of ['', '{broken', {version:'4.0',dkim:[{result:'SUCCESS'}]}])assert.equal(status(invalid).label,'DKIM not checked');
});
test('each message renders its own DKIM chip and keeps tags beside the sender instead of adding a row',async()=>{
  const f=readerFixture({tagged:true});
  f.anchor.getStringProperty=name=>name==='dkim_verifier@pl-result'?JSON.stringify({version:'3.0',dkim:[{result:'SUCCESS',sdid:'example.org'}]}):'work';
  await f.reader.open(f.anchor);
  const card=f.cards.children[0],sender=card.children[0].children[0].children[1];
  assert.equal(sender.children.find(node=>node.className==='tags').children.length,0);assert.equal(card.children.length,2,'no separate tag row occupies body space');
  const dkim=card.children[0].children[1].children[1];assert.equal(dkim.textContent,'DKIM verified');assert.equal(dkim.getAttribute('data-tone'),'success');
  f.anchor.getStringProperty=name=>name==='dkim_verifier@pl-result'?JSON.stringify({version:'3.0',dkim:[{result:'PERMFAIL'}]}):'work';
  f.tagListener.msgPropertyChanged(f.anchor,'dkim_verifier@pl-result');assert.equal(dkim.getAttribute('data-tone'),'failure');
  f.reader.close();
});
test('live verifier results work when saving results is disabled and cannot update a replaced conversation',async()=>{
  const pending=[];
  const f=readerFixture({verifyIndependentDkim:header=>new Promise(resolve=>pending.push({header,resolve}))});
  await f.reader.open(f.anchor);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(pending.length,1);
  const chip=f.cards.children[0].children[0].children[1].children[1];
  assert.equal(chip.textContent,'DKIM checking…');
  pending[0].resolve({dkim:[{result:'SUCCESS',sdid:'google.com'}]});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(chip.textContent,'DKIM verified');
  // The pure status decoder accepts the provider result without needing a stored header property.
  const scope=context();
  assert.equal(scope.independentDkimStatus(f.anchor,{version:'2.1',dkim:[{result:'SUCCESS',sdid:'google.com'}]}).label,'DKIM verified');
  f.reader.close();
  for(const item of pending)item.resolve({dkim:[{result:'SUCCESS'}]});
});

test('sent metadata scans are shared, expire, invalidate on changes and stay bounded',async()=>{
 const scope=context();let now=0,reads=0,count=1;
 const sent=references(message(2,'reply','sent',2),'a');
 const folder={URI:'sent',getTotalMessages:()=>count,get messages(){reads++;return [sent]}};
 const cache=scope.createSentCandidateCache({},()=>now);
 const first=cache.get([folder]),concurrent=cache.get([folder]);assert.equal(first,concurrent,'concurrent lookups share the scan');
 assert.equal((await first)[0].header,sent);await cache.get([folder]);assert.equal(reads,1);
 now=30001;await cache.get([folder]);assert.equal(reads,2);
 count=2;await cache.get([folder]);assert.equal(reads,3,'new Sent messages invalidate the folder signature');
 cache.invalidate();await cache.get([folder]);assert.equal(reads,4,'native notifications invalidate immediately');
 cache.close();assert.equal((await cache.get([folder])).length,0);
 const bounded=scope.createSentCandidateCache({},()=>now,0);await bounded.get([folder]);await bounded.get([folder]);assert.equal(reads,6,'oversized scans remain complete but are not retained');bounded.close();
});
test('native body starts before index lookup while conversation-wide actions wait for full scope',async()=>{
 const f=readerFixture();let lookup;
 f.scope.Services.prefs.getBoolPref=()=>true;
 f.scope.ChromeUtils.importESModule=url=>url.includes('GlodaPublic')?{Gloda:{getMessageCollectionForHeader(header,listener){lookup=listener;return {}}}}:{UIFontSize:{}};
 const opening=f.reader.open(f.anchor);
 assert.equal(f.browsers.length,1,'native renderer is created before the index completes');
 assert.equal(f.reader.getMessages().length,0,'L cannot label a partial conversation without sent replies');
 f.loaded();assert.equal(f.actions.children[1].disabled,true,'Reply waits for the actual newest message');
 lookup.onQueryCompleted({items:[]});await opening;
 assert.equal(f.browsers.length,1,'identical membership does not reload the native message');
 assert.equal(f.reader.getMessages().length,1);assert.equal(f.actions.children[1].disabled,false);
 f.reader.close();
});

test('unindexed conversations include replies from an identity-configured unflagged Sent folder',async()=>{
  const anchor=message(1,'root');
  anchor.folder.msgDatabase={getThreadContainingMsgHdr:()=>({numChildren:1,getChildHdrAt:()=>anchor})};
  const reply=references(message(2,'reply','custom',2),'root');
  const custom={URI:'custom',isSpecialFolder:()=>false,messages:[reply]};
  const scope=context({Ci:{nsMsgFolderFlags:{SentMail:512}},MailServices:{accounts:{allIdentities:[{fccFolderURI:'custom'}],allFolders:[custom]}}});
  const result=await scope.independentConversation({},anchor,null,scope.independentSentFolders()).promise;
  assert.deepEqual(Array.from(result.messages),[anchor,reply]);
  assert.equal(result.indexed,false);
});

test('actual body context menu is routed from the outer inbox to the exact embedded Sent message',async()=>{
  const f=readerFixture(),sent=f.prepare(message(2,'sent','sent',2)),latest=f.prepare(message(3,'latest','inbox',3));
  f.anchor.folder.msgDatabase={getThreadContainingMsgHdr:()=>({numChildren:3,getChildHdrAt:i=>[f.anchor,sent,latest][i]})};
  await f.reader.open(f.anchor);f.loaded();
  f.cards.children[1].children[0].children[0].emit('click');f.loaded();
  const frame=f.browsers.at(-1),document=frame.contentDocument,win=frame.contentWindow;
  win.document=document;
  const nativeGet=document.getElementById;
  frame.pane.ownerDocument=document;document.defaultView=win;win.devicePixelRatio=2;
  const shown=[],contexts=[];
  const popup={openPopupAtScreen(...args){shown.push(args)}};
  document.getElementById=id=>id==='mailContext'?popup:nativeGet(id);
  win.mailContextMenu={setAsMessagePaneContextMenu(...args){contexts.push(args)}};
  // Keyboard focus may still point to another card. The originating browser wins.
  f.cards.children[2].emit('pointerdown');
  const actorContext={},event={data:{context:{screenXDevPx:200,screenYDevPx:400}},target:{browsingContext:actorContext}};
  assert.equal(f.win.openContextMenu(event,frame.pane),true);
  assert.deepEqual(shown,[[100,200,true]]);assert.equal(contexts[0][0],event.data);assert.equal(contexts[0][1],actorContext);
  assert.equal(f.cards.children[1].getAttribute('aria-current'),'true');
  win.commandController._toggleMessageTag('work',true);
  assert.equal(sent.tagged,true);assert.notEqual(f.anchor.tagged,true);assert.notEqual(latest.tagged,true);
  assert.equal(f.win.openContextMenu(event,{}),false,'unrelated browsers retain the native path');
  delete win.mailContextMenu;
  assert.equal(f.win.openContextMenu(event,frame.pane),true,'an unavailable message menu must not label the inbox selection');
  f.reader.close();assert.equal(f.win.openContextMenu,undefined);
});

test('conversation zoom targets all message bodies, persists for newly expanded replies and leaves the UI alone',async()=>{
  const f=readerFixture(),sent=f.prepare(message(2,'sent','sent',2)),latest=f.prepare(message(3,'latest','inbox',3));
  f.anchor.folder.msgDatabase={getThreadContainingMsgHdr:()=>({numChildren:3,getChildHdrAt:i=>[f.anchor,sent,latest][i]})};
  const applied=[];
  f.win.top={ZoomManager:{
    getZoomForBrowser:pane=>pane.fullZoom || 1,
    setZoomForBrowser(pane,value){pane.fullZoom=value;applied.push(pane)},
    enlarge(pane){pane.fullZoom=(pane.fullZoom || 1)+.1},
    reduce(pane){pane.fullZoom=(pane.fullZoom || 1)-.1},reset(pane){pane.fullZoom=1}}};
  assert.equal(f.reader.zoom('increaseSize'),false,'a hidden reader does not consume inbox shortcuts');
  await f.reader.open(f.anchor);f.loaded(f.browsers[0]);f.loaded();
  assert.equal(f.reader.zoom('increaseSize'),true);
  assert.equal(f.browsers[0].pane.fullZoom,1.1);
  f.cards.children[1].children[0].children[0].emit('click');f.loaded();
  assert.equal(f.browsers.at(-1).pane.fullZoom,1.1,'newly opened Sent reply inherits conversation zoom');
  f.reader.zoom('increaseSize');
  for(const frame of f.browsers)assert.ok(Math.abs(frame.pane.fullZoom-1.2)<.001);
  f.reader.zoom('reduceSize');
  for(const frame of f.browsers)assert.ok(Math.abs(frame.pane.fullZoom-1.1)<.001);
  f.reader.zoom('resetSize');
  for(const frame of f.browsers)assert.equal(frame.pane.fullZoom,1);
  assert.ok(applied.every(pane=>f.browsers.some(frame=>frame.pane===pane)),'only the inner message browsers receive zoom');
  f.reader.hide();assert.equal(f.reader.zoom('increaseSize'),false);f.reader.close();
});

function sentReplyFixture(f,key=2,id='reply',references=['a'],folder='sent') {
  const header=f.prepare(message(key,id,folder));
  header.numReferences=references.length;header.getStringReference=i=>references[i];
  f.scope.Ci.nsMsgFolderFlags={SentMail:512};
  f.scope.MailServices.accounts={allIdentities:[{fccFolderURI:'sent'}],allFolders:[header.folder]};
  header.folder.isSpecialFolder=()=>false;
  return header;
}
test('Sent notification appends and expands a reply in place, preserving existing native viewers',async()=>{
  const f=readerFixture();await f.reader.open(f.anchor);f.loaded();
  const first=f.cards.children[0],frame=f.browsers[0];
  const reply=sentReplyFixture(f);
  f.tagListener.msgAdded(reply);f.loaded();
  assert.equal(f.cards.children.length,2);assert.equal(f.cards.children[0],first);
  assert.equal(frame.removed,undefined,'existing viewer stays alive');
  assert.equal(f.cards.children[1].getAttribute('data-expanded'),'');
  assert.equal(first.getAttribute('data-latest'),undefined);
  assert.equal(first.children[0].children[0].getAttribute('aria-disabled'),undefined);
  assert.equal(f.reader.getMessages()[1],reply);
  f.reader.print();assert.deepEqual(f.commands.at(-1),['cmd_print','mailbox://sent/2']);
  f.tagListener.msgAdded(reply);
  f.tagListener.msgAdded(sentReplyFixture(f,3,'reply'));
  assert.equal(f.cards.children.length,2,'duplicate physical and logical Sent copies are ignored');
  first.children[0].children[0].emit('click');
  assert.equal(first.getAttribute('data-expanded'),undefined,'previous latest can now collapse');
  f.reader.close();
});
test('drafts, unrelated sent messages and notifications after navigation do not alter the conversation',async()=>{
  const f=readerFixture();await f.reader.open(f.anchor);
  const draft=sentReplyFixture(f,2,'draft',['a'],'drafts');
  f.scope.MailServices.accounts.allFolders=[];
  f.tagListener.msgAdded(draft);assert.equal(f.cards.children.length,1);
  f.tagListener.msgAdded(sentReplyFixture(f,3,'unrelated',['other-thread']));
  assert.equal(f.cards.children.length,1);
  f.reader.hide();f.tagListener.msgAdded(sentReplyFixture(f,4,'hidden'));
  assert.equal(f.cards.children.length,0);
  f.reader.close();f.tagListener.msgAdded(sentReplyFixture(f,5,'closed'));
  assert.equal(f.cards.children.length,0);
});
test('a pending initial lookup cannot discard a newly arrived sent reply',async()=>{
  const f=readerFixture();let complete;
  f.scope.Services.prefs.getBoolPref=()=>true;
  f.scope.ChromeUtils.importESModule=()=>({Gloda:{getMessageCollectionForHeader(header,listener){complete=listener;return {}}}});
  const opening=f.reader.open(f.anchor);
  const reply=sentReplyFixture(f);f.tagListener.msgAdded(reply);
  complete.onQueryCompleted({items:[]});await opening;
  assert.equal(f.reader.getMessages().length,2);assert.equal(f.reader.getMessages()[1],reply);
  f.reader.close();
});

test('a delayed Sent copy is inserted in chronological order without replacing loaded cards',async()=>{
  const f=readerFixture();await f.reader.open(f.anchor);f.loaded();
  const original=f.cards.children[0],reply=sentReplyFixture(f);reply.dateInSeconds=0;
  f.tagListener.msgAdded(reply);
  assert.equal(f.cards.children.length,2);assert.equal(f.cards.children[1],original);
  assert.equal(f.reader.getMessages()[0],reply);
  assert.equal(original.getAttribute('data-latest'),'');
  f.reader.close();
});

test('inline reply snapshot appears immediately, changes to Sent and reconciles with the real message',async()=>{
 const f=readerFixture();await f.reader.open(f.anchor);f.loaded();let placement;
 f.scope.inlineReplyEnabled=true;f.scope.inlineComposeControllers=new WeakMap([[f.win,{float(){},open(header,command,options){placement=options}}]]);
 f.actions.children[0].emit('click');
 const id={},state={id,state:'sending',from:'Me',to:'Other',body:'<script>literal</script>',attachments:['file.pdf']};
 placement.onSendState(state);
 assert.equal(f.cards.children.length,2);
 const pending=f.cards.children[1];assert.equal(pending.children[1].children[1].textContent,'<script>literal</script>');
 assert.equal(pending.children[0].children[1].children[1].textContent,'Sending…');
 placement.onSendState({...state,state:'sent',messageId:'<reply>'});
 assert.equal(pending.children[0].children[1].children[1].textContent,'Sent');
 f.tagListener.msgAdded(sentReplyFixture(f));
 assert.equal(f.cards.children.length,2);assert.equal(f.cards.children[1],pending);assert.equal(pending.removed,undefined);
 assert.equal(f.reader.getMessages().length,2);f.reader.close();
});
test('send failure removes temporary card, and late feedback cannot populate another conversation',async()=>{
 const f=readerFixture();await f.reader.open(f.anchor);f.loaded();let placement;
 f.scope.inlineReplyEnabled=true;f.scope.inlineComposeControllers=new WeakMap([[f.win,{float(){},open(header,command,options){placement=options}}]]);
 f.actions.children[1].emit('click');const state={id:{},state:'sending',body:'Reply'};
 placement.onSendState(state);assert.equal(f.cards.children.length,2);
 placement.onSendState({...state,state:'saving-draft'});assert.equal(f.cards.children.length,1);
 f.reader.hide();placement.onSendState({...state,state:'sent'});assert.equal(f.cards.children.length,0);f.reader.close();
});

test('via uses a distinct Sender domain, never inventing a relay from From or malformed headers',()=>{
 const scope=context(),parser={parseDecodedHeader:value=>value?[{email:value}]:[]};
 assert.equal(scope.independentViaDomain('person@example.org','agent@mailer.example.net',parser),'mailer.example.net');
 assert.equal(scope.independentViaDomain('person@example.org','other@EXAMPLE.ORG',parser),null);
 assert.equal(scope.independentViaDomain('person@example.org','',parser),null);
 assert.equal(scope.independentViaDomain('person@example.org','bad@<script>',parser),null);
 assert.equal(scope.independentViaDomain('person@example.org','multiple',{parseDecodedHeader:()=>[{},{}]}),null);
});
test('selecting sender text does not toggle a conversation card',()=>{
 const scope=context(),inside={},outside={},sender={contains:node=>node===inside};
 assert.equal(scope.independentSenderSelected({isCollapsed:false,anchorNode:inside,focusNode:inside},sender),true);
 assert.equal(!!scope.independentSenderSelected({isCollapsed:true,anchorNode:inside},sender),false);
 assert.equal(!!scope.independentSenderSelected({isCollapsed:false,anchorNode:outside,focusNode:outside},sender),false);
});

for(const copyFirst of [false,true])test(`inline forward appears immediately and reconciles without References (copy first: ${copyFirst})`,async()=>{
 const f=readerFixture();await f.reader.open(f.anchor);f.loaded();let placement,command;
 f.scope.inlineReplyEnabled=true;f.scope.inlineComposeControllers=new WeakMap([[f.win,{float(){},open(header,action,options){command=action;placement=options}}]]);
 f.actions.children[2].emit('click');assert.equal(command,'cmd_forwardInline');
 const state={id:{},state:'sending',from:'Me',to:'Recipient',body:'Forwarded body',attachments:['original.pdf']};
 placement.onSendState(state);assert.equal(f.cards.children.length,2);
 const pending=f.cards.children[1];assert.equal(pending.children[0].children[1].children[1].textContent,'Sending…');
 const forwarded=sentReplyFixture(f,2,'forwarded',[]);
 if(copyFirst){f.tagListener.msgAdded(forwarded);assert.equal(f.reader.getMessages().length,1);}
 placement.onSendState({...state,state:'sent',messageId:'<forwarded>'});
 if(!copyFirst)f.tagListener.msgAdded(forwarded);
 assert.equal(f.cards.children.length,2);assert.equal(f.cards.children[1],pending);assert.equal(pending.removed,undefined);
 assert.equal(f.reader.getMessages()[1],forwarded);
 f.tagListener.msgAdded(forwarded);assert.equal(f.cards.children.length,2);
 f.reader.close();
});


test('wheel handoff scrolls the conversation from native text and HTML viewers without duplicating native scrolling',()=>{
 const scope=context();
 for (const format of ['plain','html']) {
  const handlers=new Map(),host={scrollTop:100,scrollHeight:2000,clientHeight:500};
  const root={nodeType:1,scrollTop:0,scrollHeight:500,clientHeight:500};
  const target={nodeType:1,parentElement:root,scrollTop:0,scrollHeight:100,clientHeight:100};
  const content={body:root,scrollingElement:root,
   defaultView:{getComputedStyle:node=>({overflowY:node===target?'auto':'visible',lineHeight:'20px'})},
   addEventListener(name,fn,options){assert.equal(options.passive,false);handlers.set(name,fn)},
   removeEventListener(name,fn){assert.equal(handlers.get(name),fn);handlers.delete(name)}};
  const close=scope.installIndependentScrollBridge(content,host);
  const emit=(overrides={})=>{let prevented=0;handlers.get('wheel')({target,deltaY:12.5,deltaX:0,deltaMode:0,cancelable:true,preventDefault(){prevented++},...overrides});return prevented};
  assert.equal(emit(),1,format);assert.equal(host.scrollTop,112.5,'fractional trackpad deltas are preserved');
  assert.equal(emit({deltaY:-10}),1);assert.equal(host.scrollTop,102.5);
  for(const overrides of [{ctrlKey:true},{metaKey:true},{altKey:true},{shiftKey:true},{deltaX:30},{deltaY:0},{cancelable:false},{defaultPrevented:true}]){
   assert.equal(emit(overrides),0);assert.equal(host.scrollTop,102.5);
  }
  target.scrollHeight=300;
  assert.equal(emit(),0,'an internally scrollable HTML block keeps its native wheel gesture');
  target.scrollTop=200;assert.equal(emit(),1,'at the inner boundary scrolling hands off');
  const before=host.scrollTop;root.scrollHeight=502;
  assert.equal(emit(),1,'two pixels of residual root overflow must not trap a trackpad gesture');
  assert.equal(host.scrollTop,before+12.5);
  root.scrollHeight=1000;
  assert.equal(emit(),1,'the auto-sized viewer always hands root scrolling to the conversation');
  root.scrollTop=500;host.scrollTop=100;
  assert.equal(emit({deltaMode:1,deltaY:2}),1);assert.equal(host.scrollTop,140);
  assert.equal(emit({deltaMode:2,deltaY:1}),1);assert.equal(host.scrollTop,640);
  host.scrollTop=1495;emit({deltaY:100});assert.equal(host.scrollTop,1500);
  assert.equal(emit(),0,'the conversation boundary does not consume more scrolling');
  host.scrollTop=0;target.scrollTop=0;root.scrollTop=0;
  assert.equal(emit({deltaY:-10}),0);
  close();assert.equal(handlers.size,0);
 }
});

test('closing a conversation removes its native message wheel handler',async()=>{
 const f=readerFixture();await f.reader.open(f.anchor);f.loaded();
 const content=f.browsers[0].content;
 assert.equal(content.events.wheel.length,1);
 const envelope=f.browsers[0].contentDocument;
 assert.equal(envelope.events.wheel.length,1,'the native message envelope also receives a non-passive wheel handler');
 f.reader.hide();assert.equal(content.events.wheel.length,0);assert.equal(envelope.events.wheel.length,0);
});


test('envelope header gestures scroll the conversation while nested viewers and handled events remain independent',()=>{
 const scope=context(),host={scrollTop:100,scrollHeight:2000,clientHeight:500};
 let wheel,removed=0;
 const content={defaultView:{getComputedStyle:()=>({overflowY:'visible',lineHeight:'20px'})},
  addEventListener(type,fn,options){assert.equal(type,'wheel');assert.equal(options.passive,false);wheel=fn},
  removeEventListener(type,fn){assert.equal(fn,wheel);removed++}};
 const close=scope.installIndependentScrollBridge(content,host,true);
 const header={nodeType:1,closest:()=>null,parentElement:null};
 const event=(extra={})=>({target:header,deltaY:2.5,deltaX:0,deltaMode:0,cancelable:true,preventDefault(){this.defaultPrevented=true},...extra});
 const e=event();wheel(e);assert.equal(host.scrollTop,102.5);assert.equal(e.defaultPrevented,true);
 wheel(e);assert.equal(host.scrollTop,102.5,'a gesture handled by the body or envelope cannot be applied twice');
 wheel(event({target:{closest:()=>({})}}));assert.equal(host.scrollTop,102.5,'embedded native viewer keeps its own scroll handler');
 close();assert.equal(removed,1);
});


test('auto-sized message viewport removes residual body scrolling and restores its original style on cleanup',()=>{
 const scope=context(),values=new Map([['overflow-y','auto']]),priorities=new Map(),root={style:{
  getPropertyValue:key=>values.get(key)||'',getPropertyPriority:key=>priorities.get(key)||'',
  setProperty(key,value,priority){values.set(key,value);priorities.set(key,priority)},removeProperty:key=>values.delete(key)}};
 const content={documentElement:root,scrollingElement:{scrollTop:13.3667}};
 const close=scope.lockIndependentViewport(content);
 assert.equal(values.get('overflow-y'),'hidden');assert.equal(priorities.get('overflow-y'),'important');
 assert.equal(content.scrollingElement.scrollTop,0,'an already displaced message body returns to its beginning');
 assert.equal(values.has('overflow-x'),false,'horizontal scrolling stays native');
 close();assert.equal(values.get('overflow-y'),'auto');assert.equal(priorities.get('overflow-y'),'');
});

test('pending replies share the final envelope layout, retain the same card and preserve user scroll during saved-message loading',async()=>{
 const f=readerFixture();await f.reader.open(f.anchor);f.loaded();let placement;
 f.scope.inlineReplyEnabled=true;f.scope.inlineComposeControllers=new WeakMap([[f.win,{float(){},open(_header,_command,options){placement=options}}]]);
 f.actions.children[1].emit('click');
 const state={id:{},state:'sending',from:'Sender',to:'Recipient',body:'Hello\n\nOn Tuesday wrote:\n> old text\n\n--\nMy signature',date:1700000000000};
 placement.onSendState(state);
 const pending=f.cards.children[1],preview=pending.children[1],heading=pending.children[0];
 assert.equal(heading.className,'card-header');assert.equal(heading.children[0].className,'toggle');
 assert.equal(heading.children[0].children[0].className,'avatar');assert.equal(heading.children[0].children[1].className,'sender');
 assert.equal(heading.children[1].children[0].tag,'time');assert.equal(preview.children[0].className,'gm-pending-recipients');
 const host=f.layout.children[0];host.scrollTop=480;
 placement.onSendState({...state,state:'sent',messageId:'reply'});
 f.tagListener.msgAdded(sentReplyFixture(f));
 assert.equal(f.cards.children[1],pending,'article DOM identity remains stable');
 assert.ok(pending.children.includes(preview),'text preview stays until the native viewer is ready');
 assert.equal(host.scrollTop,480);pending.scrolled=null;
 host.scrollTop=620;f.loaded();
 assert.equal(f.cards.children[1],pending);assert.equal(host.scrollTop,620,'a user scroll during loading is respected');
 assert.equal(preview.removed,true);assert.equal(pending.scrolled,null,'Sent-copy hydration does not force scrolling');
 assert.equal(f.browsers.at(-1).removed,undefined);f.reader.close();
});
test('pending reply plaintext folds quoted text and separates signatures without interpreting HTML',()=>{
 const scope=context();
 const result=scope.pendingReplyText('<b>literal</b>\r\n\r\nOn Tuesday wrote:\r\n> earlier\r\n\r\n--\r\nSignature');
 assert.equal(result.body,'<b>literal</b>\n');assert.equal(result.quote,'On Tuesday wrote:\n> earlier\n');assert.equal(result.signature,'--\nSignature');
 assert.equal(scope.pendingReplyText('Simple text').body,'Simple text');
});
test('position preservation compensates layout anchoring without overwriting subsequent user scrolling',()=>{
 const scope=context(),host={scrollTop:300};let top=120;
 const card={getBoundingClientRect:()=>({top})};
 scope.preserveReaderPosition(host,card,()=>{top=80;host.scrollTop=340});assert.equal(host.scrollTop,300);
 host.scrollTop=500;scope.preserveReaderPosition(host,card,()=>{});assert.equal(host.scrollTop,500);
});

test('bottom-posted and interleaved pending replies stay fully visible in their original order',()=>{
 const scope=context();
 for(const body of ['On Tuesday wrote:\n> Question\n\nEven better!','First answer\n> Question one\nInline answer\n> Question two\nSecond answer']){
  const result=scope.pendingReplyText(body+'\n\n--\nSignature');
  assert.equal(result.body,body+'\n');assert.equal(result.quote,'');assert.equal(result.signature,'--\nSignature');
 }
 const top=scope.pendingReplyText('Answer\n\nOn Tuesday wrote:\n> History');assert.equal(top.quote,'On Tuesday wrote:\n> History');
});
test('native quote folding is conservative for bottom replies, interleaved answers and signature-only headers',()=>{
 const scope=context(),quote={};
 function content(parts){return {body:{},createTreeWalker(){let index=0;return {nextNode(){const part=parts[index++];return part?{textContent:part.text || 'text',parentElement:{closest:()=>part.excluded?{}:null},compareDocumentPosition:()=>part.before?4:2}:null}}}};}
 assert.equal(scope.foldableQuotedHistory(content([{before:true},{excluded:true}]),[quote]),true);
 assert.equal(scope.foldableQuotedHistory(content([{before:true},{before:false}]),[quote]),false);
 assert.equal(scope.foldableQuotedHistory(content([{excluded:true},{before:false}]),[quote]),false);
 assert.equal(scope.foldableQuotedHistory(content([{excluded:true}]),[quote]),false);
 assert.equal(scope.foldableQuotedHistory({body:{}},[quote]),false);
});

test('opening a thread without a specific message reveals only the latest message',async()=>{
 const f=readerFixture(),latest=f.prepare(message(2,'latest','sent',2));
 f.anchor.folder.msgDatabase={getThreadContainingMsgHdr:()=>({numChildren:2,getChildHdrAt:i=>[f.anchor,latest][i]})};
 await f.reader.open(f.anchor);f.flush();
 assert.equal(f.browsers.length,1);
 assert.equal(f.cards.children[0].children[1].hidden,true);
 assert.equal(f.cards.children[0].scrolled,undefined);
 assert.equal(f.cards.children[1].children[1].hidden,false);
 assert.equal(f.cards.children[1].scrolled.block,'nearest');
 f.reader.close();
});

test('header Reply uses the same in-window compose setting as the footer on the exact message',async()=>{
 const f=readerFixture();await f.reader.open(f.anchor);f.loaded();const calls=[];
 f.scope.inlineReplyEnabled=true;
 f.scope.inlineComposeControllers=new WeakMap([[f.win,{float(){},open(header,command){calls.push([header,command])}}]]);
 f.browsers[0].replyButton.emit('command',{preventDefault(){},stopImmediatePropagation(){}});
 assert.equal(calls.length,1);assert.equal(calls[0][0],f.anchor);assert.equal(calls[0][1],'cmd_replySender');
 f.scope.inlineReplyEnabled=false;
 f.browsers[0].replyButton.emit('command',{preventDefault(){},stopImmediatePropagation(){}});
 assert.deepEqual(f.commands.at(-1),['cmd_replySender','mailbox://inbox/1']);
 f.reader.close();
});

test('long conversations compact only intermediate cards and expand them without losing message scope',async()=>{
 const f=readerFixture(),messages=[f.anchor,...Array.from({length:5},(_,i)=>f.prepare(message(i+2,`reply-${i}`,'sent',i+2)))];
 f.anchor.folder.msgDatabase={getThreadContainingMsgHdr:()=>({numChildren:messages.length,getChildHdrAt:i=>messages[i]})};
 await f.reader.open(f.anchor);f.flush();
 const gap=f.cards.children.find(card=>card.className==='history-gap');
 assert.ok(gap);assert.equal(gap.children[0].textContent,'3');
 assert.equal(f.reader.getMessages().length,6,'hidden messages remain in conversation-wide actions');
 const cards=f.cards.children.filter(card=>card.tag==='article');
 assert.deepEqual(cards.map(card=>card.hidden),[false,true,true,true,false,false]);
 assert.equal(f.browsers.length,1,'compacting does not load the hidden message bodies');
 gap.children[0].emit('click');assert.equal(gap.removed,true);
 assert.ok(cards.every(card=>!card.hidden));assert.equal(f.browsers.length,1);
 f.reader.close();
});

test('disabling compaction keeps every message card visible in a long conversation',async()=>{
 const f=readerFixture();f.scope.compactConversationsEnabled=false;
 const messages=[f.anchor,...Array.from({length:5},(_,i)=>f.prepare(message(i+2,`reply-${i}`,'sent',i+2)))];
 f.anchor.folder.msgDatabase={getThreadContainingMsgHdr:()=>({numChildren:messages.length,getChildHdrAt:i=>messages[i]})};
 await f.reader.open(f.anchor);f.flush();
 assert.equal(f.cards.children.length,6);assert.ok(f.cards.children.every(card=>!card.hidden));
 assert.equal(f.cards.children.some(card=>card.className==='history-gap'),false);
 f.reader.close();
});

test('unread messages load expanded and are never hidden inside compact conversation history',async()=>{
 const f=readerFixture(),messages=[f.anchor,...Array.from({length:5},(_,i)=>f.prepare(message(i+2,`reply-${i}`,'sent',i+2)))];
 for(const header of messages)header.isRead=true;
 messages[1].isRead=false;messages[3].isRead=false;
 f.anchor.folder.msgDatabase={getThreadContainingMsgHdr:()=>({numChildren:messages.length,getChildHdrAt:i=>messages[i]})};
 await f.reader.open(f.anchor);f.flush();
 const cards=f.cards.children.filter(card=>card.tag==='article');
 for(const index of [1,3]){assert.equal(cards[index].hidden,false);assert.equal(cards[index].getAttribute('data-expanded'),'');}
 assert.equal(cards[2].hidden,true,'read intermediate history still compacts');
 assert.equal(f.browsers.length,3,'unread bodies and latest message load through native viewers');
 assert.equal(messages[1].isRead,false,'rendering does not override native read-marking preferences');
 f.reader.close();
});

test('resumed inline drafts retain conversation label sources after reader navigation',async()=>{
 const f=readerFixture({tagged:true});let placement;
 f.scope.resumeInlineDraft=async(win,draft,options)=>{placement=options};
 const draft=f.prepare(message(9,'draft','drafts'));
 await f.reader.open(f.anchor,{draft});
 assert.equal(placement.labelMessages()[0],f.anchor);assert.equal(typeof placement.onSendState,'function');
 f.reader.hide();assert.equal(placement.labelMessages()[0],f.anchor,'navigation retains the original conversation, not another thread');f.reader.close();
});


test('unrelated mailbox notifications preserve Sent scans; relevant folders and unknown events invalidate them',async()=>{
 const scope=context();let reads=0;
 const folder={URI:'sent',get messages(){reads++;return [references(message(2,'reply','sent',2),'a')]}};
 const cache=scope.createSentCandidateCache({},()=>0);
 await cache.get([folder]);
 for(let i=0;i<100;i++){cache.invalidateFolders([{URI:'inbox'}]);await cache.get([folder])}
 assert.equal(reads,1,'100 unrelated arrivals must not rescan Sent');
 cache.invalidateFolders([folder]);await cache.get([folder]);assert.equal(reads,2);
 cache.invalidateFolders([{URI:'inbox'},folder]);await cache.get([folder]);assert.equal(reads,3,'moves into or out of Sent invalidate');
 cache.invalidateFolders([undefined]);await cache.get([folder]);assert.equal(reads,4,'unknown notification shapes stay conservative');
 cache.close();
});

test('conversation reference lookups reuse the cached index without rescanning candidates',()=>{
 const scope=context(),anchor=message(1,'root','inbox',1);let indexed=0;
 const candidates=Array.from({length:5000},(_,i)=>({header:message(i+2,'sent-'+i,'sent',i+2),get ids(){indexed++;return i===0?['root','sent-0']:['unrelated-'+i]}}));
 const first=scope.independentRelatedSent([anchor],candidates);
 assert.equal(first.length,2);assert.equal(indexed,5001);
 // The matched candidate's references still participate in transitive matching.
 const before=indexed;
 for(let i=0;i<20;i++)assert.equal(scope.independentRelatedSent([anchor],candidates).length,2);
 assert.equal(indexed-before,20,'only matched references are traversed after the first lookup');
 const replacement=[{header:message(9,'new','sent',9),ids:['root']}];
 assert.equal(scope.independentRelatedSent([anchor],replacement)[1].messageId,'new','a new snapshot gets a fresh index');
});
