// /account/ page behaviour. Signed out shows only the form; signed in shows the saved progress read-only.
import { websiteProgress } from "../../src/services/learning/website-progress.js";
import { AccountError, clearSession, readSession, readSnapshot, saveSession, signIn } from "./client.mjs";

const LANGUAGE_KEY = "yozi.website.language";
const copy = {
  zh: {
    titleSignIn: "登录 · Yozi",
    titleProgress: "我的学习进度 · Yozi",
    switchTo: "切换到英语",
    required: "请输入邮箱和密码。",
    credentials: "邮箱或密码不对，请检查后重新输入。",
    email: "邮箱格式不对，请检查后重新输入。",
    useApp: "这个账号需要用验证码登录，请在 App 中登录。",
    rate: "尝试次数太多，请一分钟后再试。",
    rateIn: (seconds) => `尝试次数太多，请 ${seconds} 秒后再试。`,
    network: "连不上服务，请检查网络后再试。",
    service: "服务暂时不可用，请稍后再试。",
    expired: "登录已过期，请重新登录。",
    loading: "正在读取学习进度…",
    empty: "还没有同步的学习记录。在 App 中开始学习并同步后，即可在这里查看。",
    snapshotNetwork: "连不上服务，请检查网络后重试。",
    snapshotRate: "读取太频繁，请稍后重试。",
    snapshotService: "学习进度暂时无法读取，请重试。",
    notSet: "未设置",
    none: "暂无",
    noWeakness: "暂无",
    insufficient: "数据不足",
    labels: { 需重练: "需重练", 可改进: "可改进", 达成本次要求: "达成本次要求" },
    accuracy: "正确率",
    attainment: "达成本次要求（AI 评估）",
    dimensions: { 语法: "语法", 搭配: "搭配", 表达: "表达", 任务完成: "任务完成" },
  },
  en: {
    titleSignIn: "Sign in · Yozi",
    titleProgress: "My progress · Yozi",
    switchTo: "Switch to Chinese",
    required: "Enter your email and password.",
    credentials: "That email or password isn't right. Check them and try again.",
    email: "That email doesn't look right. Check it and try again.",
    useApp: "This account signs in with a verification code. Sign in from the App.",
    rate: "Too many attempts. Try again in a minute.",
    rateIn: (seconds) => `Too many attempts. Try again in ${seconds} seconds.`,
    network: "Can't reach the service. Check your connection and try again.",
    service: "The service isn't available right now. Try again soon.",
    expired: "Your session has expired. Sign in again.",
    loading: "Loading your progress…",
    empty: "No synced study records yet. Start studying in the App and sync to see them here.",
    snapshotNetwork: "Can't reach the service. Check your connection and retry.",
    snapshotRate: "Too many requests. Retry in a moment.",
    snapshotService: "Your progress can't be loaded right now. Please retry.",
    notSet: "Not set",
    none: "None yet",
    noWeakness: "None yet",
    insufficient: "Not enough data",
    labels: { 需重练: "Needs rework", 可改进: "Can improve", 达成本次要求: "Met this goal" },
    accuracy: "Accuracy",
    attainment: "Met this goal (AI assessment)",
    dimensions: { 语法: "Grammar", 搭配: "Collocation", 表达: "Expression", 任务完成: "Task completion" },
  },
};
const language = (root) => (root.lang === "en" ? "en" : "zh");

function metricText(metric, t) {
  return metric.status === "insufficient" ? t.insufficient : `${metric.percentage}% · ${metric.numerator} / ${metric.denominator}`;
}
function row(doc, name, value, insufficient) {
  const item = doc.createElement("li");
  const label = doc.createElement("span");
  const result = doc.createElement("span");
  label.textContent = name;
  result.textContent = value;
  if (insufficient) result.dataset.insufficient = "";
  item.append(label, result);
  return item;
}

export function mountAccount({ doc = document, send = (...args) => fetch(...args), storage = sessionStorage, persistent = localStorage } = {}) {
  const root = doc.documentElement;
  const $ = (selector) => doc.querySelector(selector);
  const views = { signin: $('[data-view="signin"]'), progress: $('[data-view="progress"]') };
  const form = $("[data-signin-form]");
  const signInError = $("[data-signin-error]");
  const submit = $("[data-signin-submit]");
  const signOut = $("[data-sign-out]");
  const status = $("[data-progress-status]");
  const retry = $("[data-retry]");
  const content = $("[data-progress-content]");
  const toggle = $("[data-language-toggle]");
  let session = null;
  let progress = null;
  let notice = null; // { target: "signin" | "progress", key, retryAfter }
  let generation = 0;
  let controller = null;

  function setNotice(next) {
    notice = next;
    paintNotice();
  }
  function paintNotice() {
    const t = copy[language(root)];
    const message = notice && (notice.retryAfter && notice.key === "rate" ? t.rateIn(notice.retryAfter) : t[notice.key]);
    const showSignin = notice?.target === "signin";
    const showProgress = notice?.target === "progress";
    signInError.hidden = !showSignin;
    signInError.textContent = showSignin ? message : "";
    status.hidden = !showProgress;
    status.textContent = showProgress ? message : "";
    retry.hidden = !(showProgress && notice.retry);
  }
  function paintProgress() {
    const t = copy[language(root)];
    if (!progress) return;
    const number = (key, value) => {
      const node = $(`[data-stat="${key}"]`);
      node.textContent = value === null ? t.notSet : String(value);
      node.toggleAttribute("data-empty", value === null);
    };
    for (const key of ["studyDays", "answers", "essays", "familiar", "learning"]) number(key, progress[key]);
    number("daysToExam", progress.daysToExam);
    const last = $('[data-stat="lastActivity"]');
    if (progress.lastActivity) {
      last.dateTime = new Date(progress.lastActivity).toISOString();
      last.textContent = new Intl.DateTimeFormat(language(root) === "en" ? "en" : "zh-CN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: progress.timezone,
      }).format(progress.lastActivity);
    } else {
      last.removeAttribute("datetime");
      last.textContent = t.none;
    }
    const weaknesses = $("[data-weaknesses]");
    weaknesses.replaceChildren(
      ...(progress.weaknesses.length ? progress.weaknesses : [null]).map((value) => {
        const item = doc.createElement("li");
        item.textContent = value ?? t.noWeakness;
        if (value === null) item.dataset.empty = "";
        return item;
      }),
    );
    const subjects = $("[data-subjects]");
    subjects.replaceChildren(
      ...progress.learningProgress.subjects.flatMap((subject) => [
        ...(subject.attainment.denominator || subject.dimensions.length
          ? [row(doc, `${subject.label} · ${t.attainment}`, metricText(subject.attainment, t), subject.attainment.status === "insufficient")]
          : []),
        ...(subject.accuracy.denominator || !subject.dimensions.length
          ? [row(doc, `${subject.label} · ${t.accuracy}`, metricText(subject.accuracy, t), subject.accuracy.status === "insufficient")]
          : []),
        ...subject.dimensions.map((dimension) =>
          row(doc, `${subject.label} · ${t.dimensions[dimension.label] ?? dimension.label}`, metricText(dimension, t), dimension.status === "insufficient"),
        ),
      ]),
    );
    const chapters = new Map();
    for (const node of progress.learningProgress.nodes) {
      if (!chapters.has(node.chapter)) chapters.set(node.chapter, []);
      chapters.get(node.chapter).push(node);
    }
    $("[data-nodes]").replaceChildren(
      ...[...chapters].map(([chapter, nodes]) => {
        const group = doc.createElement("div");
        const heading = doc.createElement("h3");
        const list = doc.createElement("ul");
        heading.textContent = chapter;
        list.className = "account-rows";
        list.append(
          ...nodes.map((node) => {
            const insufficient = node.status === "insufficient";
            const label = insufficient ? t.insufficient : (t.labels[node.statusLabel] ?? node.statusLabel);
            const percent = !insufficient && node.accuracy.status === "available" ? ` · ${node.accuracy.percentage}%` : "";
            return row(doc, node.name, label + percent, insufficient);
          }),
        );
        group.append(heading, list);
        return group;
      }),
    );
  }
  function paintLanguage() {
    const lang = language(root);
    const t = copy[lang];
    doc.title = session ? t.titleProgress : t.titleSignIn;
    toggle.setAttribute("aria-label", t.switchTo);
    paintNotice();
    paintProgress();
  }
  function show(view) {
    views.signin.hidden = view !== "signin";
    views.progress.hidden = view !== "progress";
    signOut.hidden = view !== "progress";
  }
  function endSession(next) {
    generation++;
    controller?.abort();
    controller = null;
    clearSession(storage);
    session = null;
    progress = null;
    content.hidden = true;
    for (const selector of ["[data-weaknesses]", "[data-subjects]", "[data-nodes]"]) $(selector).replaceChildren();
    for (const node of doc.querySelectorAll("[data-stat]")) node.textContent = "";
    form.reset();
    show("signin");
    setNotice(next ?? null);
    paintLanguage();
  }
  async function load() {
    const current = ++generation;
    const active = session;
    controller?.abort();
    controller = new AbortController();
    content.hidden = true;
    setNotice({ target: "progress", key: "loading" });
    try {
      const state = await readSnapshot(active, send, { signal: controller.signal });
      if (current !== generation) return;
      progress = websiteProgress(state);
      content.hidden = !progress.hasRecords;
      paintProgress();
      setNotice(progress.hasRecords ? null : { target: "progress", key: "empty" });
    } catch (error) {
      if (current !== generation) return;
      const kind = error instanceof AccountError ? error.kind : "service";
      if (kind === "cancelled") return;
      if (kind === "expired" || kind === "owner") return endSession({ target: "signin", key: "expired" });
      const key = kind === "network" ? "snapshotNetwork" : kind === "rate" ? "snapshotRate" : "snapshotService";
      setNotice({ target: "progress", key, retry: true });
    }
  }
  function open(next) {
    session = next;
    show("progress");
    paintLanguage();
    return load();
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    const email = form.elements.email.value;
    const password = form.elements.password.value;
    if (!email.trim() || !password) return setNotice({ target: "signin", key: "required" });
    const current = ++generation;
    submit.disabled = true;
    setNotice(null);
    try {
      const next = await signIn({ email, password }, send);
      if (current !== generation) return;
      saveSession(storage, next);
      form.reset();
      await open(next);
      $("#progress-title").focus();
    } catch (error) {
      if (current !== generation) return;
      setNotice({ target: "signin", key: error instanceof AccountError ? error.kind : "service", retryAfter: error?.retryAfter });
    } finally {
      submit.disabled = false;
    }
  });
  signOut.addEventListener("click", () => {
    endSession();
    $("#signin-title").focus();
  });
  retry.addEventListener("click", load);
  toggle.addEventListener("click", () => {
    const lang = language(root) === "zh" ? "en" : "zh";
    root.lang = lang === "en" ? "en" : "zh-CN";
    try {
      persistent.setItem(LANGUAGE_KEY, lang);
    } catch {}
    paintLanguage();
  });

  let saved = null;
  try {
    saved = readSession(storage);
  } catch {}
  show(saved ? "progress" : "signin");
  paintLanguage();
  return saved ? open(saved) : Promise.resolve();
}
