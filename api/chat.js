// Riya AI Assistant — Vercel Serverless Function (Gemini proxy).
// API key code me NAHI hoti. Woh Vercel ke Environment Variables me
// GEMINI_API_KEY ke naam se save hoti hai (Vercel dashboard → Settings →
// Environment Variables). Key sirf Vercel ke server par rehti hai —
// browser, GitHub ya kisi user ko kabhi nahi dikhti.
// Isliye shared app bina key maange sabke liye chalta hai.

const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
// Pehla model busy ho to dusra try karo — jawab rukna nahi chahiye.
const FALLBACK_MODEL = "gemini-2.5-flash";

// Jawab chhote rakho taaki tez aaye — lambi generation hi sabse bada
// slowdown tha. Exam notes ko thoda zyada jagah, baaki ko kam.
const MAX_TOKENS = { chat: 600, exam: 1200, dost: 600 };

const SYSTEM_PROMPTS = {
  chat: "You are Riya, a helpful, polite AI assistant. Reply in the same language the user writes in: if the user writes in Hindi (or Hinglish), reply in Hindi; if in English, reply in English. Keep answers clear, short and useful. Use simple formatting, no long lectures.",
  exam: "You are Riya, an exam preparation coach for a B.Tech Electronics and Communication student (GTU). Give exam-focused, point-wise, easy-to-remember notes. Use clear headings, short bullet points, simple definitions, formulas where needed, and real examples. End every notes answer with 3 to 5 important questions (with very short answers) that could come in the exam. When the user asks for a quiz, ask questions one by one and check each answer before moving on. Reply in the same language the user writes in (Hindi, Hinglish or English). Keep the structure clean so the notes can be saved as a PDF.",
  dost: "You are Riya, the user's close friend — warm, supportive, fun and honest. Talk like a real friend in Hinglish/Hindi. Motivate, listen, joke lightly, and help with studies without sounding like a textbook. If the user is stressed or low, be kind first, then give one small practical step. Reply in the same language the user writes in.",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

  try {
    // 1) Streaming try karo: pehle main model (2 baar, 503/429 par 2s ruk kar),
    //    phir fallback model (1 baar). Jo pehle chal jaye wahi use karo.
    let r = null;
    let lastStatus = 0;
    let lastText = "";
    const models = MODEL === FALLBACK_MODEL ? [MODEL] : [MODEL, FALLBACK_MODEL];
    for (const m of models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        r = await fetch(streamUrl(m), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (r.ok) break;
        lastStatus = r.status;
        try { lastText = (await r.text()).slice(0, 200); } catch (e) { lastText = ""; }
        if ((r.status === 503 || r.status === 429) && attempt === 0) {
          await sleep(2000);
          continue;
        }
        break;
      }
      if (r.ok) break;
    }

    // 2) Streaming dono model par fail ho to ek baar plain (non-streaming)
    //    call try karo — stream endpoint ki problem ho to bhi jawab mile.
    if (!r.ok) {
      try {
        const r2 = await fetch(plainUrl(MODEL), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
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
      } catch (e) { /* ignore — neeche error milega */ }
    }

    if (!r.ok) {
      const status = lastStatus === 400 || lastStatus === 403 ? "key" : lastStatus === 429 ? "quota" : "net";
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
