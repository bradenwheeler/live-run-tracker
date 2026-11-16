import {readFixes,rebuildRun,clearSession} from "./session-history.mjs";
import {measuredDistance} from "./run-metrics.mjs";
import {admin} from "./admin.mjs";
const headers = {"Content-Type":"application/json", "Cache-Control":"no-store", "Access-Control-Allow-Origin":"*", "X-Content-Type-Options":"nosniff"};
const json = (value, status=200) => new Response(JSON.stringify(value), {status, headers});
async function equal(a,b) {
  const enc=new TextEncoder();
  const [x,y]=await Promise.all([a,b].map(s=>crypto.subtle.digest("SHA-256",enc.encode(s))));
  const u=new Uint8Array(x),v=new Uint8Array(y); let diff=0;
  for(let i=0;i<u.length;i++) diff|=u[i]^v[i]; return diff===0;
}
export default {async fetch(req,env) {
  const url=new URL(req.url),path=url.pathname;
  if(url.protocol!=="https:") return json({error:"HTTPS required"},400);
  if(path==="/admin" && req.method==="GET") return new Response(admin,{headers:{"Content-Type":"text/html;charset=utf-8","Cache-Control":"no-store","Referrer-Policy":"no-referrer","Content-Security-Policy":"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; form-action 'none'"}});
  if(["/location","/route"].includes(path) && req.method==="GET") return env.TRACKER.get(env.TRACKER.idFromName("runner")).fetch(req);
  if(!["/pub","/control","/route","/start-time","/session"].includes(path)) return json({error:"Not found"},404);
  if(req.method!=="POST") return json({error:"Method not allowed"},405);
  const expected=path==="/pub" ? (env.OWNTRACKS_PASSWORD ? "Basic "+btoa("runner:"+env.OWNTRACKS_PASSWORD) : "") : (env.ADMIN_TOKEN ? "Bearer "+env.ADMIN_TOKEN : "");
  if(!expected) return json({error:"Receiver secrets not configured"},503);
  if(!await equal(req.headers.get("Authorization")||"",expected)) return json({error:"Unauthorized"},401);
  // Bound the body while streaming, even without a Content-Length header.
  const reader=req.body?.getReader();let size=0,chunks=[];
  if(reader) {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>(path==="/route"?120000:8192)){await reader.cancel();return json({error:"Payload too large"},413);}chunks.push(value);}}
  const body=new Uint8Array(size);let offset=0;for(const c of chunks){body.set(c,offset);offset+=c.length;}
  return env.TRACKER.get(env.TRACKER.idFromName("runner")).fetch(new Request(req.url,{method:"POST",body}));
}};
export class Tracker {
  constructor(ctx){this.ctx=ctx;}
  async fetch(req){return this.ctx.blockConcurrencyWhile(async()=>{
    const now=Math.floor(Date.now()/1000),path=new URL(req.url).pathname;
    let state=await this.ctx.storage.get("state")||{until:0,since:0,point:null};
    if(state.until<=now && (state.point||state.until)){await clearSession(this.ctx.storage);state={until:0,since:0,point:null};}
    if(state.until>now&&state.historyVersion!==1){
      const legacy=await this.ctx.storage.get("track")||[];if(state.point)legacy.push(state.point);
      await this.ctx.storage.put("legacyFixes",legacy);
      state.captureAt=state.since;state.historyVersion=1;state.trackStep=Math.max(30,Math.ceil((state.until-state.captureAt)/1440));
      await this.ctx.storage.put("state",state);
    }
    if(path==="/route" && req.method==="GET") return json(await this.ctx.storage.get("route")||null);
    if(path==="/location") {
      if(state.historyDirty){
        const rebuilt=rebuildRun(await readFixes(this.ctx.storage,state),state.since,state.trackStep||30);
        state={...state,point:rebuilt.point,distanceMeters:rebuilt.distanceMeters,distanceVersion:2,historyDirty:false};
        await this.ctx.storage.put("state",state);await this.ctx.storage.put("track",rebuilt.track);
      }
      const point=state.point && now-state.point.tst<=900 ? state.point : null;
      const route=await this.ctx.storage.get("route");
      const track=state.until>now ? await this.ctx.storage.get("track")||[] : [];
      return json({status:state.until<=now?"paused":point?"live":"waiting",point:state.until>now?point:null,track,stats:state.until>now?{startedAt:state.since,expiresAt:state.until,distanceMeters:measuredDistance(state,null,track),lastFixAt:state.point?.tst||null,serverTime:now}:null,routeVersion:route?.version||null});
    }
    const text=await req.text();let data;
    try{data=text?JSON.parse(text):null;}catch{return json({error:"Invalid JSON"},400);}
    if(path==="/session"&&data?.hours!==undefined){
      if(state.until<=now)return json({error:"Start a recording session first."},409);
      if(!Number.isInteger(data.hours)||data.hours<1||data.hours>72)return json({error:"Choose 1–72 hours."},400);
      const until=(state.captureAt||state.since)+data.hours*3600;
      if(until<=now)return json({error:"That window would already have ended. Choose a longer window."},400);
      state.until=until;state.trackStep=Math.max(30,Math.ceil(data.hours*3600/1440));
      const rebuilt=rebuildRun(await readFixes(this.ctx.storage,state),state.since,state.trackStep);
      state.point=rebuilt.point;state.distanceMeters=rebuilt.distanceMeters;state.distanceVersion=2;state.historyDirty=false;
      await this.ctx.storage.put("track",rebuilt.track);
      await this.ctx.storage.put("state",state);await this.ctx.storage.setAlarm(until*1000);
    }
    if(path==="/session")return json({active:state.until>now,startedAt:state.until>now?state.since:null,recordingSince:state.until>now?state.captureAt:null,expiresAt:state.until>now?state.until:null,serverTime:now});
    if(path==="/start-time"){
      if(state.until<=now)return json({error:"Start recording before editing the race start."},409);
      if(!Number.isInteger(data?.startedAt)||data.startedAt<(state.captureAt||state.since)||data.startedAt>now)return json({error:"Choose a time between recording activation and now."},400);
      const rebuilt=rebuildRun(await readFixes(this.ctx.storage,state),data.startedAt,state.trackStep||30);
      state={...state,since:data.startedAt,point:rebuilt.point,distanceMeters:rebuilt.distanceMeters,distanceVersion:2,historyDirty:false};
      await this.ctx.storage.put("state",state);await this.ctx.storage.put("track",rebuilt.track);
      return json({startedAt:state.since,expiresAt:state.until,pointsIncluded:rebuilt.track.length});
    }
    if(path==="/route") {
      if(data?.remove===true){await this.ctx.storage.delete("route");return json({removed:true});}
      if(!data || typeof data.name!=="string" || !data.name.trim() || data.name.length>80 || !Array.isArray(data.segments) || !data.segments.length || data.segments.length>100) return json({error:"Invalid route"},400);
      let count=0;const segments=[];
      for(const seg of data.segments){
        if(!Array.isArray(seg)||seg.length<2) return json({error:"Each route segment needs at least two points"},400);
        const clean=[];
        for(const pt of seg){if(!Array.isArray(pt)||pt.length!==2||!pt.every(Number.isFinite)||Math.abs(pt[0])>90||Math.abs(pt[1])>180) return json({error:"Invalid route coordinate"},400);clean.push(pt.map(n=>Math.round(n*1e6)/1e6));if(++count>2500)return json({error:"Route exceeds 2,500 map points"},400);}
        segments.push(clean);
      }
      const route={name:data.name.trim(),segments,version:crypto.randomUUID(),points:count};
      if(new TextEncoder().encode(JSON.stringify(route)).length>100000)return json({error:"Route is too large"},400);
      await this.ctx.storage.put("route",route);return json({name:route.name,points:count});
    }
    if(path==="/control") {
      if(!data || typeof data.enabled!=="boolean") return json({error:"enabled must be boolean"},400);
      const hours=data.hours??48;
      if(data.enabled&&(!Number.isInteger(hours)||hours<1||hours>72))return json({error:"Choose a recording window between 1 and 72 hours."},400);
      await clearSession(this.ctx.storage);
      state={since:now,captureAt:now,until:data.enabled?now+hours*3600:0,point:null,distanceMeters:0,distanceVersion:2,historyVersion:1,trackStep:Math.max(30,Math.ceil(hours*3600/1440))};
      await this.ctx.storage.put("state",state);
      await this.ctx.storage.delete("track");
      if(data.enabled) await this.ctx.storage.setAlarm(state.until*1000);
      else await this.ctx.storage.deleteAlarm();
      return json({enabled:data.enabled,expiresAt:state.until||null});
    }
    if(data?._type==="encrypted") return json({error:"Use TLS without OwnTracks payload encryption"},400);
    if(data?._type!=="location") return json([]);
    if(![data.lat,data.lon,data.tst].every(Number.isFinite)||Math.abs(data.lat)>90||Math.abs(data.lon)>180||!Number.isInteger(data.tst)||data.tst>now+30) return json({error:"Invalid location"},400);
    // Accept queued, out-of-order fixes throughout the active recording window.
    if(state.until<=now||data.tst<(state.captureAt||state.since)||data.tst>state.until)return json([]);
    const fix={lat:Math.round(data.lat*1e6)/1e6,lon:Math.round(data.lon*1e6)/1e6,tst:data.tst,acc:Number.isFinite(data.acc)&&data.acc>=0?Math.min(data.acc,100000):null};
    const key='fix:'+String(Math.floor(fix.tst/60)).padStart(12,'0'),bucket=await this.ctx.storage.get(key)||[];
    if(bucket.some(p=>p.tst===fix.tst))return json([]);
    bucket.push(fix);await this.ctx.storage.put(key,bucket);
    if(fix.tst<state.since)return json([]);
    let track=await this.ctx.storage.get("track")||[];
    if(state.point&&fix.tst<=state.point.tst){
      // Batch late/offline arrivals: rebuild once on the next public refresh.
      state.historyDirty=true;await this.ctx.storage.put("state",state);return json([]);
    }else{
      state.distanceMeters=measuredDistance(state,fix,track);state.point=fix;
      if(!track.length||fix.tst-track.at(-1).tst>=(state.trackStep||30))track.push({lat:fix.lat,lon:fix.lon,tst:fix.tst});
    }
    state.distanceVersion=2;
    await this.ctx.storage.put("state",state);await this.ctx.storage.put("track",track.slice(-1440));
    return json([]);
  });}
  async alarm(){return this.ctx.blockConcurrencyWhile(async()=>{
    const state=await this.ctx.storage.get("state");
    if(state?.until>Date.now()/1000){await this.ctx.storage.setAlarm(state.until*1000);return;}
    await clearSession(this.ctx.storage);
  });}
}
