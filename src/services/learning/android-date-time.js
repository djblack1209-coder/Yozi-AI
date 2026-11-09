/* global plus */
let classes;

function androidClasses() {
  if (!classes) {
    const bridge = plus.android;
    const TimeZone = bridge.importClass('java.util.TimeZone');
    classes = {
      bridge,
      TimeZone,
      Locale: bridge.importClass('java.util.Locale'),
      DateFormat: bridge.importClass('android.text.format.DateFormat'),
      SimpleDateFormat: bridge.importClass('java.text.SimpleDateFormat'),
      JavaDate: bridge.importClass('java.util.Date'),
      zoneIds: new Map(Array.from(TimeZone.getAvailableIDs(), (id) => [id.toLowerCase(), id]))
    };
  }
  return classes;
}

function skeletonFor({ year, month, day, weekday, hour, hour12, hourCycle, minute, second }) {
  return (
    [
      year && (year === '2-digit' ? 'yy' : 'y'),
      month && ({ '2-digit': 'MM', short: 'MMM', long: 'MMMM' }[month] || 'M'),
      day && (day === '2-digit' ? 'dd' : 'd'),
      weekday && ({ long: 'EEEE', narrow: 'EEEEE' }[weekday] || 'EEE'),
      hour && (hour12 === false || hourCycle === 'h23' ? 'H' : 'j').repeat(hour === '2-digit' ? 2 : 1),
      minute && (minute === '2-digit' ? 'mm' : 'm'),
      second && (second === '2-digit' ? 'ss' : 's')
    ]
      .filter(Boolean)
      .join('') || 'yMd'
  );
}

function milliseconds(value) {
  const at = Number(value);
  if (!Number.isFinite(at)) throw new RangeError('Invalid time value');
  return at;
}

// The app uses Android's locale data for display and numeric fields for learning dates.
export function androidDateTimeFormat(locale, options = {}) {
  const { bridge, TimeZone, Locale, DateFormat, SimpleDateFormat, JavaDate, zoneIds } = androidClasses();
  const requestedZone = options.timeZone;
  const offset = /^([+-](?:[01]\d|2[0-3]))(?::?([0-5]\d))?$/.exec(requestedZone);
  const id = offset ? `GMT${offset[1]}:${offset[2] || '00'}` : zoneIds.get(String(requestedZone).toLowerCase());
  if (requestedZone !== undefined && !id) throw new RangeError(`Invalid time zone: ${requestedZone}`);
  const zone = id ? TimeZone.getTimeZone(id) : TimeZone.getDefault();
  const zoneId = offset ? id.slice(3) : bridge.invoke(zone, 'getID');
  let display;

  return {
    resolvedOptions: () => ({ timeZone: zoneId }),
    format(value = Date.now()) {
      if (!display) {
        const language = locale ? Locale.forLanguageTag(locale) : Locale.getDefault();
        display = new SimpleDateFormat(DateFormat.getBestDateTimePattern(language, skeletonFor(options)), language);
        bridge.invoke(display, 'setTimeZone', zone);
      }
      return bridge.invoke(display, 'format', new JavaDate(milliseconds(value)));
    },
    formatToParts(value) {
      const at = milliseconds(value);
      const local = new Date(at + bridge.invoke(zone, 'getOffset', at));
      const year = local.getUTCFullYear();
      return Object.entries({
        year: year > 0 ? year : 1 - year,
        month: local.getUTCMonth() + 1,
        day: local.getUTCDate(),
        hour: local.getUTCHours(),
        minute: local.getUTCMinutes(),
        second: local.getUTCSeconds()
      })
        .filter(([type]) => options[type])
        .map(([type, part]) => ({
          type,
          value: options[type] === '2-digit' ? String(part % 100).padStart(2, '0') : String(part)
        }));
    }
  };
}
