"use strict";

/**
 * Academia M — MVP.
 * The public GitHub Pages bundle contains only UI code and illustrative DEMO questions.
 * Real thesis questions live in Supabase, protected by database RLS.
 * No service-role key or password is ever shipped with this application.
 */
(() => {
  const $ = (id) => document.getElementById(id);
  const queryAll = (selector) => [...document.querySelectorAll(selector)];
  const CONFIG = window.ACADEMIA_CONFIG || {};
  const backendReady = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(String(CONFIG.url || "")) &&
    /^(sb_publishable_|eyJ)/.test(String(CONFIG.publishableKey || ""));
  const baseUrl = String(CONFIG.url || "").replace(/\/$/, "");
  const key = String(CONFIG.publishableKey || "");
  const SESSION_KEY = "academia-m-session-v1";
  const DEMO_QUESTIONS = [
    {id:"DEMO01",slide:1,section:"Fundamentos",area:"Argumentación",level:"Inicial",prompt:"¿Cuál es la pregunta central de tu investigación? Explícala en dos frases, sin leer tus diapositivas.",rubric:"Expón el problema, su importancia y los límites de tu investigación. Evita confundir la pregunta con la conclusión."},
    {id:"DEMO02",slide:2,section:"Marco teórico",area:"Conceptos",level:"Intermedia",prompt:"Una persona de la comisión cuestiona una definición de tu trabajo. ¿Cómo distinguirías una definición jurídica de una inferencia basada en hechos?",rubric:"Distingue definición y aplicación. Explica qué fuente respalda cada afirmación y qué datos faltan."},
    {id:"DEMO03",slide:3,section:"Método",area:"Método",level:"Intermedia",prompt:"¿Por qué escogiste estos casos o fuentes y no otros? ¿Qué conclusión NO permite tu muestra?",rubric:"Reconoce criterios reales de selección y limitaciones. No inventes una justificación posterior."},
    {id:"DEMO04",slide:5,section:"Tribunal",area:"Objeciones",level:"Exigente",prompt:"Un examinador afirma que tu argumento contiene un salto lógico. ¿Qué premisa adicional necesitarías para defender tu conclusión?",rubric:"Identifica la premisa faltante, explica cómo comprobarla y admite cuando la evidencia no es suficiente."},
    {id:"DEMO05",slide:7,section:"Discusión",area:"Objeciones",level:"Exigente",prompt:"Reconstruye el mejor argumento contra tu tesis, sin debilitarlo, y responde señalando el alcance de tu propia propuesta.",rubric:"Formula el contraargumento de buena fe, responde con una razón independiente y reconoce una objeción todavía abierta."},
    {id:"DEMO06",slide:11,section:"Conclusiones",area:"Síntesis",level:"Exigente",prompt:"En sesenta segundos, ¿qué sostienes, qué has demostrado y cuál es el límite principal de tu trabajo?",rubric:"Distingue tesis, evidencia y límites. Evita reclamar una demostración más amplia que la investigación."}
  ];
  const DEMO_SLIDES = [
    ["Apertura y tesis","Presenta el problema y por qué merece una respuesta."],
    ["Marco conceptual","Explica las distinciones que guían todo el trabajo."],
    ["Pregunta central","Formula una hipótesis sin anticipar su prueba."],
    ["Método y fuentes","Aclara lo que permiten y no permiten tus fuentes."],
    ["Primer argumento","Presenta una razón jurídica y su límite."],
    ["Segundo argumento","Contrasta dos posiciones con precisión."],
    ["Objeción fuerte","Reconstruye una crítica sin caricaturizarla."],
    ["Prueba y casos","Explica cómo se justifican las inferencias."],
    ["Tu propuesta","Define qué aporta y qué no pretende aportar."],
    ["Discusión","Enfrenta un desacuerdo jurídicamente sostenible."],
    ["Conclusión","Cierra con una síntesis honesta y memorable."]
  ].map(([title,explainer],i)=>({slide:i+1,title,explainer,pitfall:"No confundas una explicación razonable con una prueba suficiente."}));

  const MISSIONS = [
    {title:"El corazón de tu tesis",ids:["Q01","Q02","Q03","Q05"]},
    {title:"Dominar la estructura",ids:["Q06","Q11","Q13","Q14"]},
    {title:"Resistir una objeción",ids:["Q21","Q22","Q23","Q25"]},
    {title:"Pensar con las sentencias",ids:["Q31","Q33","Q34","Q38"]},
    {title:"Defender tus decisiones",ids:["Q41","Q42","Q43","Q44"]},
    {title:"La prueba del tribunal",ids:["Q51","Q53","Q54","Q57"]},
    {title:"La síntesis final",ids:["Q48","Q58","Q59","Q60"]}
  ];
  const state = {
    demo:false,user:null,role:null,name:"",session:null,
    questions:[],slides:[],attempts:[],v2Attempts:[],events:[],profiles:[],
    view:"home",mode:"study",selectedSlide:1,current:null,missionMode:false,activeMission:[],
    lastQuestion:null,questionNumber:0,
    seconds:900,timerRunning:false,timerDeadline:null,timerHandle:null,
    alertTimer:null
  };

  function safe(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    })[c]);
  }
  function notify(message) {
    const t=$("toast");
    t.textContent=message;t.classList.add("visible");
    clearTimeout(state.alertTimer);
    state.alertTimer=setTimeout(()=>t.classList.remove("visible"),3600);
  }
  function formatDate(value,withTime=false) {
    if(!value)return "—";
    const d=new Date(value);
    if(!Number.isFinite(d.getTime()))return "—";
    return new Intl.DateTimeFormat("es-CL", {
      day:"2-digit",month:"short",year:"numeric",
      ...(withTime?{hour:"2-digit",minute:"2-digit"}:{})
    }).format(d);
  }
  function dateKey(value){
    const d=new Date(value);
    if(!Number.isFinite(d.getTime()))return "";
    return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
  }
  function ownAttempts() {
    return state.attempts.filter(x=>state.demo || x.user_id===state.user?.id);
  }
  function sessionStore(s){
    state.session=s;
    try{if(s)sessionStorage.setItem(SESSION_KEY,JSON.stringify(s));else sessionStorage.removeItem(SESSION_KEY)}catch{}
  }
  function sessionRead(){
    try{return JSON.parse(sessionStorage.getItem(SESSION_KEY)||"null")}catch{return null}
  }
  function jwtExpired(session){
    return !session?.access_token || (session.expires_at && Date.now()/1000 >= session.expires_at-90);
  }

  async function authCall(path,body,token=null){
    const response=await fetch(baseUrl+path,{
      method:"POST",
      headers:{"apikey":key,"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{})},
      body:JSON.stringify(body)
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data?.msg||data?.error_description||data?.message||"No se pudo autenticar");
    return data;
  }
  async function refreshSession(){
    if(!state.session?.refresh_token)throw new Error("La sesión expiró. Vuelve a entrar.");
    const data=await authCall("/auth/v1/token?grant_type=refresh_token",{refresh_token:state.session.refresh_token});
    data.expires_at=Math.floor(Date.now()/1000)+Number(data.expires_in||3600);
    sessionStore(data);
    return data;
  }
  async function api(path,options={},retry=true){
    if(state.demo)throw new Error("Sin servidor en modo demostración");
    if(jwtExpired(state.session))await refreshSession();
    const response=await fetch(baseUrl+"/rest/v1/"+path,{
      method:options.method||"GET",
      headers:{
        apikey:key,Authorization:"Bearer "+state.session.access_token,
        "Content-Type":"application/json",
        ...(options.method&&options.method!=="GET"?{Prefer:"return=representation"}:{})
      },
      ...(options.body?{body:JSON.stringify(options.body)}:{})
    });
    if(response.status===401&&retry){await refreshSession();return api(path,options,false)}
    const raw=await response.text();
    let data;try{data=raw?JSON.parse(raw):[]}catch{data=[]}
    if(!response.ok)throw new Error(data?.message||data?.hint||"Solicitud rechazada ("+response.status+")");
    return data;
  }
  // The invite/recovery token is supplied by Supabase in the fragment and must
  // be removed immediately so it cannot leak via screenshots or copied URLs.
  function consumeAuthRedirect(){
    const hash=new URLSearchParams(location.hash.replace(/^#/,""));
    const type=hash.get("type");
    const token=hash.get("access_token"),refresh=hash.get("refresh_token");
    const error=hash.get("error_description")||hash.get("error");
    if(!token&&!error)return false;
    history.replaceState(null,"",location.pathname+location.search);
    if(error){$("login-error").textContent="El enlace no es válido o ha caducado. Solicita uno nuevo.";return true;}
    if(!backendReady||!refresh||!["invite","recovery"].includes(type)){
      $("login-error").textContent="El enlace de acceso no corresponde a una invitación o recuperación válida.";
      return true;
    }
    // Verify the bearer token with Auth before allowing a password update.
    sessionStore({access_token:token,refresh_token:refresh,expires_at:Math.floor(Date.now()/1000)+1800});
    $("login-form").hidden=true;
    $("recovery-entry").hidden=true;
    $("recovery-form").hidden=true;
    $("password-setup").hidden=false;
    $("password-setup-heading").textContent=type==="recovery"?"Crear una nueva contraseña":"Activar mi cuenta";
    void verifyRedirectToken();
    return true;
  }
  async function verifyRedirectToken(){
    try{
      const response=await fetch(baseUrl+"/auth/v1/user",{
        headers:{apikey:key,Authorization:"Bearer "+state.session.access_token}
      });
      if(!response.ok)throw new Error("token invalid");
      const user=await response.json();
      if(!user?.id)throw new Error("user missing");
      state.session.user=user;
      sessionStore(state.session);
    }catch{
      sessionStore(null);
      $("password-setup").hidden=true;
      $("login-form").hidden=false;
      $("recovery-entry").hidden=false;
      $("login-error").textContent="El enlace ha caducado. Solicita otra invitación o recuperación.";
    }
  }
  async function changePassword(password){
    if(!state.session?.access_token||!state.session?.user?.id)throw new Error("El enlace no está validado");
    const response=await fetch(baseUrl+"/auth/v1/user",{
      method:"PUT",
      headers:{apikey:key,Authorization:"Bearer "+state.session.access_token,"Content-Type":"application/json"},
      body:JSON.stringify({password})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.msg||data.message||"No se pudo guardar la contraseña");
    sessionStore(null);
    $("password-setup").hidden=true;
    $("password-setup-cancel").hidden=true;
    $("new-password").value="";
    $("confirm-new-password").value="";
    $("login-form").hidden=false;
    $("recovery-entry").hidden=false;
    $("login-password").value="";
    $("login-error").textContent="Contraseña guardada. Entra con tu correo y la nueva contraseña. Si tu rol aún no está habilitado, contacta al administrador.";
  }
  async function requestRecovery(email){
    // Supabase must allowlist this exact URL under Auth > URL Configuration.
    // In local test runs it must return to localhost, not to the not-yet-live
    // GitHub Pages Site URL. On GitHub Pages it returns to the deployed path.
    const redirectUrl=["https:","http:"].includes(location.protocol)
      ? location.origin+location.pathname : null;
    const endpoint=baseUrl+"/auth/v1/recover"+
      (redirectUrl?"?redirect_to="+encodeURIComponent(redirectUrl):"");
    const response=await fetch(endpoint,{
      method:"POST",
      headers:{apikey:key,"Content-Type":"application/json"},
      body:JSON.stringify({email})
    });
    if(!response.ok)throw new Error("No se pudo solicitar la recuperación. Inténtalo más tarde.");
  }
  async function login(email,password){
    if(!backendReady)return;
    const button=$("login-button"),error=$("login-error");
    error.textContent="";button.disabled=true;button.textContent="Verificando acceso…";
    try{
      const session=await authCall("/auth/v1/token?grant_type=password",{email,password});
      session.expires_at=Math.floor(Date.now()/1000)+Number(session.expires_in||3600);
      sessionStore(session);
      await openAuthenticated(false);
    }catch(err){
      sessionStore(null);
      error.textContent=err.message||"No pudimos iniciar sesión.";
    }finally{
      button.disabled=false;button.innerHTML='Entrar a mi academia <span aria-hidden="true">↗</span>';
    }
  }
  async function openAuthenticated(restored=false){
    const u=state.session?.user;
    if(!u?.id)throw new Error("Cuenta no identificada");
    const roles=await api("member_roles?select=role&user_id=eq."+encodeURIComponent(u.id));
    if(!roles.length||!["admin","student"].includes(roles[0].role))throw new Error("Tu cuenta todavía no está habilitada para esta academia.");
    state.demo=false;state.user=u;state.role=roles[0].role;
    let profile=await api("profiles?select=user_id,display_name&user_id=eq."+encodeURIComponent(u.id));
    if(!profile.length){
      const name=(u.email||"Cuenta").split("@")[0];
      profile=await api("profiles",{method:"POST",body:{user_id:u.id,display_name:name}});
    }
    state.name=profile[0]?.display_name||(u.email||"Cuenta").split("@")[0];
    const [questions,slides,attempts]=await Promise.all([
      api("questions?select=id,slide,section,area,level,prompt,rubric&order=id.asc"),
      api("slide_guides?select=slide,title,explainer,pitfall&order=slide.asc"),
      api("practice_attempts?select=id,user_id,question_id,mode,score,created_at&order=created_at.desc&limit=500")
    ]);
    state.questions=questions;state.slides=slides;state.attempts=attempts;
    if(state.role==="admin"){
      const [events,profiles]=await Promise.all([
        api("activity_events?select=id,user_id,event_type,occurred_at&order=occurred_at.desc&limit=400"),
        api("profiles?select=user_id,display_name&order=display_name.asc")
      ]);
      state.events=events;state.profiles=profiles;
      // Merge minimal progress metadata; no answers, voice or text.
      const extra=await Promise.all(["mcq_attempts","slide_rehearsals","tribunal_attempts","mock_runs"].map(
        name=>api(name+"?select=user_id,created_at&order=created_at.desc&limit=500").catch(e=>{
          console.warn("Seguimiento parcial de "+name,e.message);return [];
        })
      ));
      state.v2Attempts=extra.flat();
    }
    await recordEvent(restored?"app_open":"login");
    openWorkspace();
  }
  async function recordEvent(event_type){
    if(state.demo)return;
    try{
      const rows=await api("activity_events",{method:"POST",body:{event_type}});
      if(state.role==="admin"&&Array.isArray(rows)&&rows.length)state.events.unshift(rows[0]);
    }catch(e){console.warn("No se pudo guardar evento",e.message);notify("La sesión está disponible, pero no se guardó una marca de actividad.")}
  }
  function startDemo(role="student"){
    state.demo=true;state.user={id:"demo",email:"demostracion@academia.invalid"};
    state.role=role;state.name=role==="admin"?"Luis · demo":"Michèle · demo";
    state.questions=DEMO_QUESTIONS;state.slides=DEMO_SLIDES;
    state.attempts=[];state.events=[];state.profiles=[];
    if(role==="admin"){
      const t=new Date();
      state.profiles=[
        {user_id:"demo",display_name:"Luis · demo"},
        {user_id:"demo-student",display_name:"Estudiante de muestra"}
      ];
      state.events=[
        {id:"synthetic1",user_id:"demo-student",event_type:"login",occurred_at:new Date(t.getTime()-3600000).toISOString()},
        {id:"synthetic2",user_id:"demo-student",event_type:"practice_started",occurred_at:new Date(t.getTime()-3500000).toISOString()},
        {id:"synthetic3",user_id:"demo-student",event_type:"practice_completed",occurred_at:new Date(t.getTime()-3300000).toISOString()}
      ];
      state.attempts=[{id:"synthetic",user_id:"demo-student",question_id:"DEMO04",mode:"tribunal",score:2,created_at:state.events[2].occurred_at}];
    }
    openWorkspace();
    // El distintivo VISTA DEMO señala el estado sin cubrir el contenido inicial.
  }
  function openWorkspace(){
    const advanced = $("v2-link");
    if (advanced) advanced.href = state.demo ? "./v2.html?demo=1" : "./v2.html";
    const karaokeLink=$("karaoke-v1-link");
    if(karaokeLink){
      karaokeLink.href=state.demo?"./v2.html?demo=1":"./karaoke.html";
      karaokeLink.title=state.demo?"La narración privada requiere iniciar sesión":"Rehearsal con narración, puntero y teleprónter";
    }
    $("auth").hidden=true;$("app").hidden=false;
    $("demo-badge").hidden=!state.demo;
    $("sidebar-name").textContent=state.name;
    $("sidebar-avatar").textContent=(state.name[0]||"M").toUpperCase();
    $("sidebar-role").textContent=state.role==="admin"?"Administrador":"Entrenamiento privado";
    queryAll(".admin-only").forEach(el=>{el.hidden=state.role!=="admin"});
    showView("home");
    renderStats();renderSlides();renderResults();
  }
  async function openSelfServicePasswordChange(){
    if(state.demo){notify("El cambio de contraseña no está disponible en demo.");return;}
    if(!state.session?.access_token){notify("Debes iniciar sesión nuevamente.");return;}
    try { if(jwtExpired(state.session))await refreshSession(); }
    catch { logout(); $("login-error").textContent="La sesión expiró. Vuelve a entrar.";return; }
    $("app").hidden=true;
    $("auth").hidden=false;
    $("login-form").hidden=true;
    $("recovery-entry").hidden=true;
    $("recovery-form").hidden=true;
    $("password-setup").hidden=false;
    $("password-setup-cancel").hidden=false;
    $("password-setup-heading").textContent="Cambiar mi contraseña";
    $("password-setup-message").textContent="";
    $("new-password").value="";
    $("confirm-new-password").value="";
  }
  function logout(){
    const bearer=state.session?.access_token;
    if(bearer&&!state.demo){
      void fetch(baseUrl+"/auth/v1/logout",{method:"POST",headers:{apikey:key,Authorization:"Bearer "+bearer}}).catch(()=>{});
    }
    sessionStore(null);resetTimer();
    Object.assign(state,{demo:false,user:null,role:null,name:"",questions:[],slides:[],attempts:[],v2Attempts:[],events:[],profiles:[],current:null});
    $("app").hidden=true;$("auth").hidden=false;$("login-password").value="";$("login-error").textContent="";
    showView("home");
  }
  function showView(view){
    if(!state.demo && (view==="practice"||view==="slides"||view==="results")){
      location.assign("./v2.html?mode="+(view==="slides"?"slides":view==="results"?"progress":"quiz"));return;
    }
    if(view==="admin"&&state.role!=="admin")return;
    state.view=view;
    queryAll(".page").forEach(el=>el.classList.toggle("active",el.id==="view-"+view));
    queryAll("[data-view]").forEach(el=>el.classList.toggle("active",el.dataset.view===view));
    $("view-name").textContent=({home:"MI ACADEMIA",practice:"SALA DE PRÁCTICA",slides:"MIS DIAPOSITIVAS",results:"MI PROGRESO",admin:"ADMINISTRACIÓN"})[view]||"MI ACADEMIA";
    if(view==="admin")renderAdmin();
    if(view==="results")renderResults();
    window.scrollTo?.({top:0,behavior:"instant"});
  }
  function missionInfo(){
    const own=ownAttempts(),today=dateKey(new Date());
    const practicedDays=[...new Set(own.map(a=>dateKey(a.created_at)).filter(Boolean))].sort();
    const idx=practicedDays.includes(today)?practicedDays.indexOf(today):practicedDays.length;
    const plan=MISSIONS[idx%MISSIONS.length];
    const ids=state.demo?DEMO_QUESTIONS.slice(0,4).map(q=>q.id):plan.ids.filter(id=>state.questions.some(q=>q.id===id));
    const todayIDs=new Set(own.filter(a=>dateKey(a.created_at)===today).map(a=>a.question_id));
    return {idx,title:plan.title,ids,done:ids.filter(id=>todayIDs.has(id)).length,todayIDs};
  }
  function renderMission(){
    const m=missionInfo();
    $("mission-kicker").textContent="MISIÓN · DÍA "+String(m.idx+1).padStart(2,"0");
    $("mission-title").textContent=m.title;
    $("mission-subtitle").textContent=state.demo?"Una demostración con preguntas ficticias.":"Cuatro ejercicios de "+m.ids.length+" previstos para esta misión.";
    $("mission-count").textContent=m.done+" / "+m.ids.length;
    $("mission-start").textContent=m.done>=m.ids.length?"Repasar misión ↗":"Continuar misión ↗";
  }
  function startMission(){
    if(!state.demo){location.assign("./v2.html?mode=quiz");return;}
    setMode("study");
    const m=missionInfo();
    state.activeMission=m.ids;
    state.missionMode=true;
    void startPractice();
  }
  function renderStats(){
    const own=ownAttempts(),unique=new Set(own.map(x=>x.question_id));
    $("stat-answered").textContent=unique.size;
    $("stat-total").textContent=state.questions.length||0;
    $("stat-days").textContent=new Set(own.map(x=>dateKey(x.created_at)).filter(Boolean)).size;
    $("stat-average").textContent=own.length?(own.reduce((s,x)=>s+Number(x.score||0),0)/own.length).toFixed(1).replace(".",","):"—";
    $("progress-caption").textContent=unique.size+" de "+state.questions.length+" preguntas practicadas";
    renderMission();
  }
  function setMode(mode){
    if(!["study","slide","tribunal","mock"].includes(mode))return;
    if(!state.demo){
      const target={study:"quiz",slide:"slides",tribunal:"tribunal",mock:"mock"}[mode];
      location.assign("./v2.html?mode="+target);return;
    }
    state.mode=mode;state.missionMode=false;state.activeMission=[];
    queryAll("[data-practice-mode]").forEach(el=>el.classList.toggle("active",el.dataset.practiceMode===mode));
    state.current=null;state.questionNumber=0;
    $("question-live").hidden=true;$("question-idle").hidden=false;
    $("question-meta").textContent={
      study:"FUNDAMENTOS · PRÁCTICA PERSONAL",
      slide:"PRESENTACIÓN · POR DIAPOSITIVA",
      tribunal:"TRIBUNAL · NIVEL EXIGENTE",
      mock:"SIMULACRO · EXPOSICIÓN Y PREGUNTAS"
    }[mode];
    $("question-count").textContent="PREGUNTA · —";
    $("start-practice").textContent=mode==="mock"?"Comenzar simulacro de 15 minutos":mode==="slide"?"Practicar esta diapositiva":"Empezar a practicar";
    showView("practice");
  }
  function pool(){
    let rows=state.questions;
    if(state.mode==="slide")rows=rows.filter(x=>Number(x.slide)===Number(state.selectedSlide));
    if(state.mode==="tribunal"||state.mode==="mock")rows=rows.filter(x=>/exigente|tribunal|avanzad/i.test(x.level||""));
    return rows;
  }
  function chooseQuestion(){
    let options=pool();
    if(state.missionMode&&state.activeMission.length){
      const selected=options.filter(q=>state.activeMission.includes(q.id));
      if(selected.length)options=selected;
    }
    if(!options.length)return null;
    const done=new Map();
    ownAttempts().forEach(x=>done.set(x.question_id,(done.get(x.question_id)||0)+1));
    const today=dateKey(new Date());
    const todayDone=new Set(ownAttempts().filter(a=>dateKey(a.created_at)===today).map(a=>a.question_id));
    const sorted=[...options].sort((a,b)=>{
      if(state.missionMode){
        const todayDiff=Number(todayDone.has(a.id))-Number(todayDone.has(b.id));
        if(todayDiff)return todayDiff;
      }
      const n=(done.get(a.id)||0)-(done.get(b.id)||0);
      return n||a.id.localeCompare(b.id);
    });
    return sorted.find(x=>x.id!==state.lastQuestion)||sorted[0];
  }
  async function startPractice(){
    const q=chooseQuestion();
    if(!q){notify("Aún no hay preguntas para esta modalidad. Revisa la carga del banco.");return}
    if(state.questionNumber===0)await recordEvent("practice_started");
    state.questionNumber++;
    state.current=q;state.lastQuestion=q.id;
    $("question-idle").hidden=true;$("question-live").hidden=false;
    $("question-meta").textContent="LÁMINA "+String(q.slide).padStart(2,"0")+" · "+String(q.area||q.section||"PRÁCTICA").toUpperCase();
    $("question-count").textContent="PREGUNTA · "+String(state.questionNumber).padStart(2,"0");
    $("question-text").textContent=q.prompt;
    $("criterion-text").textContent=q.rubric||"Contrasta tus razones y verifica las fuentes.";
    $("criterion-box").hidden=true;$("show-criterion").hidden=false;
    $("answer-box").value="";
    if(state.mode==="mock"&&!state.timerRunning&&state.seconds===900)toggleTimer();
  }
  async function saveScore(score,button){
    if(!state.current)return;
    const q=state.current;
    if(button)button.disabled=true;
    const attempt={
      user_id:state.user.id,question_id:q.id,mode:state.mode,
      score:Number(score),created_at:new Date().toISOString()
    };
    try{
      if(!state.demo){
        const saved=await api("practice_attempts",{method:"POST",body:{question_id:q.id,mode:state.mode,score:Number(score)}});
        if(!Array.isArray(saved)||saved.length!==1)throw new Error("No hay confirmación de guardado");
        state.attempts.unshift(saved[0]);
        await recordEvent("practice_completed");
      }else{
        attempt.id="demo-"+Date.now();state.attempts.unshift(attempt);
      }
      renderStats();renderResults();
      notify("Evaluación "+score+"/4 guardada. Puedes seguir con otra pregunta.");
      await startPractice();
    }catch(err){
      notify("No se guardó la práctica: "+err.message);
    }finally{if(button)button.disabled=false}
  }
  function renderSlides(){
    const slides=$("slides-grid");slides.innerHTML="";
    if(!state.slides.length){
      slides.innerHTML='<div class="card"><h2>No hay fichas cargadas</h2><p>El administrador debe importar las once diapositivas en la base privada.</p></div>';return;
    }
    for(const sl of state.slides){
      const button=document.createElement("button");button.className="slide-card";button.type="button";
      button.innerHTML='<span class="slide-num">'+String(sl.slide).padStart(2,"0")+'</span><strong>'+safe(sl.title)+'</strong><small>'+safe(sl.explainer)+'</small><span>Practicar esta lámina ↗</span>';
      button.addEventListener("click",()=>{
        state.selectedSlide=sl.slide;setMode("slide");
        $("question-idle").querySelector("p").textContent="Lámina "+sl.slide+": "+sl.explainer+" Responde primero y contrasta la pauta después.";
      });
      slides.appendChild(button);
    }
  }
  function renderResults(){
    const own=ownAttempts(),now=new Date(),chart=$("week-chart");
    chart.innerHTML="";
    for(let n=6;n>=0;n--){
      const d=new Date(now);d.setDate(d.getDate()-n);
      const count=own.filter(a=>dateKey(a.created_at)===dateKey(d)).length;
      const col=document.createElement("div");col.className="chart-col";
      col.innerHTML='<div class="chart-bar" title="'+count+' respuestas" style="height:'+Math.max(4,Math.min(100,count*20))+'%"></div><span class="chart-day">'+new Intl.DateTimeFormat("es-CL",{weekday:"short"}).format(d)+'</span>';
      chart.appendChild(col);
    }
    const weak=own.find(a=>Number(a.score)<=2);
    const q=weak?state.questions.find(x=>x.id===weak.question_id):null;
    $("focus-message").textContent=q?"Vuelve a practicar: "+q.area+". Mejorar una dificultad concreta es progreso.":own.length?"Repasa una pregunta difícil desde otra perspectiva.":"Comienza con una pregunta y registra cómo te fue.";
    const body=$("attempts-body");body.innerHTML="";
    if(!own.length)body.innerHTML='<tr><td class="empty-row" colspan="4">Aún no hay prácticas registradas. Tu primera respuesta comienza el camino.</td></tr>';
    else for(const a of own.slice(0,40)){
      const tr=document.createElement("tr");
      tr.innerHTML="<td>"+safe(formatDate(a.created_at,true))+"</td><td><strong>"+safe(a.question_id)+"</strong></td><td>"+safe(({study:"Estudio",slide:"Láminas",tribunal:"Tribunal",mock:"Simulacro"})[a.mode]||a.mode)+"</td><td>"+safe(a.score)+"/4</td>";
      body.appendChild(tr);
    }
  }
  function renderAdmin(){
    if(state.role!=="admin")return;
    const profiles=state.profiles,events=state.events,attempts=[...state.attempts,...state.v2Attempts];
    // MVP: a single administrator (the current account) and one student.
    // The student table must never mistake the admin's own login for a student's.
    const students=profiles.filter(p=>p.user_id!==state.user?.id);
    $("admin-users").textContent=profiles.length;
    $("admin-logins").textContent=events.filter(e=>e.event_type==="login").length;
    $("admin-attempts").textContent=attempts.length;
    const names=new Map(profiles.map(p=>[p.user_id,p.display_name]));
    const memberBody=$("admin-members");memberBody.innerHTML="";
    if(!students.length)memberBody.innerHTML='<tr><td colspan="3" class="empty-row">Todavía no hay estudiantes registrados</td></tr>';
    for(const p of students){
      const last=events.find(e=>e.user_id===p.user_id&&["login","app_open"].includes(e.event_type));
      const count=attempts.filter(x=>x.user_id===p.user_id).length;
      const tr=document.createElement("tr");
      tr.innerHTML="<td><strong>"+safe(p.display_name||"Usuario")+"</strong></td><td>"+safe(formatDate(last?.occurred_at,true))+"</td><td>"+count+"</td>";
      memberBody.appendChild(tr);
    }
    const eventBody=$("admin-events");eventBody.innerHTML="";
    if(!events.length)eventBody.innerHTML='<tr><td colspan="3" class="empty-row">No se ha registrado actividad</td></tr>';
    for(const ev of events.slice(0,70)){
      const tr=document.createElement("tr");
      const label=({login:"Inicio de sesión",app_open:"Volvió a abrir la academia",practice_started:"Inició práctica",practice_completed:"Registró evaluación"})[ev.event_type]||ev.event_type;
      tr.innerHTML="<td>"+safe(formatDate(ev.occurred_at,true))+"</td><td>"+safe(names.get(ev.user_id)||"Usuario")+"</td><td>"+safe(label)+"</td>";
      eventBody.appendChild(tr);
    }
  }
  function renderTimer(){
    const n=Math.max(0,state.seconds);
    $("timer").textContent=String(Math.floor(n/60)).padStart(2,"0")+":"+String(n%60).padStart(2,"0");
    $("timer-fill").style.width=100*(900-n)/900+"%";
    $("timer-toggle").textContent=state.timerRunning?"Pausar":"Iniciar";
  }
  function timerTick(){
    if(!state.timerRunning)return;
    state.seconds=Math.max(0,Math.ceil((state.timerDeadline-Date.now())/1000));
    renderTimer();
    if(state.seconds===0){pauseTimer();notify("Se cumplieron los 15 minutos. Si corresponde, empieza las preguntas del tribunal.")}
  }
  function toggleTimer(){
    if(state.timerRunning){pauseTimer();return}
    if(state.seconds===0)state.seconds=900;
    state.timerRunning=true;state.timerDeadline=Date.now()+state.seconds*1000;
    state.timerHandle=setInterval(timerTick,250);renderTimer();
  }
  function pauseTimer(){
    if(state.timerRunning)state.seconds=Math.max(0,Math.ceil((state.timerDeadline-Date.now())/1000));
    state.timerRunning=false;clearInterval(state.timerHandle);state.timerHandle=null;
    renderTimer();
  }
  function resetTimer(){pauseTimer();state.seconds=900;renderTimer()}
  function initEvents(){
    $("login-form").addEventListener("submit",(e)=>{e.preventDefault();void login($("login-email").value.trim(),$("login-password").value)});
    $("toggle-password").addEventListener("click",()=>{$("login-password").type=$("login-password").type==="password"?"text":"password";$("toggle-password").textContent=$("login-password").type==="password"?"Mostrar":"Ocultar"});
    $("forgot-password").addEventListener("click",()=>{
      $("login-form").hidden=true;$("recovery-entry").hidden=true;$("recovery-form").hidden=false;
      $("recovery-email").value=$("login-email").value;
    });
    $("recovery-cancel").addEventListener("click",()=>{
      $("recovery-form").hidden=true;$("login-form").hidden=false;$("recovery-entry").hidden=false;
    });
    $("recovery-form").addEventListener("submit",async e=>{
      e.preventDefault();const btn=$("recovery-submit"),msg=$("recovery-message");btn.disabled=true;msg.textContent="";
      try{await requestRecovery($("recovery-email").value.trim());msg.textContent="Si esta cuenta existe, recibirás un correo con instrucciones."}
      catch(err){msg.textContent=err.message}finally{btn.disabled=false}
    });
    $("password-setup").addEventListener("submit",async e=>{
      e.preventDefault();const btn=$("password-setup-submit"),msg=$("password-setup-message");
      const a=$("new-password").value,b=$("confirm-new-password").value;
      if(a!==b){msg.textContent="Las contraseñas no coinciden.";return}
      if(a.length<12){msg.textContent="Usa al menos 12 caracteres.";return}
      btn.disabled=true;msg.textContent="";
      try{await changePassword(a)}
      catch(err){msg.textContent=err.message}finally{btn.disabled=false}
    });
    $("demo-button").addEventListener("click",()=>startDemo("student"));
    $("demo-admin-button").addEventListener("click",()=>{startDemo("admin");showView("admin");});
    $("change-own-password").addEventListener("click",()=>void openSelfServicePasswordChange());
    $("password-setup-cancel").addEventListener("click",()=>{
      $("password-setup").hidden=true;
      $("password-setup-cancel").hidden=true;
      $("new-password").value="";
      $("confirm-new-password").value="";
      $("auth").hidden=true;
      $("app").hidden=false;
    });
    $("logout").addEventListener("click",logout);
    queryAll("[data-view]").forEach(button=>button.addEventListener("click",()=>showView(button.dataset.view)));
    queryAll("[data-view-action]").forEach(button=>button.addEventListener("click",()=>showView(button.dataset.viewAction)));
    queryAll("[data-mode-target]").forEach(button=>button.addEventListener("click",()=>setMode(button.dataset.modeTarget)));
    queryAll("[data-practice-mode]").forEach(button=>button.addEventListener("click",()=>setMode(button.dataset.practiceMode)));
    $("hero-start").addEventListener("click",()=>setMode("study"));
    $("mission-start").addEventListener("click",startMission);
    $("start-practice").addEventListener("click",()=>void startPractice());
    $("skip-question").addEventListener("click",()=>void startPractice());
    $("show-criterion").addEventListener("click",()=>{$("criterion-box").hidden=false;$("show-criterion").hidden=true});
    queryAll("[data-score]").forEach(button=>button.addEventListener("click",()=>void saveScore(Number(button.dataset.score),button)));
    $("timer-toggle").addEventListener("click",toggleTimer);
    $("timer-reset").addEventListener("click",resetTimer);
    document.addEventListener("visibilitychange",()=>{if(state.timerRunning)timerTick()});
  }
  async function initialize(){
    initEvents();renderTimer();
    $("today-label").textContent=new Intl.DateTimeFormat("es-CL",{day:"numeric",month:"long",year:"numeric"}).format(new Date());
    if(!backendReady){
      $("login-form").hidden=true;
      $("demo-invite").hidden=false;
      return;
    }
    if(consumeAuthRedirect())return;
    state.session=sessionRead();
    if(state.session){
      try{await openAuthenticated(true)}catch(e){sessionStore(null);$("login-error").textContent="Vuelve a entrar para reanudar tu sesión."}
    }
  }
  void initialize();
})();
