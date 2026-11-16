import {trackerRequest,retryDelay} from './tracker-request.mjs?v=1';
import {finishEstimate} from './finish-estimate.mjs?v=2';
import {nearestRoutePoint} from './route-progress.mjs?v=2';
import {elapsedLabel,paceLabel} from './run-stats.mjs?v=1';
import {mileMarkers} from './mile-markers.mjs?v=1';
const $=id=>document.getElementById(id);
const api=window.TRACKER_API?.replace(/\/$/,'');
const map=L.map('map',{minZoom:1,maxZoom:19}).setView([20,0],2);
let baseLayer;
function fallbackBasemap(){if(baseLayer)map.removeLayer(baseLayer);baseLayer=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{className:'quiet-tiles',maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);}
try{
  baseLayer=L.maplibreGL({style:'https://tiles.openfreemap.org/styles/dark',attributionControl:false}).addTo(map);
  const gl=baseLayer.getMaplibreMap();
  gl.on('load',()=>{for(const layer of gl.getStyle().layers){if(layer.type==='symbol'&&/poi|housenumber|shield|transit/i.test(layer.id))gl.setLayoutProperty(layer.id,'visibility','none');}});
  const credit='&copy; <a href="https://openfreemap.org/">OpenFreeMap</a> · <a href="https://openmaptiles.org/">OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
  map.attributionControl.addAttribution(credit);
  setTimeout(()=>{if(!gl.isStyleLoaded()){map.attributionControl.removeAttribution(credit);fallbackBasemap();}},15000);
}catch{fallbackBasemap();}
const mileLayer=L.layerGroup().addTo(map);
const progressLayer=L.layerGroup().addTo(map);let routeSegments=[],routeMatch=null;
function clearProgress(){progressLayer.clearLayers();routeMatch=null;for(const id of ['routeDistance','routePace','remaining','finishDuration','finishTime'])$(id).textContent='—';}
function updateProgress(location){
  clearProgress();const match=nearestRoutePoint(routeSegments,location);if(!match)return;
  routeMatch=match;$('routeDistance').textContent=match.alongMiles.toFixed(2)+' mi';$('remaining').textContent=(match.remainingMeters/1609.344).toFixed(2)+' mi';updateStats();
  L.polyline([[location.lat,location.lon],match.position],{color:'#dfb873',weight:2,dashArray:'4 5',opacity:.9,interactive:false}).addTo(progressLayer);
  L.circleMarker(match.position,{radius:4,color:'#dfb873',weight:2,fillColor:'#17211f',fillOpacity:1}).bindTooltip('Nearest route point · '+match.alongMiles.toFixed(2)+' mi along route').addTo(progressLayer);
}
function clearPlanned(){if(planned)map.removeLayer(planned);planned=null;mileLayer.clearLayers();routeSegments=[];clearProgress();}
let marker,circle,point,busy=false,planned=null,actual=null,routeVersion,hasFitted=false,track=[];
let runStats=null,statsReceivedAt=0,retryTimer=null,failures=0;
function retrySoon(){clearTimeout(retryTimer);retryTimer=setTimeout(refresh,retryDelay(++failures));}
function updateStats(){
  $('finishDuration').textContent='—';$('finishTime').textContent='—';
  if(!runStats){$('elapsed').textContent='—';$('pace').textContent='—';$('routePace').textContent='—';$('distance').textContent='—';$('savedStart').textContent='';$('distanceCoverage').textContent='';return;}
  const now=runStats.serverTime+(performance.now()-statsReceivedAt)/1000;
  if(now>=runStats.expiresAt){runStats=null;clearProgress();updateStats();return;}
  const elapsed=Math.max(0,now-runStats.startedAt);
  $('elapsed').textContent=elapsedLabel(elapsed);$('savedStart').textContent='Start '+new Date(runStats.startedAt*1000).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit',timeZoneName:'short'});
  $('distance').textContent=(runStats.distanceMeters/1609.344).toFixed(2)+' mi';$('distanceCoverage').textContent=runStats.distanceComplete===false?'Recording began after the race start. Earlier GPS distance is missing; average pace uses incomplete GPS coverage. Finish estimates use route progress.':'';
  $('pace').textContent=runStats.lastFixAt&&now-runStats.lastFixAt<=180?paceLabel(elapsed,runStats.distanceMeters):'—';
  $('routePace').textContent=routeMatch&&runStats.lastFixAt&&now-runStats.lastFixAt<=180?paceLabel(elapsed,routeMatch.alongMeters):'—';
  const estimate=finishEstimate(runStats,routeMatch,now);
  if(estimate){$('finishDuration').textContent=elapsedLabel(estimate.secondsRemaining);$('finishTime').textContent=new Date(estimate.finishAt*1000).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});}
}
setInterval(updateStats,1000);
function clearPoint(){clearProgress();if(marker)map.removeLayer(marker);if(circle)map.removeLayer(circle);marker=circle=point=null;$('time').textContent='—';}
function clearTrack(){track=[];if(actual)map.removeLayer(actual);actual=null;}
function message(text){$('overlay').hidden=false;$('overlay').textContent=text;}
function drawTrack(points,current){
  if(actual)map.removeLayer(actual);actual=null;track=points;
  const pts=[...points];if(current&&(!pts.length||current.tst>pts[pts.length-1].tst))pts.push(current);
  const segments=[];let segment=[];let previous;
  for(const p of pts){if(previous&&p.tst-previous.tst>900){if(segment.length)segments.push(segment);segment=[];}segment.push([p.lat,p.lon]);previous=p;}if(segment.length)segments.push(segment);
  if(segments.length)actual=L.polyline(segments,{color:'#6ed2a4',weight:4,opacity:.9}).addTo(map);
}
$('refreshNow').onclick=()=>refresh();
$('center').onclick=()=>{if(point)map.setView([point.lat,point.lon],15);else if(actual)map.fitBounds(actual.getBounds(),{padding:[35,35],maxZoom:16});};
$('routeFit').onclick=()=>{const bounds=planned?.getBounds();if(bounds?.isValid())map.fitBounds(bounds,{padding:[35,35],maxZoom:16});};
async function syncRoute(version){
  if(version===null){clearPlanned();routeVersion=null;$('routeName').textContent='No planned route';$('routeFit').disabled=true;return;}
  if(version===routeVersion)return;
  const route=await trackerRequest(api+'/route');
  clearPlanned();
  if(route){routeSegments=route.segments;planned=L.polyline(route.segments,{color:'#a5a0f5',weight:3,dashArray:'7 6',opacity:.8}).addTo(map);const miles=mileMarkers(route.segments);for(const checkpoint of miles.markers){L.marker(checkpoint.position,{icon:L.divIcon({className:'mile-marker',html:'<span>'+checkpoint.mile+'</span>',iconSize:[32,24],iconAnchor:[16,12]}),keyboard:true,title:'Mile '+checkpoint.mile,zIndexOffset:500}).bindTooltip('Mile '+checkpoint.mile+' along planned route').addTo(mileLayer);}$('routeName').textContent=route.name+' · '+miles.totalMiles.toFixed(1)+' mi'+(miles.truncated?' · first 1,000 mile markers shown':'');$('routeFit').disabled=false;routeVersion=route.version;if(!hasFitted){map.fitBounds(planned.getBounds(),{padding:[35,35],maxZoom:16});hasFitted=true;}}
  else{routeVersion=null;$('routeName').textContent='No planned route';$('routeFit').disabled=true;}
}
async function refresh(){if(busy||document.hidden)return;if(!api){message('Tracker setup in progress');$('status').textContent='Not connected yet';return;}busy=true;clearTimeout(retryTimer);
try{
  const data=await trackerRequest(api+'/location');runStats=data.stats||null;statsReceivedAt=performance.now();updateStats();
  let routeError=false;try{await syncRoute(data.routeVersion??null);}catch{clearPlanned();routeVersion=undefined;$('routeName').textContent='Route unavailable — retrying';$('routeFit').disabled=true;routeError=true;retrySoon();}
  if(!routeError)failures=0;
  const p=data.point;
  if(data.status==='paused'){clearPoint();clearTrack();$('badge').textContent='NOT SHARING';$('status').textContent='Paused';if(planned)$('overlay').hidden=true;else message(routeError?'Route unavailable — retrying':'Sharing is paused');return;}
  drawTrack(data.track||[],p);
  if(!p||Date.now()/1000-p.tst>900){clearPoint();$('badge').textContent='WAITING';$('status').textContent='Waiting for location';if(planned||actual)$('overlay').hidden=true;else message('Waiting for a fresh location');return;}
  point=p;updateProgress(p);$('overlay').hidden=true;$('badge').textContent=Date.now()/1000-p.tst>180?'LAST KNOWN':'SHARING';$('status').textContent=Date.now()/1000-p.tst>180?'Last known location':'Receiving updates';$('time').textContent=new Date(p.tst*1000).toLocaleTimeString();
  if(marker)marker.setLatLng([p.lat,p.lon]);else marker=L.circleMarker([p.lat,p.lon],{radius:9,color:'#13241e',weight:3,fillColor:'#6ed2a4',fillOpacity:1}).addTo(map);
  if(circle)map.removeLayer(circle);if(p.acc!==null)circle=L.circle([p.lat,p.lon],{radius:p.acc,color:'#6ed2a4',weight:1,fillOpacity:.08}).addTo(map);
  if(!hasFitted){map.setView([p.lat,p.lon],15);hasFitted=true;}
}catch(error){runStats=null;updateStats();clearPoint();clearTrack();const connection=error.kind==='connection';message(connection?'Connection interrupted — retrying shortly':'Unable to display update — retrying shortly');$('status').textContent=connection?'Reconnecting':'Display error';$('badge').textContent='OFFLINE';console.warn('Tracker update failed:',error.kind||'display',error.status||error.name);retrySoon();}finally{busy=false;}}
refresh();setInterval(refresh,60000);document.addEventListener('visibilitychange',refresh);
setInterval(()=>{if(point&&Date.now()/1000-point.tst>900){clearPoint();$('status').textContent='Location expired';$('badge').textContent='WAITING';}},5000);
