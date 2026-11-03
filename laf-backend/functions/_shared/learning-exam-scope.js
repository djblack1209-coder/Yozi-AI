// Explicit student intent, not a syllabus-alignment or mastery assertion.
export const EXAM_SCOPE_CONTRACT = 'learning-exam-scope-v1';
const regions = [
  ['BJ', '北京'],
  ['TJ', '天津'],
  ['HE', '河北'],
  ['SX', '山西'],
  ['NM', '内蒙古'],
  ['LN', '辽宁'],
  ['JL', '吉林'],
  ['HL', '黑龙江'],
  ['SH', '上海'],
  ['JS', '江苏'],
  ['ZJ', '浙江'],
  ['AH', '安徽'],
  ['FJ', '福建'],
  ['JX', '江西'],
  ['SD', '山东'],
  ['HA', '河南'],
  ['HB', '湖北'],
  ['HN', '湖南'],
  ['GD', '广东'],
  ['GX', '广西'],
  ['HI', '海南'],
  ['CQ', '重庆'],
  ['SC', '四川'],
  ['GZ', '贵州'],
  ['YN', '云南'],
  ['XZ', '西藏'],
  ['SN', '陕西'],
  ['GS', '甘肃'],
  ['QH', '青海'],
  ['NX', '宁夏'],
  ['XJ', '新疆']
];
const nationalCategories = {
  'central-provincial': '中央及省级综合管理',
  'city-local': '市地及以下综合管理',
  'law-enforcement': '行政执法'
};
const scopeKeys = ['contract', 'year', 'examLevel', 'region', 'positionCategory'];
export function normalizeExamScope(value) {
  const invalid = () => {
    const error = new Error('考试范围不合法');
    error.code = 'EXAM_SCOPE_INVALID';
    throw error;
  };
  if (!value || value.contract !== EXAM_SCOPE_CONTRACT || Object.keys(value).some((key) => !scopeKeys.includes(key)))
    return invalid();
  if (value.year !== null && (!Number.isInteger(value.year) || value.year < 2000 || value.year > 2099))
    return invalid();
  if (![null, 'national', 'provincial'].includes(value.examLevel)) return invalid();
  if (value.region !== null && value.region !== 'CN' && !regions.some(([id]) => value.region === `CN-${id}`))
    return invalid();
  if (
    value.positionCategory !== null &&
    !['A', 'B', 'C', ...Object.keys(nationalCategories)].includes(value.positionCategory)
  )
    return invalid();
  if (value.examLevel === 'national' && (value.region !== 'CN' || ['A', 'B', 'C'].includes(value.positionCategory)))
    return invalid();
  if (value.examLevel === 'provincial' && (value.region === 'CN' || value.positionCategory in nationalCategories))
    return invalid();
  return Object.fromEntries(scopeKeys.map((key) => [key, value[key]]));
}

const unique = (items) => [...new Set(items)];
const regionNames = regions.map(([, name]) => name).join('|');
const yearPattern = new RegExp(
  `(20\\d{2})\\s*(?:年(?:度)?的?)?\\s*(?=国考|省考|公务员|申论|[ABCabc]类|${regionNames})`,
  'gu'
);
// Conservative literal forms. Residence and deadlines do not choose an exam.
function scopeFacts(raw) {
  const text = raw
    .split(/[，。；\n]/u)
    .filter((part) => !/不(?:参加|准备|报考|考)|并非|不是/u.test(part))
    .join('，');
  const result = {};
  const years = unique([...text.matchAll(yearPattern)].map((match) => Number(match[1])));
  if (years.length) result.year = years.length === 1 ? years[0] : null;
  if (/年度(?:未定|不确定)|年份(?:未定|不确定)/u.test(raw)) result.year = null;
  const named = regions.filter(([, name]) =>
    new RegExp(
      `${name}(?:省|市|(?:壮族|回族|维吾尔)?自治区)?\\s*(?:20\\d{2}年?(?:度)?\\s*)?(?:省考|公考|考公|公务员|申论|[ABCabc]类|考(?=\\s*(?:[ABCabc]类|申论|$)))`,
      'u'
    ).test(text)
  );
  const national = /国考|中央机关及其直属机构.*公务员/u.test(text);
  const provincial = /省考|地方公务员/u.test(text) || named.length > 0;
  if (national || provincial) {
    result.examLevel = national === provincial ? null : national ? 'national' : 'provincial';
    result.region = national === provincial ? null : national ? 'CN' : named.length === 1 ? `CN-${named[0][0]}` : null;
  }
  if (/地区(?:未定|不确定)/u.test(raw)) result.region = null;
  const categories = unique([
    ...[...text.matchAll(/\b([ABCabc])\s*类/gu)].map((match) => match[1].toUpperCase()),
    ...(/中央(?:机关)?(?:及其)?(?:省级|及省级).*综合管理/u.test(text) ? ['central-provincial'] : []),
    ...(/市[（(]?地[）)]?级?(?:及以下)?.*综合管理/u.test(text) ? ['city-local'] : []),
    ...(/行政执法/u.test(text) ? ['law-enforcement'] : [])
  ]);
  if (categories.length) result.positionCategory = categories.length === 1 ? categories[0] : null;
  if (/类别(?:未定|不确定)|职位类别尚未确定/u.test(raw)) result.positionCategory = null;
  return result;
}

export function explicitShenlunScope(turns) {
  const answers = (turns || []).map((turn) => (typeof turn === 'string' ? turn : turn.answer || ''));
  if (!answers.some((answer) => answer.includes('申论'))) return null;
  const facts = Object.assign({}, ...answers.map(scopeFacts));
  if (!Object.keys(facts).length) return null;
  if (facts.examLevel === 'national') {
    facts.region = 'CN';
    if (['A', 'B', 'C'].includes(facts.positionCategory)) facts.positionCategory = null;
  } else if (facts.examLevel === 'provincial' && facts.positionCategory in nationalCategories) {
    facts.positionCategory = null;
  }
  return normalizeExamScope({
    contract: EXAM_SCOPE_CONTRACT,
    year: null,
    examLevel: null,
    region: null,
    positionCategory: null,
    ...facts
  });
}

export function examScopeLabel(scope) {
  if (!scope) return '';
  const region = regions.find(([id]) => scope.region === `CN-${id}`)?.[1];
  return [
    scope.year ? `${scope.year}年` : '',
    scope.examLevel === 'national'
      ? '国考'
      : region
        ? `${region}公务员`
        : scope.examLevel === 'provincial'
          ? '省考'
          : '',
    scope.positionCategory ? nationalCategories[scope.positionCategory] || `${scope.positionCategory}类` : ''
  ]
    .filter(Boolean)
    .join(' · ');
}
