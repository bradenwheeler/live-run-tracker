import {TRACK_STEP,readTrack,readTrackTail,writeTrack,appendTrack} from './track-storage.mjs';
import {hasElevations,terrainElevations} from './terrain-elevation.mjs';
import {inPause,crossesPause} from './session-pauses.mjs';
import {appliedSettings,saveSetup,setupKey} from "./saved-setups.mjs";
import {checkpointMap} from "./checkpoint-map.mjs";
import {nearestRoutePoint} from "../docs/route-progress.mjs";
import {checkpointView,ingestCheckpointFix} from "./checkpoints.mjs";
import {distanceMeters as routeEdgeMeters,pointAtMile} from "../docs/mile-markers.mjs";
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
  if(path==="/checkpoint-map"&&req.method==="GET")return new Response(checkpointMap,{headers:{"Content-Type":"text/html;charset=utf-8","Cache-Control":"no-store","Referrer-Policy":"strict-origin-when-cross-origin","Content-Security-Policy":"default-src 'none'; script-src 'unsafe-inline' https://unpkg.com; style-src 'unsafe-inline' https://unpkg.com; img-src data: https://tile.openstreetmap.org; connect-src "+url.origin+"; frame-ancestors 'self'; form-action 'none'"}});
  if(path==="/admin" && req.method==="GET") return new Response(admin,{headers:{"Content-Type":"text/html;charset=utf-8","Cache-Control":"no-store","Referrer-Policy":"no-referrer","Content-Security-Policy":"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-src 'self'; frame-ancestors 'none'; form-action 'none'"}});
  if(["/location","/route","/checkpoints","/checkpoint-map-data"].includes(path) && req.method==="GET") return env.TRACKER.get(env.TRACKER.idFromName("runner")).fetch(req);
  if(!["/pub","/control","/route","/start-time","/session","/checkpoints","/checkpoint-position","/setups"].includes(path)) return json({error:"Not found"},404);
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
      const legacy=await readTrack(this.ctx.storage);if(state.point)legacy.push(state.point);
      await this.ctx.storage.put("legacyFixes",legacy);
      state.captureAt=state.since;state.historyVersion=1;state.trackStep=TRACK_STEP;
      await this.ctx.storage.put("state",state);
    }
    if(state.until>now&&state.trailVersion!==2){
      state.trackStep=TRACK_STEP;
      const rebuilt=rebuildRun(await readFixes(this.ctx.storage,state),state.since,TRACK_STEP);
      state={...state,point:rebuilt.point,distanceMeters:rebuilt.distanceMeters,distanceVersion:2,historyDirty:false,trailVersion:2};
      await writeTrack(this.ctx.storage,rebuilt.track);await this.ctx.storage.put('state',state);
    }
    if(path==="/checkpoint-map-data"){
      const route=await this.ctx.storage.get("route"),items=(await this.ctx.storage.get("checkpoints"))?.items||[];
      return json({route,checkpoints:items.map(cp=>({...cp,position:route?pointAtMile(route.segments,cp.mile):null}))});
    }
    if(path==="/route" && req.method==="GET") return json(await this.ctx.storage.get("route")||null);
    if(path==="/checkpoints"&&req.method==="GET")return json((await this.ctx.storage.get("checkpoints"))?.items||[]);
    if(path==="/location") {
      if(state.historyDirty){
        const rebuilt=rebuildRun(await readFixes(this.ctx.storage,state),state.since,state.trackStep||TRACK_STEP);
        state={...state,point:rebuilt.point,distanceMeters:rebuilt.distanceMeters,distanceVersion:2,historyDirty:false};
        await this.ctx.storage.put("state",state);await writeTrack(this.ctx.storage,rebuilt.track);
      }
      const point=state.point && now-state.point.tst<=900 ? state.point : null;
      const route=await this.ctx.storage.get("route");
      if(route&&!(await this.ctx.storage.get("setupIndex")))await saveSetup(this.ctx.storage,state);
      const sharing=state.until>now&&state.pausedAt==null;
      const track=sharing ? await readTrack(this.ctx.storage) : [];
      return json({status:state.until<=now?"paused":state.pausedAt!=null?"session-paused":point?"live":"waiting",point:state.until>now&&state.pausedAt==null?point:null,track,checkpoints:await checkpointView(this.ctx.storage,sharing?state:{...state,until:0},route,await this.ctx.storage.get("checkpoints"),now),stats:sharing?{paused:state.pausedAt!=null,startedAt:state.since,recordingSince:state.captureAt||state.since,distanceComplete:state.since>=(state.captureAt||state.since),expiresAt:state.until,distanceMeters:measuredDistance(state,null,track),lastFixAt:state.point?.tst||null,serverTime:now}:null,routeVersion:route?.version||null});
    }
    const text=await req.text();let data;
    try{data=text?JSON.parse(text):null;}catch{return json({error:"Invalid JSON"},400);}
    if(path==="/setups"){
      const action=data?.action||'list';
      if(action==='load'){
        if(typeof data.id!=='string')return json({error:"Choose a saved setup."},400);
        const profile=await this.ctx.storage.get(setupKey(data.id));if(!profile)return json({error:"Saved setup not found."},404);
        // Routes are overlays on the session: opening one never resets its GPS data or timing.
        await this.ctx.storage.put('route',{...profile.route,version:crypto.randomUUID()});
        await this.ctx.storage.put('checkpoints',{items:profile.checkpoints,version:crypto.randomUUID()});
        await this.ctx.storage.delete('checkpointCrossings');await this.ctx.storage.put('activeSetup',profile.id);
        return json({loaded:true,active:state.until>now,paused:state.pausedAt!=null,settings:await appliedSettings(this.ctx.storage,state),name:profile.name});
      }
      if(action==='duplicate'){
        if(typeof data.id!=='string')return json({error:"Choose a saved route."},400);
        const source=await this.ctx.storage.get(setupKey(data.id));if(!source)return json({error:"Saved route not found."},404);
        const index=await this.ctx.storage.get('setupIndex')||[];if(index.length>=50)return json({error:"Delete an unused saved route before creating another."},400);
        const base=source.name.slice(0,140);let name=base+' (copy)',number=2;while(index.some(p=>p.name===name)){name=base+' (copy '+number+')';number++;}
        const id=crypto.randomUUID(),fileName=name+'.gpx',updatedAt=now;
        const profile={...source,id,name,fileName,updatedAt,route:{...source.route,fileName,name:name.slice(0,80),version:crypto.randomUUID()}};
        if(new TextEncoder().encode(JSON.stringify(profile)).length>120000)return json({error:"This saved route is too large to duplicate."},400);
        await this.ctx.storage.put(setupKey(id),profile);const meta={id,name,fileName,updatedAt};await this.ctx.storage.put('setupIndex',[...index,meta]);return json(meta);
      }
      if(action==='delete'){
        if(typeof data.id!=='string')return json({error:"Choose a saved setup."},400);
        await this.ctx.storage.delete(setupKey(data.id));
        await this.ctx.storage.put('setupIndex',(await this.ctx.storage.get('setupIndex')||[]).filter(p=>p.id!==data.id));
        if(await this.ctx.storage.get('activeSetup')===data.id)await this.ctx.storage.delete('activeSetup');
        return json({deleted:true});
      }
      if(!['list','save'].includes(action))return json({error:"Unknown setup action."},400);
      let saved=null;
      if(action==='save'||!(await this.ctx.storage.get('setupIndex')))saved=await saveSetup(this.ctx.storage,state);
      if(action==='save'&&!saved)return json({error:"Upload a GPX route first."},409);
      return json({items:await this.ctx.storage.get('setupIndex')||[],selectedId:await this.ctx.storage.get('activeSetup')||null,settings:await appliedSettings(this.ctx.storage,state)});
    }
    if(path==="/checkpoint-position"){
      if(!Number.isFinite(data?.lat)||!Number.isFinite(data?.lon)||Math.abs(data.lat)>90||Math.abs(data.lon)>180)return json({error:"Invalid pin location."},400);
      const route=await this.ctx.storage.get("route");if(!route)return json({error:"Upload a GPX route first."},409);
      const match=nearestRoutePoint(route.segments,data);if(!match)return json({error:"Unable to match the route."},400);
      // Round down at the final fraction so a finish pin stays within the route.
      const mile=Math.floor(match.alongMiles*1000+1e-7)/1000;
      return json({mile,position:pointAtMile(route.segments,mile),offsetMeters:match.offsetMeters});
    }
    if(path==="/checkpoints"){
      const route=await this.ctx.storage.get("route");if(!route)return json({error:"Upload a GPX route before adding checkpoints."},409);
      const config=await this.ctx.storage.get("checkpoints")||{items:[]};
      if(typeof data?.removeId==='string'){
        config.items=config.items.filter(cp=>cp.id!==data.removeId);
      }else{
        if(typeof data?.name!=='string'||!data.name.trim()||data.name.length>80||!Number.isFinite(data.mile)||data.mile<0)return json({error:"Enter a checkpoint name and a mile number of zero or greater."},400);
        let total=0;for(const seg of route.segments)for(let i=1;i<seg.length;i++)total+=routeEdgeMeters(seg[i-1],seg[i]);
        if(data.mile>total/1609.344+1e-6)return json({error:"Checkpoint mile is beyond the end of the uploaded route."},400);
        if(data.id!==undefined&&typeof data.id!=='string')return json({error:"Invalid checkpoint ID."},400);
        const index=data.id?config.items.findIndex(cp=>cp.id===data.id):-1;
        if(data.id&&index<0)return json({error:"Checkpoint no longer exists. Reload the list."},404);
        if(index<0&&config.items.length>=50)return json({error:"This route supports up to 50 checkpoints."},400);
        const checkpoint={id:data.id||crypto.randomUUID(),name:data.name.trim(),mile:Math.round(data.mile*1000)/1000};
        if(index>=0)config.items[index]=checkpoint;else config.items.push(checkpoint);
        config.items.sort((a,b)=>a.mile-b.mile);
      }
      config.version=crypto.randomUUID();await this.ctx.storage.put("checkpoints",config);await saveSetup(this.ctx.storage,state);return json(config.items);
    }
    if(path==="/session"&&data?.action==='open'){
      if(state.until<=now){
        const hours=data.hours??(await appliedSettings(this.ctx.storage,state)).hours??48;
        if(!Number.isInteger(hours)||hours<1||hours>72)return json({error:"Choose a recording window between 1 and 72 hours."},400);
        await clearSession(this.ctx.storage);
        state={since:now,captureAt:now,until:now+hours*3600,point:null,distanceMeters:0,distanceVersion:2,historyVersion:1,trailVersion:2,trackStep:TRACK_STEP};
        await this.ctx.storage.put('runSettings',{hours,raceStart:now});await this.ctx.storage.setAlarm(state.until*1000);
      }else if(state.pausedAt!=null){state.pauseIntervals=[...(state.pauseIntervals||[]),[state.pausedAt,now]];state.pausedAt=null;}
      await this.ctx.storage.put('state',state);
      for(const key of ['route','checkpoints','checkpointCrossings','activeSetup'])await this.ctx.storage.delete(key);
    }
    if(path==="/session"&&data?.action!==undefined&&data.action!=='open'){
      if(!['pause','resume'].includes(data.action))return json({error:"Unknown session action."},400);
      if(state.until<=now)return json({error:"Start a new run first."},409);
      if(data.action==='pause'&&state.pausedAt==null)state.pausedAt=now;
      if(data.action==='resume'&&state.pausedAt!=null){state.pauseIntervals=[...(state.pauseIntervals||[]),[state.pausedAt,now]];state.pausedAt=null;}
      await this.ctx.storage.put('state',state);
    }
    if(path==="/session"&&data?.hours!==undefined&&data.action!=='open'){
      if(state.until<=now)return json({error:"Start a recording session first."},409);
      if(!Number.isInteger(data.hours)||data.hours<1||data.hours>72)return json({error:"Choose 1–72 hours."},400);
      const until=(state.captureAt||state.since)+data.hours*3600;
      if(until<=now)return json({error:"That window would already have ended. Choose a longer window."},400);
      state.until=until;state.trackStep=TRACK_STEP;
      const rebuilt=rebuildRun(await readFixes(this.ctx.storage,state),state.since,state.trackStep);
      state.point=rebuilt.point;state.distanceMeters=rebuilt.distanceMeters;state.distanceVersion=2;state.historyDirty=false;
      await writeTrack(this.ctx.storage,rebuilt.track);
      await this.ctx.storage.put("state",state);await this.ctx.storage.setAlarm(until*1000);await this.ctx.storage.put("runSettings",await appliedSettings(this.ctx.storage,state));
    }
    if(path==="/session")return json({active:state.until>now,paused:state.until>now&&state.pausedAt!=null,startedAt:state.until>now?state.since:null,recordingSince:state.until>now?state.captureAt:null,expiresAt:state.until>now?state.until:null,serverTime:now});
    if(path==="/start-time"){
      if(state.until<=now)return json({error:"Start recording before editing the race start."},409);
      if(!Number.isInteger(data?.startedAt)||data.startedAt<0||data.startedAt>now)return json({error:"Choose a valid start date and time in the past."},400);
      const rebuilt=rebuildRun(await readFixes(this.ctx.storage,state),data.startedAt,state.trackStep||TRACK_STEP);
      state={...state,since:data.startedAt,point:rebuilt.point,distanceMeters:rebuilt.distanceMeters,distanceVersion:2,historyDirty:false};
      await this.ctx.storage.put("state",state);await writeTrack(this.ctx.storage,rebuilt.track);
      await this.ctx.storage.put("runSettings",await appliedSettings(this.ctx.storage,state));
      return json({startedAt:state.since,expiresAt:state.until,pointsIncluded:rebuilt.track.length});
    }
    if(path==="/route") {
      if(data?.remove===true){await this.ctx.storage.delete("route");await this.ctx.storage.delete("checkpoints");await this.ctx.storage.delete("checkpointCrossings");await this.ctx.storage.delete("activeSetup");return json({removed:true});}
      if(!data || typeof data.name!=="string" || !data.name.trim() || data.name.length>80 || !Array.isArray(data.segments) || !data.segments.length || data.segments.length>100) return json({error:"Invalid route"},400);
      let count=0;const segments=[];
      for(const seg of data.segments){
        if(!Array.isArray(seg)||seg.length<2) return json({error:"Each route segment needs at least two points"},400);
        const clean=[];
        for(const pt of seg){if(!Array.isArray(pt)||pt.length!==2||!pt.every(Number.isFinite)||Math.abs(pt[0])>90||Math.abs(pt[1])>180) return json({error:"Invalid route coordinate"},400);clean.push(pt.map(n=>Math.round(n*1e6)/1e6));if(++count>2500)return json({error:"Route exceeds 2,500 map points"},400);}
        segments.push(clean);
      }
      let elevations;
      if(data.elevations!==undefined){
        if(!Array.isArray(data.elevations)||data.elevations.length!==segments.length||data.elevations.some((s,i)=>!Array.isArray(s)||s.length!==segments[i].length||s.some(v=>v!==null&&(!Number.isFinite(v)||v< -12000||v>10000))))return json({error:"Invalid route elevation"},400);
        elevations=data.elevations.map(s=>s.map(v=>v===null?null:Math.round(v*10)/10));
      }
      const previousRoute=await this.ctx.storage.get('route');
      const sameGeometry=data.newSetup!==true&&data.elevations!==undefined&&previousRoute&&JSON.stringify(previousRoute.segments)===JSON.stringify(segments);
      const setupIndex=await this.ctx.storage.get('setupIndex')||[];
      if(!sameGeometry&&setupIndex.length>=50)return json({error:"Delete an unused saved setup before uploading another GPX."},400);
      const fileName=typeof data.fileName==='string'?data.fileName.split(/[\\/]/).at(-1).slice(0,180):data.name.trim()+'.gpx';
      let elevationSource=hasElevations(elevations)?'gpx':null,elevationWarning=null;
      if(data.terrainFallback===true&&!hasElevations(elevations)){
        if(previousRoute&&JSON.stringify(previousRoute.segments)===JSON.stringify(segments)&&hasElevations(previousRoute.elevations)){
          elevations=previousRoute.elevations;elevationSource=previousRoute.elevationSource||'gpx';
        }else try{elevations=await terrainElevations(segments);elevationSource='open-meteo';}catch{elevationWarning='Route saved, but terrain elevation lookup was unavailable. No elevation profile was generated.';}
      }
      const route={name:data.name.trim(),fileName,segments,...(elevations?{elevations}:{}),...(elevationSource?{elevationSource}:{}),version:crypto.randomUUID(),points:count};
      if(new TextEncoder().encode(JSON.stringify(route)).length>100000)return json({error:"Route is too large"},400);
      await this.ctx.storage.put("route",route);if(!sameGeometry){await this.ctx.storage.delete("checkpoints");await this.ctx.storage.delete("activeSetup");}await this.ctx.storage.delete("checkpointCrossings");await saveSetup(this.ctx.storage,state);return json({name:route.name,points:count,checkpointsPreserved:!!sameGeometry,elevationSource,elevationWarning});
    }
    if(path==="/control") {
      if(!data || typeof data.enabled!=="boolean") return json({error:"enabled must be boolean"},400);
      const savedSettings=await appliedSettings(this.ctx.storage,state);
      const hours=data.hours??savedSettings.hours??48;
      if(data.enabled&&(!Number.isInteger(hours)||hours<1||hours>72))return json({error:"Choose a recording window between 1 and 72 hours."},400);
      await clearSession(this.ctx.storage);
      state={since:now,captureAt:now,until:data.enabled?now+hours*3600:0,point:null,distanceMeters:0,distanceVersion:2,historyVersion:1,trailVersion:2,trackStep:TRACK_STEP};
      await this.ctx.storage.put("state",state);
      await this.ctx.storage.delete("track");
      await this.ctx.storage.put("runSettings",data.enabled?{hours,raceStart:state.since}:savedSettings);
      if(data.enabled) await this.ctx.storage.setAlarm(state.until*1000);
      else await this.ctx.storage.deleteAlarm();
      return json({enabled:data.enabled,expiresAt:state.until||null});
    }
    if(data?._type==="encrypted") return json({error:"Use TLS without OwnTracks payload encryption"},400);
    if(data?._type!=="location") return json([]);
    if(![data.lat,data.lon,data.tst].every(Number.isFinite)||Math.abs(data.lat)>90||Math.abs(data.lon)>180||!Number.isInteger(data.tst)||data.tst>now+30) return json({error:"Invalid location"},400);
    // Accept queued, out-of-order fixes throughout the active recording window.
    if(state.until<=now||inPause(state,data.tst)||data.tst<(state.captureAt||state.since)||data.tst>state.until)return json([]);
    const fix={lat:Math.round(data.lat*1e6)/1e6,lon:Math.round(data.lon*1e6)/1e6,tst:data.tst,acc:Number.isFinite(data.acc)&&data.acc>=0?Math.min(data.acc,100000):null};
    if(crossesPause(state,state.point,fix))fix.breakBefore=true;
    const key='fix:'+String(Math.floor(fix.tst/60)).padStart(12,'0'),bucket=await this.ctx.storage.get(key)||[];
    if(bucket.some(p=>p.tst===fix.tst))return json([]);
    bucket.push(fix);await this.ctx.storage.put(key,bucket);
    if(fix.tst<state.since)return json([]);
    await ingestCheckpointFix(this.ctx.storage,state,fix);
    let track=await readTrackTail(this.ctx.storage);
    if(state.point&&fix.tst<=state.point.tst){
      // Batch late/offline arrivals: rebuild once on the next public refresh.
      state.historyDirty=true;await this.ctx.storage.put("state",state);return json([]);
    }else{
      state.distanceMeters=measuredDistance(state,fix,track);state.point=fix;
      if(!track.length||fix.breakBefore||fix.tst-track.at(-1).tst>=(state.trackStep||TRACK_STEP))await appendTrack(this.ctx.storage,{lat:fix.lat,lon:fix.lon,tst:fix.tst,...(fix.breakBefore?{breakBefore:true}:{})});
    }
    state.distanceVersion=2;
    await this.ctx.storage.put("state",state);
    return json([]);
  });}
  async alarm(){return this.ctx.blockConcurrencyWhile(async()=>{
    const state=await this.ctx.storage.get("state");
    if(state?.until>Date.now()/1000){await this.ctx.storage.setAlarm(state.until*1000);return;}
    await clearSession(this.ctx.storage);
  });}
}
