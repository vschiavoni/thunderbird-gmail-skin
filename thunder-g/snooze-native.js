function createNativeSnooze({onTiming=null}={}) {
  function timing(phase,started,details={}){if(onTiming){try{onTiming({phase,startedMs:started,ms:Date.now()-started,...details});}catch(error){console.warn('Thunder-G snooze timing:',error);}}}
  const pref='extensions.thunderg.snooze.v1',folderName='Thunder-G Snoozed',pendingFolder='thunderg:snoozed';
  let closed=false;
  const folderFlags=Ci.nsMsgFolderFlags;
  const accountId=server=>JSON.stringify([server.key,server.type,server.hostname||server.hostName||'',server.username]);
  const messageId=header=>(header.messageId||'').replace(/^<|>$/g,'');
  function serverFor(message){
    const server=[...MailServices.accounts.allServers].find(server=>accountId(server)===message.account);
    if(!server)throw new Error('The snoozed account is unavailable.');return server;
  }
  function folderFor(message,uri){
    const root=serverFor(message).rootFolder;
    if(uri===pendingFolder){if(root.containsChildNamed(folderName))return root.getChildNamed(folderName);throw new Error('The snoozed folder is unavailable.');}
    const folder=[root,...root.descendants].find(folder=>folder.URI===uri);
    if(!folder)throw new Error('The snoozed folder is unavailable.');return folder;
  }
  let lookupCache=null;
  function matches(folder,message){
    let index=lookupCache?.get(folder.URI);
    if(!index){
      index=new Map();
      for(const header of folder.messages){const key=JSON.stringify([messageId(header),header.date]);const headers=index.get(key)||[];headers.push(header);index.set(key,headers);}
      lookupCache?.set(folder.URI,index);
    }
    return index.get(JSON.stringify([message.id,message.date]))||[];
  }
  const returning=new Map();
  const returnKey=message=>JSON.stringify([message.account,message.id,message.date]);
  let orderRevision=0;
  function markReturned(header,time){
    header.setStringProperty('thunderGSnoozeReturned',String(time));
    orderRevision++;
  }
  function stampReturned(header){
    const key=JSON.stringify([accountId(header.folder.server),messageId(header),header.date]);
    const entry=returning.get(key);
    if(entry){markReturned(header,entry);returning.delete(key);}
  }
  function unique(folder,message){const found=matches(folder,message);if(found.length>1)throw new Error('Ambiguous snoozed message.');return found[0]||null;}
  const storageRequests=new Map();
  function storage(server){
    const key=accountId(server);
    if(storageRequests.has(key))return storageRequests.get(key);
    const request=createStorage(server);storageRequests.set(key,request);
    request.then(()=>storageRequests.delete(key),()=>storageRequests.delete(key));
    return request;
  }
  async function createStorage(server){
    const root=server.rootFolder;
    if(!root.containsChildNamed(folderName))root.createSubfolder(folderName,null);
    for(let attempt=0;attempt<100;attempt++){
      if(root.containsChildNamed(folderName))return root.getChildNamed(folderName);
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    throw new Error('The Snoozed folder could not be created.');
  }
  // Retain unfinished native operations across retries: a timeout does not
  // mean Thunderbird cancelled the move, so never issue a second copy.
  const copies=new Map(),batches=new Map();
  function submitCopy(header,destination,move,resolve,reject){
    const key=JSON.stringify([header.folder.URI,destination.URI,move]);
    let batch=batches.get(key);
    if(!batch){
      batch={headers:[],callbacks:[]};batches.set(key,batch);
      Promise.resolve().then(()=>{
        batches.delete(key);
        const started=Date.now();
        const finish=error=>{timing('native-copy',started,{count:batch.headers.length,success:!error});lookupCache?.delete(batch.headers[0].folder.URI);lookupCache?.delete(destination.URI);for(const callback of batch.callbacks)error?callback.reject(error):callback.resolve();};
        if(closed){finish(new Error('Snooze closed'));return;}
        try{MailServices.copy.copyMessages(batch.headers[0].folder,batch.headers,destination,move,{
          QueryInterface:ChromeUtils.generateQI(['nsIMsgCopyServiceListener']),
          onStartCopy(){},onProgress(){},setMessageKey(){},getMessageId(){return '';},
          onStopCopy(status){finish(Components.isSuccessCode(status)?null:new Error('Snooze move failed ('+status+').'));},
        },null,false);}catch(error){finish(error);}
      });
    }
    batch.headers.push(header);batch.callbacks.push({resolve,reject});
  }
  function copy(header,destination,move){
    if(closed)return Promise.reject(new Error('Snooze closed'));
    const key=JSON.stringify([accountId(header.folder.server),messageId(header),header.date,header.folder.URI,destination.URI,move]);
    let operation=copies.get(key);
    if(!operation){
      operation=new Promise((resolve,reject)=>submitCopy(header,destination,move,resolve,reject));
      copies.set(key,operation);
      operation.then(()=>copies.delete(key),()=>copies.delete(key));
    }
    return waitCopy(operation);
  }
  function waitCopy(operation){
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Snooze move is still pending. Saved snoozes will be retried.')),60000);
      operation.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
    });
  }
  async function pendingCopies(message){
    for(const [key,operation] of copies){
      const [account,id,date]=JSON.parse(key);
      if(account===message.account&&id===message.id&&date===message.date)await waitCopy(operation);
    }
  }
  const refreshes=new Map();
  function refresh(folder){
    const key=folder.URI;
    if(refreshes.has(key))return refreshes.get(key);
    const pending=refreshFolder(folder);
    refreshes.set(key,pending);
    pending.then(()=>refreshes.delete(key),()=>refreshes.delete(key));
    return pending;
  }
  async function refreshFolder(folder){
    lookupCache?.delete(folder.URI);
    if(folder.server.type!=='imap')return true;
    const started=Date.now();
    const fresh=await new Promise((resolve,reject)=>{
      // A folder that is already updating may not start a new URL or invoke
      // this listener. Continue with cached headers and bounded arrival checks.
      const timer=setTimeout(()=>resolve(false),2000);
      try{folder.QueryInterface(Ci.nsIMsgImapMailFolder).updateFolderWithListener(null,{
        QueryInterface:ChromeUtils.generateQI(['nsIUrlListener']),OnStartRunningUrl(){},
        OnStopRunningUrl(_url,status){clearTimeout(timer);Components.isSuccessCode(status)?resolve(true):reject(new Error('The snoozed folder is unavailable.'));},
      });}catch(error){clearTimeout(timer);reject(error);}
    });
    if(closed)throw new Error('Snooze closed');
    lookupCache?.delete(folder.URI);
    timing('folder-refresh',started,{fresh});
    return fresh;
  }
  async function arrived(folder,message){
    for(let attempt=0;attempt<300;attempt++){
      const cached=unique(folder,message);if(cached)return cached;
      if(attempt%50===0){await refresh(folder);const header=unique(folder,message);if(header)return header;}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    throw new Error('The snoozed message is unavailable.');
  }
  const recoveredJobs=new WeakSet();
  let replyCache=null;
  const adapter={
    timing,
    beginCheck(){replyCache=new Map();},endCheck(){replyCache=null;},
    close(){closed=true;returning.clear();},
    load(){const jobs=JSON.parse(Services.prefs.getStringPref(pref,'[]'));if(Array.isArray(jobs))for(const job of jobs)if(job&&job.state!=='sleeping')recoveredJobs.add(job);return jobs;},
    save(jobs){const started=Date.now();const text=JSON.stringify(jobs);if(text.length>250000)throw new Error('Snooze storage is full.');Services.prefs.setStringPref(pref,text);Services.prefs.savePrefFile(null);timing('journal-write',started);},
    report(error){console.error('Thunder-G snooze:',error);},
    groups(headers){
      const groups=[];
      for(const header of headers){
        if(!header?.folder?.server)throw new Error('This message cannot be snoozed.');
        const account=accountId(header.folder.server),tokens=new Set([messageId(header)]);
        for(let i=0;i<header.numReferences;i++)tokens.add((header.getStringReference(i)||'').replace(/^<|>$/g,''));
        const linked=groups.filter(group=>group.account===account&&[...tokens].some(id=>id&&group.tokens.has(id)));
        const group={account,tokens,headers:[]};
        for(const old of linked){old.headers.forEach(header=>group.headers.push(header));old.tokens.forEach(id=>tokens.add(id));groups.splice(groups.indexOf(old),1);}
        group.headers.push(header);groups.push(group);
      }
      return groups.map(group=>group.headers);
    },
    async prepare(headers,due){
      const messages=[],seen=new Set();
      if(headers.length>5000)throw new Error('Too many messages to snooze at once.');
      // A conversation renderer may include the same Gmail message under more
      // than one label. Prefer its Inbox copy, then Sent, and act only once.
      const priority=header=>(header.folder.flags&folderFlags.Inbox)?2:(header.folder.flags&folderFlags.SentMail)?1:0;
      headers=[...headers].sort((a,b)=>priority(b)-priority(a));
      for(const header of headers){
        const source=header.folder,server=source?.server;
        if(!server||!['imap','pop3','none'].includes(server.type)||!messageId(header))throw new Error('This message cannot be snoozed.');
        if(!server.rootFolder.getFolderWithFlags(folderFlags.Inbox))throw new Error('This account has no Inbox.');
        if(source.flags&(folderFlags.Trash|folderFlags.Junk|folderFlags.Drafts))throw new Error('Move this conversation out of Trash, Spam or Drafts first.');
        const key=accountId(server)+'#'+messageId(header);if(seen.has(key))continue;seen.add(key);
        const destination=server.rootFolder.containsChildNamed(folderName)?server.rootFolder.getChildNamed(folderName):null;
        if(destination?.URI===source.URI)throw new Error('Use Snoozed to change this reminder.');
        messages.push({account:accountId(server),id:messageId(header),date:header.date,size:header.messageSize,
          source:source.URI,storage:destination?.URI||pendingFolder,keepSource:!!(source.flags&folderFlags.SentMail)});
      }
      return {id:Services.uuid.generateUUID().toString(),subject:headers[0]?.mime2DecodedSubject||'',messages,due};
    },
    async hide(job,message){
      await pendingCopies(message);
      const destination=message.storage===pendingFolder?await storage(serverFor(message)):folderFor(message,message.storage);
      message.storage=destination.URI;
      // Fresh commands already have a valid source header. Reserve SELECT for
      // recovery/retry, where a previous move may have outlived its checkpoint.
      if(recoveredJobs.has(job)||job.error||message.hidden)await refresh(destination);
      // A successful copy can outlive a shutdown before its journal checkpoint.
      if(unique(destination,message))return;
      if(message.hidden)throw new Error('A snoozed message was moved or deleted.');
      const source=folderFor(message,message.source);
      let header=unique(source,message);
      if(!header){await Promise.all([refresh(source),refresh(destination)]);if(unique(destination,message))return;header=unique(source,message);}
      if(!header){await arrived(destination,message);return;}
      await copy(header,destination,!message.keepSource);
      // Refresh the IMAP summary for the offline unified view, including cached
      // headers whose flags or search membership changed in another client.
      // This refresh must never hold up acceptance or the serialized move queue.
      Promise.resolve().then(()=>{
        if(!closed)return refresh(destination);
      }).catch(error=>{if(!closed)adapter.report(error);});
      // onStopCopy is Thunderbird's completion contract. Waiting for an IMAP
      // SELECT and newly indexed summary headers here can add 30 seconds even
      // though the server move already completed.
    },
    async restore(job,message){
      await pendingCopies(message);
      if(message.restored)return;
      const server=serverFor(message),inbox=server.rootFolder.getFolderWithFlags(folderFlags.Inbox);
      if(!inbox)throw new Error('This account has no Inbox.');
      if(message.storage===pendingFolder&&!server.rootFolder.containsChildNamed(folderName)){
        const existing=unique(inbox,message);if(existing){markReturned(existing,Math.floor(Date.now()/1000));return;}
      }
      const storage=folderFor(message,message.storage);
      let header=unique(storage,message),existing=matches(inbox,message)[0]||null,fresh=null;
      if(!header||recoveredJobs.has(job)||job.error){
        fresh=await Promise.all([refresh(storage),refresh(inbox)]);
        header=unique(storage,message);existing=matches(inbox,message)[0]||null;
      }
      if(!header){
        if(existing){markReturned(existing,message.returned||Math.floor(Date.now()/1000));return;}
        // A user moving/deleting a snoozed message cancels that reminder rather
        // than resurrecting another copy from Sent or another folder.
        if(fresh?.every(Boolean)){message.cancelled=true;return;}
        throw new Error('The snoozed message is unavailable.');
      }
      if(existing){
        // Complete the requested native move even when Inbox already has a
        // logical copy (e.g. a Gmail message with both labels). Do not delete
        // either copy manually: Thunderbird/server owns move semantics.
        await copy(header,inbox,true);
        markReturned(existing,message.returned||Math.floor(Date.now()/1000));
        return;
      }
      message.returned ||= Math.floor(Date.now()/1000);
      // Sorting metadata may arrive after the successful native move. It must
      // not hold the durable scheduler or later user actions in a polling loop.
      for(const [key,time] of returning)if(time<Math.floor(Date.now()/1000)-600)returning.delete(key);
      returning.set(returnKey(message),message.returned);
      await copy(header,inbox,true);
      const restored=matches(inbox,message)[0];
      if(restored)stampReturned(restored);
    },
    async hasReply(job){
      const accounts=new Set();
      for(const message of job.messages){
        if(accounts.has(message.account))continue;accounts.add(message.account);
        const ids=new Set(job.messages.filter(item=>item.account===message.account).map(item=>item.id));
        const inbox=serverFor(message).rootFolder.getFolderWithFlags(folderFlags.Inbox);
        if(!inbox)continue;
        let references=replyCache?.get(message.account);
        if(!references){
          references=new Map();
          for(const header of inbox.messages){
            const received=header.getUint32Property?.('dateReceived')||header.dateInSeconds,id=messageId(header);
            for(let index=0;index<header.numReferences;index++){
              const ref=(header.getStringReference(index)||'').replace(/^<|>$/g,'');
              const replies=references.get(ref)||[];replies.push({id,received});references.set(ref,replies);
            }
          }
          replyCache?.set(message.account,references);
        }
        for(const id of ids)if(references.get(id)?.some(reply=>reply.received>=Math.floor(job.created/1000)&&!ids.has(reply.id)))return true;
      }
      return false;
    },
    notify(job){
      if(!Services.prefs.getBoolPref('mail.biff.show_alert',true))return;
      try{
        const alert=Cc['@mozilla.org/alert-notification;1'].createInstance(Ci.nsIAlertNotification);
        alert.initWithObject({name:'thunderg-snooze-'+job.id,title:gmText('Snoozed conversation returned'),text:job.subject,textClickable:true});
        Cc['@mozilla.org/alerts-service;1'].getService(Ci.nsIAlertsService).showAlertWithCallbacks(alert,{
          QueryInterface:ChromeUtils.generateQI(['nsIAlertCallbacks']),onAlertFinished(){},
          onAlertClick(){
            const {MailUtils}=ChromeUtils.importESModule('resource:///modules/MailUtils.sys.mjs');
            for(const message of job.messages){const inbox=serverFor(message).rootFolder.getFolderWithFlags(folderFlags.Inbox);const header=unique(inbox,message);if(header){MailUtils.displayMessageInFolderTab(header,true);break;}}
          },
        });
      }catch(error){console.warn('Thunder-G snooze notification:',error);}
    },
  };
  // Submit one native operation per source/destination pair, in bounded chunks.
  // A failed batch retains successful checkpoints and waits for every operation
  // to settle before the journal queue can advance.
  async function moveJobs(kind,jobs,checkpoint){
    const entries=jobs.flatMap(job=>job.messages.map(message=>({job,message}))),failures=new Map();
    lookupCache=new Map();
    try{
      for(let offset=0;offset<entries.length;offset+=50){
        if(closed)return failures;
        const chunk=entries.slice(offset,offset+50);
        const results=await Promise.allSettled(chunk.map(({job,message})=>adapter[kind](job,message)));
        if(closed)return failures;
        results.forEach((result,index)=>{
          const {job,message}=chunk[index];
          if(result.status==='fulfilled')message[kind==='hide'?'hidden':'restored']=true;
          else failures.set(job,result.reason);
        });
        checkpoint();
      }
      for(const job of jobs)if(!failures.has(job))recoveredJobs.delete(job);
      return failures;
    }finally{lookupCache=null;}
  }
  for(const kind of ['hide','restore']){
    adapter[kind+'Jobs']=(jobs,checkpoint)=>moveJobs(kind,jobs,checkpoint);
    adapter[kind+'Many']=async(job,checkpoint)=>{const failures=await moveJobs(kind,[job],checkpoint);if(failures.has(job))throw failures.get(job);};
  }
  const service=createSnoozeService(adapter);
  Object.defineProperty(service,'orderRevision',{get:()=>orderRevision});
  let unifiedProvider=null;
  service.unifiedFolder=()=>{
    if(!unifiedProvider){
      const {VirtualFolderHelper}=ChromeUtils.importESModule('resource:///modules/VirtualFolderWrapper.sys.mjs');
      const {SmartMailboxUtils}=ChromeUtils.importESModule('resource:///modules/SmartMailboxUtils.sys.mjs');
      unifiedProvider=createUnifiedSnoozedFolder(MailServices,VirtualFolderHelper,SmartMailboxUtils.getSmartMailbox(),folderFlags);
    }
    return unifiedProvider();
  };
  let reminderIndex=null;
  service.subscribe(()=>{reminderIndex=null;});
  service.forHeaders=headers=>{
    if(!reminderIndex){
      reminderIndex=new Map();
      for(const job of service.list())for(const message of job.messages){const key=returnKey(message),jobs=reminderIndex.get(key)||[];jobs.push(job);reminderIndex.set(key,jobs);}
    }
    const found=new Set();
    for(const header of headers){
      if(!header?.folder?.server)continue;
      const key=JSON.stringify([accountId(header.folder.server),messageId(header),header.date]);
      for(const job of reminderIndex.get(key)||[])found.add(job);
    }
    return [...found];
  };
  const listener={
    msgAdded(header){if(header.folder?.flags&folderFlags.Inbox){replyCache?.delete(accountId(header.folder.server));stampReturned(header);service.check().catch(adapter.report);}},
    msgsMoveCopyCompleted(move,headers){if(move)this.msgsDeleted(headers);},
    msgsDeleted(headers){
      if(![...headers].some(header=>header.folder?.name===folderName))return;
      const removed=[...headers].map(header=>({folder:header.folder?.URI,id:messageId(header),date:header.date}));
      service.forget(async message=>{
        if(!removed.some(item=>item.folder===message.storage&&item.id===message.id&&item.date===message.date))return false;
        // IMAP can report removed/replaced headers while the message remains
        // in the holding folder. Never discard its schedule on that event alone.
        const held=folderFor(message,message.storage);await refresh(held);
        return !unique(held,message);
      }).catch(adapter.report);
    },
  };
  MailServices.mfn.addListener(listener,Ci.nsIMsgFolderNotificationService.msgAdded|Ci.nsIMsgFolderNotificationService.msgsDeleted|Ci.nsIMsgFolderNotificationService.msgsMoveCopyCompleted);
  const close=service.close;service.close=()=>{MailServices.mfn.removeListener(listener);close();};
  service.check().catch(adapter.report);
  return service;
}
