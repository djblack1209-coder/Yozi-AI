<template>
  <main class="public-home">
    <section class="hero" aria-label="Yozi AI · 考研英语写作教练">
      <img
        class="hero__media"
        :src="puddingPortrait"
        width="512"
        height="512"
        fetchpriority="high"
        decoding="async"
        alt=""
      />

      <header id="nav" ref="navRoot" class="nav" :class="{ 'is-open': menuOpen }">
        <a class="nav__logo" href="#" aria-label="Yozi AI 首页" @click.prevent="closeMenu()">
          <img :src="BRAND.mark" alt="" width="48" height="48" />
        </a>
        <BaseButton
          id="navToggle"
          ref="navToggle"
          class="nav__toggle"
          variant="quiet"
          :label="menuOpen ? '关闭菜单' : '打开菜单'"
          :aria-expanded="menuOpen"
          aria-controls="navLinks"
          @tap="menuOpen = !menuOpen"
          ><span></span
        ></BaseButton>
        <ul id="navLinks" class="nav__links" aria-label="学习导航">
          <li v-for="item in navigation" :key="item.id">
            <BaseButton variant="quiet" @tap="open(item.id)">{{ item.label }}</BaseButton>
          </li>
        </ul>
      </header>

      <h1 class="hero__title">
        <span class="sr-only">Yozi AI · 考研英语写作教练</span>
        <svg viewBox="0 0 132 46" shape-rendering="crispEdges" aria-hidden="true">
          <path
            d="M0 0h3v3h-3zM12 0h3v3h-3zM0 3h3v3h-3zM12 3h3v3h-3zM3 6h3v3h-3zM9 6h3v3h-3zM6 9h3v3h-3zM6 12h3v3h-3zM6 15h3v3h-3zM6 18h3v3h-3zM22 0h3v3h-3zM25 0h3v3h-3zM28 0h3v3h-3zM19 3h3v3h-3zM22 3h3v3h-3zM28 3h3v3h-3zM31 3h3v3h-3zM19 6h3v3h-3zM31 6h3v3h-3zM19 9h3v3h-3zM31 9h3v3h-3zM19 12h3v3h-3zM31 12h3v3h-3zM19 15h3v3h-3zM22 15h3v3h-3zM28 15h3v3h-3zM31 15h3v3h-3zM22 18h3v3h-3zM25 18h3v3h-3zM28 18h3v3h-3zM38 0h3v3h-3zM41 0h3v3h-3zM44 0h3v3h-3zM47 0h3v3h-3zM50 0h3v3h-3zM47 3h3v3h-3zM50 3h3v3h-3zM44 6h3v3h-3zM47 6h3v3h-3zM41 9h3v3h-3zM44 9h3v3h-3zM38 12h3v3h-3zM41 12h3v3h-3zM38 15h3v3h-3zM38 18h3v3h-3zM41 18h3v3h-3zM44 18h3v3h-3zM47 18h3v3h-3zM50 18h3v3h-3zM57 0h3v3h-3zM60 0h3v3h-3zM63 0h3v3h-3zM60 3h3v3h-3zM60 6h3v3h-3zM60 9h3v3h-3zM60 12h3v3h-3zM60 15h3v3h-3zM57 18h3v3h-3zM60 18h3v3h-3zM63 18h3v3h-3zM6 25h3v3h-3zM3 28h3v3h-3zM6 28h3v3h-3zM9 28h3v3h-3zM0 31h3v3h-3zM3 31h3v3h-3zM9 31h3v3h-3zM12 31h3v3h-3zM0 34h3v3h-3zM12 34h3v3h-3zM0 37h3v3h-3zM3 37h3v3h-3zM6 37h3v3h-3zM9 37h3v3h-3zM12 37h3v3h-3zM0 40h3v3h-3zM12 40h3v3h-3zM0 43h3v3h-3zM12 43h3v3h-3zM19 25h3v3h-3zM22 25h3v3h-3zM25 25h3v3h-3zM22 28h3v3h-3zM22 31h3v3h-3zM22 34h3v3h-3zM22 37h3v3h-3zM22 40h3v3h-3zM19 43h3v3h-3zM22 43h3v3h-3zM25 43h3v3h-3zM44 25h3v3h-3zM47 25h3v3h-3zM50 25h3v3h-3zM41 28h3v3h-3zM44 28h3v3h-3zM50 28h3v3h-3zM53 28h3v3h-3zM41 31h3v3h-3zM41 34h3v3h-3zM41 37h3v3h-3zM41 40h3v3h-3zM44 40h3v3h-3zM50 40h3v3h-3zM53 40h3v3h-3zM44 43h3v3h-3zM47 43h3v3h-3zM50 43h3v3h-3zM63 25h3v3h-3zM66 25h3v3h-3zM69 25h3v3h-3zM60 28h3v3h-3zM63 28h3v3h-3zM69 28h3v3h-3zM72 28h3v3h-3zM60 31h3v3h-3zM72 31h3v3h-3zM60 34h3v3h-3zM72 34h3v3h-3zM60 37h3v3h-3zM72 37h3v3h-3zM60 40h3v3h-3zM63 40h3v3h-3zM69 40h3v3h-3zM72 40h3v3h-3zM63 43h3v3h-3zM66 43h3v3h-3zM69 43h3v3h-3zM85 25h3v3h-3zM82 28h3v3h-3zM85 28h3v3h-3zM88 28h3v3h-3zM79 31h3v3h-3zM82 31h3v3h-3zM88 31h3v3h-3zM91 31h3v3h-3zM79 34h3v3h-3zM91 34h3v3h-3zM79 37h3v3h-3zM82 37h3v3h-3zM85 37h3v3h-3zM88 37h3v3h-3zM91 37h3v3h-3zM79 40h3v3h-3zM91 40h3v3h-3zM79 43h3v3h-3zM91 43h3v3h-3zM101 25h3v3h-3zM104 25h3v3h-3zM107 25h3v3h-3zM98 28h3v3h-3zM101 28h3v3h-3zM107 28h3v3h-3zM110 28h3v3h-3zM98 31h3v3h-3zM98 34h3v3h-3zM98 37h3v3h-3zM98 40h3v3h-3zM101 40h3v3h-3zM107 40h3v3h-3zM110 40h3v3h-3zM101 43h3v3h-3zM104 43h3v3h-3zM107 43h3v3h-3zM117 25h3v3h-3zM129 25h3v3h-3zM117 28h3v3h-3zM129 28h3v3h-3zM117 31h3v3h-3zM129 31h3v3h-3zM117 34h3v3h-3zM120 34h3v3h-3zM123 34h3v3h-3zM126 34h3v3h-3zM129 34h3v3h-3zM117 37h3v3h-3zM129 37h3v3h-3zM117 40h3v3h-3zM129 40h3v3h-3zM117 43h3v3h-3zM129 43h3v3h-3z"
          />
        </svg>
      </h1>

      <p class="bubble" lang="en">
        Small steps today.<br />Stronger writing tomorrow.<span class="bubble__cursor" aria-hidden="true"></span>
        <svg class="bubble__tail" viewBox="0 0 6 6" shape-rendering="crispEdges" aria-hidden="true">
          <path fill="#e7e7e7" d="M1 0h4v1h-1v1h-1v1h-1v1h-1z" />
          <path fill="#050505" d="M0 0h1v5h-1zM1 4h1v1h-1zM2 3h1v1h-1zM3 2h1v1h-1zM4 1h1v1h-1zM5 0h1v1h-1z" />
        </svg>
      </p>

      <div class="hero__body">
        <p class="hero__lede">
          你的考研英语写作教练。<br />
          每天练一点，一段一段写，学过的按时复习。
        </p>
        <div class="hero__actions">
          <BaseButton class="btn" variant="primary" label="下载 Mac 版" @tap="open('downloads')"
            >下载 Mac 版</BaseButton
          >
          <BaseButton class="link" variant="quiet" label="注册账户" @tap="open('register')">
            注册账户
            <svg viewBox="0 0 5 8" aria-hidden="true"><path d="M.8.8 4 4 .8 7.200" /></svg>
          </BaseButton>
        </div>
        <ul class="hero__stats" aria-label="学习范围">
          <li>考研英语一 / 二</li>
          <li>每日练习</li>
          <li>自己的学习资料</li>
        </ul>
      </div>
    </section>
    <section id="features" class="features-section" aria-labelledby="features-title">
      <h2 id="features-title">把今天的练习，<br />变成明天的进步。</h2>
      <div class="features-grid">
        <article>
          <h3>每天，有题可练。</h3>
          <p>围绕你的目标练搭配、翻译短句与长难句，接着已保存的进度继续学。</p>
        </article>
        <article>
          <h3>写作，一段一段来。</h3>
          <p>英语一、英语二，应用文与大作文。从审题到逐段带写，获得 AI 反馈，再动笔改写。</p>
        </article>
        <article>
          <h3>学过的，再见一面。</h3>
          <p>把句式和搭配存进自己的库，按复习安排再练一次，让积累用到下一篇里。</p>
        </article>
        <article>
          <h3>进步，有迹可循。</h3>
          <p>回看练习、作文与薄弱点。登录官网，查看本人已同步的学习记录。</p>
          <BaseButton class="feature-progress" variant="quiet" @tap="open('progress')">查看学习数据</BaseButton>
        </article>
      </div>
    </section>
    <section id="downloads" class="download-section" aria-label="下载 Yozi AI">
      <div>
        <h2>在 Mac 上，<br />开始今天的学习。</h2>
        <p>接入你自己的 AI API，开始练习与带写。<br />目前仅提供 macOS 版下载。</p>
      </div>
      <article class="download-card">
        <img :src="BRAND.mark" alt="" width="80" height="80" />
        <h3>Yozi AI {{ MAC_DOWNLOAD.version }}</h3>
        <p>{{ MAC_DOWNLOAD.platform }}</p>
        <a :href="MAC_DOWNLOAD.url" download>下载 Mac 版</a
        ><BaseButton variant="quiet" @tap="open('progress')">查看学习数据</BaseButton>
      </article>
    </section>
  </main>
  <footer class="site-footer">
    <a class="footer-brand" href="/" aria-label="Yozi AI 首页"
      ><img :src="BRAND.mark" alt="" width="40" height="40" />Yozi AI</a
    >
    <nav aria-label="网站信息">
      <a href="/#/pages/settings/terms">用户协议</a>
      <a href="/#/pages/settings/privacy">隐私政策</a>
      <a :href="WEBSITE_CONTACT.url">联系我们</a>
    </nav>
    <p>© {{ new Date().getFullYear() }} Yozi AI</p>
  </footer>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { onHide, onShow } from '@dcloudio/uni-app';
import BaseButton from '@/components/base/base-button/base-button.vue';
import { MAC_DOWNLOAD, WEBSITE_CONTACT, WEBSITE_TITLE } from '@/config/website.js';
import { BRAND } from '@/config/brand.js';
import puddingPortrait from '@/assets/brand/mascot-512.webp';

const emit = defineEmits(['open']);
const menuOpen = ref(false);
const navRoot = ref(null);
const navToggle = ref(null);
const reducedMotion = ref(false);
const navigation = [
  { id: 'features', label: '功能' },
  { id: 'downloads', label: '下载 APP' },
  { id: 'progress', label: '学习数据' },
  { id: 'login', label: '登录' },
  { id: 'register', label: '注册' }
];
let motionQuery;
let navigationElement;

function closeMenu(restoreFocus = false) {
  menuOpen.value = false;
  if (restoreFocus) (navToggle.value?.$el || navToggle.value)?.focus?.();
}
function open(target) {
  closeMenu();
  if (target === 'downloads' || target === 'features') {
    document.getElementById(target)?.scrollIntoView?.({ behavior: reducedMotion.value ? 'instant' : 'smooth' });
    return;
  }
  emit('open', target);
}
function onNavigationKeydown(event) {
  if (event.key === 'Escape' && menuOpen.value) {
    event.preventDefault();
    closeMenu(true);
  }
}
function syncMotion() {
  reducedMotion.value = Boolean(motionQuery?.matches);
}
onMounted(() => {
  document.title = WEBSITE_TITLE;
  document.getElementById('website-first-paint')?.remove();
  navigationElement = navRoot.value?.$el || navRoot.value;
  navigationElement?.addEventListener('keydown', onNavigationKeydown);
  motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  motionQuery?.addEventListener('change', syncMotion);
  syncMotion();
});
onHide(() => {
  closeMenu();
});
onShow(() => {
  syncMotion();
});
onBeforeUnmount(() => {
  navigationElement?.removeEventListener('keydown', onNavigationKeydown);
  motionQuery?.removeEventListener('change', syncMotion);
});
</script>

<style scoped>
@font-face {
  font-family: 'IBM Plex Mono';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/public/fonts/IBMPlexMono-Regular.ttf') format('truetype');
}
@font-face {
  font-family: 'IBM Plex Mono';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url('/public/fonts/IBMPlexMono-Medium.ttf') format('truetype');
}
.hero,
.hero *,
.hero *::before,
.hero *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}
.hero {
  /* Nomi reference frame: 982 × 696. Assets are self-hosted for mainland access. */
  --u: clamp(0.8px, min(calc(100vw / 982), calc(100vh / 696)), 1.7px);
  --gutter: calc(var(--u) * 21);
  --ink: #050505;
  --paper: #e7e7e7;
  --vs: max(calc(100vw / 1920), calc(100vh / 1080));
  position: relative;
  height: 100svh;
  min-height: 640px;
  width: 100%;
  overflow: hidden;
  isolation: isolate;
  background: var(--paper);
  color: var(--ink);
  font-family: 'IBM Plex Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
  -webkit-font-smoothing: antialiased;
}
.hero a {
  color: inherit;
  text-decoration: none;
}
.hero__media {
  position: absolute;
  top: 8%;
  right: 4%;
  width: 62%;
  height: 84%;
  object-fit: contain;
  z-index: -1;
  pointer-events: none;
}
.nav {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: calc(var(--u) * 80);
  padding: 0 calc(var(--u) * 23) 0 var(--gutter);
  display: flex;
  align-items: center;
  justify-content: space-between;
  z-index: 2;
}
.nav__logo {
  display: block;
  width: calc(var(--u) * 42);
  height: calc(var(--u) * 42);
}
.nav__logo img {
  display: block;
  width: 100%;
  height: 100%;
}
.nav__links {
  display: flex;
  gap: calc(var(--u) * 25);
  list-style: none;
}
.nav__links :deep(.base-button) {
  min-height: 44px;
  min-width: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--ink);
  box-shadow: none;
  font:
    400 calc(var(--u) * 11)/1 'IBM Plex Mono',
    ui-monospace,
    'SFMono-Regular',
    Menlo,
    Consolas,
    monospace;
  letter-spacing: -0.01em;
  transition: opacity 0.2s;
}
.nav__links :deep(.base-button:hover) {
  opacity: 0.55;
}
.nav__toggle {
  display: none;
}
.hero__title {
  position: absolute;
  top: 23.1%;
  left: calc(var(--u) * 27);
  width: calc(var(--u) * 436);
  line-height: 0;
}
.hero__title svg {
  display: block;
  width: 100%;
  height: auto;
  fill: var(--ink);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  white-space: nowrap;
  clip-path: inset(50%);
}
.hero__body {
  position: absolute;
  left: var(--gutter);
  bottom: 17.4%;
}
.hero__lede {
  font-size: calc(var(--u) * 13.3);
  line-height: 1.8;
  margin-bottom: calc(var(--u) * 46);
}
.hero__actions {
  display: flex;
  align-items: center;
  gap: calc(var(--u) * 17);
}
.hero__actions :deep(.base-button) {
  min-width: 0;
  min-height: 44px;
  height: calc(var(--u) * 31);
  padding: 0 calc(var(--u) * 19);
  border: 0;
  border-radius: calc(var(--u) * 2);
  box-shadow: none;
  font:
    400 calc(var(--u) * 11)/1 'IBM Plex Mono',
    ui-monospace,
    'SFMono-Regular',
    Menlo,
    Consolas,
    monospace;
  white-space: nowrap;
  transition:
    background-color 0.2s,
    transform 0.2s;
}
.hero__actions :deep(.btn) {
  background: var(--ink);
  color: #dcdcda;
}
.hero__actions :deep(.btn:hover) {
  background: #2a2a2a;
  transform: translateY(-1px);
}
.hero__actions :deep(.link) {
  padding: 0;
  gap: calc(var(--u) * 9);
  background: transparent;
  color: var(--ink);
}
.hero__actions :deep(.link .base-button__content) {
  gap: calc(var(--u) * 9);
}
.link svg {
  width: calc(var(--u) * 5);
  height: calc(var(--u) * 8);
  fill: none;
  stroke: currentColor;
  stroke-width: 1.4;
  transition: transform 0.2s;
}
.hero__actions :deep(.link:hover) svg {
  transform: translateX(calc(var(--u) * 3));
}
.hero__stats {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--u) * 8) calc(var(--u) * 14);
  margin-top: calc(var(--u) * 30);
  font-size: calc(var(--u) * 11);
  line-height: 1;
  list-style: none;
}
.hero__stats li {
  white-space: nowrap;
}
.hero__stats li + li::before {
  content: '';
  display: inline-block;
  width: calc(var(--u) * 3);
  height: calc(var(--u) * 3);
  margin-right: calc(var(--u) * 14);
  vertical-align: middle;
  background: var(--ink);
}
.bubble {
  --b: max(2px, calc(var(--u) * 2));
  position: absolute;
  right: var(--gutter);
  top: calc((100vh - 1080 * var(--vs)) * 0.5 + 1080 * var(--vs) * 0.24);
  transform: translateY(calc(-100% - var(--u) * 12));
  padding: calc(var(--u) * 11) calc(var(--u) * 15);
  background: var(--paper);
  box-shadow:
    0 calc(var(--b) * -1) 0 0 var(--ink),
    0 var(--b) 0 0 var(--ink),
    calc(var(--b) * -1) 0 0 0 var(--ink),
    var(--b) 0 0 0 var(--ink);
  font-size: calc(var(--u) * 13.3);
  line-height: calc(var(--u) * 18);
  white-space: nowrap;
  z-index: 1;
}
.bubble__tail {
  position: absolute;
  left: calc(var(--u) * 14);
  top: calc(100% + var(--b) - 1px);
  width: calc(var(--u) * 18);
  height: calc(var(--u) * 18);
  overflow: visible;
}
.bubble__cursor {
  display: inline-block;
  width: 0.55em;
  height: 1.05em;
  margin-left: 0.3em;
  background: var(--ink);
  vertical-align: -0.2em;
  animation: blink 1.06s steps(1) infinite;
}
.hero a:focus-visible,
.hero :deep(button:focus-visible) {
  outline: 2px solid var(--ink);
  outline-offset: 5px;
}
@keyframes blink {
  50% {
    opacity: 0;
  }
}
@media (max-width: 720px) {
  .hero {
    --u: clamp(0.8px, calc(100vw / 400), 1.5px);
    --gutter: calc(var(--u) * 20);
    min-height: calc(var(--u) * 620);
  }
  .hero__media {
    top: 27%;
    right: 0;
    width: 100%;
    height: 50%;
  }
  .nav {
    height: calc(var(--u) * 68);
    padding-right: var(--gutter);
  }
  .nav__logo {
    width: calc(var(--u) * 26);
    height: calc(var(--u) * 26);
  }
  .nav__toggle {
    display: inline-flex;
    min-height: 44px;
    min-width: 44px;
    width: calc(var(--u) * 40);
    height: calc(var(--u) * 40);
    margin-right: calc(var(--u) * -9);
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--ink);
    box-shadow: none;
  }
  .nav__toggle:hover,
  .nav__toggle:active {
    background: transparent;
    box-shadow: none;
    transform: none;
  }
  .nav__toggle span,
  .nav__toggle span::after {
    display: block;
    width: calc(var(--u) * 22);
    height: calc(var(--u) * 2);
    background: currentColor;
    transition: transform 0.25s;
  }
  .nav__toggle span {
    transform: translateY(calc(var(--u) * -3.5));
  }
  .nav__toggle span::after {
    content: '';
    transform: translateY(calc(var(--u) * 7));
  }
  .is-open .nav__toggle span {
    transform: rotate(45deg);
  }
  .is-open .nav__toggle span::after {
    transform: rotate(-90deg);
  }
  .nav__links {
    position: absolute;
    top: 100%;
    left: var(--gutter);
    right: var(--gutter);
    display: block;
    padding: calc(var(--u) * 6) calc(var(--u) * 16);
    border-radius: calc(var(--u) * 2);
    background: var(--ink);
    opacity: 0;
    visibility: hidden;
    transform: translateY(calc(var(--u) * -6));
    transition:
      opacity 0.2s,
      visibility 0.2s,
      transform 0.2s;
  }
  .is-open .nav__links {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
  }
  .nav__links :deep(.base-button) {
    display: block;
    width: 100%;
    min-height: 44px;
    padding: calc(var(--u) * 14) 0;
    font-size: calc(var(--u) * 14);
    color: #ececea;
    text-align: left;
  }
  .nav__links li + li {
    border-top: 1px solid rgba(255, 255, 255, 0.14);
  }
  .nav__links :deep(button:focus-visible) {
    outline-color: #ececea;
    outline-offset: 2px;
  }
  .hero__title {
    top: calc(var(--u) * 92);
    left: var(--gutter);
    width: min(calc(100% - 2 * var(--gutter)), calc(var(--u) * 396));
  }
  .hero__body {
    right: var(--gutter);
    bottom: calc(var(--u) * 36);
  }
  .hero__lede {
    font-size: calc(var(--u) * 14);
    line-height: calc(var(--u) * 20);
    margin-bottom: calc(var(--u) * 24);
    max-width: 26em;
  }
  .hero__lede br {
    display: none;
  }
  .hero__actions :deep(.base-button) {
    height: calc(var(--u) * 42);
    min-height: 44px;
    padding: 0 calc(var(--u) * 22);
    font-size: calc(var(--u) * 13);
  }
  .hero__actions :deep(.link) {
    padding: 0;
  }
  .hero__stats {
    margin-top: calc(var(--u) * 20);
    font-size: calc(var(--u) * 12);
  }
  .bubble {
    left: auto;
    right: var(--gutter);
    top: 27%;
    transform: translateY(calc(var(--u) * 4));
    font-size: calc(var(--u) * 12);
    line-height: calc(var(--u) * 16);
    padding: calc(var(--u) * 9) calc(var(--u) * 12);
  }
}
@media (max-width: 720px) and (max-height: 520px) {
  .hero__media {
    top: 0;
    width: 62%;
    height: 100%;
    object-position: 100% 50%;
  }
  .hero__title {
    width: calc(var(--u) * 230);
    top: calc(var(--u) * 70);
  }
  .bubble {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .bubble__cursor {
    animation: none;
  }
  .hero :deep(button),
  .hero svg,
  .nav__links,
  .nav__toggle span,
  .nav__toggle span::after {
    transition: none;
  }
}
</style>

<style scoped>
.public-home,
.site-footer {
  color: #161615;
  background: #f6f6f3;
  font-family:
    'IBM Plex Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, 'PingFang SC', 'Microsoft YaHei', monospace;
}
.features-section {
  padding: 100px max(32px, calc((100vw - 1100px) / 2));
}
.features-section h2,
.download-section h2 {
  font-family: inherit;
  font-size: clamp(30px, 3.5vw, 48px);
  font-weight: 500;
  line-height: 1.4;
  letter-spacing: -0.03em;
  margin: 0 0 48px;
}
.features-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 48px 80px;
}
.features-grid article {
  border-top: 1px solid #c6c6bf;
  padding-top: 24px;
}
.features-grid h3 {
  font-family: inherit;
  font-size: 22px;
  font-weight: 500;
  margin: 0 0 16px;
}
.features-grid p {
  color: #52524d;
  font-size: 15px;
  line-height: 1.9;
  max-width: 35em;
  margin: 0;
}
.feature-progress {
  margin-top: 12px;
  padding-left: 0;
  color: #161615;
  font: inherit;
  text-decoration: underline;
  text-underline-offset: 5px;
}
.site-footer {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 24px 40px;
  padding: 36px max(32px, calc((100vw - 1100px) / 2));
  border-top: 1px solid #c6c6bf;
  font-size: 12px;
}
.site-footer a {
  color: inherit;
  text-decoration: none;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
}
.footer-brand {
  gap: 10px;
  margin-right: auto;
  font-size: 16px;
}
.site-footer nav {
  display: flex;
  gap: 24px;
}
.site-footer p {
  margin: 0;
  color: #52524d;
}
.site-footer a:hover {
  text-decoration: underline;
  text-underline-offset: 5px;
}
.public-home :deep(a:focus-visible),
.site-footer a:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 5px;
}
.public-home ::selection,
.site-footer ::selection {
  color: #f6f6f3;
  background: #161615;
}
.download-section {
  display: grid;
  grid-template-columns: 1fr 360px;
  align-items: center;
  gap: 80px;
  padding: 110px max(32px, calc((100vw - 1100px) / 2));
  border-top: 1px solid #c6c6bf;
  background: #e7e7e7;
  color: #161615;
  font-family: 'IBM Plex Mono', monospace;
}
.download-section p {
  font-size: 13px;
  line-height: 1.8;
  color: #52524d;
}
.download-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  background: white;
  border: 1px solid #deded7;
  border-radius: 4px;
  padding: 32px;
}
.download-card h3 {
  font-family: inherit;
  font-size: 20px;
  font-weight: 500;
  margin: 24px 0 8px;
}
.download-card a {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 48px;
  background: #111110;
  color: #fff;
  text-decoration: none;
  border-radius: 2px;
  font-size: 14px;
  margin: 20px 0 12px;
}
.download-card :deep(.base-button) {
  align-self: center;
  color: #56564f;
  font-size: 13px;
}
.download-card a:focus-visible {
  outline: 2px solid #686c51;
  outline-offset: 4px;
}
@media (max-width: 720px) {
  .features-section {
    padding: 64px 24px;
  }
  .features-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 32px;
  }
  .site-footer {
    padding: 28px 24px;
    gap: 16px;
  }
  .site-footer nav {
    width: 100%;
    gap: 24px;
  }
  .download-section {
    grid-template-columns: minmax(0, 1fr);
    padding: 64px 24px;
    gap: 32px;
  }
  .download-card {
    padding: 28px;
  }
}
</style>
