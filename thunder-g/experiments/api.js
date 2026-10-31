var { setTimeout, clearTimeout } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");
var verifyIndependentDkim = null,openIndependentDkimPopup=null;
var compactConversationsEnabled=true;
var independentBimiEnabled=false,independentBimiListeners=new Set();
var { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
var { ExtensionCommon } = ChromeUtils.importESModule("resource://gre/modules/ExtensionCommon.sys.mjs");
var { ExtensionSupport } = ChromeUtils.importESModule("resource:///modules/ExtensionSupport.sys.mjs");
var { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");

function mailPaneReady(doc) {
  const win = doc.defaultView;
  return doc.readyState === 'complete' && !!win?.threadPane &&
    ['paneLayout','threadTree','folderTree'].every(id => doc.getElementById(id));
}
function waitForMailPane(doc, onReady, onClose = () => {}) {
  const win = doc.defaultView;
  let timer = null, stopped = false, attempts = 0;
  function close() {
    if (stopped) return;
    stopped = true;
    if (timer !== null) win.clearTimeout(timer);
    win.removeEventListener('unload',close);
    onClose();
  }
  function check() {
    timer = null;
    if (stopped || win.closed) { close(); return; }
    if (mailPaneReady(doc)) { close(); onReady(); return; }
    if (++attempts < 100) timer = win.setTimeout(check,100);
    else { close(); console.warn('Thunder-G: mail pane is not ready; waiting for a later load event.'); }
  }
  win.addEventListener('unload',close,{once:true});
  timer = win.setTimeout(check,0);
  return {close};
}

// New synthetic search tabs do not reliably bubble their document load through
// the main window. Watch each chrome browser as well as native tab lifecycle.
function watchMailTabs(win,scan) {
  const tabmail=win.document.getElementById('tabmail'),tabs=new Map();
  if(!tabmail?.registerTabMonitor)return {close(){}};
  function watch(tab){
    const root=tab?.chromeBrowser || tab?.iframe || tab?.browser;if(!root)return;
    if(!tabs.has(tab))tabs.set(tab,new Map());
    const browsers=tabs.get(tab);
    function visit(browser){
      if(!browsers.has(browser)){
        const load=()=>visit(browser);
        browser.addEventListener('load',load,true);browsers.set(browser,load);
      }
      try{
        const doc=browser.contentDocument;if(!doc)return;
        scan(doc);
        // The global search uses an HTML iframe wrapper containing a chrome
        // browser. Its load event targets the element, not a Document.
        for(const child of doc.querySelectorAll?.('browser, iframe') || [])visit(child);
      }catch(error){console.error('Thunder-G: could not inspect mail tab.',error);}
    }
    visit(root);
  }
  function forget(tab){const browsers=tabs.get(tab);if(!browsers)return;for(const [browser,load]of browsers)browser.removeEventListener('load',load,true);tabs.delete(tab);}
  const monitor={onTabOpened:watch,onTabRestored:watch,onTabSwitched:watch,onTabClosing:forget,onTabTitleChanged(){},onTabPersist(){return null}};
  tabmail.registerTabMonitor(monitor);for(const tab of tabmail.tabInfo || [])watch(tab);
  return {close(){tabmail.unregisterTabMonitor(monitor);for(const tab of [...tabs.keys()])forget(tab);}};
}

// Reuse Thunderbird's own Show results as list action after its full query has
// completed. No second search, copied result limit, or permanent native pref.
function installSearchListDefault(win,isEnabled) {
  let context=null,original=null,closed=false,opened=false,timer=null,attempts=0;
  function refresh(){
    if(closed || opened)return;
    if(!context){
      const candidate=win.FacetContext;
      if(typeof candidate?.initialBuild!=='function'){
        if(timer===null && ++attempts<=100)timer=win.setTimeout(()=>{timer=null;refresh();},100);
        return;
      }
      context=candidate;original=context.initialBuild;context.initialBuild=initialBuild;
    }
    if(!isEnabled() || !Array.isArray(context.activeSet) || !context.tab)return;
    const tabmail=context.rootWin?.document.getElementById('tabmail');
    if(!tabmail || tabmail.currentTabInfo!==context.tab)return;
    try{
      context.showActiveSetInTab();opened=true;
      // Only close the faceted tab after the native list was opened.
      tabmail.closeTab(context.tab);
    }catch(error){console.error('Thunder-G: could not open search results as a list.',error);}
  }
  function initialBuild(...args){const result=original.apply(this,args);refresh();return result;}
  function close(){
    if(closed)return;closed=true;if(timer!==null)win.clearTimeout(timer);timer=null;
    if(context?.initialBuild===initialBuild)context.initialBuild=original;
    win.removeEventListener('unload',close);
  }
  win.addEventListener('unload',close,{once:true});
  return {refresh,close};
}

var inlineLabels = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    const dkimRequests = new Map();let dkimSequence=0,dkimFire=null;
    verifyIndependentDkim = (header,details=false,popupContext=0) => new Promise((resolve,reject) => {
      const provider=ExtensionParent.GlobalManager.extensionMap.get('dkim_verifier@pl');
      if(!provider || !dkimFire){reject(new Error(gmText("DKIM Verifier integration unavailable")));return;}
      const message=typeof header==='string'?{id:0}:provider.messageManager.convert(header),request=++dkimSequence;
      const timer=setTimeout(()=>{dkimRequests.delete(request);reject(new Error(gmText("DKIM verification timed out")));},60000);
      dkimRequests.set(request,{resolve,reject,timer});
      dkimFire.async(request,message.id,typeof header==='string'?header:'',typeof header==='string'?Services.eTLD.getBaseDomainFromHost(header):'',details,popupContext).catch(()=>{clearTimeout(timer);dkimRequests.delete(request);reject(new Error(gmText("DKIM bridge unavailable")));});
    });
    const dkimPopups=new Set();
    openIndependentDkimPopup=async(header,button)=>{
      for(const close of [...dkimPopups])close();
      const result=await verifyIndependentDkim(header,true);
      const provider=ExtensionParent.GlobalManager.extensionMap.get('dkim_verifier@pl');
      if(!provider || !Number.isInteger(result.contextId) || result.contextId>=-1000)throw new Error(gmText("DKIM popup integration unavailable"));
      if(!button.isConnected){await verifyIndependentDkim(header,false,result.contextId);return;}
      const {ViewPopup}=ChromeUtils.importESModule('resource:///modules/ExtensionPopups.sys.mjs');
      const url=provider.baseURI.resolve('content/displayAction.html')+'?thunderGContext='+result.contextId;
      const popup=new ViewPopup(provider,button.ownerDocument.defaultView.browsingContext.topChromeWindow,url,false,false,false);
      let disposed=false;
      const close=()=>{
        if(disposed)return;disposed=true;dkimPopups.delete(close);
        popup.viewNode.removeEventListener('popuphidden',close);
        verifyIndependentDkim?.(header,false,result.contextId).catch(()=>{});
        popup.destroy();
      };
      dkimPopups.add(close);popup.viewNode.addEventListener('popuphidden',close);
      try {await popup.browserLoaded;await popup.contentReadyAndResized.promise;if(!disposed && button.isConnected)popup.viewNode.openPopup(button,'bottomleft topleft',0,0);else close();}
      catch(error){close();throw error;}
    };
    let gmailImporter = null,labelBackupController=null;
    const documents = new Map();
    const pendingDocuments = new Map();
    const windows = new Map(),tabWatchers=new Map(),startupWindows=new Map();
    const conversationDocuments = new Map();
    const id = context.extension.id;
    const skinWindows = new Map();
    let hideTodayPane = false, showColumnHeaders = false, searchResultsAsList=true;
    const searchViews=new Map();
    let messagesPerPage = 0, independentReader = false, threadGuides = true;
    const readers = new Map();
    const pagedDocuments = new Map(), zoomWindows = new Map();
    const fontSize = ChromeUtils.importESModule("resource:///modules/UIFontSize.sys.mjs").UIFontSize;
    const todayWindows = new Set();
    const todayURI = 'data:text/css;charset=utf-8,' + encodeURIComponent(
      '#today-pane-panel, #today-splitter, #calendar-show-todaypane-panel { display:none !important; }');
    function applyTodayPane(win) {
      if (hideTodayPane && !todayWindows.has(win)) {
        win.windowUtils.loadSheetUsingURIString(todayURI, Ci.nsIDOMWindowUtils.USER_SHEET);
        todayWindows.add(win);
      } else if (!hideTodayPane) removeTodayPaneStyle(win);
    }
    function removeTodayPaneStyle(win) {
      if (!todayWindows.delete(win)) return;
      try { win.windowUtils.removeSheetUsingURIString(todayURI, Ci.nsIDOMWindowUtils.USER_SHEET); }
      catch (_) { /* Closed windows already discarded the sheet. */ }
    }
    const skinURI = 'data:text/css;charset=utf-8,' + encodeURIComponent(GMAIL_SKIN_CSS);
    function loadSkin(win, cssURI = skinURI) {
      if (skinWindows.has(win)) return;
      win.windowUtils.loadSheetUsingURIString(cssURI, Ci.nsIDOMWindowUtils.USER_SHEET);
      skinWindows.set(win, cssURI);
    }
    function unloadSkin(win) {
      win.document?.documentElement?.removeAttribute("data-gm-hide-column-headers");
      const cssURI = skinWindows.get(win);
      if (!skinWindows.delete(win)) return;
      try { win.windowUtils.removeSheetUsingURIString(cssURI, Ci.nsIDOMWindowUtils.USER_SHEET); }
      catch (_) { /* A destroyed window already discarded its sheets. */ }
    }
    let composeAutosave = true, composeAutosaveMinutes = 1, autosaveController = null;
    let started = false;
    let closed = false;
    const attach = doc => {
      if (!closed && doc?.documentURI === "chrome://messenger/content/multimessageview.xhtml") {
        if (!conversationDocuments.has(doc)) conversationDocuments.set(doc,installNativeSummaryStyle(doc.defaultView,MailServices));
        return;
      }
      if(!closed && doc?.documentURI==='chrome://messenger/content/glodaFacetView.xhtml'){
        if(!searchViews.has(doc)){
          const controller=installSearchListDefault(doc.defaultView,()=>searchResultsAsList);
          searchViews.set(doc,controller);
          doc.defaultView.addEventListener('unload',()=>{controller.close();searchViews.delete(doc);},{once:true});
          controller.refresh();
        }else searchViews.get(doc).refresh();
        return;
      }
      if (!closed && doc?.documentURI === 'chrome://conversations/content/experiment-api/stub.html') {
        loadSkin(doc.defaultView, 'data:text/css;charset=utf-8,' + encodeURIComponent(GMAIL_CONVERSATIONS_CSS));
        if (!conversationDocuments.has(doc)) conversationDocuments.set(doc, installConversationStyle(doc.defaultView, GMAIL_CONVERSATIONS_CSS, messageId => {
          // IDs belong to Conversations, not to this extension's message manager.
          const extension = ExtensionParent.GlobalManager.extensionMap.get("gconversation@xulforum.org");
          const header = extension?.messageManager?.get(messageId);
          if (!header) return null;
          return assignedTags(header, MailServices.tags.getAllTags()).map(tag =>
            ({key:tag.key,name:tag.tag,color:tag.color}));
        }, (ids,key) => {
          const extension=ExtensionParent.GlobalManager.extensionMap.get("gconversation@xulforum.org");
          const headers=ids.map(id=>Number.isSafeInteger(id) && id>0 ? extension?.messageManager?.get(id) : null);
          if(!headers.length || headers.some(header=>!header?.folder))throw new Error('Conversation is still loading');
          applyConversationLabel(headers,key,false);
          for(const header of headers)if(header.label && key===`$label${header.label}`)header.label=0;
        }));
        return;
      }
      if (closed || !doc || doc.documentURI !== "about:3pane" || documents.has(doc)) return;
      if (!mailPaneReady(doc)) {
        if (!pendingDocuments.has(doc)) pendingDocuments.set(doc,waitForMailPane(doc,() => {
          pendingDocuments.delete(doc);
          attach(doc);
        }, () => pendingDocuments.delete(doc)));
        return;
      }
      pendingDocuments.get(doc)?.close(); pendingDocuments.delete(doc);
      loadSkin(doc.defaultView);
      doc.documentElement.toggleAttribute("data-gm-hide-column-headers", !showColumnHeaders);
      const labels = installInlineLabels(doc.defaultView, MailServices, Services.prefs);
      const nestedLabels = installNestedLabelSidebar(doc.defaultView);
      const reader = installReadingMode(doc.defaultView);
      readers.set(doc,reader); reader.setIndependent(independentReader);
      const pages = installNativePagination(doc.defaultView,reader);
      pagedDocuments.set(doc,pages); pages.setSize(messagesPerPage);
      const zoom = installMailZoom(doc.defaultView,fontSize,action=>reader.zoom(action));
      const dates = installCompactDates(doc.defaultView);
      const inbox = installInboxControls(doc.defaultView,{threadGuides,reader});
      const conversationBrowser = watchConversationBrowser(doc.defaultView, attach);
      documents.set(doc, { setThreadGuides(enabled){inbox.setThreadGuides(enabled);}, refresh() { labels.refresh(); dates.refresh(); }, close() {
        readers.delete(doc);
        pages.close(); pagedDocuments.delete(doc); zoom.close();
        nestedLabels.close(); conversationBrowser.close(); inbox.close(); dates.close(); reader.close(); labels.close();
      }});
    };
    const scan = doc => {
      attach(doc);
      for (const browser of doc.querySelectorAll("browser")) {
        try { if (browser.contentDocument) scan(browser.contentDocument); }
        catch (error) { console.error("Inline labels document attachment:", error); }
      }
    };
    const nativeComposeAutosaves=new Map();
    const loadWindow = win => {
      if (closed || win.closed) return;
      if (windows.has(win)) { scan(win.document); return; }
      if(win.document.documentURI==='chrome://messenger/content/messengercompose/messengercompose.xhtml'){
        nativeComposeAutosaves.set(win,installNativeChangeAutosave(win));return;
      }
      loadSkin(win);
      if(win.document.documentURI==='chrome://messenger/content/messenger.xhtml' && !startupWindows.has(win)) {
        let activityManager=null;
        try {activityManager=Cc['@mozilla.org/activity-manager;1'].getService(Ci.nsIActivityManager);}catch(_){/* Native dialogs still report connection errors. */}
        startupWindows.set(win,installStartupSplash(win,{
          logoURI:context.extension.baseURI.resolve('icons/thunder-g.svg'),
          isStyled:doc=>documents.has(doc),activityManager,
        }));
      }
      if (!zoomWindows.has(win)) zoomWindows.set(win,installMailZoom(win,fontSize,action=>{
        const tabmail=win.document.getElementById('tabmail');
        if(!tabmail)return zoomNativeMessage(win,
          win.document.getElementById('messageBrowser')?.contentWindow?.getMessagePaneBrowser?.(),action);
        const pane=tabmail.currentAbout3Pane;
        return readers.get(pane?.document)?.zoom(action) || false;
      }));
      // Today Pane visibility belongs to the user. Do not persist calendar UI
      // changes when a skin attaches, restarts, or is disabled.
      const listener = event => { if (event.target?.nodeType === 9) attach(event.target); };
      win.addEventListener("load", listener, true);
      const activate = () => {
        if (closed || win.closed) return;
        scan(win.document);
        if (!tabWatchers.has(win)) tabWatchers.set(win,watchMailTabs(win,scan));
      };
      win.addEventListener("activate", activate);
      windows.set(win, {listener, activate});
      applyTodayPane(win);
      scan(win.document);
      if(!tabWatchers.has(win))tabWatchers.set(win,watchMailTabs(win,scan));
      startupWindows.get(win)?.refresh();
    };
    const refresh = () => {
      for (const [doc, controller] of documents) {
        if (doc.defaultView?.closed) { controller.close(); documents.delete(doc); }
        else controller.refresh();
      }
    };
    const observer = { observe: refresh };
    const tagChanges = {
      msgPropertyChanged(header, property) {
        if (closed || !["keywords", "label"].includes(property)) return;
        for (const controller of conversationDocuments.values()) controller.refresh();
      }
    };
    context.callOnClose({ close() {
      gmailImporter?.close(); gmailImporter=null;
      labelBackupController?.close();labelBackupController=null;
      for(const close of [...dkimPopups])close();openIndependentDkimPopup=null;
      verifyIndependentDkim=null;
      for(const pending of dkimRequests.values()){clearTimeout(pending.timer);pending.reject(new Error(gmText("Reader closed")));}dkimRequests.clear();
      closed = true;
      for(const controller of nativeComposeAutosaves.values())controller.close();nativeComposeAutosaves.clear();
      for(const controller of [...sentReplyLabelTrackers])controller.close();
      try { autosaveController?.close(); } catch (_) { console.warn('Thunder-G: could not restore draft autosave settings.'); }
      if (!started) return;
      ExtensionSupport.unregisterWindowListener(id);
      Services.prefs.removeObserver("mailnews.tags.", observer);
      Services.prefs.removeObserver(HIDDEN_MESSAGE_LABELS_PREF, observer);
      MailServices.mfn.removeListener(tagChanges);
      for (const [win, handlers] of windows) {
        win.removeEventListener("load", handlers.listener, true);
        win.removeEventListener("activate", handlers.activate);
      }
      for (const controller of startupWindows.values()) controller.close(); startupWindows.clear();
      for (const controller of pendingDocuments.values()) controller.close();
      pendingDocuments.clear();
      for (const controller of documents.values()) controller.close();
      for (const controller of conversationDocuments.values()) controller.close();
      conversationDocuments.clear();
      for (const zoom of zoomWindows.values()) zoom.close(); zoomWindows.clear();
      for (const win of skinWindows.keys()) unloadSkin(win);
      for (const win of todayWindows) removeTodayPaneStyle(win);
      for(const watcher of tabWatchers.values())watcher.close();tabWatchers.clear();
      for(const controller of searchViews.values())controller.close();searchViews.clear();
      documents.clear(); windows.clear();
    }});
    return { inlineLabels: {
      async labelBackup(action,data){
        try{
          if(closed)throw new Error(gmText('Extension has closed.'));
          if(typeof data!=='string' || data.length>24*1024*1024)throw new Error(gmText('Invalid label backup request.'));
          let payload;try{payload=JSON.parse(data || '{}');}catch(_){throw new Error(gmText('Invalid label backup request.'));}
          if(!payload || typeof payload!=='object' || Array.isArray(payload))throw new Error(gmText('Invalid label backup request.'));
          labelBackupController ||= createNativeLabelBackup();
          return JSON.stringify({ok:true,result:await labelBackupController.run(action,payload)});
        }catch(_){
          return JSON.stringify({ok:false,error:_.message || gmText('The label backup operation failed.')});
        }
      },
      async gmailLabelImport(action, data) {
        try {
          if (closed) throw new Error(gmText("Extension has closed."));
          let payload;
          try { payload=JSON.parse(data || '{}'); } catch (_) { throw new Error(gmText("Invalid importer request.")); }
          if (!payload || typeof payload!=='object' || Array.isArray(payload)) throw new Error(gmText("Invalid importer request."));
          gmailImporter ||= createNativeGmailImporter(MailServices.tags);
          return JSON.stringify({ok:true,result:await gmailImporter.run(action,payload)});
        } catch (error) {
          // Privileged exceptions otherwise become an unhelpful generic error at
          // the extension boundary. Return only the controlled user-facing text.
          return JSON.stringify({ok:false,error:error.message || gmText("The Gmail import operation failed.")});
        }
      },
      async setSearchResultsAsList(enabled){searchResultsAsList=enabled!==false;},
      async setShowColumnHeaders(enabled) {
        showColumnHeaders = enabled === true;
        for (const doc of documents.keys()) doc.documentElement.toggleAttribute('data-gm-hide-column-headers', !showColumnHeaders);
      },
      async setThreadGuides(enabled){threadGuides=enabled===true;for(const controller of documents.values())controller.setThreadGuides(threadGuides);},
      async setInlineReplyEnabled(enabled){inlineReplyEnabled=enabled===true;},
      async setInlineNewMessageEnabled(enabled){inlineNewMessageEnabled=enabled===true;},
      async setBimiEnabled(enabled){independentBimiEnabled=enabled===true;for(const refresh of independentBimiListeners)refresh();},
      onDkimRequest: new ExtensionCommon.EventManager({context,name:'inlineLabels.onDkimRequest',register(fire){dkimFire=fire;return()=>{dkimFire=null;};}}).api(),
      async resolveDkim(request,payload) {
        const pending=dkimRequests.get(request);if(!pending)return;
        clearTimeout(pending.timer);dkimRequests.delete(request);
        try {const value=JSON.parse(payload);if(value.error)pending.reject(new Error(value.error));else pending.resolve(value);}catch(error){pending.reject(error);}
      },
      async setCompactConversations(enabled){compactConversationsEnabled=enabled!==false;},
      async setLanguage(language){gmSetLanguage(language);for(const controller of documents.values())controller.refresh();},
      async setIndependentReader(enabled) {
        independentReader = enabled === true;
        for (const reader of readers.values()) reader.setIndependent(independentReader);
      },
      async setMessagesPerPage(value) {
        messagesPerPage = [25,50,100].includes(value) ? value : 0;
        for (const pages of pagedDocuments.values()) pages.setSize(messagesPerPage);
      },
      async setComposeAutosave(enabled, minutes, mode='auto') {
        composeAutosave = enabled === true;
        if(typeof configureChangeAutosave==='function')configureChangeAutosave(composeAutosave,mode,minutes);
        composeAutosaveMinutes = Number.isInteger(minutes) && minutes >= 1 && minutes <= 30 ? minutes : 1;
        autosaveController?.set(composeAutosave,composeAutosaveMinutes);
      },
      async setHideTodayPane(hidden) {
        if (closed) return;
        hideTodayPane = hidden;
        for (const win of windows.keys()) applyTodayPane(win);
      },
      async start() {
      if (started) return;
      try {
        autosaveController = createComposeAutosave(Services.prefs);
        autosaveController.set(composeAutosave,composeAutosaveMinutes);
      } catch (_) { console.warn('Thunder-G: could not configure draft autosave settings.'); }
      started = true;
      Services.prefs.addObserver("mailnews.tags.", observer);
      Services.prefs.addObserver(HIDDEN_MESSAGE_LABELS_PREF, observer);
      MailServices.mfn.addListener(tagChanges, Ci.nsIMsgFolderNotificationService.msgPropertyChanged);
      ExtensionSupport.registerWindowListener(id, {
        chromeURLs: ["chrome://messenger/content/messenger.xhtml","chrome://messenger/content/messengercompose/messengercompose.xhtml"],
        onLoadWindow: loadWindow,
        onUnloadWindow(win) {
          startupWindows.get(win)?.close();startupWindows.delete(win);
          nativeComposeAutosaves.get(win)?.close();nativeComposeAutosaves.delete(win);
          tabWatchers.get(win)?.close();tabWatchers.delete(win);
          zoomWindows.get(win)?.close(); zoomWindows.delete(win);
          removeTodayPaneStyle(win);
          unloadSkin(win);
          const handlers = windows.get(win);
          if (handlers) {
            win.removeEventListener("load", handlers.listener, true);
            win.removeEventListener("activate", handlers.activate);
          }
          for (const [doc, pending] of pendingDocuments) {
            if (doc.defaultView?.top === win || doc.defaultView?.closed) pending.close();
          }
          windows.delete(win);
          for (const [doc, controller] of conversationDocuments) {
            if (doc.defaultView?.top === win || doc.defaultView?.closed) {
              controller.close(); unloadSkin(doc.defaultView); conversationDocuments.delete(doc);
            }
          }
          for (const [doc, controller] of documents) {
            if (doc.defaultView?.top === win || doc.defaultView?.closed) {
              controller.close(); unloadSkin(doc.defaultView); documents.delete(doc);
            }
          }
        }
      });
    }}};
  }
};
