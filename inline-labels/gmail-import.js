/* Optional, one-shot Gmail label import. No Gmail message APIs or writes.
 * Planning is pure; native tags are only created by commit with a current plan.
 */
const GMAIL_LABEL_SCOPE = 'https://www.googleapis.com/auth/gmail.labels';
function gmailImportPath(value) {
  if (typeof value !== 'string' || !value || value.length > 512 || /[\u0000-\u001f\u007f]/.test(value) ||
      value.split('/').some(part => !part.trim() || part !== part.trim())) {
    throw new Error('Use label paths without empty segments, surrounding spaces or control characters (maximum 512 characters).');
  }
  return value;
}
function gmailImportFold(name) { return name.normalize('NFKC').toLowerCase(); }
function planGmailLabelImport(remote, selected, root, local) {
  root = gmailImportPath(root);
  const wanted = new Set(selected);
  const users = remote.filter(label => label.type === 'user');
  const known = new Set(users.map(label => label.id));
  if ([...wanted].some(id => !known.has(id))) throw new Error('The selection contains an unknown Gmail label. Fetch labels again.');
  const targets = new Map(), invalid = [];
  for (const label of users) {
    if (!wanted.has(label.id)) continue;
    let path;
    try { path = gmailImportPath(root + '/' + label.name); }
    catch (_) { invalid.push({path:root + '/' + label.name, status:'conflict', reason:'Invalid or excessively long label path.', source:label.id}); continue; }
    const parts = path.split('/');
    for (let i = 1; i <= parts.length; i++) {
      const name = parts.slice(0,i).join('/');
      if (!targets.has(name)) targets.set(name,{path:name, requiredParent:true});
      if (i === parts.length) targets.get(name).requiredParent = false;
    }
  }
  const existing = new Map(), proposed = new Map();
  for (const tag of local) {
    const folded = gmailImportFold(tag.tag);
    if (!existing.has(folded)) existing.set(folded,[]);
    existing.get(folded).push(tag);
  }
  for (const path of targets.keys()) {
    const folded = gmailImportFold(path);
    if (!proposed.has(folded)) proposed.set(folded,[]);
    proposed.get(folded).push(path);
  }
  const rows = [...targets.values()].sort((a,b) => a.path.localeCompare(b.path)).map(row => {
    const matches = existing.get(gmailImportFold(row.path)) || [];
    if (proposed.get(gmailImportFold(row.path)).length > 1) return {...row,status:'conflict',reason:'Selected Gmail paths differ only in case or Unicode normalization.'};
    if (matches.length > 1 || (matches.length === 1 && matches[0].tag !== row.path)) return {...row,status:'conflict',reason:'Conflicts with an existing local label: ' + matches.map(tag=>tag.tag).join(', ')};
    return {...row,status:matches.length ? 'skip' : 'create', ...(matches.length ? {key:matches[0].key} : {})};
  });
  rows.push(...invalid);
  return {root, selected:[...wanted].sort(), rows, counts:{create:rows.filter(r=>r.status==='create').length,skip:rows.filter(r=>r.status==='skip').length,conflict:rows.filter(r=>r.status==='conflict').length}};
}
function gmailImportFingerprint(plan) { return JSON.stringify(plan); }
function createGmailLabelImporter({service, authorize, fetchJSON, randomId}) {
  let session = null, plan = null, epoch = 0, busy = false, closed = false;
  const active = () => { if (closed || !session) throw new Error('Connect to Gmail first.'); return session; };
  const publicState = () => ({connected:!!session, email:session?.email || '', labels:session?.labels.filter(l=>l.type==='user').map(l=>({...l})) || [], systemLabelsExcluded:session?.labels.filter(l=>l.type==='system').length || 0});
  function disconnect() { epoch++; session?.cancel?.(); session=null; plan=null; }
  return {
    close(){closed=true;disconnect();authorize.cancel?.();},
    async run(action, data = {}) {
      if (closed) throw new Error('The importer has closed.');
      if (action === 'status') return publicState();
      if (action === 'disconnect') {disconnect();authorize.cancel?.();return publicState();}
      if (action === 'cancel') {plan=null;return {cancelled:true};}
      if (action === 'connect') {
        if (busy) throw new Error('A Google connection is already in progress.');
        disconnect();const ticket=epoch;busy=true;
        try {
          const auth=await authorize(data);
          if (closed || ticket!==epoch) throw new Error('Connection cancelled.');
          const account=await fetchJSON('https://openidconnect.googleapis.com/v1/userinfo',auth.token);
          if (!account.email_verified || typeof account.email!=='string' || !account.email.includes('@')) throw new Error('Google did not provide a verified account email.');
          const response=await fetchJSON('https://gmail.googleapis.com/gmail/v1/users/me/labels',auth.token);
          if (!Array.isArray(response.labels) || response.labels.length>10000 || response.labels.some(l=>typeof l.id!=='string' || typeof l.name!=='string' || !['user','system'].includes(l.type)) || new Set(response.labels.map(l=>l.id)).size!==response.labels.length) throw new Error('Google returned an invalid label list.');
          if (closed || ticket!==epoch) throw new Error('Connection cancelled.');
          session={email:account.email, labels:response.labels.map(({id,name,type})=>({id,name,type}))};
          return publicState();
        } finally {busy=false;}
      }
      if (busy) throw new Error('Wait for Google sign-in to finish.');
      const current=active();
      if (action === 'preview') {
        plan=null;
        if (!Array.isArray(data.selected) || typeof data.root!=='string') throw new Error('Choose labels and a destination.');
        const result=planGmailLabelImport(current.labels,data.selected,data.root,service.getAllTags());
        plan={token:randomId(),result, email:current.email};
        return {...result,previewToken:plan.token,email:current.email};
      }
      if (action !== 'import') throw new Error('Unknown import operation.');
      if (!plan || data.previewToken!==plan.token || plan.email!==current.email) throw new Error('Preview the selected labels again before importing.');
      const saved=plan;plan=null; // One use, including partial failures.
      const fresh=planGmailLabelImport(current.labels,saved.result.selected,saved.result.root,service.getAllTags());
      if (gmailImportFingerprint(fresh)!==gmailImportFingerprint(saved.result)) throw new Error('Local labels changed since the preview. Run Preview again; nothing was imported.');
      if (fresh.counts.conflict) throw new Error('Resolve conflicts or exclude those branches, then preview again. Nothing was imported.');
      const result={created:[],skipped:fresh.rows.filter(r=>r.status==='skip').map(r=>r.path),failed:[],email:current.email};
      // Synchronous native writes prevent another importer operation interleaving.
      // Parents first, with no changes to existing keys, colors or assignments.
      const rows=fresh.rows.filter(r=>r.status==='create').sort((a,b)=>a.path.split('/').length-b.path.split('/').length || a.path.localeCompare(b.path));
      for (let i=0;i<rows.length;i++) {
        try {service.addTag(rows[i].path,'','');result.created.push(rows[i].path);}
        catch (_) {result.failed=rows.slice(i).map(r=>r.path);result.error='Import stopped after a native label creation failed. Created labels were kept; preview again to retry safely.';break;}
      }
      return result;
    }
  };
}
function createNativeGmailImporter(service) {
  let oauth=null, authTimer=null;
  function cancelAuth() {
    if(authTimer!==null)clearTimeout(authTimer);authTimer=null;
    if(oauth){oauth.finishAuthorizationRequest();oauth.onAuthorizationFailed(null,'Google connection cancelled.','cancelled');oauth=null;}
  }
  async function authorize(data) {
    if (!/^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(data.clientId || '')) throw new Error('Configure an optional Google Desktop OAuth client first. See Gmail import setup.');
    if (!Services.prefs.getBoolPref('mailnews.oauth.useExternalBrowser',true)) throw new Error('Google sign-in requires Thunderbird’s external-browser OAuth setting. No sign-in was opened.');
    const {OAuth2}=ChromeUtils.importESModule('resource:///modules/OAuth2.sys.mjs');
    const request=new OAuth2('openid email '+GMAIL_LABEL_SCOPE,{
      authorizationEndpoint:'https://accounts.google.com/o/oauth2/v2/auth',
      tokenEndpoint:'https://oauth2.googleapis.com/token', clientId:data.clientId,
      clientSecret:typeof data.clientSecret==='string' ? data.clientSecret : null,
      usePKCE:true,useExternalBrowser:true,redirectionEndpoint:'http://127.0.0.1'
    });
    request.extraAuthParams=[['prompt','select_account consent'],['access_type','online']];
    oauth=request;authTimer=setTimeout(cancelAuth,180000);
    try {
      await request.connect(true,false);
      if (!request.scope.split(' ').includes(GMAIL_LABEL_SCOPE)) throw new Error('Google label permission was not granted.');
      return {token:request.accessToken};
    } catch (_) {throw new Error('Google sign-in failed, was cancelled, or timed out. Check the Desktop client configuration, Gmail API access and Google consent.');}
    finally {
      if(authTimer!==null)clearTimeout(authTimer);authTimer=null;
      request.finishAuthorizationRequest();request.accessToken=null;request.refreshToken=null;
      if(oauth===request)oauth=null;
    }
  }
  authorize.cancel=cancelAuth;
  async function fetchJSON(url,token) {
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),30000);
    try {
      const response=await fetch(url,{headers:{Authorization:'Bearer '+token},credentials:'omit',redirect:'error',signal:abort.signal});
      if(!response.ok)throw new Error(response.status===401 ? 'Google authorization expired. Connect again.' : `Google could not fetch account or label information (HTTP ${response.status}).`);
      return await response.json();
    } catch(error) {if(error.name==='AbortError')throw new Error('Google request timed out. Connect again to retry.');throw error;}
    finally {clearTimeout(timer);}
  }
  return createGmailLabelImporter({service,authorize,fetchJSON,randomId:()=>Services.uuid.generateUUID().toString()});
}
