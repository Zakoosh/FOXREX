/* FOXREX scheduler — publishes SCHEDULED items when due, on an always-on control plane only
   (SCHEDULER_ENABLED=true). State lives in the durable CMS store, so a worker or machine restart
   loses nothing; the idempotency key `schedule:<id>@<scheduledAt>` means a restart can never
   double-publish.

   Every due item is re-validated at execution time and is NEVER published when:
     - it is no longer APPROVED/SCHEDULED or fails validation            → INVALID
     - its revision differs from the revision that was scheduled          → STALE
     - expiresAt has passed                                               → EXPIRED
     - it is late beyond the grace period (missed schedule):
         time-sensitive market types (MORNING_BRIEF, GOLD_FOCUS, EVENT,
         US_OPEN, MARKET_RECAP): SCHEDULE_GRACE_MINUTES (default 15)      → MISSED
         other types: SCHEDULE_GRACE_MINUTES_OTHER (default 24 h)         → MISSED
   MISSED items stay SCHEDULED and need an explicit operator publish (preview + confirmation) or a
   reschedule. Stale market commentary is never published automatically. */
import { CMS } from './cms.js';
import { logger } from './logger.js';

const log = logger('scheduler');

export class Scheduler {
  constructor({ store, publisher, config }) {
    this.store = store; this.publisher = publisher;
    this.graceSensitiveMs = (config.scheduleGraceMinutes ?? 15) * 60e3;
    this.graceOtherMs = (config.scheduleGraceMinutesOther ?? 1440) * 60e3;
    this.enabled = !!config.schedulerEnabled; this.timer = null; this.lastTick = null; this.running = false;
  }
  start(intervalMs = 30e3) {
    if (!this.enabled || this.timer) return;
    this.tick().catch(() => {}); // catch up immediately after a restart (missed-schedule policy applies)
    this.timer = setInterval(() => this.tick().catch(() => {}), intervalMs); this.timer.unref?.();
  }
  stop() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }

  /** Decide what to do with one due item. Pure apart from reading the record. */
  decide(r, now = Date.now()) {
    const late = now - Date.parse(r.scheduledAt);
    if (r.expiresAt && Date.parse(r.expiresAt) <= now) return { state: 'EXPIRED', reason: `Expired at ${r.expiresAt}` };
    if (r.scheduledRevision != null && r.scheduledRevision !== r.revision) return { state: 'STALE', reason: 'Content changed after it was scheduled' };
    const grace = CMS.TIME_SENSITIVE.includes(r.type) ? this.graceSensitiveMs : this.graceOtherMs;
    if (late > grace) return { state: 'MISSED', reason: `Missed its slot by ${Math.round(late / 60e3)} min (grace ${Math.round(grace / 60e3)} min) — operator confirmation required` };
    const errs = this.publisher.gate(r, now);
    if (errs.length) return { state: 'INVALID', reason: errs.map(e => e.message).join(' · ') };
    return { state: 'PUBLISH' };
  }

  async tick(now = Date.now()) {
    if (this.running) return []; this.running = true; this.lastTick = new Date(now).toISOString();
    const results = [];
    try {
      for (const r of this.publisher.due(now)) {
        const flag = this.store.scheduleFlag(r.id);
        if (flag && ['MISSED', 'EXPIRED', 'STALE', 'INVALID'].includes(flag.state) && flag.scheduledAt === r.scheduledAt) { results.push({ id: r.id, state: flag.state, skipped: true }); continue; }
        const d = this.decide(r, now);
        if (d.state !== 'PUBLISH') {
          this.store.setScheduleFlag(r.id, { state: d.state, reason: d.reason, scheduledAt: r.scheduledAt });
          this.publisher.audit({ action: d.state === 'MISSED' ? 'SCHEDULE_MISSED' : d.state === 'EXPIRED' ? 'SCHEDULE_EXPIRED' : 'SCHEDULE_SKIPPED', actor: 'scheduler', contentId: r.id, language: r.language, contentType: r.type, result: d.state, note: d.reason });
          log.warn('scheduled item not published', { contentId: r.id, state: d.state });
          results.push({ id: r.id, state: d.state }); continue;
        }
        const { version } = this.publisher.readFeed();
        try {
          const pub = await this.publisher.publish({ contentId: r.id, expectedVersion: version, actor: 'scheduler', idempotencyKey: `schedule:${r.id}@${r.scheduledAt}` });
          results.push({ id: r.id, state: pub.result, publicationId: pub.publicationId, replay: !!pub.idempotentReplay });
        } catch (e) { results.push({ id: r.id, state: 'FAILED', error: e.message }); }
      }
    } finally { this.running = false; }
    return results;
  }
  status(now = Date.now()) {
    const due = this.publisher.due(now);
    const flags = Object.values(this.store.data.scheduleFlags || {});
    return { enabled: this.enabled, state: this.enabled ? 'ENABLED' : 'DISABLED', lastTick: this.lastTick,
      scheduled: this.store.list().filter(r => r.status === 'SCHEDULED').length, due: due.length,
      missed: flags.filter(f => f.state === 'MISSED').length, expired: flags.filter(f => f.state === 'EXPIRED').length,
      graceMinutes: this.graceSensitiveMs / 60e3, graceMinutesOther: this.graceOtherMs / 60e3 };
  }
}
