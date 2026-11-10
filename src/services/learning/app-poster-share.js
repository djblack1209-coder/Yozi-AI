import { APP_CONNECTOR_PLUGIN } from './app-connector.js';

async function readPoster(source) {
  const entry = await new Promise((resolve, reject) => plus.io.resolveLocalFileSystemURL(source, resolve, reject));
  const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
  return new Promise((resolve, reject) => {
    const reader = new plus.io.FileReader();
    reader.onerror = reject;
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1]);
    reader.readAsDataURL(file);
  });
}

export function androidPosterShare() {
  if (typeof plus === 'undefined' || plus.os?.name !== 'Android') return null;
  try {
    const bridge = uni.requireNativePlugin?.(APP_CONNECTOR_PLUGIN);
    if (typeof bridge?.shareStudyPoster !== 'function' || bridge.canShareStudyPoster?.() !== true) return null;
    return async (source, isCurrent) => {
      const bytes = await readPoster(source);
      if (!isCurrent()) return false;
      const result = await new Promise((resolve) => bridge.shareStudyPoster(bytes, resolve));
      if (result?.status === 'cancelled') return false;
      if (result?.status !== 'selected') throw new Error('分享未完成');
      return true;
    };
  } catch {
    return null;
  }
}
