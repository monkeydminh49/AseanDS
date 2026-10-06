import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import L from 'leaflet';
import * as THREE from 'three';
import { ArrowUpRight, ArrowRight, ArrowLeft, ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, Compass, Download, Droplets, Globe2, Layers, LayoutDashboard, MapPin, Maximize, Minus, Plus, Route, Satellite, Search, Settings2, Waves, X } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import './styles.css';

const key = p => `${p.country}|${p.province}`;
const number = (n, d = 0) => n == null ? '—' : n.toLocaleString('en-GB', { maximumFractionDigits: d });
const signed = (n, d = 2) => `${n >= 0 ? '+' : '−'}${number(Math.abs(n), d)}`;
const monthLabel = s => new Date(`${s}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const isFiniteNumber = n => typeof n === 'number' && Number.isFinite(n);
const credits = 'Esri, Vantor, Earthstar Geographics, GIS User Community';
const CAMAU = 'Viet Nam|Cà Mau';

function Sparkline({ values, color = '#3d8386', area = false, labels = false }) {
  const finite = values.filter(isFiniteNumber);
  if (!finite.length) return <p className="muted">No observations available</p>;
  const lo = Math.min(...finite), hi = Math.max(...finite), span = hi - lo || 1;
  const points = values.map((v, i) => isFiniteNumber(v) ? `${i * 300 / Math.max(values.length - 1, 1)},${75 - (v - lo) / span * 60}` : null);
  const path = points.map((p, i) => p ? `${i && points[i - 1] ? 'L' : 'M'}${p}` : '').join(' ');
  return <div className="spark"><svg viewBox="0 0 300 90" preserveAspectRatio="none" role="img" aria-label={`Trend from ${finite[0]} to ${finite.at(-1)}`}>
    {[15, 45, 75].map(y => <line key={y} x1="0" y1={y} x2="300" y2={y} stroke="#e8edeb" strokeDasharray="3 5" />)}
    {area && finite.length === values.length && <path d={`${path} L300,90 L0,90 Z`} fill={color} opacity=".09" />}
    <path d={path} fill="none" stroke={color} strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
    {points.at(-1) && <circle cx={points.at(-1).split(',')[0]} cy={points.at(-1).split(',')[1]} r="3" fill={color} />}
  </svg>{labels && <div className="axis"><span>Sep ’25</span><span>Jan ’26</span><span>Aug ’26</span></div>}</div>;
}

function MapView({ data, countries, regional = false, province, onProvince, rows = [], selected, onSelect, route = [], layer = true, focus = false }) {
  const el = useRef(null), map = useRef(null), dynamic = useRef(null);
  useEffect(() => {
    const m = L.map(el.current, { zoomControl: false, minZoom: regional ? 3 : 8, maxZoom: 15, scrollWheelZoom: true, attributionControl: false });
    map.current = m;
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(m);
    if (regional) {
      m.setView([7, 111], 4);
      L.geoJSON(countries, { style: { color: '#c4d1c9', weight: 1, fillColor: '#e0e6db', fillOpacity: 1 } }).addTo(m);
      m.attributionControl.addAttribution('Natural Earth · CLAP 2020');
      const labels = [{ n: 'VIET NAM', lat: 19, lon: 106 }, { n: 'THAILAND', lat: 16, lon: 99 }, { n: 'CAMBODIA', lat: 12.5, lon: 104.6 }, { n: 'MALAYSIA', lat: 4, lon: 102 }, { n: 'INDONESIA', lat: -4, lon: 115 }, { n: 'PHILIPPINES', lat: 14, lon: 124 }, { n: 'MYANMAR', lat: 22, lon: 95 }, { n: 'LAOS', lat: 21, lon: 102 }];
      labels.forEach(p => L.marker([p.lat, p.lon], { interactive: false, icon: L.divIcon({ className: 'country-label', html: p.n, iconSize: [110, 15] }) }).addTo(m));
    } else {
      const R = 6378137, toLL = (x, y) => [180 / Math.PI * (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2), x / R * 180 / Math.PI];
      const imageBounds = [toLL(11649180.043849297, 949705.7066938115), toLL(11755742.895436464, 1101938.3518183357)];
      L.imageOverlay('/assets/ca-mau.jpg', imageBounds, { attribution: credits }).addTo(m);
      m.setView([9.24, 105.04], 10);
      m.setMaxBounds(L.latLngBounds(imageBounds).pad(.4));
    }
    dynamic.current = L.layerGroup().addTo(m);
    const resize = new ResizeObserver(() => m.invalidateSize());
    resize.observe(el.current);
    return () => { resize.disconnect(); m.remove(); };
  }, [regional, countries]);
  useEffect(() => {
    const group = dynamic.current; if (!group) return;
    group.clearLayers();
    if (regional) {
      data.provinces.filter(p => p.km2 > 0).forEach(p => {
        const active = key(p) === key(province);
        L.circleMarker([p.lat, p.lon], { radius: active ? 13 : Math.max(3, Math.min(11, Math.sqrt(p.km2) / 2.5)), color: active ? '#fff' : '#4a9295', weight: active ? 3 : 1, fillColor: active ? '#1b6266' : '#6b9fa4', fillOpacity: active ? 1 : .35 }).bindTooltip(`${p.province} · ${number(p.km2, 1)} km²`).on('click', () => onProvince(p)).addTo(group);
      });
    } else {
      if (layer) rows.forEach(c => {
        const active = c.id === selected?.id, s = .02;
        L.rectangle([[c.lat - s, c.lon - s], [c.lat + s, c.lon + s]], { color: active ? '#ecf7bb' : c.delta >= 0 ? '#73c5e6' : '#edab80', weight: active ? 3 : .75, fillOpacity: active ? .4 : .1 }).on('click', () => onSelect(c)).addTo(group);
      });
      const markers = route.length ? route : [...rows].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 5);
      if (route.length > 1) L.polyline(route.map(c => [c.lat, c.lon]), { color: '#e3f4b2', weight: 3, dashArray: '8 10' }).addTo(group);
      markers.forEach((c, i) => L.marker([c.lat, c.lon], { icon: L.divIcon({ className: '', html: `<span class="map-pin ${c.id === selected?.id ? 'active' : ''}">${i + 1}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] }) }).on('click', () => onSelect(c)).addTo(group));
    }
  }, [data, regional, province, rows, selected, route, layer, onProvince, onSelect]);
  useEffect(() => {
    if (focus && selected && map.current) map.current.flyTo([selected.lat, selected.lon], 11, { duration: .6 });
  }, [selected?.id, focus]);
  return <div className={`map ${regional ? 'regional-map' : 'satellite-map'}`} ref={el} aria-label={regional ? 'Interactive Southeast Asia pond map' : 'Interactive Cà Mau water change map'} />;
}

function Globe() {
  const holder = useRef(null);
  useEffect(() => {
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true }); } catch { return; }
    const node = holder.current, scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(37, 1, .1, 100);
    camera.position.z = 4.3;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); node.appendChild(renderer.domElement);
    const texture = new THREE.TextureLoader().load('/assets/earth.jpg'); texture.colorSpace = THREE.SRGBColorSpace;
    const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 64), new THREE.MeshPhongMaterial({ map: texture, shininess: 8 }));
    earth.rotation.y = -1.45; earth.rotation.z = .15; scene.add(earth);
    scene.add(new THREE.AmbientLight(0xcbe2e8, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2.5); sun.position.set(-3, 3, 5); scene.add(sun);
    const orbit = new THREE.Group();
    [1.28, 1.52].forEach((radius, i) => {
      const curve = new THREE.EllipseCurve(0, 0, radius, radius);
      const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(curve.getPoints(120)), new THREE.LineBasicMaterial({ color: 0x719e99, transparent: true, opacity: .4 }));
      line.rotation.x = .9 + i * .3; line.rotation.y = -.3; orbit.add(line);
      const sat = new THREE.Mesh(new THREE.OctahedronGeometry(.055), new THREE.MeshBasicMaterial({ color: i ? 0xc2d9a1 : 0x7fdbdd })); sat.position.set(radius, 0, 0); orbit.add(sat);
    });
    scene.add(orbit);
    const resize = new ResizeObserver(() => { const w = node.clientWidth, h = node.clientHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }); resize.observe(node);
    let frame, dragging = false, last = 0;
    const down = e => { dragging = true; last = e.clientX; };
    const move = e => { if (dragging) { earth.rotation.y += (e.clientX - last) * .006; last = e.clientX; } };
    const up = () => { dragging = false; };
    node.addEventListener('pointerdown', down); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function render() { frame = requestAnimationFrame(render); if (!dragging && !reduced) { earth.rotation.y += .0008; orbit.rotation.y += .0015; } renderer.render(scene, camera); } render();
    return () => { cancelAnimationFrame(frame); resize.disconnect(); node.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); texture.dispose(); scene.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); renderer.dispose(); renderer.domElement.remove(); };
  }, []);
  return <div ref={holder} className="globe-canvas" role="img" aria-label="Rotating Earth with satellite orbits; drag to rotate" />;
}

function App({ data, countries, news }) {
  const pilot = data.provinces.find(p => key(p) === CAMAU);
  const [view, setView] = useState(['explore', 'detail', 'admin', 'plan'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'explore');
  const [province, setProvince] = useState(pilot), [query, setQuery] = useState(''), [country, setCountry] = useState('All countries');
  const [month, setMonth] = useState(11), [filter, setFilter] = useState('all'), [layer, setLayer] = useState(true), [selected, setSelected] = useState(null);
  const [routeIds, setRouteIds] = useState(() => { try { const saved = JSON.parse(localStorage.getItem('aquaeye-route') || '[]'); return Array.isArray(saved) ? [...new Set(saved.filter(Number.isInteger))] : []; } catch { return []; } });
  const [toast, setToast] = useState(''), [sources, setSources] = useState(false);
  const cells = data.cells[CAMAU], monthly = data.mon[CAMAU];
  const allRows = cells.cells.map((c, id) => ({ ...c, id, delta: isFiniteNumber(c.v[month]) && isFiniteNumber(c.v[month - 1]) ? c.v[month] - c.v[month - 1] : null })).filter(c => c.pn > 0 && c.d !== 'offshore' && isFiniteNumber(c.delta));
  const rows = allRows.filter(c => filter === 'all' || (filter === 'gain' ? c.delta >= 0 : c.delta < 0));
  const top = [...rows].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 5);
  const route = routeIds.map(id => allRows.find(c => c.id === id)).filter(Boolean);
  const active = (view === 'plan' ? allRows : rows).find(c => c.id === selected?.id) || (view === 'plan' ? route[0] : null) || top[0];
  const provinces = [...data.provinces].filter(p => (country === 'All countries' || p.country === country) && `${p.province} ${p.country}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.km2 - a.km2);
  const go = next => { setView(next); location.hash = next; window.scrollTo(0, 0); };
  useEffect(() => { const fn = () => setView(['explore', 'detail', 'admin', 'plan'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'explore'); window.addEventListener('hashchange', fn); return () => window.removeEventListener('hashchange', fn); }, []);
  useEffect(() => { try { localStorage.setItem('aquaeye-route', JSON.stringify(routeIds)); } catch { /* Private browsing may disable device storage. */ } }, [routeIds]);
  useEffect(() => {
    if (!sources) return;
    const previous = document.activeElement;
    const handle = e => {
      if (e.key === 'Escape') setSources(false);
      if (e.key === 'Tab') {
        const elements = document.querySelector('.modal')?.querySelectorAll('button, a[href]');
        if (!elements?.length) return;
        const first = elements[0], last = elements[elements.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handle);
    return () => { document.removeEventListener('keydown', handle); previous?.focus(); };
  }, [sources]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3500); return () => clearTimeout(timer); }, [toast]);
  const add = c => { if (!routeIds.includes(c.id)) setRouteIds([...routeIds, c.id]); setToast(`${c.d} added to inspection plan`); };
  const detail = p => { setProvince(p); go('detail'); };
  const exportCSV = () => {
    const quote = s => `"${String(s).replaceAll('"', '""')}"`;
    const csv = [['stop', 'district', 'latitude', 'longitude', 'water_change_km2', 'from_month', 'to_month', 'review_area', 'source'], ...route.map((c, i) => [i + 1, c.d, c.lat, c.lon, c.delta.toFixed(3), cells.months[month - 1], cells.months[month], '4.4 km grid; not an individual pond', 'Sentinel-1 reference snapshot'])].map(row => row.map(quote).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })), a = document.createElement('a'); a.href = url; a.download = `aquaeye-inspection-${cells.months[month]}.csv`; a.click(); URL.revokeObjectURL(url); setToast('Inspection plan exported');
  };
  const swap = (i, direction) => { const ids = [...routeIds]; [ids[i], ids[i + direction]] = [ids[i + direction], ids[i]]; setRouteIds(ids); };
  const pilotView = key(province) === CAMAU;
  const totalPonds = data.provinces.reduce((s, p) => s + p.n, 0);
  const articles = news.regions[key(province)]?.articles || [];
  return <div className="app">
    <aside className="sidebar">
      <button className="brand" onClick={() => go('explore')} aria-label="AquaEye home"><span className="brand-mark"><Waves size={25} /></span><span>Aqua<span className="brand-light">Eye</span><small>AQUACULTURE INTELLIGENCE</small></span></button>
      <div className="workspace-tag"><span className="live-dot" /> ASEAN workspace <ChevronDown size={14} /></div>
      <div className="nav-label">WORKSPACE</div>
      <nav>{[{ id: 'explore', icon: Globe2, label: 'Regional overview' }, { id: 'detail', icon: Layers, label: 'Monitoring workspace' }, { id: 'plan', icon: Route, label: 'Inspection planner' }, { id: 'admin', icon: LayoutDashboard, label: 'Data & satellites' }].map(({ id, icon: Icon, label }) => <button key={id} className={`nav-item ${view === id ? 'selected' : ''}`} onClick={() => { if (id === 'detail') setProvince(pilot); go(id); }}><Icon size={18} /><span>{label}</span>{id === 'plan' && route.length > 0 && <b className="count">{route.length}</b>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="mission"><div className="mission-icon"><Droplets size={20} /></div><strong>A clearer view.<br />A healthier coast.</strong><p>From satellite observations<br />to informed field action.</p></div><button className="source-link" onClick={() => setSources(true)}><Settings2 size={16} /> Data sources & methodology <ArrowUpRight size={14} /></button><div className="profile"><span className="avatar">AE</span><div><strong>Research workspace</strong><small>ASEAN Data Science Explorers</small></div><span className="online-dot" /></div></div>
    </aside>
    <main>
      <header className="topbar"><div className="breadcrumb">Workspace <ChevronRight size={13} /><span>{{ explore: 'Regional overview', detail: province.province, admin: 'Data & satellites', plan: 'Inspection planner' }[view]}</span></div><div className="top-right"><span className="snapshot"><span className="live-dot" /> Research snapshot</span><span className="date">Observations · Aug 2026</span><span className="avatar small">AE</span></div></header>
      <div className="page">
        {view === 'explore' && <>
          <div className="page-heading"><div><div className="eyebrow">CONNECTED WATERS. INFORMED DECISIONS.</div><h1>A new perspective on aquaculture.</h1><p>Explore Southeast Asia’s coastal ponds. See where a closer look matters.</p></div><button className="button dark" onClick={() => detail(pilot)}>Open Cà Mau workspace <ArrowUpRight size={16} /></button></div>
          <div className="overview-stats"><Stat label="PROVINCES MAPPED" value={data.provinces.length} suffix="across Southeast Asia" icon={Globe2} /><Stat label="COASTAL PONDS" value={number(totalPonds)} suffix="CLAP pond inventory · 2020" icon={Waves} /><Stat label="MAPPED POND AREA" value={number(data.provinces.reduce((s, p) => s + p.km2, 0))} unit="km²" suffix="Province-matched inventory" icon={Layers} /><Stat label="OBSERVATION RESOLUTION" value="10" unit="m" suffix="Sentinel-1 · Cà Mau pilot" icon={Satellite} /></div>
          <div className="overview-layout"><section className="map-card"><div className="map-heading"><div><span className="live-dot" /><strong>Across the region</strong><span className="tag subtle">131 provinces</span></div><span className="muted">Select a point to explore</span></div><div className="region-map-wrap"><MapView data={data} countries={countries} regional province={province} onProvince={setProvince} /><div className="map-coordinate">SOUTHEAST ASIA <span>08° N · 111° E</span></div><div className="sea-label">SOUTH CHINA<br />SEA</div><div className="map-info"><div className="eyebrow">SELECTED PROVINCE</div><h3>{province.province}<span>{province.country}</span></h3><div className="map-info-stats"><div><strong>{number(province.km2, 1)} <small>km²</small></strong><span>Mapped pond area</span></div><div><strong>{number(province.n)}</strong><span>Recorded ponds</span></div></div><button onClick={() => detail(province)}>Explore province <ArrowRight size={16} /></button></div><div className="map-key"><i /> Pond area by province <span>Small</span><b /><b /><b /><span>Large</span></div></div></section>
          <section className="province-card"><div className="section-heading"><h2>Find your region</h2><Compass size={19} /></div><p className="muted">The next insight starts with a place.</p><label className="search"><Search size={16} /><input aria-label="Search provinces" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search a province or country" />{query && <button aria-label="Clear search" onClick={() => setQuery('')}><X size={14} /></button>}</label><select aria-label="Filter country" value={country} onChange={e => setCountry(e.target.value)}><option>All countries</option>{[...new Set(data.provinces.map(p => p.country))].sort().map(c => <option key={c}>{c}</option>)}</select><div className="list-header"><span>{provinces.length} PROVINCES</span><span>POND AREA</span></div><div className="province-list">{provinces.map((p, i) => <button key={key(p)} className={`province-row ${key(province) === key(p) ? 'active' : ''}`} onClick={() => setProvince(p)} onDoubleClick={() => detail(p)}><span className="region-index">{String(i + 1).padStart(2, '0')}</span><span className="region-name"><strong>{p.province}</strong><small>{p.country}</small></span><span className="region-value">{number(p.km2, 1)}<small>km²</small></span><ChevronRight size={14} /></button>)}{!provinces.length && <div className="empty">No provinces match your search.</div>}</div><div className="inventory-note"><span className="live-dot" /> Pond inventory · CLAP 2020</div></section></div>
          <div className="insight-banner"><span className="insight-symbol"><Satellite size={24} /></span><div><strong>Small changes on the water. A bigger picture from above.</strong><p>Our Cà Mau pilot compares monthly radar observations to help prioritize field inspections.</p></div><button className="text-button" onClick={() => detail(pilot)}>Explore the pilot <ArrowRight size={17} /></button></div>
        </>}
        {view === 'detail' && <>
          <div className="page-heading"><div><button className="back-link" onClick={() => go('explore')}><ArrowLeft size={13} /> Regional overview</button><h1>{province.province}<span className="heading-country">{province.country}</span><span className="tag">{pilotView ? 'PILOT REGION' : 'REGIONAL INVENTORY'}</span></h1><p>{pilotView ? 'A closer look at changing waters. A clearer path to field action.' : 'Explore the mapped coastal pond inventory and its historical context.'}</p></div>{pilotView && <select className="month-select" aria-label="Observation month" value={month} onChange={e => { setMonth(+e.target.value); setSelected(null); }}>{cells.months.map((m, i) => i > 0 && <option key={m} value={i}>{monthLabel(m)}</option>)}</select>}</div>
          {pilotView ? <><div className="detail-layout"><section className="monitor-card"><div className="dark-toolbar"><span><Satellite size={16} /> Satellite workspace</span><button className={layer ? 'layer-toggle active' : 'layer-toggle'} onClick={() => setLayer(!layer)} aria-pressed={layer}><Layers size={13} /> Water change</button></div><div className="monitor-content"><div className="detail-map-wrap"><MapView data={data} countries={countries} rows={rows} selected={active} onSelect={setSelected} layer={layer} focus /><div className="sat-badge"><span className="live-dot" /> SENTINEL-1 <span>10 m observations</span></div><div className="sat-legend"><span><i className="water-gain" /> Water gained</span><span><i className="water-loss" /> Water lost</span></div></div><div className="candidate-rail"><div className="section-heading"><h3>Where to look</h3><span className="tag">TOP 5</span></div><p>Largest observed water changes</p><div className="segmented">{[['all', 'All'], ['gain', 'Gained'], ['loss', 'Lost']].map(([id, text]) => <button className={filter === id ? 'active' : ''} key={id} onClick={() => { setFilter(id); setSelected(null); }}>{text}</button>)}</div>{top.map((c, i) => <button key={c.id} className={`candidate-row ${active?.id === c.id ? 'active' : ''}`} onClick={() => setSelected(c)}><span className="candidate-number">{i + 1}</span><span><strong>{c.d}</strong><small>{c.lat.toFixed(3)}° N · {c.lon.toFixed(3)}° E</small></span><b className={c.delta < 0 ? 'loss' : 'gain'}>{signed(c.delta)}<small>km²</small></b></button>)}{active && <div className="selected-area"><div className="eyebrow">SELECTED REVIEW AREA</div><strong>{active.d}</strong><p>{active.delta < 0 ? 'Check for planned drainage or harvest before arranging a pond inspection.' : 'Check for refilling or seasonal flooding before arranging a pond inspection.'}</p><button className="button dark" onClick={() => add(active)}>{routeIds.includes(active.id) ? <Check size={15} /> : <Plus size={15} />}{routeIds.includes(active.id) ? 'Added to plan' : 'Add to inspection plan'}</button></div>}</div></div><div className="map-footnote">Imagery provides context · Review cells ≈ 4.4 × 4.4 km <span>{monthLabel(cells.months[month - 1])} → {monthLabel(cells.months[month])}</span></div></section>
          <div className="analytics-rail"><section className="card water-card"><div className="eyebrow">WATER IN POND AREAS <Waves size={16} /></div><div className="metric-large">{number(monthly.p[month], 1)}<span>km²</span></div><div className="metric-trend"><span>{signed((monthly.p[month] - monthly.p[month - 1]) / monthly.p[month - 1] * 100, 1)}%</span> vs. previous month</div><Sparkline values={monthly.p.slice(0, month + 1)} area labels={month === 11} /><div className="card-note">Monthly surface water · Sentinel-1</div></section><section className="card"><div className="eyebrow">AT A GLANCE</div><div className="mini-metrics"><div><span>Areas with more water</span><strong className="gain">{allRows.filter(c => c.delta > 0).length}<ArrowUpRight size={18} /></strong></div><div><span>Areas with less water</span><strong className="loss">{allRows.filter(c => c.delta < 0).length}<ArrowDown size={18} /></strong></div><div><span>Satellite scenes</span><strong>{monthly.img[month]}<Satellite size={18} /></strong></div></div></section><section className="context-callout"><span className="insight-symbol"><Droplets size={18} /></span><div><strong>A signal to investigate</strong><p>Water change guides field checks. It does not establish pond health or disease.</p></div></section></div></div>
          <div className="bottom-grid"><section className="card district-card"><div className="section-heading"><div><div className="eyebrow">THE LOCAL PICTURE</div><h2>Water change by district</h2></div><span className="tag subtle">km²</span></div><DistrictChart rows={allRows} /></section><section className="card news-card"><div className="section-heading"><div><div className="eyebrow">FROM THE REGION</div><h2>Coastal dispatch</h2></div><ArrowUpRight size={18} /></div><News articles={articles} /></section><section className="pond-card"><img src="/assets/ponds.jpg" alt="Sentinel-2 satellite view of aquaculture ponds in Bạc Liêu" /><div><span className="eyebrow">THE PONDS BEHIND THE PIXELS</span><h2>Every pond is part<br />of a bigger picture.</h2><span>Sentinel-2 · Bạc Liêu</span></div></section></div></> : <><div className="overview-stats"><Stat label="MAPPED POND AREA" value={number(province.km2, 1)} unit="km²" icon={Waves} suffix="CLAP 2020" /><Stat label="RECORDED PONDS" value={number(province.n)} icon={Layers} suffix="Province-matched inventory" /><Stat label="PONDS UNDER 0.2 HA" value={number(province.small, 1)} unit="%" icon={Droplets} suffix="Share of recorded ponds" /></div><div className="bottom-grid regional-details"><section className="card"><h2>Mapped pond area</h2><Sparkline values={province.traj} area /><div className="axis">{data.epochs.map(y => <span key={y}>{y}</span>)}</div><p className="muted">CLAP inventory, km² · Missing epochs are left unconnected.</p></section><section className="card"><h2>Monthly monitoring</h2><p className="muted">Monthly grid observations are currently available for the Cà Mau pilot.</p><button className="button dark" onClick={() => detail(pilot)}>Open Cà Mau pilot <ArrowRight size={15} /></button></section><section className="card"><h2>Coastal dispatch</h2><News articles={articles} /></section></div></>}
        </>}
        {view === 'admin' && <>
          <div className="page-heading"><div><div className="eyebrow">THE SCIENCE BEHIND THE SIGNAL</div><h1>One planet. A connected perspective.</h1><p>Explore the observations and inventories that power your workspace.</p></div><button className="button dark" onClick={() => go('plan')}>Plan an inspection <ArrowRight size={16} /></button></div>
          <section className="orbit-card"><div className="orbit-copy"><span className="tag">EARTH OBSERVATION NETWORK</span><h2>A wider view.<br /><em>A closer understanding.</em></h2><p>Radar observations, historical water records, and coastal pond inventories — brought together for informed decisions.</p><div className="orbit-stat"><strong>3</strong><span>complementary<br />geospatial sources</span><strong>10 m</strong><span>radar observation<br />resolution</span></div><button className="button light" onClick={() => detail(pilot)}>Explore satellite workspace <ArrowUpRight size={16} /></button></div><div className="globe-wrap"><Globe /><span className="sat-label sentinel"><Satellite size={16} /> Sentinel-1 <i /></span><span className="sat-label landsat"><Satellite size={16} /> Landsat / JRC <i /></span><span className="globe-instruction">DRAG TO EXPLORE THE EARTH</span></div></section>
          <div className="section-heading sources-title"><h2>Your data constellation</h2><span className="muted">Reference snapshot · Built {data.built}</span></div><div className="source-grid">{[{ icon: Satellite, name: 'Sentinel-1', category: 'RADAR OBSERVATIONS', value: '10', unit: 'm', copy: 'Monthly surface water in the Cà Mau pilot.', values: monthly.img, foot: 'Sep 2025 – Aug 2026 · scene count' }, { icon: Waves, name: 'CLAP', category: 'COASTAL POND INVENTORY', value: number(totalPonds), copy: 'Geolocated ponds across the region.', values: data.epochs.map((_, i) => data.provinces.reduce((s, p) => s + (p.traj[i] || 0), 0)), foot: '1990 / 2000 / 2010 / 2020 · pond area' }, { icon: Globe2, name: 'JRC Global Surface Water', category: 'HISTORICAL WATER RECORD', value: '23', unit: 'years', copy: 'Long-term context for changes on the coast.', values: data.gsw[CAMAU], foot: '1999 – 2021 · Cà Mau water area' }, { icon: Layers, name: 'Regional coverage', category: 'PROVINCE INVENTORY', value: data.provinces.length, unit: 'provinces', copy: 'Recorded pond area across Southeast Asia.', values: [...data.provinces].sort((a, b) => b.km2 - a.km2).slice(0, 12).map(p => p.km2), foot: 'Top 12 provinces · ranked pond area' }].map(s => <section key={s.name} className="card source-card"><div className="source-icon"><s.icon size={21} /></div><div className="eyebrow">{s.category}</div><h2>{s.name}</h2><div className="source-value">{s.value} <span>{s.unit}</span></div><p>{s.copy}</p><Sparkline values={s.values} /><div className="card-note">{s.foot}</div></section>)}</div>
        </>}
        {view === 'plan' && <>
          <div className="page-heading"><div><div className="eyebrow">FROM OBSERVATION TO ACTION</div><h1>Make the next visit count.</h1><p>Build a field inspection itinerary from the areas you want to understand.</p></div><button className="button dark" disabled={!route.length} onClick={exportCSV}><Download size={16} /> Export CSV</button></div>
          <div className="plan-summary"><span><MapPin size={17} /> Cà Mau, Viet Nam</span><span><Route size={17} /> {route.length} inspection stops</span><span><Satellite size={17} /> {monthLabel(cells.months[month])} observations</span><span className="tag subtle">SAVED ON THIS DEVICE</span></div>
          <div className="plan-layout"><section className="monitor-card"><div className="dark-toolbar"><span><Route size={16} /> Inspection itinerary</span><span>Straight-line connections</span></div><div className="plan-map"><MapView data={data} countries={countries} rows={allRows} selected={active} onSelect={setSelected} route={route} layer={layer} focus /><div className="sat-badge"><MapPin size={13} /> CÀ MAU FIELD WORKSPACE</div></div><div className="map-footnote">Connections show visit order; verify roads and boat access before travel.</div></section><section className="card itinerary"><div className="section-heading"><h2>Your visit list</h2><span className="tag">{route.length} stops</span></div><p className="muted">Reorder the stops to fit your field day.</p>{!route.length ? <div className="empty-plan"><Route size={38} /><h3>A good plan starts with a closer look.</h3><p>Add review areas from the monitoring workspace, or start with the five largest water changes.</p><button className="button dark" onClick={() => { setRouteIds(top.map(c => c.id)); setToast('Five priority areas added'); }}>Add top 5 candidates <Plus size={15} /></button></div> : <div className="stop-list">{route.map((c, i) => <div key={c.id} className={`stop ${active?.id === c.id ? 'active' : ''}`}><button className="stop-number" onClick={() => setSelected(c)} aria-label={`Show stop ${i + 1} on map`}>{i + 1}</button><div className="stop-info"><strong>{c.d}</strong><small>{c.lat.toFixed(4)}° N · {c.lon.toFixed(4)}° E</small><span className={c.delta >= 0 ? 'gain' : 'loss'}>{signed(c.delta)} km² water change</span></div><div className="stop-controls"><button disabled={i === 0} aria-label={`Move stop ${i + 1} up`} onClick={() => swap(i, -1)}><ArrowUp size={13} /></button><button disabled={i === route.length - 1} aria-label={`Move stop ${i + 1} down`} onClick={() => swap(i, 1)}><ArrowDown size={13} /></button><button aria-label={`Remove stop ${i + 1}`} onClick={() => setRouteIds(routeIds.filter(id => id !== c.id))}><X size={13} /></button></div></div>)}</div>}<button className="button outline full" onClick={() => detail(pilot)}><Plus size={16} /> Add areas from the map</button><div className="planner-note"><strong>Bring the right context.</strong><p>Each export includes coordinates, observation months and measured water change for your field team.</p></div></section></div>
        </>}
        <footer><span><Waves size={14} /> AquaEye <span className="footer-divider">/</span> See change. Inform action.</span><button onClick={() => setSources(true)}>Sources & methodology <ArrowUpRight size={12} /></button></footer>
      </div>
    </main>
    {toast && <div className="toast" role="status"><Check size={17} />{toast}</div>}
    {sources && <div className="modal-backdrop" onClick={() => setSources(false)}><section className="modal card" role="dialog" aria-modal="true" aria-label="Sources and methodology" onClick={e => e.stopPropagation()}><div className="section-heading"><h2>Sources & methodology</h2><button autoFocus aria-label="Close sources" onClick={() => setSources(false)}><X size={20} /></button></div><p>This workspace uses the checked-in research snapshot built on <strong>{data.built}</strong>. The latest radar observations are from <strong>{data.newest}</strong>.</p><ul><li><strong>Sentinel-1:</strong> 10 m monthly surface-water observations. Review grids are about 4.4 × 4.4 km and overlap the pond inventory.</li><li><strong>CLAP:</strong> 1990–2020 coastal pond inventory. Province boundaries predate Viet Nam’s 2025 mergers. Source licence is unspecified in the reference archive.</li><li><strong>JRC Global Surface Water:</strong> 1999–2021 historical context. Earlier local coverage is insufficient.</li><li><strong>Maps:</strong> Natural Earth outlines; Esri, Vantor, Earthstar Geographics and GIS User Community imagery. Earth texture from Three.js examples.</li><li><strong>News:</strong> Saved regional articles from the reference archive; not a live feed.</li></ul><p>Changes in water are inspection signals, not disease diagnoses. Route lines show visit order, not navigable driving or boat directions.</p><a href="/data/provenance.json" target="_blank" rel="noreferrer" className="text-button">View snapshot provenance <ArrowUpRight size={14} /></a></section></div>}
  </div>;
}
function Stat({ label, value, unit, suffix, icon: Icon }) { return <div className="stat"><div className="stat-top">{label}<Icon size={17} /></div><div className="stat-value">{value}<span>{unit}</span></div><p>{suffix}</p></div>; }
function News({ articles }) { return articles.length ? <div className="news-list">{articles.slice(0, 3).map(a => <a key={a.url} href={a.url} target="_blank" rel="noreferrer"><span>{a.source} <i /> {new Date(a.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}</span><strong>{a.title}<ArrowUpRight size={15} /></strong></a>)}</div> : <p className="muted">No archived regional articles are available for this province.</p>; }
function DistrictChart({ rows }) {
  const sums = new Map(); rows.forEach(c => sums.set(c.d, (sums.get(c.d) || 0) + c.delta));
  const vals = [...sums].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 6), max = Math.max(...vals.map(([, n]) => Math.abs(n)), .01);
  return <div className="district-chart">{vals.map(([name, n]) => <div className="district-row" key={name}><span>{name}</span><div className="bar-track"><i style={{ width: `${Math.abs(n) / max * 48}%`, left: n >= 0 ? '50%' : `${50 - Math.abs(n) / max * 48}%`, background: n >= 0 ? '#6b9990' : '#d6a180' }} /></div><strong className={n >= 0 ? 'gain' : 'loss'}>{signed(n, 1)}</strong></div>)}<div className="district-caption">Less water <span>0</span> More water</div></div>;
}
Promise.all(['/data/observations.json', '/data/countries.json', '/data/news.json'].map(url => fetch(url).then(r => { if (!r.ok) throw new Error(`Unable to load ${url}`); return r.json(); }))).then(([data, countries, news]) => createRoot(document.getElementById('root')).render(<App data={data} countries={countries} news={news} />)).catch(() => { document.getElementById('root').innerHTML = '<div style="padding:48px;font-family:system-ui"><h1>AquaEye</h1><p>The research snapshot could not be loaded. Please reload the page.</p><button onclick="location.reload()">Reload</button></div>'; });
