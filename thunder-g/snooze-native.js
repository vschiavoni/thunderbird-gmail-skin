function createNativeSnooze() {
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
  function matches(folder,message){
    return [...folder.messages].filter(header=>messageId(header)===message.id&&header.date===message.date);
  }
  function unique(folder,message){const found=matches(folder,message);if(found.length>1)throw new Error('Ambiguous snoozed message.');return found[0]||null;}
  async function storage(server){
    const root=server.rootFolder;
    if(!root.containsChildNamed(folderName))root.createSubfolder(folderName,null);
    for(let attempt=0;attempt<100;attempt++){
      if(root.containsChildNamed(folderName))return root.getChildNamed(folderName);
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    throw new Error('The Snoozed folder could not be created.');
  }
  const copies=new Map();
  function copy(header,destination,move){
    if(closed)return Promise.reject(new Error('Snooze closed'));
    const key=JSON.stringify([accountId(header.folder.server),messageId(header),header.date,header.folder.URI,destination.URI,move]);
    let operation=copies.get(key);
    if(!operation){
      operation=new Promise((resolve,reject)=>{
        MailServices.copy.copyMessages(header.folder,[header],destination,move,{
          QueryInterface:ChromeUtils.generateQI(['nsIMsgCopyServiceListener']),
          onStartCopy(){},onProgress(){},setMessageKey(){},getMessageId(){return '';},
          onStopCopy(status){if(Components.isSuccessCode(status))resolve();else reject(new Error('Snooze move failed ('+status+').'));},
        },null,false);
      });
      copies.set(key,operation);operation.then(()=>copies.delete(key),()=>copies.delete(key));
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
  async function refresh(folder){
    if(folder.server.type!=='imap')return true;
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
    return fresh;
  }
  async function arrived(folder,message){
    for(let attempt=0;attempt<300;attempt++){
      if(attempt%50===0)await refresh(folder);
      const header=unique(folder,message);if(header)return header;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    throw new Error('The snoozed message is unavailable.');
  }
  const adapter={
    close(){closed=true;},
    load(){return JSON.parse(Services.prefs.getStringPref(pref,'[]'));},
    save(jobs){const text=JSON.stringify(jobs);if(text.length>250000)throw new Error('Snooze storage is full.');Services.prefs.setStringPref(pref,text);Services.prefs.savePrefFile(null);},
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
      await refresh(destination);
      // A successful copy can outlive a shutdown before its journal checkpoint.
      if(unique(destination,message))return;
      if(message.hidden)throw new Error('A snoozed message was moved or deleted.');
      const source=folderFor(message,message.source);await refresh(source);
      const header=unique(source,message);
      if(!header){await arrived(destination,message);return;}
      await copy(header,destination,!message.keepSource);
      await arrived(destination,message);
    },
    async restore(job,message){
      await pendingCopies(message);
      if(message.restored)return;
      const server=serverFor(message),inbox=server.rootFolder.getFolderWithFlags(folderFlags.Inbox);
      if(!inbox)throw new Error('This account has no Inbox.');
      if(message.storage===pendingFolder&&!server.rootFolder.containsChildNamed(folderName)){
        const existing=unique(inbox,message);if(existing){existing.setStringProperty('thunderGSnoozeReturned',String(Math.floor(Date.now()/1000)));return;}
      }
      const storage=folderFor(message,message.storage),fresh=[await refresh(storage),await refresh(inbox)];
      const header=unique(storage,message),existing=matches(inbox,message)[0]||null;
      if(!header){
        if(existing){existing.setStringProperty('thunderGSnoozeReturned',String(message.returned||Math.floor(Date.now()/1000)));return;}
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
        existing.setStringProperty('thunderGSnoozeReturned',String(message.returned||Math.floor(Date.now()/1000)));
        return;
      }
      message.returned ||= Math.floor(Date.now()/1000);
      await copy(header,inbox,true);
      const restored=await arrived(inbox,message);
      if(restored)restored.setStringProperty('thunderGSnoozeReturned',String(message.returned));
    },
    async hasReply(job){
      const accounts=new Set();
      for(const message of job.messages){
        if(accounts.has(message.account))continue;accounts.add(message.account);
        const ids=new Set(job.messages.filter(item=>item.account===message.account).map(item=>item.id));
        const inbox=serverFor(message).rootFolder.getFolderWithFlags(folderFlags.Inbox);
        if(!inbox)continue;
        for(const header of inbox.messages){
          const received=header.getUint32Property?.('dateReceived')||header.dateInSeconds;
          if(received<Math.floor(job.created/1000)||ids.has(messageId(header)))continue;
          for(let index=0;index<header.numReferences;index++)if(ids.has((header.getStringReference(index)||'').replace(/^<|>$/g,'')))return true;
        }
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
  const service=createSnoozeService(adapter);
  const listener={
    msgAdded(header){if(header.folder?.flags&folderFlags.Inbox)service.check().catch(adapter.report);},
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
