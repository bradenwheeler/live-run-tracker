import assert from 'node:assert/strict';
import vm from 'node:vm';
import {admin} from '../worker/admin.mjs';
class Element{
  constructor(){this.value='';this.hidden=false;this.children=[];this.options=this.children;this.contentWindow={postMessage(){}};}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children.splice(0,this.children.length,...nodes);}
  addEventListener(){} removeAttribute(){} scrollIntoView(){}
}
const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
for(const id of ['gpxPanel','savedSetups','routeWorkspace','appliedWorkspace','selectedRouteActions'])get(id).hidden=true;
get('token').value='test-only';get('hours').options.push({value:'48'});
const posts=[];let copied=false,paused=false;
const fetch=async(path,options={})=>{
  const data=options.body?JSON.parse(options.body):null;if(data)posts.push({path,data});let result;
  if(path==='/setups'&&data.action==='list')result={items:[{id:'one',name:'Race',updatedAt:1},...(copied?[{id:'copy',name:'Race (copy)',updatedAt:1}]:[])],selectedId:'one'};
  else if(path==='/setups'&&data.action==='load')result={name:'Race',active:false,settings:{hours:48,raceStart:null}};
  else if(path==='/setups'&&data.action==='duplicate'){copied=true;result={id:'copy',name:'Race (copy)'};}
  else if(path==='/route')result={name:'Race',points:2};
  else if(path==='/checkpoints')result=[];
  else if(path==='/session'){if(data.action==='pause')paused=true;if(data.action==='resume')paused=false;result={active:true,paused,startedAt:1700000000,recordingSince:1700000000,expiresAt:1700172800,serverTime:1700001000};}
  return {ok:true,status:200,json:async()=>result};
};
vm.runInNewContext(admin.match(/<script>([\s\S]*)<\/script>/)[1],{document:{getElementById:get,querySelectorAll:()=>[],createElement:()=>new Element()},window:{addEventListener(){}},location:{origin:'https://test.example'},fetch,AbortSignal,confirm:()=>false});
assert.equal(get('gpxPanel').hidden,true);assert.equal(get('selectedRouteActions').hidden,true);assert.ok(admin.indexOf('id="sessionControls"')<admin.indexOf('id="routeWorkspace"'),'session controls are outside the gated route workspace');get('hours').value='72';get('startTime').value='2026-11-17T09:00';
get('newRoute').onclick();assert.equal(get('hours').value,'72');assert.equal(get('startTime').value,'2026-11-17T09:00');assert.equal(get('gpxPanel').hidden,false);assert.equal(get('savedSetups').hidden,true);assert.equal(posts.length,0,'new route is only a draft');
await get('existingRoute').onclick();assert.equal(get('gpxPanel').hidden,true);assert.equal(get('savedSetups').hidden,false);assert.equal(get('selectedRouteActions').hidden,true);
const before=posts.length;get('setupSelect').value='one';get('setupSelect').onchange();assert.equal(posts.length,before,'dropdown selection must not open route');assert.equal(get('selectedRouteActions').hidden,false);assert.equal(get('routeWorkspace').hidden,true);
await get('openSetup').onclick();assert.ok(posts.some(p=>p.data.action==='load'));assert.equal(get('routeWorkspace').hidden,false);assert.equal(get('gpxPanel').hidden,true);
await get('pause').onclick();assert.equal(get('resume').disabled,false);assert.equal(get('pause').disabled,true);await get('resume').onclick();assert.equal(get('resume').disabled,true);assert.equal(get('pause').disabled,false);
await get('duplicateSetup').onclick();assert.equal(get('setupSelect').value,'copy');assert.equal(get('routeWorkspace').hidden,true);assert.equal(get('selectedRouteActions').hidden,false);
get('newRoute').onclick();assert.equal(get('selectedRouteActions').hidden,true);assert.equal(get('gpxPanel').hidden,false);
assert.ok(admin.indexOf('id="token"')<admin.indexOf('id="routeChooser"'));
console.log('Route flow visibility, explicit Open, duplication selection and token placement passed');
