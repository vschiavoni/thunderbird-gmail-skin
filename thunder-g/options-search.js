/* Search only local settings text; no account data or network requests. */
(()=>{
  const input=document.getElementById('settings-search');
  const sections=[...document.querySelectorAll('main > section')];
  const normalize=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();
  const opened=new Map();
  function filter(){
    const terms=normalize(input.value).trim().split(/\s+/).filter(Boolean);
    let matches=0;
    for(const section of sections){
      // Platform availability is independent of the temporary search filter.
      const unavailable=section.id==='appearance'&&document.getElementById('appearance-nav').hidden;
      const text=normalize(section.textContent);
      const match=!unavailable&&terms.every(term=>text.includes(term));
      section.classList.toggle('search-hidden',!match);
      if(match)matches++;
      for(const detail of section.querySelectorAll('details')){
        if(terms.length){if(!opened.has(detail))opened.set(detail,detail.open);if(match)detail.open=true;}
        else if(opened.has(detail)){detail.open=opened.get(detail);opened.delete(detail);}
      }
      const link=document.querySelector(`nav a[href="#${section.id}"]`);
      if(link)link.classList.toggle('search-hidden',!match);
    }
    document.getElementById('settings-no-results').hidden=!terms.length||matches>0;
  }
  input.addEventListener('input',filter);
  input.addEventListener('keydown',event=>{if(event.key==='Escape'){input.value='';filter();}});
  // Re-evaluate translated text and asynchronously loaded platform settings.
  const observer=new MutationObserver(filter);
  observer.observe(document.querySelector('main'),{subtree:true,characterData:true,childList:true});
  document.getElementById('interface-language').addEventListener('change',()=>queueMicrotask(filter));
})();
