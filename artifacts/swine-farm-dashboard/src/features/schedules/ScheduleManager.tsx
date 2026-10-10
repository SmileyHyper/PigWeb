import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'wouter';
import {
  ArrowRight, CalendarClock, Check, Clock3, Droplets, Leaf, Link2, LoaderCircle, Moon,
  Pencil, Plus, RefreshCw, Sun, Sunrise, Trash2, Waves, X,
} from 'lucide-react';
import {
  createPushKey, firebaseConfigured, readCollection, subscribeToCollection,
  updateMultiplePaths,
} from '@/lib/firebase';
import {
  calculateRinseTime, DEFAULT_RINSE_DELAY_MINUTES, DEFAULT_RINSE_DURATION_SECONDS,
  FEEDING_PERIODS, findScheduleConflict, inferRinseDelayMinutes,
  MAX_LINKED_RINSE_DURATION_SECONDS, MAX_RINSE_DELAY_MINUTES, MIN_RINSE_DELAY_MINUTES,
  periodForTime, type FeedingPeriod, type Schedule,
} from './schedule-sync';

type SchedulePageKind = 'feeding' | 'rinse';
type LegacyAction = '' | 'link' | 'remove';
type LegacyChoice = {
  action: LegacyAction;
  feedId: string;
  delay: number;
  duration: number;
};
type RinseSettings = { delay: number; duration: number };

const SERVER_TIMESTAMP = { '.sv': 'timestamp' };
const demoFeeds: Schedule[] = [
  { id: 'demo-morning', time: '06:00', duration: 10, enabled: true },
  { id: 'demo-midday', time: '12:15', duration: 12, enabled: true },
  { id: 'demo-evening', time: '17:45', duration: 10, enabled: true },
];
const demoRinses: Schedule[] = demoFeeds.map((feed) => ({
  id: feed.id,
  time: calculateRinseTime(feed.time, feed.duration, DEFAULT_RINSE_DELAY_MINUTES),
  duration: DEFAULT_RINSE_DURATION_SECONDS,
  enabled: feed.enabled,
}));

function useScheduleData() {
  const [feeds, setFeeds] = useState<Schedule[]>(firebaseConfigured ? [] : demoFeeds);
  const [rinses, setRinses] = useState<Schedule[]>(firebaseConfigured ? [] : demoRinses);
  const [loading, setLoading] = useState(firebaseConfigured);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!firebaseConfigured) return undefined;

    let active = true;
    let feedLoaded = false;
    let rinseLoaded = false;
    setLoading(true);
    setError('');
    const updateReadyState = () => {
      if (active && feedLoaded && rinseLoaded) setLoading(false);
    };
    const onLoadError = (cause: Error) => {
      if (!active) return;
      setError(cause.message || 'Firebase could not load the schedule records.');
      setLoading(false);
    };
    const stopFeeds = subscribeToCollection<Schedule>('/feedingSchedules', (value) => {
      if (!active) return;
      setFeeds(value);
      feedLoaded = true;
      updateReadyState();
    }, onLoadError);
    const stopRinses = subscribeToCollection<Schedule>('/rinseSchedules', (value) => {
      if (!active) return;
      setRinses(value);
      rinseLoaded = true;
      updateReadyState();
    }, onLoadError);

    return () => {
      active = false;
      stopFeeds();
      stopRinses();
    };
  }, []);

  return { feeds, setFeeds, rinses, setRinses, loading, error };
}

const PERIOD_ICONS = { morning: Sunrise, afternoon: Sun, evening: Moon } as const;

function formatTime12Hour(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return time;
  }

  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;

  return `${displayHours}:${String(minutes).padStart(2, '0')} ${period}`;
}

function periodSpan(times: string[]) {
  if (!times.length) return null;

  const sorted = [...times].sort();

  return sorted[0] === sorted[sorted.length - 1]
    ? formatTime12Hour(sorted[0])
    : `${formatTime12Hour(sorted[0])}–${formatTime12Hour(sorted[sorted.length - 1])}`;
}

function ScheduleHeading({ kind, action }: { kind: SchedulePageKind; action?: ReactNode }) {
  return (
    <header className="schedule-heading">
      <div className="heading-copy">
        <p className="eyebrow">Routine management</p>
        <h1>{kind === 'feeding' ? 'Feeding schedule' : 'Rinse schedule'}</h1>
        <p className="lede">Daily routines, grouped by the part of the day they belong to.</p>
      </div>
      <div className="schedule-heading-actions">
        <nav className="schedule-tabs" aria-label="Schedule type">
          <Link href="/feeding" className={kind === 'feeding' ? 'active' : ''} aria-current={kind === 'feeding' ? 'page' : undefined}>
            <Leaf size={14} /> Feeding
          </Link>
          <Link href="/rinse" className={kind === 'rinse' ? 'active' : ''} aria-current={kind === 'rinse' ? 'page' : undefined}>
            <Waves size={14} /> Rinse
          </Link>
        </nav>
        {action}
      </div>
    </header>
  );
}

function ColumnIntro({ kind }: { kind: SchedulePageKind }) {
  return (
    <div className="column-intro">
      <div>
        <h2>{kind === 'feeding' ? 'Feed routines by day part' : 'Linked rinse routines by day part'}</h2>
        <p>{kind === 'feeding' ? 'Each feeding card includes its scheduled rinse.' : 'Each rinse card names the feeding routine it follows.'}</p>
      </div>
    </div>
  );
}

function DaypartHead({ period, count, span }: {
  period: (typeof FEEDING_PERIODS)[number];
  count: number;
  span: string | null;
}) {
  const Icon = PERIOD_ICONS[period.key];
  return (
    <header className="daypart-head">
      <div>
        <h2 className="daypart-name" id={`daypart-${period.key}`}>
          <span className="daypart-symbol"><Icon size={15} strokeWidth={1.8} /></span>
          {period.label}
        </h2>
        {span && <p className="daypart-range">{span}</p>}
      </div>
      <span className="routine-count">{count} {count === 1 ? 'routine' : 'routines'}</span>
    </header>
  );
}

function ScheduleSkeleton() {
  return (
    <div className="daypart-grid" role="status" aria-busy="true" aria-label="Loading feeding and rinse schedules">
      {FEEDING_PERIODS.map((period) => (
        <section className="daypart-column" key={period.key}>
          <div className="skeleton skeleton-head" />
          <div className="routine-stack">
            {[0, 1, 2].map((item) => <div className="skeleton skeleton-card" key={item} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

function InlineAlert({ children, kind = 'error' }: { children: ReactNode; kind?: 'error' | 'warning' | 'info' }) {
  return <div className={`schedule-alert schedule-alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>;
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="toast" role="status">
      {message}
      <button type="button" onClick={onClose} aria-label="Dismiss message"><X size={13} /></button>
    </div>
  );
}

function makeSchedule(feed: Schedule, delay: number, duration: number, createdAt?: number): Schedule {
  return {
    id: feed.id,
    time: calculateRinseTime(feed.time, feed.duration, delay),
    duration,
    enabled: feed.enabled,
    ...(createdAt === undefined ? {} : { createdAt }),
  };
}

function scheduleFields(schedule: Schedule) {
  return { time: schedule.time, duration: schedule.duration, enabled: schedule.enabled };
}

function writeChangedScheduleFields(
  updates: Record<string, unknown>,
  path: string,
  oldValue: Schedule,
  newValue: Schedule,
) {
  for (const field of ['time', 'duration', 'enabled'] as const) {
    if (oldValue[field] !== newValue[field]) updates[`${path}/${field}`] = newValue[field];
  }
}

function putSchedule(updates: Record<string, unknown>, path: string, schedule: Schedule, isNew: boolean) {
  updates[path] = {
    ...scheduleFields(schedule),
    createdAt: isNew ? SERVER_TIMESTAMP : schedule.createdAt ?? SERVER_TIMESTAMP,
  };
}

function appendRinseLogs(updates: Record<string, unknown>, messages: string[]) {
  if (!firebaseConfigured) return;
  for (const message of messages) {
    const logId = createPushKey('/logs');
    updates[`logs/${logId}`] = {
      type: 'RINSE',
      message,
      status: 'SUCCESS',
      timestamp: SERVER_TIMESTAMP,
    };
  }
}

async function commitScheduleUpdate(updates: Record<string, unknown>, logMessages: string[]) {
  if (!firebaseConfigured) return;
  appendRinseLogs(updates, logMessages);
  await updateMultiplePaths(updates);
}

function upsertSchedule(items: Schedule[], next: Schedule) {
  return [...items.filter((item) => item.id !== next.id), next];
}

function scheduleFingerprint(items: Schedule[]) {
  return [...items]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((item) => `${item.id}:${item.time}:${item.duration}:${item.enabled}:${item.createdAt ?? ''}`)
    .join('|');
}

function isLinkedRinseDuration(value: number) {
  return Number.isInteger(value) && value >= 1 && value <= MAX_LINKED_RINSE_DURATION_SECONDS;
}

function getRinseDetails(feed: Schedule, rinse?: Schedule) {
  return rinse
    ? `${rinse.duration} sec · ${inferRinseDelayMinutes(feed, rinse) ?? 'needs setup'} min delay`
    : 'Needs linked rinse';
}

function newDemoId() {
  return `demo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function ScheduleManager({ kind }: { kind: SchedulePageKind }) {
  const {
    feeds, setFeeds, rinses, setRinses, loading, error: loadError,
  } = useScheduleData();
  const [feedModal, setFeedModal] = useState<{ id: string | null; period: FeedingPeriod | null } | null>(null);
  const [rinseModalId, setRinseModalId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [pageError, setPageError] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);

  const feedsById = useMemo(() => new Map(feeds.map((feed) => [feed.id, feed])), [feeds]);
  const rinsesById = useMemo(() => new Map(rinses.map((rinse) => [rinse.id, rinse])), [rinses]);
  const orphanRinses = useMemo(
    () => rinses.filter((rinse) => !feedsById.has(rinse.id)).sort((a, b) => a.time.localeCompare(b.time)),
    [feedsById, rinses],
  );
  const missingRinses = useMemo(() => feeds.filter((feed) => !rinsesById.has(feed.id)), [feeds, rinsesById]);
  const linkedRinseRepairs = useMemo(() => feeds.flatMap((feed) => {
    const rinse = rinsesById.get(feed.id);
    if (!rinse) return [];
    const delay = inferRinseDelayMinutes(feed, rinse);
    return delay === null || !isLinkedRinseDuration(rinse.duration) || rinse.enabled !== feed.enabled
      ? [{ feed, rinse, delay }]
      : [];
  }), [feeds, rinsesById]);
  const migrationNeeded = orphanRinses.length > 0 || missingRinses.length > 0 || linkedRinseRepairs.length > 0;
  const controlsLocked = busy || loading || Boolean(loadError);

  const [legacyChoices, setLegacyChoices] = useState<Record<string, LegacyChoice>>({});
  const [missingSettings, setMissingSettings] = useState<Record<string, RinseSettings>>({});
  const orphanSignature = orphanRinses.map((rinse) => rinse.id).join('|');
  const missingSignature = missingRinses.map((feed) => feed.id).join('|');

  useEffect(() => {
    setLegacyChoices((current) => Object.fromEntries(orphanRinses.map((rinse) => [
      rinse.id,
      current[rinse.id] ?? {
        action: '',
        feedId: '',
        delay: DEFAULT_RINSE_DELAY_MINUTES,
        duration: isLinkedRinseDuration(rinse.duration) ? rinse.duration : DEFAULT_RINSE_DURATION_SECONDS,
      },
    ])));
  }, [orphanSignature]);

  useEffect(() => {
    setMissingSettings((current) => Object.fromEntries(missingRinses.map((feed) => [
      feed.id,
      current[feed.id] ?? {
        delay: DEFAULT_RINSE_DELAY_MINUTES,
        duration: DEFAULT_RINSE_DURATION_SECONDS,
      },
    ])));
  }, [missingSignature]);

  const feedModalRecord = feedModal?.id ? feedsById.get(feedModal.id) : undefined;
  const rinseModalFeed = rinseModalId ? feedsById.get(rinseModalId) : undefined;
  const rinseModalRecord = rinseModalId ? rinsesById.get(rinseModalId) : undefined;

  const closeFeedModal = () => {
    setFeedModal(null);
    setFormError('');
  };
  const openFeedModal = (id: string | null, period: FeedingPeriod | null = null) => {
    setFormError('');
    setPageError('');
    setFeedModal({ id, period });
  };
  const openRinseModal = (feedId: string) => {
    setFormError('');
    setPageError('');
    setRinseModalId(feedId);
  };

  const saveFeed = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (controlsLocked) return;
    const data = new FormData(event.currentTarget);
    const time = String(data.get('time'));
    const duration = Number(data.get('duration'));
    const selectedPeriod = feedModal?.period
      ? FEEDING_PERIODS.find((period) => period.key === feedModal.period)
      : undefined;

    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      setFormError('Enter a valid 24-hour time.');
      return;
    }
    if (!Number.isInteger(duration) || duration < 1 || duration > 60) {
      setFormError('Feeding duration must be between 1 and 60 seconds.');
      return;
    }
    if (selectedPeriod && (time < selectedPeriod.start || time > selectedPeriod.end)) {
      setFormError(`Choose a time within ${selectedPeriod.label} (${selectedPeriod.range}).`);
      return;
    }
    if (feeds.some((feed) => feed.time === time && feed.id !== feedModal?.id)) {
      setFormError(`A feeding routine already exists at ${time}.`);
      return;
    }

    const currentFeed = feedModal?.id ? feedsById.get(feedModal.id) : undefined;
    const id = currentFeed?.id ?? (firebaseConfigured ? createPushKey('/feedingSchedules') : newDemoId());
    const currentRinse = rinsesById.get(id);
    let delay = DEFAULT_RINSE_DELAY_MINUTES;
    if (currentFeed && currentRinse) {
      const inferredDelay = inferRinseDelayMinutes(currentFeed, currentRinse);
      if (inferredDelay === null) {
        setFormError('This linked rinse has no valid 5–120 minute delay. Edit it in Rinse cycles before changing its feeding.');
        return;
      }
      if (!isLinkedRinseDuration(currentRinse.duration)) {
        setFormError('This linked rinse duration must be corrected to 1–60 seconds in Rinse cycles first.');
        return;
      }
      delay = inferredDelay;
    }

    const nextFeed: Schedule = {
      id,
      time,
      duration,
      enabled: currentFeed?.enabled ?? true,
      ...(currentFeed?.createdAt === undefined ? {} : { createdAt: currentFeed.createdAt }),
    };
    const nextRinse = makeSchedule(
      nextFeed,
      delay,
      currentRinse && isLinkedRinseDuration(currentRinse.duration)
        ? currentRinse.duration
        : DEFAULT_RINSE_DURATION_SECONDS,
      currentRinse?.createdAt,
    );
    const nextFeeds = currentFeed
      ? feeds.map((feed) => feed.id === id ? nextFeed : feed)
      : [...feeds, nextFeed];
    const nextRinses = currentRinse
      ? rinses.map((rinse) => rinse.id === id ? nextRinse : rinse)
      : [...rinses, nextRinse];
    const conflict = findScheduleConflict(nextFeeds, nextRinses);
    if (conflict) {
      setFormError(conflict);
      return;
    }

    const updates: Record<string, unknown> = {};
    const logMessages: string[] = [];
    if (!currentFeed) {
      putSchedule(updates, `feedingSchedules/${id}`, nextFeed, true);
      putSchedule(updates, `rinseSchedules/${id}`, nextRinse, true);
      logMessages.push(`Rinse auto-scheduled for ${nextRinse.time} (linked to Feeding ${nextFeed.time})`);
    } else {
      writeChangedScheduleFields(updates, `feedingSchedules/${id}`, currentFeed, nextFeed);
      if (currentRinse) {
        writeChangedScheduleFields(updates, `rinseSchedules/${id}`, currentRinse, nextRinse);
      } else {
        putSchedule(updates, `rinseSchedules/${id}`, nextRinse, true);
      }
      if (currentFeed.time !== nextFeed.time || currentFeed.duration !== nextFeed.duration) {
        logMessages.push('Rinse rescheduled');
      } else if (!currentRinse) {
        logMessages.push(`Rinse auto-scheduled for ${nextRinse.time} (linked to Feeding ${nextFeed.time})`);
      }
    }

    if (!Object.keys(updates).length) {
      closeFeedModal();
      return;
    }

    setBusy(true);
    setPageError('');
    try {
      await commitScheduleUpdate(updates, logMessages);
      setFeeds((current) => upsertSchedule(current, nextFeed));
      setRinses((current) => upsertSchedule(current, nextRinse));
      setToast('Feeding and linked rinse schedules saved.');
      closeFeedModal();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Could not save both schedules. No schedule changes were applied.');
    } finally {
      setBusy(false);
    }
  };

  const toggleFeed = async (feed: Schedule) => {
    if (controlsLocked) return;
    const nextFeed = { ...feed, enabled: !feed.enabled };
    const currentRinse = rinsesById.get(feed.id);
    const delay = currentRinse ? inferRinseDelayMinutes(feed, currentRinse) : DEFAULT_RINSE_DELAY_MINUTES;
    const nextRinse = currentRinse
      ? { ...currentRinse, enabled: nextFeed.enabled }
      : makeSchedule(nextFeed, delay ?? DEFAULT_RINSE_DELAY_MINUTES, DEFAULT_RINSE_DURATION_SECONDS);
    const nextFeeds = feeds.map((entry) => entry.id === feed.id ? nextFeed : entry);
    const nextRinses = currentRinse
      ? rinses.map((entry) => entry.id === feed.id ? nextRinse : entry)
      : [...rinses, nextRinse];
    const conflict = findScheduleConflict(nextFeeds, nextRinses);
    if (conflict) {
      setPageError(conflict);
      return;
    }

    const updates: Record<string, unknown> = { [`feedingSchedules/${feed.id}/enabled`]: nextFeed.enabled };
    const logMessages = nextFeed.enabled
      ? [`Rinse auto-scheduled for ${nextRinse.time} (linked to Feeding ${nextFeed.time})`]
      : [`Rinse disabled (linked to Feeding ${nextFeed.time})`];
    if (currentRinse) {
      updates[`rinseSchedules/${feed.id}/enabled`] = nextFeed.enabled;
    } else {
      putSchedule(updates, `rinseSchedules/${feed.id}`, nextRinse, true);
    }

    setBusy(true);
    setPageError('');
    try {
      await commitScheduleUpdate(updates, logMessages);
      setFeeds(nextFeeds);
      setRinses(nextRinses);
    } catch (cause) {
      setPageError(cause instanceof Error ? cause.message : 'Could not update the feeding and linked rinse together.');
    } finally {
      setBusy(false);
    }
  };

  const deleteFeed = async (feed: Schedule) => {
    if (controlsLocked) return;
    if (!window.confirm(`Delete the feeding at ${feed.time}? This will also remove its linked rinse.`)) return;
    const updates: Record<string, unknown> = { [`feedingSchedules/${feed.id}`]: null };
    const rinse = rinsesById.get(feed.id);
    if (rinse) updates[`rinseSchedules/${feed.id}`] = null;
    const logMessages = rinse ? ['Rinse removed (feeding deleted)'] : [];

    setBusy(true);
    setPageError('');
    try {
      await commitScheduleUpdate(updates, logMessages);
      setFeeds((current) => current.filter((entry) => entry.id !== feed.id));
      if (rinse) setRinses((current) => current.filter((entry) => entry.id !== feed.id));
      setToast('Feeding routine and linked rinse removed.');
    } catch (cause) {
      setPageError(cause instanceof Error ? cause.message : 'Could not delete the feeding and linked rinse together.');
    } finally {
      setBusy(false);
    }
  };

  const saveRinse = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (controlsLocked || !rinseModalFeed || !rinseModalRecord) return;
    const data = new FormData(event.currentTarget);
    const delay = Number(data.get('delay'));
    const duration = Number(data.get('duration'));
    if (!Number.isInteger(delay) || delay < MIN_RINSE_DELAY_MINUTES || delay > MAX_RINSE_DELAY_MINUTES) {
      setFormError('Delay must be between 5 and 120 minutes.');
      return;
    }
    if (!isLinkedRinseDuration(duration)) {
      setFormError('Rinse duration must be between 1 and 60 seconds.');
      return;
    }

    const nextRinse = makeSchedule(rinseModalFeed, delay, duration, rinseModalRecord.createdAt);
    const nextRinses = rinses.map((rinse) => rinse.id === nextRinse.id ? nextRinse : rinse);
    const conflict = findScheduleConflict(feeds, nextRinses);
    if (conflict) {
      setFormError(conflict);
      return;
    }

    const updates: Record<string, unknown> = {};
    writeChangedScheduleFields(updates, `rinseSchedules/${nextRinse.id}`, rinseModalRecord, nextRinse);
    if (Object.keys(updates).length === 0) {
      setRinseModalId(null);
      return;
    }

    setBusy(true);
    setPageError('');
    try {
      await commitScheduleUpdate(updates, ['Rinse rescheduled']);
      setRinses(nextRinses);
      setToast('Linked rinse schedule saved.');
      setRinseModalId(null);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Could not update the linked rinse schedule.');
    } finally {
      setBusy(false);
    }
  };

  const updateLegacyChoice = (id: string, patch: Partial<LegacyChoice>) => {
    setLegacyChoices((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  };
  const updateMissingSettings = (id: string, patch: Partial<RinseSettings>) => {
    setMissingSettings((current) => ({
      ...current,
      [id]: {
        delay: current[id]?.delay ?? DEFAULT_RINSE_DELAY_MINUTES,
        duration: current[id]?.duration ?? DEFAULT_RINSE_DURATION_SECONDS,
        ...patch,
      },
    }));
  };

  const migrationCanApply = useMemo(() => {
    const claimed = new Set<string>();
    for (const orphan of orphanRinses) {
      const choice = legacyChoices[orphan.id];
      if (!choice || !choice.action) return false;
      if (choice.action === 'link') {
        if (!choice.feedId || claimed.has(choice.feedId) || rinsesById.has(choice.feedId)) return false;
        const targetFeed = feedsById.get(choice.feedId);
        if (!targetFeed) return false;
        if (!Number.isInteger(choice.delay) || choice.delay < MIN_RINSE_DELAY_MINUTES || choice.delay > MAX_RINSE_DELAY_MINUTES) return false;
        if (!isLinkedRinseDuration(choice.duration)) return false;
        claimed.add(choice.feedId);
      }
    }
    for (const feed of missingRinses) {
      if (claimed.has(feed.id)) continue;
      const settings = missingSettings[feed.id];
      if (!settings
        || !Number.isInteger(settings.delay)
        || settings.delay < MIN_RINSE_DELAY_MINUTES
        || settings.delay > MAX_RINSE_DELAY_MINUTES
        || !isLinkedRinseDuration(settings.duration)) return false;
    }
    return true;
  }, [feedsById, legacyChoices, missingRinses, missingSettings, orphanRinses, rinsesById]);

  const applyMigration = async () => {
    if (controlsLocked || !migrationCanApply) return;
    setPageError('');
    setBusy(true);
    try {
      let latestFeeds = feeds;
      let latestRinses = rinses;
      if (firebaseConfigured) {
        const [readFeeds, readRinses] = await Promise.all([
          readCollection<Schedule>('/feedingSchedules'),
          readCollection<Schedule>('/rinseSchedules'),
        ]);
        if (scheduleFingerprint(readFeeds) !== scheduleFingerprint(feeds)
          || scheduleFingerprint(readRinses) !== scheduleFingerprint(rinses)) {
          setFeeds(readFeeds);
          setRinses(readRinses);
          throw new Error('Schedules changed while you were reviewing. The latest records are loaded; review the migration choices again.');
        }
        latestFeeds = readFeeds;
        latestRinses = readRinses;
      }

      const feedMap = new Map(latestFeeds.map((feed) => [feed.id, feed]));
      const nextRinseMap = new Map(latestRinses.map((rinse) => [rinse.id, rinse]));
      const updates: Record<string, unknown> = {};
      const logMessages: string[] = [];
      const linkedTargets = new Set<string>();

      for (const orphan of orphanRinses) {
        const choice = legacyChoices[orphan.id];
        if (!choice) throw new Error('Choose what to do with every standalone rinse before applying the migration.');
        if (choice.action === 'remove') {
          nextRinseMap.delete(orphan.id);
          updates[`rinseSchedules/${orphan.id}`] = null;
          logMessages.push('Rinse removed (legacy standalone)');
          continue;
        }
        if (choice.action !== 'link') throw new Error('Choose whether to link or remove every standalone rinse.');
        const target = feedMap.get(choice.feedId);
        if (!target || nextRinseMap.has(target.id) || linkedTargets.has(target.id)) {
          throw new Error('A selected feeding already has a rinse or is no longer available. Review the migration choices.');
        }
        const linked = makeSchedule(target, choice.delay, choice.duration, orphan.createdAt);
        nextRinseMap.delete(orphan.id);
        nextRinseMap.set(target.id, linked);
        updates[`rinseSchedules/${orphan.id}`] = null;
        putSchedule(updates, `rinseSchedules/${target.id}`, linked, true);
        linkedTargets.add(target.id);
        logMessages.push(`Rinse auto-scheduled for ${linked.time} (linked to Feeding ${target.time})`);
      }

      for (const feed of latestFeeds) {
        let rinse = nextRinseMap.get(feed.id);
        if (!rinse) {
          if (linkedTargets.has(feed.id)) continue;
          const settings = missingSettings[feed.id] ?? {
            delay: DEFAULT_RINSE_DELAY_MINUTES,
            duration: DEFAULT_RINSE_DURATION_SECONDS,
          };
          rinse = makeSchedule(feed, settings.delay, settings.duration);
          nextRinseMap.set(feed.id, rinse);
          putSchedule(updates, `rinseSchedules/${feed.id}`, rinse, true);
          logMessages.push(`Rinse auto-scheduled for ${rinse.time} (linked to Feeding ${feed.time})`);
          continue;
        }

        const inferredDelay = inferRinseDelayMinutes(feed, rinse);
        const delay = inferredDelay ?? DEFAULT_RINSE_DELAY_MINUTES;
        const duration = isLinkedRinseDuration(rinse.duration)
          ? rinse.duration
          : DEFAULT_RINSE_DURATION_SECONDS;
        const repaired = makeSchedule(feed, delay, duration, rinse.createdAt);
        if (repaired.time !== rinse.time || repaired.duration !== rinse.duration || repaired.enabled !== rinse.enabled) {
          writeChangedScheduleFields(updates, `rinseSchedules/${feed.id}`, rinse, repaired);
          nextRinseMap.set(feed.id, repaired);
          logMessages.push('Rinse rescheduled');
        }
      }

      const nextRinses = [...nextRinseMap.values()];
      const conflict = findScheduleConflict(latestFeeds, nextRinses);
      if (conflict) throw new Error(`${conflict} No migration changes were written.`);
      if (!Object.keys(updates).length) {
        setToast('All feeding routines already have one linked rinse.');
        setBusy(false);
        return;
      }

      const linkCount = Object.keys(updates).length;
      if (!window.confirm(`Apply the reviewed rinse migration? It will link missing rinses, apply your standalone-rinse choices, and synchronize linked rinse states. No physical equipment action is requested.`)) {
        setBusy(false);
        return;
      }
      await commitScheduleUpdate(updates, logMessages);
      setRinses(nextRinses);
      setLegacyChoices({});
      setToast(`Rinse migration applied. ${linkCount} Firebase path updates were included.`);
    } catch (cause) {
      setPageError(cause instanceof Error ? cause.message : 'Migration failed. No linked schedule changes were applied.');
    } finally {
      setBusy(false);
    }
  };

  const readyState = loading
    ? <><ColumnIntro kind={kind} /><ScheduleSkeleton /></>
    : loadError
      ? <div className="panel schedule-state"><InlineAlert>{loadError}</InlineAlert><button className="button button-secondary" onClick={() => window.location.reload()}><RefreshCw /> Retry</button></div>
      : null;

  const content = kind === 'feeding'
    ? (
      <FeedingSchedules
        feeds={feeds}
        rinsesById={rinsesById}
        busy={controlsLocked}
        onAdd={(period = null) => openFeedModal(null, period)}
        onEdit={(feed) => openFeedModal(feed.id)}
        onToggle={toggleFeed}
        onDelete={deleteFeed}
      />
    )
    : (
      <RinseSchedules
        feeds={feeds}
        rinsesById={rinsesById}
        orphanRinses={orphanRinses}
        missingRinses={missingRinses}
        linkedRinseRepairs={linkedRinseRepairs}
        legacyChoices={legacyChoices}
        missingSettings={missingSettings}
        canApplyMigration={migrationCanApply}
        busy={controlsLocked}
        onEdit={openRinseModal}
        onLegacyChoice={updateLegacyChoice}
        onMissingSettings={updateMissingSettings}
        onApplyMigration={applyMigration}
      />
    );

  return (
    <div className="page">
      <ScheduleHeading
        kind={kind}
        action={kind === 'feeding'
          ? <button type="button" className="button button-primary" onClick={() => openFeedModal(null)} disabled={controlsLocked}><Plus /> Add schedule</button>
          : undefined}
      />
      {!firebaseConfigured && (
        <InlineAlert kind="info">
          Demo mode. Changes stay in this browser and are not written to Firebase.
        </InlineAlert>
      )}
      {migrationNeeded && kind === 'feeding' && (
        <InlineAlert kind="warning">
          Rinse records need review or syncing. <Link href="/rinse" className="schedule-inline-link">Review linked rinses</Link> before treating all entries as linked.
        </InlineAlert>
      )}
      {pageError && <InlineAlert>{pageError}</InlineAlert>}
      {readyState || content}
      {feedModal && kind === 'feeding' && (
        <FeedModal
          modal={feedModal}
          current={feedModalRecord}
          currentRinse={feedModalRecord ? rinsesById.get(feedModalRecord.id) : undefined}
          error={formError}
          busy={controlsLocked}
          onClose={closeFeedModal}
          onSave={saveFeed}
        />
      )}
      {rinseModalFeed && rinseModalRecord && kind === 'rinse' && (
        <RinseModal
          feed={rinseModalFeed}
          rinse={rinseModalRecord}
          error={formError}
          busy={controlsLocked}
          onClose={() => { setRinseModalId(null); setFormError(''); }}
          onSave={saveRinse}
        />
      )}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </div>
  );

}

function FeedingSchedules({
  feeds, rinsesById, busy, onAdd, onEdit, onToggle, onDelete,
}: {
  feeds: Schedule[];
  rinsesById: Map<string, Schedule>;
  busy: boolean;
  onAdd: (period?: FeedingPeriod | null) => void;
  onEdit: (feed: Schedule) => void;
  onToggle: (feed: Schedule) => void;
  onDelete: (feed: Schedule) => void;
}) {
  const invalidTimes = feeds.filter((feed) => periodForTime(feed.time) === null);
  return (
    <>
      <ColumnIntro kind="feeding" />
      <div className="daypart-grid">
        {FEEDING_PERIODS.map((period) => {
          const routines = feeds
            .filter((feed) => periodForTime(feed.time) === period.key)
            .slice()
            .sort((a, b) => a.time.localeCompare(b.time));
          return (
            <section className="daypart-column" key={period.key} aria-labelledby={`daypart-${period.key}`}>
              <DaypartHead period={period} count={routines.length} span={periodSpan(routines.map((feed) => feed.time))} />
              <div className="routine-stack">
                {routines.length ? routines.map((feed, index) => {
                  const rinse = rinsesById.get(feed.id);
                  return (
                    <article
                      className={`routine-card ${feed.enabled ? '' : 'is-muted'}`}
                      key={feed.id}
                      style={{ animationDelay: `${index * 35}ms` }}
                    >
                      <div className="routine-card-top">
                        <div>
                          <div className="routine-time">{formatTime12Hour(feed.time)}</div>
                          <div className="routine-kind">Feeding routine</div>
                        </div>
                        <div className="routine-controls">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={feed.enabled}
                            className={`toggle ${feed.enabled ? 'on' : ''}`}
                            disabled={busy}
                            onClick={() => onToggle(feed)}
                            aria-label={`${feed.enabled ? 'Disable' : 'Enable'} feeding at ${feed.time}; linked rinse follows`}
                          />
                          <div className="row-actions">
                            <button type="button" disabled={busy} onClick={() => onEdit(feed)} aria-label={`Edit feeding at ${feed.time}`}><Pencil /></button>
                            <button type="button" disabled={busy} onClick={() => onDelete(feed)} aria-label={`Delete feeding at ${feed.time}`}><Trash2 /></button>
                          </div>
                        </div>
                      </div>
                      <div className="routine-meta">
                        <span>{feed.duration} sec feed</span>
                        <span>{feed.enabled ? 'Enabled' : 'Disabled'}</span>
                      </div>
                      <div className={`linked-rinse ${rinse ? '' : 'is-missing'}`} title={`Linked rinse: ${getRinseDetails(feed, rinse)}`}>
                        <span className="linked-rinse-label"><Droplets size={12} /> Linked rinse {feed.enabled && rinse && <ArrowRight size={11} />}</span>
                        <span className="linked-rinse-time">
                          {!rinse ? 'Needs review' : feed.enabled ? rinse.time : 'Off'}
                        </span>
                      </div>
                    </article>
                  );
                }) : (
                  <div className="daypart-empty"><CalendarClock /><p>No {period.label.toLowerCase()} routines yet</p></div>
                )}
              </div>
              <button type="button" className="button button-secondary add-routine-button" disabled={busy} onClick={() => onAdd(period.key)}>
                <Plus /> Add routine
              </button>
            </section>
          );
        })}
      </div>
      {invalidTimes.length > 0 && (
        <InlineAlert>
          {invalidTimes.length} feeding record(s) have an invalid time and cannot be grouped: {invalidTimes.map((feed) => `${feed.id} (${feed.time})`).join(', ')}.
        </InlineAlert>
      )}
    </>
  );
}

function FeedModal({
  modal, current, currentRinse, error, busy, onClose, onSave,
}: {
  modal: { id: string | null; period: FeedingPeriod | null };
  current?: Schedule;
  currentRinse?: Schedule;
  error: string;
  busy: boolean;
  onClose: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const selectedPeriod = modal.period ? FEEDING_PERIODS.find((period) => period.key === modal.period) : undefined;
  const existingDelay = current && currentRinse ? inferRinseDelayMinutes(current, currentRinse) : null;
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="feed-modal-title">
        <div className="modal-head">
          <div><p className="eyebrow">Feeding routine</p><div className="modal-title" id="feed-modal-title">{modal.id ? 'Edit feeding' : 'Add feeding'}</div></div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close dialog"><X /></button>
        </div>
        <form onSubmit={onSave}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="schedule-time">Feeding time</label>
              <input
                id="schedule-time"
                name="time"
                type="time"
                step="60"
                min={selectedPeriod?.start}
                max={selectedPeriod?.end}
                defaultValue={current?.time ?? selectedPeriod?.defaultTime ?? '08:00'}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="schedule-duration">Feeding duration (seconds)</label>
              <input id="schedule-duration" name="duration" type="number" min="1" max="60" step="1" defaultValue={current?.duration ?? 10} required />
            </div>
          </div>
          <p className="schedule-form-note">
            A linked rinse is scheduled {existingDelay ?? DEFAULT_RINSE_DELAY_MINUTES} minutes after feeding finishes, rounded up to the next minute. New feedings use a 30-minute delay and a 30-second rinse.
          </p>
          {error && <InlineAlert>{error}</InlineAlert>}
          <div className="modal-actions">
            <button type="button" className="button button-secondary" onClick={onClose}>Cancel</button>
            <button className="button button-primary" disabled={busy}><Check /> {busy ? 'Saving…' : 'Save feeding'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RinseSchedules({
  feeds, rinsesById, orphanRinses, missingRinses, linkedRinseRepairs,
  legacyChoices, missingSettings, canApplyMigration, busy, onEdit, onLegacyChoice,
  onMissingSettings, onApplyMigration,
}: {
  feeds: Schedule[];
  rinsesById: Map<string, Schedule>;
  orphanRinses: Schedule[];
  missingRinses: Schedule[];
  linkedRinseRepairs: { feed: Schedule; rinse: Schedule; delay: number | null }[];
  legacyChoices: Record<string, LegacyChoice>;
  missingSettings: Record<string, RinseSettings>;
  canApplyMigration: boolean;
  busy: boolean;
  onEdit: (feedId: string) => void;
  onLegacyChoice: (id: string, patch: Partial<LegacyChoice>) => void;
  onMissingSettings: (id: string, patch: Partial<RinseSettings>) => void;
  onApplyMigration: () => void;
}) {
  const assignedFeedIds = new Set(
    Object.values(legacyChoices).filter((choice) => choice.action === 'link').map((choice) => choice.feedId),
  );
  const unclaimedMissing = missingRinses.filter((feed) => !assignedFeedIds.has(feed.id));
  const hasMigration = orphanRinses.length > 0 || missingRinses.length > 0 || linkedRinseRepairs.length > 0;

  return (
    <div className="rinse-schedule-page">
      {hasMigration && (
        <section className="panel migration-panel" aria-labelledby="migration-title">
          <div className="panel-header">
            <div>
              <h2 className="panel-title" id="migration-title">Review rinse links before syncing</h2>
              <p className="panel-subtitle">No Firebase records are changed until you apply the reviewed choices.</p>
            </div>
            <span className="badge badge-warning">{orphanRinses.length} standalone</span>
          </div>
          {orphanRinses.length > 0 && (
            <div className="migration-group">
              <h3>Existing standalone rinse records</h3>
              <p>Choose whether to keep each one by linking it to an unlinked feeding, or remove it. Nothing is changed while you review.</p>
              <div className="migration-list">
                {orphanRinses.map((orphan) => {
                  const choice = legacyChoices[orphan.id] ?? {
                    action: '' as LegacyAction,
                    feedId: '',
                    delay: DEFAULT_RINSE_DELAY_MINUTES,
                    duration: isLinkedRinseDuration(orphan.duration) ? orphan.duration : DEFAULT_RINSE_DURATION_SECONDS,
                  };
                  const linkedFeed = feeds.find((feed) => feed.id === choice.feedId);
                  const targetRinseTime = linkedFeed
                    ? calculateRinseTime(linkedFeed.time, linkedFeed.duration, choice.delay)
                    : null;
                  const claimedElsewhere = new Set(
                    Object.entries(legacyChoices)
                      .filter(([id, other]) => id !== orphan.id && other.action === 'link')
                      .map(([, other]) => other.feedId),
                  );
                  const choicesForTarget = feeds.filter((feed) => (
                    !rinsesById.has(feed.id) && !claimedElsewhere.has(feed.id)
                  ));
                  return (
                    <div className="migration-row" key={orphan.id}>
                      <div className="migration-old-record">
                        <strong>{orphan.time}</strong>
                        <span>{orphan.duration} sec · {orphan.enabled ? 'Enabled' : 'Disabled'}</span>
                        <small className="mono">Existing key: {orphan.id}</small>
                      </div>
                      <div className="migration-choice">
                        <label htmlFor={`legacy-action-${orphan.id}`}>Decision</label>
                        <select
                          id={`legacy-action-${orphan.id}`}
                          value={choice.action}
                          onChange={(event) => onLegacyChoice(orphan.id, {
                            action: event.target.value as LegacyAction,
                            feedId: '',
                          })}
                          disabled={busy}
                        >
                          <option value="">Choose an action</option>
                          <option value="link">Keep and link to a feeding</option>
                          <option value="remove">Remove this standalone rinse</option>
                        </select>
                      </div>
                      {choice.action === 'link' && (
                        <>
                          <div className="migration-choice">
                            <label htmlFor={`legacy-feed-${orphan.id}`}>Feeding to link</label>
                            <select
                              id={`legacy-feed-${orphan.id}`}
                              value={choice.feedId}
                              onChange={(event) => {
                                const feed = feedsByTime(feeds).find((candidate) => candidate.id === event.target.value);
                                const inferred = feed ? inferRinseDelayMinutes(feed, orphan) : null;
                                onLegacyChoice(orphan.id, {
                                  feedId: event.target.value,
                                  delay: inferred ?? DEFAULT_RINSE_DELAY_MINUTES,
                                  duration: isLinkedRinseDuration(orphan.duration) ? orphan.duration : DEFAULT_RINSE_DURATION_SECONDS,
                                });
                              }}
                              disabled={busy}
                            >
                              <option value="">Select feeding</option>
                              {choicesForTarget.map((feed) => <option value={feed.id} key={feed.id}>Feeding {feed.time} · {feed.duration} sec</option>)}
                            </select>
                          </div>
                          <div className="migration-preview">
                            <span>{targetRinseTime ? `Will link to Feeding ${linkedFeed?.time}; new rinse time ${targetRinseTime}.` : 'Choose a feeding routine to preview the linked time.'}</span>
                            {linkedFeed && (
                              <div className="migration-number-fields">
                                <label>Delay (min)<input aria-label={`Delay for standalone rinse ${orphan.time}`} type="number" min="5" max="120" value={choice.delay} onChange={(event) => onLegacyChoice(orphan.id, { delay: Number(event.target.value) })} /></label>
                                <label>Duration (sec)<input aria-label={`Duration for standalone rinse ${orphan.time}`} type="number" min="1" max="60" value={choice.duration} onChange={(event) => onLegacyChoice(orphan.id, { duration: Number(event.target.value) })} /></label>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                      {choice.action === 'remove' && <div className="migration-preview">This record will be removed only after you apply the migration.</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {unclaimedMissing.length > 0 && (
            <div className="migration-group">
              <h3>Feeding routines without a linked rinse</h3>
              <p>New links default to a 30-minute delay and 30-second rinse. You can adjust those values before applying.</p>
              <div className="migration-list">
                {unclaimedMissing.map((feed) => {
                  const settings = missingSettings[feed.id] ?? {
                    delay: DEFAULT_RINSE_DELAY_MINUTES,
                    duration: DEFAULT_RINSE_DURATION_SECONDS,
                  };
                  const rinseTime = calculateRinseTime(feed.time, feed.duration, settings.delay);
                  return (
                    <div className="migration-row migration-missing-row" key={feed.id}>
                      <div className="migration-old-record">
                        <strong>Feeding {feed.time}</strong>
                        <span>{feed.duration} sec · {feed.enabled ? 'Enabled' : 'Disabled'}</span>
                      </div>
                      <div className="migration-number-fields">
                        <label>Delay (min)<input aria-label={`New rinse delay for feeding ${feed.time}`} type="number" min="5" max="120" value={settings.delay} onChange={(event) => onMissingSettings(feed.id, { delay: Number(event.target.value) })} /></label>
                        <label>Duration (sec)<input aria-label={`New rinse duration for feeding ${feed.time}`} type="number" min="1" max="60" value={settings.duration} onChange={(event) => onMissingSettings(feed.id, { duration: Number(event.target.value) })} /></label>
                      </div>
                      <div className="migration-preview"><Link2 size={14} /> Will create a same-key rinse at {rinseTime}.</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {linkedRinseRepairs.length > 0 && (
            <div className="migration-group">
              <h3>Linked records that need synchronization</h3>
              <ul className="migration-repair-list">
                {linkedRinseRepairs.map(({ feed, rinse, delay }) => (
                  <li key={feed.id}>
                    Feeding {feed.time} ↔ rinse {rinse.time}: {[
                      delay === null ? 'delay cannot be inferred (will use 30 min)' : '',
                      !isLinkedRinseDuration(rinse.duration) ? 'duration is outside 1–60 sec (will use 30 sec)' : '',
                      rinse.enabled !== feed.enabled ? 'enabled state will follow the feeding' : '',
                    ].filter(Boolean).join('; ')}.
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="migration-footer">
            <p>All selected changes are validated and written together. Reopening this review after success will not create duplicate links.</p>
            <button type="button" className="button button-primary" onClick={onApplyMigration} disabled={busy || !canApplyMigration}>
              {busy ? <LoaderCircle className="spin" /> : <Check />} {busy ? 'Applying…' : 'Apply reviewed sync'}
            </button>
          </div>
        </section>
      )}
      {feeds.length === 0 && !hasMigration && (
        <div className="panel empty"><Waves /><h3>No feeding routines to link yet</h3><p>Add a feeding routine first; its linked rinse schedule will use the same key.</p></div>
      )}
      <ColumnIntro kind="rinse" />
      <div className="daypart-grid">
        {FEEDING_PERIODS.map((period) => {
          const routines = feeds.filter((feed) => periodForTime(feed.time) === period.key).sort((a, b) => a.time.localeCompare(b.time));
          return (
            <section className="daypart-column" key={period.key} aria-labelledby={`daypart-${period.key}`}>
              <DaypartHead period={period} count={routines.length} span={periodSpan(routines.map((feed) => feed.time))} />
              <div className="routine-stack">
                {routines.length ? routines.map((feed, index) => {
                  const rinse = rinsesById.get(feed.id);
                  const delay = rinse ? inferRinseDelayMinutes(feed, rinse) : null;
                  return (
                    <article
                      className={`routine-card ${feed.enabled ? '' : 'is-muted'}`}
                      key={feed.id}
                      style={{ animationDelay: `${index * 35}ms` }}
                    >
                      <div className="routine-card-top">
                        <div>
                          <div className="routine-time">
                            {rinse ? formatTime12Hour(rinse.time) : '—'}
                          </div>

                          <div className="routine-kind">Rinse routine</div>
                        </div>
                        <div className="routine-controls">
                          <button
                            type="button"
                            className={`toggle linked-rinse-toggle ${feed.enabled ? 'on' : ''}`}
                            disabled
                            role="switch"
                            aria-checked={feed.enabled}
                            title="Controlled by the linked feeding"
                            aria-label={`Rinse schedule ${feed.enabled ? 'enabled' : 'disabled'} because Feeding ${feed.time} is ${feed.enabled ? 'enabled' : 'disabled'}`}
                          />
                          <div className="row-actions">
                            {rinse && <button type="button" disabled={busy} onClick={() => onEdit(feed.id)} aria-label={`Edit rinse linked to feeding at ${feed.time}`}><Pencil /></button>}
                          </div>
                        </div>
                      </div>
                      <div className="source-feed">
                        <span>Source feeding</span>
                        <strong>{feed.time}</strong>
                      </div>
                      <div className="rinse-meta">
                        {rinse
                          ? `${rinse.duration} sec rinse · ${delay ?? 'review'} min delay after ${feed.duration} sec feed${feed.enabled ? '' : ' · off with feeding'}`
                          : 'Needs migration review'}
                      </div>
                    </article>
                  );
                }) : (
                  <div className="daypart-empty"><Waves /><p>No {period.label.toLowerCase()} feeding routines</p></div>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <footer className="schedule-footnote">
        <span>Rinse times are calculated from each feeding time, feeding duration and delay. This page stores the schedule; it does not confirm that equipment has run.</span>
      </footer>
    </div>
  );
}

function RinseModal({
  feed, rinse, error, busy, onClose, onSave,
}: {
  feed: Schedule;
  rinse: Schedule;
  error: string;
  busy: boolean;
  onClose: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const delay = inferRinseDelayMinutes(feed, rinse) ?? DEFAULT_RINSE_DELAY_MINUTES;
  const [delayInput, setDelayInput] = useState(String(delay));
  const initialDuration = isLinkedRinseDuration(rinse.duration) ? rinse.duration : DEFAULT_RINSE_DURATION_SECONDS;
  const parsedDelay = Number(delayInput);
  const previewTime = Number.isInteger(parsedDelay)
    && parsedDelay >= MIN_RINSE_DELAY_MINUTES
    && parsedDelay <= MAX_RINSE_DELAY_MINUTES
    ? calculateRinseTime(feed.time, feed.duration, parsedDelay)
    : '—';
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="rinse-modal-title">
        <div className="modal-head">
          <div><p className="eyebrow">Linked to Feeding {feed.time}</p><div className="modal-title" id="rinse-modal-title">Rinse schedule</div></div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close dialog"><X /></button>
        </div>
        <form onSubmit={onSave}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="rinse-delay">Delay after feeding (minutes)</label>
              <input id="rinse-delay" name="delay" type="number" min="5" max="120" step="1" value={delayInput} onChange={(event) => setDelayInput(event.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="rinse-duration">Rinse duration (seconds)</label>
              <input id="rinse-duration" name="duration" type="number" min="1" max="60" step="1" defaultValue={initialDuration} required />
            </div>
          </div>
          <p className="schedule-form-note">The rinse is scheduled for {previewTime}; its time is recalculated from the feeding and delay when you save.</p>
          {error && <InlineAlert>{error}</InlineAlert>}
          <div className="modal-actions">
            <button type="button" className="button button-secondary" onClick={onClose}>Cancel</button>
            <button className="button button-primary" disabled={busy}><Check /> {busy ? 'Saving…' : 'Save linked rinse'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function feedsByTime(feeds: Schedule[]) {
  return [...feeds].sort((a, b) => a.time.localeCompare(b.time));
}

export function FeedingSchedulesPage() {
  return <ScheduleManager kind="feeding" />;
}

export function RinseSchedulesPage() {
  return <ScheduleManager kind="rinse" />;
}