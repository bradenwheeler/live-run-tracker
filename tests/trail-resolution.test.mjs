import {writeTrack,readTrack} from '../worker/track-storage.mjs';
import assert from 'node:assert/strict';
import worker,{Tracker} from '../worker/index.mjs';
const realNow=Date.now;let now=1800000000;Date.now=()=>now*1000;
const values=new Map(),storage={get:async k=>structuredClone(values.get(k)),put:async(k,v)=>values.set(k,structuredClone(v)),delete:async keys=>{for(const k of Array.isArray(keys)?keys:[keys])values.delete(k);},list:async o=>new Map([...values].filter(([k])=>k.startsWith(o.prefix)&&(!o.startAfter||k>o.startAfter)).sort(([a],[b])=>a.localeCompare(b)).slice(0,o.limit||1000)),setAlarm:async()=>{},deleteAlarm:async()=>{}};
let obj=new Tracker({storage,blockConcurrencyWhile:f=>f()});const env={ADMIN_TOKEN:'admin-test',OWNTRACKS_PASSWORD:'phone-test',TRACKER:{idFromName:x=>x,get:()=>obj}},admin='Bearer admin-test',phone='Basic '+btoa('runner:phone-test');
const send=(path,data,auth=admin)=>worker.fetch(new Request('https://test.example'+path,{method:data===undefined?'GET':'POST',headers:{Authorization:auth},body:data===undefined?undefined:JSON.stringify(data)}),env);
await send('/control',{enabled:true,hours:72});const start=now;
// A phone can return from an offline period with newer fixes before older ones.
now+=3600;
for(let i=359;i>=0;i--)await send('/pub',{_type:'location',lat:0,lon:i*.00001,tst:start+i*10},phone);
let view=await(await send('/location')).json();assert.equal(view.track.length,360);assert.equal(view.track[0].tst,start);assert.equal(view.track.at(-1).tst,start+3590);assert.ok(view.stats.distanceMeters>300);assert.equal(values.get('state').trackStep,10);
// An existing 48-hour run recovers points previously omitted from its public trail.
const state=values.get('state');state.trailVersion=undefined;state.trackStep=120;values.set('state',state);
await writeTrack(storage,view.track.filter((_,i)=>i%12===0));
view=await(await send('/location')).json();assert.equal(view.track.length,360);assert.equal(values.get('state').trailVersion,2);
const points=Array.from({length:25921},(_,i)=>({lat:0,lon:i*.000001,tst:start+i*10}));
await writeTrack(storage,points);assert.equal((await readTrack(storage)).length,25921);
for(const [key,value] of values)if(key.startsWith('trail:'))assert.ok(JSON.stringify(value).length<100000,'each storage value stays safely below the 128KiB limit');
await send('/control',{enabled:false});assert.equal([...values.keys()].some(k=>k.startsWith('trail:')),false);assert.equal(values.has('trailInfo'),false);
Date.now=realNow;
console.log('10-second offline backlog, chronological rebuild, live migration, complete 72-hour trail and chunk cleanup passed');
