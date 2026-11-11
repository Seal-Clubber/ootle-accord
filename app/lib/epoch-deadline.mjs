// Both networks target about 20 minutes per epoch: Mainnet 10 × 120s, Esmeralda 80 × 15s.
const EPOCH_MINUTES = 20;
const EPOCH_MS = EPOCH_MINUTES * 60 * 1000;

export function formatDeadlineRemaining(epoch, deadlineEpoch) {
  const remaining = BigInt(deadlineEpoch) - BigInt(epoch);
  if (remaining <= 0n) return 'Expired';
  const minutes = remaining * BigInt(EPOCH_MINUTES);
  const hours = minutes / 60n;
  const days = hours / 24n;
  if (days > 0n) {
    const remainingHours = hours % 24n;
    return `${days} ${days === 1n ? 'day' : 'days'}` + (remainingHours ? ` ${remainingHours} hr` : '');
  }
  const remainingMinutes = minutes % 60n;
  if (hours > 0n) return `${hours} hr` + (remainingMinutes ? ` ${remainingMinutes} min` : '');
  return `${minutes} min`;
}

export function estimateDeadlineEpoch(localDateTime, snapshot, now = Date.now()) {
  const date = new Date(localDateTime);
  const deadline = date.getTime();
  if (!Number.isFinite(deadline)) throw new Error('Choose a valid review deadline.');
  // Local times skipped during a daylight-saving change are normalized by Date.
  const local = new Date(deadline - date.getTimezoneOffset() * 60_000).toISOString().slice(0, -8);
  if (local !== localDateTime) throw new Error('Choose a time that exists in your time zone.');
  if (deadline <= now) throw new Error('Choose a review deadline in the future.');
  if (!snapshot) throw new Error('Waiting for the current epoch to calculate the deadline.');
  const epoch = snapshot.epoch + Math.max(1, Math.ceil((deadline - snapshot.observedAt) / EPOCH_MS));
  if (!Number.isSafeInteger(epoch)) throw new Error('Choose an earlier review deadline.');
  return String(epoch);
}
