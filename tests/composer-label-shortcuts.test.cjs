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
