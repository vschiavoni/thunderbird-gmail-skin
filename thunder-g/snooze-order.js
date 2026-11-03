/* Effective Inbox dates leave RFC Date intact. Separate native sort handlers
 * preserve individual-message ordering when native threading is disabled. */
function createSnoozeOrder() {
  const {ThreadPaneColumns}=ChromeUtils.importESModule('chrome://messenger/content/ThreadPaneColumns.mjs');
  const messageColumn='gmSnoozeOrder',threadColumn='gmSnoozeThreadOrder';
  const columns=[messageColumn,threadColumn],panes=new Set();
  const value=header=>Math.max(header.dateInSeconds||0,Number(header.getStringProperty('thunderGSnoozeReturned'))||0);
  function threadValue(header){
    let date=value(header);
    try{const thread=header.folder.msgDatabase.getThreadContainingMsgHdr(header);for(let i=0;i<thread.numChildren;i++)date=Math.max(date,value(thread.getChildHdrAt(i)));}catch(_){}
    return Math.floor(date);
  }
  for(const id of columns){
    if(ThreadPaneColumns.getCustomColumns().some(column=>column.id===id))ThreadPaneColumns.removeCustomColumn(id);
    ThreadPaneColumns.addCustomColumn(id,{
    name:gmText(id===threadColumn?'Inbox thread order':'Inbox order'),hidden:true,sortable:true,
    textCallback:header=>new Date(value(header)*1000).toLocaleString(),
    sortCallback:id===threadColumn?threadValue:header=>Math.floor(value(header)),
    });
  }
  function attach(win){
    let busy=false,lastView=null,lastSignature='';
    function refresh(force=false){
      if(busy||!win.gDBView||!win.gViewWrapper)return;
      const view=win.gDBView,folder=win.gFolder;
      const signature=[folder?.URI,view.rowCount,view.viewFlags,view.sortType,view.sortOrder,view.curCustomColumn].join('|');
      if(!force&&view===lastView&&signature===lastSignature)return;
      lastView=view;lastSignature=signature;
      const inbox=!!(folder?.flags&Ci.nsMsgFolderFlags.Inbox);
      if(win.gViewWrapper.showGroupedBySort)return;
      const custom=columns.includes(view.curCustomColumn);
      if(!custom&&(!inbox||view.sortType!==Ci.nsMsgViewSortType.byDate))return;
      const threaded=!!(view.viewFlags&Ci.nsMsgViewFlagsType.kThreadedDisplay);
      if(!custom){
        let returned=false;
        for(let i=0;i<view.rowCount&&!returned;i++){
          const header=view.getMsgHdrAt(i);if(!header)continue;
          returned=!!header.getStringProperty('thunderGSnoozeReturned');
          if(!returned&&threaded){
            const thread=view.getThreadContainingMsgHdr(header);
            for(let child=0;child<thread.numChildren&&!returned;child++)returned=!!thread.getChildHdrAt(child).getStringProperty('thunderGSnoozeReturned');
          }
        }
        if(!returned)return;
      }
      busy=true;
      try{win.gViewWrapper.sort(inbox?(threaded?threadColumn:messageColumn):'dateCol',view.sortOrder);}
      finally{busy=false;}
    }
    const changed=()=>refresh(true);
    win.addEventListener('folderURIChanged',changed);
    const unsubscribe=thunderGSnooze.subscribe(changed);
    // Some native views complete their asynchronous load after folderURIChanged.
    const timer=win.setInterval(()=>refresh(false),2000);panes.add(win);refresh();
    return {close(){unsubscribe();win.clearInterval(timer);win.removeEventListener('folderURIChanged',changed);panes.delete(win);if(columns.includes(win.gDBView?.curCustomColumn))win.gViewWrapper.sort('dateCol',win.gDBView.sortOrder);}};
  }
  return {attach,close(){for(const win of panes){try{if(columns.includes(win.gDBView?.curCustomColumn))win.gViewWrapper.sort('dateCol',win.gDBView.sortOrder);}catch(_){/* A closed mail tab has no live view to restore. */}}panes.clear();for(const id of columns)ThreadPaneColumns.removeCustomColumn(id);}};
}
