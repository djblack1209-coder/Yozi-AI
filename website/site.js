(() => {
  const metadata = LOCALE_METADATA;
  const root = document.documentElement;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const languageLink = document.querySelector("[data-language-link]");
  const heroStage = document.querySelector("[data-hero-stage]");
  const heroPulse = document.querySelector("[data-hero-pulse]");
  const video = document.querySelector("#hero-video");
  const mediaButton = document.querySelector("[data-media-toggle]");
  const scrub = document.querySelector("[data-hero-scrub]");
  const inkSurface = document.querySelector("[data-ink-surface]");
  const inkToggle = document.querySelector("[data-ink-toggle]");
  const trail = document.querySelector("[data-ink-trail]");
  const collection = document.querySelector(".collection");
  const collectionStart = document.querySelector("[data-collection-open]");
  const collectionBack = document.querySelector("[data-collection-back]");
  const preview = document.querySelector(".study-preview");
  const features = document.querySelector(".features");
  const demo = document.querySelector("[data-demo-toggle]");
  const films = [...document.querySelectorAll("video[data-src]")];
  const visibleFilms = new Set();
  const mediaError = document.querySelector(".media-error");
  const particles = [];
  let inkOpen = false;
  let previousPoint = null;
  let paintFrame = 0;
  let requestedFrame = null;
  let lastHeroPulse = -Infinity;
  let motionEnabled = !reduced.matches;
  try {
    if (localStorage.getItem("yozi.website.motion") === "paused") motionEnabled = false;
  } catch {}
  root.classList.add("js");
  root.classList.toggle("motion-paused", !motionEnabled);
  const currentLanguage = () => (root.lang === "en" ? "en" : "zh");

  const macCard = document.querySelector(".mac-card");
  const copyLink = macCard.querySelector("[data-copy-link]");
  const copyFallback = macCard.querySelector("[data-copy-fallback]");
  const copySuccess = macCard.querySelector("[data-copy-success]");
  const copyManually = macCard.querySelector("[data-copy-manually]");
  // Embedded browsers control external navigation through their own menus.
  const inAppBrowser = /MicroMessenger|xhsdiscover|XiaoHongShu|Aweme|Douyin|Weibo|AlipayClient|DingTalk|\bQQ\/|Instagram|FBAN\/|FBAV\/|;\s*wv\b/i;
  if (inAppBrowser.test(navigator.userAgent)) {
    macCard.dataset.inAppBrowser = "";
    macCard.querySelector(".download-mac").removeAttribute("href");
    macCard.querySelector("[data-download-title]").hidden = true;
    macCard.querySelector("#gatekeeper-hint").hidden = true;
    macCard.querySelector("[data-open-in-browser]").hidden = false;
  }
  copyLink.hidden = false;
  copyLink.addEventListener("click", async () => {
    const url = new URL(`/${currentLanguage()}/#download`, location.origin).href;
    copySuccess.hidden = true;
    try {
      await navigator.clipboard.writeText(url);
      copySuccess.hidden = false;
      copyManually.hidden = true;
      copyFallback.hidden = true;
    } catch {
      copyFallback.value = url;
      copyManually.hidden = false;
      copyFallback.hidden = false;
      copyFallback.focus();
      copyFallback.select();
    }
  });

  function updateLabels() {
    const lang = currentLanguage();
    document
      .querySelectorAll("[data-label-zh]")
      .forEach((el) => el.setAttribute("aria-label", el.dataset[lang === "zh" ? "labelZh" : "labelEn"]));
    mediaButton.setAttribute("aria-checked", String(motionEnabled));
    const menu = document.querySelector(".menu-button");
    menu.setAttribute(
      "aria-label",
      lang === "zh"
        ? menu.getAttribute("aria-expanded") === "true"
          ? "关闭导航"
          : "打开导航"
        : menu.getAttribute("aria-expanded") === "true"
          ? "close navigation"
          : "open navigation",
    );
  }
  function applyLanguage(lang, updateAddress = false) {
    root.lang = lang === "en" ? "en" : "zh-CN";
    document.title = metadata[lang].title;
    document.querySelector('meta[name="description"]').content = metadata[lang].description;
    document.querySelector('meta[property="og:title"]').content = metadata[lang].title;
    document.querySelector('meta[property="og:description"]').content = metadata[lang].description;
    document.querySelector('meta[property="og:locale"]').content = lang === "zh" ? "zh_CN" : "en_US";
    const other = lang === "zh" ? "en" : "zh";
    languageLink.href = `/${other}/${location.search}${location.hash}`;
    languageLink.hreflang = other === "zh" ? "zh-CN" : "en";
    if (updateAddress) history.replaceState(null, "", `/${lang}/${location.search}${location.hash}`);
    const canonical = "https://yozi.bot.cd" + location.pathname;
    document.querySelector('link[rel="canonical"]').href = canonical;
    document.querySelector('meta[property="og:url"]').content = canonical;
    updateLabels();
  }
  applyLanguage(currentLanguage());
  languageLink.addEventListener("click", (event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const lang = currentLanguage() === "zh" ? "en" : "zh";
    try {
      localStorage.setItem("yozi.website.language", lang);
    } catch {}
    applyLanguage(lang, true);
  });
  window.addEventListener("popstate", () =>
    applyLanguage(location.pathname.startsWith("/en/") ? "en" : "zh"),
  );

  const menuButton = document.querySelector(".menu-button");
  const menu = document.querySelector("#mobile-navigation");
  function closeMenu() {
    menu.hidden = true;
    menuButton.setAttribute("aria-expanded", "false");
    updateLabels();
    menuButton.querySelector(".menu-bars").hidden = false;
    menuButton.querySelector(".menu-close").hidden = true;
  }
  menuButton.addEventListener("click", () => {
    if (!menu.hidden) {
      closeMenu();
      return;
    }
    menu.hidden = false;
    menuButton.setAttribute("aria-expanded", "true");
    menuButton.querySelector(".menu-bars").hidden = true;
    menuButton.querySelector(".menu-close").hidden = false;
    updateLabels();
  });
  menu.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) {
      closeMenu();
      menuButton.focus();
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (!menu.hidden && !event.target.closest(".mast")) closeMenu();
  });
  matchMedia("(min-width: 1025px)").addEventListener("change", (event) => {
    if (event.matches) closeMenu();
  });

  function loadFilm(film) {
    if (!film.hasAttribute("src")) film.src = film.dataset.src;
  }

  function syncFilms() {
    for (const film of films) {
      let play = motionEnabled && visibleFilms.has(film) && !document.hidden;
      if (film === video) play &&= requestedFrame === null && (inkOpen || particles.length > 0);
      if (film.hasAttribute("data-feature-film")) play &&= features.classList.contains("is-practising");
      if (film.hasAttribute("data-deck-film")) play &&= film.closest("a").matches(":hover, :focus-within");
      if (play) {
        loadFilm(film);
        film.play().catch(() => {});
      } else {
        film.pause();
        delete film.dataset.playing;
      }
    }
  }

  for (const film of films) {
    film.addEventListener("playing", () => { film.dataset.playing = ""; });
    if (film.hasAttribute("data-feature-film")) {
      film.addEventListener("loadedmetadata", () => {
        if (film.duration > 0) film.currentTime = Number(film.dataset.offset) % film.duration;
      });
    }
    if (film.hasAttribute("data-deck-film")) {
      for (const event of ["pointerenter", "pointerleave", "focus", "blur"]) {
        film.closest("a").addEventListener(event, syncFilms);
      }
    }
  }
  if ("IntersectionObserver" in window) {
    const visibility = new IntersectionObserver((entries) => {
      for (const { target, isIntersecting } of entries) {
        if (target === heroStage) {
          heroStage.toggleAttribute("data-offscreen", !isIntersecting);
          continue;
        }
        if (isIntersecting) visibleFilms.add(target);
        else visibleFilms.delete(target);
      }
      syncFilms();
    }, { threshold: 0.05 });
    films.forEach((film) => visibility.observe(film));
    visibility.observe(heroStage);
  } else {
    films.filter((film) => film === video || film.matches(".hero-opening-film,[data-feature-film]"))
      .forEach((film) => visibleFilms.add(film));
  }

  function rippleHero(event) {
    if (!motionEnabled || event.target.closest("a,button")) return;
    if (event.type === "pointermove" && (event.pointerType === "touch" || event.timeStamp - lastHeroPulse < 310)) return;
    const bounds = heroStage.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    if (x < bounds.width * .4) return;
    lastHeroPulse = event.timeStamp;
    heroPulse.style.left = `${x}px`;
    heroPulse.style.top = `${event.clientY - bounds.top}px`;
    heroPulse.getAnimations().forEach((animation) => animation.cancel());
    heroPulse.animate([
      { opacity: .75, transform: "translate(-50%, -50%) scale(.12) rotate(-9deg)" },
      { opacity: 0, transform: "translate(-50%, -50%) scale(2.5) rotate(16deg)" }
    ], { duration: 1200, easing: "cubic-bezier(.16,1,.3,1)" });
  }
  const heroOpening = heroStage.parentElement;
  heroOpening.addEventListener("pointermove", rippleHero, { passive: true });
  heroOpening.addEventListener("pointerdown", rippleHero, { passive: true });

  // Keep a single seek in flight, including when the range changes before metadata loads.
  function seekScene() {
    if (requestedFrame === null || !Number.isFinite(video.duration) || video.seeking) return;
    const target = requestedFrame * Math.max(0, video.duration - 0.001);
    if (Math.abs(video.currentTime - target) > 0.008) video.currentTime = target;
  }
  video.addEventListener("loadedmetadata", seekScene);
  video.addEventListener("seeked", seekScene);
  video.addEventListener("timeupdate", () => {
    if (requestedFrame === null && video.duration > 0) scrub.value = Math.round(1000 * video.currentTime / video.duration);
  });
  video.addEventListener("error", () => {
    mediaError.hidden = false;
    scrub.disabled = true;
  });
  document.querySelector("[data-media-retry]").addEventListener("click", () => {
    mediaError.hidden = true;
    scrub.disabled = false;
    video.load();
    syncFilms();
  });

  function clearTrail() {
    cancelAnimationFrame(paintFrame);
    paintFrame = 0;
    previousPoint = null;
    particles.length = 0;
    trail.replaceChildren();
  }
  function setInkOpen(open) {
    inkOpen = open;
    inkSurface.toggleAttribute("data-ink-open", open);
    inkToggle.setAttribute("aria-pressed", String(open));
    inkToggle.querySelectorAll("[data-reveal-label]").forEach((label) => { label.hidden = open; });
    inkToggle.querySelectorAll("[data-paper-label]").forEach((label) => { label.hidden = !open; });
    if (!open) requestedFrame = null;
    clearTrail();
    syncFilms();
  }
  inkToggle.addEventListener("click", () => setInkOpen(!inkOpen));
  scrub.addEventListener("input", () => {
    requestedFrame = Number(scrub.value) / 1000;
    setInkOpen(true);
    loadFilm(video);
    seekScene();
  });

  // SVG blur and alpha threshold join the shrinking stamps into liquid edges.
  function stamp(x, y, radius, stretch, angle, drift = 0) {
    if (particles.length >= 42) particles.shift().element.remove();
    const element = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
    element.setAttribute("cx", x);
    element.setAttribute("transform", "rotate(" + angle + " " + x + " " + y + ")");
    trail.append(element);
    particles.push({ element, y, radius, stretch, drift, born: performance.now() });
  }
  function paintInk(now) {
    for (let index = particles.length - 1; index >= 0; index--) {
      const particle = particles[index];
      const age = Math.max(0, (now - particle.born) / 1500);
      if (age >= 1) {
        particle.element.remove();
        particles.splice(index, 1);
        continue;
      }
      const radius = particle.radius * (1 - age) ** .7;
      particle.element.setAttribute("cy", particle.y + particle.drift * age * age);
      particle.element.setAttribute("rx", radius * particle.stretch);
      particle.element.setAttribute("ry", radius);
    }
    if (particles.length) paintFrame = requestAnimationFrame(paintInk);
    else {
      paintFrame = 0;
      syncFilms();
    }
  }
  function traceInk(event) {
    if (!motionEnabled || inkOpen || (event.pointerType === "touch" && !event.buttons)) return;
    const bounds = inkSurface.getBoundingClientRect();
    const x = event.clientX - bounds.left, y = event.clientY - bounds.top;
    const from = previousPoint || { x, y };
    const dx = x - from.x, dy = y - from.y;
    const distance = Math.hypot(dx, dy);
    if (previousPoint && distance < 2) return;
    previousPoint = { x, y };
    const speed = Math.min(distance / 56, 1);
    const radius = Math.max(27, Math.min(60, bounds.width * .054)) * (.76 + speed * .66);
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    const steps = Math.max(1, Math.min(9, Math.ceil(distance / (radius * .6))));
    for (let step = 1; step <= steps; step++) {
      const amount = step / steps;
      stamp(from.x + dx * amount, from.y + dy * amount, radius, 1 + speed * .45, angle);
    }
    if (speed > .38) {
      stamp(x - dy * .8, y + dx * .6, radius * .37, 1, 0, radius * 1.6);
      stamp(x + dy * .45, y - dx * .8, radius * .24, 1, 0, radius * 2.1);
    }
    if (!paintFrame) {
      paintFrame = requestAnimationFrame(paintInk);
      syncFilms();
    }
  }
  inkSurface.addEventListener("pointermove", traceInk, { passive: true });
  inkSurface.addEventListener("pointerdown", traceInk, { passive: true });
  for (const event of ["pointerleave", "pointerup", "pointercancel"]) {
    inkSurface.addEventListener(event, () => { previousPoint = null; });
  }

  function setCollection(open) {
    collection.hidden = !open;
    preview.hidden = open;
    collectionStart.setAttribute("aria-expanded", String(open));
    fadeUp(open ? collection : preview);
    (open ? collectionBack : collectionStart).focus();
    syncFilms();
  }
  collectionStart.addEventListener("click", () => setCollection(collection.hidden));
  collectionBack.addEventListener("click", () => setCollection(false));
  collection.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setCollection(false);
  });

  demo.addEventListener("click", () => {
    const active = features.classList.toggle("is-practising");
    demo.setAttribute("aria-pressed", String(active));
    demo.querySelector("[data-before-label]").hidden = active;
    demo.querySelector("[data-after-label]").hidden = !active;
    features.querySelectorAll(".feature-still").forEach((photo) => {
      photo.src = active ? photo.dataset.nightSrc : photo.dataset.daySrc;
    });
    features.querySelectorAll(".art-before")
      .forEach((note) => note.setAttribute("aria-hidden", String(active)));
    features.querySelectorAll(".art-after")
      .forEach((note) => note.setAttribute("aria-hidden", String(!active)));
    syncFilms();
  });

  function applyMotion(enabled) {
    motionEnabled = enabled;
    root.classList.toggle("motion-paused", !enabled);
    if (!enabled) {
      clearTrail();
      document.getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .forEach((animation) => { try { animation.finish(); } catch {} });
    }
    updateLabels();
    syncFilms();
  }
  mediaButton.addEventListener("click", () => {
    applyMotion(!motionEnabled);
    try {
      localStorage.setItem("yozi.website.motion", motionEnabled ? "enabled" : "paused");
    } catch {}
  });
  document.addEventListener("visibilitychange", () => {
    heroStage.toggleAttribute("data-tab-hidden", document.hidden);
    if (document.hidden) clearTrail();
    syncFilms();
  });
  reduced.addEventListener("change", (event) => {
    if (event.matches) applyMotion(false);
  });

  const slides = [...document.querySelectorAll("[data-slide]")];
  const slideNumber = document.querySelector("[data-slide-number]");
  let slideIndex = 0;
  function moveSlide(direction) {
    slides[slideIndex].getAnimations().forEach((animation) => animation.cancel());
    slides[slideIndex].hidden = true;
    slideIndex = (slideIndex + direction + slides.length) % slides.length;
    const next = slides[slideIndex];
    next.hidden = false;
    slideNumber.textContent = String(slideIndex + 1).padStart(2, "0");
    fadeUp(next);
  }
  document.querySelector("[data-prev]").addEventListener("click", () => moveSlide(-1));
  document.querySelector("[data-next]").addEventListener("click", () => moveSlide(1));

  const categories = [...document.querySelectorAll("[data-category]")];
  const faqPanels = categories.map((button) => {
    const panel = document.getElementById(button.getAttribute("aria-controls"));
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", button.id);
    panel.tabIndex = -1;
    return panel;
  });
  function fadeUp(element, delay = 0) {
    if (!motionEnabled) return;
    element.animate(
      [
        { opacity: 0, transform: "translateY(10px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 280, delay, easing: "cubic-bezier(.22,1,.36,1)", fill: "backwards" },
    );
  }
  function selectCategory(key) {
    categories.forEach((button) => {
      const active = button.dataset.category === key;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    faqPanels.forEach((panel) => { panel.hidden = panel.id !== "faq-" + key; });
  }
  function selectLinkedCategory() {
    const linked = categories.find((button) => location.hash === "#faq-" + button.dataset.category);
    if (linked) selectCategory(linked.dataset.category);
  }
  selectCategory(categories[0].dataset.category);
  selectLinkedCategory();
  window.addEventListener("hashchange", selectLinkedCategory);
  categories.forEach((button, index) => {
    button.addEventListener("click", () => selectCategory(button.dataset.category));
    button.addEventListener("keydown", (event) => {
      let target;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") target = (index + 1) % categories.length;
      if (event.key === "ArrowLeft" || event.key === "ArrowUp")
        target = (index - 1 + categories.length) % categories.length;
      if (event.key === "Home") target = 0;
      if (event.key === "End") target = categories.length - 1;
      if (target === undefined) return;
      event.preventDefault();
      categories[target].click();
      categories[target].focus();
    });
  });
  document.querySelectorAll("[data-faq-link]").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      selectCategory(link.dataset.faqLink);
      if (location.hash !== link.hash) history.pushState(null, "", link.hash);
      const panel = document.getElementById(link.hash.slice(1));
      panel.focus({ preventScroll: true });
      panel.scrollIntoView();
    });
  });
  if ("IntersectionObserver" in window && motionEnabled) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting || !motionEnabled) return;
          const element = entry.target;
          if (element.matches(".download-media")) {
            element.animate([{ transform: "scale(1.035)" }, { transform: "scale(1)" }], {
              duration: 650,
              easing: "cubic-bezier(.22,1,.36,1)",
            });
          } else {
            fadeUp(element, Number(element.dataset.delay) || 0);
          }
          observer.unobserve(element);
        });
      },
      { threshold: 0.3 },
    );
    document
      .querySelectorAll(".reveal,.feature-card,.download-media")
      .forEach((element) => observer.observe(element));
  }
  if (location.protocol !== "file:" && "serviceWorker" in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        if (registrations.some((registration) => registration.scope === location.origin + "/"))
          return navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      })
      .catch(() => {});
  }
})();
