// Runs inside the page (injected by e2e/helpers/audit.ts). Plain JavaScript on purpose: it is serialised into the
// browser, so no TypeScript helpers may leak into it. Defines window.__audit.
(() => {
  const INTERACTIVE =
    'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=switch],[role=checkbox],[role=radio],[role=tab],[role=menuitem],[role=menuitemradio],[role=slider],[contenteditable=true],[tabindex]:not([tabindex="-1"])';

  const esc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : s.replace(/[^\w-]/g, '\\$&'));

  /** Painted on screen, whatever assistive technology is told about it (aria-hidden text is still text a person reads). */
  function rendered(el) {
    return visible(el, true) && !el.closest('[inert]');
  }
  function visible(el, paintedOnly) {
    if (!(el instanceof Element)) return false;
    if (!paintedOnly && el.closest('[inert],[aria-hidden="true"]')) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') return false;
    if (paintedOnly && (cs.clipPath === 'inset(50%)' || cs.clip === 'rect(0px, 0px, 0px, 0px)')) return false; // visually hidden announcements paint no text
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  /** A short, readable selector: tag, id or role/label, and a position among siblings of the same tag. */
  function selectorOf(el) {
    const part = (e) => {
      let s = e.tagName.toLowerCase();
      if (e.id && !/^\d|[:]/.test(e.id) && !/svelte|\d{3,}/.test(e.id)) return `${s}#${esc(e.id)}`;
      const label = e.getAttribute('aria-label');
      if (label) return `${s}[aria-label="${label.slice(0, 40)}"]`;
      const role = e.getAttribute('role');
      if (role) s += `[role=${role}]`;
      const cls = [...e.classList].filter((c) => !/^svelte-/.test(c)).slice(0, 2);
      if (cls.length) s += '.' + cls.map(esc).join('.');
      const p = e.parentElement;
      if (p) {
        const same = [...p.children].filter((c) => c.tagName === e.tagName);
        if (same.length > 1) s += `:nth-of-type(${same.indexOf(e) + 1})`;
      }
      return s;
    };
    const parts = [];
    let e = el;
    for (let i = 0; e && e !== document.body && i < 3; i++) {
      parts.unshift(part(e));
      if (e.id && parts[0].includes('#')) break;
      e = e.parentElement;
    }
    return parts.join(' > ');
  }

  function nameOf(el) {
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const t = by
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
        .join(' ')
        .trim();
      if (t) return t;
    }
    const label = el.getAttribute('aria-label');
    if (label) return label.trim();
    if (el.labels && el.labels.length) return [...el.labels].map((l) => l.textContent.trim()).join(' ');
    const t = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
    if (t) return t.slice(0, 60);
    return (el.getAttribute('title') || el.getAttribute('alt') || el.getAttribute('placeholder') || '').trim();
  }

  const rectOf = (el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y + scrollY), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
  };

  function interactive(root = document) {
    return [...root.querySelectorAll(INTERACTIVE)].filter((el) => visible(el));
  }

  /** Chrome that stays put while the page scrolls (tab bar, mini-player, headers): a fixed or sticky ancestor that is not the whole screen. */
  function inFixed(el) {
    if (el.closest('nav,[role=navigation]')) return true;
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const p = getComputedStyle(e).position;
      if (p === 'fixed' || p === 'sticky') {
        const r = e.getBoundingClientRect();
        if (r.width * r.height < 0.6 * innerWidth * innerHeight) return true;
      }
    }
    return false;
  }

  // ------------------------------------------------------------------ touch targets
  function hitsOwn(el, x, y) {
    const w = innerWidth, h = innerHeight;
    const px = Math.min(Math.max(x, 0.5), w - 0.5);
    const py = Math.min(Math.max(y, 0.5), h - 0.5);
    const hit = document.elementFromPoint(px, py);
    if (!hit) return false;
    if (el === hit || el.contains(hit)) return true;
    if (el.labels && [...el.labels].some((l) => l.contains(hit))) return true;
    // an element that is itself the visible part of a larger control (a pseudo-element hit area shows up as the element)
    return false;
  }

  /** The centre of the element is covered by something that is not part of it (a scrim, a sheet, another screen). */
  function obscured(el) {
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    const x = Math.min(Math.max(r.x + r.width / 2, 0.5), innerWidth - 0.5);
    const y = Math.min(Math.max(r.y + r.height / 2, 0.5), innerHeight - 0.5);
    const hit = document.elementFromPoint(x, y);
    if (!hit) return true;
    if (el === hit || el.contains(hit) || hit.contains(el)) return false;
    if (el.labels && [...el.labels].some((l) => l.contains(hit))) return false;
    return true;
  }

  function targets(min = 44) {
    const scrolls = [...document.querySelectorAll('*')].map((el) => [el, el.scrollLeft, el.scrollTop]);
    const out = [];
    let total = 0;
    for (const el of interactive()) {
      total++;
      if (el.matches('input[type=radio],input[type=checkbox]') && el.labels?.length) {
        // the label is the target
        const lr = [...el.labels].map((l) => l.getBoundingClientRect()).sort((a, b) => b.width * b.height - a.width * a.height)[0];
        if (lr && lr.width >= min && lr.height >= min) continue;
      }
      const r = el.getBoundingClientRect();
      if (r.width >= min - 0.5 && r.height >= min - 0.5) continue;
      if (obscured(el)) continue; // behind a sheet or another screen: nobody can tap it
      const cs = getComputedStyle(el);
      if (el.tagName === 'A' && cs.display === 'inline') {
        const p = el.parentElement;
        const around = (p?.textContent || '').replace(el.textContent || '', '').trim();
        if (around.length > 8) continue; // an inline link inside a sentence
      }
      // hidden skip links and similar are not on screen
      let enlarged = false;
      if (r.width > 0) {
        el.scrollIntoView({ block: 'center', inline: 'center' });
        const b = el.getBoundingClientRect();
        const cx = b.x + b.width / 2, cy = b.y + b.height / 2, hl = min / 2 - 1;
        enlarged = [[-hl, -hl], [hl, -hl], [-hl, hl], [hl, hl]].every(([dx, dy]) => hitsOwn(el, cx + dx, cy + dy));
      }
      if (enlarged) continue;
      out.push({ selector: selectorOf(el), name: nameOf(el), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, role: el.getAttribute('role') || el.tagName.toLowerCase() });
    }
    for (const [el, x, y] of scrolls) { el.scrollLeft = x; el.scrollTop = y; }
    return { total, small: out };
  }

  // ------------------------------------------------------------------ keyboard
  function focusables() {
    const els = interactive().filter((el) => !el.disabled);
    return els.map((el) => {
      const group = el.closest('[role=radiogroup],[role=tablist],[role=menu],[role=listbox],[role=toolbar]');
      const radio = el.matches('input[type=radio]') || el.getAttribute('role') === 'radio' || el.getAttribute('role') === 'tab' || el.getAttribute('role') === 'menuitemradio';
      return {
        selector: selectorOf(el),
        name: nameOf(el),
        tabindex: el.tabIndex,
        group: group ? selectorOf(group) : el.matches('input[type=radio][name]') ? `native-radio:${el.name}` : null,
        radio,
        fixed: inFixed(el),
        inDialog: !!el.closest('[role=dialog],dialog,[aria-modal=true]'),
      };
    });
  }

  /** Where the element sits in its page, ignoring how far the page and its scrolling boxes are scrolled. */
  function layoutCenter(el) {
    const r = el.getBoundingClientRect();
    let cx = r.x + r.width / 2 + scrollX;
    let cy = r.y + r.height / 2 + scrollY;
    for (let p = el.parentElement; p; p = p.parentElement) {
      cx += p.scrollLeft || 0;
      cy += p.scrollTop || 0;
    }
    return { cx, cy };
  }
  let seq = 0;
  /** A two-pane flex layout is read down each column before moving to the next. */
  function layoutColumn(el) {
    for (let branch = el; branch.parentElement; branch = branch.parentElement) {
      const parent = branch.parentElement;
      const css = getComputedStyle(parent);
      if (css.display !== 'flex' || css.flexDirection !== 'row') continue;
      const panes = [...parent.children].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 100 && b.height > 200; });
      if (panes.length > 1 && panes.includes(branch)) return selectorOf(branch);
    }
    return null;
  }
  function active() {
    const el = document.activeElement;
    if (!el || el === document.body || el === document.documentElement) return null;
    const r = el.getBoundingClientRect();
    const { cx, cy } = layoutCenter(el);
    const x = Math.min(Math.max(r.x + r.width / 2, 0.5), innerWidth - 0.5);
    const y = Math.min(Math.max(r.y + r.height / 2, 0.5), innerHeight - 0.5);
    const hit = r.width > 0 ? document.elementFromPoint(x, y) : null;
    let covered = !!hit && !(el === hit || el.contains(hit) || hit.contains(el) || (el.labels && [...el.labels].some((l) => l.contains(hit))));
    // A nonmodal card may overlap the centre of a large scroll region while its
    // visible focus perimeter and the rest of its content remain usable.
    if (covered && el.matches('[role=region][tabindex]') && /auto|scroll/.test(getComputedStyle(el).overflowY)) {
      const points = [[r.left + 4, r.top + 4], [r.right - 4, r.top + 4], [r.left + 4, r.bottom - 4], [r.right - 4, r.bottom - 4]];
      const exposed = points.filter(([px, py]) => px > 0 && px < innerWidth && py > 0 && py < innerHeight && hitsOwn(el, px, py));
      covered = exposed.length < 2;
    }
    el.setAttribute('data-audit-seen', String(++seq));
    return {
      selector: selectorOf(el),
      name: nameOf(el),
      cx,
      cy,
      h: r.height,
      fixed: inFixed(el),
      popup: !!el.closest('[role=menu],[role=dialog],dialog'),
      column: layoutColumn(el),
      inDialog: !!el.closest('[role=dialog],dialog,[aria-modal=true]'),
      visible: visible(el),
      onScreen: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth,
      covered,
      seen: seq,
    };
  }

  /** After the walk: does each focused element look different when it has focus? (outline, ring, fill or colour.) */
  function focusIndicators() {
    const out = [];
    out.checked = 0;
    const key = (el) => {
      const c = getComputedStyle(el);
      return [c.outlineStyle === 'none' || parseFloat(c.outlineWidth) === 0 ? 'none' : c.outlineColor + c.outlineWidth, c.boxShadow, c.backgroundColor, c.color, c.borderColor, c.textDecorationLine, c.transform].join('|');
    };
    for (const el of document.querySelectorAll('[data-audit-seen]')) {
      el.removeAttribute('data-audit-seen');
      if (!visible(el) || el.matches('input[type=range]')) continue;
      out.checked++;
      el.focus({ focusVisible: true });
      const surroundings = [el, el.parentElement, el.parentElement?.parentElement].filter(Boolean);
      const withFocus = surroundings.map(key).join('~');
      const ring = (parts) => parts.split('|')[0] !== 'none' || false;
      const focusVisible = el.matches(':focus-visible');
      el.blur();
      const without = surroundings.map(key).join('~');
      // a child may carry the indicator (a ring on the inner element): compare descendants too
      let childChange = false;
      if (withFocus === without) {
        el.focus({ focusVisible: true });
        const kids = [...el.querySelectorAll('*')].slice(0, 12);
        const before = kids.map(key);
        el.blur();
        const after = kids.map(key);
        childChange = before.some((b, i) => b !== after[i]);
      }
      el.blur();
      if (focusVisible && withFocus === without && !childChange) out.push({ selector: selectorOf(el), name: nameOf(el), ring: ring(withFocus) });
    }
    return { checked: out.checked, missing: [...out] };
  }

  /** Put the sequential focus starting point before everything: Tab then goes to the first control. */
  function resetFocus() {
    document.getElementById('__audit_start')?.remove();
    const s = document.createElement('span');
    s.id = '__audit_start';
    s.tabIndex = -1;
    document.body.prepend(s);
    s.focus();
    scrollTo(0, 0);
  }
  function endFocus() {
    document.getElementById('__audit_start')?.remove();
  }

  let rememberedFocus = null;
  function rememberFocus() { rememberedFocus = document.activeElement; }
  function restoreFocus() {
    if (rememberedFocus instanceof HTMLElement && rememberedFocus.isConnected && visible(rememberedFocus)) rememberedFocus.focus({ preventScroll: true });
    else document.querySelector('[role=dialog][aria-modal=true]')?.focus({ preventScroll: true });
    rememberedFocus = null;
  }

  function dialogs() {
    return [...document.querySelectorAll('[role=dialog],dialog[open],[aria-modal=true]')]
      .filter((el) => visible(el))
      .map((d) => ({
        selector: selectorOf(d),
        name: nameOf(d),
        modal: d.getAttribute('aria-modal') === 'true' || d.matches('dialog'),
        hasFocus: d.contains(document.activeElement),
        focusables: interactive(d).filter((e) => !e.disabled).length,
      }));
  }

  function mark(el) {
    document.querySelectorAll('[data-audit-opener]').forEach((e) => e.removeAttribute('data-audit-opener'));
    el.setAttribute('data-audit-opener', '1');
  }
  const focusIsOnOpener = () => !!document.activeElement?.hasAttribute?.('data-audit-opener');

  // ------------------------------------------------------------------ reduced motion
  const MOVES = /(^|,\s*)(all|transform|translate|scale|rotate|top|left|right|bottom|margin[\w-]*|inset[\w-]*|height|width|padding[\w-]*|max-height|flex[\w-]*)(\s*,|$)/;
  const secs = (v) => v.split(',').map((x) => (x.trim().endsWith('ms') ? parseFloat(x) / 1000 : parseFloat(x) || 0));
  function motion(limit = 0.3) {
    const out = [];
    const all = [document.documentElement, ...document.querySelectorAll('body *')];
    for (const el of all) {
      const cs = getComputedStyle(el);
      if (cs.animationName !== 'none') {
        const names = cs.animationName.split(',').map((s) => s.trim());
        const dur = secs(cs.animationDuration);
        const it = cs.animationIterationCount.split(',').map((s) => s.trim());
        names.forEach((n, i) => {
          const d = dur[i % dur.length];
          if (n !== 'none' && (d > limit || it[i % it.length] === 'infinite') && d > 0.001) out.push({ selector: selectorOf(el), kind: 'animation', name: n, seconds: d, iterations: it[i % it.length] });
        });
      }
      const td = secs(cs.transitionDuration);
      if (td.some((d) => d > limit)) {
        const props = cs.transitionProperty.split(',').map((s) => s.trim());
        props.forEach((p, i) => {
          const d = td[i % td.length];
          if (d > limit && MOVES.test(p)) out.push({ selector: selectorOf(el), kind: 'transition', name: p, seconds: d });
        });
      }
      if (cs.scrollBehavior === 'smooth') out.push({ selector: selectorOf(el), kind: 'smooth-scroll', name: 'scroll-behavior', seconds: 0 });
    }
    const running = document.getAnimations().filter((a) => a.playState === 'running').length;
    return { offenders: out.slice(0, 40), count: out.length, running };
  }

  // ------------------------------------------------------------------ text scaling
  const layerOf = (e) => e.closest('[role=dialog],[aria-modal=true],dialog') || document.body;
  function textRects() {
    const rects = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.nodeValue.trim()) continue;
      const el = n.parentElement;
      if (!el || !rendered(el) || el.closest('script,style')) continue;
      const rg = document.createRange();
      rg.selectNodeContents(n);
      for (const raw of rg.getClientRects()) {
        // A scroll panel clips its scrolled-away rows. Compare only the part of
        // each text line that is actually painted, rather than treating those
        // rows as overlapping the callout or buttons below the panel.
        const r = { left: raw.left, right: raw.right, top: raw.top, bottom: raw.bottom };
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const pc = getComputedStyle(p), pr = p.getBoundingClientRect();
          if (/hidden|clip|auto|scroll/.test(pc.overflowX)) { r.left = Math.max(r.left, pr.left); r.right = Math.min(r.right, pr.right); }
          if (/hidden|clip|auto|scroll/.test(pc.overflowY)) { r.top = Math.max(r.top, pr.top); r.bottom = Math.min(r.bottom, pr.bottom); }
        }
        r.x = r.left; r.y = r.top; r.width = r.right - r.left; r.height = r.bottom - r.top;
        if (r.width <= 1 || r.height <= 1) continue;
        const hit = document.elementFromPoint(Math.min(Math.max(r.x + r.width / 2, 0.5), innerWidth - 0.5), Math.min(Math.max(r.y + r.height / 2, 0.5), innerHeight - 0.5));
        if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue; // not on screen
        if (hit && layerOf(hit) !== layerOf(el)) continue; // under a sheet or another screen: not part of this layout
        if (hit && inFixed(hit) && !inFixed(el) && canScrollY(el) && !(el === hit || el.contains(hit) || hit.contains(el))) continue; // scrollable content currently passing under fixed chrome remains reachable
        rects.push({ el, r, layer: layerOf(el), text: n.nodeValue.trim().slice(0, 30) });
      }
    }
    return rects;
  }

  const scrollsX = (e) => {
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o === 'auto' || o === 'scroll') return true;
    }
    return false;
  };
  const canScrollY = (e) => {
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      if (/auto|scroll/.test(getComputedStyle(p).overflowY) && p.scrollHeight > p.clientHeight + 1) return true;
    }
    return false;
  };

  /** What is wrong with the layout right now: text cut by its box or an ancestor, text over other text, content past the right edge. */
  function layoutProblems() {
    const out = { clipped: new Map(), overlaps: new Map(), offscreen: new Map() };
    const onScreen = (e) => {
      const range = document.createRange();
      range.selectNodeContents(e);
      const r = range.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return false;
      const hit = document.elementFromPoint(Math.min(Math.max(r.x + r.width / 2, 0.5), innerWidth - 0.5), Math.min(Math.max(r.y + r.height / 2, 0.5), innerHeight - 0.5));
      if (hit && inFixed(hit) && !inFixed(e) && canScrollY(e) && !(e === hit || e.contains(hit) || hit.contains(e))) return false;
      return !hit || layerOf(hit) === layerOf(e);
    };
    const sample = [...document.querySelectorAll('body *')].filter((e) => rendered(e) && [...e.childNodes].some((c) => c.nodeType === 3 && c.nodeValue.trim()) && onScreen(e));
    for (const e of sample) {
      const cs = getComputedStyle(e);
      const clips = (v) => v === 'hidden' || v === 'clip';
      const w = e.scrollWidth > e.clientWidth + 1 && clips(cs.overflowX) && e.clientWidth > 0;
      const h = e.scrollHeight > e.clientHeight + 2 && clips(cs.overflowY) && e.clientHeight > 0;
      if (w || h) out.clipped.set(selectorOf(e) + (w ? ':width' : ':height'), { selector: selectorOf(e), text: nameOf(e).slice(0, 30), how: cs.textOverflow === 'ellipsis' && w ? 'ellipsis' : w ? 'width' : 'height' });
      const range = document.createRange();
      range.selectNodeContents(e);
      const r = range.getBoundingClientRect();
      for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
        const pc = getComputedStyle(p);
        if (/auto|scroll/.test(pc.overflowX + pc.overflowY)) break; // content that scrolls is not cut off
        if (clips(pc.overflowX) || clips(pc.overflowY)) {
          const pr = p.getBoundingClientRect();
          const xCut = clips(pc.overflowX) && (r.right > pr.right + 2 || r.left < pr.left - 2);
          const yCut = clips(pc.overflowY) && (r.bottom > pr.bottom + 2 || r.top < pr.top - 2);
          if (pr.width > 0 && (xCut || yCut)) {
            out.clipped.set(selectorOf(e) + ':ancestor', { selector: selectorOf(e), text: nameOf(e).slice(0, 30), how: 'ancestor', by: selectorOf(p) });
            break;
          }
        }
      }
      if (r.right > innerWidth + 2 && !scrollsX(e)) out.offscreen.set(selectorOf(e), { selector: selectorOf(e), text: nameOf(e).slice(0, 30), by: Math.round(r.right - innerWidth) });
    }
    const rs = textRects();
    for (let i = 0; i < rs.length && out.overlaps.size < 40; i++) {
      for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i], b = rs[j];
        if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el) || a.layer !== b.layer) continue;
        const ix = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const iy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (ix > 3 && iy > 0.4 * Math.min(a.r.height, b.r.height)) out.overlaps.set(selectorOf(a.el) + '|' + selectorOf(b.el), { a: `${selectorOf(a.el)} "${a.text}"`, b: `${selectorOf(b.el)} "${b.text}"` });
      }
    }
    return out;
  }

  const layoutSnapshot = () => {
    const p = layoutProblems();
    return { clipped: [...p.clipped.keys()], overlaps: [...p.overlaps.keys()], offscreen: [...p.offscreen.keys()], width: innerWidth };
  };
  function zoomProblems(base) {
    const p = layoutProblems();
    const sample = [...document.querySelectorAll('body *')].filter((e) => rendered(e) && [...e.childNodes].some((c) => c.nodeType === 3 && c.nodeValue.trim()));
    const overflow = Math.max(0, document.documentElement.scrollWidth - innerWidth);
    return {
      scaledRatio: 1, zoomedWidthPx: innerWidth, textElements: sample.length,
      hscroll: overflow > 2, hscrollBy: overflow,
      clipped: [...p.clipped].filter(([k]) => !base.clipped.includes(k)).map(([, v]) => v),
      overlaps: [...p.overlaps].filter(([k]) => !base.overlaps.includes(k)).map(([, v]) => v),
      offscreen: [...p.offscreen].filter(([k]) => !base.offscreen.includes(k)).map(([, v]) => v),
    };
  }

  window.__audit = { layoutSnapshot, zoomProblems, layoutProblems, textRects, focusIndicators, endFocus, rememberFocus, restoreFocus, interactive, selectorOf, nameOf, rectOf, targets, focusables, active, resetFocus, dialogs, mark, focusIsOnOpener, motion, visible };
})();
