# Riya AI Assistant

Apna personal AI assistant — phone aur computer dono par chalta hai.
Chat karo, bol kar poochho, aur jawab suno. Hindi aur English dono me.

## Features

- **Chat with AI** — Google Gemini API se asli jawab (free key se)
- **Voice input** — mic button se bol kar poochho (Chrome me)
- **Voice reply** — jawab bol kar sunaya bhi ja sakta hai
- **Hindi + English** — jis bhasha me likho, usi me jawab
- **Chat history** — purani chat aapke device me save rehti hai
- **PWA — phone me install** — link kholo, "Install App" dabao, aur ye phone me ek app ki tarah install ho jayega
- **Share** — link kisi ko bhi bhejo, woh apne phone me use kar sakta hai
- **Private by design** — API key sirf aapke device (localStorage) me save hoti hai, kisi server par nahi jaati

## Files

```
ai-assistant-app/
  index.html      App ka main page (UI)
  styles.css      Design — deep navy + green theme
  app.js          Chat, voice, Gemini API, PWA install — poora logic
  manifest.json   Phone me install hone ke liye (PWA)
  sw.js           Service worker — app ko fast aur offline-ready banata hai
  icons/          App icons (192px, 512px)
  vercel.json     Vercel deploy settings
  README.md       Ye file
```

Koi build step nahi hai, koi server code nahi hai. Sirf static files hain —
kahin bhi host kar sakte ho.

## Step 1 — Free Gemini API key lo (2 minute)

1. https://aistudio.google.com/apikey kholo aur Google account se sign in karo.
2. **Create API key** par click karo.
3. Key copy karo (ye `AIza...` se shuru hoti hai).
4. App kholo, **Settings** me key paste karo, **Save** dabao.

Key ke bina bhi app khulega, lekin sirf demo mode me chalega.

Har user apni key khud dalta hai — isliye app ka link kisi ko bhi share kar sakte ho,
aur har vyakti apni free key se use karega. Aapki key kabhi share nahi hoti.

## Step 2 — Deploy karo (koi ek tareeka chun lo)

### Vercel (recommended)

1. Is folder ko GitHub repo me push karo.
2. https://vercel.com par jao, **Add New → Project**, GitHub repo select karo.
3. Framework: **Other**. Build command: kuch nahi. Output directory: `.` (root).
4. **Deploy** dabao. 1 minute me live link mil jayega, jaise
   `https://ai-assistant-app.vercel.app`.

### Render (static site)

1. https://dashboard.render.com par **New → Static Site** banao.
2. GitHub repo connect karo. Build command: kuch nahi. Publish directory: `.`
3. Deploy dabao — free link mil jayega.

### Netlify Drop (sabse aasan, bina GitHub)

1. https://app.netlify.com/drop kholo.
2. Is poore folder ko drag karke drop karo.
3. Live link turant mil jayega.

### GitHub Pages

1. Repo ke **Settings → Pages** me jao.
2. Source: **Deploy from a branch**, branch: `main`, folder: `/ (root)`.
3. Save karo — link `https://<username>.github.io/ai-assistant-app/` ban jayega.

## Step 3 — Phone me install karo

**Android (Chrome):**
1. Live link Chrome me kholo.
2. Upar **Install App** button dabao, ya menu (3 dots) → **Install app**.
3. App home screen par aa jayega, bilkul ek normal app ki tarah.

**iPhone (Safari):**
1. Live link Safari me kholo.
2. **Share** button → **Add to Home Screen**.
3. Home screen par icon aa jayega.

Note: mic (voice input) Chrome app me best chalta hai. Agar kisi aur browser
me mic na chale, to Chrome me kholo.

## Step 4 — Kisi ko bhi share karo

Bas live link bhej do — WhatsApp, Instagram, kisi ko bhi.
Jo bhi link kholega, woh app use kar sakta hai, apne phone me install kar
sakta hai, aur apni free Gemini key dal kar chat kar sakta hai.

## Apne hisaab se badlo

- **Assistant ka naam** — Settings me badlo, ya `app.js` me `defaults.assistantName`.
- **Model** — Settings me model naam badlo (jaise `gemini-2.0-flash`).
- **Rang / design** — `styles.css` me `:root` wale colors badlo.
- **Welcome message aur suggestion chips** — `app.js` me `STRINGS` section me hain.

## Local test

```bash
cd ai-assistant-app
python3 -m http.server 8080
```

Phir browser me `http://localhost:8080` kholo.
(Note: mic aur install sirf `https` ya `localhost` par kaam karte hain.)

## Privacy

- Aapki chat history aur API key sirf aapke browser ke localStorage me rehti hai.
- Chat ke message seedha Google Gemini API ko jaate hain, aur kahin nahi.
- Is app ka koi apna server ya database nahi hai.
