/* Durable, serialized snooze jobs. The adapter only handles native folders and
 * headers; the journal never contains message bodies or account credentials. */
function createSnoozeService(adapter, {now=()=>Date.now(),schedule=setTimeout,unschedule=clearTimeout}={}) {
  let jobs=adapter.load(),queue=Promise.resolve(),timer=null,closed=false,checking=null;
  if(!Array.isArray(jobs)||jobs.length>1000||jobs.some(job=>
    !job||typeof job.id!=='string'||!Number.isFinite(job.due)||!Number.isFinite(job.created)||
    !['preparing','sleeping','waking'].includes(job.state)||!Array.isArray(job.messages)||!job.messages.length||job.messages.length>5000||
    job.messages.some(message=>!message||['account','id','source','storage'].some(key=>typeof message[key]!=='string'||!message[key]||message[key].length>8192)||!Number.isFinite(message.date)||!Number.isFinite(message.size))
  ))throw new Error('Invalid snooze journal');
  const observers=new Set();
  function save(){if(closed)return;adapter.save(jobs);for(const callback of observers){try{callback();}catch(error){adapter.report(error);}}}
  function arm(){
    if(timer!==null)unschedule(timer);
    if(closed||!jobs.length){timer=null;return;}
    const due=Math.min(...jobs.map(job=>job.due));
    timer=schedule(()=>{timer=null;check().catch(()=>{});},due<=now()?30000:Math.min(30000,Math.max(1000,due-now())));
  }
  function run(task){const queued=Date.now();const result=queue.then(()=>{adapter.timing?.('queue-wait',queued);if(closed)throw new Error('Snooze closed');return task();});queue=result.catch(error=>{if(error.code!=='SNOOZE_CANCELLED')adapter.report(error);}).finally(arm);return result;}
  function check(){
    if(!checking){
      checking=run(recover);
      checking.then(()=>{checking=null;},()=>{checking=null;});
    }
    return checking;
  }
  function accepted(callback){try{callback?.();}catch(error){adapter.report(error);}}
  async function moveMessages(job,kind){
    if(adapter[kind+'Many']){await adapter[kind+'Many'](job,()=>{if(!closed)save();});return;}
    for(const message of job.messages){if(closed)return;await adapter[kind](job,message);message[kind==='hide'?'hidden':'restored']=true;save();}
  }
  function ensureRequested(shouldProceed){
    if(shouldProceed&&!shouldProceed()){const error=new Error('Snooze cancelled');error.code='SNOOZE_CANCELLED';throw error;}
  }
  function beginWaking(selected,reason){
    const previous=selected.map(job=>({job,state:job.state,wakeReason:job.wakeReason}));
    for(const job of selected){job.wakeReason=reason==='cancel'?'cancel':job.wakeReason||reason;job.state='waking';}
    try{save();}catch(error){for(const item of previous){item.job.state=item.state;if(item.wakeReason===undefined)delete item.job.wakeReason;else item.job.wakeReason=item.wakeReason;}throw error;}
  }
  async function finish(job,reason,onAccepted){
    beginWaking([job],reason);accepted(onAccepted);
    await moveMessages(job,'restore');
    if(closed)return;
    jobs=jobs.filter(item=>item!==job);save();
    if(job.wakeReason!=='cancel'&&job.messages.some(message=>!message.cancelled))adapter.notify(job,job.wakeReason);
  }
  async function recover(){
    adapter.beginCheck?.();
    try{for(const job of [...jobs]){
      if(closed)return;
      try{
        if(job.state==='preparing'){
          await moveMessages(job,'hide');
          if(closed)return;
          job.state='sleeping';delete job.error;save();
        }
        if(job.state==='waking'||job.due<=now()||await adapter.hasReply(job))await finish(job,'due');
      }catch(error){job.error=error.message;save();adapter.report(error);}
    }}finally{adapter.endCheck?.();}
  }
  return {
    list(){return jobs.map(job=>({...job,messages:job.messages.map(message=>({...message}))}));},
    subscribe(callback){observers.add(callback);return ()=>observers.delete(callback);},
    snooze(headers,due,onAccepted,shouldProceed){return run(async()=>{
      ensureRequested(shouldProceed);
      if(!Number.isFinite(due)||due<=now())throw new Error('Choose a future date and time.');
      if(jobs.length>=1000)throw new Error('Too many snoozed conversations.');
      const batches=adapter.groups?adapter.groups(headers):[headers];
      const planned=[];
      for(const batch of batches){
        const job=await adapter.prepare(batch,due);
        if(!job.messages.length)throw new Error('Select a message to snooze.');
        if([...jobs,...planned].some(existing=>existing.messages.some(a=>job.messages.some(b=>a.account===b.account&&a.id===b.id))))throw new Error('This conversation is already snoozed.');
        job.due=due;job.created=now();job.state='preparing';planned.push(job);
      }
      if(jobs.length+planned.length>1000)throw new Error('Too many snoozed conversations.');
      ensureRequested(shouldProceed);
      if(!planned.length)throw new Error('Select a message to snooze.');
      const previousLength=jobs.length;
      jobs.push(...planned);try{save();}catch(error){jobs.splice(previousLength);throw error;}
      accepted(onAccepted);
      let failed=false;
      if(adapter.hideJobs){
        const failures=await adapter.hideJobs(planned,save);
        if(closed)return;
        for(const job of planned){
          if(failures.has(job)){const error=failures.get(job);job.error=error.message;adapter.report(error);failed=true;}
          else {job.state='sleeping';delete job.error;}
        }
        save();
      }else for(const job of planned){
        try{
          await moveMessages(job,'hide');
          if(closed)return;
          job.state='sleeping';delete job.error;save();
        }catch(error){job.error=error.message;save();adapter.report(error);failed=true;}
      }
      if(failed)throw new Error('Some conversations are still being moved. Saved snoozes will be retried.');
      return planned[0]?.id;
    });},
    reschedule(id,due,onAccepted,shouldProceed){return run(async()=>{ensureRequested(shouldProceed);if(!Number.isFinite(due)||due<=now())throw new Error('Choose a future date and time.');const job=jobs.find(job=>job.id===id);if(!job)throw new Error('Snooze no longer available.');if(job.state==='waking')throw new Error('This conversation is already returning to Inbox.');const previous=job.due;job.due=due;try{save();}catch(error){job.due=previous;throw error;}accepted(onAccepted);});},
    cancelMany(ids,onAccepted,shouldProceed){return run(async()=>{
      ensureRequested(shouldProceed);
      const selected=jobs.filter(job=>ids.includes(job.id));
      if(!selected.length){accepted(onAccepted);return;}
      beginWaking(selected,'cancel');accepted(onAccepted);
      if(adapter.restoreJobs){
        const failures=await adapter.restoreJobs(selected,save);
        if(closed)return;
        jobs=jobs.filter(job=>!selected.includes(job)||failures.has(job));
        for(const [job,error] of failures){job.error=error.message;adapter.report(error);}save();
        if(failures.size)throw failures.values().next().value;
      }else for(const job of selected)await finish(job,'cancel');
    });},
    cancel(id,onAccepted,shouldProceed){return run(async()=>{ensureRequested(shouldProceed);const job=jobs.find(job=>job.id===id);if(job)await finish(job,'cancel',onAccepted);else accepted(onAccepted);});},
    forget(predicate){return run(async()=>{
      let changed=false;
      for(const job of jobs)if(job.state==='sleeping'){
        const retained=[];for(const message of job.messages)if(!await predicate(message))retained.push(message);
        if(retained.length!==job.messages.length)changed=true;
        job.messages=retained;
      }
      if(changed){jobs=jobs.filter(job=>job.messages.length);save();}
    });},
    check,
    close(){closed=true;if(timer!==null)unschedule(timer);observers.clear();adapter.close?.();},
  };
}

function snoozeSelectedMessages(view,conversation=null,threaded=false){
  if(conversation?.length)return conversation;
  const selected=view?.getSelectedMsgHdrs()||[];
  if(!threaded)return selected;
  const messages=[],seen=new Set();
  for(const header of selected){
    const thread=view.getThreadContainingMsgHdr(header);
    for(let i=0;i<thread.numChildren;i++){
      const child=thread.getChildHdrAt(i),key=child.folder.URI+'#'+child.messageKey;
      if(!seen.has(key)){seen.add(key);messages.push(child);}
    }
  }
  return messages;
}
