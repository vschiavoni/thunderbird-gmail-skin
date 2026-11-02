const checkbox = document.getElementById('hide-today-pane');
const status = document.getElementById('status');
let statusTimer = null;
function reportStatus(message) {
  if (statusTimer !== null) clearTimeout(statusTimer);
  statusTimer = null;
  status.textContent = message;
  status.dataset.kind = message.startsWith(gmText("Unable")) ? 'error' : 'success';
  if (status.dataset.kind === 'success') {
    // Leave explanatory confirmations readable longer than a simple "Saved".
    statusTimer = setTimeout(() => {
      statusTimer = null;
      status.textContent = '';
    }, message.length > 20 ? 6000 : 3000);
  }
}
window.addEventListener('pagehide', () => {
  if (statusTimer !== null) clearTimeout(statusTimer);
  statusTimer = null;
});
const manifest = browser.runtime.getManifest();
document.getElementById('version').textContent = `v${manifest.version}`;
if (manifest.homepage_url) document.getElementById('repository').href = manifest.homepage_url;
checkbox.disabled = true;
browser.storage.local.get({hideTodayPane:false}).then(settings => {
  checkbox.checked = settings.hideTodayPane === true;
  checkbox.disabled = false;
}).catch(() => { reportStatus(gmText("Unable to load settings.")); });
checkbox.addEventListener('change',async () => {
  checkbox.disabled = true;
  try {
    await browser.storage.local.set({hideTodayPane:checkbox.checked});
    reportStatus(gmText("Saved."));
  } catch (_) {
    checkbox.checked = !checkbox.checked;
    reportStatus(gmText("Unable to save. Please try again."));
  } finally { checkbox.disabled = false; }
});

const autosave = document.getElementById('compose-autosave');
const autosaveTiming=document.getElementById('compose-autosave-timing');
autosave.disabled=autosaveTiming.disabled=true;
let savedAutosave={composeAutosave:true,composeAutosaveMode:'auto',composeAutosaveMinutes:1};
function showAutosave(settings){
  autosave.checked=settings.composeAutosave!==false;
  autosaveTiming.value=settings.composeAutosaveMode==='fixed'?String([1,2,5,10].includes(settings.composeAutosaveMinutes)?settings.composeAutosaveMinutes:1):'auto';
  autosave.disabled=false;autosaveTiming.disabled=!autosave.checked;
}
browser.storage.local.get(savedAutosave).then(settings=>{savedAutosave=settings;showAutosave(settings)}).catch(()=>reportStatus('Unable to load settings.'));
async function saveAutosave(){
  autosave.disabled=autosaveTiming.disabled=true;
  const settings={composeAutosave:autosave.checked,composeAutosaveMode:autosaveTiming.value==='auto'?'auto':'fixed',composeAutosaveMinutes:autosaveTiming.value==='auto'?savedAutosave.composeAutosaveMinutes:Number(autosaveTiming.value)};
  try{await browser.storage.local.set(settings);savedAutosave=settings;reportStatus('Saved. Applies to open and new composers.');}
  catch(_){reportStatus('Unable to save. Please try again.');}
  finally{showAutosave(savedAutosave)}
}
autosave.addEventListener('change',saveAutosave);autosaveTiming.addEventListener('change',saveAutosave);

const pageSize = document.getElementById('messages-per-page');
pageSize.disabled = true;
let savedPageSize = 0;
browser.storage.local.get({messagesPerPage:0}).then(settings => {
  savedPageSize = [25,50,100].includes(settings.messagesPerPage) ? settings.messagesPerPage : 0;
  pageSize.value = String(savedPageSize); pageSize.disabled = false;
}).catch(() => { reportStatus(gmText("Unable to load settings.")); });
pageSize.addEventListener('change', async () => {
  pageSize.disabled = true;
  try {
    const value = Number(pageSize.value);
    await browser.storage.local.set({messagesPerPage:value}); savedPageSize = value;
    reportStatus(gmText("Saved."));
  } catch (_) {
    pageSize.value = String(savedPageSize); reportStatus(gmText("Unable to save. Please try again."));
  } finally { pageSize.disabled = false; }
});

const independentReader = document.getElementById('independent-reader');
independentReader.disabled = true;
browser.storage.local.get({independentReader:false}).then(settings => {
  independentReader.checked = settings.independentReader === true;
  independentReader.disabled = false;
}).catch(() => { reportStatus(gmText("Unable to load settings.")); });
independentReader.addEventListener('change', async () => {
  independentReader.disabled = true;
  try {
    await browser.storage.local.set({independentReader:independentReader.checked});
    reportStatus(gmText("Saved. Open a message from the list to use the selected reader."));
  } catch (_) {
    independentReader.checked = !independentReader.checked;
    reportStatus(gmText("Unable to save. Please try again."));
  } finally { independentReader.disabled = false; }
});

const bimi = document.getElementById('bimi-enabled');
bimi.disabled=true;
browser.storage.local.get({bimiEnabled:false}).then(settings=>{bimi.checked=settings.bimiEnabled===true;bimi.disabled=false;}).catch(()=>{reportStatus(gmText("Unable to load settings."));});
bimi.addEventListener('change',async()=>{
  bimi.disabled=true;
  try {await browser.storage.local.set({bimiEnabled:bimi.checked});reportStatus(gmText("Saved."));}
  catch(_){bimi.checked=!bimi.checked;reportStatus(gmText("Unable to save. Please try again."));}
  finally{bimi.disabled=false;}
});

const inlineReply=document.getElementById('inline-reply-enabled');
inlineReply.disabled=true;
browser.storage.local.get({inlineReplyEnabled:false}).then(settings=>{inlineReply.checked=settings.inlineReplyEnabled===true;inlineReply.disabled=false;}).catch(()=>{reportStatus(gmText("Unable to load settings."));});
inlineReply.addEventListener('change',async()=>{
 inlineReply.disabled=true;
 try{await browser.storage.local.set({inlineReplyEnabled:inlineReply.checked});reportStatus(gmText("Saved. Applies to new replies; an open reply stays available."));}
 catch(_){inlineReply.checked=!inlineReply.checked;reportStatus(gmText("Unable to save. Please try again."));}
 finally{inlineReply.disabled=false;}
});

const inlineNewMessage=document.getElementById('inline-new-message');
inlineNewMessage.disabled=true;
browser.storage.local.get({inlineNewMessageEnabled:false}).then(settings=>{inlineNewMessage.checked=settings.inlineNewMessageEnabled===true;inlineNewMessage.disabled=false;}).catch(()=>{reportStatus(gmText("Unable to load settings."));});
inlineNewMessage.addEventListener('change',async()=>{
 inlineNewMessage.disabled=true;
 try{await browser.storage.local.set({inlineNewMessageEnabled:inlineNewMessage.checked});reportStatus(gmText("Saved. Applies to new messages; an open message stays available."));}
 catch(_){inlineNewMessage.checked=!inlineNewMessage.checked;reportStatus(gmText("Unable to save. Please try again."));}
 finally{inlineNewMessage.disabled=false;}
});

const threadGuides = document.getElementById('thread-guides');
threadGuides.disabled = true;
browser.storage.local.get({threadGuides:true}).then(settings => {
  threadGuides.checked = settings.threadGuides !== false;
  threadGuides.disabled = false;
}).catch(() => { reportStatus(gmText("Unable to load settings.")); });
threadGuides.addEventListener('change', async () => {
  threadGuides.disabled = true;
  try {
    await browser.storage.local.set({threadGuides:threadGuides.checked});
    reportStatus(gmText("Saved."));
  } catch (_) {
    threadGuides.checked = !threadGuides.checked;
    reportStatus(gmText("Unable to save. Please try again."));
  } finally { threadGuides.disabled = false; }
});

const columnHeaders = document.getElementById('show-column-headers');
columnHeaders.disabled = true;
browser.storage.local.get({showColumnHeaders:false}).then(settings => {
  columnHeaders.checked = settings.showColumnHeaders === true;
  columnHeaders.disabled = false;
}).catch(() => reportStatus(gmText("Unable to load settings.")));
columnHeaders.addEventListener('change', async () => {
  columnHeaders.disabled = true;
  try {
    await browser.storage.local.set({showColumnHeaders:columnHeaders.checked});
    reportStatus(gmText("Saved."));
  } catch (_) {
    columnHeaders.checked = !columnHeaders.checked;
    reportStatus(gmText("Unable to save. Please try again."));
  } finally { columnHeaders.disabled = false; }
});

const searchResultsAsList=document.getElementById('search-results-as-list');
searchResultsAsList.disabled=true;
browser.storage.local.get({searchResultsAsList:true}).then(settings=>{
 searchResultsAsList.checked=settings.searchResultsAsList!==false;searchResultsAsList.disabled=false;
}).catch(()=>reportStatus(gmText("Unable to load settings.")));
searchResultsAsList.addEventListener('change',async()=>{
 searchResultsAsList.disabled=true;
 try{await browser.storage.local.set({searchResultsAsList:searchResultsAsList.checked});reportStatus(gmText("Saved. Applies to new searches."));}
 catch(_){searchResultsAsList.checked=!searchResultsAsList.checked;reportStatus(gmText("Unable to save. Please try again."));}
 finally{searchResultsAsList.disabled=false;}
});

const compactConversations=document.getElementById('compact-conversations');
compactConversations.disabled=true;
browser.storage.local.get({compactConversations:true}).then(settings=>{
  compactConversations.checked=settings.compactConversations!==false;compactConversations.disabled=false;
}).catch(()=>reportStatus(gmText("Unable to load settings.")));
compactConversations.addEventListener('change',async()=>{
  compactConversations.disabled=true;
  try{await browser.storage.local.set({compactConversations:compactConversations.checked});reportStatus('Saved. Applies when opening a conversation.');}
  catch(_){compactConversations.checked=!compactConversations.checked;reportStatus('Unable to save. Please try again.');}
  finally{compactConversations.disabled=false;}
});

const interfaceLanguage = document.getElementById('interface-language');
interfaceLanguage.disabled = true;
let savedLanguage = 'auto';
browser.storage.local.get({interfaceLanguage:'auto'}).then(settings => {
  savedLanguage = ['en','it'].includes(settings.interfaceLanguage) ? settings.interfaceLanguage : 'auto';
  interfaceLanguage.value = savedLanguage;
  interfaceLanguage.disabled = false;
}).catch(() => reportStatus(gmText('Unable to load settings.')));
interfaceLanguage.addEventListener('change', async () => {
  interfaceLanguage.disabled = true;
  try {
    const value = ['en','it'].includes(interfaceLanguage.value) ? interfaceLanguage.value : 'auto';
    await browser.storage.local.set({interfaceLanguage:value});
    savedLanguage = value;
    ThunderGI18n.setPreference(value);
    gmLocalizeDocument(document);
    reportStatus(gmText('Saved. Thunder-G’s language has been updated.'));
  } catch (_) {
    interfaceLanguage.value = savedLanguage;
    reportStatus(gmText('Unable to save. Please try again.'));
  } finally { interfaceLanguage.disabled = false; }
});


// A single storage write lets the existing onChanged handler apply the preset.
// Leave language, remote-logo consent and Gmail import state untouched.
const THUNDER_G_RECOMMENDED_SETTINGS = Object.freeze({
  showColumnHeaders:false, messagesPerPage:50, hideTodayPane:true,
  threadGuides:true, searchResultsAsList:true, independentReader:true,
  inlineReplyEnabled:true, inlineNewMessageEnabled:true,
  composeAutosave:true, composeAutosaveMode:'auto', composeAutosaveMinutes:1
});
const recommendedButton=document.getElementById('apply-recommended');
const recommendedStatus=document.getElementById('recommended-status');
browser.storage.local.get(THUNDER_G_RECOMMENDED_SETTINGS).then(()=>{
  recommendedButton.disabled=false;
}).catch(()=>{recommendedStatus.textContent=gmText('Unable to load settings.');recommendedStatus.dataset.kind='error';});
recommendedButton.addEventListener('click',async()=>{
  const controls=[checkbox,autosave,autosaveTiming,pageSize,independentReader,bimi,inlineReply,inlineNewMessage,threadGuides,columnHeaders,searchResultsAsList,interfaceLanguage];
  const disabled=controls.map(control=>control.disabled);
  recommendedButton.disabled=true;for(const control of controls)control.disabled=true;
  recommendedButton.textContent=gmText('Applying…');recommendedStatus.textContent='';
  let applied=false;
  try{
    await browser.storage.local.set({...THUNDER_G_RECOMMENDED_SETTINGS});
    const switches={hideTodayPane:checkbox,composeAutosave:autosave,independentReader,inlineReplyEnabled:inlineReply,
      inlineNewMessageEnabled:inlineNewMessage,threadGuides,showColumnHeaders:columnHeaders,searchResultsAsList};
    for(const [name,control] of Object.entries(switches))control.checked=THUNDER_G_RECOMMENDED_SETTINGS[name];
    savedPageSize=THUNDER_G_RECOMMENDED_SETTINGS.messagesPerPage;pageSize.value=String(savedPageSize);
    savedAutosave={composeAutosave:true,composeAutosaveMode:'auto',composeAutosaveMinutes:1};showAutosave(savedAutosave);
    applied=true;recommendedStatus.dataset.kind='success';
    recommendedStatus.textContent=gmText('Recommended settings applied. Open a conversation to try them.');
  }catch(_){
    recommendedStatus.dataset.kind='error';recommendedStatus.textContent=gmText('Unable to save. Please try again.');
  }finally{
    controls.forEach((control,index)=>control.disabled=disabled[index]);
    if(applied)autosaveTiming.disabled=false;
    recommendedButton.disabled=false;recommendedButton.textContent=gmText('Apply recommended');
  }
});

const gmailShortcuts=document.getElementById('gmail-shortcuts');
gmailShortcuts.disabled=true;
browser.storage.local.get({gmailShortcuts:false}).then(settings=>{gmailShortcuts.checked=settings.gmailShortcuts===true;gmailShortcuts.disabled=false;}).catch(()=>reportStatus(gmText('Unable to load settings.')));
gmailShortcuts.addEventListener('change',async()=>{
 gmailShortcuts.disabled=true;
 try{await browser.storage.local.set({gmailShortcuts:gmailShortcuts.checked});reportStatus(gmText('Saved.'));}
 catch(_){gmailShortcuts.checked=!gmailShortcuts.checked;reportStatus(gmText('Unable to save. Please try again.'));}
 finally{gmailShortcuts.disabled=false;}
});
