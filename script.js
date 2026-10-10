(() => {
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;

  // Nav, progress bar, floating button
  const nav = $('#nav'), bar = $('#progress'), fab = $('.fab');
  const onScroll = () => {
    const y = scrollY, h = document.documentElement.scrollHeight - innerHeight;
    nav.classList.toggle('scrolled', y > 40);
    bar.style.width = (y / h * 100) + '%';
    fab.classList.toggle('show', y > innerHeight * .8);
    if (!reduce) $('#heroBg').style.translate = `0 ${Math.min(y, innerHeight) * .18}px`;
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Mobile menu
  const burger = $('#burger'), links = $('#links');
  const setMenu = open => {
    links.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', open);
  };
  burger.addEventListener('click', () => setMenu(!links.classList.contains('open')));
  $$('a', links).forEach(a => a.addEventListener('click', () => setMenu(false)));

  // Scroll reveal
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { threshold: .15, rootMargin: '0px 0px -6% 0px' });
  $$('.reveal, .photo-stack, .steps li').forEach(el => io.observe(el));

  if (fine && !reduce) {
    // Spotlight following the cursor
    const sp = $('#spotlight');
    addEventListener('pointermove', e => {
      sp.style.setProperty('--x', e.clientX + 'px');
      sp.style.setProperty('--y', e.clientY + 'px');
    }, { passive: true });

    // 3D tilt + glow on cards
    $$('.tilt').forEach(el => {
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        el.style.transform = `perspective(900px) rotateX(${(.5 - py) * 8}deg) rotateY(${(px - .5) * 10}deg) translateY(-4px)`;
        el.style.setProperty('--mx', px * 100 + '%');
        el.style.setProperty('--my', py * 100 + '%');
      });
      el.addEventListener('pointerleave', () => el.style.transform = '');
    });

    // Magnetic buttons
    $$('.magnetic').forEach(b => {
      b.addEventListener('pointermove', e => {
        const r = b.getBoundingClientRect();
        b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .2}px, ${(e.clientY - r.top - r.height / 2) * .3}px)`;
      });
      b.addEventListener('pointerleave', () => b.style.transform = '');
    });
  }

  // Gold sparkles in the hero
  const cv = $('#sparkles'), ctx = cv.getContext('2d');
  let W, H, parts = [], running = true;
  const resize = () => {
    const d = Math.min(devicePixelRatio || 1, 2);
    W = cv.width = cv.offsetWidth * d; H = cv.height = cv.offsetHeight * d;
    parts = Array.from({ length: Math.round(cv.offsetWidth / 18) }, () => spawn(true));
  };
  const spawn = init => ({
    x: Math.random() * W, y: init ? Math.random() * H : H + 20,
    r: (Math.random() * 2.2 + .6) * (W / cv.offsetWidth),
    v: Math.random() * .5 + .2, a: Math.random() * Math.PI * 2, s: Math.random() * .03 + .01
  });
  const tick = () => {
    if (running) {
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.y -= p.v; p.a += p.s; p.x += Math.sin(p.a) * .4;
        if (p.y < -20) Object.assign(p, spawn(false));
        const t = .5 + Math.sin(p.a * 3) * .5;
        ctx.globalAlpha = t * .85;
        ctx.fillStyle = '#f5dc92';
        ctx.shadowColor = '#d8b45a'; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
      }
    }
    requestAnimationFrame(tick);
  };
  if (!reduce) {
    resize(); addEventListener('resize', resize); tick();
    new IntersectionObserver(([e]) => running = e.isIntersecting).observe(cv);
  }

  // FAQ: only one open at a time
  $$('.faq details').forEach(d => d.addEventListener('toggle', () => {
    if (d.open) $$('.faq details').forEach(o => o !== d && (o.open = false));
  }));

  // Contact form → opens the visitor's e-mail app with the message prefilled
  const form = $('#form'), note = $('#note');
  form.addEventListener('submit', e => {
    e.preventDefault();
    let ok = true;
    $$('[required]', form).forEach(i => {
      const bad = !i.value.trim() || (i.type === 'email' && !/^\S+@\S+\.\S+$/.test(i.value));
      i.parentElement.classList.toggle('err', bad);
      if (bad) ok = false;
    });
    if (!ok) { note.textContent = 'Vul alsjeblieft naam, een geldig e-mailadres en je bericht in.'; return; }
    const f = Object.fromEntries(new FormData(form));
    const body = `${f.bericht}\n\n— ${f.naam}\nE-mail: ${f.email}${f.telefoon ? '\nTelefoon: ' + f.telefoon : ''}`;
    const subject = f.onderwerp || 'Bericht via de website';
    location.href = `mailto:info@sportprijzensalland.nl?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    note.textContent = 'Je e-mailprogramma is geopend – druk daar op verzenden. Lukt dat niet? Bel of app ons gerust.';
  });
  $$('.field input, .field textarea').forEach(i => i.addEventListener('input', () => i.parentElement.classList.remove('err')));
})();
