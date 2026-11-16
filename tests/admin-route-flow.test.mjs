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
const posts=[];let copied=false;
const fetch=async(path,options={})=>{
  const data=options.body?JSON.parse(options.body):null;if(data)posts.push({path,data});let result;
  if(path==='/setups'&&data.action==='list')result={items:[{id:'one',name:'Race',updatedAt:1},...(copied?[{id:'copy',name:'Race (copy)',updatedAt:1}]:[])],selectedId:'one'};
  else if(path==='/setups'&&data.action==='load')result={name:'Race',active:false,settings:{hours:48,raceStart:null}};
  else if(path==='/setups'&&data.action==='duplicate'){copied=true;result={id:'copy',name:'Race (copy)'};}
  else if(path==='/route')result={name:'Race',points:2};
  else if(path==='/checkpoints')result=[];
  else if(path==='/session')result={active:false,paused:false};
  return {ok:true,status:200,json:async()=>result};
};
vm.runInNewContext(admin.match(/<script>([\s\S]*)<\/script>/)[1],{document:{getElementById:get,querySelectorAll:()=>[],createElement:()=>new Element()},window:{addEventListener(){}},location:{origin:'https://test.example'},fetch,AbortSignal,confirm:()=>false});
assert.equal(get('gpxPanel').hidden,true);assert.equal(get('selectedRouteActions').hidden,true);
get('newRoute').onclick();assert.equal(get('gpxPanel').hidden,false);assert.equal(get('savedSetups').hidden,true);assert.equal(posts.length,0,'new route is only a draft');
await get('existingRoute').onclick();assert.equal(get('gpxPanel').hidden,true);assert.equal(get('savedSetups').hidden,false);assert.equal(get('selectedRouteActions').hidden,true);
const before=posts.length;get('setupSelect').value='one';get('setupSelect').onchange();assert.equal(posts.length,before,'dropdown selection must not open route');assert.equal(get('selectedRouteActions').hidden,false);assert.equal(get('routeWorkspace').hidden,true);
await get('openSetup').onclick();assert.ok(posts.some(p=>p.data.action==='load'));assert.equal(get('routeWorkspace').hidden,false);assert.equal(get('gpxPanel').hidden,true);
await get('duplicateSetup').onclick();assert.equal(get('setupSelect').value,'copy');assert.equal(get('routeWorkspace').hidden,true);assert.equal(get('selectedRouteActions').hidden,false);
get('newRoute').onclick();assert.equal(get('selectedRouteActions').hidden,true);assert.equal(get('gpxPanel').hidden,false);
assert.ok(admin.indexOf('id="token"')<admin.indexOf('id="routeChooser"'));
console.log('Route flow visibility, explicit Open, duplication selection and token placement passed');
