/* Riya AI Assistant v2 — chat + voice + Gemini API + PWA
   Modes: Chat | Exam Prep | Dost Mode
   PDF notes: print-to-PDF (Hindi bhi sahi print hota hai).
   API key sirf user ke browser (localStorage) me save hoti hai.
   Key Google ke Gemini API ko jaati hai, aur kahin nahi. */

const $ = (id) => document.getElementById(id);
const chatEl = $("chat");
const inputEl = $("input");
const sendBtn = $("sendBtn");
const micBtn = $("micBtn");
const orb = $("orb");
const chipsEl = $("chips");
const toastEl = $("toast");

const LS_KEY = "riya-ai-settings-v1";
const LS_HISTORY = "riya-ai-history-v1";

/* ---------- Settings ---------- */
const defaults = {
  apiKey: "",
  model: "gemini-3.8-flash",
  assistantName: "Riya",
  lang: "auto",       // auto | hi | en
  voiceReply: true,
  mode: "chat",       // chat | exam | dost
};
let settings = { ...defaults };
try {
  const saved = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  settings = { ...defaults, ...saved };
} catch (e) { /* ignore corrupt storage */ }

function saveSettings() {
  localStorage.setItem(LS_KEY, JSON.stringify(settings));
  $("appName").textContent = settings.assistantName + " AI";
}

/* ---------- Modes ---------- */
const MODES = {
  chat: {
    label: "Chat",
    placeholder: "Kuch bhi poochho...",
    welcome: "Namaste! Main {name} hoon, aapki AI assistant. Aap mujhse kuch bhi poochh sakte ho — likh kar ya bol kar. Hindi ya English, jo aapko pasand ho.",
    modeOn: "Chat mode on hai.",
    chips: ["Mujhe kuch naya sikhao", "Ek kahani sunao", "Aaj ka motivation do", "Aasan bhasha me samjhao"],
    system: "You are {name}, a helpful, polite AI assistant. " +
      "Reply in the same language the user writes in: if the user writes in Hindi (or Hinglish), reply in Hindi; if in English, reply in English. " +
      "Keep answers clear, short and useful. Use simple formatting, no long lectures. " +
      "If asked who made you, say you are an AI assistant built for everyday help.",
  },
  exam: {
    label: "Exam Prep",
    placeholder: "Kis topic ke notes chahiye? (jaise: ML Unit 1)",
    welcome: "Exam Prep mode on hai! Main tumhari GTU exam taiyaari me madad karungi — notes, important questions, quiz aur revision plan. Kis subject ya topic se shuru karein?",
    modeOn: "Exam Prep mode on hai — notes, important questions, quiz aur revision plan ke liye taiyaar hoon.",
    chips: ["Is topic ke notes banao", "Important questions batao", "5 question ka quiz lo", "7 din ka revision plan banao"],
    system: "You are {name}, an exam preparation coach for a B.Tech Electronics and Communication student (GTU). " +
      "Give exam-focused, point-wise, easy-to-remember notes. Use clear headings, short bullet points, simple definitions, formulas where needed, and real examples. " +
      "End every notes answer with 3 to 5 important questions (with very short answers) that could come in the exam. " +
      "When the user asks for a quiz, ask questions one by one and check each answer before moving on. " +
      "Reply in the same language the user writes in (Hindi, Hinglish or English). " +
      "Keep the structure clean so the notes can be saved as a PDF.",
  },
  dost: {
    label: "Dost Mode",
    placeholder: "Kya haal hai? Kuch bhi batao...",
    welcome: "Dost mode on hai! Main yahan hoon — padhai, stress, ya bas baatein, kuch bhi share kar sakte ho. Aaj kaisa din raha?",
    modeOn: "Dost mode on hai — main tumhari dost ki tarah yahin hoon.",
    chips: ["Aaj ka motivation do", "Padhai ke liye motivate karo", "Thoda mazak sunao", "Stress kam karne ke tips do"],
    system: "You are {name}, the user's close friend — warm, supportive, fun and honest. " +
      "Talk like a real friend in Hinglish/Hindi. Motivate, listen, joke lightly, and help with studies without sounding like a textbook. " +
      "If the user is stressed or low, be kind first, then give one small practical step. " +
      "Reply in the same language the user writes in.",
  },
};
const mode = () => MODES[settings.mode] || MODES.chat;

/* ---------- UI text (Hindi default, English when chosen) ---------- */
const STRINGS = {
  hi: {
    needKey: "Abhi main server se connect nahi ho pa rahi. Thodi der baad dobara try karo.",
    listening: "Sun rahi hoon... bolo",
    micUnsupported: "Is browser me mic support nahi hai. Chrome app me kholo.",
    thinking: "Soch rahi hoon",
    speak: "Sunao",
    copy: "Copy",
    pdf: "PDF",
    again: "Dobara",
    copied: "Copy ho gaya.",
    errorKey: "Server se jawab nahi mila. Thodi der baad dobara try karo.",
    errorQuota: "Aaj ki free limit khatam ho gayi lagti hai. Thodi der baad try karo.",
    errorNet: "Internet se connect nahi ho pa raha. Connection check karo aur dobara try karo.",
    errorGeneric: "Kuch gadbad ho gayi. Dobara try karo.",
    errorProxy: "Server se jawab nahi mila. Thodi der baad dobara try karo.",
    cleared: "Chat saaf kar di.",
    shared: "Share kar diya.",
    installed: "App install ho gayi.",
    pdfReady: "Notes ka page taiyaar hai — print dialog me 'Save as PDF' chuno.",
  },
  en: {
    needKey: "I can't reach the server right now. Please try again in a while.",
    listening: "Listening... speak now",
    micUnsupported: "Mic is not supported in this browser. Open it in the Chrome app.",
    thinking: "Thinking",
    speak: "Listen",
    copy: "Copy",
    pdf: "PDF",
    again: "Again",
    copied: "Copied.",
    errorKey: "The server did not answer. Please try again in a while.",
    errorQuota: "The free limit for today seems over. Try again in a while.",
    errorNet: "Could not reach the internet. Check your connection and try again.",
    errorGeneric: "Something went wrong. Please try again.",
    errorProxy: "The server did not answer. Please try again in a while.",
    cleared: "Chat cleared.",
    shared: "Shared.",
    installed: "App installed.",
    pdfReady: "Notes page is ready — choose 'Save as PDF' in the print dialog.",
  },
};

function lang() {
  if (settings.lang === "hi") return "hi";
  if (settings.lang === "en") return "en";
  return "hi"; // UI default Hindi; assistant answers in user's language
}
const t = (key) => STRINGS[lang()][key];

/* ---------- Chat history ---------- */
let history = [];
try {
  history = JSON.parse(localStorage.getItem(LS_HISTORY) || "[]");
} catch (e) { history = []; }

function saveHistory() {
  try {
    localStorage.setItem(LS_HISTORY, JSON.stringify(history.slice(-40)));
  } catch (e) { /* storage full — ignore */ }
}

function attachActions(div, text) {
  const row = document.createElement("div");
  row.className = "msg-actions";
  const mk = (label, cls, fn) => {
    const b = document.createElement("button");
    b.className = "action-btn " + cls;
    b.type = "button";
    b.textContent = label;
    b.onclick = fn;
    row.appendChild(b);
    return b;
  };
  mk(t("speak"), "speak-btn", () => speak(text));
  mk(t("copy"), "copy-btn", () => copyText(text));
  mk(t("pdf"), "pdf-btn", () => downloadNotesPDF(text));
  // Dobara sirf sabse naye AI message par rakho
  document.querySelectorAll(".regen-btn").forEach((b) => b.remove());
  mk(t("again"), "regen-btn", () => regenerateLast());
  div.appendChild(row);
}

function addMsg(text, who, { save = true, actions = false } = {}) {
  const div = document.createElement("div");
  div.className = "msg " + who;
  div.textContent = text;
  if (actions && who === "ai") attachActions(div, text);
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
  if (save) {
    history.push({ role: who === "user" ? "user" : "model", text });
    saveHistory();
  }
  return div;
}

function renderChips() {
  chipsEl.innerHTML = "";
  mode().chips.forEach((c) => {
    const b = document.createElement("button");
    b.className = "chip";
    b.type = "button";
    b.textContent = c;
    b.onclick = () => { inputEl.value = c; sendMessage(); };
    chipsEl.appendChild(b);
  });
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.add("hidden"), 3500);
}

/* ---------- Mode switching ---------- */
function setMode(next, announce = true) {
  if (!MODES[next]) next = "chat";
  settings.mode = next;
  saveSettings();
  document.querySelectorAll(".mode-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === next);
  });
  inputEl.placeholder = mode().placeholder;
  renderChips();
  if (announce) addMsg(mode().modeOn, "ai system", { save: false });
}
document.querySelectorAll(".mode-btn").forEach((b) => {
  b.addEventListener("click", () => setMode(b.dataset.mode));
});

/* ---------- Speech: listen + speak ---------- */
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isListening = false;

if (!SpeechRecognition) {
  micBtn.style.opacity = "0.4";
}

function detectSpeechLang(text) {
  return /[\u0900-\u097F]/.test(text) ? "hi-IN" : "en-US";
}

/* ---------- Speech: listen + speak (sweet, warm, cute voice) ---------- */
/* Phone/browser ki available voices me se warm female voice chuno —
   Hindi ke liye Hindi female, English ke liye English female.
   Pitch thoda upar (1.15) aur speed thodi slow (0.95) — meethi, warm tone. */
function pickWarmVoice(langCode) {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices() || [];
  if (!voices.length) return null;
  const want = langCode.indexOf("hi") === 0 ? "hi" : "en";
  const score = (v) => {
    const hay = ((v.name || "") + " " + (v.lang || "")).toLowerCase();
    let s = 0;
    if ((v.lang || "").toLowerCase().indexOf(want) === 0) s += 3;
    if (/female|woman|girl|samantha|zira|aria|google हिन्दी|google hindi|neural|natural/.test(hay)) s += 2;
    if (/google/.test(hay)) s += 1;
    return s;
  };
  return voices.slice().sort((a, b) => score(b) - score(a))[0] || null;
}

function speak(text) {
  if (!settings.voiceReply || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const clean = text.replace(/[*#`>|_]/g, "");
  const u = new SpeechSynthesisUtterance(clean);
  const lang = detectSpeechLang(text);
  u.lang = lang;
  const v = pickWarmVoice(lang);
  if (v) u.voice = v;
  u.pitch = 1.15;
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
}

micBtn.onclick = () => {
  if (!SpeechRecognition) { showToast(t("micUnsupported")); return; }
  if (isListening) { recognition.stop(); return; }
  recognition = new SpeechRecognition();
  recognition.lang = settings.lang === "en" ? "en-US" : "hi-IN";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onstart = () => {
    isListening = true;
    micBtn.classList.add("recording");
    orb.classList.add("listening");
    showToast(t("listening"));
  };
  recognition.onend = () => {
    isListening = false;
    micBtn.classList.remove("recording");
    orb.classList.remove("listening");
  };
  recognition.onerror = () => {
    isListening = false;
    micBtn.classList.remove("recording");
    orb.classList.remove("listening");
    showToast(t("micUnsupported"));
  };
  recognition.onresult = (e) => {
    const said = e.results[0][0].transcript;
    inputEl.value = said;
    sendMessage();
  };
  recognition.start();
};

/* ---------- Copy, regenerate, PDF notes ---------- */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(t("copied"));
  } catch (e) {
    showToast(t("copied"));
  }
}

function lastUserText() {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "user") return history[i].text;
  }
  return "";
}

function downloadNotesPDF(text) {
  const topic = lastUserText().slice(0, 60) || settings.assistantName + " Notes";
  const area = $("printArea");
  area.innerHTML = "";
  const h = document.createElement("h1");
  h.textContent = topic;
  const meta = document.createElement("p");
  meta.className = "print-meta";
  meta.textContent = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) +
    "  •  " + settings.assistantName + " AI Assistant  •  " + mode().label;
  const pre = document.createElement("pre");
  pre.textContent = text;
  area.append(h, meta, pre);
  showToast(t("pdfReady"));
  setTimeout(() => window.print(), 400);
}

async function regenerateLast() {
  if (busy) return;
  const userText = lastUserText();
  if (!userText) return;
  // Aakhri AI jawab hatao (history + screen)
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "model") { history.splice(i, 1); break; }
  }
  saveHistory();
  const aiMsgs = chatEl.querySelectorAll(".msg.ai:not(.typing):not(.system)");
  if (aiMsgs.length) aiMsgs[aiMsgs.length - 1].remove();
  await askAndRender(userText);
}

/* ---------- Gemini API ---------- */
function systemPrompt() {
  return mode().system.replaceAll("{name}", settings.assistantName);
}

function demoReply(text) {
  return t("needKey") + "\n\nAapne poochha: \"" + text + "\"";
}

async function askGemini(userText) {
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(settings.model) + ":generateContent?key=" + encodeURIComponent(settings.apiKey);

  const contents = history
    .filter((h) => h.role === "user" || h.role === "model")
    .map((h) => ({ role: h.role, parts: [{ text: h.text }] }));
  contents.push({ role: "user", parts: [{ text: userText }] });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt() }] },
      contents,
      generationConfig: { temperature: 0.8, maxOutputTokens: 1500 },
    }),
  });

  if (!res.ok) {
    if (res.status === 400 || res.status === 403) throw new Error("key");
    if (res.status === 429) throw new Error("quota");
    throw new Error("net");
  }
  const data = await res.json();
  const reply = data && data.candidates && data.candidates[0] &&
    data.candidates[0].content && data.candidates[0].content.parts &&
    data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
  if (!reply) throw new Error("generic");
  return reply.trim();
}

/* ---------- Send flow ---------- */
let busy = false;

/* Pehle server proxy (/api/chat) try karo — shared key se chalta hai.
   Agar server par key set nahi hai (501) ya proxy fail ho, to apni
   Settings wali key se seedha Gemini ko call karo; woh bhi na ho to demo. */
async function askViaProxy(userText) {
  const messages = history
    .filter((h) => h.role === "user" || h.role === "model")
    .map((h) => ({ role: h.role, text: h.text }));
  messages.push({ role: "user", text: userText });

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: settings.mode, messages }),
  });
  if (res.status === 501) throw new Error("no_proxy_key");
  if (!res.ok) throw new Error("proxy_fail");
  const data = await res.json();
  if (!data.reply) throw new Error("proxy_fail");
  return data.reply;
}

async function askAndRender(userText) {
  busy = true;
  sendBtn.disabled = true;
  const typing = addMsg(t("thinking"), "ai typing", { save: false });
  try {
    let reply;
    try {
      reply = await askViaProxy(userText);
    } catch (proxyErr) {
      if (settings.apiKey) {
        reply = await askGemini(userText);
      } else if (proxyErr.message === "no_proxy_key") {
        await new Promise((r) => setTimeout(r, 600));
        reply = demoReply(userText);
      } else {
        throw proxyErr;
      }
    }
    typing.remove();
    addMsg(reply, "ai", { actions: true });
    speak(reply);
  } catch (err) {
    typing.remove();
    const map = { key: "errorKey", quota: "errorQuota", net: "errorNet", proxy_fail: "errorProxy" };
    addMsg(t(map[err.message] || "errorGeneric"), "ai system", { save: false });
  }
  busy = false;
  sendBtn.disabled = false;
  inputEl.focus();
}

async function sendMessage() {
  const text = inputEl.value.trim();
  if (!text || busy) return;
  inputEl.value = "";
  addMsg(text, "user");
  await askAndRender(text);
}

sendBtn.onclick = sendMessage;
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});

/* ---------- Top actions ---------- */
$("newChatBtn").onclick = () => {
  history = [];
  saveHistory();
  chatEl.innerHTML = "";
  addMsg(mode().welcome.replace("{name}", settings.assistantName), "ai", { save: false });
  showToast(t("cleared"));
};

$("shareBtn").onclick = async () => {
  const url = location.href;
  if (navigator.share) {
    try {
      await navigator.share({ title: settings.assistantName + " AI", text: "Mera AI assistant try karo:", url });
      showToast(t("shared"));
      return;
    } catch (e) { /* user cancelled share — fall through to copy */ }
  }
  try {
    await navigator.clipboard.writeText(url);
    showToast(t("copied"));
  } catch (e) {
    inputEl.value = url;
    inputEl.select();
    showToast(t("copied"));
  }
};

/* ---------- PWA install ---------- */
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  $("installBtn").classList.remove("hidden");
});
$("installBtn").onclick = async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  if (choice.outcome === "accepted") showToast(t("installed"));
  deferredPrompt = null;
  $("installBtn").classList.add("hidden");
};
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => { /* offline cache optional */ });
  });
}

/* ---------- Settings modal ---------- */
const modal = $("settingsModal");
function openSettings() {
  $("modelInput").value = settings.model;
  $("assistantNameInput").value = settings.assistantName;
  $("langSelect").value = settings.lang;
  $("voiceToggle").checked = settings.voiceReply;
  modal.classList.remove("hidden");
}
function closeSettings() { modal.classList.add("hidden"); }
$("settingsBtn").onclick = openSettings;
$("closeSettingsBtn").onclick = closeSettings;
modal.addEventListener("click", (e) => { if (e.target === modal) closeSettings(); });
$("saveSettingsBtn").onclick = () => {
  settings.model = $("modelInput").value.trim() || defaults.model;
  settings.assistantName = $("assistantNameInput").value.trim() || defaults.assistantName;
  settings.lang = $("langSelect").value;
  settings.voiceReply = $("voiceToggle").checked;
  saveSettings();
  inputEl.placeholder = mode().placeholder;
  renderChips();
  closeSettings();
  showToast("Settings save ho gayi.");
};

/* ---------- Init ---------- */
saveSettings();
setMode(settings.mode, false);
if (history.length > 0) {
  history.forEach((h) => addMsg(h.text, h.role === "user" ? "user" : "ai", { save: false, actions: h.role === "model" }));
} else {
  addMsg(mode().welcome.replace("{name}", settings.assistantName), "ai", { save: false });
}
