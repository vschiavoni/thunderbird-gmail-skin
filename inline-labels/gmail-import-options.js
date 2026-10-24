/* Credentials and fetched labels stay in memory, never browser.storage. */
(() => {
  const el=id=>document.getElementById('gmail-'+id);
  let labels=[],selected=new Set(),preview=null,revision=0,busy=false,connected=false;
  const api=async(action,data={})=>{
    const response=JSON.parse(await browser.inlineLabels.gmailLabelImport(action,JSON.stringify(data)));
    if(!response.ok)throw new Error(response.error || 'The Gmail import operation failed.');
    return response.result;
  };
  function feedback(text,error=false){el('feedback').textContent=text;el('feedback').dataset.error=String(error);}
  function updateButtons(){
    el('connect').disabled=busy;el('disconnect').disabled=!busy&&!connected;
    for(const id of ['preview','select-all','select-none','root','cancel'])el(id).disabled=busy;
    for(const input of el('remote-labels').querySelectorAll('input'))input.disabled=busy;
    el('import').disabled=busy||el('dry-run').checked||!preview||preview.counts.conflict>0||preview.counts.create===0;
    el('import-controls').hidden=!connected;
  }
  function invalidate(){revision++;preview=null;el('preview-table').hidden=true;el('preview-rows').replaceChildren();el('summary').textContent='Preview required. No labels have been created.';updateButtons();}
  function renderLabels(){
    el('remote-labels').replaceChildren();
    for(const label of labels){
      const row=document.createElement('label'),box=document.createElement('input'),name=document.createElement('span');
      box.type='checkbox';box.checked=selected.has(label.id);box.setAttribute('aria-label',label.name);name.textContent=label.name;
      box.addEventListener('change',()=>{
        for(const child of labels)if(child.id===label.id||child.name.startsWith(label.name+'/')){
          if(box.checked)selected.add(child.id);else selected.delete(child.id);
        }
        invalidate();renderLabels();
      });
      row.append(box,name);el('remote-labels').append(row);
    }
  }
  function renderPreview(result){
    preview=result;el('preview-rows').replaceChildren();
    for(const row of result.rows){
      const tr=document.createElement('tr');
      for(const value of [row.path,{create:'Create',skip:'Already exists — skip',conflict:'Conflict — needs attention'}[row.status],row.reason||(row.requiredParent?'Required parent':'')]){
        const td=document.createElement('td');td.textContent=value;tr.append(td);
      }
      el('preview-rows').append(tr);
    }
    const c=result.counts;el('summary').textContent=`${result.email}: ${c.create} labels to create, ${c.skip} already exist, ${c.conflict} conflicts. Nothing has been imported.`;
    el('preview-table').hidden=false;updateButtons();
  }
  async function previewSelection(){
    const current=++revision;preview=null;busy=true;updateButtons();feedback('Checking the proposed local changes…');
    try{const result=await api('preview',{root:el('root').value,selected:[...selected]});if(current===revision){renderPreview(result);feedback(result.counts.conflict?'Exclude conflicting labels or change the destination, then preview again.':'Dry run complete. Review the table before enabling Import.');}}
    catch(error){if(current===revision)feedback(error.message,true);}
    finally{busy=false;updateButtons();}
  }
  el('connect').addEventListener('click',async()=>{
    invalidate();connected=false;labels=[];selected.clear();renderLabels();el('account').textContent='Not connected';busy=true;updateButtons();feedback('Complete Google sign-in in your browser. No local labels will be created.');
    try{
      const result=await api('connect',{clientId:el('client-id').value.trim(),clientSecret:el('client-secret').value});
      connected=result.connected;labels=result.labels.sort((a,b)=>a.name.localeCompare(b.name));selected=new Set(labels.map(l=>l.id));
      el('account').textContent=`Connected account: ${result.email}. ${result.systemLabelsExcluded} Gmail system labels excluded.`;
      el('dry-run').checked=true;renderLabels();busy=false;updateButtons();await previewSelection();
    }catch(error){connected=false;feedback(error.message,true);el('setup').open=true;}
    finally{el('client-secret').value='';busy=false;updateButtons();}
  });
  el('disconnect').addEventListener('click',async()=>{
    revision++;await api('disconnect');connected=false;labels=[];selected.clear();preview=null;
    el('client-secret').value='';el('account').textContent='Not connected';el('dry-run').checked=true;
    el('remote-labels').replaceChildren();invalidate();feedback('Disconnected. Created labels, if any, are kept.');
  });
  el('preview').addEventListener('click',previewSelection);
  el('root').addEventListener('input',invalidate);
  el('dry-run').addEventListener('change',updateButtons);
  for(const [id,all] of [['select-all',true],['select-none',false]])el(id).addEventListener('click',()=>{selected=new Set(all?labels.map(l=>l.id):[]);invalidate();renderLabels();});
  el('cancel').addEventListener('click',async()=>{await api('cancel');invalidate();el('dry-run').checked=true;feedback('Preview cancelled. No labels were created.');});
  el('import').addEventListener('click',async()=>{
    if(el('dry-run').checked||!preview||busy)return;
    const token=preview.previewToken;busy=true;updateButtons();feedback('Creating the selected local labels…');
    try{
      const result=await api('import',{previewToken:token});invalidate();el('dry-run').checked=true;
      feedback(`Created ${result.created.length}, skipped ${result.skipped.length}, failed or not attempted ${result.failed.length}. ${result.error||'Import complete.'}`,result.failed.length>0);
    }catch(error){invalidate();feedback(error.message,true);}
    finally{busy=false;updateButtons();}
  });
  el('client-file').addEventListener('change',async()=>{
    try{
      const file=el('client-file').files[0];if(!file)return;if(file.size>32768)throw Error('Choose the small Desktop OAuth client JSON from Google Cloud.');
      const config=JSON.parse(await file.text()).installed;
      if(!config||typeof config.client_id!=='string'||(config.client_secret!==undefined&&typeof config.client_secret!=='string'))throw Error('This is not a Google Desktop client configuration.');
      el('client-id').value=config.client_id;el('client-secret').value=config.client_secret||'';feedback('Desktop client loaded for this session. Click Connect to continue.');
    }catch(error){feedback(error.message,true);}finally{el('client-file').value='';}
  });
  // Options may be closed during OAuth. Abort pending authorization and forget
  // remote label data on page exit; no permanent Google connection is retained.
  window.addEventListener('pagehide',()=>{api('disconnect').catch(()=>{});});
  api('status').then(result=>{
    connected=result.connected;labels=result.labels||[];selected=new Set(labels.map(l=>l.id));
    if(connected){el('account').textContent=`Connected account: ${result.email}`;renderLabels();}
    updateButtons();
  }).catch(error=>feedback(error.message,true));
})();
