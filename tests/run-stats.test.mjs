import assert from 'node:assert/strict';
import {measuredDistance,edgeDistance} from '../worker/run-metrics.mjs';
import {elapsedLabel,paceLabel} from '../docs/run-stats.mjs';
const lon=1609.344/6371008.8*180/Math.PI;
const a={lat:0,lon:0,tst:100},b={lat:0,lon,tst:160},c={lat:0,lon:0,tst:220};
assert.ok(Math.abs(measuredDistance({point:b},c,[a])-3218.688)<.001);
assert.ok(Math.abs(measuredDistance({point:b,distanceMeters:1609.344,distanceVersion:2},c,[])-3218.688)<.001);
assert.ok(edgeDistance(a,{...b,tst:400})>1609);assert.equal(edgeDistance(a,{...b,tst:1001}),0);assert.equal(edgeDistance(a,a),0);
assert.equal(paceLabel(600,1609.344),'10:00 /mi');
assert.equal(paceLabel(1200,3218.688),'10:00 /mi');
assert.equal(paceLabel(600,0),'—');assert.equal(paceLabel(600,100),'—');
assert.equal(elapsedLabel(3661),'01:01:01');assert.equal(elapsedLabel(-5),'00:00:00');
console.log('Passed: cumulative actual distance, existing-session migration, gaps, elapsed time and minutes-per-mile calculations.');

// Rebuild old undercounted totals from retained fixes when upgrading the gap policy.
assert.ok(measuredDistance({point:b,distanceMeters:0},null,[a])>1609);
