import { useState } from 'react';
import { CalendarClock, Link2, Moon, Pencil, Plus, Sun, SunMedium, Waves } from 'lucide-react';
import './_group.css';
import './Current.css';

type Schedule = { id: string; time: string; duration: number; enabled: boolean };
type Period = { key: string; label: string; range: string; icon: typeof Sun };

const periods: Period[] = [
  { key: 'morning', label: 'Morning', range: '00:00–11:59', icon: Sun },
  { key: 'afternoon', label: 'Afternoon', range: '12:00–17:59', icon: SunMedium },
  { key: 'evening', label: 'Evening', range: '18:00–23:59', icon: Moon },
];

const feeds: Schedule[] = [
  { id: 'morning-feed', time: '06:00', duration: 10, enabled: true },
  { id: 'afternoon-feed', time: '12:15', duration: 12, enabled: true },
  { id: 'late-feed', time: '17:45', duration: 10, enabled: false },
];

const rinses = new Map<string, Schedule>([
  ['morning-feed', { id: 'morning-feed', time: '06:31', duration: 30, enabled: true }],
  ['afternoon-feed', { id: 'afternoon-feed', time: '12:46', duration: 30, enabled: true }],
  ['late-feed', { id: 'late-feed', time: '18:16', duration: 30, enabled: false }],
]);

function inPeriod(time: string, key: string) {
  const hour = Number(time.slice(0, 2));
  return key === 'morning' ? hour < 12 : key === 'afternoon' ? hour >= 12 && hour < 18 : hour >= 18;
}

function PeriodHeader({ period, count }: { period: Period; count: number }) {
  const Icon = period.icon;
  return (
    <div className="mock-period-head">
      <div>
        <h2 className="mock-period-title"><Icon size={17} /> {period.label}</h2>
        <p className="mock-period-subtitle">{period.range} · {count} {count === 1 ? 'routine' : 'routines'}</p>
      </div>
      <span className="mock-badge"><CalendarClock size={12} /> 24-hour time</span>
    </div>
  );
}

function FeedingView() {
  return (
    <div className="mock-periods">
      {periods.map((period) => {
        const routines = feeds.filter((feed) => inPeriod(feed.time, period.key));
        return (
          <section className="mock-period" key={period.key}>
            <PeriodHeader period={period} count={routines.length} />
            <div className="mock-list">
              {routines.length ? routines.map((feed) => {
                const rinse = rinses.get(feed.id);
                return (
                  <div className="mock-row" key={feed.id}>
                    <div className="mock-time">{feed.time}</div>
                    <div className="mock-main">
                      <div className="mock-label">Feeding routine</div>
                      <div className="mock-meta">{feed.duration} seconds · {feed.enabled ? 'Enabled' : 'Disabled'}</div>
                    </div>
                    <span className="mock-badge"><Link2 size={12} /> {feed.enabled ? `Rinse ${rinse?.time}` : 'Rinse off'}</span>
                    <button className="mock-switch" aria-label={`Feeding at ${feed.time} is ${feed.enabled ? 'enabled' : 'disabled'}`} />
                    <div className="mock-actions"><button aria-label={`Edit feeding at ${feed.time}`}><Pencil /></button><button aria-label={`Add a feeding routine at ${feed.time}`}><Plus /></button></div>
                  </div>
                );
              }) : <div className="mock-empty"><CalendarClock /><br />No {period.label.toLowerCase()} routines yet</div>}
              <button className="mock-add"><Plus size={14} /> Add routine</button>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function RinseView() {
  return (
    <div className="mock-periods">
      {periods.map((period) => {
        const routines = feeds.filter((feed) => inPeriod(feed.time, period.key));
        return (
          <section className="mock-period" key={period.key}>
            <PeriodHeader period={period} count={routines.length} />
            <div className="mock-list">
              {routines.length ? routines.map((feed) => {
                const rinse = rinses.get(feed.id);
                return (
                  <div className="mock-row" key={feed.id}>
                    <div className="mock-time">{rinse?.time ?? '—'}</div>
                    <div className="mock-main">
                      <div className="mock-label">Linked to Feeding {feed.time}</div>
                      <div className="mock-meta">{rinse?.duration ?? 30} sec · 30 min delay</div>
                    </div>
                    <button className="mock-switch" aria-label="Rinse state follows its linked feeding" disabled />
                    <span className={`mock-badge ${feed.enabled ? 'success' : ''}`}>{feed.enabled ? 'Scheduled' : 'Rinse off'}</span>
                    <div className="mock-actions"><button aria-label={`Edit rinse linked to feeding at ${feed.time}`}><Pencil /></button></div>
                  </div>
                );
              }) : <div className="mock-empty"><Waves /><br />No {period.label.toLowerCase()} feeding routines</div>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function Current() {
  const [kind, setKind] = useState<'feeding' | 'rinse'>('feeding');
  return (
    <main className="swine-schedule-mock">
      <header className="mock-heading">
        <div>
          <p className="mock-eyebrow">Routine management</p>
          <h1>{kind === 'feeding' ? 'Feeding schedule' : 'Rinse schedule'}</h1>
          <p className="mock-lede">Review each routine and its linked rinse.</p>
        </div>
        <div className="mock-tabs" role="tablist" aria-label="Schedule type">
          <button className={kind === 'feeding' ? 'active' : ''} role="tab" aria-selected={kind === 'feeding'} onClick={() => setKind('feeding')}>Feeding</button>
          <button className={kind === 'rinse' ? 'active' : ''} role="tab" aria-selected={kind === 'rinse'} onClick={() => setKind('rinse')}>Rinse</button>
        </div>
      </header>
      <p className="mock-note">Extracted from the current schedule components; sample records are preview-only.</p>
      {kind === 'feeding' ? <FeedingView /> : <RinseView />}
    </main>
  );
}
