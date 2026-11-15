// Riya AI Assistant — Vercel Serverless Function (Gemini proxy).
// API key code me NAHI hoti. Woh Vercel ke Environment Variables me
// GEMINI_API_KEY ke naam se save hoti hai (Vercel dashboard → Settings →
// Environment Variables). Key sirf Vercel ke server par rehti hai —
// browser, GitHub ya kisi user ko kabhi nahi dikhti.
// Isliye shared app bina key maange sabke liye chalta hai.

const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
// Pehla model busy ho to dusre try karo — jawab rukna nahi chahiye.
// Lite model ki capacity aksar alag hoti hai, isliye woh bhi list me hai.
const FALLBACK_MODELS = ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.0-flash"];

// Jawab chhote rakho taaki tez aaye — lambi generation hi sabse bada
// slowdown tha. Exam notes ko thoda zyada jagah, baaki ko kam.
const MAX_TOKENS = { chat: 600, exam: 1200, dost: 600 };

// Har ek upstream call ka hard time limit — Google atak jaye to request
// latki nahi rahegi, agla option try hoga. Poora budget ~25 second.
const ATTEMPT_TIMEOUT_MS = 7000;
const TOTAL_BUDGET_MS = 25000;

const SYSTEM_PROMPTS = {
  chat: "You are Riya, a helpful, polite AI assistant. Reply in the same language the user writes in: if the user writes in Hindi (or Hinglish), reply in Hindi; if in English, reply in English. Keep answers clear, short and useful. Use simple formatting, no long lectures.",
  exam: "You are Riya, an exam preparation coach for a B.Tech Electronics and Communication student (GTU). Give exam-focused, point-wise, easy-to-remember notes. Use clear headings, short bullet points, simple definitions, formulas where needed, and real examples. End every notes answer with 3 to 5 important questions (with very short answers) that could come in the exam. When the user asks for a quiz, ask questions one by one and check each answer before moving on. Reply in the same language the user writes in (Hindi, Hinglish or English). Keep the structure clean so the notes can be saved as a PDF.",
  dost: "You are Riya, the user's close friend — warm, supportive, fun and honest. Talk like a real friend in Hinglish/Hindi. Motivate, listen, joke lightly, and help with studies without sounding like a textbook. If the user is stressed or low, be kind first, then give one small practical step. Reply in the same language the user writes in.",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Timeout wala fetch — ms me koi jawab na aaye to call ko kaat do.
function fetchTimeout(url, opts, ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return fetch(url, { ...opts, signal: c.signal }).finally(() => clearTimeout(t));
}

module.exports = async (req, res) => {
  // Warm-up ping — app khulte hi server ko jaga deta hai, taaki pehla
  // asli message cold start ki wajah se slow na ho. Koi Gemini call nahi.
  if (req.method === "GET") {
    res.status(200).json({ ok: true });
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "method" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // Server par key set nahi hai — app apni fallback (apni key / demo) use karega.
    res.status(501).json({ error: "no_key" });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  if (!body || typeof body !== "object") body = {};

  const mode = SYSTEM_PROMPTS[body.mode] ? body.mode : "chat";
  const messages = Array.isArray(body.messages) ? body.messages.slice(-20) : [];
  const last = messages[messages.length - 1];
  if (!messages.length || !last || last.role !== "user" || !String(last.text || "").trim()) {
    res.status(400).json({ error: "bad_request" });
    return;
  }

  const contents = messages.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: String(m.text || "").slice(0, 4000) }],
  }));

  const payload = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPTS[mode] }] },
    contents,
    generationConfig: { temperature: 0.8, maxOutputTokens: MAX_TOKENS[mode] || 600 },
  };
  const streamUrl = (model) =>
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(model) +
    ":streamGenerateContent?alt=sse&key=" +
    encodeURIComponent(apiKey);
  const plainUrl = (model) =>
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(model) +
    ":generateContent?key=" +
    encodeURIComponent(apiKey);

  const started = Date.now();
  const elapsed = () => Date.now() - started;
  let lastStatus = 0;
  let lastText = "";

  // Ek streaming attempt — timeout ya network error par null.
  async function tryStream(model) {
    try {
      const r = await fetchTimeout(streamUrl(model), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }, ATTEMPT_TIMEOUT_MS);
      if (r.ok) return r;
      lastStatus = r.status;
      try { lastText = (await r.text()).slice(0, 200); } catch (e) { lastText = ""; }
      return null;
    } catch (e) {
      lastStatus = 0;
      lastText = "timeout";
      return null;
    }
  }

  try {
    // 1) Streaming: main model, phir fallback models — jo pehle chal jaye
    //    wahi use karo. Har attempt max 7s, taaki 3 model bhi budget me aaye.
    let r = null;
    const models = [MODEL, ...FALLBACK_MODELS].filter((m, i, a) => a.indexOf(m) === i);
    for (const m of models) {
      if (elapsed() > 18000) break;
      r = await tryStream(m);
      if (r) break;
    }

    // 2) Streaming dono model par fail ho to ek baar plain (non-streaming)
    //    call try karo — stream endpoint ki problem ho to bhi jawab mile.
    if (!r && elapsed() < TOTAL_BUDGET_MS - 8000) {
      try {
        const r2 = await fetchTimeout(plainUrl(MODEL), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }, ATTEMPT_TIMEOUT_MS);
        if (r2.ok) {
          const data = await r2.json();
          const reply =
            data && data.candidates && data.candidates[0] && data.candidates[0].content &&
            data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
            data.candidates[0].content.parts[0].text;
          if (reply) {
            res.writeHead(200, {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            });
            res.write("data: " + JSON.stringify({ t: reply.trim() }) + "\n\n");
            res.write("data: " + JSON.stringify({ done: true }) + "\n\n");
            res.end();
            return;
          }
        } else {
          lastStatus = r2.status;
          try { lastText = (await r2.text()).slice(0, 200); } catch (e) { /* ignore */ }
        }
      } catch (e) {
        lastStatus = 0;
        lastText = "timeout";
      }
    }

    // 3) Gemini ke saare models fail ho gaye aur OpenAI key set hai to
    //    ChatGPT (gpt-4o-mini) se jawab lo — ye tez aur reliable hai.
    //    Key set nahi hai to ye step chupchaap skip ho jata hai.
    if (!r && process.env.OPENAI_API_KEY && elapsed() < TOTAL_BUDGET_MS - 8000) {
      try {
        const openaiMessages = [
          { role: "system", content: SYSTEM_PROMPTS[mode] },
          ...messages.map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: String(m.text || "").slice(0, 4000) })),
        ];
        const r3 = await fetchTimeout("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + process.env.OPENAI_API_KEY,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: openaiMessages,
            temperature: 0.8,
            max_tokens: MAX_TOKENS[mode] || 600,
          }),
        }, ATTEMPT_TIMEOUT_MS);
        if (r3.ok) {
          const data3 = await r3.json();
          const reply3 = data3 && data3.choices && data3.choices[0] && data3.choices[0].message && data3.choices[0].message.content;
          if (reply3) {
            res.writeHead(200, {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            });
            res.write("data: " + JSON.stringify({ t: reply3.trim() }) + "\n\n");
            res.write("data: " + JSON.stringify({ done: true }) + "\n\n");
            res.end();
            return;
          }
        } else {
          lastStatus = r3.status;
          try { lastText = (await r3.text()).slice(0, 200); } catch (e) { /* ignore */ }
        }
      } catch (e) {
        lastStatus = 0;
        lastText = "timeout";
      }
    }

    if (!r) {
      // 503 ya timeout matlab Google ka model busy hai — user ke internet
      // ki problem nahi hai, isliye alag "busy" error bhejo taaki app sahi
      // message dikhaye ("internet issue" nahi).
      const status = lastStatus === 400 || lastStatus === 401 || lastStatus === 403 ? "key" : lastStatus === 429 ? "quota" : (lastStatus === 503 || lastText === "timeout") ? "busy" : "net";
      res.status(502).json({ error: status, upstream: lastStatus, detail: lastText });
      return;
    }

    // Stream: Gemini ke tukde aate hi client ko bhej do — user ko pehle
    // shabd turant dikhne lagenge, poora jawab aane ka intezaar nahi.
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    const send = (obj) => { res.write("data: " + JSON.stringify(obj) + "\n\n"); };
    let sent = 0;
    try {
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const line = chunk.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const payloadLine = line.slice(5).trim();
          if (!payloadLine || payloadLine === "[DONE]") continue;
          let obj;
          try { obj = JSON.parse(payloadLine); } catch (e) { continue; }
          const t =
            obj && obj.candidates && obj.candidates[0] && obj.candidates[0].content &&
            obj.candidates[0].content.parts && obj.candidates[0].content.parts[0] &&
            obj.candidates[0].content.parts[0].text;
          if (t) { sent += t.length; send({ t }); }
        }
      }
    } catch (e) { /* stream toot gaya — jo mila wahi bhej diya */ }
    if (!sent) send({ error: "generic" });
    else send({ done: true });
    res.end();
  } catch (e) {
    if (!res.headersSent) {
      res.status(502).json({ error: "net", detail: String((e && e.message) || e).slice(0, 200) });
    } else {
      try { res.end(); } catch (e2) { /* ignore */ }
    }
  }
};
