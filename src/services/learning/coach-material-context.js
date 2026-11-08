// Search the saved, goal-bound originals on every turn. No embeddings service,
// second copy of the originals, or model-selected URLs are involved.
const passageSize = 1100;

export function coachSourcePassage(materials, source) {
  if (source?.kind !== 'private_material') return null;
  const location = /^(.+):page:(\d+):(\d+):(\d+)$/.exec(source.id);
  if (!location) return null;
  const [, materialId, , index, start] = location;
  const material = materials.find((item) => item.id === materialId);
  const segment = material?.segments?.[Number(index)];
  if (!segment || (segment.page ?? null) !== (source.page ?? null)) return null;
  const offset = Number(start);
  const passage = segment.content.slice(offset, offset + passageSize);
  const quote = source.quote || '';
  const quoteStart = quote ? passage.indexOf(quote) : 0;
  if (!passage.trim() || quoteStart < 0) return null;
  return {
    name: material.name,
    location: segment.page ? `第 ${segment.page} 页` : `第 ${Number(index) + 1} 段`,
    before: passage.slice(0, quoteStart),
    quote,
    after: passage.slice(quoteStart + quote.length)
  };
}

const words = (value) => {
  const text = String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase();
  const result = text.match(/[a-z][a-z'-]{2,}|\d{2,}/g) || [];
  for (const run of text.match(/[\u3400-\u9fff]{2,}/g) || [])
    for (let index = 0; index < run.length - 1; index++) result.push(run.slice(index, index + 2));
  return [...new Set(result)].filter(
    (word) => !['the', 'and', 'this', 'that', 'with', 'from', '开始', '阶段'].includes(word)
  );
};

export function coachMaterialContext(state, conversation, request, limit = 3) {
  const coach = conversation?.coach;
  const materials = (state.materials || []).filter((item) => coach?.materialIds.includes(item.id));
  const selectionWeaknesses = ['feedback', 'essay'].includes(request.phase) ? [] : request.weaknesses || [];
  const query = words([request.task, request.input, ...selectionWeaknesses, conversation?.goal].join(' '));
  const previous = new Map();
  for (const turn of coach?.requests || [])
    for (const source of turn.request?.sources || [])
      previous.set(source.content, (previous.get(source.content) || 0) + 1);
  const candidates = [];
  materials.forEach((material, materialIndex) => {
    (material.segments || []).forEach((segment, segmentIndex) => {
      const original = String(segment.content || '');
      for (let offset = 0; offset < original.length; offset += 1000) {
        const content = original.slice(offset, offset + passageSize);
        if (!content.trim()) continue;
        const normalized = content.normalize('NFKC').toLocaleLowerCase();
        const relevance = query.reduce((sum, word) => sum + (normalized.includes(word) ? 1 : 0), 0);
        candidates.push({
          id: `${material.id}:page:${segment.page || 0}:${segmentIndex}:${offset}`,
          name: material.name,
          page: segment.page || null,
          content,
          materialIndex,
          section: `${materialIndex}:${segment.page || `segment-${segmentIndex}`}`,
          order: candidates.length,
          score:
            relevance * 8 -
            Math.min(6, (previous.get(content) || 0) * 3) +
            (request.sourceId === `${material.id}:page:${segment.page || 0}:${segmentIndex}:${offset}` ? 1000 : 0)
        });
      }
    });
  });
  candidates.sort((a, b) => b.score - a.score || a.order - b.order);
  const selected = [],
    seen = new Set(),
    covered = new Set(),
    sections = new Set();
  // Prefer coverage when several originals are bound. Within each, relevance
  // wins; already-used passages rotate out when other passages are equally useful.
  for (const candidate of candidates) {
    if (selected.length >= limit) break;
    if (covered.has(candidate.materialIndex) || seen.has(candidate.content)) continue;
    selected.push(candidate);
    sections.add(candidate.section);
    covered.add(candidate.materialIndex);
    seen.add(candidate.content);
  }
  for (const candidate of candidates) {
    if (selected.length >= limit) break;
    if (sections.has(candidate.section) || seen.has(candidate.content)) continue;
    selected.push(candidate);
    sections.add(candidate.section);
    seen.add(candidate.content);
  }
  for (const candidate of candidates) {
    if (selected.length >= limit) break;
    if (seen.has(candidate.content)) continue;
    selected.push(candidate);
    seen.add(candidate.content);
  }
  return selected.map(({ id, name, page, content }) => ({ id, name, page, content }));
}
