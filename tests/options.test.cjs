const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

test('settings confirmations expire, newer feedback replaces timers, and errors stay visible',()=>{
  const elements=new Map(),timers=new Map(),events={};let sequence=0;
  const element=id=>{
    if(!elements.has(id))elements.set(id,{dataset:{},textContent:'',addEventListener(){}});
    return elements.get(id);
  };
  const scope=require('./localization-context.cjs').createContext({
    document:{getElementById:element,querySelectorAll:()=>[]},window:{addEventListener:(name,fn)=>events[name]=fn},
    browser:{runtime:{getPlatformInfo:async()=>({os:'mac'}),getManifest:()=>({version:'test'})},storage:{local:{get:()=>new Promise(()=>{})}}},
    setTimeout(fn,delay){timers.set(++sequence,{fn,delay});return sequence},
    clearTimeout:id=>timers.delete(id)
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/options.js'),'utf8'),scope);
  const status=element('status');
  function expire(){const [id,timer]=timers.entries().next().value;timers.delete(id);timer.fn();}
  scope.reportStatus('Saved.');
  assert.equal(status.textContent,'Saved.');assert.equal(status.dataset.kind,'success');
  assert.equal(timers.values().next().value.delay,3000);
  expire();assert.equal(status.textContent,'');assert.equal(timers.size,0);

  scope.reportStatus('Saved.');const previous=timers.keys().next().value;
  scope.reportStatus('Saved. Applies to newly opened compose windows.');
  assert.equal(timers.has(previous),false);assert.equal(timers.size,1);
  assert.equal(timers.values().next().value.delay,6000,'longer explanations remain readable');
  scope.reportStatus('Unable to save. Please try again.');
  assert.equal(status.dataset.kind,'error');assert.equal(timers.size,0,'an earlier success cannot dismiss an error');
  assert.equal(status.textContent,'Unable to save. Please try again.');
  scope.reportStatus('Saved.');assert.equal(timers.size,1);
  events.pagehide();assert.equal(timers.size,0,'closing settings cancels its timeout');
});

for(const fail of [false,true])test(`recommended preset updates settings atomically and preserves unrelated choices (save failure: ${fail})`,async()=>{
 const elements=new Map(),writes=[];
 const settings={interfaceLanguage:'it',bimiEnabled:true,hideTodayPane:false,independentReader:false,inlineReplyEnabled:false,inlineNewMessageEnabled:false,messagesPerPage:0,composeAutosave:false,composeAutosaveMinutes:10};
 const element=id=>{
  if(!elements.has(id))elements.set(id,{dataset:{},textContent:'',disabled:false,events:{},addEventListener(name,fn){this.events[name]=fn}});
  return elements.get(id);
 };
 const scope=require('./localization-context.cjs').createContext({document:{getElementById:element,querySelectorAll:()=>[]},window:{addEventListener(){}},
 browser:{runtime:{getPlatformInfo:async()=>({os:'mac'}),getManifest:()=>({version:'test'})},storage:{local:{get:async defaults=>({...defaults,...settings}),set:async values=>{writes.push(values);if(fail)throw Error('storage failure')}}}},setTimeout(){},clearTimeout(){}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/options.js'),'utf8'),scope);
 await Promise.resolve();await Promise.resolve();
 await element('apply-recommended').events.click();
 assert.equal(writes.length,1);assert.equal(Object.hasOwn(writes[0],'interfaceLanguage'),false);assert.equal(Object.hasOwn(writes[0],'bimiEnabled'),false);
 assert.equal(Object.hasOwn(writes[0],'gmail'),false);
 assert.equal(element('bimi-enabled').checked,true);assert.equal(element('interface-language').value,'it');
 assert.equal(element('apply-recommended').disabled,false);
 if(fail){
  assert.equal(element('independent-reader').checked,false);assert.equal(element('messages-per-page').value,'0');
  assert.equal(element('recommended-status').dataset.kind,'error');
 }else{
  for(const id of ['independent-reader','inline-reply-enabled','inline-new-message','hide-today-pane','compose-autosave'])assert.equal(element(id).checked,true,id);
  assert.equal(element('messages-per-page').value,'50');assert.equal(element('compose-autosave-timing').value,'auto');assert.equal(element('compose-autosave-timing').disabled,false);
  assert.equal(element('show-column-headers').checked,false);assert.equal(element('recommended-status').dataset.kind,'success');
 }
});
