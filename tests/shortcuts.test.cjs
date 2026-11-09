const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function scope(){const s=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/shortcuts.js'),'utf8'),s);return s}
function event(key,extra={}){return {key,target:{closest:()=>null},preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true},...extra}}
test('Gmail mail shortcuts are opt-in, respect typing/IME and route only supported keys',()=>{
 const s=scope(),actions=[],router=s.createGmailShortcutRouter(action=>{actions.push(action);return true});
 router.handle(event('e'));assert.equal(actions.length,0);vm.runInContext('gmailShortcutsEnabled=true',s);
 for(const [key,action] of [['r','reply'],['A','reply-all-window'],['F','forward-window'],['e','archive'],['#','delete'],['j','next'],['k','previous'],['x','toggle-selection'],['/','search'],['I','read'],['U','unread'],['l','labels'],['?','help'],['n','message-next'],[';', 'expand-all']]){const e=event(key);assert.equal(router.handle(e),true);assert.equal(actions.at(-1),action);assert.ok(e.prevented&&e.stopped)}
 const count=actions.length;
 for(const extra of [{repeat:true},{isComposing:true},{ctrlKey:true},{metaKey:true},{altKey:true},{defaultPrevented:true},{target:{isContentEditable:true}},{target:{ownerDocument:{designMode:'on'}}},{target:{closest:()=>({})}},{target:{ownerDocument:{documentURI:'chrome://messenger/content/messengercompose/messengercompose.xhtml'}}}])assert.equal(router.handle(event('e',extra)),false);
 assert.equal(actions.length,count);assert.equal(router.handle(event('q')),false);
});
test('two-key shortcuts expire, reset on typing and disabling, and preserve unhandled actions',()=>{
 const s=scope();vm.runInContext('gmailShortcutsEnabled=true',s);let time=0;const actions=[],router=s.createGmailShortcutRouter(action=>{actions.push(action);return action!=='undo'},()=>time);
 router.handle(event('g'));router.handle(event('i'));assert.equal(actions.at(-1),'folder-inbox');
 router.handle(event('*'));router.handle(event('u'));assert.equal(actions.at(-1),'select-unread');
 router.handle(event('g'));time=1001;router.handle(event('i'));assert.equal(actions.length,2);
 router.handle(event('*'));router.handle(event('a',{target:{isContentEditable:true}}));router.handle(event('r'));assert.equal(actions.at(-1),'reply');
 router.handle(event('g'));vm.runInContext('gmailShortcutsEnabled=false',s);router.handle(event('t'));vm.runInContext('gmailShortcutsEnabled=true',s);router.handle(event('d'));assert.notEqual(actions.at(-1),'folder-drafts');
 const e=event('z');assert.equal(router.handle(e),false);assert.equal(e.prevented,undefined);
});
function composer(platform='MacIntel'){
 const s=scope();vm.runInContext('gmailShortcutsEnabled=true',s);const commands=[],states=[],events=new Map(),bodyEvents=new Map(),focused=[],clicked=[];
 const body={addEventListener:(k,f)=>bodyEvents.set(k,f),removeEventListener:k=>bodyEvents.delete(k)};
 const native={navigator:{platform},gMsgCompose:{},document:{commandDispatcher:{getControllerForCommand:()=>({isCommandEnabled:()=>true})},getElementById:id=>id==='messageEditor'?{contentDocument:body}:{focus(){focused.push(id)},click(){clicked.push(id)}},addEventListener:(k,f)=>events.set(k,f),removeEventListener:k=>events.delete(k)},addEventListener:(k,f)=>events.set(k,f),removeEventListener:k=>events.delete(k),goDoCommand:cmd=>commands.push(cmd),doStatefulCommand:(...args)=>states.push(args)};
 const controller=s.installGmailComposeShortcuts(native);
 return {s,native,commands,states,events,bodyEvents,focused,clicked,controller,key:e=>bodyEvents.get('keydown')(e)};
}
test('Cmd+Enter uses the native send button once, with readiness, repeat and platform guards',()=>{
 const f=composer();f.key(event('Enter',{metaKey:true}));assert.deepEqual(f.commands,['cmd_sendButton']);
 for(const extra of [{metaKey:true,repeat:true},{metaKey:true,isComposing:true},{ctrlKey:true},{metaKey:true,shiftKey:true},{metaKey:true,altKey:true}])f.key(event('Enter',extra));assert.equal(f.commands.length,1);
 f.native.gSendOperationInProgress=true;const busy=event('Enter',{metaKey:true});f.key(busy);assert.ok(busy.prevented);assert.equal(f.commands.length,1);f.native.gSendOperationInProgress=false;
 vm.runInContext('gmailShortcutsEnabled=false',f.s);const off=event('Enter',{metaKey:true});f.key(off);assert.equal(off.prevented,undefined);
 f.controller.close();assert.equal(f.bodyEvents.size,0);assert.equal(f.events.size,0);
 const pc=composer('Win32');pc.key(event('Enter',{ctrlKey:true}));assert.deepEqual(pc.commands,['cmd_sendButton']);pc.controller.close();
});
test('compose mappings use native formatting, Cc/Bcc controls and identity focus',()=>{
 const f=composer();
 f.key(event('&',{code:'Digit7',metaKey:true,shiftKey:true}));f.key(event('*',{code:'Digit8',metaKey:true,shiftKey:true}));assert.deepEqual(f.commands,['cmd_ol','cmd_ul']);
 f.key(event('e',{metaKey:true,shiftKey:true}));assert.deepEqual(f.states,[['cmd_align','center']]);
 f.key(event('c',{metaKey:true,shiftKey:true}));f.key(event('b',{metaKey:true,shiftKey:true}));f.key(event('f',{metaKey:true,shiftKey:true}));
 assert.deepEqual(f.clicked,['addr_ccShowAddressRowButton','addr_bccShowAddressRowButton']);assert.deepEqual(f.focused,['ccAddrInput','bccAddrInput','msgIdentity']);
 f.native.document.commandDispatcher.getControllerForCommand=()=>({isCommandEnabled:()=>false});const e=event('Enter',{metaKey:true});f.key(e);assert.ok(e.prevented);assert.equal(f.commands.length,2);f.controller.close();
});

test('typing demo in retargeted native search widgets never runs mail actions',()=>{
 const s=scope();vm.runInContext('gmailShortcutsEnabled=true',s);
 const actions=[],router=s.createGmailShortcutRouter(action=>{actions.push(action);return true});
 const input={closest:selector=>selector.includes('input')?{}:null};
 const host={closest:selector=>selector.includes('search-bar')?{}:null};
 const contexts=[
  {target:host},
  {composedPath:()=>[input,{}]},
  {originalTarget:input},
  {explicitOriginalTarget:input},
  {target:{ownerDocument:{activeElement:{shadowRoot:{activeElement:input}}}}},
 ];
 for(const context of contexts){
  router.handle(event('g'));
  for(const key of 'demo'){const e=event(key,context);assert.equal(router.handle(e),false);assert.equal(e.prevented,undefined);assert.equal(e.stopped,undefined);}
  router.handle(event('i'));assert.equal(actions.length,0);
 }
 assert.equal(router.handle(event('o')),true);assert.deepEqual(actions,['open']);
});

const mailMappings={c:'compose',r:'reply',R:'reply-window',a:'reply-all',A:'reply-all-window',f:'forward',F:'forward-window',e:'archive','#':'delete','!':'spam',s:'star',I:'read',U:'unread',u:'back',j:'next',k:'previous',o:'open',Enter:'open',n:'message-next',p:'message-previous',';':'expand-all',':':'collapse-all',x:'toggle-selection',v:'move',l:'labels','/':'search',z:'undo',',':'toolbar',b:'snooze','?':'help'};
const sequenceMappings={g:{i:'folder-inbox',t:'folder-sent',d:'folder-drafts',n:'page-next',p:'page-previous'},'*':{a:'select-all',n:'select-none',r:'select-read',u:'select-unread',s:'select-starred',t:'select-unstarred'}};
test('every documented mail shortcut and sequence routes exactly once and respects native refusal',()=>{
 const s=scope();vm.runInContext('gmailShortcutsEnabled=true',s);
 for(const [prefix,mappings] of [['',mailMappings],...Object.entries(sequenceMappings)]){
  for(const [key,action] of Object.entries(mappings)){
   for(const accepted of [true,false]){
    const calls=[],router=s.createGmailShortcutRouter(a=>{calls.push(a);return accepted});
    if(prefix)assert.equal(router.handle(event(prefix)),true);
    const e=event(key);assert.equal(router.handle(e),accepted,`${prefix} ${key}`);
    assert.deepEqual(calls,[action]);assert.equal(!!e.prevented,accepted);assert.equal(!!e.stopped,accepted);
   }
  }
 }
});
test('every mail key and sequence stays inert in text fields, native search, dialogs and IME',()=>{
 const s=scope();vm.runInContext('gmailShortcutsEnabled=true',s);
 const contexts=[{target:{isContentEditable:true}},{target:{ownerDocument:{designMode:'on'}}},
  ...['input','textarea','select','[role="textbox"]','[role="searchbox"]','search-bar','global-search-bar','search-textbox','textbox','dialog','panel','menupopup','[role="dialog"]','[role="menu"]'].map(tag=>({target:{closest:selector=>selector.split(', ').some(part=>part===tag || tag==='input' && part.startsWith('input:'))?{}:null}})),
  {composedPath:()=>[{isContentEditable:true}]},
  {target:{ownerDocument:{activeElement:{shadowRoot:{activeElement:{isContentEditable:true}}}}}},
  ...['isComposing','repeat','ctrlKey','metaKey','altKey','defaultPrevented'].map(key=>({[key]:true}))];
 for(const context of contexts){
  const calls=[],router=s.createGmailShortcutRouter(a=>{calls.push(a);return true});
  for(const [prefix,mappings] of [['',mailMappings],...Object.entries(sequenceMappings)]){
   for(const key of Object.keys(mappings)){
    if(prefix)router.handle(event(prefix));
    const e=event(key,context);assert.equal(router.handle(e),false);assert.equal(e.prevented,undefined);assert.equal(e.stopped,undefined);
   }
  }
  assert.deepEqual(calls,[]);
 }
});
test('Enter preserves native button/link activation, and reset cancels pending sequences',()=>{
 const s=scope();vm.runInContext('gmailShortcutsEnabled=true',s);const calls=[],router=s.createGmailShortcutRouter(a=>{calls.push(a);return true});
 for(const tag of ['button','a','[role="button"]'])assert.equal(router.handle(event('Enter',{target:{closest:selector=>selector.split(', ').includes(tag)?{}:null}})),false);
 router.handle(event('g'));router.reset();router.handle(event('i'));assert.deepEqual(calls,[]);
});
test('all composer mappings use native commands on macOS, Windows and Linux',()=>{
 for(const platform of ['MacIntel','Win32','Linux x86_64']){
  const f=composer(platform),accel=/Mac/.test(platform)?{metaKey:true}:{ctrlKey:true};
  const mappings=[['Enter',{},'cmd_sendButton'],['&',{shiftKey:true,code:'Digit7'},'cmd_ol'],['*',{shiftKey:true,code:'Digit8'},'cmd_ul'],['[',{},'cmd_outdent'],[']',{},'cmd_indent'],['\\',{},'cmd_removeStyles']];
  for(const [key,extra,command] of mappings){const before=f.commands.length,e=event(key,{...accel,...extra});f.key(e);assert.equal(f.commands.length,before+1);assert.equal(f.commands.at(-1),command);assert.ok(e.prevented&&e.stopped);}
  for(const [key,value] of [['l','left'],['e','center'],['r','right']]){f.key(event(key,{...accel,shiftKey:true}));assert.deepEqual(f.states.at(-1),['cmd_align',value]);}
  for(const key of ['c','b','f'])f.key(event(key,{...accel,shiftKey:true}));
  assert.deepEqual(f.clicked,['addr_ccShowAddressRowButton','addr_bccShowAddressRowButton']);assert.deepEqual(f.focused,['ccAddrInput','bccAddrInput','msgIdentity']);
  for(const extra of [{repeat:true},{isComposing:true},{defaultPrevented:true},{altKey:true},{ctrlKey:true,metaKey:true}]){const e=event('Enter',{...accel,...extra}),before=f.commands.length;f.key(e);assert.equal(f.commands.length,before);assert.equal(e.prevented,undefined);}
  for(const busy of ['gSendOperationInProgress','gSaveOperationInProgress']){f.native[busy]=true;const before=f.commands.length,e=event('Enter',accel);f.key(e);assert.ok(e.prevented);assert.equal(f.commands.length,before);f.native[busy]=false;}
  const unhandled=event('q',accel);f.key(unhandled);assert.equal(unhandled.prevented,undefined);
  f.controller.close();
 }
});

test('every mapping is inactive when Gmail shortcuts are disabled',()=>{
 const s=scope(),calls=[],router=s.createGmailShortcutRouter(a=>{calls.push(a);return true});
 for(const [prefix,mappings] of [['',mailMappings],...Object.entries(sequenceMappings)])for(const key of Object.keys(mappings)){
  if(prefix)assert.equal(router.handle(event(prefix)),false);
  const e=event(key);assert.equal(router.handle(e),false);assert.equal(e.prevented,undefined);
 }
 assert.deepEqual(calls,[]);
 for(const platform of ['MacIntel','Win32','Linux x86_64']){
  const f=composer(platform),accel=/Mac/.test(platform)?{metaKey:true}:{ctrlKey:true};vm.runInContext('gmailShortcutsEnabled=false',f.s);
  for(const [key,extra] of [['Enter',{}],['&',{shiftKey:true,code:'Digit7'}],['*',{shiftKey:true,code:'Digit8'}],['[',{}],[']',{}],['\\',{}],...['l','e','r','c','b','f'].map(key=>[key,{shiftKey:true}])]){
   const e=event(key,{...accel,...extra});f.key(e);assert.equal(e.prevented,undefined);
  }
  assert.deepEqual(f.commands,[]);assert.deepEqual(f.states,[]);assert.deepEqual(f.clicked,[]);assert.deepEqual(f.focused,[]);f.controller.close();
 }
});

test('shortcut help traps mail keys and Escape while leaving scrolling available',()=>{
 const s=scope();let hidden=0,resets=0;const panel={state:'open',hidePopup(){hidden++}},router={reset(){resets++}};
 for(const key of [...Object.keys(mailMappings),'g','*',...Array.from({length:10},(_,i)=>String(i))]){
  const e=event(key);assert.equal(s.handleGmailShortcutHelpKey(e,panel,router),true);assert.ok(e.prevented&&e.stopped);
 }
 for(const key of ['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' ']){
  const e=event(key);assert.equal(s.handleGmailShortcutHelpKey(e,panel,router),true);assert.equal(e.prevented,undefined);assert.ok(e.stopped);
 }
 const esc=event('Escape');assert.equal(s.handleGmailShortcutHelpKey(esc,panel,router),true);assert.equal(hidden,1);assert.ok(esc.prevented&&esc.stopped);assert.ok(resets>0);
 panel.state='closed';const after=event('o');assert.equal(s.handleGmailShortcutHelpKey(after,panel,router),false);assert.equal(after.stopped,undefined);
});

test('HTML shortcut overlay consumes Escape and releases routing after close',()=>{
 const s=scope(),panel={open:true,hidePopup(){this.open=false}},e=event('Escape');
 assert.equal(s.handleGmailShortcutHelpKey(e,panel),true);assert.equal(panel.open,false);assert.ok(e.prevented&&e.stopped);
 assert.equal(s.handleGmailShortcutHelpKey(event('o'),panel),false);
});
