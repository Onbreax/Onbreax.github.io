// Runs inside the application's IIFE so it can safely coordinate with active jobs.
window.addEventListener('council-dictation',event=>{
 const {target,text}=event.detail||{};
 if(!['question','userMsg'].includes(target)||typeof text!=='string')return;
 const el=document.getElementById(target);
 if(!el||el.disabled||(target==='userMsg'&&(JOB.transition||JOB.mode==='conclusion'||JOB.mode==='refine')))return;
 el.value=(el.value.trimEnd()?el.value.trimEnd()+' ':'')+text;
 el.dispatchEvent(new Event('input',{bubbles:true}));el.focus();
});
window.CouncilApp={
 flush(){saveSoon(0);return flushHistory();},
 async exit(){
  try{
   if(JOB.mode==='refine'){refineCtl?.abort();if(JOB.promise)await JOB.promise;}
   else await stopJob();
   saveSoon(0);await flushHistory();CouncilNative.postMessage(JSON.stringify({action:'exit-ready'}));
  }catch(e){storageWarning(e);CouncilNative.postMessage(JSON.stringify({action:'exit-error'}));}
 }
};
