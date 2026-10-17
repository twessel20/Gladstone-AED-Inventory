(()=>{
'use strict';

if(window.__gfdAedScannerTuningLoaded)return;
window.__gfdAedScannerTuningLoaded=true;

const H=window.Html5Qrcode;
if(!H||!H.prototype||typeof H.prototype.start!=='function')return;

function wideBarcodeBox(viewWidth,viewHeight){
  const w=Math.max(280,Math.min(Math.floor(viewWidth*.97),760));
  const h=Math.max(130,Math.min(Math.floor(viewHeight*.46),240));
  return {width:Math.min(w,Math.max(1,viewWidth-4)),height:Math.min(h,Math.max(1,viewHeight-4))};
}

function tunedLiveConfig(config){
  const next=Object.assign({},config||{});
  next.fps=Math.max(Number(next.fps)||0,15);
  next.qrbox=wideBarcodeBox;
  next.disableFlip=true;
  delete next.aspectRatio;
  next.videoConstraints={
    facingMode:{ideal:'environment'},
    width:{ideal:1920},
    height:{ideal:1080},
    frameRate:{ideal:30,max:30}
  };
  return next;
}

const originalStart=H.prototype.start;
H.prototype.start=function(cameraIdOrConfig,config,onSuccess,onError){
  const scanner=this;
  return originalStart.call(scanner,cameraIdOrConfig,tunedLiveConfig(config),onSuccess,onError).then(async result=>{
    try{
      if(typeof scanner.getRunningTrackCapabilities==='function'&&typeof scanner.applyVideoConstraints==='function'){
        const caps=scanner.getRunningTrackCapabilities()||{};
        const advanced={};
        if(Array.isArray(caps.focusMode)&&caps.focusMode.includes('continuous'))advanced.focusMode='continuous';
        if(Object.keys(advanced).length)await scanner.applyVideoConstraints({advanced:[advanced]});
      }
    }catch(e){}
    return result;
  });
};

function scannerConstructorConfig(){
  try{
    if(typeof window.aedScannerConfig==='function')return window.aedScannerConfig();
  }catch(e){}
  if(typeof window.Html5QrcodeSupportedFormats==='undefined')return {};
  const F=window.Html5QrcodeSupportedFormats;
  return {formatsToSupport:[F.CODE_128,F.QR_CODE,F.CODE_39,F.CODE_93,F.CODABAR,F.EAN_13,F.EAN_8,F.UPC_A,F.UPC_E,F.ITF,F.DATA_MATRIX,F.AZTEC,F.PDF_417].filter(v=>v!==undefined)};
}

async function scanStillImage(context,file){
  if(!file)return;
  const msg=document.getElementById(context.msg);
  const dlg=document.getElementById(context.dialog);
  let scanner=null;
  try{
    if(msg)msg.textContent='Reading barcode from photo…';
    if(typeof context.stop==='function')await context.stop();
    scanner=new H(context.reader,scannerConstructorConfig());
    const decoded=await scanner.scanFile(file,true);
    let matched=false;
    if(typeof context.handle==='function')matched=!!context.handle(decoded);
    if(!matched&&msg)msg.textContent='Barcode read, but no matching AED serial was found.';
    if(matched&&dlg?.open)dlg.close();
  }catch(e){
    if(msg)msg.textContent='Could not read that photo. Fill the barcode across most of the frame, keep it sharp, and avoid glare.';
  }finally{
    if(scanner){try{scanner.clear()}catch(e){}}
  }
}

function addPhotoFallback(context){
  const dlg=document.getElementById(context.dialog);
  const reader=document.getElementById(context.reader);
  if(!dlg||!reader||dlg.querySelector('[data-photo-scan="'+context.reader+'"]'))return;

  const wrap=document.createElement('div');
  wrap.style.cssText='display:flex;justify-content:center;margin:10px 0 2px;';
  const input=document.createElement('input');
  input.type='file';
  input.accept='image/*';
  input.setAttribute('capture','environment');
  input.style.display='none';
  input.dataset.photoScan=context.reader;
  const button=document.createElement('button');
  button.type='button';
  button.textContent='Take Barcode Photo';
  button.className='primary';
  button.style.minHeight='44px';
  button.onclick=()=>input.click();
  input.onchange=async()=>{
    const file=input.files&&input.files[0];
    input.value='';
    await scanStillImage(context,file);
  };
  wrap.appendChild(button);
  wrap.appendChild(input);
  reader.insertAdjacentElement('afterend',wrap);
}

const contexts=[
  {
    dialog:'scanDlg',reader:'serialReader',msg:'scanMsg',
    stop:()=>typeof window.stopSerialScanner==='function'?window.stopSerialScanner():Promise.resolve(),
    handle:raw=>typeof window.openAedBySerial==='function'?window.openAedBySerial(raw,document.getElementById('scanDlg')?.dataset.allowAdd==='1'):false
  },
  {
    dialog:'addScanDlg',reader:'addSerialReader',msg:'addScanMsg',
    stop:()=>typeof window.stopAddSerialScanner==='function'?window.stopAddSerialScanner():Promise.resolve(),
    handle:raw=>typeof window.useAddSerial==='function'?window.useAddSerial(raw):false
  },
  {
    dialog:'deployScanDlg',reader:'deploySerialReader',msg:'deployScanMsg',
    stop:()=>typeof window.stopDeploySerialScanner==='function'?window.stopDeploySerialScanner():Promise.resolve(),
    handle:raw=>typeof window.openDeploymentBySerial==='function'?window.openDeploymentBySerial(raw):false
  }
];

contexts.forEach(addPhotoFallback);
})();
