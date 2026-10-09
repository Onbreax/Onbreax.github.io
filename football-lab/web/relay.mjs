// Private, same-origin Football-data.org relay. No key storage or application logs.
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'};
const json=(status,value)=>new Response(JSON.stringify(value),{status,headers});
async function bounded(stream,max){
 if(!stream)throw Error('empty');
 const reader=stream.getReader(),chunks=[];let length=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>max)throw Error('large');chunks.push(value)}}
 catch(e){await reader.cancel().catch(()=>{});throw e}
 finally{reader.releaseLock()}
 const all=new Uint8Array(length);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.byteLength}return new TextDecoder().decode(all);
}
export async function relay(request,{authenticated=false,fetcher=fetch}={}){
 if(!authenticated)return json(419,{error:'Session expirée. Rouvre la version navigateur connectée.'});
 if(request.method!=='POST')return json(405,{error:'Méthode refusée.'});
 const origin=request.headers.get('Origin'),site=request.headers.get('Sec-Fetch-Site');
 if(origin!==new URL(request.url).origin||site&&site!=='same-origin')return json(403,{error:'Origine refusée.'});
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return json(415,{error:'Format refusé.'});
 let input;
 try{input=JSON.parse(await bounded(request.body,1024))}catch{return json(400,{error:'Requête invalide.'})}
 if(!input||Array.isArray(input)||Object.keys(input).some(k=>!['competition','year','key'].includes(k))||!['FL1','PL','PD'].includes(input.competition)||!Number.isInteger(input.year)||input.year<2023||input.year>2100||typeof input.key!=='string'||!/^[A-Za-z0-9_-]{10,128}$/.test(input.key))return json(400,{error:'Paramètres invalides.'});
 try{
  const response=await fetcher('https://api.football-data.org/v4/competitions/'+input.competition+'/matches?season='+input.year,{method:'GET',headers:{'X-Auth-Token':input.key,Accept:'application/json'},redirect:'error',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(18000)});
  if(response.status!==200){await response.body?.cancel();return json(response.status>=400&&response.status<=599?response.status:502,{error:'Football-data.org a refusé la requête.'})}
  const text=await bounded(response.body,2000000),data=JSON.parse(text);
  if(!Array.isArray(data.matches)||data.matches.length>1000||data.competition?.code!==input.competition)throw Error('invalid');
  return json(200,data);
 }catch{return json(502,{error:'Réponse Football-data.org indisponible ou invalide.'})}
}
