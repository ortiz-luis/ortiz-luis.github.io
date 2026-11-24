
"use strict";
const form=document.querySelector("#unlock"),status=document.querySelector("#status"),input=document.querySelector("#key");
const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
form.addEventListener("submit",async e=>{
 e.preventDefault();
 const button=form.querySelector("button");button.disabled=true;status.textContent="Abriendo...";
 try{
  const raw=decode(input.value.trim().replace(/-/g,"+").replace(/_/g,"/"));
  if(raw.length!==32)throw Error("Clave inválida");
  const key=await crypto.subtle.importKey("raw",raw,"AES-GCM",false,["decrypt"]);
  const response=await fetch("academy.enc",{cache:"no-store"});
  if(!response.ok)throw Error("Archivo no disponible");
  const encrypted=new Uint8Array(await response.arrayBuffer());
  const clear=await crypto.subtle.decrypt({name:"AES-GCM",iv:encrypted.slice(0,12)},key,encrypted.slice(12));
  const p=JSON.parse(new TextDecoder().decode(clear));
  const urls=new Map();
  for(const [name,base64] of Object.entries(p.assets)){
   const type=name.endsWith(".png")?"image/png":name.endsWith(".mp3")?"audio/mpeg":"text/plain";
   urls.set(name,URL.createObjectURL(new Blob([decode(base64)],{type})));
  }
  window.PAOS_ASSET_URL=name=>{if(!urls.has(name))throw Error("Asset missing");return urls.get(name)};
  window.addEventListener("pagehide",()=>{for(const u of urls.values())URL.revokeObjectURL(u)},{once:true});
  const doc=new DOMParser().parseFromString(p.html,"text/html");
  doc.querySelectorAll("script,link").forEach(n=>n.remove());
  input.value="";
  document.title=doc.title;
  document.head.querySelectorAll("style").forEach(n=>n.remove());
  for(const css of p.css){const style=document.createElement("style");style.textContent=css;document.head.append(style)}
  document.body.replaceChildren(...Array.from(doc.body.childNodes).map(n=>document.importNode(n,true)));
  for(const [name,source] of p.scripts){const script=document.createElement("script");script.textContent=source;document.body.append(script)}
 }catch(err){status.textContent="No se pudo abrir: clave incorrecta, archivo inválido o navegador incompatible.";button.disabled=false;}
});
