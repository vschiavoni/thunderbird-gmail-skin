// Only positive, ordinary text conjunctions use Gloda in this first stage.
// Keep operators, exclusions and short tokens on the existing exact local path.
function gmailIndexedText(ast) {
  const terms=[];
  function collect(node){
    if(node.type==='and')return node.children.every(collect);
    if(node.type!=='atom' || node.field!=='text' || node.value.includes('"') || /^NEAR(?:\/\d+)?$/.test(node.value))return false;
    const text=node.value;
    const supported=text.length>=3 || (text.length===1 && text.charCodeAt(0)>=0x2000) ||
      (text.length===2 && text.charCodeAt(0)>=0x2000 && text.charCodeAt(1)>=0x2000);
    if(!supported)return false;
    terms.push('"'+text+'"');return true;
  }
  return collect(ast) && terms.length ? terms.join(' ') : null;
}

function createGmailIndexedView(text, environment) {
  const pageSize=environment.pageSize || 200;
  let limit=pageSize,job=null,generation=0,searching=false,hasMore=false,rawCount=0,lastError=false;
  const headers=new Map(),subscribers=new Set();
  function notify(active=searching){searching=active;for(const fn of subscribers)fn(active);}
  function detach(record){if(record?.collection){record.collection.listener=null;record.collection.becomeExplicit?.();record.collection=null;}}
  function finish(record,status=0){
    if(record.done)return;record.done=true;detach(record);
    if(job!==record)return;
    record.listener.onSearchDone(status);record.callback?.();notify(false);
  }
  const view={
    customColumns:[],defaultSort:environment.sort,backend:'index',
    getSearchInfo(){return {backend:'index',searching,hasMore:!searching && hasMore,limit,count:headers.size,
      note:lastError?'Index search failed; retry the search or disable experimental search.':searching?'Searching Thunderbird’s index…':`Indexed results: ${headers.size}${hasMore?' (more available)':''}. Recent or excluded mail may not be indexed.`};},
    subscribeProgress(fn){subscribers.add(fn);fn(searching);return ()=>subscribers.delete(fn);},
    getDefaultSetting(){return undefined;},getPersistedSetting(name){return this.getDefaultSetting(name);},setPersistedSetting(){},
    getMsgHdrForMessageID(id){return [...headers.values()].find(header=>header.messageId===id) || null;},
    loadMore(){if(searching || !hasMore)return false;limit+=pageSize;return true;},
    search(listener,callback){
      this.abortSearch();environment.onStart?.(this);headers.clear();rawCount=0;hasMore=false;lastError=false;
      const revision=++generation,record={listener,callback,done:false,collection:null};job=record;
      const current=()=>job===record && !record.done && revision===generation;
      listener.onNewSearch();notify(true);
      const events={
        onItemsAdded(items){
          if(!current())return;
          // One additional indexed row detects truncation without hiding the limit.
          for(const item of items){
            if(!current())return;
            rawCount++;if(rawCount>limit){hasMore=true;continue;}
            let header;
            try{header=item.folderMessage;if(!header || !environment.accept(header))continue;}
            catch(_){continue;} // Stale index entries can outlive deleted folders.
            const key=header.folder.URI+'#'+header.messageKey;if(headers.has(key))continue;
            headers.set(key,header);listener.onSearchHit(header,header.folder);
          }
        },
        onItemsModified(){},onItemsRemoved(){},
        onError(error){if(current()){lastError=true;environment.reportError(error);finish(record,environment.failureCode || 0x80004005);}},
        onQueryCompleted(){if(current())finish(record);}
      };
      try{
        const collection=environment.createCollection(text,limit+1,events);
        if(current())record.collection=collection;
        else if(collection){collection.listener=null;collection.becomeExplicit?.();}
      }catch(error){if(current()){lastError=true;try{environment.reportError(error);}finally{finish(record,environment.failureCode || 0x80004005);}}}
    },
    abortSearch(){generation++;const previous=job;if(previous)finish(previous);job=null;headers.clear();hasMore=false;environment.onStop?.(this);}
  };
  return view;
}

// Split only conjunctions: never distribute text across OR or exclusions.
function gmailIndexedPlan(ast) {
  const nodes=ast.type==='and'?ast.children.flatMap(function flatten(n){return n.type==='and'?n.children.flatMap(flatten):[n];}):[ast];
  const text=[],filters=[];
  for(const node of nodes){
    if(gmailIndexedText(node))text.push(node);
    else if(gmailSearchAtoms(node).every(atom=>!['text','filename'].includes(atom.field)))filters.push(node);
    else return null;
  }
  if(!text.length || (filters.length && !filters.some(node=>gmailSearchAtoms(node).some(atom=>atom.field==='label'))))return null;
  return {text:gmailIndexedText({type:'and',children:text}),filter:filters.length?{type:'and',children:filters}:null};
}

// Native label filtering completes before any indexed text query is submitted.
function gmailLabelFirstCollection(text,limit,listener,environment) {
  const controller=new environment.AbortController();let active=null,disposed=false,release=null;
  const result={listener,becomeExplicit(){disposed=true;controller.abort();release?.();if(active){active.listener=null;active.becomeExplicit?.();active=null;}}};
  const emit=(name,...args)=>{if(!disposed)result.listener?.[name]?.(...args);};
  (async()=>{
    const candidates=new Map();
    await environment.filter(controller.signal,header=>{
      const id=header.getUint32Property('gloda-id');
      if(id<32)return; // Thunderbird reserves lower IDs for unindexed/bad messages.
      if(!candidates.has(id))candidates.set(id,[]);
      candidates.get(id).push(header);
    });
    if(disposed)return;
    const ids=[...candidates.keys()];
    // Stay below SQLite's bind-variable limit, including the full-text parameter.
    for(let offset=0;offset<ids.length && !disposed;offset+=250){
      await new Promise((resolve,reject)=>{
        let completed=false;release=resolve;
        const events={onItemsAdded(items){
          for(const item of items)for(const header of candidates.get(item.id)||[]){
            if(environment.accept(header))emit('onItemsAdded',[{folderMessage:header}]);
          }
        },onItemsModified(){},onItemsRemoved(){},onQueryCompleted(){completed=true;resolve();}};
        try{
          const collection=environment.query(text,ids.slice(offset,offset+250),limit,events);
          if(disposed || completed){collection.listener=null;collection.becomeExplicit?.();}
          else active=collection;
        }catch(error){reject(error);}
      });
      if(active){active.listener=null;active.becomeExplicit?.();active=null;}
    }
    emit('onQueryCompleted');
  })().catch(error=>{if(!disposed){emit('onError',error);}});
  return result;
}
