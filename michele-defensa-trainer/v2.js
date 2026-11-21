"use strict";
/* Academia M v2: all thesis-specific content comes from member-only Supabase RLS
   tables and the PRIVATE Storage bucket. Never bundle corpus/photos in Pages. */
(() => {
  const $ = id => document.getElementById(id);
  const all = sel => [...document.querySelectorAll(sel)];
  const cfg = window.ACADEMIA_CONFIG || {};
  const base = String(cfg.url||"").replace(/\/$/,"");
  const key = String(cfg.publishableKey||"");
  const SESSION_KEY="academia-m-session-v1";
  const BUCKET="academia-v6-private";
  const state={
    session:null,me:null,role:null,slides:[],mcqs:[],mcqAttempts:[],
    chains:[],slideAttempts:[],tribunalAttempts:[],mockRuns:[],
    images:new Map(),mode:"quiz",demo:false,
    quiz:{deck:[],index:0,selection:null,correct:0,seed:0},
    slide:1,slideTimer:{elapsed:0,started:null},
    examiner:"any",tribunal:{chain:null,turn:0,started:null,usedHelp:false},
    mock:null, tick:null
  };
  const titles={quiz:"ESTUDIAR",slides:"POR LÁMINA",tribunal:"TRIBUNAL",mock:"SIMULACRO",progress:"MI PROGRESO"};
  const examinerTitles={dogmatica:"Dogmática penal",jurisprudencia:"Jurisprudencia",metodologia:"Metodología"};
  function text(id,value){ const e=$(id); if(e)e.textContent=String(value??""); }
  function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,k=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[k]));}
  function alertUser(message){const box=$("alert");box.textContent=message;box.hidden=false;clearTimeout(alertUser.timer);alertUser.timer=setTimeout(()=>box.hidden=true,4500);}
  function showError(message){$("loading").hidden=true;$("studio").hidden=true;$("error-screen").hidden=false;text("error-text",message);}
  function showOnly(ids,chosen){ids.forEach(id=>$(id).hidden=id!==chosen);}
  function formatSecs(n){const s=Math.max(0,Math.floor(n));return String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0");}
  function rand(seed){let t=seed>>>0;return ()=>{t+=0x6D2B79F5;let x=t;x=Math.imul(x^(x>>>15),x|1);x^=x+Math.imul(x^(x>>>7),x|61);return ((x^(x>>>14))>>>0)/4294967296;};}
  function shuffle(items,random){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
  function rememberSession(value){state.session=value;try{sessionStorage.setItem(SESSION_KEY,JSON.stringify(value));}catch{}}
  async function refreshToken(){
    if(!state.session?.refresh_token)throw new Error("Sesión caducada. Inicia sesión otra vez.");
    const r=await fetch(base+"/auth/v1/token?grant_type=refresh_token",{method:"POST",headers:{"apikey":key,"Content-Type":"application/json"},body:JSON.stringify({refresh_token:state.session.refresh_token}),cache:"no-store"});
    if(!r.ok)throw new Error("No se pudo renovar tu sesión.");
    const j=await r.json();j.expires_at=Math.floor(Date.now()/1000)+Number(j.expires_in||3600);
    rememberSession(j);return j.access_token;
  }
  async function token(){
    if(!state.session?.access_token)throw new Error("Primero debes iniciar sesión.");
    if(state.session.expires_at && state.session.expires_at<Date.now()/1000+75)return refreshToken();
    return state.session.access_token;
  }
  async function request(path,method="GET",body=null,headers={},retry=true){
    if(state.demo)throw new Error("Vista de ejemplo sin datos académicos.");
    const t=await token();
    const opts={method,cache:"no-store",headers:{"apikey":key,"Authorization":"Bearer "+t,...headers}};
    if(body!==null){opts.headers["Content-Type"]="application/json";opts.body=JSON.stringify(body);}
    const r=await fetch(base+path,opts);
    if(r.status===401 && retry){await refreshToken();return request(path,method,body,headers,false);}
    if(!r.ok){let detail="";try{const j=await r.json();detail=j.message||j.error||j.msg||"";}catch{}
      throw new Error("Servicio privado "+r.status+(detail?": "+detail:""));}
    if(r.status===204)return null;
    if(r.headers.get("content-type")?.includes("json"))return r.json();
    return r;
  }
  function table(name,columns="*",extra=""){return request("/rest/v1/"+name+"?select="+encodeURIComponent(columns)+extra);}
  function insert(name,values){return request("/rest/v1/"+name,"POST",values,{"Prefer":"return=representation"});}
  async function logActivity(event_type){
    if(state.demo||!state.me)return;
    try{await insert("activity_events",{event_type});}
    catch(e){console.warn("No se guardó marca de actividad:",e.message);}
  }
  async function start(){
    try{
      if(new URLSearchParams(location.search).has("demo")){
        state.demo=true;
        // Synthetic examples never claim to be drawn from Michele's legal research.
        state.slides=Array.from({length:11},(_,i)=>({slide:i+1,title:"Ejemplo de lámina "+String(i+1).padStart(2,"0"),explainer:"En producción, aquí se muestra la pauta privada.",pitfall:"Vista demostrativa sin fuentes académicas reales."}));
        state.mcqs=[{id:"M000",slide:1,area:"Ejemplo ficticio",level:"Inicial",
          stem:"¿Qué conviene hacer cuando una afirmación excede la evidencia?",
          options:["Reconocer el límite de la evidencia","Afirmar que está probada","Cambiar la pregunta","Omitir la fuente"],
          correct_index:0,explanation:"Una defensa sólida reconoce exactamente lo que las fuentes permiten concluir.",source_reference:"Ejemplo ilustrativo (no es la tesis)",review_status:"reviewed"}];
        state.chains=[
          {id:"T000",examiner:"metodologia",area:"Ejemplo ficticio",level:"Intermedia",turns:[{prompt:"¿Cómo definirías el alcance de una afirmación?"},{prompt:"¿Qué límite reconocerías ante un contraejemplo?",condition:"incomplete"},{prompt:"¿Qué evidencia permitiría sostener tu afirmación?",condition:"sufficient"}],strategy:"Distingue afirmación y justificación.",source_reference:"Ejemplo ficticio",review_status:"reviewed"},
          {id:"T001",examiner:"dogmatica",area:"Ejemplo ficticio",level:"Intermedia",turns:[{prompt:"¿Qué supuesto justifica una categoría?"},{prompt:"¿Cómo comprobarías una excepción?",condition:"incomplete"},{prompt:"¿Por qué esa categoría no se aplicaría a otro supuesto?",condition:"sufficient"}],strategy:"Explicita la premisa y sus condiciones.",source_reference:"Ejemplo ficticio",review_status:"reviewed"},
          {id:"T002",examiner:"jurisprudencia",area:"Ejemplo ficticio",level:"Intermedia",turns:[{prompt:"¿Cómo compararías dos decisiones divergentes?"},{prompt:"¿Qué diferencia factual sería decisiva?",condition:"incomplete"},{prompt:"¿Qué elemento de ambas resoluciones deberías cotejar?",condition:"sufficient"}],strategy:"No atribuyas hechos a fuentes sin leer.",source_reference:"Ejemplo ficticio",review_status:"reviewed"}
        ];
        state.role="student";state.me={id:"demo",email:"demo@ejemplo"};
      }else{
        if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base)||!key)throw new Error("Falta configurar Supabase.");
        try{state.session=JSON.parse(sessionStorage.getItem(SESSION_KEY)||"null");}catch{state.session=null;}
        if(!state.session?.access_token)throw new Error("Entra primero en tu academia desde la pantalla de acceso.");
        const person=await request("/auth/v1/user");
        if(!person?.id)throw new Error("No se pudo identificar tu cuenta.");
        state.me={id:person.id,email:person.email};
        const roleRows=await table("member_roles","role","&user_id=eq."+encodeURIComponent(person.id));
        state.role=roleRows?.[0]?.role;
        if(!["admin","student"].includes(state.role))throw new Error("La cuenta todavía no está autorizada para entrenar.");
        const mine="&user_id=eq."+encodeURIComponent(person.id);
        const [slides,mcqs,attempts,chains,slideAttempts,tribAttempts,mockRuns]=await Promise.all([
          table("slide_guides","*","&order=slide.asc"),
          table("mcq_items","*","&review_status=eq.reviewed&order=id.asc"),
          table("mcq_attempts","item_id,selected_index,confidence,created_at",mine+"&order=created_at.desc&limit=4000"),
          table("tribunal_chains","*","&review_status=eq.reviewed&order=id.asc"),
          table("slide_rehearsals","slide,score,seconds,created_at",mine+"&order=created_at.desc&limit=400"),
          table("tribunal_attempts","chain_id,score,seconds,used_help,created_at",mine+"&order=created_at.desc&limit=400"),
          table("mock_runs","duration_seconds,slide_seconds,chain_ids,self_scores,created_at",mine+"&order=created_at.desc&limit=30")
        ]);
        Object.assign(state,{slides,mcqs,mcqAttempts:attempts,chains,slideAttempts,tribunalAttempts:tribAttempts,mockRuns});
      }
      if(state.demo){
        // The karaoke has no fictitious multimedia and must not pretend to be real.
        for(const id of ["karaoke-link","mock-guided-link"]){
          const link=$(id);
          link.addEventListener("click",e=>{
            e.preventDefault();
            alertUser("La simulación guiada requiere una cuenta autorizada y los 17 medios privados.");
          });
        }
      }
      if(state.demo){
        // The karaoke has no fictitious multimedia and must not pretend to be real.
        for(const id of ["karaoke-link","mock-guided-link"]){
          const link=$(id);
          link.addEventListener("click",e=>{
            e.preventDefault();
            alertUser("La simulación guiada requiere una cuenta autorizada y los 17 medios privados.");
          });
        }
      }
      if(state.demo){
        // The karaoke has no fictitious multimedia and must not pretend to be real.
        for(const id of ["karaoke-link","mock-guided-link"]){
          const link=$(id);
          link.addEventListener("click",e=>{
            e.preventDefault();
            alertUser("La simulación guiada requiere una cuenta autorizada y los 17 medios privados.");
          });
        }
      }
      state.slides.sort((a,b)=>a.slide-b.slide);
      if(state.slides.length!==11)throw new Error("Las 11 guías privadas aún no están disponibles.");
      text("identity",state.demo?"Vista de ejemplo":state.role==="admin"?"Administrador":"Estudiante");
      $("admin-tools").hidden=state.role!=="admin";
      $("loading").hidden=true;$("studio").hidden=false;
      fillSlideSelect();
      void logActivity("app_open");
      showMode(new URLSearchParams(location.search).get("mode")||"quiz",false);
      state.tick=setInterval(updateClocks,250);
    }catch(e){showError(e.message);}
  }
  function showMode(mode,guard=true){
    if(!titles[mode])mode="quiz";
    if(guard && state.mock && !state.mock.finished && state.mode==="mock" && mode!=="mock"){
      if(!window.confirm("Abandonar el simulacro actual sin guardar una sesión incompleta?"))return;
      state.mock=null;
    }
    state.mode=mode;
    all(".mode-pane").forEach(p=>p.hidden=p.id!=="mode-"+mode);
    all("[data-mode]").forEach(b=>b.classList.toggle("selected",b.dataset.mode===mode));
    text("mode-breadcrumb",titles[mode]);
    if(mode==="slides")renderSlide();
    if(mode==="quiz"){text("quiz-coverage",state.demo?"Ejemplo":state.mcqs.length+" ítems revisados");}
    if(mode==="tribunal")renderTribunalIdle();
    if(mode==="mock")renderMock();
    if(mode==="progress")renderProgress();
  }
  function scoreOrder(m){
    const attempts=state.mcqAttempts.filter(a=>a.item_id===m.id);
    if(!attempts.length)return 10000;
    const last=attempts[0];
    const wrong=last.selected_index!==m.correct_index;
    const days=Math.max(0,(Date.now()-Date.parse(last.created_at||0))/86400000);
    // Wrong/unsure items recur after 1 day; confident ones after 7–14 days.
    const due=(wrong||last.confidence<3)?days>=1:days>=(last.confidence===4?14:7);
    return (due?5000:0)+(wrong?2000:0)+(last.confidence<=1?1500:0)+Math.min(100,days);
  }
  function shuffleInPlace(items,random){
    for(let i=items.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[items[i],items[j]]=[items[j],items[i]];}
    return items;
  }
  function chooseQuizDeck(){
    const pool=state.mcqs.filter(x=>Array.isArray(x.options)&&x.options.length===4&&Number.isInteger(x.correct_index));
    const seed=Math.floor(Math.random()*2**32);
    const random=rand(seed);
    const userId=state.me?.id||"demo";
    const historyKey="academia-v2-quiz-history-v2-"+userId;
    // Remember FOUR recent decks, not only the last one. Keep the legacy
    // last-deck entry as an initial migration to avoid immediate repetitions.
    let history=[];
    try{
      const raw=JSON.parse(localStorage.getItem(historyKey)||"null");
      if(Array.isArray(raw))history=raw.filter(x=>Array.isArray(x)).slice(0,4);
      else{
        const old=JSON.parse(localStorage.getItem("academia-v2-lastquiz-"+userId)||"[]");
        if(Array.isArray(old)&&old.length)history=[old];
      }
    }catch{}
    const recent=new Map();
    history.forEach((deck,age)=>deck.forEach(id=>{
      if(!recent.has(id))recent.set(id,age);
    }));
    // Prioritize new questions and due errors. Penalize only recent decks,
    // in descending order; when the bank is exhausted, older cards return.
    const penalties=[18000,12000,6000,2500];
    const sorted=shuffle(pool,random).sort((a,b)=>{
      const priority=q=>scoreOrder(q)-(recent.has(q.id)?penalties[recent.get(q.id)]:0);
      return priority(b)-priority(a);
    });
    // A useful 10-question session mixes doctrinal source items with applied
    // hypotheticals. Do not serve two variants of the same hypothetical in
    // one session (each fictional scene has six distinct OP exercises).
    const deck=[];
    const pickedIds=new Set();
    const sceneIds=new Set();
    const add=(item)=>{
      if(pickedIds.has(item.id))return false;
      const id=Number(item.id.slice(1));
      if(id>60){
        const scene=Math.floor((id-61)/6);
        if(sceneIds.has(scene))return false;
        sceneIds.add(scene);
      }
      pickedIds.add(item.id);deck.push(item);return true;
    };
    const doctrinal=sorted.filter(q=>Number(q.id.slice(1))<=60);
    const applied=sorted.filter(q=>Number(q.id.slice(1))>60);
    for(const q of doctrinal){if(deck.length>=5)break;add(q);}
    let caseCount=0;
    for(const q of applied){if(caseCount>=5)break;if(add(q))caseCount++;}
    // If one pool is smaller, fill from the other while keeping scene variety.
    for(const q of sorted){if(deck.length>=10)break;add(q);}
    shuffleInPlace(deck,random);
    if(deck.length){
      history.unshift(deck.map(x=>x.id));
      try{localStorage.setItem(historyKey,JSON.stringify(history.slice(0,4)));}catch{}
    }
    return {deck,seed};
  }
  function startQuiz(){
    const picked=chooseQuizDeck();
    if(!picked.deck.length){alertUser("Todavía no hay alternativas aprobadas. El banco de 60 preguntas orales no se ha convertido automáticamente en MCQ.");return;}
    state.quiz={...picked,index:0,selection:null,correct:0};
    void logActivity("practice_started");
    showOnly(["quiz-idle","quiz-live","quiz-finish"],"quiz-live");
    renderQuiz();
  }
  function renderQuiz(){
    const q=state.quiz.deck[state.quiz.index];
    if(!q){finishQuiz();return;}
    text("quiz-number","PREGUNTA "+(state.quiz.index+1)+" / "+state.quiz.deck.length);
    text("quiz-area",q.area+" · "+q.level);
    text("quiz-question",q.stem);
    $("quiz-feedback").hidden=true;
    const choices=$("quiz-options");choices.replaceChildren();
    const labels=["A","B","C","D"];
    // Presentation-only shuffle: persist the CANONICAL answer index so
    // previous attempts and spaced-repetition scoring remain compatible.
    const optionSeed=(state.quiz.seed + Math.imul(state.quiz.index+1,2654435761))>>>0;
    state.quiz.optionOrder=shuffle([0,1,2,3],rand(optionSeed));
    state.quiz.optionOrder.forEach((canonical,index)=>{
      const button=document.createElement("button");button.type="button";
      button.innerHTML="<b>"+labels[index]+"</b><span></span>";
      button.querySelector("span").textContent=q.options[canonical];
      button.addEventListener("click",()=>chooseQuizAnswer(canonical));
      choices.appendChild(button);
    });
    const unsure=document.createElement("button");unsure.type="button";
    unsure.innerHTML="<b>?</b><span>No sé todavía</span>";
    unsure.addEventListener("click",()=>chooseQuizAnswer(-1));
    choices.appendChild(unsure);
    $("quiz-confidence").value="2";
  }
  function chooseQuizAnswer(answer){
    if(state.quiz.selection!==null)return;
    state.quiz.selection=answer;
    const q=state.quiz.deck[state.quiz.index];
    if(answer===q.correct_index)state.quiz.correct++;
    all("#quiz-options button").forEach((b,index)=>{
      b.disabled=true;
      const canonical=state.quiz.optionOrder[index];
      if(canonical===q.correct_index)b.classList.add("correct");
      if(canonical===answer&&answer!==q.correct_index)b.classList.add("incorrect");
    });
    const correctDisplayIndex=state.quiz.optionOrder.indexOf(q.correct_index);
    text("quiz-result",answer===q.correct_index?"Correcta":"La opción mejor sustentada es "+["A","B","C","D"][correctDisplayIndex]);
    text("quiz-explanation",q.explanation);
    text("quiz-reference","Fuente: "+q.source_reference);
    $("quiz-feedback").hidden=false;
    text("quiz-next",state.quiz.index+1===state.quiz.deck.length?"Terminar sesión":"Guardar y continuar");
  }
  async function nextQuiz(){
    if(state.quiz.selection===null)return;
    const q=state.quiz.deck[state.quiz.index],selection=state.quiz.selection;
    const confidence=Number($("quiz-confidence").value);
    if(!state.demo){
      try{
        await insert("mcq_attempts",{item_id:q.id,selected_index:selection,confidence});
        state.mcqAttempts.unshift({item_id:q.id,selected_index:selection,confidence,created_at:new Date().toISOString()});
      }catch(e){alertUser("No se pudo guardar esta respuesta: "+e.message);return;}
    }
    if(state.demo)state.mcqAttempts.unshift({item_id:q.id,selected_index:selection,confidence,created_at:new Date().toISOString()});
    void logActivity("practice_completed");
    state.quiz.index++;state.quiz.selection=null;
    if(state.quiz.index>=state.quiz.deck.length)finishQuiz();else renderQuiz();
  }
  function finishQuiz(){
    showOnly(["quiz-idle","quiz-live","quiz-finish"],"quiz-finish");
    text("quiz-summary",state.quiz.correct+" de "+state.quiz.deck.length+" alternativas correctas. Los errores y niveles de confianza se usan para repasar en futuras sesiones, sin convertir un acierto aislado en dominio.");
  }

  function fillSlideSelect(){
    const select=$("slide-select");select.replaceChildren();
    for(const s of state.slides){const o=document.createElement("option");o.value=s.slide;o.textContent=String(s.slide).padStart(2,"0")+" · "+s.title;select.appendChild(o);}
  }
  async function loadPrivateImage(slide,imageId,loadingId){
    const img=$(imageId),loading=$(loadingId);
    if(state.demo){img.hidden=true;loading.hidden=false;loading.textContent="Vista ilustrativa · imagen auténtica reservada";return;}
    try{
      let url=state.images.get(slide);
      if(!url){
        const name="slides/slide-"+String(slide).padStart(2,"0")+".png";
        const response=await request("/storage/v1/object/authenticated/"+BUCKET+"/"+name);
        const blob=await response.blob();
        if(!blob.type.startsWith("image/"))throw new Error("Formato de imagen incorrecto");
        url=URL.createObjectURL(blob);
        state.images.set(slide,url);
      }
      // Avoid showing a delayed older slide after fast navigation.
      if(imageId==="slide-image" && state.slide!==slide)return;
      if(imageId==="mock-image" && state.mock?.slide!==slide)return;
      img.src=url;img.hidden=false;loading.hidden=true;
    }catch(e){
      img.hidden=true;loading.hidden=false;
      loading.textContent="Imagen protegida pendiente de carga en Supabase. No se utilizará una lámina inventada.";
    }
  }
  function slideElapsed(){return state.slideTimer.elapsed+(state.slideTimer.started===null?0:(Date.now()-state.slideTimer.started)/1000);}
  function stopSlideTimer(){if(state.slideTimer.started!==null){state.slideTimer.elapsed=slideElapsed();state.slideTimer.started=null;}}
  function renderSlide(){
    const guide=state.slides.find(x=>x.slide===state.slide);
    if(!guide)return;
    text("slide-title",guide.title);
    text("slide-kicker",String(state.slide).padStart(2,"0"));
    text("slide-explainer",guide.explainer);
    text("slide-pitfall",guide.pitfall);
    text("slide-reference",guide.reference||"");
    text("slide-clock",formatSecs(slideElapsed()));
    $("slide-select").value=String(state.slide);
    $("slide-prev").disabled=state.slide<=1;$("slide-next").disabled=state.slide>=11;
    $("slide-hints").hidden=true;text("slide-reveal","Mostrar pistas");
    void loadPrivateImage(state.slide,"slide-image","slide-loading");
    const last=state.slideAttempts.find(x=>x.slide===state.slide);
    text("slide-status",last?"Última autoevaluación: "+last.score+"/4 · "+formatSecs(last.seconds):"Todavía no has registrado esta lámina.");
  }
  function goSlide(next){
    stopSlideTimer();
    state.slideTimer={elapsed:0,started:null};
    state.slide=Math.max(1,Math.min(11,Number(next)||1));
    text("slide-timer","Iniciar ensayo");renderSlide();
  }
  async function rateSlide(score){
    stopSlideTimer();
    const row={slide:state.slide,seconds:Math.min(3600,Math.round(slideElapsed())),score};
    if(!state.demo){try{await insert("slide_rehearsals",row);}
      catch(e){alertUser("No se pudo guardar: "+e.message);return;}}
    state.slideAttempts.unshift({...row,created_at:new Date().toISOString()});
    void logActivity("practice_completed");
    state.slideTimer={elapsed:0,started:null};text("slide-timer","Iniciar ensayo");
    renderSlide();alertUser("Autoevaluación guardada para la lámina "+state.slide+".");
  }
  function setExaminer(value){
    state.examiner=value;
    all("[data-examiner]").forEach(b=>b.classList.toggle("selected",b.dataset.examiner===value));
    renderTribunalIdle();
  }
  function renderTribunalIdle(){
    if(state.tribunal.chain)return;
    const bank=state.chains.filter(c=>state.examiner==="any"||c.examiner===state.examiner);
    text("tribunal-label",bank.length+" CADENAS REVISADAS DISPONIBLES");
    showOnly(["tribunal-idle","tribunal-live","tribunal-finish"],"tribunal-idle");
    $("tribunal-start").disabled=bank.length===0;
    if(bank.length===0)alertUser("No hay interrogatorios revisados para este enfoque. No se inventarán preguntas.");
  }
  function startTribunal(){
    const bank=state.chains.filter(c=>state.examiner==="any"||c.examiner===state.examiner);
    if(!bank.length)return;
    const lastId=state.tribunal.chain?.id;
    const choices=bank.filter(c=>c.id!==lastId);
    const chain=(choices.length?choices:bank)[Math.floor(Math.random()*(choices.length||bank.length))];
    state.tribunal={chain,turn:0,started:Date.now(),usedHelp:false};
    void logActivity("practice_started");
    showOnly(["tribunal-idle","tribunal-live","tribunal-finish"],"tribunal-live");
    renderTribunalTurn();
  }
  function renderTribunalTurn(){
    const t=state.tribunal,c=t.chain,turn=c?.turns?.[t.turn];
    if(!turn){showOnly(["tribunal-idle","tribunal-live","tribunal-finish"],"tribunal-finish");return;}
    text("tribunal-label",examinerTitles[c.examiner]||"Examinador ficticio");
    const conditional=c.turns.some(x=>x.condition);
    text("tribunal-turn",conditional?(t.turn===0?"PREGUNTA INICIAL":"REPREGUNTA CONDICIONAL"):"TURNO "+(t.turn+1)+" DE "+c.turns.length);
    $("tribunal-branches").hidden=!(conditional&&t.turn===0);
    $("tribunal-next").hidden=conditional&&t.turn===0;
    text("tribunal-question",turn.prompt);
    text("tribunal-context",c.area);
    $("tribunal-help").hidden=true;
    text("tribunal-strategy",turn.rubric||c.strategy);
    text("tribunal-reference",c.source_reference);
    text("tribunal-next",conditional||t.turn+1===c.turns.length?"Terminar cadena":"Ver repregunta");
  }
  function tribunalHelp(){state.tribunal.usedHelp=true;$("tribunal-help").hidden=false;}
  function nextTribunalTurn(){
    const t=state.tribunal;
    if(t.chain?.turns.some(x=>x.condition)&&t.turn>0)t.turn=t.chain.turns.length;
    else t.turn++;
    renderTribunalTurn();
  }
  function chooseTribunalBranch(condition){
    const t=state.tribunal;
    if(!t.chain||t.turn!==0)return;
    const index=t.chain.turns.findIndex((x,i)=>i>0&&x.condition===condition);
    if(index<0)return;
    t.turn=index;renderTribunalTurn();
  }
  async function rateTribunal(score){
    const t=state.tribunal,c=t.chain;
    const row={chain_id:c.id,score,turns_completed:c.turns.some(x=>x.condition)?2:c.turns.length,seconds:Math.min(3600,Math.floor((Date.now()-t.started)/1000)),used_help:t.usedHelp};
    if(!state.demo){try{await insert("tribunal_attempts",row);}
      catch(e){alertUser("No se pudo guardar: "+e.message);return;}}
    state.tribunalAttempts.unshift({...row,created_at:new Date().toISOString()});
    void logActivity("practice_completed");
    state.tribunal={chain:null,turn:0,started:null,usedHelp:false};
    alertUser("Interrogatorio registrado. Puedes iniciar otro.");
    renderTribunalIdle();
  }
  function updateClocks(){
    if(state.mode==="slides")text("slide-clock",formatSecs(slideElapsed()));
    if(state.tribunal?.started)text("tribunal-clock",formatSecs((Date.now()-state.tribunal.started)/1000));
    if(state.mock && !state.mock.finished){
      const remaining=900-(Date.now()-state.mock.started)/1000;
      text("mock-clock",formatSecs(remaining));
      if(remaining<=0&&state.mock.phase==="present")finishPresentation();
    }
  }
  function renderMock(){
    const m=state.mock;
    if(!m){showOnly(["mock-idle","mock-present","mock-questions","mock-finish"],"mock-idle");text("mock-phase","PREPARADA PARA COMENZAR");text("mock-clock","15:00");return;}
    if(m.finished){showOnly(["mock-idle","mock-present","mock-questions","mock-finish"],"mock-finish");return;}
    if(m.phase==="present"){
      showOnly(["mock-idle","mock-present","mock-questions","mock-finish"],"mock-present");
      text("mock-phase","EXPOSICIÓN · SIN PAUTAS");
      text("mock-slide-number","Lámina "+m.slide+" de 11");
      $("mock-prev").disabled=m.slide===1;
      text("mock-next",m.slide===11?"Pasar al tribunal ›":"Siguiente lámina ›");
      void loadPrivateImage(m.slide,"mock-image","mock-image-loading");
    }else if(m.phase==="tribunal"){
      showOnly(["mock-idle","mock-present","mock-questions","mock-finish"],"mock-questions");
      const c=m.chains[m.chainIndex],turn=c?.turns?.[m.turnIndex];
      if(!turn){finishMock();return;}
      text("mock-phase","TRIBUNAL · CADENA "+(m.chainIndex+1)+" / "+m.chains.length);
      const conditional=c.turns.some(x=>x.condition);
      text("mock-turn",(examinerTitles[c.examiner]||"Examinador")+" · "+(conditional?(m.turnIndex===0?"Pregunta inicial":"Repregunta condicional"):"Turno "+(m.turnIndex+1)+"/"+c.turns.length));
      $("mock-branches").hidden=!(conditional&&m.turnIndex===0);
      text("mock-question",turn.prompt);
      $("mock-guidance").hidden=true;
      text("mock-guidance",turn.rubric||c.strategy);
      $("mock-score").hidden=true;
      $("mock-next-turn").hidden=false;
      $("mock-next-turn").hidden=conditional&&m.turnIndex===0;
      text("mock-next-turn",conditional||m.turnIndex+1===c.turns.length?"Evaluar esta cadena":"Ver repregunta");
    }
  }
  function startMock(){
    const bank=state.chains.filter(c=>Array.isArray(c.turns)&&c.turns.length>=2);
    if(bank.length<3){alertUser("Para el simulacro faltan al menos 3 cadenas de tribunal revisadas. No se inventarán interrogatorios.");return;}
    const randFn=rand(Date.now());
    const shuffled=shuffle(bank,randFn);
    void logActivity("practice_started");
    state.mock={
      started:Date.now(),phase:"present",slide:1,lastSlideAt:Date.now(),
      slideSeconds:Array(11).fill(0),chains:shuffled.slice(0,Math.min(5,shuffled.length)),
      chainIndex:0,turnIndex:0,scores:[],usedHelp:[],currentUsedHelp:false,finished:false
    };
    renderMock();
  }
  function advanceMockSlide(direction){
    const m=state.mock;if(!m||m.phase!=="present")return;
    const now=Date.now();m.slideSeconds[m.slide-1]+=(now-m.lastSlideAt)/1000;m.lastSlideAt=now;
    if(direction>0&&m.slide===11){finishPresentation();return;}
    m.slide=Math.max(1,Math.min(11,m.slide+direction));renderMock();
  }
  function finishPresentation(){
    const m=state.mock;if(!m||m.phase!=="present")return;
    const now=Date.now();m.slideSeconds[m.slide-1]+=(now-m.lastSlideAt)/1000;
    m.phase="tribunal";m.turnIndex=0;m.chainIndex=0;m.currentUsedHelp=false;renderMock();
  }
  function advanceMockTurn(){
    const m=state.mock;if(!m||m.phase!=="tribunal")return;
    const chain=m.chains[m.chainIndex];
    if(chain.turns.some(x=>x.condition) ? m.turnIndex===0 : m.turnIndex+1<chain.turns.length){
      m.turnIndex++;renderMock();
    }else{$("mock-next-turn").hidden=true;$("mock-branches").hidden=true;$("mock-score").hidden=false;}
  }
  function chooseMockBranch(condition){
    const m=state.mock;
    if(!m||m.phase!=="tribunal"||m.turnIndex!==0)return;
    const chain=m.chains[m.chainIndex];
    const next=chain.turns.findIndex((x,i)=>i>0&&x.condition===condition);
    if(next<0)return;
    m.turnIndex=next;renderMock();
  }
  async function rateMockChain(score){
    const m=state.mock;if(!m||m.phase!=="tribunal")return;
    m.scores.push(score);m.usedHelp.push(m.currentUsedHelp);
    m.currentUsedHelp=false;m.chainIndex++;m.turnIndex=0;
    if(m.chainIndex>=m.chains.length)await finishMock();else renderMock();
  }
  async function finishMock(){
    const m=state.mock;if(!m||m.finished)return;
    m.finished=true;
    const run={
      duration_seconds:Math.min(7200,Math.floor((Date.now()-m.started)/1000)),
      slide_seconds:m.slideSeconds.map(n=>Math.round(n)),
      chain_ids:m.chains.map(c=>c.id),
      self_scores:m.scores,
      completed:true
    };
    if(!state.demo){try{await insert("mock_runs",run);}
      catch(e){alertUser("No se pudo guardar el informe: "+e.message);m.finished=false;return;}}
    state.mockRuns.unshift({...run,created_at:new Date().toISOString()});
    void logActivity("practice_completed");
    const section=$("mock-report");section.replaceChildren();
    const summary=document.createElement("p");summary.textContent="Duración total: "+formatSecs(run.duration_seconds)+". Valoraciones de tribunal: "+m.scores.join(", ")+" / 4.";
    section.append(summary);
    const list=document.createElement("ol");
    run.slide_seconds.forEach((n,i)=>{const li=document.createElement("li");li.textContent="Lámina "+(i+1)+": "+formatSecs(n);list.append(li);});
    section.append(list);
    const note=document.createElement("p");note.textContent="Este registro solo guarda duraciones, IDs de cadenas y autoevaluaciones. Nunca registra respuestas, audio ni video.";
    section.append(note);text("mock-phase","INFORME FINAL");text("mock-clock",formatSecs(run.duration_seconds));renderMock();
  }
  function renderProgress(){
    const quizUnique=new Set(state.mcqAttempts.map(a=>a.item_id));
    const slideUnique=new Set(state.slideAttempts.map(a=>Number(a.slide)));
    text("progress-mcq",quizUnique.size+" / "+state.mcqs.length);
    text("progress-slides",slideUnique.size+" / 11");
    text("progress-tribunal",state.tribunalAttempts.length);
    text("progress-mocks",state.mockRuns.filter(x=>x.completed).length);
    const activities=[
      ...state.mcqAttempts,...state.slideAttempts,
      ...state.tribunalAttempts,...state.mockRuns
    ];
    const dateKey=date=>new Intl.DateTimeFormat("sv-SE",{
      timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit"
    }).format(new Date(date));
    const days=$("progress-days");days.replaceChildren();
    const counts=Array.from({length:7},(_,i)=>{
      const d=new Date(Date.now()-(6-i)*86400000);
      const key=dateKey(d);
      return {day:new Intl.DateTimeFormat("es-CL",{weekday:"short",timeZone:"Europe/Paris"}).format(d),
        count:activities.filter(a=>a.created_at&&dateKey(a.created_at)===key).length};
    });
    const peak=Math.max(1,...counts.map(x=>x.count));
    for(const entry of counts){
      const item=document.createElement("div");item.className="progress-day";
      const bar=document.createElement("span");bar.className="progress-day-bar";
      bar.style.height=Math.max(4,Math.round(95*entry.count/peak))+"px";
      bar.title=entry.count+" actividades registradas";
      const count=document.createElement("b");count.textContent=entry.count;
      const label=document.createElement("small");label.textContent=entry.day;
      item.append(count,bar,label);days.append(item);
    }
    const latest=new Map();
    for(const a of state.slideAttempts)if(!latest.has(a.slide))latest.set(a.slide,a);
    const struggling=[...latest.values()].filter(a=>a.score<=2).sort((a,b)=>a.score-b.score);
    const mcqById=new Map(state.mcqs.map(q=>[q.id,q]));
    const lastQ=new Map();
    for(const a of state.mcqAttempts)if(!lastQ.has(a.item_id))lastQ.set(a.item_id,a);
    const unresolved=[...lastQ.entries()].filter(([id,a])=>{
      const q=mcqById.get(id);
      return q&&(a.selected_index!==q.correct_index||a.confidence<3);
    }).length;
    const message=struggling.length
      ?"Prioriza la lámina "+String(struggling[0].slide).padStart(2,"0")+"; tu última autoevaluación fue "+struggling[0].score+"/4. Repítela sin leer las pistas."
      :unresolved
      ?"Tienes "+unresolved+" preguntas de alternativas con error o baja confianza. Una nueva sesión de estudio las recuperará."
      :!activities.length
      ?"Comienza por diez preguntas, practica una lámina y registra tu autoevaluación."
      :"Buen avance. Alterna una sesión de tribunal con un ensayo completo para no practicar solo reconocimiento de alternativas.";
    text("progress-next",message);
  }
  async function uploadSelected(){
    if(state.role!=="admin")return;
    const files=[...$("admin-files").files];
    if(!files.length){text("upload-status","Selecciona archivos PNG, WebP, MP4 o JSON.");return;}
    const allowed=/^(slide-(0[1-9]|1[01])\.png|narration\.mp4|timings-all\.json|(gustavo-balmaceda|sebastian-valenzuela|silvio-cuneo|federico-szczaranski)\.jpg)$/;
    for(const file of files){
      if(!allowed.test(file.name)){text("upload-status","Nombre no permitido: "+file.name);return;}
      if(file.size>20*1024*1024){text("upload-status","Archivo demasiado grande: "+file.name);return;}
      const path=/^slide-/.test(file.name)?"slides/"+file.name:/\.jpg$/.test(file.name)?"jurors/"+file.name:"guided/"+file.name;
      try{
        const mime=file.name.endsWith(".png")?"image/png":file.name.endsWith(".jpg")?"image/jpeg":file.name.endsWith(".mp4")?"video/mp4":"application/json";
        const r=await fetch(base+"/storage/v1/object/"+BUCKET+"/"+path,{
          method:"POST",headers:{
            "apikey":key,"Authorization":"Bearer "+await token(),
            "Content-Type":mime,"x-upsert":"true","cache-control":"0"
          },body:file,cache:"no-store"
        });
        if(!r.ok)throw new Error("HTTP "+r.status+" "+(await r.text()).slice(0,150));
        text("upload-status","Subido de forma privada: "+file.name);
      }catch(e){text("upload-status","Error al subir "+file.name+": "+e.message);return;}
    }
    for(const url of state.images.values())URL.revokeObjectURL(url);
    state.images.clear();
    text("upload-status","Carga privada completa: "+files.length+" archivos. Los originales siguen protegidos por RLS.");
    if(state.mode==="slides")renderSlide();
  }
  function initEvents(){
    all("[data-mode]").forEach(b=>b.addEventListener("click",()=>showMode(b.dataset.mode)));
    $("quiz-start").addEventListener("click",startQuiz);
    $("quiz-next").addEventListener("click",()=>void nextQuiz());
    $("quiz-restart").addEventListener("click",startQuiz);
    $("slide-prev").addEventListener("click",()=>goSlide(state.slide-1));
    $("slide-next").addEventListener("click",()=>goSlide(state.slide+1));
    $("slide-select").addEventListener("change",e=>goSlide(Number(e.target.value)));
    $("slide-fullscreen").addEventListener("click",()=>{$("slide-stage").requestFullscreen?.().catch(()=>alertUser("No se pudo ampliar la diapositiva."));});
    $("slide-timer").addEventListener("click",()=>{
      if(state.slideTimer.started!==null){stopSlideTimer();text("slide-timer","Continuar ensayo");}
      else{state.slideTimer.started=Date.now();text("slide-timer","Pausar ensayo");}
    });
    $("slide-stop").addEventListener("click",()=>{stopSlideTimer();text("slide-timer","Continuar ensayo");});
    $("slide-reveal").addEventListener("click",()=>{
      const box=$("slide-hints");box.hidden=!box.hidden;
      text("slide-reveal",box.hidden?"Mostrar pistas":"Ocultar pistas");
    });
    all("[data-slide-score]").forEach(b=>b.addEventListener("click",()=>void rateSlide(Number(b.dataset.slideScore))));
    all("[data-examiner]").forEach(b=>b.addEventListener("click",()=>setExaminer(b.dataset.examiner)));
    $("tribunal-start").addEventListener("click",startTribunal);
    $("tribunal-unsure").addEventListener("click",tribunalHelp);
    $("tribunal-next").addEventListener("click",nextTribunalTurn);
    all("[data-tribunal-branch]").forEach(b=>b.addEventListener("click",()=>chooseTribunalBranch(b.dataset.tribunalBranch)));
    all("[data-tribunal-score]").forEach(b=>b.addEventListener("click",()=>void rateTribunal(Number(b.dataset.tribunalScore))));
    $("mock-start").addEventListener("click",startMock);
    $("mock-repeat").addEventListener("click",()=>{state.mock=null;renderMock();});
    $("mock-prev").addEventListener("click",()=>advanceMockSlide(-1));
    $("mock-next").addEventListener("click",()=>advanceMockSlide(1));
    $("mock-fullscreen").addEventListener("click",()=>{$("mock-image").requestFullscreen?.().catch(()=>alertUser("Pantalla completa no disponible."));});
    $("mock-to-tribunal").addEventListener("click",finishPresentation);
    $("mock-next-turn").addEventListener("click",advanceMockTurn);
    all("[data-mock-branch]").forEach(b=>b.addEventListener("click",()=>chooseMockBranch(b.dataset.mockBranch)));
    $("mock-unsure").addEventListener("click",()=>{
      if(state.mock?.phase!=="tribunal")return;
      state.mock.currentUsedHelp=true;$("mock-guidance").hidden=false;
    });
    all("[data-mock-score]").forEach(b=>b.addEventListener("click",()=>void rateMockChain(Number(b.dataset.mockScore))));
    $("admin-upload").addEventListener("click",()=>void uploadSelected());
    window.addEventListener("beforeunload",()=>{for(const url of state.images.values())URL.revokeObjectURL(url);});
  }
  initEvents();
  void start();
})();