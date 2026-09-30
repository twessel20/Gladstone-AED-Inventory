(()=>{
'use strict';
const $id=id=>document.getElementById(id);
const safe=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const dateFmt=v=>typeof fmt==='function'?fmt(v):(v||'N/A');
function allAeds(){return (db?.aeds||[])}
function tracked(){return allAeds().filter(a=>typeof isInventoryTracked==='function'?isInventoryTracked(a):true)}
function canonicalGroup(a){
  if(String(a?.group||'').trim())return String(a.group).trim();
  const serial=String(a?.serial||'');
  if(['X11L528611','X11L529465','X11L528795','X11L529221','X11L529205','X11L528608','X11L528858','X11L528613','X11L528619','X16J868825','X11L528627'].includes(serial))return 'Police Patrol Cars';
  if(['X11L529144','X11L528791','X11L528628','X11L529451','X19D142339'].includes(serial))return 'Police Department / City Hall';
  if(['X11L528801','X11L528610'].includes(serial))return 'Public Works / Animal Shelter';
  if(['X19D140932','X20A241496','X19D140968','X11L529367','X11L528800','X17L979521','X19D141892'].includes(serial))return 'Community Center / Parks & Recreation';
  return a?.location||'Unassigned';
}
function groups(){return [...new Set(allAeds().map(canonicalGroup))].sort((a,b)=>a.localeCompare(b))}
function period(){return {year:Number($id('reportYear')?.value||new Date().getFullYear()),quarter:Number($id('reportQuarter')?.value||1)}}
function periodChecks(a,year,quarter){return (a.checks||[]).filter(c=>Number(c.year)===year&&Number(c.quarter)===quarter).sort((x,y)=>String(y.date||'').localeCompare(String(x.date||'')))}
function periodDate(v,year,quarter){if(!v)return false;const d=new Date(String(v).slice(0,10)+'T12:00:00');return !isNaN(d)&&d.getFullYear()===year&&(Math.floor(d.getMonth()/3)+1)===quarter}
function selectedIds(){return [...document.querySelectorAll('.muster-aed:checked')].map(x=>x.value)}
function renderPicker(){const mode=$id('musterMode')?.value||'individual',wrap=$id('musterPicker');if(!wrap)return;if(mode==='group'){wrap.innerHTML='<label>Group<select id="musterGroup">'+groups().map(g=>'<option value="'+safe(g)+'">'+safe(g)+'</option>').join('')+'</select></label>'}else if(mode==='individual'){wrap.innerHTML='<label>AED<select id="musterIndividual">'+tracked().map(a=>'<option value="'+a.id+'">'+safe(a.location)+(a.descriptor?' — '+safe(a.descriptor):'')+' · '+safe(a.serial)+'</option>').join('')+'</select></label>'}else{wrap.innerHTML='<div class="card" style="max-height:320px;overflow:auto"><div class="bar" style="margin-bottom:6px"><b>Select AEDs</b><div class="actions" style="margin-top:0"><button type="button" id="musterAll">All</button><button type="button" id="musterNone">None</button></div></div>'+tracked().map(a=>'<label class="check"><input class="muster-aed" type="checkbox" value="'+a.id+'"><span>'+safe(a.location)+(a.descriptor?' — '+safe(a.descriptor):'')+' <span class="muted">'+safe(a.serial)+'</span></span></label>').join('')+'</div>';$id('musterAll').onclick=()=>document.querySelectorAll('.muster-aed').forEach(x=>x.checked=true);$id('musterNone').onclick=()=>document.querySelectorAll('.muster-aed').forEach(x=>x.checked=false)}}
function choose(){const mode=$id('musterMode').value;if(mode==='group'){const g=$id('musterGroup').value;const members=allAeds().filter(a=>canonicalGroup(a)===g);if(g==='Community Center / Parks & Recreation'&&!members.some(a=>String(a.serial||'')==='X11L528800')){const happy=allAeds().find(a=>String(a.serial||'')==='X11L528800');if(happy)members.push(happy)}return members}if(mode==='individual'){const id=$id('musterIndividual').value;return tracked().filter(a=>a.id===id)}const ids=new Set(selectedIds());return tracked().filter(a=>ids.has(a.id))}
function status(a){return safe(a.status||'In Service')}
function daysTo(v){if(!v)return null;const d=new Date(String(v).slice(0,10)+'T12:00:00'),n=new Date();n.setHours(12,0,0,0);return isNaN(d)?null:Math.ceil((d-n)/86400000)}
function reportHasPediatricPads(a){return !!a&&(String(a.serial||'')==='X17L979521'||a.pedConfig!=='N/A')}
function components(a){const x=[{name:'Adult pads',date:a.adult},{name:'Battery',date:a.battery}];if(reportHasPediatricPads(a))x.splice(1,0,{name:'Pediatric pads',date:a.ped});return x}
function healthData(units,year,quarter){
  let oos=0,retired=0,expired=0,due30=0,due180=0,missing=0,checksComplete=0,deployments=0,shocks=0,issues=[],failures=[],eligible=0,passing=0;
  units.forEach(a=>{
    const label=a.location+(a.descriptor?' — '+a.descriptor:'');
    const state=String(a.status||'In Service');
    const knownInactive=/removed\s*\/\s*retired|retired|destroyed|beyond repair|end[- ]?of[- ]?life/i.test(state);
    let unitPass=true;
    if(knownInactive){
      retired++;
    }else{
      eligible++;
      if(state!=='In Service'){
        oos++;unitPass=false;const msg=label+': '+state;issues.push(msg);failures.push(msg)
      }
      components(a).forEach(comp=>{
        const d=daysTo(comp.date);
        if(d===null){missing++;unitPass=false;issues.push(label+': '+comp.name+' expiration not recorded')}
        else if(d<0){expired++;unitPass=false;const msg=label+': '+comp.name+' expired '+dateFmt(comp.date);issues.push(msg);failures.push(msg)}
        else if(d<=30){due30++;due180++;issues.push(label+': '+comp.name+' expires in '+d+' day'+(d===1?'':'s')+' ('+dateFmt(comp.date)+')')}
        else if(d<=180){due180++}
      });
      const quarterChecks=periodChecks(a,year,quarter);
      if(!quarterChecks.length){
        unitPass=false;issues.push(label+': quarterly inspection not complete')
      }else{
        checksComplete++;
        const latest=quarterChecks[0];
        if(String(latest.auditResult||'').toLowerCase()==='issues found'){
          unitPass=false;issues.push(label+': quarterly inspection documented issues')
        }
        if(String(latest.status||state)!=='In Service'){
          unitPass=false;
          const msg=label+': inspection status '+String(latest.status||state);
          issues.push(msg);failures.push(msg)
        }
      }
      if(unitPass)passing++;
    }
    (a.deps||[]).filter(d=>periodDate(d.date,year,quarter)).forEach(d=>{deployments++;if(d.shock)shocks++})
  });
  const healthPct=eligible?Math.round((passing/eligible)*100):100;
  const health=healthPct>=95?'GOOD':healthPct>=90?'NEEDS ATTENTION':'CRITICAL';
  const healthText=healthPct>=95
    ?(healthPct===100
      ?'All evaluated AEDs meet current readiness criteria with no identified readiness deficiencies.'
      :'Overall readiness remains in the green range at 95% or greater.')
    :healthPct>=90
      ?'Overall readiness is below 95% and requires attention.'
      :'Overall readiness is below 90% and requires corrective action.';
  return {oos,retired,expired,due30,due180,missing,checksComplete,deployments,shocks,issues:[...new Set(issues)],failures:[...new Set(failures)],health,healthPct,eligible,passing,healthText}
}
function pageHeaderHTML(title,scope,year,quarter,pageId){
  return '<div class="report-header packet-header"><img src="gfd-patch.jpg" alt="Gladstone Fire EMS"><div class="report-title"><div class="packet-header-kicker">GLADSTONE FIRE / EMS · AED REPORT</div><h1>'+safe(title)+'</h1><p><b>Scope:</b> '+safe(scope)+' · <b>Period:</b> Q'+quarter+' '+year+' · '+safe(quarterDateRange(year,quarter))+'</p><p class="packet-page-id">'+safe(pageId)+'</p></div></div>'
}
function packetFooterHTML(generated){return '<div class="report-foot packet-footer">'+safe(generated)+'</div>'}
function quarterDateRange(year,quarter){
  const q=Number(quarter),y=Number(year),ranges={1:[[0,1],[2,31]],2:[[3,1],[5,30]],3:[[6,1],[8,30]],4:[[9,1],[11,31]]},r=ranges[q]||ranges[1];
  const start=new Date(y,r[0][0],r[0][1]),end=new Date(y,r[1][0],r[1][1]);
  const f=d=>d.toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'});
  return f(start)+' – '+f(end)
}
function coverPage(title,subtitle,scope,year,quarter,count,generated){
  return '<section class="packet-page packet-cover-page">'+
    '<div class="packet-cover-hero"><img class="packet-cover-logo" src="gfd-patch.jpg" alt="Gladstone Fire EMS"><div class="packet-kicker">GLADSTONE FIRE / EMS</div><h1>'+safe(title)+'</h1><p class="packet-cover-subtitle">'+safe(subtitle)+'</p><p class="packet-cover-range">'+safe(quarterDateRange(year,quarter))+'</p></div>'+
    '<div class="packet-cover-body"><p class="packet-cover-description">This packet summarizes AED readiness, quarterly inspection completion, component expiration status, deployments, shock-delivery activity, and documented return-to-service events for the selected reporting scope.</p>'+
    '<div class="report-grid packet-cover-grid"><div class="report-box"><h3>Report Information</h3><div class="kv"><b>Group / Scope</b><div>'+safe(scope)+'</div></div><div class="kv"><b>Reporting Period</b><div>Q'+quarter+' '+year+'</div></div><div class="kv"><b>Date Range</b><div>'+safe(quarterDateRange(year,quarter))+'</div></div><div class="kv"><b>AEDs Included</b><div>'+count+'</div></div></div>'+
    '<div class="report-box"><h3>Packet Structure</h3><div class="kv"><b>Page 2</b><div>Executive Summary & Overall Health</div></div><div class="kv"><b>Following Pages</b><div>One AED per page</div></div><div class="kv"><b>Final Report Page</b><div>Certification & Attestation</div></div><div class="kv appendix-support-row"><b>After Certification</b><div>Appendix / Supporting Documentation Only</div></div></div></div></div>'+
    packetFooterHTML(generated)+'</section>'
}
function executiveSummaryPage(units,year,quarter,mode,groupName,title,subtitle,generated){
  const h=healthData(units,year,quarter),scope=mode==='group'?groupName:mode==='individual'?(units[0].location+(units[0].descriptor?' — '+units[0].descriptor:'')):'Selected AEDs',complete=h.checksComplete===units.length;
  const healthClass=h.health==='CRITICAL'?'health-critical':h.health==='NEEDS ATTENTION'?'health-attention':'health-good';
  const failureBlock=h.failures.length
    ?'<div class="report-box critical-findings"><h3>Critical Failure Findings</h3><ul>'+h.failures.map(x=>'<li>'+safe(x)+'</li>').join('')+'</ul></div>'
    :'';
  const attentionBlock=h.issues.length
    ?'<div class="report-box"><h3>'+(h.health==='CRITICAL'?'Additional Findings / Attention Items':'Attention Items')+'</h3><ul>'+h.issues.slice(0,6).map(x=>'<li>'+safe(x)+'</li>').join('')+(h.issues.length>6?'<li>+'+(h.issues.length-6)+' additional item(s) detailed in this report.</li>':'')+'</ul></div>'
    :'<div class="report-box"><h3>Attention Items</h3><p>None identified from the recorded inventory data.</p></div>';
  const split=Math.ceil(units.length/2),left=units.slice(0,split),right=units.slice(split);
  const listCol=(arr,offset)=>'<div class="packet-aed-list-col">'+arr.map((a,i)=>'<div><span class="packet-aed-num">'+(offset+i+1)+'.</span><span class="packet-aed-name"><b>'+safe(a.location)+'</b>'+(a.descriptor?'<span class="packet-aed-desc"> — '+safe(a.descriptor)+'</span>':'')+'</span><span class="packet-aed-serial">'+safe(a.serial)+'</span></div>').join('')+'</div>';
  const included='<div class="report-box packet-included-aeds"><h3>AEDs Included</h3><div class="packet-aed-list">'+listCol(left,0)+listCol(right,split)+'</div></div>';
  return '<section class="packet-page packet-executive-page">'+pageHeaderHTML(title,scope,year,quarter,'Executive Summary & Overall Health')+
    '<div class="exec-summary packet-exec"><h2>Executive Summary</h2><p><b>Scope:</b> '+safe(scope)+' · Q'+quarter+' '+year+' · '+units.length+' AED'+(units.length===1?'':'s')+'</p>'+
    '<div class="report-grid"><div class="report-box"><h3>Overall Health</h3><div class="health '+healthClass+' packet-health">'+safe(h.health)+' · '+h.healthPct+'%</div><p>'+safe(h.healthText)+'</p></div>'+
    '<div class="report-box"><h3>Quarterly Status</h3><div class="kv"><b>Inspections completed</b><div>'+h.checksComplete+' / '+units.length+'</div></div><div class="kv"><b>Quarter complete</b><div>'+(complete?'Yes':'No')+'</div></div></div></div>'+
    '<div class="report-grid"><div class="report-box"><h3>Readiness</h3><div class="kv"><b>Out of service</b><div>'+h.oos+'</div></div><div class="kv"><b>Retired / end-of-life</b><div>'+h.retired+'</div></div><div class="kv"><b>Expired components</b><div>'+h.expired+'</div></div><div class="kv"><b>Expiration ≤30 days</b><div>'+h.due30+'</div></div><div class="kv"><b>Expiration 31–180 days</b><div>'+Math.max(0,h.due180-h.due30)+'</div></div><div class="kv"><b>Missing expiration dates</b><div>'+h.missing+'</div></div></div>'+
    '<div class="report-box"><h3>Activity This Quarter</h3><div class="kv"><b>Deployments</b><div>'+h.deployments+'</div></div><div class="kv"><b>Shock-delivery events</b><div>'+h.shocks+'</div></div></div></div>'+
    failureBlock+attentionBlock+included+
    '<p class="muted" style="margin-top:10px">Overall health is generated from current AED status, recorded component expiration dates, quarterly inspection records, and deployment history contained in this report.</p></div>'+
    packetFooterHTML(generated)+'</section>'
}
function pdfClean(v){return String(v??'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').replace(/\s*\n\s*/g,' ').trim()}
async function imageToDataUrl(img){if(!img)return '';if(/^data:image\//i.test(img.src||''))return img.src;await (img.complete?Promise.resolve():new Promise(r=>{img.onload=r;img.onerror=r}));try{const canvas=document.createElement('canvas');canvas.width=img.naturalWidth||img.width||1;canvas.height=img.naturalHeight||img.height||1;canvas.getContext('2d').drawImage(img,0,0);return canvas.toDataURL('image/png')}catch(e){return img.src||''}}
async function reportPdfBlob(source,filename){
  const element=source instanceof Element?source:document.querySelector(source);
  if(!element)throw new Error('Report content is unavailable.');
  const JsPDF=(window.jspdf&&window.jspdf.jsPDF)||window.jsPDF;
  const capture=window.html2canvas;
  if(!JsPDF||typeof capture!=='function')throw new Error('PDF rendering engine is not available.');

  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));

  const originalHeader=element.querySelector('.report-header');
  const executive=[...element.children].find(x=>x.tagName==='SECTION'&&!x.classList.contains('report-box'));
  const aedSections=[...element.children].filter(x=>x.tagName==='SECTION'&&x.classList.contains('report-box'));
  const att=element.querySelector('.certification-attestation');
  const sig=element.querySelector('.overall-signature-block');
  const foot=element.querySelector('.report-foot');
  const generatedText=pdfClean(foot?.childNodes?.[0]?.textContent||foot?.textContent||'');
  if(!originalHeader)throw new Error('Report header is unavailable.');

  const logoData=await imageToDataUrl(originalHeader.querySelector('img'));
  const headerClone=()=>{
    const h=originalHeader.cloneNode(true);
    h.querySelectorAll('img').forEach(img=>{if(logoData)img.src=logoData});
    return h;
  };

  const mount=document.createElement('div');
  mount.className='pdf-capture-mount';
  document.body.appendChild(mount);

  const makePage=(kind='detail')=>{
    const page=document.createElement('div');
    page.className='report-sheet pdf-capture-page pdf-capture-'+kind;
    page.appendChild(headerClone());
    mount.appendChild(page);
    return page;
  };
  const appendPageFooter=page=>{
    const f=document.createElement('div');
    f.className='pdf-page-footer';
    f.textContent=generatedText||'Gladstone Fire / EMS AED Inventory & Quarterly Audit';
    page.appendChild(f);
  };

  if(executive){
    const p=makePage('cover');
    const x=executive.cloneNode(true);
    x.style.pageBreakAfter='auto';
    x.style.breakAfter='auto';
    p.appendChild(x);
    appendPageFooter(p);
  }

  aedSections.forEach(sec=>{
    const p=makePage('aed');
    const x=sec.cloneNode(true);
    x.style.margin='0';
    x.style.breakInside='auto';
    x.style.pageBreakInside='auto';
    p.appendChild(x);
    appendPageFooter(p);
  });

  if(att||sig){
    const p=makePage('cert');
    if(att)p.appendChild(att.cloneNode(true));
    if(sig)p.appendChild(sig.cloneNode(true));
    appendPageFooter(p);
  }

  const pages=[...mount.querySelectorAll('.pdf-capture-page')];
  if(!pages.length){mount.remove();throw new Error('No report pages were available to render.');}

  try{
    const imgs=[...mount.querySelectorAll('img')];
    await Promise.all(imgs.map(img=>img.complete?Promise.resolve():new Promise(r=>{img.onload=r;img.onerror=r})));

    const doc=new JsPDF({unit:'in',format:'letter',orientation:'portrait',compress:true});
    const pageW=8.5,pageH=11,margin=.26,maxW=pageW-margin*2,maxH=pageH-margin*2;

    for(let i=0;i<pages.length;i++){
      const node=pages[i];
      const canvas=await capture(node,{scale:2,useCORS:true,allowTaint:true,backgroundColor:'#ffffff',logging:false,scrollX:0,scrollY:0,windowWidth:960,width:node.scrollWidth,height:node.scrollHeight});
      const data=canvas.toDataURL('image/jpeg',0.985);
      const aspect=canvas.width/canvas.height;
      let w=maxW,h=w/aspect;
      if(h>maxH){h=maxH;w=h*aspect}
      const x=(pageW-w)/2,y=margin;
      if(i>0)doc.addPage();
      doc.addImage(data,'JPEG',x,y,w,h,undefined,'FAST');
      doc.setFont('helvetica','normal');doc.setFontSize(7.5);doc.setTextColor(104,123,138);
      doc.text('Page '+(i+1)+' of '+pages.length,pageW-margin-.72,pageH-.13);
    }

    const blob=doc.output('blob');
    if(!blob||blob.size<1500)throw new Error('The PDF rendered empty. Please try again.');
    return blob;
  }finally{
    mount.remove();
  }
}
async function previewGeneratedPdf(source,filename){
  if(window.GFDAEDPdfExporter?.previewPdf){
    return window.GFDAEDPdfExporter.previewPdf();
  }
  const blob=await reportPdfBlob(source,filename),url=URL.createObjectURL(blob);
  let dlg=$id('pdfPreviewDlg');
  if(!dlg){dlg=document.createElement('dialog');dlg.id='pdfPreviewDlg';dlg.style.width='min(98vw,1100px)';dlg.style.maxWidth='1100px';dlg.style.height='94vh';dlg.style.padding='0';dlg.innerHTML='<div style="display:flex;flex-direction:column;height:100%"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid #d9e3ea;background:#fff"><div><b style="color:#123a5a">PDF Preview</b><div style="font-size:.82rem;color:#687b8a">Matches the generated report layout.</div></div><button type="button" id="pdfPreviewClose">Close</button></div><iframe id="pdfPreviewFrame" title="AED PDF preview" style="width:100%;flex:1;border:0;background:#f4f7f9"></iframe></div>';document.body.appendChild(dlg);dlg.querySelector('#pdfPreviewClose').onclick=()=>dlg.close();dlg.addEventListener('close',()=>{const f=dlg.querySelector('#pdfPreviewFrame');if(f){const old=f.dataset.url;if(old){URL.revokeObjectURL(old);delete f.dataset.url}f.src='about:blank'}})}
  const frame=dlg.querySelector('#pdfPreviewFrame'),old=frame.dataset.url;if(old)URL.revokeObjectURL(old);frame.src=url;frame.dataset.url=url;dlg.showModal()
}
async function saveReportPdf(source,filename){
  if(window.GFDAEDPdfExporter?.openPdf){
    return window.GFDAEDPdfExporter.openPdf();
  }
  const blob=await reportPdfBlob(source,filename),url=URL.createObjectURL(blob);window.open(url,'_blank');setTimeout(()=>URL.revokeObjectURL(url),120000)
}
async function shareReportPdf(source,filename,title,summary){
  if(window.GFDAEDPdfExporter?.sharePdf){
    return window.GFDAEDPdfExporter.sharePdf();
  }
  const blob=await reportPdfBlob(source,filename);if(window.GFDAEDPdfV2?.shareElement&&source instanceof Element)return window.GFDAEDPdfV2.shareElement(source,filename,title,summary);const url=URL.createObjectURL(blob);window.open(url,'_blank');setTimeout(()=>URL.revokeObjectURL(url),300000)
}
function reportSection(a,year,quarter){const checks=periodChecks(a,year,quarter),deps=(a.deps||[]).filter(d=>periodDate(d.date,year,quarter)).sort((x,y)=>String(y.date||'').localeCompare(String(x.date||'')));const audit=(db.audit||[]).filter(e=>e.id===a.id&&periodDate(e.time,year,quarter)&&/Status Change|Return|Deployment/i.test(e.type||'')).sort((x,y)=>String(y.time||'').localeCompare(String(x.time||'')));const checkRows=checks.length?checks.map(c=>'<tr><td>'+dateFmt(c.date)+'</td><td>'+safe(c.inspector||'N/A')+(c.employeeNumber?' · #'+safe(c.employeeNumber):'')+'</td><td>'+safe(c.auditResult||c.status||'Completed')+'</td></tr><tr class="inspection-comment-row"><td colspan="3"><b>Inspection Comments:</b> '+safe(c.notes||'None documented')+'</td></tr>').join(''):'<tr><td colspan="3">No quarterly inspection recorded.</td></tr>';const depRows=deps.length?deps.map(d=>'<tr><td>'+dateFmt(d.date)+'</td><td>'+safe(d.report||d.agencyReport||'N/A')+'</td><td>'+(d.shock?'Shock delivered':'No shock')+(d.adultPadsUsed?' · Adult pads used':'')+(d.pediatricPadsUsed?' · Pediatric pads used':'')+(d.rts?' · Returned to service':'')+'</td></tr>').join(''):'<tr><td colspan="3">No deployments recorded.</td></tr>';const auditRows=audit.length?audit.map(e=>'<tr><td>'+dateFmt(String(e.time||'').slice(0,10))+'</td><td>'+safe(e.type)+'</td><td>'+safe(e.detail||'')+'</td></tr>').join(''):'<tr><td colspan="3">No status/return-to-service events recorded.</td></tr>';return '<section class="report-box" style="margin:0 0 18px;break-inside:avoid"><h2 style="margin:0;color:#123a5a">'+safe(a.location)+(a.descriptor?' — '+safe(a.descriptor):'')+'</h2><p class="muted" style="margin:4px 0 12px">Serial: '+safe(a.serial)+' · Group: '+safe(a.group||'Unassigned')+' · Current Status: '+status(a)+'</p><div class="report-grid"><div class="report-box"><h3>Current Components</h3><div class="kv"><b>Adult Pads</b><div>'+dateFmt(a.adult)+'</div></div>'+(reportHasPediatricPads(a)?'<div class="kv"><b>Pediatric Pads</b><div>'+dateFmt(a.ped)+'</div></div>':'')+'<div class="kv"><b>Battery</b><div>'+dateFmt(a.battery)+'</div></div></div><div class="report-box"><h3>Quarterly Inspection</h3><table class="summary-table"><thead><tr><th>Date</th><th>Inspector</th><th>Result</th></tr></thead><tbody>'+checkRows+'</tbody></table></div></div><h3>Deployments</h3><table class="summary-table"><thead><tr><th>Date</th><th>Report #</th><th>Event</th></tr></thead><tbody>'+depRows+'</tbody></table><h3>Status / Return-to-Service History</h3><table class="summary-table"><thead><tr><th>Date</th><th>Event</th><th>Details</th></tr></thead><tbody>'+auditRows+'</tbody></table></section>'}
function buildQuarterlyPacketMarkup(year,quarter,sig){
  const units=tracked().slice().sort((a,b)=>canonicalGroup(a).localeCompare(canonicalGroup(b))||String(a.location||'').localeCompare(String(b.location||''))||String(a.descriptor||'').localeCompare(String(b.descriptor||''))||String(a.serial||'').localeCompare(String(b.serial||'')));
  const title='AED Quarterly Program Report',scope='All Tracked AEDs',subtitle='Gladstone Fire / EMS · Q'+quarter+' '+year,generated='Generated '+new Date().toLocaleString()+'.';
  const cover=coverPage(title,subtitle,scope,year,quarter,units.length,generated);
  const exec=executiveSummaryPage(units,year,quarter,'selected','',title,subtitle,generated);
  const groupedUnits=[];
  units.forEach(a=>{const group=canonicalGroup(a);let bucket=groupedUnits.find(x=>x.group===group);if(!bucket){bucket={group,items:[]};groupedUnits.push(bucket)}bucket.items.push(a)});
  const details=groupedUnits.map(bucket=>'<section class="packet-group-source" data-group="'+safe(bucket.group)+'"><div class="packet-group-page-header">'+pageHeaderHTML(title,scope,year,quarter,'AED DETAIL · Group: '+bucket.group)+'</div><div class="packet-group-banner"><span>GROUP</span><b>'+safe(bucket.group)+'</b></div><div class="packet-group-entries">'+bucket.items.map(a=>'<div class="packet-aed-entry" data-aed-id="'+safe(a.id)+'">'+reportSection(a,year,quarter)+'</div>').join('')+'</div><div class="packet-group-page-footer">'+packetFooterHTML(generated)+'</div></section>').join('');
  const cert='<section class="packet-page packet-cert-page">'+pageHeaderHTML(title,scope,year,quarter,'CERTIFICATION & ATTESTATION · Q'+quarter+' '+year)+'<div class="packet-cert-body">'+(typeof certificationAttestationHTML==='function'?certificationAttestationHTML():'')+(typeof overallSignatureHTML==='function'?overallSignatureHTML(sig):'')+'<p class="packet-cert-note">This certification page marks the end of the certified quarterly report packet.</p></div>'+packetFooterHTML(generated)+'</section>';
  return '<div class="report-sheet packet-report unified-report-format" id="generatedReportSheet">'+cover+exec+details+cert+'</div>';
}

function annualDateRange(year){return 'January 1, '+year+' – December 31, '+year}
function annualHealthData(units,year){
  let oos=0,retired=0,expired=0,due30=0,due180=0,missing=0,deployments=0,shocks=0,issues=[],failures=[],eligible=0,passing=0,totalQuarterChecks=0;
  units.forEach(a=>{
    const label=a.location+(a.descriptor?' — '+a.descriptor:'');
    const state=String(a.status||'In Service');
    const knownInactive=/removed\s*\/\s*retired|retired|destroyed|beyond repair|end[- ]?of[- ]?life/i.test(state);
    let unitPass=true;
    if(knownInactive){retired++}
    else{
      eligible++;
      if(state!=='In Service'){oos++;unitPass=false;const msg=label+': '+state;issues.push(msg);failures.push(msg)}
      components(a).forEach(comp=>{
        const d=daysTo(comp.date);
        if(d===null){missing++;unitPass=false;issues.push(label+': '+comp.name+' expiration not recorded')}
        else if(d<0){expired++;unitPass=false;const msg=label+': '+comp.name+' expired '+dateFmt(comp.date);issues.push(msg);failures.push(msg)}
        else if(d<=30){due30++;due180++;issues.push(label+': '+comp.name+' expires in '+d+' day'+(d===1?'':'s')+' ('+dateFmt(comp.date)+')')}
        else if(d<=180){due180++}
      });
      let completeQuarters=0,quarterIssue=false;
      for(let qtr=1;qtr<=4;qtr++){
        const checks=periodChecks(a,year,qtr);
        if(checks.length){
          totalQuarterChecks++;completeQuarters++;
          const latest=checks[0];
          if(String(latest.auditResult||'').toLowerCase()==='issues found')quarterIssue=true;
          if(String(latest.status||state)!=='In Service'){quarterIssue=true}
        }
      }
      if(year!==2026&&completeQuarters<4){unitPass=false;issues.push(label+': '+completeQuarters+'/4 quarterly inspections completed')}
      if(year===2026&&completeQuarters<4){issues.push(label+': '+completeQuarters+'/4 quarterly inspections recorded · 2026 implementation-year history may be incomplete')}
      if(quarterIssue){unitPass=false;issues.push(label+': one or more recorded quarterly inspections documented issues')}
      if(unitPass)passing++;
    }
    (a.deps||[]).filter(d=>String(d.date||'').startsWith(String(year)+'-')).forEach(d=>{deployments++;if(d.shock)shocks++});
  });
  const healthPct=eligible?Math.round((passing/eligible)*100):100;
  const health=healthPct>=95?'GOOD':healthPct>=90?'NEEDS ATTENTION':'CRITICAL';
  const healthText=year===2026
    ?(healthPct>=95
      ?'2026 is an implementation-year report. The health grade reflects current readiness and recorded 2026 findings; missing pre-implementation quarterly history is not scored as a deficiency.'
      :healthPct>=90
        ?'2026 is an implementation-year report. Recorded readiness findings place the program below 95%; missing pre-implementation quarterly history is not scored as a deficiency.'
        :'2026 is an implementation-year report. Recorded readiness findings place the program below 90%; missing pre-implementation quarterly history is not scored as a deficiency.')
    :healthPct>=95
      ?(healthPct===100?'All evaluated AEDs meet annual readiness criteria with no identified readiness deficiencies.':'Overall annual readiness remains in the green range at 95% or greater.')
      :healthPct>=90?'Overall annual readiness is below 95% and requires attention.':'Overall annual readiness is below 90% and requires corrective action.';
  return {oos,retired,expired,due30,due180,missing,deployments,shocks,issues:[...new Set(issues)],failures:[...new Set(failures)],eligible,passing,healthPct,health,healthText,totalQuarterChecks}
}
function annualCoverPage(title,subtitle,scope,year,count,generated){
  return '<section class="packet-page packet-cover-page">'+
    '<div class="packet-cover-hero"><img class="packet-cover-logo" src="gfd-patch.jpg" alt="Gladstone Fire EMS"><div class="packet-kicker">GLADSTONE FIRE / EMS</div><h1>'+safe(title)+'</h1><p class="packet-cover-subtitle">'+safe(subtitle)+'</p><p class="packet-cover-range">'+safe(annualDateRange(year))+'</p></div>'+
    '<div class="packet-cover-body"><p class="packet-cover-description">Annual program report summarizing AED readiness, quarterly inspection completion, component expirations, deployments, status changes and documented return-to-service activity across the full calendar year.</p>'+
    (year===2026?'<div class="report-box annual-partial-data-note"><h3>2026 Implementation-Year Data Notice</h3><p>This AED management system was implemented during 2026. Before implementation, AED checks were tracked through a legacy spreadsheet-based process that provided limited standardization, minimal procedural guidance, and no integrated audit trail for consistently documenting individual inspections, findings, signatures, or follow-up actions. As a result, detailed pre-implementation inspection records are not available in the current application. The certifying Battalion Chief attests that all AEDs were physically tested prior to implementation and passed operational readiness checks. The limitation in historical detail reflects the capabilities of the prior recordkeeping process and the transition to a more structured system, not an identified readiness failure. The 2026 annual health grade is based on current readiness and the records actually captured in the system.</p></div>':'')+
    '<div class="report-grid packet-cover-grid"><div class="report-box"><h3>Report Information</h3><div class="kv"><b>Scope</b><div>'+safe(scope)+'</div></div><div class="kv"><b>Reporting Period</b><div>'+year+'</div></div><div class="kv"><b>Date Range</b><div>'+safe(annualDateRange(year))+'</div></div><div class="kv"><b>AEDs Included</b><div>'+count+'</div></div></div>'+
    '<div class="report-box"><h3>Packet Structure</h3><div class="kv"><b>Page 2</b><div>Executive Summary & Annual Health</div></div><div class="kv"><b>Following Pages</b><div>Quarterly performance and AED detail</div></div><div class="kv"><b>Final Report Page</b><div>Certification & Attestation</div></div></div></div></div>'+
    packetFooterHTML(generated)+'</section>'
}
function annualExecutiveSummaryPage(units,year,title,scope,generated){
  const h=annualHealthData(units,year),healthClass=h.health==='CRITICAL'?'health-critical':h.health==='NEEDS ATTENTION'?'health-attention':'health-good';
  const quarterRows=[1,2,3,4].map(qtr=>{
    const completed=units.filter(a=>periodChecks(a,year,qtr).length).length;
    const issues=units.filter(a=>{const x=periodChecks(a,year,qtr)[0];return x&&String(x.auditResult||'').toLowerCase()==='issues found'}).length;
    return '<div class="kv"><b>Q'+qtr+'</b><div>'+completed+' / '+units.length+' complete'+(issues?' · '+issues+' with issues':'')+'</div></div>'
  }).join('');
  const failureBlock=h.failures.length?'<div class="report-box critical-findings"><h3>Critical Findings</h3><ul>'+h.failures.slice(0,8).map(x=>'<li>'+safe(x)+'</li>').join('')+(h.failures.length>8?'<li>+'+(h.failures.length-8)+' additional critical item(s).</li>':'')+'</ul></div>':'';
  const attentionBlock=h.issues.length?'<div class="report-box"><h3>Annual Attention Items</h3><ul>'+h.issues.slice(0,10).map(x=>'<li>'+safe(x)+'</li>').join('')+(h.issues.length>10?'<li>+'+(h.issues.length-10)+' additional item(s) detailed in this report.</li>':'')+'</ul></div>':'<div class="report-box"><h3>Annual Attention Items</h3><p>None identified from the recorded inventory data.</p></div>';
  return '<section class="packet-page packet-executive-page">'+
    '<div class="report-header packet-header"><img src="gfd-patch.jpg" alt="Gladstone Fire EMS"><div class="report-title"><div class="packet-header-kicker">GLADSTONE FIRE / EMS · AED REPORT</div><h1>'+safe(title)+'</h1><p><b>Scope:</b> '+safe(scope)+' · <b>Period:</b> '+year+' · '+safe(annualDateRange(year))+'</p><p class="packet-page-id">Executive Summary & Annual Health</p></div></div>'+
    '<div class="exec-summary packet-exec"><h2>Executive Summary</h2><p><b>Scope:</b> '+safe(scope)+' · '+year+' · '+units.length+' AED'+(units.length===1?'':'s')+'</p>'+
    (year===2026?'<div class="report-box annual-partial-data-note"><h3>Partial Historical Coverage / Readiness Attestation</h3><p>2026 is the implementation year. Prior to implementation, AED checks were maintained through a legacy spreadsheet-based process with limited standardization, minimal inspection guidance, and no integrated audit trail for consistently preserving detailed inspection findings and follow-up actions. Detailed pre-implementation quarterly records therefore are not available in this system. The certifying Battalion Chief attests that all AEDs were physically tested before implementation and passed operational readiness checks. Missing pre-implementation detail is excluded from health scoring. Recorded deficiencies, current out-of-service status, expired components, missing required expiration dates, and documented inspection issues still affect the health grade.</p></div>':'')+
    '<div class="report-grid"><div class="report-box"><h3>Overall Health</h3><div class="health '+healthClass+' packet-health">'+safe(h.health)+' · '+h.healthPct+'%</div><p>'+safe(h.healthText)+'</p></div>'+
    '<div class="report-box"><h3>Quarterly Completion</h3>'+quarterRows+'</div></div>'+
    '<div class="report-grid"><div class="report-box"><h3>Readiness</h3><div class="kv"><b>Out of service</b><div>'+h.oos+'</div></div><div class="kv"><b>Retired / end-of-life</b><div>'+h.retired+'</div></div><div class="kv"><b>Expired components</b><div>'+h.expired+'</div></div><div class="kv"><b>Expiration ≤30 days</b><div>'+h.due30+'</div></div><div class="kv"><b>Expiration 31–180 days</b><div>'+Math.max(0,h.due180-h.due30)+'</div></div><div class="kv"><b>Missing expiration dates</b><div>'+h.missing+'</div></div></div>'+
    '<div class="report-box"><h3>Annual Activity</h3><div class="kv"><b>Quarterly inspections</b><div>'+h.totalQuarterChecks+'</div></div><div class="kv"><b>Deployments</b><div>'+h.deployments+'</div></div><div class="kv"><b>Shock-delivery events</b><div>'+h.shocks+'</div></div></div></div>'+
    failureBlock+attentionBlock+
    '<p class="muted" style="margin-top:10px">Annual health uses the same report grading thresholds as quarterly reports: 95–100% Good, 90–94% Needs Attention, below 90% Critical.</p></div>'+
    packetFooterHTML(generated)+'</section>'
}
function annualReportSection(a,year){
  const quarters=[1,2,3,4].map(qtr=>{
    const checks=periodChecks(a,year,qtr),latest=checks[0]||null;
    return {q:qtr,check:latest,all:checks};
  });
  const completed=quarters.filter(x=>x.check).length;
  const issueChecks=quarters.filter(x=>x.check&&String(x.check.auditResult||'').toLowerCase()==='issues found').length;
  const oosChecks=quarters.filter(x=>x.check&&String(x.check.status||a.status||'In Service')!=='In Service').length;
  const deps=(a.deps||[]).filter(d=>String(d.date||'').startsWith(String(year)+'-')).sort((x,y)=>String(y.date||'').localeCompare(String(x.date||'')));
  const shocks=deps.filter(d=>d.shock).length;
  const rts=deps.filter(d=>d.rts).length;
  const audit=(db.audit||[]).filter(e=>e.id===a.id&&String(e.time||'').startsWith(String(year)+'-')&&/Status Change|Return|Deployment/i.test(e.type||'')).sort((x,y)=>String(y.time||'').localeCompare(String(x.time||'')));
  const implementationYear=year===2026;
  const annualReady=String(a.status||'In Service')==='In Service'&&!hasExpiredComponent(a)&&(implementationYear||completed===4)&&issueChecks===0&&oosChecks===0;
  const annualHealth=annualReady?'GOOD':((implementationYear||completed>=3)&&String(a.status||'In Service')==='In Service'&&!hasExpiredComponent(a)?'NEEDS ATTENTION':'CRITICAL');
  const annualClass=annualHealth==='CRITICAL'?'health-critical':annualHealth==='NEEDS ATTENTION'?'health-attention':'health-good';
  const quarterRows=quarters.map(x=>{
    const ch=x.check;
    return '<tr><td><b>Q'+x.q+'</b></td><td>'+(ch?dateFmt(ch.date):(implementationYear?'<span class="muted">Pre-implementation · detailed record unavailable</span>':'<span class="bad">Not completed</span>'))+'</td><td>'+(ch?safe(ch.inspector||'N/A')+(ch.employeeNumber?' · #'+safe(ch.employeeNumber):''):'—')+'</td><td>'+(ch?safe(ch.auditResult||ch.status||'Completed'):(implementationYear?'Attested passed':'—'))+'</td><td>'+(ch?safe(ch.notes||'None documented'):(implementationYear?'Operational readiness tested and passed prior to system implementation; detailed quarterly record unavailable.':'—'))+'</td></tr>'
  }).join('');
  const depRows=deps.length?deps.map(d=>'<tr><td>'+dateFmt(d.date)+'</td><td>'+safe(d.report||d.agencyReport||'N/A')+'</td><td>'+[(d.shock?'Shock delivered':'No shock'),d.adultPadsUsed?'Adult pads used':'',d.pediatricPadsUsed?'Pediatric pads used':'',d.rts?'Returned to service'+(d.rtsDate?' '+dateFmt(d.rtsDate):''):'',d.notes?safe(d.notes):''].filter(Boolean).join(' · ')+'</td></tr>').join(''):'<tr><td colspan="3">No deployments recorded.</td></tr>';
  const statusRows=audit.length?audit.map(e=>'<tr><td>'+dateFmt(String(e.time||'').slice(0,10))+'</td><td>'+safe(e.type||'Event')+'</td><td>'+safe(e.detail||'')+'</td></tr>').join(''):'<tr><td colspan="3">No status or return-to-service events recorded.</td></tr>';
  const summaryText=annualReady
    ?(implementationYear
      ?'This AED is currently in service with required components in date and no documented readiness issue in the 2026 records available to this system. Missing pre-implementation quarterly history is not treated as a failure.'
      :'This AED completed all four quarterly inspections without documented inspection issues and is currently in service with required components in date.')
    :annualHealth==='NEEDS ATTENTION'
      ?(implementationYear
        ?'This AED has one or more documented 2026 readiness or inspection items requiring attention. Missing pre-implementation quarterly history is not part of this determination.'
        :'This AED remained generally serviceable during the year but has one or more annual documentation or readiness items requiring attention.')
      :(implementationYear
        ?'This AED has a documented 2026 readiness deficiency based on current status, component condition, or a recorded inspection issue. Missing pre-implementation quarterly history is not the cause of this grade.'
        :'This AED has an annual readiness deficiency because of incomplete quarterly inspections, an out-of-service condition, expired required components, or documented inspection issues.');
  return '<section class="report-box annual-aed-summary" style="margin:0;break-inside:avoid">'+
    '<div class="annual-aed-head"><div><h2 style="margin:0;color:#123a5a">'+safe(a.location)+(a.descriptor?' — '+safe(a.descriptor):'')+'</h2><p class="muted" style="margin:4px 0 0">Serial: '+safe(a.serial)+' · Group: '+safe(canonicalGroup(a))+'</p></div><div class="health '+annualClass+'">'+safe(annualHealth)+'</div></div>'+
    '<div class="report-grid annual-aed-overview"><div class="report-box"><h3>Year-End Readiness</h3><div class="kv"><b>Current Status</b><div>'+status(a)+'</div></div><div class="kv"><b>Quarterly Checks</b><div>'+completed+' / 4</div></div><div class="kv"><b>Inspections With Issues</b><div>'+issueChecks+'</div></div><div class="kv"><b>Out-of-Service Inspection Statuses</b><div>'+oosChecks+'</div></div></div>'+
    '<div class="report-box"><h3>Annual Activity</h3><div class="kv"><b>Deployments</b><div>'+deps.length+'</div></div><div class="kv"><b>Shock Events</b><div>'+shocks+'</div></div><div class="kv"><b>Returns to Service</b><div>'+rts+'</div></div><div class="kv"><b>Status / RTS Events</b><div>'+audit.length+'</div></div></div></div>'+
    '<div class="report-box annual-health-note"><h3>Annual Readiness Summary</h3><p>'+safe(summaryText)+'</p></div>'+
    '<div class="report-box"><h3>Quarterly Inspection History</h3><table class="summary-table annual-quarter-table"><thead><tr><th>Quarter</th><th>Date</th><th>Inspector</th><th>Result</th><th>Comments</th></tr></thead><tbody>'+quarterRows+'</tbody></table></div>'+
    '<div class="report-grid"><div class="report-box"><h3>Current Components</h3><div class="kv"><b>Adult Pads</b><div>'+dateFmt(a.adult)+'</div></div>'+(reportHasPediatricPads(a)?'<div class="kv"><b>Pediatric Pads</b><div>'+dateFmt(a.ped)+'</div></div>':'')+'<div class="kv"><b>Battery</b><div>'+dateFmt(a.battery)+'</div></div></div>'+
    '<div class="report-box"><h3>Deployment History</h3><table class="summary-table"><thead><tr><th>Date</th><th>Report #</th><th>Event</th></tr></thead><tbody>'+depRows+'</tbody></table></div></div>'+
    '<div class="report-box"><h3>Status / Return-to-Service History</h3><table class="summary-table"><thead><tr><th>Date</th><th>Event</th><th>Details</th></tr></thead><tbody>'+statusRows+'</tbody></table></div>'+
  '</section>'
}
function buildAnnualPacketMarkup(year,sig){
  const units=tracked().slice().sort((a,b)=>canonicalGroup(a).localeCompare(canonicalGroup(b))||String(a.location||'').localeCompare(String(b.location||''))||String(a.descriptor||'').localeCompare(String(b.descriptor||''))||String(a.serial||'').localeCompare(String(b.serial||'')));
  const title='AED Annual Program Report',scope='All Tracked AEDs',subtitle='Gladstone Fire / EMS · Annual Summary · '+year,generated='Generated '+new Date().toLocaleString()+'.';
  const cover=annualCoverPage(title,subtitle,scope,year,units.length,generated);
  const exec=annualExecutiveSummaryPage(units,year,title,scope,generated);
  const grouped=[];units.forEach(a=>{const group=canonicalGroup(a);let bucket=grouped.find(x=>x.group===group);if(!bucket){bucket={group,items:[]};grouped.push(bucket)}bucket.items.push(a)});
  const details=grouped.map(bucket=>'<section class="packet-group-source" data-group="'+safe(bucket.group)+'"><div class="packet-group-page-header"><div class="report-header packet-header"><img src="gfd-patch.jpg" alt="Gladstone Fire EMS"><div class="report-title"><div class="packet-header-kicker">GLADSTONE FIRE / EMS · AED REPORT</div><h1>'+safe(title)+'</h1><p><b>Scope:</b> '+safe(scope)+' · <b>Period:</b> '+year+' · '+safe(annualDateRange(year))+'</p><p class="packet-page-id">AED DETAIL · Group: '+safe(bucket.group)+'</p></div></div></div><div class="packet-group-banner"><span>GROUP</span><b>'+safe(bucket.group)+'</b></div><div class="packet-group-entries">'+bucket.items.map(a=>'<div class="packet-aed-entry" data-aed-id="'+safe(a.id)+'">'+annualReportSection(a,year)+'</div>').join('')+'</div><div class="packet-group-page-footer">'+packetFooterHTML(generated)+'</div></section>').join('');
  const implementationAttestation=year===2026?'<div class="report-box annual-implementation-attestation"><h3>2026 Implementation Readiness Attestation</h3><p>I attest that, prior to implementation of this digital AED management system, all AEDs included in this program were physically tested and passed operational readiness checks. Before this system was placed into service, AED checks were documented through a legacy spreadsheet-based process that offered limited standardization, minimal procedural guidance, and no integrated audit trail for consistently preserving detailed inspection findings, signatures, or follow-up actions. Accordingly, detailed pre-implementation inspection records are not available in the current system. This attestation addresses readiness status only and does not create or reconstruct inspection dates, signatures, findings, or other historical details that were not captured at the time.</p></div>':'';
  const cert='<section class="packet-page packet-cert-page"><div class="report-header packet-header"><img src="gfd-patch.jpg" alt="Gladstone Fire EMS"><div class="report-title"><div class="packet-header-kicker">GLADSTONE FIRE / EMS · AED REPORT</div><h1>'+safe(title)+'</h1><p><b>Scope:</b> '+safe(scope)+' · <b>Period:</b> '+year+' · '+safe(annualDateRange(year))+'</p><p class="packet-page-id">CERTIFICATION & ATTESTATION · '+year+'</p></div></div><div class="packet-cert-body">'+implementationAttestation+(typeof certificationAttestationHTML==='function'?certificationAttestationHTML():'')+(typeof overallSignatureHTML==='function'?overallSignatureHTML(sig):'')+'<p class="packet-cert-note">This certification page marks the end of the certified annual report packet.</p></div>'+packetFooterHTML(generated)+'</section>';
  return '<div class="report-sheet packet-report unified-report-format annual-report-format" id="generatedReportSheet">'+cover+exec+details+cert+'</div>';
}
window.GFDAEDReportBuilder=Object.assign(window.GFDAEDReportBuilder||{},{buildQuarterlyPacketMarkup,buildAnnualPacketMarkup});

function build(){
  const units=choose().slice().sort((a,b)=>canonicalGroup(a).localeCompare(canonicalGroup(b))||String(a.location||'').localeCompare(String(b.location||''))||String(a.descriptor||'').localeCompare(String(b.descriptor||''))||String(a.serial||'').localeCompare(String(b.serial||'')));if(!units.length){alert('Select at least one AED.');return}
  const sig=typeof overallReportSignature==='function'?overallReportSignature(true):null;if(!sig)return;
  const {year,quarter}=period(),mode=$id('musterMode').value,groupName=mode==='group'?($id('musterGroup')?.value||'Unassigned'):'',
    scope=mode==='group'?groupName:mode==='individual'?(units[0].location+(units[0].descriptor?' — '+units[0].descriptor:'')):'Selected AEDs',
    title=mode==='group'?groupName+' AED Report':mode==='individual'?'Individual AED History':'Selected AED Report',
    subtitle=mode==='group'?'Gladstone Fire / EMS · Group: '+groupName+' · Q'+quarter+' '+year: 'Gladstone Fire / EMS · Q'+quarter+' '+year;
  const area=$id('reportPrintArea');if(!area){alert('Report print area is unavailable.');return}
  const generated='Generated '+new Date().toLocaleString()+'.';
  const cover=coverPage(title,subtitle,scope,year,quarter,units.length,generated);
  const exec=executiveSummaryPage(units,year,quarter,mode,groupName,title,subtitle,generated);
  const groupedUnits=[];units.forEach(a=>{const group=canonicalGroup(a);let bucket=groupedUnits.find(x=>x.group===group);if(!bucket){bucket={group,items:[]};groupedUnits.push(bucket)}bucket.items.push(a)});
  const details=groupedUnits.map(bucket=>'<section class="packet-group-source" data-group="'+safe(bucket.group)+'"><div class="packet-group-page-header">'+pageHeaderHTML(title,scope,year,quarter,'AED DETAIL · Group: '+bucket.group)+'</div><div class="packet-group-banner"><span>GROUP</span><b>'+safe(bucket.group)+'</b></div><div class="packet-group-entries">'+bucket.items.map(a=>'<div class="packet-aed-entry" data-aed-id="'+safe(a.id)+'">'+reportSection(a,year,quarter)+'</div>').join('')+'</div><div class="packet-group-page-footer">'+packetFooterHTML(generated)+'</div></section>').join('');
  const cert='<section class="packet-page packet-cert-page">'+pageHeaderHTML(title,scope,year,quarter,'CERTIFICATION & ATTESTATION · Certifies: '+scope+' · Q'+quarter+' '+year)+'<div class="packet-cert-body">'+(typeof certificationAttestationHTML==='function'?certificationAttestationHTML():'')+(typeof overallSignatureHTML==='function'?overallSignatureHTML(sig):'')+'<p class="packet-cert-note">This certification page marks the end of the certified report body. Any page appended after this page is considered Appendix / Supporting Documentation.</p></div>'+packetFooterHTML(generated)+'</section>';
  const appendix='';
  const slug=String(mode==='group'?groupName:title).replace(/[^a-z0-9]+/ig,'-').replace(/^-+|-+$/g,'').toLowerCase()||'aed-report',
    pdfFilename=slug+'-q'+quarter+'-'+year+'.pdf',summary=title+' · Q'+quarter+' '+year+' · '+units.length+' AED'+(units.length===1?'':'s');
  const actionBar='<div class="report-toolbar report-toolbar-dual"><button type="button" class="primary muster-preview-pdf">Preview PDF</button><button type="button" class="muster-save-pdf">Save PDF</button><button type="button" class="muster-open-pdf">Print / Open PDF</button><button type="button" class="muster-share-pdf">Share PDF</button><button type="button" class="muster-close-report">Close</button></div>';
  area.innerHTML='<div class="report-sheet packet-report" id="generatedReportSheet">'+actionBar+cover+exec+details+cert+appendix+actionBar+'</div>';
  area.style.display='block';document.querySelectorAll('main>.view').forEach(v=>v.style.display='none');area.scrollIntoView({behavior:'smooth',block:'start'});
  const sheet=$id('generatedReportSheet');
  sheet.querySelectorAll('.muster-preview-pdf').forEach(b=>b.onclick=async()=>{const buttons=[...sheet.querySelectorAll('.muster-preview-pdf')];buttons.forEach(x=>{x.disabled=true;x.textContent='Building Preview…'});try{await window.GFDAEDPdfV2.previewElement(sheet,pdfFilename,title,summary)}catch(e){alert(e.message||'Unable to preview PDF.')}finally{buttons.forEach(x=>{x.disabled=false;x.textContent='Preview PDF'})}});
  sheet.querySelectorAll('.muster-open-pdf').forEach(b=>b.onclick=async()=>{const buttons=[...sheet.querySelectorAll('.muster-open-pdf')];buttons.forEach(x=>{x.disabled=true;x.textContent='Creating PDF…'});try{await window.GFDAEDPdfV2.openElement(sheet,pdfFilename)}catch(e){alert(e.message||'Unable to create PDF.')}finally{buttons.forEach(x=>{x.disabled=false;x.textContent='Print / Open PDF'})}});
  sheet.querySelectorAll('.muster-save-pdf').forEach(b=>b.onclick=async()=>{const buttons=[...sheet.querySelectorAll('.muster-save-pdf')];buttons.forEach(x=>{x.disabled=true;x.textContent='Saving PDF…'});try{await window.GFDAEDPdfV2.saveElement(sheet,pdfFilename)}catch(e){alert(e.message||'Unable to save PDF.')}finally{buttons.forEach(x=>{x.disabled=false;x.textContent='Save PDF'})}});
  sheet.querySelectorAll('.muster-share-pdf').forEach(b=>b.onclick=async()=>{const buttons=[...sheet.querySelectorAll('.muster-share-pdf')];buttons.forEach(x=>{x.disabled=true;x.textContent='Preparing PDF…'});try{await window.GFDAEDPdfV2.shareElement(sheet,pdfFilename,title,summary)}catch(e){if(!e||e.name!=='AbortError')alert(e.message||'Unable to share PDF.')}finally{buttons.forEach(x=>{x.disabled=false;x.textContent='Share PDF'})}});
  sheet.querySelectorAll('.muster-close-report').forEach(b=>b.onclick=()=>{area.style.display='none';document.querySelectorAll('main>.view').forEach(v=>v.style.display='');if(typeof goView==='function')goView('reports')})
}
function install(){const sec=$id('reports');if(!sec||$id('musterBuilder'))return;const box=document.createElement('div');box.id='musterBuilder';box.className='card';box.innerHTML='<div class="bar"><div><h2 style="margin:0">Build AED Report</h2><p class="muted" style="margin:3px 0 0">Generate a report for one AED, an entire group, or any selected AEDs.</p></div></div><div class="grid"><label>Report Type<select id="musterMode"><option value="individual">Individual AED</option><option value="group">AED Group</option><option value="selected">Selected AEDs</option></select></label><div id="musterPicker"></div></div><div class="actions"><button type="button" class="primary" id="musterBuild">Generate Report</button></div>';sec.insertBefore(box,sec.firstChild);$id('musterMode').onchange=renderPicker;$id('musterBuild').onclick=build;renderPicker()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();