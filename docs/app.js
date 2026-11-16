import {trackerRequest,retryDelay} from './tracker-request.mjs?v=1';
import {finishEstimate} from './finish-estimate.mjs?v=3';
import {nearestRoutePoint} from './route-progress.mjs?v=3';
import {elapsedLabel,paceLabel} from './run-stats.mjs?v=1';
import {mileMarkers,pointAtMile} from './mile-markers.mjs?v=2';
import {completedRoute} from './course-progress.mjs?v=1';
import {renderElevation} from './elevation-profile.mjs?v=2';
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
const endpointLayer=L.layerGroup().addTo(map);
function drawEndpoints(segments){
  const parts=segments.filter(segment=>segment.length);if(!parts.length)return;
  const endpoints=[['start','START',parts[0][0],[94,20]],['finish','FINISH',parts[parts.length-1].at(-1),[0,20]]];
  for(const [kind,label,position,anchor] of endpoints){
    L.marker(position,{icon:L.divIcon({className:'route-endpoint '+kind,html:'<span class="endpoint-dot" aria-hidden="true"></span><span class="endpoint-label">'+label+'</span>',iconSize:[94,40],iconAnchor:anchor}),title:'Route '+label.toLowerCase(),keyboard:true,zIndexOffset:2500}).bindPopup('Planned route '+label.toLowerCase()).addTo(endpointLayer);
  }
}
const checkpointLayer=L.layerGroup().addTo(map),checkpointMarkers=new Map();
const completedLayer=L.layerGroup().addTo(map);
const progressLayer=L.layerGroup().addTo(map);let routeSegments=[],routeMatch=null,routeProfile=null;
function clearProgress(){progressLayer.clearLayers();completedLayer.clearLayers();routeMatch=null;renderElevation($('elevationProfile'),$('elevationCurrent'),routeProfile,null);for(const id of ['routeDistance','routePace','remaining','finishDuration','finishTime'])$(id).textContent='—';}
function updateProgress(location){
  clearProgress();const match=nearestRoutePoint(routeSegments,location);if(!match)return;
  routeMatch=match;const completed=completedRoute(routeSegments,match.alongMeters,match.position);if(completed.length)L.polyline(completed,{color:'#6ed2a4',weight:5,opacity:1,interactive:false}).addTo(completedLayer);renderElevation($('elevationProfile'),$('elevationCurrent'),routeProfile,match.alongMeters);$('routeDistance').textContent=match.alongMiles.toFixed(2)+' mi';$('remaining').textContent=(match.remainingMeters/1609.344).toFixed(2)+' mi';updateStats();
  L.polyline([[location.lat,location.lon],match.position],{color:'#dfb873',weight:2,dashArray:'4 5',opacity:.9,interactive:false}).addTo(progressLayer);
  L.circleMarker(match.position,{radius:4,color:'#dfb873',weight:2,fillColor:'#17211f',fillOpacity:1}).bindTooltip('Nearest route point · '+match.alongMiles.toFixed(2)+' mi along route').addTo(progressLayer);
}
function clearPlanned(){if(planned)map.removeLayer(planned);planned=null;mileLayer.clearLayers();endpointLayer.clearLayers();checkpointLayer.clearLayers();checkpointMarkers.clear();routeSegments=[];routeProfile=null;clearProgress();}
let marker,circle,point,busy=false,planned=null,actual=null,routeVersion,hasFitted=false,track=[];
let checkpoints=[],runStats=null,statsReceivedAt=0,retryTimer=null,failures=0;
function retrySoon(){clearTimeout(retryTimer);retryTimer=setTimeout(refresh,retryDelay(++failures));}
function renderCheckpoints(now){
  const list=$('checkpointRows');list.replaceChildren();
  const ids=new Set(checkpoints.map(cp=>cp.id));for(const [id,item] of checkpointMarkers){if(!ids.has(id)){checkpointLayer.removeLayer(item.marker);checkpointMarkers.delete(id);}}
  if(!checkpoints.length){const empty=document.createElement('p');empty.className='hint';empty.textContent='No checkpoints added.';list.append(empty);return;}
  for(const cp of checkpoints){
    const row=document.createElement('div'),info=document.createElement('div'),name=document.createElement('strong'),mile=document.createElement('span'),arrival=document.createElement('div'),status=document.createElement('small'),time=document.createElement('span');
    row.className='checkpoint-row';name.textContent=cp.name;mile.textContent='Mile '+cp.mile;mile.className='checkpoint-mile';arrival.className='checkpoint-arrival';
    let at=null;
    if(cp.crossedAt!==null){status.textContent='CROSSED';at=cp.crossedAt;row.classList.add('crossed');}
    else{
      const estimate=routeMatch?finishEstimate(runStats,{...routeMatch,remainingMeters:Math.max(0,cp.mile*1609.344-routeMatch.alongMeters)},now):null;
      status.textContent=estimate?'EST. ARRIVAL':'AWAITING UPDATES';at=estimate?.finishAt??null;
    }
    time.textContent=at===null?'—':new Date(at*1000).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:cp.crossedAt!==null?'2-digit':undefined,timeZoneName:'short'});
    let entry=checkpointMarkers.get(cp.id);
    if(!entry&&routeSegments.length){
      const position=pointAtMile(routeSegments,cp.mile);
      if(position){const label=document.createElement('span');label.textContent=cp.name+' · '+cp.mile+' mi';
        const pin=L.marker(position,{title:cp.name+' — Mile '+cp.mile,keyboard:true,zIndexOffset:1500}).bindTooltip(label,{permanent:true,direction:'top',offset:[0,-15],className:'checkpoint-map-label'}).bindPopup(document.createElement('div')).addTo(checkpointLayer);
        entry={marker:pin,crossed:null,mile:cp.mile,name:cp.name};checkpointMarkers.set(cp.id,entry);
      }
    }
    if(entry){
      if(entry.mile!==cp.mile||entry.name!==cp.name){const position=pointAtMile(routeSegments,cp.mile);if(position)entry.marker.setLatLng(position);const label=document.createElement('span');label.textContent=cp.name+' · '+cp.mile+' mi';entry.marker.setTooltipContent(label);entry.marker.options.title=cp.name+' — Mile '+cp.mile;const icon=entry.marker.getElement();if(icon){icon.title=entry.marker.options.title;icon.setAttribute('aria-label',entry.marker.options.title);}entry.mile=cp.mile;entry.name=cp.name;}
      const crossed=cp.crossedAt!==null;
      if(entry.crossed!==crossed){entry.marker.setIcon(L.divIcon({className:'checkpoint-map-marker'+(crossed?' crossed':''),html:'<span aria-hidden="true">◆</span>',iconSize:[28,28],iconAnchor:[14,14]}));entry.crossed=crossed;}
      const popup=document.createElement('div'),heading=document.createElement('strong'),detail=document.createElement('p'),when=document.createElement('p');
      heading.textContent=cp.name;detail.textContent='Mile '+cp.mile;when.textContent=status.textContent+': '+time.textContent;popup.append(heading,detail,when);entry.marker.setPopupContent(popup);
    }
    info.append(name,mile);arrival.append(status,time);row.append(info,arrival);list.append(row);
  }
}
function updateStats(){
  $('finishDuration').textContent='—';$('finishTime').textContent='—';
  if(!runStats){$('elapsed').textContent='—';$('pace').textContent='—';$('routePace').textContent='—';$('distance').textContent='—';$('savedStart').textContent='';$('distanceCoverage').textContent='';renderCheckpoints(NaN);return;}
  const now=runStats.serverTime+(performance.now()-statsReceivedAt)/1000;
  if(now>=runStats.expiresAt){runStats=null;clearProgress();updateStats();return;}
  renderCheckpoints(now);
  const elapsed=Math.max(0,now-runStats.startedAt);
  $('elapsed').textContent=elapsedLabel(elapsed);$('savedStart').textContent='Start '+new Date(runStats.startedAt*1000).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit',timeZoneName:'short'});
  $('distance').textContent=(runStats.distanceMeters/1609.344).toFixed(2)+' mi';$('distanceCoverage').textContent=runStats.distanceComplete===false?'Recording began after the race start. Earlier GPS distance is missing; average pace uses incomplete GPS coverage. Finish estimates use route progress.':'';
  $('pace').textContent=!runStats.paused&&runStats.lastFixAt&&now-runStats.lastFixAt<=180?paceLabel(elapsed,runStats.distanceMeters):'—';
  $('routePace').textContent=routeMatch&&!runStats.paused&&runStats.lastFixAt&&now-runStats.lastFixAt<=180?paceLabel(elapsed,routeMatch.alongMeters):'—';
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
  for(const p of pts){if(previous&&(p.breakBefore||p.tst-previous.tst>900)){if(segment.length)segments.push(segment);segment=[];}segment.push([p.lat,p.lon]);previous=p;}if(segment.length)segments.push(segment);
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
  if(route){routeSegments=route.segments;routeProfile=route;renderElevation($('elevationProfile'),$('elevationCurrent'),routeProfile,null);drawEndpoints(route.segments);planned=L.polyline(route.segments,{color:'#a5a0f5',weight:3,dashArray:'7 6',opacity:.8}).addTo(map);const miles=mileMarkers(route.segments);for(const checkpoint of miles.markers){L.marker(checkpoint.position,{icon:L.divIcon({className:'mile-marker',html:'<span>'+checkpoint.mile+'</span>',iconSize:[32,24],iconAnchor:[16,12]}),keyboard:true,title:'Mile '+checkpoint.mile,zIndexOffset:500}).bindTooltip('Mile '+checkpoint.mile+' along planned route').addTo(mileLayer);}$('routeName').textContent=route.name+' · '+miles.totalMiles.toFixed(1)+' mi'+(miles.truncated?' · first 1,000 mile markers shown':'');$('routeFit').disabled=false;routeVersion=route.version;if(!hasFitted){map.fitBounds(planned.getBounds(),{padding:[35,35],maxZoom:16});hasFitted=true;}}
  else{routeVersion=null;$('routeName').textContent='No planned route';$('routeFit').disabled=true;}
}
async function refresh(){if(busy||document.hidden)return;if(!api){message('Tracker setup in progress');$('status').textContent='Not connected yet';return;}busy=true;clearTimeout(retryTimer);
try{
  const data=await trackerRequest(api+'/location');checkpoints=data.checkpoints||[];runStats=data.stats||null;statsReceivedAt=performance.now();updateStats();
  let routeError=false;try{await syncRoute(data.routeVersion??null);}catch{clearPlanned();routeVersion=undefined;$('routeName').textContent='Route unavailable — retrying';$('routeFit').disabled=true;routeError=true;retrySoon();}
  if(!routeError)failures=0;
  renderCheckpoints(runStats?runStats.serverTime+(performance.now()-statsReceivedAt)/1000:NaN);
  const p=data.point;
  if(data.status==='paused'){clearPoint();clearTrack();$('badge').textContent='NOT SHARING';$('status').textContent='Paused';if(planned)$('overlay').hidden=true;else message(routeError?'Route unavailable — retrying':'Sharing is paused');return;}
  drawTrack(data.track||[],p);
  if(data.status==='session-paused'){clearPoint();const last=(data.track||[]).at(-1);if(last)updateProgress(last);$('badge').textContent='PAUSED';$('status').textContent='Session paused';$('time').textContent=runStats?.lastFixAt?new Date(runStats.lastFixAt*1000).toLocaleTimeString():'—';if(planned||actual)$('overlay').hidden=true;else message('Session paused');return;}
  if(!p||Date.now()/1000-p.tst>900){clearPoint();$('badge').textContent='WAITING';$('status').textContent='Waiting for location';if(planned||actual)$('overlay').hidden=true;else message('Waiting for a fresh location');return;}
  point=p;updateProgress(p);$('overlay').hidden=true;$('badge').textContent=Date.now()/1000-p.tst>180?'LAST KNOWN':'SHARING';$('status').textContent=Date.now()/1000-p.tst>180?'Last known location':'Receiving updates';$('time').textContent=new Date(p.tst*1000).toLocaleTimeString();
  if(marker)marker.setLatLng([p.lat,p.lon]);else marker=L.circleMarker([p.lat,p.lon],{radius:9,color:'#13241e',weight:3,fillColor:'#6ed2a4',fillOpacity:1}).addTo(map);
  if(circle)map.removeLayer(circle);if(p.acc!==null)circle=L.circle([p.lat,p.lon],{radius:p.acc,color:'#6ed2a4',weight:1,fillOpacity:.08}).addTo(map);
  if(!hasFitted){map.setView([p.lat,p.lon],15);hasFitted=true;}
}catch(error){runStats=null;updateStats();clearPoint();clearTrack();const connection=error.kind==='connection';message(connection?'Connection interrupted — retrying shortly':'Unable to display update — retrying shortly');$('status').textContent=connection?'Reconnecting':'Display error';$('badge').textContent='OFFLINE';console.warn('Tracker update failed:',error.kind||'display',error.status||error.name);retrySoon();}finally{busy=false;}}
refresh();setInterval(refresh,60000);document.addEventListener('visibilitychange',refresh);
setInterval(()=>{if(point&&Date.now()/1000-point.tst>900){clearPoint();$('status').textContent='Location expired';$('badge').textContent='WAITING';}},5000);
