export type Schedule = {
  id: string;
  time: string;
  duration: number;
  enabled: boolean;
  createdAt?: number;
};

export type FeedingPeriod = 'morning' | 'afternoon' | 'evening';

export const FEEDING_PERIODS: {
  key: FeedingPeriod;
  label: string;
  range: string;
  start: string;
  end: string;
  defaultTime: string;
}[] = [
  { key: 'morning', label: 'Morning', range: '00:00–11:59', start: '00:00', end: '11:59', defaultTime: '06:00' },
  { key: 'afternoon', label: 'Afternoon', range: '12:00–17:59', start: '12:00', end: '17:59', defaultTime: '12:00' },
  { key: 'evening', label: 'Evening', range: '18:00–23:59', start: '18:00', end: '23:59', defaultTime: '18:00' },
];

export const DEFAULT_RINSE_DELAY_MINUTES = 30;
export const DEFAULT_RINSE_DURATION_SECONDS = 30;
export const MIN_RINSE_DELAY_MINUTES = 5;
export const MAX_RINSE_DELAY_MINUTES = 120;
export const MAX_LINKED_RINSE_DURATION_SECONDS = 60;

function timeToMinutes(time: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function periodForTime(time: string): FeedingPeriod | null {
  const minutes = timeToMinutes(time);
  if (minutes === null) return null;
  if (minutes < 12 * 60) return 'morning';
  if (minutes < 18 * 60) return 'afternoon';
  return 'evening';
}

export function calculateRinseTime(
  feedingTime: string,
  feedingDurationSeconds: number,
  delayMinutes: number,
): string {
  const feedingMinutes = timeToMinutes(feedingTime);
  if (feedingMinutes === null) throw new Error('Feeding time must use HH:MM.');
  if (!Number.isInteger(feedingDurationSeconds) || feedingDurationSeconds < 1 || feedingDurationSeconds > 60) {
    throw new Error('Feeding duration must be 1–60 seconds.');
  }
  if (!Number.isInteger(delayMinutes) || delayMinutes < MIN_RINSE_DELAY_MINUTES || delayMinutes > MAX_RINSE_DELAY_MINUTES) {
    throw new Error('Rinse delay must be 5–120 minutes.');
  }

  const totalSeconds = feedingMinutes * 60 + feedingDurationSeconds + delayMinutes * 60;
  const roundedMinute = Math.ceil(totalSeconds / 60);
  const minuteOfDay = ((roundedMinute % 1440) + 1440) % 1440;
  return `${String(Math.floor(minuteOfDay / 60)).padStart(2, '0')}:${String(minuteOfDay % 60).padStart(2, '0')}`;
}

export function inferRinseDelayMinutes(feeding: Schedule, rinse: Schedule): number | null {
  for (let delay = MIN_RINSE_DELAY_MINUTES; delay <= MAX_RINSE_DELAY_MINUTES; delay += 1) {
    if (calculateRinseTime(feeding.time, feeding.duration, delay) === rinse.time) return delay;
  }
  return null;
}

type ScheduledAction = {
  id: string;
  kind: 'Feeding' | 'Rinse';
  time: string;
  duration: number;
};

function actionsOverlap(first: ScheduledAction, second: ScheduledAction) {
  const firstMinutes = timeToMinutes(first.time);
  const secondMinutes = timeToMinutes(second.time);
  if (firstMinutes === null || secondMinutes === null) return false;
  const daySeconds = 24 * 60 * 60;
  const firstStart = firstMinutes * 60;
  const secondStart = secondMinutes * 60;

  return [-daySeconds, 0, daySeconds].some((offset) => {
    const shiftedSecondStart = secondStart + offset;
    return firstStart < shiftedSecondStart + second.duration
      && shiftedSecondStart < firstStart + first.duration;
  });
}

export function findScheduleConflict(feeds: Schedule[], rinses: Schedule[]): string | null {
  const seenFeedTimes = new Set<string>();
  for (const feed of feeds) {
    if (seenFeedTimes.has(feed.time)) return `A feeding routine already exists at ${feed.time}.`;
    seenFeedTimes.add(feed.time);
  }

  const feedsById = new Map(feeds.map((feed) => [feed.id, feed]));
  const actions: ScheduledAction[] = [];
  for (const feed of feeds) {
    if (!feed.enabled) continue;
    actions.push({ id: feed.id, kind: 'Feeding', time: feed.time, duration: feed.duration });
  }
  for (const rinse of rinses) {
    const linkedFeeding = feedsById.get(rinse.id);
    if (linkedFeeding ? linkedFeeding.enabled : rinse.enabled) {
      actions.push({ id: rinse.id, kind: 'Rinse', time: rinse.time, duration: rinse.duration });
    }
  }

  for (let firstIndex = 0; firstIndex < actions.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < actions.length; secondIndex += 1) {
      const first = actions[firstIndex];
      const second = actions[secondIndex];
      if (actionsOverlap(first, second)) {
        return `${first.kind} at ${first.time} overlaps ${second.kind.toLowerCase()} at ${second.time}. Adjust the schedule before saving.`;
      }
    }
  }
  return null;
}
