# Vercel এ ডিপ্লয় গাইড (বাংলা)

এই ডকুমেন্টে ধাপে-ধাপে দেখানো হয়েছে কীভাবে Knowledgemaster এর এই **একটিই** কোডবেস Vercel এ ডিপ্লয় করবেন এবং Dual‑DB রাউটিং (Admin → PERSONAL Supabase, বাকি সবাই → PUBLIC Supabase) চালু করবেন।

---

## ১. শুরুর আগে যা যা লাগবে

1. **একটি GitHub অ্যাকাউন্ট** যেখানে `emni786/knowledgeMaster1.1` রিপো push করা আছে।
2. **একটি Vercel অ্যাকাউন্ট** ([https://vercel.com/signup](https://vercel.com/signup)) — GitHub দিয়ে সাইন‑আপ করলে সবচেয়ে সহজ।
3. **দুটি Supabase প্রজেক্ট**:
   - **PUBLIC Supabase** — সব ইউজারের auth (signup / signin) এবং সাধারণ ইউজারদের data রাখবে।
   - **PERSONAL Supabase** — শুধুমাত্র আপনার (ADMIN_EMAIL ইউজারের) link / collection ডেটা রাখবে।
4. **একটি Google AI Studio API Key** — [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey) থেকে ফ্রি‑তে নেওয়া যায়।
5. (ঐচ্ছিক) **Telegram bot token** — যদি Telegram bot ইন্টিগ্রেশন চালু করতে চান।

> **মনে রাখুন:** এটা একটি **Vite + TanStack Start** অ্যাপ। ডিপ্লয়ের জন্য Vercel কে **TanStack Start** preset টা auto‑detect করতে দিন — কোনো `vercel.json` যোগ করার দরকার নেই।

---

## ২. দুটি Supabase প্রজেক্ট সেটআপ করুন

### ২.১ PUBLIC প্রজেক্ট তৈরি

1. [https://supabase.com/dashboard](https://supabase.com/dashboard) এ গিয়ে **New project** ক্লিক করুন।
2. নাম দিন `knowledgemaster-public` (বা যা ইচ্ছা)।
3. একটি শক্তিশালী database password বেছে নিন এবং safe জায়গায় রাখুন।
4. প্রজেক্ট তৈরি হওয়ার পর **SQL Editor** এ যান।
5. `supabase/migrations/` ফোল্ডারের প্রতিটি `.sql` ফাইল **ক্রমানুসারে** copy‑paste করে run করুন (ফাইলের নামের শুরুতে timestamp আছে — সেই ক্রম অনুসরণ করুন):
   - `20260514184648_*.sql` (profiles, collections, links, etc.)
   - `20260514184711_*.sql`
   - `20260514190709_*.sql`
   - `20260515000833_*.sql`
   - `20260515000850_*.sql`
   - `20260515003249_*.sql`
   - `20260515055432_*.sql`
   - `20260515065050_*.sql`
   - `20260515100000_admin_settings.sql` (admin_settings, profiles.is_admin)
   - `20260517100000_user_management.sql` (get_all_users RPC)
6. **Project Settings → API** থেকে নিচের ৩টি value কপি করে রাখুন:
   - `Project URL` (e.g. `https://abcd.supabase.co`)
   - `anon public` key
   - `service_role` key (এটা ফ্রন্টএন্ডে কখনো ব্যবহার করবেন না)

### ২.২ PERSONAL প্রজেক্ট তৈরি

1. উপরের একই ধাপ ফলো করে আরেকটা প্রজেক্ট তৈরি করুন, নাম দিন `knowledgemaster-personal`।
2. **একই migration গুলো** এই প্রজেক্টেও চালান (PERSONAL প্রজেক্টে শুধু আপনার ডেটা থাকবে, কিন্তু schema একই)।
3. **Project Settings → API** থেকে কপি করে রাখুন:
   - `Project URL`
   - `service_role` key (PERSONAL এ auth হয় না, তাই শুধু service_role দরকার)

> **নোট:** PERSONAL প্রজেক্টে কোনো ইউজার signup করবে না — শুধু আপনার (ADMIN_EMAIL) data এখানে আসবে, service_role key দিয়ে server‑side রাইট হয়ে।

---

## ৩. Vercel এ ডিপ্লয় করুন

### ৩.১ প্রজেক্ট ইম্পোর্ট

1. [https://vercel.com/new](https://vercel.com/new) এ যান।
2. **Import Git Repository** সেকশন থেকে আপনার `knowledgeMaster1.1` রিপো খুঁজে নিন।
3. **Import** ক্লিক করুন।
4. Vercel **TanStack Start** framework টা স্বয়ংক্রিয়ভাবে detect করবে।
   - Build Command: `bun run build` (অথবা যা auto‑detect হয়)
   - Output Directory: `.vercel/output` (default রাখুন)
   - Install Command: `bun install`

### ৩.২ Environment Variables যোগ করুন

**Environment Variables** সেকশনে নিচের সব কয়টা variable একে একে যোগ করুন (`Production`, `Preview`, `Development` — তিনটিতেই enable রাখুন):

| Variable Name                        | কী দিতে হবে                           | কোথা থেকে নেবেন                                                  |
| ------------------------------------ | ------------------------------------- | ---------------------------------------------------------------- |
| `VITE_SUPABASE_URL`                  | PUBLIC প্রজেক্টের URL                 | PUBLIC Supabase → Settings → API → Project URL                   |
| `VITE_SUPABASE_PUBLISHABLE_KEY`      | PUBLIC প্রজেক্টের anon key            | PUBLIC Supabase → Settings → API → `anon public`                 |
| `VITE_SUPABASE_PROJECT_ID`           | PUBLIC project ref (URL এর subdomain) | URL এর `abcd.supabase.co` থেকে `abcd`                            |
| `SUPABASE_URL`                       | PUBLIC প্রজেক্টের URL (একই)           | উপরেরটার মতই                                                     |
| `SUPABASE_PUBLISHABLE_KEY`           | PUBLIC anon key (একই)                 | উপরেরটার মতই                                                     |
| `SUPABASE_SERVICE_ROLE_KEY`          | PUBLIC service_role key               | PUBLIC Supabase → Settings → API → `service_role`                |
| `PERSONAL_SUPABASE_URL`              | PERSONAL প্রজেক্টের URL               | PERSONAL Supabase → Settings → API → Project URL                 |
| `PERSONAL_SUPABASE_SERVICE_ROLE_KEY` | PERSONAL service_role key             | PERSONAL Supabase → Settings → API → `service_role`              |
| `ADMIN_EMAIL`                        | `me.redwanhossen@gmail.com`           | আপনার email (deployment owner)                                   |
| `GOOGLE_AI_API_KEY`                  | Google AI Studio key (fallback)       | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |

> **PUBLIC_APP_URL** এখন **খালি রাখুন** — Vercel ডিপ্লয়ের পরে যে public URL পাবেন, সেটা পরের ধাপে Admin Settings UI থেকে সেট করবেন।

### ৩.৩ Deploy বাটনে ক্লিক

**Deploy** ক্লিক করুন। ৩‑৫ মিনিটে build শেষ হবে।

Deploy সফল হলে Vercel আপনাকে একটা public URL দেবে, যেমন:

```
https://knowledgemaster-1-1.vercel.app
```

এই URL টা ক্লিপবোর্ডে কপি করে রাখুন।

---

## ৪. প্রথমবার Admin হিসেবে সাইন‑আপ করুন

1. Vercel‑এর public URL টা ব্রাউজারে খুলুন।
2. **Sign up** এ যান, `me.redwanhossen@gmail.com` দিয়ে একটি account তৈরি করুন।
   - Supabase auth confirmation email পাঠাবে — link এ ক্লিক করে verify করুন।
3. লগইন করার পর **Settings** এ যান (sidebar / top‑right এ পাবেন)।
4. আপনি **deployment owner** হওয়ায় auto‑magic ভাবে আপনার profile এ `is_admin = true` সেট হয়ে যাবে এবং Settings page এ দুটো অরেঞ্জ‑বর্ডার সেকশন দেখতে পাবেন:
   - **Admin settings** (AI key, Model, Base URL, Public app URL)
   - **User management** (সব ইউজারের লিস্ট, total count, admin toggle)

---

## ৫. Admin Settings থেকে public URL এবং AI key বসান

Settings → **Admin settings** সেকশনে:

1. **Google AI API key** ফিল্ডে আপনার Google AI Studio key paste করুন।
2. **AI model** ফিল্ডে রাখুন `gemini-2.5-flash` (default — চাইলে পরিবর্তন করতে পারেন)।
3. **AI base URL** ঐচ্ছিক — `gemini` ই default, খালি রাখলেই হবে।
4. **Public app URL** ফিল্ডে আপনার Vercel URL টা বসান (যেমন `https://knowledgemaster-1-1.vercel.app`)।
5. **Save** ক্লিক করুন।

এর পর থেকে:

- যেকোনো ইউজারের link analysis এ এই AI key ব্যবহার হবে।
- Telegram bot webhook এই public URL এ register হবে।

---

## ৬. ডেটা আলাদা থাকছে কিনা যাচাই

1. লগইন থাকা অবস্থায় (আপনি = admin) **Library** এ গিয়ে একটা link save করুন।
2. PERSONAL Supabase dashboard এ গিয়ে **Table editor → links** খুলুন। নতুন row দেখা যাবে। ✓
3. PUBLIC Supabase এ একই table খুলুন — সেখানে নতুন row **থাকবে না**। ✓

এর পর অন্য একটা email দিয়ে signup করে (PUBLIC এ যাবে) — সেই ইউজার link save করলে PUBLIC এর `links` table এ row আসবে, PERSONAL এ আসবে না।

---

## ৭. অন্য ইউজারকে Admin বানানো

Settings → **User management** সেকশনে:

1. **Total users** কাউন্ট দেখাবে।
2. নিচে একটা table — সব ইউজারের `email`, `joined date`, এবং একটা admin toggle switch।
3. কোনো ইউজারের পাশের toggle টা চালু করলে সে এখন থেকে Admin Settings + User Management সেকশন দেখতে পাবে। তবে তার data **PUBLIC এই থাকবে** — শুধু আপনার (ADMIN_EMAIL) ডেটাই PERSONAL এ যায়।
4. Granted admin কে যেকোনো সময় toggle off করে revoke করতে পারবেন।
5. আপনার নিজের toggle disabled থাকবে — owner কখনো revoke করা যায় না।

---

## ৮. (ঐচ্ছিক) Telegram bot সেট করা

1. টেলিগ্রামে [@BotFather](https://t.me/BotFather) এর কাছ থেকে নতুন bot বানান, token কপি করুন।
2. Settings → **Telegram bot** সেকশনে token paste করে **Connect** ক্লিক করুন।
3. Bot এর সাথে চ্যাটে যেকোনো link পাঠালে সেটা auto‑magic ভাবে analyse হয়ে আপনার library তে save হবে।

---

## ৯. Browser extension যোগ করা (ঐচ্ছিক)

1. Settings → **Browser extension** সেকশনে **Download extension (.zip)** এ ক্লিক করুন।
2. **Generate API token** ক্লিক করে token টা কপি করুন (এটা শুধু একবারই দেখাবে)।
3. Chrome এ `chrome://extensions` খুলুন → **Developer mode** চালু করুন → **Load unpacked** এ ক্লিক করে unzip করা ফোল্ডার select করুন।
4. Extension popup এ আপনার app URL এবং token দিন। এর পর যেকোনো page এ গিয়ে extension icon এ ক্লিক করলে সেটা save হবে।

---

## ১০. সমস্যা হলে

| সমস্যা                                         | সমাধান                                                                                                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel build fail করছে                         | Build logs দেখুন। সাধারণত `bun install` ব্যর্থ হয় — `package.json` ঠিক আছে কিনা চেক করুন।                                                                                            |
| Login করার পর Admin Settings সেকশন দেখাচ্ছে না | Vercel এ `ADMIN_EMAIL` env var ঠিক আছে কিনা দেখুন। ভুল email হলে কাজ করবে না। change করে redeploy করুন।                                                                               |
| Link save করলে PERSONAL এ যাচ্ছে না            | Vercel এ `PERSONAL_SUPABASE_URL` এবং `PERSONAL_SUPABASE_SERVICE_ROLE_KEY` env vars দুটো‑ই সেট আছে কিনা যাচাই করুন। দুটোই খালি থাকলে fallback mode চালু হবে এবং সব data PUBLIC এ যাবে। |
| Telegram webhook register হচ্ছে না             | Admin Settings → **Public app URL** ফিল্ডে আপনার Vercel URL সঠিকভাবে বসানো আছে কিনা যাচাই করুন। শেষে `/` রাখবেন না।                                                                   |
| AI summary তৈরি হচ্ছে না                       | Admin Settings → **Google AI API key** ফিল্ডে valid key বসানো আছে কিনা দেখুন। DB তে কিছু না থাকলে env এর `GOOGLE_AI_API_KEY` fallback হিসেবে ব্যবহার হয়।                             |

---

## ১১. সংক্ষেপে

- **এক রিপো, এক Vercel URL, দুই Supabase project।**
- **ADMIN_EMAIL** ইউজারের সব data → PERSONAL Supabase।
- **অন্য সব ইউজার** (including granted admins) → PUBLIC Supabase।
- Auth সবসময় PUBLIC তে — JWT verification, profiles, api_tokens, telegram_bots, admin_settings সব PUBLIC এ থাকে।
- Service role keys কখনো frontend এ আসে না — সব server‑side functions এ ব্যবহার হয়।

ডিপ্লয় সম্পূর্ণ! 🎉
