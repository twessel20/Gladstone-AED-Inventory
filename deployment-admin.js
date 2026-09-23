(()=>{
  function install(){
    if(typeof db==='undefined'||typeof deps!=='function') return;
    const originalDeps=deps;
    window.deleteDeploymentRecord=(aedId,index)=>{
      const a=db.aeds.find(x=>x.id===aedId);
      if(!a||!Array.isArray(a.deps)||!a.deps[index]) return;
      const d=a.deps[index];
      const label=[d.date?fmt(d.date):'',d.report?'Report # '+d.report:'',d.shock?'Shock delivered':''].filter(Boolean).join(' · ');
      if(!confirm('Delete this deployment record?\n\n'+label+'\n\nThis removes the deployment from deployment totals and reports. A correction entry will remain in the audit log.')) return;

      const audit=db.audit||[];
      const matchesDeployment=e=>e&&e.id===aedId&&e.type==='AED Deployment'&&(!d.report||String(e.detail||'').includes(d.report));
      for(let i=audit.length-1;i>=0;i--){if(matchesDeployment(audit[i])){audit.splice(i,1);break}}

      if(d.shock){
        for(let i=audit.length-1;i>=0;i--){
          const e=audit[i];
          if(e&&e.id===aedId&&e.type==='AED Status Change'&&String(e.detail||'').includes('Event data extraction required after shock delivery')){audit.splice(i,1);break}
        }
        if(!d.rts&&String(a.status||'').startsWith('Out of Service')&&String(a.comments||'').includes('Event data extraction required after shock delivery')){
          a.status='In Service';
          a.comments='Deployment record corrected/deleted. AED restored to active status; verify operational readiness before use.';
        }
      }

      a.deps.splice(index,1);
      log('Deployment Record Deleted',aedId,'Deployment record deleted/corrected'+(d.date?' for '+fmt(d.date):'')+(d.report?' · Incident / Report # '+d.report:'')+(d.agency?' · Agency: '+d.agency:'')+(d.agencyReport?' · Agency report: '+d.agencyReport:'')+(d.shock?' · Shock delivered: Yes':'')+'.');
      save();
    };

    deps=function(){
      let all=[];
      db.aeds.forEach(a=>(a.deps||[]).forEach((d,index)=>all.push({a,d,index})));
      all.sort((x,y)=>String(y.d.date||'').localeCompare(String(x.d.date||'')));
      $('deplist').innerHTML=all.map(x=>{let a=x.a,d=x.d;return '<div class="item"><div class="top"><div><b>'+esc(a.location)+'</b><div class="meta">'+fmt(d.date)+' · Report #: '+(d.report||'Not documented')+' · '+esc(d.by||'Not documented')+'</div>'+(d.agency||d.agencyReport?'<div class="meta">Agency: '+esc(d.agency||'Not documented')+' · Report #: '+esc(d.agencyReport||'Not documented')+'</div>':'')+(d.shock&&(d.shockBy||d.shockCityEmployee||d.shockPhone||d.shockContact)?'<div class="meta">Shock delivered by: '+esc(d.shockBy||'Not documented')+(d.shockCityEmployee?' · City employee: '+esc(d.shockCityEmployee):'')+(d.shockPhone?' · Phone: '+esc(d.shockPhone):'')+(d.shockContact?' · '+esc(d.shockContact):'')+'</div>':'')+'</div><button class="bad" onclick="deleteDeploymentRecord(\''+a.id+'\','+x.index+')">Delete</button></div><p>'+[d.shock?'Shock delivered':'',d.eventDataExtracted?'Event data extracted':'',d.pads?'Pads replaced':'',d.battery?'Battery replaced':'',d.rts?'Returned to service'+(d.rtsDate?' '+fmt(d.rtsDate):''):''].filter(Boolean).join(' · ')+'</p>'+(d.notes?'<div class="aed-comment"><b>Notes</b><div class="comment-text">'+esc(d.notes)+'</div></div>':'')+'</div>'}).join('')||'<div class="card muted">No deployments recorded.</div>';
    };
    deps();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install); else install();
})();
