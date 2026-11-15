const GM_LABEL_SUGGESTION_SELECTION_LIMIT=500;
function installLabelSuggestions(win,mail,prefs){
  const doc=win.document,settings=doc.querySelector('.gm-inbox-settings'),tree=doc.getElementById('threadTree');
  if(!settings || !tree)return {close(){}};
  let closed=false,panel=null,controller=null,active=[],renderFrame=null,revision=0,membershipRevision=0;
  const button=doc.createElement('button');button.type='button';button.className='button icon-button unified-toolbar-button gm-label-suggestions-button';
  button.textContent='✧';button.title='Suggest labels (experimental, local only)';button.setAttribute('aria-label',button.title);settings.after(button);
  const style=doc.createElement('style');style.textContent=`
    .gm-reading-toolbar > .gm-label-suggestions-button{margin-inline-start:auto;flex:0 0 36px}
    .gm-label-suggestions-button{font-size:22px!important;min-width:32px;cursor:pointer}
    #threadTree .subject-line > span.gm-label-suggestion-chip,.gm-label-suggestion-chip{border:1px dashed currentColor!important;border-radius:5px;padding:1px 5px;margin-inline-end:5px;font-size:11px;white-space:nowrap;color:var(--gm-text,#555);background:transparent!important;flex:0 0 auto!important}
    .gm-label-suggestions-shade{position:fixed;inset:0;z-index:2147483000;background:rgb(0 0 0 / .28);display:grid;place-items:center}
    .gm-label-suggestions-panel{background:var(--gm-bg,Canvas);color:var(--gm-text,CanvasText);width:min(760px,90vw);max-height:85vh;overflow:auto;border-radius:12px;padding:22px;box-shadow:0 6px 30px #0005;font:14px system-ui}
    .gm-label-suggestions-panel,.gm-label-suggestions-panel :is(h2,p,li,strong,small,span){user-select:text!important;-moz-user-select:text!important;cursor:text}
    .gm-label-suggestions-actions button:disabled{opacity:.45;cursor:not-allowed}
    .gm-label-suggestions-panel h2{font-size:20px;margin:0 0 12px}.gm-label-suggestions-panel p{line-height:1.5}
    .gm-label-suggestions-actions{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.gm-label-suggestions-actions button{padding:7px 12px;cursor:pointer}
    .gm-label-suggestion-confirmed{display:inline-flex;align-items:center;gap:4px;max-inline-size:100%;box-sizing:border-box;font:400 .85em/1.25 Arial,sans-serif;border-radius:.35em;padding:2px 6px;margin-inline-end:8px}
    .gm-label-suggestions-results{list-style:none;padding:0}.gm-label-suggestions-results li{padding:10px 0;border-top:1px solid GrayText;overflow-wrap:anywhere}
    .gm-label-suggestions-results small{display:block;margin-top:6px}.gm-label-suggestions-panel [role=status]{white-space:pre-wrap}
  `;doc.documentElement.append(style);
  function removeChips(){for(const node of tree.querySelectorAll('.gm-label-suggestion-chip'))node.remove();}
  function render(){
    renderFrame=null;if(closed)return;
    const definitions=mail.tags.getAllTags(),tags=new Set(definitions.map(tag=>tag.key)),byMessage=new Map();
    for(const proposal of active)if(tags.has(proposal.labelKey))for(const key of proposal.messageKeys)byMessage.set(key,proposal);
    for(const row of tree.querySelectorAll('tr.table-layout')){
      const existing=row.querySelector('.gm-label-suggestion-chip');
      let proposal=null;
      try{
        const header=win.gDBView?.getMsgHdrAt(row.index);
        if(header && !assignedTags(header,definitions).length)proposal=byMessage.get(labelSuggestionHeaderKey(header));
      }catch(_){}
      if(!proposal){existing?.remove();continue;}
      const line=row.querySelector('.subject-line');if(!line)continue;
      const caption='Suggested: '+proposal.labelName;
      if(existing?.textContent===caption)continue;
      existing?.remove();const chip=doc.createElement('span');chip.className='gm-label-suggestion-chip';chip.textContent=caption;
      chip.title='Tentative local suggestion only. No label has been assigned. Open Suggest labels to review.';line.prepend(chip);
    }
  }
  function schedule(){if(closed || renderFrame!==null || !active.length)return;renderFrame=win.requestAnimationFrame(render);}
  const threadPane=doc.getElementById('threadPane'),bulkToolbar=doc.querySelector('.gm-reading-toolbar');
  function placeButton(){
    if(closed)return;
    if(threadPane?.classList.contains('gm-bulk-selecting') && bulkToolbar && !bulkToolbar.hidden){
      if(button.parentNode!==bulkToolbar)bulkToolbar.append(button);
    }else if(button.parentNode!==settings.parentNode || settings.nextElementSibling!==button)settings.after(button);
  }
  const toolbarObserver=new win.MutationObserver(placeButton);
  if(threadPane)toolbarObserver.observe(threadPane,{attributes:true,attributeFilter:['class']});
  if(bulkToolbar)toolbarObserver.observe(bulkToolbar,{attributes:true,attributeFilter:['hidden']});
  placeButton();
  const observer=new win.MutationObserver(schedule);observer.observe(tree,{childList:true,subtree:true});
  // Any live membership/label change invalidates the displayed snapshot. Never
  // reinterpret tentative proposals as real labels or propagate them to new mail.
  const nativeListener={msgAdded:()=>invalidate(true),msgsDeleted:()=>invalidate(true),msgsMoveCopyCompleted:()=>invalidate(true),
    msgPropertyChanged(_header,property){
      if(property===undefined || /^(keywords|label|threadid|message-id|references|subject|author|recipients|cclist)$/i.test(property))invalidate();
    }};
  function invalidate(membership=false){revision++;if(membership)membershipRevision++;if(!active.length)return;active=[];removeChips();}
  const tagObserver={observe:()=>invalidate(true)};prefs.addObserver("mailnews.tags.",tagObserver);
  mail.mfn.addListener(nativeListener,Ci.nsIMsgFolderNotificationService.msgAdded | Ci.nsIMsgFolderNotificationService.msgsDeleted |
    Ci.nsIMsgFolderNotificationService.msgsMoveCopyCompleted | Ci.nsIMsgFolderNotificationService.msgPropertyChanged);
  function disposePanel(){controller?.abort();controller=null;panel?.remove();panel=null;button.focus();}
  function open(){
    if(panel)return;
    const selected=Array.from(win.gDBView?.getSelectedMsgHdrs?.() || []);
    const shade=doc.createElement('div');shade.className='gm-label-suggestions-shade';panel=shade;
    const dialog=doc.createElement('section');dialog.className='gm-label-suggestions-panel';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
    const heading=doc.createElement('h2');heading.id='gm-label-suggestions-title';heading.textContent='Local label suggestions · Experimental';dialog.setAttribute('aria-labelledby',heading.id);
    const intro=doc.createElement('p');intro.textContent='Selected: '+selected.length+' messages. Only conversations with no user labels are eligible. Dry run changes nothing. Run saves tentative suggestions separately; neither action assigns real labels or creates labels. Run replaces the previous saved report. Confirm explicitly assigns a real label. Undo is available until this report is closed or replaced.';
    const limits=doc.createElement('p');limits.textContent='Header-only prototype: learns participants and subject words from up to 2,500 labeled conversations in the selected accounts. Reads up to 100,000 local headers (including Sent/Archives). No message bodies, network requests, or automatic background runs. Supports up to '+GM_LABEL_SUGGESTION_SELECTION_LIMIT+' selected messages per run.';
    const actions=doc.createElement('div');actions.className='gm-label-suggestions-actions';
    const status=doc.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const selectionAllowed=selected.length>0 && selected.length<=GM_LABEL_SUGGESTION_SELECTION_LIMIT;
    const selectionMessage=!selected.length?'Select 1–'+GM_LABEL_SUGGESTION_SELECTION_LIMIT+' messages in the list or search results, then reopen this panel.':selected.length>GM_LABEL_SUGGESTION_SELECTION_LIMIT?'Selected '+selected.length+' messages. The limit is '+GM_LABEL_SUGGESTION_SELECTION_LIMIT+' per run; reduce the selection and reopen this panel.':'Ready to analyze '+selected.length+' selected messages. Choose Dry run or Run.';
    status.textContent=selectionMessage;
    const results=doc.createElement('ul');results.className='gm-label-suggestions-results';
    let busy=false;
    const makeButton=(caption,action)=>{const b=doc.createElement('button');b.type='button';b.textContent=caption;b.addEventListener('click',action);actions.append(b);return b;};
    const dry=makeButton('Dry run',()=>analyze(true)),run=makeButton('Run · save suggestions',()=>analyze(false));
    const cancel=makeButton('Cancel analysis',()=>controller?.abort());cancel.disabled=true;
    makeButton('Clear saved suggestions',()=>{
      if(busy)return;invalidate();if(prefs.prefHasUserValue(GM_LABEL_SUGGESTION_PREF))prefs.clearUserPref(GM_LABEL_SUGGESTION_PREF);reviewRows=[];drawReview();status.textContent='Saved tentative suggestions cleared. Real label assignments were not changed.';
    });
    makeButton('Close',disposePanel);
    let reviewRows=[];
    const reviewActions=doc.createElement('div');reviewActions.className='gm-label-suggestions-actions';
    function reviewButton(caption,action){const b=doc.createElement('button');b.type='button';b.textContent=caption;b.addEventListener('click',action);reviewActions.append(b);return b;}
    const selectAll=reviewButton('Select all suggestions',()=>{if(busy)return;for(const entry of reviewRows)if(entry.state==='pending')entry.selected=true;drawReview();});
    const confirmSelected=reviewButton('Confirm selected · assign labels',()=>review('confirm',reviewRows.filter(entry=>entry.selected && entry.canConfirm && entry.state==='pending')));
    const discardSelected=reviewButton('Discard selected',()=>review('discard',reviewRows.filter(entry=>entry.selected && entry.state==='pending')));
    function syncReviewButtons(){
      selectAll.disabled=busy || !reviewRows.some(entry=>entry.state==='pending');
      confirmSelected.disabled=busy || !reviewRows.some(entry=>entry.selected && entry.canConfirm && entry.state==='pending');
      discardSelected.disabled=busy || !reviewRows.some(entry=>entry.selected && entry.state==='pending');
    }
    function removeProposals(entries,discard=false){
      const proposals=entries.filter(entry=>!discard || entry.saved).map(entry=>entry.proposal);
      const keys=new Set(entries.map(entry=>labelSuggestionProposalKey(entry.proposal)));
      active=active.filter(proposal=>!keys.has(labelSuggestionProposalKey(proposal)));render();
      if(proposals.length)removeSavedLabelSuggestions(prefs,proposals);
    }
    function drawReview(){
      const definitions=new Map(mail.tags.getAllTags().map(tag=>[tag.key,tag]));
      results.replaceChildren();
      for(const entry of reviewRows){
        const row=entry.proposal,item=doc.createElement('li'),subject=doc.createElement('strong');subject.textContent=row.subject || 'Saved conversation: '+(row.messageIds?.[0] || '(identity unavailable)');
        item.append(subject,doc.createElement('br'));
        const note=doc.createElement('small');
        if(entry.state==='pending'){
          const chip=doc.createElement('span');chip.className='gm-label-suggestion-chip';chip.textContent='Suggested: '+row.labelName;item.append(chip);
          note.textContent=entry.canConfirm?row.strength+' (heuristic, not a probability). '+row.examples+' labeled training conversations. Shared evidence: '+(row.evidence||[]).map(value=>value.replace(/^person:/,'participant ').replace(/^word:/,'subject word ')).join(', '):'Saved snapshot. Rerun analysis before confirming it.';
          const choices=doc.createElement('div');choices.className='gm-label-suggestions-actions';
          const chosen=doc.createElement('input');chosen.type='checkbox';chosen.checked=entry.selected;chosen.disabled=busy;
          chosen.setAttribute('aria-label','Select suggestion '+row.labelName+' for '+(row.subject || row.messageIds?.[0] || 'saved conversation'));
          chosen.addEventListener('change',()=>{entry.selected=chosen.checked;syncReviewButtons();});choices.append(chosen);
          const confirm=doc.createElement('button');confirm.type='button';confirm.textContent='Confirm · assign label';confirm.disabled=busy || !entry.canConfirm;confirm.addEventListener('click',()=>review('confirm',[entry]));
          const discard=doc.createElement('button');discard.type='button';discard.textContent='Discard';discard.disabled=busy;discard.addEventListener('click',()=>review('discard',[entry]));choices.append(confirm,discard);item.append(choices);
        }else if(entry.state==='confirmed' || entry.state==='failed'){
          note.textContent=entry.state==='confirmed'?'Assigned to the conversation.':entry.reason;
          if(entry.state==='confirmed'){
            const tag=definitions.get(row.labelKey),chip=doc.createElement('span'),colors=chipColors(tag?.color);
            chip.className='tag gm-label-suggestion-confirmed';chip.textContent=tag?.tag || row.labelName;
            chip.style.backgroundColor=colors.background;chip.style.color=colors.foreground;
            chip.title='Confirmed label: '+chip.textContent;chip.setAttribute('aria-label',chip.title);item.append(chip);
          }
          if(entry.receipt){const undo=doc.createElement('button');undo.type='button';undo.textContent='Undo confirmation';undo.disabled=busy;undo.addEventListener('click',()=>{
            if(busy)return;
            try{undoConfirmedLabelSuggestion(entry.receipt,mail,(headers,key,add)=>applyConversationLabel(headers,key,add,null,null,{exactScope:true}));entry.state='undone';entry.reason='Confirmation undone. Other labels were preserved.';entry.receipt=null;status.textContent='Confirmation undone.';}
            catch(error){entry.reason='Undo could not complete: '+error.message;status.textContent=entry.reason;}
            drawReview();
          });item.append(undo);}
        }else note.textContent=entry.reason || (entry.state==='discarded'?'Discarded: '+row.labelName+'. No real labels were changed.':'Skipped.');
        item.append(note);results.append(item);
      }
      syncReviewButtons();
    }
    async function review(action,entries){
      if(busy || closed || !entries.length)return;
      if(action==='discard'){
        try{removeProposals(entries,true);for(const entry of entries){entry.state='discarded';entry.selected=false;}status.textContent=entries.length+' suggestions discarded. Real labels were not changed.';}
        catch(error){status.textContent='Could not discard saved suggestions: '+error.message;}
        drawReview();return;
      }
      entries=entries.filter(entry=>entry.canConfirm && entry.state==='pending');if(!entries.length)return;
      busy=true;dry.disabled=run.disabled=true;cancel.disabled=false;cancel.textContent='Cancel confirmation';drawReview();
      const abort=new win.AbortController();controller=abort;const startedAtRevision=revision;
      const current=()=>!closed && panel===shade && controller===abort;
      const yieldControl=()=>new Promise(resolve=>win.setTimeout(resolve,0));let confirmed=0,processed=0;const reviewed=[];
      try{
        status.textContent='Rechecking current conversation labels before confirmation…';
        const prepared=await prepareLabelSuggestionConfirmations(entries.map(entry=>entry.proposal),mail,{signal:abort.signal,maxHeaders:100000,virtualFlag:Ci.nsMsgFolderFlags.Virtual,yieldControl,
          progress:count=>{if(current())status.textContent='Rechecking local headers: '+count.toLocaleString()+'…';}});
        if(!current())return;
        if(abort.signal.aborted){status.textContent='Confirmation canceled. No labels were assigned.';return;}
        if(revision!==startedAtRevision)throw new Error('Mail or labels changed while rechecking. Rerun analysis.');
        const checkedMembership=membershipRevision;
        for(const entry of entries){
          if(!current() || abort.signal.aborted)break;
          if(membershipRevision!==checkedMembership)throw new Error('Conversation membership or label definitions changed. Unconfirmed suggestions were left untouched; rerun analysis.');
          const plan=prepared.get(labelSuggestionProposalKey(entry.proposal));
          try{
            const outcome=confirmPreparedLabelSuggestion(plan || {status:'skipped',reason:'Conversation is unavailable. Rerun analysis.'},mail,
              (headers,key,add)=>applyConversationLabel(headers,key,add,null,null,{exactScope:true}));
            entry.state=outcome.status;entry.reason=outcome.reason;entry.receipt=outcome.receipt;entry.selected=false;
            if(outcome.labelName)entry.proposal.labelName=outcome.labelName;
            if(outcome.status==='confirmed')confirmed++;
          }catch(error){entry.state='failed';entry.reason='Could not confirm: '+error.message;entry.selected=false;}
          reviewed.push(entry);processed++;status.textContent='Reviewed '+processed+' of '+entries.length+'; '+confirmed+' confirmed.';
          if(processed%20===0 || processed===entries.length)drawReview();await yieldControl();
        }
        if(current())status.textContent=abort.signal.aborted?'Confirmation canceled. '+confirmed+' conversations were confirmed; remaining suggestions were not applied.':confirmed+' conversations confirmed; '+(processed-confirmed)+' skipped or failed. Undo is available on each confirmed row while this report remains open.';
      }catch(error){if(current())status.textContent=(abort.signal.aborted?'Confirmation canceled.':'Confirmation stopped: '+error.message)+' '+confirmed+' conversations were confirmed; remaining suggestions were not applied.';}
      finally{
        if(reviewed.length)try{removeProposals(reviewed);}catch(error){if(current())status.textContent+=' Saved report cleanup failed: '+error.message;}
        if(current()){busy=false;dry.disabled=run.disabled=!selectionAllowed;cancel.disabled=true;cancel.textContent='Cancel analysis';controller=null;drawReview();}
      }
    }
    function previous(){
      try{
        const saved=JSON.parse(prefs.getStringPref(GM_LABEL_SUGGESTION_PREF,'null'));
        if(saved?.version!==1 || !Array.isArray(saved.proposals))return;
        const note=doc.createElement('p');note.textContent='Previous saved run: '+saved.proposals.length+' tentative proposals. This is a snapshot; rerun to check current eligibility. Saved proposals are not automatically displayed after a restart.';dialog.append(note);
        reviewRows=saved.proposals.slice(0,GM_LABEL_SUGGESTION_SELECTION_LIMIT).map(proposal=>({proposal,canConfirm:false,saved:true,state:'pending',selected:false}));drawReview();
      }catch(_){status.textContent+=' The previous saved report could not be read.';}
    }
    async function analyze(dryRun){
      if(busy || closed)return;
      if(!selectionAllowed){status.textContent=selectionMessage;return;}
      busy=true;dry.disabled=run.disabled=true;cancel.disabled=false;reviewRows=[];drawReview();
      const abort=new win.AbortController(),startedAtRevision=revision;controller=abort;
      const current=()=>!closed && panel===shade && controller===abort;
      const yieldControl=()=>new Promise(resolve=>win.setTimeout(resolve,0));
      try{
        status.textContent='Reading local account headers…';
        const snapshot=await collectLabelSuggestionRecords(selected,mail,{signal:abort.signal,maxHeaders:100000,
          virtualFlag:Ci.nsMsgFolderFlags.Virtual,yieldControl,progress:count=>{if(current())status.textContent='Reading local headers: '+count.toLocaleString()+'…';}});
        const report=await analyzeLabelSuggestions(snapshot.records,new Set(selected.map(labelSuggestionHeaderKey)),snapshot.tags,{
          signal:abort.signal,yieldControl,ownAddresses:new Set(Array.from(mail.accounts.allIdentities,identity=>identity.email.toLowerCase()))});
        if(!current())return;
        if(abort.signal.aborted){status.textContent='Analysis canceled. Nothing from this analysis was saved.';return;}
        if(revision!==startedAtRevision)throw new Error('Mail or labels changed during analysis. Rerun to check current eligibility.');
        const saved=saveLabelSuggestionReport(prefs,report,dryRun);
        if(!dryRun){active=saved.proposals;render();}
        status.textContent=(dryRun?'Dry run complete — nothing saved.':'Run complete — tentative suggestions saved locally; no real labels assigned.')+
          '\n'+saved.proposals.length+' suggestions; '+(report.results.length-saved.proposals.length)+' skipped. Learned from '+report.training+' labeled conversations; inspected '+report.messages.toLocaleString()+' headers.'+
          (report.trainingLimited?' Training safety limits applied; suggestions use a bounded sample.':'');
        reviewRows=report.results.map(proposal=>({proposal,canConfirm:true,saved:!dryRun,state:proposal.status==='suggested'?'pending':'skipped',reason:proposal.reason,selected:false}));drawReview();
      }catch(error){if(current())status.textContent=abort.signal.aborted?'Analysis canceled. Nothing from this analysis was saved.':'Analysis stopped: '+error.message;}
      finally{if(current()){busy=false;dry.disabled=run.disabled=false;cancel.disabled=true;controller=null;drawReview();}}
    }
    dry.disabled=run.disabled=!selectionAllowed;
    dialog.append(heading,intro,limits,actions,status,reviewActions,results);previous();syncReviewButtons();shade.append(dialog);doc.documentElement.append(shade);
    shade.addEventListener('keydown',event=>{
      if((event.metaKey || event.ctrlKey) && !event.altKey){
        if(event.key?.toLowerCase()==='c')return; // Allow Thunderbird’s native Copy command.
        if(event.key?.toLowerCase()==='a'){event.preventDefault();event.stopImmediatePropagation();win.getSelection()?.selectAllChildren(dialog);return;}
      }
      event.stopPropagation();if(event.key==='Escape'){event.preventDefault();disposePanel();}
      if(event.key==='Tab'){const buttons=Array.from(dialog.querySelectorAll('button')).filter(b=>!b.disabled);const first=buttons[0],last=buttons.at(-1);if(event.shiftKey && doc.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey && doc.activeElement===last){event.preventDefault();first.focus();}}});
    dry.focus();
  }
  // Keep native numeric tag commands and L out of this modal report too.
  function guardReportKeys(event){
    if(panel && (/^[0-9]$/.test(event.key||'') || event.key?.toLowerCase()==='l')){
      event.preventDefault();event.stopImmediatePropagation();
    }
  }
  win.addEventListener?.('keydown',guardReportKeys,true);
  button.addEventListener('click',open);
  return {close(){closed=true;win.removeEventListener?.('keydown',guardReportKeys,true);controller?.abort();toolbarObserver.disconnect();observer.disconnect();mail.mfn.removeListener(nativeListener);prefs.removeObserver("mailnews.tags.",tagObserver);if(renderFrame!==null)win.cancelAnimationFrame(renderFrame);panel?.remove();removeChips();style.remove();button.removeEventListener('click',open);button.remove();}};
}
