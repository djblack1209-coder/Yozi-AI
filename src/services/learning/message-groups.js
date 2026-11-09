import { learningDateTimeFormat } from '../../../laf-backend/functions/_shared/learning-date-time.js';
import { parseMuseRichContent } from './muse-rich-content.js';

// Only inspect the existing renderer's presentation nodes; never evaluate generated JSX.
const hasCards = (nodes) =>
  nodes.some((node) => ['box', 'grid', 'table'].includes(node.kind) || hasCards(node.children || []));

// Presentation only: group the visible page, without changing saved messages or day chapters.
export function groupLearningMessages(messages, timezone) {
  const sameGroup = (left, right) => {
    if (!left || !right || !Number.isFinite(left.at) || !Number.isFinite(right.at)) return false;
    return (left.role === 'user') === (right.role === 'user') && right.at >= left.at && right.at - left.at < 120000;
  };
  const clock = learningDateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone
  });
  return messages.map((message, index) => {
    const previous = sameGroup(messages[index - 1], message);
    const next = sameGroup(message, messages[index + 1]);
    return {
      ...message,
      rich:
        message.role !== 'user' &&
        Boolean(message.contentBlocks || message.proposal?.data || hasCards(parseMuseRichContent(message.content))),
      groupPosition: previous ? (next ? 'middle' : 'last') : next ? 'first' : 'single',
      groupTime: !previous && Number.isFinite(message.at) ? clock.format(message.at) : ''
    };
  });
}
