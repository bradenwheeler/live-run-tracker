import assert from 'node:assert/strict';
import worker,{Tracker} from '../worker/index.mjs';
const realNow=Date.now;let now=1800000000;Date.now=()=>now*1000;
const store=new Map();const storage={get:async k=>structuredClone(store.get(k)),put:async(k,v)=>store.set(k,structuredClone(v)),delete:async keys=>{for(const k of Array.isArray(keys)?keys:[keys])store.delete(k);},list:async o=>new Map([...store].filter(([k])=>k.startsWith(o.prefix)&&(!o.startAfter||k>o.startAfter)).sort(([a],[b])=>a.localeCompare(b)).slice(0,o.limit||1000)),setAlarm:async()=>{},deleteAlarm:async()=>{}};
let obj=new Tracker({storage,blockConcurrencyWhile:f=>f()});
const env={ADMIN_TOKEN:'test-admin',OWNTRACKS_PASSWORD:'test-phone',TRACKER:{idFromName:x=>x,get:()=>obj}};
const admin='Bearer test-admin',phone='Basic '+btoa('runner:test-phone');
const send=(path,data,auth=admin)=>worker.fetch(new Request('https://example.test'+path,{method:data===undefined?'GET':'POST',headers:{Authorization:auth},body:data===undefined?undefined:JSON.stringify(data)}),env);
const view=async()=>(await send('/location')).json();
const lon=n=>n*1609.344/6371008.8*180/Math.PI;
assert.equal((await send('/checkpoints',{name:'Aid',mile:2},phone)).status,401);
assert.equal((await send('/checkpoints',{name:'Aid',mile:2})).status,409);
await send('/route',{name:'10 mile test',segments:[[[0,0],[0,lon(10)]]]});
assert.equal((await send('/checkpoints',{name:'Too far',mile:11})).status,400);
assert.equal((await send('/checkpoints',{name:'',mile:2})).status,400);
assert.equal((await send('/checkpoints',{name:'Negative',mile:-1})).status,400);
await send('/checkpoints',{name:'Aid station',mile:2});await send('/checkpoints',{name:'Start',mile:0});
let defs=await(await send('/checkpoints')).json();assert.equal(defs[0].mile,0);
await send('/control',{enabled:true});const start=now;
const fix=(t,miles)=>({_type:'location',tst:t,lat:0,lon:lon(miles)});
await send('/pub',fix(now,.5),phone);
let cps=(await view()).checkpoints;assert.equal(cps[1].crossedAt,null);assert.equal(cps[0].crossedAt,start);
now+=60;await send('/pub',fix(now,2.1),phone);assert.equal((await view()).checkpoints[1].crossedAt,now);
now+=60;await send('/pub',fix(now,1.5),phone);assert.equal((await view()).checkpoints[1].crossedAt,start+60);
// A delayed report corrects the earliest crossing time, not the receive time.
await send('/pub',fix(start+30,2.05),phone);assert.equal((await view()).checkpoints[1].crossedAt,start+30);
// Reconstruct against the edited race start.
await send('/start-time',{startedAt:start+50});assert.equal((await view()).checkpoints[1].crossedAt,start+60);
await send('/start-time',{startedAt:start+90});assert.equal((await view()).checkpoints[1].crossedAt,null);
now+=60;await send('/pub',fix(now,5),phone);
await send('/checkpoints',{name:'Late-added checkpoint',mile:4});assert.equal((await view()).checkpoints[2].crossedAt,now);
// Crossing events survive a fresh Durable Object instance.
obj=new Tracker({storage,blockConcurrencyWhile:f=>f()});assert.equal((await view()).checkpoints[2].crossedAt,now);
const removeId=(await view()).checkpoints[1].id;await send('/checkpoints',{removeId});assert.equal((await view()).checkpoints.length,2);
await send('/control',{enabled:false});assert.ok((await view()).checkpoints.every(cp=>cp.crossedAt===null));
await send('/control',{enabled:true});assert.ok((await view()).checkpoints.every(cp=>cp.crossedAt===null));
await send('/route',{name:'Replacement route',segments:[[[0,0],[0,lon(10)]]]});assert.equal((await(await send('/checkpoints')).json()).length,0);
Date.now=realNow;
console.log('Passed: checkpoint auth/validation, zero/fractional miles, sorted definitions, first crossing, backwards movement, delayed fixes, start edits, historical additions, persistence, deletion, run reset and route replacement.');
