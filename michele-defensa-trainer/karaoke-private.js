"use strict";
/*
 * Academia M · Private Media bridge.
 * Original rehearsal media never appears in the public GitHub Pages bundle.
 * This module reads Supabase authenticated Storage using RLS and the existing
 * same-origin session. No service-role keys, signed public URLs, or fake media.
 */
(() => {
  const KEY="academia-m-session-v1";
  const BUCKET="academia-v6-private";
  const cfg=window.ACADEMIA_CONFIG||{};
  const base=String(cfg.url||"").replace(/\/+$/,"");
  const apikey=String(cfg.publishableKey||"");
  const cache=new Map();
  const gate=document.getElementById("private-notice");
  const gateMessage=document.getElementById("private-notice-message");
  const safePaths=/^(?:slides\/slide-(?:0[1-9]|1[01])\.png|guided\/(?:narration\.mp4|timings-all\.json)|jurors\/(?:gustavo-balmaceda|sebastian-valenzuela|silvio-cuneo|federico-szczaranski)\.jpg)$/;
  let identity=null;
  function error(message){
    gate.hidden=false;
    gateMessage.textContent=String(message||"No se pudo autorizar tu acceso.");
  }
  function session(){
    try{return JSON.parse(sessionStorage.getItem(KEY)||"null");}
    catch{return null;}
  }
  function storeSession(s){
    try{sessionStorage.setItem(KEY,JSON.stringify(s));}
    catch{throw new Error("El navegador no permite mantener una sesión privada.");}
  }
  async function refresh(){
    const s=session();
    if(!s?.refresh_token)throw new Error("Tu sesión ha caducado. Entra otra vez desde Mi academia.");
    const response=await fetch(base+"/auth/v1/token?grant_type=refresh_token",{
      method:"POST",cache:"no-store",
      headers:{apikey,"Content-Type":"application/json"},
      body:JSON.stringify({refresh_token:s.refresh_token})
    });
    if(!response.ok)throw new Error("La sesión necesita volver a iniciarse.");
    const updated=await response.json();
    if(!updated.access_token)throw new Error("No se pudo renovar el acceso.");
    updated.expires_at=Math.floor(Date.now()/1000)+Number(updated.expires_in||3600);
    storeSession(updated);
    return updated.access_token;
  }
  async function token(){
    const s=session();
    if(!s?.access_token)throw new Error("Inicia sesión primero en Mi academia.");
    if(!s.expires_at||Number(s.expires_at)<Date.now()/1000+80)return refresh();
    return s.access_token;
  }
  async function authorizedFetch(path,retry=true){
    const bearer=await token();
    const response=await fetch(base+path,{
      method:"GET",cache:"no-store",
      headers:{apikey,Authorization:"Bearer "+bearer}
    });
    if(response.status===401&&retry){
      await refresh();
      return authorizedFetch(path,false);
    }
    if(!response.ok){
      const info=response.status===403?"La cuenta no está autorizada para estos materiales.":
        response.status===404?"Falta un archivo privado de esta presentación.":
        "No se pudo descargar el material privado ("+response.status+").";
      throw new Error(info);
    }
    return response;
  }
  async function authorize(){
    if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base)||!apikey)
      throw new Error("El acceso de Supabase no está configurado.");
    const user=await(await authorizedFetch("/auth/v1/user")).json();
    if(!user?.id)throw new Error("La sesión no corresponde a un usuario válido.");
    const roles=await(await authorizedFetch("/rest/v1/member_roles?select=role&user_id=eq."+
      encodeURIComponent(user.id))).json();
    if(!roles.some(row=>row.role==="student"||row.role==="admin"))
      throw new Error("Tu cuenta no tiene acceso a la academia.");
    identity={id:user.id,role:roles.find(r=>r.role==="admin")?"admin":"student"};
    // Only a timestamp event. No slide content, spoken answers or recordings.
    void (async()=>{
      try{
        await fetch(base+"/rest/v1/activity_events",{
          method:"POST",cache:"no-store",
          headers:{apikey,Authorization:"Bearer "+await token(),"Content-Type":"application/json"},
          body:JSON.stringify({event_type:"app_open"})
        });
      }catch(_){/* Logging should never interrupt the oral rehearsal. */}
    })();
  }
  async function json(path){
    if(!identity)throw new Error("Debes identificarte antes de cargar el guion.");
    if(!safePaths.test(path)||!path.endsWith(".json"))throw new Error("Archivo no autorizado.");
    const response=await authorizedFetch("/storage/v1/object/authenticated/"+BUCKET+"/"+path);
    return response.json();
  }
  async function media(path){
    if(!identity)throw new Error("Debes identificarte antes de cargar las imágenes.");
    if(!safePaths.test(path)||path.endsWith(".json"))throw new Error("Medio no autorizado.");
    if(cache.has(path))return cache.get(path);
    const promise=(async()=>{
      const response=await authorizedFetch("/storage/v1/object/authenticated/"+BUCKET+"/"+path);
      const blob=await response.blob();
      // This rejects unexpected HTML or errors returned with HTTP 200.
      const expected=path.endsWith(".mp4")?"video/":"image/";
      if(blob.size<64||!blob.type.startsWith(expected))
        throw new Error("Tipo o contenido de archivo inválido: "+path);
      return URL.createObjectURL(blob);
    })();
    cache.set(path,promise);
    try{return await promise;}
    catch(e){cache.delete(path);throw e;}
  }
  async function loadJury(){
    const portraits=[...document.querySelectorAll("img[data-private-path]")];
    if(portraits.length!==4)throw new Error("La lista de cuatro jurados no coincide con la versión aprobada.");
    await Promise.all(portraits.map(async image=>{
      const url=await media(image.dataset.privatePath);
      image.src=url;
      image.decoding="async";
    }));
  }
  function ready(){
    if(!identity)throw new Error("La sesión no ha sido verificada.");
    gate.hidden=true;
  }
  window.addEventListener("pagehide",()=>{
    for(const promise of cache.values()){
      void promise.then(url=>URL.revokeObjectURL(url)).catch(()=>{});
    }
    cache.clear();
  });
  window.KaraokePrivate=Object.freeze({authorize,json,media,loadJury,ready,fail:error});
})();
