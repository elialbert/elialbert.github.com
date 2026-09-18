/* QS page headers -----------------------------------------------------------
 *
 * A full-width band at the top of each tab on the front page, and one line
 * under the whole thing, all drawn from the two objects the QS pipeline already
 * publishes:
 *
 *   Projects  the latest musing, unlabelled     qs-data.json  `twitter`
 *   Profiles  four AI quota gauges              qs-home.json  `ai`
 *   Paid      this day in an earlier year       qs-data.json  `lookback`
 *   Press     the newest one-sentence review    qs-data.json  `osmr`
 *   the foot  the scene, above the chart        qs-data.json  `scene`
 *
 * Three of the four ride along on the fetch qs-palette.js already makes for
 * the colours, so they cost nothing. Only the gauges need a second request,
 * because the hourly object is a separate publish on a separate cadence — see
 * "The hourly object" in the qslambda README.
 *
 * Every band ships `hidden` and is revealed only once it has something true to
 * say. A field that degrades to null leaves its band closed rather than open
 * and empty, which is the same bargain the exporter makes on the way out.
 *
 * ⚠️ The nightly prose is replayed from localStorage before the fetch lands
 * (qs-palette.js caches it); the hourly numbers are NOT cached and never
 * should be. A day-old musing is still a musing, but a day-old "18% of the 5h
 * window" is a measurement presented as current, and a wrong gauge is worse
 * than a gauge that arrives a beat late.
 */
(function (window, document) {
  'use strict';

  var HOME_SOURCE = 'https://s3.amazonaws.com/qs-storage/qs-home.json';

  // Out the moment this file is parsed, the same way the palette's fetch is,
  // so it is in flight behind the stylesheets rather than after them.
  var pendingHome = fetch(HOME_SOURCE)
    .then(function (r) { return r.ok ? r.json() : null; })
    .catch(function () { return null; });

  function whenReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  function band(id) { return document.getElementById(id); }

  function part(root, sel) { return root ? root.querySelector(sel) : null; }

  function reveal(node) { if (node) node.hidden = false; }

  // The gauges ---------------------------------------------------------------
  //
  // Old instrument faces: a cream plate on the accent band, a 130° scale, ticks
  // every 5 with a heavier one every 25, and a needle that sweeps up from rest
  // when the reading lands. The plate is --qs-main and everything drawn on it
  // is derived from --qs-main, so a gauge stays legible under any palette for
  // the same reason a card does.

  var GAUGES = [
    { key: 'claude_5h', name: 'Claude · 5h' },
    { key: 'claude_7d', name: 'Claude · 7d' },
    { key: 'codex_5h', name: 'Codex · 5h' },
    { key: 'codex_7d', name: 'Codex · 7d' }
  ];

  var CX = 50, CY = 55;          // the needle's pivot, in viewBox units
  var PLATE_H = 70;              // the plate, sized to the dial it carries
  var START = -65, SWEEP = 130;  // degrees from twelve o'clock, clockwise
  var DANGER = 80;               // where the scale turns into a warning
  var R_SCALE = 35;              // the arc, and the warning band on top of it
  var R_TICK_OUT = 34;           // ticks hang inward from just under the arc
  var R_NUM = 42;                // numerals ride outside the ticks, clear of both

  function angle(pct) {
    var v = Math.max(0, Math.min(100, pct));
    return START + (v / 100) * SWEEP;
  }

  function polar(r, a) {
    var rad = a * Math.PI / 180;
    return [CX + r * Math.sin(rad), CY - r * Math.cos(rad)];
  }

  function n(x) { return x.toFixed(2); }

  // Sweep is 130°, so the large-arc flag is always 0 and the sweep flag always
  // 1 (angles increase clockwise, which is also the sweep direction).
  function arc(r, a0, a1) {
    var p0 = polar(r, a0), p1 = polar(r, a1);
    return 'M' + n(p0[0]) + ' ' + n(p0[1]) +
           ' A' + r + ' ' + r + ' 0 0 1 ' + n(p1[0]) + ' ' + n(p1[1]);
  }

  function ticks() {
    var out = '', v, a, major, inner, outer;
    for (v = 0; v <= 100; v += 5) {
      major = (v % 25 === 0);
      a = angle(v);
      inner = polar(major ? R_TICK_OUT - 7 : R_TICK_OUT - 3.5, a);
      outer = polar(R_TICK_OUT, a);
      out += '<line class="qs-gauge-tick' + (major ? ' qs-gauge-tick-major' : '') +
             '" x1="' + n(inner[0]) + '" y1="' + n(inner[1]) +
             '" x2="' + n(outer[0]) + '" y2="' + n(outer[1]) + '"/>';
    }
    return out;
  }

  // Outside the tick ring rather than inside it: at 3% the needle used to sweep
  // straight through the 0. R_NUM clears R_TICK_OUT by enough that the widest
  // numeral, the 100 at the far end of the scale, misses its own tick.
  function numerals() {
    return [0, 50, 100].map(function (v) {
      var p = polar(R_NUM, angle(v));
      return '<text class="qs-gauge-num" x="' + n(p[0]) + '" y="' + n(p[1] + 2.6) +
             '">' + v + '</text>';
    }).join('');
  }

  function face() {
    return '<rect class="qs-gauge-plate" x="1" y="1" width="98" height="' +
             (PLATE_H - 2) + '" rx="5"/>' +
           '<path class="qs-gauge-arc" d="' + arc(R_SCALE, angle(0), angle(100)) + '"/>' +
           '<path class="qs-gauge-danger" d="' + arc(R_SCALE, angle(DANGER), angle(100)) + '"/>' +
           ticks() + numerals() +
           // Drawn pointing at twelve and rotated into place, so the resting
           // position is just the value 0 and the sweep is one attribute.
           '<g class="qs-gauge-needle" transform="rotate(' + START + ' ' + CX + ' ' + CY + ')">' +
             // Tip, shoulders, and a stub of counterweight past the pivot.
             '<polygon points="' + [
               [CX - 2.4, CY], [CX, CY - 31], [CX + 2.4, CY],
               [CX + 1.5, CY + 6], [CX - 1.5, CY + 6]
             ].map(function (pt) { return n(pt[0]) + ',' + n(pt[1]); }).join(' ') + '"/>' +
             '<circle cx="' + CX + '" cy="' + CY + '" r="3.8"/>' +
           '</g>';
  }

  function drawGauges(host) {
    host.innerHTML = GAUGES.map(function (g) {
      return '<figure class="qs-gauge" data-key="' + g.key + '">' +
               '<svg viewBox="0 0 100 ' + PLATE_H + '" role="img">' +
                 face() +
               '</svg>' +
               '<figcaption><span class="qs-gauge-name">' + g.name + '</span></figcaption>' +
             '</figure>';
    }).join('');
  }

  // A sensor that did not answer publishes null, never 0. With no printed
  // readout the needle is the whole reading, so a missing one loses its needle
  // altogether rather than resting it at zero — a dial with no needle cannot be
  // misread as "nothing used", which is the most misleading number available.
  function readGauges(host, ai) {
    GAUGES.forEach(function (g) {
      var fig = host.querySelector('[data-key="' + g.key + '"]');
      if (!fig) return;
      var v = ai[g.key];
      var known = (typeof v === 'number' && isFinite(v));
      fig.querySelector('.qs-gauge-needle')
         .setAttribute('transform', 'rotate(' + n(angle(known ? v : 0)) + ' ' + CX + ' ' + CY + ')');
      fig.classList.toggle('qs-gauge-missing', !known);
      fig.querySelector('svg').setAttribute(
        'aria-label', g.name + ': ' + (known ? Math.round(v) + '% used' : 'no reading'));
    });
  }

  function renderGauges(home) {
    var el = band('qs-head-profiles');
    var host = part(el, '.qs-gauges');
    if (!el || !host || !home || !home.ai) return;
    drawGauges(host);
    readGauges(host, home.ai);
    reveal(el);
    // Reveal first, sweep after: a transition on an element that was display:
    // none until this frame does not run, and the sweep is half the point.
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () { host.classList.add('qs-gauges-live'); });
    });
  }

  // The nightly four ----------------------------------------------------------

  // The scene is the only one of these with an empty state that means
  // something: `""` is a night the colour provider was down and the palette
  // came out of the deterministic fallback, so there is no scene to describe
  // it. That has to CLEAR the line rather than leave the last one up, because
  // unlike a musing or a review a stale scene is not merely old — it describes
  // colours that are not the colours on screen. A missing key, as opposed to an
  // empty one, is not an answer and is left alone.
  function renderScene(text) {
    var el = band('qs-scene');
    if (!el || typeof text !== 'string') return;
    el.textContent = text;
    el.hidden = !text;
  }

  function renderMusing(text) {
    var el = band('qs-head-projects');
    if (!el || !text) return;
    part(el, '.qs-musing').textContent = text;
    reveal(el);
  }

  // `same_day` is the difference between "this day in 2018" and "some day in
  // 2018" — on the 22 days a year with nothing on the calendar day, the
  // exporter keeps the anniversary and drops the day, and saying "this day"
  // then would be a small lie.
  function renderLookback(lb) {
    var el = band('qs-head-paid');
    if (!el || !lb || !lb.text) return;
    var year = /^(\d{4})-/.exec(lb.date || '');
    var when = year ? 'in ' + year[1]
                    : lb.years + (lb.years === 1 ? ' year ago' : ' years ago');
    part(el, '.qs-head-eyebrow').textContent =
      (lb.same_day ? 'This day ' : 'Around this time ') + when;
    part(el, '.qs-lookback-text').textContent = lb.text;
    reveal(el);
  }

  function renderOsmr(o) {
    var el = band('qs-head-press');
    if (!el || !o || !o.title || !o.text) return;
    var title = part(el, '.qs-osmr-title');
    var tag = part(el, '.qs-osmr-tag');
    title.textContent = o.title;
    // An <a> with no href renders as plain text, which is what a review with
    // no link should be rather than a dead one.
    if (o.link) title.setAttribute('href', o.link);
    else title.removeAttribute('href');
    var tags = (o.tags || []).join(' · ');
    tag.textContent = tags;
    tag.hidden = !tags;
    part(el, '.qs-osmr-text').textContent = o.text;
    reveal(el);
  }

  // Cache first, then the fetch over the top of it. Both write the same fields,
  // and the fetch can only ever resolve at or after this, so last-write-wins is
  // already fetch-wins.
  whenReady(function () {
    var cache = (window.QSPalette && window.QSPalette.cached &&
                 window.QSPalette.cached()) || {};
    renderMusing(cache.twitter);
    renderLookback(cache.lookback);
    renderOsmr(cache.osmr);
    renderScene(cache.scene);
  });

  if (window.QSPalette) {
    window.QSPalette.load(function (data) {
      if (!data) return;
      renderMusing(data.twitter);
      renderLookback(data.lookback);
      renderOsmr(data.osmr);
      renderScene(data.scene);
    });
  }

  pendingHome.then(function (home) {
    whenReady(function () { renderGauges(home); });
  });

  // The hourly object, handed on to anything else that wants it, so the sun
  // behind the masthead (media/qs-sun.js) rides along on this fetch instead of
  // making a second one for the same object. Same contract as QSPalette.load:
  // the callback runs once, with the payload or null, and never before there
  // is a DOM to draw into.
  window.QSHome = {
    load: function (callback) {
      pendingHome.then(function (home) {
        whenReady(function () {
          if (typeof callback === 'function') callback(home);
        });
      });
    }
  };
})(window, document);
