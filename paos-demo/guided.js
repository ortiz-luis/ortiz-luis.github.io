/* PAOS guided trainer: real sentence-aligned TTS, laser suggestions and manual calibration.
   No audio capture, no semantic voice grading, no network API calls. */
(()=>{
"use strict";
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const tm=v=>String(Math.floor(v/60)).padStart(2,"0")+":"+String(Math.floor(v%60)).padStart(2,"0");
let host=null,manifest=null,config=null,items=[],bound=false;
let capBox={x:.1,y:.74,w:.8,h:.22},editing=false,drag=null,settings=false,opacity=.78;
let s={slide:0,mode:"listen",captions:true,time:0,playing:false,calibrate:false,font:24,rate:1,laserMode:"auto",manualPoint:null,text:true,subtitleDelay:0,audio:null,timer:null,cue:0,undo:[]};
const DELAY_MIN=-.1,DELAY_MAX=.1,DELAY_STEP=.01;
function delayKey(){return "paos:"+config.slug+":subtitle-delay:"+manifest.slides[0].script_sha256}
function savedDelays(){try{const o=JSON.parse(localStorage.getItem(delayKey())||"{}");
 return o&&typeof o==="object"&&!Array.isArray(o)?o:{};}catch{return {}}}
function readDelay(index){const n=Number(savedDelays()[String(manifest.slides[index].number)]||0);
 return Number.isFinite(n)?Math.round(clamp(n,DELAY_MIN,DELAY_MAX)*100)/100:0;}
function saveDelay(value,all=false){
 const n=Math.round(clamp(Number(value),DELAY_MIN,DELAY_MAX)*100)/100;
 if(!Number.isFinite(n))return;
 const o=savedDelays();
 if(all)manifest.slides.forEach(x=>{o[String(x.number)]=n});
 else o[String(current().number)]=n;
 try{localStorage.setItem(delayKey(),JSON.stringify(o));}catch{}
 s.subtitleDelay=n;
 updateDelayDisplay();tick();
}
function subtitleClock(){return clamp(s.time-s.subtitleDelay*s.rate,0,current().seconds)}
function beforeSlide(index){let t=0;for(let i=0;i<index;i++)t+=manifest.slides[i].seconds;return t}
function presentationTotal(){return beforeSlide(manifest.slides.length)}
function presentationTime(){return beforeSlide(s.slide)+s.time}
function updateDelayDisplay(){
 const slider=host?.querySelector("#paos-delay");
 if(slider)slider.value=String(s.subtitleDelay);
 const label=host?.querySelector("#paos-delay-value");
 if(label)label.textContent=(s.subtitleDelay>0?"+":"")+Math.round(s.subtitleDelay*1000)+" ms";
 const explain=host?.querySelector("#paos-delay-direction");
 if(explain)explain.textContent=s.subtitleDelay>0?"Subtítulos después de la voz":
  s.subtitleDelay<0?"Subtítulos antes de la voz":"Audio y subtítulos sin corrección";
}
function current(){return manifest.slides[s.slide]}
function key(){return "paos:"+config.slug+":laser:"+manifest.slides[0].script_sha256}
function overrides(){try{let x=JSON.parse(localStorage.getItem(key())||"[]");return Array.isArray(x)?x:[]}catch{return[]}}
function store(arr){try{localStorage.setItem(key(),JSON.stringify(arr))}catch{}}
function alive(){return host&&host.querySelector("#paos-stage")}
function cueIndex(t){const cues=current().cues;for(let i=cues.length-1;i>=0;i--)if(cues[i].start<=t+.02)return i;return 0}
function imageRect(){
 const img=host.querySelector("#paos-img"),r=img.getBoundingClientRect();
 const scale=Math.min(r.width/(img.naturalWidth||r.width),r.height/(img.naturalHeight||r.height));
 const w=(img.naturalWidth||r.width)*scale,h=(img.naturalHeight||r.height)*scale;
 return {left:r.left+(r.width-w)/2,top:r.top+(r.height-h)/2,width:w,height:h};
}
function positionDot(dot,p){
 const r=imageRect(),stage=host.querySelector("#paos-stage").getBoundingClientRect();
 dot.style.left=(r.left-stage.left+p.x*r.width)+"px";
 dot.style.top=(r.top-stage.top+p.y*r.height)+"px";
}
function setLaserMode(mode){
 if(!["auto","manual","off"].includes(mode))return;
 s.laserMode=mode;s.manualPoint=null;
 host.querySelectorAll("[data-laser-mode]").forEach(el=>{el.value=mode});
 host.querySelector("#paos-stage").classList.toggle("paos-manual-laser",mode==="manual");
 tick();
}
function manualLaser(ev){
 if(!alive()||s.laserMode!=="manual")return;
 const r=imageRect(),x=(ev.clientX-r.left)/r.width,y=(ev.clientY-r.top)/r.height;
 s.manualPoint=x>=0&&x<=1&&y>=0&&y<=1?{x,y}:null;tick();
}
function laserSelect(id){
 return '<label class="paos-laser-select" for="'+id+'">Puntero láser <select id="'+id+'" data-laser-mode aria-label="Modo del puntero láser">'+
 [["off","Desactivado"],["auto","Automático"],["manual","Manual"]].map(([v,t])=>'<option value="'+v+'" '+(s.laserMode===v?"selected":"")+'>'+t+'</option>').join("")+'</select></label>';
}
function automaticPoint(points,t){
 const sorted=points.slice().sort((a,b)=>a.time-b.time);
 const i=sorted.findLastIndex(p=>p.time<=t);
 if(i<0)return null;
 const a=sorted[i],b=sorted[i+1];
 const end=a.end??(b?b.time:current().seconds);
 if(b&&b.time-end<=1.2&&t>=Math.max(a.time,b.time-.65)&&t<b.time){
  const start=Math.max(a.time,b.time-.65),u=clamp((t-start)/(b.time-start),0,1),v=u*u*(3-2*u);
  return {...a,x:a.x+(b.x-a.x)*v,y:a.y+(b.y-a.y)*v-.012*Math.sin(Math.PI*u)};
 }
 if(t>end)return null;
 return {...a,x:clamp(a.x+.0014*Math.sin(t*5.3),0,1),y:clamp(a.y+.0011*Math.sin(t*4.1),0,1)};
}
function capKey(){return "paos:"+config.slug+":caption-layout"}
function saveCap(){try{localStorage.setItem(capKey(),JSON.stringify({...capBox,opacity}))}catch{}}
function readCap(){try{const v=JSON.parse(localStorage.getItem(capKey()));if(v&&["x","y","w","h"].every(k=>Number.isFinite(v[k]))){capBox=v;opacity=clamp(v.opacity||.78,.2,1)}}catch{}}
let fitCache="";
function fitCap(){const box=host?.querySelector("#paos-prompter"),txt=host?.querySelector("#paos-caption");if(!box||!txt||box.hidden||!box.clientHeight)return;const w=box.clientWidth,h=box.clientHeight,key=[w,h,s.slide].join(":");if(fitCache===key)return;fitCache=key;const probe=document.createElement("div");probe.className="paos-caption";Object.assign(probe.style,{position:"absolute",visibility:"hidden",width:Math.max(10,w-20)+"px",height:"auto",pointerEvents:"none"});probe.textContent=current().cues.reduce((a,b)=>b.text.length>a.length?b.text:a,"");box.appendChild(probe);let lo=10,hi=Math.max(10,Math.min(64,Math.floor(h*.32),Math.floor(w*.06)));while(lo<hi){const m=Math.ceil((lo+hi)/2);probe.style.fontSize=m+"px";if(probe.scrollHeight<=h-14&&probe.scrollWidth<=w-20)lo=m;else hi=m-1}probe.remove();txt.style.fontSize=lo+"px"}
function layoutCap(){if(!alive())return;const box=host.querySelector("#paos-prompter"),r=imageRect(),a=host.querySelector("#paos-stage").getBoundingClientRect();if(!r.width||!r.height)return;Object.assign(box.style,{left:(r.left-a.left+capBox.x*r.width)+"px",top:(r.top-a.top+capBox.y*r.height)+"px",width:capBox.w*r.width+"px",height:capBox.h*r.height+"px",background:"rgba(6,15,28,"+opacity+")"});box.classList.toggle("cap-edit",editing);fitCap()}
function editCap(){editing=!editing;if(editing){s.captions=true;s.text=true;host.querySelector("#paos-prompter").hidden=false}layoutCap();tick()}
function capDown(e){if(!editing||e.button!==0)return;e.preventDefault();e.stopPropagation();const r=imageRect();drag={id:e.pointerId,x:e.clientX,y:e.clientY,b:{...capBox},w:r.width,h:r.height,dir:e.target.closest("[data-resize]")?.dataset.resize||"move"};e.currentTarget.setPointerCapture(e.pointerId)}
function capMove(e){if(!drag||e.pointerId!==drag.id)return;const d=drag,b={...d.b},x=(e.clientX-d.x)/d.w,y=(e.clientY-d.y)/d.h;if(d.dir==="move"){b.x=clamp(b.x+x,0,1-b.w);b.y=clamp(b.y+y,0,1-b.h)}else{if(d.dir.includes("e"))b.w=clamp(b.w+x,.16,1-b.x);if(d.dir.includes("s"))b.h=clamp(b.h+y,.07,1-b.y);if(d.dir.includes("w")){const end=b.x+b.w;b.x=clamp(b.x+x,0,end-.16);b.w=end-b.x}if(d.dir.includes("n")){const end=b.y+b.h;b.y=clamp(b.y+y,0,end-.07);b.h=end-b.y}}capBox=b;layoutCap()}
function capUp(){if(drag){drag=null;saveCap()}}
function voiceToggle(){const playing=s.playing,t=s.time;pause();s.mode=s.mode==="listen"?"practice":"listen";s.time=t;if(s.mode==="listen")s.audio.currentTime=t;if(playing)play();else tick()}
function captionToggle(){s.captions=!s.captions;s.text=true;host.querySelector("#paos-prompter").hidden=!s.captions;if(!s.captions)editing=false;layoutCap();tick()}
function toggleSettings(){settings=!settings;host.querySelector(".paos-settings-panel").hidden=!settings;host.querySelector("#paos-settings").setAttribute("aria-expanded",String(settings));revealFullscreenControls()}
const playerIcons={"prev":"<path d=\"M6 5v14M18 5l-10 7 10 7z\"/>","next":"<path d=\"M18 5v14M6 5l10 7-10 7z\"/>","play":"<path d=\"M8 5l12 7-12 7z\" fill=\"currentColor\" stroke=\"none\"/>","pause":"<path d=\"M9 5v14M15 5v14\" stroke-width=\"3\"/>","volume":"<path d=\"M3 9h4l5-4v14l-5-4H3zM16 8a6 6 0 010 8M19 5a10 10 0 010 14\"/>","mute":"<path d=\"M3 9h4l5-4v14l-5-4H3zM16 9l6 6m0-6l-6 6\"/>","settings":"<circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10l2 2M19 5l-2 2M7 17l-2 2\"/><circle cx=\"12\" cy=\"12\" r=\"8\"/>","fullscreen":"<path d=\"M9 4H4v5m11-5h5v5M4 15v5h5m11-5h5v-5\"/>"};
function playerIcon(name){return '<svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(playerIcons[name]||"")+'</svg>'}
function btn(a,label,icon,id="",extra=""){return '<button type="button" class="player-btn '+extra+'" '+(id?'id="'+id+'" ':'')+'data-pguide="'+a+'" title="'+label+'" aria-label="'+label+'">'+icon+'</button>'}
function tick(){
 if(!alive())return;
 if(s.mode==="listen"&&s.audio)s.time=s.audio.currentTime||0;
 if(s.mode==="practice"&&s.playing){s.time=clamp((Date.now()-s.practiceStart)/1000*s.rate,0,current().seconds);
   if(s.time>=current().seconds){next(true);return}}
 const subtitleAt=subtitleClock();
 const i=cueIndex(subtitleAt),cue=current().cues[i];s.cue=i;
 const c=host.querySelector("#paos-clock");if(c)c.textContent=tm(presentationTime())+" / "+tm(Math.ceil(presentationTotal()));
 const slider=host.querySelector("#paos-seek");if(slider)slider.value=String(Math.round(presentationTime()*1000));
 const caption=host.querySelector("#paos-caption");
 if(caption&&cue){const words=cue.text.trim().split(/\s+/);
   const exact=cue.word_alignment==="provider-word-boundary"&&Array.isArray(cue.word_cues)&&cue.word_cues.length===words.length;
   const n=s.mode==="practice"?0:exact
     ?cue.word_cues.filter(w=>w.start<=subtitleAt+.02).length
     :Math.ceil(words.length*clamp((subtitleAt-cue.start)/Math.max(.05,cue.end-cue.start),0,1));
   caption.innerHTML=s.captions&&s.time>=s.subtitleDelay*s.rate-.01?
   '<span class="paos-spoken">'+esc(words.slice(0,n).join(" "))+'</span> '+esc(words.slice(n).join(" ")):"";}
 const next=host.querySelector("#paos-next-line");if(next)next.textContent=current().cues[i+1]?.text||"";
 host.querySelectorAll(".paos-cue").forEach((el,j)=>el.classList.toggle("current",i===j));
 const dot=host.querySelector("#paos-dot");
 if(dot){const own=overrides().filter(p=>p.number===current().number);
   const all=(current().anchors||[]).filter(p=>!own.some(x=>x.cue===p.cue)).concat(own);
   const point=automaticPoint(all,s.time+.1);
   const active=s.laserMode==="manual"?s.manualPoint:s.laserMode==="auto"?point:null;
   dot.hidden=!active;
   if(active){positionDot(dot,active);
     dot.classList.toggle("paos-auto-motion",s.laserMode==="auto");
     dot.title=s.laserMode==="manual"?"Puntero manual":active.approved?"Calibrado":"Sugerido, sin revisión";}}
 const p=host.querySelector("#paos-play");if(p){p.innerHTML=playerIcon(s.playing?"pause":"play");p.setAttribute("aria-label",s.playing?"Pausar":"Reproducir");p.title=p.getAttribute("aria-label")}
 const voice=host.querySelector("#paos-voice");if(voice){voice.innerHTML=playerIcon(s.mode==="listen"?"volume":"mute");voice.setAttribute("aria-pressed",String(s.mode==="listen"))}
 const cc=host.querySelector("#paos-cc");if(cc)cc.setAttribute("aria-pressed",String(s.captions));fitCap();
 const b=host.querySelector("#paos-start-both");if(b)b.textContent=s.playing&&s.mode==="listen"&&s.captions?"▶ Voz + subtítulos · activo":"▶ Voz + subtítulos";
 host.querySelectorAll("[data-pguide='mode-both'],[data-pguide='mode-voice'],[data-pguide='mode-subtitles']").forEach(el=>{
   const active=el.dataset.pguide===(s.mode==="practice"?"mode-subtitles":s.captions?"mode-both":"mode-voice");
   el.classList.toggle("active",active);
   el.setAttribute("aria-pressed",String(active));
 });
}
function pause(){s.playing=false;s.audio?.pause();if(s.timer)clearInterval(s.timer);s.timer=null;tick()}
function play(){if(s.playing){pause();return}s.playing=true;
 if(s.mode==="listen"){s.audio.currentTime=s.time;s.audio.playbackRate=s.rate;
   s.audio.play().catch(err=>{s.playing=false;host.querySelector("#paos-status").textContent="Audio bloqueado: "+err.message});}
 else s.practiceStart=Date.now()-s.time*1000/s.rate;
 if(s.timer)clearInterval(s.timer);s.timer=setInterval(tick,90);tick();}
function seek(v){s.time=clamp(v,0,current().seconds);
 if(s.mode==="listen"&&s.audio)s.audio.currentTime=s.time;
 if(s.mode==="practice"&&s.playing)s.practiceStart=Date.now()-s.time*1000/s.rate;tick();}
function next(auto){if(s.slide+1>=manifest.slides.length){
   pause();
   const status=host?.querySelector("#paos-status");
   if(status)status.textContent="Presentación terminada. Elige un modo para volver a comenzar.";
   return;
 }load(s.slide+1,auto)}
function seekPresentation(seconds){
 const target=clamp(seconds,0,presentationTotal());
 let index=0;for(let i=0;i<manifest.slides.length-1;i++){
   if(target>=beforeSlide(i+1))index=i+1;else break;
 }
 const wasPlaying=s.playing;
 if(index!==s.slide)load(index,false);
 s.time=clamp(target-beforeSlide(index),0,current().seconds);
 if(s.mode==="listen"&&s.audio){
   try{s.audio.currentTime=s.time}catch{}
 }
 if(s.mode==="practice"&&s.playing)s.practiceStart=Date.now()-s.time*1000/s.rate;
 if(wasPlaying&&!s.playing)play();else tick();
}
function load(i,auto=false){pause();s.slide=clamp(i,0,manifest.slides.length-1);s.time=0;
 s.subtitleDelay=readDelay(s.slide);s.manualPoint=null;render();if(auto)play()}
function selectPlayback(mode,auto=true){
 pause();
 s.mode=mode==="subtitles"?"practice":"listen";
 s.captions=mode!=="voice";
 if(auto){
   // These prominent buttons start the entire presentation, NOT a single slide.
   // Natural audio-ended events progress through every slide.
   s.slide=0;s.time=0;s.subtitleDelay=readDelay(0);
 }
 render();
 if(auto)play();
}
function addAnchor(ev){if(!s.calibrate)return;const r=imageRect();
 if(ev.clientX<r.left||ev.clientX>r.left+r.width||ev.clientY<r.top||ev.clientY>r.top+r.height)return;
 const val={number:current().number,cue:s.cue,time:Math.round(s.time*1000)/1000,
   x:Math.round(clamp((ev.clientX-r.left)/r.width,0,1)*1e5)/1e5,
   y:Math.round(clamp((ev.clientY-r.top)/r.height,0,1)*1e5)/1e5,approved:true,
   source:"manual-local-calibration",label:current().cues[s.cue]?.text.slice(0,50)};
 const old=overrides();s.undo.push(JSON.stringify(old));
 store(old.filter(p=>p.number!==val.number||p.cue!==val.cue).concat(val));
 s.calibrate=false;host.querySelector("#paos-status").textContent="Punto calibrado localmente. Exporta el JSON para conservarlo.";tick();}
function exportAnchors(){const v={format:"paos-laser-overrides/1",academy:config.slug,points:overrides()};
 const url=URL.createObjectURL(new Blob([JSON.stringify(v,null,2)],{type:"application/json"}));
 const a=document.createElement("a");a.href=url;a.download="laser-"+config.slug+".json";document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),2500);}
async function importAnchors(file){const o=JSON.parse(await file.text());
 if(o.format!=="paos-laser-overrides/1"||o.academy!==config.slug||!Array.isArray(o.points))throw Error("Archivo incompatible");
 for(const p of o.points){const slide=manifest.slides.find(x=>x.number===p.number);
  if(!slide||!Number.isInteger(p.cue)||p.cue<0||p.cue>=slide.cues.length||
     !Number.isFinite(p.time)||p.time<0||p.time>slide.seconds+1||
     !Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1)throw Error("Punto inválido");}
 s.undo.push(JSON.stringify(overrides()));store(o.points);tick();}
function render(){
 if(!host||!current())return;
 const row=current();
 let h='<div class="section-head paos-rehearsal-heading"><h2>Ensayo de la presentación completa</h2><span class="paos-slide-counter">Lámina '+row.number+' de '+manifest.slides.length+'</span></div>';
 h+='<div class="paos-guide-grid"><section class="card paos-rehearsal-card">';
 h+='<div class="paos-focus-shell" id="paos-focus-shell">';
 h+='<div class="paos-stage" id="paos-stage">';
 h+='<img id="paos-img" src="./slides/slide-'+String(row.number).padStart(2,"0")+'.png" alt="Lámina auténtica '+row.number+'">';
 h+='<span class="paos-dot" id="paos-dot" hidden></span>';
 h+='<div class="paos-prompter paos-caption-overlay" id="paos-prompter" aria-label="Subtítulos superpuestos en la diapositiva">';
 h+='<div id="paos-caption" class="paos-caption"></div><span class="cap-grip">⠿</span>';
 h+=["n","ne","e","se","s","sw","w","nw"].map(d=>'<span class="cap-handle '+d+'" data-resize="'+d+'"></span>').join("");
 h+='</div></div>';
 h+='<audio id="paos-audio" preload="metadata" src="./'+esc(row.audio)+'"></audio>';
 h+='<div class="player-controls"><div class="paos-seek"><input type="range" aria-label="Posición en la presentación completa" id="paos-seek" min="0" max="'+Math.ceil(presentationTotal()*1000)+'" value="0" step="100"></div><div class="player-row">';
 h+=btn("prev","Lámina anterior",playerIcon("prev"))+btn("play","Reproducir",playerIcon("play"),"paos-play","player-main")+btn("next","Lámina siguiente",playerIcon("next"))+btn("voice-toggle","Voz",playerIcon("volume"),"paos-voice");
 h+='<span id="paos-clock" class="player-time">00:00 / '+tm(Math.ceil(presentationTotal()))+'</span><span class="player-spacer"></span><span class="player-time">'+row.number+' / '+manifest.slides.length+'</span>';
 h+=btn("cc-toggle","Subtítulos","CC","paos-cc");
 h+='<select id="paos-rate" class="player-select" aria-label="Velocidad">'+[.5,.6,.7,.8,.9,1].map(x=>'<option value="'+x+'" '+(s.rate===x?"selected":"")+'>'+x+'×</option>').join("")+'</select>';
 h+='<select class="player-select" data-laser-mode aria-label="Puntero láser">'+[["auto","Láser auto"],["manual","Láser manual"],["off","Sin láser"]].map(([v,t])=>'<option value="'+v+'" '+(s.laserMode===v?"selected":"")+'>'+t+'</option>').join("")+'</select>';
 h+=btn("settings","Ajustes",playerIcon("settings"),"paos-settings")+btn("fullscreen","Pantalla completa",playerIcon("fullscreen"),"paos-fullscreen","player-full");
 h+='</div></div><p class="paos-status-line" id="paos-status" role="status"></p>';
 h+='<section class="paos-guide-panel paos-settings-panel" '+(settings?'':'hidden')+'><div class="settings-head"><strong>Ajustes de ensayo</strong>'+btn("settings","Cerrar ajustes","×")+'</div>';
 h+='<label class="mini-label" for="paos-slide">Lámina '+row.number+' de '+manifest.slides.length+'</label>';
 h+='<select id="paos-slide">'+manifest.slides.map((v,i)=>'<option value="'+i+'" '+(i===s.slide?"selected":"")+'>'+String(i+1)+". "+esc(items[i]?.title||"Lámina")+'</option>').join("")+'</select>';
 h+='<div class="paos-delay-control" role="group" aria-label="Ajuste entre subtítulos y voz">';
 h+='<div class="paos-delay-heading"><label for="paos-delay">Sincronizar subtítulos</label><output id="paos-delay-value" for="paos-delay">0 ms</output></div>';
 h+='<div class="paos-delay-row"><button type="button" class="btn paos-delay-nudge" data-pguide="delay-earlier" aria-label="Adelantar subtítulos 10 milisegundos">−10 ms</button>';
 h+='<input id="paos-delay" type="range" min="-0.1" max="0.1" step="0.01" value="'+s.subtitleDelay+'" aria-label="Desplazamiento de subtítulos respecto de la voz, en segundos">';
 h+='<button type="button" class="btn paos-delay-nudge" data-pguide="delay-later" aria-label="Retrasar subtítulos 10 milisegundos">+10 ms</button></div>';
 h+='<div class="paos-delay-footer"><span id="paos-delay-direction">Audio y subtítulos sin corrección</span></div>';
 h+='<div class="paos-delay-footer"><button type="button" class="paos-text-button" data-pguide="delay-reset">Restablecer</button>';
 h+='<button type="button" class="paos-text-button" data-pguide="delay-all">Aplicar a todas</button></div></div>';
 h+='<div class="caption-settings"><strong>Subtítulos</strong><button class="btn" data-pguide="caption-edit">'+(editing?"Bloquear cuadro":"Mover y redimensionar")+'</button><button class="btn" data-pguide="caption-reset">Restaurar cuadro</button><label for="paos-opacity">Opacidad</label><input id="paos-opacity" type="range" min=".2" max="1" step=".05" value="'+opacity+'"></div><button class="btn" data-pguide="restart">Volver al inicio</button>';
 h+='<details class="paos-advanced-settings"><summary>Más ajustes y opciones</summary><div class="paos-advanced-content">';
 h+='<div class="actions"><button class="btn" data-pguide="calibrate">Calibrar puntero</button><button class="btn" data-pguide="undo">Deshacer</button>';
 h+='<button class="btn" data-pguide="reset">Restaurar</button></div>';
 h+='<div class="actions"><button class="btn" data-pguide="export">Exportar puntos</button><label class="btn" for="paos-import">Importar JSON</label>';
 h+='<input type="file" id="paos-import" accept=".json,application/json" hidden></div>';
 if(manifest.video?.path==="video/full-presentation.mp4"){
   h+='<details class="paos-full-video"><summary>Video MP4 de referencia</summary>';
   h+='<video controls playsinline preload="metadata" style="width:100%;max-height:260px;border-radius:9px;background:#000" src="./video/full-presentation.mp4"></video></details>';
 }
 h+='<p class="muted-small">Público simulado: la aplicación no graba ni califica la voz.</p>';
 h+='</div></details>';
 h+='<details class="paos-cues-collapsible"><summary>Fragmentos sincronizados ('+row.cues.length+')</summary><div class="paos-cue-list">';
 h+=row.cues.map((c,i)=>'<button class="paos-cue" data-pguide="jump" data-cue="'+i+'">'+tm(c.start)+' · '+esc(c.text)+'</button>').join("");
 h+='</div></details></section></div></section></div>';
 host.innerHTML=h;fitCache="";s.audio=host.querySelector("#paos-audio");s.audio.playbackRate=s.rate;
 s.audio.addEventListener("timeupdate",tick);s.audio.addEventListener("ended",()=>next(true));
 s.audio.addEventListener("error",()=>{s.playing=false;host.querySelector("#paos-status").textContent="No se pudo cargar el audio."});
 s.audio.addEventListener("loadedmetadata",()=>{if(Number.isFinite(s.audio.duration)&&s.audio.duration+.6<row.seconds)
   host.querySelector("#paos-status").textContent="Advertencia: subtítulos exceden duración de audio."});
 host.querySelector("#paos-stage").addEventListener("click",ev=>{if(ev.target.closest(".cap-edit"))return;if(s.calibrate){addAnchor(ev);return;}play();});
 const stage=host.querySelector("#paos-stage");
 stage.classList.toggle("paos-manual-laser",s.laserMode==="manual");
 stage.addEventListener("pointermove",manualLaser);
 stage.addEventListener("pointerleave",()=>{s.manualPoint=null;if(s.laserMode==="manual")tick()});
 const cap=host.querySelector("#paos-prompter");cap.hidden=!s.captions;cap.addEventListener("pointerdown",capDown);cap.addEventListener("pointermove",capMove);cap.addEventListener("pointerup",capUp);cap.addEventListener("pointercancel",capUp);host.querySelector("#paos-img").addEventListener("load",layoutCap);requestAnimationFrame(layoutCap);
 updateDelayDisplay();tick();
}
let fullscreenTimer=null;
function revealFullscreenControls(){
 if(!host||document.fullscreenElement!==host)return;
 host.classList.remove("paos-controls-hidden");
 clearTimeout(fullscreenTimer);
 fullscreenTimer=setTimeout(()=>{if(document.fullscreenElement===host&&!settings&&!editing)host.classList.add("paos-controls-hidden")},5000);
}
document.addEventListener("fullscreenchange",()=>{
 clearTimeout(fullscreenTimer);
 if(host){host.classList.remove("paos-controls-hidden");requestAnimationFrame(layoutCap);revealFullscreenControls();}
});
window.addEventListener("resize",layoutCap);
document.addEventListener("keydown",ev=>{
 if(!alive()||(!host.contains(document.activeElement)&&document.fullscreenElement!==host))return;
 revealFullscreenControls();
 if(ev.code==="Escape"&&editing){editCap();revealFullscreenControls();return;}
 if(ev.code==="KeyL"&&!ev.repeat&&!ev.target.closest("input,select,textarea,[contenteditable]")){setLaserMode(({off:"auto",auto:"manual",manual:"off"})[s.laserMode]);}
 if(ev.code==="Space"&&!ev.repeat&&!ev.target.closest("button,input,select,textarea,[contenteditable]")){
  ev.preventDefault();play();revealFullscreenControls();
 }
});
function onClick(ev){if(!alive())return;const b=ev.target.closest("[data-pguide]");if(!b)return;const a=b.dataset.pguide;
 if(a==="play")play();else if(a==="voice-toggle")voiceToggle();else if(a==="cc-toggle")captionToggle();else if(a==="settings")toggleSettings();else if(a==="caption-edit"){editCap();b.textContent=editing?"Bloquear cuadro":"Mover y redimensionar";toggleSettings();revealFullscreenControls()}else if(a==="caption-reset"){capBox={x:.1,y:.74,w:.8,h:.22};opacity=.78;saveCap();layoutCap()}else if(a==="restart")load(0,s.playing);else if(a==="prev")load(s.slide-1,s.playing);else if(a==="next")load(s.slide+1,s.playing);
 else if(a==="mode-both")selectPlayback("both");
 else if(a==="mode-voice")selectPlayback("voice");
 else if(a==="mode-subtitles")selectPlayback("subtitles");
 else if(a==="delay-earlier")saveDelay(s.subtitleDelay-DELAY_STEP);
 else if(a==="delay-later")saveDelay(s.subtitleDelay+DELAY_STEP);
 else if(a==="delay-reset")saveDelay(0);
 else if(a==="delay-all")saveDelay(s.subtitleDelay,true);
 else if(a==="jump")seek(current().cues[Number(b.dataset.cue)].start);
 else if(a==="listen"||a==="practice")selectPlayback(a==="listen"?"both":"subtitles",false)
 else if(a==="calibrate"){s.calibrate=!s.calibrate;host.querySelector("#paos-status").textContent=s.calibrate?
  "Haz clic en la posición relevante de la lámina para calibrar el láser.":"Calibración cancelada";}
 else if(a==="undo"){if(s.undo.length){store(JSON.parse(s.undo.pop()));tick()}}
 else if(a==="reset"){s.undo.push(JSON.stringify(overrides()));store([]);tick()}
 else if(a==="export")exportAnchors();
 else if(a==="fullscreen"){
   if(document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});
   else host.requestFullscreen?.().catch(err=>{
     host.querySelector("#paos-status").textContent="No se pudo activar pantalla completa: "+err.message;
   });
  }}
function onChange(ev){if(!alive())return;const t=ev.target;
 if(t.id==="paos-slide")load(Number(t.value));
 if(t.id==="paos-rate"){if(s.mode==="practice"&&s.playing)tick();s.rate=Number(t.value);s.audio.playbackRate=s.rate;if(s.mode==="practice"&&s.playing)s.practiceStart=Date.now()-s.time*1000/s.rate;tick()}
 if(t.id==="paos-text"){s.text=t.checked;host.querySelector("#paos-prompter").hidden=!s.text||!s.captions}
 if(t.hasAttribute("data-laser-mode"))setLaserMode(t.value)
 if(t.id==="paos-import"&&t.files?.[0])importAnchors(t.files[0]).catch(err=>{
  host.querySelector("#paos-status").textContent="Importación rechazada: "+err.message});}
function onInput(ev){if(!alive())return;if(ev.target.id==="paos-seek")seekPresentation(Number(ev.target.value)/1000);
 if(ev.target.id==="paos-delay")saveDelay(Number(ev.target.value));if(ev.target.id==="paos-opacity"){opacity=Number(ev.target.value);saveCap();layoutCap()}
 if(ev.target.id==="paos-font"){s.font=Number(ev.target.value);host.querySelector("#paos-caption").style.fontSize=s.font+"px"}}
function mount(root,c,doc,resources){if(!doc?.slides?.length){root.innerHTML="<p>No hay narración disponible.</p>";return}
 host=root;host.classList.add("paos-immersive");manifest=doc;items=resources;config=c;s.subtitleDelay=readDelay(s.slide);readCap();
 if(!bound){root.addEventListener("click",onClick);root.addEventListener("change",onChange);root.addEventListener("input",onInput);root.addEventListener("pointermove",revealFullscreenControls);root.addEventListener("pointerdown",revealFullscreenControls);root.addEventListener("focusin",revealFullscreenControls);bound=true}
 render();}
function unmount(){if(host){pause();host=null;s.audio=null}}
window.PAOS_GUIDED_MODULE={mount,unmount};
})();
