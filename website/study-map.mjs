// Small, anonymous exercise histories for the public illustration. A mark is an answer,
// never a mastery probability. Each topic uses its own chronological answer sequence.
const topic = (zh, en, marks, example) => ({ zh, en, marks, example });
const branch = (zh, en, topics) => ({ zh, en, topics });

const examples = {
  slope: {
    question: ['直线经过 (0, 1) 和 (2, 5)，斜率是多少？', 'A line passes through (0, 1) and (2, 5). What is its slope?'],
    answer: ['½', '½'], correction: ['2', '2'],
    reason: ['纵坐标增加 4，横坐标增加 2。斜率是 4 ÷ 2。', 'Rise is 4 and run is 2. Divide the rise by the run.'],
    revisit: ['换一组坐标，再求斜率', 'Find the slope between two new points']
  },
  preposition: {
    question: ['选一个介词：The lesson starts ___ 8 o’clock.', 'Choose the preposition: The lesson starts ___ 8 o’clock.'],
    answer: ['in', 'in'], correction: ['at', 'at'],
    reason: ['具体钟点前用 at，因此是 at 8 o’clock。', 'Use “at” with a time on the clock: at 8 o’clock.'],
    revisit: ['换一个钟点，再选时间介词', 'Choose a preposition for a different time']
  },
  speed: {
    question: ['骑车 30 秒走了 120 米，平均速率是多少？', 'A cyclist covers 120 metres in 30 seconds. What is the mean speed?'],
    answer: ['¼ m/s', '¼ m/s'], correction: ['4 m/s', '4 m/s'],
    reason: ['用总路程除以总时间，120 ÷ 30 = 4 米/秒。', 'Divide total distance by total time: 120 ÷ 30 = 4 metres per second.'],
    revisit: ['换一段路程，再算平均速率', 'Calculate mean speed for a different journey']
  }
};

export const subjects = [
  {
    id: 'math', zh: '数学', en: 'Maths', angle: -8,
    branches: [
      branch('代数', 'Algebra', [topic('因式', 'Factors', '1111'), topic('方程', 'Equations', '1011'), topic('不等式', 'Inequalities', '1101')]),
      branch('几何', 'Geometry', [topic('三角形', 'Triangles', '1111'), topic('角度', 'Angles', '1010'), topic('面积', 'Area', '1011')]),
      branch('函数', 'Functions', [topic('斜率', 'Slope', '01010', examples.slope), topic('截距', 'Intercepts', '1110'), topic('定义域', 'Domains', '1011')])
    ]
  },
  {
    id: 'english', zh: '英语', en: 'English', angle: -126,
    branches: [
      branch('阅读', 'Reading', [topic('主旨', 'Main idea', '1111'), topic('推断', 'Inference', '1101'), topic('细节', 'Detail', '1111')]),
      branch('语法', 'Grammar', [topic('时态', 'Tense', '1011'), topic('时间介词', 'Time prepositions', '10010', examples.preposition), topic('语序', 'Word order', '1111')]),
      branch('写作', 'Writing', [topic('衔接', 'Cohesion', '1101'), topic('选词', 'Word choice', '1110'), topic('句式', 'Phrasing', '1111')])
    ]
  },
  {
    id: 'physics', zh: '物理', en: 'Physics', angle: 110,
    branches: [
      branch('力学', 'Forces', [topic('重力', 'Weight', '1111'), topic('摩擦', 'Friction', '1110'), topic('平衡', 'Balance', '1011')]),
      branch('运动', 'Motion', [topic('路程', 'Distance', '1111'), topic('平均速率', 'Mean speed', '01100', examples.speed), topic('加速度', 'Acceleration', '1010')]),
      branch('能量', 'Energy', [topic('动能', 'Kinetic energy', '1101'), topic('做功', 'Work', '1011'), topic('功率', 'Power', '1111')])
    ]
  }
];

export function recordFor(subject) {
  const leaves = subject.branches.flatMap((parent, b) => parent.topics.map((item, t) => {
    const correct = [...item.marks].filter(mark => mark === '1').length;
    return { parent, item, b, t, correct, total: item.marks.length };
  }));
  const weak = leaves.reduce((low, next) => next.correct / next.total < low.correct / low.total ? next : low);
  const correct = leaves.reduce((sum, item) => sum + item.correct, 0);
  const total = leaves.reduce((sum, item) => sum + item.total, 0);
  return { weak, correct, total, accuracy: Math.round(100 * correct / total) };
}

const point = (radius, angle) => {
  const a = angle * Math.PI / 180;
  return [+(300 + radius * Math.cos(a)).toFixed(2), +(238 + radius * Math.sin(a)).toFixed(2)];
};
const at = (radius, angle) => point(radius, angle).join(' ');
function curve(r1, a1, r2, a2) {
  const mid = r1 + (r2 - r1) * .56;
  return `M ${at(r1, a1)} C ${at(mid, a1)} ${at(mid, a2)} ${at(r2, a2)}`;
}
const arc = (r, from, to) => `M ${at(r, from)} A ${r} ${r} 0 0 1 ${at(r, to)}`;
function dot(r, angle, size, className) {
  const [x, y] = point(r, angle);
  return `<circle cx="${x}" cy="${y}" r="${size}" class="${className}"/>`;
}

// Each outer stroke belongs to one answer at one leaf. Its length and ink encode
// correct/missed, so the shape remains legible without colour or movement.
export function renderMap(lang) {
  const callouts = [];
  const positions = {
    math: { bend: '503 291', end: '509 312', x: 554, y: 333, anchor: 'end' },
    english: { bend: '162 69 76 101 62 179', end: '68 226', x: 62, y: 251, anchor: 'start' },
    physics: { bend: '225 444 374 444', end: '404 413', x: 409, y: 399, anchor: 'start' }
  };
  const segments = subjects.map(subject => {
    const { weak } = recordFor(subject);
    const a = subject.angle;
    const limbs = [], nodes = [], marks = [], branchLabels = [];
    let trace = '';
    const trunk = curve(16, a, 62, a);
    limbs.push(trunk);
    subject.branches.forEach((group, b) => {
      const limbAngle = a + (b - 1) * 32;
      const limb = curve(62, a, 119, limbAngle);
      limbs.push(limb);
      nodes.push(dot(119, limbAngle, 3.8, 'fork'));
      const [lx, ly] = point(101, limbAngle);
      const offset = b === 2 ? 16 : -9;
      branchLabels.push(`<text class="branch-name ${b === weak.b ? 'current' : ''}" x="${lx}" y="${ly + offset}" text-anchor="middle">${group[lang]}</text>`);
      group.topics.forEach((leaf, t) => {
        const angle = limbAngle + (t - 1) * 10;
        const tip = curve(119, limbAngle, 164, angle);
        limbs.push(tip);
        nodes.push(dot(164, angle, 2.5, 'leaf'));
        [...leaf.marks].forEach((answer, i) => {
          const tick = angle + (i - (leaf.marks.length - 1) / 2) * 1.57;
          marks.push(`<path class="mark ${answer === '1' ? 'hit' : 'miss'}" d="M ${at(173, tick)} L ${at(answer === '1' ? 191 : 181, tick)}"/>`);
        });
        if (b === weak.b && t === weak.t) {
          const label = positions[subject.id];
          const score = lang === 'zh' ? `答对 ${weak.correct} / ${weak.total}` : `${weak.correct} / ${weak.total} correct`;
          const ticks = [...leaf.marks].map((answer, index) => {
            const tick = angle + (index - (leaf.marks.length - 1) / 2) * 1.57;
            return `<path class="focus-tick" d="M ${at(173,tick)} L ${at(answer === '1' ? 191 : 181,tick)}"/>`;
          }).join('');
          callouts.push(`<g class="map-callout" data-for="${subject.id}"><path d="M ${at(195,angle)} L ${label.bend} ${label.end}"/><text x="${label.x}" y="${label.y}" text-anchor="${label.anchor}">${leaf[lang]}</text><text class="map-score" x="${label.x}" y="${label.y+17}" text-anchor="${label.anchor}">${score}</text></g>`);
          trace = `<g class="focus-route" data-for="${subject.id}"><path class="trace" pathLength="1" d="${trunk} ${limb} ${tip}"/>${ticks}${dot(164, angle, 11.5, 'target-outer')}${dot(164, angle, 5, 'target-core')}${dot(119, limbAngle, 3.8, 'target-core')}</g>`;
        }
      });
    });
    return `<g><path class="rim" d="${arc(200,a-44,a+44)}"/><path class="limb" d="${limbs.join(' ')}"/>${nodes.join('')}${marks.join('')}${trace}<g data-for="${subject.id}">${branchLabels.join('')}</g></g>`;
  }).join('');
  const labels = [
    {s:subjects[0], x:505, y:165, align:'start', line:'M 480 180 l 13 -16 h 8'},
    {s:subjects[1], x:100, y:53, align:'start', line:'M 184 74 l -12 -14 h -69'},
    {s:subjects[2], x:120, y:435, align:'end', line:'M 177 402 l -20 27 h -30'}
  ].map(({s,x,y,align,line}) => `<g class="map-label"><path d="${line}"/><text x="${x}" y="${y}" text-anchor="${align}">${s[lang]}</text></g>`).join('');
  return `<svg class="atlas" viewBox="52 12 520 442" aria-hidden="true" focusable="false">
    <defs><pattern id="registration" width="27" height="27" patternUnits="userSpaceOnUse"><path d="M12 13.5h3m-1.5-1.5v3" stroke="#b8b9a9" opacity=".42" stroke-width=".7"/></pattern></defs>
    <rect x="52" y="12" width="520" height="442" fill="url(#registration)"/>
    <g class="construction"><circle cx="300" cy="238" r="62"/><circle cx="300" cy="238" r="119"/><circle cx="300" cy="238" r="164"/><path d="M78 238h446M300 22v425"/></g>
    ${segments}${labels}${callouts.join('')}
    <g class="root-book" transform="translate(300 238)"><circle r="21"/><path d="M0-6c-4-3-8-3-12-2v15c4-1 8-1 12 2 4-3 8-3 12-2V-8c-4-1-8-1-12 2Zm0 0V9"/></g>
  </svg>`;
}
