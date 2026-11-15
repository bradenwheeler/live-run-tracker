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
  if(path==="/location" && req.method==="GET") return env.TRACKER.get(env.TRACKER.idFromName("runner")).fetch(req);
  if(!["/pub","/control"].includes(path)) return json({error:"Not found"},404);
  if(req.method!=="POST") return json({error:"Method not allowed"},405);
  const expected=path==="/pub" ? (env.OWNTRACKS_PASSWORD ? "Basic "+btoa("runner:"+env.OWNTRACKS_PASSWORD) : "") : (env.ADMIN_TOKEN ? "Bearer "+env.ADMIN_TOKEN : "");
  if(!expected) return json({error:"Receiver secrets not configured"},503);
  if(!await equal(req.headers.get("Authorization")||"",expected)) return json({error:"Unauthorized"},401);
  // Bound the body while streaming, even without a Content-Length header.
  const reader=req.body?.getReader();let size=0,chunks=[];
  if(reader) {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8192){await reader.cancel();return json({error:"Payload too large"},413);}chunks.push(value);}}
  const body=new Uint8Array(size);let offset=0;for(const c of chunks){body.set(c,offset);offset+=c.length;}
  return env.TRACKER.get(env.TRACKER.idFromName("runner")).fetch(new Request(req.url,{method:"POST",body}));
}};
export class Tracker {
  constructor(ctx){this.ctx=ctx;}
  async fetch(req){return this.ctx.blockConcurrencyWhile(async()=>{
    const now=Math.floor(Date.now()/1000),path=new URL(req.url).pathname;
    let state=await this.ctx.storage.get("state")||{until:0,since:0,point:null};
    if(state.until<=now && (state.point||state.until)){state={until:0,since:0,point:null};await this.ctx.storage.put("state",state);}
    if(path==="/location") {
      const point=state.point && now-state.point.tst<=900 ? state.point : null;
      return json({status:state.until<=now?"paused":point?"live":"waiting",point:state.until>now?point:null});
    }
    const text=await req.text();let data;
    try{data=text?JSON.parse(text):null;}catch{return json({error:"Invalid JSON"},400);}
    if(path==="/control") {
      if(!data || typeof data.enabled!=="boolean") return json({error:"enabled must be boolean"},400);
      state={since:now,until:data.enabled?now+21600:0,point:null};
      await this.ctx.storage.put("state",state);
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
    return json([]);
  });}
  async alarm(){await this.ctx.storage.deleteAll();}
}
const admin=`<!doctype html><meta name="viewport" content="width=device-width"><title>Run sharing control</title><style>body{font:18px system-ui;max-width:36rem;margin:10vh auto;padding:24px;background:#111b22;color:#eef3ee}input,button{font:inherit;padding:12px;margin:8px 0}button{cursor:pointer}input{width:90%}</style><h1>Run sharing</h1><p>Starting shares your precise location publicly for up to 6 hours. Stopping clears the server's current point. A viewer may keep a copy.</p><label>Private admin token <input id="token" type="password" autocomplete="off"></label><p><button id="start">Start sharing</button> <button id="stop">Stop & clear</button></p><p id="result" role="status"></p><script>async function set(enabled){try{const r=await fetch('/control',{method:'POST',headers:{'Authorization':'Bearer '+document.getElementById('token').value,'Content-Type':'application/json'},body:JSON.stringify({enabled})});if(!r.ok)throw Error('Request failed ('+r.status+')');document.getElementById('result').textContent=enabled?'Sharing enabled for 6 hours. Send a fresh OwnTracks update.':'Sharing paused and point cleared.';}catch(e){document.getElementById('result').textContent=e.message;}}document.getElementById('start').onclick=()=>set(true);document.getElementById('stop').onclick=()=>set(false);</script>`;
