# شاي المهيب - Karak POS (React + TypeScript)

Mobile‑first, single‑page POS for a tea shop. All state is persisted in Firebase Realtime Database and syncs across devices.

## Quick start

1) Install dependencies

```powershell
npm install
```

2) Create `.env.local` from example and fill your Firebase config

```
cp .env.example .env.local
```

3) Run the dev server

```powershell
npm run dev
```

## Tech
- React + TypeScript + Vite
- Firebase Realtime Database

## Structure
- `src/components/Header.tsx` — Header with shop name and live date
- `src/components/NewOrderForm.tsx` — Button‑based new order form with cart and total
- `src/utils/pricing.ts` — Centralized menu/pricing logic
- `src/firebase.ts` — Firebase initialization

## Deployment (Firebase Hosting)

1) Install Firebase CLI (one-time)

```powershell
npm install -g firebase-tools
```

2) Login and link your project

```powershell
firebase login
```

3) Get your Firebase project ID from console.firebase.google.com → Project Settings → copy "Project ID"

4) Create `.firebaserc` in the project root:

```json
{
  "projects": {
    "default": "YOUR_PROJECT_ID_HERE"
  }
}
```

5) Build and deploy

```powershell
npm run build
firebase deploy --only hosting
```

Your app will be live at https://YOUR_PROJECT_ID.web.app
