/* West Central Ohio Weather Center - site script (no build tools needed).
 * Live data comes from the National Weather Service API (https://api.weather.gov).
 * Nothing here is invented: if a source fails, the page says so. */
(function () {
  'use strict';

  /* ---------- settings (edit these to change the coverage area) ---------- */
  var CFG = {
    lat: 40.3612, lon: -83.7597, place: 'Bellefontaine, OH',
    homeUGC: 'OHC091', homeName: 'Logan County',
    counties: { OHC091: 'Logan', OHC107: 'Mercer', OHC037: 'Darke', OHC011: 'Auglaize', OHC149: 'Shelby', OHC109: 'Miami', OHC065: 'Hardin', OHC021: 'Champaign', OHC023: 'Clark', OHC159: 'Union' },
    afdOffice: 'ILN'
  };
  var NWS = 'https://api.weather.gov';
  var TZ = 'America/New_York';
  var BASE = (window.WCO && window.WCO.base) || '';
  var UGCS = Object.keys(CFG.counties);

  /* ---------- helpers ---------- */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var val = function (o) { return o && o.value != null ? o.value : null; };
  var c2f = function (c) { return c * 9 / 5 + 32; };
  var kmh2mph = function (k) { return k * 0.621371; };
  var DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  var compass = function (d) { return DIRS[Math.round(d / 22.5) % 16]; };
  function fmt(iso, o) {
    try { return new Date(iso).toLocaleString('en-US', Object.assign({ timeZone: TZ }, o)); } catch (e) { return ''; }
  }
  var tFull = function (iso) { return fmt(iso, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }); };
  var tClock = function (iso) { return fmt(iso, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }); };
  function icon(text, day) {
    var t = (text || '').toLowerCase();
    if (/thunder/.test(t)) return '⛈️';
    if (/snow|flurr|blizzard|sleet|ice|freezing/.test(t)) return '❄️';
    if (/rain|shower|drizzle/.test(t)) return '🌧️';
    if (/fog|haze|mist|smoke/.test(t)) return '🌫️';
    if (/wind|breezy/.test(t) && !/cloud|sun|clear/.test(t)) return '💨';
    if (/partly|mostly sunny|mostly clear|few clouds/.test(t)) return day === false ? '☁️' : '🌤️';
    if (/cloud|overcast/.test(t)) return '☁️';
    if (/sunny|clear|fair/.test(t)) return day === false ? '🌙' : '☀️';
    return '🌡️';
  }
  function msg(cls, html) { return '<p class="' + cls + '">' + html + '</p>'; }
  function errBox(what, link, label) {
    return msg('error', 'Could not load ' + esc(what) + ' right now. This can be a temporary problem with the data source. Try again in a few minutes' + (link ? ', or view the official source: <a href="' + esc(link) + '" rel="noopener">' + esc(label || link) + '</a>' : '') + '.');
  }

  /* fetch with timeout + retry (NWS can return brief 5xx errors and asks clients to back off) */
  async function getJSON(url, opts) {
    var tries = (opts && opts.tries) || 3, last;
    for (var i = 0; i < tries; i++) {
      var ctl = new AbortController();
      var timer = setTimeout(function () { ctl.abort(); }, 15000);
      try {
        var r = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/geo+json, application/json' } });
        clearTimeout(timer);
        if (r.ok) return await r.json();
        last = new Error('HTTP ' + r.status);
        if (r.status === 400 || r.status === 404) break;
      } catch (e) { clearTimeout(timer); last = e; }
      await sleep(800 * (i + 1));
    }
    throw last;
  }
  var data = function (name) { return getJSON(BASE + '/data/' + name, { tries: 2 }); };

  /* ---------- NWS: point, observations, forecast ---------- */
  async function getPoint() {
    try { var c = JSON.parse(sessionStorage.getItem('wco-pt') || 'null'); if (c && Date.now() - c.t < 6 * 3600e3) return c.d; } catch (e) { /* storage unavailable */ }
    var j = await getJSON(NWS + '/points/' + CFG.lat + ',' + CFG.lon);
    try { sessionStorage.setItem('wco-pt', JSON.stringify({ t: Date.now(), d: j.properties })); } catch (e) { /* ignore */ }
    return j.properties;
  }
  async function getObs(pt) {
    var st = await getJSON(pt.observationStations);
    var list = (st.features || []).slice(0, 5);
    for (var i = 0; i < list.length; i++) {
      try {
        var id = list[i].properties.stationIdentifier;
        var o = await getJSON(NWS + '/stations/' + id + '/observations/latest', { tries: 1 });
        var p = o.properties;
        if (val(p.temperature) != null && Date.now() - new Date(p.timestamp).getTime() < 3 * 3600e3) return { p: p, name: list[i].properties.name, id: id };
      } catch (e) { /* try next station */ }
    }
    throw new Error('No recent observation from nearby stations');
  }
  function renderConditions(el, o) {
    var p = o.p, T = Math.round(c2f(val(p.temperature)));
    var feel = val(p.heatIndex) != null ? val(p.heatIndex) : val(p.windChill);
    var ws = val(p.windSpeed), wg = val(p.windGust), wd = val(p.windDirection);
    var wind = ws == null || ws < 1.5 ? 'Calm' : (wd != null ? compass(wd) + ' ' : '') + Math.round(kmh2mph(ws)) + ' mph' + (wg ? ', gusts ' + Math.round(kmh2mph(wg)) : '');
    var rh = val(p.relativeHumidity), dp = val(p.dewpoint), pr = val(p.barometricPressure), vis = val(p.visibility);
    var stat = function (k, v) { return v == null ? '' : '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>'; };
    el.innerHTML =
      '<div class="cond-main"><div class="cond-temp">' + T + '<small>°F</small></div><div><div class="cond-desc">' + icon(p.textDescription) + ' ' + esc(p.textDescription || 'Conditions not reported') + '</div>' +
      (feel != null ? '<div class="muted">Feels like ' + Math.round(c2f(feel)) + '°F</div>' : '') + '</div></div>' +
      '<dl class="stats">' + stat('Wind', esc(wind)) + stat('Humidity', rh != null ? Math.round(rh) + '%' : null) + stat('Dew point', dp != null ? Math.round(c2f(dp)) + '°F' : null) +
      stat('Pressure', pr != null ? (pr * 0.0002953).toFixed(2) + ' inHg' : null) + stat('Visibility', vis != null ? Math.round(vis * 0.000621371 * 10) / 10 + ' mi' : null) + '</dl>' +
      '<p class="src">Observed ' + esc(tClock(p.timestamp)) + ' at ' + esc(o.name) + ' (' + esc(o.id) + '). Source: <a href="https://www.weather.gov/iln/" rel="noopener">National Weather Service</a>.</p>';
  }
  var dkey = function (iso) { return fmt(iso, { year: 'numeric', month: '2-digit', day: '2-digit' }); };
  var dlabel = function (iso) { return fmt(iso, { month: 'short', day: 'numeric' }); };
  function periodCard(p) {
    var pop = val(p.probabilityOfPrecipitation);
    return '<article class="period"><span class="ic" aria-hidden="true">' + icon(p.shortForecast, p.isDaytime) + '</span><h3>' + esc(p.name) + ' <span class="dd">' + esc(dlabel(p.startTime)) + '</span></h3>' +
      '<div class="t">' + esc(p.temperature) + '°' + esc(p.temperatureUnit) + '</div>' +
      '<div class="meta">' + (pop != null ? 'Precip chance ' + pop + '% · ' : '') + 'Wind ' + esc(p.windDirection) + ' ' + esc(p.windSpeed) + '</div>' +
      '<p>' + esc(p.detailedForecast) + '</p></article>';
  }
  /* Pair each daytime period with the following night so every card shows a date, high and low. */
  function buildDays(P) {
    var days = [], i = 0;
    while (i < P.length) {
      var d = {};
      if (P[i].isDaytime) { d.day = P[i]; if (P[i + 1] && !P[i + 1].isDaytime) { d.night = P[i + 1]; i += 2; } else i += 1; }
      else { d.night = P[i]; i += 1; }
      days.push(d);
    }
    return days;
  }
  function dayCard(d) {
    var a = d.day || d.night, isToday = dkey(a.startTime) === dkey(new Date().toISOString());
    var label = isToday ? (d.day ? 'Today' : 'Tonight') : fmt(a.startTime, { weekday: 'short' });
    var pops = [d.day, d.night].filter(Boolean).map(function (x) { return val(x.probabilityOfPrecipitation); }).filter(function (v) { return v != null; });
    var pop = pops.length ? Math.max.apply(null, pops) : null;
    return '<article class="day' + (isToday ? ' today' : '') + '"><div class="dh"><h3>' + esc(label) + '</h3><span class="dd">' + esc(dlabel(a.startTime)) + '</span></div>' +
      '<div class="ic" aria-hidden="true">' + icon(a.shortForecast, !!d.day) + '</div>' +
      '<div class="temps">' + (d.day ? esc(d.day.temperature) + '°' : '') + (d.night ? '<span>' + (d.day ? '' : 'Low ') + esc(d.night.temperature) + '°</span>' : '') + '</div>' +
      '<p class="sf">' + esc(a.shortForecast) + '</p>' +
      '<div class="meta">' + (pop != null ? 'Precip ' + pop + '% · ' : '') + esc(a.windDirection) + ' ' + esc(a.windSpeed) + '</div></article>';
  }
  async function loadForecast(pt) {
    var f = await getJSON(pt.forecast);
    return { periods: f.properties.periods || [], updated: f.properties.updateTime || f.properties.generatedAt };
  }

  /* ---------- NWS: alerts ---------- */
  async function getAlerts() {
    var j;
    try { j = await getJSON(NWS + '/alerts/active?zone=' + UGCS.join(',')); }
    catch (e) { j = await getJSON(NWS + '/alerts/active?area=OH'); }
    var feats = (j.features || []).filter(function (f) {
      var p = f.properties, u = (p.geocode && p.geocode.UGC) || [];
      return p.status === 'Actual' && u.some(function (x) { return UGCS.indexOf(x) > -1; });
    });
    feats.sort(function (a, b) { return rank(a.properties.event) - rank(b.properties.event); });
    return { feats: feats, at: new Date() };
  }
  function rank(ev) {
    var e = (ev || '').toLowerCase();
    if (/emergency/.test(e)) return -1;
    if (/tornado warning/.test(e)) return 0;
    if (/severe thunderstorm warning/.test(e)) return 1;
    if (/flash flood warning/.test(e)) return 2;
    if (/tornado watch/.test(e)) return 3;
    if (/severe thunderstorm watch/.test(e)) return 4;
    if (/warning/.test(e)) return 5;
    if (/watch/.test(e)) return 6;
    if (/advisory/.test(e)) return 7;
    return 8;
  }
  function alertClass(ev) {
    var e = (ev || '').toLowerCase();
    if (/tornado warning|emergency/.test(e)) return 'tor';
    if (/severe thunderstorm warning/.test(e)) return 'svr';
    if (/flood/.test(e) && !/watch/.test(e)) return 'flood';
    if (/watch/.test(e)) return 'watch';
    if (/winter|snow|ice|blizzard|freez|frost|chill|sleet|lake effect/.test(e)) return 'winter';
    return 'adv';
  }
  var hasHome = function (f) { return ((f.properties.geocode || {}).UGC || []).indexOf(CFG.homeUGC) > -1; };
  function alertCard(f) {
    var p = f.properties, cls = alertClass(p.event), open = rank(p.event) <= 2 ? ' open' : '';
    var text = [p.description, p.instruction ? 'PRECAUTIONARY/PREPAREDNESS ACTIONS:\n' + p.instruction : ''].filter(Boolean).join('\n\n');
    var link = /^https:\/\/api\.weather\.gov\//.test(f.id || '') ? f.id : 'https://www.weather.gov/iln/';
    return '<article class="alert ' + cls + '"><div class="alert-h"><h3>' + esc(p.event) + '</h3>' + (hasHome(f) ? '<span class="badge home">Includes ' + CFG.homeName + '</span>' : '<span class="badge">Nearby counties</span>') + '</div>' +
      '<div class="alert-b"><p class="when">Issued ' + esc(tFull(p.sent)) + (p.ends || p.expires ? ' · Until ' + esc(tFull(p.ends || p.expires)) : '') + (p.senderName ? ' · ' + esc(p.senderName) : '') + '</p>' +
      (p.headline ? '<p><strong>' + esc(p.headline) + '</strong></p>' : '') + '<p><strong>Area:</strong> ' + esc(p.areaDesc) + '</p>' +
      (text ? '<details' + open + '><summary>Full alert text</summary><pre>' + esc(text) + '</pre></details>' : '') +
      '<p class="src">Official source: <a href="' + esc(link) + '" rel="noopener">original NWS alert record</a></p></div></article>';
  }
  function renderStrip(el, res, err, cta) {
    if (err) { el.className = 'alert-strip err'; el.innerHTML = '<div><strong>Alert status unavailable</strong>We could not reach the National Weather Service alert feed, so we cannot say whether alerts are active. Check <a href="https://www.weather.gov/iln/" rel="noopener">weather.gov/iln</a> now.</div>'; return; }
    var home = res.feats.filter(hasHome), near = res.feats.length - home.length, at = tClock(res.at);
    var link = cta ? ' <a class="btn alt" href="' + BASE + '/alerts.html">View alerts</a>' : '';
    if (home.length) {
      var danger = home.some(function (f) { return rank(f.properties.event) <= 2; });
      el.className = 'alert-strip ' + (danger ? 'danger' : 'warn');
      var names = home.slice(0, 4).map(function (f) { return esc(f.properties.event); }).join(', ');
      el.innerHTML = '<div><strong>' + home.length + ' active alert' + (home.length > 1 ? 's' : '') + ' for ' + CFG.homeName + '</strong>' + names + (home.length > 4 ? ' and more' : '') + '. Checked ' + esc(at) + '.</div>' + link;
    } else {
      el.className = 'alert-strip ok';
      el.innerHTML = '<div><strong>No active alerts found for ' + CFG.homeName + '</strong>No matching active National Weather Service alerts were found. ' + (near ? near + ' alert' + (near > 1 ? 's are' : ' is') + ' active in nearby counties. ' : '') + 'Checked ' + esc(at) + '.</div>' + (near ? link : '');
    }
  }
  function safetyBox(res) {
    var box = $('#safety-dyn'); if (!box) return;
    var home = res.feats.filter(hasHome), ev = home.map(function (f) { return f.properties.event.toLowerCase(); }).join('|'), t = '';
    if (/tornado warning/.test(ev)) t = '<strong>Tornado warning: take shelter now.</strong> Go to the lowest floor, in an interior room away from windows. Mobile homes are not safe. Cover your head and body. Do not wait to see the tornado.';
    else if (/severe thunderstorm warning/.test(ev)) t = '<strong>Severe thunderstorm warning:</strong> move indoors, away from windows. Damaging wind and large hail are possible.';
    else if (/flash flood warning/.test(ev)) t = '<strong>Flash flood warning:</strong> move to higher ground. Never drive through flooded roads.';
    if (t) { box.hidden = false; box.className = 'notice'; box.style.marginBottom = '1rem'; box.innerHTML = t + ' <span class="muted">Follow instructions from official sources.</span>'; } else { box.hidden = true; }
  }

  /* ---------- NWS: forecast discussion (official, shown as received) ---------- */
  async function loadAFD(el) {
    try {
      var list = await getJSON(NWS + '/products/types/AFD/locations/' + CFG.afdOffice);
      var first = list['@graph'] && list['@graph'][0];
      if (!first) throw new Error('none');
      var prod = await getJSON(first['@id']);
      el.innerHTML = '<details><summary>Area Forecast Discussion, NWS Wilmington (issued ' + esc(tFull(prod.issuanceTime)) + ')</summary><pre>' + esc(prod.productText) + '</pre></details>' +
        '<p class="src">This is the National Weather Service\'s technical discussion, shown unedited. <a href="https://forecast.weather.gov/product.php?site=ILN&issuedby=ILN&product=AFD" rel="noopener">Open on weather.gov</a></p>';
    } catch (e) {
      el.innerHTML = errBox('the NWS forecast discussion', 'https://forecast.weather.gov/product.php?site=ILN&issuedby=ILN&product=AFD', 'NWS Wilmington discussion');
    }
  }

  /* ---------- radar (Leaflet + NEXRAD mosaic tiles) ---------- */
  function initRadar(id, animated) {
    try { buildRadar(id, animated); } catch (e) {
      var b = $('#' + id); if (b) b.innerHTML = '<div class="error" style="margin:1rem">The radar map could not start. Use the <a href="https://radar.weather.gov/" rel="noopener">NWS radar</a> instead.</div>';
    }
  }
  function buildRadar(id, animated) {
    var box = $('#' + id); if (!box) return;
    if (!window.L) { box.innerHTML = '<div class="error" style="margin:1rem">The radar map library did not load. Use the <a href="https://radar.weather.gov/" rel="noopener">NWS radar</a> instead.</div>'; return; }
    var map = L.map(id, { scrollWheelZoom: false, minZoom: 5, maxZoom: 11 });
    /* Coverage area: Mercer/Darke (west) to Union/Champaign/Clark (east), Hardin (north) to Miami (south) */
    if (animated) map.setView([CFG.lat, CFG.lon], 8); else map.fitBounds([[39.6, -85.0], [41.0, -83.1]]);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
    var suffixes = animated ? ['-m50m', '-m45m', '-m40m', '-m35m', '-m30m', '-m25m', '-m20m', '-m15m', '-m10m', '-m05m', ''] : [''];
    var layers = suffixes.map(function (s) {
      return L.tileLayer('https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913' + s + '/{z}/{x}/{y}.png', { opacity: 0, attribution: 'Radar: NEXRAD via <a href="https://mesonet.agron.iastate.edu/">Iowa Environmental Mesonet</a>' }).addTo(map);
    });
    var cur = layers.length - 1;
    var failed = 0, status = $('#radar-status');
    layers.forEach(function (l) { l.on('tileerror', function () { failed++; if (failed > 6 && status) { status.hidden = false; status.textContent = 'Some radar tiles failed to load. The radar service may be temporarily unavailable. Use the official NWS radar link below.'; } }); });
    L.circleMarker([CFG.lat, CFG.lon], { radius: 5, color: '#12151c', weight: 2, fillColor: '#f7931e', fillOpacity: 1 }).addTo(map).bindTooltip(CFG.place);
    var label = $('#radar-label'), slider = $('#radar-slider'), btn = $('#radar-play');
    function show(i) {
      cur = i; layers.forEach(function (l, k) { l.setOpacity(k === i ? 0.7 : 0); });
      if (label) { var mins = (layers.length - 1 - i) * 5; label.textContent = mins === 0 ? 'Latest scan' : 'About ' + mins + ' min before latest'; }
      if (slider) slider.value = i;
    }
    show(cur);
    if (!animated) return;
    var timer = null;
    function stop() { clearInterval(timer); timer = null; btn.textContent = 'Play loop'; }
    btn.addEventListener('click', function () {
      if (timer) { stop(); return; }
      btn.textContent = 'Pause';
      timer = setInterval(function () { show((cur + 1) % layers.length); }, cur === layers.length - 1 ? 600 : 600);
    });
    slider.addEventListener('input', function () { stop(); show(+slider.value); });
    setInterval(function () { layers.forEach(function (l) { l.redraw(); }); }, 5 * 60 * 1000);
  }

  /* ---------- content (blog, maps, discussion) ---------- */
  function postCard(p) {
    return '<article class="post-card">' + (p.image ? '<a href="' + esc(p.url) + '" tabindex="-1" aria-hidden="true"><img src="' + esc(p.image) + '" alt="" loading="lazy"></a>' : '') +
      '<div class="pc"><span class="tag">' + esc(p.category) + '</span> ' + (p.sample ? '<span class="tag sample">Sample</span>' : '') +
      '<h3><a href="' + esc(p.url) + '">' + esc(p.title) + '</a></h3><div class="meta">' + esc(p.dateText) + '</div><p>' + esc(p.summary) + '</p></div></article>';
  }
  function chips(el, items, onPick) {
    var all = ['All'].concat(items.filter(function (v, i, a) { return a.indexOf(v) === i; }));
    el.innerHTML = all.map(function (c, i) { return '<button class="chip" type="button" aria-pressed="' + (i === 0) + '">' + esc(c) + '</button>'; }).join('');
    $$('.chip', el).forEach(function (b, i) {
      b.addEventListener('click', function () { $$('.chip', el).forEach(function (x) { x.setAttribute('aria-pressed', 'false'); }); b.setAttribute('aria-pressed', 'true'); onPick(i === 0 ? null : all[i]); });
    });
  }
  async function pagePosts(limit) {
    var el = $(limit ? '#home-posts' : '#posts');
    try {
      var posts = await data('posts.json');
      if (!posts.length) { el.innerHTML = msg('empty', 'No posts have been published yet.'); return; }
      var draw = function (cat) { var l = posts.filter(function (p) { return !cat || p.category === cat; }); if (limit) l = l.slice(0, limit); el.innerHTML = l.length ? l.map(postCard).join('') : msg('empty', 'No posts in this category yet.'); };
      draw(null);
      var cf = $('#cat-filters'); if (cf && !limit) chips(cf, posts.map(function (p) { return p.category; }), draw);
    } catch (e) { el.innerHTML = errBox('blog posts'); }
  }
  async function pageMaps() {
    var el = $('#gallery');
    try {
      var maps = await data('maps.json');
      if (!maps.length) { el.innerHTML = msg('empty', 'No maps or graphics have been published yet.'); return; }
      var draw = function (cat) {
        el.innerHTML = maps.filter(function (m) { return !cat || m.category === cat; }).map(function (m) {
          return '<figure><a href="' + esc(m.image) + '"><img src="' + esc(m.image) + '" alt="' + esc(m.imageAlt) + '" loading="lazy"></a><figcaption><span class="tag">' + esc(m.category) + '</span> ' + (m.sample ? '<span class="tag sample">Sample</span>' : '') +
            '<h3>' + esc(m.title) + '</h3><div class="meta">' + esc(m.dateText) + '</div>' + (m.caption ? '<p>' + esc(m.caption) + '</p>' : '') + '</figcaption></figure>';
        }).join('');
      };
      draw(null); chips($('#cat-filters'), maps.map(function (m) { return m.category; }), draw);
    } catch (e) { el.innerHTML = errBox('maps and graphics'); }
  }
  async function pageDiscussion(el, full) {
    try {
      var d = await data('discussion.json');
      if (!d) { el.innerHTML = msg('empty', 'No forecast discussion has been published yet.'); return; }
      var sample = d.sample ? '<p class="sample-note"><strong>Sample content.</strong> This is placeholder text, not a real forecast. Replace it in the editor.</p>' : '';
      el.innerHTML = sample + '<h3>' + esc(d.title) + '</h3><p class="meta">Written by ' + (esc(d.author) || 'West Central Ohio Weather Center') + (d.updatedText ? ' · ' + esc(d.updatedText) : '') + '</p>' +
        (full ? '<div class="prose">' + d.html + '</div><p class="src">This discussion is our own commentary, not an official National Weather Service product.</p>' : '<p>' + esc(d.excerpt) + '</p><p><a href="' + BASE + '/forecast.html">Read the full discussion</a></p>');
    } catch (e) { el.innerHTML = errBox('the forecast discussion'); }
  }

  /* ---------- pages ---------- */
  async function refreshConditions() {
    var el = $('#conditions'); if (!el) return;
    try { renderConditions(el, await getObs(await getPoint())); }
    catch (e) { el.innerHTML = errBox('current conditions', 'https://www.weather.gov/iln/', 'weather.gov/iln'); }
  }
  async function refreshAlerts() {
    var strip = $('#alert-strip') || $('#alerts-meta');
    try {
      var res = await getAlerts(); window.__alerts = res;
      renderStrip(strip, res, false, !!$('#alert-strip'));
      safetyBox(res);
      if ($('#alerts-list')) drawAlerts();
    } catch (e) { renderStrip(strip, null, true); if ($('#alerts-list')) $('#alerts-list').innerHTML = ''; }
  }
  var alertFilter = 'home';
  function drawAlerts() {
    var res = window.__alerts, list = $('#alerts-list'); if (!res) return;
    var feats = alertFilter === 'home' ? res.feats.filter(hasHome) : res.feats;
    list.innerHTML = feats.length ? feats.map(alertCard).join('') :
      msg('empty', 'No matching active National Weather Service alerts were found for ' + (alertFilter === 'home' ? CFG.homeName : 'Logan County or the nearby counties') + ' as of ' + esc(tClock(res.at)) + '.');
  }

  async function forecastPage(full) {
    var pt;
    try { pt = await getPoint(); } catch (e) {
      ['#home-forecast', '#fc-today', '#fc-ext', '#fc-hourly'].forEach(function (s) { var el = $(s); if (el) el.innerHTML = errBox('the forecast', 'https://www.weather.gov/iln/', 'weather.gov/iln'); });
      return;
    }
    try {
      var f = await loadForecast(pt), P = f.periods, src = 'Source: National Weather Service ' + esc((pt.relativeLocation && pt.relativeLocation.properties.city) || CFG.place) + ' forecast (office ' + esc(pt.gridId) + '), updated ' + esc(tFull(f.updated)) + '.';
      var days = buildDays(P);
      if (!full) { $('#home-forecast').innerHTML = '<div class="days">' + days.slice(0, 5).map(dayCard).join('') + '</div><p class="src">' + src + '</p>'; }
      else {
        $('#fc-today').innerHTML = '<div class="periods">' + P.slice(0, 2).map(periodCard).join('') + '</div>';
        $('#fc-ext').innerHTML = '<div class="days">' + days.slice(1).map(dayCard).join('') + '</div>';
        $('#fc-src').innerHTML = src + ' Forecasts are computer-assisted and can change.';
      }
    } catch (e) {
      ['#home-forecast', '#fc-today', '#fc-ext'].forEach(function (s) { var el = $(s); if (el) el.innerHTML = errBox('the forecast', 'https://www.weather.gov/iln/', 'weather.gov/iln'); });
    }
    if (full) {
      try {
        var h = await getJSON(pt.forecastHourly), rows = (h.properties.periods || []).slice(0, 12).map(function (p) {
          var pop = val(p.probabilityOfPrecipitation);
          return '<tr><td>' + esc(fmt(p.startTime, { weekday: 'short', hour: 'numeric' })) + '</td><td>' + esc(p.temperature) + '°' + esc(p.temperatureUnit) + '</td><td>' + (pop != null ? pop + '%' : '-') + '</td><td>' + esc(p.windDirection) + ' ' + esc(p.windSpeed) + '</td><td>' + esc(p.shortForecast) + '</td></tr>';
        }).join('');
        $('#fc-hourly').innerHTML = '<table class="hourly"><thead><tr><th>Time</th><th>Temp</th><th>Precip</th><th>Wind</th><th>Conditions</th></tr></thead><tbody>' + rows + '</tbody></table>';
      } catch (e) { $('#fc-hourly').innerHTML = errBox('the hourly forecast'); }
    }
  }

  function init() {
    var page = document.body.getAttribute('data-page');
    var navKey = page === 'notfound' ? '' : page;
    var link = $('[data-nav="' + navKey + '"]'); if (link) link.setAttribute('aria-current', 'page');
    var tog = $('.nav-toggle'), nav = $('#nav');
    if (tog) tog.addEventListener('click', function () { var o = nav.classList.toggle('open'); tog.setAttribute('aria-expanded', o); });

    if (page === 'home') {
      refreshAlerts(); refreshConditions(); forecastPage(false); initRadar('radar-map', false);
      pageDiscussion($('#home-discussion'), false); pagePosts(3);
    } else if (page === 'forecast') {
      refreshConditions(); forecastPage(true); pageDiscussion($('#discussion'), true); loadAFD($('#afd'));
    } else if (page === 'radar') { initRadar('radar-map', true); }
    else if (page === 'alerts') {
      refreshAlerts();
      $$('.chip[data-f]').forEach(function (b) { b.addEventListener('click', function () { alertFilter = b.getAttribute('data-f'); $$('.chip[data-f]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); drawAlerts(); }); });
    } else if (page === 'blog' && $('#posts')) { pagePosts(0); }
    else if (page === 'maps') { pageMaps(); }

    var cl = $('#counties'); if (cl) { var n = UGCS.map(function (u) { return CFG.counties[u]; }); cl.textContent = n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1] + ' counties.'; }
    if (page === 'home' || page === 'alerts') setInterval(refreshAlerts, 2 * 60 * 1000);
    if (page === 'home' || page === 'forecast') setInterval(refreshConditions, 10 * 60 * 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
