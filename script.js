(() => {
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;

  // Nav, progress bar, floating button
  const nav = $('#nav'), bar = $('#progress'), fab = $('.fab'), contact = $('#contact');
  const onScroll = () => {
    const y = scrollY, h = document.documentElement.scrollHeight - innerHeight;
    nav.classList.toggle('scrolled', y > 40);
    bar.style.width = (y / h * 100) + '%';
    // Floating message button: only after the hero, and not once the contact form itself is in view
    fab.classList.toggle('show', y > innerHeight * .8 && contact.getBoundingClientRect().top > innerHeight * .6);
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
  }), { threshold: .05, rootMargin: '0px 0px 12% 0px' });
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

  // Contact form → sent straight to the company's inbox through FormSubmit (no mail app needed)
  const MAIL_TO = 'info@sportprijzensalland.nl';
  const form = $('#form'), note = $('#note'), submitBtn = $('button[type=submit]', form);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    let firstBad = null;
    $$('[required]', form).forEach(i => {
      const bad = !i.value.trim() || (i.type === 'email' && !/^\S+@\S+\.\S+$/.test(i.value));
      i.parentElement.classList.toggle('err', bad);
      if (bad && !firstBad) firstBad = i;
    });
    if (firstBad) {
      note.textContent = 'Vul alsjeblieft naam, een geldig e-mailadres en je bericht in.';
      firstBad.focus({ preventScroll: true });
      firstBad.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
      return;
    }

    const f = Object.fromEntries(new FormData(form));
    if (f._honey) return; // spam trap: real visitors never fill this in
    submitBtn.disabled = true;
    note.textContent = 'Bericht wordt verstuurd…';
    try {
      const res = await fetch(`https://formsubmit.co/ajax/${MAIL_TO}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          Naam: f.naam, 'E-mail': f.email, Telefoon: f.telefoon || '-', Bericht: f.bericht,
          _subject: f.onderwerp ? `Website: ${f.onderwerp}` : 'Nieuw bericht via de website',
          _replyto: f.email, _template: 'table', _captcha: 'false'
        })
      });
      const data = await res.json();
      if (!res.ok || data.success === 'false') throw new Error(data.message || res.status);
      form.reset();
      note.textContent = 'Bedankt! Je bericht is verstuurd. We nemen zo snel mogelijk contact met je op.';
    } catch (err) {
      console.error('Formulier versturen mislukt:', err);
      note.innerHTML = `Versturen is niet gelukt. Bel <a href="tel:+31612029129">06-12029129</a> of mail naar <a href="mailto:${MAIL_TO}">${MAIL_TO}</a>.`;
    } finally {
      submitBtn.disabled = false;
    }
  });
  $$('.field input, .field textarea').forEach(i => i.addEventListener('input', () => i.parentElement.classList.remove('err')));
})();
