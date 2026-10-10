// Gallery admin. Writes photos into this repository through the GitHub API.
// Who may do this is decided by GitHub: only a token with write access to the repo works.
(() => {
  const OWNER = 'TristanFristi';
  const REPO = 'tristan605.github.io';
  const BRANCH = 'main';
  const MAX_SIDE = 1800;      // longest edge after resizing, in px
  const MAX_FILES = 20;
  const REPO_API = `https://api.github.com/repos/${OWNER}/${REPO}`;

  const $ = id => document.getElementById(id);
  const el = {
    loginCard: $('loginCard'), loginForm: $('loginForm'), token: $('token'), remember: $('remember'),
    loginBtn: $('loginBtn'), loginNote: $('loginNote'),
    dash: $('dash'), who: $('who'), logout: $('logout'),
    drop: $('drop'), files: $('files'), pending: $('pending'), uploadBtn: $('uploadBtn'),
    clearBtn: $('clearBtn'), uploadNote: $('uploadNote'),
    current: $('current'), count: $('count'), currentNote: $('currentNote')
  };

  let token = '';
  let queue = [];           // photos waiting to be uploaded
  let busy = false;

  // --- small helpers --------------------------------------------------------
  const store = {
    get: () => { try { return localStorage.getItem('gh-token') || ''; } catch { return ''; } },
    set: v => { try { localStorage.setItem('gh-token', v); } catch { /* private mode */ } },
    del: () => { try { localStorage.removeItem('gh-token'); } catch { /* ignore */ } }
  };
  const say = (node, text, kind = '') => { node.textContent = text; node.className = 'a-note' + (kind ? ' ' + kind : ''); };
  const safePath = p => p.split('/').map(encodeURIComponent).join('/');
  const toB64 = bytesOrString => {
    const bytes = typeof bytesOrString === 'string' ? new TextEncoder().encode(bytesOrString) : bytesOrString;
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  const fromB64 = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0)));

  class ApiError extends Error { constructor(status, msg, friendly = false) { super(msg); this.status = status; this.friendly = friendly; } }

  async function gh(url, { method = 'GET', body } = {}) {
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store'
      });
    } catch {
      throw new ApiError(0, 'Geen verbinding met GitHub. Controleer je internet en probeer het opnieuw.', true);
    }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, data.message || `Fout ${res.status}`);
    return data;
  }
  const contents = path => `${REPO_API}/contents/${safePath(path)}`;

  function explain(err) {
    if (!(err instanceof ApiError)) return 'Er ging iets mis. Probeer het opnieuw.';
    if (err.friendly) return err.message;
    if (err.status === 401) return 'Het token is ongeldig of verlopen. Log opnieuw in met een nieuw token.';
    if (err.status === 403) return 'Geen toegang (of te veel aanvragen). Controleer de rechten van het token en probeer het later opnieuw.';
    if (err.status === 404) return 'Geen toegang tot deze website. Controleer of het token voor de juiste repository is en "Contents: Read and write" heeft.';
    if (err.status === 409 || err.status === 422) return 'Er is tegelijk iets anders gewijzigd. Probeer het nog een keer.';
    return err.message;
  }

  // --- gallery.json in the repo --------------------------------------------
  async function readGallery() {
    try {
      const f = await gh(`${contents('gallery.json')}?ref=${BRANCH}`);
      let items = [];
      try { items = JSON.parse(fromB64(f.content)); } catch { items = []; }
      return { items: Array.isArray(items) ? items : [], sha: f.sha };
    } catch (err) {
      if (err.status === 404) return { items: [], sha: null };
      throw err;
    }
  }
  const writeGallery = (items, sha, message) => gh(contents('gallery.json'), {
    method: 'PUT',
    body: { message, content: toB64(JSON.stringify(items, null, 2) + '\n'), branch: BRANCH, ...(sha ? { sha } : {}) }
  });
  // read-modify-write with one retry when someone else changed the file in between
  async function updateGallery(mutate, message) {
    for (let attempt = 0; ; attempt++) {
      const { items, sha } = await readGallery();
      try {
        await writeGallery(mutate(items), sha, message);
        return;
      } catch (err) {
        if (attempt === 0 && (err.status === 409 || err.status === 422)) continue;
        throw err;
      }
    }
  }

  // --- login ---------------------------------------------------------------
  async function login(value, persist) {
    token = value.trim();
    if (!/^(github_pat_|ghp_|gho_|ghu_|ghs_)[\w]+$/.test(token)) {
      throw new ApiError(400, 'Dit lijkt geen GitHub-token. Het begint met "github_pat_".', true);
    }
    const repo = await gh(REPO_API);
    if (!repo.permissions || !repo.permissions.push) {
      token = '';
      throw new ApiError(403, 'Dit token heeft geen schrijfrechten voor deze website. Alleen de beheerder kan foto\'s toevoegen.', true);
    }
    const me = await gh('https://api.github.com/user').catch(() => null);
    el.who.textContent = (me && me.login) || OWNER;
    if (persist) store.set(token); else store.del();
    el.loginCard.hidden = true;
    el.dash.hidden = false;
    await refreshCurrent();
  }

  function logout() {
    token = '';
    store.del();
    queue.forEach(q => URL.revokeObjectURL(q.url));
    queue = [];
    renderQueue();
    el.dash.hidden = true;
    el.loginCard.hidden = false;
    el.token.value = '';
    say(el.loginNote, '');
  }

  el.loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    if (!el.token.value.trim()) { say(el.loginNote, 'Plak eerst je token.', 'bad'); return; }
    el.loginBtn.disabled = true;
    say(el.loginNote, 'Controleren…');
    try {
      await login(el.token.value, el.remember.checked);
      el.token.value = '';
      say(el.loginNote, '');
    } catch (err) {
      say(el.loginNote, explain(err), 'bad');
    } finally {
      el.loginBtn.disabled = false;
    }
  });
  el.logout.addEventListener('click', logout);

  // --- preparing photos -------------------------------------------------------
  async function prepare(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Alleen JPG, PNG of WebP.');
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch { throw new Error('Deze foto kan niet worden gelezen.'); }
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';            // PNG transparency becomes white instead of black in the JPG
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85));
    if (!blob) throw new Error('Verkleinen is niet gelukt.');
    return { blob, w, h };
  }

  async function addFiles(fileList) {
    const all = [...fileList];
    const files = all.filter(f => f.type.startsWith('image/'));
    if (!files.length) { say(el.uploadNote, 'Dat zijn geen foto\'s.', 'bad'); return; }
    const room = MAX_FILES - queue.length;
    const skipped = all.length - files.length;
    if (files.length > room) say(el.uploadNote, `Maximaal ${MAX_FILES} foto's tegelijk; de rest is overgeslagen.`, 'bad');
    else if (skipped) say(el.uploadNote, `${skipped} bestand${skipped > 1 ? 'en zijn' : ' is'} overgeslagen omdat ${skipped > 1 ? 'het geen foto\'s zijn' : 'het geen foto is'}.`, 'bad');
    else say(el.uploadNote, '');
    for (const file of files.slice(0, Math.max(room, 0))) {
      const item = { name: file.name, caption: '', status: 'bezig', error: '' };
      queue.push(item);
      renderQueue();
      try {
        Object.assign(item, await prepare(file));
        item.url = URL.createObjectURL(item.blob);
        item.status = 'klaar';
      } catch (err) {
        item.status = 'fout'; item.error = err.message;
      }
      renderQueue();
    }
  }

  function renderQueue() {
    el.pending.replaceChildren();
    queue.forEach((q, i) => {
      const li = document.createElement('li');
      li.className = q.status === 'fout' ? 'err' : (q.status === 'geüpload' ? 'done' : '');
      const img = document.createElement('img');
      img.alt = '';
      if (q.url) img.src = q.url;
      const meta = document.createElement('div');
      meta.className = 'meta';
      const cap = document.createElement('input');
      cap.type = 'text'; cap.maxLength = 140; cap.placeholder = 'Bijschrift (optioneel)';
      cap.setAttribute('aria-label', `Bijschrift voor ${q.name}`);
      cap.value = q.caption;
      cap.disabled = busy || q.status !== 'klaar';
      cap.addEventListener('input', () => { q.caption = cap.value; });
      const small = document.createElement('small');
      small.textContent = q.status === 'fout' ? `${q.name} – ${q.error}`
        : q.status === 'bezig' ? `${q.name} – verkleinen…`
        : q.status === 'geüpload' ? `${q.name} – geüpload ✓`
        : `${q.name} · ${q.w}×${q.h}px · ${Math.round(q.blob.size / 1024)} KB`;
      meta.append(cap, small);
      const rm = document.createElement('button');
      rm.type = 'button'; rm.className = 'icon-btn'; rm.textContent = '×';
      rm.setAttribute('aria-label', `Verwijder ${q.name} uit de lijst`);
      rm.disabled = busy;
      rm.addEventListener('click', () => { if (q.url) URL.revokeObjectURL(q.url); queue.splice(i, 1); renderQueue(); });
      li.append(img, meta, rm);
      el.pending.append(li);
    });
    const ready = queue.filter(q => q.status === 'klaar').length;
    el.uploadBtn.disabled = busy || !ready;
    el.uploadBtn.textContent = busy ? 'Bezig met uploaden…' : (ready > 1 ? `${ready} foto's uploaden` : 'Uploaden');
    el.clearBtn.hidden = !queue.length;
    el.clearBtn.disabled = busy;
  }

  el.files.addEventListener('change', () => { addFiles(el.files.files); el.files.value = ''; });
  el.clearBtn.addEventListener('click', () => { queue.forEach(q => q.url && URL.revokeObjectURL(q.url)); queue = []; renderQueue(); say(el.uploadNote, ''); });
  ['dragenter', 'dragover'].forEach(t => el.drop.addEventListener(t, e => { e.preventDefault(); el.drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(t => el.drop.addEventListener(t, e => { e.preventDefault(); el.drop.classList.remove('over'); }));
  el.drop.addEventListener('drop', e => addFiles(e.dataTransfer.files));

  // --- uploading ---------------------------------------------------------------
  const uid = () => Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);

  el.uploadBtn.addEventListener('click', async () => {
    const todo = queue.filter(q => q.status === 'klaar');
    if (!todo.length || busy) return;
    busy = true; renderQueue();
    const added = [];
    try {
      for (let i = 0; i < todo.length; i++) {
        const q = todo[i];
        say(el.uploadNote, `Foto ${i + 1} van ${todo.length} uploaden…`);
        const file = `fotos/${uid()}.jpg`;
        const bytes = new Uint8Array(await q.blob.arrayBuffer());
        await gh(contents(file), { method: 'PUT', body: { message: 'Foto toegevoegd aan galerij', content: toB64(bytes), branch: BRANCH } });
        added.push({ file, caption: q.caption.trim().slice(0, 140), w: q.w, h: q.h });
        q.status = 'geüpload';
        renderQueue();
      }
      say(el.uploadNote, 'Galerij bijwerken…');
      // newest first
      await updateGallery(items => [...added, ...items], `${added.length} foto${added.length > 1 ? "'s" : ''} toegevoegd aan galerij`);
      say(el.uploadNote, 'Gelukt! De foto\'s staan binnen een paar minuten op de website.', 'good');
      // keep anything that is still being resized; drop only what was uploaded
      queue.filter(q => q.status === 'geüpload').forEach(q => q.url && URL.revokeObjectURL(q.url));
      queue = queue.filter(q => q.status !== 'geüpload');
    } catch (err) {
      const partial = added.length ? ` (${added.length} foto's waren al geüpload; kijk bij "Foto's in de galerij".)` : '';
      say(el.uploadNote, explain(err) + partial, 'bad');
      todo.forEach(q => { if (q.status !== 'geüpload') q.status = 'klaar'; });
      // photos uploaded but not yet listed: list them now so nothing is orphaned
      if (added.length) { try { await updateGallery(items => [...added, ...items], 'Foto\'s toegevoegd aan galerij'); queue = queue.filter(q => q.status !== 'geüpload'); } catch { /* user can retry */ } }
    } finally {
      busy = false; renderQueue();
      await refreshCurrent().catch(() => {});
    }
  });

  // --- current photos -----------------------------------------------------------
  async function refreshCurrent() {
    say(el.currentNote, 'Laden…');
    try {
      const { items } = await readGallery();
      el.current.replaceChildren();
      el.count.textContent = items.length ? `(${items.length})` : '';
      if (!items.length) { say(el.currentNote, 'Er staan nog geen foto\'s in de galerij. De galerij is op de website onzichtbaar tot er een foto is.'); return; }
      say(el.currentNote, '');
      for (const it of items) {
        if (!/^fotos\/[\w.\-]+\.(jpe?g|png|webp)$/i.test(it.file || '')) continue;
        const tile = document.createElement('div');
        tile.className = 'a-tile';
        const img = document.createElement('img');
        img.loading = 'lazy';
        img.alt = it.caption || 'Foto in de galerij';
        img.src = `${it.file}?v=${encodeURIComponent(it.file)}`;
        const rm = document.createElement('button');
        rm.type = 'button'; rm.className = 'icon-btn'; rm.textContent = '×';
        rm.setAttribute('aria-label', `Verwijder foto${it.caption ? ': ' + it.caption : ''}`);
        rm.addEventListener('click', () => removePhoto(it, tile));
        tile.append(img, rm);
        if (it.caption) { const c = document.createElement('div'); c.className = 'cap'; c.textContent = it.caption; tile.append(c); }
        el.current.append(tile);
      }
    } catch (err) {
      say(el.currentNote, explain(err), 'bad');
    }
  }

  async function removePhoto(it, tile) {
    if (!confirm('Deze foto verwijderen uit de galerij? Dit kan niet ongedaan worden gemaakt.')) return;
    tile.classList.add('busy');
    try {
      // first unlist it (the website stops showing it), then delete the file itself
      await updateGallery(items => items.filter(x => x.file !== it.file), 'Foto verwijderd uit galerij');
      try {
        const f = await gh(`${contents(it.file)}?ref=${BRANCH}`);
        await gh(contents(it.file), { method: 'DELETE', body: { message: 'Foto verwijderd', sha: f.sha, branch: BRANCH } });
      } catch (err) { if (err.status !== 404) throw err; }
      say(el.currentNote, 'Foto verwijderd. Op de website verdwijnt hij binnen een paar minuten.', 'good');
      tile.remove();
      const left = el.current.children.length;
      el.count.textContent = left ? `(${left})` : '';
    } catch (err) {
      tile.classList.remove('busy');
      say(el.currentNote, explain(err), 'bad');
    }
  }

  // --- start: use a remembered token if there is one --------------------------------
  const saved = store.get();
  if (saved) {
    say(el.loginNote, 'Automatisch inloggen…');
    login(saved, true).then(() => say(el.loginNote, '')).catch(err => {
      store.del();
      say(el.loginNote, explain(err), 'bad');
    });
  }
})();
