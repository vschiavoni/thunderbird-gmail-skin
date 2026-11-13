const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const scope=vm.createContext({Intl});vm.runInContext(fs.readFileSync('thunder-g/snooze-ui.js','utf8'),scope);
test('Gmail-style date fields round-trip English and Italian and accept explicit ISO dates',()=>{
  for(const locale of ['en','it'])for(const [year,month,day] of [[2026,10,3],[2028,1,29],[2027,11,31]]){
    const date=new Date(year,month,day),parsed=scope.snoozeParseDate(scope.snoozeFormatDate(date,locale),locale);
    assert.equal(parsed.getFullYear(),year);assert.equal(parsed.getMonth(),month);assert.equal(parsed.getDate(),day);
  }
  assert.equal(scope.snoozeParseDate('2026-11-03','it').getDate(),3);
  assert.equal(scope.snoozeParseDate('03/11/2026','it').getMonth(),10);
  assert.equal(scope.snoozeParseDate('11/03/2026','en').getMonth(),10);
});
test('date fields reject rollover and malformed dates',()=>{
  for(const value of ['31 feb 2026','Feb 29, 2026','2026-02-31','2026-13-01','2026-00-12','not a date','3 nov'])assert.equal(scope.snoozeParseDate(value,value.includes('feb')||value.includes('nov')?'it':'en'),null,value);
});

scope.gmText=(text,...values)=>text.replace(/\$(\d+)/g,(_,n)=>values[Number(n)-1]??'$'+n);scope.gmLocale=()=> 'en';
function operationFixture(){
  const fixture=require('./snooze-ui-fixture.cjs')();let accept,resolve,reject;
  const pending=new Promise((yes,no)=>{resolve=yes;reject=no});
  const service={list:()=>[],subscribe:()=>()=>{},snooze(_headers,_due,ready){accept=ready;return pending;}};
  const ui=scope.installSnoozeUI(fixture.win,service);ui.choose([{}]);fixture.doc.querySelector('.gm-snooze-custom').click();
  const dialog=fixture.doc.querySelector('.gm-snooze-calendar-dialog');
  return {...fixture,ui,dialog,accept:()=>accept(),resolve,reject};
}
test('Save releases the modal at durable acceptance while the IMAP operation is still pending',async()=>{
  const f=operationFixture();f.dialog.querySelector('.gm-snooze-save').click();assert.equal(f.doc.modals.size,1,'no acceptance before the journal is saved');
  f.accept();assert.equal(f.doc.modals.size,0);assert.equal(f.dialog.open,false);assert.equal(f.dialog.isConnected,false);assert.match(f.doc.querySelector('.gm-snooze-status').textContent,/Snoozing/);
  f.resolve();await new Promise(setImmediate);assert.match(f.doc.querySelector('.gm-snooze-status').textContent,/Conversation snoozed/);f.ui.close();
});
test('a background IMAP failure stays visible without reopening a modal',async()=>{
  const f=operationFixture();f.dialog.querySelector('.gm-snooze-save').click();f.accept();f.reject(Error('Saved snoozes will be retried.'));await new Promise(setImmediate);
  assert.equal(f.doc.modals.size,0);const status=f.doc.querySelector('.gm-snooze-status');assert.equal(status.getAttribute('role'),'alert');assert.match(status.textContent,/retried/);f.ui.close();
});
test('a pre-acceptance failure leaves the date picker editable and preserves disabled past days',async()=>{
  const f=operationFixture();const disabled=f.dialog.querySelectorAll('button').filter(button=>button.disabled);f.dialog.querySelector('.gm-snooze-save').click();f.reject(Error('Could not save reminder.'));await new Promise(setImmediate);
  assert.equal(f.doc.modals.size,1);assert.equal(f.dialog.querySelector('.gm-snooze-save').disabled,false);assert.equal(disabled.every(button=>button.disabled),true);assert.match(f.dialog.querySelector('[role="alert"]').textContent,/Could not save/);f.ui.close();
});

test('keyboard-opened snooze menu closes on Escape and outside pointer, releasing listeners on unload',()=>{
  const f=require('./snooze-ui-fixture.cjs')();const service={list:()=>[],subscribe:()=>()=>{}};
  const ui=scope.installSnoozeUI(f.win,service),anchor=f.doc.createElement('button');f.doc.documentElement.append(anchor);
  ui.choose([{}],null,anchor);let prevented=false;
  f.doc.emit('keydown',{key:'Escape',preventDefault(){prevented=true},stopImmediatePropagation(){}});
  assert.equal(prevented,true);assert.equal(f.doc.querySelector('.gm-snooze-menu'),null);assert.equal(f.doc.activeElement,anchor);
  ui.choose([{}],null,anchor);const menu=f.doc.querySelector('.gm-snooze-menu');
  f.doc.emit('pointerdown',{target:menu});assert.equal(menu.isConnected,true);
  f.doc.emit('pointerdown',{target:f.doc.documentElement});assert.equal(menu.isConnected,false);
  ui.close();f.doc.emit('keydown',{key:'Escape'});
});

test('synthetic search tabs do not initialize hidden native folder modes',()=>{
  const win={gViewWrapper:{isSynthetic:true},document:{getElementById(){return {}}},folderPane:{_modes:{}}};
  const ui=scope.installSnoozedFolderMode(win,{});
  assert.deepEqual(Object.keys(win.folderPane._modes),[]);ui.close();
});

test('Cancel remains usable while an earlier operation blocks durable acceptance',async()=>{
  const f=operationFixture();f.dialog.querySelector('.gm-snooze-save').click();
  assert.equal(f.dialog.querySelector('.gm-snooze-cancel').disabled,false);
  f.dialog.querySelector('.gm-snooze-cancel').click();assert.equal(f.doc.modals.size,0);
  f.reject(Error('Could not save reminder.'));await new Promise(setImmediate);
  assert.match(f.doc.querySelector('.gm-snooze-status').textContent,/Could not save/);f.ui.close();
});
test('an operation completing after UI teardown cannot recreate status elements',async()=>{
  const f=operationFixture();f.dialog.querySelector('.gm-snooze-save').click();f.ui.close();
  f.accept();f.resolve();await new Promise(setImmediate);
  assert.equal(f.doc.querySelector('.gm-snooze-status'),null);assert.equal(f.doc.modals.size,0);
});

test('service shutdown closes the picker without exposing an internal lifecycle error',async()=>{
  const f=operationFixture();f.dialog.querySelector('.gm-snooze-save').click();
  f.reject(Error('Snooze closed'));await new Promise(setImmediate);
  assert.equal(f.doc.modals.size,0);assert.equal(f.dialog.isConnected,false);
  assert.equal(f.doc.querySelector('.gm-snooze-status'),null);f.ui.close();
});
test('dismissing pending feedback keeps it dismissed when the operation finishes',async()=>{
  const f=operationFixture();f.dialog.querySelector('.gm-snooze-save').click();f.accept();
  f.doc.querySelector('.gm-snooze-status').querySelector('button').click();
  f.resolve();await new Promise(setImmediate);
  assert.equal(f.doc.querySelector('.gm-snooze-status'),null);f.ui.close();
});
test('repeated activation of the same snooze anchor toggles its menu closed',()=>{
  const f=require('./snooze-ui-fixture.cjs')(),service={list:()=>[],subscribe:()=>()=>{}};
  const ui=scope.installSnoozeUI(f.win,service),anchor=f.doc.createElement('button');
  f.doc.documentElement.append(anchor);ui.choose([{}],null,anchor);
  f.doc.emit('pointerdown',{target:anchor});ui.choose([{}],null,anchor);
  assert.equal(f.doc.querySelector('.gm-snooze-menu'),null);ui.close();
});
test('native calendar cancellation removes the modal and allows reopening',()=>{
  const f=operationFixture();let prevented=false;
  f.dialog.emit('cancel',{preventDefault(){prevented=true},stopPropagation(){}});
  assert.equal(prevented,true);assert.equal(f.doc.modals.size,0);
  f.ui.choose([{}]);assert.ok(f.doc.querySelector('.gm-snooze-menu'));f.ui.close();
});

test('calendar Cancel returns keyboard focus to the original snooze button',()=>{
  const f=require('./snooze-ui-fixture.cjs')(),service={list:()=>[],subscribe:()=>()=>{}};
  const ui=scope.installSnoozeUI(f.win,service),anchor=f.doc.createElement('button');
  f.doc.documentElement.append(anchor);ui.choose([{}],null,anchor);
  f.doc.querySelector('.gm-snooze-custom').click();
  f.doc.querySelector('.gm-snooze-cancel').click();
  assert.equal(f.doc.modals.size,0);assert.equal(f.doc.activeElement,anchor);ui.close();
});

test('pending status expires even when the server operation has not completed',async()=>{
  const f=operationFixture();f.dialog.querySelector('.gm-snooze-save').click();f.accept();
  assert.ok(f.doc.querySelector('.gm-snooze-status'));
  assert.equal(f.timers.size,1);[...f.timers.values()][0]();
  assert.equal(f.doc.querySelector('.gm-snooze-status'),null);
  assert.equal(f.doc.modals.size,0);
  f.resolve();await new Promise(setImmediate);f.ui.close();
});

test('a held message offers Unsnooze and existing reminder dates reschedule without another snooze',async()=>{
  const f=require('./snooze-ui-fixture.cjs')(),calls=[];
  const reminder={id:'existing',due:Date.now()+86400000};
  const service={list:()=>[reminder],subscribe:()=>()=>{},forHeaders:()=>[reminder],
    snooze(){throw Error('Must reuse existing reminder')},
    async reschedule(id,_due,ready){calls.push(['reschedule',id]);ready();},
    async cancel(id,ready){calls.push(['cancel',id]);ready();}};
  const ui=scope.installSnoozeUI(f.win,service);ui.choose([{}]);
  assert.ok(f.doc.querySelector('.gm-snooze-unsnooze'));
  f.doc.querySelector('.gm-snooze-menu').querySelector('button').click();await new Promise(setImmediate);
  assert.deepEqual(calls,[['reschedule','existing']]);assert.equal(f.doc.querySelector('.gm-snooze-menu'),null);
  ui.choose([{}]);f.doc.querySelector('.gm-snooze-unsnooze').click();await new Promise(setImmediate);
  assert.deepEqual(calls,[['reschedule','existing'],['cancel','existing']]);
  assert.equal(f.doc.querySelector('.gm-snooze-menu'),null);assert.match(f.doc.querySelector('.gm-snooze-status').textContent,/Snooze removed/);ui.close();
});
test('an ordinary message does not offer Unsnooze',()=>{
  const f=require('./snooze-ui-fixture.cjs')(),service={list:()=>[],subscribe:()=>()=>{},forHeaders:()=>[]};
  const ui=scope.installSnoozeUI(f.win,service);ui.choose([{}]);assert.equal(f.doc.querySelector('.gm-snooze-unsnooze'),null);ui.close();
});

test('reminder banner reports the scheduled day and distinguishes pending moves',()=>{
  const now=new Date(2026,10,9,12),due=new Date(2026,10,10,9,10).getTime();
  assert.equal(scope.snoozeReminderText({due,state:'sleeping'},'en-GB',now),'Snoozed until Tomorrow, 09:10');
  assert.equal(scope.snoozeReminderText({due,state:'preparing'},'en-GB',now),'Snooze pending until Tomorrow, 09:10');
  assert.equal(scope.snoozeDisplayReminder({forHeaders:()=>[{due,state:'waking'}]},[{}]),null);
});
test('background failure feedback expires instead of leaving a permanent black bar',async()=>{
  const f=operationFixture();f.dialog.querySelector('.gm-snooze-save').click();f.accept();
  f.reject(Error('Saved snoozes will be retried.'));await new Promise(setImmediate);
  assert.equal(f.doc.querySelector('.gm-snooze-status').getAttribute('role'),'alert');
  assert.equal(f.timers.size,1);[...f.timers.values()][0]();
  assert.equal(f.doc.querySelector('.gm-snooze-status'),null);f.ui.close();
});

test('selection cleanup happens at durable acceptance, once, and never for rescheduling',async()=>{
  const f=require('./snooze-ui-fixture.cjs')();let accept,release,cleaned=0;
  const service={list:()=>[],subscribe:()=>()=>{},snooze(_headers,_due,ready){accept=ready;return new Promise(resolve=>release=resolve)}};
  const ui=scope.installSnoozeUI(f.win,service,{onMoveAccepted(){cleaned++}});
  ui.choose([{}]);f.doc.querySelector('.gm-snooze-menu').querySelector('button').click();
  assert.equal(cleaned,0);accept();assert.equal(cleaned,1);release();await new Promise(setImmediate);assert.equal(cleaned,1);
  service.forHeaders=()=>[{id:'existing',due:Date.now()+86400000}];service.reschedule=async(_id,_due,ready)=>ready();
  ui.choose([{}]);f.doc.querySelector('.gm-snooze-menu').querySelector('button').click();await new Promise(setImmediate);
  assert.equal(cleaned,1);ui.close();
});
test('late acceptance cannot clear a newly selected row or a different folder view',()=>{
  const tree={selectedIndices:[0]},header={messageKey:1,folder:{URI:'inbox'}};
  const win={document:{getElementById:()=>tree},gDBView:{getSelectedMsgHdrs:()=>[header]}};
  const context=scope.captureSnoozeSelection(win);assert.equal(scope.snoozeSelectionUnchanged(win,context),true);
  tree.selectedIndices=[1];assert.equal(scope.snoozeSelectionUnchanged(win,context),false);
  tree.selectedIndices=[0];header.messageKey=2;assert.equal(scope.snoozeSelectionUnchanged(win,context),false);
  header.messageKey=1;win.gDBView={...win.gDBView};assert.equal(scope.snoozeSelectionUnchanged(win,context),false);
});
test('Cancel while a real request is queued leaves no snooze and no status bar',async()=>{
  vm.runInContext(fs.readFileSync('thunder-g/snooze.js','utf8'),scope);
  const f=require('./snooze-ui-fixture.cjs')();let release,started;
  const began=new Promise(resolve=>started=resolve),due=Date.now()+86400000;
  const service=scope.createSnoozeService({load:()=>[],save(){},prepare:async headers=>({id:headers[0],messages:[{id:headers[0]}]}),hide:async()=>{started();await new Promise(resolve=>release=resolve)},report(){}},{schedule:()=>1,unschedule(){}});
  const first=service.snooze(['first'],due);await began;
  const ui=scope.installSnoozeUI(f.win,service);ui.choose(['cancelled']);f.doc.querySelector('.gm-snooze-custom').click();
  f.doc.querySelector('.gm-snooze-save').click();f.doc.querySelector('.gm-snooze-cancel').click();
  release();await first;await new Promise(setImmediate);
  assert.equal(service.list().length,1);assert.equal(service.list()[0].id,'first');
  assert.equal(f.doc.modals.size,0);assert.equal(f.doc.querySelector('.gm-snooze-status'),null);ui.close();service.close();
});

test('a mixed selection reschedules existing reminders and snoozes only new messages',async()=>{
  const f=require('./snooze-ui-fixture.cjs')(),calls=[],old={id:'old'},fresh={id:'new'},job={id:'job',due:Date.now()+86400000};
  const service={list:()=>[job],subscribe:()=>()=>{},forHeaders:headers=>headers.includes(old)?[job]:[],
    async reschedule(id,_due,ready){calls.push(['reschedule',id]);ready?.();},
    async snooze(headers,_due,ready){calls.push(['snooze',headers.map(header=>header.id)]);ready();}};
  const ui=scope.installSnoozeUI(f.win,service);ui.choose([old,fresh]);
  f.doc.querySelector('.gm-snooze-menu').querySelector('button').click();await new Promise(setImmediate);
  assert.deepEqual(calls,[['reschedule','job'],['snooze',['new']]]);ui.close();
});

test('returned notice persists for already-read mail until explicitly opened without changing dates or return ordering',()=>{
  const properties=new Map([['thunderGSnoozeReturned','1000']]);
  const header={dateInSeconds:100,isRead:true,getStringProperty:key=>properties.get(key)||'',setStringProperty:(key,value)=>properties.set(key,value)};
  assert.equal(scope.snoozeReturnedNotice([header],1000*1000).text,'Snoozed < 1 hour ago');
  assert.equal(scope.snoozeReturnedNotice([header],(1000+3600)*1000).text,'Snoozed 1 hour ago');
  assert.equal(scope.snoozeReturnedNotice([header],(1000+7200)*1000).text,'Snoozed 2 hours ago');
  scope.acknowledgeSnoozeReturn([header]);
  assert.equal(scope.snoozeReturnedNotice([header],1000*1000),null);
  assert.equal(properties.get('thunderGSnoozeReturned'),'1000');assert.equal(header.dateInSeconds,100);assert.equal(header.isRead,true);
  properties.set('thunderGSnoozeReturned','2000');assert.ok(scope.snoozeReturnedNotice([header],2000*1000),'a later snooze produces a new notice');
});
