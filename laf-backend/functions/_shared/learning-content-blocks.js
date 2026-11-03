export const CONTENT_BLOCKS_VERSION = 3;
export const PRESENTATION_CONTRACT = 'learning-presentation-v1';
const KINDS = ['knowledge', 'example', 'note', 'stat', 'chart', 'figure'];
const PRESENTATION_KINDS = [...KINDS, 'table', 'checklist'];
const TONES = ['default', 'success', 'warning', 'danger'];
function check(condition) {
  if (!condition) throw Object.assign(new Error('教学卡片结构不合法'), { code: 'CONTENT_BLOCKS_INVALID' });
}
function object(value, keys) {
  check(value && typeof value === 'object' && !Array.isArray(value));
  check(Object.keys(value).every((key) => keys.includes(key)));
}
function text(value, limit) {
  check(typeof value === 'string' && value.trim().length > 0 && value.length <= limit);
  return value;
}
function number(value, max) {
  check(typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max);
  return value;
}
function list(value, count, length) {
  check(Array.isArray(value) && value.length > 0 && (count === null || value.length <= count));
  return value.map((item) => text(item, length));
}
function optionalText(input, output, limits) {
  for (const [key, limit] of Object.entries(limits))
    if (input[key] !== undefined) output[key] = text(input[key], limit);
}
function statValue(value) {
  if (typeof value === 'number') check(Number.isFinite(value));
  else text(value, 20);
  check(String(value).length <= 20);
  return value;
}
function chart(input) {
  object(input, ['type', 'title', 'unit', 'series', 'total', 'caption']);
  check(['bar', 'donut', 'progress'].includes(input.type));
  check(Array.isArray(input.series) && input.series.length >= 1 && input.series.length <= 6);
  const output = {
    type: input.type,
    series: input.series.map((item) => {
      object(item, ['label', 'value', 'tone']);
      const entry = { label: text(item.label, 8), value: number(item.value, 100000) };
      if (item.tone !== undefined) {
        check(TONES.includes(item.tone));
        entry.tone = item.tone;
      }
      return entry;
    })
  };
  optionalText(input, output, { title: 20, unit: 8, caption: 40 });
  if (input.total !== undefined) output.total = number(input.total, Number.MAX_SAFE_INTEGER);
  const sum = output.series.reduce((total, item) => total + item.value, 0);
  if (output.type === 'donut' && output.total !== undefined) check(sum <= output.total);
  return output;
}
function figure(input) {
  object(input, ['type', 'nodes', 'edges', 'caption', 'width', 'height']);
  check(['tree', 'graph', 'geometry', 'flow'].includes(input.type));
  check(Array.isArray(input.nodes) && input.nodes.length >= 1 && input.nodes.length <= 24);
  check(Array.isArray(input.edges) && input.edges.length <= 32);
  const nodes = input.nodes.map((node) => {
    object(node, ['id', 'label', 'x', 'y']);
    return { id: text(node.id, 32), label: text(node.label, 6), x: number(node.x, 320), y: number(node.y, 240) };
  });
  const ids = new Set(nodes.map((node) => node.id));
  check(ids.size === nodes.length);
  const edges = input.edges.map((edge) => {
    check(Array.isArray(edge) && edge.length === 2 && edge.every((id) => ids.has(id)) && edge[0] !== edge[1]);
    return [...edge];
  });
  const output = { type: input.type, nodes, edges, caption: text(input.caption, 40) };
  for (const [key, max] of [
    ['width', 320],
    ['height', 240]
  ]) {
    if (input[key] !== undefined) {
      output[key] = number(input[key], max);
      check(output[key] > 0);
    }
  }
  return output;
}

function table(input) {
  object(input, ['kind', 'title', 'columns', 'rows']);
  check(Array.isArray(input.columns) && input.columns.length > 0);
  check(Array.isArray(input.rows) && input.rows.length > 0);
  const output = {
    kind: 'table',
    columns: input.columns.map((value) => text(value, 120)),
    rows: input.rows.map((row) => {
      check(Array.isArray(row) && row.length === input.columns.length);
      return row.map((value) => text(value, 2000));
    })
  };
  optionalText(input, output, { title: 120 });
  return output;
}

function checklist(input) {
  object(input, ['kind', 'title', 'items']);
  check(Array.isArray(input.items) && input.items.length > 0);
  const items = input.items.map((item) => {
    object(item, ['id', 'label']);
    return { id: text(item.id, 32), label: text(item.label, 400) };
  });
  check(new Set(items.map((item) => item.id)).size === items.length);
  const output = { kind: 'checklist', items };
  optionalText(input, output, { title: 120 });
  return output;
}

// Presentation-only contract. Answers, scores, plans and executable actions belong to host facts/tools.
export function normalizeContentBlocks(value) {
  object(value, ['version', 'items']);
  check([1, 2, CONTENT_BLOCKS_VERSION].includes(value.version) && Array.isArray(value.items));
  const current = value.version === CONTENT_BLOCKS_VERSION;
  check(value.items.length > 0 && (current || value.items.length <= 6));
  const items = value.items.map((item) => {
    check(item && (current ? PRESENTATION_KINDS : KINDS).includes(item.kind));
    let output;
    if (item.kind === 'table') output = table(item);
    else if (item.kind === 'checklist') output = checklist(item);
    else if (item.kind === 'stat') {
      object(item, ['kind', 'label', 'value', 'denominator', 'unit', 'caption']);
      output = { kind: 'stat', label: text(item.label, 20), value: statValue(item.value) };
      if (item.denominator !== undefined) output.denominator = statValue(item.denominator);
      optionalText(item, output, { unit: 8, caption: 40 });
    } else if (item.kind === 'chart' || item.kind === 'figure') {
      object(item, ['kind', item.kind]);
      output = { kind: item.kind, [item.kind]: item.kind === 'chart' ? chart(item.chart) : figure(item.figure) };
    } else {
      object(item, ['kind', 'title', 'body', 'points', 'steps', 'formula']);
      output = { kind: item.kind, title: text(item.title, 120) };
      optionalText(item, output, { body: 2000, formula: 500 });
      if (item.points !== undefined) output.points = list(item.points, current ? null : 4, 400);
      if (item.steps !== undefined) {
        check(item.kind === 'example');
        output.steps = list(item.steps, current ? null : 6, 600);
      }
      check(output.body || output.points || output.steps || output.formula);
    }
    if (!current) check(JSON.stringify(output).length <= 4000);
    return output;
  });
  const output = { version: current ? CONTENT_BLOCKS_VERSION : 2, items };
  if (!current) check(JSON.stringify(output).length <= 12000);
  return output;
}

export function mapContentBlocks(value, transform) {
  const content = normalizeContentBlocks(value);
  const map = (item) => {
    const output = { ...item };
    for (const key of ['title', 'body', 'formula', 'label', 'caption', 'unit', 'value', 'denominator'])
      if (typeof output[key] === 'string') output[key] = transform(output[key]);
    for (const key of ['points', 'steps']) if (output[key]) output[key] = output[key].map(transform);
    if (output.kind === 'table') {
      output.columns = output.columns.map(transform);
      output.rows = output.rows.map((row) => row.map(transform));
    }
    if (output.kind === 'checklist')
      output.items = output.items.map((item) => ({ ...item, label: transform(item.label) }));
    if (output.chart) output.chart = { ...map(output.chart), series: output.chart.series.map(map) };
    if (output.figure)
      output.figure = {
        ...map(output.figure),
        nodes: output.figure.nodes.map((node) => ({ ...node, label: transform(node.label) }))
      };
    return output;
  };
  return normalizeContentBlocks({ ...content, items: content.items.map(map) });
}
