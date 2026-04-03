# FridgeFill — Build Session Log

**Date:** March 28 – April 2, 2026

---

## What was built

FridgeFill Phase 1 MVP — a React PWA that lets you photograph your fridge, uses Claude AI vision to identify contents, and generates a smart Walmart restock list.

## Tech Stack
- **Frontend:** React + Vite + Tailwind CSS
- **Backend:** Vercel Serverless Functions (Node.js)
- **AI:** Claude Sonnet (claude-sonnet-4-20250514) with vision
- **Hosting:** Vercel
- **Repo:** https://github.com/shailygarg1992/fridgefill
- **Live URL:** https://fridgefill.vercel.app

## Features Implemented
1. **Home Screen** — Logo, "Scan My Fridge" CTA, last scan date
2. **Camera Capture** — Separate Camera and Upload buttons, multi-photo support, preview/remove
3. **Claude AI Analysis** — Sends compressed fridge photos to Vercel serverless function; purchase history lives server-side
4. **Results Screen (simplified for MVP):**
   - Flat recommended items list (combines Need Now / Need Soon / Don't Forget)
   - Each item shows qty x unit price breakdown for transparent math
   - Free Delivery Zone — smart filler suggestions when cart is $25-$34.99
   - Delivery progress bar ($35 threshold)
   - Toggle items on/off, cart total updates in real-time
5. **Walmart Links** — every item has a one-tap link using exact product names
6. **Copy list** — clipboard export
7. **My Staples Screen** — 16 tracked items grouped by category with overdue indicators
8. **PWA** — manifest.json, service worker, iOS meta tags, installable on iPhone
9. **iOS safe area handling** — All screen headers sit below the status bar on all iPhone models

## Hardcoded Data
- 5 Walmart orders (Mar 5–25, 2026) with full item details
- 16 staple items with prices, frequencies, categories, shelf life
- Purchase history lives server-side in the API route (not sent from client)

## Key Files
```
fridgefill/
├── api/analyze-fridge.js          — Vercel serverless function (Claude API)
├── src/
│   ├── App.jsx                    — Main app with screen routing
│   ├── components/
│   │   ├── HomeScreen.jsx         — Landing page
│   │   ├── CameraCapture.jsx      — Photo capture (camera + upload)
│   │   ├── AnalyzingScreen.jsx    — Loading animation
│   │   ├── ResultsScreen.jsx      — Restock list + delivery optimizer
│   │   └── StaplesScreen.jsx      — View/toggle staple items
│   ├── data/staples.js            — Hardcoded staples + order history
│   └── utils/api.js               — Image compression + API calls
├── public/
│   ├── manifest.json              — PWA manifest
│   └── sw.js                      — Service worker
├── vercel.json                    — Vercel deployment config
└── FridgeFill_PRD.md              — Full product requirements document
```

## Bugs Fixed During Session

### 1. Request Entity Too Large (FUNCTION_PAYLOAD_TOO_LARGE)
**Problem:** iPhone photos are 3-12MB. Vercel free tier has 4.5MB request body limit.
**Root cause:** Images were being sent as raw base64 without sufficient compression. Purchase history was also being sent from client, adding to payload.
**Fix:**
- Aggressive client-side compression: 800px max → 560px → 392px → 274px with decreasing quality (0.6 → 0.3)
- Target max 300KB base64 per image
- Moved purchase history to server-side (static data, no need to transmit)
- Removed raw file fallback entirely — always compress via canvas

### 2. Image cannot be empty (Claude API 400)
**Problem:** `createImageBitmap` + blob URL caused race condition where base64 was empty.
**Fix:** Used `createImageBitmap(file)` directly (accepts File objects), then synchronous canvas operations. No more async URL loading.

### 3. Failed to compress image
**Problem:** HEIC format from iPhone not handled by `new Image()` + data URL approach.
**Fix:** Switched to `createImageBitmap(file)` which handles HEIC natively on iOS Safari. All output is JPEG via `canvas.toDataURL('image/jpeg', quality)`.

### 4. Cancel button hidden under iOS status bar
**Problem:** Camera screen header overlapped with iPhone clock/status bar.
**Fix:** Added `pt-14` padding to push header below safe area.

### 5. No way to upload existing photos
**Problem:** Only had camera capture, no photo library access.
**Fix:** Added separate Camera button (`capture="environment"`) and Upload button (no `capture` attribute, opens photo picker).

### 6. Results & Staples screen buttons hidden under iOS status bar
**Problem:** "Done", "Copy", and "Back" buttons on the Results and Staples screens overlapped with the iPhone clock/battery bar. Same issue we fixed on the Camera screen, but missed on these two screens.
**Fix:** Changed header padding from `py-3` to `pt-14 pb-3` on both screens. Audited all 5 screens — Home and Analyzing are vertically centered so they were never affected.

### 7. Cart total wildly inflated ($52 for 3 cheap items)
**Problem:** Claude returned `est_price` which was ambiguous — sometimes per-unit, sometimes total for all units. Our code multiplied `est_price * qty` regardless, causing double-counting. Example: Claude returns `est_price: 7.86` (already 2 x $3.93 for milk) and `qty: 2`, so our code calculated $7.86 x 2 = $15.72 instead of $7.86.
**Fix:**
- Renamed field to `unit_price` in the Claude prompt with explicit rule: "unit_price must be the price for ONE unit"
- Added reference prices directly in the prompt so Claude doesn't guess
- Each item row now shows qty breakdown (e.g., "2 x $3.93") so user can verify the math
- Created `getUnitPrice()` and `getLineTotal()` helper functions as single source of truth for calculations

## Environment Setup
- Node.js v20.18.0 installed to `~/local/` (no Homebrew available)
- `export PATH="$HOME/local/bin:$PATH"` added to `~/.zshrc`
- GitHub CLI v2.63.2 installed manually (arm64 binary)
- Vercel CLI installed via npm

## Gmail Integration (Phase 2 — Built March 29-30, 2026)

### What was added
- **Google OAuth flow** — "Connect Gmail" button on Home screen
- **3 new API routes:**
  - `api/auth/google.js` — redirects user to Google's consent screen
  - `api/auth/callback.js` — exchanges OAuth code for access token
  - `api/parse-orders.js` — searches Gmail for Walmart emails, uses Claude to extract order data
- **Order History screen** — shows all synced orders with items, prices, dates
- **Real order data in fridge analysis** — when Gmail is connected, the fridge scan uses real purchase history instead of hardcoded data
- **Home screen updates** — shows Gmail connection status, order count, Refresh/View/Disconnect options

### How the OAuth flow works
1. User taps "Connect Gmail" → redirected to Google login
2. Google asks "Allow FridgeFill to read your Gmail (read-only)?" → user approves
3. Google redirects back to `/api/auth/callback` with a one-time code
4. Server exchanges code for access token → redirects to app with token in URL
5. App stores token in localStorage, immediately fetches Walmart "Delivered:" emails
6. Server uses regex to parse structured email text into order data (items, qty, price, date)
7. Parsed orders stored in localStorage for future fridge scans

### Google Cloud Setup Required
1. Create project "FridgeFill" at console.cloud.google.com
2. Enable Gmail API
3. Configure OAuth consent screen (External, testing mode)
4. Add test user: shailygarg1992@gmail.com (under Audience tab)
5. Create OAuth client ID (Web application) with redirect URI: `https://fridgefill.vercel.app/api/auth/callback`
6. Add to Vercel env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_URL`

### Troubleshooting encountered
- **403 access_denied "not completed Google verification"** — App is in testing mode. Fix: add your email as a test user under OAuth consent screen > Audience > Test users.

## Deployment
- GitHub repo: public, auto-connected to Vercel
- Environment variables set in Vercel:
  - `ANTHROPIC_API_KEY` — Claude API access
  - `GOOGLE_CLIENT_ID` — Google OAuth client ID
  - `GOOGLE_CLIENT_SECRET` — Google OAuth client secret
  - `APP_URL` — `https://fridgefill.vercel.app`
- Every `vercel --prod` auto-deploys from local files

## Key Files (Updated)
```
fridgefill/
├── api/
│   ├── analyze-fridge.js          — Claude vision API (uses Gmail orders when available)
│   ├── parse-orders.js            — Fetches "Delivered:" emails from Gmail, regex extracts items
│   ├── debug-parse.js             — Diagnostic endpoint for Gmail parsing troubleshooting
│   ├── debug-gmail.js             — Debug endpoint for Gmail search queries
│   ├── test-gmail.js              — E2E test endpoint for Gmail integration
│   └── auth/
│       ├── google.js              — Starts OAuth flow (redirects to Google)
│       └── callback.js            — Handles OAuth callback (exchanges code for token)
├── src/
│   ├── App.jsx                    — Main app with screen routing + Gmail state management
│   ├── components/
│   │   ├── HomeScreen.jsx         — Landing page + Gmail connection UI
│   │   ├── CameraCapture.jsx      — Photo capture (camera + upload)
│   │   ├── AnalyzingScreen.jsx    — Loading animation (also used for order syncing)
│   │   ├── ResultsScreen.jsx      — Restock list + delivery optimizer
│   │   ├── StaplesScreen.jsx      — View/toggle staple items
│   │   └── OrderHistoryScreen.jsx — View synced Gmail orders
│   ├── data/staples.js            — Hardcoded staples + order history (fallback)
│   └── utils/api.js               — Image compression + API calls
├── public/
│   ├── manifest.json              — PWA manifest
│   └── sw.js                      — Service worker
├── vercel.json                    — Vercel deployment config
└── FridgeFill_PRD.md              — Full product requirements document
```

## What's NOT built yet (Future)
- Strategic Buy alerts (sale price detection) — removed from MVP for simplicity
- Predictive restock AI (auto-calculate per-item frequency from Gmail data)
- Smart substitutions (suggest alternatives for unavailable items)
- Pantry & freezer scan modes
- Recipe integration
- Monthly budget dashboard
- Price history charts

## Gmail Order Parsing Debug Saga (March 29 – April 2, 2026)

### The problem
After building the Gmail integration, "Refresh Orders" returned zero orders every time.

### The debugging journey (7 iterations)

**Attempt 1: Increase HTML chunk size (15KB → 50KB)**
- Theory: item data was being cut off
- Result: still zero orders — the problem was elsewhere

**Attempt 2: Handle Gmail `attachmentId` for large emails**
- Theory: Gmail omits `body.data` for large MIME parts and requires a separate fetch
- Result: discovered the data WAS inline (no attachmentId needed) — wrong theory

**Attempt 3: Fix Vercel function timeout (504 errors)**
- Theory: Anthropic SDK cold start + Claude API call exceeded 10s default
- Fix: `export const config = { maxDuration: 60 }` (vercel.json config wasn't being applied)
- Fix: replaced Anthropic SDK with direct `fetch` to api.anthropic.com
- Fix: reduced from 15 emails to 1
- Result: function finally returned a response instead of 504!

**Attempt 4: Claude returns empty items `[]`**
- Got a response: `{ "order_date": "2026-03-31", "items": [] }`
- Claude received 50KB of cleaned HTML but found zero items
- Need to understand what the email actually contains

**Attempt 5: Built diagnostic endpoint (`api/debug-parse.js`)**
- Step-by-step tracing: token → search → fetch → MIME → HTML extraction → content analysis
- Discovered: cleaned text was only 1,722 chars despite 210KB HTML (mostly empty tables)
- Found only 5 prices: $40.71, $14.27, $8.17, $33.75, $41.92 — these are order TOTALS
- The "Thanks for your delivery order" email is an ORDER CONFIRMATION with no item details
- It just says: "Fresh Fuji Apples, 3 l... + 8 items 👍" — a summary, not a list

**Attempt 6: Search for the RIGHT email type**
- Searched all Walmart email subjects in Gmail
- Found "Delivered:" emails: "Delivered: Marketside Fresh Spina... +22 items"
- These contain full item lists with names, quantities, and prices!

**Attempt 7: Regex parsing of "Delivered:" emails (FINAL FIX)**
- "Delivered:" email text is small (2KB) and structured:
  ```
  Marketside Fresh Spinach and Spring Mix, 11 oz $0.37/OZ Qty: 1 $0.40 from associate discount $3.98
  ```
- Regex parses this instantly — no Claude API call needed
- Result: 9 orders, ~30 items, real prices, 3-second response time

### Key learnings for PMs

1. **Wrong data source is the most common bug in AI products.** We spent days optimizing HTML parsing when the real problem was: we were reading the wrong email. Always verify your data source contains what you think it does before building the pipeline.

2. **Serverless cold starts are real.** Importing a heavy SDK (like `@anthropic-ai/sdk`) adds 3-4 seconds of cold start time. For time-constrained serverless functions, use direct HTTP calls instead.

3. **Not everything needs AI.** The "Delivered:" email text is so structured that regex parsing is better than Claude: faster (0ms vs 8s), cheaper ($0 vs $0.01), and deterministic (no prompt engineering needed).

4. **Build diagnostic endpoints.** The step-by-step debug endpoint (`debug-parse.js`) that reported results at each stage was what finally cracked the problem. When a pipeline has 5+ steps, you need visibility into each one.

5. **`export const config` vs `vercel.json`:** For Vercel serverless function settings, in-file exports are more reliable than vercel.json `functions` config.

## Accounts & Config
- **GitHub:** shailygarg1992
- **Vercel:** shailygarg1992-3481 (email: shailygarg1992@gmail.com)
- **Google Cloud:** project "FridgeFill" (testing mode, shailygarg1992@gmail.com as test user)
- **Anthropic:** $5 prepaid credits (~500 scans)
- **Estimated cost:** ~$0.50-1/month (Gmail parsing is now free — no Claude API calls)
