(()=>{
'use strict';
const $=id=>document.getElementById(id);
let activeSignatureCanvas=null;
let autoLandscape=false;

function visible(el){if(!el)return false;const r=el.getBoundingClientRect();const s=getComputedStyle(el);return r.width>20&&r.height>20&&s.display!=='none'&&s.visibility!=='hidden'}
function rememberCanvas(e){const c=e.target.closest?.('canvas.signature-pad');if(c)activeSignatureCanvas=c}
document.addEventListener('pointerdown',rememberCanvas,true);
document.addEventListener('focusin',rememberCanvas,true);

function removeManualExpanders(){
  document.querySelectorAll('.signature-fullscreen-btn').forEach(btn=>{
    if(btn.id!=='overallSigUse')btn.remove();
  });
  const use=$('overallSigUse');
  if(use){
    use.classList.remove('signature-fullscreen-btn');
    use.textContent='Use Signature';
    use.onclick=e=>{
      e.preventDefault();
      const canvas=$('overallSigCanvas'),data=$('overallSigData');
      if(!canvas||!data)return;
      if(!data.value){
        try{data.value=canvas.toDataURL('image/png')}catch(_){ }
      }
      if(!data.value){alert('Please add a signature before using it.');return}
      use.textContent='Signature Confirmed';
      setTimeout(()=>{use.textContent='Use Signature'},1200);
    };
  }
}

function currentVisibleSignature(){
  if(activeSignatureCanvas&&visible(activeSignatureCanvas))return activeSignatureCanvas;
  return [...document.querySelectorAll('canvas.signature-pad')].find(visible)||null;
}
function landscape(){return matchMedia('(orientation: landscape)').matches&&innerWidth>innerHeight}
function portrait(){return matchMedia('(orientation: portrait)').matches||innerHeight>=innerWidth}

function openAutomaticLandscape(){
  if(!landscape())return;
  const canvas=currentVisibleSignature();
  if(!canvas||typeof window.openSignatureFullscreen!=='function')return;
  const dataId=canvas.dataset.signatureDataId;
  if(!dataId)return;
  const dlg=$('signatureFullscreenDlg');
  if(dlg?.open)return;
  autoLandscape=true;
  window.openSignatureFullscreen(canvas.id,dataId,canvas.getAttribute('aria-label')||'Signature');
}
function returnToPortrait(){
  if(!portrait())return;
  const dlg=$('signatureFullscreenDlg');
  if(!dlg?.open)return;
  const use=$('signatureFullscreenUse')||dlg.querySelector('[data-signature-use], .signature-use, button.primary');
  if(use){use.click()}else dlg.close();
  autoLandscape=false;
}
function orientationSync(){
  setTimeout(()=>{
    removeManualExpanders();
    if(landscape())openAutomaticLandscape();
    else returnToPortrait();
    document.querySelectorAll('canvas.signature-pad').forEach(canvas=>{
      const dataId=canvas.dataset.signatureDataId;
      const value=dataId?$(dataId)?.value||'':'';
      if(typeof window.sizeSignatureCanvasToDisplay==='function')window.sizeSignatureCanvasToDisplay(canvas,value);
    });
  },220);
}
window.addEventListener('orientationchange',orientationSync);
window.addEventListener('resize',()=>{clearTimeout(window.__gfdSigResize);window.__gfdSigResize=setTimeout(orientationSync,180)});

function labelClearButtons(){
  document.querySelectorAll('button[id*="SigClear"],button[id*="sigClear"],button[id*="signatureClear"],#signatureFullscreenClear').forEach(b=>b.textContent='Clear Signature');
}

function installQuarterlyPolish(){
  const style=document.createElement('style');
  style.id='quarterly-v207-style';
  style.textContent=`
    .signature-pad{display:block;width:100%;object-fit:contain;touch-action:none}
    .overall-signature-block img,.signature-block img,.report-sheet img[alt*="signature" i]{object-fit:contain!important;object-position:left center!important;width:auto!important;max-width:100%!important;height:auto!important;max-height:150px!important}
    #signatureFullscreenDlg[open]{width:100vw!important;max-width:none!important;height:100dvh!important;max-height:none!important;margin:0!important;border-radius:0!important;padding:max(8px,env(safe-area-inset-top)) max(10px,env(safe-area-inset-right)) max(8px,env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left))!important}
    #signatureFullscreenDlg canvas{width:100%!important;flex:1 1 auto!important;min-height:0!important;touch-action:none!important}
    .packet-aed-page,.packet-aed-entry>section.report-box{border:1px solid #cbd9e2!important;border-radius:12px!important;background:#fff!important;box-shadow:0 3px 10px rgba(18,58,90,.08)!important}
    .packet-aed-page h2,.packet-aed-entry h2{font-size:20px!important;color:#123a5a!important;margin-bottom:4px!important}
    .packet-aed-page .report-grid,.packet-aed-entry .report-grid{gap:12px!important}
    .packet-aed-page .report-box,.packet-aed-entry .report-box{border-radius:9px!important;background:#f9fbfc!important}
    .packet-aed-page .summary-table th,.packet-aed-entry .summary-table th{background:#eaf2f7!important;color:#123a5a!important}
    @media(max-width:700px){.packet-aed-page,.packet-aed-entry>section.report-box{box-shadow:none!important}.signature-pad{min-height:150px}}
  `;
  document.head.appendChild(style);
}

function boot(){removeManualExpanders();labelClearButtons();installQuarterlyPolish();setTimeout(()=>{removeManualExpanders();labelClearButtons()},500)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
new MutationObserver(()=>{removeManualExpanders();labelClearButtons()}).observe(document.documentElement,{childList:true,subtree:true});
})();
