const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const scope=require('./localization-context.cjs').createContext({Ci:{nsMsgViewCommandType:{expandAll:1}}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/pagination.js'),'utf8'),scope);
test('native page bounds handle empty, short last pages and deletion on last page',()=>{
  const bounds=(...args)=>JSON.parse(JSON.stringify(scope.nativePageBounds(...args)));
  assert.deepEqual(bounds(0,25,0),{page:0,pages:1,start:0,end:0});
  assert.deepEqual(bounds(1014,100,10),{page:10,pages:11,start:1000,end:1014});
  assert.deepEqual(bounds(20,25,9),{page:0,pages:1,start:0,end:20});
});
test('zoom delegates Ctrl/Cmd plus/minus/reset to native controls and leaves text entry alone',()=>{
  const target={closest:()=>null};
  for(const modifier of ['ctrlKey','metaKey']) {
    assert.equal(scope.mailZoomAction({[modifier]:true,key:'+',target}),'increaseSize');
    assert.equal(scope.mailZoomAction({[modifier]:true,key:'=',target}),'increaseSize');
    assert.equal(scope.mailZoomAction({[modifier]:true,key:'-',target}),'reduceSize');
    assert.equal(scope.mailZoomAction({[modifier]:true,key:'0',target}),'resetSize');
  }
  assert.equal(scope.mailZoomAction({key:'+',target}),null);
  assert.equal(scope.mailZoomAction({ctrlKey:true,key:'+',target:{closest:()=>({})}}),null);
  assert.equal(scope.mailZoomAction({ctrlKey:true,key:'+',defaultPrevented:true,target}),null);
  let listener,removed,zoomed=0,stopped=0;
  const win={document:{getElementById:()=>null},addEventListener(name,fn){listener=fn},removeEventListener(name,fn){removed=fn}};
  const zoom=scope.installMailZoom(win,{increaseSize(){zoomed++}});
  listener({ctrlKey:true,key:'+',target,preventDefault(){},stopImmediatePropagation(){stopped++}});
  assert.equal(zoomed,1);assert.equal(stopped,1);zoom.close();assert.equal(removed,listener);
});
for (const collapsed of [false,true,'short-last','threaded']) test(`native pagination retains native rows and reaches every message (collapsed threads: ${collapsed})`,()=>{
  function node() {
    const attrs=new Set(),events={};
    let text='',textWrites=0;
    return {events,children:[],style:{},hidden:false,
      get textContent(){return text},set textContent(value){text=value;textWrites++},get textWrites(){return textWrites},
      setAttribute(name){attrs.add(name)},toggleAttribute(name,on){on?attrs.add(name):attrs.delete(name)},
      removeAttribute(name){attrs.delete(name)},hasAttribute:name=>attrs.has(name),
      addEventListener(name,fn){events[name]=fn},removeEventListener(name,fn){if(events[name]===fn)delete events[name]},
      append(...items){this.children.push(...items)},before(item){this.bar=item},remove(){this.removed=true}};
  }
  const total=collapsed==='short-last'?219:collapsed?218:53;
  const threaded=collapsed==='threaded',hasThread=collapsed===true || threaded;
  const rows=Array.from({length:total},(_,index)=>Object.assign(node(),{index}));
  const tree=node();tree.getBoundingClientRect=()=>({top:0,left:260,right:1000});tree.parentNode={};tree.clientHeight=200;tree.scrollTop=0;tree._rowElementClass={ROW_HEIGHT:20};
  if(collapsed==='short-last') {
    tree.clientHeight=900;tree._rowElementClass.ROW_HEIGHT=34;
    let actualTop=0;
    Object.defineProperty(tree,'scrollTop',{get:()=>actualTop,set(value){
      const tail=tree.children[0],tableEnd=nativeView.rowCount*tree._rowElementClass.ROW_HEIGHT+20;
      const tailEnd=tail.hidden?0:parseFloat(tail.style.top || 0)+parseFloat(tail.style.height || 0);
      actualTop=Math.max(0,Math.min(value,Math.max(tableEnd,tailEnd)-tree.clientHeight));
    }});
  }
  const scrolls=[];tree.scrollTo=options=>{scrolls.push({...options,tailHeight:tree.children[0].style.height});assert.equal(options.behavior,'instant');tree.scrollTop=options.top};
  tree.dispatchEvent=event=>tree.events?.[event.type]?.(event);
  tree.currentIndex=-1;tree.selectedIndices=[];
  tree.querySelectorAll=selector=>selector==='[data-gm-outside-page]'?rows.filter(r=>r.hasAttribute('data-gm-outside-page')):rows;
  let expansions=0;
  const nativeView={rowCount:hasThread?195:total,numMsgsInView:total,viewFlags:threaded?1:0,getFlagsAt:()=>0,
    getLevel:index=>threaded && nativeView.rowCount===total && index>0 && index<24?1:0,
    doCommand(){expansions++;throw Error('pagination must never expand all threads')},
    isContainer:index=>hasThread && index===0,
    isContainerOpen:()=>nativeView.rowCount===total,
    getThreadContainingIndex:()=>({numChildren:24}),
    toggleOpenState(index){assert.equal(index,0);this.rowCount=this.rowCount===total?195:total}};tree.view=nativeView;
  const frames=[];let mutation,resize;
  const quickFilter=node();quickFilter.after=bar=>{quickFilter.pagination=bar;tree.bar=bar};
  const root=node();const head=node(),doc={documentElement:root,getElementById:id=>id==='threadPaneQuickFilterButton'?quickFilter:tree,querySelector:()=>({getBoundingClientRect:()=>({height:20})}),createElement:node,head};
  const win={CustomEvent:class{constructor(type){this.type=type}},document:doc,gDBView:nativeView,addEventListener(){},removeEventListener(){},
    requestAnimationFrame(fn){frames.push(fn);return frames.length},cancelAnimationFrame(){},
    MutationObserver:class{constructor(fn){mutation=(records=[{type:'childList',target:tree}])=>fn(records)}observe(){}disconnect(){}},
    ResizeObserver:class{constructor(fn){resize=fn}observe(){}disconnect(){}}};
  const selections=[];
  const pages=scope.installNativePagination(win,{selectIndices(indices){tree.selectedIndices=indices;selections.push(indices)}});
  assert.equal(quickFilter.pagination,tree.bar,'pager is placed directly beside Quick Filter');
  if(collapsed==='short-last') {
    pages.setSize(100);
    assert.equal(tree.children[0].style.height,'0px','full pages need no extra blank scroll room');
    tree.bar.children[2].events.click();tree.bar.children[2].events.click();
    assert.equal(tree.bar.children[0].textContent,'201–219 of 219');
    assert.equal(scrolls.length,3,'initial positioning and each turn make exactly one instant jump');
    assert.equal(scrolls.at(-1).tailHeight,'234px','short-page extent exists before the only scroll request');
    assert.equal(tree.hasAttribute('data-gm-paginated'),true);
    assert.match(head.children[0].textContent,/scroll-behavior:auto !important/);
    assert.match(head.children[0].textContent,/#threadTree tr\[data-gm-outside-page\] \{ opacity:0 !important;/);
    assert.match(head.children[0].textContent,/#threadTree tr\[data-gm-outside-page\] \* \{\s*visibility:hidden !important; pointer-events:none !important;/);
    assert.equal(tree.scrollTop,200*34,'browser scroll clamp must still allow the first of the 19 rows to reach the header');
    assert.equal(rows.filter(row=>!row.hasAttribute('data-gm-outside-page')).length,19);
    assert.equal(tree.children[0].style.height,'234px','only the missing scroll height is added, never a full viewport');
    assert.equal(root.children[0].hidden,true,'a final page fitting the viewport has no scrollbar');
    assert.equal(root.children[0].children[0].style.height,'646px','scroll extent counts only the 19 displayed messages');
    tree.scrollTop=999999;tree.events.scroll();frames.shift()();
    assert.equal(tree.scrollTop,200*34,'no blank scrolling past the short final page');
    tree.clientHeight=500;resize();frames.shift()();
    assert.equal(tree.children[0].style.height,'0px','no padding when all 19 rows exceed the viewport');
    assert.equal(tree.scrollTop,200*34);
    tree._rowElementClass.ROW_HEIGHT=20;resize();frames.shift()();
    assert.equal(tree.scrollTop,200*20,'density changes keep the final page aligned');
    assert.equal(tree.children[0].style.height,'100px');
    pages.setSize(0);assert.equal(tree.hasAttribute('data-gm-paginated'),false,'continuous native scrolling is restored');assert.equal(tree.children[0].hidden,true);pages.close();return;
  }
  if(threaded) {
    pages.setSize(100);
    assert.equal(tree.bar.children[0].textContent,'1–100 of 195');
    assert.equal(rows[99].hasAttribute('data-gm-outside-page'),false);
    assert.equal(rows[100].hasAttribute('data-gm-outside-page'),true);
    tree.events.keydown({ctrlKey:true,key:'a',target:{closest:()=>null},preventDefault(){},stopImmediatePropagation(){}});
    assert.equal(nativeView.rowCount,218);
    assert.equal(selections.at(-1).length,123,'100 conversations include all 24 messages in the first thread');
    while(frames.length)frames.shift()();
    assert.equal(tree.bar.children[0].textContent,'1–100 of 195','expanding for selection preserves conversation totals');
    tree.bar.children[2].events.click();
    assert.equal(tree.bar.children[0].textContent,'101–195 of 195');
    assert.equal(rows[122].hasAttribute('data-gm-outside-page'),true);
    assert.equal(rows[123].hasAttribute('data-gm-outside-page'),false);
    assert.equal(tree.scrollTop,123*20);
    pages.close();return;
  }
  if(collapsed) {
    pages.setSize(100);
    assert.equal(expansions,0);
    nativeView.isContainer=index=>index===150;
    tree.events.rowcountchange();frames.shift()();
    assert.equal(rows[99].hasAttribute('data-gm-outside-page'),false,'native structure events refresh membership even when net row counts are unchanged');
    nativeView.isContainer=index=>index===0;
    tree.events.collapsed();frames.shift()();
    assert.equal(rows[99].hasAttribute('data-gm-outside-page'),true,'a collapsed thread consumes its hidden messages in page bounds');
    const reached=[];
    for(let page=0;page<3;page++) {
      assert.equal(tree.bar.children[0].textContent,`${page*100+1}–${Math.min(total,(page+1)*100)} of 218`);
      const spans=scope.nativePageRows(nativeView).spans;
      for(const row of rows.filter(row=>!row.hasAttribute('data-gm-outside-page')))
        for(let message=spans[row.index].start;message<spans[row.index].end;message++)reached.push(message);
      if(page<2) tree.bar.children[2].events.click();
    }
    assert.deepEqual(reached,Array.from({length:218},(_,i)=>i),'all 218 messages occur exactly once across pages');
    assert.equal(tree.bar.children[2].disabled,true);
    mutation();frames.shift()();
    assert.equal(nativeView.rowCount,195,'repaint preserves collapsed threads');
    assert.equal(tree.bar.children[0].textContent,'201–218 of 218');
    nativeView.toggleOpenState(0);mutation();frames.shift()();assert.equal(nativeView.rowCount,218);
    nativeView.toggleOpenState(0);mutation();frames.shift()();assert.equal(nativeView.rowCount,195,'a thread can be closed again after reopening');
    tree.bar.children[1].events.click();tree.bar.children[1].events.click();
    tree.events.keydown({ctrlKey:true,key:'a',target:{closest:()=>null},preventDefault(){},stopImmediatePropagation(){}});
    assert.equal(selections.at(-1).length,100,'bulk selection counts exact page messages even when a thread was collapsed');
    assert.equal(nativeView.rowCount,218,'explicit page selection reveals the affected thread, not every thread');
    pages.setSize(0);
    assert.equal(expansions,0,'pagination never expands all threads');
    pages.close();
    for(const name of ['rowcountchange','expanded','collapsed'])assert.equal(tree.events[name],undefined);
    return;
  }
  const originalRows=rows.slice();pages.setSize(25);
  const writes=tree.bar.children[0].textWrites;
  const cell={closest:()=>null};
  for(let i=0;i<200;i++)mutation([{type:'childList',target:cell}]);
  assert.equal(frames.length,0,'cell text, previews and tag chips must not schedule page painting');
  tree.events.scroll();frames.shift()();
  assert.equal(tree.bar.children[0].textWrites,writes,'scrolling must not rewrite the live page announcement');
  mutation([{type:'attributes',attributeName:'aria-rowindex',target:rows[0]}]);
  assert.equal(frames.length,1,'virtual row recycling still updates page masks');frames.shift()();
  assert.equal(tree.view,nativeView);assert.equal(rows[0],originalRows[0]);assert.equal(tree.style.cssText,undefined);
  assert.equal(tree._rowElementClass.ROW_HEIGHT,20,'native row height is never overwritten');
  assert.equal(rows[24].hasAttribute('data-gm-outside-page'),false);assert.equal(rows[25].hasAttribute('data-gm-outside-page'),true);
  tree.bar.children[2].events.click();assert.equal(tree.scrollTop,500);
  const scrollbar=root.children[0];
  assert.equal(scrollbar.children[0].style.height,'500px','scrollbar extent is 25 messages, not the 53-message inbox');
  assert.equal(scrollbar.style.height,'180px');assert.equal(scrollbar.scrollTop || 0,0,'each page starts at the top of its own scrollbar');
  scrollbar.scrollTop=320;scrollbar.events.scroll();assert.equal(tree.scrollTop,820,'dragging to page bottom maps onto native global row indices');
  frames.shift()();assert.equal(scrollbar.scrollTop,320);
  tree.clientHeight=0;resize();frames.shift()();assert.equal(scrollbar.hidden,true,'opening a conversation must hide the page scrollbar with the list');
  tree.clientHeight=200;resize();frames.shift()();assert.equal(scrollbar.hidden,false,'returning to the list restores its page scrollbar');
  tree.bar.children[1].events.click();tree.bar.children[2].events.click();assert.equal(scrollbar.scrollTop,0);
  assert.equal(rows[0].hasAttribute('data-gm-outside-page'),true);assert.equal(rows[25].hasAttribute('data-gm-outside-page'),false);
  tree.scrollTop=0;tree.events.scroll();frames.shift()();assert.equal(tree.scrollTop,500,'cannot scroll into the previous page');
  tree._rowElementClass.ROW_HEIGHT=32;resize();frames.shift()();assert.equal(tree.scrollTop,800,'density/zoom uses new native metrics');
  tree.events.keydown({ctrlKey:true,key:'a',target:{closest:()=>null},preventDefault(){},stopImmediatePropagation(){}});
  assert.equal(selections.at(-1).length,25);assert.equal(selections.at(-1)[0],25);assert.equal(selections.at(-1)[24],49);
  tree.bar.children[2].events.click();assert.equal(tree.scrollTop,1600);assert.equal(tree.bar.children[2].disabled,true);
  nativeView.rowCount=20;nativeView.numMsgsInView=20;mutation();frames.shift()();assert.equal(tree.bar.children[1].disabled,true);
  pages.setSize(0);assert.equal(rows.some(r=>r.hasAttribute('data-gm-outside-page')),false);
  assert.equal(tree.view,nativeView);assert.equal(tree._rowElementClass.ROW_HEIGHT,32);
  pages.close();assert.equal(tree.bar.removed,true);
});

test('collapsed sort groups spanning pages remain reachable with stable message totals',()=>{
 const view={viewFlags:0x40,rowCount:2,getFlagsAt:()=>0,isContainer:i=>i===0,isContainerOpen:()=>false,getThreadContainingIndex:()=>({numChildren:150})};
 const rows=scope.nativePageRows(view);
 assert.equal(rows.total,151);
 const first=scope.nativeMessagePage(rows,100,0),last=scope.nativeMessagePage(rows,100,1);
 assert.equal(first.rowStart,0);assert.equal(first.rowEnd,1);
 assert.equal(last.rowStart,0,'a collapsed representative remains reachable on every page containing its messages');assert.equal(last.rowEnd,2);
 assert.equal(last.start,100);assert.equal(last.end,151);
});
test('native group headers do not inflate message totals and stay with the first visible message',()=>{
 const view={rowCount:4,getFlagsAt:i=>i===0?0x20000000:0,isContainer:i=>i===0,isContainerOpen:()=>true};
 const rows=scope.nativePageRows(view);assert.equal(rows.total,3);
 const first=scope.nativeMessagePage(rows,2,0);assert.equal(first.rowStart,0);assert.equal(first.rowEnd,3);
 const last=scope.nativeMessagePage(rows,2,1);assert.equal(last.rowStart,3);assert.equal(last.rowEnd,4);
});

test('zoom shortcuts use the active reader and return to UI sizing only in the inbox',()=>{
  const events={},calls=[];let reading=true,tab={mode:{name:'mail3PaneTab'}};
  const win={document:{getElementById:()=>({currentTabInfo:tab})},
    addEventListener(name,fn){events[name]=fn},removeEventListener(name){delete events[name]}};
  const controller=scope.installMailZoom(win,{increaseSize(){calls.push('UI+')}},action=>{
    if(!reading)return false;calls.push(action);return true;
  });
  const press=key=>{const event={ctrlKey:true,key,target:{closest:()=>null},preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true}};events.keydown(event);return event};
  for(const key of ['+','-','0']){const event=press(key);assert.equal(event.prevented,true);assert.equal(event.stopped,true);}
  assert.deepEqual(calls,['increaseSize','reduceSize','resetSize']);
  reading=false;press('+');assert.equal(calls.at(-1),'UI+');
  reading=true;tab.mode.name='contentTab';assert.equal(press('+').prevented,undefined,'other tabs keep their native shortcuts');
  controller.close();assert.deepEqual(events,{});
});

test('native content zoom always passes an explicit message browser, including separate message windows',()=>{
  const pane={},calls=[],manager={enlarge:browser=>calls.push(['+',browser]),reduce:browser=>calls.push(['-',browser]),reset:browser=>calls.push(['0',browser])};
  for(const win of [{ZoomManager:manager},{top:{ZoomManager:manager}}]){
    for(const action of ['increaseSize','reduceSize','resetSize'])assert.equal(scope.zoomNativeMessage(win,pane,action),true);
  }
  assert.deepEqual(calls,[['+',pane],['-',pane],['0',pane],['+',pane],['-',pane],['0',pane]]);
  assert.equal(scope.zoomNativeMessage({ZoomManager:manager},null,'increaseSize'),false);
  assert.equal(scope.zoomNativeMessage({},pane,'increaseSize'),false);
  assert.equal(calls.length,6,'loading or missing browsers cannot zoom a default UI browser');
});


test('threaded pages count a 100-message conversation once and never split expanded descendants',()=>{
 const makeView=open=>({viewFlags:1,rowCount:open?103:4,getFlagsAt:()=>0,
  getLevel:i=>open && i>=2 && i<=100?(i===50?2:1):0,
  isContainer:i=>i===1,isContainerOpen:()=>open,getThreadContainingIndex:()=>({numChildren:100})});
 for(const open of [false,true]){
  const rows=scope.nativePageRows(makeView(open));assert.equal(rows.total,4);
  const first=scope.nativeMessagePage(rows,2,0),last=scope.nativeMessagePage(rows,2,1);
  assert.equal(first.rowStart,0);assert.equal(first.rowEnd,open?101:2);
  assert.equal(last.rowStart,first.rowEnd);assert.equal(last.rowEnd,open?103:4);
  assert.equal(first.pages,2);assert.equal(last.start,2);assert.equal(last.end,4);
 }
});
test('flat and grouped views count messages while threaded totals stay independent of thread size',()=>{
 const view={viewFlags:1,rowCount:3,getFlagsAt:()=>0,getLevel:()=>0,
  isContainer:()=>true,isContainerOpen:()=>false,getThreadContainingIndex:()=>({numChildren:100})};
 assert.equal(scope.nativePageRows(view).total,3);
 view.viewFlags=0;view.isContainer=()=>false;
 assert.equal(scope.nativePageRows(view).total,3);
 view.viewFlags=0x41;view.isContainer=i=>i===0;view.getFlagsAt=i=>i===0?0x20000000:0;
 assert.equal(scope.nativePageRows(view).total,101,'a collapsed sort group counts its messages, not one conversation');
});
