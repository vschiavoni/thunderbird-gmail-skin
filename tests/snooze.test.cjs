const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const scope=vm.createContext({setTimeout,clearTimeout});
vm.runInContext(fs.readFileSync('thunder-g/snooze.js','utf8'),scope);
function fixture(saved=[]){
  let time=1000,stored=structuredClone(saved),hidden=[],restored=[],notified=[],errors=[],reply=false,failHide=false,failRestore=false;
  const adapter={load:()=>structuredClone(stored),save:value=>stored=structuredClone(value),
    prepare:async(headers)=>({id:'job'+headers[0],messages:headers.map(id=>({id,account:'a',source:'inbox',storage:'held',date:1,size:10}))}),
    hide:async(job,message)=>{assert.ok(stored.some(job=>job.state==='preparing'));if(failHide)throw Error('offline');if(!hidden.includes(message.id))hidden.push(message.id);},
    restore:async(job,message)=>{assert.ok(stored.some(job=>job.state==='waking'));if(failRestore)throw Error('offline');if(!message.restored&&!restored.includes(message.id))restored.push(message.id);},
    hasReply:async()=>reply,notify:job=>notified.push(job.id),report:error=>errors.push(error.message)};
  const service=scope.createSnoozeService(adapter,{now:()=>time,schedule:()=>1,unschedule(){}});
  return {service,get stored(){return stored},hidden,restored,notified,errors,set time(value){time=value},set reply(value){reply=value},set failHide(value){failHide=value},set failRestore(value){failRestore=value}};
}
test('snooze persists before moves, waits until due, restores each message once',async()=>{
  const f=fixture();await f.service.snooze(['read','unread'],2000);assert.deepEqual(f.hidden,['read','unread']);
  await f.service.check();assert.equal(f.restored.length,0);f.time=2000;await f.service.check();await f.service.check();
  assert.deepEqual(f.restored,['read','unread']);assert.equal(f.stored.length,0);assert.equal(f.notified.length,1);
});
test('a new reply wakes early and cancels the pending snooze',async()=>{const f=fixture();await f.service.snooze(['a'],99999);f.reply=true;await f.service.check();assert.deepEqual(f.restored,['a']);assert.equal(f.stored.length,0);});
test('unsnooze restores without a reminder notification; reschedule persists',async()=>{const f=fixture();const id=await f.service.snooze(['a'],2000);await f.service.reschedule(id,3000);assert.equal(f.stored[0].due,3000);await f.service.cancel(id);assert.deepEqual(f.restored,['a']);assert.equal(f.notified.length,0);});
test('failed move remains recoverable after a restart',async()=>{const f=fixture();f.failHide=true;await assert.rejects(f.service.snooze(['a'],2000),/retried/);assert.equal(f.stored[0].state,'preparing');f.service.close();const next=fixture(f.stored);next.time=3000;await next.service.check();assert.deepEqual(next.hidden,['a']);assert.deepEqual(next.restored,['a']);assert.equal(next.stored.length,0);});
test('failed restoration retains the journal and retries without losing messages',async()=>{const f=fixture();await f.service.snooze(['a'],2000);f.time=3000;f.failRestore=true;await f.service.check();assert.equal(f.stored[0].state,'waking');f.failRestore=false;await f.service.check();assert.deepEqual(f.restored,['a']);assert.equal(f.stored.length,0);});
test('invalid dates and duplicate jobs fail without another move',async()=>{const f=fixture();await assert.rejects(f.service.snooze(['a'],NaN));await assert.rejects(f.service.snooze(['a'],1000));await f.service.snooze(['a'],2000);await assert.rejects(f.service.snooze(['a'],3000),/already/);assert.deepEqual(f.hidden,['a']);});
test('closing prevents later operations and leaves pending jobs intact',async()=>{const f=fixture();await f.service.snooze(['a'],2000);f.service.close();await assert.rejects(f.service.cancel('joba'),/closed/);assert.equal(f.stored.length,1);});

test('failed initial journal write never schedules an unpersisted move',async()=>{let moved=0;const service=scope.createSnoozeService({load:()=>[],save(){throw Error('disk full')},prepare:async()=>({id:'job',messages:[{id:'a'}]}),hide:async()=>moved++,report(){}},{now:()=>1,schedule:()=>1,unschedule(){}});await assert.rejects(service.snooze(['a'],100),/disk full/);assert.equal(service.list().length,0);await service.check();assert.equal(moved,0);});
test('a malformed journal is rejected without discarding stored reminders',()=>{assert.throws(()=>scope.createSnoozeService({load:()=>[{id:'broken'}]}),/Invalid snooze journal/);});

test('native threaded selection includes collapsed children, while unthreaded selection remains individual',()=>{const a={messageKey:1,folder:{URI:'inbox'}},b={messageKey:2,folder:{URI:'inbox'}};const view={getSelectedMsgHdrs:()=>[a],getThreadContainingMsgHdr:()=>({numChildren:2,getChildHdrAt:i=>[a,b][i]})};assert.deepEqual(Array.from(scope.snoozeSelectedMessages(view,null,true)),[a,b]);assert.deepEqual(Array.from(scope.snoozeSelectedMessages(view,null,false)),[a]);assert.deepEqual(Array.from(scope.snoozeSelectedMessages(view,[b],true)),[b]);});

test('bulk snooze journals every conversation before a move fails',async()=>{let stored=[],failing=true;const service=scope.createSnoozeService({load:()=>[],save:jobs=>stored=structuredClone(jobs),groups:headers=>headers.map(header=>[header]),prepare:async headers=>({id:headers[0],messages:[{id:headers[0],account:'a',source:'inbox',storage:'held',date:1,size:1}]}),hide:async()=>{assert.equal(stored.length,2);if(failing)throw Error('offline');},restore:async()=>{},hasReply:async()=>false,report(){}},{now:()=>1,schedule:()=>1,unschedule(){}});await assert.rejects(service.snooze(['a','b'],100),/retried/);assert.equal(stored.length,2);assert.equal(stored.every(job=>job.state==='preparing'),true);failing=false;await service.check();assert.equal(stored.every(job=>job.state==='sleeping'),true);});

test('a shutdown during an outstanding move leaves its durable journal for the next instance',async()=>{let stored=[],release,started;const began=new Promise(resolve=>started=resolve);const service=scope.createSnoozeService({load:()=>[],save:jobs=>stored=structuredClone(jobs),prepare:async()=>({id:'job',messages:[{id:'a'}]}),hide:async()=>{started();await new Promise(resolve=>release=resolve);},report(){}},{now:()=>1,schedule:()=>1,unschedule(){}});const pending=service.snooze(['a'],100);await began;service.close();release();await pending;assert.equal(stored[0].state,'preparing');assert.equal(stored[0].messages[0].hidden,undefined);});

test('acceptance is reported after durable scheduling and before a slow IMAP move completes',async()=>{
  let stored=[],release,started,accepted=false,finished=false;const began=new Promise(resolve=>started=resolve);
  const service=scope.createSnoozeService({load:()=>[],save:jobs=>stored=structuredClone(jobs),prepare:async()=>({id:'job',messages:[{id:'a'}]}),hide:async()=>{started();await new Promise(resolve=>release=resolve);},report(){}},{now:()=>1,schedule:()=>1,unschedule(){}});
  const pending=service.snooze(['a'],100,()=>{assert.equal(stored[0].state,'preparing');accepted=true;}).then(()=>finished=true);
  await began;assert.equal(accepted,true);assert.equal(finished,false);release();await pending;assert.equal(stored[0].state,'sleeping');
});
test('a failed journal write never reports acceptance',async()=>{
  let accepted=false;const service=scope.createSnoozeService({load:()=>[],save(){throw Error('disk full')},prepare:async()=>({id:'job',messages:[{id:'a'}]}),report(){}},{now:()=>1,schedule:()=>1,unschedule(){}});
  await assert.rejects(service.snooze(['a'],100,()=>accepted=true),/disk full/);assert.equal(accepted,false);
});

test('retrying a failed Unsnooze preserves cancellation and sends no due notification',async()=>{
  const f=fixture();await f.service.snooze(['a'],2000);f.failRestore=true;
  await assert.rejects(f.service.cancel('joba'),/offline/);
  assert.equal(f.stored[0].wakeReason,'cancel');
  f.failRestore=false;await f.service.check();assert.equal(f.stored.length,0);
  assert.equal(f.notified.length,0);
});

test('cancelled queued requests never prepare or move another conversation',async()=>{
  let release,started,prepared=[],stored=[];
  const began=new Promise(resolve=>started=resolve);
  const adapter={load:()=>[],save:jobs=>stored=structuredClone(jobs),prepare:async headers=>{prepared.push(headers[0]);return {id:headers[0],messages:[{id:headers[0]}]}},hide:async()=>{started();await new Promise(resolve=>release=resolve)},report(){}};
  const service=scope.createSnoozeService(adapter,{now:()=>1,schedule:()=>1,unschedule(){}});
  const first=service.snooze(['first'],100);await began;
  let requested=true;const second=service.snooze(['cancelled'],100,null,()=>requested);
  requested=false;release();await first;
  await assert.rejects(second,error=>error.code==='SNOOZE_CANCELLED');
  assert.deepEqual(prepared,['first']);assert.equal(stored.length,1);service.close();
});
test('failed durable Unsnooze write rolls back the in-memory waking state',async()=>{
  let fail=false;
  const service=scope.createSnoozeService({load:()=>[],save(){if(fail)throw Error('disk full')},prepare:async()=>({id:'a',messages:[{id:'a'}]}),hide:async()=>{},restore:async()=>{throw Error('must not restore')},report(){}},{now:()=>1,schedule:()=>1,unschedule(){}});
  await service.snooze(['a'],100);fail=true;
  await assert.rejects(service.cancelMany(['a']),/disk full/);
  assert.equal(service.list()[0].state,'sleeping');assert.equal(service.list()[0].wakeReason,undefined);service.close();
});
