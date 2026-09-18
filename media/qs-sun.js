/* QS sun ---------------------------------------------------------------------
 *
 * The roof's day, drawn behind @elialbert.
 *
 * qs-home.json carries `solar.hours`: 24 slots holding kWh produced since
 * midnight as of the end of each hour, Central, with the hours that have not
 * happened yet left null. This turns that into the one picture it is actually
 * the shape of — a sun crossing the top of the masthead — and draws it on every
 * load as a sweep from sunrise to right now.
 *
 * Three things carry the reading, and all three are the same number:
 *
 *   the ribbon  the arc's thickness at each hour is that hour's production, so
 *               the band swells through midday and tapers at both ends
 *   the rays    hours that cleared ~1.1 kWh throw light down through the header
 *   the disc    sits at the live Central time, sized by what is coming in now
 *
 * A grey day is a thin pale thread with no rays and a small sun, which is the
 * whole point: this is a reading, not a decoration, and it has to be allowed to
 * say "not much". A day the roof made nothing at all still gets its hairline —
 * the sun was up and produced nothing, which is a fact rather than an absence.
 *
 * ⚠️ Everything drawn here is pale by construction (nothing exceeds ~0.34 alpha
 * of a light warm hue, over the masthead's white). The site title sits directly
 * on top of it and has to keep its contrast, so if these numbers ever go up,
 * check the header against black text before shipping it.
 *
 * ⚠️ The hourly object is never cached — see the note at the top of
 * media/qs-headers.js. A day-old sun is worse than no sun, so a payload whose
 * `date` is not today in Central draws nothing at all rather than yesterday's
 * weather under today's header.
 */
(function (window, document) {
  'use strict';

  var TZ = 'America/Chicago';
  var LAT = 41.88, LON = -87.63;   // the array's block, near enough for a sunrise

  // One hour at full brightness. Not max(today) — normalising each day to its
  // own peak would make every day look equally sunny, which is exactly the
  // thing this is supposed to be able to deny. A clear summer hour on this
  // array lands near 4; September's best hour today was 3.3, and reads dimmer.
  var PEAK = 4.0;

  var RAY_FLOOR = 0.28;   // below this an hour throws no light
  var SWEEP_MS = 2200;    // sunrise to now, on load

  // The arc, as fractions of the masthead's height. The horizon sits below the
  // bottom edge so the sun rises out of it and sets back through it, and the
  // apex lands behind the letters rather than above them.
  var APEX = 0.30, HORIZON = 1.12;

  var THIN = 1.6, THICK = 17;   // the ribbon, at nothing and at PEAK

  // Everything above is drawn for a masthead about REF_W across, and scaled
  // from there. The arc's height is the masthead's, but its length is the
  // window's, so on a phone the same day is squeezed into a third of the width
  // while keeping all of the height: a 17px ribbon that reads as a band at
  // 1100px reads as a blot at 390, and beams spaced an hour apart stop being
  // separate beams at all. Width, not height, because the horizontal squeeze is
  // the whole distortion.
  var REF_W = 1100, MIN_K = 0.45, MAX_K = 1.15;

  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function rad(d) { return d * Math.PI / 180; }
  function deg(r) { return r * 180 / Math.PI; }
  function n(x) { return x.toFixed(2); }

  // Where and when ------------------------------------------------------------

  // The clock that matters is the roof's, not the reader's: someone opening
  // this from Berlin should see Chicago's afternoon, because that is where the
  // panels are. Central's own UTC offset comes out of the same formatted
  // instant rather than a hardcoded -5/-6, so DST is the tz database's problem.
  function central() {
    var now = new Date(), parts = {}, hour, clock, utc, offset;
    try {
      new Intl.DateTimeFormat('en-US', {
        timeZone: TZ, hour12: false, year: 'numeric', month: '2-digit',
        day: '2-digit', hour: '2-digit', minute: '2-digit'
      }).formatToParts(now).forEach(function (p) { parts[p.type] = p.value; });
    } catch (e) {
      return null;   // no tz database: no sun, rather than a sun in the wrong sky
    }
    hour = parseInt(parts.hour, 10) % 24;   // some engines write midnight as 24
    if (!isFinite(hour)) return null;
    clock = hour + parseInt(parts.minute, 10) / 60;
    utc = now.getUTCHours() + now.getUTCMinutes() / 60;
    offset = Math.round(clock - utc);
    if (offset > 12) offset -= 24;
    if (offset < -12) offset += 24;
    return {
      date: parts.year + '-' + parts.month + '-' + parts.day,
      clock: clock,
      offset: offset
    };
  }

  function dayOfYear(date) {
    var p = date.split('-');
    return Math.round((Date.UTC(+p[0], +p[1] - 1, +p[2]) -
                       Date.UTC(+p[0], 0, 0)) / 86400000);
  }

  // Sunrise and sunset in local clock hours, the standard NOAA approximation:
  // equation of time for the longitude correction, solar declination for the
  // hour angle, and 90.833° to the centre of the disc for refraction and radius.
  // Checked against the four corners of the year for Chicago — within ~5 minutes
  // at the solstices and the equinoxes, which is finer than one pixel here.
  function daylight(date, offset) {
    var N = dayOfYear(date);
    var B = 2 * Math.PI * (N - 81) / 364;
    var eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
    var decl = rad(23.45) * Math.sin(2 * Math.PI * (284 + N) / 365);
    var noon = 12 - (4 * (LON - 15 * offset) + eot) / 60;
    var cosH = (Math.cos(rad(90.833)) - Math.sin(rad(LAT)) * Math.sin(decl)) /
               (Math.cos(rad(LAT)) * Math.cos(decl));
    if (cosH > 1 || cosH < -1) return null;   // not at this latitude, but still
    var half = deg(Math.acos(cosH)) / 15;
    return { rise: noon - half, set: noon + half };
  }

  // The reading ---------------------------------------------------------------

  // `hours` is a counter, so an hour's own production is its difference from the
  // one before. The LAST filled hour is the exception: it was read partway
  // through, so its difference covers only part of an hour and would draw a dip
  // right where the sun is. `generated_at` says how far into that hour the read
  // happened — the minutes are the same in UTC and Central — so scale it back
  // up to a whole hour.
  //
  // Below PARTIAL that stops being arithmetic and starts being invention: the
  // publish runs on the hour, so the usual case is a few minutes of evidence
  // being asked to stand for sixty, and at :00 exactly there is no evidence at
  // all. An hour that thin is dropped rather than scaled, and the curve carries
  // the last whole hour forward instead — the sun going briefly stale is much
  // better than the sun going dark every time the cron lands on the hour.
  var PARTIAL = 0.2;

  function intensities(solar, generatedAt) {
    var hours = (solar && solar.hours) || [], deltas = [], last = -1;
    var prev = 0, i, v, m, frac;
    for (i = 0; i < 24; i++) {
      v = hours[i];
      if (typeof v !== 'number' || !isFinite(v)) break;
      deltas.push(Math.max(0, v - prev));
      prev = v;
      last = i;
    }
    if (last < 0) return null;
    if (last > 0) {
      m = /T\d{2}:(\d{2})/.exec(generatedAt || '');
      frac = m ? parseInt(m[1], 10) / 60 : 1;
      if (frac < PARTIAL) {
        deltas.pop();
        last -= 1;
      } else {
        deltas[last] = deltas[last] / frac;
      }
    }
    return {
      last: last,
      norms: deltas.map(function (kwh) { return clamp01(kwh / PEAK); })
    };
  }

  // An hour's production belongs to the middle of that hour, so the curve is
  // drawn through the hour centres. Past the last hour the exporter has, it
  // carries the last value forward — which is the same forward-fill the
  // exporter itself does for a quiet recorder, and covers at most the ~30
  // minutes between the hourly publish and this page load.
  function sampler(read) {
    var norms = read.norms, last = read.last;
    return function (t) {
      var u = t - 0.5, i, f;
      if (u <= 0) return norms[0];
      if (u >= last) return norms[last];
      i = Math.floor(u);
      f = u - i;
      return norms[i] + (norms[i + 1] - norms[i]) * f;
    };
  }

  // The drawing ---------------------------------------------------------------

  // The full 24 hours span the full width, so the ribbon's position under the
  // window is the time of day and the empty margins at either end are night.
  function geometry(w, h, day) {
    var horizon = h * HORIZON, amp = horizon - h * APEX;
    var span = day.set - day.rise;
    return {
      w: w, h: h,
      k: Math.min(MAX_K, Math.max(MIN_K, w / REF_W)),
      x: function (t) { return w * t / 24; },
      y: function (t) {
        return horizon - amp * Math.sin(Math.PI * clamp01((t - day.rise) / span));
      }
    };
  }

  function pts(list) {
    return list.map(function (p) { return n(p[0]) + ' ' + n(p[1]); });
  }

  // A stroke cannot change width along its length, so the ribbon is a filled
  // shape: walk the arc offsetting to either side of it by half that moment's
  // production, out along the top and back along the bottom.
  //
  // The last TAPER of an hour closes to a point. Left square the ribbon ends on
  // a flat vertical cut, and the cut sits under the sun's own disc — which is
  // translucent, so it shows through as a seam straight down the middle of the
  // sun. Short enough that the whole taper hides under the disc at any width
  // the masthead gets, because the taper is a translucent wedge and showing
  // through is exactly what it was added to stop. At the far end of a finished
  // day there is no disc to hide under, but there is also nothing to hide: the
  // last of the light is already the thinnest part of the ribbon.
  var TAPER = 0.12;

  function ribbon(geo, at, from, to) {
    var steps = Math.max(8, Math.ceil((to - from) / 0.06));
    var up = [], down = [], i, t, px, py, dx, dy, len, nx, ny, hw, tail;
    for (i = 0; i <= steps; i++) {
      t = from + (to - from) * i / steps;
      px = geo.x(t);
      py = geo.y(t);
      dx = geo.x(t + 0.02) - geo.x(t - 0.02);
      dy = geo.y(t + 0.02) - geo.y(t - 0.02);
      len = Math.sqrt(dx * dx + dy * dy) || 1;
      nx = -dy / len;
      ny = dx / len;
      tail = clamp01((to - t) / TAPER);
      // The floor is under the scaling, not over it: a nothing-day's hairline
      // has to stay a visible line at any width. The taper is over both, so the
      // leading edge still closes to an actual point.
      hw = Math.max(0.7, (THIN + (THICK - THIN) * at(t)) * geo.k / 2);
      hw *= tail * (2 - tail);
      up.push([px + nx * hw, py + ny * hw]);
      down.push([px - nx * hw, py - ny * hw]);
    }
    return 'M' + pts(up).join('L') + 'L' + pts(down.reverse()).join('L') + 'Z';
  }

  // Light from where the sun was, not only from where it is: every hour that
  // cleared the floor keeps its own beams, so the finished band is a comb of
  // them, densest over midday.
  //
  // Two things keep the comb from looking like a row of triangles. Each beam
  // starts just under the ribbon's lower edge rather than on the arc itself,
  // because the ribbon is translucent and an apex tucked inside it shows
  // through as a bright notch. And no beam is longer than the drop to the
  // masthead's bottom, so its gradient has run all the way out by the time the
  // edge cuts it — a beam that is still visible where it is clipped reads as a
  // mistake rather than as light.
  var FAN = { 1: [0], 2: [-15, 15], 3: [-27, 0, 27] };

  function rays(geo, read, at, from, to) {
    var out = '', h, t, v, count, i, a, dx, dy, px, py, L, bw, apex, base;
    for (h = 0; h <= read.last; h++) {
      t = h + 0.5;
      v = read.norms[h];
      if (t < from || t > to || v < RAY_FLOOR) continue;
      count = v > 0.7 ? 3 : (v > 0.45 ? 2 : 1);
      // An hour is ~46px at REF_W and ~16px on a phone. Three beams out of each
      // of those would be one continuous wash, so the fan narrows with the
      // window and a phone gets one beam an hour.
      count = Math.min(count, geo.k < 0.62 ? 1 : (geo.k < 0.85 ? 2 : 3));
      px = geo.x(t);
      py = geo.y(t) + Math.max(0.7, (THIN + (THICK - THIN) * at(t)) * geo.k / 2);
      L = Math.max(0, geo.h - py) * (0.6 + 0.4 * v);
      bw = (3 + 9 * v) * geo.k;
      for (i = 0; i < count; i++) {
        a = rad(FAN[count][i]);
        dx = Math.sin(a);
        dy = Math.cos(a);
        apex = [[px - dy * 1.2, py + dx * 1.2], [px + dy * 1.2, py - dx * 1.2]];
        base = [[px + dx * L + dy * bw, py + dy * L - dx * bw],
                [px + dx * L - dy * bw, py + dy * L + dx * bw]];
        out += '<polygon class="qs-sun-ray" fill-opacity="' +
               n(0.05 + 0.13 * v) + '" points="' +
               pts([apex[0], apex[1], base[0], base[1]]).join(' ') + '"/>';
      }
    }
    return out;
  }

  function defs(geo, day) {
    return '<defs>' +
      '<linearGradient id="qs-sun-ribbon-fill" gradientUnits="userSpaceOnUse"' +
        ' x1="' + n(geo.x(day.rise)) + '" y1="0"' +
        ' x2="' + n(geo.x(day.set)) + '" y2="0">' +
        '<stop offset="0" class="qs-sun-stop-edge"/>' +
        '<stop offset="0.5" class="qs-sun-stop-core"/>' +
        '<stop offset="1" class="qs-sun-stop-edge"/>' +
      '</linearGradient>' +
      '<linearGradient id="qs-sun-ray-fill" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" class="qs-sun-stop-core" stop-opacity="1"/>' +
        '<stop offset="1" class="qs-sun-stop-core" stop-opacity="0"/>' +
      '</linearGradient>' +
      '<radialGradient id="qs-sun-halo-fill">' +
        '<stop offset="0" class="qs-sun-stop-core" stop-opacity="0.55"/>' +
        '<stop offset="0.45" class="qs-sun-stop-core" stop-opacity="0.18"/>' +
        '<stop offset="1" class="qs-sun-stop-core" stop-opacity="0"/>' +
      '</radialGradient>' +
      '<clipPath id="qs-sun-sweep"><rect id="qs-sun-sweep-rect" x="0" y="0"' +
        ' width="0" height="' + n(geo.h * 1.4) + '"/></clipPath>' +
    '</defs>';
  }

  function clock12(t) {
    var h = Math.floor(t) % 24, m = Math.floor((t - Math.floor(t)) * 60);
    var suffix = h < 12 ? 'AM' : 'PM';
    var twelve = h % 12;
    return (twelve === 0 ? 12 : twelve) + ':' + ('0' + m).slice(-2) + ' ' + suffix;
  }

  // The only words on the whole thing, and they are the reading a sighted
  // reader has to infer from the picture. Stripped of the four characters that
  // could end the attribute this is interpolated into — `unit` is the
  // exporter's and reads "kWh", but it is the one part of this that is a string
  // from somewhere else rather than a number formatted here.
  function label(solar, now, up) {
    var total = (typeof solar.today === 'number') ? solar.today.toFixed(1) : '?';
    return ('The roof: ' + total + ' ' + (solar.unit || 'kWh') + ' so far today. ' +
            (up ? 'The sun is up, at ' + clock12(now) + ' in Chicago.'
                : 'The sun is down in Chicago.')).replace(/[<>&"]/g, '');
  }

  // Assembly ------------------------------------------------------------------

  function build(host, home, at_) {
    var solar = home.solar;
    var w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return null;

    var day = daylight(at_.date, at_.offset);
    var read = intensities(solar, home.generated_at);
    if (!day || !read) return null;

    // Before sunrise there is no arc to draw yet — the roof's day has not
    // started, and a ribbon of zero length is not a picture of anything.
    var from = day.rise;
    var to = Math.min(at_.clock, day.set);
    if (to <= from) return null;

    var geo = geometry(w, h, day);
    var at = sampler(read);
    var up = at_.clock >= day.rise && at_.clock <= day.set;
    var core = (5 + 8 * at(to)) * geo.k;

    var svg = '<svg class="qs-sun" viewBox="0 0 ' + n(w) + ' ' + n(h) + '"' +
        ' preserveAspectRatio="none" role="img" aria-label="' +
        label(solar, at_.clock, up) + '">' +
      defs(geo, day) +
      '<g clip-path="url(#qs-sun-sweep)">' +
        '<g class="qs-sun-rays">' + rays(geo, read, at, from, to) + '</g>' +
        '<path class="qs-sun-ribbon" d="' + ribbon(geo, at, from, to) + '"/>' +
      '</g>';

    if (up) {
      svg += '<g class="qs-sun-disc" transform="translate(' +
               n(geo.x(to)) + ' ' + n(geo.y(to)) + ')">' +
               '<circle class="qs-sun-halo" r="' + n(core * 3.4) + '"/>' +
               '<circle class="qs-sun-core" r="' + n(core) + '"/>' +
             '</g>';
    }
    svg += '</svg>';

    var wrap = document.createElement('div');
    wrap.innerHTML = svg;
    return { node: wrap.firstChild, geo: geo, from: from, to: to };
  }

  // The sweep is the point: the day is replayed from sunrise, the ribbon
  // arriving behind the sun rather than all at once. A clip rectangle widening
  // to the sun's own x uncovers the ribbon and each hour's rays exactly as the
  // disc passes over them, so one animated attribute drives all three.
  function sweep(drawn, animate) {
    var rect = drawn.node.querySelector('#qs-sun-sweep-rect');
    var disc = drawn.node.querySelector('.qs-sun-disc');
    var geo = drawn.geo, from = drawn.from, to = drawn.to;

    function place(t) {
      rect.setAttribute('width', n(Math.max(0, geo.x(t))));
      if (disc) {
        disc.setAttribute('transform',
          'translate(' + n(geo.x(t)) + ' ' + n(geo.y(t)) + ')');
      }
    }

    if (!animate) {
      rect.setAttribute('width', n(geo.w));
      return;
    }

    place(from);
    var t0 = null;
    function frame(ts) {
      if (t0 === null) t0 = ts;
      var p = Math.min(1, (ts - t0) / SWEEP_MS);
      var eased = 1 - Math.pow(1 - p, 3);
      place(from + (to - from) * eased);
      if (p < 1) window.requestAnimationFrame(frame);
      // The clip stops tracking the sun at the end and opens all the way. The
      // last hour's beams fan out sideways past the sun's own x, and a clip
      // that stayed parked there would shave them off down one side.
      else rect.setAttribute('width', n(geo.w));
    }
    window.requestAnimationFrame(frame);
  }

  function still() {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
      return false;
    }
  }

  function draw(home, animate) {
    var host = document.querySelector('.masthead');
    var old = host && host.querySelector('.qs-sun');
    if (old) old.parentNode.removeChild(old);
    if (!host || !home || !home.solar) return;

    var at_ = central();
    // A payload from another day is a picture of another day's weather. The
    // exporter stamps what it measured; if that is not today here, draw nothing.
    if (!at_ || home.date !== at_.date) return;

    var drawn = build(host, home, at_);
    if (!drawn) return;
    host.insertBefore(drawn.node, host.firstChild);
    sweep(drawn, animate && !still());
  }

  function debounce(fn, ms) {
    var timer = null;
    return function () {
      window.clearTimeout(timer);
      timer = window.setTimeout(fn, ms);
    };
  }

  if (!window.QSHome) return;

  window.QSHome.load(function (home) {
    if (!home || !home.solar) return;
    draw(home, true);
    // The arc is measured in pixels off the masthead, so a resize has to
    // redraw it — but only the geometry, not the day. Replaying the sweep on
    // every drag of a window edge would be a party trick; it runs once.
    window.addEventListener('resize', debounce(function () {
      draw(home, false);
    }, 150));
  });
})(window, document);
