import {elapsedLabel,paceLabel} from './run-stats.mjs?v=1';
import {mileMarkers} from './mile-markers.mjs?v=1';
const $=id=>document.getElementById(id);
const api=window.TRACKER_API?.replace(/\/$/,'');
const map=L.map('map').setView([20,0],2);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
const mileLayer=L.layerGroup().addTo(map);
function clearPlanned(){if(planned)map.removeLayer(planned);planned=null;mileLayer.clearLayers();}
let marker,circle,point,busy=false,planned=null,actual=null,routeVersion,hasFitted=false,track=[];
let runStats=null,statsReceivedAt=0;
function updateStats(){
  if(!runStats){$('elapsed').textContent='—';$('pace').textContent='—';$('distance').textContent='—';return;}
  const now=runStats.serverTime+(performance.now()-statsReceivedAt)/1000;
  if(now>=runStats.expiresAt){runStats=null;updateStats();return;}
  const elapsed=Math.max(0,now-runStats.startedAt);
  $('elapsed').textContent=elapsedLabel(elapsed);
  $('distance').textContent=(runStats.distanceMeters/1609.344).toFixed(2)+' mi';
  $('pace').textContent=runStats.lastFixAt&&now-runStats.lastFixAt<=180?paceLabel(elapsed,runStats.distanceMeters):'—';
}
setInterval(updateStats,1000);
function clearPoint(){if(marker)map.removeLayer(marker);if(circle)map.removeLayer(circle);marker=circle=point=null;$('time').textContent='—';}
function clearTrack(){track=[];if(actual)map.removeLayer(actual);actual=null;}
function message(text){$('overlay').hidden=false;$('overlay').textContent=text;}
function drawTrack(points,current){
  if(actual)map.removeLayer(actual);actual=null;track=points;
  const pts=[...points];if(current&&(!pts.length||current.tst>pts[pts.length-1].tst))pts.push(current);
  const segments=[];let segment=[];let previous;
  for(const p of pts){if(previous&&p.tst-previous.tst>180){if(segment.length)segments.push(segment);segment=[];}segment.push([p.lat,p.lon]);previous=p;}if(segment.length)segments.push(segment);
  if(segments.length)actual=L.polyline(segments,{color:'#197852',weight:5,opacity:.85}).addTo(map);
}
$('center').onclick=()=>{if(point)map.setView([point.lat,point.lon],15);else if(actual)map.fitBounds(actual.getBounds(),{padding:[35,35],maxZoom:16});};
$('routeFit').onclick=()=>{const bounds=planned?.getBounds();if(bounds?.isValid())map.fitBounds(bounds,{padding:[35,35],maxZoom:16});};
async function syncRoute(version){
  if(version===null){clearPlanned();routeVersion=null;$('routeName').textContent='No planned route';$('routeFit').disabled=true;return;}
  if(version===routeVersion)return;
  const r=await fetch(api+'/route',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('route');const route=await r.json();
  clearPlanned();
  if(route){planned=L.polyline(route.segments,{color:'#4968c9',weight:4,dashArray:'9 7',opacity:.85}).addTo(map);const miles=mileMarkers(route.segments);for(const checkpoint of miles.markers){L.marker(checkpoint.position,{icon:L.divIcon({className:'mile-marker',html:'<span>'+checkpoint.mile+'</span>',iconSize:[32,24],iconAnchor:[16,12]}),keyboard:true,title:'Mile '+checkpoint.mile,zIndexOffset:500}).bindTooltip('Mile '+checkpoint.mile+' along planned route').addTo(mileLayer);}$('routeName').textContent=route.name+' · '+miles.totalMiles.toFixed(1)+' mi'+(miles.truncated?' · first 1,000 mile markers shown':'');$('routeFit').disabled=false;routeVersion=route.version;if(!hasFitted){map.fitBounds(planned.getBounds(),{padding:[35,35],maxZoom:16});hasFitted=true;}}
  else{routeVersion=null;$('routeName').textContent='No planned route';$('routeFit').disabled=true;}
}
async function refresh(){if(busy||document.hidden)return;if(!api){message('Tracker setup in progress');$('status').textContent='Not connected yet';return;}busy=true;
try{
  const r=await fetch(api+'/location',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();const data=await r.json();runStats=data.stats||null;statsReceivedAt=performance.now();updateStats();
  let routeError=false;try{await syncRoute(data.routeVersion??null);}catch{clearPlanned();routeVersion=undefined;$('routeName').textContent='Route unavailable — retrying';$('routeFit').disabled=true;routeError=true;}
  const p=data.point;
  if(data.status==='paused'){clearPoint();clearTrack();$('badge').textContent='NOT SHARING';$('status').textContent='Paused';if(planned)$('overlay').hidden=true;else message(routeError?'Route unavailable — retrying':'Sharing is paused');return;}
  drawTrack(data.track||[],p);
  if(!p||Date.now()/1000-p.tst>900){clearPoint();$('badge').textContent='WAITING';$('status').textContent='Waiting for location';if(planned||actual)$('overlay').hidden=true;else message('Waiting for a fresh location');return;}
  point=p;$('overlay').hidden=true;$('badge').textContent=Date.now()/1000-p.tst>180?'LAST KNOWN':'SHARING';$('status').textContent=Date.now()/1000-p.tst>180?'Last known location':'Receiving updates';$('time').textContent=new Date(p.tst*1000).toLocaleTimeString();
  if(marker)marker.setLatLng([p.lat,p.lon]);else marker=L.circleMarker([p.lat,p.lon],{radius:9,color:'#fff',weight:3,fillColor:'#197852',fillOpacity:1}).addTo(map);
  if(circle)map.removeLayer(circle);if(p.acc!==null)circle=L.circle([p.lat,p.lon],{radius:p.acc,color:'#197852',weight:1,fillOpacity:.08}).addTo(map);
  if(!hasFitted){map.setView([p.lat,p.lon],15);hasFitted=true;}
}catch{runStats=null;updateStats();clearPoint();clearTrack();message('Connection unavailable — retrying automatically');$('status').textContent='Connection unavailable';$('badge').textContent='OFFLINE';}finally{busy=false;}}
refresh();setInterval(refresh,60000);document.addEventListener('visibilitychange',refresh);
setInterval(()=>{if(point&&Date.now()/1000-point.tst>900){clearPoint();$('status').textContent='Location expired';$('badge').textContent='WAITING';}},5000);
