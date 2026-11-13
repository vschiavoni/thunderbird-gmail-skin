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

test('late return metadata invalidates native cached keys without changing row count',()=>{
  const columns=new Map(),calls=[],timers=[];let returned='',observer;
  const tree={dragging:false,inKeyDnD:false,hasAttribute(){return this.dragging},querySelector(){return null}};
  const header={dateInSeconds:10,getStringProperty:()=>returned};
  const viewThread={numChildren:2,getChildHdrAt:i=>i?{dateInSeconds:200,getStringProperty:()=>''}:header};
  header.folder={msgDatabase:{getThreadContainingMsgHdr:()=>({numChildren:1,getChildHdrAt:()=>header})}};
  const service={orderRevision:0,subscribe(fn){observer=fn;return ()=>{}}};
  const view={sortType:18,sortOrder:2,viewFlags:1,rowCount:1,getMsgHdrAt:()=>header,getThreadContainingMsgHdr:()=>viewThread};
  const win={document:{getElementById:()=>tree},gFolder:{URI:'unified-inbox',flags:1},gDBView:view,gViewWrapper:{sort(id){calls.push(id);view.curCustomColumn=id==='dateCol'?'':id;view.sortType=id==='dateCol'?18:34;}},addEventListener(){},removeEventListener(){},setInterval:fn=>{timers.push(fn);return 1},clearInterval(){}};
  const scope=vm.createContext({ChromeUtils:{importESModule:()=>({ThreadPaneColumns:{getCustomColumns:()=>[],addCustomColumn:(id,column)=>columns.set(id,column),removeCustomColumn(){}}})},gmText:s=>s,Ci:{nsMsgFolderFlags:{Inbox:1},nsMsgViewSortType:{byDate:18},nsMsgViewFlagsType:{kThreadedDisplay:1}},thunderGSnooze:service});
  vm.runInContext(fs.readFileSync('thunder-g/snooze-order.js','utf8'),scope);
  const order=scope.createSnoozeOrder();order.attach(win);
  returned='100';service.orderRevision++;timers[0]();
  assert.equal(columns.get('gmSnoozeThreadOrder').sortCallback(header),100,'sorting reads stable database threads rather than querying the view while it sorts');
  returned='300';service.orderRevision++;timers[0]();
  assert.deepEqual(calls.slice(-2),['dateCol','gmSnoozeThreadOrder'],'same native column must invalidate cached keys after a late stamp');
  assert.equal(columns.get('gmSnoozeThreadOrder').sortCallback(header),300);
  const count=calls.length;timers[0]();assert.equal(calls.length,count,'unchanged views do not repeatedly sort');
  view.rowCount++;timers[0]();observer();assert.equal(calls.length,count,'expanding a native thread or unchanged journal updates do not sort and collapse it');
  const beforeDrag=calls.length;tree.dragging=true;service.orderRevision++;timers[0]();observer();assert.equal(calls.length,beforeDrag,'mouse dragging keeps native row indices stable');
  tree.dragging=false;tree.inKeyDnD='rethread';timers[0]();assert.equal(calls.length,beforeDrag,'Betterbird keyboard rethreading is not interrupted');
  tree.inKeyDnD=false;timers[0]();assert.ok(calls.length>beforeDrag,'deferred ordering resumes after the native operation');order.close();
});

test('closing an older runtime leaves replacement sort handlers and active views intact',()=>{
 const columns=new Map();const native={getCustomColumns:()=>[...columns].map(([id,column])=>({id,handler:{getSortLongForRow:column.sortCallback}})),addCustomColumn:(id,column)=>columns.set(id,column),removeCustomColumn:id=>columns.delete(id)};
 const scope=vm.createContext({ChromeUtils:{importESModule:()=>({ThreadPaneColumns:native})},gmText:s=>s});
 vm.runInContext(fs.readFileSync('thunder-g/snooze-order.js','utf8'),scope);
 const old=scope.createSnoozeOrder(),current=scope.createSnoozeOrder();const handler=columns.get('gmSnoozeThreadOrder');old.close();
 assert.equal(columns.size,2);assert.equal(columns.get('gmSnoozeThreadOrder'),handler);current.close();assert.equal(columns.size,0);
});
