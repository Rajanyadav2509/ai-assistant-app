// Riya AI Assistant — Vercel Serverless Function (Gemini proxy).
// API key code me NAHI hoti. Woh Vercel ke Environment Variables me
// GEMINI_API_KEY ke naam se save hoti hai (Vercel dashboard → Settings →
// Environment Variables). Key sirf Vercel ke server par rehti hai —
// browser, GitHub ya kisi user ko kabhi nahi dikhti.
// Isliye shared app bina key maange sabke liye chalta hai.

const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

const SYSTEM_PROMPTS = {
  chat: "You are Riya, a helpful, polite AI assistant. Reply in the same language the user writes in: if the user writes in Hindi (or Hinglish), reply in Hindi; if in English, reply in English. Keep answers clear, short and useful. Use simple formatting, no long lectures.",
  exam: "You are Riya, an exam preparation coach for a B.Tech Electronics and Communication student (GTU). Give exam-focused, point-wise, easy-to-remember notes. Use clear headings, short bullet points, simple definitions, formulas where needed, and real examples. End every notes answer with 3 to 5 important questions (with very short answers) that could come in the exam. When the user asks for a quiz, ask questions one by one and check each answer before moving on. Reply in the same language the user writes in (Hindi, Hinglish or English). Keep the structure clean so the notes can be saved as a PDF.",
  dost: "You are Riya, the user's close friend — warm, supportive, fun and honest. Talk like a real friend in Hinglish/Hindi. Motivate, listen, joke lightly, and help with studies without sounding like a textbook. If the user is stressed or low, be kind first, then give one small practical step. Reply in the same language the user writes in.",
};

module.exports = async (req, res) => {
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

  try {
    const r = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" +
        encodeURIComponent(MODEL) +
        ":generateContent?key=" +
        encodeURIComponent(apiKey),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPTS[mode] }] },
          contents,
          generationConfig: { temperature: 0.8, maxOutputTokens: 1500 },
        }),
      }
    );

    if (!r.ok) {
      let upstream = "";
      try {
        const errText = await r.text();
        upstream = errText.slice(0, 200);
      } catch (e) { /* ignore */ }
      const status = r.status === 400 || r.status === 403 ? "key" : r.status === 429 ? "quota" : "net";
      res.status(502).json({ error: status, upstream: r.status, detail: upstream });
      return;
    }

    const data = await r.json();
    const reply =
      data &&
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text;

    if (!reply) {
      res.status(502).json({ error: "generic" });
      return;
    }
    res.status(200).json({ reply: reply.trim() });
  } catch (e) {
    res.status(502).json({ error: "net", detail: String((e && e.message) || e).slice(0, 200) });
  }
};
