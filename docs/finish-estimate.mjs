export function finishEstimate(stats,match,now){
  if(!stats||!match||!Number.isFinite(now)||now>=stats.expiresAt||!Number.isFinite(stats.lastFixAt)||now-stats.lastFixAt>180)return null;
  const elapsed=now-stats.startedAt;
  if(elapsed<=0||!Number.isFinite(stats.distanceMeters)||stats.distanceMeters<160.9344||!Number.isFinite(match.remainingMeters))return null;
  const secondsRemaining=Math.max(0,match.remainingMeters)*elapsed/stats.distanceMeters;
  return {secondsRemaining,finishAt:now+secondsRemaining};
}
