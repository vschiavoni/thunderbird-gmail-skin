const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function scope(){const s=require('./localization-context.cjs').createContext({});vm.runInContext(fs.readFileSync('thunder-g/default-reply.js','utf8'),s);return s;}
function button(){const attrs=new Map([['title','Native reply']]),css=new Map(),events=new Map();return {attrs,css,events,getAttribute:key=>attrs.get(key),setAttribute:(key,value)=>attrs.set(key,value),removeAttribute:key=>attrs.delete(key),style:{getPropertyValue:key=>css.get(key)?.value||'',getPropertyPriority:key=>css.get(key)?.priority||'',setProperty:(key,value,priority)=>css.set(key,{value,priority}),removeProperty:key=>css.delete(key)},addEventListener:(type,fn)=>events.set(type,fn),removeEventListener:type=>events.delete(type)};}
function event(){return {preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true}};}
test('default reply is Reply; Reply all changes command, accessible text and double-arrow glyph together',()=>{
 const s=scope(),b=button(),calls=[],binding=s.installDefaultReplyControl(b,cmd=>calls.push(cmd));
 const single=b.css.get('--gm-default-reply-icon').value;assert.equal(b.attrs.get('title'),'Reply');assert.equal(b.attrs.get('aria-label'),'Reply');
 let e=event();b.events.get('command')(e);assert.deepEqual(calls,['cmd_replySender']);assert.ok(e.prevented&&e.stopped);
 s.setThunderGDefaultReplyBehavior('reply-all');assert.equal(b.attrs.get('title'),'Reply all');assert.equal(b.attrs.get('tooltiptext'),'Reply all');assert.equal(b.attrs.get('aria-label'),'Reply all');
 const doubled=b.css.get('--gm-default-reply-icon').value;assert.notEqual(doubled,single);assert.match(decodeURIComponent(doubled),/M7 5 1 11l6 6 M12 5l-6 6 6 6/);
 b.events.get('command')(event());assert.equal(calls.at(-1),'cmd_replyall');s.setThunderGDefaultReplyBehavior('invalid');assert.equal(b.attrs.get('title'),'Reply');assert.equal(b.css.get('--gm-default-reply-icon').value,single);binding.close();
});
test('live updates reach every mounted header, then cleanup restores native controls without retaining listeners',()=>{
 const s=scope(),one=button(),two=button(),a=s.installDefaultReplyControl(one,()=>{}),b=s.installDefaultReplyControl(two,()=>{});
 s.setThunderGDefaultReplyBehavior('reply-all');assert.equal(one.attrs.get('title'),'Reply all');assert.equal(two.attrs.get('title'),'Reply all');a.close();s.setThunderGDefaultReplyBehavior('reply');
 assert.equal(one.attrs.get('title'),'Native reply');assert.equal(one.events.size,0);assert.equal(one.css.size,0);assert.equal(two.attrs.get('title'),'Reply');b.close();assert.equal(vm.runInContext('thunderGDefaultReplyListeners.size',s),0);
});
test('stale conversation header controls do not dispatch a reply',()=>{
 const s=scope(),b=button();let calls=0;const control=s.installDefaultReplyControl(b,()=>calls++,()=>false);const e=event();b.events.get('command')(e);assert.equal(calls,0);assert.equal(e.prevented,undefined);control.close();
});
async function optionsFixture(stored='reply',fail=false){
 const events=new Map(),writes=[],choices=['reply','reply-all'].map(value=>({value,disabled:true,checked:value==='reply',addEventListener:(_type,fn)=>events.set(value,fn)})),status={};
 const s=vm.createContext({document:{querySelectorAll:()=>choices,getElementById:()=>status},browser:{storage:{local:{async get(defaults){assert.equal(defaults.defaultReplyBehavior,'reply');return {defaultReplyBehavior:stored}},async set(value){if(fail)throw Error('disk full');writes.push(value)}}}}});
 vm.runInContext(fs.readFileSync('thunder-g/default-reply-options.js','utf8'),s);await new Promise(setImmediate);return {choices,status,events,writes};
}
test('settings restore the saved choice and persist only an explicit changed radio selection',async()=>{
 const f=await optionsFixture('reply-all');assert.equal(f.choices[1].checked,true);assert.ok(f.choices.every(choice=>!choice.disabled));assert.equal(f.writes.length,0);
 f.choices[0].checked=true;f.choices[1].checked=false;await f.events.get('reply')();assert.equal(f.writes[0].defaultReplyBehavior,'reply');assert.match(f.status.textContent,/Saved/);
});
test('failed settings writes restore the last saved choice and show an actionable error',async()=>{
 const f=await optionsFixture('reply',true);f.choices[0].checked=false;f.choices[1].checked=true;await f.events.get('reply-all')();assert.equal(f.choices[0].checked,true);assert.equal(f.choices[1].checked,false);assert.match(f.status.textContent,/disk full/);assert.equal(f.writes.length,0);assert.ok(f.choices.every(choice=>!choice.disabled));
});
test('background restores and propagates reply behavior only from local storage',async()=>{
 let changed;const calls=[];
 const s=require('./localization-context.cjs').createContext({console,browser:{storage:{local:{async get(defaults){return {...defaults,defaultReplyBehavior:'reply-all'}}},onChanged:{addListener(fn){changed=fn}}},inlineLabels:{onDkimRequest:{addListener(){}},async setDefaultReplyBehavior(value){calls.push(value)},async setHideTodayPane(){},async setComposeAutosave(){},async setMessagesPerPage(){},async setCompactConversations(){},async setIndependentReader(){},async start(){}}}});
 await vm.runInContext(fs.readFileSync('thunder-g/background.js','utf8'),s);assert.deepEqual(calls,['reply-all']);changed({defaultReplyBehavior:{newValue:'reply'}},'local');changed({defaultReplyBehavior:{newValue:'reply-all'}},'sync');changed({defaultReplyBehavior:{newValue:'unknown'}},'local');assert.deepEqual(calls,['reply-all','reply','reply']);
 const schema=JSON.parse(fs.readFileSync('thunder-g/experiments/schema.json','utf8'))[0].functions.find(fn=>fn.name==='setDefaultReplyBehavior');assert.deepEqual(schema.parameters[0].enum,['reply','reply-all']);
});
test('the same default-reply binding supports an HTML permanent-card button without duplicate native command handlers',()=>{
 const s=scope(),b=button(),calls=[];const control=s.installDefaultReplyControl(b,command=>calls.push(command),()=>true,'click');
 assert.equal(b.events.has('command'),false);s.setThunderGDefaultReplyBehavior('reply-all');b.events.get('click')(event());assert.deepEqual(calls,['cmd_replyall']);control.close();assert.equal(b.events.size,0);
});
