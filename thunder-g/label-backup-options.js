/* Backups are handled only after an explicit export or preview action. */
(() => {
  const el=id=>document.getElementById('label-backup-'+id);
  const maxBytes=16*1024*1024,downloadURLs=new Set(),accounts=new Map();
  let preview=null,restoreDone=false,busy=false,importing=false,closed=false,accountsLoaded=false,revision=0,cancellation=Promise.resolve();
  const count=value=>Number.isSafeInteger(value)&&value>=0?value:0;
  const api=async(action,data={})=>{
    const response=JSON.parse(await browser.inlineLabels.labelBackup(action,JSON.stringify(data)));
    if(!response.ok)throw new Error(response.error || gmText('The label backup operation failed.'));
    return response.result;
  };
  function feedback(source,args=[],error=false){
    gmBindValue(el('feedback'),'textContent',()=>gmText(source,...args));
    el('feedback').dataset.error=String(error);
  }
  function exportSelection(){
    const id=el('accounts').value;
    return accountsLoaded&&(id==='__all__'||accounts.has(id))?(id==='__all__'?{}:{accountId:id}):null;
  }
  function previewDone(){
    const c=preview?.counts;
    return typeof preview?.previewToken==='string'&&!!preview.previewToken.trim()&&!preview.warnings?.length&&['create','restore','conflict','missing','ambiguous','blocked'].every(key=>count(c?.[key])===0);
  }
  function buttons(){
    const c=preview?.counts;
    el('load-accounts').disabled=busy;
    el('accounts').disabled=busy||!accountsLoaded;
    el('export').disabled=busy||!exportSelection();
    el('file').disabled=busy;
    el('preview').disabled=busy||!el('file').files?.[0];
    el('apply').disabled=busy||typeof preview?.previewToken!=='string'||!preview.previewToken.trim()||count(c?.conflict)>0||count(c?.create)+count(c?.restore)===0;
    gmBindValue(el('apply'),'textContent',()=>gmText(restoreDone||previewDone()?'Done':'Restore labels'));
    el('cancel').disabled=importing||(!busy&&!preview);
    el('section').setAttribute('aria-busy',String(busy));
  }
  function clearPreview(){
    preview=null;restoreDone=false;el('review').hidden=true;el('rows').replaceChildren();
    el('summary').textContent='';el('omitted').textContent='';el('warnings').replaceChildren();
  }
  function invalidate(){
    revision++;clearPreview();busy=false;
    cancellation=api('cancel').catch(()=>{});
    buttons();
    return cancellation;
  }
  function showWarnings(warnings){
    el('warnings').replaceChildren();
    for(const value of (Array.isArray(warnings)?warnings:[]).slice(0,20)){
      const item=document.createElement('li');item.textContent=String(value);el('warnings').append(item);
    }
  }
  function renderPreview(result){
    preview=result;el('rows').replaceChildren();
    const rows=Array.isArray(result.labelRows)?result.labelRows:[];
    for(const row of rows.slice(0,200)){
      const tr=document.createElement('tr'),name=document.createElement('td'),action=document.createElement('td'),details=document.createElement('td');
      name.textContent=row.name;
      const status={create:'Create label',reuse:'Keep existing label',conflict:'Conflict — needs attention'}[row.status] || 'Conflict — needs attention';
      gmBindValue(action,'textContent',()=>gmText(status));
      details.textContent=row.reason||'';
      tr.append(name,action,details);el('rows').append(tr);
    }
    const c=result.counts||{};
    gmBindValue(el('summary'),'textContent',()=>gmText('$1 labels to create, $2 existing labels, $3 conflicts. Messages: $4 matched, $5 missing, $6 ambiguous.',count(c.create),count(c.reuse),count(c.conflict),count(c.matched),count(c.missing),count(c.ambiguous))+' '+gmText('Messages needing label assignments: $1; already assigned: $2.',count(c.restore),count(c.alreadyApplied)));
    const total=count(c.create)+count(c.reuse)+count(c.conflict),shown=Math.min(rows.length,200);
    gmBindValue(el('omitted'),'textContent',()=>total>shown?gmText('Showing $1 of $2 labels. The totals include the full backup.',shown,total):'');
    showWarnings(result.warnings);
    el('review').hidden=false;buttons();
  }
  el('load-accounts').addEventListener('click',async()=>{
    if(busy)return;
    const current=++revision;clearPreview();accountsLoaded=false;accounts.clear();el('accounts').value='';
    busy=true;buttons();feedback('Reading configured accounts…');
    try{
      await cancellation;if(closed||current!==revision)return;
      await api('cancel');if(closed||current!==revision)return;
      const result=await api('accounts');if(closed||current!==revision)return;
      el('accounts').replaceChildren();
      const placeholder=document.createElement('option');placeholder.value='';gmBindValue(placeholder,'textContent',()=>gmText('Choose an account…'));el('accounts').append(placeholder);
      const all=document.createElement('option');all.value='__all__';gmBindValue(all,'textContent',()=>gmText('All accounts'));el('accounts').append(all);
      for(const item of Array.isArray(result.accounts)?result.accounts:[]){
        if(typeof item.id!=='string'||!item.id||item.id==='__all__'||typeof item.label!=='string')continue;
        accounts.set(item.id,item.label);
        const option=document.createElement('option');option.value=item.id;option.textContent=item.label;el('accounts').append(option);
      }
      el('accounts').value='';accountsLoaded=true;feedback('Choose an account, then export its labels and message assignments.');
    }catch(error){if(!closed&&current===revision)feedback(error.message,[],true);}
    finally{if(current===revision){busy=false;buttons();}}
  });
  el('accounts').addEventListener('change',async()=>{
    if(importing)return;
    const current=revision+1;await invalidate();
    if(!closed&&current===revision)feedback('');
  });
  el('file').addEventListener('change',async()=>{
    if(importing)return;
    const current=revision+1;
    await invalidate();
    if(closed||current!==revision)return;
    const file=el('file').files?.[0];
    feedback(file?'Backup selected. Choose Preview restore to check labels and find matching messages.':'');
  });
  el('preview').addEventListener('click',async()=>{
    if(busy)return;
    const file=el('file').files?.[0];if(!file)return;
    const current=++revision;clearPreview();busy=true;buttons();
    feedback('Reading the backup and finding matching messages…');
    try{
      if(file.size>maxBytes)throw Error(gmText('Choose a Thunder-G label backup smaller than 16 MiB.'));
      await cancellation;
      if(closed||current!==revision)return;
      const text=await file.text();
      if(closed||current!==revision)return;
      const result=await api('preview',{text});
      if(closed||current!==revision)return;
      renderPreview(result);
      if(count(result.counts?.conflict)>0)feedback('Resolve the label conflicts before restoring. No changes have been made.');
      else if(previewDone())feedback('Done — all labels and assignments in this backup are already present in their matching folders. Preview did not apply any changes.');
      else if(count(result.counts?.create)+count(result.counts?.restore)===0)feedback('Nothing can be restored from this preview. Missing or ambiguous messages are skipped. Preview did not apply any changes.');
      else feedback('Preview complete. No changes have been made. Choose Restore labels to apply the pending changes. Missing or ambiguous messages are skipped.');
    }catch(error){if(!closed&&current===revision)feedback(error.message,[],true);}
    finally{if(current===revision){busy=false;buttons();}}
  });
  el('apply').addEventListener('click',async()=>{
    if(busy||!preview||el('apply').disabled)return;
    const token=preview.previewToken,current=++revision;
    // A preview is one-use, even when a native write fails partway through.
    clearPreview();busy=true;importing=true;buttons();feedback('Restoring labels and message assignments…');
    try{
      const result=await api('import',{previewToken:token});
      if(closed||current!==revision)return;
      feedback('Created $1 labels, kept $2 existing labels, and restored labels on $3 messages. Missing: $4; ambiguous: $5; failed: $6.',[count(result.created),count(result.reused),count(result.restored),count(result.missing),count(result.ambiguous),count(result.failed)],count(result.failed)>0);
      restoreDone=count(result.failed)===0&&!result.error&&count(result.missing)===0&&count(result.ambiguous)===0&&!result.warnings?.length;
      showWarnings(result.error?[result.error]:result.warnings);
    }catch(error){if(!closed&&current===revision)feedback(error.message,[],true);}
    finally{if(current===revision){busy=false;importing=false;buttons();}}
  });
  el('export').addEventListener('click',async()=>{
    const selection=exportSelection();if(busy||!selection)return;
    const current=++revision;clearPreview();busy=true;buttons();feedback('Reading labels and message assignments…');
    let downloadURL=null;
    try{
      await cancellation;
      if(closed||current!==revision)return;
      await api('cancel');
      if(closed||current!==revision)return;
      const result=await api('export',selection);
      if(closed||current!==revision)return;
      const blob=new Blob([JSON.stringify(result.backup)],{type:'application/json'});
      if(blob.size>maxBytes)throw Error(gmText('This backup exceeds the 16 MiB limit. No file was saved.'));
      const url=URL.createObjectURL(blob);downloadURL=url;downloadURLs.add(url);
      const link=document.createElement('a');link.href=url;link.download=`thunder-g-labels-${new Date().toISOString().slice(0,10)}.json`;
      try{document.body.append(link);link.click();}finally{link.remove();}
      window.setTimeout(()=>{URL.revokeObjectURL(url);downloadURLs.delete(url);},1000);
      feedback('Backup ready: $1 labels and assignments for $2 messages. Messages skipped: $3.',[count(result.counts?.labels),count(result.counts?.messages),count(result.counts?.skipped)]);
      showWarnings(result.warnings);
    }catch(error){
      if(downloadURL){URL.revokeObjectURL(downloadURL);downloadURLs.delete(downloadURL);}
      if(!closed&&current===revision)feedback(error.message,[],true);
    }
    finally{if(current===revision){busy=false;buttons();}}
  });
  el('cancel').addEventListener('click',async()=>{
    if(importing)return;
    const current=revision+1;busy=false;await invalidate();
    if(!closed&&current===revision){feedback('Preview cancelled. No labels or assignments were changed.');buttons();}
  });
  window.addEventListener('pagehide',()=>{
    closed=true;revision++;preview=null;api('cancel').catch(()=>{});
    for(const url of downloadURLs)URL.revokeObjectURL(url);downloadURLs.clear();
  });
  buttons();
})();
