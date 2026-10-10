// Public gallery: reads gallery.json (kept up to date from beheer.html) and renders a masonry grid + lightbox.
(() => {
  const section = document.getElementById('galerij');
  if (!section) return;
  const grid = document.getElementById('galleryGrid');
  const moreBtn = document.getElementById('galleryMore');
  const navLink = document.querySelector('a[href="#galerij"]');
  const box = document.getElementById('lightbox');
  const boxImg = box.querySelector('img');
  const boxCap = box.querySelector('.lb-cap');
  const boxCount = box.querySelector('.lb-count');
  const PAGE = 9;
  // only photos from our own fotos/ folder are ever rendered
  const SAFE = /^fotos\/[\w.\-]+\.(jpe?g|png|webp)$/i;

  let items = [], shown = 0, current = 0, lastFocus = null;

  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { threshold: .05, rootMargin: '0px 0px 12% 0px' });

  const clean = v => (typeof v === 'string' ? v.trim().slice(0, 140) : '');

  function card(item, index, delay) {
    const fig = document.createElement('figure');
    fig.className = 'g-item reveal';
    fig.style.setProperty('--d', delay + 's');
    if (item.w > 0 && item.h > 0) fig.style.aspectRatio = `${item.w} / ${item.h}`;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'g-btn';
    btn.setAttribute('aria-label', item.caption ? `Open foto: ${item.caption}` : 'Open foto');
    btn.addEventListener('click', () => open(index));

    const img = document.createElement('img');
    img.src = item.file;
    img.alt = item.caption || 'Foto van Sportprijzen Salland';
    img.loading = 'lazy';
    img.decoding = 'async';
    if (item.w > 0 && item.h > 0) { img.width = item.w; img.height = item.h; }
    btn.append(img);
    fig.append(btn);

    if (item.caption) {
      const cap = document.createElement('figcaption');
      cap.textContent = item.caption;
      fig.append(cap);
    }
    io.observe(fig);
    return fig;
  }

  function showMore() {
    const end = Math.min(shown + PAGE, items.length);
    for (let i = shown; i < end; i++) grid.append(card(items[i], i, (i - shown) % 3 * .08));
    shown = end;
    moreBtn.hidden = shown >= items.length;
  }

  // lightbox ----------------------------------------------------------------
  function show(i) {
    current = (i + items.length) % items.length;
    const it = items[current];
    box.classList.remove('ready');
    boxImg.onload = () => box.classList.add('ready');
    boxImg.src = it.file;
    boxImg.alt = it.caption || 'Foto van Sportprijzen Salland';
    boxCap.textContent = it.caption;
    boxCount.textContent = `${current + 1} / ${items.length}`;
    // warm the cache for the neighbours
    [current + 1, current - 1].forEach(n => { new Image().src = items[(n + items.length) % items.length].file; });
  }
  function open(i) {
    lastFocus = document.activeElement;
    show(i);
    if (typeof box.showModal === 'function') box.showModal(); else box.setAttribute('open', '');
  }
  function close() {
    if (typeof box.close === 'function') box.close(); else box.removeAttribute('open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  const multi = () => items.length > 1;
  box.querySelector('.lb-close').addEventListener('click', close);
  box.querySelector('.lb-prev').addEventListener('click', () => multi() && show(current - 1));
  box.querySelector('.lb-next').addEventListener('click', () => multi() && show(current + 1));
  box.addEventListener('click', e => { if (e.target === box || e.target.classList.contains('lb-stage')) close(); });
  box.addEventListener('keydown', e => {
    if (!multi()) return;
    if (e.key === 'ArrowRight') show(current + 1);
    if (e.key === 'ArrowLeft') show(current - 1);
  });
  // swipe on touch screens
  let x0 = null;
  box.addEventListener('pointerdown', e => { x0 = e.pointerType === 'touch' ? e.clientX : null; });
  box.addEventListener('pointerup', e => {
    if (x0 === null || !multi()) return;
    const dx = e.clientX - x0; x0 = null;
    if (Math.abs(dx) > 50) show(current + (dx < 0 ? 1 : -1));
  });

  // load ---------------------------------------------------------------------
  fetch('gallery.json', { cache: 'no-cache' })
    .then(r => (r.ok ? r.json() : []))
    .catch(() => [])
    .then(list => {
      items = (Array.isArray(list) ? list : [])
        .filter(it => it && typeof it.file === 'string' && SAFE.test(it.file))
        .map(it => ({ file: it.file, caption: clean(it.caption), w: +it.w || 0, h: +it.h || 0 }));
      if (!items.length) return; // nothing to show yet: the section stays hidden
      section.hidden = false;
      if (navLink) navLink.hidden = false;
      box.classList.toggle('single', !multi());
      showMore();
    });
  moreBtn.addEventListener('click', showMore);
})();
