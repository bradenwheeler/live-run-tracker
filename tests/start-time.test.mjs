import assert from 'node:assert/strict';
import worker,{Tracker} from '../worker/index.mjs';
const realNow=Date.now;let seconds=1800000000;Date.now=()=>seconds*1000;
const values=new Map();let alarm;
const storage={get:async k=>structuredClone(values.get(k)),put:async(k,v)=>values.set(k,structuredClone(v)),delete:async keys=>{for(const k of Array.isArray(keys)?keys:[keys])values.delete(k);},list:async o=>new Map([...values].filter(([k])=>k.startsWith(o.prefix)&&(!o.startAfter||k>o.startAfter)).sort(([a],[b])=>a.localeCompare(b)).slice(0,o.limit||1000)),setAlarm:async t=>{alarm=t;},deleteAlarm:async()=>{alarm=null;}};
const object=new Tracker({storage,blockConcurrencyWhile:f=>f()});
const env={ADMIN_TOKEN:'admin-test',OWNTRACKS_PASSWORD:'phone-test',TRACKER:{idFromName:x=>x,get:()=>object}};
const auth='Bearer admin-test',phone='Basic '+btoa('runner:phone-test');
const send=(path,data,token=auth)=>worker.fetch(new Request('https://test.example'+path,{method:data===undefined?'GET':'POST',headers:{Authorization:token},body:data===undefined?undefined:JSON.stringify(data)}),env);
const view=async()=>(await send('/location')).json();
const start=seconds;
await send('/control',{enabled:true});assert.equal(alarm,(start+48*3600)*1000);
assert.equal((await send('/session',{})).status,200);
assert.equal((await send('/start-time',{startedAt:start},phone)).status,401);
seconds=start+4*3600;
const fix=(t,lon)=>({_type:'location',lat:0,lon,tst:t,acc:3});
// Offline fixes arrive hours late and in reverse order.
await send('/pub',fix(start+1200,.03),phone);
await send('/pub',fix(start+600,.02),phone);
await send('/pub',fix(start,.01),phone);
let before=await view();assert.equal(before.track.length,3);assert.ok(before.stats.distanceMeters>2000);
await send('/start-time',{startedAt:start+600});let after=await view();
assert.equal(after.stats.startedAt,start+600);assert.equal(after.track.length,2);assert.ok(after.track.every(p=>p.tst>=start+600));assert.ok(after.stats.distanceMeters<before.stats.distanceMeters);
assert.equal(after.stats.expiresAt,start+48*3600);
// Earlier private fixes survive an edit and can be restored by correcting again.
await send('/start-time',{startedAt:start});assert.equal((await view()).track.length,3);
await send('/start-time',{startedAt:start+1800});after=await view();assert.equal(after.point,null);assert.equal(after.track.length,0);assert.equal(after.stats.distanceMeters,0);
assert.equal((await send('/start-time',{startedAt:start-1})).status,400);
assert.equal((await send('/start-time',{startedAt:seconds+1})).status,400);
seconds=start+7*3600;assert.notEqual((await view()).status,'paused');
await object.alarm();assert.ok(alarm>seconds*1000);
await send('/session',{hours:72});assert.equal((await view()).stats.expiresAt,start+72*3600);
assert.equal((await send('/session',{hours:73})).status,400);
seconds=start+49*3600;assert.notEqual((await view()).status,'paused');
await send('/control',{enabled:false});assert.equal((await view()).stats,null);assert.equal([...values.keys()].some(k=>k.startsWith('fix:')),false);
// A fresh default session remains active immediately before its 48-hour endpoint.
await send('/control',{enabled:true});const fresh=seconds;seconds=fresh+48*3600-1;assert.notEqual((await view()).status,'paused');seconds++;assert.equal((await view()).status,'paused');
Date.now=realNow;
console.log('Passed: 48-hour default/no 6-hour cutoff, 72-hour extension, edited-start filtering/recalculation, reverse-order offline uploads, auth, bounds, retention and expiry.');
