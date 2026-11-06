/* Page boundaries on the original virtual tree; indices and renderer stay native. */
function nativePageBounds(total, size, page) {
  const pages=Math.max(1,Math.ceil(total/size));
  page=Math.min(Math.max(0,page),pages-1);
  return {page,pages,start:page*size,end:Math.min(total,(page+1)*size)};
}
// Threaded pages count conversations, keeping every expanded descendant on the
// same page as its root. Flat/grouped views count messages; geometry counts rows.
function nativePageRows(view) {
  const spans=[];let total=0;
  const threaded=!!(view?.viewFlags&1) && !(view.viewFlags&0x40);
  let threadSpan=null;
  for(let index=0;index<(view?.rowCount || 0);index++) {
    const dummy=!!(view.getFlagsAt(index)&0x20000000);
    if(threaded && !dummy) {
      if(!threadSpan || view.getLevel(index)===0) {
        threadSpan={start:total,end:total+1};total++;
      }
      spans.push({...threadSpan});
      continue;
    }
    let count=dummy?0:1;
    if(view.isContainer?.(index) && !view.isContainerOpen(index)) {
      try {
        const header=view.getMsgHdrAt?.(index);
        const thread=view.getThreadContainingIndex?.(index) || header?.folder.msgDatabase.getThreadContainingMsgHdr(header);
        count=Math.max(count,(thread?.numChildren || 1)-(dummy?1:0));
      }catch(_){/* Keep a transiently unavailable row reachable. */}
    }
    spans.push({start:total,end:total+count});total+=count;
  }
  return {spans,total};
}
function nativeMessagePage(rows,size,page) {
  const range=nativePageBounds(rows.total,size,page),spans=rows.spans;
  let start=0,end=spans.length;
  while(start<end){const mid=(start+end)>>1;if(spans[mid].end<=range.start)start=mid+1;else end=mid;}
  let rowStart=start;
  // Include a native group header when its first message begins this page.
  while(rowStart>0 && spans[rowStart-1].start===range.start && spans[rowStart-1].end===range.start)rowStart--;
  start=rowStart;end=spans.length;
  while(start<end){const mid=(start+end)>>1;if(spans[mid].start<range.end)start=mid+1;else end=mid;}
  return {...range,rowStart,rowEnd:start};
}
function mailZoomAction(event) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.defaultPrevented || event.isComposing ||
      event.target?.isContentEditable || event.target?.closest?.('input,textarea,select,[contenteditable="true"],[role="textbox"]')) return null;
  if (event.key === '+' || event.key === '=' || event.code === 'NumpadAdd') return 'increaseSize';
  if (event.key === '-' || event.code === 'NumpadSubtract') return 'reduceSize';
  if (event.key === '0' || event.code === 'Numpad0') return 'resetSize';
  return null;
}
function zoomNativeMessage(win, browser, action) {
  const manager=win.top?.ZoomManager || win.ZoomManager;
  const method={increaseSize:'enlarge',reduceSize:'reduce',resetSize:'reset'}[action];
  if(!browser || !method || !manager)return false;
  manager[method](browser);
  return true;
}
function installMailZoom(win, fontSize, zoomContent = null) {
  function keydown(event) {
    const tab=win.document.getElementById('tabmail')?.currentTabInfo;
    if (tab && tab.mode?.name !== 'mail3PaneTab') return;
    const action=mailZoomAction(event);
    if (!action) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (!zoomContent?.(action)) fontSize[action]();
  }
  win.addEventListener('keydown',keydown,true);
  return {close(){win.removeEventListener('keydown',keydown,true)}};
}
function installNativePagination(win, reader) {
  const doc=win.document, tree=doc.getElementById('threadTree');
  if (!tree?.parentNode) return {setSize(){},close(){}};
  let size=0,page=0,frame=null,closed=false,lastView=null,rowMap=null,shownRange='';
  const bar=doc.createElement('div');bar.className='gm-native-pagination';bar.hidden=true;
  bar.setAttribute('role','navigation');gmBindAttribute(bar, 'aria-label', () => gmText("Message pages"));
  const count=doc.createElement('span');count.setAttribute('aria-live','polite');
  const previous=doc.createElement('button'),next=doc.createElement('button');
  for(const [button,label,glyph] of [[previous,gmText("Previous page"),'‹'],[next,gmText("Next page"),'›']]) {
    button.type='button';button.title=label;button.setAttribute('aria-label',label);button.textContent=glyph;
  }
  bar.append(count,previous,next);
  const quickFilter=doc.getElementById('threadPaneQuickFilterButton');
  if(quickFilter) quickFilter.after(bar);
  else tree.before(bar);
  // Extra scroll room allows a short final page to begin beneath the native header.
  const tail=doc.createElement('div');tail.setAttribute('aria-hidden','true');tail.hidden=true;
  tail.style.cssText='position:absolute;inset-inline-start:0;inline-size:1px;pointer-events:none;';tree.append(tail);
  // Keep native global row indices, but expose a scrollbar whose extent is
  // only the current page. The native tree still renders and selects messages.
  const pageScroll=doc.createElement('div');pageScroll.className='gm-page-scroll';pageScroll.hidden=true;
  gmBindAttribute(pageScroll, 'aria-label', () => gmText("Scroll current message page"));
  const pageExtent=doc.createElement('div');pageExtent.style.inlineSize='1px';pageScroll.append(pageExtent);
  doc.documentElement.append(pageScroll);
  const style=doc.createElement('style');style.textContent=`
    .gm-native-pagination[hidden] { display:none !important; }
    .gm-native-pagination { display:inline-flex !important; justify-content:flex-end; align-items:center;
      gap:.25em; padding:0; margin-inline-start:.5em; flex:0 0 auto !important;
      inline-size:auto !important; color:inherit; font:inherit; white-space:nowrap; }
    .gm-native-pagination > span { margin-inline-end:.35em; font-size:.9em; }
    .gm-native-pagination > button { appearance:none !important; box-sizing:border-box !important;
      display:inline-flex !important; align-items:center; justify-content:center;
      flex:0 0 2em !important; inline-size:2em !important; min-inline-size:2em !important; max-inline-size:2em !important;
      block-size:2em !important; min-block-size:2em !important; max-block-size:2em !important;
      padding:0 !important; margin:0 !important; font:inherit !important; line-height:1 !important;
      background:transparent; color:inherit; border:0 !important; border-radius:50% !important;
      box-shadow:none !important; cursor:pointer; }
    .gm-native-pagination > button:hover:enabled { background:var(--treeitem-background-hover,#e9eef6); }
    .gm-native-pagination > button:focus-visible { outline:2px solid var(--focus-outline-color,#1a73e8); outline-offset:-2px; }
    .gm-native-pagination > button:disabled { opacity:.35;cursor:default;background:transparent; }
    #threadTree[data-gm-paginated] { scroll-behavior:auto !important; overflow-anchor:none !important; scrollbar-width:none !important; }
    .gm-page-scroll { position:fixed; z-index:2; overflow-y:scroll; overflow-x:hidden;
      scrollbar-width:auto; scrollbar-color:auto; width:16px; }
    .gm-page-scroll[hidden] { display:none !important; }
    /* Native replied/new icons explicitly restore visibility. Hide the whole
       painted subtree while retaining the virtual tree's row geometry. */
    #threadTree tr[data-gm-outside-page] { opacity:0 !important; }
    #threadTree tr[data-gm-outside-page],
    #threadTree tr[data-gm-outside-page] * {
      visibility:hidden !important; pointer-events:none !important;
    }
  `;doc.head.append(style);
  function rows(){
    const view=win.gDBView;
    if(!rowMap || rowMap.view!==view || rowMap.count!==(view?.rowCount || 0) || rowMap.messages!==view?.numMsgsInView || rowMap.flags!==view?.viewFlags)
      rowMap={...nativePageRows(view),view,count:view?.rowCount || 0,messages:view?.numMsgsInView,flags:view?.viewFlags};
    return rowMap;
  }
  function bounds(){return nativeMessagePage(rows(),size,page)}
  tree._gmPageSelectionBounds=()=>size?bounds():null;
  function rowHeight(){return tree._rowElementClass?.ROW_HEIGHT || tree.getRowAtIndex?.(0)?.getBoundingClientRect().height || 0}
  function setStyle(node,name,value){if(node.style[name]!==value)node.style[name]=value}
  function paint(alignStart=false) {
    if (!size || closed) return;
    if (lastView!==win.gDBView) {lastView=win.gDBView;page=0;alignStart=true}
    const range=bounds();page=range.page;
    const total=rows().total;
    const rangeKey=`${range.start},${range.end},${total}`;
    if(shownRange!==rangeKey) {
      shownRange=rangeKey;
      tree.dispatchEvent(new win.CustomEvent('gm-page-changed'));
      gmBindValue(count, "textContent", () => total?gmText("$1–$2 of $3", (range.start+1).toLocaleString(gmLocale()), range.end.toLocaleString(gmLocale()), total.toLocaleString(gmLocale())):gmText("0 of 0"));
    }
    previous.disabled=page===0;next.disabled=page===range.pages-1;
    const height=rowHeight();
    if(height && tree.clientHeight) {
      const header=doc.querySelector('#threadTree thead')?.getBoundingClientRect().height || 0;
      // threadTree is a ROW flex container: a normal child sits beside the
      // table and adds no vertical scroll room. Extend the scroll area below
      // the native table only by the deficit needed to align this page.
      const tableEnd=(win.gDBView?.rowCount || 0)*height+header;
      setStyle(tail,'top',tableEnd+'px');
      setStyle(tail,'height',Math.max(0,range.rowStart*height+tree.clientHeight-tableEnd)+'px');
      const min=range.rowStart*height,max=Math.max(min,range.rowEnd*height+header-tree.clientHeight);
      const top=alignStart?min:Math.min(Math.max(tree.scrollTop,min),max);
      const rect=tree.getBoundingClientRect();
      const viewport=Math.max(0,tree.clientHeight-header);
      pageScroll.hidden=max===min || tree.checkVisibility?.()===false;
      setStyle(pageScroll,'top',(rect.top+header)+'px');
      setStyle(pageScroll,'left',(doc.documentElement.dir==='rtl'?rect.left:rect.right-16)+'px');
      setStyle(pageScroll,'height',viewport+'px');
      setStyle(pageExtent,'height',((range.rowEnd-range.rowStart)*height)+'px');
      if(Math.abs((pageScroll.scrollTop || 0)-(top-min))>.5) pageScroll.scrollTop=top-min;
      // A page change is a jump, never a smooth scroll through hidden rows.
      // Compute the short-page tail first, then move once; cancel any native
      // animation that was already running even when the destination matches.
      if(alignStart || Math.abs(tree.scrollTop-top)>.5) tree.scrollTo({top,behavior:'instant'});
    }else{
      pageScroll.hidden=true;
    }
    for(const row of tree.querySelectorAll('tr.table-layout, tr.card-layout')) {
      row.toggleAttribute('data-gm-outside-page',row.index<range.rowStart || row.index>=range.rowEnd);
    }
  }
  function scrollPage(){
    if(!size || closed || pageScroll.hidden)return;
    const range=bounds(),height=rowHeight();
    tree.scrollTo({top:range.rowStart*height+pageScroll.scrollTop,behavior:'instant'});
    schedule();
  }
  pageScroll.addEventListener('scroll',scrollPage);
  win.addEventListener('resize',schedule);
  function schedule(){
    if (!size || closed || frame!==null) return;
    frame=win.requestAnimationFrame(()=>{frame=null;paint()});
  }
  function turn(direction) {
    if(!size) return;
    const range=bounds(),target=page+direction;
    if(target<0 || target>=range.pages) return;
    reader.selectIndices([]);page=target;
    paint(true);
  }
  const shortcutPage=event=>turn(event.detail);tree.addEventListener('gm-shortcut-page',shortcutPage);
  previous.addEventListener('click',()=>turn(-1));next.addEventListener('click',()=>turn(1));
  function viewChanged(){lastView=null;rowMap=null;page=0;schedule()}
  function structureChanged(){rowMap=null;schedule()}
  function selectionChanged(){
    if(size) {
      const index=tree.currentIndex;
      // Native keyboard/reader navigation may move to a message on another page.
      if(Number.isInteger(index) && index>=0 && (tree.selectedIndices || []).includes(index)) {
        const range=bounds(),span=rows().spans[index];
        if(span && (index<range.rowStart || index>=range.rowEnd))page=Math.floor(span.start/size);
      }
    }
    schedule();
  }
  function selectPage(event){
    if(!size || !(event.type==='gm-select-page' || (event.type==='click'?event.target.closest('#selectColButton'):
      (event.ctrlKey || event.metaKey) && event.key?.toLowerCase()==='a' && !event.target?.closest?.('input,textarea')))) return;
    event.preventDefault();event.stopImmediatePropagation();
    let range=bounds();
    // Selecting a page is an explicit bulk action. Reveal only collapsed rows
    // touching it. Threaded page bounds retain all descendants of those threads;
    // grouped message views still enforce their individual message boundaries.
    for(let i=range.rowEnd-1;i>=range.rowStart;i--) {
      if(win.gDBView.isContainer?.(i) && !win.gDBView.isContainerOpen(i))win.gDBView.toggleOpenState(i);
    }
    rowMap=null;range=bounds();const indices=[];
    for(let i=range.rowStart;i<range.rowEnd;i++) {
      try {if(!(win.gDBView.getFlagsAt(i)&0x20000000)) indices.push(i)}catch(_){}
    }
    const selected=new Set(tree.selectedIndices || []);
    if(event.type==='gm-select-page')reader.selectIndices(indices.filter(index=>inboxSelectionMatches(win.gDBView.getMsgHdrAt(index),event.detail.mode)));
    else reader.selectIndices(indices.every(i=>selected.has(i))?[]:indices);
    schedule();
  }
  const observer=new win.MutationObserver(records=>{
    // Pagination depends on row membership/indices, not changes inside a cell.
    if(records.some(record=>record.type==='attributes' || record.target===tree ||
      record.target===tree.table || record.target===tree.table?.body || record.target.closest?.('thead')))schedule();
  });
  const resize=new win.ResizeObserver(schedule);
  tree.addEventListener('scroll',schedule);tree.addEventListener('viewchange',viewChanged);tree.addEventListener('select',selectionChanged);
  for(const name of ['rowcountchange','expanded','collapsed'])tree.addEventListener(name,structureChanged);
  tree.addEventListener('gm-select-page',selectPage);tree.addEventListener('click',selectPage,true);tree.addEventListener('keydown',selectPage,true);
  function clear(){
    observer.disconnect();resize.disconnect();
    if(frame!==null) win.cancelAnimationFrame(frame);frame=null;
    for(const row of tree.querySelectorAll('[data-gm-outside-page]')) row.removeAttribute('data-gm-outside-page');
    pageScroll.hidden=true;tail.hidden=true;tail.style.height='0px';tree.removeAttribute('data-gm-paginated');
  }
  return {
    setSize(value){
      clear();size=[25,50,100].includes(value)?value:0;page=0;lastView=null;bar.hidden=!size;
      if(size) {
        tail.hidden=false;tree.setAttribute('data-gm-paginated','');
        observer.observe(tree,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-rowindex']});
        resize.observe(tree);paint(true);
      }
    },
    close(){
      closed=true;tree.removeEventListener('gm-shortcut-page',shortcutPage);clear();delete tree._gmPageSelectionBounds;
      tree.removeEventListener('scroll',schedule);tree.removeEventListener('viewchange',viewChanged);tree.removeEventListener('select',selectionChanged);
      for(const name of ['rowcountchange','expanded','collapsed'])tree.removeEventListener(name,structureChanged);
      tree.removeEventListener('gm-select-page',selectPage);tree.removeEventListener('click',selectPage,true);tree.removeEventListener('keydown',selectPage,true);
      win.removeEventListener('resize',schedule);pageScroll.removeEventListener('scroll',scrollPage);
      bar.remove();tail.remove();pageScroll.remove();style.remove();
    }
  };
}
