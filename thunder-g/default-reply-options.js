{
  const choices=Array.from(document.querySelectorAll('input[name="default-reply-behavior"]'));
  const status=document.getElementById('default-reply-status');let saved='reply';
  const normalize=value=>value==='reply-all'?'reply-all':'reply';
  function show(){for(const input of choices)input.checked=input.value===saved;}
  browser.storage.local.get({defaultReplyBehavior:'reply'}).then(settings=>{
    saved=normalize(settings.defaultReplyBehavior);show();for(const input of choices)input.disabled=false;
  }).catch(error=>{status.textContent='Unable to load default reply behavior: '+error.message;});
  for(const input of choices)input.addEventListener('change',async()=>{
    if(!input.checked)return;
    for(const choice of choices)choice.disabled=true;
    try{await browser.storage.local.set({defaultReplyBehavior:normalize(input.value)});saved=normalize(input.value);status.textContent='Saved. Applies to the conversation header reply action immediately.';}
    catch(error){status.textContent='Unable to save default reply behavior: '+error.message;}
    finally{show();for(const choice of choices)choice.disabled=false;}
  });
}
