/* ──────────────────────────────────────────────────────────────────────────
 * Frankly slide animations — injected into each orig/<slug>/index.html.
 *
 * Runs INSIDE a slide iframe. The parent <frankly-stage> posts a message when
 * the slide becomes active ({type:'enter'}) or leaves ({type:'reset'}), so the
 * entrance replays every time you navigate onto the slide.
 *
 * Three behaviours, all straight from the design system's Motion card:
 *   1. Entrance  — content fades + rises (translateY 14→0), staggered top→bottom.
 *   2. Count-up  — standalone stat numbers tween 0→target (1500ms ease-out cubic)
 *                  then a 480ms pop. Width is pinned (tabular-nums) so trailing
 *                  labels never shift.
 *   3. Hover lift — card shapes + the text/images sitting on them rise together
 *                  (translateY(-4px) scale(1.03), 320ms) on hover.
 *
 * Honors prefers-reduced-motion: everything shows at its final state, no motion.
 * ────────────────────────────────────────────────────────────────────────── */
(function () {
  if (window.__franklyAnim) return;
  window.__franklyAnim = true;

  var REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var EASE_OUT = 'cubic-bezier(.16,1,.3,1)';   // --ease-out
  var EASE = 'cubic-bezier(.22,.61,.36,1)';     // --ease
  var EASE_LEAD = 'cubic-bezier(.2,.8,.2,1)';   // --ease-lead (headline word-rise, added 2026-06)

  var slide, items, counts, played = false, raf = [], timers = [], bgZooms = [];
  var STILL = false;   // #still / ?still — render the finished slide, no motion (used by nav previews/overview)

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  // ── Setup: collect elements, pin pre-hidden state, wire count-ups + hover ──
  function setup() {
    slide = document.querySelector('.figma-slide');
    if (!slide) return;
    STILL = /still/i.test(location.hash) || /(?:^|[?&])still(?:=|&|$)/i.test(location.search);

    items = Array.prototype.slice.call(slide.querySelectorAll('.figma-text, .figma-node, .figma-shape, .fk-reveal'))
      .filter(function (el) {
        // elements pinned to the background (e.g. cover ribbons) never hide/stagger —
        // they paint with the slide background and are revealed by the loader iris.
        if (el.classList.contains('fk-bg')) return false;
        // explicit graph/diagram members (data-stage / data-graph) are kept even
        // when large — e.g. slide 14's outer market circle is ~1975px wide.
        if (el.hasAttribute('data-stage') || el.hasAttribute('data-graph')) return true;
        var w = parseFloat(el.style.width) || 0;
        // skip the full-bleed slide background block (it must never move/fade)
        return !(w >= 1900);
      });

    // Remember each element's natural opacity so reveal restores it (some are .2/.8).
    items.forEach(function (el) {
      el.__op = el.style.opacity !== '' ? el.style.opacity : '1';
      el.__tf = el.style.transform || '';   // preserve any authored transform (e.g. the rotated funnel label)
      el.__ft = el.style.filter || '';      // preserve any authored filter (e.g. blurred glow circles)
    });

    detectCounts();
    // Split every headline (rank 1) into words for the DS signature word-rise.
    // Skip count-up numbers (their text is rewritten each frame).
    var countSet = {};
    counts.forEach(function (c) { countSet[c.el === undefined ? -1 : items.indexOf(c.el)] = true; });
    items.forEach(function (el, i) {
      if (countSet[i]) return;
      if (rankOf(el) === 1 && el.classList.contains('figma-text') && !el.children.length) splitWords(el);
    });
    if (REDUCE || STILL) { showFinal(); return; }
    setupHover();
    setupFloat();
    setupZoom();
    setupBgZoom();
    setupIconHover();
    if (slide.hasAttribute('data-bg-frames')) markFramesStatic();
    if (slide.hasAttribute('data-graph-seq')) setupGraph();
    if (slide.hasAttribute('data-flywheel')) setupFlywheel();
    hide();           // pre-hide so the entrance can play when 'enter' arrives
  }

  // Slide-9 style graph: the chart base ([data-graph]) is always visible; each
  // numbered stage ([data-stage="1|2|3"]) — dot, connector, box + text — reveals
  // in sequence left→right, its dot rising up onto the curve.
  var graphStages = null;
  function setupGraph() {
    var map = {};
    items.forEach(function (el) {
      if (el.hasAttribute('data-graph')) el.classList.add('fk-static');   // chart base: always on
      var s = el.getAttribute('data-stage');
      if (s) { el.classList.add('fk-seq'); (map[s] = map[s] || []).push(el); }
    });
    var keys = Object.keys(map).sort(function (a, b) { return (+a) - (+b); });
    graphStages = keys.length ? keys.map(function (k) { return map[k]; }) : null;
  }

  // Tag frame-sized glass shapes AND everything sitting inside them as fk-static,
  // so they're revealed with the background instead of in the staggered entrance.
  function markFramesStatic() {
    var rectOf = function (el) {
      return { l: parseFloat(el.style.left) || 0, t: parseFloat(el.style.top) || 0,
               w: parseFloat(el.style.width) || 0, h: parseFloat(el.style.height) || 0 };
    };
    var frames = items.filter(function (el) {
      if (!el.classList.contains('figma-shape')) return false;
      var r = rectOf(el);
      return r.w >= 180 && r.w <= 270 && r.h >= 200 && r.h <= 280;
    });
    frames.forEach(function (card) {
      card.classList.add('fk-static');
      var r = rectOf(card);
      items.forEach(function (el) {
        if (el === card) return;
        var er = rectOf(el), ex = er.l + er.w / 2, ey = er.t + er.h / 2;
        if (ex >= r.l && ex <= r.l + r.w && ey >= r.t && ey <= r.t + r.h && er.w <= r.w && er.h <= r.h) {
          el.classList.add('fk-static');
        }
      });
    });
  }

  // Wrap each word of a headline in an inline-block span so they can rise one
  // after another — the design system's signature reveal.
  function splitWords(el) {
    var text = el.textContent;
    el.textContent = '';
    var parts = text.split(/(\s+)/);
    var spans = [];
    parts.forEach(function (part) {
      if (part === '') return;
      if (/^\s+$/.test(part)) { el.appendChild(document.createTextNode(part)); return; }
      var s = document.createElement('span');
      s.className = 'fk-w';
      s.style.display = 'inline-block';
      s.style.willChange = 'opacity, transform';
      s.textContent = part;
      el.appendChild(s);
      spans.push(s);
    });
    if (spans.length) el.__words = spans;
  }

  // Fade-up offset (px) per family at the hidden start — exact deck distances.
  function famDist(el) {
    var r = rankOf(el);
    if (r === 0) return 30;   // cards / panels
    if (r === 2) return 26;   // eyebrow / sub-head
    if (r === 3) return 0;    // hero imagery — fade-in only
    return 20;                // body / detail
  }

  function hide() {
    items.forEach(function (el) {
      el.style.transition = 'none';
      el.style.filter = el.__ft || '';       // authored filters kept; no blur reveal
      if (el.classList.contains('fk-static')) {
        // Revealed with the background (no stagger) — e.g. slide 8 glass frames + content.
        el.style.opacity = el.__op;
        el.style.transform = el.__tf || 'none';
        if (el.__words) el.__words.forEach(function (w) { w.style.transition = 'none'; w.style.opacity = '1'; w.style.translate = '0 0'; });
        return;
      }
      if (el.classList.contains('fk-paint')) {
        // Pink card painted-in: start fully clipped from the left (nothing shown),
        // wipes open L→R on reveal. Card stays in place (no rise/fade).
        el.style.opacity = el.__op;
        el.style.transform = el.__tf || 'none';
        el.style.clipPath = 'inset(0 100% 0 0)';
        return;
      }
      if (el.classList.contains('fk-flip')) {
        // Flip-in start: rotated 90° on Y + dropped, around the card centre.
        // Takes precedence over word-splitting — a flip member reveals as one
        // unit, so any split words inside must be shown (else the headline/stat
        // would stay hidden and the card looks empty).
        el.style.opacity = '0';
        el.style.transformOrigin = el.__flipOrigin || 'center';
        el.style.transform = (el.__tf ? el.__tf + ' ' : '') + 'rotateY(90deg) translateY(24px)';
        if (el.__words) el.__words.forEach(function (w) { w.style.transition = 'none'; w.style.opacity = '1'; w.style.translate = '0 0'; });
      } else if (el.__words) {
        // Headline block stays put/visible; only its words are hidden + rise.
        el.style.opacity = el.__op;
        el.style.transform = el.__tf || 'none';
        el.__words.forEach(function (w) { w.style.transition = 'none'; w.style.opacity = '0'; w.style.translate = '0 0.5em'; });
      } else if (el.classList.contains('fk-seq') && el.classList.contains('chart-bar')) {
        // Bar-chart column: grows up from its baseline (scaleY 0→1, origin bottom).
        el.style.opacity = el.__op;
        el.style.transformOrigin = 'bottom center';
        el.style.transform = (el.__tf ? el.__tf + ' ' : '') + 'scaleY(0)';
      } else if (el.classList.contains('fk-seq')) {
        // Graph/diagram stage member — hidden until its stage fires.
        el.style.opacity = '0';
        var ww = parseFloat(el.style.width) || 0, hh = parseFloat(el.style.height) || 0;
        var nearSquare = Math.abs(ww - hh) < Math.min(ww, hh) * 0.2;
        if ((ww >= 300 || hh >= 300) && nearSquare) {
          // Large round graphic (e.g. market-size circles) — grow from centre.
          el.style.transformOrigin = 'center';
          el.style.transform = (el.__tf ? el.__tf + ' ' : '') + 'scale(0.72)';
        } else {
          // Dots/lines climb up onto the curve; boxes/labels rise a little.
          var isDotLine = (ww <= 30 && hh <= 30) || ww <= 3;
          el.style.transform = el.__tf || (isDotLine ? 'translateY(34px)' : 'translateY(20px)');
        }
      } else if (el.classList.contains('fk-flip')) {
        // handled above (flip takes precedence over word-split)
        el.style.opacity = '0';
        el.style.transformOrigin = el.__flipOrigin || 'center';
        el.style.transform = (el.__tf ? el.__tf + ' ' : '') + 'rotateY(90deg) translateY(24px)';
      } else {
        el.style.opacity = '0';
        if (el.__tf) el.style.transform = el.__tf;          // authored transform → just fade
        else { var d = famDist(el); el.style.transform = d ? 'translateY(' + d + 'px)' : 'none'; }
      }
    });
    counts.forEach(function (c) { c.el.textContent = c.render(0); });
    bgZooms.forEach(function (el) {
      el.style.transition = 'none';
      el.style.transformOrigin = (el.__bzox || 'center') + ' ' + (el.__bzoy || 'center');
      el.style.transform = (el.__bztf ? el.__bztf + ' ' : '') + 'scale(1.08)';
    });
  }

  function showFinal() {
    items.forEach(function (el) {
      el.style.opacity = el.__op;
      el.style.transform = el.__tf || 'none';
      el.style.filter = el.__ft || 'none';
      if (el.classList.contains('fk-paint')) el.style.clipPath = 'inset(0 0 0 0)';
      if (el.__words) el.__words.forEach(function (w) { w.style.opacity = '1'; w.style.translate = '0 0'; });
    });
    counts.forEach(function (c) { c.el.textContent = c.render(c.value); });
    bgZooms.forEach(function (el) {
      el.style.transition = 'none';
      el.style.transform = el.__bztf || 'none';
    });
  }

  // ── Background photo zoom-out: flagged full-bleed images (.fk-bgzoom) start
  //    slightly scaled up and ease back to their natural size on reveal, giving
  //    the entrance a soft cinematic push-out. Honors #still / reduced-motion. ──
  function setupBgZoom() {
    bgZooms = Array.prototype.slice.call(slide.querySelectorAll('.fk-bgzoom'));
    var sw = parseFloat(slide.style.width) || 1920;
    var sh = parseFloat(slide.style.height) || 1080;
    bgZooms.forEach(function (el) {
      el.__bztf = el.style.transform || '';
      // Scale every bg-zoom element around the SAME world point (the slide
      // centre) so foreground device mockups ride along with the full-bleed
      // background as if parented to it. Origin is expressed in each element's
      // local coords = slide-centre minus the element's own top-left.
      var L = parseFloat(el.style.left) || 0, T = parseFloat(el.style.top) || 0;
      if (el.classList.contains('fk-bgself')) {
        // Scale around the element's OWN centre — expands in place, no sideways drift.
        el.__bzox = 'center';
        el.__bzoy = 'center';
      } else {
        el.__bzox = (sw / 2 - L) + 'px';
        el.__bzoy = (sh / 2 - T) + 'px';
      }
    });
  }

  // ── Visual hierarchy: which layer an element belongs to (0 = first in) ──
  // Surfaces/cards build first, then the headline, supporting copy, media,
  // and finally the fine detail (labels, chips, icons) — so dense slides read
  // as ordered layers instead of arriving all at once.
  function rankOf(el) {
    var w = parseFloat(el.style.width) || 0, h = parseFloat(el.style.height) || 0;
    var area = w * h;
    if (el.classList.contains('figma-shape')) {
      return area >= 200 * 70 ? 0 : 4;          // big card/panel vs small chip
    }
    if (el.classList.contains('figma-text')) {
      var fam = el.style.fontFamily || '';
      var size = parseFloat(el.style.fontSize) || 0;
      if (size >= 34 || fam.indexOf('Almarena') !== -1) return 1;  // headline / display
      if (size >= 18) return 2;                 // eyebrow / sub-head / lead
      return 4;                                  // body, labels, small numbers
    }
    if (el.classList.contains('figma-node')) {
      return area >= 120 * 120 ? 3 : 4;         // real image vs icon/bullet
    }
    return 4;
  }

  // ── 1 + 2. Entrance: layered hierarchy build, then count-up the stats ──
  function play() {
    if (REDUCE) { showFinal(); return; }
    clearAll();
    hide();
    if (bgZooms.length) {
      raf.push(requestAnimationFrame(function () {
        raf.push(requestAnimationFrame(function () {
          bgZooms.forEach(function (el) {
            el.style.transition = 'transform 1600ms ' + EASE_OUT;
            el.style.transform = el.__bztf || 'none';
          });
        }));
      }));
    }
    var RANK_GAP = 150, INTRA = 36, INTRA_CAP = 280, BASE = 140;
    // fk-static elements are revealed with the background, so they sit out the
    // staggered entrance entirely (hide() already left them visible).
    var ranked = items.filter(function (el) { return !el.classList.contains('fk-static') && !el.classList.contains('fk-seq') && !el.classList.contains('fk-flip'); }).map(function (el) {
      return { el: el, rank: rankOf(el), top: parseFloat(el.style.top) || 0,
               left: parseFloat(el.style.left) || 0, w: parseFloat(el.style.width) || 0 };
    });
    var delayMap = null;
    if (items.some(function (el) { return el.hasAttribute('data-rev'); })) {
      // Explicit sequence by data-rev: elements sharing a value reveal TOGETHER
      // as one group (small intra-stagger); the next value waits until the current
      // group has landed — so e.g. each card fills in fully before the next starts.
      delayMap = new Map();
      var rankSort = function (a, b) {
        if (Math.abs(a.top - b.top) > 8) return a.top - b.top;
        return a.left - b.left;
      };
      var revGroups = {};
      ranked.filter(function (it) { return it.el.hasAttribute('data-rev'); })
        .forEach(function (it) { var k = +it.el.getAttribute('data-rev'); (revGroups[k] = revGroups[k] || []).push(it); });
      var revKeys = Object.keys(revGroups).map(Number).sort(function (a, b) { return a - b; });
      var cursor = BASE, INTRA = 45;
      revKeys.forEach(function (k) {
        var grp = revGroups[k];
        grp.sort(rankSort);
        grp.forEach(function (it, i) { delayMap.set(it.el, cursor + i * INTRA); });
        // advance past this group: its intra-stagger span, then a short tail so a
        // multi-element group (a whole card) reads as one unit before the next.
        cursor += (grp.length - 1) * INTRA + (grp.length > 1 ? 230 : 200);
      });
      ranked.filter(function (it) { return !it.el.hasAttribute('data-rev'); }).sort(rankSort)
        .forEach(function (it, i) { delayMap.set(it.el, cursor + i * 30); });
    } else {
      // DEFAULT reveal: TOP→BOTTOM is primary (lowest element reveals last);
      // within a horizontal band, side-by-side boxes reveal LEFT→RIGHT. Delay is
      // keyed to the BAND INDEX (not cumulative element count) so the cascade
      // stays bounded on dense slides — the bottom band always lands last.
      var BAND = 135;
      var bandList = ranked.map(function (it) { return Math.floor(it.top / BAND); })
        .filter(function (b, i, a) { return a.indexOf(b) === i; }).sort(function (a, b) { return a - b; });
      ranked.sort(function (a, b) {
        var ba = Math.floor(a.top / BAND), bb = Math.floor(b.top / BAND);
        if (ba !== bb) return ba - bb;
        return a.left - b.left;
      });
      delayMap = new Map();
      var withinIdx = {};
      ranked.forEach(function (it) {
        var b = Math.floor(it.top / BAND);
        var bi = bandList.indexOf(b);                 // 0,1,2… sequential band index
        var wi = (withinIdx[b] = (withinIdx[b] || 0) + 1) - 1;
        delayMap.set(it.el, BASE + bi * 150 + Math.min(wi * 34, 200));
      });
    }
    // Headline always leads: pull the display/headline text (rank 1) sitting in
    // the upper title area to the very front so it's first in on every reveal.
    if (delayMap) {
      ranked.forEach(function (it) { if (rankOf(it.el) === 1 && it.top < 340) delayMap.set(it.el, 40); });
    }
    var seen = {};
    var delayOf = function (el) {
      if (delayMap) return delayMap.get(el);
      var r = rankOf(el);
      var idx = (seen[r] = (seen[r] || 0) + 1) - 1;
      return BASE + r * RANK_GAP + Math.min(idx * INTRA, INTRA_CAP);
    };
    ranked.forEach(function (item) {
      var el = item.el;
      var delay = delayOf(el);
      timers.push(setTimeout(function () {
        if (el.classList.contains('fk-paint')) {
          // Pink "paint" takeover: the fill wipes in diagonally L→R as a brush sweep.
          el.style.opacity = el.__op;
          el.style.transform = el.__tf || 'none';
          el.style.transition = 'clip-path 820ms ' + EASE_OUT;
          el.style.clipPath = 'inset(0 0 0 0)';
        } else if (el.__words) {
          // THE SIGNATURE: word-by-word rise — each word opacity 0→1 +
          // translateY(.5em)→0, 680ms on --ease-lead, +70ms per word.
          el.style.opacity = el.__op;
          el.__words.forEach(function (w, i) {
            w.style.transition = 'opacity 680ms ' + EASE_LEAD + ', translate 680ms ' + EASE_LEAD;
            w.style.transitionDelay = (i * 70) + 'ms';
            w.style.opacity = '1';
            w.style.translate = '0 0';
          });
        } else {
          // Fade-up family: eyebrow 680ms/lead, cards 700ms, imagery 900ms, body 550ms.
          var r = rankOf(el);
          var dur = r === 0 ? 700 : (r === 2 ? 680 : (r === 3 ? 900 : 550));
          var ease = (r === 2) ? EASE_LEAD : EASE_OUT;
          el.style.transition = 'opacity ' + dur + 'ms ' + ease + ', transform ' + dur + 'ms ' + ease;
          el.style.opacity = el.__op;
          el.style.transform = el.__tf || 'none';
        }
        afterHover(el);  // hand transform control to hover once entrance settles
      }, delay));
    });
    // count-ups fire just after their number's layer has begun revealing
    counts.forEach(function (c) {
      var delay = (delayMap && delayMap.get(c.el)) || (BASE + rankOf(c.el) * RANK_GAP + 120);
      timers.push(setTimeout(function () { countUp(c); }, delay));
    });

    // Graph/diagram stage sequence: reveal stage 1→2→3… as a brisk cascade.
    if (graphStages) {
      var many = graphStages.length > 4;
      var STAGE_GAP = many ? 230 : 400;     // snappy — don't make the viewer wait
      var STAGE_BASE = many ? 420 : 600;    // start early, overlapping the text tail
      graphStages.forEach(function (members, si) {
        var t0 = STAGE_BASE + si * STAGE_GAP;
        members.forEach(function (el, k) {
          timers.push(setTimeout(function () {
            el.style.transition = 'opacity 640ms ' + EASE_OUT + ', transform 760ms ' + EASE_OUT;
            el.style.opacity = el.__op;
            el.style.transform = el.__tf || 'none';
          }, t0 + k * 22));
        });
      });
    }
    // Flip-card entrance: each card group flips in rotateY(90→0)+lift, 120ms stagger.
    if (flipGroups && flipGroups.length) {
      flipGroups.forEach(function (g, gi) {
        var t0 = BASE + 180 + gi * 120;
        timers.push(setTimeout(function () {
          g.members.forEach(function (el) {
            el.style.transition = 'opacity 800ms ' + EASE + ', transform 800ms ' + EASE;
            el.style.opacity = el.__op;
            el.style.transform = el.__tf || 'none';
          });
        }, t0));
      });
    }

    // Safety net: if anything is still hidden after the sequence window, fade it
    // in gently (never a hard snap) so content can't get stuck — and never pops.
    timers.push(setTimeout(function () {
      items.forEach(function (el) {
        if (+getComputedStyle(el).opacity > 0.05) return;        // already shown
        if (el.classList.contains('fk-static')) { el.style.opacity = el.__op; return; }
        el.style.transition = 'opacity 500ms ' + EASE_OUT + ', transform 500ms ' + EASE_OUT;
        el.style.opacity = el.__op;
        el.style.transform = el.__tf || 'none';
        if (el.__words) el.__words.forEach(function (w) {
          w.style.transition = 'opacity 500ms ' + EASE_OUT + ', translate 500ms ' + EASE_OUT;
          w.style.opacity = '1'; w.style.translate = '0 0';
        });
      });
    }, 4200));

    played = true;
  }

  function reset() {
    if (REDUCE) return;
    clearAll();
    hide();
    played = false;
  }

  function clearAll() {
    timers.forEach(clearTimeout); timers = [];
    raf.forEach(cancelAnimationFrame); raf = [];
  }

  // ── Count-up detection + runner ──
  function detectCounts() {
    counts = [];
    // Per-slide opt-out: numbers reveal with the entrance but never tween up.
    if (slide && slide.hasAttribute('data-no-countup')) return;
    items.forEach(function (el) {
      if (!el.classList.contains('figma-text')) return;
      if (el.children.length) return;
      if (el.hasAttribute('data-graph') || el.hasAttribute('data-stage')) return;  // chart base/stage labels never count up
      if (el.classList.contains('fk-nocount')) return;  // per-element opt-out (e.g. ordinal step labels)
      var txt = (el.textContent || '').trim();
      if (txt.length > 18 || txt.indexOf('→') !== -1) return;
      var fam = (el.style.fontFamily || '');
      var size = parseFloat(el.style.fontSize) || 0;
      if (fam.indexOf('Almarena') === -1 && size < 24) return;
      // prefix (€ $ + -), number, suffix
      var m = txt.match(/^([€$+\-]?\s*)(\d[\d., ]*\d|\d)(.*)$/);
      if (!m) return;
      var prefix = m[1], numStr = m[2].replace(/\s+/g, ''), suffix = m[3];
      var decChar = '', decimals = 0, value;
      if (numStr.indexOf('.') !== -1) {
        decChar = '.'; decimals = numStr.split('.')[1].length;
        value = parseFloat(numStr.replace(/,/g, ''));
      } else if (/,\d{1,2}$/.test(numStr)) {           // comma as decimal (e.g. 2,10x)
        decChar = ','; decimals = numStr.split(',')[1].length;
        value = parseFloat(numStr.replace(',', '.'));
      } else {
        value = parseFloat(numStr.replace(/,/g, ''));   // plain integer (324, 220)
      }
      if (!isFinite(value) || value <= 0) return;
      var render = function (v) {
        var s = decimals ? v.toFixed(decimals) : String(Math.round(v));
        if (decChar === ',') s = s.replace('.', ',');
        return prefix + s + suffix;
      };
      // pin width to the final render so trailing labels never shift mid-count
      el.style.fontVariantNumeric = 'tabular-nums';
      el.style.whiteSpace = 'nowrap';
      counts.push({ el: el, value: value, decimals: decimals, render: render });
    });
  }

  function countUp(c) {
    var DUR = 1500, start = performance.now();
    var ease = function (t) { return 1 - Math.pow(1 - t, 3); };
    (function step(now) {
      var t = Math.min(1, (now - start) / DUR);
      c.el.textContent = c.render(ease(t) * c.value);
      if (t < 1) raf.push(requestAnimationFrame(step));
      else pop(c.el);
    })(start);
  }

  function pop(el) {
    el.style.transition = 'transform .48s ' + EASE;       // --dur-pop
    el.style.transformOrigin = 'center';
    el.style.transform = 'scale(1.10)';
    timers.push(setTimeout(function () { el.style.transform = 'none'; }, 120));
  }

  // ── 3. Hover lift: group each card shape with the content sitting on it ──
  var groups = [];
  var flipGroups = null;
  function setupHover() {
    groups = [];
    flipGroups = null;
    if (!document.getElementById('fk-edge-style')) {
      var es = document.createElement('style'); es.id = 'fk-edge-style';
      es.textContent = '@keyframes fk-edge-flow{to{background-position:200% 0}}';
      document.head.appendChild(es);
    }
    var rectOf = function (el) {
      return {
        l: parseFloat(el.style.left) || 0, t: parseFloat(el.style.top) || 0,
        w: parseFloat(el.style.width) || 0, h: parseFloat(el.style.height) || 0
      };
    };
    var zoomModeSlide = slide.hasAttribute('data-hover-zoom');
    var popModeSlide = slide.hasAttribute('data-hover-pop');
    var noEdge = zoomModeSlide || popModeSlide;
    var cards = items.filter(function (el) {
      if (!el.classList.contains('figma-shape')) return false;
      if (el.classList.contains('fk-nohover')) return false;
      if (/filter\s*:\s*blur/.test(el.getAttribute('style') || '')) return false;  // decorative glow, never a hover card
      if (el.classList.contains('fk-hovercard')) return true;   // explicit opt-in (e.g. small-radius flywheel boxes)
      var r = rectOf(el);
      if (zoomModeSlide) {
        // Frame-size detection (matches the float anchors) so EVERY glass frame
        // gets a hover group — incl. the smaller drive/travel frames.
        return r.w >= 180 && r.w <= 270 && r.h >= 200 && r.h <= 280;
      }
      if (popModeSlide) {
        // Big funnel columns only — inner cards/text ride along as members.
        return r.w >= 300 && r.h >= 250;
      }
      // border-radius may be a 4-value shorthand (e.g. "20px 0 0 20px" for a card
      // with only its outer corners rounded) — take the LARGEST corner so a card
      // whose first value is 0 still qualifies as a surface.
      var brVals = (el.style.borderRadius || '').split('/')[0].trim().split(/\s+/).map(parseFloat).filter(function (n) { return !isNaN(n); });
      var br = brVals.length ? Math.max.apply(null, brVals) : 0;
      var styleStr = el.getAttribute('style') || '';
      var bg = el.style.background || el.style.backgroundColor || '';
      // Any real surface: a fill (incl. translucent glass) OR a border, with a
      // card radius and card-ish proportions. Chips/pills (short) and full
      // panels (very wide) are excluded.
      var hasFill = !!bg && !/,\s*0\s*\)/.test(bg);
      var hasBorder = /border\s*:/.test(styleStr);
      return br >= 10 && r.w >= 150 && r.h >= 60 && r.w < 1500 && (hasFill || hasBorder);
    });
    var claimed = new Set();
    // Pre-assign every content element to the ONE card it overlaps most, so
    // nothing is mis-assigned (no cross-box drift) and nothing is left unclaimed
    // (no frame falls behind a lifted box). Each card then lifts as one unit.
    var cardRects = cards.map(rectOf);
    var ownerOf = function (el) {
      var er = rectOf(el), best = -1, bestArea = 0;
      for (var i = 0; i < cardRects.length; i++) {
        var r = cardRects[i];
        if (er.w > r.w * 1.15 || er.h > r.h * 1.15) continue;   // skip elements bigger than the card
        var ox = Math.max(0, Math.min(er.l + er.w, r.l + r.w) - Math.max(er.l, r.l));
        var oy = Math.max(0, Math.min(er.t + er.h, r.t + r.h) - Math.max(er.t, r.t));
        var a = ox * oy;
        if (a > bestArea) { bestArea = a; best = i; }
      }
      return bestArea > 0 ? best : -1;
    };
    cards.forEach(function (card, ci) {
      var r = rectOf(card);
      var cx = r.l + r.w / 2, cy = r.t + r.h / 2;
      var members = [card];
      // Claim pool: the staggered items PLUS any always-visible riders
      // (.fk-rides — e.g. icon chips that sit on a card but aren't figma-nodes).
      var ridePool = Array.prototype.slice.call(slide.querySelectorAll('.fk-rides'));
      var claimPool = items.concat(ridePool.filter(function (el) { return items.indexOf(el) === -1; }));
      claimPool.forEach(function (el) {
        if (el === card || claimed.has(el) || cards.indexOf(el) !== -1) return;
        if (el.classList.contains('fk-nohover')) return;
        if (/[^-]filter\s*:\s*blur/.test(el.getAttribute('style') || '')) return;  // don't drag decorative glows (standalone filter:blur only — NOT backdrop-filter glass)
        if (ownerOf(el) === ci) { members.push(el); claimed.add(el); el.__inGroup = true; }
      });
      // overlay to capture hover above the (higher z) text
      var hit = document.createElement('div');
      hit.style.cssText = 'position:absolute;left:' + r.l + 'px;top:' + r.t + 'px;width:' + r.w +
        'px;height:' + r.h + 'px;z-index:9990;background:transparent;cursor:pointer;border-radius:' +
        (card.style.borderRadius || '0') + ';';
      slide.appendChild(hit);
      var zoomMode = noEdge;
      var edge = null;
      if (false) {
        // Animated gradient edge-border (DS --card-edge), masked to a ring and
        // flowed with fk-edge-flow; revealed on hover, lifts in sync with the card.
        var rad = card.style.borderRadius || '12px';   // keep the full shorthand so asymmetric cards (rounded outer / square inner edge) get a matching ring
        edge = document.createElement('div');
        edge.style.cssText = 'position:absolute;left:' + r.l + 'px;top:' + r.t + 'px;width:' + r.w + 'px;height:' + r.h +
          'px;border-radius:' + rad + ';padding:2px;box-sizing:border-box;z-index:9989;pointer-events:none;opacity:0;' +
          'background:linear-gradient(90deg,#FFACCA,#2D0011,#FFACCA);background-size:200% 100%;' +
          '-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;' +
          'mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask-composite:exclude;' +
          'transform-origin:center;animation:fk-edge-flow 3s linear infinite;';
        slide.appendChild(edge);
      }
      // If a card's corners are asymmetric (e.g. a side card with rounded outer
      // edge + square inner edge where it abuts a neighbour), round ALL corners
      // while it's lifted so it reads as one clean, detached card.
      var brP = (card.style.borderRadius || '').split('/')[0].trim().split(/\s+/).map(parseFloat).filter(function (n) { return !isNaN(n); });
      var brMax = brP.length ? Math.max.apply(null, brP) : 0;
      var asym = brP.length > 1 && brP.some(function (n) { return n !== brP[0]; });
      var g = { members: members, cx: cx, cy: cy, hit: hit, card: card, cardShadow: card.style.boxShadow || '', edge: edge, zoom: zoomMode, pop: popModeSlide,
               brOrig: card.style.borderRadius || '', brRound: brMax ? brMax + 'px' : '', asym: asym };
      hit.addEventListener('mouseenter', function () { liftOn(g); });
      hit.addEventListener('mouseleave', function () { liftOff(g); });
      groups.push(g);
    });

    // Flip entrance: the DS flip-in (rotateY 90→0 + lift, 800ms, 120ms stagger)
    // applied to each card group. Members share the card's centre + the slide's
    // perspective so the whole card flips as one.
    if (slide.hasAttribute('data-flip-cards') && groups.length) {
      slide.style.perspective = '1500px';
      flipGroups = groups.slice();
      flipGroups.forEach(function (g) {
        g.members.forEach(function (el) {
          var l = parseFloat(el.style.left) || 0, t = parseFloat(el.style.top) || 0;
          el.__flipOrigin = (g.cx - l) + 'px ' + (g.cy - t) + 'px';
          el.classList.add('fk-flip');
        });
      });
    }
  }

  // once an element's entrance is done, give it the snappy hover transition
  function afterHover(el) {
    if (!el.__inGroup) return;
    timers.push(setTimeout(function () {
      el.style.transition = 'transform .32s ' + EASE + ', opacity .6s ' + EASE_OUT;
    }, 650));
  }

  // Design-system hover (updated): the surface rises translateY(-4px) scale(1.03)
  // with a LOW resting shadow (--shadow-lift) while a flowing gradient edge-border
  // carries the emphasis. Lift + edge animate together over 320ms.
  var SHADOW_LIFT = '0 3px 7px rgba(45,0,17,0.085)';   // --shadow-lift
  function liftOn(g) {
    if (g.zoom) {
      // Slide opted into plain hover-expand (no edge-border frame).
      if (g.pop && g.card) {
        // Funnel column: round all corners while popped so the butting square
        // edge (e.g. box 2's right side) reads as a clean lifted card.
        g.card.__br = g.card.style.borderRadius;
        g.card.style.transition = (g.card.style.transition ? g.card.style.transition + ', ' : '') + 'border-radius .42s ' + EASE_OUT;
        g.card.style.borderRadius = '16px';
      }
      g.members.forEach(function (el) {
        var l = parseFloat(el.style.left) || 0, t = parseFloat(el.style.top) || 0;
        el.style.transformOrigin = (g.cx - l) + 'px ' + (g.cy - t) + 'px';
        el.style.transition = 'transform .42s ' + EASE_OUT;
        el.style.transform = (el.__tf ? el.__tf + ' ' : '') + 'scale(1.06)';
        // Bring the hovered column (card + all its captured content) to the front
        // so it lifts above its neighbours instead of staying tucked behind them.
        el.style.zIndex = (parseInt(el.style.zIndex, 10) || 0) + 1000;
      });
      return;
    }
    g.members.forEach(function (el) {
      var l = parseFloat(el.style.left) || 0, t = parseFloat(el.style.top) || 0;
      el.style.transformOrigin = (g.cx - l) + 'px ' + (g.cy - t) + 'px';
      el.style.transition = 'transform .32s ' + EASE + ', box-shadow .32s ' + EASE;
      el.style.transform = 'translateY(-4px) scale(1.03)';
      el.style.zIndex = (parseInt(el.style.zIndex, 10) || 0) + 1000;
    });
    // Asymmetric card → round every corner while lifted (the square inner edge
    // becomes rounded too) so the detached card looks complete.
    if (g.asym && g.brRound) {
      g.card.style.transition = (g.card.style.transition ? g.card.style.transition + ', ' : '') + 'border-radius .32s ' + EASE;
      g.card.style.borderRadius = g.brRound;
      if (g.edge) g.edge.style.borderRadius = g.brRound;
    }
    // Keep each card's own resting shadow — the flowing edge-border carries the
    // hover emphasis, so we never flatten cards that ship a deeper shadow.
    if (g.edge) {
      g.edge.style.transition = 'opacity .32s ' + EASE + ', transform .32s ' + EASE;
      g.edge.style.opacity = '1';
      g.edge.style.transform = 'translateY(-4px) scale(1.03)';
    }
  }
  function liftOff(g) {
    g.members.forEach(function (el) {
      el.style.transform = el.__tf || 'none';
      el.style.zIndex = (parseInt(el.style.zIndex, 10) || 0) - 1000;
    });
    if (g.pop && g.card && g.card.__br !== undefined) g.card.style.borderRadius = g.card.__br;
    if (g.asym && g.brRound) {
      g.card.style.borderRadius = g.brOrig;
      if (g.edge) g.edge.style.borderRadius = g.brOrig;
    }
    if (g.edge) { g.edge.style.opacity = '0'; g.edge.style.transform = 'none'; }
  }

  // ── Hover zoom: a flagged element (.fk-zoom — e.g. the device mockups on the
  //    product slides) scales up on hover. A transparent hit overlay sits on top
  //    so the hover registers even when other content paints above it. ──
  // ── Icon hover: a gentle pop on small standalone icons across every slide,
  //    so they feel alive on hover. Skips icons already inside a hover/zoom/float
  //    group (those move with their card) and the fixed header/footer chrome. ──
  function setupIconHover() {
    if (!slide) return;
    if (slide.hasAttribute('data-no-icon-hover')) return;
    var rectOf = function (el) {
      return { l: parseFloat(el.style.left) || 0, t: parseFloat(el.style.top) || 0,
               w: parseFloat(el.style.width) || 0, h: parseFloat(el.style.height) || 0 };
    };
    Array.prototype.slice.call(slide.querySelectorAll('.figma-node')).forEach(function (el) {
      if (el.classList.contains('fk-bg') || el.classList.contains('fk-zoom')) return;
      if (el.__inGroup) return;   // rides with its card/float group — no independent hover
      var r = rectOf(el);
      // icon-sized: small-ish square-ish graphic, not lines/bars or big imagery
      if (r.w < 16 || r.w > 88 || r.h < 16 || r.h > 88) return;
      if (Math.abs(r.w - r.h) > Math.min(r.w, r.h) * 0.6) return;   // skip lines/bars
      if (r.t < 90) return;                                          // skip header logo
      var hit = document.createElement('div');
      hit.style.cssText = 'position:absolute;left:' + (r.l - 6) + 'px;top:' + (r.t - 6) + 'px;width:' +
        (r.w + 12) + 'px;height:' + (r.h + 12) + 'px;z-index:9970;background:transparent;cursor:pointer;';
      slide.appendChild(hit);
      el.style.transformOrigin = 'center';
      hit.addEventListener('mouseenter', function () {
        el.style.transition = 'transform .34s ' + EASE_OUT;
        el.style.transform = (el.__tf ? el.__tf + ' ' : '') + 'scale(1.18) rotate(-4deg)';
      });
      hit.addEventListener('mouseleave', function () {
        el.style.transition = 'transform .42s ' + EASE;
        el.style.transform = el.__tf || 'none';
      });
    });
  }

  function setupZoom() {
    if (!slide) return;
    // Alpha sampler: read the PNG's transparency so hover only fires over the
    // actual artwork, not the transparent bounding box / ratio frame.
    function makeAlpha(img) {
      try {
        var iw = img.naturalWidth, ih = img.naturalHeight;
        if (!iw || !ih) return null;
        var S = Math.min(1, 320 / Math.max(iw, ih));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(iw * S));
        c.height = Math.max(1, Math.round(ih * S));
        var cx = c.getContext('2d');
        cx.drawImage(img, 0, 0, c.width, c.height);
        var data = cx.getImageData(0, 0, c.width, c.height).data;
        return function (nx, ny) {
          if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return 0;
          var px = Math.round(nx * (c.width - 1)), py = Math.round(ny * (c.height - 1));
          return data[(py * c.width + px) * 4 + 3];
        };
      } catch (e) { return null; }
    }
    // Order overlapping zoom hits so smaller (front) images win the hover —
    // a big image's hit must not sit on top of a small one tucked over it.
    Array.prototype.slice.call(slide.querySelectorAll('.fk-zoom')).forEach(function (el) {
      var l = parseFloat(el.style.left) || 0, t = parseFloat(el.style.top) || 0;
      var w = parseFloat(el.style.width) || 0, h = parseFloat(el.style.height) || 0;
      el.style.transformOrigin = 'center';
      var hit = document.createElement('div');
      var zo = 9985 + Math.round(900000 / Math.max(1, w * h));   // smaller area → higher z
      hit.style.cssText = 'position:absolute;left:' + l + 'px;top:' + t + 'px;width:' + w +
        'px;height:' + h + 'px;z-index:' + zo + ';background:transparent;cursor:default;';
      slide.appendChild(hit);

      var alpha = null, isImg = el.tagName === 'IMG';
      if (isImg) {
        if (el.complete) alpha = makeAlpha(el);
        else el.addEventListener('load', function () { alpha = makeAlpha(el); }, { once: true });
      }
      var on = false, rnd = el.classList.contains('fk-round');
      function setZoom(v) {
        if (v === on) return;
        on = v;
        // fk-bgzoom elements have their transform-origin repointed to a slide-
        // centre-relative spot for the entrance push-out; re-assert centre here
        // so the hover scale expands in place instead of drifting sideways.
        if (v) el.style.transformOrigin = 'center';
        el.style.transition = 'transform .42s ' + EASE_OUT + (rnd ? ', border-radius .42s ' + EASE_OUT : '');
        el.style.transform = v ? 'scale(1.06)' : 'none';
        if (rnd) el.style.borderRadius = v ? '16px' : '';
        hit.style.cursor = v ? 'pointer' : 'default';
      }
      hit.addEventListener('mousemove', function (e) {
        if (!alpha) { setZoom(true); return; }   // no alpha (non-img / blocked) → whole box
        var b = hit.getBoundingClientRect();
        setZoom(alpha((e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height) > 12);
      });
      hit.addEventListener('mouseleave', function () { setZoom(false); });
    });
  }

  // ── Ambient float: calm, slow wiggle on flagged surfaces (e.g. slide 8's
  //    glass cards). Uses CSS @keyframes on the independent `translate`/`rotate`
  //    props so it composes with the entrance/hover `transform`, and (unlike a
  //    rAF loop) keeps running reliably / pauses cleanly when the tab hides. ──
  var FLOAT_KEYFRAMES = '\
@keyframes fk-floatA { 0%,100%{translate:0 0; rotate:0deg} 50%{translate:3px -9px; rotate:0.8deg} }\
@keyframes fk-floatB { 0%,100%{translate:0 0; rotate:0deg} 50%{translate:-4px -6px; rotate:-0.7deg} }\
@keyframes fk-floatC { 0%,100%{translate:0 0; rotate:0deg} 33%{translate:4px -6px; rotate:0.55deg} 66%{translate:-3px -10px; rotate:-0.6deg} }\
@media (prefers-reduced-motion: reduce){ .fk-floating{ animation:none !important; translate:0 0 !important; rotate:0deg !important; } }';
  function setupFloat() {
    if (!slide || !slide.hasAttribute('data-float') || REDUCE) return;
    var st = document.createElement('style');
    st.textContent = FLOAT_KEYFRAMES;
    document.head.appendChild(st);
    var rectOf = function (el) {
      return { l: parseFloat(el.style.left) || 0, t: parseFloat(el.style.top) || 0,
               w: parseFloat(el.style.width) || 0, h: parseFloat(el.style.height) || 0 };
    };
    var all = Array.prototype.slice.call(slide.querySelectorAll('.figma-text,.figma-node,.figma-shape,.figma-fill'));
    var anchors = all.filter(function (el) {
      // Explicit opt-in (e.g. slide 5 coffee machine / cargo bike) always floats.
      if (el.classList.contains('fk-wiggle')) return true;
      // Explicit FRAME opt-in: floats AND carries its content (for glass cards
      // whose size is outside the auto-detect range, e.g. slide 22's pills).
      if (el.classList.contains('fk-floatframe')) return true;
      // Otherwise the glass FRAMES (figma-shape) are the floating units; their
      // content (images/text/icons) groups in as members and rides along.
      if (el.classList.contains('fk-bg') || !el.classList.contains('figma-shape')) return false;
      var r = rectOf(el);
      return r.w >= 180 && r.w <= 270 && r.h >= 200 && r.h <= 280;   // glass frame sized
    });
    var variants = ['fk-floatA', 'fk-floatB', 'fk-floatC'];
    var claimed = new Set();
    anchors.forEach(function (card, idx) {
      var r = rectOf(card);
      var members = [card];
      // Standalone opt-in images (fk-wiggle) float on their own; glass frames
      // carry their contained content along as a rigid group.
      if (!card.classList.contains('fk-wiggle')) {
        all.forEach(function (el) {
          if (el === card || claimed.has(el) || el.classList.contains('fk-bg')) return;
          var er = rectOf(el), ex = er.l + er.w / 2, ey = er.t + er.h / 2;
          if (ex >= r.l && ex <= r.l + r.w && ey >= r.t && ey <= r.t + r.h && er.w <= r.w && er.h <= r.h) {
            members.push(el); claimed.add(el); el.__inGroup = true;
          }
        });
      }
      // Each card+contents share ONE variant/timing so they drift as a unit;
      // per-card duration + negative delay desyncs the group from its neighbours.
      var dur = (5.4 + idx * 0.5).toFixed(2);          // 5.4–7.9s, all different
      var delay = (-idx * 1.3).toFixed(2);             // offset starting phase
      var anim = variants[idx % 3] + ' ' + dur + 's ease-in-out ' + delay + 's infinite';
      var cx = r.l + r.w / 2, cy = r.t + r.h / 2;
      members.forEach(function (el) {
        // Pivot every member about the CARD's centre so the contents rotate as
        // one rigid unit with the frame — i.e. embedded, not drifting.
        var el_l = parseFloat(el.style.left) || 0, el_t = parseFloat(el.style.top) || 0;
        el.style.transformOrigin = (cx - el_l) + 'px ' + (cy - el_t) + 'px';
        el.style.animation = anim;
        el.classList.add('fk-floating');
      });
    });
  }

  // ── Flywheel (slide 11): brings the compounding-loop diagram to life with
  //    calm brand motion. Everything is built/started here only when animating,
  //    so #still previews and reduced-motion keep the original final state. ──
  function setupFlywheel() {
    var ring = slide.querySelector('[data-node-id="4462:7940"]');     // tick ring
    var core = slide.querySelector('[data-node-id="4462:7941"]');     // dark core
    var cx = 954, cy = 611;
    if (ring) { var rr = { l: parseFloat(ring.style.left) || 0, t: parseFloat(ring.style.top) || 0, w: parseFloat(ring.style.width) || 0, h: parseFloat(ring.style.height) || 0 }; cx = rr.l + rr.w / 2; cy = rr.t + rr.h / 2; }

    var st = document.createElement('style');
    st.textContent =
      '@keyframes fk-fwspin{to{rotate:360deg}}' +
      '@keyframes fk-fwbreathe{0%,100%{scale:1}50%{scale:1.035}}' +
      '@keyframes fk-fwsweep{to{transform:rotate(360deg)}}' +
      '@keyframes fk-fworbit{to{offset-distance:100%}}' +
      '@keyframes fk-fwdrift{0%,100%{transform:translate(0,0)}50%{transform:translate(34px,-22px)}}' +
      '@media (prefers-reduced-motion:reduce){.fk-fw{animation:none!important}}';
    document.head.appendChild(st);

    // 5. Living gradient-mesh + grain behind the diagram (light, matches the bg).
    var bg = document.createElement('div');
    bg.className = 'fk-fw';
    bg.style.cssText = 'position:absolute;left:' + (cx - 430) + 'px;top:' + (cy - 410) + 'px;width:860px;height:820px;z-index:0;pointer-events:none;border-radius:50%;' +
      'background:radial-gradient(circle at 32% 30%, rgba(255,172,202,.30), transparent 60%),' +
      'radial-gradient(circle at 74% 64%, rgba(206,235,255,.28), transparent 60%),' +
      'radial-gradient(circle at 52% 82%, rgba(190,240,180,.30), transparent 55%);' +
      'filter:blur(54px);animation:fk-fwdrift 17s ease-in-out infinite;';
    slide.insertBefore(bg, slide.firstChild);
    var grain = document.createElement('div');
    grain.className = 'fk-fw';
    grain.style.cssText = 'position:absolute;left:' + (cx - 320) + 'px;top:' + (cy - 320) + 'px;width:640px;height:640px;z-index:1;pointer-events:none;border-radius:50%;mix-blend-mode:multiply;opacity:.05;' +
      "background-image:url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\");";
    slide.insertBefore(grain, slide.firstChild.nextSibling);

    // 1. Slow tick-ring rotation + soft light-sweep.
    if (ring) { ring.style.transformOrigin = 'center'; ring.classList.add('fk-fw'); ring.style.animation = 'fk-fwspin 80s linear infinite'; }
    var R = 232;
    var sweep = document.createElement('div');
    sweep.className = 'fk-fw';
    sweep.style.cssText = 'position:absolute;left:' + (cx - R) + 'px;top:' + (cy - R) + 'px;width:' + (2 * R) + 'px;height:' + (2 * R) + 'px;z-index:29;pointer-events:none;border-radius:50%;' +
      'background:conic-gradient(from 0deg, transparent 0deg, rgba(255,255,255,.85) 34deg, transparent 92deg, transparent 360deg);' +
      '-webkit-mask:radial-gradient(circle, transparent 60%, #000 63%, #000 80%, transparent 83%);mask:radial-gradient(circle, transparent 60%, #000 63%, #000 80%, transparent 83%);' +
      'animation:fk-fwsweep 9s linear infinite;opacity:.55;';
    slide.appendChild(sweep);

    // 4. Core breathing.
    if (core) { core.style.transformOrigin = 'center'; core.classList.add('fk-fw'); core.style.animation = 'fk-fwbreathe 5.5s ease-in-out infinite'; }

    // 3. Flow dots circling in the orbit (offset-path: circle).
    var orbitR = 150, dotCols = ['rgba(255,172,202,1)', 'rgba(150,205,255,1)', 'rgba(150,215,150,1)'];
    for (var i = 0; i < 6; i++) {
      var dot = document.createElement('div'); dot.className = 'fk-fw';
      var col = dotCols[i % 3];
      dot.style.cssText = 'position:absolute;left:0;top:0;width:8px;height:8px;border-radius:50%;z-index:33;pointer-events:none;' +
        'background:' + col + ';box-shadow:0 0 8px ' + col + ';' +
        'offset-path:circle(' + orbitR + 'px at ' + cx + 'px ' + cy + 'px);' +
        'animation:fk-fworbit 15s linear infinite;animation-delay:' + (-i * 15 / 6).toFixed(2) + 's;';
      slide.appendChild(dot);
    }

    // 2. Sequential node lighting 01→06 with a charge flying into the core, then
    //    a ring pulse on each full revolution. Auto-advances on a calm timer (no
    //    key binding, so arrow/space still navigate in present mode).
    var nodes = [
      { x: 954, y: 347, color: '255,150,188', num: '4462:7961', icon: '4462:7988' },
      { x: 1243, y: 496, color: '255,150,188', num: '4462:7973', icon: '4462:7982' },
      { x: 1244, y: 677, color: '120,190,255', num: '4462:7977', icon: '4462:7986' },
      { x: 954, y: 829, color: '120,190,255', num: '4462:7995', icon: '4462:7990' },
      { x: 677, y: 677, color: '120,200,130', num: '4462:7969', icon: '4462:7984' },
      { x: 677, y: 496, color: '120,200,130', num: '4462:7965', icon: '4462:7980' }
    ];
    nodes.forEach(function (nd) {
      nd.numEl = slide.querySelector('[data-node-id="' + nd.num + '"]');
      nd.iconEl = slide.querySelector('[data-node-id="' + nd.icon + '"]');
      [nd.numEl, nd.iconEl].forEach(function (e) { if (e) { e.style.transition = 'scale .55s ' + EASE_OUT + ', filter .55s ' + EASE_OUT; e.style.transformOrigin = 'center'; } });
    });
    function lightNode(idx) {
      nodes.forEach(function (nd, i) {
        var on = i === idx;
        [nd.numEl, nd.iconEl].forEach(function (e) { if (!e) return; e.style.scale = on ? '1.16' : '1'; e.style.filter = on ? 'drop-shadow(0 0 11px rgba(' + nd.color + ',.95))' : 'none'; });
      });
      var nd = nodes[idx];
      var c = document.createElement('div'); c.className = 'fk-fw';
      c.style.cssText = 'position:absolute;left:' + nd.x + 'px;top:' + nd.y + 'px;width:11px;height:11px;border-radius:50%;z-index:35;pointer-events:none;background:rgba(' + nd.color + ',1);box-shadow:0 0 12px rgba(' + nd.color + ',.95);transform:translate(-50%,-50%);';
      slide.appendChild(c);
      raf.push(requestAnimationFrame(function () { raf.push(requestAnimationFrame(function () {
        c.style.transition = 'left 1.05s ' + EASE_OUT + ', top 1.05s ' + EASE_OUT + ', opacity 1.05s ' + EASE_OUT + ', transform 1.05s ' + EASE_OUT;
        c.style.left = cx + 'px'; c.style.top = cy + 'px'; c.style.transform = 'translate(-50%,-50%) scale(.35)'; c.style.opacity = '0';
      })); }));
      timers.push(setTimeout(function () { c.remove(); }, 1400));
    }
    function corePulse() {
      var p = document.createElement('div'); p.className = 'fk-fw';
      p.style.cssText = 'position:absolute;left:' + cx + 'px;top:' + cy + 'px;width:210px;height:210px;border-radius:50%;z-index:32;pointer-events:none;border:2px solid rgba(255,150,188,.7);transform:translate(-50%,-50%) scale(.72);opacity:.6;';
      slide.appendChild(p);
      raf.push(requestAnimationFrame(function () { raf.push(requestAnimationFrame(function () {
        p.style.transition = 'transform 1.5s ' + EASE_OUT + ', opacity 1.5s ' + EASE_OUT;
        p.style.transform = 'translate(-50%,-50%) scale(1.7)'; p.style.opacity = '0';
      })); }));
      timers.push(setTimeout(function () { p.remove(); }, 1600));
    }
    var fwIdx = 0;
    lightNode(0);
    setInterval(function () {
      fwIdx = (fwIdx + 1) % nodes.length;
      lightNode(fwIdx);
      if (fwIdx === 0) corePulse();
    }, 1700);
  }

  // ── Parent messaging ──
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.source !== 'frankly-stage') return;
    if (STILL) return;   // still previews never animate
    if (d.type === 'enter') play();
    else if (d.type === 'reset') reset();
  });

  ready(function () {
    setup();
    // mark grouped members so afterHover knows to swap their transition
    groups.forEach(function (g) { g.members.forEach(function (el) { el.__inGroup = true; }); });
  });
})();
