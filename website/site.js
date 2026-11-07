(() => {
  const metadata = LOCALE_METADATA;
  const root = document.documentElement;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const languageLink = document.querySelector("[data-language-link]");
  const video = document.querySelector("#hero-video");
  const mediaButton = document.querySelector("[data-media-toggle]");
  const scrub = document.querySelector("[data-hero-scrub]");
  const hero = document.querySelector(".hero");
  const collection = document.querySelector(".collection");
  const collectionStart = document.querySelector("[data-collection-open]");
  const features = document.querySelector(".features");
  const demo = document.querySelector("[data-demo-toggle]");
  const films = [...document.querySelectorAll("[data-feature-film]")];
  const decks = [...document.querySelectorAll("[data-deck-film]")];
  const visibleFilms = new Set();
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
    mediaButton.setAttribute(
      "aria-label",
      lang === "zh"
        ? motionEnabled
          ? "暂停动态效果"
          : "启用动态效果"
        : motionEnabled
          ? "pause motion"
          : "enable motion",
    );
    mediaButton.setAttribute("aria-pressed", String(motionEnabled));
    mediaButton.querySelector(".play-icon").hidden = motionEnabled;
    mediaButton.querySelector(".pause-icon").hidden = !motionEnabled;
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
    languageLink.hreflang = other;
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
  }
  menuButton.addEventListener("click", () => {
    menu.hidden = !menu.hidden;
    menuButton.setAttribute("aria-expanded", String(!menu.hidden));
    updateLabels();
  });
  menu.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) {
      closeMenu();
      menuButton.focus();
    }
  });
  matchMedia("(min-width: 921px)").addEventListener("change", (event) => {
    if (event.matches) closeMenu();
  });

  // Cursor Follow: accumulate relative pointer movement and issue one seek at a time.
  let targetTime = 0,
    isSeeking = false,
    previousX = null;
  function loadHero() {
    if (!video.getAttribute("src")) {
      video.src = video.dataset.src;
      video.load();
    }
  }
  function seekHero() {
    if (!Number.isFinite(video.duration) || isSeeking || Math.abs(video.currentTime - targetTime) <= 0.01)
      return;
    isSeeking = true;
    video.currentTime = Math.min(Math.max(targetTime, 0), Math.max(0, video.duration - 0.001));
  }
  video.addEventListener("loadedmetadata", () => {
    video.pause();
    seekHero();
  });
  video.addEventListener("seeked", () => {
    isSeeking = false;
    scrub.value = Math.round((video.currentTime / video.duration) * 1000);
    seekHero();
  });
  video.addEventListener("error", () => {
    document.querySelector(".media-error").hidden = false;
    scrub.disabled = true;
  });
  document.querySelector("[data-media-retry]").addEventListener("click", () => {
    document.querySelector(".media-error").hidden = true;
    scrub.disabled = false;
    isSeeking = false;
    video.removeAttribute("src");
    loadHero();
  });
  hero.addEventListener(
    "pointermove",
    (event) => {
      if (!motionEnabled || event.pointerType !== "mouse" || event.target.closest("a,button,input")) return;
      const x = event.clientX / innerWidth;
      if (previousX !== null && Number.isFinite(video.duration)) {
        targetTime = Math.min(
          video.duration - 0.001,
          Math.max(0, targetTime + (x - previousX) * 0.8 * video.duration),
        );
        seekHero();
      }
      previousX = x;
    },
    { passive: true },
  );
  hero.addEventListener("pointerleave", () => {
    previousX = null;
  });
  scrub.addEventListener("input", () => {
    loadHero();
    if (Number.isFinite(video.duration)) {
      targetTime = (Number(scrub.value) / 1000) * Math.max(0, video.duration - 0.001);
      seekHero();
    } else
      video.addEventListener(
        "loadedmetadata",
        () => {
          targetTime = (Number(scrub.value) / 1000) * (video.duration - 0.001);
          seekHero();
        },
        { once: true },
      );
  });
  if (motionEnabled) loadHero();

  let collectionChanging = false;
  async function openCollection() {
    if (collectionChanging || !collection.hidden) return;
    collectionChanging = true;
    closeMenu();
    collection.hidden = false;
    collectionStart.setAttribute("aria-expanded", "true");
    if (motionEnabled) {
      hero.querySelector(".hero-copy").animate(
        [
          { transform: "translateY(0)", opacity: 1 },
          { transform: "translateY(150%)", opacity: 0 },
        ],
        { duration: 1000, easing: "cubic-bezier(.16,1,.3,1)" },
      );
      collectionStart.animate(
        [
          { transform: "translateX(-50%) scale(1)", opacity: 1 },
          { transform: "translateX(-50%) scale(0)", opacity: 0 },
        ],
        { duration: 800, easing: "cubic-bezier(.34,1.56,.64,1)" },
      );
      await collection.animate(
        [
          { transform: "translateY(100%)" },
          { transform: "translateY(-1%)", offset: 0.75 },
          { transform: "translateY(0)" },
        ],
        { duration: 850, easing: "cubic-bezier(.16,1,.3,1)" },
      ).finished;
    }
    hero.hidden = true;
    document.querySelector("[data-collection-back]").focus({ preventScroll: true });
    collectionChanging = false;
  }
  async function closeCollection() {
    if (collectionChanging || collection.hidden) return;
    collectionChanging = true;
    hero.hidden = false;
    if (motionEnabled)
      await collection.animate([{ transform: "translateY(0)" }, { transform: "translateY(100%)" }], {
        duration: 600,
        easing: "cubic-bezier(.16,1,.3,1)",
      }).finished;
    collection.hidden = true;
    collectionStart.setAttribute("aria-expanded", "false");
    targetTime = 0;
    previousX = null;
    seekHero();
    decks.forEach((film) => {
      film.pause();
      if (film.readyState) film.currentTime = 0;
    });
    collectionStart.focus({ preventScroll: true });
    collectionChanging = false;
  }
  collectionStart.addEventListener("click", openCollection);
  document.querySelector("[data-collection-back]").addEventListener("click", closeCollection);
  collection.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeCollection();
  });

  function syncFeatureFilms() {
    const active = motionEnabled && features.classList.contains("is-practising") && !document.hidden;
    films.forEach((film) => {
      if (active && visibleFilms.has(film)) {
        if (!film.getAttribute("src")) {
          film.addEventListener(
            "loadedmetadata",
            () => {
              film.currentTime = Number(film.dataset.offset) % film.duration;
            },
            { once: true },
          );
          film.src = film.dataset.src;
        }
        film.play().catch(() => {});
      } else film.pause();
    });
  }
  films.forEach((film) =>
    film
      .closest("[data-feature-card]")
      .querySelector(".feature-still")
      .addEventListener("load", (event) => {
        event.currentTarget.style.opacity = "1";
      }),
  );
  demo.addEventListener("click", () => {
    const active = features.classList.toggle("is-practising");
    demo.setAttribute("aria-pressed", String(active));
    demo.querySelector("[data-before-label]").hidden = active;
    demo.querySelector("[data-after-label]").hidden = !active;
    features.querySelectorAll(".feature-still").forEach((photo) => {
      const next = active ? photo.dataset.nightSrc : photo.dataset.daySrc;
      photo.style.opacity = "0";
      const image = new Image();
      image.onload = () => {
        if (features.classList.contains("is-practising") === active) photo.src = next;
      };
      image.src = next;
    });
    features
      .querySelectorAll(".art-before")
      .forEach((note) => note.setAttribute("aria-hidden", String(active)));
    features
      .querySelectorAll(".art-after")
      .forEach((note) => note.setAttribute("aria-hidden", String(!active)));
    syncFeatureFilms();
  });
  decks.forEach((film) => {
    const card = film.closest(".collection-card");
    const play = () => {
      if (!motionEnabled || document.hidden) return;
      if (!film.getAttribute("src")) film.src = film.dataset.src;
      film.play().catch(() => {});
    };
    const pause = () => {
      film.pause();
      if (film.readyState) film.currentTime = 0;
    };
    card.addEventListener("pointerenter", play);
    card.addEventListener("focus", play);
    card.addEventListener("pointerleave", pause);
    card.addEventListener("blur", pause);
  });
  function fitArtboards() {
    document.querySelectorAll("[data-artboard]").forEach((board) => {
      const card = board.closest("[data-feature-card]");
      board.style.setProperty("--direct-scale", Math.min(card.clientWidth / 660, card.clientHeight / 836));
    });
    const viewport = document.querySelector(".cta-viewport");
    if (innerWidth < 700) {
      viewport.style.height = "";
      viewport.style.setProperty("--canvas-scale", "1");
    } else {
      const scale = Math.min(viewport.clientWidth / 1690, innerHeight / 950);
      viewport.style.setProperty("--canvas-scale", String(scale));
      viewport.style.height = 950 * scale + "px";
    }
  }
  fitArtboards();
  window.addEventListener("resize", fitArtboards, { passive: true });
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const film = entry.target.querySelector("video");
          if (entry.isIntersecting) visibleFilms.add(film);
          else {
            visibleFilms.delete(film);
            film.pause();
          }
        });
        syncFeatureFilms();
      },
      { threshold: 0.05 },
    );
    films.forEach((film) => observer.observe(film.closest("[data-feature-card]")));
    decks.forEach((film) => observer.observe(film.closest(".collection-card")));
  } else films.forEach((film) => visibleFilms.add(film));
  function applyMotion(enabled) {
    motionEnabled = enabled;
    root.classList.toggle("motion-paused", !enabled);
    if (enabled) loadHero();
    else {
      films.concat(decks).forEach((film) => film.pause());
      stopFlow();
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .forEach((animation) => {
          try {
            animation.finish();
          } catch {}
        });
    }
    updateLabels();
    syncFeatureFilms();
  }
  mediaButton.addEventListener("click", () => {
    applyMotion(!motionEnabled);
    try {
      localStorage.setItem("yozi.website.motion", motionEnabled ? "enabled" : "paused");
    } catch {}
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) decks.forEach((film) => film.pause());
    syncFeatureFilms();
  });
  reduced.addEventListener("change", (event) => {
    if (event.matches) applyMotion(false);
  });

  function typewriter(node, delay = 0) {
    if (!motionEnabled) return;
    const text = node.querySelector(`[data-copy="${currentLanguage()}"]`);
    if (!text || text.dataset.revealed) return;
    text.dataset.revealed = "true";
    const value = text.textContent;
    text.setAttribute("aria-label", value);
    text.textContent = "";
    Array.from(value).forEach((char, i) => {
      const part = document.createElement("span");
      part.textContent = char;
      part.setAttribute("aria-hidden", "true");
      text.append(part);
      part.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 160,
        delay: delay + 12 * i,
        fill: "backwards",
      });
    });
  }
  const slides = [...document.querySelectorAll("[data-slide]")],
    authors = [...document.querySelectorAll("[data-author]")];
  const arrows = [...document.querySelectorAll("[data-prev],[data-next]")];
  let slideIndex = 0,
    sliding = false;
  function springFrames(from, to) {
    let x = from,
      velocity = 0;
    const frames = [];
    for (let i = 0; i <= 48; i++) {
      frames.push({ transform: `translateX(${x}px)`, offset: i / 48 });
      const acceleration = -300 * (x - to) - 30 * velocity;
      velocity += acceleration / 60;
      x += velocity / 60;
    }
    frames[frames.length - 1].transform = `translateX(${to}px)`;
    return frames;
  }
  async function moveSlide(direction) {
    if (sliding) return;
    sliding = true;
    arrows.forEach((button) => {
      button.disabled = true;
    });
    const old = slides[slideIndex],
      oldAuthor = authors[slideIndex];
    if (!!motionEnabled) {
      old.animate(springFrames(0, -direction * 100), { duration: 800 });
      oldAuthor.animate(
        [
          { opacity: 1, transform: "translateY(0)" },
          { opacity: 0, transform: "translateY(-10px)" },
        ],
        { duration: 200, fill: "forwards" },
      );
      await old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200 }).finished;
    }
    old.hidden = true;
    oldAuthor.hidden = true;
    old.getAnimations().forEach((animation) => animation.cancel());
    oldAuthor.getAnimations().forEach((animation) => animation.cancel());
    slideIndex = (slideIndex + direction + slides.length) % slides.length;
    const next = slides[slideIndex],
      author = authors[slideIndex];
    next.hidden = false;
    author.hidden = false;
    document.querySelector("[data-slide-number]").textContent = String(slideIndex + 1).padStart(2, "0");
    if (!!motionEnabled) {
      next.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
      author.animate(
        [
          { opacity: 0, transform: "translateY(10px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: 200 },
      );
      typewriter(next.querySelector("blockquote"), 200);
      typewriter(author.querySelector("p"), 500);
      await next.animate(springFrames(direction * 100, 0), { duration: 800 }).finished;
    }
    sliding = false;
    arrows.forEach((button) => {
      button.disabled = false;
    });
  }
  document.querySelector("[data-prev]").addEventListener("click", () => moveSlide(-1));
  document.querySelector("[data-next]").addEventListener("click", () => moveSlide(1));

  document.querySelectorAll(".price-card>.button [data-copy]").forEach((label) => {
    const text = label.textContent;
    label.classList.add("roll-label");
    label.textContent = "";
    const ink = document.createElement("span"),
      echo = document.createElement("span");
    ink.textContent = text;
    echo.textContent = text;
    echo.className = "roll-echo";
    echo.setAttribute("aria-hidden", "true");
    label.append(ink, echo);
  });
  const categories = [...document.querySelectorAll("[data-category]")];
  function fadeUp(element, delay = 0) {
    if (!motionEnabled) return;
    element.animate(
      [
        { opacity: 0, transform: "translateY(24px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 600, delay, easing: "cubic-bezier(.22,1,.36,1)", fill: "backwards" },
    );
  }
  function selectCategory(key) {
    categories.forEach((button) => {
      const active = button.dataset.category === key;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll(".faq-panel").forEach((panel) => {
      panel.hidden = panel.id !== "faq-" + key;
      panel.querySelectorAll("details").forEach((item, i) => {
        item.open = false;
        if (!panel.hidden) fadeUp(item, 150 * i);
      });
    });
  }
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
  document
    .querySelectorAll("[data-faq-link]")
    .forEach((link) => link.addEventListener("click", () => selectCategory(link.dataset.faqLink)));
  document.querySelectorAll(".spotlight").forEach((element) =>
    element.addEventListener(
      "pointermove",
      (event) => {
        const bounds = element.getBoundingClientRect();
        element.style.setProperty("--spot-x", event.clientX - bounds.left + "px");
        element.style.setProperty("--spot-y", event.clientY - bounds.top + "px");
      },
      { passive: true },
    ),
  );
  const flow = document.querySelector(".download-model"),
    scrambles = [...flow.querySelectorAll("[data-scramble]")];
  let flowTimer = null,
    frame = 0;
  function stopFlow() {
    clearInterval(flowTimer);
    flowTimer = null;
    scrambles.forEach((item) => {
      item.textContent = item.dataset.scramble;
    });
  }
  function startFlow() {
    if (flowTimer || !motionEnabled) return;
    frame = 0;
    flowTimer = setInterval(() => {
      frame++;
      scrambles.forEach((item, index) => {
        const baseline = item.dataset.scramble;
        item.textContent = Array.from(baseline)
          .map((char, i) =>
            (frame + index + i) % 8 < 3
              ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[(frame * 3 + index * 5 + i) % 26]
              : char,
          )
          .join("");
      });
    }, 105);
  }
  flow.addEventListener("pointerenter", startFlow);
  flow.addEventListener("focus", startFlow);
  flow.addEventListener("pointerleave", stopFlow);
  flow.addEventListener("blur", stopFlow);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopFlow();
  });
  reduced.addEventListener("change", (event) => {
    if (event.matches) stopFlow();
  });
  if ("IntersectionObserver" in window && !!motionEnabled) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const element = entry.target;
          if (element.matches(".divider"))
            element.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], {
              duration: 800,
              easing: "ease-out",
            });
          else if (element.matches(".principle-carousel"))
            typewriter(slides[0].querySelector("blockquote"), 200);
          else {
            fadeUp(element, Number(element.dataset.delay) || 0);
            if (element.matches(".principles-heading")) typewriter(element.querySelector("h2"));
          }
          observer.unobserve(element);
        });
      },
      { threshold: 0.3 },
    );
    document
      .querySelectorAll(".reveal,.divider,.principle-carousel,.feature-card")
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
