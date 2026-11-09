export function aimPasswordLamp(event) {
  const field = event.currentTarget;
  const lamp = field?.querySelector?.('.password-lamp.is-lit');
  if (!lamp || event.pointerType === 'touch') return;
  const rect = lamp.getBoundingClientRect();
  const angle =
    (Math.atan2(rect.top + rect.height / 2 - event.clientY, Math.max(24, rect.left - event.clientX)) * 180) / Math.PI;
  field.style.setProperty('--password-lamp-angle', `${Math.max(-26, Math.min(26, angle))}deg`);
}

export function resetPasswordLamp(event) {
  event.currentTarget?.style?.removeProperty('--password-lamp-angle');
}
