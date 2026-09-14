/* QS palette ---------------------------------------------------------------
 *
 * qs-data.json carries two hex strings, `main` and `comp1`. This turns them
 * into CSS custom properties and derives every foreground from the background
 * it actually sits on.
 *
 * The site used to hardcode black text on `main` and white text on `comp1`,
 * which is what forced the exporter to hand over a light/dark pair. It no
 * longer does: any pair renders legibly here, so the palette is free to spend
 * lightness on something other than legibility.
 *
 * See the vault note projects/qs-colours.md.
 */
(function (window, document) {
  'use strict';

  var SOURCE = 'https://s3.amazonaws.com/qs-storage/qs-data.json';
  var AA = 4.5;  // WCAG AA for body text
  var AA_UI = 3;  // WCAG AA for non-text (the chart lines)

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
      var cand = hslToRgb(hsl);
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

  var CACHE_KEY = 'qs-palette-v1';

  function readCache() {
    try {
      return JSON.parse(window.localStorage.getItem(CACHE_KEY)) || {};
    } catch (e) {
      return {};  // disabled, full, or private-mode storage: just skip it
    }
  }

  function writeCache(pageBgHex, vars, twitter) {
    try {
      var cache = readCache();
      if (!cache.vars) cache.vars = {};
      cache.vars[pageBgHex] = vars;
      if (twitter) cache.twitter = twitter;
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

    var mainLum = luminance(main);
    var compLum = luminance(comp1);
    var pageLum = luminance(pageBg);

    var vars = {
      '--qs-main': toHex(main),
      '--qs-comp1': toHex(comp1),
      '--qs-on-main': bestForeground(mainLum),
      '--qs-on-comp1': bestForeground(compLum),
      '--qs-link': adjustForContrast(comp1, pageLum, AA),
      '--qs-link-on-main': adjustForContrast(comp1, mainLum, AA),
      // The chart draws three lines on --qs-main. They used to be black, white
      // and gray, which only worked while `main` was guaranteed light.
      '--qs-chart-dim': adjustForContrast([128, 128, 128], mainLum, AA_UI)
    };

    setVars(vars);
    // Only cache under a ground we actually read. If the stylesheet had not
    // landed the fallback above is a guess, and caching it would make the
    // guess permanent.
    if (pageBgHex) writeCache(pageBgHex, vars, data.twitter);
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
    apply: apply,
    luminance: luminance,
    contrast: contrast,
    bestForeground: bestForeground,
    adjustForContrast: adjustForContrast,
    parseHex: parseHex,
    toHex: toHex
  };
})(window, document);
