import assert from 'node:assert/strict';
import worker,{Tracker} from '../worker/index.mjs';
const realNow=Date.now;let now=1800000000;Date.now=()=>now*1000;
const values=new Map(),storage={get:async k=>structuredClone(values.get(k)),put:async(k,v)=>values.set(k,structuredClone(v)),delete:async keys=>{for(const k of Array.isArray(keys)?keys:[keys])values.delete(k);},list:async o=>new Map([...values].filter(([k])=>k.startsWith(o.prefix)&&(!o.startAfter||k>o.startAfter)).sort(([a],[b])=>a.localeCompare(b)).slice(0,o.limit||1000)),setAlarm:async()=>{},deleteAlarm:async()=>{}};
let obj=new Tracker({storage,blockConcurrencyWhile:f=>f()});const env={ADMIN_TOKEN:'admin-test',OWNTRACKS_PASSWORD:'phone-test',TRACKER:{idFromName:x=>x,get:()=>obj}},admin='Bearer admin-test',phone='Basic '+btoa('runner:phone-test');
const send=(path,data,auth=admin)=>worker.fetch(new Request('https://test.example'+path,{method:data===undefined?'GET':'POST',headers:{Authorization:auth},body:data===undefined?undefined:JSON.stringify(data)}),env);
const originalFetch=globalThis.fetch;let calls=0,fail=false;
globalThis.fetch=async(url)=>{calls++;assert.equal(new URL(url).hostname,'api.open-meteo.com');if(fail)throw Error('Unavailable');return {ok:true,json:async()=>({elevation:new URL(url).searchParams.get('latitude').split(',').map((_,i)=>100+i*10)})};};
try{
const route={name:'No elevations',fileName:'No elevations.gpx',segments:[[[0,0],[0,.01]]],elevations:[[null,null]],terrainFallback:true};
let result=await(await send('/route',route)).json();assert.equal(result.elevationSource,'open-meteo');assert.equal(calls,1);assert.equal(JSON.stringify(values.get('route').elevations),'[[100,110]]');assert.equal(values.get('setup:'+values.get('activeSetup')).route.elevationSource,'open-meteo');
await send('/route',route);assert.equal(calls,1,'matching route reuses saved elevations');
await send('/route',{...route,elevations:[[0,10]]});assert.equal(calls,1,'GPX elevations do not trigger a lookup');assert.equal(values.get('route').elevationSource,'gpx');
await send('/route',{...route,elevations:[[null,10]]});assert.equal(calls,1,'partial GPX elevations are preserved');
fail=true;result=await(await send('/route',{...route,segments:[[[1,1],[1,1.01]]]})).json();assert.ok(result.elevationWarning);assert.equal(values.get('route').name,route.name,'failed lookup does not block route publication');
}finally{globalThis.fetch=originalFetch;Date.now=realNow;}
console.log('Upload fallback, cache reuse, GPX precedence, saved profiles and graceful service failure passed');
