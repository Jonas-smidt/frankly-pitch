// @ds-adherence-ignore -- branded deck shell (raw elements/px by design)
/* ──────────────────────────────────────────────────────────────────────────
 * <frankly-stage> — Frankly-branded deck shell web component.
 *
 * A deck-stage variant carrying the Frankly design-system experience:
 *   • Loader — pulsing pink-on-bordeaux mark, then the iris fly-through.
 *   • Slide-push transitions (translate3d ±100px · scale .98–1.02).
 *   • Branded bottom navigator pill (glass, numbered, tooltips).
 *   • Auto-scaling 1920×1080 canvas, keyboard + tap nav, localStorage memory.
 *
 * Motion tokens (--dur-slide, --ease, --ease-fly …) are read from styles.css
 * via the host's inherited custom properties. Mount from a .dc.html template:
 *
 *   <x-import component-from-global-scope="frankly-stage" from="./frankly-stage.js"
 *             width="1920" height="1080" hint-size="100%,100%">
 *     <section data-label="Cover" style="…">…</section>
 *   </x-import>
 * ────────────────────────────────────────────────────────────────────────── */
(() => {
  const DESIGN_W = 1920;
  const DESIGN_H = 1080;
  const COARSE_MQ = matchMedia('(hover: none), (pointer: coarse)');
  const REDUCE_MQ = matchMedia('(prefers-reduced-motion: reduce)');
  const STORE_KEY = 'frankly-deck.index';
  const INTERACTIVE = 'a[href],button,input,select,textarea,summary,label,[role="button"],[onclick],[contenteditable]:not([contenteditable="false" i])';

  const pad2 = (n) => String(n).padStart(2, '0');
  const labelOf = (el) => {
    const raw = el.getAttribute('data-label')
      || (el.getAttribute('data-screen-label') || '').replace(/^\s*\d+\s*[-–]?\s*/, '')
      || 'Slide';
    return raw.replace(/^\s*\d+\s*[-–]\s*/, '').trim() || raw;
  };

  const CSS = `
    @property --iris { syntax: '<length>'; inherits: false; initial-value: 0px; }

    :host {
      position: fixed; inset: 0; display: block;
      background: #2D0011; overflow: hidden;
      -webkit-tap-highlight-color: transparent;
      font-family: var(--font-sans, system-ui, sans-serif);
    }

    .stage { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
    .canvas {
      position: relative; width: ${DESIGN_W}px; height: ${DESIGN_H}px;
      transform-origin: center center; flex-shrink: 0; background: #2D0011; overflow: hidden; will-change: transform;
    }
    /* The camera: a transformed track holding every slide side by side. */
    .track {
      position: absolute; top: 0; left: 0; width: ${DESIGN_W}px; height: ${DESIGN_H}px;
      transform-origin: 0 0; will-change: transform;
    }

    /* Slides live in light DOM via <slot>, laid out as a horizontal filmstrip.
       Each slide's offset (left = i × width) is set inline by JS; the camera
       transform on .track pans + zooms across them — no opacity crossfade. */
    ::slotted(*) {
      position: absolute !important; top: 0 !important;
      width: ${DESIGN_W}px !important; height: ${DESIGN_H}px !important;
      box-sizing: border-box !important; overflow: hidden;
      pointer-events: none;
    }
    ::slotted([data-state="active"]) { pointer-events: auto; }

    /* ── Loader ───────────────────────────────────────────────────────── */
    .loader {
      position: absolute; inset: 0; z-index: 40; background: rgb(255,211,227);
      display: flex; align-items: center; justify-content: center;
      transition: opacity var(--dur-loader,620ms) var(--ease,ease), visibility var(--dur-loader,620ms) var(--ease,ease);
    }
    .loader[data-hide] { opacity: 0; visibility: hidden; pointer-events: none; }
    .loader-stage { position: relative; display: grid; place-items: center; will-change: transform, opacity; }
    .loader-ring {
      grid-area: 1/1; width: 158px; height: 158px; border-radius: 50%; background: rgb(45,0,17);
      box-shadow: 0 1px 1px rgba(45,0,17,.04); animation: fk-breathe 1.8s ease-in-out infinite; will-change: transform, opacity;
    }
    .loader-ring::before {
      content: ""; position: absolute; inset: 0; border-radius: 50%;
      border: 2px solid rgba(45,0,17,.16); animation: fk-halo 1.8s ease-in-out infinite;
    }
    .loader-mark {
      grid-area: 1/1; position: relative; width: 46px; height: 79px; background: rgb(255,211,227);
      -webkit-mask: url('assets/frankly-icon.svg') center/contain no-repeat;
              mask: url('assets/frankly-icon.svg') center/contain no-repeat;
      animation: fk-mark-pulse 1.8s ease-in-out infinite; will-change: transform, opacity;
    }
    .loader[data-flying] {
      -webkit-mask: radial-gradient(circle at 50% 50%, transparent var(--iris), #000 calc(var(--iris) + 2px)) no-repeat;
              mask: radial-gradient(circle at 50% 50%, transparent var(--iris), #000 calc(var(--iris) + 2px)) no-repeat;
    }
    .loader[data-flying] .loader-mark { animation: fk-mark-out 300ms ease-in 1 forwards; }
    .loader[data-flying] .loader-ring,
    .loader[data-flying] .loader-ring::before { animation: none; }

    @keyframes fk-mark-pulse { 0%,100% { opacity:.8; transform: scale(.95); } 50% { opacity:1; transform: scale(1.05); } }
    @keyframes fk-breathe    { 0%,100% { transform: scale(.86); opacity:.7; } 50% { transform: scale(1.14); opacity:1; } }
    @keyframes fk-halo       { 0% { transform: scale(1); opacity:.65; } 70% { opacity:0; } 100% { transform: scale(1.9); opacity:0; } }
    @keyframes fk-mark-out   { 0% { opacity:.95; } 100% { opacity:0; } }

    /* ── Navigator ────────────────────────────────────────────────────── */
    /* Navigator — macOS-dock behaviour: tucked below the viewport, pops up on
       bottom-edge hover and on slide change, holds while hovered. */
    .nav-wrap {
      position: fixed; left: 0; right: 0; bottom: 0; z-index: 30; pointer-events: none;
    }
    .nav-wrap[data-show] { pointer-events: auto; }
    .nav-panel {
      position: relative; width: 100%; box-sizing: border-box;
      display: flex; justify-content: center; padding: 12px 22px 14px;
      background: rgba(245,244,241,0.42);
      -webkit-backdrop-filter: blur(16px) saturate(1.3); backdrop-filter: blur(16px) saturate(1.3);
      border-top: 1px solid rgba(255,255,255,.45);
      box-shadow: 0 -10px 44px rgba(45,0,17,.20), inset 0 1px 0 rgba(255,255,255,.4);
      transform: translateY(28px); opacity: 0;
      transition: opacity 300ms ease-out, transform 480ms cubic-bezier(.22,.61,.36,1);
    }
    .nav-wrap[data-show] .nav-panel { transform: translateY(0); opacity: 1; }
    .nav-hero {
      position: absolute; left: 50%; bottom: 78px;
      display: flex; flex-direction: column; align-items: center; gap: 7px;
      padding: 8px 8px 7px; border-radius: 15px;
      background: rgba(245,244,241,0.42);
      -webkit-backdrop-filter: blur(16px) saturate(1.3); backdrop-filter: blur(16px) saturate(1.3);
      border: 1px solid rgba(255,255,255,.4);
      box-shadow: 0 16px 44px rgba(45,0,17,.30), inset 0 1px 0 rgba(255,255,255,.4);
      opacity: 0; pointer-events: none; transform: translateX(-50%) translateY(8px) scale(.98); transform-origin: bottom center;
      transition: opacity 200ms ease-out, transform 260ms cubic-bezier(.22,.61,.36,1);
    }
    .nav-hero[data-show] { opacity: 1; pointer-events: auto; transform: translateX(-50%) translateY(0) scale(1); }
    .nav-hero-thumb {
      position: relative; width: 240px; height: 135px; border-radius: 9px; overflow: hidden;
      background: rgba(45,0,17,.18);
    }
    .nav-hero-scaler { position: absolute; top: 0; left: 0; width: 1920px; height: 1080px; transform: scale(0.125); transform-origin: 0 0; pointer-events: none; }
    .nav-hero-scaler iframe { position: absolute; top: 0; left: 0; width: 1920px; height: 1080px; border: 0; display: block; background: #F5F4F1; opacity: 0; transform: scale(1.04); transform-origin: center; transition: opacity 280ms cubic-bezier(.33,0,.2,1), transform 360ms cubic-bezier(.33,0,.2,1); }
    .nav-hero-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    /* A host-level copy of slide 19's bottom-left ribbon, so it can ride OVER the
       navigator bar (the real one lives inside the slide iframe, which clips it). */
    .slide-ribbon { position: fixed; z-index: 31; pointer-events: none; opacity: 0; transition: opacity 240ms ease; }
    .slide-ribbon[data-show] { opacity: 1; }
    .slide-ribbon img { width: 100%; height: 100%; display: block; }
    .nav-hero-cap { display: flex; align-items: baseline; justify-content: flex-start; align-self: stretch; gap: 8px; padding: 0 4px 2px; }
    .nav-hero-num { font: 600 11px/1 'Switzer', system-ui, sans-serif; font-variant-numeric: tabular-nums; color: rgba(45,0,17,.5); }
    .nav-hero-title { font: 600 14px/1.2 'Switzer', system-ui, sans-serif; color: #2D0011; letter-spacing: -.01em; max-width: 188px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .film {
      display: flex; gap: 4px; align-items: flex-end; width: fit-content; max-width: calc(100vw - 40px);
      margin: 0 auto; overflow-x: auto; padding: 2px 2px 4px; scrollbar-width: none;
    }
    .film::-webkit-scrollbar { display: none; }
    .film-thumb {
      display: flex; flex-direction: column; align-items: center; gap: 3px;
      flex: none; background: transparent; border: 0; padding: 0; cursor: pointer; font-family: inherit;
    }
    .film-num { font: 700 12px/1 'Switzer', system-ui, sans-serif; font-variant-numeric: tabular-nums; color: rgba(45,0,17,.45); transform: translateY(-2px); }
    .film-thumb:hover .film-num { color: rgba(45,0,17,.75); }
    .film-thumb.on .film-num { color: #2D0011; }
    .film-shot {
      position: relative; width: 32px; height: 18px; border-radius: 3px; overflow: hidden;
      background: rgba(45,0,17,.18);
      outline: 1.5px solid transparent; outline-offset: 1.5px;
      transition: outline-color var(--dur-ui,300ms) var(--ease,ease), transform var(--dur-micro,220ms) var(--ease,ease);
    }
    .film-thumb:hover .film-shot { transform: translateY(-2px); outline-color: rgba(255,211,227,.7); }
    .film-thumb.on .film-shot { outline-color: #FFD3E3; }
    .film-scaler { position: absolute; top: 0; left: 0; width: 1920px; height: 1080px; transform: scale(0.0166667); transform-origin: 0 0; pointer-events: none; }
    .film-scaler iframe { width: 1920px; height: 1080px; border: 0; display: block; background: #F5F4F1; }
    .film-shot img { width: 100%; height: 100%; object-fit: cover; display: block; }

    .nav-controls { position: absolute; top: 50%; right: 18px; transform: translateY(-50%); z-index: 4; display: flex; gap: 6px; }

    /* Overview (grid) trigger — pill-button family */
    .nav-grid {
      position: relative; flex: none; width: 28px; height: 26px;
      display: inline-flex; align-items: center; justify-content: center;
      border: 0; border-radius: 99px; background: transparent; cursor: pointer;
      color: rgba(45,0,17,.55);
      transition: background var(--dur-ui,300ms) var(--ease,ease), color var(--dur-ui,300ms) var(--ease,ease), transform var(--dur-micro,220ms) var(--ease,ease);
    }
    .nav-grid:hover { color: #2D0011; background: rgba(255,255,255,.35); transform: translateY(-2px); }
    .nav-grid.on { background: #FFD3E3; color: #2D0011; }
    .nav-grid svg { width: 14px; height: 14px; display: block; }

    /* Help (?) — opens the shortcuts overlay */
    .nav-help {
      position: relative; flex: none; width: 26px; height: 26px;
      display: inline-flex; align-items: center; justify-content: center;
      border: 0; border-radius: 99px; background: transparent; cursor: pointer;
      color: rgba(45,0,17,.55); font: 600 14px/1 'Switzer', system-ui, sans-serif;
      transition: background var(--dur-ui,300ms) var(--ease,ease), color var(--dur-ui,300ms) var(--ease,ease), transform var(--dur-micro,220ms) var(--ease,ease);
    }
    .nav-help:hover { color: #2D0011; background: rgba(255,255,255,.35); transform: translateY(-2px); }
    .nav-help.on { background: #FFD3E3; color: #2D0011; }
    .nav-grid::after, .nav-help::after {
      position: absolute; bottom: calc(100% + 12px); left: 50%;
      transform: translateX(-50%) translateY(4px); background: rgba(0,0,0,.92); color: #fff;
      padding: 7px 11px; border-radius: 7px; white-space: nowrap;
      font: 500 12px/1 'Switzer', system-ui, sans-serif; letter-spacing: .02em;
      opacity: 0; pointer-events: none; transition: opacity var(--dur-micro,220ms) ease-out, transform var(--dur-micro,220ms) var(--ease,ease);
      box-shadow: 0 6px 20px rgba(0,0,0,.4); z-index: 2;
    }
    .nav-grid::after { content: 'Overview'; }
    .nav-help::after { content: 'Shortcuts'; right: -6px; left: auto; transform: translateX(0) translateY(4px); }
    .nav-grid:hover::after { opacity: 1; transform: translateX(-50%) translateY(0); }
    .nav-help:hover::after { opacity: 1; transform: translateX(0) translateY(0); }

    /* Fullscreen control — same button family */
    .nav-full {
      position: relative; flex: none; width: 28px; height: 26px;
      display: inline-flex; align-items: center; justify-content: center;
      border: 0; border-radius: 99px; background: transparent; cursor: pointer; color: rgba(45,0,17,.55);
      transition: background var(--dur-ui,300ms) var(--ease,ease), color var(--dur-ui,300ms) var(--ease,ease), transform var(--dur-micro,220ms) var(--ease,ease);
    }
    .nav-full:hover { color: #2D0011; background: rgba(255,255,255,.35); transform: translateY(-2px); }
    .nav-full svg { width: 14px; height: 14px; display: block; }
    .nav-full::after {
      content: 'Fullscreen'; position: absolute; bottom: calc(100% + 12px); left: 50%;
      transform: translateX(-50%) translateY(4px); background: rgba(0,0,0,.92); color: #fff;
      padding: 7px 11px; border-radius: 7px; white-space: nowrap;
      font: 500 12px/1 'Switzer', system-ui, sans-serif; letter-spacing: .02em;
      opacity: 0; pointer-events: none; transition: opacity var(--dur-micro,220ms) ease-out, transform var(--dur-micro,220ms) var(--ease,ease);
      box-shadow: 0 6px 20px rgba(0,0,0,.4); z-index: 2;
    }
    .nav-full:hover::after { opacity: 1; transform: translateX(-50%) translateY(0); }

    /* ── Shortcuts overlay ───────────────────────────────────────────── */
    .help {
      position: fixed; inset: 0; z-index: 60;
      background: rgba(45,0,17,.62);
      -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px);
      display: flex; align-items: center; justify-content: center;
      opacity: 0; pointer-events: none; transition: opacity var(--dur-ui,300ms) var(--ease,ease);
    }
    .help[data-on] { opacity: 1; pointer-events: auto; }
    .help-card {
      background: #fff; color: #2D0011; padding: 32px 36px; border-radius: 18px;
      width: 400px; max-width: calc(100vw - 48px); box-shadow: 0 24px 70px rgba(45,0,17,.45);
      transform: translateY(10px) scale(.97); transition: transform var(--dur-ui,300ms) var(--ease,ease);
    }
    .help[data-on] .help-card { transform: none; }
    .help-card h3 { margin: 0 0 20px; font-family: var(--font-display,'Switzer',system-ui,sans-serif); font-weight: 600; font-size: 18px; letter-spacing: -.01em; }
    .help-card dl { margin: 0; display: grid; grid-template-columns: 128px 1fr; row-gap: 11px; column-gap: 16px; align-items: center; }
    .help-card dt { justify-self: start; display: flex; gap: 4px; }
    .help-card dd { margin: 0; font: 500 14px/1.3 'Switzer', system-ui, sans-serif; color: #5a3340; }
    .help-card kbd {
      font: 600 11.5px/1 ui-monospace,'SF Mono',Menlo,monospace; color: #2D0011; background: #FFD3E3;
      padding: 5px 8px; border-radius: 6px; min-width: 12px; text-align: center; display: inline-block;
    }

    /* ── Slide overview (grid) ───────────────────────────────────────── */
    .overview {
      position: fixed; inset: 0; z-index: 50;
      background: rgba(45,0,17,.93);
      -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
      opacity: 0; pointer-events: none; transition: opacity var(--dur-ui,300ms) var(--ease,ease);
      display: flex; flex-direction: column;
    }
    .overview[data-on] { opacity: 1; pointer-events: auto; }
    .ov-head { flex: none; display: flex; align-items: baseline; gap: 14px; padding: 30px 44px 18px; }
    .ov-head h3 { margin: 0; font-family: var(--font-display,'Switzer',system-ui,sans-serif); font-weight: 600; font-size: 22px; letter-spacing: -.01em; color: #FFD3E3; }
    .ov-sub { font: 500 13px/1 'Switzer', system-ui, sans-serif; color: rgba(255,211,227,.6); letter-spacing: .04em; }
    .ov-hint { margin-left: auto; font: 500 12.5px/1 'Switzer', system-ui, sans-serif; color: rgba(255,255,255,.45); }
    .ov-hint kbd { font: 600 11px/1 ui-monospace,monospace; color: #2D0011; background: rgba(255,211,227,.88); padding: 3px 6px; border-radius: 5px; }
    .ov-scroll { flex: 1; overflow-y: auto; padding: 6px 44px 44px; }
    .ov-grid { display: grid; grid-template-columns: repeat(auto-fill, 300px); gap: 22px 24px; justify-content: center; }
    .ov-card { display: flex; flex-direction: column; gap: 9px; padding: 0; border: 0; background: transparent; cursor: pointer; text-align: left; font-family: inherit; }
    .ov-thumb {
      position: relative; width: 300px; height: 168.75px; border-radius: 12px; overflow: hidden;
      background: #2D0011; box-shadow: 0 8px 28px rgba(0,0,0,.42);
      outline: 2px solid transparent; outline-offset: 3px;
      transition: outline-color var(--dur-ui,300ms) var(--ease,ease), transform var(--dur-micro,220ms) var(--ease,ease);
    }
    .ov-card:hover .ov-thumb, .ov-card.sel .ov-thumb { transform: translateY(-4px); outline-color: rgba(255,211,227,.55); }
    .ov-card.on .ov-thumb { outline-color: #FFD3E3; }
    .ov-scaler { position: absolute; top: 0; left: 0; width: 1920px; height: 1080px; transform: scale(0.15625); transform-origin: 0 0; pointer-events: none; }
    .ov-scaler iframe { width: 1920px; height: 1080px; border: 0; display: block; background: #2D0011; }
    .ov-meta { display: flex; align-items: baseline; gap: 9px; padding: 0 2px; }
    .ov-num { font: 600 12px/1 'Switzer', system-ui, sans-serif; font-variant-numeric: tabular-nums; color: #FFD3E3; }
    .ov-label { font: 500 13px/1.2 'Switzer', system-ui, sans-serif; color: rgba(255,255,255,.82); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ov-card.on .ov-num, .ov-card.on .ov-label { color: #fff; }

    @media (prefers-reduced-motion: reduce) {
      .loader-mark, .loader-ring, .loader-ring::before { animation: none !important; transform: none !important; }
    }

    @media print {
      :host { position: static; inset: auto; background: none; overflow: visible; }
      .stage { position: static; display: block; }
      .canvas { transform: none !important; overflow: visible !important; height: auto !important; }
      .track { position: static !important; transform: none !important; width: auto !important; height: auto !important; }
      ::slotted(*) {
        position: relative !important; left: 0 !important; top: 0 !important;
        width: ${DESIGN_W}px !important; height: ${DESIGN_H}px !important;
        pointer-events: auto;
        break-after: page; page-break-after: always; break-inside: avoid; overflow: hidden;
      }
      ::slotted(*:last-child) { break-after: auto; page-break-after: auto; }
      .loader, .nav-wrap, .help, .overview { display: none !important; }
    }
  `;

  class FranklyStage extends HTMLElement {
    static get observedAttributes() { return ['width', 'height']; }
    constructor() {
      super();
      this._root = this.attachShadow({ mode: 'open' });
      this._index = 0;
      this._slides = [];
      this._loaderDone = false;
      this._onKey = this._onKey.bind(this);
      this._onResize = this._onResize.bind(this);
      this._onSlot = this._onSlot.bind(this);
      this._onTap = this._onTap.bind(this);
      this._onPointerMove = this._onPointerMove.bind(this);
    }
    get designWidth() { return parseInt(this.getAttribute('width'), 10) || DESIGN_W; }
    get designHeight() { return parseInt(this.getAttribute('height'), 10) || DESIGN_H; }

    connectedCallback() {
      this._render();
      window.addEventListener('keydown', this._onKey);
      window.addEventListener('resize', this._onResize);
      window.addEventListener('pointermove', this._onPointerMove, { passive: true });
      this.addEventListener('click', this._onTap);
      this._fit();
    }
    disconnectedCallback() {
      window.removeEventListener('keydown', this._onKey);
      window.removeEventListener('resize', this._onResize);
      window.removeEventListener('pointermove', this._onPointerMove);
      this.removeEventListener('click', this._onTap);
      clearTimeout(this._dockHideTimer);
      clearTimeout(this._previewWarmTimer);
      this._timers && this._timers.forEach(clearTimeout);
      if (this._raf) cancelAnimationFrame(this._raf);
    }
    attributeChangedCallback() {
      if (!this._canvas) return;
      this._canvas.style.width = this.designWidth + 'px';
      this._canvas.style.height = this.designHeight + 'px';
      this._fit();
    }

    _render() {
      const style = document.createElement('style');
      style.textContent = CSS;

      const stage = document.createElement('div');
      stage.className = 'stage';
      const canvas = document.createElement('div');
      canvas.className = 'canvas';
      canvas.style.width = this.designWidth + 'px';
      canvas.style.height = this.designHeight + 'px';
      const track = document.createElement('div');
      track.className = 'track';
      const slot = document.createElement('slot');
      slot.addEventListener('slotchange', this._onSlot);
      track.appendChild(slot);
      canvas.appendChild(track);
      stage.appendChild(canvas);

      const loader = document.createElement('div');
      loader.className = 'loader';
      loader.innerHTML = `<span class="loader-stage"><span class="loader-ring"></span><span class="loader-mark"></span></span>`;

      const navWrap = document.createElement('div');
      navWrap.className = 'nav-wrap';
      navWrap.addEventListener('pointerenter', () => { this._navHover = true; this._showDock(); });
      navWrap.addEventListener('pointerleave', () => { this._navHover = false; this._scheduleDockHide(600); });
      const hero = document.createElement('div');
      hero.className = 'nav-hero';
      hero.innerHTML =
        '<div class="nav-hero-thumb"><img class="nav-hero-img" alt="" decoding="async"></div>' +
        '<div class="nav-hero-cap"><span class="nav-hero-num"></span><span class="nav-hero-title"></span></div>';
      const panel = document.createElement('div');
      panel.className = 'nav-panel';
      panel.innerHTML =
        '<div class="nav-controls"></div>' +
        '<div class="film" role="tablist" aria-label="Slides"></div>';
      navWrap.append(hero, panel);
      this._hero = hero;
      this._heroImg = hero.querySelector('.nav-hero-img');
      this._heroNum = hero.querySelector('.nav-hero-num');
      this._heroTitle = hero.querySelector('.nav-hero-title');
      this._film = panel.querySelector('.film');
      this._navControls = panel.querySelector('.nav-controls');
      this._film.addEventListener('pointerleave', () => { this._filmHover = false; this._hideHero(); });
      hero.addEventListener('pointerenter', () => { this._navHover = true; this._showDock(); });
      hero.addEventListener('pointerleave', () => { this._navHover = false; this._scheduleDockHide(600); });

      const overview = document.createElement('div');
      overview.className = 'overview'; overview.setAttribute('aria-hidden', 'true');
      overview.innerHTML =
        '<div class="ov-head">' +
          '<h3>Overview</h3>' +
          '<span class="ov-sub"></span>' +
          '<span class="ov-hint">Click a slide \u00b7 <kbd>Esc</kbd> to close</span>' +
        '</div>' +
        '<div class="ov-scroll"><div class="ov-grid"></div></div>';

      const help = document.createElement('div');
      help.className = 'help'; help.setAttribute('aria-hidden', 'true');
      help.innerHTML =
        '<div class="help-card" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">' +
          '<h3>Keyboard shortcuts</h3>' +
          '<dl>' +
            '<dt><kbd>\u2190</kbd><kbd>\u2192</kbd></dt><dd>Previous / next slide</dd>' +
            '<dt><kbd>Space</kbd></dt><dd>Next slide</dd>' +
            '<dt><kbd>Home</kbd><kbd>End</kbd></dt><dd>First / last slide</dd>' +
            '<dt><kbd>1</kbd>\u2013<kbd>9</kbd></dt><dd>Jump to slide</dd>' +
            '<dt><kbd>O</kbd><kbd>Esc</kbd></dt><dd>Slide overview</dd>' +
            '<dt><kbd>F</kbd></dt><dd>Fullscreen</dd>' +
            '<dt><kbd>?</kbd></dt><dd>Toggle this panel</dd>' +
          '</dl>' +
        '</div>';

      this._root.append(style, stage, loader, overview, navWrap, help);
      const ribbon = document.createElement('div');
      ribbon.className = 'slide-ribbon';
      ribbon.setAttribute('aria-hidden', 'true');
      ribbon.innerHTML = '<img src="orig/slide-18-the-people/assets/4541-3431.png" alt="">';
      this._root.appendChild(ribbon);
      this._ribbon = ribbon;
      this._canvas = canvas;
      this._track = track;
      this._stage = stage;
      this._slot = slot;
      this._loader = loader;
      this._navWrap = navWrap;
      this._help = help;
      this._overview = overview;
      this._ovGrid = overview.querySelector('.ov-grid');
      this._ovScroll = overview.querySelector('.ov-scroll');
      this._ovSub = overview.querySelector('.ov-sub');
      help.addEventListener('click', (e) => { if (e.target === help) this._toggleHelp(false); });
      overview.addEventListener('click', (e) => { if (e.target === overview) this._toggleOverview(false); });
    }

    _onSlot() {
      const assigned = this._slot.assignedElements({ flatten: true })
        .filter((el) => !/^(TEMPLATE|SCRIPT|STYLE)$/.test(el.tagName));
      const isFirst = this._slides.length === 0;
      this._slides = assigned;
      this._slides.forEach((s, i) => {
        s.setAttribute('data-screen-label', `${pad2(i + 1)} ${labelOf(s)}`);
        this._normalizeText(s);
      });
      if (isFirst) {
        this._restoreIndex();
        this._buildNav();
        this._startLoader();
      } else {
        this._buildNav();
      }
      // First paint commits inline visibility instantly; no animation.
      this._applyIndex(false, false);
      this._bindFrameKeys();
      this._fit();
    }

    /** Keyboard nav must keep working even after the viewer clicks INTO a slide
     *  (which moves focus into that iframe, so the parent window stops seeing
     *  keydowns). Slides are same-origin, so we forward each slide iframe's
     *  keydowns to the same handler — arrows/space/etc. work from anywhere. */
    _bindFrameKeys() {
      this._slides.forEach((s) => {
        const f = s.querySelector('iframe');
        if (!f || f.__keysBound) return;
        f.__keysBound = true;
        const bind = () => {
          try {
            const w = f.contentWindow;
            w.addEventListener('keydown', this._onKey);
            // In present/fullscreen the slide iframe fills the screen and swallows
            // the window's pointermove, so bottom-edge hover never reveals the dock.
            // Forward it: reveal when the cursor is in the slide's bottom band.
            w.addEventListener('pointermove', (e) => {
              if (!this._dockEnabled || COARSE_MQ.matches) return;
              const vh = w.innerHeight || 1080;
              if (e.clientY >= vh - vh * 0.12) this._showDock();
              else if (!this._navHover) this._scheduleDockHide(500);
            }, { passive: true });
          } catch (e) {}
        };
        let ready = false;
        try { ready = f.contentDocument && f.contentDocument.readyState === 'complete'; } catch (e) { ready = false; }
        if (ready) bind(); else f.addEventListener('load', bind);
      });
    }

    /** Strip the pretty-printed HTML indentation that leaked into Figma
     *  text nodes — pre-wrap was rendering each wrapped line's source
     *  indentation as literal leading spaces + spurious blank lines. */
    _normalizeText(slide) {
      slide.querySelectorAll('.figma-text').forEach((el) => {
        if (el.children.length) return; // only plain-text nodes
        const raw = el.textContent;
        const clean = raw.replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
        if (clean !== raw) el.textContent = clean;
      });
    }

    _restoreIndex() {
      let n = 0;
      try { const s = localStorage.getItem(STORE_KEY); if (s != null) n = parseInt(s, 10) || 0; } catch (e) {}
      this._index = Math.max(0, Math.min(this._slides.length - 1, n));
    }

    _buildNav() {
      // Slides may have changed — reset overview + thumbnail caches.
      this._overviewBuilt = false;
      this._ovCards = null;
      if (this._ovGrid) this._ovGrid.textContent = '';
      if (!this._film) return;
      this._film.textContent = '';
      // Filmstrip: one clickable thumbnail per slide (static image — light).
      // Hovering one previews it big in the hero; clicking jumps to it.
      this._navBtns = this._slides.map((s, i) => {
        const b = document.createElement('button');
        b.className = 'film-thumb'; b.type = 'button';
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-label', `${pad2(i + 1)} ${labelOf(s)}`);
        const num = document.createElement('span'); num.className = 'film-num'; num.textContent = pad2(i + 1);
        const shot = document.createElement('span'); shot.className = 'film-shot';
        const img = document.createElement('img'); img.alt = ''; img.decoding = 'async';
        const src = this._thumbSrc(i); if (src) img.src = src;
        shot.appendChild(img);
        b.append(num, shot); b.__img = img;
        b.addEventListener('click', (e) => { e.stopPropagation(); this._go(i); });
        b.addEventListener('pointerenter', () => { this._filmHover = true; this._setHero(i); this._showHero(); });
        this._film.appendChild(b);
        return b;
      });
      // Controls cluster (overview · fullscreen · shortcuts)
      this._navControls.textContent = '';
      const help = document.createElement('button');
      help.className = 'nav-help'; help.type = 'button';
      help.setAttribute('aria-label', 'Keyboard shortcuts');
      help.innerHTML = '<span aria-hidden="true">?</span>';
      help.addEventListener('click', (e) => { e.stopPropagation(); this._toggleHelp(); });
      this._navControls.appendChild(help);
      this._helpBtn = help;
      this._syncNav();
    }

    _syncNav() {
      if (!this._navBtns) return;
      this._navBtns.forEach((b, i) => b.classList.toggle('on', i === this._index));
      // keep the active thumbnail in view within the filmstrip (no scrollIntoView)
      const cur = this._navBtns[this._index];
      if (cur && this._film && this._loaderDone) {
        const r = cur.getBoundingClientRect(), fr = this._film.getBoundingClientRect();
        if (r.left < fr.left) this._film.scrollLeft -= (fr.left - r.left) + 24;
        else if (r.right > fr.right) this._film.scrollLeft += (r.right - fr.right) + 24;
      }
      // hero is only shown while the viewer hovers the strip — not on key nav
      this._updateRibbon();
    }

    _applyIndex(persist = true, animate = false) {
      if (!this._slides.length) return;
      const cur = this._index;
      const prev = (typeof this._lastIndex === 'number') ? this._lastIndex : cur;
      const reduce = REDUCE_MQ.matches;
      const W = this.designWidth, H = this.designHeight;
      const CX = W / 2, CY = H / 2;

      // Lay the slides out as a horizontal filmstrip (left = i × width) and
      // mark the active one. No opacity — the camera does all the work.
      this._slides.forEach((s, i) => {
        s.style.left = (i * W) + 'px';
        s.style.top = '0';
        s.style.opacity = '1';
        if (i === cur) {
          s.style.pointerEvents = 'auto';
          s.setAttribute('data-state', 'active');
          s.setAttribute('data-deck-active', '');
        } else {
          s.style.pointerEvents = 'none';
          s.setAttribute('data-state', i < cur ? 'prev' : 'next');
          s.removeAttribute('data-deck-active');
        }
      });

      // Camera transform: centre slide p (fractional ok) in the viewport at scale s.
      const cam = (p, s) => `translate(${(CX - s * (p * W + CX)).toFixed(2)}px, ${(CY * (1 - s)).toFixed(2)}px) scale(${s.toFixed(4)})`;
      const rest = cam(cur, 1);

      if (animate && !reduce && this._track) {
        this._cancelAnims();
        // Always a single-slide push, even for far jumps: come from the
        // immediate neighbour in the travel direction so the camera never
        // rushes past every slide in between — identical motion to a 1→2 step.
        const dir = cur >= prev ? 1 : -1;
        const from = cur - dir;
        const ZOOM = 0.98;   // just a whisper of pull-back — the push leads
        const a = this._track.animate(
          [
            { transform: cam(from, 1), filter: 'blur(0px)', offset: 0 },
            { transform: cam((from + cur) / 2, ZOOM), filter: 'blur(7px)', offset: 0.5 },
            { transform: rest, filter: 'blur(0px)', offset: 1 },
          ],
          { duration: 760, easing: 'cubic-bezier(.5,0,.2,1)' }
        );
        this._anims = [a];
        // Soft crossfade between outgoing + incoming slide so the change reads
        // as a gentle dissolve instead of a hard edge as the camera pushes.
        const curEl = this._slides[cur], prevEl = this._slides[prev];
        if (prevEl && prevEl !== curEl) {
          this._anims.push(prevEl.animate(
            [{ opacity: 1 }, { opacity: 0, offset: 0.65 }, { opacity: 0 }],
            { duration: 760, easing: 'cubic-bezier(.4,0,.6,1)' }
          ));
          this._anims.push(curEl.animate(
            [{ opacity: 0 }, { opacity: 0, offset: 0.3 }, { opacity: 1 }],
            { duration: 760, easing: 'cubic-bezier(.4,0,.2,1)' }
          ));
        }
      }
      // Commit the rest transform so the camera holds on the active slide.
      this._track.style.transform = rest;

      this._lastIndex = cur;
      this._syncNav();
      if (persist) { try { localStorage.setItem(STORE_KEY, String(cur)); } catch (e) {} }

      // Tell the slide iframes to (re)play / reset their inner entrance
      // animations. The target's content staggers in once the camera lands.
      if (animate) {
        if (prev !== cur) this._postToSlide(prev, 'reset');
        this._timers && this._timers.push(setTimeout(() => this._postToSlide(cur, 'enter'), 520));
        if (!this._timers) setTimeout(() => this._postToSlide(cur, 'enter'), 520);
      }
    }

    /** Post a message into a slide's iframe (entrance / reset triggers). */
    _postToSlide(i, type) {
      const s = this._slides[i];
      if (!s) return;
      const frame = s.querySelector('iframe');
      if (frame && frame.contentWindow) {
        try { frame.contentWindow.postMessage({ source: 'frankly-stage', type }, '*'); } catch (e) {}
      }
    }

    _cancelAnims() {
      if (this._anims) { this._anims.forEach((a) => { try { a.cancel(); } catch (e) {} }); this._anims = null; }
    }

    _go(i) {
      const c = Math.max(0, Math.min(this._slides.length - 1, i));
      if (c === this._index) return;
      this._index = c;
      this._applyIndex(true, true);
    }
    _advance(d) { this._go(this._index + d); }

    _fit() {
      if (!this._canvas) return;
      const s = Math.min(window.innerWidth / this.designWidth, window.innerHeight / this.designHeight);
      this._canvas.style.transform = `scale(${s})`;
      this._positionRibbon();
    }
    _onResize() { this._fit(); }

    // ── Modals: shortcuts overlay + slide overview ──────────────────────
    _isHelpOpen() { return !!(this._help && this._help.hasAttribute('data-on')); }
    _isOverviewOpen() { return !!(this._overview && this._overview.hasAttribute('data-on')); }

    _toggleHelp(force) {
      if (!this._help) return;
      const on = typeof force === 'boolean' ? force : !this._isHelpOpen();
      this._help.toggleAttribute('data-on', on);
      this._help.setAttribute('aria-hidden', on ? 'false' : 'true');
      if (this._helpBtn) this._helpBtn.classList.toggle('on', on);
    }

    _toggleOverview(force) {
      if (!this._overview) return;
      const on = typeof force === 'boolean' ? force : !this._isOverviewOpen();
      if (on) this._buildOverview();
      this._overview.toggleAttribute('data-on', on);
      this._overview.setAttribute('aria-hidden', on ? 'false' : 'true');
      if (this._gridBtn) this._gridBtn.classList.toggle('on', on);
      if (on) {
        this._ovSel = this._index;
        const gw = this._ovGrid ? this._ovGrid.clientWidth : 300;
        this._ovCols = Math.max(1, Math.floor((gw + 24) / (300 + 24)));
        this._refreshOverviewActive();
      }
    }

    _buildOverview() {
      if (this._overviewBuilt || !this._ovGrid) { this._refreshOverviewActive(); return; }
      this._ovGrid.textContent = '';
      if (this._ovSub) this._ovSub.textContent = this._slides.length + ' slides';
      this._ovCards = this._slides.map((s, i) => {
        const card = document.createElement('button');
        card.className = 'ov-card'; card.type = 'button';
        card.addEventListener('click', (e) => { e.stopPropagation(); this._go(i); this._toggleOverview(false); });
        card.addEventListener('mouseenter', () => { this._ovSel = i; this._refreshOverviewActive(); });
        const thumb = document.createElement('div'); thumb.className = 'ov-thumb';
        const scaler = document.createElement('div'); scaler.className = 'ov-scaler';
        const frame = s.querySelector('iframe');
        if (frame) {
          const clone = document.createElement('iframe');
          const osrc = frame.getAttribute('src');
          clone.setAttribute('src', osrc.indexOf('#') >= 0 ? osrc : osrc + '#still');
          clone.setAttribute('scrolling', 'no');
          clone.setAttribute('tabindex', '-1');
          clone.setAttribute('aria-hidden', 'true');
          clone.setAttribute('loading', 'lazy');
          scaler.appendChild(clone);
        } else {
          const clone = s.cloneNode(true);
          clone.removeAttribute('data-state'); clone.removeAttribute('data-deck-active');
          clone.style.cssText = 'position:absolute;left:0;top:0;width:1920px;height:1080px;pointer-events:none;';
          scaler.appendChild(clone);
        }
        thumb.appendChild(scaler);
        const meta = document.createElement('span'); meta.className = 'ov-meta';
        meta.innerHTML = '<span class="ov-num">' + pad2(i + 1) + '</span><span class="ov-label"></span>';
        meta.querySelector('.ov-label').textContent = labelOf(s);
        card.append(thumb, meta);
        this._ovGrid.appendChild(card);
        return card;
      });
      this._overviewBuilt = true;
      this._refreshOverviewActive();
    }

    _refreshOverviewActive() {
      if (!this._ovCards) return;
      this._ovCards.forEach((c, i) => {
        c.classList.toggle('on', i === this._index);
        c.classList.toggle('sel', i === this._ovSel);
      });
    }

    _setSel(i) {
      const n = Math.max(0, Math.min(this._slides.length - 1, i));
      this._ovSel = n;
      this._refreshOverviewActive();
      const c = this._ovCards && this._ovCards[n];
      if (c && this._ovScroll) {
        const r = c.getBoundingClientRect(), sr = this._ovScroll.getBoundingClientRect();
        if (r.top < sr.top) this._ovScroll.scrollTop -= (sr.top - r.top) + 20;
        else if (r.bottom > sr.bottom) this._ovScroll.scrollTop += (r.bottom - sr.bottom) + 20;
      }
    }
    _moveSel(d) { this._setSel((this._ovSel == null ? this._index : this._ovSel) + d); }

    _toggleFullscreen() {
      try {
        const d = document, el = d.documentElement;
        if (!d.fullscreenElement && !d.webkitFullscreenElement) {
          (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el);
        } else {
          (d.exitFullscreen || d.webkitExitFullscreen || (() => {})).call(d);
        }
      } catch (e) {}
    }

    _onKey(e) {
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;

      // Modal-aware Esc: close panel → close overview → open overview.
      if (k === 'Escape') {
        if (this._isHelpOpen()) this._toggleHelp(false);
        else if (this._isOverviewOpen()) this._toggleOverview(false);
        else this._toggleOverview(true);
        e.preventDefault(); return;
      }
      if (k === '?') { this._toggleHelp(); e.preventDefault(); return; }
      if (k === 'o' || k === 'O') { this._toggleOverview(); e.preventDefault(); return; }
      if (k === 'f' || k === 'F') { this._toggleFullscreen(); e.preventDefault(); return; }

      // While the overview is open, the keys drive the grid, not the deck.
      if (this._isOverviewOpen()) {
        let handled = true;
        const cols = this._ovCols || 1;
        if (k === 'ArrowRight') this._moveSel(1);
        else if (k === 'ArrowLeft') this._moveSel(-1);
        else if (k === 'ArrowDown') this._moveSel(cols);
        else if (k === 'ArrowUp') this._moveSel(-cols);
        else if (k === 'Home') this._setSel(0);
        else if (k === 'End') this._setSel(this._slides.length - 1);
        else if (k === 'Enter' || k === ' ' || k === 'Spacebar') { this._go(this._ovSel == null ? this._index : this._ovSel); this._toggleOverview(false); }
        else handled = false;
        if (handled) e.preventDefault();
        return;
      }
      // While the shortcuts panel is open, swallow deck nav.
      if (this._isHelpOpen()) return;

      let handled = true;
      if (k === 'ArrowRight' || k === 'PageDown' || k === ' ' || k === 'Spacebar') this._advance(1);
      else if (k === 'ArrowLeft' || k === 'PageUp') this._advance(-1);
      else if (k === 'Home') this._go(0);
      else if (k === 'End') this._go(this._slides.length - 1);
      else if (k === 'r' || k === 'R') this._go(0);
      else if (/^[0-9]$/.test(k)) { const n = k === '0' ? 9 : parseInt(k, 10) - 1; if (n < this._slides.length) this._go(n); }
      else handled = false;
      if (handled) e.preventDefault();
    }

    _onTap(e) {
      // Tap-to-advance on touch only; keyboard + navigator cover desktop.
      if (!COARSE_MQ.matches || !this._loaderDone) return;
      if (this._isHelpOpen() || this._isOverviewOpen()) return;
      const path = e.composedPath();
      if (!this._stage || !path.includes(this._stage)) return;
      for (const n of path) {
        if (n === this._stage) break;
        if (n.matches && n.matches(INTERACTIVE)) return;
      }
      this._advance(e.clientX < window.innerWidth / 2 ? -1 : 1);
    }

    // ── Loader sequence ─────────────────────────────────────────────────
    _startLoader() {
      this._timers = [];
      const reduce = REDUCE_MQ.matches;
      const FLY = 820, MIN_HOLD = reduce ? 600 : 2300, MAX_WAIT = 35000;
      const start = performance.now();

      const ready = Promise.race([
        Promise.all([
          document.fonts ? document.fonts.ready : Promise.resolve(),
          this._allSlidesReady(),
        ]),
        new Promise((r) => setTimeout(r, MAX_WAIT)),
      ]);

      ready.then(() => {
        this._fixOverflow();
        const elapsed = performance.now() - start;
        const wait = Math.max(0, MIN_HOLD - elapsed);
        this._timers.push(setTimeout(() => this._fly(reduce, FLY), wait));
      });
    }

    /** After fonts load, keep near-single-line label boxes on one line so a
     *  hair of extra render width can't wrap them into the row below. Genuine
     *  multi-line paragraphs (box >> line-height) are left to flow. */
    _fixOverflow() {
      this._slides.forEach((s) => s.querySelectorAll('.figma-text').forEach((el) => {
        if (el.children.length) return;
        const h = parseFloat(el.style.height) || 0;
        const lh = parseFloat(getComputedStyle(el).lineHeight) || 0;
        if (h && lh && h < lh * 1.8 && el.scrollHeight > h + 3) {
          el.style.whiteSpace = 'nowrap';
        }
      }));
    }

    /** Wait for EVERY slide to be fully painted before the loader flies away,
     *  so navigating never reveals a half-loaded slide. Handles both:
     *   • iframe slides — wait for each frame's load event, then its fonts +
     *     internal <img>s (same-origin project files, so readable).
     *   • inline slides — wait for their own <img>s.
     *  Capped overall by MAX_WAIT in the caller; each wait also self-resolves
     *  on error so one stuck asset can't hang the whole deck. */
    _allSlidesReady() {
      const imgDone = (img) => (img.complete ? Promise.resolve()
        : new Promise((r) => { img.addEventListener('load', r, { once: true }); img.addEventListener('error', r, { once: true }); }));

      const frameDone = (frame) => new Promise((resolve) => {
        const inner = () => {
          let doc;
          try { doc = frame.contentDocument; } catch (e) { return resolve(); } // cross-origin: give up gracefully
          if (!doc) return resolve();
          const fontsReady = (doc.fonts && doc.fonts.ready) ? doc.fonts.ready : Promise.resolve();
          const imgs = Array.from(doc.querySelectorAll('img'));
          Promise.all([fontsReady, ...imgs.map(imgDone)]).then(resolve, resolve);
        };
        // Already loaded? Only if the REAL src is in (a freshly-created iframe
        // reports about:blank as "complete" before its src navigates in — that
        // must NOT count, or the loader skips waiting for it). Else wait for load.
        let ready = false;
        try {
          const href = frame.contentWindow && frame.contentWindow.location.href;
          ready = frame.contentDocument && frame.contentDocument.readyState === 'complete'
                  && !!href && href !== 'about:blank';
        } catch (e) { ready = false; }
        if (ready) inner();
        else frame.addEventListener('load', inner, { once: true });
      });

      const crit = this._criticalSet();
      const tasks = [];
      // First few full slides.
      crit.forEach((i) => {
        const s = this._slides[i]; if (!s) return;
        const frame = s.querySelector('iframe');
        if (frame) tasks.push(frameDone(frame));
        else Array.from(s.querySelectorAll('img')).forEach((img) => tasks.push(imgDone(img)));
      });
      // The WHOLE navigator filmstrip (static images), so it's never half-loaded.
      if (this._navBtns) this._navBtns.forEach((b) => { if (b.__img) tasks.push(imgDone(b.__img)); });
      return Promise.all(tasks);
    }

    _slideImagesReady() {
      const first = this._slides[this._index] || this._slides[0];
      if (!first) return Promise.resolve();
      const imgs = Array.from(first.querySelectorAll('img'));
      return Promise.all(imgs.map((img) => (img.complete ? Promise.resolve()
        : new Promise((r) => { img.addEventListener('load', r, { once: true }); img.addEventListener('error', r, { once: true }); }))));
    }

    _fly(reduce, FLY) {
      const loader = this._loader;
      if (reduce) { loader.setAttribute('data-hide', ''); this._loaderDone = true; this._revealNav(); this._syncNav(); this._postToSlide(this._index, 'enter'); this._preloadPreviews(); return; }
      loader.setAttribute('data-flying', '');
      const ease = (x) => { // cubic-bezier(.5,0,.85,.42) — --ease-fly
        const cx = (t) => 3 * (1 - t) * (1 - t) * t * 0.5 + 3 * (1 - t) * t * t * 0.85 + t * t * t;
        const cy = (t) => 3 * (1 - t) * (1 - t) * t * 0 + 3 * (1 - t) * t * t * 0.42 + t * t * t;
        let t = x; for (let i = 0; i < 6; i++) { const d = cx(t) - x; if (Math.abs(d) < 1e-4) break; t -= d / 2; t = Math.max(0, Math.min(1, t)); }
        return cy(t);
      };
      const t0 = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - t0) / FLY);
        loader.style.setProperty('--iris', (ease(p) * 1600) + 'px');
        if (p < 1) this._raf = requestAnimationFrame(step);
      };
      this._raf = requestAnimationFrame(step);
      // Stagger the first slide's content in as the iris opens onto it.
      this._timers.push(setTimeout(() => this._postToSlide(this._index, 'enter'), 120));
      this._timers.push(setTimeout(() => {
        loader.setAttribute('data-hide', '');
        this._loaderDone = true;
        this._revealNav();
        this._syncNav();
        this._preloadPreviews();
      }, 900));
    }

    // ── Dock: auto-hiding navigator (macOS-style) ──────────────────────
    _showDock() {
      if (!this._dockEnabled || !this._navWrap) return;
      clearTimeout(this._dockHideTimer);
      this._navWrap.setAttribute('data-show', '');
      this._updateRibbon();
    }
    _hideDock() {
      if (!this._navWrap || this._navHover) return;
      this._hideHero();
      this._navWrap.removeAttribute('data-show');
      this._updateRibbon();
    }
    // The bottom-left ribbon on slide 19 ("The People") lives inside that slide's
    // iframe, which clips it — so it can't visually spill onto the navigator. We
    // mirror it with a host-level <img> pinned over the bar, aligned to the slide
    // (centered, scaled by `s`), shown only on that slide while the dock is open.
    _RIBBON_SLIDE = 18;
    _positionRibbon() {
      if (!this._ribbon) return;
      const s = Math.min(window.innerWidth / this.designWidth, window.innerHeight / this.designHeight);
      const slideLeft = (window.innerWidth - this.designWidth * s) / 2;
      const slideTop = (window.innerHeight - this.designHeight * s) / 2;
      const r = this._ribbon.style;
      r.left = (slideLeft + (-391) * s) + 'px';
      r.top = (slideTop + 593 * s) + 'px';
      r.width = (1036 * s) + 'px';
      r.height = (633 * s) + 'px';
    }
    _updateRibbon() {
      if (!this._ribbon) return;
      const on = this._index === this._RIBBON_SLIDE && this._navWrap && this._navWrap.hasAttribute('data-show');
      if (on) { this._positionRibbon(); this._ribbon.setAttribute('data-show', ''); }
      else this._ribbon.removeAttribute('data-show');
    }
    _scheduleDockHide(delay) {
      if (COARSE_MQ.matches) return;            // touch: keep the dock up
      clearTimeout(this._dockHideTimer);
      this._dockHideTimer = setTimeout(() => this._hideDock(), delay == null ? 1800 : delay);
    }
    _peekDock(hold) {                            // pop up, then tuck away again
      this._showDock();
      this._scheduleDockHide(hold == null ? 1900 : hold);
    }

    // Slides the loader blocks on: the current slide + the next few. The rest of
    // the deck (and the rest of the navigator thumbnails) stream in afterwards.
    _criticalSet() {
      const n = this._slides.length, out = [];
      for (let d = 0; d < 4 && d < n; d++) out.push(Math.min(n - 1, this._index + d));
      return Array.from(new Set(out));
    }
    // The thumbnail image for a slide (static snapshot at thumbs/NN.jpg).
    _thumbSrc(i) {
      const frame = this._slides[i] && this._slides[i].querySelector('iframe');
      const src = frame ? frame.getAttribute('src') : '';
      const m = (src || '').match(/slide-(\d+)/);
      return m ? 'thumbs/' + m[1] + '.jpg' : null;
    }
    // Hero: a big preview of the focused slide — just a static <img> swap (cached),
    // so scrubbing across the strip switches in real time. Hidden unless hovered.
    _setHero(i) {
      if (!this._heroImg) return;
      const slide = this._slides[i];
      if (!slide) return;
      const changed = (i !== this._heroLast);
      if (this._heroNum) this._heroNum.textContent = pad2(i + 1);
      if (this._heroTitle) this._heroTitle.textContent = labelOf(slide);
      const src = this._thumbSrc(i);
      if (src && this._heroImg.getAttribute('src') !== src) this._heroImg.setAttribute('src', src);
      if (changed && !REDUCE_MQ.matches) { this._animateHeroCap(); this._animateHeroImg(); }
      this._heroLast = i;
    }
    _animateHeroCap() {
      const cap = this._hero && this._hero.querySelector('.nav-hero-cap');
      if (!cap) return;
      try {
        cap.animate(
          [{ opacity: 0, filter: 'blur(5px)' }, { opacity: 1, filter: 'blur(0)' }],
          { duration: 300, easing: 'ease-out', fill: 'both' }
        );
      } catch (e) {}
    }
    _animateHeroImg() {
      if (!this._heroImg) return;
      try {
        this._heroImg.animate(
          [{ opacity: 0.45, transform: 'scale(1.03)' }, { opacity: 1, transform: 'scale(1)' }],
          { duration: 300, easing: 'ease-out', fill: 'both' }
        );
      } catch (e) {}
    }
    _showHero() { if (this._hero) this._hero.setAttribute('data-show', ''); }
    _hideHero() { if (this._hero) this._hero.removeAttribute('data-show'); }

    _preloadPreviews() { /* thumbnails are static images now — nothing to warm */ }
    _onPointerMove(e) {
      if (!this._dockEnabled || COARSE_MQ.matches) return;
      const near = e.clientY >= window.innerHeight - 110;
      if (near) this._showDock();
      else if (!this._navHover) this._scheduleDockHide(500);
    }

    _revealNav() {
      this._dockEnabled = true;
      if (COARSE_MQ.matches) { this._showDock(); return; }  // no hover → always visible
      this._peekDock(2600);                                  // initial peek, then it tucks away
    }

    // Public API
    get index() { return this._index; }
    get length() { return this._slides.length; }
    goTo(i) { this._go(i); }
    next() { this._advance(1); }
    prev() { this._advance(-1); }
  }

  if (!customElements.get('frankly-stage')) customElements.define('frankly-stage', FranklyStage);
})();
