# Karak POS V5 - Complete System Specification

**Document Version:** 1.0  
**Date:** November 24, 2025  
**Target Audience:** Developer/AI System building Karak POS V5 from scratch  
**Scope:** Full POS system for tea shop (Almohib) with thermos tracking, multi-language support, loyalty system, and mobile optimization

---

## 1. EXECUTIVE SUMMARY

**Karak POS** is a real-time point-of-sale system for a professional tea shop operating a shift-based model (5 PM to ~1 AM). The system tracks drink orders, manages thermos inventory (ml-based), processes payments, tracks customer loyalty by license plate, and provides real-time dashboards for staff.

**Critical V4 Issues V5 Must Solve:**
- Mobile browser freezes when dashboard loads large order histories (>500 orders in `orders/` node causes 4GB RAM phone to become unresponsive)
- Desktop UI freezes when clicking "Ready" button during order state transitions
- Language switch causes white screen on mobile (state/render crash)
- No offline mode or fallback; users cannot work when Firebase connection is poor
- Virtualization added but incomplete; rendering still causes lag with many orders

**V5 Philosophy:** Build with **mobile-first constraints** (assume 4GB RAM, poor network), **manual data loading** (never auto-load large datasets), and **graceful degradation** (app must work offline or with partial data).

---

## 2. TECHNOLOGY STACK

### Frontend
- **Framework:** React 18 + TypeScript (strict mode: `noImplicitAny`, `strictNullChecks`)
- **Build Tool:** Vite 5.4+ (tree-shaking, lazy code splitting)
- **State Management:** React Hooks (useState, useCallback, useMemo, useRef)
- **UI Rendering:** React-Window (VariableSizeList for virtualized lists >100 items)
- **Styling:** Plain CSS (responsive grid, RTL support for Arabic)
- **Language:** Arabic (عربية) primary, English secondary; direction toggles (RTL/LTR)

### Backend & Data
- **Database:** Firebase Realtime Database (no Firestore; use simple node structure)
- **Hosting:** Firebase Hosting
- **Authentication:** None (local PIN-based access control: PIN = "522" for admin features)
- **Audio:** Web Audio API + HTMLAudioElement fallback (`/public/beep.mp3`)

### Performance Requirements
- **Mobile Target:** 4GB RAM, Chrome 120+, 3G network (assume 500ms latency)
- **Desktop:** Modern browsers (Chrome 120+, Firefox 115+, Safari 17+)
- **Initial Load:** <2 seconds on mobile (lazy load dashboard data)
- **Order Entry:** <100ms response time (local state first, DB later)
- **Virtualization:** Handle 2000+ completed orders without lag (render <50 visible rows)

---

## 3. DATABASE STRUCTURE (DETAILED)

### Node: `orders/`
Stores all active and recently completed orders.

```
orders/
  {orderId}/
    type: "item" | "separator"
    status: "preparing" | "ready" | "completed"
    createdAt: number (milliseconds, timestamp)
    completedAt: number | null (when marked ready→payment)
    batchId: string (grouping for payment)
    
    // Drink selection
    drinkType: "Karak" | "Almohib" | "Red Tea" | "Lemon" | "Cold Drink" | "Sweets"
    teaType: "Almohib" | "Habak" (only for Red Tea; cleared for other drinks)
    cupType: "Paper Cup" | "Glass Small" | "Glass Large" | "Thermos"
    quantity: number
    sugar: "None" | "Light" | "Normal" | "Extra" (for hot drinks)
    coldDrinkName: string (e.g., "Water", "Pepsi"; only for Cold Drink)
    sweetsOption: string (e.g., "Small", "Medium", "Large"; only for Sweets)
    customPrice: number | null (custom price for Sweets; null = standard price)
    
    // Order metadata
    licensePlate: string | null (3-digit plate, e.g., "123")
    notes: string | null (kitchen notes, e.g., "extra sweet", "no sugar")
    totalPrice: number (in BHD, e.g., 0.500)
    unitPrice: number | null (for reference)
    
    // Payment
    paymentMethod: "Cash" | "Machine" | "Benefit" | "Mixed" | null
    
    // V5 additions: offline tracking
    syncedAt: number | null (timestamp of last successful DB write; null = pending offline)
    isOfflineOrder: boolean | true (mark orders created while offline)
```

**Index on createdAt** is required for efficient queries (Firebase will optimize).

---

### Node: `orders-archive/`
Historical orders moved from `orders/` to free up memory and improve query performance.

```
orders-archive/
  {orderId}/
    [same structure as orders/]
    archivedAt: number (timestamp when moved)
```

---

### Node: `plateNotes/`
Persistent notes for license plates (recall across shifts/weeks).

```
plateNotes/
  {licensePlate}/
    {weekKey}/ (format: "YYYY-Www", e.g., "2025-W47")
      note: string
      updatedAt: number
```

---

### Node: `stats/`
Aggregate statistics and configuration.

```
stats/
  breakeven/
    target: number (weekly revenue target in BHD, default 100)
  
  thermos/
    karak/
      currentLevel_ml: number (current volume in ml, 0–3000)
      maxCapacity_ml: number (always 3000)
      refills: number (count of refills this shift)
      lastReheatedAt: number | null (timestamp)
    almohib/
      [same as karak]
    otherTeas/
      [same as karak]
  
  shift/
    startAt: number | null (timestamp shift began; null = no active shift)
  
  rushHour/
    {dateKey}/ (format: "YYYY-MM-DD")
      {hour}/ (format: "00"–"23")
        count: number (orders started in this hour)
        revenue: number (total BHD revenue)
```

---

### Node: `loyalty/`
Customer visit counts and loyalty tracking per license plate.

```
loyalty/
  {licensePlate}/
    count: number (total visits across all shifts)
    lastVisitShift: string (shift date key, "YYYY-MM-DD"; uses 5 PM rule: before 5 AM = previous day)
```

---

### Node: `settings/`
Global app configuration.

```
settings/
  lang: "ar" | "en" (active language)
  darkMode: boolean (dark theme enabled)
  alerts/
    sound: boolean (play beep on new orders)
    vibrate: boolean (vibrate on new orders)
```

---

## 4. CORE FEATURES & WORKFLOWS

### 4.1 Order Entry & New Order Form

**Purpose:** Fast, touch-optimized drink selection and cart management.

**Inputs:**
1. **Drink Type Selection** (radio/button grid):
   - Karak (default)
   - Almohib
   - Red Tea (requires teaType selection)
   - Lemon
   - Cold Drink (dropdown for drink name)
   - Sweets (requires sweetsOption selection)

2. **Modifiers** (conditional based on drink type):
   - **For hot drinks (Karak, Almohib, Red Tea, Lemon):**
     - Cup Type: Paper Cup (200ml), Glass Small (175ml), Glass Large (210ml), Thermos
     - Sugar: None, Light, Normal, Extra
   - **For Red Tea only:** Tea Type (Almohib or Habak)
   - **For Cold Drink:** Drink Name dropdown (Water, Pepsi, Sprite, etc.)
   - **For Sweets:** Sweets Option (Small, Medium, Large) + optional custom price adjustment (±0.100 BHD)

3. **Quantity:** ±/+ buttons (default 1)

4. **Plate Number:** Optional 3-digit license plate input (mobile keyboard: numeric only, max 3 chars)

5. **Notes:** Optional text input (kitchen instructions)

6. **Recall Plate Notes:**
   - When plate is entered, query `plateNotes/{plate}/{currentWeekKey}` and display hint.
   - Offer auto-fill of notes; user can accept or edit.
   - Do NOT show blocking alert; silently offer the recall as a hint below the notes input.

**Pricing Logic:**
- Base prices from `pricing.ts`:
  - Karak (all sizes): 0.300 BHD
  - Almohib: 0.400 BHD
  - Red Tea: 0.200 BHD
  - Lemon: 0.200 BHD
  - Cold Drink: 0.150 BHD
  - Sweets: 0.200 (Small), 0.500 (Medium), 1.000 (Large)
- Cup size adds NO extra cost (handled in thermos accounting, not price).
- Sweets allow custom price: user can increase/decrease by ±0.100 BHD.

**Cart Display:**
- Show running total in large, bold text.
- Display unit price (price per 1) and total price.
- Allow edit/delete individual items before submit.

**Submit Actions:**
1. **"Send to Prep"** (blue button):
   - Validates: drink type selected, quantity > 0.
   - Creates order in `orders/{newId}` with type="item", status="preparing", createdAt=now().
   - Saves plate number and notes.
   - Saves plate notes to `plateNotes/{plate}/{weekKey}` for future recall.
   - Plays `/beep.mp3` (audio notification).
   - Clears cart; user can immediately create next order.

2. **"Call" Button** (between "Send to Prep" and cart, separate):
   - Plays same `/beep.mp3` sound.
   - Used to call customers without placing a new order.
   - No database writes.

3. **"Add to Basket"** (if using multi-item batches):
   - Adds current item to local cart; allows bundling multiple items.
   - Submit entire batch at once.

---

### 4.2 Kanban Board (Order Preparation)

**Purpose:** Visual management of orders flowing through: Preparing → Ready → Payment → Completed.

**UI Layout:**
- 3 columns (vertical scroll, responsive to mobile):
  1. **Preparing (status="preparing"):** Orders waiting to be made.
  2. **Ready (status="ready"):** Orders completed, waiting for payment.
  3. **Completed (status="completed"):** Orders paid and archived.

**Preparing Column:**
- List orders by createdAt (oldest first).
- Group by "New Car" separator (user-inserted; manual batch grouping).
- For each order, display:
  - Drink type + quantity (with icon)
  - Modifiers: cup size, sugar, tea type (if applicable)
  - License plate (if available)
  - Notes
  - Total price
- **Actions:**
  - **Edit:** Modify notes or plate in a quick modal.
  - **Ready:** Mark order as ready; updates status to "ready", triggers thermos decrement (if hot drink), plays alert sound.
  - **Delete:** Remove order (trash icon; no PIN required for preparing orders).
- **Thermos Decrement on Ready:**
  - Only for hot drinks: Karak, Almohib, Red Tea (NOT Lemon).
  - Decrement by: `CUP_SIZES_ML[cupType] × quantity`.
  - Cup sizes: Paper=200ml, Glass Small=175ml, Glass Large=210ml, Thermos=0ml (tracked separately).
  - Key rule: **Lemon does NOT decrement thermos** (special instruction from user).
  - Use Firebase `runTransaction` to avoid race conditions.

---

### 4.3 Ready → Payment (Group Checkout)

**Purpose:** Group orders by "New Car" and process payment together.

**Workflow:**
1. When all items in a group are "ready", display **"Proceed to Payment"** button.
2. User clicks → opens **PaymentModal** with:
   - Order summary (items, quantities, prices).
   - Total amount due (BHD).
   - Payment method selection (4 buttons):
     - **Cash** (toggle to show cash amount entered)
     - **Machine** (debit/credit card)
     - **Benefit** (wallet app)
     - **Mixed** (cash + card combination)
   - **Confirm** button (updates status to "completed", records paymentMethod, records completedAt=serverTimestamp()).

3. **Loyalty Increment** (on completion):
   - For each unique license plate in the completed group:
     - Read `loyalty/{plate}`.
     - Check `lastVisitShift` against current shift date (5 PM rule: before 5 AM = previous day).
     - If different shift → increment `count` and update `lastVisitShift`.
     - If same shift → no increment (prevent double-counting).
   - Alert user of loyalty milestone: 2 stars (2nd visit), 3 stars, 5 stars (VIP).

4. **Clear Group:** Remove items from Kanban; they appear in Completed Orders log.

---

### 4.4 Dashboard & Analytics

**Purpose:** Real-time thermos levels, daily summary, completed orders log, breakeven tracking.

**Sections:**

#### 4.4.1 Thermos Levels (Always Loaded)
- 3 thermoses: Karak, Almohib, Red Tea (Other Teas).
- Each shows:
  - Current level in liters (e.g., 3.0 L).
  - Progress bar (% of max 3000 ml).
  - Warning: turn yellow if ≤30% capacity.
  - **Actions:**
    - **−/+** buttons: adjust ±500 ml (manual calibration).
    - **Actions menu:** 3 options:
      1. Add 100 ml (micro-fill).
      2. Log Refill (increment refill counter, set timestamp).
      3. Log Reheat (record reheating time).
  - Display refill count and last reheat time.

#### 4.4.2 Completed Summary (PIN-Locked)
- Shows total revenue today and breakdown by payment method.
- Unlock with PIN "522".
- Display chips: "Cash: 50.000 BHD", "Machine: 75.500 BHD", "Mixed: 10.200 BHD", etc.

#### 4.4.3 Completed Orders Log (Manual Load, No Auto-Subscription)
- **Key Fix for Mobile Freeze:**
  - **DO NOT** auto-load orders on page load.
  - **DO NOT** use `onValue` subscriptions (keep connection open).
  - Use manual **"Refresh" button** → user controls when data loads.
  - Load only **last 20 orders** by default (reduce initial memory footprint).
  - Use **"Load more" button** to paginate older orders (20 at a time).

- **UI Layout:**
  - **Header:** "Refresh" button (🔄), date picker, "Copy Day" button, "Copy All" button.
  - **Filters:** Payment method chips (Cash, Machine, Benefit, Mixed), plate number search (3 digits).
  - **List (Virtualized with react-window):**
    - Render visible orders only (VariableSizeList, ~92px per order row).
    - Date separators (56px) between date groups (clickable → show daily summary modal).
    - Each order row shows: drink type + quantity, modifiers, plate, notes, price, Edit button, Delete button (PIN-locked).

- **Actions:**
  - **Edit:** Modify plate or notes after order completion (quick modal).
  - **Delete:** Trash icon; requires PIN "522" entry + confirmation (becomes visible/red for 60 seconds after PIN unlock).

- **Pagination:**
  - Initial load: 20 orders, show "Load more (50)" button if available.
  - Fetch older orders ending before oldest timestamp; append to list.
  - Stop when no more older orders exist.

- **Daily Summary Modal** (Clickable date separator):
  - Shows: total orders, total revenue, breakdown by payment method.
  - Modal is PIN-locked; user must enter "522" to view revenue details.

#### 4.4.4 Archive (Admin Feature, PIN-Locked)
- 2 buttons: "Archive >30 days old", "Archive >90 days old".
- When clicked:
  1. Prompt for PIN "522".
  2. Confirm: "Are you sure? This will move old orders to archive."
  3. Query `orders/` for entries with `completedAt ≤ (now - days * 24h)`.
  4. Move to `orders-archive/` (set ID), delete from `orders/` (set to null).
  5. Limit per run: 500 entries (safety; prevents massive transaction).
  6. Alert: "Archived N orders" or "No old orders to archive".

#### 4.4.5 Weekly Breakeven
- Shows weekly revenue target (default 100 BHD).
- Input field (editable): target amount.
- Shows current week's total revenue (from completed orders).
- Progress bar (% of target).
- Warning: bar turns yellow if < 50% progress.

---

### 4.5 Settings Panel

**Purpose:** Language, theme, sound/vibration, weekly target.

**Options:**
1. **Language:** Toggle between "العربية" (Arabic) and "English".
   - On switch: update `settings/lang` in DB.
   - LangProvider listens and updates UI.
   - Use try-catch to prevent white screen on network error.

2. **Theme:** Dark mode toggle.
   - Updates `settings/darkMode` in DB.
   - Apply CSS class `dark` to `<html>` element.

3. **Weekly Target (BHD):** Input field, "Save" button.
   - Updates `stats/breakeven/target`.

4. **Alerts:**
   - **Sound:** Checkbox; controls `settings/alerts.sound` (default true).
   - **Vibrate:** Checkbox; controls `settings/alerts.vibrate` (default true).

---

### 4.6 Real-Time Alerts

**Purpose:** Notify staff of new orders, completions, and other events.

**Mechanism:**
- `AlertsListener` component subscribes to alerts in DB (or uses in-app event bus).
- On alert trigger:
  1. Play `/beep.mp3` (if sound enabled).
  2. Vibrate device (if vibrate enabled).
  3. Show transient toast/snackbar (auto-dismiss after 3 seconds).

**Alert Types:**
- "new_order": Order sent to preparation.
- "ready": Order marked ready for payment.
- "completed": Order completed and paid.
- "thermos_low": Thermos level ≤ 30%.

---

## 5. MOBILE OPTIMIZATION & OFFLINE SUPPORT

### 5.1 Mobile UI Constraints
- **Viewport:** Responsive (320px–480px width on phones).
- **Touch Targets:** Buttons ≥48px × 48px.
- **Spacing:** Increased gap between sections (12px–16px) for comfortable right-hand tapping.
- **Keyboard:** 
  - Numeric input for plates/quantities (inputMode="numeric").
  - Text input for notes (inputMode="text").
  - Avoid keyboard-blocking modals on small screens.
- **Fonts:** Base 16px on mobile, scale up on tablet (≥768px).
- **Virtualization:** All lists >20 items must use react-window VariableSizeList.

### 5.2 Memory Management (Critical for 4GB RAM Phones)
- **Never auto-load large datasets** on page load (use manual "Refresh" buttons).
- **Pagination:** Load 20 items per page; "Load more" fetches next 20.
- **Virtualization:** Render only visible rows + 6-row overscan buffer.
- **Images/Icons:** Lazy load; use SVG for small icons (no heavy PNG/JPEG).
- **Session Storage:** Use sessionStorage for temp cart data (survives page refresh, clears on browser close).

### 5.3 Offline Support (Phase 2, Optional but Recommended)
- Store pending orders in localStorage/IndexedDB.
- Mark orders with `isOfflineOrder: true` and `syncedAt: null`.
- When offline → show UI badge "🔴 Offline" in header.
- On reconnect → auto-sync pending orders to `orders/`.
- Sync logic: retry with exponential backoff; alert if sync fails after 5 retries.

---

## 6. ERROR HANDLING & STATE MANAGEMENT

### 6.1 Critical Error Scenarios

| Scenario | Handling |
|----------|----------|
| Firebase write fails (network timeout) | Show toast "Failed to save. Retrying..."; retry in 2s. After 3 retries, show alert. |
| Database read returns null | Treat as empty; show "No data" message (not error). |
| Payment modal closes without selection | Reset payOpen state; orders remain in "ready" status. |
| Language switch fails | Catch error; show alert "Language switch failed"; keep current language. |
| Thermos transaction conflict | Firebase handles auto-retry; if final fail, alert "Thermos update failed". |
| Ready button stuck (Firebase slow) | Show ⏳ hourglass icon; disable button; timeout after 10s → alert "Request timed out". |

### 6.2 State Management Best Practices
- **Use `useCallback` for event handlers** to avoid re-renders.
- **Use `useMemo` for expensive computations** (filtering logs, building flat items for virtualization).
- **Use `useRef` for non-state values** (audio context, old timestamp for pagination).
- **Avoid prop drilling** → use React Context for LangProvider, ThemeProvider if needed.
- **Keep state local** to each component; only lift state when multiple children need it.

---

## 7. DEPLOYMENT & MONITORING

### 7.1 Build & Deployment
```bash
npm run build          # Compiles TypeScript + Vite bundling
firebase deploy        # Deploys to Firebase Hosting (karak-pos-v4.web.app)
```

### 7.2 Performance Monitoring
- Use Lighthouse CI to track Core Web Vitals:
  - LCP (Largest Contentful Paint): <2.5s
  - FID (First Input Delay): <100ms
  - CLS (Cumulative Layout Shift): <0.1
- Monitor Firebase Realtime Database rules & quotas (free tier: 100 concurrent connections).

### 7.3 Testing Checklist
- **Mobile (4GB RAM, Chrome):**
  - [ ] App loads in <2s with no auto-data fetch.
  - [ ] Clicking "Refresh" loads 20 orders in <1s.
  - [ ] Scrolling virtualized list is smooth (60fps).
  - [ ] Language toggle works without white screen.
  - [ ] "Ready" button shows ⏳ and responds within 2s.

- **Desktop (Chrome 120+):**
  - [ ] All features load without UI freeze.
  - [ ] 2000+ orders in virtualized list render smoothly.
  - [ ] Network throttling (3G) doesn't break order entry.

- **Firebase:**
  - [ ] Thermos transactions don't conflict.
  - [ ] Loyalty counts increment correctly (1 per shift, not per payment).
  - [ ] Completed orders don't duplicate on re-render.

---

## 8. V4 → V5 MIGRATION ISSUES & SOLUTIONS

### Issue 1: Mobile Freeze on Dashboard Load
**Root Cause:** Auto-subscription to `orders/` with no limit; 500+ orders load into memory simultaneously.  
**V5 Solution:**
- Remove all `onValue` subscriptions from completed orders.
- Replace with manual `get()` queries.
- Default page size: 20 (not 50 or 300).
- Add explicit "Refresh" button; never auto-load.

### Issue 2: "Ready" Button Stuck (No Feedback)
**Root Cause:** Button has no disabled state; slow Firebase write makes it appear frozen.  
**V5 Solution:**
- Add `processingReady` state per order ID.
- Show ⏳ hourglass while processing.
- Disable button; add 10s timeout → alert if no response.
- Use try-catch in markReady() with error alert.

### Issue 3: Language Switch White Screen
**Root Cause:** Unhandled error in DB write; no error boundary.  
**V5 Solution:**
- Wrap setLang() in try-catch.
- Show error alert instead of crashing.
- Keep current language if switch fails.

### Issue 4: Incomplete Virtualization
**Root Cause:** Virtualization added but flattened items array rebuilt on every render.  
**V5 Solution:**
- Wrap flatItems build in `useMemo()`.
- Use ResizeObserver for container width (avoid layout thrashing).
- Test with 2000+ orders; aim for <100ms render time.

---

## 9. HANDOFF CHECKLIST FOR V5 DEVELOPMENT

**Before coding:**
- [ ] Review this entire spec with team.
- [ ] Confirm Firebase Realtime Database structure matches schema in Section 3.
- [ ] Confirm pricing table and cup-size ML mapping in `pricing.ts`.
- [ ] Confirm PIN "522" is acceptable security model (or replace with better auth if required).

**During development:**
- [ ] Build one section at a time (Order Entry → Kanban → Dashboard → Settings).
- [ ] Test on mobile (real device, 4GB RAM) after each section.
- [ ] Use React DevTools to monitor re-renders; fix unnecessary renders with useMemo/useCallback.
- [ ] Use Firebase Emulator locally to avoid hitting production database during dev.

**Before launch:**
- [ ] Run full test checklist (Section 7.3).
- [ ] Verify all Arabic/English text is correct (no hardcoded English in Arabic UI).
- [ ] Archive old test orders from production (clean data).
- [ ] Brief staff on new UI/workflow changes.

---

## 10. APPENDICES

### A. Pricing Table
```typescript
const PRICES: Record<string, number> = {
  'Karak': 0.300,
  'Almohib': 0.400,
  'Red Tea': 0.200,
  'Lemon': 0.200,
  'Cold Drink': 0.150,
  'Sweets-Small': 0.200,
  'Sweets-Medium': 0.500,
  'Sweets-Large': 1.000,
}

const CUP_SIZES_ML: Record<string, number> = {
  'Paper Cup': 200,
  'Glass Small': 175,
  'Glass Large': 210,
  'Thermos': 0, // Special: track separately
}
```

### B. Shift Date Key Logic
```typescript
function getShiftDateKey(timestamp: number): string {
  const d = new Date(timestamp)
  const hour = d.getHours()
  // Before 5 AM = previous day's shift (night shift ends at ~1 AM)
  if (hour < 5) {
    d.setDate(d.getDate() - 1)
  }
  return d.toISOString().split('T')[0] // "YYYY-MM-DD"
}
```

### C. Thermos Decrement on Ready
```typescript
async function markReady(item: OrderRow) {
  // Update status
  await update(ref(db, `orders/${item.id}`), { status: 'ready' })
  
  // Decrement thermos for hot drinks (not Lemon)
  const hotDrinks = ['Karak', 'Almohib', 'Red Tea']
  if (hotDrinks.includes(item.drinkType || '')) {
    const cupSizeML = CUP_SIZES_ML[item.cupType] || 0
    const totalDecrease = cupSizeML * (item.quantity || 1)
    
    let key = 'otherTeas'
    if (item.drinkType === 'Karak') key = 'karak'
    if (item.drinkType === 'Almohib') key = 'almohib'
    
    await runTransaction(ref(db, `stats/thermos/${key}`), (cur) => {
      const newLevel = Math.max(0, (cur?.currentLevel_ml || 0) - totalDecrease)
      return { ...cur, currentLevel_ml: newLevel }
    })
  }
}
```

### D. Mobile Breakpoints (CSS)
```css
/* Base: 320px–479px (phone) */
.btn { padding: 10px 16px; font-size: 16px; }
.section-title { font-size: 18px; }

/* Tablet: 480px–767px */
@media (min-width: 480px) {
  .btn { padding: 12px 20px; font-size: 16px; }
}

/* Desktop: 768px+ */
@media (min-width: 768px) {
  .btn { padding: 12px 24px; font-size: 14px; }
  .section-title { font-size: 20px; }
}
```

---

## 11. SUMMARY OF KEY V5 IMPROVEMENTS

1. **No Auto-Load Dashboard:** Manual "Refresh" button prevents mobile freeze on page load.
2. **Pagination by Default:** Load 20 orders, "Load more" for next 20 (vs. 300 auto-load).
3. **Button Feedback:** "Ready" button shows ⏳ while processing; clear disabled state.
4. **Error Handling:** Try-catch on all DB writes; no silent failures.
5. **Virtualization Complete:** VariableSizeList with useMemo for flattened items; smooth 2000+ order rendering.
6. **Offline-Ready (Phase 2):** localStorage queue for orders created offline; sync on reconnect.
7. **Mobile-First Design:** 48px buttons, RTL layout, numeric keyboards, reduced initial payload.
8. **Monitoring:** Performance tracking via Lighthouse CI; Firebase quota monitoring.

---

**End of Specification**

---

**Document Author:** GitHub Copilot (AI Assistant)  
**Created:** November 24, 2025  
**Status:** Ready for V5 Development  
**Revision History:**
- v1.0: Initial comprehensive spec based on V4 issues and requirements.

