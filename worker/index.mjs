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
  if(!["/pub","/control","/route"].includes(path)) return json({error:"Not found"},404);
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
    if(state.until<=now && (state.point||state.until)){state={until:0,since:0,point:null};await this.ctx.storage.put("state",state);await this.ctx.storage.delete("track");}
    if(path==="/route" && req.method==="GET") return json(await this.ctx.storage.get("route")||null);
    if(path==="/location") {
      const point=state.point && now-state.point.tst<=900 ? state.point : null;
      const route=await this.ctx.storage.get("route");
      const track=state.until>now ? await this.ctx.storage.get("track")||[] : [];
      return json({status:state.until<=now?"paused":point?"live":"waiting",point:state.until>now?point:null,track,routeVersion:route?.version||null});
    }
    const text=await req.text();let data;
    try{data=text?JSON.parse(text):null;}catch{return json({error:"Invalid JSON"},400);}
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
      state={since:now,until:data.enabled?now+21600:0,point:null};
      await this.ctx.storage.put("state",state);
      await this.ctx.storage.delete("track");
      if(data.enabled) await this.ctx.storage.setAlarm(Date.now()+21600000);
      else await this.ctx.storage.deleteAlarm();
      return json({enabled:data.enabled,expiresAt:state.until||null});
    }
    if(data?._type==="encrypted") return json({error:"Use TLS without OwnTracks payload encryption"},400);
    if(data?._type!=="location") return json([]);
    if(![data.lat,data.lon,data.tst].every(Number.isFinite)||Math.abs(data.lat)>90||Math.abs(data.lon)>180||!Number.isInteger(data.tst)||data.tst>now+30) return json({error:"Invalid location"},400);
    // Discard queued fixes from before this sharing session, old fixes, and out-of-order fixes.
    if(state.until<=now||data.tst<state.since||data.tst<now-900||data.tst<=(state.point?.tst||0)) return json([]);
    state.point={lat:data.lat,lon:data.lon,tst:data.tst,acc:Number.isFinite(data.acc)&&data.acc>=0?Math.min(data.acc,100000):null};
    await this.ctx.storage.put("state",state);
    const track=await this.ctx.storage.get("track")||[];
    // Persist at most one breadcrumb per 30 seconds. Maximum six-hour session: 720 points.
    if(!track.length||data.tst-track[track.length-1].tst>=30){
      track.push({lat:state.point.lat,lon:state.point.lon,tst:state.point.tst});
      await this.ctx.storage.put("track",track.slice(-720));
    }
    return json([]);
  });}
  async alarm(){return this.ctx.blockConcurrencyWhile(async()=>{
    const state=await this.ctx.storage.get("state");
    if(state?.until>Date.now()/1000){await this.ctx.storage.setAlarm(state.until*1000);return;}
    await this.ctx.storage.delete("state");await this.ctx.storage.delete("track");
  });}
}
