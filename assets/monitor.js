/* Georeferenced satellite context + measured monthly review areas. No risk scores. */
window.AquaEyeMonitor = (() => {
  const extent={xmin:11649180.043849297,ymin:949705.7066938115,xmax:11755742.895436464,ymax:1101938.3518183357};
  const IW=1400,IH=2000,R=6378137;
  const $=s=>document.querySelector(s);
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const format=(n,d=2)=>n.toLocaleString('en-GB',{minimumFractionDigits:d,maximumFractionDigits:d});
  const date=m=>new Date(m+'-15T12:00:00Z').toLocaleDateString('en-GB',{month:'short',year:'numeric',timeZone:'UTC'});
  const point=(lon,lat)=>[(R*lon*Math.PI/180-extent.xmin)/(extent.xmax-extent.xmin)*IW,
    (extent.ymax-R*Math.log(Math.tan(Math.PI/4+lat*Math.PI/360)))/(extent.ymax-extent.ymin)*IH];
  let C,P,month=null,filter='all',selected=null,showLayer=true,view=null,rows=[],top=[];
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  const sign=n=>(n>=0?'+':'−')+format(Math.abs(n));
  function candidates(){
    rows=C.cells.map((c,i)=>({c,i,a:c.v[month-1],b:c.v[month],delta:finite(c.v[month-1])&&finite(c.v[month])?c.v[month]-c.v[month-1]:null}))
      .filter(x=>x.c.pn>0&&x.c.d!=='offshore'&&finite(x.delta));
    top=rows.filter(x=>filter==='all'||(filter==='loss'?x.delta<0:x.delta>0))
      .sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)||a.i-b.i).slice(0,5);
    if(!top.some(x=>x.i===selected))selected=top[0]?.i??null;
  }
  function why(row){return row.delta<0?'Confirm whether harvest or planned drainage explains the loss of water. If not, arrange a pond inspection.':'Confirm whether refilling or seasonal flooding explains the added water. If not, arrange a pond inspection.';}
  function fit(province=false){
    const box=$('#satMap').getBoundingClientRect(),ratio=box.width/box.height;
    const coords=(province?rows:top).map(x=>point(x.c.lon,x.c.lat));
    if(!coords.length)return;
    const xs=coords.map(p=>p[0]),ys=coords.map(p=>p[1]);
    const cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
    const h=province?Math.max(Math.max(...ys)-Math.min(...ys)+150,(Math.max(...xs)-Math.min(...xs)+150)/ratio):Math.max(670,(Math.max(...ys)-Math.min(...ys)+260),(Math.max(...xs)-Math.min(...xs)+260)/ratio);
    view={x:cx-h*ratio/2,y:cy-h/2,w:h*ratio,h};
  }
  function map(){
    if(!view)fit();
    if(!view)return;
    const px=view.w/Math.max(1,$('#satMap').clientWidth), markerR=12*px;
    const shape=rows.map(row=>{
      const {c,i,delta}=row,s=C.step/2,a=point(c.lon-s,c.lat+s),b=point(c.lon+s,c.lat-s),active=i===selected;
      const color=delta<0?'#ef875e':'#4298f0';
      return `<rect class="monitor-cell" data-area="${i}" tabindex="${showLayer?0:-1}" role="button" aria-label="${escape(c.d)}, water change ${sign(delta)} square kilometres" x="${a[0]}" y="${a[1]}" width="${b[0]-a[0]}" height="${b[1]-a[1]}" fill="${color}" fill-opacity="${active?.45:.12}" stroke="${active?'#eeffc3':color}" stroke-opacity="${active?1:.7}" stroke-width="${active?2.5:.7}"><title>${escape(c.d)} · ${sign(delta)} km²</title></rect>`;
    }).join('');
    const markers=top.map((row,idx)=>{
      const [x,y]=point(row.c.lon,row.c.lat),active=row.i===selected;
      return `<g class="monitor-marker" data-area="${row.i}" tabindex="0" role="button" aria-label="Priority ${idx+1}: ${escape(row.c.d)}" transform="translate(${x} ${y})"><circle r="${markerR+4*px}" fill="#102e3b" fill-opacity=".55"/><circle r="${markerR}" fill="${active?'#dff59a':'#163c4b'}" stroke="#e9f5d2" stroke-width="${1.4*px}"/><text y="${4*px}" font-family="system-ui" font-size="${11*px}" font-weight="700" text-anchor="middle" fill="${active?'#153645':'white'}">${idx+1}</text></g>`;
    }).join('');
    $('#satMap').innerHTML=`<svg viewBox="${view.x} ${view.y} ${view.w} ${view.h}" preserveAspectRatio="xMidYMid meet" aria-label="Cà Mau satellite basemap with measured water changes and five inspection candidates"><image href="assets/ca-mau-monitor-basemap.jpg" width="${IW}" height="${IH}"/><g style="display:${showLayer?'':'none'}">${shape}</g>${markers}</svg>`;
    $('#satMap').querySelectorAll('[data-area]').forEach(el=>{
      const choose=()=>select(+el.dataset.area);
      el.addEventListener('click',e=>{if(!moved){e.stopPropagation();choose();}});
      el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}});
    });
    $('#monitorLayer').setAttribute('aria-pressed',String(showLayer));
  }
  function select(i){selected=i;paintRail();map();}
  function paintRail(){
    $('#candidateList').innerHTML=top.map((row,idx)=>`<button class="candidate" data-candidate="${row.i}" aria-pressed="${selected===row.i}"><span class="number">${idx+1}</span><span><strong>${escape(row.c.d)}</strong><small>${format(row.c.lat,4)}°N · ${format(row.c.lon,4)}°E</small></span><span class="delta ${row.delta<0?'loss':''}">${sign(row.delta)}<small>km² water</small></span></button>`).join('')||'<p>No paired observations meet this filter.</p>';
    $('#candidateList').querySelectorAll('[data-candidate]').forEach(b=>b.onclick=()=>select(+b.dataset.candidate));
    const row=rows.find(x=>x.i===selected);
    $('#inspectionAction').innerHTML=row?`<h4>${escape(row.c.d)} · check the cause</h4><p class="coord">${format(row.a)} → ${format(row.b)} km² · ${date(C.months[month-1])} → ${date(C.months[month])}</p><p>${why(row)}</p><a href="https://www.google.com/maps/search/?api=1&query=${row.c.lat},${row.c.lon}" target="_blank" rel="noopener noreferrer">Open location ↗</a>`:'Choose an area to review its observation.';
    $('#monitorCount').textContent=String(top.length);
    $('#monitorRange').textContent=date(C.months[month-1])+' → '+date(C.months[month]);
    $('#monitorFilterLabel').textContent=filter==='all'?'Largest measured changes':filter==='loss'?'Largest water decreases':'Largest water increases';
    $('#monitorCopy').disabled=!top.length;$('#monitorCSV').disabled=!top.length;
  }
  function csv(){
    const fields=['rank','province','district','latitude','longitude','previous_month','observation_month','water_before_km2','water_after_km2','water_change_km2','review_area_size','next_action'];
    const data=top.map((x,i)=>[i+1,P.province,x.c.d,x.c.lat,x.c.lon,C.months[month-1],C.months[month],x.a,x.b,x.delta.toFixed(3),'approximately 4.4 km x 4.4 km',why(x)]);
    return '\ufeff'+[fields,...data].map(row=>row.map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(',')).join('\r\n');
  }
  function download(){
    const blob=new Blob([csv()],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='aquaeye-ca-mau-'+C.months[month]+'-inspection-plan.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    $('#monitorStatus').textContent='Saved '+top.length+' areas with coordinates and checks.';
  }
  let drag=null,moved=false;
  function bindPan(){
    const el=$('#satMap');
    el.onpointerdown=e=>{if(e.button!==0)return;drag={x:e.clientX,y:e.clientY,view:{...view}};moved=false;};
    el.onpointermove=e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)<4)return;moved=true;el.setPointerCapture(e.pointerId);view={...drag.view,x:drag.view.x-dx*drag.view.w/el.clientWidth,y:drag.view.y-dy*drag.view.h/el.clientHeight};$('#satMap svg').setAttribute('viewBox',`${view.x} ${view.y} ${view.w} ${view.h}`);};
    el.onpointerup=()=>{if(drag&&moved)map();drag=null;};el.onpointercancel=()=>{drag=null;};
    el.onwheel=e=>{if(e.ctrlKey){e.preventDefault();zoom(e.deltaY<0?.8:1.25);}};
  }
  function zoom(f){const h=Math.max(180,Math.min(2500,view.h*f)),w=h*view.w/view.h;view={x:view.x+(view.w-w)/2,y:view.y+(view.h-h)/2,w,h};map();}
  function render(p,c){
    if(!c)return;P=p;C=c;month=month==null?C.months.length-1:Math.max(1,Math.min(month,C.months.length-1));candidates();
    $('#mission').innerHTML=`<div class="missionTop"><div><h2>AquaEye · Cà Mau</h2><p>Satellite inspection map · monthly radar observations · ${rows.length} review areas</p></div><div class="missionPeriod"><label for="monitorMonth">Observation month</label><select id="monitorMonth">${C.months.slice(1).map((m,i)=>`<option value="${i+1}" ${i+1===month?'selected':''}>${date(m)}</option>`).join('')}</select></div></div>
      <div class="missionBody"><div class="missionMap"><div id="satMap"></div><div class="mapNorth"><b>↑</b>N</div><div class="mapTools"><button id="monitorLayer" aria-pressed="true">Water changes</button><button id="monitorOut" aria-label="Zoom out">−</button><button id="monitorIn" aria-label="Zoom in">+</button><button id="monitorFit">Province</button></div><div class="mapScope"><b id="monitorRange"></b>Each review area ≈ 4.4 km × 4.4 km</div><div class="mapLegend"><span><i class="gain"></i>More water</span><span><i class="loss"></i>Less water</span><span>① Inspection candidate</span></div><div class="mapCredit">Basemap: Esri, Vantor, Earthstar Geographics, GIS User Community · contextual imagery</div></div>
      <aside class="missionRail"><h3><span id="monitorCount">5</span> areas to check first</h3><p class="railIntro" id="monitorFilterLabel">Largest measured changes</p><div class="missionFilter">${[['all','All changes'],['loss','Water loss'],['gain','Water gain']].map(([v,t])=>`<button data-filter="${v}" aria-pressed="${filter===v}">${t}</button>`).join('')}</div><div id="candidateList"></div><div class="inspectionAction" id="inspectionAction"></div><div class="missionExport"><button class="missionAction" id="monitorCSV">Export visit list ↓</button><button class="missionAction" id="monitorCopy">Copy locations</button></div><p class="missionStatus" id="monitorStatus" role="status"></p></aside></div>
      <div class="missionBottom"><p><b>Water change → farm check → inspection.</b> Confirm harvesting, refilling or flooding with the farm.</p><p>Field observations establish pond health.</p></div>`;
    paintRail();map();bindPan();
    $('#monitorMonth').onchange=e=>{month=+e.target.value;selected=null;view=null;render(P,C);};
    $('.missionFilter').querySelectorAll('button').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;selected=null;view=null;render(P,C);});
    $('#monitorLayer').onclick=()=>{showLayer=!showLayer;map();};
    $('#monitorIn').onclick=()=>zoom(.8);$('#monitorOut').onclick=()=>zoom(1.25);$('#monitorFit').onclick=()=>{fit(true);map();};
    $('#monitorCSV').onclick=download;
    $('#monitorCopy').onclick=async()=>{
      const text=`AquaEye · Cà Mau inspection candidates · ${date(C.months[month])}\n`+top.map((x,i)=>`${i+1}. ${x.c.d}: ${x.c.lat}, ${x.c.lon} · water change ${sign(x.delta)} km² · ${why(x)}`).join('\n');
      try{await navigator.clipboard.writeText(text);$('#monitorStatus').textContent='Copied '+top.length+' locations and checks.';}catch{$('#monitorStatus').textContent='Copy unavailable. Download the visit list instead.';}
    };
  }
  return {render};
})();
