# NIA Antigravity — Subscription Intelligence Dashboard

## Overview
Internal analytics dashboard for Niveshaay Investment Advisors. Processes a raw subscriber Excel export and generates 14 analytics tabs covering subscriber movement, AUM, unsubscriber analysis, product performance, retention, renewals, discounts, geography, broker performance, and AI insights.

## Stack
- React 18 + Vite 5
- Recharts 2.x (all charts)
- xlsx (Excel parsing)
- lucide-react (icons)
- IndexedDB for data persistence (survives logout)
- localStorage for auth token only

## Theme
Bloomberg Terminal dark — `#040914` void, `#00d4ff` cyan, `#fbbf24` gold. CSS variables defined in `src/index.css`.

## How to Run

**Step 1 — Start backend (required first)**
```
backend\start_backend.bat   ← starts FastAPI on http://localhost:8000
```

**Step 2 — Start frontend**
```
start_dashboard.bat         ← starts Vite on http://localhost:5173
```

Or: `npm run dev` inside `Analyser/`.

## Login Credentials
Stored in PostgreSQL (bcrypt-hashed). No hardcoded passwords.
First-run setup: copy `backend/.env.example` → `backend/.env`, fill in values, then run `python backend/setup_db.py`.

## Roles
| Role       | Upload | All Tabs | Audit Logs | User Management |
|---|---|---|---|---|
| admin      | ✅ | ✅ | ✅ | ✅ |
| operations | ✅ | ✅ | ❌ | ❌ |
| editor     | ✅ | ✅ | ❌ | ❌ |
| viewer     | ❌ | ✅ | ❌ | ❌ |

## Project Structure
```
src/
  dataEngine.js        ← ALL business logic and data functions
  App.jsx              ← Auth, routing, tab layout, global state
  storage.js           ← IndexedDB read/write helpers
  index.css            ← Global styles and Bloomberg theme vars
  tabs/
    Tab01_Executive.jsx
    Tab02_AUMSummary.jsx   (id: aumsummary)
    Tab03_Unsubscriber.jsx (id: unsub)
    Tab04_Movement.jsx     (id: movement)
    Tab05_Product.jsx      (id: product)
    Tab06_Retention.jsx    (id: retention)
    Tab07_Renewal.jsx      (id: renewal)
    Tab08_Discount.jsx     (id: discount)
    Tab09_Investor.jsx     (id: investor)
    Tab10_Broker.jsx       (id: broker)
    Tab11_Geography.jsx    (id: geo)
    Tab12_Cancellation.jsx (id: cancel)
    Tab13_Migration.jsx    (id: migration)
    Tab14_Insights.jsx     (id: insights)
  components/
    KPICard.jsx
    ChartCard.jsx
    InsightsPanel.jsx
```
> Note: File names use old numbering (Tab01–Tab13) but TABS array in App.jsx controls the display order and numbering shown in the UI. The logical id (e.g. `unsub`, `aumsummary`) is the source of truth.

## Core Deduplication Logic
**Primary key: Email + Scid** (unique client per smallcase).  
Fallback: PAN + Smallcase Name (when email or scid is missing).

For the **current subscription master** (`buildCurrentSubscriptionMaster`):
- Keep highest Cycle Number per key
- Tiebreak: latest First Subscription Date (handles plan-duration duplicate rows)
- Excludes: private smallcases (`/private/i`), `REQUESTED_ACCESS` status

For **historical cycle counts** (`totalSubCycles`, `completedCycles`):
- Deduplicate by Email+Scid+Cycle
- Tiebreak: latest First Subscription Date

## Status Definitions
| Label | Values |
|---|---|
| Active | `SUBSCRIBED`, `GRACE PERIOD`, `GRACE_PERIOD`, `SUBSCRIBED_USER_CANCELLED` |
| Exited | `Cycle Level Status = UNSUBSCRIBED` (NOT Latest Subscription Status) |
| Excluded | `Latest Subscription Status = REQUESTED_ACCESS` |
| Excluded | Any `Smallcase Name` matching `/private/i` |

## Exit / Movement Rules
- **Exit date** for all movement calculations: `Cycle End Date` column (NOT `Exit Date`)
- **New Unique MTD**: Subscription Start Date in current month AND Cycle Number ≤ 1
- **Renewals MTD**: Subscription Start Date in current month AND Cycle Number > 1
- **Retention Rate**: `(opening − exitedMTD) / opening × 100`
  - `opening = activeSubs - (newUnique + renewals) + exitedMTD`

## Key Column Mappings (CANONICAL in dataEngine.js)
Important aliases handled automatically during normalization:
- `Cycle End Date` ← "cycle end date", "subscription end date"
- `Scid` ← "scid", "sc id", "smallcase id", "sc_id"
- `First Subscription Date` ← "first subs date", "first sub date"
- `Total PnL` ← "total pnl", "pnl", "total p&l", "p&l"
- `AUM` ← "aum", "assets under management"

## AUM & Summary Tab (Tab 02)
Computed from rawData via `getAUMSummaryTimeline(rawData)` — no second Excel sheet required.
Each row = one calendar month. Active subscriber count uses the same Email+Scid dedup snapshot as of month-end.

## Unsubscriber Analysis Tab (Tab 03)
Computed via `getUnsubscriberAnalysis(rawData)`.
Shows all completed exit cycles (UNSUBSCRIBED Cycle Level Status), deduplicated by Email+Scid+Cycle.
Win-back = Email+Scid that has at least one exit cycle AND currently has an active Latest Subscription Status.

## Data Persistence
- On file upload: `saveToStorage(rows, fileName)` → POST `/data/upload` → PostgreSQL (JSONB)
- On page load: `loadFromStorage()` → GET `/data/latest` → returns active session rows
- Logout clears JWT from localStorage; **no subscriber data on the client device**
- Data only lives in PostgreSQL — IndexedDB is no longer used

## Backend Structure
```
backend/
  app/
    main.py        ← FastAPI app, CORS, GZip, rate limiting
    config.py      ← reads from backend/.env
    database.py    ← SQLAlchemy engine
    models.py      ← User, UploadSession, UploadData, AuditLog
    schemas.py     ← Pydantic request/response models
    auth.py        ← JWT, bcrypt, RBAC dependency factory
    routers/
      auth.py      ← POST /auth/login, /logout, GET /auth/me
      data.py      ← POST /data/upload, GET /data/latest
      audit.py     ← GET /audit/logs (admin only)
      admin.py     ← CRUD /admin/users (admin only)
  setup_db.py      ← first-run: creates tables + admin user
  backup.py        ← pg_dump daily backup (schedule via Task Scheduler)
  start_backend.bat
  requirements.txt
  .env             ← DATABASE_URL, SECRET_KEY, etc. (never commit)

## Adding a New Tab
1. Create `src/tabs/TabXX_Name.jsx` (receives props from `tabProps` in App.jsx)
2. Add lazy import in App.jsx
3. Add `id: ComponentRef` to `TAB_COMPONENTS`
4. Add entry to `TABS` array with id, num, label, icon
5. If new data needed: add function to `dataEngine.js`, compute in `baseData` or `derived` useMemo, add to `tabProps`
6. Pass `unsubData`, `summaryData`, and other computed props via `tabProps`

## Formatting Helpers (exported from dataEngine.js)
| Function | Use case |
|---|---|
| `formatExact(n)` | Exact integer with Indian commas — for KPI cards |
| `formatCurrencyExact(n)` | Exact ₹ amount with Indian commas |
| `formatCrores(n)` | ₹X.XX Cr format for large AUM values |
| `formatCurrency(n, short)` | Short form (1.2L, 3.4Cr) for chart labels |
| `formatNumber(n)` | Short form numbers for chart labels |
