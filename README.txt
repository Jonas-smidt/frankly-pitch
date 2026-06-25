Frankly — Investor Pitch (web build)
=====================================

Self-contained static site. No build step, no server-side code.

TO VIEW LOCALLY
  Open index.html through a local web server (not file://), e.g.:
    npx serve .
  ...then open the printed http://localhost address.
  (Opening index.html directly via file:// will not work because the
   slides load as iframes, which browsers block on the file:// protocol.)

TO PUT ON YOUR SITE
  Upload this whole folder as-is (keep the structure intact) and point
  a link at index.html. Everything it needs is inside:
    index.html            – entry point
    frankly-stage.js      – the deck shell (nav, transitions, loader)
    orig/                 – the 25 slides + their assets + animation engine
    thumbs/               – navigator thumbnails
    _ds/                  – Frankly design-system styles & fonts

CONTROLS
  ← / →            previous / next slide
  click left/right edge
  hover the bottom edge to open the navigator dock
