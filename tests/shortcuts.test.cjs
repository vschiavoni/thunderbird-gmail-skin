const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function scope(){const s=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/shortcuts.js'),'utf8'),s);return s}
function event(key,extra={}){return {key,target:{closest:()=>null},preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true},...extra}}
test('Gmail mail shortcuts are opt-in, respect typing/IME and route only supported keys',()=>{
 const s=scope(),actions=[],router=s.createGmailShortcutRouter(action=>{actions.push(action);return true});
 router.handle(event('e'));assert.equal(actions.length,0);s.gmailShortcutsEnabled=true;
 for(const [key,action] of [['r','reply'],['A','reply-all-window'],['F','forward-window'],['e','archive'],['#','delete'],['j','next'],['k','previous'],['x','toggle-selection'],['/','search'],['I','read'],['U','unread'],['l','labels'],['?','help'],['n','message-next'],[';', 'expand-all']]){const e=event(key);assert.equal(router.handle(e),true);assert.equal(actions.at(-1),action);assert.ok(e.prevented&&e.stopped)}
 const count=actions.length;
 for(const extra of [{repeat:true},{isComposing:true},{ctrlKey:true},{metaKey:true},{altKey:true},{defaultPrevented:true},{target:{isContentEditable:true}},{target:{ownerDocument:{designMode:'on'}}},{target:{closest:()=>({})}},{target:{ownerDocument:{documentURI:'chrome://messenger/content/messengercompose/messengercompose.xhtml'}}}])assert.equal(router.handle(event('e',extra)),false);
 assert.equal(actions.length,count);assert.equal(router.handle(event('q')),false);
});
test('two-key shortcuts expire, reset on typing and disabling, and preserve unhandled actions',()=>{
 const s=scope();s.gmailShortcutsEnabled=true;let time=0;const actions=[],router=s.createGmailShortcutRouter(action=>{actions.push(action);return action!=='undo'},()=>time);
 router.handle(event('g'));router.handle(event('i'));assert.equal(actions.at(-1),'folder-inbox');
 router.handle(event('*'));router.handle(event('u'));assert.equal(actions.at(-1),'select-unread');
 router.handle(event('g'));time=1001;router.handle(event('i'));assert.equal(actions.length,2);
 router.handle(event('*'));router.handle(event('a',{target:{isContentEditable:true}}));router.handle(event('r'));assert.equal(actions.at(-1),'reply');
 router.handle(event('g'));s.gmailShortcutsEnabled=false;router.handle(event('t'));s.gmailShortcutsEnabled=true;router.handle(event('d'));assert.notEqual(actions.at(-1),'folder-drafts');
 const e=event('z');assert.equal(router.handle(e),false);assert.equal(e.prevented,undefined);
});
function composer(platform='MacIntel'){
 const s=scope();s.gmailShortcutsEnabled=true;const commands=[],states=[],events=new Map(),bodyEvents=new Map(),focused=[],clicked=[];
 const body={addEventListener:(k,f)=>bodyEvents.set(k,f),removeEventListener:k=>bodyEvents.delete(k)};
 const native={navigator:{platform},gMsgCompose:{},document:{commandDispatcher:{getControllerForCommand:()=>({isCommandEnabled:()=>true})},getElementById:id=>id==='messageEditor'?{contentDocument:body}:{focus(){focused.push(id)},click(){clicked.push(id)}},addEventListener:(k,f)=>events.set(k,f),removeEventListener:k=>events.delete(k)},addEventListener:(k,f)=>events.set(k,f),removeEventListener:k=>events.delete(k),goDoCommand:cmd=>commands.push(cmd),doStatefulCommand:(...args)=>states.push(args)};
 const controller=s.installGmailComposeShortcuts(native);
 return {s,native,commands,states,events,bodyEvents,focused,clicked,controller,key:e=>bodyEvents.get('keydown')(e)};
}
test('Cmd+Enter uses the native send button once, with readiness, repeat and platform guards',()=>{
 const f=composer();f.key(event('Enter',{metaKey:true}));assert.deepEqual(f.commands,['cmd_sendButton']);
 for(const extra of [{metaKey:true,repeat:true},{metaKey:true,isComposing:true},{ctrlKey:true},{metaKey:true,shiftKey:true},{metaKey:true,altKey:true}])f.key(event('Enter',extra));assert.equal(f.commands.length,1);
 f.native.gSendOperationInProgress=true;const busy=event('Enter',{metaKey:true});f.key(busy);assert.ok(busy.prevented);assert.equal(f.commands.length,1);f.native.gSendOperationInProgress=false;
 f.s.gmailShortcutsEnabled=false;const off=event('Enter',{metaKey:true});f.key(off);assert.equal(off.prevented,undefined);
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

test('shortcut help traps mail keys and Escape while leaving scrolling available',()=>{
 const s=scope();let hidden=0,resets=0;const panel={state:'open',hidePopup(){hidden++}},router={reset(){resets++}};
 for(const key of [...['c','r','a','f','e','#','!','s','I','U','u','j','k','o','Enter','l','v','b','?'],'g','*',...Array.from({length:10},(_,i)=>String(i))]){
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
