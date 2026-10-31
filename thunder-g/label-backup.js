/* Portable native-tag definitions and message assignments. This module never
 * reads bodies, accesses a path, contacts a server or writes a Thunderbird tag.
 * Native adapters must preview and apply a freshly checked plan explicitly. */
const LABEL_BACKUP_FORMAT='thunder-g-label-backup';
const LABEL_BACKUP_VERSION=1;
const LABEL_BACKUP_MAX_BYTES=16*1024*1024;
const LABEL_BACKUP_LIMITS=Object.freeze({labels:10000,accounts:100,assignments:200000,labelsPerMessage:1000});
function labelBackupError(message='Invalid label backup file.') { throw new Error(gmText(message)); }
function labelBackupBytes(text) {
  let bytes=0;
  for(let i=0;i<text.length;i++){
    const code=text.charCodeAt(i);
    if(code<0x80)bytes++;
    else if(code<0x800)bytes+=2;
    else if(code>=0xd800 && code<=0xdbff && text.charCodeAt(i+1)>=0xdc00 && text.charCodeAt(i+1)<=0xdfff){bytes+=4;i++;}
    else bytes+=3;
    if(bytes>LABEL_BACKUP_MAX_BYTES)return bytes;
  }
  return bytes;
}
function labelBackupSize(text) {
  if(typeof text!=='string')labelBackupError();
  if(text.length>LABEL_BACKUP_MAX_BYTES || labelBackupBytes(text)>LABEL_BACKUP_MAX_BYTES)
    labelBackupError('The label backup file is too large (maximum 16 MiB).');
}
function labelBackupRecord(value,fields) {
  if(!value || typeof value!=='object' || Array.isArray(value) ||
    Object.keys(value).some(key=>!fields.includes(key)) || fields.some(key=>!Object.hasOwn(value,key)))labelBackupError();
}
function labelBackupText(value,max,{empty=false,trim=true}={}) {
  if(typeof value!=='string' || value.length>max || (!empty&&!value) || /[\u0000-\u001f\u007f]/.test(value) || (trim&&value!==value.trim()))labelBackupError();
  // Reject malformed UTF-16 rather than letting native services reinterpret it.
  for(let i=0;i<value.length;i++){
    const code=value.charCodeAt(i);
    if(code>=0xd800 && code<=0xdbff){const next=value.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))labelBackupError();}
    else if(code>=0xdc00&&code<=0xdfff)labelBackupError();
  }
  return value;
}
function labelBackupMessageId(value) {
  if(typeof value!=='string')return '';
  let id=value.trim();
  if(id.startsWith('<')&&id.endsWith('>'))id=id.slice(1,-1);
  if(!id || id.length>998 || /[\s<>\u0000-\u001f\u007f]/.test(id))return '';
  try{return labelBackupText(id,998);}catch(_){return '';}
}
function labelBackupKey(value) {
  const key=labelBackupText(value,512);
  // Native keyword writes accept raw atoms. Never let a portable label key
  // become an IMAP system flag or introduce protocol delimiters. Keep legacy
  // printable-ASCII encodings (including $labelN, modified UTF-7 and =xx keys).
  // addTagForKey lowercases its preference key. Requiring native canonical
  // spelling also prevents WORK from bypassing a collision with existing work.
  if(!/^[\x21-\x7e]+$/.test(key) || key!==key.toLowerCase() || [...key].some(char=>'()[]{}%*"\\'.includes(char)))labelBackupError();
  return key;
}
function labelBackupLabel(value) {
  labelBackupRecord(value,['key','name','color','ordinal','sidebar','messageList']);
  const key=labelBackupKey(value.key),name=labelBackupText(value.name,512);
  if(name.split('/').some(part=>!part || part!==part.trim()))labelBackupError();
  const color=labelBackupText(value.color,7,{empty:true});
  if(color!==''&&!/^#[\da-f]{6}$/i.test(color))labelBackupError();
  const ordinal=labelBackupText(value.ordinal,128,{empty:true});
  if(!['show','hide','unread'].includes(value.sidebar)||typeof value.messageList!=='boolean')labelBackupError();
  return {key,name,color,ordinal,sidebar:value.sidebar,messageList:value.messageList};
}
function labelBackupAccount(value) {
  labelBackupRecord(value,['id','type','host','user']);
  const id=labelBackupText(value.id,128),type=labelBackupText(value.type,32);
  if(!/^[a-z][a-z0-9_-]*$/.test(type))labelBackupError();
  return {id,type,host:labelBackupText(value.host,253,{empty:type==='none'}),user:labelBackupText(value.user,320,{empty:type==='none'})};
}
function labelBackupAccountIdentity(account) {
  let host=account.host.toLowerCase().replace(/\.$/,'');
  if(host==='imap.googlemail.com')host='imap.gmail.com';
  // Other providers may have case-sensitive usernames. Never case-fold them.
  const user=host==='imap.gmail.com'?account.user.toLowerCase():account.user;
  return JSON.stringify([account.type,host,user]);
}
function labelBackupOrder(a,b) { return a<b?-1:a>b?1:0; }
function labelBackupRef(account,folder,messageId) { return JSON.stringify([account,folder,messageId]); }
function labelBackupArray(value,max) {
  if(!Array.isArray(value))labelBackupError();
  if(value.length>max)labelBackupError('Too many labels, accounts or message assignments in the backup.');
  return value;
}
function labelBackupValidate(value) {
  labelBackupRecord(value,['format','version','createdAt','labels','accounts','assignments']);
  if(value.format!==LABEL_BACKUP_FORMAT)labelBackupError();
  if(value.version!==LABEL_BACKUP_VERSION)labelBackupError('Unsupported label backup version.');
  if(typeof value.createdAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.createdAt)||!Number.isFinite(Date.parse(value.createdAt))||new Date(value.createdAt).toISOString()!==value.createdAt)labelBackupError();
  const labels=labelBackupArray(value.labels,LABEL_BACKUP_LIMITS.labels).map(labelBackupLabel);
  const accounts=labelBackupArray(value.accounts,LABEL_BACKUP_LIMITS.accounts).map(labelBackupAccount);
  const keys=new Set(labels.map(label=>label.key)),accountIds=new Set(accounts.map(account=>account.id));
  if(keys.size!==labels.length||accountIds.size!==accounts.length)labelBackupError();
  const seen=new Set();
  const assignments=labelBackupArray(value.assignments,LABEL_BACKUP_LIMITS.assignments).map(item=>{
    labelBackupRecord(item,['account','folder','messageId','labels']);
    const account=labelBackupText(item.account,128),folder=labelBackupText(item.folder,2048,{empty:true}),messageId=labelBackupMessageId(item.messageId);
    if(!accountIds.has(account)||!messageId)labelBackupError();
    const tags=labelBackupArray(item.labels,LABEL_BACKUP_LIMITS.labelsPerMessage).map(labelBackupKey);
    if(!tags.length||new Set(tags).size!==tags.length||tags.some(key=>!keys.has(key)))labelBackupError();
    const ref=labelBackupRef(account,folder,messageId);
    if(seen.has(ref))labelBackupError();seen.add(ref);
    return {account,folder,messageId,labels:tags.sort(labelBackupOrder)};
  });
  return {format:LABEL_BACKUP_FORMAT,version:LABEL_BACKUP_VERSION,createdAt:value.createdAt,labels,accounts,assignments};
}
function labelBackupParse(text) {
  labelBackupSize(text);
  let value;
  try{value=JSON.parse(text);}catch(_){labelBackupError();}
  return labelBackupValidate(value);
}
function labelBackupCreate(snapshot,createdAt=new Date().toISOString()) {
  const labels=labelBackupArray(snapshot.labels,LABEL_BACKUP_LIMITS.labels).map(labelBackupLabel).sort((a,b)=>labelBackupOrder(a.key,b.key));
  const accounts=labelBackupArray(snapshot.accounts,LABEL_BACKUP_LIMITS.accounts).map(labelBackupAccount).sort((a,b)=>labelBackupOrder(a.id,b.id));
  const keys=new Set(labels.map(label=>label.key)),knownAccounts=new Set(accounts.map(account=>account.id));
  const index=new Map();
  for(const message of snapshot.messages){
    const id=labelBackupMessageId(message.messageId);
    if(!id)continue;
    const ref=labelBackupRef(message.account,message.folder,id);
    index.set(ref,(index.get(ref)||0)+1);
  }
  const counts={labels:labels.length,accounts:0,assignments:0,skippedMissingIds:0,skippedAmbiguous:0,skippedUnlabelled:0};
  const assignments=[],usedAccounts=new Set();
  for(const message of snapshot.messages){
    const tags=[...new Set(message.labels.filter(key=>keys.has(key)))].sort(labelBackupOrder);
    if(!tags.length){counts.skippedUnlabelled++;continue;}
    const id=labelBackupMessageId(message.messageId);
    if(!id){counts.skippedMissingIds++;continue;}
    if(index.get(labelBackupRef(message.account,message.folder,id))!==1){counts.skippedAmbiguous++;continue;}
    if(!knownAccounts.has(message.account))labelBackupError();
    assignments.push({account:message.account,folder:message.folder,messageId:id,labels:tags});usedAccounts.add(message.account);
    if(assignments.length>LABEL_BACKUP_LIMITS.assignments)labelBackupError('Too many labels, accounts or message assignments in the backup.');
  }
  assignments.sort((a,b)=>labelBackupOrder(labelBackupRef(a.account,a.folder,a.messageId),labelBackupRef(b.account,b.folder,b.messageId)));
  const backup=labelBackupValidate({format:LABEL_BACKUP_FORMAT,version:LABEL_BACKUP_VERSION,createdAt,labels,accounts:accounts.filter(account=>usedAccounts.has(account.id)),assignments});
  labelBackupSize(JSON.stringify(backup));
  counts.accounts=backup.accounts.length;counts.assignments=assignments.length;
  return {backup,counts};
}
function labelBackupFold(name) { return name.normalize('NFKC').toLowerCase(); }
function labelBackupPlan(value,snapshot) {
  const backup=labelBackupValidate(value);
  const localLabels=labelBackupArray(snapshot.labels,LABEL_BACKUP_LIMITS.labels).map(labelBackupLabel);
  const localAccounts=labelBackupArray(snapshot.accounts,LABEL_BACKUP_LIMITS.accounts).map(labelBackupAccount);
  const byKey=new Map(),byName=new Map(),proposedNames=new Map();
  for(const label of localLabels){
    if(!byKey.has(label.key))byKey.set(label.key,[]);byKey.get(label.key).push(label);
    const folded=labelBackupFold(label.name);
    if(!byName.has(folded))byName.set(folded,[]);byName.get(folded).push(label);
  }
  for(const label of backup.labels){const folded=labelBackupFold(label.name);proposedNames.set(folded,(proposedNames.get(folded)||0)+1);}
  const labelRows=[],labelsToCreate=[],keyMap=new Map();
  for(const label of backup.labels){
    const named=byName.get(labelBackupFold(label.name))||[],keyed=byKey.get(label.key)||[];
    let target=null,reason='';
    if(proposedNames.get(labelBackupFold(label.name))>1||named.length>1||keyed.length>1)reason=gmText('Existing local labels conflict with this label.');
    else if(named.length===1&&named[0].name===label.name)target=named[0];
    else if(named.length||keyed.length)reason=gmText('Existing local labels conflict with this label.');
    if(reason){labelRows.push({key:label.key,name:label.name,status:'conflict',reason});continue;}
    if(target){
      const keptLocalMetadata=['color','ordinal','sidebar','messageList'].some(field=>target[field]!==label[field]);
      keyMap.set(label.key,target.key);
      labelRows.push({key:label.key,targetKey:target.key,name:label.name,status:'reuse',...(target.key!==label.key?{reason:gmText('The label uses a different local key; existing metadata will be kept.')} : keptLocalMetadata?{reason:gmText('Local label metadata will be kept.')} : {}),...(keptLocalMetadata?{keptLocalMetadata:true}:{})});
    }else{
      labelsToCreate.push({...label});keyMap.set(label.key,label.key);
      labelRows.push({key:label.key,targetKey:label.key,name:label.name,status:'create'});
    }
  }
  const accountIndex=new Map();
  for(const account of localAccounts){const identity=labelBackupAccountIdentity(account);if(!accountIndex.has(identity))accountIndex.set(identity,[]);accountIndex.get(identity).push(account);}
  const accountMatches=backup.accounts.map(account=>{
    const matches=accountIndex.get(labelBackupAccountIdentity(account))||[];
    return {source:account.id,status:matches.length===1?'matched':matches.length?'ambiguous':'missing',...(matches.length===1?{target:matches[0].id}:{})};
  });
  const accountMap=new Map(accountMatches.map(match=>[match.source,match]));
  const wanted=new Set();
  for(const item of backup.assignments){const match=accountMap.get(item.account);if(match?.status==='matched')wanted.add(labelBackupRef(match.target,item.folder,item.messageId));}
  const messages=new Map(),fingerprintMessages=[];
  for(const message of snapshot.messages){
    const id=labelBackupMessageId(message.messageId);if(!id)continue;
    const match=labelBackupRef(message.account,message.folder,id);if(!wanted.has(match))continue;
    if(!messages.has(match))messages.set(match,[]);messages.get(match).push(message);
    fingerprintMessages.push([message.account,message.folder,id,[...new Set(message.labels)].sort(labelBackupOrder)]);
  }
  const counts={create:labelsToCreate.length,reuse:labelRows.filter(row=>row.status==='reuse').length,conflict:labelRows.filter(row=>row.status==='conflict').length,assignments:backup.assignments.length,matched:0,missing:0,ambiguous:0,alreadyApplied:0,restore:0,blocked:0,tagApplications:0};
  const assignmentsToApply=[],issues=[];
  for(const item of backup.assignments){
    const account=accountMap.get(item.account);
    const problem=(status,reason)=>{counts[status]++;issues.push({account:item.account,folder:item.folder,messageId:item.messageId,status,reason:gmText(reason)});};
    if(account.status==='missing'){problem('missing','No matching account was found.');continue;}
    if(account.status==='ambiguous'){problem('ambiguous','More than one local account matches.');continue;}
    const matches=messages.get(labelBackupRef(account.target,item.folder,item.messageId))||[];
    if(!matches.length){problem('missing','The message is not available in the matching folder.');continue;}
    if(matches.length>1){problem('ambiguous','More than one message has this identifier in the matching folder.');continue;}
    const message=matches[0];counts.matched++;
    const allKeys=[...new Set(item.labels.map(key=>keyMap.get(key)).filter(Boolean))].sort(labelBackupOrder);
    if(!allKeys.length){problem('blocked','The message refers only to conflicting labels.');continue;}
    const current=new Set(message.labels),keys=allKeys.filter(key=>!current.has(key));
    if(!keys.length){counts.alreadyApplied++;continue;}
    labelBackupText(message.ref,8192);
    assignmentsToApply.push({ref:message.ref,keys,account:account.target,folder:item.folder,messageId:item.messageId});counts.tagApplications+=keys.length;
  }
  counts.restore=assignmentsToApply.length;
  // Snapshot only relevant message references. Unrelated incoming mail must not
  // invalidate a preview; metadata or membership changes for its targets must.
  const snapshotFingerprint=JSON.stringify({labels:[...localLabels].sort((a,b)=>labelBackupOrder(a.key,b.key)),accounts:[...localAccounts].sort((a,b)=>labelBackupOrder(a.id,b.id)),messages:fingerprintMessages.map(message=>JSON.stringify(message)).sort(labelBackupOrder)});
  return {labelRows,counts,labelsToCreate,assignmentsToApply,issues,accountMatches,snapshotFingerprint};
}
function labelBackupFingerprint(plan) {
  return JSON.stringify({labelRows:plan.labelRows,counts:plan.counts,labelsToCreate:plan.labelsToCreate,assignmentsToApply:plan.assignmentsToApply.map(({account,folder,messageId,keys})=>({account,folder,messageId,keys})),issues:plan.issues,accountMatches:plan.accountMatches,snapshotFingerprint:plan.snapshotFingerprint});
}
