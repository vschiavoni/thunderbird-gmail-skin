const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
const scope=vm.createContext({Uint8Array});vm.runInContext(fs.readFileSync('thunder-g/attachment-previews.js','utf8'),scope);
function fixture(extra={}){
 let fetches=0,draws=0,closed=0;const canvas={width:0,height:0,getContext:()=>({drawImage(){draws++}}),toDataURL:()=> 'data:image/png;base64,AAAA'};
 const doc={defaultView:{},createElement:tag=>{assert.equal(tag,'canvas');return canvas}};
 const attachment={name:'photo.gif',contentType:'image/gif',url:'imap://account/message?part=1.2',size:1024,hasFile:true,isAllowedURL:true,async fetchAttachment(){fetches++;return 'abc'},...extra};
 return {doc,attachment,canvas,get fetches(){return fetches},get draws(){return draws},get closed(){return closed},decodeImage:async()=>({width:800,height:400,close(){closed++}})};
}
test('GIF image attachment becomes a static bounded PNG thumbnail and releases decoded pixels',async()=>{
 const f=fixture(),result=await scope.attachmentThumbnail(f.doc,f.attachment,()=>true,{decodeImage:f.decodeImage});
 assert.equal(result,'data:image/png;base64,AAAA');assert.equal(f.fetches,1);assert.equal(f.draws,1);assert.equal(f.closed,1);assert.equal(f.canvas.width,0);
});
test('PDF preview renders only the first page without eval, XFA, annotations or external fetching',async()=>{
 const f=fixture({name:'document.pdf',contentType:'application/pdf'});let options,pageNumber,renderOptions,destroyed=0;
 const loadPDF=()=>({getDocument(value){
  options=value;
  const page={getViewport:({scale})=>({width:600*scale,height:800*scale}),render:value=>{renderOptions=value;return {promise:Promise.resolve()}}};
  const pdf={getPage:async number=>{pageNumber=number;return page}};
  return {promise:Promise.resolve(pdf),destroy:async()=>{destroyed++}};
 }});
 assert.equal(await scope.attachmentThumbnail(f.doc,f.attachment,()=>true,{loadPDF}),'data:image/png;base64,AAAA');
 assert.equal(pageNumber,1);assert.equal(options.isEvalSupported,false);assert.equal(options.enableXfa,false);assert.equal(options.disableAutoFetch,true);assert.equal(renderOptions.annotationMode,0);assert.equal(renderOptions.intent,'print');assert.equal(destroyed,1);
});
test('external, unsupported, unknown-size and oversized attachment previews never fetch data',async()=>{
 for(const extra of [{url:'https://example.org/image.gif'},{isExternalAttachment:true},{size:-1},{size:9000000},{hasFile:false},{isAllowedURL:false},{contentType:'image/svg+xml',name:'picture.svg'},{name:'file.zip',contentType:'application/zip'}]){
  const f=fixture(extra);assert.equal(await scope.attachmentThumbnail(f.doc,f.attachment,()=>true),null);assert.equal(f.fetches,0);
 }
});
test('navigation during fetching prevents decoding; excessive image dimensions are discarded and released',async()=>{
 const f=fixture();let current=true;f.attachment.fetchAttachment=async()=>{current=false;return 'abc'};
 assert.equal(await scope.attachmentThumbnail(f.doc,f.attachment,()=>current,{decodeImage:()=>{throw Error('must not decode')}}),null);
 let closed=false;const next=fixture();assert.equal(await scope.attachmentThumbnail(next.doc,next.attachment,()=>true,{decodeImage:async()=>({width:100000,height:100000,close(){closed=true}})}),null);assert.equal(closed,true);
});

test('default PDF loader uses the shared Gecko module context from extension experiments',async()=>{
 const f=fixture({name:'document.pdf',contentType:'application/pdf'}),imports=[];let destroyed=0;
 const library={GlobalWorkerOptions:{},getDocument(){return {promise:Promise.resolve({getPage:async()=>({getViewport:({scale})=>({width:600*scale,height:800*scale}),render:()=>({promise:Promise.resolve()})})}),destroy:async()=>{destroyed++}}}};
 scope.ChromeUtils={importESModule(...args){imports.push(args);if(args[1]?.global==='current')throw Error('No ModuleLoader found for the current context');return library}};
 try{assert.equal(await scope.attachmentThumbnail(f.doc,f.attachment,()=>true),'data:image/png;base64,AAAA');assert.equal(imports.length,1);assert.equal(imports[0].length,1);assert.equal(library.GlobalWorkerOptions.workerSrc,'resource://pdf.js/build/pdf.worker.mjs');assert.equal(destroyed,1);}
 finally{delete scope.ChromeUtils;}
});

function storedThumbnailZip(name='docProps/thumbnail.png',payload=Buffer.from([137,80,78,71,13,10,26,10]),method=0){
 const encoded=method===8?require('node:zlib').deflateRawSync(payload):payload;
 const filename=Buffer.from(name),local=Buffer.alloc(30),central=Buffer.alloc(46),end=Buffer.alloc(22);
 local.writeUInt32LE(0x04034b50);local.writeUInt16LE(method,8);local.writeUInt32LE(encoded.length,18);local.writeUInt32LE(payload.length,22);local.writeUInt16LE(filename.length,26);
 central.writeUInt32LE(0x02014b50);central.writeUInt16LE(method,10);central.writeUInt32LE(encoded.length,20);central.writeUInt32LE(payload.length,24);central.writeUInt16LE(filename.length,28);
 end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length+filename.length,12);end.writeUInt32LE(local.length+filename.length+encoded.length,16);
 return Buffer.concat([local,filename,encoded,central,filename,end]);
}
test('Office files use recognizable type badges and passive embedded thumbnails',async()=>{
 for(const [name,kind,label] of [['file.docx','word','W'],['file.xlsx','sheet','X'],['file.pptx','slides','P'],['file.doc','word','W']]){
  const type=scope.attachmentFileType({name});assert.equal(type.kind,kind);assert.equal(type.label,label);
 }
 const f=fixture({name:'file.docx',contentType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',fetchAttachment:async()=>storedThumbnailZip()});
 assert.equal(await scope.attachmentThumbnail(f.doc,f.attachment,()=>true,{decodeImage:f.decodeImage}),'data:image/png;base64,AAAA');assert.equal(f.draws,1);
});
test('Office thumbnail parsing excludes unrelated entries, oversized entries and non-raster content',async()=>{
 assert.equal(await scope.officeAttachmentThumbnail(storedThumbnailZip('word/document.xml'),{}),null);
 const huge=storedThumbnailZip();huge.writeUInt32LE(2000000,huge.length-22-46-'docProps/thumbnail.png'.length+24);assert.equal(await scope.officeAttachmentThumbnail(huge,{}),null);
 const f=fixture({name:'file.xlsx',contentType:'application/zip',fetchAttachment:async()=>storedThumbnailZip('docProps/thumbnail.png',Buffer.from('<svg onload="bad()"/>'))});
 assert.equal(await scope.attachmentThumbnail(f.doc,f.attachment,()=>true,{decodeImage:()=>{throw Error('must not decode SVG')}}),null);
});

test('compressed embedded Office thumbnails decode through a bounded deflate stream',async()=>{
 const raster=Buffer.from([137,80,78,71,13,10,26,10]),zip=storedThumbnailZip('docProps/thumbnail.png',raster,8);
 const result=await scope.officeAttachmentThumbnail(zip,{Blob,DecompressionStream});assert.deepEqual(Buffer.from(result),raster);
});

test('native attachment icons use Thunderbird’s icon helper with extension, MIME type and display size',()=>{
 const calls=[],doc={createElement:()=>({attrs:{},setAttribute(key,value){this.attrs[key]=value}})};
 scope.ChromeUtils={importESModule(uri){assert.equal(uri,'resource:///modules/MozIconUtils.mjs');return {makeMozIconSrcSet:(...args)=>{calls.push(args);return 'native-icon-srcset'}}}};
 try{const icon=scope.nativeAttachmentIcon(doc,{name:'Report, final.docx',contentType:'application/msword'},32);assert.equal(icon.attrs.srcset,'native-icon-srcset');assert.equal(calls[0][0],'attachment.docx');assert.equal(calls[0][1],32);assert.equal(calls[0][2].contentType,'application/msword');assert.equal(icon.attrs['aria-hidden'],'true');
 const deleted=scope.nativeAttachmentIcon(doc,{name:'removed.pdf',contentType:'text/x-moz-deleted'});assert.equal(deleted.attrs.src,'chrome://messenger/skin/icons/attachment-deleted.svg');}
 finally{delete scope.ChromeUtils;}
});
