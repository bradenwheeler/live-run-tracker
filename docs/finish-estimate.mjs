export function finishEstimate(stats,match,now){
  if(!stats||stats.paused||!match||!Number.isFinite(now)||now>=stats.expiresAt||!Number.isFinite(stats.lastFixAt)||now-stats.lastFixAt>180)return null;
  const elapsed=now-stats.startedAt;
  if(elapsed<=0||!Number.isFinite(match.alongMeters)||match.alongMeters<160.9344||!Number.isFinite(match.remainingMeters))return null;
  const secondsRemaining=Math.max(0,match.remainingMeters)*elapsed/match.alongMeters;
  return {secondsRemaining,finishAt:now+secondsRemaining};
}
