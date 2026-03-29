# FridgeFill — Technical Guide for PMs

This explains every technical decision we made, in plain language, so you understand *why* things work the way they do and can make informed product decisions.

---

## 1. The Architecture (How the pieces fit together)

```
Your iPhone (Safari)
    ↓ takes photo
React App (the frontend — what users see and tap)
    ↓ compresses photo, sends to server
Vercel Serverless Function (the backend — runs our code in the cloud)
    ↓ sends photo + your order history
Claude API (AI brain — analyzes the image)
    ↓ returns JSON with restock recommendations
React App displays the results
    ↓ user taps item
Opens Walmart.com search for that exact product
```

**Why this matters for you as PM:**
- The user never talks to Claude directly — our server does. This keeps your API key secret.
- The AI call takes 5-10 seconds. That's why we have the loading animation with fun messages.
- If Claude's API goes down, the whole scan feature breaks. Everything else (home screen, staples list) still works because it's all local.

---

## 2. What is a PWA? (Progressive Web App)

A PWA is a website that can be "installed" on a phone and behave like a native app. We chose this over building a native iOS app because:

| | PWA | Native iOS App |
|---|---|---|
| **Build time** | Hours | Weeks |
| **App Store approval** | Not needed | 1-7 days review |
| **Cost** | Free | $99/year Apple Developer fee |
| **Updates** | Instant (just redeploy) | Submit new version, wait for review |
| **Limitations** | No push notifications on iOS (until recently), slightly less polished | Full device access |

**The key files that make it a PWA:**
- `manifest.json` — tells the phone "this is an app" with a name, icon, and theme color
- `sw.js` (Service Worker) — caches the app shell so it loads even offline
- Meta tags in `index.html` — iOS-specific tags like `apple-mobile-web-app-capable`

**PM takeaway:** PWA is perfect for an MVP like this. If FridgeFill grows and needs push notifications or App Store presence, you'd build a native app later. The backend/API stays the same.

---

## 3. Frontend: React + Vite + Tailwind

**React** is a UI library. Think of it like building with LEGO — each screen is a "component" (a reusable piece):

```
App.jsx                  ← The manager — decides which screen to show
├── HomeScreen.jsx       ← Landing page with "Scan My Fridge" button
├── CameraCapture.jsx    ← Photo capture/upload screen
├── AnalyzingScreen.jsx  ← Loading spinner with fun messages
├── ResultsScreen.jsx    ← The restock list with delivery optimizer
└── StaplesScreen.jsx    ← "My Staples" list view
```

**Vite** is the build tool. It:
- Runs the app locally during development (hot reload — you edit code, browser updates instantly)
- Compiles everything into optimized files for production

**Tailwind CSS** is the styling system. Instead of writing CSS files, you add classes directly to HTML like `bg-green-600 text-white rounded-xl`. This is why we could build a polished UI quickly.

**PM takeaway:** If you want to change colors, button sizes, or layout, those are all Tailwind classes in the component files. A designer or developer can adjust them without touching any logic.

---

## 4. Backend: Vercel Serverless Functions

**What is serverless?**
Instead of renting a server that runs 24/7 ($$$), serverless functions only run when called. Think of it like a vending machine vs. hiring a full-time cashier.

Our one function: `api/analyze-fridge.js`
- Receives the compressed photo from the app
- Sends it to Claude API with the purchase history and instructions
- Returns Claude's analysis as structured data (JSON)

**Why the purchase history lives on the server:**
- It's the same every time (hardcoded from your 5 Walmart orders)
- Sending it from the phone wastes bandwidth and makes the request larger
- When you add Gmail sync (Phase 2), the server will fetch it from a database instead

**PM takeaway:** Vercel's free tier gives you plenty of capacity for personal use. If FridgeFill had 1000 users, you'd need the $20/month Pro plan.

---

## 5. The Image Compression Problem (and why it kept breaking)

This was our biggest bug. Here's the full story:

**The constraint:** Vercel's free tier limits request bodies to **4.5MB**. A single iPhone photo is **3-12MB**. So we *must* shrink the image before sending it.

**Attempt 1:** Basic FileReader → Image → Canvas approach
- **Failed because:** The Image object loaded asynchronously, and we sent the data before it finished loading → empty image error

**Attempt 2:** FileReader → Image (fixed loading) → Canvas
- **Failed because:** iPhone photos are often HEIC format (Apple's proprietary format). The `Image` object can display HEIC but `canvas` can't always convert it → "failed to compress" error

**Attempt 3:** createImageBitmap → Canvas with raw fallback
- **Failed because:** The raw fallback sent the original 12MB file when compression failed → payload too large again

**Final fix (Attempt 4):**
```
createImageBitmap(file)     ← Handles ANY format including HEIC
    ↓
Resize to max 800px         ← iPhone photos are 4032px wide, we don't need that
    ↓
Convert to JPEG at 60%      ← JPEG is universally supported, 60% quality is plenty for AI analysis
    ↓
Check if under 300KB        ← If not, shrink more (560px, then 392px, then 274px)
    ↓
Send to server              ← Guaranteed small enough
```

**PM takeaway:** Image handling on mobile is one of the trickiest parts of any photo-based app. The AI doesn't need a high-res photo — it just needs to see what's in the fridge. Compressing to 800px at 60% quality is a sweet spot: small enough to send quickly, detailed enough for AI to read labels and identify items.

---

## 6. The Claude API Integration

**What happens when you tap "Analyze":**

1. Your photo is sent to our Vercel function
2. Our function builds a "prompt" for Claude — this is the key product decision:

```
System prompt: "You are a grocery inventory analyst..."
   ↓
Image: [your fridge photo]
   ↓
Text: "Here's the purchase history... here are baseline prices...
       analyze what's in the fridge and what needs restocking.
       Return ONLY valid JSON."
```

3. Claude returns structured JSON with:
   - What it sees in the fridge and quantity levels
   - What you need to restock and why
   - Smart filler suggestions for free delivery

**Why we use Claude Sonnet (not Opus):**
- Sonnet is 5x cheaper than Opus (~$0.01-0.03 per scan vs $0.05-0.15)
- For image recognition + structured output, Sonnet is more than capable
- Faster response time (3-8 seconds vs 10-30 seconds)

**The prompt is the product.** The quality of FridgeFill's recommendations depends entirely on how well we instruct Claude. Tuning the prompt (what context to include, how to prioritize suggestions, what format to return) is where the PM has the most impact.

**PM takeaway:** You can iterate on the prompt in `api/analyze-fridge.js` without changing any frontend code. The prompt is essentially your "product spec" for the AI.

---

## 7. The $35 Free Delivery Optimizer

**How it works in code:**

1. Claude returns a restock list with estimated prices
2. The frontend adds up all checked items → `activeTotal`
3. If `activeTotal` is between $25 and $34.99, the "Free Delivery Zone" appears
4. Claude also returns `filler_suggestions` — items you'll need soon anyway
5. User can toggle suggestions on/off, and the total + progress bar update instantly

**Why $25 is the lower bound:** Below $25, the user is probably making a small intentional order. Aggressively pushing "add more stuff!" would be annoying. This is a product judgment call encoded in the code.

**PM takeaway:** The thresholds ($25 lower, $35 target) are easy to change. If Walmart changes their free delivery threshold, you update one constant in `src/data/staples.js`.

---

## 8. Deployment Pipeline

```
You write code locally
    ↓ git add + git commit
Saved to local Git (version control — like "save" with history)
    ↓ git push
Pushed to GitHub (cloud backup, collaboration)
    ↓ automatic or manual
Vercel detects changes and rebuilds
    ↓
Live at fridgefill.vercel.app within ~30 seconds
```

**Environment variables:** The Anthropic API key is stored in Vercel's settings, NOT in the code. This means:
- The key never appears on GitHub (which is public)
- You can rotate the key without changing code
- Different environments (staging, production) can have different keys

**PM takeaway:** Deploying a change is one command: `vercel --prod`. No app store reviews, no waiting. This is the speed advantage of web apps.

---

## 9. Cost Breakdown

| What | Cost | Why |
|------|------|-----|
| Vercel hosting | $0/month | Free tier — 100GB bandwidth, unlimited deploys |
| Claude API | ~$0.50-1.00/month | ~$0.02 per scan × 2 scans/week × 4 weeks |
| Anthropic credits | $5 prepaid | Lasts ~3-6 months at current usage |
| GitHub | $0 | Free for public repos |
| Domain name | $0 (optional $12/year) | Using fridgefill.vercel.app for now |
| **Total** | **~$1/month** | |

**PM takeaway:** This is an extremely cheap app to run for a single user. Scaling to 100 users would cost ~$20-50/month (Vercel Pro + more API calls). Scaling to 10,000 users would require architectural changes (database, auth, rate limiting).

---

## 10. Glossary of Terms Used

| Term | Plain English |
|------|--------------|
| **API** | A way for two programs to talk to each other. Our app talks to Claude's API to get fridge analysis. |
| **Base64** | A way to represent binary data (like an image) as text. Needed because JSON can only contain text. |
| **Component** | A reusable UI building block in React. Like a template for a button, card, or screen. |
| **Deploy** | Publishing code so users can access it on the internet. |
| **Endpoint** | A specific URL that accepts requests. `/api/analyze-fridge` is our endpoint. |
| **Environment variable** | A secret value (like an API key) stored on the server, not in code. |
| **Git** | Version control — tracks every change to your code with history. Like Google Docs version history. |
| **HEIC** | Apple's image format. More efficient than JPEG but not universally supported. |
| **JSON** | A structured text format for data. Like a spreadsheet in text form. |
| **JSX** | HTML-like syntax used in React to describe UI. Looks like HTML but lives in JavaScript files. |
| **MVP** | Minimum Viable Product — the smallest version that delivers core value. |
| **Node.js** | JavaScript runtime that lets you run JavaScript outside a browser (on a server). |
| **PWA** | Progressive Web App — a website that can be installed like a native app. |
| **Serverless** | Cloud functions that run on-demand, not on a dedicated server. Pay per use. |
| **Service Worker** | A script that runs in the background, enabling offline caching for PWAs. |
| **Tailwind** | A CSS framework where you style elements with utility classes like `bg-green-600`. |
| **Vite** | A fast build tool for modern web apps. Compiles your code for production. |
| **Vercel** | A cloud platform for deploying web apps. Handles hosting, SSL, and serverless functions. |
