# FridgeFill — Build Session Log

**Date:** March 28-29, 2026

---

## What was built

FridgeFill Phase 1 MVP — a React PWA that lets you photograph your fridge, uses Claude AI vision to identify contents, and generates a smart Walmart restock list.

## Tech Stack
- **Frontend:** React + Vite + Tailwind CSS
- **Backend:** Vercel Serverless Functions (Node.js)
- **AI:** Claude Sonnet (claude-sonnet-4-20250514) with vision
- **Hosting:** Vercel
- **Repo:** https://github.com/shailygarg1992-svg/fridgefill
- **Live URL:** https://fridgefill.vercel.app

## Features Implemented
1. **Home Screen** — Logo, "Scan My Fridge" CTA, last scan date
2. **Camera Capture** — Separate Camera and Upload buttons, multi-photo support, preview/remove
3. **Claude AI Analysis** — Sends compressed fridge photos + hardcoded order history to Claude Sonnet
4. **Results Screen (simplified for MVP):**
   - Flat recommended items list (combines Need Now / Need Soon / Don't Forget)
   - Free Delivery Zone — smart filler suggestions when cart is $25-$34.99
   - Delivery progress bar ($35 threshold)
   - Toggle items on/off, cart total updates in real-time
5. **Walmart Links** — every item has a one-tap link using exact product names
6. **Copy list** — clipboard export
7. **My Staples Screen** — 16 tracked items grouped by category with overdue indicators
8. **PWA** — manifest.json, service worker, iOS meta tags, installable on iPhone

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

## Environment Setup
- Node.js v20.18.0 installed to `~/local/` (no Homebrew available)
- `export PATH="$HOME/local/bin:$PATH"` added to `~/.zshrc`
- GitHub CLI v2.63.2 installed manually (arm64 binary)
- Vercel CLI installed via npm

## Deployment
- GitHub repo: public, auto-connected to Vercel
- Environment variable: `ANTHROPIC_API_KEY` set in Vercel project settings
- Every `vercel --prod` auto-deploys from local files

## What's NOT built yet (Phase 2+)
- Strategic Buy alerts (sale price detection) — removed from MVP for simplicity
- Gmail OAuth integration for auto order history
- Predictive restock AI
- Pantry & freezer scan modes
- Recipe integration
- Monthly budget dashboard
- Price history charts

## Accounts & Config
- **GitHub:** shailygarg1992-svg
- **Vercel:** shailygarg1992-3481 (email: shailygarg1992@gmail.com)
- **Anthropic:** $5 prepaid credits (~500 scans)
- **Estimated cost:** ~$0.50-1.00/month
