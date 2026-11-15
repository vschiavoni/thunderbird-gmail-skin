{
  const toggle=document.getElementById('in-place-search'),status=document.getElementById('in-place-search-status');
  toggle.disabled=true;
  browser.storage.local.get({inPlaceSearch:false}).then(settings=>{toggle.checked=settings.inPlaceSearch===true;toggle.disabled=false;}).catch(error=>{status.textContent=error.message;});
  toggle.addEventListener('change',async()=>{toggle.disabled=true;try{await browser.storage.local.set({inPlaceSearch:toggle.checked});status.textContent='';}catch(error){toggle.checked=!toggle.checked;status.textContent=error.message;}finally{toggle.disabled=false;}});
}
