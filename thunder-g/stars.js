const GM_STAR_MARKERS = [
  ['yellow-star','★','#e8a317'],['red-star','★','#d93025'],['orange-star','★','#e8710a'],
  ['blue-star','★','#1967d2'],['purple-star','★','#9334a7'],['green-star','★','#188038'],
  ['red-bang','❗','#d93025'],['orange-guillemet','»','#e8710a'],['yellow-bang','!','#e8a317'],
  ['green-check','✓','#188038'],['blue-info','ℹ','#1967d2'],['purple-question','?','#9334a7'],
];
// Shared geometry gives empty and filled stars the same outer bounds.
const GM_STAR_PATH='M12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26Z';
function gmStarImage(id) {
  const star=!id || id.endsWith('-star');
  const symbols={
    'red-bang':'M11 6h2v7h-2z M11 15h2v2h-2z',
    'yellow-bang':'M11 6h2v7h-2z M11 15h2v2h-2z',
    'orange-guillemet':'m6 7 5 5-5 5 1.5 1.5L14 12 7.5 5.5z m6 0 5 5-5 5 1.5 1.5L20 12l-6.5-6.5z',
    'green-check':'m5 12 4 4 10-10 1.5 1.5L9 19l-5.5-5.5z',
    'blue-info':'M11 5h2v2h-2z M10 9h3v8h2v2H9v-2h2v-6h-1z',
    'purple-question':'M8 8a4 4 0 1 1 6 3.5c-1 .6-1 1-1 2.5h-2c0-2 .2-3 2-4a2 2 0 1 0-3-2z M11 16h2v2h-2z',
  };
  const shape=star
    ? `<path d="${GM_STAR_PATH}" fill="${id?'black':'none'}" stroke="black" stroke-width="1.5" stroke-linejoin="round"/>`
    : `<path fill="black" d="${symbols[id]}"/>`;
  // Crop each symbol to its visible bounds so it occupies the same 18px
  // icon area as a star, rather than shrinking inside the star's canvas.
  const bounds={
    'red-bang':'10 5 4 13', 'yellow-bang':'10 5 4 13',
    'orange-guillemet':'5 5 16 14', 'green-check':'3 5 18 15',
    'blue-info':'8 4 8 16', 'purple-question':'7 3 10 16',
  };
  const viewBox=star?'0 0 24 24':bounds[id];
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${shape}</svg>`)}")`;
}
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
    function clear(){
      button.removeAttribute('data-gm-star');
      button.style.removeProperty('--gm-star-color');
      button.style.removeProperty('--gm-star-image');
    }
    if(!enabled){clear();return;}
    try{
      const message=header(row);
      if(!message){clear();return;}
      const marker=message.isFlagged
        ? GM_STAR_MARKERS.find(([id])=>id===message.getStringProperty(GM_STAR_PROPERTY)) || GM_STAR_MARKERS[0]
        : null;
      const glyph=marker?.[1] || '☆';
      const image=gmStarImage(marker?.[0]);
      const color=marker?.[2] || '';
      // Native list refreshes often refill the same row. Keep its image in
      // place instead of removing/reloading the SVG on every refresh.
      if(button.dataset.gmStar!==glyph)button.dataset.gmStar=glyph;
      if(button.style.getPropertyValue('--gm-star-image')!==image)
        button.style.setProperty('--gm-star-image',image);
      if(button.style.getPropertyValue('--gm-star-color')!==color){
        if(color)button.style.setProperty('--gm-star-color',color);
        else button.style.removeProperty('--gm-star-color');
      }
    }catch(_){clear();/* Native virtual rows can be invalidated during a view change. */}
  }
  function click(event){
    if(!enabled || event.button!==0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)return;
    const row=event.target.closest?.('.flaggedcol-column button')?.closest('tr.table-layout');
    if(!row)return;
    try{
      const message=header(row);
      if(!message?.folder?.markMessagesFlagged)return;
      const key=message.messageKey,uri=message.folder.URI,now=Date.now();
      const rapid=last?.key===key && last.uri===uri && now-last.time<1500;
      const current=rapid?last.marker:message.getStringProperty(GM_STAR_PROPERTY) || 'yellow-star';
      const next=gmNextStar(rapid || message.isFlagged,current,order,rapid);
      event.preventDefault();event.stopImmediatePropagation();
      message.setStringProperty(GM_STAR_PROPERTY,next);
      if(message.isFlagged!==Boolean(next))message.folder.markMessagesFlagged([message],Boolean(next));
      last=next?{key,uri,time:now,marker:next}:null;
      render(row);
    }catch(error){console.error('Thunder-G: could not update star',error);}
  }
  function doubleClick(event){
    if(!enabled || event.button!==0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)return;
    if(!event.target.closest?.('.flaggedcol-column button'))return;
    // The two click events already advance the markers. Do not let the
    // native double-click action open/rebuild the message view as well.
    event.preventDefault();event.stopImmediatePropagation();
  }
  function configure(value){
    enabled=value?.enabled===true;order=gmStarOrder(value?.order);last=null;
    for(const row of tree.querySelectorAll('tr.table-layout'))render(row);
  }
  configure(settings);
  tree.addEventListener('click',click,true);
  tree.addEventListener('dblclick',doubleClick,true);
  return {render,configure,close(){tree.removeEventListener('click',click,true);tree.removeEventListener('dblclick',doubleClick,true);configure(null);}};
}
