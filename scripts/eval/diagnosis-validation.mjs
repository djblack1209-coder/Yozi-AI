import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import schema from './diagnosis-validation.schema.json' with { type: 'json' };

// This deliberately small validator implements only the keywords in the bundled schema.
// It neither resolves remote refs nor reads any package-provided source locator.
function checkShape(value, rule, location, errors) {
  if (rule.$ref) return checkShape(value, schema.$defs[rule.$ref.split('/').at(-1)], location, errors);
  const fail = (code) => errors.push({ path: location, code });
  const types = rule.type ? [rule.type].flat() : [];
  const matches = (type) => {
    if (type === 'null') return value === null;
    if (type === 'array') return Array.isArray(value);
    if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
    if (type === 'integer') return Number.isSafeInteger(value);
    return typeof value === type;
  };
  if (types.length && !types.some(matches)) return fail('type');
  if ('const' in rule && value !== rule.const) fail('const');
  if (rule.enum && !rule.enum.includes(value)) fail('enum');
  if (typeof value === 'string') {
    if (value.length < (rule.minLength || 0)) fail('minLength');
    if (rule.pattern && !new RegExp(rule.pattern).test(value)) fail('pattern');
  }
  if (typeof value === 'number' && value < rule.minimum) fail('minimum');
  if (Array.isArray(value)) {
    if (value.length < (rule.minItems || 0)) fail('minItems');
    if (value.length > (rule.maxItems ?? Infinity)) fail('maxItems');
    if (rule.uniqueItems && new Set(value.map((v) => JSON.stringify(v))).size !== value.length) fail('duplicate_value');
    value.forEach((v, i) => checkShape(v, rule.items, `${location}/${i}`, errors));
  } else if (matches('object')) {
    for (const key of rule.required || []) if (!Object.hasOwn(value, key)) fail(`required:${key}`);
    for (const [key, v] of Object.entries(value)) {
      if (rule.properties?.[key]) checkShape(v, rule.properties[key], `${location}/${key}`, errors);
      else if (rule.additionalProperties === false)
        errors.push({ path: `${location}/${key}`, code: 'additional_property' });
    }
  }
}

const sameSet = (a, b) => a.length === b.length && a.every((id) => b.includes(id));
const sameRoot = (a, b) => a.status === b.status && sameSet(a.attribute_ids, b.attribute_ids);
const configKey = (p) => JSON.stringify([p.model, p.model_version, p.parameters_id]);
const ratio = (numerator, denominator) => (denominator ? numerator / denominator : null);

/** Pure, fail-closed package validation. Missing evidence is incomplete, broken references invalid. */
export function validateDiagnosisPackage(pkg) {
  const errors = [];
  const missing = [];
  checkShape(pkg, schema, '', errors);
  if (errors.length) return { status: 'invalid', errors, missing };
  const error = (location, code) => errors.push({ path: location, code });
  const need = (condition, location, code) => {
    if (!condition) missing.push({ path: location, code });
  };
  const unique = (rows, key, location) => {
    const seen = new Set();
    rows.forEach((row, i) => {
      if (seen.has(row[key])) error(`${location}/${i}/${key}`, 'duplicate_id');
      seen.add(row[key]);
    });
  };
  need(pkg.source, '/source', 'missing_source');
  unique(pkg.subjects, 'subject', '/subjects');
  // A run id denotes one fixed model/version/parameter configuration throughout the package.
  const runs = new Map();
  for (const [si, subject] of pkg.subjects.entries()) {
    const loc = `/subjects/${si}`;
    const attrs = new Set(subject.attributes.map((a) => a.id));
    const items = new Set(subject.items.map((i) => i.id));
    const references = (ids, location) => {
      for (const id of ids) if (!attrs.has(id)) error(location, 'unknown_attribute');
    };
    const root = (value, location) => {
      references(value.attribute_ids, `${location}/attribute_ids`);
      if ((value.status === 'attributed') !== value.attribute_ids.length > 0) error(location, 'root_status_labels');
    };
    need(subject.source, `${loc}/source`, 'missing_source');
    for (const field of ['attributes', 'items', 'trajectories']) unique(subject[field], 'id', `${loc}/${field}`);
    subject.attributes.forEach((a, i) => need(a.source, `${loc}/attributes/${i}/source`, 'missing_source'));
    subject.items.forEach((item, i) => {
      const at = `${loc}/items/${i}`;
      need(item.source, `${at}/source`, 'missing_source');
      references(item.attribute_ids, `${at}/attribute_ids`);
      need(
        item.answer_review?.status === 'approved' && item.answer_review.reviewer_id,
        `${at}/answer_review`,
        'answer_not_reviewed'
      );
      const humans = item.q_reviews.filter((r) => r.method === 'human' && r.reviewer_id);
      unique(humans, 'reviewer_id', `${at}/q_reviews/humans`);
      item.q_reviews.forEach((review, ri) => {
        references(review.attribute_ids, `${at}/q_reviews/${ri}/attribute_ids`);
        need(review.reviewer_id, `${at}/q_reviews/${ri}/reviewer_id`, 'missing_q_reviewer');
        if (review.method === 'strong_model')
          need(review.model_version, `${at}/q_reviews/${ri}/model_version`, 'missing_model_version');
      });
    });
    subject.trajectories.forEach((t, ti) => {
      const at = `${loc}/trajectories/${ti}`;
      need(t.source, `${at}/source`, 'missing_source');
      references(t.mastery_attribute_ids, `${at}/mastery_attribute_ids`);
      unique(t.turns, 'round', `${at}/turns`);
      const rounds = new Set(t.turns.map((turn) => turn.round));
      t.turns.forEach((turn, i) => {
        if (!items.has(turn.item_id)) error(`${at}/turns/${i}/item_id`, 'unknown_item');
        if (i && turn.round <= t.turns[i - 1].round) error(`${at}/turns/${i}/round`, 'unordered_rounds');
      });
      const reviews = t.gold?.reviews || [];
      const adjudication = t.gold?.adjudication;
      need(
        reviews.length === 2 && reviews.every((r) => r.reviewer_id && r.independent === true),
        `${at}/gold/reviews`,
        'missing_independent_double_review'
      );
      need(adjudication?.reviewer_id, `${at}/gold/adjudication`, 'missing_adjudication');
      const reviewers = reviews.map((r) => r.reviewer_id).filter(Boolean);
      need(new Set(reviewers).size === 2, `${at}/gold/reviews`, 'reviewers_not_distinct');
      if (adjudication?.reviewer_id)
        need(!reviewers.includes(adjudication.reviewer_id), `${at}/gold/adjudication`, 'adjudicator_not_independent');
      [...reviews, ...(adjudication ? [adjudication] : [])].forEach((annotation, i) => {
        const aloc = `${at}/gold/annotations/${i}`;
        root(annotation.root_cause, `${aloc}/root_cause`);
        if (annotation.root_cause.status !== 'insufficient_evidence')
          need(annotation.evidence_turns.length, `${aloc}/evidence_turns`, 'missing_evidence');
        for (const round of annotation.evidence_turns)
          if (!rounds.has(round)) error(`${aloc}/evidence_turns`, 'unknown_round');
      });
      const predictions = t.predictions || [];
      unique(predictions, 'run_id', `${at}/predictions`);
      predictions.forEach((p, pi) => {
        const ploc = `${at}/predictions/${pi}`;
        const config = configKey(p);
        if (runs.has(p.run_id) && runs.get(p.run_id) !== config) error(`${ploc}/run_id`, 'run_config_drift');
        runs.set(p.run_id, config);
        if (p.root_cause) root(p.root_cause, `${ploc}/root_cause`);
        unique(p.mastery, 'attribute_id', `${ploc}/mastery`);
        references(
          p.mastery.map((m) => m.attribute_id),
          `${ploc}/mastery`
        );
        if (p.mastery.some((m) => !t.mastery_attribute_ids.includes(m.attribute_id)))
          error(`${ploc}/mastery`, 'outside_mastery_scope');
      });
    });
  }
  return { status: errors.length ? 'invalid' : missing.length ? 'incomplete' : 'complete', errors, missing };
}

function rootCounts(subject, primaryRunId) {
  const result = {
    total: subject.trajectories.length,
    gold_eligible: 0,
    gold_insufficient: 0,
    missing_gold: 0,
    missing_prediction: 0,
    abstained_prediction: 0,
    numerator: 0,
    denominator: 0,
    compared: 0,
    cases: []
  };
  for (const t of subject.trajectories) {
    const gold = t.gold?.adjudication?.root_cause;
    const prediction = t.predictions?.find((p) => p.run_id === primaryRunId)?.root_cause;
    let outcome;
    if (!gold) {
      result.missing_gold++;
      outcome = 'missing_gold';
    } else if (gold.status === 'insufficient_evidence') {
      result.gold_insufficient++;
      outcome = 'gold_insufficient';
    } else {
      result.gold_eligible++;
      // Missing predictions and model abstentions stay in the gold denominator.
      result.denominator++;
      if (!prediction) {
        result.missing_prediction++;
        outcome = 'missing_prediction';
      } else {
        result.compared++;
        if (prediction.status === 'insufficient_evidence') result.abstained_prediction++;
        const correct = sameRoot(gold, prediction);
        if (correct) result.numerator++;
        outcome = correct ? 'correct' : 'incorrect';
      }
    }
    result.cases.push({ trajectory_id: t.id, gold: gold || null, prediction: prediction || null, outcome });
  }
  return result;
}

function masteryCounts(subject) {
  const result = {
    total_trajectories: subject.trajectories.length,
    numerator: 0,
    denominator: 0,
    possible_pairs: 0,
    unknown_pairs: 0,
    same_config_pairs: 0,
    missing_prediction_trajectories: 0,
    cases: []
  };
  for (const t of subject.trajectories) {
    const predictions = t.predictions || [];
    if (predictions.length < 2) result.missing_prediction_trajectories++;
    for (let i = 0; i < predictions.length; i++)
      for (let j = i + 1; j < predictions.length; j++) {
        const a = predictions[i];
        const b = predictions[j];
        if (configKey(a) === configKey(b)) {
          result.same_config_pairs++;
          continue;
        }
        result.possible_pairs++;
        const vector = (p) =>
          t.mastery_attribute_ids.map((id) => p.mastery.find((m) => m.attribute_id === id)?.classification);
        const av = vector(a);
        const bv = vector(b);
        const known = [...av, ...bv].every((v) => v && v !== 'unknown');
        const agreement = known ? av.every((v, k) => v === bv[k]) : null;
        if (known) {
          result.denominator++;
          if (agreement) result.numerator++;
        } else result.unknown_pairs++;
        result.cases.push({ trajectory_id: t.id, run_ids: [a.run_id, b.run_id], agreement });
      }
  }
  return result;
}

function qCounts(subject) {
  const cases = subject.items.map((item) => {
    const reviews = item.q_reviews;
    const humanIds = new Set(
      reviews.filter((r) => r.method === 'human' && r.status === 'approved' && r.reviewer_id).map((r) => r.reviewer_id)
    );
    const model = reviews.some(
      (r) => r.method === 'strong_model' && r.status === 'approved' && r.reviewer_id && r.model_version
    );
    const conflict = reviews.some(
      (r) => r.status === 'rejected' || (r.status === 'approved' && !sameSet(r.attribute_ids, item.attribute_ids))
    );
    const reviewed = !conflict && (humanIds.size >= 2 || (model && humanIds.size >= 1));
    return { item_id: item.id, reviewed, outcome: conflict ? 'conflict' : reviewed ? 'reviewed' : 'unreviewed' };
  });
  return {
    numerator: cases.filter((c) => c.reviewed).length,
    denominator: cases.length,
    unknown: cases.filter((c) => !c.reviewed).length,
    cases
  };
}

function metrics(counts, validation, kind) {
  const { root, mastery, q } = counts;
  const publishRoot = validation.status === 'complete';
  return {
    root_cause_accuracy: {
      ...root,
      numerator: publishRoot ? root.numerator : null,
      value: publishRoot ? ratio(root.numerator, root.denominator) : null,
      status: !publishRoot
        ? 'unavailable_incomplete_package'
        : !root.denominator
          ? 'unavailable_no_eligible_gold'
          : kind === 'synthetic'
            ? 'synthetic_only'
            : 'measured',
      cases: root.cases.map((c) => ({
        ...c,
        correct:
          publishRoot && ['correct', 'incorrect', 'missing_prediction'].includes(c.outcome)
            ? c.outcome === 'correct'
            : null,
        outcome:
          !publishRoot && ['correct', 'incorrect'].includes(c.outcome) ? 'not_scored_incomplete_package' : c.outcome
      }))
    },
    mastery_consistency: { ...mastery, value: ratio(mastery.numerator, mastery.denominator) },
    q_matrix_review_rate: { ...q, value: ratio(q.numerator, q.denominator) }
  };
}

/** Pure aggregation. No models, files, env, account storage, timestamps or pass thresholds. */
export function evaluateDiagnosisPackage(pkg) {
  const validation = validateDiagnosisPackage(pkg);
  if (validation.status === 'invalid')
    return { package_status: 'invalid', real_effect: 'unavailable', validation, metrics: null, subjects: [] };
  const groups = pkg.subjects.map((s) => ({
    subject: s.subject,
    version: s.version,
    counts: { root: rootCounts(s, pkg.primary_run_id), mastery: masteryCounts(s), q: qCounts(s) }
  }));
  const totals = {};
  for (const metric of ['root', 'mastery', 'q']) {
    totals[metric] = {};
    for (const group of groups)
      for (const [key, value] of Object.entries(group.counts[metric])) {
        if (key === 'cases')
          totals[metric].cases = [
            ...(totals[metric].cases || []),
            ...value.map((c) => ({ subject: group.subject, ...c }))
          ];
        else totals[metric][key] = (totals[metric][key] || 0) + value;
      }
  }
  // Real effects also require every eligible trajectory's preselected prediction.
  const realAvailable =
    pkg.data_kind === 'real' &&
    validation.status === 'complete' &&
    totals.root.denominator > 0 &&
    totals.root.missing_prediction === 0 &&
    pkg.subjects.every((_, i) => groups[i].counts.root.denominator > 0);
  return {
    schema_version: pkg.schema_version,
    version: pkg.version,
    data_kind: pkg.data_kind,
    primary_run_id: pkg.primary_run_id,
    package_status: validation.status,
    real_effect: realAvailable ? 'measured' : 'unavailable',
    validation,
    metrics: metrics(totals, validation, pkg.data_kind),
    subjects: groups.map((g) => ({
      subject: g.subject,
      version: g.version,
      metrics: metrics(g.counts, validation, pkg.data_kind)
    }))
  };
}

// stdout JSON only; exit 0 = complete package/command, never a diagnostic-effect pass.
export function runCli(args) {
  let packagePath;
  let validateOnly = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--validate' && !validateOnly) validateOnly = true;
    else if (args[i] === '--package' && !packagePath && args[i + 1] && !args[i + 1].startsWith('--'))
      packagePath = args[++i];
    else throw new Error('Usage: node scripts/eval/diagnosis-validation.mjs --package PATH [--validate]');
  }
  if (!packagePath) throw new Error('Usage: node scripts/eval/diagnosis-validation.mjs --package PATH [--validate]');
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const report = evaluateDiagnosisPackage(pkg);
  if (!validateOnly) return report;
  return { package_status: report.package_status, real_effect: 'unavailable', validation: report.validation };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = runCli(process.argv.slice(2));
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.package_status === 'complete' ? 0 : 2;
  } catch (error) {
    // Do not echo malformed inputs, source locators or student answers in errors.
    console.log(
      JSON.stringify({
        package_status: 'invalid',
        real_effect: 'unavailable',
        error: error.message.startsWith('Usage:') ? error.message : 'PACKAGE_READ_OR_JSON_ERROR'
      })
    );
    process.exitCode = 2;
  }
}
