/* A bounded parser shared by native execution and regression tests. */
function parseGmailSearch(source,now=new Date()) {
  if(typeof source!=='string' || source.length>4000)throw new Error('Search is too long.');
  const tokens=[];
  let pos=0;
  while(pos<source.length){
    if(/\s/.test(source[pos])){pos++;continue;}
    const char=source[pos];
    if('(){}-'.includes(char)){tokens.push({type:char});pos++;continue;}
    const operator=/^([a-z_]+):/i.exec(source.slice(pos));
    if(operator){tokens.push({type:'operator',value:operator[1].toLowerCase()});pos+=operator[0].length;continue;}
    let value='';
    const quoted=char==='"';
    if(char==='"'){
      pos++;
      while(pos<source.length && source[pos]!=='"'){
        if(source[pos]==='\\' && source[pos+1]==='"')pos++;
        value+=source[pos++];
      }
      if(source[pos++]!=='"')throw new Error('Unclosed quoted phrase.');
    }else{
      while(pos<source.length && !/[\s(){}"]/.test(source[pos]))value+=source[pos++];
    }
    if(!value)throw new Error('Enter a search term.');
    if(!quoted && (value==='AROUND' || value.startsWith('+')))throw new Error('Proximity and exact-word operators are not supported yet.');
    tokens.push({type:!quoted && (value==='OR' || value==='AND')?value:'word',value});
  }
  let index=0,depth=0,count=0;
  const take=type=>tokens[index]?.type===type?tokens[index++]:null;
  function atom(field,value){
    if(++count>50)throw new Error('Use at most 50 search terms.');
    return gmailSearchAtom(field,value,now);
  }
  function primary(field='text'){
    if(take('-'))return {type:'not',child:primary(field)};
    const operator=take('operator');
    if(operator)return primary(operator.value);
    const open=take('(') || take('{');
    if(open){
      if(++depth>20)throw new Error('Search groups are nested too deeply.');
      const result=expression(open.type==='{'?'or':'and',field);
      if(!take(open.type==='{'?'}':')'))throw new Error('Unclosed search group.');
      depth--;return result;
    }
    const word=take('word');
    if(!word)throw new Error('A search operator or group is missing its value.');
    return atom(field,word.value);
  }
  function expression(join='and',field='text'){
    const alternatives=[];
    let terms=[primary(field)];
    const group=()=>terms.length===1?terms[0]:{type:'and',children:terms};
    while(index<tokens.length && ![')', '}'].includes(tokens[index].type)){
      if(take('OR')){
        alternatives.push(group());terms=[primary(field)];
      }else if(take('AND'))terms.push(primary(field));
      else if(join==='or'){
        alternatives.push(group());terms=[primary(field)];
      }else terms.push(primary(field));
    }
    alternatives.push(group());
    return alternatives.length===1?alternatives[0]:{type:'or',children:alternatives};
  }
  if(!tokens.length)throw new Error('Enter a search query.');
  const result=expression();
  if(index!==tokens.length)throw new Error('Unexpected closing search group.');
  return result;
}

function gmailSearchAtom(field,value,now) {
  const allowed=['text','from','to','cc','bcc','subject','label','in','is','has','filename',
    'after','before','older','newer','older_than','newer_than','size','larger','smaller'];
  if(!allowed.includes(field))throw new Error('Unsupported search operator: '+field);
  const node={type:'atom',field,value};
  if(field==='is' && !['read','unread','starred'].includes(value.toLowerCase()))
    throw new Error('Supported status searches are is:read, is:unread and is:starred.');
  if(field==='has' && !['attachment','userlabels','nouserlabels',
      ...GM_STAR_MARKERS.map(([id])=>id)].includes(value.toLowerCase()))
    throw new Error('Unsupported has: value: '+value);
  if(['size','larger','smaller'].includes(field)){
    const match=/^(\d+(?:\.\d+)?)([kmg]?)b?$/i.exec(value);
    if(!match)throw new Error('Use a size in bytes, K, M or G.');
    node.bytes=Number(match[1])*({k:1024,m:1048576,g:1073741824}[match[2].toLowerCase()] || 1);
    if(!Number.isSafeInteger(node.bytes))throw new Error('Invalid message size.');
  }
  if(['after','before','older','newer'].includes(field)){
    const match=/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(value);
    if(!match)throw new Error('Use dates in YYYY/MM/DD or YYYY-MM-DD format.');
    const [year,month,day]=match.slice(1).map(Number),date=new Date(year,month-1,day);
    if(date.getFullYear()!==year || date.getMonth()!==month-1 || date.getDate()!==day)
      throw new Error('Invalid search date.');
    node.time=date.getTime();
  }
  if(['older_than','newer_than'].includes(field)){
    const match=/^(\d+)([dmy])$/i.exec(value);
    if(!match || Number(match[1])>10000)throw new Error('Use a relative date such as 7d, 6m or 1y.');
    const date=new Date(now),amount=Number(match[1]),unit=match[2].toLowerCase();
    if(unit==='d')date.setDate(date.getDate()-amount);
    else if(unit==='m')date.setMonth(date.getMonth()-amount);
    else date.setFullYear(date.getFullYear()-amount);
    node.time=date.getTime();
  }
  return node;
}

function gmailSearchAtoms(node) {
  if(node.type==='atom')return [node];
  if(node.type==='not')return gmailSearchAtoms(node.child);
  return node.children.flatMap(gmailSearchAtoms);
}
function gmailSearchKey(header){return header.folder.URI+'#'+header.messageKey;}
function combineGmailSearch(node,matches,universe) {
  if(node.type==='atom')return matches.get(node);
  if(node.type==='not'){
    const excluded=combineGmailSearch(node.child,matches,universe);
    return new Map([...universe].filter(([key])=>!excluded.has(key)));
  }
  const sets=node.children.map(child=>combineGmailSearch(child,matches,universe));
  if(node.type==='or')return new Map(sets.flatMap(set=>[...set]));
  const first=sets.reduce((a,b)=>a.size<b.size?a:b);
  return new Map([...first].filter(([key])=>sets.every(set=>set.has(key))));
}
