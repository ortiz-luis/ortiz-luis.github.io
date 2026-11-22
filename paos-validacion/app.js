/* PAOS 0.1.0 synthetic demo. This is not an evaluator of spoken answers. */
(()=>{
'use strict';
const cfg=window.PAOS_CONFIG, isLocal=['local-pilot','public-open'].includes(cfg?.mode);
const data=isLocal?window.PAOS_CONTENT:window.PAOS_DEMO;
const main=document.getElementById('main'),nav=document.getElementById('navigation');
const modes=['quiz','resources','exam','mock','guided','progress'];
if(!main||!nav||!cfg||!['demo','local-pilot','public-open'].includes(cfg.mode)||!data){
 if(main) main.textContent='Faltan los datos de la academia. No se mostrará contenido de otra instancia.';return;
}
if(isLocal){
 const published=cfg.mode==='public-open';
 const s=document.querySelector('.topbar-side');if(s)s.textContent=published?'Sitio público · sin cuentas':'Piloto local · sin cuentas';
 const foot=document.querySelector('.sidebar-foot p');if(foot)foot.textContent=published?
   'Este material es accesible públicamente. Las preguntas generadas no equivalen a revisión académica.':
   'Material auténtico local. Las preguntas y repreguntas no cuentan con revisión experta.';
 const pill=document.querySelector('.sidebar-foot .pill');if(pill)pill.textContent=published?'Público · sin login':'Solo en este computador';
 document.documentElement.lang=cfg.locale?.split('-')[0]||'es';
}
document.getElementById('academy-title').textContent=cfg.title;
document.getElementById('academy-subtitle').textContent=cfg.subtitle||'Entrenamiento';
const key=`paos:${cfg.slug}:demo:attempts`,deckKey=`paos:${cfg.slug}:demo:recent`;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const load=(k,def)=>{try{let a=JSON.parse(localStorage.getItem(k));return Array.isArray(a)?a:def}catch{return def}};
const history=()=>load(key,[]);
function record(mode,payload){const h=history();h.push({mode,at:new Date().toISOString(),...payload});try{localStorage.setItem(key,JSON.stringify(h.slice(-2000)))}catch{}}
function shuffle(xs){const a=[...xs];for(let i=a.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
const since=t=>t?Math.max(0,Math.floor((Date.now()-t)/1000)):0;
const clock=s=>{s=Math.max(0,Math.floor(s));return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`};
const btn=(text,action,primary=false)=>`<button class="btn ${primary?'primary':''}" data-action="${esc(action)}">${esc(text)}</button>`;
const head=(name,label)=>`<div class="section-head"><div><p class="mini-label">${esc(label)}</p><h2>${esc(name)}</h2></div></div>`;
const slide=r=>{
 if(isLocal && typeof r.image==='string' && /^slides\/slide-\d{2,3}\.png$/.test(r.image))
  return `<div class="slide real-slide"><img src="./${esc(r.image)}" alt="Diapositiva auténtica ${esc(r.id)}: ${esc(r.title)}" loading="eager"></div>`;
 return `<div class="slide" role="img" aria-label="Recurso ficticio: ${esc(r.title)}"><span class="folio">DEMO SINTÉTICA</span><div><h3>${esc(r.title)}</h3><p>${esc(r.subtitle||r.summary)}</p></div><span class="folio">${esc(r.id)} · EJEMPLO, NO PRESENTACIÓN REAL</span></div>`;
};
function notice(s){let d=document.createElement('div');d.className='feedback';d.setAttribute('role','status');d.textContent=s;main.prepend(d);setTimeout(()=>d.remove(),3800)}
let mode='quiz', quiz=null,resIndex=0,resStart=null,exam=null,mock=null,guide=null;
function show(m){if(!modes.includes(m))return; if(m!=='guided'&&guide)guide.running=false;mode=m;nav.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('active',x.dataset.mode===m));
 if(m==='quiz')renderQuiz();else if(m==='resources')renderResources();else if(m==='exam')renderExam();else if(m==='mock')renderMock();else if(m==='guided')renderGuide();else renderProgress();}
// Quiz: always persist canonical option index, not its visual A-D position.
function makeQuiz(){
 const approved=data.quiz.filter(q=>(q.review_status==='approved'||(isLocal&&q.review_status==='pilot_draft'))&&q.options?.length===4&&Number.isInteger(q.correct_index)&&q.correct_index>=0&&q.correct_index<4);
 const recent=new Set(load(deckKey,[]).flat());
 const ordered=[...shuffle(approved.filter(x=>!recent.has(x.id))),...shuffle(approved.filter(x=>recent.has(x.id)))];
 const n=Math.min(approved.length,Number(cfg.quiz_session_size)||10);
 const expectedTheory=Math.min(Math.ceil(n/2),approved.filter(x=>x.track==='teoria').length);
 const expectedApplied=Math.min(n-expectedTheory,approved.filter(x=>x.track==='aplicacion').length);
 const deck=[],selected=new Set(),groups=new Set();
 function fill(track,count,uniqueGroup){
  for(const q of ordered){
   if(deck.length>=n||count<=0)break;
   if((track&&q.track!==track)||selected.has(q.id))continue;
   const group=q.group_key||q.id;
   if(uniqueGroup&&groups.has(group))continue;
   deck.push(q);selected.add(q.id);groups.add(group);count--;
  }
 }
 fill('teoria',expectedTheory,true);
 fill('aplicacion',expectedApplied,true);
 // If there are fewer distinct slide groups than quiz questions, preserve
 // the theoretical/applied ratio before filling the remaining slots.
 fill('teoria',expectedTheory-deck.filter(q=>q.track==='teoria').length,false);
 fill('aplicacion',expectedApplied-deck.filter(q=>q.track==='aplicacion').length,false);
 fill(null,n-deck.length,true);
 fill(null,n-deck.length,false);
 const past=load(deckKey,[]);past.unshift(deck.map(x=>x.id));
 try{localStorage.setItem(deckKey,JSON.stringify(past.slice(0,4)))}catch{}
 quiz={deck:shuffle(deck),pos:0,choice:null,order:shuffle([0,1,2,3])};renderQuiz();
}
function renderQuiz(){let h=head('Estudiar','Alternativas y explicación');if(!quiz||quiz.pos>=quiz.deck.length){main.innerHTML=h+`<section class="card"><h3 class="question">Comprueba lo que sabes con una sesión corta.</h3><p class="muted">${data.quiz.length} ${isLocal?'preguntas de pilotaje basadas en las notas originales, pendientes de revisión experta':'preguntas ficticias'}. Cuatro alternativas, explicación y memoria de intentos.</p><div class="actions">${btn('Iniciar '+Math.min(data.quiz.length,Number(cfg.quiz_session_size)||10)+' preguntas','quiz-start',true)}</div></section>`;return;}
const q=quiz.deck[quiz.pos];h+=`<div class="progress-track"><div class="progress-fill" style="width:${100*quiz.pos/quiz.deck.length}%"></div></div><section class="card"><p class="mini-label">${quiz.pos+1} de ${quiz.deck.length} · ${esc(q.track)}</p><h3 class="question" id="question">${esc(q.stem)}</h3><div class="options">`;
for(const i of quiz.order){const chosen=quiz.choice!==null&&i===quiz.choice,correct=quiz.choice!==null&&i===q.correct_index;const cls=correct?'correct':chosen?'wrong':'';
h+=`<button class="option ${cls}" data-action="quiz-answer" data-value="${i}" ${quiz.choice!==null?'disabled':''}><span class="option-letter">${'ABCD'[quiz.order.indexOf(i)]}</span><span>${esc(q.options[i])}</span></button>`}
h+='</div>';if(quiz.choice===null)h+=`<div class="actions">${btn('No sé todavía','quiz-unsure')}</div>`;
else h+=`<div class="feedback ${quiz.choice===q.correct_index?'correct':''}"><b>${quiz.choice===q.correct_index?'Correcto':'Revisa esta respuesta'}</b><p>${esc(q.explanation)}</p><small>Fuente: ${esc(q.source_ref)}</small></div><div class="actions">${btn(quiz.pos+1===quiz.deck.length?'Finalizar':'Siguiente','quiz-next',true)}</div>`;
main.innerHTML=h+'</section>';}
function answer(i){if(!quiz||quiz.choice!==null)return;let q=quiz.deck[quiz.pos],n=Number(i);if(!Number.isInteger(n)||n< -1||n>3)return;quiz.choice=n;record('quiz',{item_id:q.id,selected_index:n,correct:n===q.correct_index,confidence:n===-1?0:2});renderQuiz()}
function quizNext(){if(!quiz||quiz.choice===null)return;quiz.pos++;quiz.choice=null;quiz.order=shuffle([0,1,2,3]);renderQuiz()}
// Resource viewer: demo visual is explicitly synthetic; real presentation must come from private Storage.
function renderResources(){const r=data.resources[resIndex];main.innerHTML=head('Por recurso','Práctica cronometrada')+`<div class="two-col"><section class="card"><p class="mini-label">${isLocal?'Diapositiva auténtica · fuente local':'Diapositiva ficticia del piloto'}</p>${slide(r)}<div class="actions">${btn('Anterior','resource-prev')}${btn('Siguiente','resource-next')}</div></section><section class="card side-controls"><label class="mini-label" for="resource-select">Seleccionar recurso</label><select id="resource-select">${data.resources.map((v,i)=>`<option value="${i}" ${i===resIndex?'selected':''}>${esc(v.title)}</option>`).join('')}</select><p class="mini-label" style="margin-top:24px">Tiempo</p><div class="clock" id="resource-clock">${clock(since(resStart))}</div><div class="actions">${btn(resStart?'Reiniciar':'Comenzar exposición','resource-start',true)}</div><details style="margin-top:20px"><summary>${isLocal?'Mostrar guion original de la lámina':'Mostrar pistas'}</summary><p style="white-space:pre-wrap">${esc(isLocal?r.script:r.hints)}</p><p class="muted-small">${esc(r.source_ref||'Ejemplo sintético')}${isLocal?' · Sin revisión de especialista':''}</p>${isLocal?'':'<p class="muted-small">Evita: '+esc(r.pitfall)+'</p>'}</details><p class="mini-label" style="margin-top:23px">Mi evaluación (0–4)</p><div class="score-row">${[0,1,2,3,4].map(x=>`<button class="btn tiny" data-action="resource-rate" data-value="${x}">${x}</button>`).join('')}</div><p class="muted-small">No hay evaluación automática de voz.</p></section></div>`}
function pickResource(index){resIndex=(index+data.resources.length)%data.resources.length;resStart=null;renderResources()}
function rateResource(x){record('resources',{resource_id:data.resources[resIndex].id,score:Number(x),seconds:since(resStart)});resStart=null;renderResources();notice('Ensayo guardado localmente')}
// Tribunal: no automatic assessment of spoken answers.
function startExam(){exam={chain:shuffle(data.exam)[0],since:Date.now(),branch:null};renderExam()}
function renderExam(){let h=head('Tribunal','Objeciones y repreguntas');if(!exam){main.innerHTML=h+`<section class="card"><h3 class="question">Responde a una objeción y decide con honestidad qué repregunta corresponde.</h3><p class="muted">El examinador es ficticio; la aplicación no escucha ni entiende tu respuesta. ${isLocal?'Las preguntas se basan en la presentación real, pero esperan revisión experta.':''}</p><div class="actions">${btn('Empezar interrogatorio','exam-start',true)}</div></section>`;return;}
const c=exam.chain;h+=`<section class="card"><span class="tag">${esc(c.examiner)}</span><span class="tag">${esc(c.topic)}</span><p class="mini-label" style="margin-top:24px">Pregunta inicial</p><h3 class="question">${esc(c.turns[0].prompt)}</h3><p class="muted-small">Tiempo <span id="exam-clock">${clock(since(exam.since))}</span></p>`;
if(!exam.branch)h+=`<div class="actions">${btn('Respuesta incompleta','exam-incomplete')}${btn('Respuesta suficiente','exam-sufficient',true)}</div>`;
else {const t=c.turns.find(t=>t.condition===exam.branch);h+=`<div class="feedback"><b>Repregunta</b><p>${esc(t?.prompt||'¿Por qué?')}</p></div><details><summary>Estrategia sugerida</summary><p>${esc(c.strategy)}</p></details><p class="mini-label" style="margin-top:23px">Mi evaluación (0–4)</p><div class="score-row">${[0,1,2,3,4].map(x=>`<button class="btn tiny" data-action="exam-rate" data-value="${x}">${x}</button>`).join('')}</div>`}
main.innerHTML=h+'</section>'}
function rateExam(x){record('exam',{chain_id:exam.chain.id,score:Number(x),branch:exam.branch,seconds:since(exam.since)});exam=null;renderExam();notice('Interrogatorio guardado localmente')}
// Mock: a deterministic state machine over slides and tribunal, not a fourth question bank.
function startMock(){const count=Math.max(1,Math.min(data.exam.length,Number(cfg.mock_examiner_count)||3));mock={since:Date.now(),phase:'slides',idx:0,slideSince:Date.now(),slideSeconds:[],chains:shuffle(data.exam).slice(0,count),juryIdx:0,branch:null,grades:[]};renderMock()}
function mockSlideNext(){if(!mock||mock.phase!=='slides')return;mock.slideSeconds.push(since(mock.slideSince));mock.idx++;mock.slideSince=Date.now();if(mock.idx>=data.resources.length)mock.phase='jury';renderMock()}
function mockGrade(x){if(!mock||mock.phase!=='jury'||!mock.branch)return;mock.grades.push({chain_id:mock.chains[mock.juryIdx].id,score:Number(x),branch:mock.branch});mock.juryIdx++;mock.branch=null;if(mock.juryIdx>=mock.chains.length){record('mock',{duration_seconds:since(mock.since),slide_seconds:mock.slideSeconds,grades:mock.grades,completed:true});mock=null;renderMock();notice('Simulacro de ejemplo completado y guardado')}else renderMock()}
function renderMock(){let h=head('Simulacro','Exposición seguida por objeciones');if(!mock){main.innerHTML=h+`<section class="card"><h3 class="question">Ensaya una presentación completa sin cambiar de modalidad.</h3><p class="muted">Tiempo de exposición: ${Number(cfg.presentation_limit_seconds)>0?clock(cfg.presentation_limit_seconds)+' (provisional)':'sin límite oficial confirmado'}. No se asume un reglamento no documentado.</p><div class="actions">${btn('Iniciar simulacro','mock-start',true)}</div></section>`;return;}
h+=`<section class="card"><p class="mini-label">Transcurrido <span id="mock-clock">${clock(since(mock.since))}</span> · ${Number(cfg.presentation_limit_seconds)>0?'límite provisional '+clock(cfg.presentation_limit_seconds):'sin límite oficial confirmado'}</p>`;
if(mock.phase==='slides'){let r=data.resources[mock.idx];h+=`<p class="mini-label">Recurso ${mock.idx+1} / ${data.resources.length}</p>${slide(r)}<div class="actions">${btn('Siguiente lámina','mock-next',true)}</div>`}
else {let c=mock.chains[mock.juryIdx];h+=`<p class="mini-label">Examinador ${mock.juryIdx+1} / ${mock.chains.length}</p><span class="tag">${esc(c.examiner)}</span><h3 class="question" style="margin-top:20px">${esc(c.turns[0].prompt)}</h3>`;
if(!mock.branch)h+=`<div class="actions">${btn('Mi respuesta fue incompleta','mock-incomplete')}${btn('Mi respuesta fue suficiente','mock-sufficient',true)}</div>`;
else h+=`<div class="feedback"><b>Repregunta</b><p>${esc(c.turns.find(t=>t.condition===mock.branch)?.prompt)}</p></div><p class="mini-label">Mi evaluación (0–4)</p><div class="score-row">${[0,1,2,3,4].map(x=>`<button class="btn tiny" data-action="mock-grade" data-value="${x}">${x}</button>`).join('')}</div>`}
main.innerHTML=h+'</section>'}
// Guided rehearsal: static synthetic cues and pointer, no real voice or media.
function renderGuide(){let h=head('Ensayo guiado','Timeline sintético (sin audio real)');if(!cfg.guided_enabled){main.innerHTML=h+'<p>Desactivado hasta disponer de audio y guion autorizados.</p>';return}if(!guide)guide={running:false,elapsed:0,started:0};let t=Math.min(59,Math.floor(guide.elapsed));let cue=data.guided.find(x=>t>=x.start&&t<x.end)||data.guided[0];let resource=data.resources.find(x=>x.id===cue.resource_id);
main.innerHTML=h+`<div class="two-col"><section class="card"><div class="guided-stage"><span class="mini-label" style="color:#abbfd3">EJEMPLO SINTÉTICO</span><h3>${esc(resource.title)}</h3><span class="laser" style="left:${cue.x*100}%;top:${cue.y*100}%"></span><div class="prompter">${esc(cue.text)}</div></div><div class="actions">${btn(guide.running?'Pausar':'Reproducir guía','guided-toggle',true)}${btn('Reiniciar','guided-reset')}</div></section><section class="card"><p class="mini-label">Tiempo de muestra</p><div class="clock" id="guided-clock">${clock(guide.elapsed)} / 01:00</div><p class="muted-small">Ni una sola voz o imagen real está incluida. El movimiento sólo prueba coordenadas y tiempos.</p><p class="mini-label" style="margin-top:24px">Segmentos</p>${data.guided.map((c,i)=>`<button class="btn" style="width:100%;margin:5px 0;text-align:left" data-action="guided-jump" data-value="${i}">${clock(c.start)} · ${esc(data.resources.find(r=>r.id===c.resource_id)?.title)}</button>`).join('')}</section></div>`}
function toggleGuide(){if(!guide)return;if(guide.running){guide.elapsed=(Date.now()-guide.started)/1000;guide.running=false}else{guide.started=Date.now()-guide.elapsed*1000;guide.running=true}renderGuide()}
// Metrics are local self-report only; no claims of verified learner proficiency.
function renderProgress(){let h=history(),qs=new Set(h.filter(x=>x.mode==='quiz').map(x=>x.item_id)),rr=new Set(h.filter(x=>x.mode==='resources').map(x=>x.resource_id)),ex=h.filter(x=>x.mode==='exam'),mo=h.filter(x=>x.mode==='mock'&&x.completed);
let cards=[['Preguntas',qs.size+'/'+data.quiz.length,'distintas respondidas'],['Recursos',rr.size+'/'+data.resources.length,'con autoevaluación'],['Tribunal',ex.length,'interrogatorios'],['Simulacros',mo.length,'completados']];main.innerHTML=head('Mi progreso','Autoevaluación local, no certificación')+`<div class="stat-grid">${cards.map(c=>`<div class="stat-card"><p class="mini-label">${c[0]}</p><div class="stat-value">${c[1]}</div><p class="muted-small">${c[2]}</p></div>`).join('')}</div><section class="card" style="margin-top:20px"><p class="mini-label">Actividad reciente</p>${h.length?h.slice(-10).reverse().map(x=>`<p class="muted-small">${esc(x.mode)} · ${esc(x.at.slice(0,16).replace('T',' '))} ${x.score!=null?'· '+x.score+'/4':''}</p>`).join(''):'<p class="muted">Todavía no hay intentos.</p>'}<div class="actions">${btn('Volver a estudiar','progress-study',true)}</div></section>`}
main.addEventListener('click',ev=>{let t=ev.target.closest('[data-action]');if(!t||t.disabled)return;const a=t.dataset.action,v=t.dataset.value;
switch(a){case 'quiz-start':makeQuiz();break;case 'quiz-answer':answer(v);break;case 'quiz-unsure':answer(-1);break;case 'quiz-next':quizNext();break;
case 'resource-prev':pickResource(resIndex-1);break;case 'resource-next':pickResource(resIndex+1);break;case 'resource-start':resStart=Date.now();renderResources();break;case 'resource-rate':rateResource(v);break;
case 'exam-start':startExam();break;case 'exam-incomplete':case 'exam-sufficient':if(exam){exam.branch=a==='exam-incomplete'?'incomplete':'sufficient';renderExam()}break;case 'exam-rate':rateExam(v);break;
case 'mock-start':startMock();break;case 'mock-next':mockSlideNext();break;case 'mock-incomplete':case 'mock-sufficient':if(mock){mock.branch=a==='mock-incomplete'?'incomplete':'sufficient';renderMock()}break;case 'mock-grade':mockGrade(v);break;
case 'guided-toggle':toggleGuide();break;case 'guided-reset':guide={running:false,elapsed:0,started:0};renderGuide();break;case 'guided-jump':if(guide){guide.elapsed=data.guided[Number(v)].start;guide.started=Date.now()-guide.elapsed*1000;renderGuide()}break;
case 'progress-study':show('quiz');break;}});
main.addEventListener('change',ev=>{if(ev.target.id==='resource-select')pickResource(Number(ev.target.value))});
nav.addEventListener('click',ev=>{let t=ev.target.closest('[data-mode]');if(t)show(t.dataset.mode)});
setInterval(()=>{
if(mode==='resources'&&resStart){let x=document.getElementById('resource-clock');if(x)x.textContent=clock(since(resStart))}
if(mode==='exam'&&exam){let x=document.getElementById('exam-clock');if(x)x.textContent=clock(since(exam.since))}
if(mode==='mock'&&mock){let x=document.getElementById('mock-clock');if(x)x.textContent=clock(since(mock.since));if(mock.phase==='slides'&&Number(cfg.presentation_limit_seconds)>0&&since(mock.since)>=Number(cfg.presentation_limit_seconds)){mock.slideSeconds.push(since(mock.slideSince));mock.phase='jury';renderMock()}}
if(mode==='guided'&&guide?.running){let t=(Date.now()-guide.started)/1000;if(t>=60){guide.elapsed=60;guide.running=false;renderGuide()}else{let old=Math.floor(guide.elapsed/20);guide.elapsed=t;if(old!==Math.floor(t/20))renderGuide();else{let x=document.getElementById('guided-clock');if(x)x.textContent=clock(t)+' / 01:00'}}}
},300);
show('quiz');
})();
