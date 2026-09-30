(()=>{
'use strict';

const LETTER={w:8.5,h:11};
const PRINT_MARGIN=.25;
const PRINT_CAPTURE_SCALE=2.75;
const FOOTER_SAFE_IN=.18;
const PAGE_NUMBER_Y=10.58;
const PREVIEW_ID='pdfPreviewDlg';
const renderCache=new WeakMap();
const previewPages=new WeakMap();

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
  if(source.id==='generatedReportSheet')clone.id='generatedReportSheet';
  else clone.removeAttribute('id');
  clone.classList.add('pdf-letter-capture');
  clone.querySelectorAll('.report-toolbar,button').forEach(x=>x.remove());
  clone.querySelectorAll('[style*="page-break"],[style*="break-after"],[style*="break-before"]').forEach(x=>{
    x.style.pageBreakAfter='auto';x.style.pageBreakBefore='auto';x.style.breakAfter='auto';x.style.breakBefore='auto';
  });
  return clone;
}

function sourceWidth(source){
  return 900;
}

function mountClone(source){
  const width=sourceWidth(source);
  const mount=document.createElement('div');
  mount.style.cssText='position:fixed;left:-30000px;top:0;width:'+width+'px;background:#fff;z-index:-9999;overflow:visible;display:flex;justify-content:center;';
  const clone=prepareClone(source);
  clone.style.width=width+'px';
  clone.style.maxWidth=width+'px';
  clone.style.margin='0 auto';
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
  const cached=renderCache.get(source);
  if(cached&&cached.filename===fileName(filename)&&cached.blob)return cached.blob;
  const JsPDF=getJsPDF(),capture=getCanvas();
  if(!JsPDF||!capture)throw new Error('PDF engine is not available.');
  const {mount,clone,width}=mountClone(source);
  try{
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    await waitImages(clone);

    const doc=new JsPDF({unit:'in',format:'letter',orientation:'portrait',compress:true});
    const previewImages=[];
    const margin=PRINT_MARGIN,maxW=LETTER.w-margin*2,maxH=LETTER.h-margin*2-FOOTER_SAFE_IN;
    // Build logical group packet pages before PDF capture.
    // Each AED entry is atomic: never split an AED record across pages.
    // New groups always begin on a fresh page; headers/footers repeat on every group page.
    const isAnnualPacket=clone.classList?.contains('annual-report-format');
    const groupSources=[...clone.children].filter(x=>x.classList?.contains('packet-group-source'));
    if(groupSources.length){
      for(const source of groupSources){
        const groupName=source.getAttribute('data-group')||'Unassigned';
        const headerTemplate=source.querySelector('.packet-group-page-header');
        const bannerTemplate=source.querySelector('.packet-group-banner');
        const footerTemplate=source.querySelector('.packet-group-page-footer');
        const entries=[...source.querySelectorAll(':scope > .packet-group-entries > .packet-aed-entry')];
        const sourceWidth=Math.max(1,source.getBoundingClientRect().width||source.scrollWidth||width);
        const targetHeight=Math.floor(sourceWidth*(maxH/maxW));
        const pages=[];

        function makeGroupPage(isFirst){
          const page=document.createElement('section');
          page.className='packet-page packet-aed-page packet-group-rendered-page'+(isAnnualPacket?' packet-annual-aed-page':'')+(isFirst?' packet-group-start':'');
          page.setAttribute('data-group',groupName);
          page.style.boxSizing='border-box';
          page.style.width=sourceWidth+'px';
          page.style.minHeight='0';
          page.style.height='auto';
          page.style.maxHeight='none';
          page.style.overflow='visible';
          if(headerTemplate)page.appendChild(headerTemplate.cloneNode(true));
          if(bannerTemplate){
            const banner=bannerTemplate.cloneNode(true);
            if(!isFirst){
              const label=banner.querySelector('span');
              if(label)label.textContent='GROUP · CONTINUED';
            }
            page.appendChild(banner);
          }
          const body=document.createElement('div');
          body.className='packet-group-page-entries';
          page.appendChild(body);
          if(footerTemplate)page.appendChild(footerTemplate.cloneNode(true));
          source.parentNode.insertBefore(page,source);
          pages.push({page,body});
          return {page,body};
        }

        let current=makeGroupPage(true);
        for(let entryIndex=0;entryIndex<entries.length;entryIndex++){
          const entry=entries[entryIndex];
          if(isAnnualPacket&&entryIndex>0)current=makeGroupPage(false);
          const node=entry.cloneNode(true);
          current.body.appendChild(node);
          await new Promise(r=>requestAnimationFrame(r));

          // Quarterly/group packets may share a page when complete AED records fit.
          // Annual packets intentionally use one complete AED dossier per Letter page.
          if(!isAnnualPacket&&current.body.children.length>1&&current.page.scrollHeight>targetHeight){
            current.body.removeChild(node);
            current=makeGroupPage(false);
            current.body.appendChild(node);
            await new Promise(r=>requestAnimationFrame(r));
          }
        }
        source.remove();
      }
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    }

    const naturalHeightAtFullWidth=maxW*(clone.scrollHeight/Math.max(1,clone.scrollWidth));
    const fitScale=naturalHeightAtFullWidth>maxH?maxH/naturalHeightAtFullWidth:1;
    const forceOnePage=clone.classList?.contains('single-aed-report');
    const safeOnePage=forceOnePage||fitScale>=.72;

    if(safeOnePage){
      const full=await capture(clone,{scale:PRINT_CAPTURE_SCALE,useCORS:true,allowTaint:true,backgroundColor:'#ffffff',logging:false,scrollX:0,scrollY:0,windowWidth:width,width:clone.scrollWidth,height:clone.scrollHeight,imageTimeout:15000});
      if(!full.width||!full.height)throw new Error('The report could not be captured.');
      const img=full.toDataURL('image/png');
      previewImages.push(img);
      let w=maxW,h=w*(full.height/full.width);
      if(h>maxH){h=maxH;w=h*(full.width/full.height)}
      const x=(LETTER.w-w)/2,y=(LETTER.h-h)/2;
      doc.addImage(img,'PNG',x,y,w,h,undefined,'FAST');
      doc.setFont('helvetica','normal');doc.setFontSize(7.5);doc.setTextColor(104,123,138);
      doc.text('Page 1 of 1',7.10,PAGE_NUMBER_Y);
      full.width=1;full.height=1;
    }else{
      const explicit=[...clone.children].filter(x=>x.classList?.contains('packet-page'));
      if(explicit.length){
        explicit.forEach(page=>{
          const pageWidth=Math.max(1,page.getBoundingClientRect().width||page.scrollWidth||width);
          page.style.boxSizing='border-box';
          page.style.width=pageWidth+'px';
          page.style.minHeight='0';
          page.style.height='auto';
          page.style.maxHeight='none';
          page.style.overflow='visible';
        });
        await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        for(let i=0;i<explicit.length;i++){
          const page=explicit[i];
          const captureHeight=Math.max(page.scrollHeight,page.offsetHeight,page.clientHeight,1);
          const captureWidth=Math.max(page.scrollWidth,page.offsetWidth,page.clientWidth,1);
          const canvas=await capture(page,{scale:PRINT_CAPTURE_SCALE,useCORS:true,allowTaint:true,backgroundColor:'#ffffff',logging:false,scrollX:0,scrollY:0,windowWidth:width,width:captureWidth,height:captureHeight,imageTimeout:15000});
          if(!canvas.width||!canvas.height)throw new Error('A report page could not be captured.');
          const img=canvas.toDataURL('image/png');
          previewImages.push(img);
          let w=maxW,h=w*(canvas.height/canvas.width);
          if(h>maxH){h=maxH;w=h*(canvas.width/canvas.height)}
          const x=(LETTER.w-w)/2,y=(LETTER.h-h)/2;
          if(i)doc.addPage('letter','portrait');
          doc.addImage(img,'PNG',x,y,w,h,undefined,'FAST');
          doc.setFont('helvetica','normal');doc.setFontSize(7.5);doc.setTextColor(104,123,138);
          doc.text('Page '+(i+1)+' of '+explicit.length,7.10,PAGE_NUMBER_Y);
          canvas.width=1;canvas.height=1;
        }
      }else{
        const full=await capture(clone,{scale:PRINT_CAPTURE_SCALE,useCORS:true,allowTaint:true,backgroundColor:'#ffffff',logging:false,scrollX:0,scrollY:0,windowWidth:width,width:clone.scrollWidth,height:clone.scrollHeight,imageTimeout:15000});
        if(!full.width||!full.height)throw new Error('The report could not be captured.');
        const cssPageHeight=Math.floor(width*(LETTER.h/LETTER.w)*0.94);
        const candidatesCss=breakCandidates(clone);
        const slicesCss=pageSlices(clone.scrollHeight,cssPageHeight,candidatesCss);
        const ratio=full.height/clone.scrollHeight;
        const slices=slicesCss.map(([a,b])=>[Math.round(a*ratio),Math.round(b*ratio)]);
        for(let i=0;i<slices.length;i++){
          const [y1,y2]=slices[i],part=sliceCanvas(full,y1,y2);
          const img=part.toDataURL('image/png');
          previewImages.push(img);
          let w=maxW,h=w*(part.height/part.width);
          if(h>maxH){h=maxH;w=h*(part.width/part.height)}
          const x=(LETTER.w-w)/2,y=margin;
          if(i)doc.addPage();
          doc.addImage(img,'PNG',x,y,w,h,undefined,'FAST');
          doc.setFont('helvetica','normal');doc.setFontSize(7.5);doc.setTextColor(104,123,138);
          doc.text('Page '+(i+1)+' of '+slices.length,7.10,PAGE_NUMBER_Y);
          part.width=1;part.height=1;
        }
        full.width=1;full.height=1;
      }
    }
    const buffer=doc.output('arraybuffer');
    if(!buffer||buffer.byteLength<1200)throw new Error('PDF generation failed.');
    const bytes=new Uint8Array(buffer);
    const sig=String.fromCharCode(...bytes.slice(0,5));
    if(sig!=='%PDF-')throw new Error('Generated file is not a valid PDF.');
    const blob=new Blob([buffer],{type:'application/pdf'});
    previewPages.set(blob,previewImages);
    renderCache.set(source,{filename:fileName(filename),blob});
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

let previewState={blob:null,filename:'aed-report.pdf',title:'AED Report',summary:''};
function showPreview(blob,filename='aed-report.pdf',title='AED Report',summary=''){
  previewState={blob,filename:fileName(filename),title:title||filename||'AED Report',summary:summary||''};
  let dlg=document.getElementById(PREVIEW_ID);
  if(!dlg){
    dlg=document.createElement('dialog');dlg.id=PREVIEW_ID;
    dlg.style.cssText='position:fixed;inset:0;width:100vw;max-width:none;height:100dvh;max-height:none;margin:0;padding:0;border:0;border-radius:0;overflow:hidden;background:#dfe5e9;';
    dlg.innerHTML='<div style="display:flex;flex-direction:column;height:100dvh;min-height:0"><div style="flex:0 0 auto;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:calc(8px + env(safe-area-inset-top)) 10px 8px;border-bottom:1px solid #d9e3ea;background:#fff"><div style="min-width:0"><b style="color:#123a5a">Generated PDF Preview</b><div id="pdfV2PageStatus" style="font-size:.82rem;color:#687b8a">Portrait Letter</div></div><button type="button" id="pdfV2CloseTop" style="flex:0 0 auto">Close</button><button type="button" id="pdfV2Prev" style="display:none">Previous</button><button type="button" id="pdfV2Next" style="display:none">Next</button></div><div id="pdfV2Pages" style="flex:1 1 auto;min-height:0;height:0;overflow-y:auto;overflow-x:auto;-webkit-overflow-scrolling:touch;touch-action:pan-y pinch-zoom;overscroll-behavior-y:contain;overscroll-behavior-x:none;background:#dfe5e9;padding:10px 6px;display:flex;flex-direction:column;align-items:center;gap:12px"></div><div style="flex:0 0 auto;display:flex;justify-content:center;gap:7px;flex-wrap:wrap;padding:8px 10px calc(8px + env(safe-area-inset-bottom));border-top:1px solid #d9e3ea;background:#fff"><button type="button" id="pdfV2SaveBottom">Save PDF</button><button type="button" id="pdfV2PrintBottom">Print</button><button type="button" id="pdfV2ShareBottom">Share</button><button type="button" id="pdfV2CloseBottom" style="min-width:120px">Close</button></div></div>';
    document.body.appendChild(dlg);
    const closePreview=()=>dlg.close();
    dlg.querySelector('#pdfV2CloseTop').onclick=closePreview;dlg.querySelector('#pdfV2CloseBottom').onclick=closePreview;
    const doSave=async()=>{try{await saveBlob(previewState.blob,previewState.filename)}catch(e){alert(e.message||'Unable to save PDF.')}};
    const doPrint=async()=>{try{await printBlob(previewState.blob)}catch(e){alert(e.message||'Unable to print PDF.')}};
    const doShare=async()=>{try{await shareBlob(previewState.blob,previewState.filename,previewState.title,previewState.summary)}catch(e){if(!e||e.name!=='AbortError')alert(e.message||'Unable to share PDF.')}};
    dlg.querySelector('#pdfV2SaveBottom').onclick=doSave;
    dlg.querySelector('#pdfV2PrintBottom').onclick=doPrint;
    dlg.querySelector('#pdfV2ShareBottom').onclick=doShare;
    dlg.querySelector('#pdfV2Prev').onclick=()=>navigatePreviewPage(-1);
    dlg.querySelector('#pdfV2Next').onclick=()=>navigatePreviewPage(1);
    dlg.addEventListener('close',()=>{const pages=dlg.querySelector('#pdfV2Pages');if(pages)pages.innerHTML='';dlg.dataset.page='0';previewState={blob:null,filename:'aed-report.pdf',title:'AED Report',summary:''}})
  }
  const pages=dlg.querySelector('#pdfV2Pages');
  pages.innerHTML='';
  const imgs=previewPages.get(blob)||[];
  dlg.dataset.page='0';
  if(imgs.length){
    imgs.forEach((src,i)=>{
      const wrap=document.createElement('div');
      wrap.dataset.previewPage=String(i);
      wrap.dataset.scale='1';
      wrap.style.cssText='width:min(100%,850px);background:#fff;box-shadow:0 2px 12px #0002;flex:0 0 auto;scroll-margin-top:8px;transform-origin:top center;';
      const img=document.createElement('img');
      img.src=src;img.alt='PDF page '+(i+1);img.draggable=false;img.style.cssText='display:block;width:100%;height:auto;background:#fff;user-select:none;-webkit-user-drag:none;touch-action:pan-y pinch-zoom;';
      const cap=document.createElement('div');
      cap.textContent='Page '+(i+1)+' of '+imgs.length;cap.style.cssText='font-size:.78rem;color:#687b8a;text-align:center;padding:7px 8px;border-top:1px solid #e3e8ec;background:#fff;';
      wrap.appendChild(img);wrap.appendChild(cap);pages.appendChild(wrap);
    });
    updatePreviewPageStatus();
    const touchDistance=(a,b)=>Math.hypot(b.clientX-a.clientX,b.clientY-a.clientY);
    let pinchTarget=null,pinchStart=0,pinchScale=1;
    pages.addEventListener('touchstart',e=>{
      if(e.touches.length!==2)return;
      const target=e.target.closest('[data-preview-page]');
      if(!target)return;
      pinchTarget=target;
      pinchStart=touchDistance(e.touches[0],e.touches[1]);
      pinchScale=Number(target.dataset.scale||1);
    },{passive:true});
    pages.addEventListener('touchmove',e=>{
      if(e.touches.length!==2||!pinchTarget||!pinchStart)return;
      e.preventDefault();
      const scale=Math.min(3,Math.max(1,pinchScale*(touchDistance(e.touches[0],e.touches[1])/pinchStart)));
      pinchTarget.dataset.scale=String(scale);
      pinchTarget.style.transform='scale('+scale+')';
      pinchTarget.style.marginBottom=((scale-1)*pinchTarget.offsetHeight)+'px';
    },{passive:false});
    pages.addEventListener('touchend',e=>{if(e.touches.length<2){pinchTarget=null;pinchStart=0}},{passive:true});
    pages.addEventListener('dblclick',e=>{
      const target=e.target.closest('[data-preview-page]');
      if(!target)return;
      const scale=Number(target.dataset.scale||1)>1?1:2;
      target.dataset.scale=String(scale);
      target.style.transform='scale('+scale+')';
      target.style.marginBottom=((scale-1)*target.offsetHeight)+'px';
    });
    pages.onscroll=()=>{clearTimeout(pages._pageTimer);pages._pageTimer=setTimeout(()=>{const children=[...pages.querySelectorAll('[data-preview-page]')];if(!children.length)return;const pr=pages.getBoundingClientRect();let best=0,dist=Infinity;children.forEach((el,i)=>{const r=el.getBoundingClientRect(),d=Math.abs(r.top-pr.top-8);if(d<dist){dist=d;best=i}});dlg.dataset.page=String(best);updatePreviewPageStatus()},80)};
  }else{
    const url=URL.createObjectURL(blob);
    const iframe=document.createElement('iframe');
    iframe.src=url;iframe.title='PDF Preview';iframe.style.cssText='width:100%;height:100%;min-height:80vh;border:0;background:#fff';
    iframe.onload=()=>setTimeout(()=>URL.revokeObjectURL(url),120000);
    pages.appendChild(iframe);
    dlg.querySelector('#pdfV2Prev').style.display='none';
    dlg.querySelector('#pdfV2Next').style.display='none';
    dlg.querySelector('#pdfV2PageStatus').textContent='PDF Preview';
  }
  if(imgs.length){dlg.querySelector('#pdfV2Prev').style.display='none';dlg.querySelector('#pdfV2Next').style.display='none'}
  dlg.showModal();

  function updatePreviewPageStatus(){
    const total=pages.querySelectorAll('[data-preview-page]').length,current=Math.min(total-1,Math.max(0,Number(dlg.dataset.page||0)));
    const status=dlg.querySelector('#pdfV2PageStatus');
    if(status)status.textContent=total?'Page '+(current+1)+' of '+total+' · Portrait Letter · Pinch to zoom':'Portrait Letter · Pinch to zoom';
    const prev=dlg.querySelector('#pdfV2Prev'),next=dlg.querySelector('#pdfV2Next');
    if(prev)prev.disabled=current<=0;if(next)next.disabled=current>=total-1;
  }
  function navigatePreviewPage(delta){
    const total=pages.querySelectorAll('[data-preview-page]').length;
    if(!total)return;
    let current=Math.min(total-1,Math.max(0,Number(dlg.dataset.page||0)));
    current=Math.min(total-1,Math.max(0,current+delta));dlg.dataset.page=String(current);
    const target=pages.querySelector('[data-preview-page="'+current+'"]');
    if(target)target.scrollIntoView({behavior:'smooth',block:'start'});
    updatePreviewPageStatus();
  }
}
async function previewElement(source,filename,title,summary){showPreview(await buildFromElement(source,filename),filename,title,summary)}
async function previewHtml(html,filename,title,summary){showPreview(await buildFromHtml(html,filename),filename,title,summary)}
async function openElement(source,filename,title,summary){showPreview(await buildFromElement(source,filename),filename,title||filename,summary||'')}
async function openHtml(html,filename,title,summary){showPreview(await buildFromHtml(html,filename),filename,title||filename,summary||'')}
async function printBlob(blob){
  if(!blob)throw new Error('PDF file is unavailable.');
  const url=URL.createObjectURL(blob);
  const frame=document.createElement('iframe');
  frame.style.cssText='position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
  frame.src=url;
  document.body.appendChild(frame);
  frame.onload=()=>{setTimeout(()=>{try{frame.contentWindow.focus();frame.contentWindow.print()}catch(e){window.open(url,'_blank')}setTimeout(()=>{frame.remove();URL.revokeObjectURL(url)},120000)},250)};
}
async function printElement(source,filename){return printBlob(await buildFromElement(source,filename))}
async function printHtml(html,filename){return printBlob(await buildFromHtml(html,filename))}

async function saveBlob(blob,filename){
  if(!blob)throw new Error('PDF file is unavailable.');
  const buffer=await blob.arrayBuffer();
  const bytes=new Uint8Array(buffer);
  const sig=String.fromCharCode(...bytes.slice(0,5));
  if(sig!=='%PDF-')throw new Error('The generated file is not a valid PDF.');
  let name=fileName(filename||'aed-report.pdf');
  if(!/\.pdf$/i.test(name))name+='.pdf';
  const cleanBlob=new Blob([buffer],{type:'application/pdf'});
  const u=URL.createObjectURL(cleanBlob);
  const a=document.createElement('a');a.href=u;a.download=name;a.rel='noopener';document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(u),120000);
}
async function saveElement(source,filename){return saveBlob(await buildFromElement(source,filename),filename)}
async function saveHtml(html,filename){return saveBlob(await buildFromHtml(html,filename),filename)}

async function shareBlob(blob,filename,title,summary){
  if(!blob)throw new Error('PDF file is unavailable.');
  const buffer=await blob.arrayBuffer();
  const bytes=new Uint8Array(buffer);
  const sig=String.fromCharCode(...bytes.slice(0,5));
  if(sig!=='%PDF-')throw new Error('The generated attachment is not a valid PDF.');
  let name=fileName(filename||'aed-report.pdf');
  if(!/\.pdf$/i.test(name))name+='.pdf';
  const cleanBlob=new Blob([buffer],{type:'application/pdf'});
  const file=new File([cleanBlob],name,{type:'application/pdf',lastModified:Date.now()});
  const isiOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  if(isiOS){
    const u=URL.createObjectURL(cleanBlob);
    const w=window.open(u,'_blank');
    if(!w){
      const a=document.createElement('a');a.href=u;a.target='_blank';a.rel='noopener';a.textContent='Open PDF';
      document.body.appendChild(a);a.click();a.remove();
    }
    setTimeout(()=>URL.revokeObjectURL(u),300000);
    return;
  }
  const shareData={files:[file]};if(title)shareData.title=String(title);
  if(navigator.share&&navigator.canShare&&navigator.canShare(shareData)){
    await navigator.share(shareData);
    return;
  }
  if(navigator.share&&!navigator.canShare){
    try{
      await navigator.share(shareData);
      return;
    }catch(e){
      if(e&&e.name==='AbortError')throw e;
    }
  }
  await saveBlob(cleanBlob,name);
}
async function shareElement(source,filename,title,summary){return shareBlob(await buildFromElement(source,filename),filename,title,summary)}
async function shareHtml(html,filename,title,summary){return shareBlob(await buildFromHtml(html,filename),filename,title,summary)}

window.GFDAEDPdfV2={buildFromElement,buildFromHtml,previewElement,previewHtml,openElement,openHtml,printElement,printHtml,saveElement,saveHtml,shareElement,shareHtml};
})();