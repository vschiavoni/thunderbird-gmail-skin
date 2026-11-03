browser.inlineLabels.onOpenSettings?.addListener(()=>browser.runtime.openOptionsPage().catch(console.error));
// The provider authenticates our extension ID; no sender or result is synthesized.
browser.inlineLabels.onDkimRequest.addListener(async(request,messageId,domain,baseDomain,details,popupContext)=>{
  let result;
  try {result=await browser.runtime.sendMessage('dkim_verifier@pl',domain?{module:'ThunderG',method:'bimi',domain,baseDomain}:{module:'ThunderG',method:popupContext?'release':details?'details':'verify',messageId,contextId:popupContext});if(!(domain?result && 'logo' in result:popupContext?result?.released:details?Number.isInteger(result?.contextId):result?.dkim))throw new Error('DKIM bridge unavailable');}
  catch(_){result={error:'DKIM Verifier integration unavailable'};}
  await browser.inlineLabels.resolveDkim(request,JSON.stringify(result));
});
async function startThunderG() {
  await ThunderGI18n.ready;
  await browser.inlineLabels.setLanguage?.(ThunderGI18n.language);
  // Optional settings must never prevent the companion from starting.
  let coloredStars=null;
  let gmailShortcuts=false, compactConversations=true, searchResultsAsList=true, showColumnHeaders = false, threadGuides = true, threadExpandArrows=false, independentReader = false, hideTodayPane = false, messagesPerPage = 0, composeAutosave = true, composeAutosaveMinutes = 1, composeAutosaveMode = 'auto', bimiEnabled = false, inlineReplyEnabled = false, inlineNewMessageEnabled = false;
  try {
    const settings = await browser.storage.local.get({coloredStars:null,gmailShortcuts:false,compactConversations:true,searchResultsAsList:true,showColumnHeaders:false,threadGuides:true,threadExpandArrows:false,independentReader:false,hideTodayPane:false,messagesPerPage:0,composeAutosave:true,composeAutosaveMinutes:1,composeAutosaveMode:'auto',bimiEnabled:false,inlineReplyEnabled:false,inlineNewMessageEnabled:false});
    searchResultsAsList=settings.searchResultsAsList!==false;
    coloredStars=settings.coloredStars;
    threadExpandArrows=settings.threadExpandArrows===true;
    showColumnHeaders = settings.showColumnHeaders === true;
    threadGuides = settings.threadGuides !== false;
    bimiEnabled = settings.bimiEnabled === true;
    gmailShortcuts=settings.gmailShortcuts===true;
    inlineReplyEnabled = settings.inlineReplyEnabled === true;
    inlineNewMessageEnabled = settings.inlineNewMessageEnabled === true;
    hideTodayPane = settings.hideTodayPane === true;
    independentReader = settings.independentReader === true;
    compactConversations = settings.compactConversations !== false;
    messagesPerPage = settings.messagesPerPage;
    composeAutosave = settings.composeAutosave !== false;
    composeAutosaveMinutes = settings.composeAutosaveMinutes;
    composeAutosaveMode=settings.composeAutosaveMode==='fixed'?'fixed':'auto';
  } catch (error) { console.warn('Thunder-G: using default settings.',error); }
  await browser.inlineLabels.setSearchResultsAsList?.(searchResultsAsList);
  await browser.inlineLabels.setShowColumnHeaders?.(showColumnHeaders);
  await browser.inlineLabels.setColoredStars?.(coloredStars);
  await browser.inlineLabels.setThreadExpandArrows?.(threadExpandArrows);
  await browser.inlineLabels.setThreadGuides?.(threadGuides);
  await browser.inlineLabels.setHideTodayPane(hideTodayPane);
  await browser.inlineLabels.setComposeAutosave(composeAutosave,composeAutosaveMinutes || 1,composeAutosaveMode);
  await browser.inlineLabels.setMessagesPerPage(messagesPerPage || 0);
  await browser.inlineLabels.setCompactConversations(compactConversations);
  await browser.inlineLabels.setIndependentReader(independentReader);
  await browser.inlineLabels.setBimiEnabled?.(bimiEnabled);
  await browser.inlineLabels.setInlineReplyEnabled?.(inlineReplyEnabled);
  await browser.inlineLabels.setInlineNewMessageEnabled?.(inlineNewMessageEnabled);
  await browser.inlineLabels.setGmailShortcuts?.(gmailShortcuts);
  await browser.inlineLabels.start();
  browser.storage.onChanged.addListener((changes, area) => {
    if(area==='local' && changes.gmailShortcuts)browser.inlineLabels.setGmailShortcuts(changes.gmailShortcuts.newValue===true).catch(console.error);
    if(area==='local' && changes.interfaceLanguage){ThunderGI18n.setPreference(changes.interfaceLanguage.newValue);browser.inlineLabels.setLanguage(ThunderGI18n.language).catch(console.error);}
    if(area==='local' && changes.searchResultsAsList)browser.inlineLabels.setSearchResultsAsList(changes.searchResultsAsList.newValue!==false).catch(console.error);
    if(area==='local' && changes.showColumnHeaders)browser.inlineLabels.setShowColumnHeaders(changes.showColumnHeaders.newValue===true).catch(console.error);
    if(area==='local' && changes.coloredStars)browser.inlineLabels.setColoredStars?.(changes.coloredStars.newValue ?? null)?.catch(console.error);
    if(area==='local' && changes.threadExpandArrows)browser.inlineLabels.setThreadExpandArrows?.(changes.threadExpandArrows.newValue===true)?.catch(console.error);
    if(area==='local' && changes.threadGuides)browser.inlineLabels.setThreadGuides(changes.threadGuides.newValue!==false).catch(console.error);
    if (area === 'local' && (changes.composeAutosave || changes.composeAutosaveMinutes || changes.composeAutosaveMode)) {
      if(changes.composeAutosaveMode)composeAutosaveMode=changes.composeAutosaveMode.newValue==='fixed'?'fixed':'auto';
      if (changes.composeAutosave) composeAutosave = changes.composeAutosave.newValue !== false;
      if (changes.composeAutosaveMinutes) composeAutosaveMinutes = changes.composeAutosaveMinutes.newValue || 1;
      browser.inlineLabels.setComposeAutosave(composeAutosave,composeAutosaveMinutes || 1,composeAutosaveMode).catch(console.error);
    }
    if (area === 'local' && changes.messagesPerPage) {
      browser.inlineLabels.setMessagesPerPage(changes.messagesPerPage.newValue || 0).catch(console.error);
    }
    if(area==='local' && changes.compactConversations)browser.inlineLabels.setCompactConversations(changes.compactConversations.newValue!==false).catch(console.error);
    if (area === 'local' && changes.independentReader) {
      browser.inlineLabels.setIndependentReader(changes.independentReader.newValue === true).catch(console.error);
    }
    if(area==='local' && changes.inlineNewMessageEnabled)browser.inlineLabels.setInlineNewMessageEnabled(changes.inlineNewMessageEnabled.newValue===true).catch(console.error);
    if(area==='local' && changes.inlineReplyEnabled)browser.inlineLabels.setInlineReplyEnabled(changes.inlineReplyEnabled.newValue===true).catch(console.error);
    if(area==='local' && changes.bimiEnabled)browser.inlineLabels.setBimiEnabled(changes.bimiEnabled.newValue===true).catch(console.error);
    if (area === 'local' && changes.hideTodayPane) {
      browser.inlineLabels.setHideTodayPane(changes.hideTodayPane.newValue === true).catch(console.error);
    }
  });
}
startThunderG().catch(console.error);
