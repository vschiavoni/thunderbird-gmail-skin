/* Scan cached headers only. Imported folder names are comparison data, never
 * filesystem paths or native folder selectors. No bodies or credentials. */
function createNativeLabelBackup({service=MailServices.tags,accounts=MailServices.accounts,
  prefs=Services.prefs,randomId=()=>Services.uuid.generateUUID().toString(),
  notifications=typeof MailServices!=='undefined'?MailServices.mfn:null,
  pause=()=>new Promise(resolve=>setTimeout(resolve,0))}={}) {
  const hiddenPref='extensions.thunderg.hiddenMessageLabels';
  const sidebarPref='extensions.thunderg.sidebarLabelVisibility';
  const maxHeaders=500000,maxFolders=20000;
  let closed=false,busy=false,epoch=0,preview=null,stopWatching=null;
  function check(ticket){if(closed || ticket!==epoch)throw new Error(gmText('Label backup operation cancelled.'));}
  function stopObserver(){stopWatching?.();stopWatching=null;}
  function observeMutations(){
    const revisions=new Map();let active=false,wanted=null,unknown=0;
    function changed(folder,header=null){
      if(!folder?.URI)return;
      if(header && wanted){const id=labelBackupMessageId(header.messageId);if(id&&!wanted.has(id))return;}
      revisions.set(folder.URI,(revisions.get(folder.URI)||0)+1);
    }
    function safely(callback){try{callback();}catch(_){unknown++;}}
    function changedMessages(headers){for(const header of headers || [])changed(header.folder,header);}
    const listener={
      msgAdded(header){safely(()=>changed(header?.folder,header));},
      msgsDeleted(headers){safely(()=>changedMessages(headers));},
      msgsMoveCopyCompleted(_move,headers,destination,destinationHeaders){safely(()=>{changedMessages(headers);changed(destination);changedMessages(destinationHeaders);});},
      msgPropertyChanged(header,property){if(!['keywords','label'].includes(property))safely(()=>changed(header?.folder,header));},
    };
    const flags=['msgAdded','msgsDeleted','msgsMoveCopyCompleted','msgPropertyChanged'].reduce((mask,name)=>mask|(notifications?.[name]||0),0);
    if(flags && notifications?.addListener && notifications?.removeListener){
      try{notifications.addListener(listener,flags);active=true;}catch(_){try{notifications.removeListener(listener);}catch(_){}/* Older services use bounded batch rechecks below. */}
    }
    const close=()=>{if(active){active=false;try{notifications.removeListener(listener);}catch(_){/* Service may already be shutting down. */}}};
    stopWatching=close;
    return {get active(){return active;},close,setWanted(ids){wanted=ids;},revision(folder){return unknown+':'+(revisions.get(folder.URI)||0);}};
  }
  function stored(name,fallback){try{return JSON.parse(prefs.getStringPref(name,JSON.stringify(fallback)));}catch(_){return fallback;}}
  function definitions(){
    const hidden=stored(hiddenPref,[]),modes=stored(sidebarPref,{});
    const hiddenKeys=new Set(Array.isArray(hidden)?hidden:[]);
    return service.getAllTags().map(tag=>({key:tag.key,name:tag.tag,color:tag.color || '',ordinal:tag.ordinal || '',
      sidebar:modes && !Array.isArray(modes) && Object.hasOwn(modes,tag.key) && ['hide','unread'].includes(modes[tag.key])?modes[tag.key]:'show',
      messageList:!hiddenKeys.has(tag.key)}));
  }
  function keywordKeys(header){
    const keys=new Set((header.getStringProperty('keywords') || '').split(/\s+/).filter(Boolean));
    if(header.label)keys.add('$label'+header.label);
    return [...keys];
  }
  function accountRecord(server){return {id:'account-'+server.key,type:server.type,host:server.hostname || server.hostName || '',user:server.username || ''};}
  function configuredAccounts(accountId=''){
    if(typeof accountId!=='string'||accountId.length>128)throw new Error(gmText('Choose an available account for the label backup.'));
    const configured=new Map();
    for(const account of accounts.accounts){
      const server=account.incomingServer;
      if(server && ['imap','pop3','none','ews'].includes(server.type))configured.set(server.key,server);
    }
    if(configured.size>LABEL_BACKUP_LIMITS.accounts)throw new Error(gmText('Too many accounts for a label backup.'));
    if(!accountId)return configured;
    const selected=[...configured.values()].find(server=>'account-'+server.key===accountId);
    if(!selected)throw new Error(gmText('Choose an available account for the label backup.'));
    return new Map([[selected.key,selected]]);
  }
  function exportFolders(configured,accountId){
    if(!accountId)return accounts.allFolders;
    // Resolve through a configured server, never through data from a backup or
    // an imported URI. Scoped exports do not enumerate other account trees.
    const server=configured.values().next().value,folders=server.rootFolder.descendants;
    if(!folders || typeof folders[Symbol.iterator]!=='function')throw new Error(gmText('A local folder could not be identified.'));
    return folders;
  }
  function relativeFolder(folder){
    const root=folder.server.rootFolder.URI;
    if(!folder.URI.startsWith(root+'/'))throw new Error(gmText('A local folder could not be identified.'));
    return folder.URI.slice(root.length+1);
  }
  async function snapshot(ticket,backup,mutations,accountId=''){
    const configured=configuredAccounts(accountId);
    const labels=definitions(),knownKeys=new Set(labels.map(tag=>tag.key));
    const accountRows=[...configured.values()].map(accountRecord);
    const accountIdentities=new Map([...configured.values()].map(server=>[server.key,labelBackupAccountIdentity(accountRecord(server))]));
    const wanted=backup?new Set(backup.assignments.map(item=>labelBackupMessageId(item.messageId))):null;
    mutations.setWanted(wanted);
    const messages=[],refs=new Map(),seenFolders=new Set(),folderStates=new Map();
    let scanned=0,unavailable=0;
    for(const folder of exportFolders(configured,accountId)){
      check(ticket);
      if(folder.isServer || folder.flags & 0x20 || !configured.has(folder.server?.key))continue;
      if(seenFolders.has(folder.URI))continue;seenFolders.add(folder.URI);
      if(seenFolders.size>maxFolders)throw new Error(gmText('Too many folders for a label backup.'));
      let path,headers;
      try{path=relativeFolder(folder);headers=folder.messages;}
      catch(_){unavailable++;continue;}
      const account='account-'+folder.server.key;
      const start=messages.length,addedRefs=[],uri=folder.URI,revision=mutations.revision(folder),identity=accountIdentities.get(folder.server.key);
      let complete=false;
      try{
        for(const header of headers){
          check(ticket);
          if(++scanned>maxHeaders)throw new Error(gmText('This mailbox is too large for one label backup (maximum 500,000 cached messages).'));
          if(scanned%250===0){await pause();check(ticket);}
          const messageId=labelBackupMessageId(header.messageId);
          if(wanted && !wanted.has(messageId))continue;
          const keys=keywordKeys(header).filter(key=>knownKeys.has(key));
          const ref=JSON.stringify([folder.URI,header.messageKey]);
          messages.push({account,folder:path,messageId,labels:keys,ref});
          if(backup){refs.set(ref,{folder,key:header.messageKey,account,path,messageId,serverIdentity:identity});addedRefs.push(ref);}
        }
        complete=folder.URI===uri && mutations.revision(folder)===revision;
      }catch(error){
        // Cancellation/limits must abort, never produce a silently truncated file.
        check(ticket);if(scanned>maxHeaders)throw error;
      }
      if(!complete){messages.length=start;for(const ref of addedRefs)refs.delete(ref);unavailable++;}
      else folderStates.set(folder,{uri,path,revision,serverIdentity:identity});
      await pause();check(ticket);
    }
    for(const [folder,state] of folderStates){
      if(folder.URI!==state.uri || relativeFolder(folder)!==state.path || labelBackupAccountIdentity(accountRecord(folder.server))!==state.serverIdentity || mutations.revision(folder)!==state.revision)
        throw new Error(gmText('Mailbox contents changed while scanning. Preview or export again to retry.'));
    }
    return {labels,accounts:accountRows,messages,refs,folderStates,scanned,unavailable};
  }
  function warnings(state){
    return state.unavailable?[gmText('$1 folders could not be read. Their message assignments are not included; open or synchronize those folders and try again.',state.unavailable)]:[];
  }
  function restoreVisibility(label){
    const rawHidden=stored(hiddenPref,[]),hidden=new Set(Array.isArray(rawHidden)?rawHidden.filter(key=>typeof key==='string'):[]);
    const rawModes=stored(sidebarPref,{}),modes=new Map(rawModes && typeof rawModes==='object' && !Array.isArray(rawModes)?Object.entries(rawModes).filter(([,mode])=>['hide','unread'].includes(mode)):[]);
    if(label.messageList)hidden.delete(label.key);else hidden.add(label.key);
    if(label.sidebar==='show')modes.delete(label.key);else modes.set(label.key,label.sidebar);
    prefs.setStringPref(hiddenPref,JSON.stringify([...hidden]));
    prefs.setStringPref(sidebarPref,JSON.stringify(Object.fromEntries(modes)));
  }
  function currentHeader(entry){
    const server=entry.folder.server;
    if(labelBackupAccountIdentity(accountRecord(server))!==entry.serverIdentity || relativeFolder(entry.folder)!==entry.path)return null;
    const db=entry.folder.msgDatabase;
    const lookup=db?.getMsgHdrForKey || db?.GetMsgHdrForKey;
    const header=entry.folder.getMsgHdr?entry.folder.getMsgHdr(entry.key):entry.folder.GetMessageHeader?entry.folder.GetMessageHeader(entry.key):lookup?.call(db,entry.key);
    if(!header || header.folder?.URI!==entry.folder.URI || labelBackupMessageId(header.messageId)!==entry.messageId)return null;
    return header;
  }
  function currentBatch(batch,state,mutations,ticket,budget){
    const groups=new Map(),indexes=new Map();
    for(const assignment of batch){
      const entry=state.refs.get(assignment.ref);if(!entry)continue;
      if(!groups.has(entry.folder))groups.set(entry.folder,new Set());groups.get(entry.folder).add(entry.messageId);
    }
    for(const [folder,wanted] of groups){
      const scanned=state.folderStates.get(folder);
      if(!scanned || folder.URI!==scanned.uri || relativeFolder(folder)!==scanned.path || labelBackupAccountIdentity(accountRecord(folder.server))!==scanned.serverIdentity)
        continue;
      const index=new Map();
      if(mutations.active){
        if(mutations.revision(folder)!==scanned.revision)throw new Error('changed');
        // Native notifications keep this fresh index valid between event-loop
        // turns. Index each folder once, rather than scanning per assignment.
        const all=state.occurrences.get(folder);
        for(const id of wanted)if(all?.has(id))index.set(id,all.get(id));
      }else{
        // A service without notifications cannot validate an async scan's last
        // yield. Recheck the upcoming batch synchronously, then write it before
        // yielding again. Bounds cover both a folder and cumulative fallback work.
        let count=0,complete=false;
        try{
          for(const header of folder.messages){
            if(++count>maxHeaders || ++budget.scanned>maxHeaders*20)throw new Error('limit');
            const id=labelBackupMessageId(header.messageId);if(!wanted.has(id))continue;
            const prior=index.get(id);index.set(id,{count:(prior?.count||0)+1,key:header.messageKey});
          }
          complete=true;
        }catch(error){if(count>maxHeaders || budget.scanned>maxHeaders*20)throw error;}
        check(ticket);if(!complete)continue;
      }
      indexes.set(folder,index);
    }
    return indexes;
  }
  return {
    close(){closed=true;epoch++;preview=null;stopObserver();},
    async run(action,data={}){
      if(closed)throw new Error(gmText('Extension has closed.'));
      if(action==='cancel'){epoch++;preview=null;stopObserver();return {};}
      if(busy)throw new Error(gmText('Wait for the current label backup operation to finish.'));
      if(action==='accounts')return {accounts:[...configuredAccounts().values()].map(server=>{
        const record=accountRecord(server),name=server.prettyName;
        return {id:record.id,label:typeof name==='string'&&name.trim()?name:record.user+' ('+record.host+')'};
      })};
      if(!['export','preview','import'].includes(action))throw new Error(gmText('Unknown label backup operation.'));
      busy=true;const ticket=++epoch;
      const mutations=observeMutations();
      try{
        if(action==='export'){
          preview=null;
          const state=await snapshot(ticket,null,mutations,data.accountId===undefined?'':data.accountId),result=labelBackupCreate(state);
          return {backup:result.backup,counts:{labels:result.counts.labels,messages:result.counts.assignments,
            skipped:result.counts.skippedMissingIds+result.counts.skippedAmbiguous},warnings:warnings(state)};
        }
        if(action==='preview'){
          preview=null;
          const backup=labelBackupParse(data.text),state=await snapshot(ticket,backup,mutations),plan=labelBackupPlan(backup,state);
          check(ticket);preview={token:randomId(),backup,fingerprint:labelBackupFingerprint(plan)};
          return {previewToken:preview.token,counts:plan.counts,labelRows:plan.labelRows.slice(0,200),warnings:warnings(state)};
        }
        if(!preview || typeof data.previewToken!=='string' || data.previewToken!==preview.token)throw new Error(gmText('Preview the label backup again before restoring.'));
        const saved=preview;preview=null; // One use, including errors and partial writes.
        const state=await snapshot(ticket,saved.backup,mutations),plan=labelBackupPlan(saved.backup,state);
        if(labelBackupFingerprint(plan)!==saved.fingerprint)throw new Error(gmText('Labels or matching messages changed since the preview. Preview again; nothing was restored.'));
        if(plan.counts.conflict)throw new Error(gmText('Resolve label conflicts before restoring this backup.'));
        const result={created:0,reused:plan.counts.reuse,restored:0,missing:plan.counts.missing,ambiguous:plan.counts.ambiguous,failed:0};
        try{
          // No await between the recheck and label creation: another operation
          // cannot replace a tag definition inside this synchronous write phase.
          for(const label of plan.labelsToCreate){
            check(ticket);
            if(service.getAllTags().some(tag=>tag.key===label.key || labelBackupFold(tag.tag)===labelBackupFold(label.name)))throw new Error('changed');
            service.addTagForKey(label.key,label.name,label.color,label.ordinal);result.created++;
            restoreVisibility(label);
          }
          const expected=new Map(plan.labelRows.filter(row=>row.status!=='conflict').map(row=>[row.targetKey,row.name]));
          state.occurrences=new Map();
          for(const entry of state.refs.values()){
            if(!state.occurrences.has(entry.folder))state.occurrences.set(entry.folder,new Map());
            const index=state.occurrences.get(entry.folder),prior=index.get(entry.messageId);
            index.set(entry.messageId,{count:(prior?.count||0)+1,key:entry.key});
          }
          let current=new Map(service.getAllTags().map(tag=>[tag.key,tag.tag]));const budget={scanned:0};
          for(let offset=0;offset<plan.assignmentsToApply.length;offset+=100){
            const batch=plan.assignmentsToApply.slice(offset,offset+100),indexes=currentBatch(batch,state,mutations,ticket,budget);
            for(const assignment of batch){
              check(ticket);
              const entry=state.refs.get(assignment.ref);
              const match=entry && indexes.get(entry.folder)?.get(entry.messageId);
              let header;
              try{header=match?.count===1 && match.key===entry.key && currentHeader(entry);}catch(_){header=null;}
              if(!header){result.failed++;continue;}
              // A native tag rename/delete during the yielded restore must not
              // attach an unrelated key to a message.
              if(assignment.keys.some(key=>!current.has(key) || current.get(key)!==expected.get(key)))throw new Error('changed');
              const present=new Set(keywordKeys(header)),keys=assignment.keys.filter(key=>!present.has(key));
              if(keys.length){entry.folder.addKeywordsToMessages([header],keys.join(' '));result.restored++;}
            }
            if(offset+100<plan.assignmentsToApply.length){await pause();check(ticket);current=new Map(service.getAllTags().map(tag=>[tag.key,tag.tag]));}
          }
        }catch(_){
          result.failed+=Math.max(1,plan.assignmentsToApply.length-result.restored-result.failed);
          result.error=gmText('Restore stopped before completing. Changes already applied were kept. Preview the backup again to retry.');
        }
        if(result.failed && !result.error)result.error=gmText('Some messages changed or could not be updated. Preview the backup again to retry.');
        return result;
      }finally{mutations.close();if(stopWatching===mutations.close)stopWatching=null;busy=false;}
    }
  };
}
