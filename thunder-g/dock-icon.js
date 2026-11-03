/* The Dock belongs to the process. Only AppKit's temporary icon is changed. */
function createDockIconController(adapter,{schedule=setTimeout,unschedule=clearTimeout}={}){
  let preferences={mode:'auto',light:'light',dark:'dark'};
  const variant=value=>['light','dark'].includes(value)?value:null;
  let enabled=false,closed=false,prepared=false,current=null,timer=null,queue=Promise.resolve();
  function disarm(){if(timer!==null)unschedule(timer);timer=null;}
  function refresh(){
    if(!enabled||closed)return;
    const theme=adapter.appearance()==='dark'?'dark':'light';
    const icon=preferences.mode==='auto'?preferences[theme]:preferences.mode;
    if(icon!==current){adapter.apply(icon);current=icon;}
  }
  function tick(){timer=null;try{refresh();}catch(error){adapter.report(error);}if(enabled&&!closed)timer=schedule(tick,2000);}
  return {
    setEnabled(value,options={}){
      const task=queue.then(async()=>{
        if(closed)return;
        preferences={mode:variant(options.mode)||'auto',light:variant(options.light)||'light',dark:variant(options.dark)||'dark'};
        if(value){
          if(!prepared){await adapter.prepare();prepared=true;}
          if(closed){adapter.close();return;}
          enabled=true;try{refresh();}catch(error){enabled=false;throw error;}
          if(timer===null)timer=schedule(tick,2000);
        }else{enabled=false;disarm();if(current!==null)adapter.restore();current=null;}
      });queue=task.catch(()=>{});return task;
    },
    refresh,
    close(){if(closed)return;closed=true;enabled=false;disarm();try{if(current!==null)adapter.restore();}finally{current=null;if(prepared)adapter.close();}},
  };
}
function createNativeDockIcon(extension){
  if(Services.appinfo.OS!=='Darwin')return {setEnabled:async()=>{},close(){}};
  let native=null;
  async function extract(variant){
    const {NetUtil}=ChromeUtils.importESModule('resource://gre/modules/NetUtil.sys.mjs');
    const directory=Services.dirsvc.get('ProfD',Ci.nsIFile);directory.append('thunder-g-dock-icons');
    if(!directory.exists())directory.create(Ci.nsIFile.DIRECTORY_TYPE,0o700);
    const file=directory.clone();file.append(variant+'.png');
    await new Promise((resolve,reject)=>NetUtil.asyncFetch({uri:extension.rootURI.resolve('icons/dock/'+variant+'.png'),loadUsingSystemPrincipal:true},(stream,status)=>{
      if(!Components.isSuccessCode(status)){reject(new Error('Unable to load Dock icon.'));return;}
      let output;
      try{const data=NetUtil.readInputStreamToString(stream,stream.available());output=Cc['@mozilla.org/network/file-output-stream;1'].createInstance(Ci.nsIFileOutputStream);output.init(file,0x02|0x08|0x20,0o600,0);output.write(data,data.length);resolve();}
      catch(error){reject(error);}finally{stream.close();output?.close();}
    }));return file.path;
  }
  const adapter={
    async prepare(){
      const paths={light:await extract('light'),dark:await extract('dark')};
      const {ctypes:c}=ChromeUtils.importESModule('resource://gre/modules/ctypes.sys.mjs');
      const lib=c.open('/usr/lib/libobjc.A.dylib'),ptr=c.voidptr_t;
      const cls=lib.declare('objc_getClass',c.default_abi,ptr,c.char.ptr),sel=lib.declare('sel_registerName',c.default_abi,ptr,c.char.ptr);
      const get=lib.declare('objc_msgSend',c.default_abi,ptr,ptr,ptr),arg=lib.declare('objc_msgSend',c.default_abi,ptr,ptr,ptr,ptr);
      const str=lib.declare('objc_msgSend',c.default_abi,ptr,ptr,ptr,c.char.ptr),text=lib.declare('objc_msgSend',c.default_abi,c.char.ptr,ptr,ptr);
      const send=lib.declare('objc_msgSend',c.default_abi,c.void_t,ptr,ptr),set=lib.declare('objc_msgSend',c.default_abi,c.void_t,ptr,ptr,ptr);
      const sync=lib.declare('objc_msgSend',c.default_abi,c.signed_char,ptr,ptr);
      const app=get(cls('NSApplication'),sel('sharedApplication')),defaults=get(cls('NSUserDefaults'),sel('standardUserDefaults'));
      const string=value=>str(cls('NSString'),sel('stringWithUTF8String:'),value),key=string('AppleInterfaceStyle');get(key,sel('retain'));
      const images={};
      try{
        for(const variant of ['light','dark']){images[variant]=arg(get(cls('NSImage'),sel('alloc')),sel('initWithContentsOfFile:'),string(paths[variant]));if(images[variant].isNull())throw new Error('Unable to decode Dock icon.');}
        native={apply(variant){set(app,sel('setApplicationIconImage:'),images[variant]);},
          appearance(){sync(defaults,sel('synchronize'));const value=arg(defaults,sel('stringForKey:'),key);if(value.isNull())return 'light';const bytes=text(value,sel('UTF8String'));return !bytes.isNull()&&bytes.readString()==='Dark'?'dark':'light';},
          restore(){set(app,sel('setApplicationIconImage:'),ptr(0));},
          close(){for(const image of Object.values(images))if(!image.isNull())send(image,sel('release'));send(key,sel('release'));lib.close();},
        };
      }catch(error){for(const image of Object.values(images))if(!image.isNull())send(image,sel('release'));send(key,sel('release'));lib.close();throw error;}
    },
    appearance:()=>native.appearance(),apply:variant=>native.apply(variant),restore:()=>native.restore(),close(){native?.close();native=null;},report:error=>console.error('Thunder-G Dock icon:',error),
  };
  return createDockIconController(adapter);
}
