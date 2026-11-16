import assert from 'node:assert/strict';
import {finishEstimate} from '../docs/finish-estimate.mjs';
const now=10000,stats={startedAt:now-1200,expiresAt:now+20000,lastFixAt:now-10,distanceMeters:0};
const match={alongMeters:2*1609.344,remainingMeters:8*1609.344};
let r=finishEstimate(stats,match,now);assert.equal(r.secondsRemaining,4800);assert.equal(r.finishAt,now+4800);
// GPS travel no longer changes the estimate; projected route progress does.
assert.equal(finishEstimate({...stats,distanceMeters:100000},match,now).secondsRemaining,4800);
assert.equal(finishEstimate(stats,{...match,alongMeters:4*1609.344},now).secondsRemaining,2400);
assert.equal(finishEstimate(stats,{...match,alongMeters:0},now),null);
assert.equal(finishEstimate(stats,{...match,alongMeters:100},now),null);
assert.equal(finishEstimate({...stats,lastFixAt:now-181},match,now),null);
assert.equal(finishEstimate({...stats,expiresAt:now},match,now),null);
assert.equal(finishEstimate(stats,null,now),null);
assert.equal(finishEstimate(stats,{...match,remainingMeters:0},now).secondsRemaining,0);
console.log('Passed: route-based finish duration and clock time, independence from GPS distance, route-progress threshold, stale fixes and expiry.');
