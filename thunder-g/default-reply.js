var thunderGDefaultReplyBehavior='reply';
const thunderGDefaultReplyListeners=new Set();
function setThunderGDefaultReplyBehavior(value){
  thunderGDefaultReplyBehavior=value==='reply-all'?'reply-all':'reply';
  for(const update of thunderGDefaultReplyListeners)update();
}
function thunderGDefaultReplyAction(){
  const all=thunderGDefaultReplyBehavior==='reply-all';
  const path=all?'M7 5 1 11l6 6 M12 5l-6 6 6 6 M6 11h8a7 7 0 0 1 7 7':'M9 5 3 11l6 6 M3 11h9a7 7 0 0 1 7 7';
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${path}" fill="none" stroke="black" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  return {command:all?'cmd_replyall':'cmd_replySender',label:all?'Reply all':'Reply',icon:`url("data:image/svg+xml,${encodeURIComponent(svg)}")`};
}
function installDefaultReplyControl(button,run,isCurrent=()=>true,eventType='command'){
  const attributes=new Map(['label','title','tooltiptext','aria-label','data-gm-default-reply'].map(name=>[name,button.getAttribute(name)]));
  const image=button.style.getPropertyValue('--gm-default-reply-icon'),priority=button.style.getPropertyPriority('--gm-default-reply-icon');
  function update(){
    const action=thunderGDefaultReplyAction(),label=typeof gmText==='function'?gmText(action.label):action.label;
    for(const name of ['label','title','tooltiptext','aria-label'])button.setAttribute(name,label);
    button.setAttribute('data-gm-default-reply',thunderGDefaultReplyBehavior);
    button.style.setProperty('--gm-default-reply-icon',action.icon);
  }
  function command(event){
    if(!isCurrent())return;
    event.preventDefault();event.stopImmediatePropagation();run(thunderGDefaultReplyAction().command);
  }
  button.addEventListener(eventType,command,true);thunderGDefaultReplyListeners.add(update);
  const stopLanguage=typeof gmOnLanguageChange==='function'?gmOnLanguageChange(update):()=>{};update();
  return {close(){button.removeEventListener(eventType,command,true);thunderGDefaultReplyListeners.delete(update);stopLanguage();
    for(const [name,value] of attributes){if(value==null)button.removeAttribute(name);else button.setAttribute(name,value);}
    if(image)button.style.setProperty('--gm-default-reply-icon',image,priority);else button.style.removeProperty('--gm-default-reply-icon');
  }};
}
