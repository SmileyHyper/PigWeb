import { useState } from 'react';
import { ArrowRight, CircleCheck, Clock3, Droplets, Leaf, Moon, Sun, SunMedium, Waves } from 'lucide-react';
import './_group.css';

type Schedule = { id: string; time: string; duration: number; enabled: boolean };
type Period = { key: 'morning' | 'afternoon' | 'evening'; label: string; range: string; icon: typeof Sun };
type ScheduleKind = 'feeding' | 'rinse';

const periods: Period[] = [
  { key: 'morning', label: 'Morning', range: '06:00–08:00', icon: Sun },
  { key: 'afternoon', label: 'Afternoon', range: '10:00–12:00', icon: SunMedium },
  { key: 'evening', label: 'Evening', range: '15:00–17:00', icon: Moon },
];

const feeds: Schedule[] = [
  { id: 'feed-0600', time: '06:00', duration: 10, enabled: true },
  { id: 'feed-0700', time: '07:00', duration: 12, enabled: true },
  { id: 'feed-0800', time: '08:00', duration: 10, enabled: true },
  { id: 'feed-1000', time: '10:00', duration: 12, enabled: true },
  { id: 'feed-1100', time: '11:00', duration: 10, enabled: true },
  { id: 'feed-1200', time: '12:00', duration: 12, enabled: true },
  { id: 'feed-1500', time: '15:00', duration: 10, enabled: true },
  { id: 'feed-1600', time: '16:00', duration: 12, enabled: true },
  { id: 'feed-1700', time: '17:00', duration: 10, enabled: true },
];

const feedsByPeriod: Record<Period['key'], Schedule[]> = {
  morning: feeds.slice(0, 3),
  afternoon: feeds.slice(3, 6),
  evening: feeds.slice(6, 9),
};

function calculateRinseTime(feedingTime: string, feedingDurationSeconds: number) {
  const [hours, minutes] = feedingTime.split(':').map(Number);
  const totalSeconds = hours * 3600 + minutes * 60 + feedingDurationSeconds + 30 * 60;
  const roundedMinute = Math.ceil(totalSeconds / 60);
  const minuteOfDay = roundedMinute % (24 * 60);
  return `${String(Math.floor(minuteOfDay / 60)).padStart(2, '0')}:${String(minuteOfDay % 60).padStart(2, '0')}`;
}

function DaypartColumn({ period, kind }: { period: Period; kind: ScheduleKind }) {
  const Icon = period.icon;
  const routines = feedsByPeriod[period.key];

  return (
    <section className="daypart-column" aria-labelledby={`daypart-${period.key}`}>
      <header className="daypart-head">
        <div>
          <h2 className="daypart-name" id={`daypart-${period.key}`}>
            <span className="daypart-symbol"><Icon size={15} strokeWidth={1.8} /></span>
            {period.label}
          </h2>
          <p className="daypart-range">{period.range}</p>
        </div>
        <span className="routine-count">{routines.length} {routines.length === 1 ? 'routine' : 'routines'}</span>
      </header>

      <div className="routine-stack">
        {routines.map((feed, index) => {
          const rinseTime = calculateRinseTime(feed.time, feed.duration);
          return (
            <article className="routine-card" key={feed.id} style={{ animationDelay: `${index * 35}ms` }}>
              <div className="routine-card-top">
                <div>
                  <div className="routine-time">{kind === 'feeding' ? feed.time : rinseTime}</div>
                  <div className="routine-kind">{kind === 'feeding' ? 'Feeding routine' : 'Rinse routine'}</div>
                </div>
                <span className="state-label"><span className="state-dot" /> Preview record</span>
              </div>
              {kind === 'feeding' ? (
                <>
                  <div className="routine-meta">
                    <span>{feed.duration} sec feed</span>
                    <span>Enabled</span>
                  </div>
                  <div className="linked-rinse">
                    <span className="linked-rinse-label"><Droplets size={12} /> Linked rinse <ArrowRight size={11} /></span>
                    <span className="linked-rinse-time">{rinseTime}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="source-feed">
                    <span>Source feeding</span>
                    <strong>{feed.time}</strong>
                  </div>
                  <div className="rinse-meta">30 sec rinse · 30 min delay after {feed.duration} sec feed</div>
                </>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function DayPartLayout() {
  const [kind, setKind] = useState<ScheduleKind>('feeding');

  return (
    <main className="swine-schedule-mock">
      <div className="schedule-shell">
        <div className="schedule-topline">
          <span className="brand-mark">P&amp;D</span>
          <span>Paul &amp; Davons</span>
          <span className="topline-divider" />
          <span className="topline-location">Swine operations</span>
        </div>

        <header className="schedule-heading">
          <div className="heading-copy">
            <p className="heading-kicker">Routine management / preview</p>
            <h1>{kind === 'feeding' ? 'Feeding schedule' : 'Rinse schedule'}</h1>
            <p className="heading-lede">Daily routines, grouped by the part of the day they belong to.</p>
          </div>
          <div className="schedule-tabs" role="tablist" aria-label="Schedule type">
            <button type="button" role="tab" aria-selected={kind === 'feeding'} className={kind === 'feeding' ? 'active' : ''} onClick={() => setKind('feeding')}>
              <Leaf size={14} /> Feeding
            </button>
            <button type="button" role="tab" aria-selected={kind === 'rinse'} className={kind === 'rinse' ? 'active' : ''} onClick={() => setKind('rinse')}>
              <Waves size={14} /> Rinse
            </button>
          </div>
        </header>

        <aside className="preview-notice" aria-label="Preview notice">
          <span className="notice-dot" />
          <span><strong>Preview only — illustrative records.</strong> Rinse times are calculated from each feeding time, feeding duration, and a 30-minute delay. No equipment has run.</span>
        </aside>

        <div className="column-intro">
          <div>
            <h2>{kind === 'feeding' ? 'Feed routines by day part' : 'Linked rinse routines by day part'}</h2>
            <p>{kind === 'feeding' ? 'Each feeding card includes its scheduled rinse.' : 'Each rinse card names the feeding routine it follows.'}</p>
          </div>
          <span className="display-note"><Clock3 size={11} /> 24-HOUR TIME</span>
        </div>

        <div className="daypart-grid">
          {periods.map((period) => <DaypartColumn key={period.key} period={period} kind={kind} />)}
        </div>

        <footer className="schedule-footnote">
          <span><strong>Illustrative schedule preview</strong> · sample records only; not connected to farm equipment.</span>
          <span className="footnote-mark"><CircleCheck size={11} /> Linked timing shown</span>
        </footer>
      </div>
    </main>
  );
}
