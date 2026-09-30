/* Trading calendars, evaluated in America/New_York so DST is handled by the platform's time-zone data.
   Weekends/daily breaks → MARKET_CLOSED. Exchange holidays are NOT modelled: on a holiday, quotes simply
   age into STALE (which is safe — it is never shown as LIVE). */
const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const DAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function nyParts(ms) {
  const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return { day: DAYS[p.weekday], minutes: (+p.hour) * 60 + (+p.minute) };
}

/** true when the market for `calendar` is open at `ms`. */
export function isOpen(calendar, ms = Date.now()) {
  if (calendar === 'always') return true;
  const { day, minutes } = nyParts(ms);
  const H17 = 17 * 60, H18 = 18 * 60;
  const opensSun = calendar === 'fx' ? H17 : H18; // FX week opens Sun 17:00 NY; metals/CME-style Sun 18:00 NY
  if (day === 6) return false;                                   // Saturday
  if (day === 0) return minutes >= opensSun;                     // Sunday evening open
  if (day === 5) return minutes < H17;                           // Friday 17:00 close
  if (calendar === 'fx') return true;                            // FX: continuous Mon–Thu
  return !(minutes >= H17 && minutes < H18);                     // metals / CME: daily 17:00–18:00 break
}
