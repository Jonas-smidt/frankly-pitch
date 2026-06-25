/* @ds-bundle: {"format":3,"namespace":"FranklyPartnerDecks_e359ec","components":[],"sourceHashes":{"assets/js/frankly-confetti.js":"a39a4c47c8bd"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.FranklyPartnerDecks_e359ec = window.FranklyPartnerDecks_e359ec || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// assets/js/frankly-confetti.js
try { (() => {
/**
 * frankly-confetti.js
 * Drop-in celebration burst for Frankly interfaces.
 *
 * Usage:
 *   <script src="assets/js/frankly-confetti.js"></script>
 *   <script>
 *     window.franklyConfetti.fire();           // full sequence
 *     window.franklyConfetti.fire(myCanvas);   // custom canvas element
 *   </script>
 *
 * Depends on: canvas-confetti (loaded from CDN below, or inject your own)
 */
(function (global) {
  'use strict';

  const CDN = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js';
  const COLORS = ['#FFACCA', '#2D0011', '#F3DEE4', '#FFD3E3', '#FFF6FA', '#ffffff'];

  /* ── internals ── */

  function _fire(engine, opts) {
    return engine(Object.assign({
      colors: COLORS
    }, opts));
  }
  function _burst(engine) {
    _fire(engine, {
      particleCount: 200,
      spread: 70,
      startVelocity: 50,
      origin: {
        x: 0,
        y: 0.6
      },
      angle: 25
    });
    _fire(engine, {
      particleCount: 200,
      spread: 70,
      startVelocity: 50,
      origin: {
        x: 1,
        y: 0.6
      },
      angle: 155
    });
    _fire(engine, {
      particleCount: 160,
      spread: 110,
      startVelocity: 60,
      origin: {
        x: 0.5,
        y: 0
      },
      angle: 90
    });
  }
  function _run(engine) {
    // Four initial bursts
    [0, 350, 700, 1100].forEach(t => setTimeout(() => _burst(engine), t));

    // Side rain — every 200ms for 5000ms, count decreases linearly from ~60
    let elapsed = 0;
    const rain = setInterval(function () {
      elapsed += 200;
      const count = Math.max(6, Math.round(60 * (1 - elapsed / 5000)));
      _fire(engine, {
        particleCount: count,
        spread: 60,
        startVelocity: 35,
        origin: {
          x: 0,
          y: 0.5
        },
        angle: 20
      });
      _fire(engine, {
        particleCount: count,
        spread: 60,
        startVelocity: 35,
        origin: {
          x: 1,
          y: 0.5
        },
        angle: 160
      });
      if (elapsed >= 5000) clearInterval(rain);
    }, 200);
  }

  /* ── public API ── */

  /**
   * fire(canvasEl?)
   * Runs the full Frankly confetti sequence.
   * Pass an optional <canvas> element to confine confetti to a specific layer.
   * Returns a cleanup function that stops any in-flight timers immediately.
   */
  function fire(canvasEl) {
    function start(confettiLib) {
      const engine = canvasEl ? confettiLib.create(canvasEl, {
        resize: true,
        useWorker: false
      }) : confettiLib;
      _run(engine);
    }
    if (global.confetti) {
      start(global.confetti);
    } else {
      const s = document.createElement('script');
      s.src = CDN;
      s.onload = () => start(global.confetti);
      document.head.appendChild(s);
    }
  }
  global.franklyConfetti = {
    fire: fire,
    colors: COLORS
  };
})(window);
})(); } catch (e) { __ds_ns.__errors.push({ path: "assets/js/frankly-confetti.js", error: String((e && e.message) || e) }); }

})();
