// Experimental local suggestions. Analysis never writes native tags; only an
// explicitly confirmed, revalidated review may call the supplied exact-scope writer.
const GM_LABEL_SUGGESTION_PREF='extensions.thunderg.experimentalLabelSuggestions';
function labelSuggestionHeaderKey(header){return JSON.stringify([header.folder.URI,header.messageKey]);}
function labelSuggestionAccount(folder){return folder.rootFolder?.URI || folder.server?.rootFolder?.URI || folder.server?.key || folder.URI;}
function labelSuggestionMessageId(value){return String(value || '').trim().replace(/^<|>$/g,'');}
function labelSuggestionFeatures(messages,ownAddresses=new Set()){
  const features=new Set(),stop=new Set('the and for with from this that your have will you are was our not but can has les des une dans pour avec sur est par aux qui del della delle degli per che con una sono alla mail email reply forward externe attention liens pieces jointes'.split(' '));
  for(const message of messages.slice(0,100)){
    for(const address of message.people || []){if(!ownAddresses.has(address))features.add('person:'+address);if(features.size>=64)break;}
    if(features.size>=64)break;
    for(const word of (message.subject || '').toLowerCase().match(/[\p{L}][\p{L}\p{N}_-]{2,}/gu) || []){
      if(!stop.has(word))features.add('word:'+word);
      if(features.size>=64)break;
    }
    if(features.size>=64)break;
  }
  return features;
}
async function groupLabelSuggestionRecords(records,selectedKeys,tags,environment={}){
  const tick=environment.yieldControl || (()=>Promise.resolve()),signal=environment.signal;
  const check=()=>{if(signal?.aborted)throw new Error('Analysis canceled.');};
  const parents=new Map(),groups=new Map(),headerIds=new Map(),tagKeys=new Set(tags.map(tag=>tag.key));
  function root(id){let r=id;while(parents.get(r)!==r)r=parents.get(r);while(parents.get(id)!==id){const next=parents.get(id);parents.set(id,r);id=next;}return r;}
  function node(id){if(!parents.has(id))parents.set(id,id);return id;}
  function join(a,b){a=root(a);b=root(b);if(a!==b)parents.set(b,a);}
  for(let i=0;i<records.length;i++){
    check();const record=records[i];
    const ids=[record.id,...record.references].filter(Boolean).map(id=>node(JSON.stringify([record.account,id])));
    // Keep referenced malformed members in the group so their labels cannot
    // be overlooked; groups containing them will be skipped conservatively.
    if(!ids.length)continue;
    for(const id of ids)join(ids[0],id);headerIds.set(record.key,ids[0]);
    if(i%200===199)await tick();
  }
  for(let i=0;i<records.length;i++){
    check();const record=records[i],id=headerIds.get(record.key);if(!id)continue;
    const key=root(id);if(!groups.has(key))groups.set(key,{key,account:record.account,messages:[],labels:new Set(),selected:false});
    const group=groups.get(key);group.messages.push(record);group.selected ||= selectedKeys.has(record.key);
    for(const label of record.labels)if(tagKeys.has(label))group.labels.add(label);
    if(i%200===199)await tick();
  }
  return {groups,headerIds};
}
async function analyzeLabelSuggestions(records,selectedKeys,tags,environment={}){
  const tick=environment.yieldControl || (()=>Promise.resolve());
  const check=()=>{if(environment.signal?.aborted)throw new Error('Analysis canceled.');};
  const {groups,headerIds}=await groupLabelSuggestionRecords(records,selectedKeys,tags,environment);
  const model=new Map(),totals=new Map(),accountTotals=new Map();let training=0,limited=false,featurePairs=0;
  for(const group of groups.values()){
    check();if(!group.labels.size || group.selected || group.messages.some(message=>!message.id))continue;
    if(training>=2500 || featurePairs>=100000){limited=true;break;}
    if(group.labels.size>20){limited=true;continue;}
    const features=labelSuggestionFeatures(group.messages,environment.ownAddresses);
    accountTotals.set(group.account,(accountTotals.get(group.account)||0)+1);
    for(const feature of features){const key=JSON.stringify([group.account,feature]);totals.set(key,(totals.get(key)||0)+1);}
    for(const label of group.labels){
      const key=JSON.stringify([group.account,label]);
      if(!model.has(key))model.set(key,{count:0,features:new Map()});
      const entry=model.get(key);entry.count++;
      for(const feature of features){if(!entry.features.has(feature))featurePairs++;entry.features.set(feature,(entry.features.get(feature)||0)+1);}
    }
    if(++training%100===0)await tick();
  }
  const results=[];
  for(const group of groups.values()){
    if(!group.selected)continue;check();
    const common={conversationKey:group.key,account:group.account,subject:group.messages[0].subject || '(No subject)',messageKeys:group.messages.map(m=>m.key),messageIds:[...new Set(group.messages.map(m=>m.id))]};
    if(group.messages.some(message=>!message.id) || group.messages.length>1000){results.push({...common,status:'skipped',reason:'Conversation identity is incomplete or the conversation exceeds 1,000 local messages.'});continue;}
    if(group.labels.size){results.push({...common,status:'skipped',reason:'This conversation already has a user label.'});continue;}
    const features=labelSuggestionFeatures(group.messages,environment.ownAddresses),ranked=[];
    for(const tag of tags){
      const entry=model.get(JSON.stringify([group.account,tag.key]));if(!entry || entry.count<2)continue;
      let score=0,words=0,people=0;const evidence=[];
      for(const feature of features){
        const count=entry.features.get(feature)||0;if(count<2)continue;
        const word=feature.startsWith('word:');
        const contribution=(word?1.5:2)*count/entry.count*Math.log(1+((accountTotals.get(group.account)||0)+1)/((totals.get(JSON.stringify([group.account,feature]))||0)+1));
        score+=contribution;if(word)words++;else people++;evidence.push(feature);
      }
      if(words>=1 && (people>=1 || words>=2) && score>=2.5)ranked.push({labelKey:tag.key,labelName:tag.tag,score,evidence:evidence.slice(0,8),examples:entry.count});
    }
    ranked.sort((a,b)=>b.score-a.score || a.labelName.localeCompare(b.labelName));
    if(!ranked.length || (ranked[1] && ranked[0].score<ranked[1].score*1.3))results.push({...common,status:'skipped',reason:ranked.length?'Several labels fit equally well.':'Not enough distinctive examples (at least two labeled conversations are needed).'});
    else results.push({...common,status:'suggested',...ranked[0],strength:ranked[0].score>=6?'Stronger evidence':'Review carefully'});
    await tick();
  }
  for(const key of selectedKeys)if(!headerIds.has(key))results.push({status:'skipped',subject:'Selected message',reason:'Conversation identity is unavailable.'});
  return {results,training,trainingLimited:limited,conversations:groups.size,messages:records.length};
}
async function collectLabelSuggestionRecords(selected,mail,environment){
  const accounts=new Set(selected.map(header=>labelSuggestionAccount(header.folder)));
  const tags=mail.tags.getAllTags(),tagKeys=new Set(tags.map(tag=>tag.key)),records=[],seen=new Set();
  const folders=Array.from(mail.accounts.allFolders).filter(folder=>!folder.isServer && accounts.has(labelSuggestionAccount(folder)) && !(folder.flags & environment.virtualFlag));
  if(!folders.length)throw new Error('No local account folders are available.');
  const failures=[];let referencesSeen=0;
  for(const folder of folders){
    if(environment.signal.aborted)throw new Error('Analysis canceled.');
    try{
      // Native summary enumeration only: never stream message bodies or update folders.
      for(const header of folder.messages){
        if(environment.signal.aborted)throw new Error('Analysis canceled.');
        const key=labelSuggestionHeaderKey(header);if(seen.has(key))continue;seen.add(key);
        if(records.length>=environment.maxHeaders)throw new Error('Header limit reached.');
        const labels=(header.getStringProperty('keywords')||'').split(/\s+/).filter(key=>tagKeys.has(key));
        if(header.label && tagKeys.has('$label'+header.label))labels.push('$label'+header.label);
        if((header.numReferences||0)>256 || (referencesSeen+=(header.numReferences||0))>500000)throw new Error('Reference safety limit reached.');
        const references=[];for(let i=0;i<(header.numReferences||0);i++)references.push(labelSuggestionMessageId(header.getStringReference(i)));
        const people=mail.headerParser.extractHeaderAddressMailboxes(((header.mime2DecodedAuthor||header.author||'')+','+(header.mime2DecodedRecipients||header.recipients||'')+','+(header.ccList||'')).slice(0,16384))
          .split(',').map(value=>value.trim().toLowerCase()).filter(Boolean);
        records.push({key,account:labelSuggestionAccount(folder),id:labelSuggestionMessageId(header.messageId),references,labels,people,subject:String(header.mime2DecodedSubject||header.subject||'').slice(0,2000)});
        if(records.length%200===0){environment.progress(records.length);await environment.yieldControl();}
      }
    }catch(error){
      if(environment.signal.aborted || records.length>=environment.maxHeaders)throw error;
      failures.push(folder.prettyName||folder.name||folder.URI);
    }
    await environment.yieldControl();
  }
  // A partial snapshot cannot prove the selected conversations are unlabeled.
  if(failures.length)throw new Error('No proposals produced: '+failures.length+' local folder summaries could not be read. Existing assignments are unchanged.');
  return {records,tags};
}
function labelSuggestionSnapshot(report,createdAt=Date.now()){
  return {version:1,createdAt,proposals:report.results.filter(row=>row.status==='suggested').map(row=>({
    conversationKey:row.conversationKey,account:row.account,messageKeys:row.messageKeys,messageIds:row.messageIds,
    labelKey:row.labelKey,labelName:row.labelName,strength:row.strength,evidence:row.evidence,examples:row.examples
  }))};
}
function saveLabelSuggestionReport(prefs,report,dryRun){
  const snapshot=labelSuggestionSnapshot(report);
  if(!dryRun)prefs.setStringPref(GM_LABEL_SUGGESTION_PREF,JSON.stringify(snapshot));
  return snapshot;
}

function labelSuggestionProposalKey(proposal){return JSON.stringify([proposal.account,proposal.conversationKey,proposal.labelKey]);}
function removeSavedLabelSuggestions(prefs,proposals){
  const keys=new Set(proposals.map(labelSuggestionProposalKey));
  let saved;try{saved=JSON.parse(prefs.getStringPref(GM_LABEL_SUGGESTION_PREF,'null'));}catch(_){return;}
  if(saved?.version!==1 || !Array.isArray(saved.proposals))return;
  const remaining=saved.proposals.filter(proposal=>!keys.has(labelSuggestionProposalKey(proposal)));
  if(remaining.length!==saved.proposals.length)prefs.setStringPref(GM_LABEL_SUGGESTION_PREF,JSON.stringify({...saved,proposals:remaining}));
}
async function prepareLabelSuggestionConfirmations(proposals,mail,environment){
  const folders=Array.from(mail.accounts.allFolders),seeds=[];
  for(const account of new Set(proposals.map(proposal=>proposal.account))){
    const folder=folders.find(folder=>!folder.isServer && !(folder.flags & environment.virtualFlag) && labelSuggestionAccount(folder)===account);
    if(!folder)throw new Error('An account is no longer available. Rerun analysis.');
    seeds.push({folder});
  }
  const snapshot=await collectLabelSuggestionRecords(seeds,mail,environment);
  const {groups}=await groupLabelSuggestionRecords(snapshot.records,new Set(),snapshot.tags,environment);
  const byId=new Map();
  for(const group of groups.values())for(const message of group.messages)byId.set(JSON.stringify([group.account,message.id]),group);
  const prepared=new Map();
  for(const proposal of proposals){
    if(environment.signal.aborted)throw new Error('Confirmation canceled.');
    const tag=snapshot.tags.find(tag=>tag.key===proposal.labelKey);
    const matches=new Set((proposal.messageIds || []).map(id=>byId.get(JSON.stringify([proposal.account,id]))));
    const group=matches.size===1?[...matches][0]:null;
    let reason='';
    if(!tag)reason='This label no longer exists. Rerun analysis.';
    else if(!group || !proposal.messageIds?.length || group.messages.some(message=>!message.id) || group.messages.length>1000)reason='Conversation membership changed or is incomplete. Rerun analysis.';
    else if(group.labels.size)reason='This conversation already has a user label. Existing assignments were preserved.';
    prepared.set(labelSuggestionProposalKey(proposal),reason?{status:'skipped',reason}:{status:'ready',records:group.messages,labelKey:tag.key,labelName:tag.tag});
    await environment.yieldControl();
  }
  return prepared;
}
function labelSuggestionNativeHeader(record,folders){
  const [uri,key]=JSON.parse(record.key),folder=folders.find(folder=>folder.URI===uri && labelSuggestionAccount(folder)===record.account);
  const db=folder?.msgDatabase,lookup=db?.getMsgHdrForKey || db?.GetMsgHdrForKey;
  const header=lookup?.call(db,key);
  if(!header || labelSuggestionMessageId(header.messageId)!==record.id || labelSuggestionAccount(header.folder)!==record.account)throw new Error('A message moved or changed. Rerun analysis.');
  return header;
}
function confirmPreparedLabelSuggestion(prepared,mail,write){
  if(prepared.status!=='ready')return prepared;
  const tags=mail.tags.getAllTags(),tag=tags.find(tag=>tag.key===prepared.labelKey);
  if(!tag)return {status:'skipped',reason:'This label no longer exists. Rerun analysis.'};
  const folders=Array.from(mail.accounts.allFolders),headers=prepared.records.map(record=>labelSuggestionNativeHeader(record,folders));
  // Recheck live keywords immediately before the synchronous write, not just
  // the earlier snapshot. Preserve every existing user label and internal flag.
  for(const header of headers){
    const keys=new Set((header.getStringProperty('keywords')||'').split(/\s+/));if(header.label)keys.add('$label'+header.label);
    if(tags.some(tag=>keys.has(tag.key)))return {status:'skipped',reason:'This conversation acquired a user label. Existing assignments were preserved.'};
  }
  const receipt={labelKey:tag.key,labelName:tag.tag,records:prepared.records.map(record=>({key:record.key,id:record.id,account:record.account}))};
  try{write(headers,tag.key,true);}
  catch(error){return {status:'failed',reason:'Could not complete confirmation. Some messages may have been labeled; inspect them or use Undo. '+error.message,receipt};}
  return {status:'confirmed',receipt,labelName:tag.tag};
}
function undoConfirmedLabelSuggestion(receipt,mail,write){
  const folders=Array.from(mail.accounts.allFolders),headers=receipt.records.map(record=>labelSuggestionNativeHeader(record,folders));
  const changed=headers.filter(header=>(header.getStringProperty('keywords')||'').split(/\s+/).includes(receipt.labelKey));
  // Only the precise keyword introduced by this confirmation is removed.
  // Native numeric labels and any subsequently added labels are untouched.
  if(changed.length)write(changed,receipt.labelKey,false);
}
