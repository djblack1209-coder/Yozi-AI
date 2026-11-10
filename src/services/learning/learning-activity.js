const toolLabels = Object.freeze({
  progress: 'progress',
  visualize: 'visualize',
  focus: 'focus',
  submit: 'submit',
  hint: 'hint',
  method: 'method',
  assess: 'assess',
  plan: 'plan',
  stop: 'stop',
  'entry.query': 'queryEntries',
  'entry.aggregate': 'summarizeEntries',
  'entry.create': 'entry',
  'entry.update': 'entry'
});

export function toolActivitiesByMessage(messages, executions = []) {
  const anchors = new Map();
  for (const { id, role } of messages) {
    if (role === 'user' && id.endsWith(':message')) {
      const turn = id.slice(0, -8);
      if (!anchors.has(turn)) anchors.set(turn, id);
    } else if (role === 'assistant' && id.endsWith(':reply')) anchors.set(id.slice(0, -6), id);
  }
  const groups = new Map();
  for (const execution of executions) {
    const turn = /^(.*):tool:\d+:(?:receipt|denied:[0-9a-f]{8})$/.exec(execution.id)?.[1];
    const anchor = anchors.get(turn);
    const action = Object.hasOwn(toolLabels, execution.tool) ? toolLabels[execution.tool] : null;
    if (!anchor || !action) continue;
    if (!groups.has(anchor)) groups.set(anchor, []);
    groups.get(anchor).push({ id: execution.id, action, status: execution.status });
  }
  return groups;
}

const coachLabels = Object.freeze({
  diagnostic: 'diagnostic',
  daily: 'practice',
  feedback: 'assess',
  essay: 'essay',
  summary: 'summary'
});

export function coachActivitiesByDay(requests = []) {
  const groups = new Map();
  for (const record of requests) {
    const { phase, day } = record.request;
    if (!Object.hasOwn(coachLabels, phase) || !['completed', 'closed'].includes(record.status)) continue;
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push({
      id: record.id,
      action: coachLabels[phase],
      status: record.status === 'completed' ? 'success' : record.outcome === 'cancelled' ? 'cancelled' : 'failed'
    });
  }
  return groups;
}
