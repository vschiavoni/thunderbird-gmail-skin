const GM_STAR_MARKERS = [
  ['yellow-star','★','#e8a317'],['red-star','★','#d93025'],['orange-star','★','#e8710a'],
  ['blue-star','★','#1967d2'],['purple-star','★','#9334a7'],['green-star','★','#188038'],
  ['red-bang','❗','#d93025'],['orange-guillemet','»','#e8710a'],['yellow-bang','!','#e8a317'],
  ['green-check','✓','#188038'],['blue-info','ℹ','#1967d2'],['purple-question','?','#9334a7'],
];
const GM_STAR_PROPERTY='thundergStarMarker';

function gmStarOrder(order) {
  const ids=new Set(GM_STAR_MARKERS.map(([id])=>id));
  const valid=Array.isArray(order)?[...new Set(order.filter(id=>ids.has(id)))]:[];
  return valid.length?valid:['yellow-star'];
}

function gmMoveStar(order,id,active,before) {
  const next=order.filter(marker=>marker!==id);
  if(active){
    const index=next.indexOf(before);
    next.splice(index<0?next.length:index,0,id);
  }
  return next.length?next:order;
}

function gmNextStar(flagged,current,order,rapid) {
  if(!flagged)return order[0];
  if(!rapid)return '';
  return order[(order.indexOf(current)+1)%order.length];
}

function installColoredStars(win,settings) {
  const tree=win.document.getElementById('threadTree');
  let enabled,order,last;
  function header(row){
    if(!row || (row.dataset.properties || '').split(' ').includes('dummy'))return null;
    return win.gDBView?.getMsgHdrAt(row.index);
  }
  function render(row){
    const button=row.querySelector('.flaggedcol-column button');
    if(!button)return;
    button.removeAttribute('data-gm-star');
    button.style.removeProperty('--gm-star-color');
    if(!enabled)return;
    try{
      const message=header(row);
      if(!message)return;
      const marker=message.isFlagged
        ? GM_STAR_MARKERS.find(([id])=>id===message.getStringProperty(GM_STAR_PROPERTY)) || GM_STAR_MARKERS[0]
        : null;
      button.dataset.gmStar=marker?.[1] || '☆';
      if(marker)button.style.setProperty('--gm-star-color',marker[2]);
    }catch(_){/* Native virtual rows can be invalidated during a view change. */}
  }
  function click(event){
    if(!enabled || event.button!==0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)return;
    const row=event.target.closest?.('.flaggedcol-column button')?.closest('tr.table-layout');
    if(!row)return;
    try{
      const message=header(row);
      if(!message?.folder?.markMessagesFlagged)return;
      const key=message.messageKey,uri=message.folder.URI,now=Date.now();
      const rapid=last?.key===key && last.uri===uri && now-last.time<800;
      const current=message.getStringProperty(GM_STAR_PROPERTY) || 'yellow-star';
      const next=gmNextStar(message.isFlagged,current,order,rapid);
      event.preventDefault();event.stopImmediatePropagation();
      message.setStringProperty(GM_STAR_PROPERTY,next);
      if(message.isFlagged!==Boolean(next))message.folder.markMessagesFlagged([message],Boolean(next));
      last=next?{key,uri,time:now}:null;
      render(row);
    }catch(error){console.error('Thunder-G: could not update star',error);}
  }
  function configure(value){
    enabled=value?.enabled===true;order=gmStarOrder(value?.order);last=null;
    for(const row of tree.querySelectorAll('tr.table-layout'))render(row);
  }
  configure(settings);
  tree.addEventListener('click',click,true);
  return {render,configure,close(){tree.removeEventListener('click',click,true);configure(null);}};
}
