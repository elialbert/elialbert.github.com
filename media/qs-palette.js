/* QS palette ---------------------------------------------------------------
 *
 * qs-data.json carries two hex strings, `main` and `comp1`. This turns them
 * into CSS custom properties and derives every foreground from the background
 * it actually sits on.
 *
 * Since 2026-09-18 the object also carries `scene` — the twelve-words-or-fewer
 * image the colour call took those two off, or `""` on a fallback night. It
 * reaches callers untouched through QSPalette.load() along with `twitter`,
 * `lookback` and `osmr`; media/qs-headers.js draws the three into a band at the
 * top of each tab, and the scene into a line above the chart.
 *
 * The site used to hardcode black text on `main` and white text on `comp1`,
 * which is what forced the exporter to hand over a light/dark pair. It no
 * longer does: any pair renders legibly here, so the palette is free to spend
 * lightness on something other than legibility.
 *
 * Free of legibility, but not of structure. Since 2026-09-18 the two colours
 * are refit before anything is derived from them: the hues are the day's, the
 * lightnesses are the page's. A pair sampled off one photograph shares that
 * photograph's light, and `main` and `comp1` are surfaces at different depths
 * here — see refitSurface() for the night that made this necessary.
 *
 * See the vault note projects/qs-colours.md.
 */
(function (window, document) {
  'use strict';

  var SOURCE = 'https://s3.amazonaws.com/qs-storage/qs-data.json';
  var AA = 4.5;  // WCAG AA for body text
  var AA_UI = 3;  // WCAG AA for non-text (the chart lines)

  // Where a surface and an accent are allowed to sit. See refitSurface().
  var SURFACE_L_LIGHT = 0.91;     // a light card, whatever its hue
  var SURFACE_L_DARK = 0.16;      // ...or a dark one; never the middle
  var SURFACE_L_SPLIT = 0.35;     // ...and which one. Deliberately not 0.5:
  var SURFACE_S_MAX_LIGHT = 0.32; // a card is big: this is a tint, not a wash
  var SURFACE_S_MAX_DARK = 0.35;
  var SURFACE_S_MIN = 0.22;       // ...but a tint has to be visible as one
  var SURFACE_S_NEUTRAL = 0.02;   // below this the model meant grey
  var EDGE = 1.35;                // a hairline: seen, but not a rule
  var EDGE_CLEAR = 1.5;           // above this the fill separates on its own
  // ...the split is low because the model's own favourite output sits right at
  // the middle of the range. The four real pairs on record came in at HSL
  // lightness 0.48, 0.56, 0.59 and 0.69 — a boundary at 0.5 runs straight
  // through the cluster, and 0.48 against 0.52 (two indistinguishable
  // grey-greens) would be the difference between a near-white page and a
  // near-black one. At 0.35 a mid-tone is a light card, which is what a quiet
  // scene should be, and only a scene that is genuinely dark — the near-black
  // navy the 2026-09-13 prompt started producing on big days — takes the page
  // dark with it. The boundary still exists; it is just somewhere the colours
  // rarely land.

  function parseHex(s) {
    if (typeof s !== 'string') return null;
    var m = /^#?([0-9a-fA-F]{6})$/.exec(s.trim());
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function toHex(rgb) {
    return '#' + rgb.map(function (c) {
      return ('0' + Math.round(c).toString(16)).slice(-2);
    }).join('');
  }

  // The 8-bit colour a float triple will actually become. A ratio measured on
  // the float and then rounded for output can land just under the target it
  // was picked for — 2.99:1 where 3 was asked — so the searches below measure
  // what they are going to return.
  function snap(rgb) {
    return parseHex(toHex(rgb));
  }

  // WCAG relative luminance.
  function luminance(rgb) {
    var a = rgb.map(function (c) {
      c = c / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }

  function contrast(l1, l2) {
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }

  // Black or white, whichever has more contrast against this background.
  // The crossover sits at L = 0.179, not 0.5 — luminance is not lightness.
  function bestForeground(lum) {
    return lum > 0.179 ? '#000000' : '#ffffff';
  }

  function rgbToHsl(rgb) {
    var r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    var h = 0, s = 0, l = (max + min) / 2;
    if (d !== 0) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h = h * 60;
      if (h < 0) h += 360;
    }
    return [h, s, l];
  }

  function hslToRgb(hsl) {
    var h = hsl[0], s = hsl[1], l = hsl[2];
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    var m = l - c / 2, t;
    if (h < 60) t = [c, x, 0];
    else if (h < 120) t = [x, c, 0];
    else if (h < 180) t = [0, c, x];
    else if (h < 240) t = [0, x, c];
    else if (h < 300) t = [x, 0, c];
    else t = [c, 0, x];
    return [(t[0] + m) * 255, (t[1] + m) * 255, (t[2] + m) * 255];
  }

  // The value refit ----------------------------------------------------------
  //
  // 2026-09-18. The exporter takes its two colours off one photographed scene,
  // and a photograph lights both of them the same way: "rain-streaked
  // windowpane reflecting a dim grey suburban sky at dusk" came back as a dim
  // sky (#8A9196) and a dim gold (#C9A227), 1.32:1 apart. Fine pair of hues,
  // unusable pair of values -- `main` is every card and chart panel on this
  // site and `comp1` is the band and the buttons that sit ON those cards, so
  // the two are surfaces at different depths and have to differ in lightness.
  // The photograph couples exactly what the page needs decoupled, and it will
  // do it again on every dusk, overcast and interior scene in the exporter's
  // lens list. Nothing in the prompt can reliably fix that: asking a model to
  // place lightness is what the 2026-09-13 rewrite already found it bad at.
  //
  // So the hues and the scene stay the model's, and the values stop being. The
  // surface goes to one end of the range or the other (SURFACE_L_SPLIT says
  // which, and why it is not the midpoint) -- a near-black navy card is as
  // welcome as a bone-white one, and both ends of
  // the gamut the 2026-09-13 prompt opened up survive this; it is only the
  // middle, where a card stops reading as a card, that is evicted.

  function refitSurface(rgb) {
    var hsl = rgbToHsl(rgb);
    var light = hsl[2] >= SURFACE_L_SPLIT;
    hsl[2] = light ? SURFACE_L_LIGHT : SURFACE_L_DARK;
    // Chroma goes one way or the other. A 5%-saturated grey reads as a failing
    // monitor rather than as a choice, so an achromatic colour is made exactly
    // achromatic and anything with a hue at all is tinted far enough to look
    // deliberate -- the floor is what keeps the day's colour visible in the
    // largest area on screen instead of collapsing every quiet scene to the
    // same white card. It is the tuned number of the four, and it was tuned by
    // rendering the band: below about 0.18 a warm hue at this lightness is
    // indistinguishable from the page ground, which is the collapse, and above
    // about 0.34 a green or a violet starts to look ill rather than tinted.
    // The ceiling is the other half of the same thought: a surface is big, and
    // a saturation that was one spot of colour in a photograph is a
    // highlighter at the size of a panel.
    if (hsl[1] > SURFACE_S_NEUTRAL) {
      hsl[1] = Math.min(Math.max(hsl[1], SURFACE_S_MIN),
                        light ? SURFACE_S_MAX_LIGHT : SURFACE_S_MAX_DARK);
    } else {
      hsl[1] = 0;
    }
    return hslToRgb(hsl);
  }

  // The accent then has TWO grounds to clear, because it is a button on a card
  // and a band on the page: the card it sits on, and the page around the card.
  // adjustForContrast solves for one ground and walks away from it; with two
  // the answer can lie on either side, so this searches outwards in lightness
  // from wherever the model put it and takes the nearest value that clears
  // both. Hue and saturation are untouched -- it is still the colour the scene
  // gave, at the only lightness the page has room for. If no lightness clears
  // both (a narrow gap between a mid-tone ground and its card), the best
  // near-miss is kept rather than the original: closer is better than nothing,
  // and the foregrounds derived below are checked against whatever comes back.
  function fitAccent(rgb, lumA, lumB, target) {
    var hsl = rgbToHsl(rgb);
    var l0 = hsl[2];
    var score = function (c) {
      var l = luminance(c);
      return Math.min(contrast(l, lumA), contrast(l, lumB));
    };
    var best = rgb, bestScore = score(rgb);
    if (bestScore >= target) return rgb;
    for (var i = 1; i <= 100; i++) {
      for (var d = 0; d < 2; d++) {
        var l = l0 + (d ? -i : i) / 100;
        if (l < 0 || l > 1) continue;
        hsl[2] = l;
        var cand = snap(hslToRgb(hsl));
        var s = score(cand);
        if (s >= target) return cand;
        if (s > bestScore) { bestScore = s; best = cand; }
      }
    }
    return best;
  }

  // Keep the accent's hue and saturation, walk its lightness away from the
  // background until it clears `target`. At the end of the ramp this lands on
  // black or white, which is the most contrast that hue can give.
  function adjustForContrast(rgb, bgLum, target) {
    if (contrast(luminance(rgb), bgLum) >= target) return toHex(rgb);
    var hsl = rgbToHsl(rgb);
    var step = bgLum > 0.179 ? -0.02 : 0.02;
    var best = rgb, bestRatio = contrast(luminance(rgb), bgLum);
    for (var i = 0; i < 60; i++) {
      hsl[2] = Math.min(1, Math.max(0, hsl[2] + step));
      var cand = snap(hslToRgb(hsl));
      var ratio = contrast(luminance(cand), bgLum);
      if (ratio > bestRatio) { bestRatio = ratio; best = cand; }
      if (ratio >= target) return toHex(cand);
      if (hsl[2] === 0 || hsl[2] === 1) break;
    }
    return toHex(best);
  }

  // Cached palette -----------------------------------------------------------
  //
  // Reaching qs-data.json costs a DNS lookup, a TLS handshake and a round trip
  // to S3, and until it lands the page paints with the defaults in the CSS. So
  // every apply() also writes its *resolved* custom properties to
  // localStorage, and a few lines inline in each page's <head> replay them
  // before first paint. Only the first ever visit sees the defaults.
  //
  // Entries are keyed by --qs-page-bg: --qs-link is derived from it, and the
  // two layouts sit on different grounds.

  // v2: two more derived vars, and the nightly prose next to the colours. A v1
  // entry has neither, and replaying one would paint the header band with
  // foregrounds that were never checked against it, so the key is bumped
  // rather than migrated — one first-visit paint, once, per browser.
  //
  // v3: the same reasoning for the value refit. A v2 entry holds the colours
  // as the model sent them, and replaying one would paint the un-refit palette
  // before the fetch lands and then correct it — the flash this cache exists
  // to prevent. The inline replay in index.html and _layouts/default.html
  // reads this key by name; all three move together.
  //
  // v4: --qs-edge joins them. A v3 entry has no edge, and the border that
  // reads it would fall back to currentColor — a dark rule around every card —
  // so this one is not merely stale, it is wrong.
  var CACHE_KEY = 'qs-palette-v4';

  function readCache() {
    try {
      return JSON.parse(window.localStorage.getItem(CACHE_KEY)) || {};
    } catch (e) {
      return {};  // disabled, full, or private-mode storage: just skip it
    }
  }

  // The nightly object's prose is cached beside the colours for exactly the
  // reason the colours are: the bands ship empty, and without this they would
  // pop in a round trip after first paint. Field by field, and on `!= null`
  // rather than on truthiness: a field that came back null leaves the last good
  // one up — the previous newest review is still the newest review — but the
  // scene's empty string is a real answer (a fallback night) and has to be able
  // to replace a scene that no longer describes what is on screen.
  // The HOURLY object is deliberately not cached; see media/qs-headers.js.
  var PROSE = ['twitter', 'lookback', 'osmr', 'scene'];

  function writeCache(pageBgHex, vars, data) {
    try {
      var cache = readCache();
      if (!cache.vars) cache.vars = {};
      cache.vars[pageBgHex] = vars;
      PROSE.forEach(function (key) {
        if (data && data[key] != null) cache[key] = data[key];
      });
      window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
      /* the fetch still works; the next load just starts from the defaults */
    }
  }

  function setVars(vars) {
    var style = document.documentElement.style;
    Object.keys(vars).forEach(function (name) {
      style.setProperty(name, vars[name]);
    });
  }

  function setQuote(text) {
    Array.prototype.forEach.call(
      document.querySelectorAll('.twitter-quote'),
      function (el) { el.textContent = text; }
    );
  }

  function whenReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  // --qs-page-bg is only readable once the page's own stylesheet has landed.
  // This file is now loaded from <head>, ahead of those stylesheets, so the
  // fetch can beat them; wait rather than derive the link colours against a
  // guessed ground.
  function whenGroundReadable(fn) {
    var readable = function () {
      return !!getComputedStyle(document.documentElement)
        .getPropertyValue('--qs-page-bg').trim();
    };
    if (readable() || document.readyState !== 'loading') {
      fn();
    } else {
      document.addEventListener('DOMContentLoaded', fn);
    }
  }

  function apply(data) {
    var root = document.documentElement;
    var main = parseHex(data && data.main);
    var comp1 = parseHex(data && data.comp1);
    if (!main || !comp1) return false;

    // Each page declares what its own body sits on, so links off a card can be
    // checked against the right ground.
    var pageBgHex = getComputedStyle(root)
      .getPropertyValue('--qs-page-bg').trim();
    var pageBg = parseHex(pageBgHex) || [255, 255, 255];

    var pageLum = luminance(pageBg);

    // What the site wears is not quite what the day said. The hues are the
    // model's; the values are the page's. See refitSurface().
    var surface = refitSurface(main);
    var accent = fitAccent(comp1, luminance(surface), pageLum, AA_UI);

    var mainLum = luminance(surface);
    var compLum = luminance(accent);

    // The card's edge ------------------------------------------------------
    //
    // 2026-09-18, after the refit shipped. A light card cannot separate itself
    // from a light page by fill. --qs-page-bg is a fixed #efefef (luminance
    // 0.86) that refitSurface() never consults, and consulting it would not
    // help much: against that ground a light card tops out at 1.15:1 at pure
    // white, and L 0.93 lands on the page's own luminance exactly. There is no
    // good lightness to choose, so the boundary is drawn instead of filled.
    //
    // This was always true -- the CSS default card is 1.04:1 against the page
    // — and it was hidden only because the model kept sending mid-tone cards
    // that stood clear of the page by accident. That accident and the mud the
    // refit removed were the same fact, so removing one exposed the other.
    //
    // The edge keeps the card's hue and walks its lightness away from the PAGE
    // until it reads as a hairline. A card that already stands clear of the
    // page gets no edge at all -- the var is simply the card, and the border
    // disappears into it -- which is what a dark card on a light page wants,
    // and is why this cannot be a fixed rgba black: that would vanish there.
    var edge = contrast(mainLum, pageLum) < EDGE_CLEAR
      ? adjustForContrast(surface, pageLum, EDGE)
      : toHex(surface);

    var vars = {
      '--qs-main': toHex(surface),
      '--qs-comp1': toHex(accent),
      '--qs-on-main': bestForeground(mainLum),
      '--qs-on-comp1': bestForeground(compLum),
      '--qs-link': adjustForContrast(accent, pageLum, AA),
      '--qs-link-on-main': adjustForContrast(accent, mainLum, AA),
      // The chart draws three lines on --qs-main. They used to be black, white
      // and gray, which only worked while `main` was guaranteed light.
      '--qs-chart-dim': adjustForContrast([128, 128, 128], mainLum, AA_UI),
      // Drawn where a surface on --qs-main meets the page: see above.
      '--qs-edge': edge,
      // The header bands are the one thing on the site that sits on `comp1`
      // rather than on `main`, so `comp1` is a background here as well as an
      // accent, and needs the same two derivations against it that `main` and
      // the page ground already get.
      '--qs-accent-on-comp1': adjustForContrast(surface, compLum, AA),
      '--qs-dim-on-comp1': adjustForContrast([128, 128, 128], compLum, AA_UI)
    };

    setVars(vars);
    // Only cache under a ground we actually read. If the stylesheet had not
    // landed the fallback above is a guess, and caching it would make the
    // guess permanent.
    if (pageBgHex) writeCache(pageBgHex, vars, data);
    return true;
  }

  // The request goes out the moment this file is parsed, rather than queueing
  // behind the CDN bundles that used to precede it at the foot of the body.
  var pending = fetch(SOURCE)
    .then(function (r) { return r.ok ? r.json() : null; })
    .catch(function () { return null; })
    .then(function (data) {
      if (data) {
        whenGroundReadable(function () { apply(data); });
        if (data.twitter) whenReady(function () { setQuote(data.twitter); });
      }
      return data;
    });

  // The quote markup ships empty, so fill it from the cache as soon as there
  // is a DOM to fill. Registered before the handler above, and skipping any
  // element that already has text, so a landed fetch is never overwritten.
  whenReady(function () {
    var quote = readCache().twitter;
    if (!quote) return;
    Array.prototype.forEach.call(
      document.querySelectorAll('.twitter-quote'),
      function (el) { if (!el.textContent.trim()) el.textContent = quote; }
    );
  });

  // Calls back with the payload (or null) once the properties are on :root and
  // the DOM is ready, so callers can go on to draw things that need the rest
  // of the object.
  function load(callback) {
    pending.then(function (data) {
      whenReady(function () {
        if (typeof callback === 'function') callback(data);
      });
    });
  }

  window.QSPalette = {
    load: load,
    cached: readCache,
    apply: apply,
    luminance: luminance,
    contrast: contrast,
    bestForeground: bestForeground,
    adjustForContrast: adjustForContrast,
    refitSurface: refitSurface,
    fitAccent: fitAccent,
    parseHex: parseHex,
    toHex: toHex
  };
})(window, document);
