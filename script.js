/* ディーラカ
   Plain JavaScript. GSAP, ScrollTrigger and Lenis load from the CDN tags in index.html.
   The film scenes are raw WebGL2, with no 3D library.

   1. Settings        5. Contact form        9. Scene players
   2. Portfolio       6. Portfolio browser   10. Scroll, type and motion
   3. Helpers         7. Film engine         11. Start
   4. Kinetic text    8. Film scenes
*/

(() => {
  'use strict';

  /* 1. Settings: everything you are likely to change. */

  const SITE = {
    phone: {
      display: '070-6693-1812',
      tel: '+817066931812',
    },

    // Paste your LINE add-friend link here and the LINE button appears.
    lineUrl: 'https://line.me/ti/p/7u29Cx8vdb',

    // Your SSGform URL, such as 'https://ssgform.com/s/AbcDeFgHiJkL'. Until this is
    // set, the form says so plainly and offers phone and SMS instead.
    formEndpoint: 'https://ssgform.com/s/T8Xm3jSZbqxW',

    // Scene clips, made in Google Flow. A scene with media set plays it in place of the 3D stand-in.
    // Phones use the sequence when there is one, because iOS seeks video slowly.
    scenes: {
      orbit: { video: 'assets/video/scene-1-dawn.mp4', sequence: { path: 'assets/sequence/orbit/', frames: 119 } },
      builder: { video: 'assets/video/scene-2-builder.mp4', sequence: { path: 'assets/sequence/builder/', frames: 119 } },
      gallery: { video: 'assets/video/scene-3-hands.mp4', sequence: { path: 'assets/sequence/gallery/', frames: 119 } },
    },
  };

  /* 2. Portfolio. To add a site:
        node tools/capture-site.mjs my-slug https://example.com/
        then add it to SITES, and one or more entries to THUMBS.
        `pc` and `sp` are how many image slices the capture printed. */

  const SITES = {
    nandemo: {
      name: 'なんでも110番',
      summary: '残置物撤去から車のこと、害獣駆除まで、幅広いサービスを迷わず探せるサイトです。どのページからも、電話とLINEへすぐつながります。',
      facts: [
        ['業種', '便利屋'],
        ['地域', '山口県・北九州市'],
        ['担当', 'ウェブサイト制作'],
        ['規模', '全10ページ'],
      ],
    },
    ryokan: {
      name: '湯宿 しじま',
      summary: '架空の温泉宿のために作ったコンセプト作品です。スクロールすると障子がひらき、庭から露天風呂までを3Dで歩けます。春夏秋冬を切り替えると、光や木々、客室の写真、献立まで季節に合わせて変わります。',
      facts: [
        ['業種', '温泉旅館（架空）'],
        ['種別', 'コンセプト作品'],
        ['担当', 'デザイン・3D表現・制作'],
        ['技術', 'WebGL2によるリアルタイム3D'],
      ],
    },
  };

  // `home` is where a thumbnail rests, as a share of the free space across and down.
  const THUMBS = [
    {
      site: 'nandemo', slug: 'nandemo-top', kind: 'pc', pc: 2, sp: 3,
      label: 'なんでも110番 トップページ', page: 'トップページ', path: 'nandemo110.com',
      home: { wide: [0.03, 0.06], narrow: [0, 0.0] }, tilt: -2,
    },
    {
      site: 'nandemo', slug: 'nandemo-top', kind: 'sp', pc: 2, sp: 3,
      label: 'スマートフォン', page: 'トップページ（スマートフォン）', path: 'nandemo110.com',
      home: { wide: [0.97, 0.1], narrow: [0.04, 0.4] }, tilt: 3,
    },
    {
      site: 'nandemo', slug: 'nandemo-gaiju', kind: 'pc', pc: 2, sp: 4,
      label: 'なんでも110番 害獣駆除', page: '害獣駆除ページ', path: 'nandemo110.com/gaiju/',
      home: { wide: [0.5, 0.04], narrow: [1, 0.18] }, tilt: 2,
    },
    {
      site: 'nandemo', slug: 'nandemo-kuruma', kind: 'pc', pc: 1, sp: 2,
      label: 'なんでも110番 車のサービス', page: '車のサービスページ', path: 'nandemo110.com/kuruma/',
      home: { wide: [0.86, 0.96], narrow: [1, 0.52] }, tilt: -3,
    },
    {
      site: 'ryokan', slug: 'ryokan', kind: 'pc', pc: 2, sp: 3,
      label: '湯宿 しじま（コンセプト作品）', page: 'トップページ', path: 'kdeelaka.github.io/works/ryokan/',
      home: { wide: [0.45, 0.98], narrow: [1, 0.8] }, tilt: -1.5,
    },
    {
      slot: true, kind: 'pc',
      label: 'ご相談はこちら', title: '次は、あなたのサイト。',
      home: { wide: [0.04, 0.94], narrow: [0.02, 1] }, tilt: 1.5,
    },
  ];

  /* 3. Helpers */

  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, v) => {
    const t = clamp((v - a) / (b - a));
    return t * t * (3 - 2 * t);
  };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const narrow = matchMedia('(max-width: 720px)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const lowPower = narrow.matches || matchMedia('(pointer: coarse)').matches;

  // Data saver or a very slow connection gets Still mode.
  const lightData = Boolean(navigator.connection?.saveData)
    || /2g/.test(navigator.connection?.effectiveType ?? '');

  let lenis = null;

  function goTo(hash) {
    const target = hash === '#top' ? 0 : $(hash);
    if (target === null) return;
    if (lenis) {
      lenis.scrollTo(target, { duration: 1.8, easing: (t) => 1 - (1 - t) ** 4 });
    } else if (target === 0) {
      window.scrollTo({ top: 0 });
    } else {
      target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
    }
    if (target) {
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
  }

  /* 4. Kinetic text
     Splits text into characters for animation. A hidden copy stays for screen
     readers. With `mask`, each character sits in a cell it can rise out of. */

  function splitChars(node, { mask = false } = {}) {
    const spoken = el('span', 'vh', node.textContent.trim());
    const shown = el('span', 'split');
    shown.setAttribute('aria-hidden', 'true');
    shown.append(...node.childNodes);

    const chars = [];
    const walk = (parent) => {
      [...parent.childNodes].forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          const letters = document.createDocumentFragment();
          for (const letter of child.textContent) {
            if (/\s/.test(letter)) continue;
            const ch = el('span', 'ch', letter);
            chars.push(ch);
            if (mask) {
              const cell = el('span', 'cm');
              cell.append(ch);
              letters.append(cell);
            } else {
              letters.append(ch);
            }
          }
          child.replaceWith(letters);
        } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName !== 'BR') {
          walk(child);
        }
      });
    };
    walk(shown);

    node.append(spoken, shown);
    return chars;
  }

  // Phones raise whole phrases. Splitting every heading into characters costs far
  // more to set up and to animate, and at this size the rise reads the same.
  function splitPhrases(node) {
    return $$('.ph', node).map((phrase) => {
      const cell = el('span', 'cm');
      phrase.replaceWith(cell);
      cell.append(phrase);
      return phrase;
    });
  }

  /* 5. Contact form */

  const FORM_TEXT = {
    name: 'お名前を入力してください。',
    reachEmpty: '電話番号またはメールアドレスを入力してください。',
    reachFormat: '電話番号またはメールアドレスの形式を確認してください。',
    message: 'ご相談の内容を入力してください。',
    sent: '送信しました。内容を確認して、ご連絡します。',
    failed: '送信できませんでした。入力内容は残っています。少し時間をおいてもう一度送るか、お電話かSMSでご連絡ください。',
    notConnected: 'フォームはまだ接続されていないため、送信されていません。お手数ですが、お電話かSMSでご連絡ください。入力内容はSMSに引き継げます。',
  };

  const FORM_TIMEOUT = 15000;

  // A Japanese keyboard left in full-width mode types wide digits and letters.
  // This makes them plain, so the phone number or address can still be used.
  const toHalfWidth = (text) => text.normalize('NFKC').replace(/[ー―‐−–—]/g, '-');

  function isReachable(value) {
    const text = toHalfWidth(value.trim());
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
    const digits = text.replace(/[\s()+-]/g, '');
    return email || /^\d{10,13}$/.test(digits);
  }

  function initContact() {
    $$('[data-tel]').forEach((link) => {
      link.href = `tel:${SITE.phone.tel}`;
      link.textContent = SITE.phone.display;
    });

    const line = $('#line-link');
    if (SITE.lineUrl) {
      line.href = SITE.lineUrl;
      line.hidden = false;
    }

    const form = $('#contact-form');
    const status = $('#form-status');
    const submit = $('[type="submit"]', form);
    const fields = {
      name: form.elements.name,
      reach: form.elements.reach,
      message: form.elements.message,
    };

    function showError(input, text) {
      const error = $(`#${input.id}-error`);
      error.textContent = text ?? '';
      error.hidden = !text;
      if (text) {
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('aria-describedby', error.id);
      } else {
        input.removeAttribute('aria-invalid');
        input.removeAttribute('aria-describedby');
      }
    }

    function check(key) {
      const input = fields[key];
      const value = input.value.trim();
      let text = null;
      if (key === 'name' && !value) text = FORM_TEXT.name;
      if (key === 'message' && !value) text = FORM_TEXT.message;
      if (key === 'reach') {
        if (!value) text = FORM_TEXT.reachEmpty;
        else if (!isReachable(value)) text = FORM_TEXT.reachFormat;
      }
      showError(input, text);
      return !text;
    }

    Object.keys(fields).forEach((key) => {
      fields[key].addEventListener('input', () => {
        if (fields[key].hasAttribute('aria-invalid')) check(key);
      });
    });

    function say(text, actions = []) {
      status.replaceChildren(document.createTextNode(text));
      if (actions.length) {
        const row = el('div', 'form__status-actions');
        actions.forEach(({ label, href }) => {
          const link = el('a', 'btn', label);
          link.href = href;
          row.append(link);
        });
        status.append(row);
      }
      status.hidden = false;

      // On a phone the message can land below the screen, where it would look
      // as if nothing happened.
      const hidden = status.getBoundingClientRect().bottom + 16 - innerHeight;
      if (hidden <= 0) return;
      if (lenis) lenis.scrollTo(window.scrollY + hidden, { duration: 0.6 });
      else window.scrollBy({ top: hidden, behavior: reduced ? 'auto' : 'smooth' });
    }

    function smsLink(data) {
      const body = [
        `お名前: ${data.name}`,
        data.company ? `会社名・屋号: ${data.company}` : '',
        `連絡先: ${data.reach}`,
        `ご相談の内容: ${data.topic}`,
        data.message,
      ].filter(Boolean).join('\n');
      return `sms:${SITE.phone.tel}?&body=${encodeURIComponent(body)}`;
    }

    // SSGform lays out the email from these names, and uses メールアドレス as the
    // Reply-To, so replying to the email reaches the person who wrote.
    function emailFields(data) {
      const reach = toHalfWidth(data.reach.trim());
      const body = new FormData();
      body.append('お名前', data.name.trim());
      if (data.company.trim()) body.append('会社名・屋号', data.company.trim());
      body.append(reach.includes('@') ? 'メールアドレス' : '電話番号', reach);
      body.append('ご相談の内容', data.topic);
      body.append('メッセージ', data.message.trim());
      return body;
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      status.hidden = true;

      const ok = Object.keys(fields).map(check).every(Boolean);
      if (!ok) {
        $('[aria-invalid="true"]', form).focus();
        return;
      }

      const data = Object.fromEntries(new FormData(form));
      const otherWays = [
        { label: '電話する', href: `tel:${SITE.phone.tel}` },
        { label: 'SMSで送る', href: smsLink(data) },
      ];

      // The hidden field catches bots. A person's autofill can land there too,
      // so nothing is sent, but the way through stays visible.
      if (data.website) {
        say(FORM_TEXT.failed, otherWays);
        return;
      }

      if (!SITE.formEndpoint) {
        say(FORM_TEXT.notConnected, otherWays);
        return;
      }

      submit.disabled = true;
      submit.textContent = '送信しています';
      const sending = new AbortController();
      const timeout = setTimeout(() => sending.abort(), FORM_TIMEOUT);
      try {
        const response = await fetch(SITE.formEndpoint, {
          method: 'POST',
          headers: { 'X-Requested-With': 'XMLHttpRequest' }, // how SSGform spots a send from script
          body: emailFields(data),
          signal: sending.signal,
        });
        // Only 200 means SSGform took the message. A failed CAPTCHA answers 204,
        // which fetch counts as ok.
        if (response.status !== 200) throw new Error(String(response.status));
        form.reset();
        say(FORM_TEXT.sent);
      } catch {
        say(FORM_TEXT.failed, otherWays);
      } finally {
        clearTimeout(timeout);
        submit.disabled = false;
        submit.textContent = '相談を送る';
      }
    });
  }

  /* 6. Portfolio browser: thumbnails you can throw around, and a card that opens
        inside the same window as a new tab. */

  function initWorks() {
    const HOME_ADDRESS = 'ディーラカの制作実績';
    const HOME_STATUS = finePointer ? 'ドラッグで移動、クリックで開く' : 'タップで開く、横にスワイプで動かす';
    const DRAG_START = 6;
    const WALL_BOUNCE = 0.55;

    const browser = $('#browser');
    const stage = $('#stage');
    const layer = $('#thumbs');
    const tabs = $('#tabs');
    const homeTab = $('#tab-home');
    const back = $('#back');
    const address = $('#address');
    const status = $('#status');
    status.textContent = HOME_STATUS;
    const coords = $('#coords');
    const guideX = $('#guide-x');
    const guideY = $('#guide-y');

    let bounds = { w: 0, h: 0 };
    let top = 1;
    let running = false;
    let lastStep = 0;
    let open = null;

    const items = THUMBS.map((data, index) => {
      const node = el('button', `thumb thumb--${data.kind}${data.slot ? ' thumb--slot' : ''}`);
      node.type = 'button';
      node.style.setProperty('--i', index);
      node.dataset.cursor = data.slot ? '相談する' : 'ドラッグ';
      node.setAttribute('aria-label', data.slot ? `${data.title}ご相談フォームへ移動` : `${data.label}を開く`);

      const shot = el('span', 'thumb__shot');
      if (data.slot) {
        shot.textContent = data.title;
      } else {
        const img = el('img');
        img.loading = 'lazy';
        img.decoding = 'async';
        img.src = `assets/works/${data.slug}/${data.kind}-thumb.webp`;
        img.alt = '';
        img.draggable = false;
        shot.append(img);
      }
      node.append(shot, el('span', 'thumb__label', data.label));
      layer.append(node);

      return { data, node, x: 0, y: 0, vx: 0, vy: 0, rot: data.tilt, moved: false, drag: null };
    });

    function place(item) {
      const size = item.drag ? 1.04 : 1;
      item.node.style.transform =
        `translate3d(${item.x.toFixed(1)}px, ${item.y.toFixed(1)}px, 0) rotate(${item.rot.toFixed(2)}deg) scale(${size})`;
    }

    function limits(item) {
      return {
        maxX: Math.max(bounds.w - item.node.offsetWidth, 0),
        maxY: Math.max(bounds.h - item.node.offsetHeight, 0),
      };
    }

    function home(item) {
      const [fx, fy] = item.data.home[narrow.matches ? 'narrow' : 'wide'];
      const { maxX, maxY } = limits(item);
      return { x: fx * maxX, y: fy * maxY };
    }

    function layout({ all = false } = {}) {
      bounds = { w: layer.clientWidth, h: layer.clientHeight };
      items.forEach((item) => {
        if (all || !item.moved) {
          Object.assign(item, home(item));
          item.rot = item.data.tilt;
          item.vx = 0;
          item.vy = 0;
        } else {
          const { maxX, maxY } = limits(item);
          item.x = clamp(item.x, 0, maxX);
          item.y = clamp(item.y, 0, maxY);
        }
        place(item);
      });
    }

    function settle(update) {
      if (reduced) {
        update();
        return;
      }
      layer.classList.add('is-settling');
      // Let the class land first, so the change below is the one that animates.
      requestAnimationFrame(() => {
        update();
        window.setTimeout(() => layer.classList.remove('is-settling'), 1300);
      });
    }

    /* Physics, only while something is moving */

    function step(now) {
      const dt = Math.min((now - lastStep) / 1000, 0.05);
      lastStep = now;
      const friction = Math.exp(-3.4 * dt);
      let moving = false;

      items.forEach((item) => {
        if (item.drag) return;
        if (Math.hypot(item.vx, item.vy) < 6) {
          item.vx = 0;
          item.vy = 0;
          return;
        }
        moving = true;
        item.x += item.vx * dt;
        item.y += item.vy * dt;
        item.vx *= friction;
        item.vy *= friction;

        const { maxX, maxY } = limits(item);
        if (item.x < 0) { item.x = 0; item.vx = Math.abs(item.vx) * WALL_BOUNCE; }
        if (item.x > maxX) { item.x = maxX; item.vx = -Math.abs(item.vx) * WALL_BOUNCE; }
        if (item.y < 0) { item.y = 0; item.vy = Math.abs(item.vy) * WALL_BOUNCE; }
        if (item.y > maxY) { item.y = maxY; item.vy = -Math.abs(item.vy) * WALL_BOUNCE; }

        item.rot += item.vx * dt * 0.012;
        place(item);
      });

      if (moving) {
        requestAnimationFrame(step);
      } else {
        running = false;
      }
    }

    function wake() {
      if (running || reduced) return;
      running = true;
      lastStep = performance.now();
      requestAnimationFrame(step);
    }

    function showGuides(item) {
      const cx = Math.round(item.x + item.node.offsetWidth / 2);
      const cy = Math.round(item.y + item.node.offsetHeight / 2);
      guideX.style.transform = `translateX(${cx + layer.offsetLeft}px)`;
      guideY.style.transform = `translateY(${cy + layer.offsetTop}px)`;
      coords.textContent = `X ${cx}  Y ${cy}`;
    }

    function activate(item) {
      if (item.data.slot) {
        goTo('#contact');
        return;
      }
      openCard(item);
    }

    /* Dragging */

    items.forEach((item) => {
      const { node } = item;

      node.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || open) return;
        node.setPointerCapture(event.pointerId);
        item.drag = {
          id: event.pointerId,
          grabX: event.clientX - item.x,
          grabY: event.clientY - item.y,
          startX: event.clientX,
          startY: event.clientY,
          lastX: event.clientX,
          lastY: event.clientY,
          lastT: event.timeStamp,
          travelled: false,
        };
        item.vx = 0;
        item.vy = 0;
        top += 1;
        node.style.zIndex = top;
        node.classList.add('is-held');
        place(item);
      });

      node.addEventListener('pointermove', (event) => {
        const { drag } = item;
        if (!drag || drag.id !== event.pointerId) return;

        if (!drag.travelled) {
          const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
          if (distance < DRAG_START) return;
          drag.travelled = true;
          item.moved = true;
          stage.classList.add('is-dragging');
        }

        const { maxX, maxY } = limits(item);
        item.x = clamp(event.clientX - drag.grabX, 0, maxX);
        item.y = clamp(event.clientY - drag.grabY, 0, maxY);

        const elapsed = Math.max((event.timeStamp - drag.lastT) / 1000, 0.004);
        const blend = 0.35;
        item.vx = item.vx * (1 - blend) + ((event.clientX - drag.lastX) / elapsed) * blend;
        item.vy = item.vy * (1 - blend) + ((event.clientY - drag.lastY) / elapsed) * blend;
        drag.lastX = event.clientX;
        drag.lastY = event.clientY;
        drag.lastT = event.timeStamp;

        item.rot = clamp(item.data.tilt + item.vx * 0.006, -14, 14);
        place(item);
        showGuides(item);
      });

      function release(event) {
        const { drag } = item;
        if (!drag || drag.id !== event.pointerId) return;
        item.drag = null;
        node.classList.remove('is-held');
        stage.classList.remove('is-dragging');
        coords.textContent = '';

        if (!drag.travelled) {
          place(item);
          if (event.type === 'pointerup') activate(item);
          return;
        }

        // A pause before letting go means a placement, not a throw.
        if (event.timeStamp - drag.lastT > 90) {
          item.vx = 0;
          item.vy = 0;
        }
        item.vx = clamp(item.vx, -2600, 2600);
        item.vy = clamp(item.vy, -2600, 2600);
        place(item);
        wake();
      }

      node.addEventListener('pointerup', release);
      node.addEventListener('pointercancel', release);

      // Keyboard activation arrives as a click with no pointer behind it.
      node.addEventListener('click', (event) => {
        if (event.detail === 0) activate(item);
      });

      node.addEventListener('keydown', (event) => {
        const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        const move = moves[event.key];
        if (!move) return;
        event.preventDefault();
        const { maxX, maxY } = limits(item);
        item.x = clamp(item.x + move[0] * 24, 0, maxX);
        item.y = clamp(item.y + move[1] * 24, 0, maxY);
        item.moved = true;
        place(item);
      });

      const point = () => {
        if (!open && !item.data.slot) address.textContent = item.data.path;
      };
      const unpoint = () => {
        if (!open) address.textContent = HOME_ADDRESS;
      };
      node.addEventListener('pointerenter', point);
      node.addEventListener('focus', point);
      node.addEventListener('pointerleave', unpoint);
      node.addEventListener('blur', unpoint);
    });

    /* Card */

    function pageImages(data, mode) {
      const page = el('div', `card__page card__page--${mode}`);
      for (let i = 1; i <= data[mode]; i += 1) {
        const img = el('img');
        img.src = `assets/works/${data.slug}/${mode}-${i}.webp`;
        img.alt = i === 1 ? `${data.label}の画面` : '';
        img.draggable = false;
        page.append(img);
      }
      return page;
    }

    function buildCard(item) {
      const { data } = item;
      const site = SITES[data.site];

      const card = el('article', 'card');
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-label', `${site.name} ${data.page}`);

      const view = el('div', 'card__view');
      const scroll = el('div', 'card__scroll');
      scroll.tabIndex = 0;
      scroll.dataset.cursor = 'スクロール';
      scroll.dataset.lenisPrevent = '';
      scroll.setAttribute('aria-label', 'サイトのプレビュー。スクロールできます');
      let mode = data.kind === 'sp' ? 'sp' : 'pc';
      scroll.append(pageImages(data, mode));
      const hint = el('p', 'card__hint', 'この中をスクロールできます');
      view.append(scroll, hint);
      scroll.addEventListener('scroll', () => hint.classList.add('is-gone'), { once: true, passive: true });

      const info = el('div', 'card__info');
      info.dataset.lenisPrevent = '';
      const heading = el('div');
      heading.append(el('h3', 'card__name', site.name), el('p', 'card__page-name', data.page));

      const segmented = el('div', `segmented${mode === 'sp' ? ' is-sp' : ''}`);
      segmented.setAttribute('role', 'group');
      segmented.setAttribute('aria-label', '表示の切り替え');
      const buttons = [['pc', 'パソコン'], ['sp', 'スマートフォン']].map(([value, label]) => {
        const button = el('button', '', label);
        button.type = 'button';
        button.setAttribute('aria-pressed', String(value === mode));
        button.addEventListener('click', () => {
          if (mode === value) return;
          mode = value;
          scroll.replaceChildren(pageImages(data, mode));
          scroll.scrollTop = 0;
          segmented.classList.toggle('is-sp', mode === 'sp');
          buttons.forEach((other) => {
            other.setAttribute('aria-pressed', String(other === button));
          });
        });
        segmented.append(button);
        return button;
      });

      const facts = el('dl', 'card__facts');
      site.facts.forEach(([term, value]) => {
        facts.append(el('dt', '', term), el('dd', '', value));
      });

      const links = el('div', 'card__links');
      const live = el('a', 'btn', 'サイトを開く');
      live.href = `https://${data.path}`;
      live.target = '_blank';
      live.rel = 'noopener';
      const talk = el('a', 'btn btn--ghost', 'このようなサイトを相談する');
      talk.href = '#contact';
      talk.addEventListener('click', () => closeCard({ quiet: true }));
      links.append(live, talk);

      info.append(heading, segmented, el('p', 'card__text', site.summary), facts, links);
      card.append(view, info);
      return { card, scroll };
    }

    function flightPath(card, node) {
      const from = node.getBoundingClientRect();
      const to = card.getBoundingClientRect();
      const dx = from.left + from.width / 2 - (to.left + to.width / 2);
      const dy = from.top + from.height / 2 - (to.top + to.height / 2);
      return `translate(${dx}px, ${dy}px) scale(${from.width / to.width}, ${from.height / to.height})`;
    }

    function openCard(item) {
      if (open) return;
      const { data } = item;
      const site = SITES[data.site];
      const { card, scroll } = buildCard(item);
      stage.append(card);

      if (!reduced) {
        card.animate(
          [
            { transform: flightPath(card, item.node), opacity: 0.4 },
            { transform: 'none', opacity: 1 },
          ],
          { duration: 460, easing: 'cubic-bezier(.2,.8,.2,1)' }
        );
      }

      stage.classList.add('is-open');
      layer.inert = true;
      back.disabled = false;

      const tab = el('div', 'tab is-active');
      tab.append(el('span', 'tab__dot'), el('span', '', site.name));
      const close = el('button', 'tab__close', '×');
      close.type = 'button';
      close.setAttribute('aria-label', `${site.name}を閉じる`);
      close.addEventListener('click', () => closeCard());
      tab.append(close);
      homeTab.classList.remove('is-active');
      tabs.append(tab);

      address.textContent = data.path;
      status.textContent = 'Escキーで閉じる';
      open = { item, card, tab };
      scroll.focus({ preventScroll: true });
    }

    function closeCard({ quiet = false } = {}) {
      if (!open) return;
      const { item, card, tab } = open;
      open = null;

      stage.classList.remove('is-open');
      layer.inert = false;
      back.disabled = true;
      tab.remove();
      homeTab.classList.add('is-active');
      address.textContent = HOME_ADDRESS;
      status.textContent = HOME_STATUS;

      if (reduced) {
        card.remove();
      } else {
        card.animate(
          [
            { transform: 'none', opacity: 1 },
            { transform: flightPath(card, item.node), opacity: 0 },
          ],
          { duration: 300, easing: 'cubic-bezier(.4,0,.8,.4)', fill: 'forwards' }
        ).finished.finally(() => card.remove());
      }
      if (!quiet) item.node.focus({ preventScroll: true });
    }

    back.addEventListener('click', () => closeCard());
    homeTab.addEventListener('click', () => closeCard());
    browser.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeCard();
    });

    $('#tidy').addEventListener('click', () => {
      closeCard({ quiet: true });
      items.forEach((item) => { item.moved = false; });
      settle(() => layout({ all: true }));
    });

    layout();
    new ResizeObserver(() => layout()).observe(layer);

    // First time in view, the thumbnails deal out from one pile. It shows they can move.
    if (!reduced) {
      const dealt = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        dealt.disconnect();
        items.forEach((item) => {
          if (item.moved) return;
          item.x = (bounds.w - item.node.offsetWidth) / 2;
          item.y = (bounds.h - item.node.offsetHeight) / 2;
          item.rot = item.data.tilt * 2;
          place(item);
        });
        // Two frames so the pile is painted before it spreads.
        requestAnimationFrame(() => requestAnimationFrame(() => settle(() => layout())));
      }, { threshold: 0.4 });
      dealt.observe(stage);
    }
  }

  /* 7. Film engine: a small WebGL2 renderer. Colors are worked in display space,
        everything blends as premultiplied alpha, and draw order is written by hand. */

  const RIM = [0.56, 0.3, 1.0];
  const WARM = [1.0, 0.68, 0.4];
  const TAU = Math.PI * 2;
  const PORTRAIT_ASPECT = 1199 / 1312;
  const HEAD_U = 0.59; // where his head sits across the photo

  const GLSL = `#version 300 es
    precision highp float;
    // A touch of noise stops soft gradients from banding in 8-bit color.
    float dither(vec2 p) {
      return (fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 128.0;
    }
  `;

  const VERT_FLAT = `${GLSL}
    layout(location = 0) in vec3 aPos;
    layout(location = 1) in vec2 aUv;
    uniform mat4 uProj;
    uniform mat4 uView;
    uniform mat4 uModel;
    out vec2 vUv;
    out vec3 vWorld;
    void main() {
      vUv = aUv;
      vec4 w = uModel * vec4(aPos, 1.0);
      vWorld = w.xyz;
      gl_Position = uProj * uView * w;
    }`;

  const VERT_PORTRAIT = `${GLSL}
    layout(location = 0) in vec3 aPos;
    layout(location = 1) in vec2 aUv;
    uniform mat4 uProj;
    uniform mat4 uView;
    uniform mat4 uModel;
    uniform sampler2D tDepth;
    uniform float uRelief;
    out vec2 vUv;
    void main() {
      vUv = aUv;
      vec4 w = uModel * vec4(aPos, 1.0);
      w.z += (texture(tDepth, aUv).r - 0.5) * uRelief;
      gl_Position = uProj * uView * w;
    }`;

  const FRAG_PORTRAIT = `${GLSL}
    uniform sampler2D tColor;
    uniform sampler2D tMatte;
    uniform sampler2D tNormal;
    uniform sampler2D tEdgeTight;
    uniform sampler2D tEdgeWide;
    uniform vec3 uLight;
    uniform vec3 uRim;
    uniform vec3 uWarm;
    uniform float uPower;
    uniform float uFill;
    uniform float uHalo;
    uniform float uFloorFade;
    in vec2 vUv;
    out vec4 outColor;

    float luma(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }

    void main() {
      float a = texture(tMatte, vUv).r;
      float border = smoothstep(0.0, 0.07, vUv.x) * smoothstep(1.0, 0.93, vUv.x)
                   * smoothstep(0.0, uFloorFade, vUv.y);
      a *= border;
      if (a < 0.004) discard;

      vec3 c = texture(tColor, vUv).rgb;
      float l = luma(c);

      // Surface direction, baked from the depth map and the photo's fine relief.
      vec3 n = normalize(texture(tNormal, vUv).rgb * 2.0 - 1.0);

      float lambert = max(dot(n, uLight), 0.0);
      float behind = smoothstep(0.6, -0.7, uLight.z);

      // Shadows lean violet so the black shirt belongs to the room. Skin stays skin.
      float shadow = 1.0 - smoothstep(0.03, 0.34, l);
      vec3 cool = vec3(l) * vec3(0.72, 0.6, 1.2);
      vec3 col = mix(c, cool, shadow * 0.92) * uFill;

      // Violet light wrapping round the form.
      col += c * mix(uRim, vec3(1.0), 0.3) * pow(lambert, 1.5) * 0.5 * (1.0 - behind * 0.7);
      col += uRim * pow(lambert, 4.0) * 0.05;

      // Rim: the edge maps are sampled a little toward the light, so only the
      // side facing it lights up.
      vec2 toward = normalize(uLight.xy + 1e-4);
      float thin = 1.0 - texture(tEdgeTight, vUv + toward * 0.0085).r;
      float wide = 1.0 - texture(tEdgeWide, vUv + toward * 0.03).r;
      thin = smoothstep(0.02, 0.85, thin);
      wide = wide * wide;
      vec3 rimColor = mix(uRim, vec3(0.88, 0.8, 1.0), thin * 0.65);
      col += rimColor * thin * (0.3 + behind * 1.25) * (0.55 + l * 1.3);
      col += uRim * wide * (0.1 + behind * 0.42);

      // A trace of warmth from the far side, like the side light in the photo.
      vec3 opposite = normalize(vec3(-uLight.x, 0.2, 0.5));
      col += c * uWarm * max(dot(n, opposite), 0.0) * 0.2;

      // Even back light, used at the end of the gallery.
      float around = 1.0 - texture(tEdgeWide, vUv).r;
      col += uRim * around * uHalo * 1.3;

      col *= uPower;
      outColor = vec4(col * a, a);
    }`;

  // Soft light that always faces the camera. Alpha stays 0, so it adds to whatever
  // is under the canvas too, including the title.
  const VERT_GLOW = `${GLSL}
    layout(location = 0) in vec3 aPos;
    layout(location = 1) in vec2 aUv;
    uniform mat4 uProj;
    uniform mat4 uView;
    uniform vec3 uCenter;
    uniform vec2 uScale;
    out vec2 vUv;
    void main() {
      vUv = aUv;
      vec4 mv = uView * vec4(uCenter, 1.0);
      mv.xy += aPos.xy * uScale;
      gl_Position = uProj * mv;
    }`;

  const FRAG_GLOW = `${GLSL}
    uniform vec3 uColor;
    uniform float uPower;
    in vec2 vUv;
    out vec4 outColor;
    void main() {
      float d = length(vUv - 0.5) * 2.0;
      float g = pow(max(1.0 - d, 0.0), 2.2);
      vec3 col = uColor * g * uPower;
      outColor = vec4(max(col + dither(gl_FragCoord.xy) * step(0.0005, g), 0.0), 0.0);
    }`;

  const VERT_DUST = `${GLSL}
    layout(location = 0) in vec3 aPos;
    layout(location = 1) in float aSeed;
    uniform mat4 uProj;
    uniform mat4 uView;
    uniform vec3 uOffset;
    uniform float uTime;
    uniform float uSize;
    out float vTwinkle;
    void main() {
      vec3 p = aPos + uOffset;
      p.y += sin(uTime * 0.16 + aSeed * 40.0) * 0.22;
      p.x += cos(uTime * 0.11 + aSeed * 31.0) * 0.22;
      vec4 mv = uView * vec4(p, 1.0);
      vTwinkle = 0.45 + 0.55 * sin(uTime * 0.5 + aSeed * 60.0);
      gl_PointSize = uSize * (0.5 + aSeed) / max(-mv.z, 0.4);
      gl_Position = uProj * mv;
    }`;

  const FRAG_DUST = `${GLSL}
    uniform float uPower;
    in float vTwinkle;
    out vec4 outColor;
    void main() {
      float d = length(gl_PointCoord - 0.5) * 2.0;
      float g = pow(max(1.0 - d, 0.0), 2.0);
      outColor = vec4(vec3(0.72, 0.56, 1.0) * g * vTwinkle * uPower, 0.0);
    }`;

  // A hairline ring with a comet of light. Each half is drawn on its own,
  // so he can stand between them.
  const VERT_RING = `${GLSL}
    layout(location = 0) in vec3 aPos;
    uniform mat4 uProj;
    uniform mat4 uView;
    uniform mat4 uModel;
    out vec3 vLocal;
    void main() {
      vLocal = aPos;
      gl_Position = uProj * uView * uModel * vec4(aPos, 1.0);
    }`;

  const FRAG_RING = `${GLSL}
    uniform float uAngle;
    uniform float uPower;
    uniform float uSide;
    uniform vec3 uRim;
    uniform vec3 uWarm;
    in vec3 vLocal;
    out vec4 outColor;
    const float TAU = 6.2831853;
    void main() {
      if (vLocal.y * uSide < 0.0) discard;
      float r = length(vLocal.xy);
      float line = exp(-pow((r - 1.0) / 0.0065, 2.0));
      float ang = atan(vLocal.y, vLocal.x);
      float lag = fract((uAngle - ang) / TAU);
      float tail = pow(1.0 - lag, 5.0);
      float head = exp(-pow(min(lag, 1.0 - lag) / 0.01, 2.0));
      vec3 col = mix(uRim, uWarm, pow(tail, 3.0));
      float glow = line * (0.1 + tail * 1.5 + head * 2.5);
      outColor = vec4(col * glow * uPower, 0.0);
    }`;

  const FRAG_PANEL = `${GLSL}
    uniform sampler2D tMap;
    uniform vec2 uSize;
    uniform vec3 uCamera;
    uniform float uPad;
    uniform float uRadius;
    uniform float uOpacity;
    uniform float uTint;
    uniform float uFog;
    uniform float uMirror;
    uniform float uFloor;
    uniform float uNear;
    in vec2 vUv;
    in vec3 vWorld;
    out vec4 outColor;

    float box(vec2 p, vec2 b, float r) {
      vec2 q = abs(p) - b + r;
      return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
    }

    void main() {
      vec2 full = uSize + uPad * 2.0;
      vec2 p = (vUv - 0.5) * full;
      float d = box(p, uSize * 0.5, uRadius);
      float aa = fwidth(d) * 0.75;
      float inside = 1.0 - smoothstep(-aa, aa, d);

      vec2 tuv = p / uSize + 0.5;
      vec3 img = texture(tMap, clamp(tuv, 0.0, 1.0)).rgb;
      img = mix(img, img * vec3(0.6, 0.46, 0.98) * 0.86, uTint);
      img *= 0.96 + 0.04 * sin(vWorld.y * 260.0);

      float edge = 1.0 - smoothstep(0.0, aa * 2.4 + 0.004, abs(d));
      float halo = exp(-max(d, 0.0) * 9.0) * (1.0 - inside);
      vec3 line = vec3(0.72, 0.56, 1.0);

      float dist = distance(uCamera, vWorld);
      float fog = exp(-dist * uFog);
      float near = smoothstep(uNear, uNear + 1.6, dist);
      float below = max(uFloor - vWorld.y, 0.0);
      float mirror = mix(1.0, 0.34 * exp(-below * 0.8), uMirror);
      float k = uOpacity * fog * near * mirror;

      vec3 rgb = img * inside * 0.94 + line * edge * 0.75 + vec3(0.42, 0.22, 0.95) * halo * 0.42;
      outColor = vec4(rgb * k, inside * k * 0.94);
    }`;

  const VERT_BACKDROP = `${GLSL}
    layout(location = 0) in vec3 aPos;
    layout(location = 1) in vec2 aUv;
    out vec2 vUv;
    void main() {
      vUv = aUv;
      gl_Position = vec4(aPos.xy * 2.0, 0.0, 1.0);
    }`;

  const FRAG_BACKDROP = `${GLSL}
    uniform vec3 uTop;
    uniform vec3 uBottom;
    uniform float uGlowY;
    uniform float uGlow;
    in vec2 vUv;
    out vec4 outColor;
    void main() {
      vec3 col = mix(uBottom, uTop, vUv.y);
      float d = length((vUv - vec2(0.5, uGlowY)) * vec2(1.0, 1.7));
      col += vec3(0.27, 0.11, 0.6) * pow(max(1.0 - d * 1.5, 0.0), 2.0) * uGlow;
      outColor = vec4(col + dither(gl_FragCoord.xy), 1.0);
    }`;

  const FRAG_FLOOR = `${GLSL}
    uniform vec3 uCamera;
    uniform float uFade;
    in vec3 vWorld;
    out vec4 outColor;
    void main() {
      float dist = distance(uCamera.xz, vWorld.xz);
      float sheen = exp(-dist * uFade) * 0.16;
      vec3 col = vec3(0.045, 0.02, 0.09) + vec3(0.3, 0.14, 0.7) * sheen;
      outColor = vec4(col * 0.72, 0.72);
    }`;

  const FRAG_STRIP = `${GLSL}
    uniform vec3 uCamera;
    in vec2 vUv;
    in vec3 vWorld;
    out vec4 outColor;
    void main() {
      float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
      float fall = exp(-distance(uCamera, vWorld) * 0.04);
      outColor = vec4(vec3(0.56, 0.34, 1.0) * across * across * fall * 0.9, 0.0);
    }`;

  /* Matrices, column-major */

  const matTranslate = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
  const matScale = (x, y, z) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
  const matRotX = (a) => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
  };
  const matRotY = (a) => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
  };
  const matRotZ = (a) => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  };

  function matMul(...list) {
    return list.reduce((a, b) => {
      const out = new Array(16);
      for (let c = 0; c < 4; c += 1) {
        for (let r = 0; r < 4; r += 1) {
          let sum = 0;
          for (let k = 0; k < 4; k += 1) sum += a[k * 4 + r] * b[c * 4 + k];
          out[c * 4 + r] = sum;
        }
      }
      return out;
    });
  }

  function matPerspective(fov, aspect, near, far) {
    const f = 1 / Math.tan((fov * Math.PI) / 360);
    const nf = 1 / (near - far);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
  }

  function matLookAt(eye, target) {
    let z = [eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]];
    const zl = Math.hypot(...z);
    z = z.map((v) => v / zl);
    let x = [z[2], 0, -z[0]]; // up (0,1,0) crossed with z
    const xl = Math.hypot(...x);
    x = x.map((v) => v / xl);
    const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    return [
      x[0], y[0], z[0], 0,
      x[1], y[1], z[1], 0,
      x[2], y[2], z[2], 0,
      -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
    ];
  }

  /* Design material for the holographic screens: what sits on a designer's desk. */

  const MINCHO = '"Shippori Mincho B1", "Hiragino Mincho ProN", serif';
  const GOTHIC = '"Zen Kaku Gothic New", "Hiragino Sans", sans-serif';
  const INK = '#150828';
  const STROKE = 'rgba(177,140,255,.55)';
  const SOFT = 'rgba(177,140,255,.22)';
  const GLOW = '#b18cff';
  const PAPER = '#f4efff';
  const EMBER = '#ffb877';
  const VIOLET = '#7a3cff';

  function sheetCanvas(w, h) {
    const canvas = el('canvas');
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext('2d');
    g.fillStyle = INK;
    g.fillRect(0, 0, w, h);
    return { canvas, g };
  }

  function roundBox(g, x, y, w, h, r) {
    g.beginPath();
    g.roundRect(x, y, w, h, r);
  }

  const DRAWN = {
    type() {
      const { canvas, g } = sheetCanvas(640, 840);
      g.strokeStyle = SOFT;
      g.lineWidth = 2;
      [210, 480, 620].forEach((y) => {
        g.beginPath();
        g.moveTo(40, y);
        g.lineTo(600, y);
        g.stroke();
      });
      g.fillStyle = PAPER;
      g.font = `800 270px ${MINCHO}`;
      g.textAlign = 'center';
      g.fillText('物語', 320, 450);
      g.fillStyle = GLOW;
      g.font = `800 44px ${MINCHO}`;
      g.fillText('あいうえお アイウエオ', 320, 585);
      g.font = `500 28px ${GOTHIC}`;
      g.fillStyle = 'rgba(244,239,255,.7)';
      g.fillText('見出し 800 / 本文 400', 320, 690);
      return canvas;
    },
    palette() {
      const { canvas, g } = sheetCanvas(780, 520);
      const swatches = [
        ['#0C0517', 'Void'], ['#2B1257', 'Iris'], ['#7A3CFF', 'Violet'],
        ['#B18CFF', 'Glow'], ['#FFB877', 'Ember'], ['#F4EFFF', 'Paper'],
      ];
      const size = 212;
      swatches.forEach(([hex, name], i) => {
        const x = 36 + (i % 3) * (size + 26);
        const y = 34 + Math.floor(i / 3) * (size + 22);
        g.fillStyle = hex;
        roundBox(g, x, y, size, 170, 22);
        g.fill();
        g.strokeStyle = SOFT;
        g.lineWidth = 2;
        g.stroke();
        g.fillStyle = PAPER;
        g.font = `700 24px ${GOTHIC}`;
        g.textAlign = 'left';
        g.fillText(name, x + 4, y + 200);
        g.fillStyle = 'rgba(244,239,255,.6)';
        g.font = `500 20px ${GOTHIC}`;
        g.textAlign = 'right';
        g.fillText(hex, x + size - 4, y + 200);
      });
      return canvas;
    },
    wire() {
      const { canvas, g } = sheetCanvas(760, 500);
      g.strokeStyle = STROKE;
      g.lineWidth = 3;
      const box = (x, y, w, h, r = 12) => {
        roundBox(g, x, y, w, h, r);
        g.stroke();
      };
      box(36, 30, 688, 54, 27);
      box(36, 106, 420, 236);
      g.beginPath();
      g.moveTo(36, 106);
      g.lineTo(456, 342);
      g.moveTo(456, 106);
      g.lineTo(36, 342);
      g.stroke();
      g.fillStyle = SOFT;
      [130, 170, 210].forEach((y, i) => {
        roundBox(g, 486, y, 238 - i * 44, 22, 11);
        g.fill();
      });
      g.fillStyle = VIOLET;
      roundBox(g, 486, 276, 170, 58, 29);
      g.fill();
      [0, 1, 2].forEach((i) => box(36 + i * 236, 366, 216, 104));
      return canvas;
    },
    code() {
      const { canvas, g } = sheetCanvas(760, 500);
      const rows = [
        [[GLOW, '<section'], [EMBER, ' class="story"'], [GLOW, '>']],
        [[GLOW, '  <h1>'], [PAPER, '物語が、ブランドになる。'], [GLOW, '</h1>']],
        [[GLOW, '  <p>'], [PAPER, 'あなたの歩みを'], [GLOW, '</p>']],
        [[GLOW, '  <a'], [EMBER, ' href="tel:"'], [GLOW, '>'], [PAPER, '電話する'], [GLOW, '</a>']],
        [[GLOW, '</section>']],
        [],
        [[EMBER, '.story'], [PAPER, ' {']],
        [[PAPER, '  color: '], [GLOW, 'var(--paper)'], [PAPER, ';']],
        [[PAPER, '  border-radius: '], [GLOW, '28px'], [PAPER, ';']],
        [[PAPER, '}']],
      ];
      g.font = `500 30px ${GOTHIC}`;
      g.textAlign = 'left';
      rows.forEach((row, i) => {
        let x = 40;
        row.forEach(([color, text]) => {
          g.fillStyle = color;
          g.fillText(text, x, 62 + i * 44);
          x += g.measureText(text).width;
        });
      });
      return canvas;
    },
    logo() {
      const { canvas, g } = sheetCanvas(600, 600);
      g.strokeStyle = SOFT;
      g.lineWidth = 2;
      for (let i = 0; i <= 6; i += 1) {
        const p = 60 + i * 80;
        g.beginPath();
        g.moveTo(p, 40);
        g.lineTo(p, 560);
        g.moveTo(40, p);
        g.lineTo(560, p);
        g.stroke();
      }
      g.strokeStyle = STROKE;
      [240, 160, 80].forEach((r) => {
        g.beginPath();
        g.arc(300, 300, r, 0, TAU);
        g.stroke();
      });
      g.strokeStyle = GLOW;
      g.lineWidth = 12;
      g.beginPath();
      g.arc(300, 300, 160, 0, TAU);
      g.stroke();
      g.fillStyle = EMBER;
      g.beginPath();
      g.arc(413, 187, 44, 0, TAU);
      g.fill();
      return canvas;
    },
    map() {
      const { canvas, g } = sheetCanvas(760, 500);
      const node = (x, y, label, on) => {
        g.fillStyle = on ? VIOLET : 'rgba(177,140,255,.16)';
        roundBox(g, x - 92, y - 34, 184, 68, 16);
        g.fill();
        g.strokeStyle = STROKE;
        g.lineWidth = 2;
        g.stroke();
        g.fillStyle = PAPER;
        g.font = `700 28px ${GOTHIC}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(label, x, y + 2);
      };
      g.strokeStyle = STROKE;
      g.lineWidth = 3;
      [150, 380, 610].forEach((x) => {
        g.beginPath();
        g.moveTo(380, 110);
        g.bezierCurveTo(380, 180, x, 170, x, 240);
        g.stroke();
      });
      [150, 610].forEach((x) => {
        g.beginPath();
        g.moveTo(x, 280);
        g.lineTo(x, 380);
        g.stroke();
      });
      node(380, 76, 'トップ', true);
      node(150, 262, 'サービス');
      node(380, 262, '料金');
      node(610, 262, '会社概要');
      node(150, 410, '事例');
      node(610, 410, 'ご相談');
      return canvas;
    },
  };

  async function createFilm(canvas, onProgress) {
    // decode() does the work off the main thread, so uploading to the GPU is quick.
    const picture = async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      return image;
    };

    // The hero's images start downloading now, so they arrive while shaders compile.
    const size = narrow.matches ? 'phone/' : ''; // the film is far narrower on a phone
    const heroFiles = [`${size}color`, `${size}matte`, 'depth', 'edge-tight', 'edge-wide', `${size}normal`];
    let loaded = 0;
    const heroImages = Promise.all(heroFiles.map(async (file) => {
      const image = await picture(`assets/portrait/${file}.webp`);
      loaded += 1;
      onProgress(loaded / heroFiles.length);
      return image;
    }));

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false, // every edge is already softened in the shaders
      depth: false,
      premultipliedAlpha: true,
      powerPreference: 'high-performance',
    });
    if (!gl) return null;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');

    /* Programs */

    function compile(type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader));
      }
      return shader;
    }

    function program(vertex, fragment) {
      const id = gl.createProgram();
      gl.attachShader(id, compile(gl.VERTEX_SHADER, vertex));
      gl.attachShader(id, compile(gl.FRAGMENT_SHADER, fragment));
      gl.linkProgram(id);
      if (!gl.getProgramParameter(id, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(id));
      const u = {};
      const count = gl.getProgramParameter(id, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < count; i += 1) {
        const { name } = gl.getActiveUniform(id, i);
        u[name] = gl.getUniformLocation(id, name);
      }
      return { id, u };
    }

    const P = {
      portrait: program(VERT_PORTRAIT, FRAG_PORTRAIT),
      glow: program(VERT_GLOW, FRAG_GLOW),
      dust: program(VERT_DUST, FRAG_DUST),
      ring: program(VERT_RING, FRAG_RING),
    };

    /* Geometry */

    function attribute(index, data, size) {
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(index);
      gl.vertexAttribPointer(index, size, gl.FLOAT, false, 0, 0);
    }

    function geometry(build) {
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const extra = build();
      gl.bindVertexArray(null);
      return { vao, ...extra };
    }

    const quad = geometry(() => {
      attribute(0, [-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0], 3);
      attribute(1, [0, 0, 1, 0, 0, 1, 1, 1], 2);
      return { mode: gl.TRIANGLE_STRIP, count: 4 };
    });

    function gridGeometry(columns, rows) {
      return geometry(() => {
        const pos = [];
        const uv = [];
        const indices = [];
        for (let y = 0; y <= rows; y += 1) {
          for (let x = 0; x <= columns; x += 1) {
            pos.push(x / columns - 0.5, y / rows - 0.5, 0);
            uv.push(x / columns, y / rows);
          }
        }
        for (let y = 0; y < rows; y += 1) {
          for (let x = 0; x < columns; x += 1) {
            const a = y * (columns + 1) + x;
            const b = a + columns + 1;
            indices.push(a, a + 1, b, b, a + 1, b + 1);
          }
        }
        attribute(0, pos, 3);
        attribute(1, uv, 2);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW);
        return { mode: gl.TRIANGLES, count: indices.length, indexed: true };
      });
    }

    const ringGeometry = geometry(() => {
      const pos = [];
      const steps = 320;
      for (let i = 0; i <= steps; i += 1) {
        const a = (i / steps) * TAU;
        pos.push(Math.cos(a) * 0.95, Math.sin(a) * 0.95, 0, Math.cos(a) * 1.05, Math.sin(a) * 1.05, 0);
      }
      attribute(0, pos, 3);
      return { mode: gl.TRIANGLE_STRIP, count: (steps + 1) * 2 };
    });

    function dustGeometry(count, [sx, sy, sz]) {
      return geometry(() => {
        const pos = [];
        const seeds = [];
        for (let i = 0; i < count; i += 1) {
          pos.push((Math.random() - 0.5) * sx, (Math.random() - 0.5) * sy, (Math.random() - 0.5) * sz);
          seeds.push(Math.random());
        }
        attribute(0, pos, 3);
        attribute(1, seeds, 1);
        return { mode: gl.POINTS, count };
      });
    }

    function draw({ vao, mode, count, indexed }) {
      gl.bindVertexArray(vao);
      if (indexed) gl.drawElements(mode, count, gl.UNSIGNED_INT, 0);
      else gl.drawArrays(mode, 0, count);
    }

    /* Textures */

    function texture(source, { mips = false, real = false } = {}) {
      const id = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, id);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      if (mips) {
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
      } else {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      }
      return {
        id,
        real,
        width: source.naturalWidth || source.width,
        height: source.naturalHeight || source.height,
      };
    }

    function bindTexture(unit, tex, location) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex.id);
      gl.uniform1i(location, unit);
    }

    const [color, matte, depth, edgeTight, edgeWide, normal] = await heroImages;

    if (document.fonts) {
      await document.fonts.load('800 100px "Shippori Mincho B1"', '物語あア').catch(() => {});
    }

    const portraitTex = {
      color: texture(color),
      matte: texture(matte),
      depth: texture(depth),
      edgeTight: texture(edgeTight),
      edgeWide: texture(edgeWide),
      normal: texture(normal),
    };
    const screens = {};

    /* Camera */

    const cam = { proj: null, view: null, eye: [0, 0, 0] };

    function setCamera(fov, aspect, near, far, eye, target) {
      cam.proj = matPerspective(fov, aspect, near, far);
      cam.view = matLookAt(eye, target);
      cam.eye = eye;
    }

    function useProgram(p) {
      gl.useProgram(p.id);
      if (p.u.uProj) gl.uniformMatrix4fv(p.u.uProj, false, cam.proj);
      if (p.u.uView) gl.uniformMatrix4fv(p.u.uView, false, cam.view);
      if (p.u.uCamera) gl.uniform3fv(p.u.uCamera, cam.eye);
      return p.u;
    }

    /* Draw calls */

    function drawGlow(center, sx, sy, rgb, power) {
      const u = useProgram(P.glow);
      gl.uniform3fv(u.uCenter, center);
      gl.uniform2f(u.uScale, sx, sy);
      gl.uniform3fv(u.uColor, rgb);
      gl.uniform1f(u.uPower, power);
      draw(quad);
    }

    function drawDust(dust, offset, time, size, power) {
      const u = useProgram(P.dust);
      gl.uniform3fv(u.uOffset, offset);
      gl.uniform1f(u.uTime, time);
      gl.uniform1f(u.uSize, size * pixelRatio);
      gl.uniform1f(u.uPower, power);
      draw(dust);
    }

    function drawRing(modelMatrix, angle, side, power) {
      const u = useProgram(P.ring);
      gl.uniformMatrix4fv(u.uModel, false, modelMatrix);
      gl.uniform1f(u.uAngle, angle);
      gl.uniform1f(u.uPower, power);
      gl.uniform1f(u.uSide, side);
      gl.uniform3fv(u.uRim, RIM);
      gl.uniform3fv(u.uWarm, WARM);
      draw(ringGeometry);
    }

    function drawPortrait(mesh, o) {
      const u = useProgram(P.portrait);
      gl.uniformMatrix4fv(u.uModel, false, matMul(matTranslate(o.x, o.y, o.z), matScale(o.w, o.h, 1)));
      bindTexture(0, portraitTex.color, u.tColor);
      bindTexture(1, portraitTex.matte, u.tMatte);
      bindTexture(2, portraitTex.depth, u.tDepth);
      bindTexture(3, portraitTex.edgeTight, u.tEdgeTight);
      bindTexture(4, portraitTex.edgeWide, u.tEdgeWide);
      bindTexture(5, portraitTex.normal, u.tNormal);
      gl.uniform1f(u.uRelief, o.h * 0.2);
      gl.uniform3fv(u.uLight, o.light);
      gl.uniform3fv(u.uRim, RIM);
      gl.uniform3fv(u.uWarm, WARM);
      gl.uniform1f(u.uPower, o.power);
      gl.uniform1f(u.uFill, o.fill);
      gl.uniform1f(u.uHalo, o.halo);
      gl.uniform1f(u.uFloorFade, o.floorFade);
      draw(mesh);
    }

    function panel(tex, w, h, options = {}) {
      return {
        tex,
        w,
        h,
        pad: 0.32,
        radius: 0.09,
        tint: 0,
        fog: 0.03,
        near: 0.5,
        mirror: 0,
        floor: 0,
        opacity: 1,
        x: 0,
        y: 0,
        z: 0,
        yaw: 0,
        flip: 1,
        ...options,
      };
    }

    function drawPanels(list) {
      const u = useProgram(P.panel);
      list.forEach((p) => {
        const full = [p.w + p.pad * 2, p.h + p.pad * 2];
        gl.uniformMatrix4fv(u.uModel, false, matMul(
          matTranslate(p.x, p.y, p.z), matRotY(p.yaw), matScale(full[0], full[1] * p.flip, 1)
        ));
        bindTexture(0, p.tex, u.tMap);
        gl.uniform2f(u.uSize, p.w, p.h);
        gl.uniform1f(u.uPad, p.pad);
        gl.uniform1f(u.uRadius, p.radius);
        gl.uniform1f(u.uOpacity, p.opacity);
        gl.uniform1f(u.uTint, p.tint);
        gl.uniform1f(u.uFog, p.fog);
        gl.uniform1f(u.uMirror, p.mirror);
        gl.uniform1f(u.uFloor, p.floor);
        gl.uniform1f(u.uNear, p.near);
        draw(quad);
      });
    }

    function drawBackdrop(top, bottom, glowY, glow) {
      const u = useProgram(P.backdrop);
      gl.uniform3fv(u.uTop, top);
      gl.uniform3fv(u.uBottom, bottom);
      gl.uniform1f(u.uGlowY, glowY);
      gl.uniform1f(u.uGlow, glow);
      draw(quad);
    }

    function drawFloor(y, size, fade) {
      const u = useProgram(P.floor);
      gl.uniformMatrix4fv(u.uModel, false, matMul(
        matTranslate(0, y, 0), matRotX(-Math.PI / 2), matScale(size, size, 1)
      ));
      gl.uniform1f(u.uFade, fade);
      draw(quad);
    }

    function drawStrip(x, y, length) {
      const u = useProgram(P.strip);
      gl.uniformMatrix4fv(u.uModel, false, matMul(
        matTranslate(x, y, -length / 2 + 6), matRotX(-Math.PI / 2), matScale(0.1, length, 1)
      ));
      draw(quad);
    }

    /* 8. Film scenes */

    const quality = lowPower ? { segments: 110, dust: 90 } : { segments: 190, dust: 220 };
    const portraitMesh = gridGeometry(quality.segments, Math.round(quality.segments / PORTRAIT_ASPECT));

    function orbitScene() {
      const DIST = 6;
      const FOV = 30;
      const dust = dustGeometry(quality.dust, [7, 5, 5]);
      const shape = { x: 0, y: 0, z: 0, w: 1, h: 1 };
      const head = [0, 0, 0];
      let ringBase = matTranslate(0, 0, 0);
      let aspect = 1;

      return {
        resize(ratio) {
          aspect = ratio;
          const visible = 2 * DIST * Math.tan((FOV * Math.PI) / 360);
          const wide = ratio >= 1;
          const h = wide
            ? visible * 1.04
            : Math.min(visible * 0.78, (visible * ratio * 1.5) / PORTRAIT_ASPECT);
          const w = h * PORTRAIT_ASPECT;
          // Phones: head left of center, leaving the title column clear on the right.
          const centerX = wide ? 0 : -visible * ratio * 0.15;
          const drop = wide ? visible * 0.135 : visible * 0.015;
          Object.assign(shape, { w, h, x: centerX - (HEAD_U - 0.5) * w, y: -visible / 2 + h / 2 - drop });
          head[0] = centerX;
          head[1] = shape.y + h * 0.27;

          // Local +Y becomes the near side, tipped down so the ring reads as an ellipse.
          const radius = h * 0.43;
          ringBase = matMul(
            matTranslate(centerX, shape.y + h * 0.02, 0),
            matRotZ(0.1),
            matRotX(Math.PI / 2 + 0.3),
            matScale(radius, radius, radius)
          );
        },
        render(p, t, pointer, reveal) {
          const yaw = mix(-0.26, 0.26, p) + pointer.x * 0.035;
          const pitch = -pointer.y * 0.02;
          const dist = mix(DIST, DIST * 0.93, smooth(0, 1, p));
          setCamera(FOV, aspect, 0.1, 40, [Math.sin(yaw) * dist, pitch * dist, Math.cos(yaw) * dist], [0, 0, 0]);

          // One full turn of light across the scene, with a slow drift while idle.
          const angle = -2.2 + p * TAU + t * 0.05;
          const l = [Math.cos(angle), 0.24, Math.sin(angle)];
          const ll = Math.hypot(...l);
          const light = l.map((v) => v / ll);

          const behind = smooth(0.4, -0.8, light[2]);
          drawGlow([head[0] + light[0] * 0.5, head[1], -1.2], shape.h * 1.9, shape.h * 1.9, RIM, reveal * (0.1 + behind * 0.2));

          // Behind him, so no speck ever lands on his face.
          drawDust(dust, [0, 0, 0], t, 26, reveal);

          const m = ringBase;
          const bead = [
            m[0] * Math.cos(angle) + m[4] * Math.sin(angle) + m[12],
            m[1] * Math.cos(angle) + m[5] * Math.sin(angle) + m[13],
            m[2] * Math.cos(angle) + m[6] * Math.sin(angle) + m[14],
          ];
          const beadSize = shape.h * 0.16;
          const near = Math.sin(angle) > 0;

          drawRing(ringBase, angle, -1, reveal);
          if (!near) drawGlow(bead, beadSize, beadSize, WARM, reveal * 1.5);

          drawPortrait(portraitMesh, {
            ...shape, light, power: reveal, fill: 0.74, halo: 0, floorFade: 0.2,
          });

          drawRing(ringBase, angle, 1, reveal);
          if (near) drawGlow(bead, beadSize, beadSize, WARM, reveal * 1.5);
        },
      };
    }

    function builderScene() {
      const FLOOR = -0.5;
      const dust = dustGeometry(quality.dust, [16, 8, 14]);
      let aspect = 1;

      const layout = [
        ['pcGaiju', -6.4, 2.2, -4.6, 2.9, 1.81, 0.72],
        ['pcKuruma', 6.4, 1.5, -4.6, 2.9, 1.81, -0.72],
        ['logo', 1.75, 3.65, -3.0, 1.45, 1.45, -0.16],
        ['code', -2.1, 3.55, -2.6, 2.2, 1.45, 0.2],
        ['pcTop', 0, 1.45, -3.6, 4.3, 2.69, 0],
        ['type', -3.95, 1.5, -1.5, 1.95, 2.56, 0.5],
        ['palette', 3.95, 2.45, -1.5, 2.45, 1.63, -0.5],
        ['map', 3.45, 0.42, -0.5, 2.05, 1.35, -0.42],
        ['wire', -2.95, 0.12, 1.0, 1.9, 1.25, 0.42],
        ['spTop', 1.75, 0.65, 1.2, 0.9, 1.84, -0.3],
      ];

      const screensUp = layout.map(([key, x, y, z, w, h, yaw]) => panel(screens[key], w, h, {
        x, y, z, yaw, tint: screens[key].real ? 0.7 : 0, fog: 0.022,
      }));
      const reflections = screensUp.map((s) => panel(s.tex, s.w, s.h, {
        x: s.x, z: s.z, yaw: s.yaw, tint: s.tint, fog: 0.022, mirror: 1, floor: FLOOR, flip: -1,
      }));
      const baseY = screensUp.map((s) => s.y);

      return {
        resize(ratio) {
          aspect = ratio;
        },
        render(p, t, pointer) {
          const e = smooth(0, 1, p);
          const z = mix(8.6, 3.6, e);
          // Narrow screens widen the lens so the arrangement still reads as a room.
          setCamera(
            aspect >= 1 ? 38 : 54, aspect, 0.1, 60,
            [pointer.x * 0.22 + mix(-0.5, 0.5, e), mix(1.9, 1.35, e) - pointer.y * 0.1, z],
            [mix(-0.14, 0.14, e), 1.45, -3]
          );

          screensUp.forEach((screen, i) => {
            const lift = Math.sin(t * 0.34 + i * 1.7) * 0.035;
            screen.y = baseY[i] + lift;
            reflections[i].y = 2 * FLOOR - screen.y;

            // The room stays dark for the title, then the screens come on one by one.
            const start = 0.2 + (screensUp.length - i) * 0.011;
            const on = 0.07 + 0.93 * smooth(start, start + 0.1, p);
            screen.opacity = on;
            reflections[i].opacity = on;
          });

          drawBackdrop([0.03, 0.012, 0.07], [0.05, 0.02, 0.11], 0.56, 0.75);
          drawPanels(reflections);
          drawFloor(FLOOR, 60, 0.16);
          drawPanels(screensUp);
          drawDust(dust, [0, 2, 0], t, 34, 1);
        },
      };
    }

    function galleryScene() {
      const FLOOR = -0.6;
      const LENGTH = 40;
      const WALL = 3.7;
      const ROW = 4.5;
      const END = -LENGTH;
      const H = 3.5;
      const dust = dustGeometry(quality.dust, [7, 5, LENGTH]);
      const order = ['spTop', 'pcTop', 'type', 'spGaiju', 'pcKuruma', 'palette', 'spKuruma', 'pcGaiju', 'wire', 'logo'];
      const rows = Math.floor((LENGTH - 6) / ROW);
      const walls = [];
      const reflections = [];
      let aspect = 1;

      for (let i = rows - 1; i >= 0; i -= 1) {
        [-1, 1].forEach((side, s) => {
          const tex = screens[order[(i * 2 + s) % order.length]];
          const tall = tex.height > tex.width;
          const w = tall ? 2.2 : 3.9;
          const h = tall ? 4.5 : w * (tex.height / tex.width);
          const y = FLOOR + 0.55 + h / 2;
          const shared = {
            x: side * WALL,
            z: -3 - i * ROW,
            yaw: -side * 1.14,
            tint: tex.real ? 0.66 : 0,
            fog: 0.045,
            pad: 0.34,
            radius: 0.1,
            near: 0.3,
          };
          walls.push(panel(tex, w, h, { ...shared, y }));
          reflections.push(panel(tex, w, h, { ...shared, y: 2 * FLOOR - y, mirror: 1, floor: FLOOR, flip: -1 }));
        });
      }

      return {
        resize(ratio) {
          aspect = ratio;
        },
        render(p, t, pointer) {
          const walk = 1 - (1 - clamp(p / 0.92)) ** 1.6;
          const z = mix(3.5, END + (aspect >= 1 ? 4.15 : 4.9), walk);
          setCamera(
            aspect >= 1 ? 46 : 62, aspect, 0.1, 120,
            [pointer.x * 0.16, 1.5 - pointer.y * 0.06, z],
            [0, mix(1.5, 1.72, walk), END]
          );

          drawBackdrop([0.015, 0.006, 0.04], [0.03, 0.012, 0.07], 0.52, 0.5);
          drawPanels(reflections);
          drawFloor(FLOOR, 120, 0.09);

          // Strips of light along the floor and ceiling, all running to him.
          useProgram(P.strip);
          [[-2.5, FLOOR + 0.01], [2.5, FLOOR + 0.01], [-1.5, 5.4], [1.5, 5.4]].forEach(([x, y]) => {
            drawStrip(x, y, LENGTH + 8);
          });

          drawGlow([0, 1.6, END - 1.2], 13, 10, RIM, 0.74);
          drawGlow([0, 1.8, END - 1], 6, 5, WARM, 0.3);

          const near = smooth(0.55, 1, p);
          const angle = -Math.PI / 2 + Math.sin(t * 0.3) * 0.5;
          const l = [Math.cos(angle), 0.2, Math.sin(angle)];
          const ll = Math.hypot(...l);
          drawPortrait(portraitMesh, {
            x: -(HEAD_U - 0.5) * H * PORTRAIT_ASPECT,
            y: FLOOR + H / 2 + 0.05,
            z: END,
            w: H * PORTRAIT_ASPECT,
            h: H,
            light: l.map((v) => v / ll),
            power: mix(0.5, 1, near),
            fill: mix(0.12, 0.92, near),
            halo: 0.55,
            floorFade: 0.3,
          });

          drawPanels(walls);
          drawDust(dust, [0, 1.8, -LENGTH / 2], t, 30, 1);
        },
      };
    }

    const scenes = { orbit: orbitScene() };

    /* Size and quality */

    let pixelRatio = Math.min(window.devicePixelRatio || 1, lowPower ? 1.25 : 1.5);

    function resize() {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;
      const w = Math.round(width * pixelRatio);
      const h = Math.round(height * pixelRatio);
      if (canvas.width !== w || canvas.height !== h) { // setting these rebuilds the canvas
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      Object.values(scenes).forEach((scene) => scene.resize(width / height));
    }
    resize();
    const resizing = new ResizeObserver(resize);
    resizing.observe(canvas);

    // Steps resolution down if the device cannot keep up.
    let frames = 0;
    let spent = 0;
    function watch(dt) {
      frames += 1;
      spent += dt;
      if (frames < 50) return;
      const average = spent / frames;
      frames = 0;
      spent = 0;
      if (average > 0.024 && pixelRatio > 1) {
        pixelRatio = Math.max(1, pixelRatio - 0.25);
        resize();
      }
    }

    const still = { x: 0, y: 0 };

    // Each scene is drawn once before it is needed, so nothing hitches later.
    const unseen = Object.values(scenes);
    function warmUp() {
      unseen.splice(0).forEach((scene) => {
        gl.clear(gl.COLOR_BUFFER_BIT);
        scene.render(0.5, 0, still, 0);
      });
    }
    warmUp();
    gl.clear(gl.COLOR_BUFFER_BIT);

    return {
      render(key, p, t, dt, pointer, reveal) {
        warmUp();
        gl.clear(gl.COLOR_BUFFER_BIT);
        scenes[key]?.render(p, t, pointer, reveal);
        watch(dt);
      },
      clear() {
        gl.clear(gl.COLOR_BUFFER_BIT);
      },
      stop() {
        resizing.disconnect();
      },

      // The second and third scenes wait until the visitor can already see the page.
      async loadOtherScenes() {
        const files = [
          'nandemo-top/pc-thumb', 'nandemo-top/sp-thumb',
          'nandemo-gaiju/pc-thumb', 'nandemo-gaiju/sp-thumb',
          'nandemo-kuruma/pc-thumb', 'nandemo-kuruma/sp-thumb',
        ];
        const shots = await Promise.all(files.map((file) => picture(`assets/works/${file}.webp`)));
        if (document.fonts) {
          await document.fonts.load('700 30px "Zen Kaku Gothic New"', 'トップ').catch(() => {});
        }
        Object.assign(P, {
          panel: program(VERT_FLAT, FRAG_PANEL),
          backdrop: program(VERT_BACKDROP, FRAG_BACKDROP),
          floor: program(VERT_FLAT, FRAG_FLOOR),
          strip: program(VERT_FLAT, FRAG_STRIP),
        });
        const [pcTop, spTop, pcGaiju, spGaiju, pcKuruma, spKuruma] =
          shots.map((image) => texture(image, { mips: true, real: true }));
        Object.assign(screens, { pcTop, spTop, pcGaiju, spGaiju, pcKuruma, spKuruma });
        Object.entries(DRAWN).forEach(([name, paint]) => {
          screens[name] = texture(paint(), { mips: true });
        });
        scenes.builder = builderScene();
        scenes.gallery = galleryScene();
        resize();
        unseen.push(scenes.builder, scenes.gallery);
      },
    };
  }

  /* 9. Scene players: Seedance clips, scrubbed by scroll */

  function videoPlayer(src, poster, parent, before) {
    const video = el('video', 'film-layer');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'none';
    video.poster = poster;
    video.setAttribute('aria-hidden', 'true');
    parent.insertBefore(video, before);

    const start = () => video.play().then(() => video.pause()).catch(() => {});
    let settle;
    let woken = false;

    return {
      ready: new Promise((resolve) => { settle = resolve; }),
      wake() {
        if (woken) return;
        woken = true;
        video.addEventListener('loadeddata', settle, { once: true });
        video.addEventListener('error', settle, { once: true });
        video.preload = 'auto';
        video.src = src;
        // iOS will not seek until the video has been started by a touch.
        if (navigator.userActivation?.hasBeenActive) start();
        else window.addEventListener('touchstart', start, { once: true, passive: true });
      },
      show(on) {
        video.style.opacity = on ? 1 : 0;
      },
      seek(p) {
        if (!video.duration || video.seeking) return;
        const time = p * (video.duration - 0.05);
        if (Math.abs(video.currentTime - time) > 0.02) video.currentTime = time;
      },
    };
  }

  function sequencePlayer({ path, frames, ext = 'webp', digits = 4 }, parent, before) {
    const canvas = el('canvas', 'film-layer');
    canvas.setAttribute('aria-hidden', 'true');
    parent.insertBefore(canvas, before);
    const g = canvas.getContext('2d');
    const images = new Array(frames);
    let shown = -1;

    // Coarse frames first, so scrubbing works early. The gaps fill in behind.
    const order = [...new Set([16, 4, 1].flatMap((gap) => (
      Array.from({ length: Math.ceil(frames / gap) }, (_, i) => i * gap)
    )))];
    let settle;
    let woken = false;
    let next = 0;
    function load() {
      if (next >= order.length) return;
      const index = order[next];
      next += 1;
      const image = new Image();
      image.onload = () => {
        images[index] = image;
        settle();
        load();
      };
      image.onerror = () => {
        settle();
        load();
      };
      image.src = `${path}${String(index + 1).padStart(digits, '0')}.${ext}`;
    }

    function nearest(index) {
      for (let d = 0; d < frames; d += 1) {
        if (images[index - d]) return index - d;
        if (images[index + d]) return index + d;
      }
      return -1;
    }

    function paint(index) {
      const image = images[index];
      const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
      const w = image.naturalWidth * scale;
      const h = image.naturalHeight * scale;
      g.drawImage(image, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    }

    function fit() {
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(canvas.clientWidth * ratio);
      canvas.height = Math.round(canvas.clientHeight * ratio);
      shown = -1;
    }
    fit();
    new ResizeObserver(fit).observe(canvas);

    return {
      ready: new Promise((resolve) => { settle = resolve; }),
      wake() {
        if (woken) return;
        woken = true;
        for (let i = 0; i < 6; i += 1) load();
      },
      show(on) {
        canvas.style.opacity = on ? 1 : 0;
      },
      seek(p) {
        const index = nearest(Math.round(p * (frames - 1)));
        if (index < 0 || index === shown) return;
        shown = index;
        paint(index);
      },
    };
  }

  /* 10. Scroll, type and motion */

  function startScroll() {
    gsap.registerPlugin(ScrollTrigger);
    // Masked characters would each hold a GPU layer while waiting to rise.
    // Only the pillars, which move constantly, opt back in below.
    gsap.config({ force3D: false });
    lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  function setupReelText(reel) {
    const timeline = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: { trigger: reel.el, start: 'top top', end: 'bottom bottom', scrub: 0.4 },
    });

    $$('[data-in]', reel.el).forEach((node) => {
      const from = Number(node.dataset.in);
      const to = Number(node.dataset.out);

      // Subtitles move phrase by phrase. Per character costs a GPU layer each,
      // which cut the hero from 42 to 14 fps on integrated graphics.
      if (node.matches('.caption, .reel-title')) {
        const phrases = $$('.ph', node);
        gsap.set(node, { visibility: 'visible' });
        timeline.fromTo(phrases, { autoAlpha: 0, yPercent: 46 }, {
          autoAlpha: 1, yPercent: 0, duration: 0.05, stagger: 0.022,
        }, from);
        timeline.to(phrases, {
          autoAlpha: 0, yPercent: -40, duration: 0.04, stagger: 0.012,
        }, to - 0.06);
        return;
      }

      if (from >= 0) {
        timeline.fromTo(node, { autoAlpha: 0, y: 28 }, { autoAlpha: 1, y: 0, duration: 0.05 }, from);
      }
      if (to <= 1) {
        timeline.to(node, { autoAlpha: 0, y: -24, duration: 0.05 }, to - 0.05);
      }
    });

    timeline.set({}, {}, 1); // keeps the timeline exactly one scroll long
    return timeline;
  }

  function setupTitle(orbitTimeline) {
    const first = splitChars($('#title-first'), { mask: true });
    const second = splitChars($('#title-second'), { mask: true });

    // The column fades from white to lavender, one character at a time.
    [first, second].forEach((chars) => {
      chars.forEach((ch, i) => {
        const t = i / Math.max(chars.length - 1, 1);
        ch.style.color = `rgb(${Math.round(mix(255, 176, t))} ${Math.round(mix(255, 146, t))} 255)`;
      });
    });
    gsap.set([...first, ...second], { yPercent: 118 });

    // The two columns drift apart and dissolve.
    orbitTimeline.to('#title-first', { y: -150, autoAlpha: 0, duration: 0.08 }, 0.1);
    orbitTimeline.to('#title-second', { y: 150, autoAlpha: 0, duration: 0.08 }, 0.1);

    return { first, second };
  }

  function setupHeadings() {
    $$('[data-rise]').forEach((node) => {
      const chars = lowPower ? splitPhrases(node) : splitChars(node, { mask: true });
      gsap.set(chars, { yPercent: 118 });
      ScrollTrigger.create({
        trigger: node,
        start: 'top 86%',
        once: true,
        onEnter: () => gsap.to(chars, {
          yPercent: 0,
          duration: 1.15,
          ease: 'power4.out',
          stagger: 0.022,
          onComplete: () => node.classList.add('is-done'),
        }),
      });
    });
  }

  function setupStats() {
    $$('[data-count]').forEach((node, i) => {
      const end = Number(node.dataset.count);
      const state = { value: 0 };
      node.textContent = '0';
      ScrollTrigger.create({
        trigger: node,
        start: 'top 92%',
        once: true,
        onEnter: () => gsap.to(state, {
          value: end,
          duration: 1.8,
          delay: i * 0.12,
          ease: 'expo.out',
          onUpdate: () => {
            const shown = String(Math.round(state.value));
            if (node.textContent !== shown) node.textContent = shown;
          },
        }),
      });
    });
  }

  function setupMission() {
    const chars = splitChars($('#mission-title'));
    const timeline = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: { trigger: '#mission', start: 'top top', end: 'bottom bottom', scrub: 0.4 },
    });
    timeline.fromTo(chars, { opacity: 0.12 }, {
      opacity: 1, duration: 0.08, stagger: { amount: 0.66 },
    }, 0.02);
    timeline.fromTo('#mission-note', { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.12 }, 0.78);
    timeline.set({}, {}, 1);
  }

  function setupPillars() {
    const track = $('#pillars-track');
    const last = track.lastElementChild;
    const slide = gsap.to(track, {
      // Measured from the last panel, because the kanji's glow overflows the track.
      x: () => -(last.offsetLeft + last.offsetWidth - window.innerWidth),
      ease: 'none',
      force3D: true,
      scrollTrigger: {
        trigger: '#pillars',
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.4,
        invalidateOnRefresh: true,
      },
    });

    $$('.pillar').forEach((pillar) => {
      gsap.fromTo($('.pillar__kanji', pillar), { xPercent: 20 }, {
        xPercent: -20,
        ease: 'none',
        force3D: true,
        scrollTrigger: {
          trigger: pillar, containerAnimation: slide, start: 'left right', end: 'right left', scrub: true,
        },
      });
      // The fill rises as a window over a counter-moving glyph: transforms only, no repaint.
      const rise = {
        ease: 'none',
        force3D: true,
        scrollTrigger: {
          trigger: pillar, containerAnimation: slide, start: 'left 75%', end: 'left 8%', scrub: true,
        },
      };
      gsap.fromTo($('.pillar__window', pillar), { yPercent: 100 }, { yPercent: 0, ...rise });
      gsap.fromTo($('.pillar__fill', pillar), { yPercent: -100 }, { yPercent: 0, ...rise });
    });
  }

  function setupMarquee() {
    const row = $('#marquee-row');
    let width = row.scrollWidth / 2;
    ScrollTrigger.addEventListener('refresh', () => { width = row.scrollWidth / 2; });
    let x = 0;
    let lean = 0;
    let visible = false;

    ScrollTrigger.create({
      trigger: '#marquee',
      start: 'top bottom',
      end: 'bottom top',
      onToggle: (self) => { visible = self.isActive; },
    });

    gsap.ticker.add((time, delta) => {
      if (!visible) return;
      const velocity = lenis.velocity;
      x -= (46 + Math.abs(velocity) * 16) * (delta / 1000);
      if (x < -width) x += width;
      lean += (clamp(velocity * 0.22, -9, 9) - lean) * 0.12;
      row.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0) skewX(${(-lean).toFixed(2)}deg)`;
    });
  }

  function setupWordmark() {
    const chars = splitChars($('#wordmark'), { mask: true });
    gsap.fromTo(chars, { yPercent: 112 }, {
      yPercent: 0,
      ease: 'none',
      stagger: 0.08,
      scrollTrigger: { trigger: '#footer', start: 'top bottom', end: 'bottom bottom', scrub: 0.5 },
    });
  }

  function setupCursor() {
    if (!finePointer) return;
    root.classList.add('has-cursor');
    const node = $('#cursor');
    const label = $('#cursor-label');
    const toX = gsap.quickTo(node, 'x', { duration: 0.16, ease: 'power3' });
    const toY = gsap.quickTo(node, 'y', { duration: 0.16, ease: 'power3' });

    window.addEventListener('pointermove', (event) => {
      toX(event.clientX);
      toY(event.clientY);
    }, { passive: true });

    document.addEventListener('pointerover', (event) => {
      const target = event.target.closest?.('[data-cursor], a, button, label');
      const text = target?.dataset.cursor ?? '';
      label.textContent = text;
      node.classList.toggle('is-label', Boolean(text));
      node.classList.toggle('is-link', Boolean(target) && !text);
    });
  }

  function setupMagnets() {
    if (!finePointer) return;
    $$('.btn').forEach((button) => {
      const toX = gsap.quickTo(button, 'x', { duration: 0.5, ease: 'power3' });
      const toY = gsap.quickTo(button, 'y', { duration: 0.5, ease: 'power3' });
      button.addEventListener('pointermove', (event) => {
        const box = button.getBoundingClientRect();
        toX((event.clientX - box.left - box.width / 2) * 0.26);
        toY((event.clientY - box.top - box.height / 2) * 0.36);
      });
      button.addEventListener('pointerleave', () => {
        toX(0);
        toY(0);
      });
    });
  }

  function setupNav() {
    const nav = $('#nav');
    ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate: (self) => {
        nav.classList.toggle('is-hidden', self.direction === 1 && self.scroll() > window.innerHeight * 0.6);
      },
    });
    return nav;
  }

  /* The film behind the page: picks the scene, drives it, and shrinks it back
     behind any sheet that rises over it, the way an iPhone sheet does. */

  function runFilm(state) {
    const cinema = $('#cinema');
    const canvas = $('#film');
    const dim = $('#cinema-dim');
    const titlecard = $('#titlecard');

    const reels = state.reels;
    const sheets = $$('.sheet').map((node) => ({ node, top: 0, bottom: 0 }));

    function measure() {
      const y = window.scrollY;
      [...reels, ...sheets].forEach((item) => {
        const box = (item.el ?? item.node).getBoundingClientRect();
        item.top = box.top + y;
        item.bottom = item.top + box.height;
      });
    }
    measure();
    ScrollTrigger.addEventListener('refresh', measure);

    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    window.addEventListener('pointermove', (event) => {
      pointer.tx = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.ty = (event.clientY / window.innerHeight) * 2 - 1;
    }, { passive: true });

    let shownCover = -1;
    let drawn = false;
    const started = performance.now();

    gsap.ticker.add((time, delta) => {
      const dt = Math.min(delta / 1000, 0.1);
      const y = window.scrollY;
      const view = window.innerHeight;

      let cover = 0;
      sheets.forEach((sheet) => {
        const entering = clamp((y + view - sheet.top) / view);
        const leaving = clamp((sheet.bottom - y) / view);
        cover = Math.max(cover, Math.min(entering, leaving));
      });

      if (Math.abs(cover - shownCover) > 0.001) {
        shownCover = cover;
        const eased = cover * cover * (3 - 2 * cover);
        cinema.style.transform = cover > 0 ? `scale(${(1 - eased * 0.1).toFixed(4)})` : 'none';
        // Animating the radius repaints the whole film, too costly on a phone.
        const radius = lowPower ? (cover > 0 ? 28 : 0) : eased * 48;
        cinema.style.borderRadius = `${radius.toFixed(1)}px`;
        cinema.style.visibility = cover >= 0.999 ? 'hidden' : 'visible';
        dim.style.opacity = (eased * 0.72).toFixed(3);
      }

      let active = null;
      let best = 0;
      reels.forEach((reel) => {
        if (y + view * 3 > reel.top && y < reel.bottom) reel.media?.wake();
        reel.target = clamp((y - reel.top) / Math.max(reel.bottom - reel.top - view, 1));
        const overlap = Math.min(y + view, reel.bottom) - Math.max(y, reel.top);
        if (overlap > best) {
          best = overlap;
          active = reel;
        }
      });
      if (cover >= 0.999) active = null;

      reels.forEach((reel) => {
        if (reel === active) {
          reel.progress += (reel.target - reel.progress) * (1 - Math.exp(-dt * 7));
        } else {
          reel.progress = reel.target;
        }
        reel.media?.show(reel === active);
      });

      titlecard.style.visibility = active === reels[0] ? 'visible' : 'hidden';

      if (active?.media) {
        active.media.seek(active.progress);
        if (drawn) {
          state.film?.clear();
          drawn = false;
        }
        return;
      }

      if (!state.film) return;
      if (active) {
        pointer.x += (pointer.tx - pointer.x) * (1 - Math.exp(-dt * 3));
        pointer.y += (pointer.ty - pointer.y) * (1 - Math.exp(-dt * 3));
        const t = (performance.now() - started) / 1000;
        state.film.render(active.key, active.progress, t, dt, pointer, state.reveal);
        drawn = true;
      } else if (drawn) {
        state.film.clear();
        drawn = false;
      }
    });

    // A phone can drop the film while the browser sits in the background.
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      state.film?.stop();
      state.film = null;
    });
    canvas.addEventListener('webglcontextrestored', async () => {
      try {
        const film = await createFilm(canvas, () => {});
        await film.loadOtherScenes();
        state.film = film;
      } catch (error) {
        console.error('Film could not restart', error);
      }
    });
  }

  function mountMedia(reels) {
    const cinema = $('#cinema');
    const dim = $('#cinema-dim');
    reels.forEach((reel) => {
      const { video, sequence } = SITE.scenes[reel.key];
      if (sequence && (narrow.matches || !video)) {
        reel.media = sequencePlayer(sequence, cinema, dim);
      } else if (video) {
        reel.media = videoPlayer(video, `assets/poster-${reel.key}.webp`, cinema, dim);
      }
      if (reel.media && reel.key === 'orbit') root.classList.add('has-orbit-media');
    });
  }

  /* Opening: a line of light fills, the curtains part, the title rises while
     the light on him ignites. */

  function openCurtain(state, title, nav, ready, opened) {
    const loader = $('#loader');
    const mark = splitChars($('#loader-mark'), { mask: true }); // it rises in CSS, before any script runs
    const bar = $('#loader-bar');
    const part = lowPower ? 0.8 : 1.15;

    gsap.set(['.intro__lead', '.actions'], { autoAlpha: 0, y: 18 });
    nav.classList.add('is-hidden');

    const finish = () => {
      gsap.killTweensOf(bar);
      gsap.timeline()
        .to(bar, { scaleX: 1, duration: 0.3, ease: 'power2.out' })
        .to(mark, { yPercent: -118, duration: lowPower ? 0.4 : 0.6, ease: 'power3.in', stagger: 0.03 }, '+=0.1')
        .to('#loader-line', { autoAlpha: 0, duration: 0.3 }, '<')
        .to('.loader__curtain--top', { yPercent: -101, duration: part, ease: 'expo.inOut' }, '-=0.15')
        .to('.loader__curtain--bottom', { yPercent: 101, duration: part, ease: 'expo.inOut' }, '<')
        .add(() => {
          // The visitor can scroll the moment the page is open, not after the title settles.
          loader.remove();
          lenis.start();
        }, `<${part}`)
        // On a slow phone the page opens first, and the film fades in when it is ready.
        .add(() => ready.then(() => gsap.to(state, { reveal: 1, duration: 2.6, ease: 'power2.inOut' })), `<-${part - 0.15}`)
        .to(title.first, { yPercent: 0, duration: 1.3, ease: 'power4.out', stagger: 0.07 }, '<0.55')
        .to(title.second, { yPercent: 0, duration: 1.3, ease: 'power4.out', stagger: 0.06 }, '<0.28')
        .to(['.intro__lead', '.actions'], { autoAlpha: 1, y: 0, duration: 1, ease: 'power3.out', stagger: 0.12 }, '<0.5')
        .add(() => {
          nav.classList.remove('is-hidden');
          $$('.titlecard__col').forEach((col) => col.classList.add('is-done'));
          opened();
        }, '<');
    };

    const slowest = new Promise((resolve) => { window.setTimeout(resolve, lowPower ? 3000 : 7000); });
    const shortest = new Promise((resolve) => { window.setTimeout(resolve, lowPower ? 500 : 1100); });
    Promise.all([Promise.race([ready, slowest]), shortest]).then(finish);

    return (share) => gsap.to(bar, { scaleX: share * 0.9, duration: 0.4, ease: 'power1.out', overwrite: true });
  }

  /* 11. Start */

  function goStill() {
    root.classList.add('still');
    $('#loader').remove();
  }

  function start() {
    initContact();
    initWorks();

    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[href^="#"]');
      const hash = link?.getAttribute('href');
      if (!hash || hash === '#') return;
      event.preventDefault();
      goTo(hash);
    });

    const ready = window.gsap && window.ScrollTrigger && window.Lenis;
    const needsFilm = Object.values(SITE.scenes).some(({ video, sequence }) => !video && !sequence);
    const canFilm = !needsFilm || document.createElement('canvas').getContext('webgl2');
    if (reduced || lightData || !ready || !canFilm) {
      goStill();
      return;
    }

    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);

    startScroll();
    lenis.stop();

    const state = {
      film: null,
      reveal: 0,
      reels: $$('[data-reel]').map((node) => ({
        el: node, key: node.dataset.reel, progress: 0, target: 0, top: 0, bottom: 0, media: null,
      })),
    };

    mountMedia(state.reels);

    // The film goes first, so its images download while the page sets itself up.
    let report = () => {};
    const filmReady = (async () => {
      if (!needsFilm) {
        await state.reels[0].media.ready;
        return;
      }
      try {
        state.film = await createFilm($('#film'), (share) => report(share));
      } catch (error) {
        console.error('Film could not start', error);
      }
    })();

    const timelines = state.reels.map(setupReelText);
    const title = setupTitle(timelines[0]);
    setupHeadings();
    setupStats();
    setupMission();
    setupPillars();
    setupMarquee();
    setupWordmark();
    setupCursor();
    setupMagnets();
    const nav = setupNav();

    runFilm(state);

    const loadRest = () => filmReady
      .then(() => state.film?.loadOtherScenes())
      .catch((error) => console.error('Film scenes could not load', error));
    report = openCurtain(state, title, nav, filmReady, loadRest);

    if (document.fonts) document.fonts.ready.then(() => ScrollTrigger.refresh());
  }

  start();
})();
