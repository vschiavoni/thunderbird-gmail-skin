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
  assert.equal(columns.has('gmSnoozeOrder'),false,'flat handler is not registered until it is needed');
  win.gDBView.viewFlags=0;tasks.get(1)();assert.equal(win.gDBView.curCustomColumn,'gmSnoozeOrder');
  assert.equal(columns.get('gmSnoozeOrder').sortCallback(a),10);
  win.gDBView.sortType=19;win.gDBView.curCustomColumn='';observer();assert.equal(win.gDBView.sortType,19,'sender sort stays native');
  win.gDBView.sortType=18;observer();assert.equal(win.gDBView.curCustomColumn,'gmSnoozeOrder');
  pane.close();assert.equal(win.gDBView.curCustomColumn,'');assert.equal(tasks.size,0);assert.equal(events.size,0);assert.equal(observer,null);
  order.close();assert.equal(columns.size,0);assert.equal(a.dateInSeconds,10);assert.equal(b.dateInSeconds,20);
});

test('ordinary Inbox starts without custom columns; snooze handlers are lazy and sort caches never outlive a sort',()=>{
  const columns=new Map(),timers=new Map();let changed,returned=0,threadReads=0,sorts=0;
  const a={dateInSeconds:10,getStringProperty:()=>''},b={dateInSeconds:20,getStringProperty:()=>returned?String(returned):''};
  const thread={numChildren:2,getChildHdrAt:i=>[a,b][i]},folder={URI:'inbox',flags:1,msgDatabase:{getThreadContainingMsgHdr(){threadReads++;return thread}}};
  a.folder=b.folder=folder;
  const native={getCustomColumns:()=>[...columns].map(([id])=>({id})),addCustomColumn:(id,p)=>columns.set(id,p),removeCustomColumn:id=>columns.delete(id)};
  const view={sortType:18,sortOrder:2,viewFlags:1,rowCount:2,getMsgHdrAt:i=>[a,b][i],getThreadContainingMsgHdr:()=>thread};
  const win={gFolder:folder,gDBView:view,gViewWrapper:{showGroupedBySort:false,sort(id){
    sorts++;view.curCustomColumn=id;view.sortType=34;
    if(id==='gmSnoozeThreadOrder'){
      const before=threadReads,callback=columns.get(id).sortCallback;
      for(let n=0;n<5;n++)assert.equal(callback(a),returned);
      assert.equal(threadReads-before,1,'repeated native comparisons reuse one thread traversal');
    }
  }},addEventListener(){},removeEventListener(){},setInterval:fn=>{timers.set(1,fn);return 1},clearInterval:id=>timers.delete(id)};
  const scope=vm.createContext({ChromeUtils:{importESModule:()=>({ThreadPaneColumns:native})},gmText:s=>s,
    Ci:{nsMsgFolderFlags:{Inbox:1},nsMsgViewSortType:{byDate:18},nsMsgViewFlagsType:{kThreadedDisplay:1}},thunderGSnooze:{subscribe(fn){changed=fn;return ()=>changed=null}}});
  vm.runInContext(fs.readFileSync('thunder-g/snooze-order.js','utf8'),scope);
  const order=scope.createSnoozeOrder();assert.equal(columns.size,0);
  const pane=order.attach(win);assert.equal(columns.size,0);assert.equal(sorts,0);
  returned=100;changed();assert.equal(columns.size,1);assert.equal(sorts,1);
  returned=200;assert.equal(columns.get('gmSnoozeThreadOrder').sortCallback(a),200,'native sorts outside refresh always see fresh values');
  changed();assert.equal(sorts,2,'next explicit sort builds a fresh cache');
  view.viewFlags=0;timers.get(1)();assert.equal(view.curCustomColumn,'gmSnoozeOrder');assert.equal(columns.size,2);
  pane.close();order.close();assert.equal(columns.size,0);assert.equal(timers.size,0);
});

test('saved custom sorts restore only their required handler before pane styling',()=>{
  const columns=new Map(),added=[];
  const native={getCustomColumns:()=>[],addCustomColumn(id,value){added.push(id);columns.set(id,value)},removeCustomColumn:id=>columns.delete(id)};
  const tab=()=>({chromeBrowser:{contentWindow:{gDBView:{curCustomColumn:'gmSnoozeThreadOrder'}}}});
  const scope=vm.createContext({ChromeUtils:{importESModule:()=>({ThreadPaneColumns:native})},gmText:s=>s,
    Services:{wm:{getEnumerator:()=>[{document:{getElementById:()=>({tabInfo:[tab(),tab()]})}}]}},
    Ci:{nsMsgFolderFlags:{Inbox:1},nsMsgViewSortType:{byDate:18},nsMsgViewFlagsType:{kThreadedDisplay:1}}});
  vm.runInContext(fs.readFileSync('thunder-g/snooze-order.js','utf8'),scope);
  const order=scope.createSnoozeOrder();assert.deepEqual(added,['gmSnoozeThreadOrder']);
  assert.equal(columns.has('gmSnoozeOrder'),false);order.close();assert.equal(columns.size,0);
});

test('transient native sort failures keep the pane attached and retry unchanged views without losing Snooze ordering',()=>{
 for(const fault of ['header','property','thread','column','sort']){
  let unavailable=true,tick,changed,warnings=0,sorts=0,unsubscribed=false;const events=new Map(),columns=new Map();
  const header={dateInSeconds:10,getStringProperty(){if(unavailable&&fault==='property')throw Error('header unavailable');return unavailable&&fault==='thread'?'':'100'}};
  const thread={numChildren:1,getChildHdrAt:()=>header};header.folder={msgDatabase:{getThreadContainingMsgHdr:()=>thread}};
  const native={getCustomColumns:()=>[...columns.keys()].map(id=>({id})),removeCustomColumn:id=>columns.delete(id),addCustomColumn(id,properties){if(unavailable&&fault==='column')throw Error('column unavailable');columns.set(id,properties)}};
  const win={gFolder:{URI:'inbox',flags:1},gDBView:{rowCount:1,sortType:18,sortOrder:2,viewFlags:1,getMsgHdrAt(){if(unavailable&&fault==='header')throw Error('summary unavailable');return header},getThreadContainingMsgHdr(){if(unavailable&&fault==='thread')throw Error('thread unavailable');return thread}},
   gViewWrapper:{showGroupedBySort:false,sort(id){if(unavailable&&fault==='sort')throw Error('sort unavailable');sorts++;win.gDBView.curCustomColumn=id==='dateCol'?'':id}},
   addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name),setInterval(fn){tick=fn;return 1},clearInterval(){tick=null}};
  const scope=vm.createContext({console:{warn(){warnings++}},ChromeUtils:{importESModule:()=>({ThreadPaneColumns:native})},gmText:s=>s,
   Ci:{nsMsgFolderFlags:{Inbox:1},nsMsgViewSortType:{byDate:18},nsMsgViewFlagsType:{kThreadedDisplay:1}},thunderGSnooze:{subscribe(fn){changed=fn;return ()=>{unsubscribed=true;changed=null}}}});
  vm.runInContext(fs.readFileSync('thunder-g/snooze-order.js','utf8'),scope);
  const order=scope.createSnoozeOrder();let pane;
  assert.doesNotThrow(()=>pane=order.attach(win),fault);
  assert.equal(sorts,0);tick();assert.equal(warnings,1,'persistent failures log once and retain retry');
  unavailable=false;tick();assert.equal(win.gDBView.curCustomColumn,'gmSnoozeThreadOrder');assert.equal(sorts,1,'same native view retries after its summary becomes available');
  assert.equal(columns.get('gmSnoozeThreadOrder').sortCallback(header),100,'returned-mail ordering survives recovery');
  changed();assert.equal(sorts,2,'Snooze notifications still refresh ordering');
  pane.close();assert.equal(tick,null);assert.equal(events.size,0);assert.equal(unsubscribed,true);assert.equal(win.gDBView.curCustomColumn,'');
  order.close();assert.equal(columns.size,0);assert.equal(header.dateInSeconds,10);
 }
});
