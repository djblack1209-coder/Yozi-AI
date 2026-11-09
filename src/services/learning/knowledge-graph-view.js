// Read-only host projection. No diagnosis, Store, persistence or network calls.
const chapters = ['审题', '结构', '句式', '语法', '表达', '论证', '检查', '带写'];
// Public capability standards deliberately omit task-specific scoring keys/solutions.
const displayStandards = {
  task: '完整识别材料中的写作任务，不添加未给事实',
  audience: '根据读者身份与熟悉程度选择合适语气',
  purpose: '准确区分交际目的与背景原因',
  genre: '辨别不同体裁的结构和必要要素',
  sentence: '独立构造意思完整、主谓匹配的句子',
  clause: '使用适当从句连接信息，结构完整且逻辑一致',
  register: '根据交际场景保持得体、一致的语域',
  paraphrase: '改变措辞或结构时保持原意、语法和事实准确',
  linking: '辨认句间逻辑并选择适当衔接',
  outline: '按交际目的组织有序且完整的写作提纲',
  opening: '以完整、得体的开篇明确交际目的',
  detail: '准确展开材料要求的细节，不混淆或补造事实',
  closing: '结尾与交际目的相符，清晰传达所需回应',
  claim: '形成清晰、有限定且可展开的观点',
  example: '使用相关例子支持观点，并说明二者的联系',
  coherence: '段内层次、指代和衔接清晰，内容紧扣观点',
  application: '独立整合体裁、任务、语气和段落组织完成应用文',
  essay: '独立完成有明确观点、相关支持和解释的连贯论证段',
  translation: '准确转写原句的主要信息与逻辑，句子结构完整',
  'revision-task': '依据题目要求逐项核对草稿并补齐缺失任务',
  'revision-language': '识别并修正常见语言错误，能解释修改依据',
  'timed-check': '依据任务影响与时间约束安排检查优先级',

  agreement: '依据中心主语判断谓语单复数',
  tense: '依据明确时间线索选择谓语时态',
  articles: '辨别名词可数性并选择合适限定词',
  collocation: '辨认语境中自然、准确的动词搭配'
};

export function knowledgeGraphTitle(seed) {
  const subject = typeof seed?.subjectLabel === 'string' ? seed.subjectLabel.trim() : '';
  return subject ? `${subject} · 知识框架` : '知识框架';
}

export function knowledgeGraphView(seed, width = 680, progress = null) {
  const canvasWidth = Math.max(280, Math.min(720, Number(width) || 680));
  const columns = canvasWidth < 500 ? 2 : 3;
  const gap = 18,
    inset = 22,
    nodeHeight = 58;
  const nodeWidth = (canvasWidth - inset * 2 - gap * (columns - 1)) / columns;
  const topics = Array.isArray(seed?.topics) ? seed.topics : [];
  const domains = [...chapters, ...new Set(topics.map((topic) => topic.chapter).filter((c) => !chapters.includes(c)))];
  let y = 0;
  const groups = [],
    nodes = [];
  for (const chapter of domains) {
    const rows = topics.filter((topic) => topic.chapter === chapter);
    if (!rows.length) continue;
    groups.push({ name: chapter, y: y + 8, count: rows.length });
    rows.forEach((topic, i) => {
      nodes.push({
        id: topic.id,
        name: topic.name,
        chapter,
        status: 'insufficient',
        statusLabel: '数据不足',
        recordLabel: '暂无记录 · 待审核',
        evidenceIds: [],
        ...(progress?.nodes.find((item) => item.id === topic.id) || {}),
        masteryCriteria: [displayStandards[topic.id] || '待审核'],
        diagnosticPrompt: topic.diagnostic?.prompt || '',
        x: inset + (i % columns) * (nodeWidth + gap),
        y: y + 34 + Math.floor(i / columns) * (nodeHeight + 14),
        width: nodeWidth,
        height: nodeHeight
      });
    });
    y += 34 + Math.ceil(rows.length / columns) * (nodeHeight + 14) + 22;
  }
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges = (seed?.edges || [])
    .filter((edge) => byId.has(edge.from) && byId.has(edge.to))
    .map((edge) => ({
      from: edge.from,
      to: edge.to,
      strength: edge.strength,
      fromName: byId.get(edge.from).name,
      toName: byId.get(edge.to).name
    }));
  return { title: knowledgeGraphTitle(seed), width: canvasWidth, height: y, nodes, edges, groups };
}

export function knowledgeNodeDetail(graph, id) {
  const node = graph.nodes.find((item) => item.id === id);
  if (!node) return null;
  return { ...node, prerequisites: graph.edges.filter((edge) => edge.to === id) };
}

const xml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]
  );
export function knowledgeGraphSvg(graph, dark = false, selectedId = '', animate = false) {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const line = dark ? '#a7aaad' : '#65686c';
  const connectedLine = dark ? '#a6ddff' : '#126895';
  const reveals = [];
  const paths = graph.edges
    // Keep the complete graph for details; the framework draws local relations
    // and only the selected node's cross-group relations.
    .filter(
      (edge) =>
        byId.get(edge.from).chapter === byId.get(edge.to).chapter || selectedId === edge.from || selectedId === edge.to
    )
    .map((edge, i) => {
      const a = byId.get(edge.from),
        b = byId.get(edge.to);
      const left = i % 2 === 0;
      const ay = a.y + a.height / 2;
      const lane = left ? 4 + (i % 5) * 3 : graph.width - 4 - (i % 5) * 3;
      const active = selectedId === edge.from || selectedId === edge.to;
      const reveal = active && animate;
      const opacity = selectedId ? (active ? 0.95 : 0.12) : 0.42;
      let path;
      if (a.chapter === b.chapter && a.y === b.y) {
        const forward = a.x < b.x;
        const blocked = graph.nodes.some(
          (node) => node.y === a.y && node.x > Math.min(a.x, b.x) && node.x < Math.max(a.x, b.x)
        );
        path = blocked
          ? `M${a.x + a.width / 2} ${a.y} V${a.y - 7} H${b.x + b.width / 2} V${b.y}`
          : `M${forward ? a.x + a.width : a.x} ${ay} H${forward ? b.x : b.x + b.width}`;
      } else if (a.chapter === b.chapter && Math.abs(a.y - b.y) <= a.height + 14) {
        const down = a.y < b.y;
        const start = down ? a.y + a.height : a.y;
        const end = down ? b.y : b.y + b.height;
        path = `M${a.x + a.width / 2} ${start} V${(start + end) / 2} H${b.x + b.width / 2} V${end}`;
      } else {
        const down = a.y < b.y;
        const start = down ? a.y + a.height : a.y;
        const end = down ? b.y : b.y + b.height;
        // Leave through the row gap before entering an outer lane, including
        // selected cross-group relations whose endpoints may be in middle columns.
        path = `M${a.x + a.width / 2} ${start} V${start + (down ? 7 : -7)} H${lane} V${end + (down ? -7 : 7)} H${b.x + b.width / 2} V${end}`;
      }
      if (reveal)
        reveals.push(
          `<mask id="reveal-${i}" maskUnits="userSpaceOnUse" x="0" y="0" width="${graph.width}" height="${graph.height}"><path class="connection-trace" d="${path}" pathLength="1" fill="none" stroke="white" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/></mask>`
        );
      return `<path data-from="${xml(edge.from)}" data-to="${xml(edge.to)}" data-strength="${xml(edge.strength)}" d="${path}" fill="none" stroke="${active ? connectedLine : line}" stroke-width="${active ? 2 : 1.3}" stroke-linejoin="round" opacity="${opacity}"${edge.strength === 'soft' ? ' stroke-dasharray="5 4"' : ''} marker-end="url(#${active ? 'connected-arrow' : 'arrow'})"${reveal ? ` mask="url(#reveal-${i})"` : ''}/>`;
    })
    .join('');
  const marker = (id, color) =>
    `<marker id="${id}" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0 0 L5 2.5 L0 5" fill="${color}"/></marker>`;
  const animation = reveals.length
    ? `<style>
      .connection-trace {
        stroke-dasharray: 1;
        animation: trace-in 420ms cubic-bezier(.2,.72,.3,1) both;
      }
      @keyframes trace-in {
        from { stroke-dashoffset: 1; }
        to { stroke-dashoffset: 0; }
      }
    </style>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${graph.width}" height="${graph.height}" viewBox="0 0 ${graph.width} ${graph.height}"><defs>${marker('arrow', line)}${marker('connected-arrow', connectedLine)}${reveals.join('')}${animation}</defs>${paths}</svg>`;
}
