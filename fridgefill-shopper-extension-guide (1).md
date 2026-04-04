# FridgeFill Shopper Extension — Complete Guide

> Last updated: April 4, 2026
> Status: **Fully Built and Operational**

## Architecture Overview

```
┌─────────────────┐       ┌──────────────┐       ┌─────────────────────┐
│  FridgeFill PWA │◄─────►│   Firebase   │◄─────►│  Chrome Extension   │
│  (Phone/Web)    │       │  Firestore   │       │  (Desktop Browser)  │
│                 │       │              │       │                     │
│ • Fridge scan   │       │ • Cart items │       │ • Reads cart from   │
│ • Generate list │       │ • Status     │       │   Firestore         │
│ • Tap "Fill     │       │ • Progress   │       │ • Walmart API first │
│   Cart" button  │       │ • Real-time  │       │ • DOM fallback      │
│ • Track status  │       │   updates    │       │ • Writes progress   │
└─────────────────┘       └──────────────┘       └─────────────────────┘
```

## E2E Flow

1. User scans fridge on **fridgefill.vercel.app** (works from phone or desktop)
2. AI generates restock list on Results screen
3. User taps **"Fill My Walmart Cart"** button
4. PWA signs user in via Google (Firebase Auth popup) if not already signed in
5. PWA writes cart request to Firestore with status `"pending"`
6. Chrome Extension detects new pending request via Firestore real-time listener
7. Extension updates status to `"in_progress"`
8. For each item, extension tries:
   - **API approach first**: Walmart autocomplete search → add to cart API
   - **DOM fallback**: Content script automation on walmart.com tab
9. After each item, extension updates Firestore with item status + progress
10. PWA shows real-time progress bar + item-by-item status
11. When all items processed, status set to `"completed"` or `"failed"`

---

## Firebase Project (DONE)

### Configuration
- **Project ID**: `fridgefill-shopper`
- **Auth Domain**: `fridgefill-shopper.firebaseapp.com`
- **Storage Bucket**: `fridgefill-shopper.firebasestorage.app`
- **Messaging Sender ID**: `148402498640`
- **App ID**: `1:148402498640:web:3430a3d9ca73e001f4f555`

### Services Enabled
- **Firestore Database**: Standard edition, `(default)` database
- **Authentication**: Google sign-in provider enabled
- **Authorized Domains**: localhost, fridgefill.vercel.app

### Chrome OAuth Client
- **Client ID**: `148402498640-rnnll9cfdu2jsm4tfuqgg0vhl6j0mab1.apps.googleusercontent.com`
- **Extension ID**: `lldlalpbihnnhgkbhellicbdjofbnnae`

### Firestore Security Rules (Published)
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/cart_requests/{requestId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### Firestore Schema
```
users/{userId}/cart_requests/{requestId}
  status: "pending" | "in_progress" | "completed" | "failed"
  created_at: timestamp
  items: [
    {
      name: string            // "Great Value Whole Milk 1 Gal"
      quantity: number         // 1
      walmart_query: string    // "great value whole milk gallon"
      walmart_product_id: string | null
      status: "pending" | "added" | "not_found" | "failed"
    }
  ]
  progress: { total: number, added: number, failed: number }
```

---

## PWA Changes (DONE)

### Files Added/Modified

| File | Type | Purpose |
|------|------|---------|
| `src/lib/firebase.js` | New | Firebase init with Firestore + Auth exports |
| `src/lib/cartService.js` | New | `sendCartRequest()` writes to Firestore, `watchCartRequest()` listens for real-time updates |
| `src/components/FillCartButton.jsx` | New | Button with state machine: idle → signing_in → sending → waiting → in_progress → completed/failed |
| `src/components/ResultsScreen.jsx` | Modified | Added FillCartButton import + rendered in bottom bar next to Browse button |

### FillCartButton States
- **idle**: Blue "Fill My Walmart Cart" button
- **signing_in**: "Signing in with Google..." (if not already authenticated)
- **sending**: "Sending cart request..."
- **waiting**: "Waiting for extension..." with hint text
- **in_progress**: Progress bar + item-by-item status (green=added, red=failed, gray=pending)
- **completed**: "Cart filled! X of Y items added."
- **failed**: "Something went wrong." with retry option

### Dependencies Added
- `firebase` (v10+) — added via `npm install firebase`

---

## Chrome Extension (DONE)

### File Structure
```
fridgefill-extension/
├── src/
│   ├── background.js       ← Core: Firestore listener + Walmart API + content script fallback
│   ├── content.js           ← DOM automation fallback on walmart.com
│   ├── popup.js             ← Popup UI logic + auth + status updates
│   └── firebase.js          ← Firebase init + chrome.identity sign-in
├── dist/                    ← Webpack output (3 bundles)
│   ├── background.js
│   ├── content.js
│   └── popup.js
├── popup.html               ← Extension popup UI
├── popup.css                ← Popup styles (320px width, green branding)
├── manifest.json            ← Manifest V3 config
├── webpack.config.js        ← 3 entry points → dist/
├── package.json             ← firebase + webpack deps
└── icons/
    ├── icon16.png           ← Green square placeholder icons
    ├── icon48.png
    └── icon128.png
```

### manifest.json Key Settings
```json
{
  "manifest_version": 3,
  "permissions": ["tabs", "scripting", "storage", "identity"],
  "host_permissions": ["https://www.walmart.com/*"],
  "background": { "service_worker": "dist/background.js" },
  "content_scripts": [{ "matches": ["https://www.walmart.com/*"], "js": ["dist/content.js"] }],
  "oauth2": {
    "client_id": "148402498640-rnnll9cfdu2jsm4tfuqgg0vhl6j0mab1.apps.googleusercontent.com",
    "scopes": ["https://www.googleapis.com/auth/userinfo.email"]
  }
}
```

### background.js — How It Works
1. On startup, signs in via `chrome.identity.getAuthToken()` → Firebase `signInWithCredential()`
2. Listens to Firestore query: `users/{uid}/cart_requests` where `status == "pending"`
3. On new request, calls `processCartRequest()`:
   - Updates status to `"in_progress"`
   - Loops through items with 2-3s delay between each
   - **API approach**: `fetch()` to Walmart autocomplete + cart API with `credentials: "include"`
   - **Fallback**: Opens walmart.com tab, sends message to content.js for DOM automation
   - Updates Firestore after each item with status + progress
   - Sets final status to `"completed"` or `"failed"`
4. Broadcasts status updates to popup via `chrome.runtime.sendMessage()`

### content.js — DOM Fallback
- Listens for `SEARCH_AND_ADD` messages from background
- Searches: finds search input, sets value, submits form
- Waits for results via `MutationObserver` with 10s timeout
- Clicks first "Add to cart" button matching `button[aria-label*="Add to cart"]`
- Returns `{ success: true/false, reason }`

### popup.html — Extension UI
- Shows auth status (green dot + email when signed in)
- Sign In with Google button
- Job status sections: waiting / in progress (with progress bar) / completed / failed
- Item list with color-coded statuses

### Building the Extension
```bash
cd fridgefill-extension
npm install
npm run build    # webpack → dist/
```

### Loading in Chrome
1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select `fridgefill-extension/` folder
4. Click extension icon → Sign In with Google

---

## Setup Requirements

### Prerequisites
- Chrome 120+ with **Chrome sign-in enabled** (Settings > You and Google > Allow Chrome sign-in)
- Logged into **walmart.com** in Chrome
- Same Google account in both FridgeFill PWA and Chrome extension

### First-Time Setup
1. Load extension in Chrome (Load unpacked → fridgefill-extension folder)
2. Click extension icon → Sign In with Google
3. Open fridgefill.vercel.app on phone or desktop
4. Scan fridge → get results → tap "Fill My Walmart Cart"
5. Sign in with Google on the PWA (same account)
6. Extension auto-detects the request and starts adding items

### Important Behaviors
- **Phone + Laptop**: You can tap the button from your phone. The request waits in Firestore. When your laptop is awake with Chrome running, the extension picks it up and processes it. Progress shows on your phone in real-time.
- **Laptop asleep**: Extension won't process requests while laptop is sleeping. Requests persist in Firestore and will be picked up when Chrome is running again.
- **Multiple requests**: Extension processes one request at a time, in order received.

---

## Security

### What's Protected
- Firestore rules ensure users can only access their own `cart_requests`
- All other Firestore paths return `deny`
- Debug logs stripped from production build (no emails, tokens, or API responses logged)
- `activeTab` permission removed (was redundant)
- Extension only has host permissions for walmart.com

### What's Normal
- Firebase API key in client code is standard — it's a public identifier, not a secret
- Security comes from Firestore rules, not API key restrictions
- Chrome OAuth token is exchanged via Firebase credential flow (industry standard)
- No Walmart credentials stored — uses browser's existing session

---

## Maintenance Notes

- **Walmart API endpoints** (`/orchestra/home/auto-complete`, `/api/v1/cart/items`) are reverse-engineered and may change without notice
- **DOM selectors** in content.js (`input[type="search"]`, `button[aria-label*="Add to cart"]`) will break when Walmart redesigns — update selectors as needed
- **Firebase SDK** should be kept up to date (`npm update firebase` in both repos)
- This is a **personal-use tool**, not for public distribution (Walmart TOS)

---

## GitHub
- **PWA repo**: https://github.com/shailygarg1992/fridgefill
- **Extension**: `/Users/shailygarg/fridgefill-extension/` (local, not in a separate repo)
- **Live app**: https://fridgefill.vercel.app
