// Passive thumbnails only: read native message parts, never external attachment URLs.
function attachmentPreviewKind(attachment){
  const type=String(attachment.contentType || '').toLowerCase(),name=String(attachment.name || '').toLowerCase();
  if(type==='application/pdf' || name.endsWith('.pdf'))return 'pdf';
  if(/^image\/(png|jpeg|gif|webp|bmp)$/.test(type) || /\.(png|jpe?g|gif|webp|bmp)$/.test(name))return 'image';
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
    if(kind==='image'){
      const decode=environment.decodeImage || (data=>win.createImageBitmap(new win.Blob([data],{type:attachment.contentType || 'application/octet-stream'})));
      bitmap=await decode(bytes);if(!isCurrent() || !bitmap.width || !bitmap.height || bitmap.width*bitmap.height>16000000)return null;
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
