/**
 * Subathon timer arithmetic — pure, no DB, so it runs under `node --test`.
 *
 * A tip either ADDS time (the normal case) or, if the creator allows it,
 * REDUCES time ("sabotage"). Two guard rails: adds never exceed `maxSeconds`
 * from now, reduces never push the clock below `floorSeconds` from now. The
 * floor only binds the reduce side — a supporter can always add time back,
 * which is the whole tug-of-war.
 */

export type TimerConfig = {
  bahtPerUnit: number;
  secondsPerUnit: number;
  maxSeconds: number | null;
  reduceBahtPerUnit: number;
  reduceSecondsPerUnit: number;
  floorSeconds: number;
};

/** running = endsAtMs set · paused = remaining set · stopped = neither. */
export type TimerState = {
  endsAtMs: number | null;
  remaining: number | null;
};

/** Whole seconds a tip of `amount` baht is worth at the given rate. */
export function tipSeconds(
  amount: number,
  bahtPerUnit: number,
  secondsPerUnit: number,
): number {
  if (!(bahtPerUnit > 0) || !(secondsPerUnit > 0) || !(amount > 0)) return 0;
  return Math.max(0, Math.round((amount * secondsPerUnit) / bahtPerUnit));
}

/**
 * The timer state after applying one tip, or `null` when nothing changes
 * (timer stopped, already expired, amount too small, or a reduce that is
 * already at/below the floor). Results are whole seconds.
 */
export function nextTimerState(
  state: TimerState,
  cfg: TimerConfig,
  amount: number,
  reduce: boolean,
  nowMs: number,
): TimerState | null {
  const sec = reduce
    ? tipSeconds(amount, cfg.reduceBahtPerUnit, cfg.reduceSecondsPerUnit)
    : tipSeconds(amount, cfg.bahtPerUnit, cfg.secondsPerUnit);
  if (sec <= 0) return null;

  const cap = cfg.maxSeconds && cfg.maxSeconds > 0 ? cfg.maxSeconds : null;
  const floor = Math.max(0, cfg.floorSeconds);

  if (state.endsAtMs != null) {
    // Running — move the end instant. Expired clocks are never revived.
    const endsSec = Math.round(state.endsAtMs / 1000);
    const nowSec = Math.round(nowMs / 1000);
    if (endsSec <= nowSec) return null;

    let next: number;
    if (reduce) {
      const floorAt = nowSec + floor;
      if (endsSec <= floorAt) return null;
      next = Math.max(endsSec - sec, floorAt);
    } else {
      next = endsSec + sec;
      if (cap !== null) next = Math.min(next, nowSec + cap);
    }
    return { endsAtMs: next * 1000, remaining: null };
  }

  if (state.remaining != null) {
    // Paused — adjust the banked seconds.
    let next: number;
    if (reduce) {
      if (state.remaining <= floor) return null;
      next = Math.max(state.remaining - sec, floor);
    } else {
      next = state.remaining + sec;
      if (cap !== null) next = Math.min(next, cap);
    }
    return { endsAtMs: null, remaining: next };
  }

  // Stopped — the subathon has not started, nothing accrues.
  return null;
}
