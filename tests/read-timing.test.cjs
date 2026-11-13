const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('thunder-g/experiments/api.js','utf8').split('function findFolderSettingsDocument')[0];
function setup(auto=true,delay=false,seconds=5){
 const values={'mailnews.mark_message_read.auto':auto,'mailnews.mark_message_read.delay':delay,'mailnews.mark_message_read.delay.interval':seconds};let writes=0;
 const prefs={getBoolPref:k=>values[k],getIntPref:k=>values[k],setBoolPref(k,v){writes++;values[k]=v},setIntPref(k,v){writes++;values[k]=v}};
 const scope={};vm.createContext(scope);vm.runInContext(source,scope);return {scope,prefs,values,writes:()=>writes};
}
test('opening settings preserves immediate, never and custom native intervals without writes',()=>{
 for(const [auto,delay,interval,expected] of [[true,false,5,0],[false,true,3,-1],[true,true,5,5],[true,true,20,20]]){const s=setup(auto,delay,interval);assert.equal(s.scope.nativeReadTiming(s.prefs),expected);assert.equal(s.writes(),0)}
});
test('every Gmail timing choice configures the native read policy',()=>{
 for(const choice of [0,1,3,20,-1]){const s=setup();assert.equal(s.scope.nativeReadTiming(s.prefs,choice),choice);assert.equal(s.values['mailnews.mark_message_read.auto'],choice!==-1);assert.equal(s.values['mailnews.mark_message_read.delay'],choice>0);if(choice>0)assert.equal(s.values['mailnews.mark_message_read.delay.interval'],choice)}
});
test('invalid intervals cannot modify preferences',()=>{
 for(const choice of [null,'3',2,NaN,-2,Infinity]){const s=setup();assert.throws(()=>s.scope.nativeReadTiming(s.prefs,choice));assert.equal(s.writes(),0)}
});
test('changing policy cancels existing native read timers in nested message cards once',()=>{
 const s=setup();let canceled=0;const child={ClearPendingReadTimer(){canceled++},document:{querySelectorAll:()=>[]}};
 const root={document:{querySelectorAll:()=>[{contentWindow:child},{contentWindow:child},{get contentWindow(){throw Error('remote')}}]}};
 s.scope.cancelNativeReadTimers([root]);assert.equal(canceled,1);
});
test('settings expose all timings and retain unlisted existing native values',()=>{
 const html=fs.readFileSync('thunder-g/options.html','utf8');for(const value of ['0','1','3','20','-1'])assert.ok(html.includes(`value="${value}" data-i18n="read_timing_`));
 const js=fs.readFileSync('thunder-g/read-timing-options.js','utf8');assert.match(js,/timing.append\(option\)/);assert.match(js,/timing.value = String\(saved\)/);
});

test('leaving the conversation cancels read timers before deferred viewer cleanup',()=>{
 const reader=fs.readFileSync('thunder-g/independent-reader.js','utf8');
 const scope={console};vm.createContext(scope);vm.runInContext(reader.slice(0,reader.indexOf('\n\n',reader.indexOf('function stopConversationReadTimers'))),scope);
 let canceled=0;scope.stopConversationReadTimers(new Map([[1,{contentWindow:{ClearPendingReadTimer(){canceled++}}}],[2,{}]]));assert.equal(canceled,1);
 const hide=reader.slice(reader.indexOf('hide(immediate=true)'),reader.indexOf('close(){this.hide(true)'));
 assert.ok(hide.indexOf('stopConversationReadTimers(frames)')<hide.indexOf('requestAnimationFrame'));
});

test('omitted optional experiment argument is a read-only query',async()=>{
 const s=setup(true,true,3);const api=fs.readFileSync('thunder-g/experiments/api.js','utf8');
 const method=api.slice(api.indexOf('async readTiming(seconds)'),api.indexOf('async folderPaneSettings')).trim().replace(/,$/,'');
 const scope={Services:{prefs:s.prefs},nativeReadTiming:s.scope.nativeReadTiming,cancelNativeReadTimers(){throw Error('query must not cancel timers')}};vm.createContext(scope);
 const read=vm.runInContext('({'+method+'})',scope).readTiming;
 assert.equal(await read(null),3);assert.equal(s.writes(),0);
});
