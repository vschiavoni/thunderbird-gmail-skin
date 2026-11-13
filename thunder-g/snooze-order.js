/* Effective Inbox dates leave RFC Date intact. Separate native sort handlers
 * preserve individual-message ordering when native threading is disabled. */
function snoozeInboxDate(headers) {
  let latest=0;
  for(const header of headers)latest=Math.max(latest,header.dateInSeconds||header.date/1000000||0,Number(header.getStringProperty?.('thunderGSnoozeReturned'))||0);
  return latest;
}

function createSnoozeOrder() {
  const {ThreadPaneColumns}=ChromeUtils.importESModule('chrome://messenger/content/ThreadPaneColumns.mjs');
  const messageColumn='gmSnoozeOrder',threadColumn='gmSnoozeThreadOrder';
  const columns=[messageColumn,threadColumn],panes=new Set(),callbacks=new Map();
  function owns(id){const column=ThreadPaneColumns.getCustomColumns().find(column=>column.id===id);return !!column&&(!column.handler||column.handler.getSortLongForRow===callbacks.get(id));}
  const value=header=>snoozeInboxDate([header]);
  function threadValue(header){
    let date=value(header);
    try{const thread=header.folder.msgDatabase.getThreadContainingMsgHdr(header);for(let i=0;i<thread.numChildren;i++)date=Math.max(date,value(thread.getChildHdrAt(i)));}catch(_){}
    return Math.floor(date);
  }
  for(const id of columns){
    if(ThreadPaneColumns.getCustomColumns().some(column=>column.id===id))ThreadPaneColumns.removeCustomColumn(id);
    const sortCallback=id===threadColumn?threadValue:header=>Math.floor(value(header));
    callbacks.set(id,sortCallback);
    ThreadPaneColumns.addCustomColumn(id,{
    name:gmText(id===threadColumn?'Inbox thread order':'Inbox order'),hidden:true,sortable:true,
    textCallback:header=>new Date(value(header)*1000).toLocaleString(),
    sortCallback,
    });
  }
  function attach(win){
    let busy=false,lastView=null,lastSignature='',lastRevision=-1,lastFolder=null;
    const signature=view=>[win.gFolder?.URI,view.rowCount,view.viewFlags,view.sortType,view.sortOrder,view.curCustomColumn,thunderGSnooze.orderRevision||0].join('|');
    function refresh(force=false){
      if(busy||!win.gDBView||!win.gViewWrapper)return;
      // Native drag/drop and Betterbird keyboard rethreading retain row indices.
      // Do not invalidate those rows until the native operation has finished.
      const tree=win.document?.getElementById?.('threadTree');
      if(tree?.hasAttribute?.('data-gm-dragging')||tree?.inKeyDnD||tree?.querySelector?.('tr.drag-source'))return;
      const view=win.gDBView,folder=win.gFolder;
      const currentSignature=signature(view);
      if(!force&&view===lastView&&currentSignature===lastSignature)return;
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
      try{
        const column=inbox?(threaded?threadColumn:messageColumn):'dateCol',order=view.sortOrder;
        const revision=thunderGSnooze.orderRevision||0;
        // Expanding a thread changes rowCount, but not its ordering keys. Keep
        // the native expansion and selection intact for Betterbird rethreading.
        if(custom&&column===view.curCustomColumn&&view===lastView&&folder?.URI===lastFolder&&revision===lastRevision){lastSignature=currentSignature;return;}
        // Native views cache custom sort keys. Invalidate them when a reminder
        // returns or the asynchronous unified view changes, even at equal size.
        if(custom&&inbox)win.gViewWrapper.sort('dateCol',order);
        win.gViewWrapper.sort(column,order);
        lastView=win.gDBView;lastSignature=signature(lastView);lastRevision=revision;lastFolder=folder?.URI;
      }finally{busy=false;}
    }
    const changed=()=>refresh(true);
    win.addEventListener('folderURIChanged',changed);
    const unsubscribe=thunderGSnooze.subscribe(changed);
    // Some native views complete their asynchronous load after folderURIChanged.
    const timer=win.setInterval(()=>refresh(false),2000);panes.add(win);refresh();
    return {close(){unsubscribe();win.clearInterval(timer);win.removeEventListener('folderURIChanged',changed);panes.delete(win);if(owns(win.gDBView?.curCustomColumn))win.gViewWrapper.sort('dateCol',win.gDBView.sortOrder);}};
  }
  return {attach,close(){for(const win of panes){try{if(owns(win.gDBView?.curCustomColumn))win.gViewWrapper.sort('dateCol',win.gDBView.sortOrder);}catch(_){/* A closed mail tab has no live view to restore. */}}panes.clear();for(const id of columns)if(owns(id))ThreadPaneColumns.removeCustomColumn(id);}};
}
