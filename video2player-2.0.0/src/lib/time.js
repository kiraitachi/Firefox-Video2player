const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const PLACEHOLDER = '--:--';

const isFiniteTime = (seconds) =>
  typeof seconds === 'number' && Number.isFinite(seconds);

// Hours only appear once the film is actually an hour long, so short clips
// read as "23:53" rather than "0:23:53".
export const formatClock = (seconds) => {
  if (!isFiniteTime(seconds)) return PLACEHOLDER;

  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / SECONDS_PER_HOUR);
  const minutes = Math.floor(total / SECONDS_PER_MINUTE) % SECONDS_PER_MINUTE;
  const secs = String(total % SECONDS_PER_MINUTE).padStart(2, '0');

  if (hours === 0) return `${minutes}:${secs}`;
  return `${hours}:${String(minutes).padStart(2, '0')}:${secs}`;
};

export const formatRemaining = (currentTime, duration) => {
  if (!isFiniteTime(currentTime) || !isFiniteTime(duration)) return PLACEHOLDER;
  return `-${formatClock(Math.max(0, duration - currentTime))}`;
};

export const formatOffset = (seconds) => {
  if (!isFiniteTime(seconds)) return PLACEHOLDER;
  const sign = seconds < 0 ? '-' : '+';
  return `${sign}${formatClock(Math.abs(seconds))}`;
};
