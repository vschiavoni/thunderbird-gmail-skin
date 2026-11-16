function attachmentFileType(attachment){
  const name=String(attachment.name || '').toLowerCase(),type=String(attachment.contentType || '').toLowerCase();
  if(/\.(docx?|odt|rtf)$/.test(name) || /wordprocessing|msword|opendocument.text/.test(type))return {kind:'word',label:'W'};
  if(/\.(xlsx?|csv|ods)$/.test(name) || /spreadsheet|ms-excel|opendocument.spreadsheet/.test(type))return {kind:'sheet',label:'X'};
  if(/\.(pptx?|odp)$/.test(name) || /presentation|powerpoint/.test(type))return {kind:'slides',label:'P'};
  if(/\.(zip|7z|rar|gz|tar)$/.test(name))return {kind:'archive',label:'ZIP'};
  const preview=attachmentPreviewKind(attachment);return {kind:preview || 'file',label:preview==='pdf'?'PDF':preview==='image'?'IMG':'FILE'};
}
// Read only a known passive thumbnail entry. Never extract a document or execute
// Office content; cap directory traversal and decompressed thumbnail bytes.
async function officeAttachmentThumbnail(bytes,win){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),cap=1024*1024;
  let end=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){end=i;break;}
  if(end<0)return null;
  const entries=view.getUint16(end+10,true);let offset=view.getUint32(end+16,true);
  if(entries>4096)return null;
  for(let index=0;index<entries;index++){
    if(offset+46>bytes.length || view.getUint32(offset,true)!==0x02014b50)return null;
    const flags=view.getUint16(offset+8,true),method=view.getUint16(offset+10,true),compressed=view.getUint32(offset+20,true),size=view.getUint32(offset+24,true);
    const length=view.getUint16(offset+28,true),extra=view.getUint16(offset+30,true),comment=view.getUint16(offset+32,true),local=view.getUint32(offset+42,true);
    if(offset+46+length+extra+comment>bytes.length)return null;
    const name=length<=256?String.fromCharCode(...bytes.subarray(offset+46,offset+46+length)):'';offset+=46+length+extra+comment;
    if(!/^(docProps\/thumbnail\.(png|jpe?g)|Thumbnails\/thumbnail\.png)$/i.test(name))continue;
    if(flags&1 || !size || size>cap || compressed>cap || local+30>bytes.length || view.getUint32(local,true)!==0x04034b50)return null;
    const start=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true);
    if(start+compressed>bytes.length)return null;
    const data=bytes.slice(start,start+compressed);
    if(method===0)return data.length===size?data:null;
    if(method!==8 || !win.DecompressionStream)return null;
    const stream=new win.Blob([data]).stream().pipeThrough(new win.DecompressionStream('deflate-raw')),reader=stream.getReader(),chunks=[];let total=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>cap || total>size){await reader.cancel();return null;}chunks.push(value);}}
    finally{reader.releaseLock();}
    if(total!==size)return null;
    const result=new Uint8Array(total);let at=0;for(const chunk of chunks){result.set(chunk,at);at+=chunk.length;}return result;
  }
  return null;
}

// Passive thumbnails only: read native message parts, never external attachment URLs.
function attachmentPreviewKind(attachment){
  const type=String(attachment.contentType || '').toLowerCase(),name=String(attachment.name || '').toLowerCase();
  if(type==='application/pdf' || name.endsWith('.pdf'))return 'pdf';
  if(/^image\/(png|jpeg|gif|webp|bmp)$/.test(type) || /\.(png|jpe?g|gif|webp|bmp)$/.test(name))return 'image';
  if(/\.(docx|xlsx|pptx|odt|ods|odp)$/.test(name))return 'office';
  return '';
}
async function attachmentThumbnail(doc,attachment,isCurrent,environment={}){
  const kind=attachmentPreviewKind(attachment),limit=8*1024*1024;
  if(!kind || !isCurrent() || !attachment.hasFile || !attachment.isAllowedURL || attachment.isExternalAttachment ||
    !/^(mailbox|imap|news|snews):/i.test(attachment.url || '') || !(attachment.size>0 && attachment.size<=limit) || typeof attachment.fetchAttachment!=='function')return null;
  const raw=await attachment.fetchAttachment();if(!isCurrent() || (raw.length ?? raw.byteLength)>limit)return null;
  const bytes=typeof raw==='string'?Uint8Array.from(raw,c=>c.charCodeAt(0)):new Uint8Array(raw);
  if(bytes.length>limit)return null;
  const win=doc.defaultView,canvas=doc.createElement('canvas');let bitmap=null,task=null,pdf=null;
  try{
    if(kind==='image' || kind==='office'){
      const imageBytes=kind==='office'?await officeAttachmentThumbnail(bytes,win):bytes;
      if(!imageBytes || !isCurrent())return null;
      if(kind==='office' && !(imageBytes[0]===0xff && imageBytes[1]===0xd8 && imageBytes[2]===0xff) && !(imageBytes[0]===137 && imageBytes[1]===80 && imageBytes[2]===78 && imageBytes[3]===71))return null;
      const decode=environment.decodeImage || (data=>win.createImageBitmap(new win.Blob([data],{type:kind==='office'?(imageBytes[0]===137?'image/png':'image/jpeg'):attachment.contentType || 'application/octet-stream'})));
      bitmap=await decode(imageBytes);if(!isCurrent() || !bitmap.width || !bitmap.height || bitmap.width*bitmap.height>16000000)return null;
      const scale=Math.min(240/bitmap.width,140/bitmap.height,1);canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
    }else{
      const loadPDF=environment.loadPDF || (()=>{
        // Extension experiment globals do not have a window module loader.
        // Use Gecko's shared module context, which supplies PDF.js DOM globals.
        const library=ChromeUtils.importESModule('resource://pdf.js/build/pdf.mjs');
        library.GlobalWorkerOptions.workerSrc='resource://pdf.js/build/pdf.worker.mjs';return library;
      });
      const library=await loadPDF();if(!isCurrent())return null;
      task=library.getDocument({data:bytes,ownerDocument:doc,isEvalSupported:false,enableXfa:false,disableAutoFetch:true,disableStream:true,disableFontFace:true,isOffscreenCanvasSupported:false,isImageDecoderSupported:false,maxImageSize:16000000});
      pdf=await task.promise;if(!isCurrent())return null;
      const page=await pdf.getPage(1),initial=page.getViewport({scale:1});
      if(!initial.width || !initial.height || !isCurrent())return null;
      const viewport=page.getViewport({scale:Math.min(240/initial.width,140/initial.height)});
      canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      await page.render({canvasContext:canvas.getContext('2d'),viewport,annotationMode:0,intent:'print'}).promise;
    }
    return isCurrent()?canvas.toDataURL('image/png'):null;
  }finally{bitmap?.close?.();if(task)await task.destroy();canvas.width=canvas.height=0;}
}
