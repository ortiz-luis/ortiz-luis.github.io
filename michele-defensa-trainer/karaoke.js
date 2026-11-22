"use strict";

const $ = (id) => document.getElementById(id);
const ui = {
  video: $("narration"), play: $("play"), restart: $("restart"), back: $("back"),
  seek: $("seek"), clock: $("current-time"), duration: $("total-time"),
  current: $("current-line"), next: $("next-line"), cueCount: $("cue-count"),
  laser: $("laser"), tag: $("laser-tag"), frame: $("slide-frame"),
  rate: $("rate"), textVisible: $("text-visible"), laserVisible: $("laser-visible"),
  listen: $("mode-listen"), practice: $("mode-practice"), msg: $("message"),
  pointerStatus: $("pointer-status"), calibrate: $("calibrate"),
  export: $("export"), import: $("import-anchor"), anchorFile: $("anchor-file"),
  undoAnchor: $("undo-anchor"), resetAnchors: $("reset-anchors"),
  anchorCount: $("anchor-count"), fullscreen: $("fullscreen-button"),
  picker: $("slide-picker"), prevSlide: $("prev-slide"), nextSlide: $("next-slide"),
  autoNext: $("auto-next"), image: $("slide-image"),
  chapterLinks: document.querySelector(".chapter-links"),
  captions: $("captions"), prompterReset: $("prompter-reset")
};

let timeline = null;
let playlist = [];
let anchors = [];
const guidedAnchors = new Map(); // private, SRT-matched positions per slide
let calibration = false;
let solo = false;
let renderedCue = -3;
let renderedWord = -3;
let lastPointerLabel = "";
let finished = false;
const CAPTION_LAYOUT_KEY = "academia-m-prompter-geometry-v1";
let captionLayout = null;   // Fractions of the real slide, not pixels.
let captionPointer = null;

const clock = (t) => {
  const n = Math.max(0, Math.floor(t || 0));
  return String(Math.floor(n / 60)).padStart(2, "0") + ":" +
         String(n % 60).padStart(2, "0");
};
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const anchorStorageKey = () => "academia-karaoke" +
  String(timeline.slide).padStart(2,"0") + "-laser";
const currentAbsolute = () => timeline
  ? clamp(ui.video.currentTime || timeline.start, timeline.start, timeline.end)
  : 0;

function setMessage(message, isError = false) {
  ui.msg.textContent = message;
  ui.msg.style.color = isError ? "#ff9d9d" : "#aebfcd";
}

function getImageGeometry() {
  const r = ui.frame.getBoundingClientRect();
  const scale = Math.min(r.width / 16, r.height / 9);
  const width = 16 * scale, height = 9 * scale;
  return {
    x: (r.width - width) / 2,
    y: (r.height - height) / 2,
    width, height
  };
}

/* Keep the teleprompter INSIDE the exact displayed 16:9 image,
   not in the container letterbox or below the shared slide. */
function fitReferenceLayout() {
  const canvas = document.getElementById("meeting-content");
  if (!canvas) return;
  if (window.innerWidth <= 700) {
    canvas.style.width = "100%";
    return;
  }
  const availableHeight = canvas.clientHeight - 6;
  const sidebarWidth = window.innerWidth <= 1020 ? 154 :
    window.innerWidth <= 1340 ? 205 : 246;
  const gap = window.innerWidth <= 1340 ? 4 : 5;
  const idealSlideWidth = availableHeight * (16 / 9);
  const idealTotalWidth = idealSlideWidth + sidebarWidth + gap;
  canvas.style.width = Math.min(window.innerWidth, idealTotalWidth) + "px";
}

// The saved rectangle follows the displayed 16:9 slide in fullscreen or resize.
const MIN_CAPTION_W = .35;
const MIN_CAPTION_H = .10;
const CAPTION_MAX_FONT_SCALE = 2.5;

function defaultCaptionLayout(geom) {
  const sideInset = clamp(geom.width * .018, 12, 26);
  const bottomInset = clamp(geom.height * .032, 12, 27);
  const wantedHeight = Math.min(
    clamp(geom.height * .17, 94, 174),
    Math.max(45, geom.height - bottomInset - 16)
  );
  return {
    x: sideInset / geom.width,
    y: 1 - (bottomInset + wantedHeight) / geom.height,
    w: 1 - 2 * sideInset / geom.width,
    h: wantedHeight / geom.height,
    fontScale: 1
  };
}
function validateCaptionLayout(v) {
  if (!v || typeof v !== "object") return null;
  const keys = ["x","y","w","h","fontScale"];
  if (keys.some(k => !Number.isFinite(v[k]))) return null;
  if (v.x < 0 || v.y < 0 || v.w < MIN_CAPTION_W ||
      v.h < MIN_CAPTION_H || v.x + v.w > 1.00001 ||
      v.y + v.h > 1.00001 || v.fontScale < .3 ||
      v.fontScale > CAPTION_MAX_FONT_SCALE) return null;
  return Object.fromEntries(keys.map(k => [k,v[k]]));
}
function loadCaptionLayout() {
  try { return validateCaptionLayout(JSON.parse(localStorage.getItem(CAPTION_LAYOUT_KEY))); }
  catch (_) { return null; }
}
function saveCaptionLayout() {
  if (!captionLayout) return;
  try { localStorage.setItem(CAPTION_LAYOUT_KEY, JSON.stringify(captionLayout)); }
  catch (_) { setMessage("El navegador no pudo guardar el teleprónter.", true); }
}
function fitCaptionToBand() {
  if (!ui.current || !ui.captions || !captionLayout) return;
  const geom = getImageGeometry();
  // A side grip changes its single dimension without changing the nominal
  // text scale. A corner grip scales the box AND this nominal text scale.
  const baseFont = Math.min(47, Math.max(26, geom.width * .965 * .038));
  let size = clamp(baseFont * captionLayout.fontScale, 12, 85);
  const header = ui.captions.querySelector(".caption-status");
  const availableHeight = Math.max(9, ui.captions.clientHeight - (header?.offsetHeight || 0) - 14);
  const availableWidth = Math.max(20, ui.captions.clientWidth - 26);
  while (size > 11) {
    ui.current.style.fontSize = size.toFixed(2) + "px";
    if (ui.current.scrollWidth <= availableWidth + 1 &&
        ui.current.scrollHeight <= availableHeight + 1) break;
    size -= .7;
  }
}
function positionCaptionOverlay() {
  if (!ui.frame || !ui.captions) return;
  const geom = getImageGeometry();
  if (!geom.width || !geom.height) return;
  if (!captionLayout) captionLayout = loadCaptionLayout() || defaultCaptionLayout(geom);
  const p = captionLayout;
  ui.captions.style.left = (geom.x + p.x * geom.width).toFixed(2) + "px";
  ui.captions.style.top = (geom.y + p.y * geom.height).toFixed(2) + "px";
  ui.captions.style.bottom = "auto";
  ui.captions.style.width = (p.w * geom.width).toFixed(2) + "px";
  ui.captions.style.height = (p.h * geom.height).toFixed(2) + "px";
  fitCaptionToBand();
}
function applyCaptionPointer(event) {
  const drag = captionPointer;
  if (!drag || event.pointerId !== drag.id) return;
  const geom = getImageGeometry();
  const deltaX = (event.clientX - drag.clientX) / geom.width;
  const deltaY = (event.clientY - drag.clientY) / geom.height;
  const o = drag.initial;
  const mode = drag.mode;
  let r = {...o};
  if (mode === "move") {
    r.x = clamp(o.x + deltaX, 0, 1 - o.w);
    r.y = clamp(o.y + deltaY, 0, 1 - o.h);
  } else if (mode.length === 1) {
    // Dragging a border changes ONLY width or height.
    if (mode === "e") r.w = clamp(o.w + deltaX, MIN_CAPTION_W, 1-o.x);
    if (mode === "w") {
      r.w = clamp(o.w - deltaX, MIN_CAPTION_W, o.x+o.w);
      r.x = o.x+o.w-r.w;
    }
    if (mode === "s") r.h = clamp(o.h + deltaY, MIN_CAPTION_H, 1-o.y);
    if (mode === "n") {
      r.h = clamp(o.h - deltaY, MIN_CAPTION_H, o.y+o.h);
      r.y = o.y+o.h-r.h;
    }
  } else {
    // Drag a corner: size AND fontScale change by a single common factor,
    // while the opposite corner stays fixed.
    const east = mode.includes("e"), south = mode.includes("s");
    const directionX = east ? 1 : -1, directionY = south ? 1 : -1;
    const pixelW = o.w * geom.width, pixelH = o.h * geom.height;
    const physicalDX = (event.clientX - drag.clientX)*directionX;
    const physicalDY = (event.clientY - drag.clientY)*directionY;
    let factor = 1 + (physicalDX*pixelW + physicalDY*pixelH) /
      (pixelW*pixelW + pixelH*pixelH);
    const maxX = (east ? 1-o.x : o.x+o.w)/o.w;
    const maxY = (south ? 1-o.y : o.y+o.h)/o.h;
    factor = clamp(factor,
      Math.max(MIN_CAPTION_W/o.w, MIN_CAPTION_H/o.h, .3/o.fontScale),
      Math.min(maxX,maxY,CAPTION_MAX_FONT_SCALE/o.fontScale));
    r.w = o.w * factor;
    r.h = o.h * factor;
    r.x = east ? o.x : o.x+o.w-r.w;
    r.y = south ? o.y : o.y+o.h-r.h;
    r.fontScale = o.fontScale * factor;
  }
  r.x = clamp(r.x,0,1-r.w);
  r.y = clamp(r.y,0,1-r.h);
  captionLayout = r;
  positionCaptionOverlay();
}
function startCaptionPointer(event) {
  if (calibration || event.button !== 0 || !event.isPrimary) return;
  const grip = event.target.closest("[data-resize]");
  const mode = grip ? grip.dataset.resize : "move";
  captionPointer = {
    id:event.pointerId, mode, clientX:event.clientX,
    clientY:event.clientY, initial:{...captionLayout}
  };
  ui.captions.classList.add("interacting");
  ui.captions.setPointerCapture(event.pointerId);
  event.preventDefault();
  event.stopPropagation();
}
function stopCaptionPointer(event) {
  if (!captionPointer || event.pointerId !== captionPointer.id) return;
  if (event.type === "pointerup") applyCaptionPointer(event);
  captionPointer = null;
  ui.captions.classList.remove("interacting");
  if (ui.captions.hasPointerCapture(event.pointerId))
    ui.captions.releasePointerCapture(event.pointerId);
  saveCaptionLayout();
  event.stopPropagation();
}
function resetCaptionLayout() {
  captionPointer = null;
  captionLayout = defaultCaptionLayout(getImageGeometry());
  try { localStorage.removeItem(CAPTION_LAYOUT_KEY); }
  catch (_) {}
  ui.captions.classList.remove("interacting");
  positionCaptionOverlay();
  setMessage("Teleprónter restablecido a su posición y tamaño originales.");
}

function setPointerPosition(x, y, label) {
  const geom = getImageGeometry();
  const left = geom.x + clamp(x, 0, 1) * geom.width;
  const top = geom.y + clamp(y, 0, 1) * geom.height;
  ui.laser.style.left = left + "px";
  ui.laser.style.top = top + "px";
  ui.tag.style.left = left + "px";
  ui.tag.style.top = top + "px";
  if (label !== lastPointerLabel) {
    ui.tag.textContent = label || "Puntero";
    ui.pointerStatus.textContent = calibration ? (label || "Puntero activo") : "Láser activo";
    lastPointerLabel = label;
  }
}

function laserForTime(time) {
  if (!anchors.length) return;
  let target = anchors[0];
  for (const a of anchors) {
    if (a.at > time) break;
    target = a;
  }
  setPointerPosition(target.x, target.y, target.label);
}

function cueAtTime(time) {
  const cues = timeline.cues;
  for (let i = 0; i < cues.length; i++) {
    if (time < cues[i].start) return {index: -1, nextIndex: i};
    if (time >= cues[i].start && time < cues[i].end) {
      return {index: i, nextIndex: i + 1};
    }
  }
  return {index: -2, nextIndex: -1};
}

function updatePrompter(time) {
  if (!timeline) return;
  const selected = cueAtTime(time);
  // During the short silence before each real subtitle, preview its actual text.
  // Keep the audio and subtitle boundaries unchanged; only the coloring can lead.
  const cue = selected.index >= 0 ? timeline.cues[selected.index]
    : selected.index === -1 ? timeline.cues[selected.nextIndex] : null;
  // A small visual lead compensates for the perceived lag of the word highlight.
  // Only the yellow word changes: audio, cue boundaries and laser remain untouched.
  const KARAOKE_WORD_LEAD_SECONDS = 0.1;
  const wordIndex = cue && time >= cue.start - KARAOKE_WORD_LEAD_SECONDS ? Math.min(
    Math.max(0, cue.text.trim().split(/\s+/).length - 1),
    Math.floor(clamp((time + KARAOKE_WORD_LEAD_SECONDS - cue.start) / Math.max(.01, cue.end - cue.start), 0, .9999) *
      cue.text.trim().split(/\s+/).length)
  ) : -1;

  if (selected.index !== renderedCue || wordIndex !== renderedWord) {
    renderedCue = selected.index;
    renderedWord = wordIndex;
    ui.current.replaceChildren();
    if (cue) {
      const tokens = cue.text.trim().split(/\s+/);
      for (let i = 0; i < tokens.length; i++) {
        const span = document.createElement("span");
        span.className = "word " + (i < wordIndex ? "past" : i === wordIndex ? "now" : "future");
        span.textContent = tokens[i] + (i === tokens.length - 1 ? "" : " ");
        ui.current.appendChild(span);
      }
    } else {
      ui.current.textContent = selected.index === -2 ? "Lámina finalizada." : "";
    }
    ui.cueCount.textContent = selected.index >= 0
      ? "FRASE " + (selected.index + 1) + " / " + timeline.cues.length
      : "LÁMINA " + String(timeline.slide).padStart(2,"0");
    const next = timeline.cues[selected.nextIndex];
    ui.next.textContent = next ? next.text : "Fin del fragmento";
    fitCaptionToBand();
  }
}

function updateFrame() {
  if (!timeline) return;
  const t = currentAbsolute();
  const offset = t - timeline.start;
  ui.clock.textContent = clock(offset);
  if (document.activeElement !== ui.seek) ui.seek.value = offset.toFixed(2);
  const fraction = clamp(offset / (timeline.end - timeline.start), 0, 1);
  ui.seek.style.background = "linear-gradient(to right, #9b79a7 0%, #9b79a7 " +
    (fraction * 100).toFixed(2) + "%, #e0e1e5 " +
    (fraction * 100).toFixed(2) + "%, #e0e1e5 100%)";
  updatePrompter(t);
  laserForTime(t);
  if (!finished && ui.video.currentTime >= timeline.end - .10 && !ui.video.paused) {
    if (ui.autoNext.checked && timeline.slide < playlist.length) {
      activateSlide(timeline.slide + 1, {seek:false});
      return;
    }
    finished = true;
    ui.video.pause();
    setMessage("¡Terminaste la lámina " + timeline.slide + "! Puedes repetir o continuar.");
  }
}

function syncPlayingButton() {
  const playing = !ui.video.paused;
  ui.play.innerHTML = playing ? "Ⅱ <span>Pausar</span>" : "▶ <span>Reproducir</span>";
  ui.play.setAttribute("aria-label", playing ? "Pausar" : "Reproducir");
}

function seekAbsolute(target) {
  if (!timeline || !Number.isFinite(ui.video.duration)) return;
  const abs = clamp(target, timeline.start, timeline.end - .08);
  finished = false;
  ui.video.currentTime = abs;
  updateFrame();
}

async function togglePlayback() {
  if (!timeline) return;
  if (!ui.video.paused) {
    ui.video.pause();
    return;
  }
  if (currentAbsolute() >= timeline.end - .12) {
    if (ui.autoNext.checked && timeline.slide < playlist.length) activateSlide(timeline.slide + 1);
    else seekAbsolute(timeline.start);
  }
  try {
    await ui.video.play();
    setMessage(solo ? "Ensayo sin voz activado. Practica en voz alta." :
      "Audio de referencia y teleprónter sincronizados.");
  } catch (e) {
    setMessage("El navegador no pudo reproducir el MP4 local. Comprueba media/narration.mp4.", true);
  }
}

function setMode(practice) {
  solo = practice;
  ui.video.muted = practice;
  ui.listen.classList.toggle("active", !practice);
  ui.practice.classList.toggle("active", practice);
  ui.listen.setAttribute("aria-pressed", String(!practice));
  ui.practice.setAttribute("aria-pressed", String(practice));
  setMessage(practice ? "Modo de ensayo: voz de referencia silenciada; tú haces la exposición." :
    "Modo de escucha: narración de referencia activada.");
}

function refreshVisibility() {
  const visible = ui.laserVisible.checked;
  ui.laser.classList.toggle("off", !visible);
  ui.tag.classList.toggle("off", !visible || !calibration);
  ui.pointerStatus.textContent = !visible ? "Láser oculto" : (calibration ? (lastPointerLabel || "Calibrar láser") : "Láser activo");
  document.body.classList.toggle("hidden-script", !ui.textVisible.checked);
}

function safeStoredAnchors() {
  try {
    const stored = JSON.parse(localStorage.getItem(anchorStorageKey()) || "[]");
    if (!Array.isArray(stored)) return [];
    return stored.filter(a =>
      Number.isFinite(a.at) && Number.isFinite(a.x) && Number.isFinite(a.y) &&
      a.at >= timeline.start && a.at < timeline.end &&
      a.x >= 0 && a.x <= 1 && a.y >= 0 && a.y <= 1
    ).map(a => ({at: a.at, x: a.x, y: a.y, label: "Punto ajustado"}));
  } catch (_) {
    return [];
  }
}

function refreshAnchorControls() {
  const count = timeline ? safeStoredAnchors().length : 0;
  const baseCount = timeline ? (guidedAnchors.get(timeline.slide) || timeline.anchors).length : 0;
  ui.anchorCount.textContent = count + (count === 1 ? " punto propio" : " puntos propios") +
    (timeline ? " · base " + baseCount + " puntos · Lámina " +
      String(timeline.slide).padStart(2,"0") : "");
  ui.import.disabled = !timeline;
  ui.export.disabled = !timeline;
  ui.undoAnchor.disabled = !count;
  ui.resetAnchors.disabled = !count;
}

function saveAnchors(updated) {
  if (!timeline) return false;
  try {
    if (updated.length) localStorage.setItem(anchorStorageKey(), JSON.stringify(updated));
    else localStorage.removeItem(anchorStorageKey());
  } catch (_) {
    setMessage("No se pudo guardar la calibración en este navegador.", true);
    return false;
  }
  anchors = (guidedAnchors.get(timeline.slide) || timeline.anchors).concat(updated).sort((a, b) => a.at - b.at);
  refreshAnchorControls();
  laserForTime(currentAbsolute());
  return true;
}

function storeAnchor(anchor) {
  const previous = safeStoredAnchors();
  const updated = previous.filter(a => Math.abs(a.at - anchor.at) > .5);
  updated.push(anchor);
  return saveAnchors(updated);
}

function undoLastAnchor() {
  const saved = safeStoredAnchors();
  if (!saved.length) return;
  if (saveAnchors(saved.slice(0, -1))) setMessage("Último ajuste eliminado de esta lámina.");
}

function resetCustomAnchors() {
  if (!timeline || !safeStoredAnchors().length) return;
  if (!window.confirm("¿Volver a la calibración base de esta lámina? Se borrarán sus ajustes locales.")) return;
  if (saveAnchors([])) setMessage("Restaurada la calibración base de esta lámina.");
}

async function importCustomAnchors(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file || !timeline) return;
  if (file.size > 200000) {
    setMessage("El archivo de puntos excede el tamaño permitido.", true); return;
  }
  const currentSlide = timeline.slide;
  try {
    const payload = JSON.parse(await file.text());
    if (!payload || payload.source !== "academia-karaoke" ||
        payload.slide !== currentSlide || !Array.isArray(payload.overrides) ||
        payload.overrides.length > 200) {
      throw new Error("Selecciona una exportación de esta misma lámina (máximo 200 puntos).");
    }
    const saved = payload.overrides;
    if (saved.some(a => !a || !Number.isFinite(a.at) ||
        !Number.isFinite(a.x) || !Number.isFinite(a.y) ||
        a.at < timeline.start || a.at >= timeline.end ||
        a.x < 0 || a.x > 1 || a.y < 0 || a.y > 1)) {
      throw new Error("El archivo contiene tiempos o coordenadas fuera de la lámina.");
    }
    if (currentSlide !== timeline.slide) {
      throw new Error("Cambiaste de lámina durante la importación. Inténtalo de nuevo.");
    }
    const normalized = saved.map(a => ({
      at: Math.round(a.at * 1000) / 1000,
      x: Math.round(a.x * 10000) / 10000,
      y: Math.round(a.y * 10000) / 10000,
      label: "Punto ajustado"
    }));
    if (saveAnchors(normalized)) setMessage(
      "Importados " + normalized.length + " puntos de la lámina " + currentSlide +
      ". Solo se guardan en este navegador."
    );
  } catch (e) {
    setMessage("No se importaron puntos: " + e.message, true);
  }
}

function onSlideClick(event) {
  if (!calibration || !timeline || event.target.closest("button")) return;
  const r = ui.frame.getBoundingClientRect();
  const geom = getImageGeometry();
  const x = (event.clientX - r.left - geom.x) / geom.width;
  const y = (event.clientY - r.top - geom.y) / geom.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return;
  const anchor = {
    at: Math.round(currentAbsolute() * 1000) / 1000,
    x: Math.round(x * 10000) / 10000,
    y: Math.round(y * 10000) / 10000,
    label: "Punto ajustado"
  };
  if (!storeAnchor(anchor)) return;
  setPointerPosition(anchor.x, anchor.y, anchor.label);
  setMessage("Punto del láser guardado localmente para el segundo " + clock(anchor.at - timeline.start) + ".");
}

function exportAnchors() {
  if (!timeline) return;
  const payload = JSON.stringify({
    source: "academia-karaoke",
    slide: timeline.slide,
    overrides: safeStoredAnchors()
  }, null, 2);
  const url = URL.createObjectURL(new Blob([payload], {type: "application/json"}));
  const link = document.createElement("a");
  link.href = url;
  link.download = "puntero-lamina" + String(timeline.slide).padStart(2,"0") + ".json";
  link.click();
  URL.revokeObjectURL(url);
  setMessage("Puntos personalizados descargados. El archivo permanece bajo tu control.");
}


function activateSlide(number, {seek = true} = {}) {
  const selected = playlist.find(slide => slide.slide === Number(number));
  if (!selected) return false;
  if (calibration) {
    calibration = false;
    ui.frame.classList.remove("calibrating");
    ui.calibrate.textContent = "Calibrar láser";
  }
  timeline = selected;
  anchors = (guidedAnchors.get(selected.slide) || selected.anchors).concat(safeStoredAnchors()).sort((a,b) => a.at-b.at);
  refreshAnchorControls();
  // The original filename in the PRIVATE timings JSON is never served from Pages.
  // Reject stale image requests if the user changes slides while downloading.
  const imageFor = selected.slide;
  window.KaraokePrivate.media("slides/slide-"+String(imageFor).padStart(2,"0")+".png")
    .then(url => { if (timeline?.slide===imageFor) ui.image.src=url; })
    .catch(err => setMessage("No se pudo cargar la lámina privada "+imageFor+": "+err.message,true));
  positionCaptionOverlay();
  ui.image.alt = "Lámina " + selected.slide + " original: " + selected.title;
  ui.picker.value = String(selected.slide);
  ui.prevSlide.disabled = selected.slide === 1;
  ui.nextSlide.disabled = selected.slide === playlist.length;
  document.getElementById("meeting-clock").textContent =
    "Academia M · Lámina " + String(selected.slide).padStart(2,"0") + "/" + playlist.length;
  document.title = "Academia M · Lámina " + String(selected.slide).padStart(2,"0") + "/" + playlist.length;
  ui.chapterLinks.classList.toggle("only09",selected.slide !== 9);
  ui.seek.max = (selected.end-selected.start).toFixed(3);
  ui.duration.textContent = clock(selected.end-selected.start);
  renderedCue = -3;
  renderedWord = -3;
  lastPointerLabel = "";
  finished = false;
  refreshVisibility();
  if (seek && Number.isFinite(ui.video.duration)) {
    ui.video.currentTime = clamp(selected.start+.04,0,Math.max(0,ui.video.duration-.05));
  }
  updateFrame();
  return true;
}

function switchSlide(delta) {
  if (!timeline) return;
  const next = clamp(timeline.slide + delta,1,playlist.length);
  activateSlide(next);
}

async function loadPlaylist() {
  await window.KaraokePrivate.authorize();
  // The 261 Spanish cues + red laser anchors stay in protected Storage.
  const data = await window.KaraokePrivate.json("guided/timings-all.json");
  if (!Array.isArray(data.slides) || data.slides.length !== 11 ||
      data.slides.some((v,i)=>v.slide!==i+1 || !Array.isArray(v.cues) ||
       !v.cues.length || !Array.isArray(v.anchors))) {
    throw new Error("La lista de las 11 láminas no es válida.");
  }
  playlist = data.slides;
  // The 17 original media objects remain unmodified. Semantic cue positions
  // are stored in member-only slide_guides, with original anchors as fallback.
  const privateRows = await window.KaraokePrivate.laserAnchors();
  for (const row of privateRows) {
    const source = playlist.find(item => item.slide === Number(row.slide));
    if (!source || !Array.isArray(row.laser_anchors) ||
        row.laser_anchors.length < 2 || row.laser_anchors.length > 24) continue;
    const safe = row.laser_anchors.every(a =>
      a && Number.isFinite(a.at) && a.at >= source.start && a.at < source.end &&
      Number.isFinite(a.x) && a.x >= 0 && a.x <= 1 &&
      Number.isFinite(a.y) && a.y >= 0 && a.y <= 1 &&
      typeof a.label === "string" && a.label.length <= 100);
    if (safe) guidedAnchors.set(source.slide,
      row.laser_anchors.map(a=>({at:a.at,x:a.x,y:a.y,label:a.label}))
        .sort((a,b)=>a.at-b.at));
  }
  // Keep jury images within the private bucket, and fail visibly if missing.
  await window.KaraokePrivate.loadJury();
  const videoUrl = await window.KaraokePrivate.media("guided/narration.mp4");
  // Also prime all eleven slides; each object remains a Blob URL in this tab only.
  const requestedFirst=Number(new URLSearchParams(window.location.search).get("slide"));
  const firstProtectedSlide=Number.isInteger(requestedFirst)&&requestedFirst>=1&&requestedFirst<=11
    ? requestedFirst:1;
  await window.KaraokePrivate.media("slides/slide-"+
    String(firstProtectedSlide).padStart(2,"0")+".png");
  window.KaraokePrivate.ready();
  ui.video.src = videoUrl;
  ui.video.load();
  Promise.allSettled(playlist.map(s=>window.KaraokePrivate.media(
    "slides/slide-"+String(s.slide).padStart(2,"0")+".png"
  )));
  ui.picker.replaceChildren();
  for (const item of playlist) {
    const option = document.createElement("option");
    option.value = String(item.slide);
    option.textContent = String(item.slide).padStart(2,"0") + " · " + item.title;
    ui.picker.appendChild(option);
  }
  const requested = Number(new URLSearchParams(window.location.search).get("slide"));
  const initialSlide = Number.isInteger(requested) && requested>=1 && requested<=11
    ? requested : 1;
  ui.seek.disabled = false;
  ui.rate.value = "1";
  ui.video.playbackRate = 1;
  ui.video.addEventListener("loadedmetadata", () => {
    if (ui.video.duration < playlist.at(-1).end - 2) {
      setMessage("El video no cubre todas las láminas esperadas.",true);
      return;
    }
    activateSlide(initialSlide);
    ui.play.disabled = false;
    setMessage("Listo: " + playlist.length + " láminas. Pulsa Reproducir.");
  });
  ui.video.addEventListener("play",syncPlayingButton);
  ui.video.addEventListener("pause",syncPlayingButton);
  ui.video.addEventListener("seeked",updateFrame);
  ui.video.addEventListener("error",() =>
    setMessage("No se pudo cargar el video privado.",true));
  if (ui.video.readyState >= 1) {
    activateSlide(initialSlide);
    ui.play.disabled = false;
  }
  setMode(false);
  window.setInterval(updateFrame,85);
  window.addEventListener("resize", () => {fitReferenceLayout();positionCaptionOverlay();updateFrame();});
  document.addEventListener("fullscreenchange", () => {fitReferenceLayout();positionCaptionOverlay();updateFrame();});
  ui.image.addEventListener("load", positionCaptionOverlay);
  fitReferenceLayout();
  positionCaptionOverlay();
}

ui.play.addEventListener("click", togglePlayback);
const navToggle = document.getElementById("meeting-clock");
navToggle.addEventListener("click", () => {
  const open = document.querySelector(".header-right").classList.toggle("nav-open");
  navToggle.setAttribute("aria-expanded",String(open));
});
ui.picker.addEventListener("change", () => {
  activateSlide(Number(ui.picker.value));
  document.querySelector(".header-right").classList.remove("nav-open");
  navToggle.setAttribute("aria-expanded","false");
});
ui.prevSlide.addEventListener("click", () => switchSlide(-1));
ui.nextSlide.addEventListener("click", () => switchSlide(1));
ui.restart.addEventListener("click", () => seekAbsolute(timeline && timeline.start));
ui.back.addEventListener("click", () => seekAbsolute(currentAbsolute() - 5));
ui.seek.addEventListener("input", () => timeline &&
  seekAbsolute(timeline.start + Number(ui.seek.value)));
ui.rate.addEventListener("change", () => ui.video.playbackRate = Number(ui.rate.value));
ui.listen.addEventListener("click", () => setMode(false));
ui.practice.addEventListener("click", () => setMode(true));
ui.textVisible.addEventListener("change", refreshVisibility);
ui.laserVisible.addEventListener("change", refreshVisibility);
ui.captions.addEventListener("pointerdown", startCaptionPointer);
ui.captions.addEventListener("pointermove", applyCaptionPointer);
ui.captions.addEventListener("pointerup", stopCaptionPointer);
ui.captions.addEventListener("pointercancel", stopCaptionPointer);
ui.captions.addEventListener("lostpointercapture", () => {
  if (captionPointer) {
    captionPointer = null;
    ui.captions.classList.remove("interacting");
    saveCaptionLayout();
  }
});
ui.prompterReset.addEventListener("click", resetCaptionLayout);
ui.calibrate.addEventListener("click", () => {
  calibration = !calibration;
  ui.frame.classList.toggle("calibrating", calibration);
  refreshVisibility();
  ui.calibrate.textContent = calibration ? "Finalizar calibración" : "Calibrar puntero";
  setMessage(calibration
    ? "Calibración activa: pausa en un instante y haz clic en el punto de la lámina."
    : "Calibración finalizada; los puntos se conservaron en este navegador.");
});
ui.frame.addEventListener("click", onSlideClick);
ui.export.addEventListener("click", exportAnchors);
ui.import.addEventListener("click", () => ui.anchorFile.click());
ui.anchorFile.addEventListener("change", (event) => void importCustomAnchors(event));
ui.undoAnchor.addEventListener("click", undoLastAnchor);
ui.resetAnchors.addEventListener("click", resetCustomAnchors);
refreshAnchorControls();
async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) await document.querySelector(".meeting").requestFullscreen();
    else await document.exitFullscreen();
  } catch (_) {
    setMessage("Tu navegador no permite la pantalla completa en este momento.", true);
  }
}
ui.fullscreen.addEventListener("click", toggleFullscreen);
document.getElementById("fullscreen-stage").addEventListener("click", toggleFullscreen);
document.querySelectorAll("[data-jump]").forEach(button => {
  button.addEventListener("click", () => seekAbsolute(Number(button.dataset.jump)));
});
document.addEventListener("keydown", (event) => {
  const tag = (event.target && event.target.tagName || "").toLowerCase();
  if (event.code === "ArrowRight" && !event.ctrlKey && !event.altKey && !event.metaKey &&
      !["input","select","textarea"].includes(tag)) { event.preventDefault(); switchSlide(1); }
  if (event.code === "ArrowLeft" && !event.ctrlKey && !event.altKey && !event.metaKey &&
      !["input","select","textarea"].includes(tag)) { event.preventDefault(); switchSlide(-1); }
  if (event.code === "KeyF" && !event.ctrlKey && !event.altKey && !event.metaKey && !["button", "input", "select", "textarea"].includes(tag)) {
    event.preventDefault();
    toggleFullscreen();
  }
  if (event.code === "Space" && !["button", "input", "select", "textarea"].includes(tag)) {
    event.preventDefault();
    togglePlayback();
  }
});
refreshVisibility();
loadPlaylist().catch(e => {
  setMessage("No se pudieron preparar los medios: " + e.message, true);
  window.KaraokePrivate.fail(e.message);
});

/* Meeting look-and-feel: these controls only change this PRIVATE simulation.
   They never connect to Zoom, activate microphone or use a real camera. */
const participantsButton = document.getElementById("toggle-participants");
participantsButton.addEventListener("click", () => {
  const container = document.getElementById("meeting-content");
  const hidden = container.classList.toggle("jury-hidden");
  participantsButton.setAttribute("aria-pressed", String(!hidden));
  setMessage(hidden ? "Vista de participantes oculta para concentrarte." : "Comisión ficticia visible.");
});
document.getElementById("end-meeting").addEventListener("click", () => {
  ui.video.pause();
  if (timeline) seekAbsolute(timeline.start);
  setMessage("Ensayo terminado. Pulsa Reproducir para comenzar otra vez.");
});
