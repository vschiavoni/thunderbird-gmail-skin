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

scope.gmText=text=>text;scope.gmLocale=()=> 'en';
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
