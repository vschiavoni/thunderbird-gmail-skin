const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const scope=require('./localization-context.cjs').createContext({console});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/dates.js'),'utf8'),scope);
test('local calendar dates: time today, month/day this year, year for older mail',()=>{
  const now=new Date(2026,9,21,0,5);
  const today=scope.compactMessageDate(new Date(2026,9,21,0,1).getTime(),now,'en-US');
  assert.equal(today.short,'12:01 AM');assert.match(today.full,/2026/);
  assert.equal(scope.compactMessageDate(new Date(2026,9,20,23,59).getTime(),now,'en-US').short,'Oct 20');
  assert.equal(scope.compactMessageDate(new Date(2025,11,31).getTime(),now,'en-US').short,'Dec 31, 2025');
  assert.equal(scope.compactMessageDate(NaN,now,'en-US'),null);
  assert.equal(scope.compactMessageDate(0,now,'en-US'),null);
});
test('formatting hundreds of row dates reuses a bounded set of locale formatters',()=>{
  let constructions=0;
  const measured=require('./localization-context.cjs').createContext({Intl:{DateTimeFormat:class extends Intl.DateTimeFormat {
    constructor(...args){super(...args);constructions++;}
  }}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/dates.js'),'utf8'),measured);
  const now=new Date(2026,9,22,12),cache=new Map();
  for(let i=0;i<500;i++)measured.compactMessageDate(now.getTime()-i*86400000,now,'en-US',cache);
  assert.equal(constructions,4,'time, current-year date, older date and tooltip are reused across all rows');
  cache.clear();measured.compactMessageDate(now.getTime(),now,'it-IT',cache);
  assert.equal(constructions,6,'refresh can pick up a new locale/timezone');
});
test('recycled dates and Fluent tooltip update; closing restores native renderer and strings',async()=>{
  const attrs=new Map([['data-l10n-id','date-cell'],['data-l10n-args','{"title":"native"}'],['title','native']]);
  const cell={textContent:'native',get title(){return attrs.get('title')},set title(v){attrs.set('title',v)},getAttribute:n=>attrs.get(n)??null,setAttribute:(n,v)=>attrs.set(n,v),removeAttribute:n=>attrs.delete(n)};
  let timestamp=Date.now();let native='native';const timers=[];let translations=0;
  const prototype={fillRow(){cell.textContent=native;attrs.set('title',native);attrs.set('data-l10n-args',JSON.stringify({title:native}));}};
  const original=prototype.fillRow;
  const row=Object.assign(Object.create(prototype),{index:0,dataset:{},querySelector:()=>cell});
  const doc={querySelectorAll:()=>[row],l10n:{setAttributes(_cell,_id,args){translations++;attrs.set('data-l10n-args',JSON.stringify(args));}}};
  const win={document:doc,navigator:{languages:['en-US']},gDBView:{getMsgHdrAt:()=>({dateInSeconds:timestamp/1000})},customElements:{whenDefined:()=>Promise.resolve(),get:()=>({prototype})},setTimeout:fn=>{timers.push(fn);return 1},clearTimeout(){},addEventListener(){},removeEventListener(){}};
  const controller=scope.installCompactDates(win);await Promise.resolve();
  assert.notEqual(cell.textContent,'native');assert.equal(JSON.parse(attrs.get('data-l10n-args')).title,cell.title);
  const translated=translations;controller.refresh();
  assert.equal(translations,translated,'unchanged dates do not request repeated Fluent translations');
  timestamp=new Date(2020,0,2).getTime();native='native older';row.fillRow();
  assert.match(cell.textContent,/2020/);assert.match(cell.title,/2020/);
  controller.close();assert.equal(prototype.fillRow,original);assert.equal(cell.textContent,'native older');assert.equal(attrs.get('title'),'native older');
});

test('scheduled return replaces the visible date and clears on unsnooze or row recycling',async()=>{
  // Freeze today so the Nov 12 assertion does not become a time-only label
  // when the suite itself runs on Nov 12.
  const fixedNow=new Date(2026,10,9,12).getTime();
  class FixedDate extends Date {constructor(...args){super(...(args.length?args:[fixedNow]));}static now(){return fixedNow;}}
  const local=require('./localization-context.cjs').createContext({console,Date:FixedDate});
  let job={due:new Date(2026,10,10,9,10).getTime(),state:'sleeping'},changed;
  local.thunderGSnooze={forHeaders:()=>job?[job]:[],subscribe(fn){changed=fn;return ()=>{changed=null}}};
  vm.runInContext(fs.readFileSync('thunder-g/snooze-ui.js','utf8'),local);
  vm.runInContext(fs.readFileSync('thunder-g/dates.js','utf8'),local);
  const attrs=new Map(),cell={textContent:'original',get title(){return attrs.get('title')},set title(v){attrs.set('title',v)},getAttribute:n=>attrs.get(n)??null,setAttribute:(n,v)=>attrs.set(n,v),removeAttribute:n=>attrs.delete(n)};
  const prototype={fillRow(){cell.textContent='native'}};
  const row=Object.assign(Object.create(prototype),{index:0,dataset:{},querySelector:()=>cell});
  const doc={querySelectorAll:()=>[row]};
  const win={document:doc,navigator:{languages:['en']},gDBView:{getMsgHdrAt:()=>({dateInSeconds:1700000000})},customElements:{whenDefined:()=>Promise.resolve(),get:()=>({prototype})},setTimeout:()=>1,clearTimeout(){},addEventListener(){},removeEventListener(){}};
  const controller=local.installCompactDates(win);await Promise.resolve();
  assert.equal(attrs.get('data-gm-snoozed'),'sleeping');assert.match(cell.textContent,/10/);
  assert.match(cell.title,/Snoozed until/);
  job={...job,due:new Date(2026,10,12,9,10).getTime()};changed();assert.match(cell.textContent,/12/);
  row.fillRow();controller.close();assert.equal(attrs.has('data-gm-snoozed'),false);assert.equal(changed,null);
  const next=local.installCompactDates(win);await Promise.resolve();job=null;changed();
  assert.equal(attrs.has('data-gm-snoozed'),false);assert.match(cell.textContent,/2023/);next.close();
});

test('rapid view changes clear incomplete dates instead of retaining 1970 or another row deadline',async()=>{
  const local=require('./localization-context.cjs').createContext({console});
  vm.runInContext(fs.readFileSync('thunder-g/dates.js','utf8'),local);
  const attrs=new Map([['title','native 1970']]),cell={textContent:'Jan 1, 1970',get title(){return attrs.get('title')},set title(v){attrs.set('title',v)},getAttribute:n=>attrs.get(n)??null,setAttribute:(n,v)=>attrs.set(n,v),removeAttribute:n=>attrs.delete(n)};
  let header={dateInSeconds:0,date:0};
  const prototype={fillRow(){cell.textContent='Jan 1, 1970'}};
  const row=Object.assign(Object.create(prototype),{index:0,dataset:{},querySelector:()=>cell});
  const view={rowCount:1,getMsgHdrAt:()=>header};row.view=view;
  const win={document:{querySelectorAll:()=>[row]},navigator:{languages:['en']},gDBView:view,customElements:{whenDefined:()=>Promise.resolve(),get:()=>({prototype})},setTimeout:()=>1,clearTimeout(){},addEventListener(){},removeEventListener(){}};
  const controller=local.installCompactDates(win);await Promise.resolve();
  assert.equal(cell.textContent,'');assert.equal(attrs.has('title'),false);
  header={dateInSeconds:1700000000};row.fillRow();assert.match(cell.textContent,/2023/);
  win.gDBView={rowCount:1,getMsgHdrAt:()=>({dateInSeconds:1800000000})};row.fillRow();assert.equal(cell.textContent,'','old-view rows cannot render dates from the new folder');
  row.view=win.gDBView;row.fillRow();assert.notEqual(cell.textContent,'');
  header=null;win.gDBView=view;row.view=view;row.fillRow();assert.equal(cell.textContent,'');controller.close();
});

test('returned notice occupies the subject action slot and never replaces the original date',async()=>{
 const local=require('./localization-context.cjs').createContext({console,Ci:{nsMsgFolderFlags:{Inbox:1}}});
 for(const file of ['snooze-ui.js','dates.js'])vm.runInContext(fs.readFileSync('thunder-g/'+file,'utf8'),local);
 const properties=new Map([['thunderGSnoozeReturned',String(Math.floor(Date.now()/1000))]]);
 const header={dateInSeconds:1700000000,getStringProperty:key=>properties.get(key)||'',setStringProperty:(key,value)=>properties.set(key,value)};
 const attrs=new Map(),cell={textContent:'native',get title(){return attrs.get('title')},set title(v){attrs.set('title',v)},getAttribute:key=>attrs.get(key)??null,setAttribute:(key,value)=>attrs.set(key,value),removeAttribute:key=>attrs.delete(key)};
 const actions={className:'gm-row-actions'},children=[actions];
 const line={append:node=>children.push(node),insertBefore(node,before){children.splice(children.indexOf(before),0,node)},querySelector:()=>actions};
 const prototype={fillRow(){}};const row=Object.assign(Object.create(prototype),{index:0,dataset:{},querySelector:selector=>selector==='.subject-line'?line:selector==='.gm-snooze-returned'?children.find(n=>n.className==='gm-snooze-returned'):cell});
 const doc={querySelectorAll:()=>[row],createElement:()=>({remove(){children.splice(children.indexOf(this),1)}})};
 const win={gFolder:{flags:1},gDBView:{getMsgHdrAt:()=>header},document:doc,navigator:{languages:['en-US']},customElements:{whenDefined:()=>Promise.resolve(),get:()=>({prototype})},setTimeout:()=>1,clearTimeout(){},addEventListener(){},removeEventListener(){}};
 const controller=local.installCompactDates(win);await Promise.resolve();
 assert.equal(children[0].textContent,'Snoozed < 1 hour ago');assert.equal(children[1],actions);
 assert.equal(cell.textContent,local.compactMessageDate(header.dateInSeconds*1000,new Date(),'en-US').short);
 assert.equal(attrs.has('data-gm-snoozed'),false,'the date cell is not styled as a returned notice');
 local.acknowledgeSnoozeReturn([header]);controller.refresh();assert.deepEqual(children,[actions]);controller.close();
});
