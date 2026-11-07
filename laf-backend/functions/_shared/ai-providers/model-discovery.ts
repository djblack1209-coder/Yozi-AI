import https from 'node:https';
import { MODEL_ENDPOINTS } from './model-endpoints.js';
import { resolveCloudEndpoint, validateCloudEndpoint, modelValueHasKeyEcho } from './learning-provider.js';
import { DISCOVERY_CANDIDATES, unknownMetadata, type MetadataField } from './model-metadata.js';

export const DISCOVERY_LIMITS = Object.freeze({
  responseBytes: 2 * 1048576,
  models: 1000,
  timeoutMs: 10000,
  ttlMs: 300000,
  cooldownMs: 60000,
  cacheBytes: 1048576
});
export type DiscoveryProfile = {
  owner: string;
  id: string;
  version: number;
  provider: string;
  endpoint: string;
  configured: boolean;
  authorization: 'bearer';
  keyRef?: string;
};
type FetchOptions = {
  method: 'GET';
  redirect: 'error';
  signal: AbortSignal;
  headers: Record<string, string>;
  address: { address: string; family: number };
};
type MetadataResponse = {
  status: number;
  headers: { get(name: string): string | null };
  body: AsyncIterable<Uint8Array>;
  cancel?: () => void;
};
type Dependencies = {
  readProfile(owner: string, profileId: string): Promise<DiscoveryProfile | null>;
  allowedOrigins?: () => string[];
  readCredential?: (profile: DiscoveryProfile, signal: AbortSignal) => Promise<string | null>;
  fetcher?: (url: URL, options: FetchOptions) => Promise<MetadataResponse>;
  resolve?: typeof resolveCloudEndpoint;
  now?: () => number;
  cacheBytes?: number;
};
class DiscoveryError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
const fail = (code: string): never => {
  throw new DiscoveryError(code);
};
const modelIdValid = (value: unknown): value is string =>
  typeof value === 'string' && /^[\x21-\x7e]{1,256}$/.test(value);
const object = (value: any) => value && typeof value === 'object' && !Array.isArray(value);
const known = (value: any, sourcePath: string): MetadataField => ({
  value,
  state: 'known',
  reason: 'observed',
  sourceRef: ['api'],
  sourcePath
});
const numeric = (value: any, path: string) =>
  value === null
    ? unknownMetadata('vendor_null_ambiguous')
    : Number.isSafeInteger(value) && value > 0
      ? known(value, path)
      : unknownMetadata(typeof value === 'string' ? 'unit_unresolved' : 'not_returned');
function listField(value: any, path: string, limit: number, length: number, allowed?: string[]) {
  if (value === null) return unknownMetadata('vendor_null_ambiguous');
  return Array.isArray(value) &&
    value.length <= limit &&
    value.every(
      (item) =>
        typeof item === 'string' &&
        item.length > 0 &&
        item.length <= length &&
        /^[\x21-\x7e]+$/.test(item) &&
        (!allowed || allowed.includes(item))
    )
    ? known([...new Set(value)], path)
    : unknownMetadata('not_returned');
}
function mapMetadata(raw: any, vendor: string, target: string | undefined, now: number, listPath: string) {
  if (!object(raw)) fail('METADATA_UNAVAILABLE');
  const direct = vendor === 'groq' && target !== undefined;
  const rows = direct
    ? [raw]
    : vendor === 'gemini'
      ? raw.models
          ?.filter(
            (row: any) => !row.supportedGenerationMethods || row.supportedGenerationMethods.includes('generateContent')
          )
          .map((row: any) => ({
            id: typeof row.name === 'string' ? row.name.replace(/^models\//, '') : null,
            name: row.displayName,
            context_window: row.inputTokenLimit
          }))
      : raw.data;
  if (!Array.isArray(rows)) fail('METADATA_UNAVAILABLE');
  if (rows.length > DISCOVERY_LIMITS.models) fail('METADATA_LIMIT');
  let complete =
    !['has_more', 'next', 'next_page', 'next_page_token', 'nextPageToken', 'next_cursor', 'pagination'].some((key) =>
      Object.hasOwn(raw, key)
    ) && !raw.links?.next;
  const seen = new Set<string>();
  const valid = rows.filter((row) => {
    if (!object(row) || !modelIdValid(row.id) || seen.has(row.id)) {
      complete = false;
      return false;
    }
    seen.add(row.id);
    return true;
  });
  const source = {
    id: 'api',
    kind: 'official_api_observed',
    sourceUrl: `${vendor}:GET ${direct ? '/openai/v1/models/{model}' : listPath}`,
    observedAt: now,
    sourceUpdatedAt: null,
    expiresAt: now + DISCOVERY_LIMITS.ttlMs
  };
  const displayName = (row: any) => (typeof row.name === 'string' && row.name.length <= 128 ? row.name : null);
  if (!target)
    return {
      mode: 'list',
      complete,
      models: valid.map((row) => ({
        modelId: row.id,
        displayName: displayName(row),
        availability: 'listed',
        ...(Number.isSafeInteger(row.context_window || row.context_length) &&
        (row.context_window || row.context_length) > 0
          ? { contextWindowTokens: row.context_window || row.context_length }
          : {})
      })),
      sources: [source],
      fetchedAt: now
    };
  const row = valid.find((item) => item.id === target);
  const fields: Record<string, MetadataField> = Object.fromEntries(
    [
      'contextWindowTokens',
      'maxInputTokens',
      'maxOutputTokens',
      'maxReasoningTokens',
      'inputModalities',
      'outputModalities',
      'supportedParameters',
      'reasoningLevels',
      'highestReasoningLevel',
      'outputIncludesReasoning'
    ].map((key) => [key, unknownMetadata()])
  );
  fields.pricing = unknownMetadata('not_collected_phase1');
  fields.freeQuota = unknownMetadata('not_discoverable');
  fields.highestReasoningLevel = unknownMetadata('not_documented');
  if (row) {
    fields.contextWindowTokens = numeric(row.context_window, direct ? '$.context_window' : '$.data[].context_window');
    if (vendor === 'deepseek') {
      fields.maxOutputTokens = numeric(row.max_output_tokens, '$.data[].max_output_tokens');
      fields.reasoningLevels = listField(row.effort?.supported_levels, '$.data[].effort.supported_levels', 16, 32);
      for (const [field, sourceKey] of [
        ['inputModalities', 'input_modalities'],
        ['outputModalities', 'output_modalities']
      ])
        fields[field] = listField(row[sourceKey], `$.data[].${sourceKey}`, 8, 32, [
          'text',
          'image',
          'audio',
          'video',
          'file'
        ]);
    } else fields.maxOutputTokens = numeric(row.max_completion_tokens, '$.max_completion_tokens');
  }
  return {
    mode: 'detail',
    complete,
    modelId: target,
    displayName: row ? displayName(row) : null,
    availability: row
      ? known('listed', direct ? '$.id' : '$.data[].id')
      : complete
        ? known('unlisted', '$.data')
        : unknownMetadata('incomplete_listing'),
    fields,
    sources: [source],
    fetchedAt: now
  };
}

// A finite GET transport; DNS pinning is shared with the existing provider, never a generic proxy.
async function fetchMetadata(url: URL, options: FetchOptions): Promise<MetadataResponse> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'GET',
        agent: false,
        signal: options.signal,
        headers: options.headers,
        lookup: (_host, lookupOptions: any, callback: any) =>
          lookupOptions?.all
            ? callback(null, [options.address])
            : callback(null, options.address.address, options.address.family)
      },
      (res) =>
        resolve({
          status: res.statusCode || 0,
          headers: {
            get: (name) => {
              const value = res.headers[name.toLowerCase()];
              return typeof value === 'string' ? value : null;
            }
          },
          body: res,
          cancel: () => res.destroy()
        })
    );
    req.on('error', () =>
      reject(new DiscoveryError(options.signal.aborted ? 'METADATA_TIMEOUT' : 'METADATA_UNAVAILABLE'))
    );
    req.end();
  });
}
function abortable<T>(work: Promise<T> | (() => Promise<T>), signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason || new DiscoveryError('CONTEXT_CHANGED'));
  const promise = typeof work === 'function' ? work() : work;
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason || new DiscoveryError('CONTEXT_CHANGED'));
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
async function readJson(response: MetadataResponse, controller: AbortController) {
  try {
    if (response.status >= 300 && response.status < 400) fail('METADATA_REDIRECT_REJECTED');
    if (response.status !== 200)
      fail(
        response.status === 429
          ? 'DISCOVERY_UPSTREAM_RATE_LIMITED'
          : response.status === 401 || response.status === 403
            ? 'DISCOVERY_AUTH_REJECTED'
            : [404, 405, 410, 501].includes(response.status)
              ? 'UNSUPPORTED_DISCOVERY'
              : response.status === 402
                ? 'UPSTREAM_QUOTA'
                : 'METADATA_UNAVAILABLE'
      );
    const mime = (response.headers.get('content-type') || '').split(';')[0].trim();
    if (!/^application\/(?:[a-z0-9.+-]+\+)?json$/i.test(mime)) fail('METADATA_NOT_JSON');
    const encoding = response.headers.get('content-encoding');
    if (encoding && encoding.toLowerCase() !== 'identity') fail('METADATA_ENCODING_UNSUPPORTED');
    if (Number(response.headers.get('content-length')) >= DISCOVERY_LIMITS.responseBytes) fail('METADATA_LIMIT');
    const chunks: Buffer[] = [];
    let bytes = 0;
    const iterator = response.body[Symbol.asyncIterator]();
    while (true) {
      const next = await abortable(() => Promise.resolve(iterator.next()), controller.signal);
      if (next.done) break;
      const chunk = Buffer.from(next.value);
      bytes += chunk.length;
      if (bytes >= DISCOVERY_LIMITS.responseBytes) fail('METADATA_LIMIT');
      chunks.push(chunk);
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  } catch (error) {
    response.cancel?.();
    controller.abort(error);
    throw error instanceof DiscoveryError ? error : new DiscoveryError('METADATA_UNAVAILABLE');
  }
}

type Resource = {
  scope: string;
  value?: any;
  errorCode?: string;
  refreshAfter: number;
  promise?: Promise<any>;
  controller?: AbortController;
  consumers: number;
};
export function createModelDiscovery(deps: Dependencies) {
  // The only added server-side Map: in-flight work, cache and cooldown share this bounded state.
  const resources = new Map<string, Resource>();
  const now = deps.now || Date.now;
  const budget = Math.min(DISCOVERY_LIMITS.cacheBytes, deps.cacheBytes || DISCOVERY_LIMITS.cacheBytes);
  const footprint = (key: string, value: Resource) =>
    Buffer.byteLength(
      JSON.stringify({
        key,
        scope: value.scope,
        value: value.value,
        // Reserve room for the longest bounded error while retaining a stale snapshot.
        errorCode: 'DISCOVERY_UPSTREAM_RATE_LIMITED',
        refreshAfter: value.refreshAfter,
        consumers: value.consumers
      })
    );
  const fit = (key: string, value: Resource) => {
    const total = () =>
      [...resources].reduce((sum, [k, v]) => sum + (k === key ? 0 : footprint(k, v)), footprint(key, value));
    for (const [oldKey, old] of resources) {
      if (total() <= budget) break;
      if (oldKey !== key && !old.promise && old.refreshAfter <= now()) resources.delete(oldKey);
    }
    return total() <= budget;
  };
  const touch = (key: string, value: Resource) => {
    resources.delete(key);
    resources.set(key, value);
  };
  const publicValue = (value: any, stale = false) => {
    const data = structuredClone(value);
    data.cacheState = stale || data.sources.some((source: any) => source.expiresAt <= now()) ? 'stale' : 'fresh';
    data.fetchedAt = new Date(data.fetchedAt).toISOString();
    for (const source of data.sources) {
      source.observedAt = new Date(source.observedAt).toISOString();
      source.expiresAt = new Date(stale ? Math.min(source.expiresAt, now()) : source.expiresAt).toISOString();
    }
    return data;
  };
  const profileValid = (profile: DiscoveryProfile | null, owner: string, id: string) =>
    profile &&
    profile.owner === owner &&
    profile.id === id &&
    Number.isSafeInteger(profile.version) &&
    profile.version >= 0;
  return async function discover(owner: string, body: any, enabled = false, signal?: AbortSignal) {
    const controller = new AbortController();
    const externalAbort = () => controller.abort(new DiscoveryError('CONTEXT_CHANGED'));
    if (signal?.aborted) externalAbort();
    else signal?.addEventListener('abort', externalAbort, { once: true });
    const timer = setTimeout(
      () => controller.abort(new DiscoveryError('METADATA_TIMEOUT')),
      DISCOVERY_LIMITS.timeoutMs
    );
    let state: Resource | undefined;
    try {
      if (
        !object(body) ||
        Object.keys(body).some((key) => !['action', 'profileId', 'modelId', 'refresh'].includes(key)) ||
        body.action !== 'discover' ||
        typeof body.profileId !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,60}$/.test(body.profileId) ||
        typeof body.refresh !== 'boolean' ||
        (body.modelId !== undefined && !modelIdValid(body.modelId))
      )
        fail('DISCOVERY_INPUT_INVALID');
      if (!enabled) fail('DISCOVERY_DISABLED');
      const profile = await abortable(() => deps.readProfile(owner, body.profileId), controller.signal);
      if (!profileValid(profile, owner, body.profileId)) fail('CONTEXT_CHANGED');
      const preset = MODEL_ENDPOINTS.find(
        (item) =>
          item.provider === profile!.provider &&
          (item.endpoint === profile!.endpoint || `${item.legacyBaseURL}/chat/completions` === profile!.endpoint)
      );
      const endpoint = validateCloudEndpoint(
        profile!.endpoint,
        deps.allowedOrigins?.() || [new URL(profile!.endpoint).origin]
      );
      if (!endpoint.pathname.endsWith('/chat/completions')) fail('UNSUPPORTED_DISCOVERY');
      const vendor = preset?.id || 'custom';
      const candidate = (DISCOVERY_CANDIDATES as Record<string, any>)[vendor] || {
        origin: endpoint.origin,
        chatPath: endpoint.pathname,
        listPath: vendor === 'gemini' ? '/v1beta/models' : endpoint.pathname.replace(/\/chat\/completions$/, '/models'),
        authorization: 'bearer',
        detailPrefix: null
      };
      if (
        endpoint.origin !== candidate.origin ||
        endpoint.pathname !== candidate.chatPath ||
        profile!.authorization !== candidate.authorization ||
        !profile!.configured
      )
        fail('UNSUPPORTED_DISCOVERY_AUTH');
      if (vendor === 'groq' && body.modelId !== undefined && !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,255}$/.test(body.modelId))
        fail('UNSUPPORTED_DISCOVERY');
      const scope = JSON.stringify([owner, body.profileId]);
      const key = JSON.stringify([owner, body.profileId, profile!.version, vendor, body.modelId || null]);
      state = resources.get(key);
      if (state) touch(key, state);
      if (!body.refresh)
        return state?.value
          ? { success: true, code: 0, data: publicValue(state.value, Boolean(state.errorCode)) }
          : { success: false, code: 503, errorCode: 'METADATA_UNAVAILABLE' };
      if (!state?.promise) {
        if ([...resources.values()].some((item) => item.scope === scope && item.refreshAfter > now())) {
          // Reopening the picker during cooldown can use the same configuration's fresh directory.
          const cached = state?.value && publicValue(state.value, Boolean(state.errorCode));
          if (cached?.cacheState === 'fresh') return { success: true, code: 0, data: cached };
          return {
            success: false,
            code: 503,
            errorCode: state?.errorCode || 'DISCOVERY_COOLDOWN',
            ...(cached ? { data: cached } : {})
          };
        }
        if (!deps.readCredential) fail('UNSUPPORTED_DISCOVERY_AUTH');
        state ||= { scope, refreshAfter: 0, consumers: 0 };
        state.refreshAfter = now() + DISCOVERY_LIMITS.cooldownMs;
        if (!fit(key, state)) fail('METADATA_LIMIT');
        const entry = state;
        touch(key, entry);
        const upstream = new AbortController();
        entry.controller = upstream;
        const upstreamTimer = setTimeout(
          () => upstream.abort(new DiscoveryError('METADATA_TIMEOUT')),
          DISCOVERY_LIMITS.timeoutMs
        );
        entry.promise = (async () => {
          try {
            const credential = await abortable(() => deps.readCredential!(profile!, upstream.signal), upstream.signal);
            if (!credential) fail('UNSUPPORTED_DISCOVERY_AUTH');
            const path =
              vendor === 'groq' && body.modelId
                ? `${candidate.detailPrefix}${encodeURIComponent(body.modelId)}`
                : candidate.listPath;
            const target = new URL(path, candidate.origin);
            if (vendor === 'groq' && body.modelId && !target.pathname.startsWith(candidate.detailPrefix!))
              fail('UNSUPPORTED_DISCOVERY');
            const resolved = await abortable(
              () => (deps.resolve || resolveCloudEndpoint)(target.href, [candidate.origin]),
              upstream.signal
            );
            const response = await abortable(
              () =>
                (deps.fetcher || fetchMetadata)(resolved.url, {
                  method: 'GET',
                  redirect: 'error',
                  signal: upstream.signal,
                  address: resolved.address,
                  headers: {
                    ...(vendor === 'gemini'
                      ? { 'x-goog-api-key': credential }
                      : { Authorization: `Bearer ${credential}` }),
                    Accept: 'application/json',
                    'Accept-Encoding': 'identity'
                  }
                }),
              upstream.signal
            );
            const raw = await readJson(response, upstream);
            const mapped = mapMetadata(raw, vendor, body.modelId, now(), candidate.listPath);
            if (modelValueHasKeyEcho(mapped, credential)) fail('METADATA_UNAVAILABLE');
            const current = await abortable(() => deps.readProfile(owner, body.profileId), upstream.signal);
            if (
              !profileValid(current, owner, body.profileId) ||
              current!.version !== profile!.version ||
              current!.endpoint !== profile!.endpoint ||
              current!.provider !== profile!.provider ||
              current!.configured !== profile!.configured
            )
              fail('CONTEXT_CHANGED');
            const next = { ...entry, value: mapped, errorCode: undefined };
            if (!fit(key, next)) fail('METADATA_LIMIT');
            entry.value = mapped;
            entry.errorCode = undefined;
            return { success: true, code: 0, data: publicValue(mapped) };
          } catch (error) {
            const errorCode =
              error instanceof DiscoveryError
                ? error.code
                : ['SSRF_BLOCKED', 'INVALID_ENDPOINT', 'KEY_UNAVAILABLE', 'KEY_REJECTED'].includes((error as any)?.code)
                  ? (error as any).code
                  : 'METADATA_UNAVAILABLE';
            // Invalidate the snapshot without dropping this profile's refresh cooldown.
            if (errorCode === 'CONTEXT_CHANGED') entry.value = undefined;
            entry.errorCode = errorCode;
            entry.refreshAfter = Math.max(entry.refreshAfter, now() + DISCOVERY_LIMITS.cooldownMs);
            return {
              success: false,
              code: 503,
              errorCode,
              ...(entry.value && errorCode !== 'CONTEXT_CHANGED' ? { data: publicValue(entry.value, true) } : {})
            };
          } finally {
            clearTimeout(upstreamTimer);
            entry.promise = undefined;
            entry.controller = undefined;
          }
        })();
      }
      state.consumers++;
      try {
        return await abortable(state.promise!, controller.signal);
      } finally {
        state.consumers--;
        if (!state.consumers && state.promise) state.controller?.abort(new DiscoveryError('CONTEXT_CHANGED'));
      }
    } catch (error) {
      return {
        success: false,
        code: 503,
        errorCode:
          error instanceof DiscoveryError
            ? error.code
            : ['SSRF_BLOCKED', 'INVALID_ENDPOINT', 'KEY_UNAVAILABLE', 'KEY_REJECTED'].includes((error as any)?.code)
              ? (error as any).code
              : 'METADATA_UNAVAILABLE'
      };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', externalAbort);
    }
  };
}
