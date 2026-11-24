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
if(cfg.focus_audiovisual){
 document.body.classList.add("paos-rehearsal-only");
 nav.querySelectorAll('[data-mode]').forEach(x=>{if(x.dataset.mode!=='guided'){x.hidden=true;x.style.display='none';}});
 const label=document.querySelector('.sidebar-label');
 if(label)label.textContent='PRÁCTICA AUDIOVISUAL';
}
let mode=cfg.focus_audiovisual?'guided':'quiz', quiz=null,resIndex=0,resStart=null,exam=null,mock=null,guide=null,studyTab='mcq',reasoning=null;
function show(m){if(!modes.includes(m)||(cfg.focus_audiovisual&&m!=='guided'))return; if(m!=='guided'&&guide)guide.running=false;if(m!=='guided')window.PAOS_GUIDED_MODULE?.unmount();mode=m;nav.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('active',x.dataset.mode===m));
 if(m==='quiz')renderQuiz();else if(m==='resources')renderResources();else if(m==='exam')renderExam();else if(m==='mock')renderMock();else if(m==='guided')renderGuide();else renderProgress();}
// Quiz: always persist canonical option index, not its visual A-D position.
function reviewAlternatives(q,selected,order){
 if(!Array.isArray(q.option_feedback)||q.option_feedback.length!==4)return '';
 const picked=(selected>=0&&selected<=3)
  ? '<p class="muted-small">Tu respuesta: '+esc(q.option_feedback[selected])+'</p>' : '';
 const rows=order.map((i,visual)=>'<li><b>'+('ABCD'[visual])+(i===q.correct_index?' ✓':'')+'</b> · '+esc(q.option_feedback[i])+'</li>').join('');
 return picked+'<details class="paos-option-feedback"><summary>Por qué cada alternativa es correcta o incorrecta</summary><ol>'+rows+'</ol></details>';
}
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
function renderQuiz(){if(studyTab==='reasoning'){renderReasoning();return}let h=head('Estudiar','Alternativas y explicación');if(!quiz||quiz.pos>=quiz.deck.length){main.innerHTML=h+`<section class="card"><h3 class="question">Comprueba lo que sabes con una sesión corta.</h3><p class="muted">${data.quiz.length} ${isLocal?'preguntas de pilotaje basadas en las notas originales, pendientes de revisión experta':'preguntas ficticias'}. Cuatro alternativas, explicación y memoria de intentos.</p><div class="actions">${btn('Iniciar '+Math.min(data.quiz.length,Number(cfg.quiz_session_size)||10)+' preguntas','quiz-start',true)}${(data.reasoning||[]).length?btn('Razonamiento crítico ('+data.reasoning.length+')','reasoning-start'):''}</div></section>`;return;}
const q=quiz.deck[quiz.pos];h+=`<div class="progress-track"><div class="progress-fill" style="width:${100*quiz.pos/quiz.deck.length}%"></div></div><section class="card"><p class="mini-label">${quiz.pos+1} de ${quiz.deck.length} · ${esc(q.track)}</p><h3 class="question" id="question">${esc(q.stem)}</h3><div class="options">`;
for(const i of quiz.order){const chosen=quiz.choice!==null&&i===quiz.choice,correct=quiz.choice!==null&&i===q.correct_index;const cls=correct?'correct':chosen?'wrong':'';
h+=`<button class="option ${cls}" data-action="quiz-answer" data-value="${i}" ${quiz.choice!==null?'disabled':''}><span class="option-letter">${'ABCD'[quiz.order.indexOf(i)]}</span><span>${esc(q.options[i])}</span></button>`}
h+='</div>';if(quiz.choice===null)h+=`<div class="actions">${btn('No sé todavía','quiz-unsure')}</div>`;
else h+=`<div class="feedback ${quiz.choice===q.correct_index?'correct':''}"><b>${quiz.choice===q.correct_index?'Correcto':'Revisa esta respuesta'}</b><p>${esc(q.explanation)}</p>${reviewAlternatives(q,quiz.choice,quiz.order)}<small>Fuente: ${esc(q.source_ref)}</small></div><div class="actions">${btn(quiz.pos+1===quiz.deck.length?'Finalizar':'Siguiente','quiz-next',true)}</div>`;
main.innerHTML=h+'</section>';}
function answer(i){if(!quiz||quiz.choice!==null)return;let q=quiz.deck[quiz.pos],n=Number(i);if(!Number.isInteger(n)||n< -1||n>3)return;quiz.choice=n;record('quiz',{item_id:q.id,selected_index:n,correct:n===q.correct_index,confidence:n===-1?0:2});renderQuiz()}
function quizNext(){if(!quiz||quiz.choice===null)return;quiz.pos++;quiz.choice=null;quiz.order=shuffle([0,1,2,3]);renderQuiz()}
function startReasoning(){
 const approved=(data.reasoning||[]).filter(x=>x.review_status==='approved'||(isLocal&&x.review_status==='pilot_draft'));
 if(!approved.length){notice('No hay retos de razonamiento disponibles');return}
 studyTab='reasoning';reasoning={deck:shuffle(approved),pos:0,show:false,draft:'',started:Date.now()};renderReasoning();
}
function renderReasoning(){
 let h=head('Razonamiento crítico','Preguntas abiertas · autoevaluación, sin IA evaluadora');
 if(!reasoning||reasoning.pos>=reasoning.deck.length){
   main.innerHTML=h+'<section class="card"><p>Los retos de razonamiento se basan en fragmentos originales. Debes comprobar la calidad de la respuesta; no equivalen a corrección académica.</p><div class="actions">'+btn('Comenzar','reasoning-start',true)+btn('Volver a alternativas','reasoning-back')+'</div></section>';return;
 }
 const q=reasoning.deck[reasoning.pos];
 h+='<section class="card"><p class="mini-label">'+(reasoning.pos+1)+' / '+reasoning.deck.length+' · '+esc(q.domain||'evidencia')+' · borrador sin revisión experta</p>';
 h+='<h3 class="question">'+esc(q.stem)+'</h3><small>Fuente: '+esc(q.source_ref)+'</small>';
 if(!reasoning.show)h+='<label class="mini-label" for="reasoning-answer">Tu respuesta (no se guarda el texto)</label><textarea id="reasoning-answer" rows="5" style="width:100%;margin-top:10px">'+esc(reasoning.draft)+'</textarea><div class="actions">'+btn('Ver criterios para evaluarme','reasoning-show',true)+btn('Volver a alternativas','reasoning-back')+'</div>';
 else {h+='<div class="feedback"><b>Criterios para revisar tu respuesta</b><ol>'+q.rubric.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ol><p>La aplicación no juzga tu respuesta. Evalúa con rigor tu propia argumentación.</p></div>';
 h+='<p class="mini-label">Mi evaluación (0–4)</p><div class="score-row">'+[0,1,2,3,4].map(x=>'<button class="btn tiny" data-action="reasoning-rate" data-value="'+x+'">'+x+'</button>').join('')+'</div>';}
 main.innerHTML=h+'</section>';
}
function rateReasoning(value){
 if(!reasoning||!reasoning.show)return;const q=reasoning.deck[reasoning.pos];
 record('reasoning',{item_id:q.id,resource_id:q.resource_id,score:Number(value),seconds:since(reasoning.started),self_assessed:true});
 reasoning.pos++;reasoning.show=false;reasoning.draft='';reasoning.started=Date.now();renderReasoning();
}
// Resource viewer: demo visual is explicitly synthetic; real presentation must come from private Storage.
function renderResources(){const r=data.resources[resIndex];main.innerHTML=head('Por recurso','Práctica cronometrada')+`<div class="two-col"><section class="card"><p class="mini-label">${isLocal?'Diapositiva auténtica · fuente local':'Diapositiva ficticia del piloto'}</p>${slide(r)}<div class="actions">${btn('Anterior','resource-prev')}${btn('Siguiente','resource-next')}</div></section><section class="card side-controls"><label class="mini-label" for="resource-select">Seleccionar recurso</label><select id="resource-select">${data.resources.map((v,i)=>`<option value="${i}" ${i===resIndex?'selected':''}>${esc(v.title)}</option>`).join('')}</select><p class="mini-label" style="margin-top:24px">Tiempo</p><div class="clock" id="resource-clock">${clock(since(resStart))}</div><div class="actions">${btn(resStart?'Reiniciar':'Comenzar exposición','resource-start',true)}</div><details style="margin-top:20px"><summary>${isLocal?'Mostrar guion original de la lámina':'Mostrar pistas'}</summary><p style="white-space:pre-wrap">${esc(isLocal?r.script:r.hints)}</p><p class="muted-small">${esc(r.source_ref||'Ejemplo sintético')}${isLocal?' · Sin revisión de especialista':''}</p>${isLocal?'':'<p class="muted-small">Evita: '+esc(r.pitfall)+'</p>'}</details><p class="mini-label" style="margin-top:23px">Mi evaluación (0–4)</p><div class="score-row">${[0,1,2,3,4].map(x=>`<button class="btn tiny" data-action="resource-rate" data-value="${x}">${x}</button>`).join('')}</div><p class="muted-small">No hay evaluación automática de voz.</p></section></div>`}
function pickResource(index){resIndex=(index+data.resources.length)%data.resources.length;resStart=null;renderResources()}
function rateResource(x){record('resources',{resource_id:data.resources[resIndex].id,score:Number(x),seconds:since(resStart)});resStart=null;renderResources();notice('Ensayo guardado localmente')}
// Audience: simulated participants with source-grounded roles, not real people.
function juryVisual(profiles,active=0){
 const names=[...new Set(profiles.filter(Boolean).map(String))].slice(0,5);
 return '<div class="paos-jury" aria-label="Público simulado de entrenamiento">'+
 names.map((x,i)=>'<div class="paos-juror"><div class="paos-juror-avatar" aria-hidden="true">👤</div><strong>'+esc(x)+
 '</strong><small>'+(i===active?'Pregunta ahora':'Escuchando')+'</small></div>').join('')+
 '<div class="paos-jury-note">Público simulado para practicar preguntas; sin fotografías reales ni reconocimiento de voz.</div></div>';
}
// Audience Q&A: no automatic assessment of spoken answers.
function startExam(){exam={chain:shuffle(data.exam)[0],since:Date.now(),branch:null};renderExam()}
function renderExam(){let h=head('Preguntas del público','Respuestas y repreguntas');if(!exam){main.innerHTML=h+`<section class="card"><h3 class="question">Practica cómo responder a una pregunta del público y elige la repregunta que corresponda.</h3><p class="muted">El público es simulado; la aplicación no escucha ni entiende tu respuesta. ${isLocal?'Las preguntas se basan en la presentación real, pero esperan revisión experta.':''}</p><div class="actions">${btn('Empezar preguntas','exam-start',true)}</div></section>`;return;}
const c=exam.chain;h+=`<section class="card">${juryVisual(data.exam.map(x=>x.examiner),Math.max(0,[...new Set(data.exam.map(x=>x.examiner))].indexOf(c.examiner)))}<span class="tag">${esc(c.examiner)}</span><span class="tag">${esc(c.topic)}</span><p class="mini-label" style="margin-top:24px">Pregunta inicial</p><h3 class="question">${esc(c.turns[0].prompt)}</h3><p class="muted-small">Tiempo <span id="exam-clock">${clock(since(exam.since))}</span></p>`;
if(!exam.branch)h+=`<div class="actions">${btn('Respuesta incompleta','exam-incomplete')}${btn('Respuesta suficiente','exam-sufficient',true)}</div>`;
else {const t=c.turns.find(t=>t.condition===exam.branch);h+=`<div class="feedback"><b>Repregunta</b><p>${esc(t?.prompt||'¿Por qué?')}</p></div><details><summary>Estrategia sugerida</summary><p>${esc(c.strategy)}</p></details><p class="mini-label" style="margin-top:23px">Mi evaluación (0–4)</p><div class="score-row">${[0,1,2,3,4].map(x=>`<button class="btn tiny" data-action="exam-rate" data-value="${x}">${x}</button>`).join('')}</div>`}
main.innerHTML=h+'</section>'}
function rateExam(x){record('exam',{chain_id:exam.chain.id,score:Number(x),branch:exam.branch,seconds:since(exam.since)});exam=null;renderExam();notice('Práctica de preguntas guardada localmente')}
// Mock: a deterministic state machine over slides and audience questions, not a fourth question bank.
function startMock(){const count=Math.max(1,Math.min(data.exam.length,Number(cfg.mock_examiner_count)||3));mock={since:Date.now(),phase:'slides',idx:0,slideSince:Date.now(),slideSeconds:[],chains:shuffle(data.exam).slice(0,count),juryIdx:0,branch:null,grades:[]};renderMock()}
function mockSlideNext(){if(!mock||mock.phase!=='slides')return;mock.slideSeconds.push(since(mock.slideSince));mock.idx++;mock.slideSince=Date.now();if(mock.idx>=data.resources.length)mock.phase='jury';renderMock()}
function mockGrade(x){if(!mock||mock.phase!=='jury'||!mock.branch)return;mock.grades.push({chain_id:mock.chains[mock.juryIdx].id,score:Number(x),branch:mock.branch});mock.juryIdx++;mock.branch=null;if(mock.juryIdx>=mock.chains.length){record('mock',{duration_seconds:since(mock.since),slide_seconds:mock.slideSeconds,grades:mock.grades,completed:true});mock=null;renderMock();notice('Simulacro de ejemplo completado y guardado')}else renderMock()}
function renderMock(){let h=head('Simulacro','Presentación seguida de preguntas');if(!mock){main.innerHTML=h+`<section class="card"><h3 class="question">Ensaya una presentación completa sin cambiar de modalidad.</h3><p class="muted">Tiempo de exposición: ${Number(cfg.presentation_limit_seconds)>0?clock(cfg.presentation_limit_seconds)+' (provisional)':'sin límite oficial confirmado'}. No se asume un reglamento no documentado.</p><div class="actions">${btn('Iniciar simulacro','mock-start',true)}</div></section>`;return;}
h+=`<section class="card"><p class="mini-label">Transcurrido <span id="mock-clock">${clock(since(mock.since))}</span> · ${Number(cfg.presentation_limit_seconds)>0?'límite provisional '+clock(cfg.presentation_limit_seconds):'sin límite oficial confirmado'}</p>`;
if(mock.phase==='slides'){let r=data.resources[mock.idx];h+=`<p class="mini-label">Recurso ${mock.idx+1} / ${data.resources.length}</p>${slide(r)}<div class="actions">${btn('Siguiente lámina','mock-next',true)}</div>`}
else {let c=mock.chains[mock.juryIdx];h+=juryVisual(mock.chains.map(x=>x.examiner),mock.juryIdx)+`<p class="mini-label">Participante ${mock.juryIdx+1} / ${mock.chains.length}</p><span class="tag">${esc(c.examiner)}</span><h3 class="question" style="margin-top:20px">${esc(c.turns[0].prompt)}</h3>`;
if(!mock.branch)h+=`<div class="actions">${btn('Mi respuesta fue incompleta','mock-incomplete')}${btn('Mi respuesta fue suficiente','mock-sufficient',true)}</div>`;
else h+=`<div class="feedback"><b>Repregunta</b><p>${esc(c.turns.find(t=>t.condition===mock.branch)?.prompt)}</p></div><p class="mini-label">Mi evaluación (0–4)</p><div class="score-row">${[0,1,2,3,4].map(x=>`<button class="btn tiny" data-action="mock-grade" data-value="${x}">${x}</button>`).join('')}</div>`}
main.innerHTML=h+'</section>'}
// Guided rehearsal: static synthetic cues and pointer, no real voice or media.
function renderGuide(){if(cfg.guided_real&&window.PAOS_GUIDED_MODULE){window.PAOS_GUIDED_MODULE.mount(main,cfg,window.PAOS_GUIDED_DATA,data.resources);return}let h=head('Ensayo guiado','Timeline sintético (sin audio real)');if(!cfg.guided_enabled){
  const first=cfg.focus_audiovisual?
    '<section class="card"><h3>Primero: escuchar y aprobar la voz</h3>'+
    '<p>No se ha producido el video hasta comprobar que la voz y los términos científicos suenan correctamente.</p>'+
    '<div class="actions">'+
    (cfg.voice_preview_available?
      '<a class="btn primary" href="../../../private/VOICE_PREVIEW/index.html">Escuchar dos muestras francesas</a>':
      '<p>Prepara primero dos muestras con el comando voice-preview.</p>')+
    '<a class="btn" href="../../../private/extracted/ORAL_SCRIPT_REVIEW.html">Revisar las 14 láminas y el guion</a>'+
    '</div><p class="muted-small">La práctica con audio y el video se activarán tras la aprobación de voz y la narración.</p></section>':
    '<p>Desactivado hasta disponer de audio y guion autorizados.</p>';
  main.innerHTML=h+first;return}if(!guide)guide={running:false,elapsed:0,started:0};let t=Math.min(59,Math.floor(guide.elapsed));let cue=data.guided.find(x=>t>=x.start&&t<x.end)||data.guided[0];let resource=data.resources.find(x=>x.id===cue.resource_id);
main.innerHTML=h+`<div class="two-col"><section class="card"><div class="guided-stage"><span class="mini-label" style="color:#abbfd3">EJEMPLO SINTÉTICO</span><h3>${esc(resource.title)}</h3><span class="laser" style="left:${cue.x*100}%;top:${cue.y*100}%"></span><div class="prompter">${esc(cue.text)}</div></div><div class="actions">${btn(guide.running?'Pausar':'Reproducir guía','guided-toggle',true)}${btn('Reiniciar','guided-reset')}</div></section><section class="card"><p class="mini-label">Tiempo de muestra</p><div class="clock" id="guided-clock">${clock(guide.elapsed)} / 01:00</div><p class="muted-small">Ni una sola voz o imagen real está incluida. El movimiento sólo prueba coordenadas y tiempos.</p><p class="mini-label" style="margin-top:24px">Segmentos</p>${data.guided.map((c,i)=>`<button class="btn" style="width:100%;margin:5px 0;text-align:left" data-action="guided-jump" data-value="${i}">${clock(c.start)} · ${esc(data.resources.find(r=>r.id===c.resource_id)?.title)}</button>`).join('')}</section></div>`}
function toggleGuide(){if(!guide)return;if(guide.running){guide.elapsed=(Date.now()-guide.started)/1000;guide.running=false}else{guide.started=Date.now()-guide.elapsed*1000;guide.running=true}renderGuide()}
// Metrics are local self-report only; no claims of verified learner proficiency.
function renderProgress(){let h=history(),qs=new Set(h.filter(x=>x.mode==='quiz').map(x=>x.item_id)),rr=new Set(h.filter(x=>x.mode==='resources').map(x=>x.resource_id)),ex=h.filter(x=>x.mode==='exam'),mo=h.filter(x=>x.mode==='mock'&&x.completed);
let deep=new Set(h.filter(x=>x.mode==='reasoning').map(x=>x.item_id));
let cards=[['Preguntas',qs.size+'/'+data.quiz.length,'distintas respondidas'],['Recursos',rr.size+'/'+data.resources.length,'con autoevaluación'],['Preguntas del público',ex.length,'rondas de preguntas'],['Simulacros',mo.length,'completados']];
if((data.reasoning||[]).length)cards.splice(1,0,['Razonamiento',deep.size+'/'+data.reasoning.length,'autoevaluados']);main.innerHTML=head('Mi progreso','Autoevaluación local, no certificación')+`<div class="stat-grid">${cards.map(c=>`<div class="stat-card"><p class="mini-label">${c[0]}</p><div class="stat-value">${c[1]}</div><p class="muted-small">${c[2]}</p></div>`).join('')}</div><section class="card" style="margin-top:20px"><p class="mini-label">Actividad reciente</p>${h.length?h.slice(-10).reverse().map(x=>`<p class="muted-small">${esc(x.mode)} · ${esc(x.at.slice(0,16).replace('T',' '))} ${x.score!=null?'· '+x.score+'/4':''}</p>`).join(''):'<p class="muted">Todavía no hay intentos.</p>'}<div class="actions">${btn('Volver a estudiar','progress-study',true)}</div></section>`}
main.addEventListener('click',ev=>{let t=ev.target.closest('[data-action]');if(!t||t.disabled)return;const a=t.dataset.action,v=t.dataset.value;
switch(a){case 'quiz-start':studyTab='mcq';makeQuiz();break;case 'reasoning-start':startReasoning();break;case 'reasoning-back':studyTab='mcq';reasoning=null;renderQuiz();break;case 'reasoning-show':if(reasoning){reasoning.draft=document.getElementById('reasoning-answer')?.value||'';reasoning.show=true;renderReasoning()}break;case 'reasoning-rate':rateReasoning(v);break;case 'quiz-answer':answer(v);break;case 'quiz-unsure':answer(-1);break;case 'quiz-next':quizNext();break;
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
show(cfg.focus_audiovisual?'guided':'quiz');
})();
