const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function scope(){const scope=require('./localization-context.cjs').createContext({});for(const file of ['shortcuts.js','reading.js','independent-reader.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g',file),'utf8'),scope);return scope;}
function event(key,extra={}){return {key,target:{closest:()=>null},preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true},...extra};}

test('digits and L never label while typing in embedded new/reply/forward or resumed-draft editors',()=>{
 const s=scope();
 const compose={nodeType:9,documentURI:'chrome://messenger/content/messengercompose/messengercompose.xhtml'};
 const body={nodeType:9,documentURI:'about:blank',designMode:'on'};
 const nested={nodeType:9,documentURI:'about:blank',defaultView:{frameElement:{ownerDocument:compose}}};
 const focusedEditor={contentDocument:body};
 const variants=[
  {target:{ownerDocument:compose,closest:()=>null}},
  {target:{ownerDocument:body,closest:()=>null}},
  {target:{ownerDocument:nested,closest:()=>null}},
  {target:{ownerDocument:{activeElement:{shadowRoot:{activeElement:focusedEditor}}},closest:()=>null}},
  {target:{closest:()=>null},originalTarget:{ownerDocument:compose}},
  {target:{closest:()=>null},currentTarget:body},
  {target:{closest:()=>null},composedPath:()=>[{ownerDocument:compose}]},
  {target:{closest:selector=>selector==='.gm-inline-compose'?{}:null}},
 ];
 for(const extra of variants){
  for(let digit=0;digit<=9;digit++){
   const key=event(String(digit),extra);assert.equal(s.independentTagKey(key),null,`digit ${digit} stays in the composer`);
   assert.equal(key.prevented,undefined);assert.equal(key.stopped,undefined,'typing must not be swallowed');
  }
  assert.equal(s.isLabelShortcut(event('l',extra)),false);
  assert.equal(s.gmailTypingTarget(event('e',extra)),true,'other mail actions must not escape the composer either');
 }
});

test('mail shortcuts resume outside the composer and a merely open unfocused composer does not block labels',()=>{
 const s=scope(),doc={nodeType:9,documentURI:'about:3pane'};
 const normal={ownerDocument:doc,closest:()=>null};doc.activeElement=normal;
 for(let digit=0;digit<=9;digit++)assert.equal(s.independentTagKey(event(String(digit),{target:normal,currentTarget:doc})),digit);
 assert.equal(s.isLabelShortcut(event('l',{target:normal,currentTarget:doc})),true);
 assert.equal(s.gmailComposerTypingTarget(event('1',{target:normal,currentTarget:doc})),false,'cyclic focus/document chains terminate');
 doc.activeElement={contentDocument:{nodeType:9,designMode:'on'}};
 assert.equal(s.independentTagKey(event('1',{target:normal,currentTarget:doc})),null);
 doc.activeElement=normal;
 assert.equal(s.independentTagKey(event('1',{target:normal,currentTarget:doc})),1,'leaving the editor restores numeric shortcuts immediately');
});

test('native label command entry points cannot mutate labels while any embedded field has focus',()=>{
 const s=scope(),mailDoc={nodeType:9,documentURI:'about:3pane'},top={document:mailDoc};
 const composeDoc={nodeType:9,documentURI:'chrome://messenger/content/messengercompose/messengercompose.xhtml'};
 const win={top,document:mailDoc,gDBView:{getSelectedMsgHdrs:()=>[]}};let numbers=0,writes=0;
 const numeric=function(){numbers++;assert.equal(this,win.commandController)};
 win.commandController={_toggleMessageTagKey:numeric,_toggleMessageTag(){},_removeAllMessageTags(){}};
 s.applyConversationLabel=()=>{writes++};s.conversationLabelScope=()=>[];
 s.MailServices={tags:{getAllTags:()=>[]}};
 const installed=s.installConversationLabelCommands(win);
 for(const name of ['body','subject','to','cc','bcc','identity','attachment']){
   mailDoc.activeElement={contentDocument:composeDoc};composeDoc.activeElement={name,ownerDocument:composeDoc};
   for(let n=0;n<=9;n++)win.commandController._toggleMessageTagKey(n);
   win.commandController._toggleMessageTag('project',true);win.commandController._toggleMessageTag('project',false);
   win.commandController._removeAllMessageTags();
 }
 assert.equal(numbers,0);assert.equal(writes,0);
 mailDoc.activeElement={ownerDocument:mailDoc};win.commandController._toggleMessageTagKey(1);win.commandController._toggleMessageTag('project',true);
 assert.equal(numbers,1);assert.equal(writes,1);
 installed.close();assert.equal(win.commandController._toggleMessageTagKey,numeric);
});
test('focus guard handles retargeted windows, shadow editors and command dispatcher focus',()=>{
 const s=scope(),editor={nodeType:9,documentURI:'about:blank',designMode:'on'};
 const mail={nodeType:9,documentURI:'about:3pane'},top={document:mail};
 for(const focus of [{contentDocument:editor},{shadowRoot:{activeElement:{contentDocument:editor}}}]){
   mail.activeElement=focus;assert.equal(s.gmailComposerHasFocus({top,document:{}}),true);
 }
 mail.activeElement={};mail.commandDispatcher={focusedWindow:{document:editor}};
 assert.equal(s.gmailComposerHasFocus({top}),true);
 mail.commandDispatcher={};assert.equal(s.gmailComposerHasFocus({top}),false);
});
test('conversation frame command overrides and main routing guard composer focus',()=>{
 const reader=fs.readFileSync(path.join(__dirname,'../thunder-g/independent-reader.js'),'utf8');
 assert.match(reader,/controller\[name\]=\(\.\.\.args\)=>\{\s*if\(typeof gmailComposerHasFocus==='function' && gmailComposerHasFocus\(win\)\)return;/);
 const reading=fs.readFileSync(path.join(__dirname,'../thunder-g/reading.js'),'utf8');
 assert.match(reading,/function labelKey\(event\) \{\s*if\(gmailComposerTypingTarget\(event\) \|\| gmailComposerHasFocus\(win\)\)/);
});
