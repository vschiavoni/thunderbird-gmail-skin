{
  const toggle=document.getElementById('colored-stars');
  const active=document.getElementById('stars-active'),inactive=document.getElementById('stars-inactive');
  let order=gmStarOrder(),dragged=null;
  function save(){
    render();
    browser.storage.local.set({coloredStars:{enabled:toggle.checked,order}}).catch(console.error);
  }
  function move(id,list,before){
    order=gmMoveStar(order,id,list===active,before);
    save();
  }
  function render(){
    active.replaceChildren();inactive.replaceChildren();
    const markers=new Map(GM_STAR_MARKERS.map(([id,glyph,color])=>[id,{glyph,color}]));
    for(const id of [...order,...[...markers.keys()].filter(id=>!order.includes(id))]){
      const list=order.includes(id)?active:inactive;
      const {color}=markers.get(id);
      const item=document.createElement('button');
      item.type='button';item.draggable=true;item.dataset.marker=id;
      item.title=id;item.setAttribute('aria-label',id);item.style.color=color;
      const icon=document.createElement('span');
      icon.className='star-marker-icon';icon.setAttribute('aria-hidden','true');
      icon.style.setProperty('--gm-star-image',gmStarImage(id));item.append(icon);
      item.addEventListener('dragstart',event=>{dragged=id;event.dataTransfer.setData('text/plain',id);});
      item.addEventListener('dragend',()=>{dragged=null;});
      item.addEventListener('click',()=>move(id,list===active?inactive:active));
      item.addEventListener('keydown',event=>{
        if(list!==active || !['ArrowLeft','ArrowRight'].includes(event.key))return;
        event.preventDefault();
        const index=order.indexOf(id),offset=event.key==='ArrowLeft'?-1:1;
        if(index+offset<0 || index+offset>=order.length)return;
        move(id,active,order[index+(offset<0?-1:2)]);
        active.querySelector(`[data-marker="${id}"]`)?.focus();
      });
      list.append(item);
    }
  }
  for(const list of [active,inactive]){
    list.addEventListener('dragover',event=>{if(dragged)event.preventDefault();});
    list.addEventListener('drop',event=>{
      if(!dragged)return;
      event.preventDefault();
      const before=event.target.closest('[data-marker]')?.dataset.marker;
      if(before!==dragged)move(dragged,list,before);
      dragged=null;
    });
  }
  toggle.addEventListener('change',save);
  for(const button of document.querySelectorAll('[data-star-preset]')){
    button.addEventListener('click',()=>{
      const size=Number(button.dataset.starPreset);
      order=size===4?['yellow-star','red-star','blue-star','orange-guillemet']:GM_STAR_MARKERS.slice(0,size).map(([id])=>id);
      save();
    });
  }
  browser.storage.local.get('coloredStars').then(({coloredStars})=>{
    toggle.checked=coloredStars?.enabled===true;
    order=gmStarOrder(coloredStars?.order);
    render();toggle.disabled=false;
  }).catch(console.error);
}
