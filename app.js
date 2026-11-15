/* Riya AI Assistant — chat + voice + Gemini API + PWA
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
  model: "gemini-2.0-flash",
  assistantName: "Riya",
  lang: "auto",       // auto | hi | en
  voiceReply: true,
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

/* ---------- UI text (Hindi default, English when chosen) ---------- */
const STRINGS = {
  hi: {
    placeholder: "Kuch bhi poochho...",
    welcome: "Namaste! Main {name} hoon, aapki AI assistant. Aap mujhse kuch bhi poochh sakte ho — likh kar ya bol kar. Hindi ya English, jo aapko pasand ho.",
    needKey: "API key set nahi hai, isliye main demo mode me hoon. Asli jawab ke liye Settings me apni free Gemini API key dalo.",
    listening: "Sun rahi hoon... bolo",
    micUnsupported: "Is browser me mic support nahi hai. Chrome app me kholo.",
    thinking: "Soch rahi hoon",
    speak: "Sunao",
    errorKey: "API key galat lagti hai. Settings me key dobara check karo.",
    errorQuota: "Aaj ki free limit khatam ho gayi lagti hai. Thodi der baad try karo.",
    errorNet: "Internet se connect nahi ho pa raha. Connection check karo aur dobara try karo.",
    errorGeneric: "Kuch gadbad ho gayi. Dobara try karo.",
    cleared: "Chat saaf kar di.",
    copied: "Link copy ho gaya.",
    shared: "Share kar diya.",
    installed: "App install ho gayi.",
    chips: ["LinkedIn post idea do", "Caption likho", "Email draft likho", "Aasan bhasha me samjhao"],
  },
  en: {
    placeholder: "Ask anything...",
    welcome: "Hello! I am {name}, your AI assistant. Ask me anything — by typing or speaking. Hindi or English, whichever you like.",
    needKey: "No API key set, so I am running in demo mode. Add your free Gemini API key in Settings for real answers.",
    listening: "Listening... speak now",
    micUnsupported: "Mic is not supported in this browser. Open it in the Chrome app.",
    thinking: "Thinking",
    speak: "Listen",
    errorKey: "The API key looks wrong. Please check the key in Settings.",
    errorQuota: "The free limit for today seems over. Try again in a while.",
    errorNet: "Could not reach the internet. Check your connection and try again.",
    errorGeneric: "Something went wrong. Please try again.",
    cleared: "Chat cleared.",
    copied: "Link copied.",
    shared: "Shared.",
    installed: "App installed.",
    chips: ["Give a LinkedIn post idea", "Write a caption", "Draft an email", "Explain in simple words"],
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

function addMsg(text, who, { save = true, speakBtn = false } = {}) {
  const div = document.createElement("div");
  div.className = "msg " + who;
  div.textContent = text;
  if (speakBtn && who === "ai") {
    const btn = document.createElement("button");
    btn.className = "speak-btn";
    btn.type = "button";
    btn.textContent = t("speak");
    btn.onclick = () => speak(text);
    div.appendChild(document.createElement("br"));
    div.appendChild(btn);
  }
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
  t("chips").forEach((c) => {
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
  showToast._t = setTimeout(() => toastEl.classList.add("hidden"), 3000);
}

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

function speak(text) {
  if (!settings.voiceReply || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const clean = text.replace(/[*#`>|_]/g, "");
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = detectSpeechLang(text);
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

/* ---------- Gemini API ---------- */
function systemPrompt() {
  const name = settings.assistantName;
  return "You are " + name + ", a helpful, polite AI assistant. " +
    "Reply in the same language the user writes in: if the user writes in Hindi (or Hinglish), reply in Hindi; if in English, reply in English. " +
    "Keep answers clear, short and useful. Use simple formatting, no long lectures. " +
    "If asked who made you, say you are an AI assistant built for everyday help.";
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
      generationConfig: { temperature: 0.8, maxOutputTokens: 1200 },
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
async function sendMessage() {
  const text = inputEl.value.trim();
  if (!text || busy) return;
  inputEl.value = "";
  busy = true;
  sendBtn.disabled = true;

  addMsg(text, "user");
  const typing = addMsg(t("thinking"), "ai typing", { save: false });

  try {
    let reply;
    if (!settings.apiKey) {
      await new Promise((r) => setTimeout(r, 600));
      reply = demoReply(text);
    } else {
      reply = await askGemini(text);
    }
    typing.remove();
    addMsg(reply, "ai", { speakBtn: true });
    speak(reply);
  } catch (err) {
    typing.remove();
    const map = { key: "errorKey", quota: "errorQuota", net: "errorNet" };
    addMsg(t(map[err.message] || "errorGeneric"), "ai system", { save: false });
  }
  busy = false;
  sendBtn.disabled = false;
  inputEl.focus();
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
  addMsg(t("welcome").replace("{name}", settings.assistantName), "ai", { save: false });
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
  $("apiKeyInput").value = settings.apiKey;
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
  settings.apiKey = $("apiKeyInput").value.trim();
  settings.model = $("modelInput").value.trim() || defaults.model;
  settings.assistantName = $("assistantNameInput").value.trim() || defaults.assistantName;
  settings.lang = $("langSelect").value;
  settings.voiceReply = $("voiceToggle").checked;
  saveSettings();
  inputEl.placeholder = t("placeholder");
  renderChips();
  closeSettings();
  showToast(settings.apiKey ? "Settings save ho gayi." : t("needKey"));
};

/* ---------- Init ---------- */
saveSettings();
inputEl.placeholder = t("placeholder");
renderChips();
if (history.length > 0) {
  history.forEach((h) => addMsg(h.text, h.role === "user" ? "user" : "ai", { save: false, speakBtn: h.role === "model" }));
} else {
  addMsg(t("welcome").replace("{name}", settings.assistantName), "ai", { save: false });
}
