{
  const toggle=document.getElementById('preview-trimming');
  const lines=document.getElementById('preview-skip-lines');
  const text=document.getElementById('preview-skip-text');
  const status=document.getElementById('preview-trimming-status');
  function update(){lines.disabled=text.disabled=!toggle.checked;}
  async function save(){
    update();
    if(!lines.checkValidity())return;
    try{
      await browser.storage.local.set({previewTrimming:{
        enabled:toggle.checked,lines:Number(lines.value)||0,text:text.value
      }});
      status.textContent='Saved.';
    }catch(_){status.textContent='Unable to save. Please try again.';}
  }
  for(const control of [toggle,lines,text])control.addEventListener('change',save);
  browser.storage.local.get('previewTrimming').then(({previewTrimming})=>{
    toggle.checked=previewTrimming?.enabled===true;
    lines.value=String(previewTrimming?.lines || 0);
    text.value=previewTrimming?.text || '';
    toggle.disabled=false;update();
  }).catch(()=>{status.textContent='Unable to load settings.';});
}
