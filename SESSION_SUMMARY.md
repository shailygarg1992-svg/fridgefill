# FridgeFill — Session Summary

**Date:** March 28 – April 2, 2026
**What we built:** A working grocery restock app, from zero to deployed, across multiple sessions.
**Live URL:** https://fridgefill.vercel.app
**GitHub:** https://github.com/shailygarg1992/fridgefill

---

## What happened, step by step

1. Moved the PRD from Downloads into the project folder
2. Built the entire Phase 1 MVP (17 source files)
3. Installed Node.js (wasn't on the machine)
4. Deployed to GitHub + Vercel
5. Fixed 7 bugs found during real-device testing on iPhone
6. Simplified the results UI for MVP scope
7. Fixed iOS safe area padding across all screens
8. Fixed cart total calculation (was double-counting prices)
9. Built Gmail OAuth integration (Phase 2) — 4 new files, 3 API routes
10. Set up Google Cloud project with OAuth credentials and test users
11. Added environment variables to Vercel (Google Client ID/Secret, App URL)
12. Debugged Gmail order parsing (March 29 – April 2) — 4 days of iterative debugging
13. Fixed: wrong email type, serverless timeout, SDK cold start, HTML extraction
14. Final solution: regex parsing of "Delivered:" emails — no Claude API needed

---

## Final feature set

- Scan fridge with camera or upload photos
- AI analyzes what's in the fridge and what's missing
- Generates a restock list based on your Walmart order history
- Smart filler suggestions to hit $35 free delivery
- One-tap Walmart links for every item
- Installable as an app on iPhone (PWA)
- Gmail integration — auto-syncs real Walmart order history from email (9 orders, ~30 items)
- Order History screen — view all synced orders with items and prices

---

## Bugs found and fixed

| Bug | How user saw it | Root cause | Fix |
|-----|----------------|------------|-----|
| Photo upload crashes | "Request Entity Too Large" error | iPhone photos are 3-12MB, Vercel limits requests to 4.5MB | Compress images client-side to under 300KB before sending |
| Empty image error | "image cannot be empty" from Claude API | Image loading race condition — code sent data before image finished loading | Changed to `createImageBitmap` which handles the file directly |
| Image format error | "Failed to compress image" | iPhone uses HEIC format which canvas couldn't process | `createImageBitmap` handles HEIC natively on iOS |
| Cancel button unreachable | Button hidden under iPhone clock | No padding for iOS status bar safe area | Added top padding to push below status bar |
| No photo upload option | Only camera capture available | Single file input with `capture` attribute | Added separate Camera and Upload buttons |
| Done/Back buttons hidden | Results & Staples screen buttons under iPhone clock | Same safe area issue, missed on 2 screens | Added `pt-14` padding to both screen headers |
| Cart total inflated | 3 items at $1-$3 each showing $52 total | Claude returned ambiguous `est_price` (sometimes per-unit, sometimes total), code multiplied by qty again | Renamed to `unit_price` with explicit prompt rules, added price breakdown display |
| Gmail returning 0 orders | "Refresh Orders" completes but shows no data | Wrong email type: "Thanks for your delivery order" emails have no item details, only "8 items See all +5" summary | Switched to "Delivered:" emails which list every item with name, qty, price |
| Gmail order parse timeout | 504 FUNCTION_INVOCATION_TIMEOUT | Anthropic SDK cold start (~4s) + Claude API call (~8s) exceeded Vercel's 10s default timeout | Eliminated Claude call entirely — regex parsing of structured text. Also added `export const config = { maxDuration: 60 }` |
| Stray "ea " in item names | Items showing as "ea Great Value..." | Regex captured trailing "$X.XX ea" text from previous item as part of next item's name | Added `.replace(/^ea\s+/i, '')` cleanup |

---

## What was descoped from the PRD for MVP

- **Strategic Buy alerts** (sale price detection) — removed to simplify first version
- **Collapsible sections** (Need Now / Need Soon / Don't Forget) — replaced with a single flat list
- Predictive restock AI, recipe integration, budget dashboard remain for later

## Google Cloud setup issues encountered

| Issue | What user saw | Fix |
|-------|--------------|-----|
| 403 access_denied | "fridgefill.vercel.app has not completed the Google verification process" | App is in testing mode — need to add your email as a test user under OAuth consent screen > Audience > Test users |
