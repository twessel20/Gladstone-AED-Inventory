(()=>{
'use strict';

const LETTER={w:8.5,h:11};
const PREVIEW_ID='pdfPreviewDlg';

function getJsPDF(){return (window.jspdf&&window.jspdf.jsPDF)||window.jsPDF||null}
function getCanvas(){return window.html2canvas||null}
function clean(v){return String(v??'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').replace(/\s*\n\s*/g,' ').trim()}
function fileName(v){return clean(v||'aed-report.pdf').replace(/[^a-z0-9._-]+/ig,'-').replace(/-+/g,'-')}

async function waitImages(root){
  const imgs=[...root.querySelectorAll('img')];
  await Promise.all(imgs.map(img=>img.complete?Promise.resolve():new Promise(r=>{img.onload=r;img.onerror=r})));
}

function prepareClone(source){
  const clone=source.cloneNode(true);
  clone.removeAttribute('id');
  clone.querySelectorAll('.report-toolbar,button').forEach(x=>x.remove());
  clone.querySelectorAll('[style*="page-break"],[style*="break-after"],[style*="break-before"]').forEach(x=>{
    x.style.pageBreakAfter='auto';x.style.pageBreakBefore='auto';x.style.breakAfter='auto';x.style.breakBefore='auto';
  });
  return clone;
}

function sourceWidth(source){
  const rect=source.getBoundingClientRect();
  const w=Math.max(source.scrollWidth||0,rect.width||0);
  return Math.max(820,Math.min(1000,Math.round(w||920)));
}

function mountClone(source){
  const width=sourceWidth(source);
  const mount=document.createElement('div');
  mount.style.cssText='position:fixed;left:-30000px;top:0;width:'+width+'px;background:#fff;z-index:-9999;overflow:visible;';
  const clone=prepareClone(source);
  clone.style.width=width+'px';
  clone.style.maxWidth='none';
  clone.style.margin='0';
  clone.style.transform='none';
  clone.style.zoom='1';
  mount.appendChild(clone);
  document.body.appendChild(mount);
  return {mount,clone,width};
}

function breakCandidates(root){
  const rr=root.getBoundingClientRect(), values=new Set([0,Math.ceil(root.scrollHeight)]);
  const selectors='section,.report-box,.report-grid>*,.summary-table tr,.certification-attestation,.signature-block,.overall-signature-block,.report-foot';
  root.querySelectorAll(selectors).forEach(el=>{
    const r=el.getBoundingClientRect();
    const top=Math.max(0,Math.round(r.top-rr.top));
    const bottom=Math.max(0,Math.round(r.bottom-rr.top));
    if(top>0)values.add(top);
    if(bottom>0)values.add(bottom);
  });
  return [...values].sort((a,b)=>a-b);
}

function pageSlices(totalHeight,pageHeight,candidates){
  const out=[];let y=0;
  while(y<totalHeight-2){
    const target=Math.min(totalHeight,y+pageHeight);
    if(target>=totalHeight){out.push([y,totalHeight]);break}
    const minFill=y+pageHeight*.58;
    const before=candidates.filter(v=>v>minFill&&v<=target-8);
    let cut=before.length?before[before.length-1]:target;
    if(cut<=y+40)cut=target;
    out.push([y,cut]);y=cut;
  }
  return out;
}

function sliceCanvas(sourceCanvas,y1,y2){
  const h=Math.max(1,Math.round(y2-y1));
  const c=document.createElement('canvas');
  c.width=sourceCanvas.width;c.height=h;
  const ctx=c.getContext('2d');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);
  ctx.drawImage(sourceCanvas,0,y1,sourceCanvas.width,h,0,0,sourceCanvas.width,h);
  return c;
}

async function buildFromElement(source,filename='aed-report.pdf'){
  if(!(source instanceof Element))throw new Error('Report content is unavailable.');
  const JsPDF=getJsPDF(),capture=getCanvas();
  if(!JsPDF||!capture)throw new Error('PDF engine is not available.');
  const {mount,clone,width}=mountClone(source);
  try{
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    await waitImages(clone);

    const explicit=[...clone.children].filter(x=>x.classList?.contains('packet-page'));
    const doc=new JsPDF({unit:'in',format:'letter',orientation:'portrait',compress:true});

    if(explicit.length){
      for(let i=0;i<explicit.length;i++){
        const page=explicit[i];
        const canvas=await capture(page,{scale:2,useCORS:true,allowTaint:true,backgroundColor:'#ffffff',logging:false,scrollX:0,scrollY:0,windowWidth:width,width:page.scrollWidth,height:page.scrollHeight});
        if(!canvas.width||!canvas.height)throw new Error('A report page could not be captured.');
        const img=canvas.toDataURL('image/jpeg',0.985);
        const margin=.18,maxW=LETTER.w-margin*2,maxH=LETTER.h-margin*2;
        let w=maxW,h=w*(canvas.height/canvas.width);
        if(h>maxH){h=maxH;w=h*(canvas.width/canvas.height)}
        const x=(LETTER.w-w)/2,y=(LETTER.h-h)/2;
        if(i)doc.addPage();
        doc.addImage(img,'JPEG',x,y,w,h,undefined,'FAST');
        doc.setFont('helvetica','normal');doc.setFontSize(7.5);doc.setTextColor(104,123,138);
        doc.text('Page '+(i+1)+' of '+explicit.length,7.28,10.83);
      }
    }else{
      const scale=2;
      const full=await capture(clone,{scale,useCORS:true,allowTaint:true,backgroundColor:'#ffffff',logging:false,scrollX:0,scrollY:0,windowWidth:width,width:clone.scrollWidth,height:clone.scrollHeight});
      if(!full.width||!full.height)throw new Error('The report could not be captured.');
      const cssPageHeight=(width*LETTER.h/LETTER.w)-24;
      const candidatesCss=breakCandidates(clone);
      const slicesCss=pageSlices(clone.scrollHeight,cssPageHeight,candidatesCss);
      const ratio=full.height/clone.scrollHeight;
      const slices=slicesCss.map(([a,b])=>[Math.round(a*ratio),Math.round(b*ratio)]);
      for(let i=0;i<slices.length;i++){
        const [y1,y2]=slices[i],part=sliceCanvas(full,y1,y2);
        const img=part.toDataURL('image/jpeg',0.985);
        const margin=.20,maxW=LETTER.w-margin*2,maxH=LETTER.h-margin*2;
        let w=maxW,h=w*(part.height/part.width);
        if(h>maxH){h=maxH;w=h*(part.width/part.height)}
        const x=(LETTER.w-w)/2,y=margin;
        if(i)doc.addPage();
        doc.addImage(img,'JPEG',x,y,w,h,undefined,'FAST');
        doc.setFont('helvetica','normal');doc.setFontSize(7.5);doc.setTextColor(104,123,138);
        doc.text('Page '+(i+1)+' of '+slices.length,7.28,10.83);
      }
    }
    const blob=doc.output('blob');
    if(!blob||blob.size<1200)throw new Error('PDF generation failed.');
    return blob;
  }finally{mount.remove()}
}

async function buildFromHtml(html,filename='aed-report.pdf'){
  const host=document.createElement('div');
  host.style.cssText='position:fixed;left:-30000px;top:0;width:920px;background:#fff;z-index:-9999;';
  host.innerHTML=html;
  document.body.appendChild(host);
  try{
    const source=host.querySelector('.report-sheet')||host.firstElementChild;
    if(!source)throw new Error('Report content is unavailable.');
    return await buildFromElement(source,filename);
  }finally{host.remove()}
}

function showPreview(blob){
  const url=URL.createObjectURL(blob);
  let dlg=document.getElementById(PREVIEW_ID);
  if(!dlg){
    dlg=document.createElement('dialog');dlg.id=PREVIEW_ID;
    dlg.style.cssText='width:min(98vw,1100px);max-width:1100px;height:94vh;padding:0;';
    dlg.innerHTML='<div style="display:flex;flex-direction:column;height:100%"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;border-bottom:1px solid #d9e3ea;background:#fff"><div><b style="color:#123a5a">PDF Preview</b><div style="font-size:.82rem;color:#687b8a">Rendered directly from the generated report.</div></div><button type="button" id="pdfV2Close">Close</button></div><iframe id="pdfV2Frame" title="PDF Preview" style="width:100%;flex:1;border:0;background:#f4f7f9"></iframe></div>';
    document.body.appendChild(dlg);
    dlg.querySelector('#pdfV2Close').onclick=()=>dlg.close();
    dlg.addEventListener('close',()=>{const f=dlg.querySelector('#pdfV2Frame');if(f?.dataset.url){URL.revokeObjectURL(f.dataset.url);delete f.dataset.url;f.src='about:blank'}})
  }
  const frame=dlg.querySelector('#pdfV2Frame');if(frame.dataset.url)URL.revokeObjectURL(frame.dataset.url);
  frame.src=url;frame.dataset.url=url;dlg.showModal();
}

async function previewElement(source,filename){showPreview(await buildFromElement(source,filename))}
async function previewHtml(html,filename){showPreview(await buildFromHtml(html,filename))}
async function openElement(source,filename){const b=await buildFromElement(source,filename),u=URL.createObjectURL(b);window.open(u,'_blank');setTimeout(()=>URL.revokeObjectURL(u),120000)}
async function openHtml(html,filename){const b=await buildFromHtml(html,filename),u=URL.createObjectURL(b);window.open(u,'_blank');setTimeout(()=>URL.revokeObjectURL(u),120000)}
async function shareBlob(blob,filename,title,summary){
  const file=new File([blob],fileName(filename),{type:'application/pdf'});
  if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){await navigator.share({title:title||filename,text:summary||'',files:[file]});return}
  const u=URL.createObjectURL(blob);window.open(u,'_blank');setTimeout(()=>URL.revokeObjectURL(u),120000)
}
async function shareElement(source,filename,title,summary){return shareBlob(await buildFromElement(source,filename),filename,title,summary)}
async function shareHtml(html,filename,title,summary){return shareBlob(await buildFromHtml(html,filename),filename,title,summary)}

window.GFDAEDPdfV2={buildFromElement,buildFromHtml,previewElement,previewHtml,openElement,openHtml,shareElement,shareHtml};
})();