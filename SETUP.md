# Knowledgemaster — Self-hosted Setup Guide

এই guide টা step-by-step বলবে কীভাবে নিজের **Supabase project** + **Google Gemini API key** দিয়ে Knowledgemaster চালু করবেন। কোনো Lovable বা ৩য় পক্ষের platform এর দরকার নেই।

> পুরো setup এ সময় লাগবে **১০–১৫ মিনিট**।

---

## যা যা লাগবে

| # | জিনিস | কোথা থেকে | খরচ |
|---|---|---|---|
| 1 | Supabase account + project | https://supabase.com | Free |
| 2 | Google AI Studio API key | https://aistudio.google.com/apikey | Free |
| 3 | Node.js 20+ আর Bun | https://bun.sh | Free |
| 4 | (Optional) Telegram bot token | @BotFather on Telegram | Free |
| 5 | (Optional) Cloudflare tunnel / ngrok | যেকোনো একটা — Telegram webhook এর জন্য | Free |

---

## ধাপ ১ — Supabase project বানানো

1. https://supabase.com এ যান → **Sign in with GitHub** (বা Google)
2. উপরে **New project** click করুন
3. একটা **Name** দিন (যেমন `knowledgemaster`)
4. একটা **Database password** দিন — কোথাও safe জায়গায় note রাখুন
5. **Region**: আপনার যেটা সবচেয়ে কাছে (Singapore / Mumbai দ্রুত হয় বাংলাদেশ থেকে)
6. **Create new project** চাপুন → ২–৩ মিনিট wait

Project তৈরী হলে — **Settings → API** এ যান। ৩টা value note করুন:

| ফিল্ড | কী রাখবেন |
|---|---|
| **Project URL** | `VITE_SUPABASE_URL` আর `SUPABASE_URL` এ বসবে |
| **Project API keys → anon public** | `VITE_SUPABASE_PUBLISHABLE_KEY` আর `SUPABASE_PUBLISHABLE_KEY` এ বসবে |
| **Project API keys → service_role** (Reveal করুন) | `SUPABASE_SERVICE_ROLE_KEY` এ বসবে — কখনও browser এ expose করবেন না |
| **Project ID** (URL এর `xxxx.supabase.co` এর `xxxx` অংশ) | `VITE_SUPABASE_PROJECT_ID` এ বসবে |

---

## ধাপ ২ — Database schema (table গুলো) তৈরী করা

`supabase/migrations/` folder এর সব `.sql` file — এগুলো-ই আপনার schema (profiles, links, collections, telegram_bots, api_tokens ইত্যাদি)। চালু করার দুটো উপায়:

### সহজ পদ্ধতি (Dashboard দিয়ে)

1. Supabase Dashboard এ যান → **SQL Editor** (বাঁ পাশের menu)
2. **New query** চাপুন
3. `supabase/migrations/` folder এর **প্রথম file** খুলুন (timestamp অনুযায়ী sort করা — পুরোনোটা আগে)
4. পুরো content copy করে SQL Editor এ paste করুন
5. **Run** চাপুন
6. বাকি migration file গুলোর জন্য একই কাজ করুন — **পুরোনো থেকে নতুন order এ**

> ⚠ Order ঠিক রাখুন — file নাম এর timestamp prefix অনুযায়ী।

### Advanced পদ্ধতি (Supabase CLI দিয়ে)

```bash
# Supabase CLI install (একবার-ই)
brew install supabase/tap/supabase   # বা npm i -g supabase

# নিজের project এর সাথে link করুন
supabase login
supabase link --project-ref YOUR-PROJECT-REF

# সব migration push করুন
supabase db push
```

---

## ধাপ ৩ — Google Gemini API key

1. https://aistudio.google.com/apikey এ যান (Google account দিয়ে login)
2. **Create API key** চাপুন
3. কোন project এ add করবেন বললে — **Create API key in new project** বেছে নিন
4. Generated key copy করে রাখুন — এটা `GOOGLE_AI_API_KEY` এ বসবে

> Free tier এ Gemini 2.5 Flash দিয়ে প্রতিদিন কয়েক হাজার call করা যায় — personal use এর জন্য যথেষ্ট।

---

## ধাপ ৪ — Project clone + dependencies install

```bash
git clone https://github.com/emni786/knowledgeMaster1.1.git
cd knowledgeMaster1.1
bun install
```

> Bun না থাকলে: `curl -fsSL https://bun.sh/install | bash`

---

## ধাপ ৫ — `.env` file বানানো

```bash
cp .env.example .env
```

এবার `.env` খুলে value গুলো বসান:

```env
# Supabase (ধাপ ১ এ পাওয়া)
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOi...
VITE_SUPABASE_PROJECT_ID=xxxx
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_PUBLISHABLE_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi... (service_role key)

# Admin user — যে email দিয়ে signup করলে admin মানা হবে
# (যেমন আপনার email; friends/family এ লিখবেন না)
ADMIN_EMAIL=you@example.com

# Google Gemini (ধাপ ৩ এ পাওয়া) — fallback হিসেবে কাজ করবে
# admin UI থেকেও পরে save করতে পারবেন
GOOGLE_AI_API_KEY=AIzaSy...

# Telegram বা production এ deploy করতে চাইলে — পরে set করবেন
PUBLIC_APP_URL=
```

---

## ধাপ ৫.৫ — Admin vs Public tier কীভাবে কাজ করে

এই app **2-tier** mode এ চলে:

### Admin (আপনি — `ADMIN_EMAIL` এ যে email বসিয়েছেন)
- যে email বসিয়েছেন সেটা দিয়ে signup/login করলে app আপনাকে auto-admin বানাবে
- Settings page এ একটা **"Admin settings"** section দেখবেন (orange border, "Admin only" badge)
- সেখান থেকে UI দিয়ে edit করতে পারবেন:
  - Google AI API key
  - AI model / base URL
  - Public app URL (Telegram webhook এর জন্য)
- DB তে save হলে — এর পর থেকে DB এর value কে priority দেয়া হবে (env value ignore হবে)

### Public (বন্ধু/family — যে যে email use করবে)
- Normal signup → কোনো admin UI দেখবে না
- Behind the scenes আপনার set করা AI key + URL ব্যবহার করবে
- প্রত্যেকের link/collection/Telegram bot RLS দিয়ে isolated থাকবে — তারা শুধু নিজের data দেখবে

### ADMIN_EMAIL change করতে চাইলে
Cloudflare/Vercel dashboard এ env var change করে redeploy করুন। ৫ মিনিটের মধ্যে নতুন email admin হয়ে যাবে, পুরোনোটার admin status auto-remove হবে।

---

## ধাপ ৬ — Dev server চালু

```bash
bun run dev
```

http://localhost:8080 এ গিয়ে দেখুন। **Sign up** করে account বানান → **Library** page এ আসবেন → একটা URL paste করে test করুন।

✅ AI যদি title/summary/tag বসিয়ে দেয় — সব কিছু কাজ করছে।

---

## (Optional) ধাপ ৭ — Google Sign-In enable করা

`Continue with Google` button কাজ করানোর জন্য:

1. Supabase Dashboard → **Authentication → Providers → Google**
2. **Enable** করুন
3. Google Cloud Console এ একটা OAuth client বানিয়ে Client ID + Secret paste করুন। বিস্তারিত: https://supabase.com/docs/guides/auth/social-login/auth-google

---

## (Optional) ধাপ ৮ — Browser extension setup

1. Chrome এ যান → `chrome://extensions`
2. উপরে ডানে **Developer mode** on করুন
3. **Load unpacked** → repo এর `extension/` folder select করুন
4. Extension icon এ click → **App URL** এ আপনার app এর URL বসান (যেমন `http://localhost:8080` বা production URL)
5. App এর **Settings page** এ গিয়ে নতুন **API token** issue করুন → extension এ paste করুন
6. ব্যাস — যেকোনো page এ extension icon চাপলে save হয়ে যাবে

---

## (Optional) ধাপ ৯ — Telegram bot setup

1. Telegram এ **@BotFather** কে message করুন → `/newbot` → bot এর নাম দিন → **token** পাবেন
2. App এর **Settings → Telegram bot** এ token paste করুন
3. Local dev এ test করতে চাইলে — একটা public HTTPS tunnel লাগবে:
   ```bash
   # Cloudflare tunnel (recommended, free)
   cloudflared tunnel --url http://localhost:8080

   # বা ngrok
   ngrok http 8080
   ```
4. পাওয়া URL টা `.env` এ `PUBLIC_APP_URL` হিসেবে বসান, server restart করুন
5. বট কে Telegram এ link পাঠান — auto-save হবে

> Production এ deploy করলে `PUBLIC_APP_URL` খালি রাখলেই হবে।

---

## (Optional) ধাপ ১০ — Production এ deploy

`wrangler.jsonc` দেয়া আছে — Cloudflare Workers এ deploy করা যায়:

```bash
bun run build
bunx wrangler deploy
```

Worker এর environment variables হিসেবে `.env` এর সব value Cloudflare dashboard এ যোগ করতে হবে (Settings → Variables and secrets)।

---

## Troubleshooting

| Error | কী করবেন |
|---|---|
| `Missing Supabase environment variable(s)` | `.env` ঠিক ভাবে বসেছে কিনা check করুন, server restart করুন |
| AI summary আসছে না | `GOOGLE_AI_API_KEY` ঠিক আছে কিনা, Google AI Studio এ quota আছে কিনা check করুন |
| `PUBLIC_APP_URL is not set` (Telegram) | Telegram public HTTPS URL লাগে — tunnel চালু করুন বা production এ deploy করে test করুন |
| Migration error: `relation already exists` | একই migration ২ বার চলেছে — skip করুন বা migration order check করুন |

---

## ভবিষ্যৎ plan

- **Phase 2 (পরে):** Google Drive OAuth login → file storage (screenshot, PDF backup)
- **Phase 3 (পরে):** Link এর সাথে user upload + Drive backup
