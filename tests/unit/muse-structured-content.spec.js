import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { parseMuseRichContent, museSafeLink } from '@/services/learning/muse-rich-content.js';
import MuseRichText from '@/components/business/learning/muse-rich-text.vue';
import MusePracticeSheet from '@/pages/learning/components/muse-practice-sheet.vue';
import MuseFeedbackCard from '@/components/business/learning/muse-feedback-card.vue';
import MuseWritingCard from '@/components/business/learning/muse-writing-card.vue';

let wrapper;
afterEach(() => {
  wrapper?.unmount();
  vi.restoreAllMocks();
});
const stubs = {
  view: { template: '<div><slot /></div>' },
  text: { template: '<span><slot /></span>' },
  BaseIcon: true
};

describe('Muse structured assistant output', () => {
  it('renders nested score cards, semantic colors, badges and comparison tables from the reference syntax', () => {
    wrapper = mount(MuseRichText, {
      props: {
        content: `## 本次反馈
<grid columns="3" gap={2}>
<grid-item><box border radius="xl" padding={3}><text color="secondary">原答</text><title size="2xl" color="success">已保存</title></box></grid-item>
<grid-item><badge color="warning">AI 评估</badge></grid-item>
</grid>
<box border><row justify="between"><text weight="semibold">句子对照</text><badge color="danger">待改写</badge></row><table><table-row><table-cell>原答</table-cell><table-cell>建议</table-cell></table-row><table-row><table-cell>I likes books.</table-cell><table-cell>I like books.</table-cell></table-row></table></box>`
      },
      global: { stubs }
    });
    expect(wrapper.get('[role="heading"]').text()).toBe('本次反馈');
    expect(wrapper.get('.rich-grid').attributes('style')).toContain('repeat(3, minmax(0, 1fr))');
    expect(wrapper.findAll('.rich-box')).toHaveLength(2);
    expect(wrapper.get('.rich-color-success').text()).toBe('已保存');
    expect(wrapper.get('[role="table"]').text()).toContain('I like books.');
    expect(wrapper.findAll('[role="row"]')).toHaveLength(2);
    expect(wrapper.text()).not.toContain('<box');
  });

  it('never executes raw HTML, JSX, event attributes or unsafe links', () => {
    wrapper = mount(MuseRichText, {
      props: {
        content:
          '<script>globalThis.__museUnsafe = true</script><box onclick="steal()" style="background:url(secret)">safe</box><Link url="javascript:steal()">link</Link>\n```js\n<box>literal code</box>\n```'
      },
      global: { stubs }
    });
    expect(wrapper.find('script').exists()).toBe(false);
    expect(wrapper.find('[onclick]').exists()).toBe(false);
    expect(wrapper.find('a').exists()).toBe(false);
    expect(wrapper.text()).toContain('<script>globalThis.__museUnsafe = true</script>');
    expect(wrapper.text()).toContain('<box>literal code</box>');
    expect(globalThis.__museUnsafe).toBeUndefined();
    expect(museSafeLink('https://example.com/lesson')).toBe('https://example.com/lesson');
    expect(museSafeLink('https://name:secret@example.com')).toBe('');
    const nodes = parseMuseRichContent('<box>'.repeat(2000) + 'bounded' + '</box>'.repeat(2000));
    expect(JSON.stringify(nodes).length).toBeLessThan(40000);
  });

  it('keeps practice browsing read-only and submits only the active unsaved answer', async () => {
    const cards = [
      { id: 'one', title: '成分', prompt: 'Read the sentence.' },
      { id: 'two', title: '搭配', prompt: 'Complete the phrase.' }
    ];
    const answers = [{ cardId: 'one', answer: 'My original answer.' }];
    const before = JSON.stringify({ cards, answers });
    wrapper = mount(MusePracticeSheet, {
      props: { title: '摸底', cards, answers, currentId: 'two', modelValue: 'My new answer.' },
      global: { stubs }
    });
    await wrapper.findAll('button')[0].trigger('tap');
    expect(wrapper.text()).toContain('My original answer.');
    expect(wrapper.findComponent(MuseWritingCard).exists()).toBe(false);
    expect(wrapper.emitted('submit')).toBeUndefined();
    await wrapper.findAll('button')[1].trigger('tap');
    await wrapper.findComponent(MuseWritingCard).get('button').trigger('tap');
    expect(wrapper.emitted('submit')).toEqual([[cards[1]]]);
    expect(JSON.stringify({ cards, answers })).toBe(before);
  });
  it('过程与迁移题的示范在提交后显示，避免模型提前泄露解法', async () => {
    const card = { id: 'c2', kind: 'trace', title: '追踪', prompt: '从下标0开始查找。', example: '0→1→3，查找结束。' };
    wrapper = mount(MusePracticeSheet, { props: { title: '训练', cards: [card], currentId: 'c2' }, global: { stubs } });
    expect(wrapper.find('.practice-example').exists()).toBe(false);
    await wrapper.setProps({ answers: [{ cardId: 'c2', answer: '我猜先到2。' }] });
    expect(wrapper.get('.practice-example').text()).toContain('0→1→3');
    await wrapper.setProps({ cards: [{ ...card, kind: 'concept' }], answers: [] });
    expect(wrapper.find('.practice-example').exists()).toBe(true);
  });

  it('expands feedback locally and adopts a phrase only through the explicit action', async () => {
    const feedback = {
      id: 'saved-feedback',
      lines: [{ original: 'I likes books.', rewrite: 'I like books.', advice: '主谓一致。' }],
      dimensions: [{ name: '语法', comment: '主谓一致待加强' }],
      weaknesses: ['主谓一致'],
      phrases: ['I am writing to invite you.']
    };
    const before = JSON.stringify(feedback);
    wrapper = mount(MuseFeedbackCard, { props: { feedback, title: '搭配 · AI 评估' }, global: { stubs } });
    expect(wrapper.get('.feedback-title').text()).toBe('搭配 · AI 评估');
    expect(wrapper.get('.feedback-ink-source').element.textContent).toBe(feedback.lines[0].original);
    expect(wrapper.get('.feedback-ink-revision').element.textContent).toBe(feedback.lines[0].rewrite);
    expect(wrapper.get('.muse-ink-strike').text()).toBe('likes');
    expect(wrapper.get('.muse-ink-mark').text()).toBe('like');
    expect(wrapper.text()).not.toContain('主谓一致。');
    await wrapper.get('button[aria-label="展开解析"]').trigger('tap');
    expect(wrapper.text()).toContain('主谓一致。');
    await wrapper.setProps({ feedback: { ...feedback } });
    expect(wrapper.text()).toContain('主谓一致。');
    expect(wrapper.emitted('adopt')).toBeUndefined();
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '采用到句式库')
      .trigger('tap');
    expect(wrapper.emitted('adopt')).toEqual([['I am writing to invite you.']]);
    expect(JSON.stringify(feedback)).toBe(before);
  });
});

// Batch 3A: only bounded presentation data enters these components.
import { createPinia, setActivePinia } from 'pinia';
import {
  normalizeContentBlocks,
  mapContentBlocks
} from '../../laf-backend/functions/_shared/learning-content-blocks.js';
import { figureSvg, chartSvg, sanitizeSvgSubset } from '../../laf-backend/functions/_shared/learning-figures.js';
import MuseChart from '@/pages/learning/components/muse-chart.vue';
import MuseFigure from '@/pages/learning/components/muse-figure.vue';
import MuseStatTile from '@/pages/learning/components/muse-stat-tile.vue';
import LearningContentCards from '@/pages/learning/components/learning-content-cards.vue';
import { useThemeStore } from '@/stores/modules/theme.js';
const tree = {
  type: 'tree',
  nodes: [
    { id: 'a', label: '20', x: 130, y: 26 },
    { id: 'b', label: '16', x: 65, y: 102 }
  ],
  edges: [['a', 'b']],
  width: 260,
  height: 174,
  caption: '插入前的树'
};
const bar = {
  type: 'bar',
  series: [
    { label: '词汇', value: 25 },
    { label: '句式', value: 50, tone: 'success' }
  ]
};
const bundle = (item, version = 2) => ({ version, items: [item] });
const palette = {
  node: '#fff',
  text: '#0f172a',
  line: '#64748b',
  default: '#0064e0',
  success: '#187446',
  track: '#0000001a'
};
const invalid = (value) =>
  expect(() => normalizeContentBlocks(value)).toThrowError(expect.objectContaining({ code: 'CONTENT_BLOCKS_INVALID' }));

describe('3A structured content schema', () => {
  it('normalizes v1 snapshots to v2 and accepts display-only stat, chart and figure', () => {
    const old = { kind: 'knowledge', title: '旧消息', body: '仍可回看' };
    expect(normalizeContentBlocks(bundle(old, 1))).toEqual(bundle(old));
    const value = {
      version: 2,
      items: [
        { kind: 'stat', label: '学习时间', value: '25', denominator: 60, unit: '分钟', caption: '已保存事实' },
        { kind: 'chart', chart: bar },
        { kind: 'figure', figure: tree }
      ]
    };
    expect(normalizeContentBlocks(value)).toEqual(value);
    const mapped = mapContentBlocks(value, (value) =>
      value.replace('已保存', '明确保存').replace('词汇', '搭配').replace('插入前', '插入后')
    );
    expect(mapped.items[0].caption).toBe('明确保存事实');
    expect(mapped.items[1].chart.series[0].label).toBe('搭配');
    expect(mapped.items[2].figure.caption).toBe('插入后的树');
    expect(mapped.items[2].figure.nodes[0].id).toBe('a');
  });
  it.each([
    {
      kind: 'figure',
      figure: { ...tree, nodes: Array.from({ length: 25 }, (_, i) => ({ id: `${i}`, label: 'x', x: 20, y: 20 })) }
    },
    { kind: 'figure', figure: { ...tree, edges: [['a', 'missing']] } },
    { kind: 'figure', figure: { ...tree, nodes: [tree.nodes[0], tree.nodes[0]] } },
    { kind: 'figure', figure: { ...tree, edges: [['a', 'a']] } },
    { kind: 'figure', figure: { ...tree, nodes: [{ ...tree.nodes[0], x: 321 }] } },
    { kind: 'figure', figure: { ...tree, caption: 'x'.repeat(41) } },
    { kind: 'figure', figure: { ...tree, svg: '<svg/>' } },
    { kind: 'chart', chart: { ...bar, series: Array(7).fill(bar.series[0]) } },
    { kind: 'chart', chart: { ...bar, series: [] } },
    { kind: 'chart', chart: { ...bar, series: [{ label: 'a', value: -1 }] } },
    { kind: 'chart', chart: { ...bar, series: [{ label: 'a', value: NaN }] } },
    { kind: 'chart', chart: { ...bar, series: [{ label: 'a', value: Infinity }] } },
    { kind: 'chart', chart: { ...bar, type: 'donut', total: 74 } },
    { kind: 'chart', chart: { ...bar, caption: 'x'.repeat(41) } },
    { kind: 'chart', chart: { ...bar, series: [{ label: 'a', value: 1, tone: 'pink' }] } },
    { kind: 'stat', label: 'x', value: Infinity },
    { kind: 'stat', label: 'x'.repeat(21), value: 1 },
    { kind: 'stat', label: 'x', value: 1, score: 10 },
    { kind: 'stat', label: 'x', value: 1, answer: 'A' },
    { kind: 'figure', figure: '<svg><script/></svg>' }
  ])('rejects out-of-bound data and undeclared fields %#', (item) => invalid(bundle(item)));
  it('enforces per-item and full-envelope JSON quotas', () => {
    invalid(bundle({ kind: 'example', title: '长', body: 'x'.repeat(2000), steps: Array(6).fill('y'.repeat(600)) }));
    const item = { kind: 'knowledge', title: 'a', body: 'x'.repeat(1950) };
    invalid({ version: 2, items: Array(6).fill({ ...item, points: ['p'.repeat(60)] }) });
  });
});

describe('3A host SVG generation and migration subset', () => {
  it('clips each edge to the node circumference and escapes labels', () => {
    const markup = figureSvg(
      {
        ...tree,
        nodes: [
          { id: 'a', label: '<&"', x: 20, y: 20 },
          { id: 'b', label: 'B', x: 120, y: 20 }
        ]
      },
      palette
    );
    expect(markup).toContain('d="M39 20 L101 20"');
    expect(markup).toContain('&lt;&amp;&quot;');
    expect(markup).not.toContain('<&');
    expect(
      [...markup.matchAll(/<(\w+)/g)].every((match) => ['svg', 'g', 'path', 'circle', 'text'].includes(match[1]))
    ).toBe(true);
    expect(figureSvg({ ...tree, nodes: [{ id: 'a', label: 'x', x: 0, y: 0 }], edges: [] }, palette)).toContain(
      'viewBox="-20 -20 280 194"'
    );
  });
  it('draws donut arcs relative to total and leaves an honest remaining track', () => {
    const markup = chartSvg({ ...bar, type: 'donut', total: 100 }, palette);
    const lengths = [...markup.matchAll(/stroke-dasharray="([\d.]+) ([\d.]+)"/g)];
    expect(lengths).toHaveLength(2);
    expect(lengths.reduce((sum, match) => sum + Number(match[1]), 0)).toBeCloseTo(2 * Math.PI * 52 * 0.75, 2);
    expect(chartSvg({ type: 'donut', series: [{ label: '空', value: 0 }] }, palette)).not.toContain('NaN');
    expect(chartSvg(bar, palette)).toBe('');
  });
  it.each([
    '<svg><script/></svg>',
    '<svg onclick="evil()"/>',
    '<svg><foreignObject/></svg>',
    '<svg><image href="https://example.com"/></svg>',
    '<svg><use href="#a"/></svg>',
    '<svg><a href="javascript:evil()"/></svg>',
    '<svg style="background:url(x)"/>',
    '<svg><text>javascript:evil()</text></svg>',
    '<svg><text>http://example.com</text></svg>',
    '<svg><text>data:text/html,x</text></svg>',
    '<svg><text onload = "evil()">x</text></svg>',
    '<svg width="20" width="30"/>',
    '<svg><circle></svg>',
    '<svg/ ><svg/>',
    '<svg>' + '<circle/>'.repeat(120) + '</svg>',
    '<svg><text>' + '猫'.repeat(2800) + '</text></svg>'
  ])('drops the whole untrusted migration image %#', (raw) => expect(sanitizeSvgSubset(raw)).toBe(''));
  it('rebuilds a safe subset without allowing arbitrary markup or attributes', () => {
    const result = sanitizeSvgSubset(
      '<svg viewBox="0 0 260 174"><g fill="none"><path d="M20 20 L80 80"/><circle cx="20" cy="20" r="19"/><text x="20" y="25">20</text></g></svg>'
    );
    expect(result).toContain('<text x="20" y="25">20</text>');
    expect(sanitizeSvgSubset('<svg class="anything"/>')).toBe('');
  });
});

describe('3A presentation components', () => {
  it('sizes bars by max, zero bars safely, and progress by total', async () => {
    setActivePinia(createPinia());
    wrapper = mount(MuseChart, { props: { chart: bar }, global: { stubs } });
    expect(wrapper.findAll('.chart-fill').map((node) => node.attributes('style'))).toEqual([
      'width: 50%;',
      'width: 100%;'
    ]);
    await wrapper.setProps({ chart: { type: 'bar', series: [{ label: '零', value: 0 }] } });
    expect(wrapper.get('.chart-fill').attributes('style')).toBe('width: 0%;');
    await wrapper.setProps({ chart: { type: 'progress', total: 50, series: [{ label: '完成', value: 10 }] } });
    expect(wrapper.get('.chart-fill').attributes('style')).toBe('width: 20%;');
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('10');
  });
  it('rebakes figure and donut palettes immediately when the theme changes', async () => {
    setActivePinia(createPinia());
    wrapper = mount(MuseFigure, { props: { figure: tree }, global: { stubs } });
    const theme = useThemeStore();
    expect(decodeURIComponent(wrapper.get('img').attributes('src'))).toContain('fill="#fff"');
    theme.isDark = true;
    await wrapper.vm.$nextTick();
    expect(decodeURIComponent(wrapper.get('img').attributes('src'))).toContain('fill="#1f1f20"');
    expect(wrapper.get('img').attributes('alt')).toBe(tree.caption);
    wrapper.unmount();
    wrapper = mount(MuseChart, { props: { chart: { ...bar, type: 'donut' } }, global: { stubs } });
    expect(decodeURIComponent(wrapper.get('img').attributes('src'))).toContain('#7ee2a0');
    theme.isDark = false;
    await wrapper.vm.$nextTick();
    expect(decodeURIComponent(wrapper.get('img').attributes('src'))).toContain('#187446');
  });
  it('renders string statistics and keeps new kinds behind the explicit continue rhythm', async () => {
    setActivePinia(createPinia());
    const content = {
      version: 2,
      items: [
        { kind: 'stat', label: '复习', value: '进行中' },
        { kind: 'chart', chart: bar },
        { kind: 'figure', figure: tree }
      ]
    };
    const before = JSON.stringify(content);
    wrapper = mount(LearningContentCards, { props: { content }, global: { stubs } });
    expect(wrapper.findComponent(MuseStatTile).text()).toContain('进行中');
    expect(wrapper.findComponent(MuseChart).exists()).toBe(false);
    await wrapper.get('button').trigger('tap');
    expect(wrapper.findComponent(MuseChart).exists()).toBe(true);
    expect(wrapper.findComponent(MuseFigure).exists()).toBe(false);
    await wrapper.get('button').trigger('tap');
    expect(wrapper.findComponent(MuseFigure).exists()).toBe(true);
    expect(JSON.stringify(content)).toBe(before);
    expect(wrapper.emitted('submit')).toBeUndefined();
  });
});
