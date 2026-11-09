const duration = 520;

function deletedRun(before, after, caret) {
  const length = before.length - after.length;
  if (length <= 0) return null;
  const matches = (start) => before.slice(0, start) + before.slice(start + length) === after;
  if (Number.isInteger(caret) && matches(caret)) return { start: caret, length };
  // HTML number inputs report no selection. Match the surviving text instead.
  let start = 0;
  while (start < after.length && before[start] === after[start]) start++;
  return matches(start) ? { start, length } : null;
}

function sampleInk(input, group, before, run) {
  const style = getComputedStyle(input);
  const rect = input.getBoundingClientRect();
  const bounds = group.getBoundingClientRect();
  const padding = (property) => parseFloat(style[property]) || 0;
  const raster = document.createElement('canvas');
  let pen = raster.getContext('2d', { willReadFrequently: true });
  if (!pen) return null;

  const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  pen.font = font;
  const removed = before.slice(run.start, run.start + run.length);
  const x =
    rect.left -
    bounds.left -
    group.clientLeft +
    padding('borderLeftWidth') +
    padding('paddingLeft') -
    input.scrollLeft +
    pen.measureText(before.slice(0, run.start)).width;
  const left = Math.max(0, x - 1);
  const right = Math.min(group.clientWidth, x + pen.measureText(removed).width + 1);
  if (right <= left) return null;

  raster.width = Math.ceil(right - left);
  raster.height = Math.ceil(padding('fontSize') * 1.5);
  const top = rect.top - bounds.top - group.clientTop + (rect.height - raster.height) / 2;
  pen = raster.getContext('2d');
  pen.font = font;
  pen.textBaseline = 'middle';
  pen.fillText(removed, x - left, raster.height / 2);
  const pixels = pen.getImageData(0, 0, raster.width, raster.height).data;
  const grains = [];
  for (let row = 0; row < raster.height; row++) {
    for (let column = 0; column < raster.width; column++) {
      const alpha = pixels[(row * raster.width + column) * 4 + 3];
      if (alpha < 96) continue;
      grains.push({
        x: left + column,
        y: top + row,
        drift: (Math.random() - 0.36) * 15,
        lift: Math.random() * 9,
        opacity: alpha / 255
      });
    }
  }
  return { color: style.color, grains, born: performance.now() };
}

// Both the desktop DOM and the App view layer use the same paint-only listener.
export function bindNumericDeleteInk(group) {
  if (!group) return () => undefined;
  const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  if (!motion) return () => undefined;
  let before = '';
  let canvas, pen, frame;
  let bursts = [];

  function stop() {
    cancelAnimationFrame(frame);
    frame = undefined;
    bursts = [];
    canvas?.remove();
    canvas = pen = undefined;
  }

  function paint(now) {
    bursts = bursts.filter((burst) => now - burst.born < duration);
    if (!group.isConnected || motion.matches || bursts.length === 0) {
      stop();
      return;
    }
    pen.clearRect(0, 0, group.clientWidth, group.clientHeight);
    for (const { color, grains, born } of bursts) {
      const progress = Math.max(0, (now - born) / duration);
      pen.fillStyle = color;
      for (const { x, y, drift, lift, opacity } of grains) {
        pen.globalAlpha = opacity * (1 - progress) ** 1.4;
        pen.fillRect(x + drift * progress, y - lift * progress + 7 * progress ** 2, 0.9, 0.9);
      }
    }
    frame = requestAnimationFrame(paint);
  }

  function capture(event) {
    if (event.target.matches?.('input')) before = event.target.value;
  }

  function animate(event) {
    const input = event.target;
    if (!input.matches?.('input')) return;
    const previous = before;
    before = input.value;
    if (motion.matches || event.isComposing || (event.inputType && !event.inputType.startsWith('delete'))) return;
    const run = deletedRun(previous, before, input.selectionStart);
    if (!run) return;
    const burst = sampleInk(input, group, previous, run);
    if (!burst?.grains.length) return;

    if (!canvas) {
      canvas = document.createElement('canvas');
      pen = canvas.getContext('2d');
      if (!pen) {
        canvas = undefined;
        return;
      }
      const scale = window.devicePixelRatio || 1;
      canvas.width = Math.ceil(group.clientWidth * scale);
      canvas.height = Math.ceil(group.clientHeight * scale);
      pen.scale(scale, scale);
      canvas.className = 'numeric-delete-ink';
      canvas.setAttribute('aria-hidden', 'true');
      group.append(canvas);
    }
    bursts.push(burst);
    if (frame === undefined) frame = requestAnimationFrame(paint);
  }

  group.addEventListener('focusin', capture, true);
  group.addEventListener('beforeinput', capture, true);
  group.addEventListener('input', animate, true);
  return () => {
    stop();
    group.removeEventListener('focusin', capture, true);
    group.removeEventListener('beforeinput', capture, true);
    group.removeEventListener('input', animate, true);
  };
}
