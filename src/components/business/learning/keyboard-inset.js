// Where the on-screen keyboard overlays the window instead of resizing it, the
// layout never learns about it. Publish the covered height for the composer.
function coveredHeight(view) {
  const viewport = view.visualViewport;
  return Math.max(0, Math.round(view.innerHeight - viewport.height - viewport.offsetTop));
}

export function bindKeyboardInset(element, view = window) {
  const viewport = view.visualViewport;
  if (!element || !viewport) return () => {};
  const update = () => element.style.setProperty('--keyboard-inset', `${coveredHeight(view)}px`);
  viewport.addEventListener('resize', update);
  viewport.addEventListener('scroll', update);
  update();
  return () => {
    viewport.removeEventListener('resize', update);
    viewport.removeEventListener('scroll', update);
    element.style.removeProperty('--keyboard-inset');
  };
}
