(()=>{
'use strict';

const PAGE={left:0.62,right:0.62,top:0.62,bottom:0.62,width:8.5,height:11};
const CONTENT_W=PAGE.width-PAGE.left-PAGE.right;
const CONTENT_BOTTOM=PAGE.height-PAGE.bottom;

function getJsPDF(){
  return window.jspdf&&window.jspdf.jsPDF;
}
function clean(v){
  return String(v??'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').replace(/\s*\n\s*/g,' ').trim();
}
function healthColor(health){
  const h=clean(health).toUpperCase();
  if(h.includes('ATTENTION REQUIRED')) return [163,44,44];
  if(h.includes('WATCH')) return [148,97,0];
  return [31,117,74];
}
function sheet(){
  const s=document.getElementById('generatedReportSheet');
  if(!s) throw new Error('Generate a report first.');
  return s;
}
function meta(){
  const s=sheet();
  return {
    sheet:s,
    title:clean(s.querySelector('.report-title h1')?.textContent)||'Gladstone AED Report',
    subtitle:clean(s.querySelector('.report-title p')?.textContent)
  };
}
function filename(){
  const {title,subtitle}=meta();
  const q=(subtitle.match(/Q\d\s+\d{4}/i)||[''])[0].replace(/\s+/g,'-').toLowerCase();
  const base=title.replace(/[^a-z0-9]+/ig,'-').replace(/^-+|-+$/g,'').toLowerCase()||'aed-report';
  return base+(q?'-'+q:'')+'.pdf';
}
function textLines(doc,text,width,size){
  doc.setFontSize(size);
  return doc.splitTextToSize(clean(text),width);
}
function lineHeight(size){ return size<=8?0.14:size<=9?0.16:size<=11?0.19:0.23; }
function ensureSpace(doc,state,need){
  if(state.y+need<=CONTENT_BOTTOM) return;
  doc.addPage();
  state.y=PAGE.top;
}
function addText(doc,state,text,{size=9,bold=false,x=PAGE.left,width=CONTENT_W,gap=0.03}={}){
  const t=clean(text); if(!t) return;
  doc.setFont('helvetica',bold?'bold':'normal');
  doc.setTextColor(20,35,45);
  const lines=textLines(doc,t,width,size), lh=lineHeight(size);
  for(const line of lines){
    ensureSpace(doc,state,lh);
    doc.text(line,x,state.y);
    state.y+=lh;
  }
  state.y+=gap;
}
function addRule(doc,state){
  ensureSpace(doc,state,0.12);
  doc.setDrawColor(18,58,90); doc.setLineWidth(0.02);
  doc.line(PAGE.left,state.y,PAGE.width-PAGE.right,state.y);
  state.y+=0.16;
}
function addKeyValue(doc,state,label,value){
  const l=clean(label),v=clean(value); if(!l&&!v)return;
  const leftW=2.55,rightX=PAGE.left+2.7,rightW=CONTENT_W-2.7;
  const ll=textLines(doc,l,leftW,8.5), rr=textLines(doc,v,rightW,8.5);
  const rows=Math.max(ll.length,rr.length,1), h=rows*0.16+0.05;
  ensureSpace(doc,state,h);
  doc.setFont('helvetica','bold');doc.setFontSize(8.5);
  ll.forEach((x,i)=>doc.text(x,PAGE.left,state.y+i*0.16));
  doc.setFont('helvetica','normal');
  rr.forEach((x,i)=>doc.text(x,rightX,state.y+i*0.16));
  state.y+=h;
}
function addTable(doc,state,table){
  const heads=[...table.querySelectorAll('thead th')].map(x=>clean(x.textContent));
  const rows=[...table.querySelectorAll('tbody tr')].map(tr=>[...tr.children].map(td=>clean(td.textContent)));
  if(!heads.length&&!rows.length)return;
  const cols=Math.max(heads.length,...rows.map(r=>r.length),1);
  const colW=CONTENT_W/cols;
  const drawRow=(cells,bold=false)=>{
    const wrapped=Array.from({length:cols},(_,i)=>textLines(doc,cells[i]||'',colW-0.12,8));
    const n=Math.max(1,...wrapped.map(a=>a.length)),h=n*0.145+0.10;
    ensureSpace(doc,state,h);
    const y0=state.y-0.02;
    doc.setDrawColor(210);doc.setLineWidth(0.005);
    for(let i=0;i<cols;i++){
      const x=PAGE.left+i*colW;
      doc.rect(x,y0,colW,h);
      doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(8);
      wrapped[i].forEach((line,j)=>doc.text(line,x+0.06,state.y+0.11+j*0.145));
    }
    state.y+=h;
  };
  if(heads.length)drawRow(heads,true);
  rows.forEach(r=>drawRow(r,false));
  state.y+=0.08;
}
function directKVs(root){
  return [...root.querySelectorAll('.kv')].filter(k=>!k.parentElement?.closest('.kv')).map(k=>{
    const parts=[...k.children].map(x=>clean(x.textContent));
    return {label:parts[0]||'',value:parts.slice(1).join(' ')};
  });
}
function extractSummary(s){
  const summary=[...s.children].find(x=>x.tagName==='SECTION'&&!x.classList.contains('report-box')) || s.querySelector('section');
  if(!summary)return null;
  const scope=clean([...summary.querySelectorAll('p')].find(p=>/^Scope:/i.test(clean(p.textContent)))?.textContent);
  const healthBox=[...summary.querySelectorAll('.report-box')].find(b=>/Overall Health/i.test(clean(b.textContent)));
  const health=healthBox?clean([...healthBox.querySelectorAll('div')].find(d=>/GOOD|WATCH|ATTENTION REQUIRED/i.test(clean(d.textContent)))?.textContent):'';
  const healthText=healthBox?clean([...healthBox.querySelectorAll('p')][0]?.textContent):'';
  const kvs=directKVs(summary);
  const issues=[...summary.querySelectorAll('li')].map(x=>clean(x.textContent)).filter(Boolean);
  return {scope,health,healthText,kvs,issues};
}
function extractAeds(s){
  return [...s.children].filter(x=>x.tagName==='SECTION'&&x.classList.contains('report-box')).map(sec=>({
    name:clean(sec.querySelector('h2')?.textContent)||'AED Detail',
    meta:clean(sec.querySelector(':scope > p.muted')?.textContent),
    componentKvs:directKVs(sec.querySelector('.report-grid')||sec),
    sections:[...sec.querySelectorAll(':scope > h3')].map(h=>{
      let n=h.nextElementSibling;
      return {title:clean(h.textContent),table:n&&n.tagName==='TABLE'?n:null};
    }),
    inspectionTable:sec.querySelector('.report-grid table.summary-table')
  }));
}
function inspectReport(){
  const {sheet:s,title,subtitle}=meta();
  const summary=extractSummary(s),aeds=extractAeds(s);
  return {title,subtitle,summary,aedCount:aeds.length,aedNames:aeds.map(a=>a.name)};
}
function buildPdf(){
  const JsPDF=getJsPDF();
  if(!JsPDF)throw new Error('PDF engine is unavailable. html2pdf/jsPDF must be loaded first.');
  const {sheet:s,title,subtitle}=meta();
  const summary=extractSummary(s),aeds=extractAeds(s);
  if(!aeds.length)throw new Error('No AED detail sections were found in the generated report.');

  const doc=new JsPDF({unit:'in',format:[8.5,11],orientation:'portrait',compress:true});
  const state={y:PAGE.top};

  addText(doc,state,title,{size:18,bold:true,gap:0.05});
  addText(doc,state,subtitle,{size:9,gap:0.12});
  addRule(doc,state);

  addText(doc,state,'Executive Summary',{size:15,bold:true,gap:0.10});
  if(summary){
    if(summary.scope)addText(doc,state,summary.scope,{size:9,bold:true,gap:0.10});
    if(summary.health){
      const c=healthColor(summary.health);
      doc.setTextColor(c[0],c[1],c[2]);
      doc.setFont('helvetica','bold');doc.setFontSize(12);
      const lines=textLines(doc,'Overall Health: '+summary.health,CONTENT_W,12),lh=lineHeight(12);
      for(const line of lines){ensureSpace(doc,state,lh);doc.text(line,PAGE.left,state.y);state.y+=lh}
      state.y+=0.05;
      doc.setTextColor(20,35,45);
    }
    if(summary.healthText)addText(doc,state,summary.healthText,{size:9,gap:0.12});
    for(const kv of summary.kvs)addKeyValue(doc,state,kv.label,kv.value);
    if(summary.issues.length){
      state.y+=0.08;addText(doc,state,'Items Requiring Attention / Watch',{size:11,bold:true,gap:0.05});
      summary.issues.forEach(x=>addText(doc,state,'• '+x,{size:8.5,x:PAGE.left+0.08,width:CONTENT_W-0.08,gap:0.01}));
    }else{
      state.y+=0.08;addText(doc,state,'Attention items: None identified from the recorded inventory data.',{size:9});
    }
  }

  // Details always begin on a fresh page. Each AED begins on a fresh page, which prevents
  // accidental overlap and guarantees every selected unit appears exactly once.
  for(const aed of aeds){
    doc.addPage();state.y=PAGE.top;
    addText(doc,state,aed.name,{size:15,bold:true,gap:0.04});
    if(aed.meta)addText(doc,state,aed.meta,{size:8.5,gap:0.12});
    addText(doc,state,'Current Components',{size:11,bold:true,gap:0.04});
    aed.componentKvs.forEach(k=>addKeyValue(doc,state,k.label,k.value));

    if(aed.inspectionTable){
      state.y+=0.08;addText(doc,state,'Quarterly Inspection',{size:11,bold:true,gap:0.04});
      addTable(doc,state,aed.inspectionTable);
    }
    for(const part of aed.sections){
      state.y+=0.08;addText(doc,state,part.title,{size:11,bold:true,gap:0.04});
      if(part.table)addTable(doc,state,part.table);
    }
  }

  const pages=doc.getNumberOfPages();
  for(let p=1;p<=pages;p++){
    doc.setPage(p);
    doc.setFont('helvetica','normal');doc.setFontSize(7.5);doc.setTextColor(105);
    doc.text('Gladstone Fire / EMS AED Inventory',PAGE.left,10.55);
    doc.text('Page '+p+' of '+pages,7.15,10.55);
    doc.setTextColor(0);
  }
  return doc;
}
function blob(){
  const b=buildPdf().output('blob');
  if(!b||b.size<1000)throw new Error('PDF generation failed.');
  return b;
}
function openPdf(){
  const b=blob(),url=URL.createObjectURL(b);
  window.open(url,'_blank');
  setTimeout(()=>URL.revokeObjectURL(url),120000);
}
async function sharePdf(){
  const b=blob(),name=filename(),file=new File([b],name,{type:'application/pdf'});
  if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){
    await navigator.share({title:meta().title,files:[file]});
    return;
  }
  const url=URL.createObjectURL(b);
  window.open(url,'_blank');
  setTimeout(()=>URL.revokeObjectURL(url),120000);
}

window.GFDAEDPdfExporter={buildPdf,blob,openPdf,sharePdf,inspectReport,filename};
})();