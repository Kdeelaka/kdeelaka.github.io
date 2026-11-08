/* 湯宿 しじま: scroll, seasons, room photos and the demo booking form. */

(() => {
  'use strict';

  const $ = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => [...p.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

  // The story starts at the closed shoji, so a reload starts at the top.
  if ('scrollRestoration' in history && !location.hash) {
    history.scrollRestoration = 'manual';
    scrollTo(0, 0);
  }

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile = matchMedia('(max-width: 760px), (pointer: coarse)').matches;

  const MENUS = {
    spring: ['桜鱒の木の芽焼き', '筍と若布の炊き合わせ', '菜の花の辛子和え', '桜餅と抹茶'],
    summer: ['鮎の塩焼き', '冷やし賀茂茄子', '鱧の湯引き　梅肉添え', '水羊羹'],
    autumn: ['松茸の土瓶蒸し', '秋刀魚の炭火焼き', '栗ご飯', '柿と胡桃の白和え'],
    winter: ['蟹すき鍋', '鰤大根', '蕪の風呂吹き', '柚子のシャーベット'],
  };
  const NAMES = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };

  /* Scene */

  const canvas = $('#scene');
  const scene = window.RyokanScene ? window.RyokanScene.create(canvas, { mobile, reduce }) : null;
  if (!scene) document.documentElement.classList.add('no-gl');

  const month = new Date().getMonth() + 1;
  const today = month >= 3 && month <= 5 ? 'spring' : month <= 8 && month >= 6 ? 'summer' : month >= 9 && month <= 11 ? 'autumn' : 'winter';

  /* Room photos, rendered from the scene once the season has settled. */

  const photos = $$('.room__photo');
  let photoTimer = 0;
  function paintPhotos(delay) {
    if (!scene) return;
    clearTimeout(photoTimer);
    photoTimer = setTimeout(() => photos.forEach((c) => scene.snapshot(c.dataset.view, c)), delay);
  }

  /* Seasons */

  const menuList = $('#menu-list');
  const menuSeason = $('#menu-season');

  function setSeason(name, instant = false) {
    document.body.dataset.season = name;
    $$('.seasons button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.season === name)));
    if (scene) scene.setSeason(name, instant);
    menuSeason.textContent = `${NAMES[name]}の献立`;
    menuList.classList.remove('is-changing');
    menuList.replaceChildren(...MENUS[name].map((dish) => {
      const li = document.createElement('li');
      li.textContent = dish;
      return li;
    }));
    if (!instant) {
      void menuList.offsetWidth;
      menuList.classList.add('is-changing');
    }
    paintPhotos(instant ? 300 : 1700);
  }

  $$('.seasons button').forEach((b) => b.addEventListener('click', () => setSeason(b.dataset.season)));
  setSeason(today, true);

  /* Scroll story */

  const story = $('#story');
  const beats = $$('.beat').map((node) => ({ node, from: Number(node.dataset.from), to: Number(node.dataset.to) }));
  const cue = $('#cue');
  const FADE = 0.035;

  function storyProgress() {
    const rect = story.getBoundingClientRect();
    return clamp(-rect.top / (rect.height - innerHeight));
  }

  function onScroll() {
    const p = storyProgress();
    if (scene) scene.setProgress(p);
    beats.forEach((b) => {
      const o = Math.min(clamp((p - b.from) / FADE + 1), clamp((b.to - p) / FADE));
      const inView = story.getBoundingClientRect().bottom > innerHeight * 0.5;
      const value = inView ? o : 0;
      b.node.style.opacity = value.toFixed(3);
      b.node.classList.toggle('is-on', value > 0.01);
      if (!reduce) b.node.style.transform = `translateY(calc(-46% + ${((1 - value) * 14).toFixed(1)}px))`;
    });
    cue.classList.toggle('is-gone', p > 0.02);
  }

  // Lenis smooths the wheel; ScrollTrigger keeps in step with it. Without either, plain scroll works.
  if (!reduce && window.Lenis) {
    const lenis = new window.Lenis({ lerp: 0.085, smoothWheel: true });
    window.ryokanLenis = lenis;
    if (window.gsap && window.ScrollTrigger) {
      window.gsap.registerPlugin(window.ScrollTrigger);
      lenis.on('scroll', window.ScrollTrigger.update);
      window.gsap.ticker.add((t) => lenis.raf(t * 1000));
      window.gsap.ticker.lagSmoothing(0);
      window.ScrollTrigger.create({ trigger: story, start: 'top top', end: 'bottom bottom', onUpdate: onScroll });
    } else {
      const loop = (t) => { lenis.raf(t); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }
    lenis.on('scroll', onScroll);
    $$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
      const target = $(a.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target, { offset: a.getAttribute('href') === '#top' ? 0 : -80 });
    }));
  }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  onScroll();

  // Stop drawing once the content fully covers the scene.
  if (scene) {
    const rooms = $('#rooms');
    const watch = () => scene.setActive(rooms.getBoundingClientRect().top > 0);
    addEventListener('scroll', watch, { passive: true });
    watch();
    scene.start();
  }

  // Hero arrival: the title settles once, nothing else animates on its own.
  if (!reduce && window.gsap) {
    window.gsap.from('.beat--hero > *', { opacity: 0, y: 18, duration: 1.4, ease: 'power2.out', stagger: 0.18, delay: 0.2 });
  }

  /* Demo booking form: checks the fields, never sends anything. */

  const form = $('#reserve-form');
  const status = $('#reserve-status');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    let first = null;
    $$('[required]', form).forEach((input) => {
      const bad = !input.value.trim();
      input.setAttribute('aria-invalid', String(bad));
      if (bad && !first) first = input;
    });
    if (first) {
      status.textContent = '未入力の項目があります。赤い枠の欄を入力してください。';
      first.focus();
      return;
    }
    status.textContent = 'ありがとうございます。これはコンセプト作品なので、内容は送信されていません。実際のサイトでは、このリクエストが宿に届きます。';
  });
  $$('[required]', form).forEach((input) => input.addEventListener('input', () => input.setAttribute('aria-invalid', 'false')));
})();
