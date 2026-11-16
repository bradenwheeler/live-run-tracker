import {distanceMeters} from './mile-markers.mjs';
export function elevationData(route){
  let meters=0;const runs=[];let run=[];const points=[];
  for(let s=0;s<(route?.segments?.length||0);s++){
    if(run.length)runs.push(run);run=[];
    const segment=route.segments[s];
    for(let i=0;i<segment.length;i++){
      if(i)meters+=distanceMeters(segment[i-1],segment[i]);
      const elevation=route.elevations?.[s]?.[i];
      if(Number.isFinite(elevation)){
        const point={meters,elevation};run.push(point);points.push(point);
      }else{if(run.length)runs.push(run);run=[];}
    }
  }
  if(run.length)runs.push(run);
  return {runs,points,totalMeters:meters};
}
export function elevationAt(data,meters){
  for(const run of data.runs){
    if(meters<run[0].meters||meters>run.at(-1).meters)continue;
    for(let i=1;i<run.length;i++)if(meters<=run[i].meters){const a=run[i-1],b=run[i],t=b.meters===a.meters?0:(meters-a.meters)/(b.meters-a.meters);return a.elevation+t*(b.elevation-a.elevation);}
    if(meters===run[0].meters)return run[0].elevation;
  }
  return null;
}
const NS='http://www.w3.org/2000/svg';
function element(tag,attrs={},text){const node=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,String(v));if(text!==undefined)node.textContent=text;return node;}
let lastRoute,lastContainer,chart;
export function renderElevation(container,readout,route,progress){
  if(lastRoute!==route||lastContainer!==container||!chart){
    lastRoute=route;lastContainer=container;chart=null;container.replaceChildren();
    const data=elevationData(route);
    if(data.points.length<2||!data.totalMeters){const p=document.createElement('p');p.textContent=route?'No elevation data in this saved route. Upload the original GPX again to include its elevation profile.':'Upload a GPX route to see its elevation profile.';container.append(p);readout.textContent='';return;}
    const values=data.points.map(p=>p.elevation*3.28084),min=Math.floor(Math.min(...values)/100)*100,max=Math.max(min+100,Math.ceil(Math.max(...values)/100)*100);
    const x=meters=>52+meters/data.totalMeters*830,y=feet=>140-(feet-min)/(max-min)*120;
    const svg=element('svg',{viewBox:'0 0 900 174',role:'img','aria-label':'Course elevation in feet against route distance in miles'});
    for(let i=0;i<=2;i++){const feet=min+(max-min)*i/2;svg.append(element('line',{x1:52,x2:882,y1:y(feet),y2:y(feet),class:'elevation-grid'}),element('text',{x:45,y:y(feet)+4,'text-anchor':'end',class:'elevation-axis'},Math.round(feet).toLocaleString()+' ft'));}
    for(let i=0;i<=4;i++){const meters=data.totalMeters*i/4;svg.append(element('text',{x:x(meters),y:164,'text-anchor':i===4?'end':i===0?'start':'middle',class:'elevation-axis'},(meters/1609.344).toFixed(i===0?0:1)+' mi'));}
    for(const run of data.runs){if(run.length<2)continue;const d=run.map((p,i)=>(i?'L':'M')+x(p.meters)+','+y(p.elevation*3.28084)).join(' ');svg.append(element('path',{d:d+' L'+x(run.at(-1).meters)+',140 L'+x(run[0].meters)+',140 Z',class:'elevation-area'}),element('path',{d,class:'elevation-line'}));}
    const cursor=element('line',{y1:12,y2:140,class:'elevation-cursor',visibility:'hidden'}),dot=element('circle',{r:5,class:'elevation-dot',visibility:'hidden'});svg.append(cursor,dot);container.append(svg);chart={data,x,y,cursor,dot,svg};
  }
  const {data,x,y,cursor,dot,svg}=chart;
  if(!Number.isFinite(progress)){cursor.setAttribute('visibility','hidden');dot.setAttribute('visibility','hidden');readout.textContent='Waiting for current location';return;}
  const meters=Math.max(0,Math.min(data.totalMeters,progress)),feet=elevationAt(data,meters),px=x(meters);
  cursor.setAttribute('x1',px);cursor.setAttribute('x2',px);cursor.setAttribute('visibility','visible');
  dot.setAttribute('visibility',feet===null?'hidden':'visible');dot.setAttribute('cx',px);if(feet!==null)dot.setAttribute('cy',y(feet*3.28084));
  readout.textContent='Current · '+(meters/1609.344).toFixed(2)+' mi'+(feet===null?'':' · '+Math.round(feet*3.28084).toLocaleString()+' ft');svg.setAttribute('aria-label','Course elevation profile. '+readout.textContent);
}
