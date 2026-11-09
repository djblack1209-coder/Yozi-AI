let platformFormatter;

export function setLearningDateTimeFormatter(formatter) {
  platformFormatter = formatter;
}

export function learningDateTimeFormat(locale, options) {
  if (globalThis.Intl?.DateTimeFormat) return new Intl.DateTimeFormat(locale, options);
  if (platformFormatter) return platformFormatter(locale, options);
  throw new Error('Date-time formatting is unavailable');
}

export function dateTimeParts(formatter, at) {
  return Object.fromEntries(formatter.formatToParts(at).map(({ type, value }) => [type, value]));
}

export function dayKey(time, timeZone) {
  const formatter = learningDateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const { year, month, day } = dateTimeParts(formatter, new Date(time));
  return `${year}-${month}-${day}`;
}
