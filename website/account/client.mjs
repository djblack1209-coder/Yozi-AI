// Data access for /account/: the two requests the page may send and its one session key.
// DOM-free so the contract stays testable; the page never writes learning facts.
import { decodeHistory, validateHistoryManifest } from "../../laf-backend/functions/_shared/learning-history.js";

export const SESSION_KEY = "yozi.account.session";
const API = "/exam-master";
const STATE_LISTS = ["events", "conversations", "questions", "materials", "attempts", "plans", "reviews", "executions", "profile"];
const AUTH_CODES = new Set(["AUTH_REQUIRED", "TOKEN_EXPIRED", "INVALID_TOKEN", "ACCOUNT_UNAVAILABLE", "ACCOUNT_DELETED"]);
// Same window as the App's sync transport; the backend allows 30 reads a minute.
const WINDOW_MS = 61000;
const WINDOW_CALLS = 24;

export class AccountError extends Error {
  constructor(kind, retryAfter) {
    super(kind);
    this.kind = kind;
    this.retryAfter = retryAfter;
  }
}

export function readSession(storage) {
  try {
    const session = JSON.parse(storage.getItem(SESSION_KEY));
    return session?.token && session?.owner ? { token: session.token, owner: session.owner } : null;
  } catch {
    return null;
  }
}
export function saveSession(storage, { token, owner }) {
  storage.setItem(SESSION_KEY, JSON.stringify({ token, owner }));
}
export function clearSession(storage) {
  try {
    storage.removeItem(SESSION_KEY);
  } catch {}
}

async function post(send, path, body, options = {}) {
  let response;
  try {
    response = await send(API + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...options.headers },
      body: JSON.stringify(body),
      credentials: "omit",
      cache: "no-store",
      signal: options.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw new AccountError("cancelled");
    throw new AccountError("network");
  }
  let value = null;
  try {
    value = await response.json();
  } catch {}
  return { status: response.status, value };
}

function signInFailure(status, value) {
  const code = Number(value?.code);
  const message = String(value?.message || "");
  if (status === 429 || code === 429) return new AccountError("rate", Number(value?.retryAfter) || undefined);
  if (message === "该账号未设置密码，请使用验证码登录" || status === 403 || code === 403) return new AccountError("useApp");
  if (message.includes("邮箱格式")) return new AccountError("email");
  // An unknown email and a wrong password read the same, so the form cannot probe for accounts.
  if (status === 401 || code === 401 || message.includes("新用户注册")) return new AccountError("credentials");
  return new AccountError("service");
}

// One attempt only: the App's /login is no-retry, no-replay, and so is this page.
export async function signIn({ email, password }, send = fetch) {
  const { status, value } = await post(send, "/login", {
    region: "CN",
    type: "email",
    email: email.trim().toLowerCase(),
    password,
  });
  const token = value?.data?.token;
  const owner = value?.data?.userId ?? value?.data?.userInfo?.id;
  if (status < 400 && value?.code === 0 && token && owner) return { token, owner: String(owner) };
  throw signInFailure(status, value);
}

function snapshotTransport(session, send, wait, signal) {
  const recent = [];
  return async (body) => {
    while (recent.length && Date.now() - recent[0] >= WINDOW_MS) recent.shift();
    if (recent.length >= WINDOW_CALLS) await wait(Math.max(1, WINDOW_MS - (Date.now() - recent[0])));
    recent.push(Date.now());
    const { status, value } = await post(send, "/learning-sync", body, {
      headers: { Authorization: `Bearer ${session.token}` },
      signal,
    });
    if (status === 401 || Number(value?.code) === 401 || AUTH_CODES.has(value?.errorCode || value?.error))
      throw new AccountError("expired");
    if (status === 429 || Number(value?.code) === 429) throw new AccountError("rate");
    if (!value) throw new AccountError("service");
    return value;
  };
}

function checkedState(state, owner) {
  if (state?.owner !== owner) throw new AccountError("owner");
  if (state.version !== 1 || !Number.isInteger(state.revision) || !STATE_LISTS.every((key) => Array.isArray(state[key])))
    throw new AccountError("service");
  return state;
}

// The request pullSnapshot sends in src/services/learning/learning-sync.js: pull, then page through a
// long history, and restart once if the history moved. Two versions are never stitched together.
export async function readSnapshot(session, send = fetch, options = {}) {
  const wait = options.wait || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const request = snapshotTransport(session, send, wait, options.signal);
  const timezone = options.timezone || "Asia/Shanghai";
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await request({ action: "pull", timezone });
    if (!result.success) throw new AccountError("service");
    if (!result.data?.history) return checkedState(result.data?.state, session.owner);
    const manifest = result.data.history;
    const revision = result.data.revision;
    const pages = [];
    let stale = false;
    try {
      validateHistoryManifest(manifest, session.owner);
    } catch {
      throw new AccountError("owner");
    }
    for (let offset = 0; offset < manifest.checksums.length; offset += 3) {
      const part = await request({ action: "page", revision, generation: manifest.generation, offset, count: 3 });
      if (part?.error === "STALE_SYNC") {
        stale = true;
        break;
      }
      if (!part.success || part.data?.owner !== session.owner || !Array.isArray(part.data.pages))
        throw new AccountError("service");
      pages.push(...part.data.pages);
    }
    if (stale) continue;
    try {
      return checkedState(decodeHistory(manifest, pages, session.owner), session.owner);
    } catch (error) {
      if (error instanceof AccountError) throw error;
      throw new AccountError("service");
    }
  }
  throw new AccountError("service");
}
