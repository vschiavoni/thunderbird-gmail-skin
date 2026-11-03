const {test}=require('node:test');
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('effective Inbox sort follows native threading without modifying message dates and restores native sort on close',()=>{
  const columns=new Map(),events=new Map(),tasks=new Map();let observer;
  const a={dateInSeconds:10,getStringProperty:()=>''},b={dateInSeconds:20,getStringProperty:()=> '100'};
  const thread={numChildren:2,getChildHdrAt:i=>[a,b][i]};for(const header of [a,b])header.folder={msgDatabase:{getThreadContainingMsgHdr:()=>thread}};
  const native={getCustomColumns:()=>[...columns].map(([id])=>({id})),addCustomColumn:(id,properties)=>columns.set(id,properties),removeCustomColumn:id=>columns.delete(id)};
  const win={gFolder:{URI:'inbox',flags:1},gDBView:{sortType:18,sortOrder:2,viewFlags:1,rowCount:2,getMsgHdrAt:i=>[a,b][i],getThreadContainingMsgHdr:()=>thread},
    gViewWrapper:{showGroupedBySort:false,sort(id){win.gDBView.curCustomColumn=id==='dateCol'?'':id;win.gDBView.sortType=id==='dateCol'?18:34;}},
    addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name),setInterval:fn=>{tasks.set(1,fn);return 1;},clearInterval:id=>tasks.delete(id)};
  const scope=vm.createContext({ChromeUtils:{importESModule:()=>({ThreadPaneColumns:native})},gmText:s=>s,Ci:{nsMsgFolderFlags:{Inbox:1},nsMsgViewSortType:{byDate:18},nsMsgViewFlagsType:{kThreadedDisplay:1}},thunderGSnooze:{subscribe(fn){observer=fn;return ()=>observer=null;}}});
  vm.runInContext(fs.readFileSync('thunder-g/snooze-order.js','utf8'),scope);
  const order=scope.createSnoozeOrder(),pane=order.attach(win);
  assert.equal(win.gDBView.curCustomColumn,'gmSnoozeThreadOrder');
  assert.equal(columns.get('gmSnoozeThreadOrder').sortCallback(a),100);
  assert.equal(columns.get('gmSnoozeOrder').sortCallback(a),10);
  win.gDBView.viewFlags=0;tasks.get(1)();assert.equal(win.gDBView.curCustomColumn,'gmSnoozeOrder');
  win.gDBView.sortType=19;win.gDBView.curCustomColumn='';observer();assert.equal(win.gDBView.sortType,19,'sender sort stays native');
  win.gDBView.sortType=18;observer();assert.equal(win.gDBView.curCustomColumn,'gmSnoozeOrder');
  pane.close();assert.equal(win.gDBView.curCustomColumn,'');assert.equal(tasks.size,0);assert.equal(events.size,0);assert.equal(observer,null);
  order.close();assert.equal(columns.size,0);assert.equal(a.dateInSeconds,10);assert.equal(b.dateInSeconds,20);
});
