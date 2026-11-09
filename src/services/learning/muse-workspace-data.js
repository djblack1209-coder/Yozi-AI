import {
  writingCoachDashboard,
  coachLearningDay,
  coachUsesMaterials
} from '../../../laf-backend/functions/_shared/learning-writing-coach.js';
import { coachErrorReviews } from '../../../laf-backend/functions/_shared/learning-coach-review.js';
import { dayKey, effectiveGrade, questionKey } from './learning-domain.js';
import { museSafeLink } from './muse-rich-content.js';
import { conversationCategoryId, conversationLabel } from './workspace-context.js';
import { coachFeedbackPreview, museLearningInsights } from './muse-learning-insights.js';
import { studentEssaySources } from './learning-artifacts.js';

// Display-only academic subjects. A task type alone never establishes a subject.
export function museSubjects(source = {}, includeGoal = false) {
  const values = [
    source.subject,
    source.exam,
    ...(source.subjects || []),
    source.studyProfile?.exam,
    source.studyProfile?.subject,
    ...(source.studyProfile?.subjects || []),
    source.coach?.profile?.exam,
    source.coach?.profile?.subject,
    ...(source.coach?.profile?.subjects || [])
  ];
  if (includeGoal) values.push(source.goal);
  const labels = new Set();
  for (const value of values.filter((value) => typeof value === 'string')) {
    if (/英语|english[12]?/i.test(value)) labels.add('英语');
    if (/政治|politics/i.test(value)) labels.add('政治');
    if (/数学|math/i.test(value)) labels.add('数学');
    if (
      /kaoyan_major|专业课|408|计算机|数据结构|操作系统|计算机网络|组成原理|法硕|法律硕士|刑法|民法|宪法|法理学|法制史/i.test(
        value
      )
    )
      labels.add('专业课');
  }
  return [...labels];
}
export function museRecordSubjects(source) {
  const labels = museSubjects(source);
  return labels.length ? labels : ['未分类'];
}
export function museSubjectOptions(state, items) {
  const labels = new Set(['英语', '政治', '数学', '专业课']);
  for (const conversation of state.conversations)
    for (const label of museSubjects(conversation, true)) labels.add(label);
  for (const item of items) for (const label of item.subjects) labels.add(label);
  return [
    { id: 'all', label: '全部学科', count: items.length },
    ...[...labels].map((label) => ({
      id: `subject:${label}`,
      label,
      count: items.filter((item) => item.subjects.includes(label)).length
    }))
  ];
}
// Only explicit diagnostic markers or exact legacy test titles are hidden. No facts are deleted.
export function museTestNotification(item) {
  return (
    item?.kind === 'test_notification' ||
    item?.type === 'notification.test' ||
    item?.type === 'reminder.test' ||
    item?.notificationId === 'yozi-test-notification' ||
    item?.notification?.test === true ||
    ['发送测试通知', '测试通知', '测试通知已安排', '测试通知已安排 · 5 秒后', 'Yozi AI 测试通知'].includes(
      item?.title || item?.content
    )
  );
}
const preview = (text, limit = 180) => String(text || '').slice(0, limit);
const daysBetween = (from, to) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

// Read models only: browsing, filtering and displaying progress never writes a fact.
export function museGoals(state, now) {
  const today = dayKey(now, state.timezone);
  return state.conversations
    .filter((c) => c.coach)
    .map((conversation) => {
      const coach = conversation.coach;
      // Same day rule as the conversation, so an unfinished task carried over reads the same in both places.
      const learningDay = coachLearningDay(coach, today);
      const current = coach.days.find((d) => d.day === learningDay);
      const board = writingCoachDashboard(coach, today, state.timezone);
      const totalDays = coach.profile?.deadline
        ? Math.max(0, daysBetween(coach.startedDay, coach.profile.deadline) + 1)
        : 0;
      const completedDays = coach.days.filter((d) => d.completed).length;
      const tasks = [];
      if (coach.diagnostic)
        tasks.push({
          id: 'diagnostic',
          title: '摸底',
          done: Boolean(coach.diagnostic.feedback),
          count: coach.diagnostic.answers.length,
          total: coach.diagnostic.cards.length
        });
      const retries = coachErrorReviews(state, now, conversation.id).filter((row) => row.availableAt <= now);
      const retriesLeft = retries.filter((row) => !row.completedBy).length;
      const retriesDoneToday = retries.filter((row) => {
        const done = row.completedBy && state.events.find((event) => event.id === row.completedBy);
        return done && dayKey(done.at, state.timezone) === today;
      }).length;
      if (retriesLeft || retriesDoneToday)
        tasks.push({
          id: 'retry',
          title: '待重练',
          done: !retriesLeft,
          count: retriesDoneToday,
          total: retriesLeft + retriesDoneToday
        });
      if (current) {
        tasks.push({
          id: 'practice',
          title: current.day === today ? '今日训练' : '继续上次训练',
          done: current.pack.cards.every((c) => current.feedback[`card-${c.id}`]),
          count: current.answers.length,
          total: current.pack.cards.length
        });
        if (current.pack.writing)
          tasks.push({
            id: 'writing',
            title: '逐段带写',
            done: Boolean(current.essay),
            count: current.rewrites.length,
            total: current.pack.writing.patterns.length
          });
        tasks.push({
          id: 'summary',
          title: '今日小结',
          done: current.completed,
          count: current.completed ? 1 : 0,
          total: 1
        });
      }
      const next = conversation.stopped
        ? '带练已暂停'
        : !coach.profile
          ? '继续建档'
          : !coach.diagnostic
            ? '开始摸底'
            : !coach.diagnostic.feedback
              ? '继续摸底'
              : retriesLeft
                ? '待重练'
                : !current
                  ? '安排今日训练'
                  : tasks.find((t) => !t.done)?.title || '今天已完成';
      return {
        id: conversation.id,
        goal: conversation.goal,
        coach,
        current,
        board,
        tasks,
        totalDays,
        completedDays,
        percent: totalDays ? Math.min(100, Math.round((completedDays / totalDays) * 100)) : null,
        next,
        stopped: conversation.stopped,
        at: conversation.at
      };
    })
    .sort((a, b) => b.at - a.at);
}

export function museActivity(state) {
  const conversations = new Map(state.conversations.map((c) => [c.id, c]));
  return state.events
    .flatMap((event, index) => {
      if (museTestNotification(event) || museTestNotification(event.data)) return [];
      const conversation = conversations.get(event.data?.conversationId);
      if (!conversation?.coach) return [];
      const data = event.data,
        coach = conversation.coach;
      let title = '',
        body = '',
        kind = 'practice',
        icon = 'pen';
      if (event.type === 'coach.answer') {
        const pack =
          data.target === 'diagnostic'
            ? coach.diagnostic
            : coach.days.find((d) => d.day === (data.day || dayKey(event.at, state.timezone)))?.pack;
        title = pack?.cards.find((c) => c.id === data.cardId)?.title || '已提交原答';
        body = preview(data.answer);
      } else if (event.type === 'coach.paragraph') {
        title = data.rewrite ? '已保存改写' : '已提交本段';
        body = preview(data.text);
      } else if (event.type === 'coach.result') {
        const output = data.output;
        if (!output) return [];
        kind = ['feedback', 'essay', 'summary'].includes(output.kind) ? 'feedback' : 'practice';
        icon = kind === 'feedback' ? 'file-text' : 'list';
        title =
          {
            diagnostic: '摸底题已就绪',
            daily: '今日训练已就绪',
            feedback: 'AI 反馈',
            essay: '成文反馈',
            summary: '今日小结 · AI 评估'
          }[output.kind] || '';
        body = preview(
          output.learned?.join('；') || coachFeedbackPreview(output) || output.cards?.map((c) => c.title).join(' · ')
        );
      } else if (event.type === 'coach.material') {
        const material = state.materials.find((m) => m.id === data.materialId);
        if (!material) return [];
        title = material.name;
        kind = 'material';
        icon = 'file-text';
        body = `${material.segments.length} 个片段`;
      } else if (event.type === 'coach.finish') {
        title = '今天已完成';
        kind = 'feedback';
        icon = 'check';
      } else if (event.type === 'coach.adopt') {
        title = coachUsesMaterials(coach) ? '已加入知识点复习' : '已采用到句式库';
        body = data.phrase;
        icon = 'bulb';
      } else if (event.type === 'coach.review') {
        title = '已提交复习自评';
        body = preview(data.answer);
        icon = 'refresh';
      } else if (event.type === 'coach.libraryUse') {
        title = data.paused ? '已暂停条目使用' : '已恢复条目使用';
        body = coach.library.find((item) => item.id === data.itemId)?.text || '';
        icon = 'bulb';
      }
      if (!title) return [];
      return [
        {
          id: event.id,
          conversationId: conversation.id,
          goal: conversation.goal,
          title,
          body,
          kind,
          icon,
          subjects: museRecordSubjects(conversation),
          at: event.at,
          index
        }
      ];
    })
    .sort((a, b) => b.at - a.at || b.index - a.index);
}

export function museArtifacts(state) {
  const essays = studentEssaySources(state);
  const output = state.materials.map((material) => ({
    id: `material:${material.id}`,
    materialId: material.id,
    title: material.name,
    kind: 'material',
    icon: 'file-text',
    detail: `${material.segments.length} 个片段`,
    at: material.at || material.createdAt || 0,
    material,
    subjects: museRecordSubjects(material)
  }));
  for (const conversation of state.conversations) {
    for (const message of conversation.messages || []) {
      if (message.role !== 'assistant') continue;
      for (const link of String(message.content || '')
        .replace(/```[\s\S]*?(?:```|$)|`[^`\n]*`/g, '')
        .matchAll(/!?\[([^\]\n]{1,160})\]\((https:\/\/[^\s)]+)\)/g)) {
        const url = museSafeLink(link[2]);
        if (!url || new URL(url).protocol !== 'https:') continue;
        const extension = new URL(url).pathname.split('.').at(-1).toLowerCase();
        const kind = {
          png: 'image',
          jpg: 'image',
          jpeg: 'image',
          webp: 'image',
          gif: 'animation',
          mp4: 'video',
          webm: 'video',
          mov: 'video',
          mp3: 'audio',
          wav: 'audio',
          m4a: 'audio',
          ppt: 'presentation',
          pptx: 'presentation',
          pdf: 'document',
          docx: 'document',
          html: 'web',
          htm: 'web'
        }[extension];
        if (!kind || output.some((item) => item.url === url)) continue;
        output.push({
          id: `output:${message.id}:${output.length}`,
          conversationId: conversation.id,
          messageId: message.id,
          title: link[1],
          kind,
          icon:
            {
              image: 'image',
              video: 'play',
              audio: 'volume',
              animation: 'play',
              presentation: 'file-text',
              web: 'globe'
            }[kind] || 'file-text',
          detail: extension.toUpperCase(),
          at: message.at || conversation.at,
          goal: conversation.goal,
          url
        });
      }
    }
    if (!conversation.coach)
      for (const message of conversation.messages || []) {
        if (message.role !== 'assistant' || !message.content?.trim() || museTestNotification(message)) continue;
        output.push({
          id: `message:${message.id}`,
          conversationId: conversation.id,
          messageId: message.id,
          title: preview(message.content.replace(/[#*`]/g, ''), 60),
          kind: 'note',
          icon: 'chat',
          detail: '已保存对话',
          at: message.at || conversation.at,
          goal: conversation.goal
        });
      }
    const coach = conversation.coach;
    if (!coach) continue;
    if (coach.diagnostic)
      output.push({
        id: `diagnostic:${conversation.id}`,
        conversationId: conversation.id,
        title: '摸底答题卡',
        kind: 'practice',
        icon: 'list',
        detail: `${coach.diagnostic.answers.length} / ${coach.diagnostic.cards.length}`,
        at: conversation.at,
        goal: conversation.goal
      });
    for (const day of coach.days) {
      const common = {
        conversationId: conversation.id,
        goal: conversation.goal,
        at: Date.parse(`${day.day}T00:00:00Z`),
        day: day.day
      };
      output.push({
        ...common,
        id: `practice:${conversation.id}:${day.day}`,
        title: `${day.day} · 今日训练`,
        kind: 'practice',
        icon: 'list',
        detail: `${day.answers.length} / ${day.pack.cards.length}`
      });
      if (
        (day.drafts.length || day.rewrites.length) &&
        !essays.some((item) => item.conversationId === conversation.id && item.day === day.day)
      )
        output.push({
          ...common,
          id: `writing:${conversation.id}:${day.day}`,
          title: `${day.day} · 写作`,
          kind: 'writing',
          icon: 'pen',
          detail: `${day.rewrites.length} / ${day.pack.writing.patterns.length} 段`
        });
      if (day.summary)
        output.push({
          ...common,
          id: `summary:${conversation.id}:${day.day}`,
          title: `${day.day} · 小结`,
          kind: 'summary',
          icon: 'file-text',
          detail: day.completed ? '已完成' : '已保存'
        });
    }
  }
  output.push(...essays);
  return output.sort((a, b) => b.at - a.at);
}

// Academic subjects remain visible at zero records; task/file types are separate.
// Goal text adds filter labels only and never classifies unlabelled historical items.
export function museLearningLibrary(state, now = Date.now()) {
  const items = museArtifacts(state);
  for (const attempt of state.attempts || []) {
    const conversation = state.conversations.find((c) => c.id === attempt.conversationId);
    if (!conversation) continue;
    const question = state.questions.find((q) => questionKey(q) === attempt.questionKey);
    const grade = effectiveGrade(attempt) || {};
    items.push({
      id: `attempt:${attempt.id}`,
      conversationId: conversation.id,
      goal: conversation.goal,
      title: question?.title || question?.prompt?.slice(0, 48) || '已提交练习',
      kind: 'practice',
      icon: 'list',
      at: attempt.at,
      detail:
        grade.status !== 'reliable'
          ? '待核对'
          : grade.outcome === 'correct'
            ? '已答对'
            : grade.outcome === 'wrong'
              ? '错题'
              : '部分正确',
      mistake: grade.status === 'reliable' && grade.outcome === 'wrong',
      questionKey: attempt.questionKey,
      subjects: museRecordSubjects(question || {}),
      topic: question?.knowledgePoint || '练习'
    });
  }
  const subjects = new Map(),
    collections = new Map();
  const add = (map, id, label, icon, item) => {
    if (!map.has(id)) map.set(id, { id, label, icon, itemIds: [] });
    const ids = map.get(id).itemIds;
    if (!ids.includes(item.id)) ids.push(item.id);
  };
  const insights = museLearningInsights(state, now);
  for (const option of museSubjectOptions(state, [])) {
    if (option.id !== 'all') subjects.set(option.id, { ...option, icon: 'book-open', itemIds: [] });
  }
  for (const item of items) {
    const conversations = item.materialId
      ? state.conversations.filter(
          (c) => c.coach?.materialIds?.includes(item.materialId) || c.materialIds?.includes(item.materialId)
        )
      : state.conversations.filter((c) => c.id === item.conversationId);
    // Only explicit saved metadata classifies records; filenames and goal text cannot rewrite old subjects.
    const labels = item.subjects || museRecordSubjects(conversations.length === 1 ? conversations[0] : {});
    item.subjects = labels;
    for (const label of labels) add(subjects, `subject:${label}`, label, 'book-open', item);
    if (item.mistake) add(collections, 'mistakes', '错题', 'pen', item);
    const matches = (evidence) =>
      evidence.conversationId === item.conversationId && (!item.day || evidence.day === item.day);
    if (insights.weaknesses.some((w) => w.evidence.some(matches)))
      add(collections, 'weaknesses', '薄弱点 · AI 评估', 'chart', item);
    if (insights.strengths.some((w) => w.evidence.some(matches)))
      add(collections, 'strengths', '优秀点 · AI 评估', 'check', item);
    if (
      (state.reviews || []).some((r) => !r.cancelled && r.due <= now && r.questionKey === item.questionKey) ||
      conversations.some((c) => c.coach?.library?.some((p) => p.due <= now && (!item.day || p.day === item.day)))
    )
      add(collections, 'review', '待复习', 'refresh', item);
  }
  const conversationSections = state.conversations.map((conversation) => ({
    id: conversationCategoryId(conversation.id),
    label: conversationLabel(conversation),
    icon: 'chat',
    conversationId: conversation.id,
    source: conversation.goal ? '已保存的对话目标' : '已保存的建档信息',
    itemIds: []
  }));
  for (const item of items) {
    const sources = state.conversations.filter((c) =>
      item.materialId
        ? c.materialIds?.includes(item.materialId) ||
          c.coach?.materialIds?.includes(item.materialId) ||
          state.events?.some((e) => e.data?.conversationId === c.id && e.data?.materialId === item.materialId)
        : c.id === item.conversationId
    );
    item.sources = sources.map((c) => ({ conversationId: c.id, label: conversationLabel(c) }));
    item.categoryIds = sources.length ? sources.map((c) => conversationCategoryId(c.id)) : ['unclassified'];
    for (const section of conversationSections)
      if (item.categoryIds.includes(section.id)) section.itemIds.push(item.id);
  }
  const unclassified = items.filter((item) => !item.sources.length).map((item) => item.id);
  const groups = [
    {
      id: 'conversations',
      label: '来源对话',
      items: [
        { id: 'all', label: '全部对话', icon: 'chat', count: items.length },
        ...conversationSections.map((item) => ({ ...item, count: item.itemIds.length })),
        { id: 'unclassified', label: '未归类', icon: 'folder', itemIds: unclassified, count: unclassified.length }
      ]
    },
    {
      id: 'subjects',
      label: '学科',
      items: [...subjects.values()].map((item) => ({ ...item, count: item.itemIds?.length ?? item.count }))
    }
  ];
  if (collections.size) groups.push({ id: 'practice', label: '练习与反馈', items: [...collections.values()] });
  return { items, groups, sections: groups.flatMap((group) => group.items) };
}

export function museHistory(state) {
  const items = museActivity(state);
  for (const conversation of state.conversations) {
    if (conversation.coach) continue;
    for (const message of conversation.messages || []) {
      if (message.role !== 'assistant' || !message.content?.trim() || museTestNotification(message)) continue;
      items.push({
        id: message.id,
        conversationId: conversation.id,
        goal: conversation.goal,
        title: conversation.goal,
        body: preview(message.content),
        kind: 'feedback',
        subjects: museRecordSubjects(conversation),
        icon: 'chat',
        at: message.at || conversation.at,
        index: 0
      });
    }
  }
  return items.sort((a, b) => b.at - a.at || b.index - a.index);
}

// The local journal proves requests and outcomes, never provider quota or money.
export function museUsage(state, now = Date.now()) {
  const today = dayKey(now, state.timezone);
  const requests = state.conversations
    .flatMap((conversation) => conversation.coach?.requests || [])
    .map((request) => ({ ...request }));
  const ids = new Set(requests.map((request) => request.id));
  for (const event of state.events || []) {
    if (
      event.type !== 'model.request' ||
      ids.has(event.data?.requestId) ||
      !state.conversations.some((c) => c.id === event.data?.conversationId)
    )
      continue;
    ids.add(event.data.requestId);
    const completed = state.events.some(
      (item) => item.id === `${event.data.requestId}:reply` && item.data?.conversationId === event.data.conversationId
    );
    requests.push({
      id: event.data.requestId,
      modelId: event.data.modelId,
      at: event.at,
      status: completed ? 'completed' : 'pending'
    });
  }
  const submissions = [];
  let assessed = 0;
  for (const conversation of state.conversations) {
    const coach = conversation.coach;
    if (!coach) continue;
    for (const answer of coach.diagnostic?.answers || []) {
      submissions.push({ at: answer.at, day: answer.day || coach.startedDay });
      if (coach.diagnostic.feedback) assessed++;
    }
    for (const day of coach.days) {
      for (const answer of day.answers) {
        submissions.push({ at: answer.at, day: day.day });
        if (day.feedback[`card-${answer.cardId}`]) assessed++;
      }
      for (const [index, answer] of day.drafts.entries())
        if (answer) {
          submissions.push({ at: answer.at, day: day.day });
          if (day.feedback[`paragraph-${index}`]) assessed++;
        }
    }
  }
  const activeAttempts = (state.attempts || []).filter((a) =>
    state.conversations.some((c) => c.id === a.conversationId)
  );
  for (const attempt of activeAttempts) {
    submissions.push({ at: attempt.at });
    if (effectiveGrade(attempt)?.status === 'reliable') assessed++;
  }

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 6 + index);
    const day = date.toISOString().slice(0, 10);
    return { day, count: requests.filter((r) => dayKey(r.at, state.timezone) === day).length };
  });
  const models = new Map();
  for (const request of requests) {
    const id = request.modelId || '未记录模型';
    models.set(id, (models.get(id) || 0) + 1);
  }
  const submissionDays = days.map(({ day }) => ({
    day,
    count: submissions.filter((item) => (Number.isFinite(item.at) ? dayKey(item.at, state.timezone) : item.day) === day)
      .length
  }));
  const due = state.conversations.flatMap((c) => c.coach?.library || []).filter((item) => item.due <= now).length;
  return {
    submitted: submissions.length,
    assessed,
    awaitingAssessment: submissions.length - assessed,
    due:
      due +
      (state.reviews || []).filter(
        (r) => !r.cancelled && r.due <= now && state.questions.some((q) => questionKey(q) === r.questionKey)
      ).length,
    failed: requests.filter((r) => r.status !== 'completed' && (r.status === 'failed' || r.outcome === 'failed'))
      .length,
    otherClosed: requests.filter((r) => r.status === 'closed' && r.outcome !== 'failed').length,
    unconfirmed: requests.filter((r) => !['completed', 'closed', 'failed'].includes(r.status) && r.outcome !== 'failed')
      .length,
    submissionDays,
    weekSubmitted: submissionDays.reduce((sum, day) => sum + day.count, 0),
    total: requests.length,
    completed: requests.filter((r) => r.status === 'completed').length,
    pending: requests.filter((r) => r.status === 'pending').length,
    closed: requests.filter((r) => r.status === 'closed').length,
    days,
    weekTotal: days.reduce((sum, day) => sum + day.count, 0),
    models: [...models].map(([id, count]) => ({ id, count })),
    quotaPercent: null,
    cost: null
  };
}
