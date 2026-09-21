import * as XLSX from 'xlsx';

// ─── COLUMN NORMALIZATION MAP ─────────────────────────────────────────────────
const CANONICAL = {
  'user name': 'User Name', 'name': 'User Name',
  'email': 'Email',
  'pan': 'PAN',
  'state': 'State',
  'broker name': 'Broker Name', 'broker': 'Broker Name',
  'attribution source': 'Attribution Source', 'attribution': 'Attribution Source', 'source': 'Attribution Source', 'utm source': 'Attribution Source',
  'risk profile': 'Risk Profile', 'risk': 'Risk Profile',
  'rm email': 'RM Email', 'rm': 'RM Email',
  'smallcase name': 'Smallcase Name', 'smallcase': 'Smallcase Name', 'product': 'Smallcase Name', 'product name': 'Smallcase Name',
  'plan type': 'Plan Type',
  'plan duration': 'Plan Duration',
  'plan amount': 'Plan Amount', 'amount': 'Plan Amount',
  'offer code': 'Offer Code', 'promo code': 'Offer Code', 'coupon': 'Offer Code',
  'offer discount': 'Offer Discount', 'discount': 'Offer Discount', 'discount amount': 'Offer Discount',
  'investment status': 'Investment Status',
  'invested date': 'Invested Date',
  'subscription start date': 'Subscription Start Date', 'start date': 'Subscription Start Date', 'sub start date': 'Subscription Start Date',
  'exit date': 'Exit Date', 'end date': 'Exit Date', 'unsubscribe date': 'Exit Date',
  'networth': 'Networth', 'net worth': 'Networth', 'net_worth': 'Networth',
  'total pnl': 'Total PnL', 'totalpnl': 'Total PnL', 'pnl': 'Total PnL', 'total p&l': 'Total PnL', 'p&l': 'Total PnL',
  'total pl': 'Total PnL', 'total profit & loss': 'Total PnL', 'total profit and loss': 'Total PnL',
  'payment method': 'Payment Method',
  'payment gateway': 'Payment Gateway',
  'cycle number': 'Cycle Number', 'cycle': 'Cycle Number', 'cycle no': 'Cycle Number',
  'cycle level status': 'Cycle Level Status', 'cycle status': 'Cycle Level Status',
  'cycle end date': 'Cycle End Date', 'subscription end date': 'Cycle End Date',
  'cancellation reason': 'Cancellation Reason', 'cancel reason': 'Cancellation Reason',
  'first subscription date': 'First Subscription Date', 'first sub date': 'First Subscription Date',
  'latest subscription status': 'Latest Subscription Status', 'subscription status': 'Latest Subscription Status', 'status': 'Latest Subscription Status',
  'latest cycle flag': 'Latest Cycle Flag', 'is latest cycle': 'Latest Cycle Flag',
  'scid': 'Scid', 'sc id': 'Scid', 'smallcase id': 'Scid', 'sc_id': 'Scid',
  'first subs date': 'First Subscription Date', 'first sub date': 'First Subscription Date',
  'aum': 'AUM', 'assets under management': 'AUM',
  'total active subscriptions': 'Total Active Subscriptions', 'active subscriptions': 'Total Active Subscriptions',
  'total investors': 'Total Investors', 'investors': 'Total Investors',
  'new subscriptions': 'New Subscriptions',
  'total completed subscription cycles': 'Completed Cycles', 'total completed cycles': 'Completed Cycles', 'completed subscription cycles': 'Completed Cycles',
  'total subscription cycles': 'Total Subscription Cycles', 'subscription cycles': 'Total Subscription Cycles',
  'new signups': 'New Signups',
  'total signups': 'Total Signups',
};

// ─── PRIVATE SMALLCASE FILTER ─────────────────────────────────────────────────
// Any Smallcase Name containing "private" (case-insensitive) is excluded from ALL calculations
export const PRIVATE_PATTERN = /private/i;
export function isPrivateSmallcase(name) {
  if (!name) return true;
  return PRIVATE_PATTERN.test(String(name).trim());
}
function filterNonPrivate(rows) {
  return rows.filter(r => !isPrivateSmallcase(r['Smallcase Name']));
}

// ─── ACTIVE / EXITED STATUS DEFINITIONS ──────────────────────────────────────
// Active: Subscribed, Grace Period, or Subscribed_User_Cancelled (still within period)
// Exited: Only Unsubscribed
const ACTIVE_STATUSES = new Set([
  'SUBSCRIBED', 'GRACE PERIOD', 'GRACE_PERIOD', 'SUBSCRIBED_USER_CANCELLED',
]);

export const isActive = (r) => ACTIVE_STATUSES.has(String(r['Latest Subscription Status'] || '').toUpperCase());
export const isExited = (r) => String(r['Cycle Level Status'] || '').trim().toUpperCase() === 'UNSUBSCRIBED';

// ─── HELPERS ──────────────────────────────────────────────────────────────────
export function parseExcelDate(val) {
  if (!val && val !== 0) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'number') {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === 'string') {
    const s = val.trim();
    if (!s) return null;
    let d = new Date(s);
    if (!isNaN(d.getTime())) return d;
    const parts = s.split(/[-/.]/);
    if (parts.length === 3) {
      const y = parts[2].length === 4 ? parts[2] : `20${parts[2]}`;
      d = new Date(`${y}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`);
      if (!isNaN(d.getTime())) return d;
    }
  }
  return null;
}

function avg(arr) {
  const v = arr.filter(n => typeof n === 'number' && !isNaN(n));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}
function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length ? (s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2) : 0;
}

export function formatCurrency(val, short = false) {
  if (!val && val !== 0) return '₹0';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (short) {
    if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(1)}Cr`;
    if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(1)}L`;
    if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(0)}K`;
  }
  return `${sign}₹${abs.toLocaleString('en-IN')}`;
}
export function formatNumber(val) {
  if (!val && val !== 0) return '0';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 10000000) return `${sign}${(abs / 10000000).toFixed(1)}Cr`;
  if (abs >= 100000) return `${sign}${(abs / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1)}K`;
  return val.toLocaleString('en-IN');
}

// Exact number with Indian comma formatting — for KPI cards
export function formatExact(val) {
  if (!val && val !== 0) return '0';
  return Math.round(val).toLocaleString('en-IN');
}

// Exact currency with Indian comma formatting — for KPI cards
export function formatCurrencyExact(val) {
  if (!val && val !== 0) return '₹0';
  const sign = val < 0 ? '-' : '';
  return `${sign}₹${Math.abs(Math.round(val)).toLocaleString('en-IN')}`;
}

// AUM / large values in Crores (e.g. ₹1,234.56 Cr)
export function formatCrores(val) {
  if (!val && val !== 0) return '₹0 Cr';
  const cr = val / 10_000_000;
  const formatted = cr >= 100
    ? Math.round(cr).toLocaleString('en-IN')
    : (Math.round(cr * 100) / 100).toFixed(2);
  return `₹${formatted} Cr`;
}

// ─── DEDUPLICATE BY PAN (keep highest-cycle row per unique investor) ──────────
// Converts a per-subscription-row array into one row per unique investor.
// When a person holds N products, only their highest-Cycle-Number row survives.
function deduplicateByPAN(rows) {
  const panMap = new Map();
  for (const r of rows) {
    const pan = String(r['PAN'] || '').trim().toUpperCase();
    if (!pan) continue;
    const cycle = Number(r['Cycle Number']) || 0;
    const ex = panMap.get(pan);
    if (!ex || cycle > (Number(ex['Cycle Number']) || 0)) panMap.set(pan, r);
  }
  return [...panMap.values()];
}

// ─── NORMALIZE RAW DATA (cached per array reference) ─────────────────────────
const normalizeCache = new WeakMap();
export function normalizeData(rawData) {
  if (normalizeCache.has(rawData)) return normalizeCache.get(rawData);
  if (!rawData.length) return [];
  const sample = rawData[0];
  const keyMap = {};
  for (const k of Object.keys(sample)) keyMap[k.toLowerCase().trim()] = k;
  // Log unmapped columns so column-name issues are visible in browser console
  const unmapped = Object.keys(keyMap).filter(lk => !CANONICAL[lk]);
  if (unmapped.length) console.info('[NIA columns] unmapped (kept as-is):', unmapped);
  const mapped = Object.keys(keyMap).filter(lk => CANONICAL[lk]);
  console.info('[NIA columns] mapped:', mapped.map(lk => `"${keyMap[lk]}" → "${CANONICAL[lk]}"`));
  const result = rawData.map(row => {
    const n = {};
    for (const [lk, origK] of Object.entries(keyMap)) {
      n[CANONICAL[lk] || origK] = row[origK];
    }
    return n;
  });
  normalizeCache.set(rawData, result);
  return result;
}

// ─── ROW IDENTITY KEY ─────────────────────────────────────────────────────────
// Same investor-product-cycle identity used throughout this file (Email+Scid,
// falling back to PAN+Smallcase, plus Cycle Number) — the unique key for "is
// this the same subscription cycle record." Used by mergeUploadedData below to
// tell a genuinely new/updated row apart from one that already exists.
export function getRowKey(row) {
  const email = String(row['Email'] || '').trim().toLowerCase();
  const scid  = String(row['Scid']  || '').trim();
  const pan   = String(row['PAN']   || '').trim().toUpperCase();
  const sc    = String(row['Smallcase Name'] || '').trim();
  const bk    = (email && scid) ? `${email}|||${scid}` : `${pan}|||${sc}`;
  const cycle = Number(row['Cycle Number']) || 0;
  return `${bk}|||${cycle}`;
}

// ─── MERGE A NEW UPLOAD WITH THE EXISTING DATASET ─────────────────────────────
// A re-upload is often a partial/latest-only export, not the full history —
// naively replacing oldRawData with newRawData would silently delete every
// subscription row missing from the new file. Instead: normalize both sides,
// keep every new-upload row as-is (it wins on overlap — it's the freshest
// data for that subscription cycle), and append any old row whose identity
// key doesn't appear anywhere in the new upload, so it never gets lost.
export function mergeUploadedData(oldRawData, newRawData) {
  if (!oldRawData?.length) return newRawData;
  if (!newRawData?.length) return oldRawData;

  const oldNorm = normalizeData(oldRawData);
  const newNorm = normalizeData(newRawData);

  const newKeys = new Set(newNorm.map(getRowKey));
  const missingFromNew = oldNorm.filter(r => !newKeys.has(getRowKey(r)));

  return [...newNorm, ...missingFromNew];
}

// ─── BUILD CURRENT SUBSCRIPTION MASTER ───────────────────────────────────────
// Dedup: Email+Scid (unique client per smallcase) → highest Cycle# → latest First Subscription Date
// Both active and unsubscribed included. Excludes private smallcases and Requested Access.
export function buildCurrentSubscriptionMaster(rawData) {
  const data = normalizeData(rawData);
  const map = new Map();
  for (const row of data) {
    const sc = String(row['Smallcase Name'] || '').trim();
    if (isPrivateSmallcase(sc)) continue;
    const latestStatus = String(row['Latest Subscription Status'] || '').trim().toUpperCase().replace(/ /g, '_');
    if (latestStatus === 'REQUESTED_ACCESS') continue;

    // Primary key: Email + Scid. Fall back to PAN + Smallcase Name if either is absent.
    const email = String(row['Email'] || '').trim().toLowerCase();
    const scid = String(row['Scid'] || '').trim();
    const pan = String(row.PAN || '').trim().toUpperCase();
    const key = (email && scid) ? `${email}|||${scid}` : `${pan}|||${sc}`;
    if (!key || key === '|||') continue;

    const existing = map.get(key);
    if (!existing) { map.set(key, row); continue; }

    // Keep highest Cycle Number
    const rowCycle = Number(row['Cycle Number']) || 0;
    const exCycle = Number(existing['Cycle Number']) || 0;
    if (rowCycle > exCycle) { map.set(key, row); continue; }
    if (exCycle > rowCycle) continue;

    // Tiebreak: latest First Subscription Date wins (handles plan-duration duplicates)
    const rowDate = parseExcelDate(row['First Subscription Date'] || row['Subscription Start Date']);
    const exDate = parseExcelDate(existing['First Subscription Date'] || existing['Subscription Start Date']);
    if (rowDate && exDate && rowDate > exDate) map.set(key, row);
  }
  return Array.from(map.values());
}

// ─── FILTER OPTIONS ───────────────────────────────────────────────────────────
export function getFilterOptions(currentMaster) {
  const uniq = (arr) => [...new Set(arr.filter(Boolean).map(s => String(s).trim()))].filter(s => s).sort();
  return {
    smallcase: uniq(currentMaster.map(r => r['Smallcase Name'])),
    state: uniq(currentMaster.map(r => r['State'])),
    broker: uniq(currentMaster.map(r => r['Broker Name'])),
    attribution: uniq(currentMaster.map(r => r['Attribution Source'])),
    riskProfile: uniq(currentMaster.map(r => r['Risk Profile'])),
    planType: uniq(currentMaster.map(r => r['Plan Type'])),
    status: uniq(currentMaster.map(r => r['Latest Subscription Status'])),
  };
}

// ─── FILTER RAW DATA BY DATE ──────────────────────────────────────────────────
function toEndOfDay(d) {
  const e = new Date(d); e.setHours(23, 59, 59, 999); return e;
}
function inRange(d, from, to) {
  return d && (!from || d >= from) && (!to || d <= to);
}

const DIMENSION_KEYS = [
  ['smallcase', 'Smallcase Name'], ['state', 'State'], ['broker', 'Broker Name'],
  ['attribution', 'Attribution Source'], ['riskProfile', 'Risk Profile'],
  ['planType', 'Plan Type'], ['status', 'Latest Subscription Status'],
];

function hasDimensionFilters(filters) {
  return DIMENSION_KEYS.some(([key]) => filters?.[key]?.length);
}

function matchesDimensionFilters(row, filters) {
  if (!filters) return true;
  return DIMENSION_KEYS.every(([key, field]) =>
    !filters[key]?.length || filters[key].includes(String(row[field] || '').trim())
  );
}

// Scope a row to the selected period only — not "still relevant today":
// - Still-active rows count by when their current cycle STARTED.
// - Exited (UNSUBSCRIBED) rows count by when they EXITED (Cycle End Date),
//   same logic already used for the Movement table's month-by-month Eligible/
//   Renewed cohort. A long-tenured investor who neither started nor exited
//   within the window will correctly NOT appear — that's the point: picking
//   a period means "data for that period only," period.
function matchesPeriod(row, from, to) {
  const toAdj = to ? toEndOfDay(to) : null;
  const isUnsub = String(row['Cycle Level Status'] || '').trim().toUpperCase() === 'UNSUBSCRIBED';
  if (isUnsub) {
    const end = parseExcelDate(row['Cycle End Date'] || row['Exit Date']);
    return inRange(end, from, toAdj);
  }
  const start = parseExcelDate(row['Subscription Start Date']);
  return inRange(start, from, toAdj);
}

export function filterRawByDate(rawData, filters) {
  const normalized = normalizeData(rawData);
  if (!filters?.dateFrom && !filters?.dateTo && !hasDimensionFilters(filters)) return normalized;
  const from = filters?.dateFrom || null;
  const to   = filters?.dateTo || null;
  return normalized.filter(row => {
    if (!matchesDimensionFilters(row, filters)) return false;
    if (!from && !to) return true;
    return matchesPeriod(row, from, to);
  });
}

// Unsubscriber analysis: include row only if exit date falls in range
export function filterRawByExitDate(rawData, filters) {
  if (!filters?.dateFrom && !filters?.dateTo) return rawData;
  const normalized = normalizeData(rawData);
  const from = filters.dateFrom || null;
  const to   = filters.dateTo ? toEndOfDay(filters.dateTo) : null;
  return normalized.filter(row => {
    if (String(row['Cycle Level Status'] || '').trim().toUpperCase() !== 'UNSUBSCRIBED') return false;
    const exitD = parseExcelDate(row['Exit Date']) || parseExcelDate(row['Cycle End Date']);
    return inRange(exitD, from, to);
  });
}

// ─── APPLY FILTERS ────────────────────────────────────────────────────────────
// Same semantics as filterRawByDate — see matchesPeriod above.
export function applyFilters(data, filters) {
  if (!filters) return data;
  return data.filter(row => {
    if (!matchesDimensionFilters(row, filters)) return false;
    if (!filters.dateFrom && !filters.dateTo) return true;
    return matchesPeriod(row, filters.dateFrom || null, filters.dateTo || null);
  });
}

// ─── LATEST ACTIVITY DATE ─────────────────────────────────────────────────────
// The most recent date actually present in the data — used as the anchor for
// every "current month" / "MTD" / "as of" calculation instead of today's real
// calendar date. If the uploaded file's newest row is from three weeks ago,
// anchoring to real "now" makes every MTD-style figure read as 0 (nothing has
// happened yet in a month with no data at all), which then cascades into
// nonsense like a Retention Rate formula collapsing to a meaningless 100%, or
// a "current month" bucket in a monthly series being empty. Anchoring to the
// data's own latest activity means "this month" always refers to the most
// recent month the data can actually speak to.
export function getLatestActivityDate(rawData) {
  const normalized = filterNonPrivate(normalizeData(rawData));
  const realNow = new Date();
  let latestDataDate = null;
  for (const r of normalized) {
    // Subscription Start Date is always a real past event. Cycle End Date is
    // only a real past event for rows that have actually UNSUBSCRIBED — for
    // a still-active row it's the future renewal-due date (e.g. a 1-year
    // plan bought this month legitimately ends next year), so including it
    // unconditionally would push "latest date" into the future and silently
    // fall back to the real clock, defeating this whole anchor.
    const s = parseExcelDate(r['Subscription Start Date']);
    if (s && s <= realNow && (!latestDataDate || s > latestDataDate)) latestDataDate = s;
    if (String(r['Cycle Level Status'] || '').trim().toUpperCase() === 'UNSUBSCRIBED') {
      const e = parseExcelDate(r['Cycle End Date']);
      if (e && e <= realNow && (!latestDataDate || e > latestDataDate)) latestDataDate = e;
    }
  }
  return latestDataDate || realNow;
}

// ─── SUMMARY KPIs ─────────────────────────────────────────────────────────────
// currentMaster = deduplicated, private-SC-excluded, filter-applied dataset
// rawData = original file rows (used only for MTD counts)
export function getSummaryKPIs(currentMaster, rawData) {
  const normalized = filterNonPrivate(normalizeData(rawData));
  const now = getLatestActivityDate(rawData);

  // Current month window
  const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const mEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  // Previous month window (for exitedLastMonth)
  const pmStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const pmEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  const mStartT = mStart.getTime(), mEndT = mEnd.getTime();
  const pmStartT = pmStart.getTime(), pmEndT = pmEnd.getTime();

  // Active-only subset (all other metrics computed from this)
  const activeSubs = currentMaster.filter(isActive);

  const uniquePANs = new Set(currentMaster.map(r => String(r.PAN || '').trim().toUpperCase()).filter(Boolean));
  const uniqueActivePANs = new Set(activeSubs.map(r => String(r.PAN || '').trim().toUpperCase()).filter(Boolean));

  // MTD counts as unique investors (PANs), not subscription rows
  const newMTD_PANs = new Set(), renewalMTD_PANs = new Set(), exitedMTD_PANs = new Set(), exitedLM_PANs = new Set();
  for (const r of normalized) {
    const pan = String(r.PAN || r.Email || '').trim().toUpperCase();
    if (!pan) continue;
    const s = parseExcelDate(r['Subscription Start Date']);
    if (s) {
      const t = s.getTime();
      if (t >= mStartT && t <= mEndT) {
        const cycle = Number(r['Cycle Number']) || 0;
        if (cycle <= 1) newMTD_PANs.add(pan);
        else renewalMTD_PANs.add(pan);
      }
    }
    const cycleStatus = String(r['Cycle Level Status'] || '').trim().toUpperCase();
    if (cycleStatus === 'UNSUBSCRIBED') {
      const e = parseExcelDate(r['Cycle End Date']);
      if (e) {
        const t = e.getTime();
        // Exclude cycle transitions: if this PAN is currently active, their UNSUBSCRIBED row
        // is an old cycle that was followed by a renewal — not a real churn event.
        if (!uniqueActivePANs.has(pan)) {
          if (t >= mStartT && t <= mEndT) exitedMTD_PANs.add(pan);
          if (t >= pmStartT && t <= pmEndT) exitedLM_PANs.add(pan);
        }
      }
    }
  }
  const newUniqueMTD  = newMTD_PANs.size;
  const renewalsMTD   = renewalMTD_PANs.size;
  const exitedMTD     = exitedMTD_PANs.size;
  const exitedLastMonth = exitedLM_PANs.size;

  // Unique active PANs who have renewed (cycle > 1)
  const renewedActivePANs = new Set(
    activeSubs.filter(r => (Number(r['Cycle Number']) || 0) > 1)
      .map(r => String(r.PAN || '').trim().toUpperCase()).filter(Boolean)
  );

  // Unique active PANs on a discount
  const discountedPANs = new Set(
    activeSubs.filter(r => (Number(r['Offer Discount']) || 0) > 0)
      .map(r => String(r.PAN || '').trim().toUpperCase()).filter(Boolean)
  );

  // Deduplicate active subs by PAN — financial averages are per unique investor
  const activeSubsDeduped = deduplicateByPAN(activeSubs);

  // All financial metrics from ACTIVE subscribers (per unique investor)
  const networthArr = activeSubsDeduped.map(r => Number(r['Networth']) || 0).filter(n => n > 0);
  // Try canonical 'Total PnL' first; fall back to any key matching pnl/p&l/profit
  const pnlKey = activeSubs.length
    ? (() => {
        const keys = Object.keys(activeSubs[0]);
        if (keys.includes('Total PnL')) return 'Total PnL';
        return keys.find(k => /total.*(pnl|p&l|profit)/i.test(k)) ||
               keys.find(k => /(pnl|p&l|profit.*loss)/i.test(k)) || 'Total PnL';
      })()
    : 'Total PnL';
  console.info('[NIA] P&L key used:', pnlKey, '| sample value:', activeSubs[0]?.[pnlKey]);
  const pnlArr = activeSubsDeduped.map(r => Number(r[pnlKey]) || 0).filter(n => !isNaN(n));
  const planAmounts = activeSubsDeduped.map(r => Number(r['Plan Amount']) || 0).filter(n => n > 0);
  const discountArr = activeSubsDeduped.map(r => Number(r['Offer Discount']) || 0);

  // Products: unique non-private smallcase names
  const totalProducts = new Set(currentMaster.map(r => r['Smallcase Name']).filter(Boolean)).size;

  // AUM: if a dedicated AUM column exists, sum per-product (each product row has its own AUM).
  // If absent, fall back to Networth — Networth varies per product/basket, not one portfolio-wide
  // figure, so sum it the same way across every active row (no per-PAN dedup — that would keep
  // only one product's Networth for investors holding multiple baskets).
  const aumArr = activeSubs.map(r => Number(r['AUM']) || 0).filter(n => n > 0);
  const totalAUM = aumArr.length > 0
    ? aumArr.reduce((a, b) => a + b, 0)
    : activeSubs.reduce((s, r) => s + (Number(r['Networth']) || 0), 0);

  // Historical cycle counts — deduplicated by Email+Scid+Cycle (same logic as master but per-cycle)
  // Removes the ~1,592 plan-duration duplicate rows before counting
  const cycleDedup = new Map();
  for (const r of normalized) {
    const email = String(r['Email'] || '').trim().toLowerCase();
    const scid = String(r['Scid'] || '').trim();
    const pan = String(r.PAN || '').trim().toUpperCase();
    const sc = String(r['Smallcase Name'] || '').trim();
    const cycle = Number(r['Cycle Number']) || 0;
    const baseKey = (email && scid) ? `${email}|||${scid}` : `${pan}|||${sc}`;
    const key = `${baseKey}|||${cycle}`;
    const existing = cycleDedup.get(key);
    if (!existing) { cycleDedup.set(key, r); continue; }
    const rowDate = parseExcelDate(r['First Subscription Date'] || r['Subscription Start Date']);
    const exDate = parseExcelDate(existing['First Subscription Date'] || existing['Subscription Start Date']);
    if (rowDate && exDate && rowDate > exDate) cycleDedup.set(key, r);
  }
  const allCycles = Array.from(cycleDedup.values());
  const totalSubCycles = allCycles.length;
  const completedCycles = allCycles.filter(r =>
    String(r['Cycle Level Status'] || '').trim().toUpperCase() === 'UNSUBSCRIBED'
  ).length;

  // Total unique investors ever (including those who have since exited)
  const allHistoricalPANs = new Set(
    normalized.map(r => String(r.PAN || '').trim().toUpperCase()).filter(Boolean)
  );
  const totalSignupsEver = allHistoricalPANs.size;

  return {
    // Subscriber counts — all unique-investor (PAN) based
    totalUniqueSubscribers: uniquePANs.size,
    totalUniqueActive: uniqueActivePANs.size,
    totalSubscriptions: currentMaster.length,
    activeSubscribers: uniqueActivePANs.size,
    totalActiveSubscriptions: activeSubs.length,
    exitedSubscribers: uniquePANs.size - uniqueActivePANs.size,

    // MTD / LM movement — unique investors, not subscription rows
    newUniqueMTD,
    renewalsMTD,
    newMTD: newUniqueMTD + renewalsMTD,
    exitedMTD,
    netGrowthMTD: newUniqueMTD - exitedMTD,
    exitedLastMonth,

    // Rates (unique-investor-based)
    retentionRate: (() => {
      const opening = uniqueActivePANs.size - newUniqueMTD + exitedMTD;
      return opening > 0 ? +(((opening - exitedMTD) / opening) * 100).toFixed(1) : 0;
    })(),
    renewalRate: uniqueActivePANs.size > 0
      ? +(renewedActivePANs.size / uniqueActivePANs.size * 100).toFixed(1) : 0,

    // Financials — ACTIVE only
    totalNetworth: networthArr.reduce((a, b) => a + b, 0),
    avgNetworth: Math.round(avg(networthArr)),
    medianNetworth: Math.round(median(networthArr)),
    avgPL: pnlArr.length > 0 ? Math.round(pnlArr.reduce((a, b) => a + b, 0) / pnlArr.length) : 0,
    avgPlanAmount: Math.round(avg(planAmounts)),
    avgDiscount: Math.round(avg(discountArr.filter(d => d > 0))) || 0,
    discountPenetration: uniqueActivePANs.size > 0
      ? +(discountedPANs.size / uniqueActivePANs.size * 100).toFixed(1) : 0,

    // Products
    totalProducts,
    avgProductsPerUser: uniquePANs.size > 0
      ? +(currentMaster.length / uniquePANs.size).toFixed(2) : 0,

    // AUM & historical cycle counts
    totalAUM,
    totalSubCycles,
    completedCycles,
    totalSignupsEver,
  };
}

// ─── RETENTION METRICS (MoM & YoY from monthly movement data) ────────────────
export function getRetentionMetrics(monthly) {
  if (!monthly?.length) return null;
  // "Current month" is the most recent month actually present in the movement
  // data — NOT today's real calendar date. If the uploaded file's newest
  // activity is from weeks ago, anchoring to real "now" would look up a
  // month that doesn't exist in `monthly` and silently return null/no MoM
  // comparison, even though kpis.retentionRate (the number this feeds) has
  // already been fixed to anchor the same way — the two must agree.
  const anchor = monthly[monthly.length - 1].monthDate;
  const mkKey = (d) => `${d.toLocaleString('default', { month: 'short' })} '${String(d.getFullYear()).slice(2)}`;
  const curKey = monthly[monthly.length - 1].month;
  const prevKey = mkKey(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1));
  const lyKey = mkKey(new Date(anchor.getFullYear() - 1, anchor.getMonth(), 1));
  const find = (k) => monthly.find(m => m.month === k);
  // Monthly retention = (1 - churnRate/100) × 100 = % of opening still active at month end
  const toRet = (m) => m ? +(100 - m.churnRate).toFixed(1) : null;
  const cur = toRet(find(curKey));
  const prev = toRet(find(prevKey));
  const ly = toRet(find(lyKey));
  return {
    current: cur,
    lastMonth: prev,
    lastYear: ly,
    momChange: cur !== null && prev !== null ? +(cur - prev).toFixed(1) : null,
    yoyChange: cur !== null && ly !== null ? +(cur - ly).toFixed(1) : null,
  };
}

// ─── MONTHLY MOVEMENT — subscription-level counts ────────────────────────────
// Key: baseKey = `email|||scid` (preferred) or `PAN|||smallcaseName`.
// One investor with 2 baskets = 2 entries in New, Renewals, Exits, Opening, Closing.
export function getMonthlyMovement(rawData) {
  const data = filterNonPrivate(normalizeData(rawData));

  const subIntervals          = new Map(); // bk → [{start:ms, end:ms}]
  const subEarliestStart      = new Map(); // bk → earliest start ms
  const monthNewSubs          = new Map(); // `YYYY-M` → Set<bk>
  const monthRenewalSubs      = new Map(); // `YYYY-M` → Set<bk>
  const monthExitSubs         = new Map(); // `YYYY-M` → Set<bk>
  const monthEligibleSubs     = new Map(); // `YYYY-M` → Set<bk>  (cycle ended this month — due to renew)
  const monthRenewedEligible  = new Map(); // `YYYY-M` → Set<bk>  (eligible AND actually renewed)

  const getBK = (r) => {
    const email = String(r['Email'] || '').trim().toLowerCase();
    const scid  = String(r['Scid']  || '').trim();
    const pan   = String(r['PAN']   || '').trim().toUpperCase();
    const sc    = String(r['Smallcase Name'] || '').trim();
    return (email && scid) ? `${email}|||${scid}` : `${pan}|||${sc}`;
  };

  // Pass 1: build subIntervals — must be complete before exit processing
  for (const r of data) {
    const ls = String(r['Latest Subscription Status'] || '').trim().toUpperCase().replace(/ /g, '_');
    if (ls === 'REQUESTED_ACCESS') continue;
    const bk = getBK(r);
    if (!bk || bk === '|||') continue;
    const s = parseExcelDate(r['Subscription Start Date']);
    if (!s) continue;
    const sT = s.getTime();
    const cycleStatus = String(r['Cycle Level Status'] || '').trim().toUpperCase();
    const exitDate = cycleStatus === 'UNSUBSCRIBED' ? parseExcelDate(r['Cycle End Date']) : null;
    const endT = exitDate ? exitDate.getTime() : Infinity;
    if (!subIntervals.has(bk)) subIntervals.set(bk, []);
    subIntervals.get(bk).push({ start: sT, end: endT });
    if (!subEarliestStart.has(bk) || sT < subEarliestStart.get(bk)) subEarliestStart.set(bk, sT);
  }

  // Pass 2: build monthly event Sets
  const DAY_MS = 86400000;
  const GRACE_PERIOD_DAYS = 15; // clients get 15 days post cycle-end to pay before a renewal counts as churn
  const cycleEndEvents = new Map(); // mk → Map<bk, [{t, stillActive}]>  (a bk can have >1 cycle end in the same month on short-cycle products)
  for (const r of data) {
    const ls = String(r['Latest Subscription Status'] || '').trim().toUpperCase().replace(/ /g, '_');
    if (ls === 'REQUESTED_ACCESS') continue;
    const bk = getBK(r);
    if (!bk || bk === '|||') continue;
    const s = parseExcelDate(r['Subscription Start Date']);
    if (!s) continue;
    const cycle = Number(r['Cycle Number']) || 0;
    const cycleStatus = String(r['Cycle Level Status'] || '').trim().toUpperCase();

    // New subscriptions — Cycle 1 starts regardless of current status
    // (someone who joins and exits same month counts as both new and exited → net 0)
    if (cycle === 1) {
      const mk = `${s.getFullYear()}-${s.getMonth()}`;
      if (!monthNewSubs.has(mk)) monthNewSubs.set(mk, new Set());
      monthNewSubs.get(mk).add(bk);
    }

    // Renewals — Cycle 2+ starts
    if (cycle > 1) {
      const mk = `${s.getFullYear()}-${s.getMonth()}`;
      if (!monthRenewalSubs.has(mk)) monthRenewalSubs.set(mk, new Set());
      monthRenewalSubs.get(mk).add(bk);
    }

    // Exits + eligible/renewal tracking
    if (cycleStatus === 'UNSUBSCRIBED') {
      const exitDate = parseExcelDate(r['Cycle End Date']);
      if (exitDate) {
        const mk = `${exitDate.getFullYear()}-${exitDate.getMonth()}`;
        // Clients get a 15-day grace window after cycle end to pay and renew —
        // a resub anytime in that window still counts as a renewal of this cycle,
        // even if the payment lands in the following calendar month.
        const graceEndT = exitDate.getTime() + GRACE_PERIOD_DAYS * DAY_MS;
        const ivs = subIntervals.get(bk) || [];
        const stillActive = ivs.some(iv => iv.start >= exitDate.getTime() && iv.start <= graceEndT);

        if (!cycleEndEvents.has(mk)) cycleEndEvents.set(mk, new Map());
        const bkEvents = cycleEndEvents.get(mk);
        if (!bkEvents.has(bk)) bkEvents.set(bk, []);
        bkEvents.get(bk).push({ t: exitDate.getTime(), stillActive });
      }
    }
  }

  // Resolve one verdict per bk per month: a short-cycle bk can hit multiple
  // cycle ends in the same month, so take its chronologically last outcome —
  // otherwise it lands in both "renewed" and "exited" while only counting
  // once in "eligible", and the three totals stop summing consistently.
  for (const [mk, bkEvents] of cycleEndEvents) {
    for (const [bk, events] of bkEvents) {
      const last = events.reduce((a, b) => (b.t > a.t ? b : a));

      if (!monthEligibleSubs.has(mk)) monthEligibleSubs.set(mk, new Set());
      monthEligibleSubs.get(mk).add(bk);

      if (last.stillActive) {
        if (!monthRenewedEligible.has(mk)) monthRenewedEligible.set(mk, new Set());
        monthRenewedEligible.get(mk).add(bk);
      } else {
        if (!monthExitSubs.has(mk)) monthExitSubs.set(mk, new Set());
        monthExitSubs.get(mk).add(bk);
      }
    }
  }

  if (!subIntervals.size) return [];

  const minT = Math.min(...subEarliestStart.values());
  // Anchor the trailing edge of the range to the data's own latest activity,
  // not today's real date — otherwise the last bucket is an empty "current
  // month" with nothing in it whenever the upload is more than a few weeks
  // stale, which also breaks getRetentionMetrics below (it anchors off this
  // array's last entry).
  const maxDate = getLatestActivityDate(rawData);
  const months = [];
  const cursor = new Date(new Date(minT).getFullYear(), new Date(minT).getMonth(), 1);
  while (cursor <= maxDate) { months.push(new Date(cursor)); cursor.setMonth(cursor.getMonth() + 1); }

  // Count active subscriptions (unique baseKeys) at timestamp T
  const countActive = (T) => {
    let n = 0;
    for (const ivs of subIntervals.values()) {
      if (ivs.some(iv => iv.start <= T && iv.end > T)) n++;
    }
    return n;
  };

  return months.map((mStart, i) => {
    const mEnd = new Date(mStart.getFullYear(), mStart.getMonth() + 1, 0, 23, 59, 59);
    const prevEnd = i > 0
      ? new Date(months[i - 1].getFullYear(), months[i - 1].getMonth() + 1, 0, 23, 59, 59)
      : new Date(mStart.getTime() - 1);
    const mk = `${mStart.getFullYear()}-${mStart.getMonth()}`;

    const closing         = countActive(mEnd.getTime());
    const opening         = countActive(prevEnd.getTime());
    const newSubs         = monthNewSubs.get(mk)?.size           || 0;
    const exitedSubs      = monthExitSubs.get(mk)?.size          || 0;
    const renewals        = monthRenewalSubs.get(mk)?.size        || 0;
    const eligible        = monthEligibleSubs.get(mk)?.size       || 0;
    const renewedEligible = monthRenewedEligible.get(mk)?.size    || 0;

    return {
      month:     `${mStart.toLocaleString('default', { month: 'short' })} '${String(mStart.getFullYear()).slice(2)}`,
      monthFull: `${mStart.toLocaleString('default', { month: 'long' })} ${mStart.getFullYear()}`,
      monthDate: mStart,
      opening, closing,
      new:       newSubs,
      newUnique: newSubs,
      renewals,
      exited:    exitedSubs,
      net:       closing - opening,
      eligible,
      renewedEligible,
      eligibleRenewalRate: eligible > 0 ? +(renewedEligible / eligible * 100).toFixed(1) : 0,
      churnRate:  opening > 0 ? +(exitedSubs / opening * 100).toFixed(2) : 0,
      growthRate: opening > 0 ? +((closing - opening) / opening * 100).toFixed(2) : 0,
    };
  });
}

// ─── PRODUCT METRICS ──────────────────────────────────────────────────────────
export function getProductMetrics(currentMaster, rawData) {
  const normalized = filterNonPrivate(normalizeData(rawData));
  const products = [...new Set(currentMaster.map(r => r['Smallcase Name']).filter(Boolean))];
  const normByProduct = new Map();
  for (const r of normalized) {
    const p = r['Smallcase Name'];
    if (!p) continue;
    if (!normByProduct.has(p)) normByProduct.set(p, []);
    normByProduct.get(p).push(r);
  }
  return products.map(product => {
    const cur = currentMaster.filter(r => r['Smallcase Name'] === product);
    const all = normByProduct.get(product) || [];
    const active = cur.filter(isActive).length;
    const exited = cur.filter(isExited).length;
    const renewed = cur.filter(isActive).filter(r => (Number(r['Cycle Number']) || 0) > 1).length;
    const activeSubs = cur.filter(isActive);
    return {
      product, total: cur.length, active, exited, historical: all.length,
      renewalRate: activeSubs.length > 0 ? +(renewed / activeSubs.length * 100).toFixed(1) : 0,
      churnRate: cur.length > 0 ? +(exited / cur.length * 100).toFixed(1) : 0,
      avgPlanAmount: Math.round(avg(activeSubs.map(r => Number(r['Plan Amount']) || 0).filter(n => n > 0))),
      avgDiscount: Math.round(avg(activeSubs.map(r => Number(r['Offer Discount']) || 0).filter(n => n > 0))) || 0,
      avgNetworth: Math.round(avg(activeSubs.map(r => Number(r['Networth']) || 0).filter(n => n > 0))),
      avgPnL: Math.round(avg(activeSubs.map(r => Number(r['Total PnL']) || 0))),
      avgCycle: +(avg(cur.map(r => Number(r['Cycle Number']) || 0))).toFixed(1),
    };
  }).sort((a, b) => b.total - a.total);
}

// ─── COHORT ANALYSIS (O(n) via pre-indexed PAN map, excl. private SC) ─────────
export function buildCohortData(rawData, filters) {
  let data = filterNonPrivate(normalizeData(rawData));
  // Dimension filters are safe to apply up front (e.g. a smallcase filter turns
  // this into "cohorts by first subscription to that product"). The period
  // filter is NOT applied here — retention-at-interval needs full history —
  // instead it trims which cohort ROWS are returned, at the bottom.
  if (hasDimensionFilters(filters)) data = data.filter(row => matchesDimensionFilters(row, filters));
  const INTERVALS = [0, 1, 3, 6, 12, 24];
  const now = new Date();
  const panIndex = new Map();
  for (const row of data) {
    const pan = String(row.PAN || '').trim().toUpperCase();
    if (!pan) continue;
    const start = parseExcelDate(row['Subscription Start Date']);
    if (!start) continue;
    const exit = parseExcelDate(row['Cycle End Date'] || row['Exit Date']);
    if (!panIndex.has(pan)) panIndex.set(pan, []);
    panIndex.get(pan).push({ startT: start.getTime(), exitT: exit ? exit.getTime() : null });
  }
  const cohortMap = new Map();
  for (const row of data) {
    const pan = String(row.PAN || '').trim().toUpperCase();
    if (!pan) continue;
    const firstDate = parseExcelDate(row['First Subscription Date']) || parseExcelDate(row['Subscription Start Date']);
    if (!firstDate) continue;
    const ck = `${firstDate.getFullYear()}-${String(firstDate.getMonth() + 1).padStart(2, '0')}`;
    if (!cohortMap.has(ck)) cohortMap.set(ck, new Set());
    cohortMap.get(ck).add(pan);
  }
  const cohorts = Array.from(cohortMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([cohort, pans]) => {
    const cohortStart = new Date(`${cohort}-01`);
    const size = pans.size;
    const row = { cohort, size, cohortStart };
    for (const interval of INTERVALS) {
      const checkDate = new Date(cohortStart.getFullYear(), cohortStart.getMonth() + interval + 1, 0, 23, 59, 59);
      if (checkDate > now) { row[`m${interval}`] = null; continue; }
      const checkT = checkDate.getTime();
      let stillActive = 0;
      for (const pan of pans) {
        const entries = panIndex.get(pan);
        if (!entries) continue;
        if (entries.some(e => e.startT <= checkT && (e.exitT === null || e.exitT > checkT))) stillActive++;
      }
      row[`m${interval}`] = size > 0 ? Math.round(stillActive / size * 100) : 0;
    }
    return row;
  });

  if (filters?.dateFrom || filters?.dateTo) {
    const from = filters.dateFrom || null;
    const to   = filters.dateTo ? toEndOfDay(filters.dateTo) : null;
    return cohorts.filter(c => inRange(c.cohortStart, from, to)).map(({ cohortStart, ...rest }) => rest);
  }
  return cohorts.map(({ cohortStart, ...rest }) => rest);
}

// ─── RENEWAL FUNNEL ───────────────────────────────────────────────────────────
export function buildRenewalFunnel(currentMaster) {
  const deduped = deduplicateByPAN(currentMaster);
  const byCycle = { '1': 0, '2': 0, '3': 0, '4': 0, '5+': 0 };
  for (const row of deduped) {
    const c = Number(row['Cycle Number']) || 0;
    byCycle[c >= 5 ? '5+' : c >= 1 ? String(c) : '1']++;
  }
  const keys = ['1', '2', '3', '4', '5+'];
  return keys.map((k, i) => ({
    cycle: `Cycle ${k}`, count: byCycle[k],
    conversionRate: i > 0 && byCycle[keys[i - 1]] > 0
      ? +(byCycle[k] / byCycle[keys[i - 1]] * 100).toFixed(1) : 100,
  }));
}

export function getRenewalByProduct(currentMaster) {
  const products = [...new Set(currentMaster.map(r => r['Smallcase Name']).filter(Boolean))];
  return products.map(product => {
    const rows = currentMaster.filter(r => r['Smallcase Name'] === product);
    const bc = { '1': 0, '2': 0, '3': 0, '4': 0, '5+': 0 };
    for (const r of rows) { const c = Number(r['Cycle Number']) || 0; bc[c >= 5 ? '5+' : c >= 1 ? String(c) : '1']++; }
    return {
      product, total: rows.length,
      c1: bc['1'], c2: bc['2'], c3: bc['3'], c4: bc['4'], c5plus: bc['5+'],
      c1c2Rate: bc['1'] > 0 ? +(bc['2'] / bc['1'] * 100).toFixed(1) : 0,
      c2c3Rate: bc['2'] > 0 ? +(bc['3'] / bc['2'] * 100).toFixed(1) : 0,
    };
  }).sort((a, b) => b.total - a.total);
}

// ─── DISCOUNT METRICS ─────────────────────────────────────────────────────────
export function getDiscountSummary(currentMaster) {
  const activeSubs = currentMaster.filter(isActive);
  const totalDiscountGiven = activeSubs.reduce((a, r) => a + (Number(r['Offer Discount']) || 0), 0);
  const activeDeduped = deduplicateByPAN(activeSubs);
  const discounts = activeDeduped.map(r => Number(r['Offer Discount']) || 0);
  const withDiscount = discounts.filter(d => d > 0);
  return {
    totalDiscountGiven,
    avgDiscount: Math.round(avg(withDiscount)) || 0,
    medianDiscount: Math.round(median(withDiscount)) || 0,
    discountUtilization: activeDeduped.length > 0 ? +(withDiscount.length / activeDeduped.length * 100).toFixed(1) : 0,
    withDiscountCount: withDiscount.length,
    total: activeDeduped.length,
  };
}

export function getDiscountByDimension(currentMaster, dimension) {
  const activeSubs = currentMaster.filter(isActive);
  const groups = {};
  for (const row of activeSubs) {
    const key = String(row[dimension] || 'Unknown').trim() || 'Unknown';
    if (!groups[key]) groups[key] = { key, rows: [] };
    groups[key].rows.push(row);
  }
  return Object.values(groups).map(g => {
    const deduped = deduplicateByPAN(g.rows);
    const discounts = deduped.map(r => Number(r['Offer Discount']) || 0);
    const nonZero = discounts.filter(d => d > 0);
    return {
      name: g.key, count: deduped.length,
      totalDiscount: discounts.reduce((a, b) => a + b, 0),
      avgDiscount: Math.round(avg(nonZero)) || 0,
      discountUtilization: deduped.length > 0 ? +(nonZero.length / deduped.length * 100).toFixed(1) : 0,
    };
  }).sort((a, b) => b.totalDiscount - a.totalDiscount).slice(0, 15);
}

export function getOfferCodeMetrics(currentMaster) {
  const activeSubs = currentMaster.filter(isActive);
  const groups = {};
  for (const row of activeSubs) {
    const code = String(row['Offer Code'] || '').trim() || 'No Code';
    if (!groups[code]) groups[code] = { code, rows: [] };
    groups[code].rows.push(row);
  }
  return Object.values(groups)
    .map(g => {
      const deduped = deduplicateByPAN(g.rows);
      const totalDiscount = deduped.reduce((a, r) => a + (Number(r['Offer Discount']) || 0), 0);
      return { code: g.code, count: deduped.length, totalDiscount, avgDiscount: deduped.length > 0 ? Math.round(totalDiscount / deduped.length) : 0 };
    })
    .sort((a, b) => b.count - a.count).slice(0, 20);
}

// ─── INVESTOR SEGMENTATION (active only) ─────────────────────────────────────
export function getInvestorSegments(currentMaster) {
  const activeSubs = deduplicateByPAN(currentMaster.filter(isActive));
  const nwBuckets = [
    { label: '< ₹1L', min: 0, max: 100000 },
    { label: '₹1L-₹5L', min: 100000, max: 500000 },
    { label: '₹5L-₹25L', min: 500000, max: 2500000 },
    { label: '₹25L-₹1Cr', min: 2500000, max: 10000000 },
    { label: '> ₹1Cr', min: 10000000, max: Infinity },
  ];
  // P&L buckets: percentage return = P&L / Networth * 100 (falls back to Plan Amount)
  // Profitable = return > 5%
  const pnlBuckets = [
    { label: 'Loss Making',    fn: p => p < -5 },
    { label: 'Break Even',     fn: p => p >= -5 && p <= 5 },
    { label: 'Profitable',     fn: p => p > 5 && p <= 25 },
    { label: 'High Performers',fn: p => p > 25 },
  ];
  const pnlKey = activeSubs.length
    ? (() => {
        const keys = Object.keys(activeSubs[0]);
        if (keys.includes('Total PnL')) return 'Total PnL';
        return keys.find(k => /total.*(pnl|p&l|profit)/i.test(k)) ||
               keys.find(k => /(pnl|p&l|profit.*loss)/i.test(k)) || 'Total PnL';
      })()
    : 'Total PnL';
  const prepped = activeSubs.map(r => {
    const nw   = Number(r['Networth'])    || 0;
    const plan = Number(r['Plan Amount']) || 0;
    const pnl  = Number(r[pnlKey])        || 0;
    const base = nw > 0 ? nw : plan;
    const pnlPct = base > 0 ? (pnl / base) * 100 : 0;
    return { nw, plan, pnl, pnlPct, cycle: Number(r['Cycle Number']) || 0 };
  });
  const networthData = nwBuckets.map(b => {
    const rows = prepped.filter(r => r.nw >= b.min && r.nw < b.max);
    return {
      label: b.label, count: rows.length,
      avgPlanAmount: Math.round(avg(rows.map(r => r.plan).filter(n => n > 0))),
      avgPnL: Math.round(avg(rows.map(r => r.pnl))),
      renewalRate: rows.length > 0 ? +(rows.filter(r => r.cycle > 1).length / rows.length * 100).toFixed(1) : 0,
    };
  });
  const pnlData = pnlBuckets.map(b => {
    const rows = prepped.filter(r => b.fn(r.pnlPct));
    return {
      label: b.label, count: rows.length,
      avgNetworth: Math.round(avg(rows.map(r => r.nw).filter(n => n > 0))),
      avgPlanAmount: Math.round(avg(rows.map(r => r.plan).filter(n => n > 0))),
    };
  });
  return { networthData, pnlData };
}

// ─── BROKER METRICS (active only) ─────────────────────────────────────────────
export function getBrokerMetrics(currentMaster) {
  const brokerMap = new Map();
  for (const r of currentMaster) {
    const broker = String(r['Broker Name'] || '').trim();
    if (!broker) continue;
    if (!brokerMap.has(broker)) brokerMap.set(broker, []);
    brokerMap.get(broker).push(r);
  }
  return Array.from(brokerMap.entries()).map(([broker, rows]) => {
    const deduped = deduplicateByPAN(rows);
    const active = deduped.filter(isActive);
    const exited = deduped.filter(isExited).length;
    const renewed = active.filter(r => (Number(r['Cycle Number']) || 0) > 1).length;
    return {
      broker, total: deduped.length, active: active.length, exited,
      activeRate: deduped.length > 0 ? +(active.length / deduped.length * 100).toFixed(1) : 0,
      churnRate: deduped.length > 0 ? +(exited / deduped.length * 100).toFixed(1) : 0,
      renewalRate: active.length > 0 ? +(renewed / active.length * 100).toFixed(1) : 0,
      avgNetworth: Math.round(avg(active.map(r => Number(r['Networth']) || 0).filter(n => n > 0))),
      avgPnL: Math.round(avg(active.map(r => Number(r['Total PnL']) || 0))),
      avgPlanAmount: Math.round(avg(active.map(r => Number(r['Plan Amount']) || 0).filter(n => n > 0))),
    };
  }).sort((a, b) => b.total - a.total);
}

export function getAttributionMetrics(currentMaster) {
  const srcMap = new Map();
  for (const r of currentMaster) {
    const src = String(r['Attribution Source'] || '').trim();
    if (!src) continue;
    if (!srcMap.has(src)) srcMap.set(src, []);
    srcMap.get(src).push(r);
  }
  return Array.from(srcMap.entries()).map(([source, rows]) => {
    const deduped = deduplicateByPAN(rows);
    const active = deduped.filter(isActive);
    const renewed = active.filter(r => (Number(r['Cycle Number']) || 0) > 1).length;
    return {
      source, total: deduped.length, active: active.length,
      renewalRate: active.length > 0 ? +(renewed / active.length * 100).toFixed(1) : 0,
      avgNetworth: Math.round(avg(active.map(r => Number(r['Networth']) || 0).filter(n => n > 0))),
    };
  }).sort((a, b) => b.total - a.total);
}

// ─── GEOGRAPHY METRICS (active only for financials) ───────────────────────────
export function getGeographyMetrics(currentMaster) {
  const activeDeduped = deduplicateByPAN(currentMaster.filter(isActive));
  const totalNW = activeDeduped.reduce((a, r) => a + (Number(r['Networth']) || 0), 0);
  const stateMap = new Map();
  for (const r of currentMaster) {
    const state = String(r['State'] || '').trim();
    if (!state) continue;
    if (!stateMap.has(state)) stateMap.set(state, []);
    stateMap.get(state).push(r);
  }
  return Array.from(stateMap.entries()).map(([state, rows]) => {
    const deduped = deduplicateByPAN(rows);
    const active = deduped.filter(isActive);
    const exited = deduped.filter(isExited).length;
    const renewed = active.filter(r => (Number(r['Cycle Number']) || 0) > 1).length;
    const stateNW = active.reduce((a, r) => a + (Number(r['Networth']) || 0), 0);
    return {
      state, total: deduped.length, active: active.length, exited,
      activeRate: deduped.length > 0 ? +(active.length / deduped.length * 100).toFixed(1) : 0,
      churnRate: deduped.length > 0 ? +(exited / deduped.length * 100).toFixed(1) : 0,
      renewalRate: active.length > 0 ? +(renewed / active.length * 100).toFixed(1) : 0,
      avgNetworth: Math.round(avg(active.map(r => Number(r['Networth']) || 0).filter(n => n > 0))),
      avgPnL: Math.round(avg(active.map(r => Number(r['Total PnL']) || 0))),
      totalNetworth: stateNW,
      networthShare: totalNW > 0 ? +(stateNW / totalNW * 100).toFixed(1) : 0,
    };
  }).sort((a, b) => b.total - a.total);
}

// ─── UNIQUE FLOW COUNTS (for period comparison) ───────────────────────────────
// Returns: unique new investor PANs (Cycle 1 starts) and unique unsub PANs in range
export function getUniqueFlowCounts(rawData, from, to) {
  const normalized = filterNonPrivate(normalizeData(rawData));
  const fromT = (from instanceof Date ? from : new Date(from)).getTime();
  const toEnd = to instanceof Date ? to : new Date(to);
  toEnd.setHours(23, 59, 59, 999);
  const toT = toEnd.getTime();
  const DAY_MS_F = 86400000;

  // Build panIntervals to distinguish real exits from cycle transitions
  const panIntervalsF = new Map();
  for (const r of normalized) {
    const pan = String(r['PAN'] || r['Email'] || '').trim().toUpperCase();
    if (!pan) continue;
    const startD = parseExcelDate(r['Subscription Start Date']);
    if (!startD) continue;
    const cycleStatus = String(r['Cycle Level Status'] || '').trim().toUpperCase();
    const exitD = cycleStatus === 'UNSUBSCRIBED' ? parseExcelDate(r['Cycle End Date']) : null;
    const endT = exitD ? exitD.getTime() : Infinity;
    if (!panIntervalsF.has(pan)) panIntervalsF.set(pan, []);
    panIntervalsF.get(pan).push({ start: startD.getTime(), end: endT });
  }

  const newPANs  = new Set();
  const exitPANs = new Set();

  for (const r of normalized) {
    const id = String(r['PAN'] || r['Email'] || '').trim().toUpperCase();
    if (!id) continue;

    // New unique: Cycle 1 (or 0), Subscription Start Date in range
    const startD = parseExcelDate(r['Subscription Start Date']);
    if (startD) {
      const t = startD.getTime();
      if (t >= fromT && t <= toT && (Number(r['Cycle Number']) || 0) <= 1) {
        newPANs.add(id);
      }
    }

    // Unique exit: UNSUBSCRIBED, Cycle End Date in range, and NOT still active next day
    const cycleStatus = String(r['Cycle Level Status'] || '').trim().toUpperCase();
    if (cycleStatus === 'UNSUBSCRIBED') {
      const exitD = parseExcelDate(r['Cycle End Date']);
      if (exitD) {
        const t = exitD.getTime();
        if (t >= fromT && t <= toT) {
          const nextDayT = t + DAY_MS_F;
          const ivs = panIntervalsF.get(id) || [];
          const stillActive = ivs.some(iv => iv.start <= nextDayT && iv.end > nextDayT);
          if (!stillActive) exitPANs.add(id);
        }
      }
    }
  }

  return {
    uniqueNewSubs: newPANs.size,
    uniqueExits:   exitPANs.size,
    netUnique:     newPANs.size - exitPANs.size,
  };
}

// ─── CANCELLATION METRICS (excl. private SC) ──────────────────────────────────
export function getCancellationMetrics(rawData) {
  const normalized = filterNonPrivate(normalizeData(rawData));
  // One exit event per unique investor-product (highest exit cycle per baseKey)
  const exitMap = new Map();
  for (const row of normalized) {
    const cycleStatus = String(row['Cycle Level Status'] || '').trim().toUpperCase();
    if (cycleStatus !== 'UNSUBSCRIBED') continue;
    const email = String(row['Email'] || '').trim().toLowerCase();
    const scid  = String(row['Scid'] || '').trim();
    const pan   = String(row['PAN'] || '').trim().toUpperCase();
    const sc    = String(row['Smallcase Name'] || '').trim();
    const baseKey = (email && scid) ? `${email}|||${scid}` : `${pan}|||${sc}`;
    const cycle = Number(row['Cycle Number']) || 0;
    const ex = exitMap.get(baseKey);
    if (!ex || cycle > (Number(ex['Cycle Number']) || 0)) exitMap.set(baseKey, row);
  }
  const exits = Array.from(exitMap.values());

  const reasonMap = {};
  const monthlyExit = {};
  for (const row of exits) {
    const reason = String(row['Cancellation Reason'] || '').trim();
    if (reason && reason.toLowerCase() !== 'nan') {
      const sc = String(row['Smallcase Name'] || 'Unknown').trim();
      if (!reasonMap[reason]) reasonMap[reason] = { reason, count: 0, byProduct: {} };
      reasonMap[reason].count++;
      reasonMap[reason].byProduct[sc] = (reasonMap[reason].byProduct[sc] || 0) + 1;
    }
    const d = parseExcelDate(row['Exit Date']) || parseExcelDate(row['Cycle End Date']);
    if (d) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyExit[key] = (monthlyExit[key] || 0) + 1;
    }
  }
  const total = Object.values(reasonMap).reduce((a, r) => a + r.count, 0);
  let cumPct = 0;
  const reasons = Object.values(reasonMap).sort((a, b) => b.count - a.count).map(r => {
    const pct = total > 0 ? +(r.count / total * 100).toFixed(1) : 0;
    cumPct += pct;
    return { ...r, pct, cumPct: +cumPct.toFixed(1) };
  });
  return {
    reasons, total,
    monthlyTrend: Object.entries(monthlyExit).sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count })),
  };
}

// ─── PRODUCT MIGRATION (excl. private SC) ─────────────────────────────────────
export function getMigrationData(rawData, filters) {
  const data = filterNonPrivate(normalizeData(rawData));
  const userMap = new Map();
  for (const row of data) {
    const pan = String(row.PAN || '').trim().toUpperCase();
    if (!pan) continue;
    if (!userMap.has(pan)) userMap.set(pan, []);
    userMap.get(pan).push(row);
  }
  // Migrations need each user's FULL product history to correctly identify
  // their first vs. last product — that can't be computed from a pre-scoped
  // (period-filtered) row set. Instead, the period filter is applied below by
  // keeping only migrations whose move (the last product's start date) falls
  // in the selected window.
  const periodFrom = filters?.dateFrom || null;
  const periodTo   = filters?.dateTo ? toEndOfDay(filters.dateTo) : null;
  const hasPeriod  = !!(periodFrom || periodTo);

  const flowMap = new Map();
  let multiProduct = 0;
  const allProducts = new Set();
  for (const [, rows] of userMap) {
    const prods = [...new Set(rows.map(r => r['Smallcase Name']).filter(Boolean))];
    prods.forEach(p => allProducts.add(p));
    if (prods.length < 2) continue;
    multiProduct++;
    const sorted = rows.filter(r => r['Smallcase Name'])
      .sort((a, b) => (parseExcelDate(a['Subscription Start Date']) || new Date(0)) - (parseExcelDate(b['Subscription Start Date']) || new Date(0)));
    const firstProd = sorted[0]['Smallcase Name'];
    const lastRow = sorted[sorted.length - 1];
    const lastProd = lastRow['Smallcase Name'];
    if (firstProd === lastProd) continue;
    if (hasPeriod) {
      const migrationDate = parseExcelDate(lastRow['Subscription Start Date']);
      if (!inRange(migrationDate, periodFrom, periodTo)) continue;
    }
    const key = `${firstProd}|||${lastProd}`;
    flowMap.set(key, (flowMap.get(key) || 0) + 1);
  }
  const flows = Array.from(flowMap.entries())
    .map(([k, count]) => { const [from, to] = k.split('|||'); return { from, to, count }; })
    .sort((a, b) => b.count - a.count).slice(0, 25);
  const entryCount = {}, exitCount = {};
  for (const f of flows) {
    entryCount[f.from] = (entryCount[f.from] || 0) + f.count;
    exitCount[f.to] = (exitCount[f.to] || 0) + f.count;
  }
  return {
    flows,
    multiProductAdoption: {
      single: userMap.size - multiProduct, multi: multiProduct, total: userMap.size,
      multiPct: userMap.size > 0 ? +(multiProduct / userMap.size * 100).toFixed(1) : 0,
    },
    entryProducts: Object.entries(entryCount).sort(([, a], [, b]) => b - a).slice(0, 5).map(([p, c]) => ({ product: p, count: c })),
    exitProducts: Object.entries(exitCount).sort(([, a], [, b]) => b - a).slice(0, 5).map(([p, c]) => ({ product: p, count: c })),
    totalProducts: allProducts.size,
  };
}

// ─── AI INSIGHTS ─────────────────────────────────────────────────────────────
export function generateInsights(currentMaster, monthlyMovement, productMetrics, brokerMetrics, geoMetrics) {
  const insights = [];
  const activeSubs = currentMaster.filter(isActive);
  const totalActive = activeSubs.length;
  const totalNW = activeSubs.reduce((a, r) => a + (Number(r['Networth']) || 0), 0);
  const uniquePANs = new Set(currentMaster.map(r => String(r.PAN || '').trim().toUpperCase()).filter(Boolean)).size;

  if (productMetrics.length > 0) {
    const top = productMetrics[0];
    const pct = totalActive > 0 ? (top.active / totalActive * 100).toFixed(0) : 0;
    insights.push({ icon: '🚀', category: 'Growth Leader', color: '#00d4ff',
      title: `${top.product} is the flagship with ${top.active.toLocaleString()} active subscribers (${pct}% of active base)`,
      detail: `Renewal rate: ${top.renewalRate}% | Avg plan: ₹${top.avgPlanAmount.toLocaleString()} | Avg networth: ₹${formatCurrency(top.avgNetworth, true)}` });
  }

  const byRetention = [...productMetrics].sort((a, b) => b.renewalRate - a.renewalRate);
  if (byRetention[0]) {
    insights.push({ icon: '🔒', category: 'Retention Champion', color: '#22c55e',
      title: `${byRetention[0].product} achieves highest renewal rate at ${byRetention[0].renewalRate}%`,
      detail: `${byRetention[0].active} currently active | Avg networth: ₹${byRetention[0].avgNetworth.toLocaleString()}` });
  }

  const byNW = [...productMetrics].sort((a, b) => b.avgNetworth - a.avgNetworth);
  if (byNW[0]) {
    insights.push({ icon: '💰', category: 'HNI Magnet', color: '#fbbf24',
      title: `${byNW[0].product} attracts the highest net-worth investors`,
      detail: `Avg networth: ${formatCurrency(byNW[0].avgNetworth, true)} | Avg PnL: ${formatCurrency(byNW[0].avgPnL, true)}` });
  }

  if (brokerMetrics.length > 0) {
    const byBrokerNW = [...brokerMetrics].sort((a, b) => b.avgNetworth - a.avgNetworth)[0];
    insights.push({ icon: '🤝', category: 'Top Distributor', color: '#8b5cf6',
      title: `${byBrokerNW.broker} brings the highest-quality investor base`,
      detail: `Avg networth: ${formatCurrency(byBrokerNW.avgNetworth, true)} | Renewal: ${byBrokerNW.renewalRate}% | ${byBrokerNW.total} subscribers` });
    const byVolume = [...brokerMetrics].sort((a, b) => b.total - a.total)[0];
    if (byVolume.broker !== byBrokerNW.broker) {
      insights.push({ icon: '📈', category: 'Volume Leader', color: '#14b8a6',
        title: `${byVolume.broker} drives the highest subscription volume`,
        detail: `${byVolume.total} total | Active rate: ${byVolume.total > 0 ? (byVolume.active / byVolume.total * 100).toFixed(0) : 0}%` });
    }
  }

  if (geoMetrics.length > 0) {
    const topState = geoMetrics[0];
    const pct = totalActive > 0 ? (topState.active / totalActive * 100).toFixed(0) : 0;
    insights.push({ icon: '🗺️', category: 'Geographic Concentration', color: '#f97316',
      title: `${topState.state} contributes ${pct}% of active subscribers and ${topState.networthShare}% of total networth`,
      detail: `${topState.active.toLocaleString()} active | Avg networth: ${formatCurrency(topState.avgNetworth, true)}` });
    const highRet = [...geoMetrics].filter(s => s.active >= 5).sort((a, b) => b.renewalRate - a.renewalRate)[0];
    if (highRet && highRet.state !== topState.state) {
      insights.push({ icon: '🏆', category: 'Regional Retention', color: '#22c55e',
        title: `${highRet.state} has the highest retention rate at ${highRet.renewalRate}%`,
        detail: `${highRet.active} active subscribers — potential model for other regions` });
    }
  }

  const panMap = new Map();
  for (const r of currentMaster) {
    const pan = String(r.PAN || '').trim().toUpperCase();
    if (pan) panMap.set(pan, (panMap.get(pan) || 0) + 1);
  }
  const multiProdUsers = Array.from(panMap.values()).filter(c => c > 1).length;
  const multiPct = uniquePANs > 0 ? (multiProdUsers / uniquePANs * 100).toFixed(0) : 0;
  insights.push({ icon: '📊', category: 'Cross-Sell Opportunity', color: '#00d4ff',
    title: `${multiPct}% of investors hold multiple smallcase subscriptions`,
    detail: `${multiProdUsers.toLocaleString()} multi-product users out of ${uniquePANs.toLocaleString()} total investors` });

  const retRate = totalActive > 0 ? (totalActive / currentMaster.length * 100).toFixed(1) : 0;
  insights.push({ icon: '💎', category: 'Platform Health', color: '#fbbf24',
    title: `Platform manages ${formatCurrency(totalNW, true)} in total active subscriber networth`,
    detail: `${retRate}% active rate | ${uniquePANs.toLocaleString()} unique investors` });

  const withDiscount = activeSubs.filter(r => (Number(r['Offer Discount']) || 0) > 0);
  const discPct = totalActive > 0 ? (withDiscount.length / totalActive * 100).toFixed(0) : 0;
  const avgDisc = Math.round(avg(withDiscount.map(r => Number(r['Offer Discount']) || 0)));
  insights.push({ icon: '🎯', category: 'Pricing Intelligence', color: '#f97316',
    title: `${discPct}% of active subscriptions are discount-driven with avg ₹${avgDisc.toLocaleString()} off`,
    detail: `Review pricing strategy for discount-dependent cohorts to improve unit economics` });

  if (monthlyMovement.length >= 3) {
    const recent = monthlyMovement.slice(-3);
    const avgNet = avg(recent.map(m => m.net));
    insights.push({ icon: '📉', category: 'Growth Momentum', color: avgNet > 0 ? '#22c55e' : '#f87171',
      title: `3-month avg net additions: ${avgNet > 0 ? '+' : ''}${Math.round(avgNet)} subscribers/month`,
      detail: `Growth momentum is ${avgNet > 0 ? 'positive' : 'negative'} — ${avgNet > 0 ? 'accelerate acquisition' : 'urgent retention focus needed'}` });
  }

  // ── WHERE WE ARE LAGGING ──────────────────────────────────────────────────

  // Worst product by renewal rate
  const worstRetention = [...productMetrics].filter(p => p.total >= 10).sort((a, b) => a.renewalRate - b.renewalRate)[0];
  if (worstRetention && byRetention[0] && worstRetention.product !== byRetention[0].product) {
    insights.push({ icon: '⚠️', category: 'Retention Laggard', color: '#f87171',
      title: `${worstRetention.product} has the lowest renewal rate at ${worstRetention.renewalRate}%`,
      detail: `${worstRetention.active} active | ${worstRetention.total} total — investigate product-market fit or pricing` });
  }

  // Worst broker by renewal rate
  if (brokerMetrics.length >= 2) {
    const worstBroker = [...brokerMetrics].filter(b => b.total >= 10).sort((a, b) => a.renewalRate - b.renewalRate)[0];
    if (worstBroker) {
      insights.push({ icon: '🤝', category: 'Distributor Laggard', color: '#f87171',
        title: `${worstBroker.broker} has the lowest renewal rate at ${worstBroker.renewalRate}% among distributors`,
        detail: `${worstBroker.total} subscribers | Active rate: ${worstBroker.total > 0 ? (worstBroker.active / worstBroker.total * 100).toFixed(0) : 0}% — partner quality review recommended` });
    }
  }

  // Worst state by renewal rate
  if (geoMetrics.length >= 2) {
    const worstState = [...geoMetrics].filter(s => s.active >= 5).sort((a, b) => a.renewalRate - b.renewalRate)[0];
    if (worstState) {
      insights.push({ icon: '🗺️', category: 'Regional Laggard', color: '#f87171',
        title: `${worstState.state} has the lowest retention rate at ${worstState.renewalRate}%`,
        detail: `${worstState.active} active subscribers — targeted re-engagement campaigns recommended` });
    }
  }

  // Consecutive months of net negative growth
  if (monthlyMovement.length >= 3) {
    let streak = 0;
    for (let i = monthlyMovement.length - 1; i >= 0; i--) {
      if (monthlyMovement[i].net < 0) streak++;
      else break;
    }
    if (streak >= 3) {
      const totalLoss = monthlyMovement.slice(-streak).reduce((a, m) => a + m.net, 0);
      insights.push({ icon: '🔴', category: 'Decline Alert', color: '#f87171',
        title: `${streak} consecutive months of net subscriber decline`,
        detail: `Net loss of ${Math.abs(totalLoss).toLocaleString()} subscriptions over last ${streak} months — immediate intervention required` });
    }
  }

  // Acquisition slowdown vs historical average
  if (monthlyMovement.length >= 6) {
    const recent3Avg = avg(monthlyMovement.slice(-3).map(m => m.new));
    const historicalAvg = avg(monthlyMovement.map(m => m.new));
    if (historicalAvg > 0 && recent3Avg < historicalAvg * 0.6) {
      insights.push({ icon: '📉', category: 'Acquisition Slowdown', color: '#f87171',
        title: `New subscription intake dropped ${((1 - recent3Avg / historicalAvg) * 100).toFixed(0)}% below historical average`,
        detail: `Recent 3-month avg: ${Math.round(recent3Avg)}/month vs all-time avg: ${Math.round(historicalAvg)}/month — review acquisition channels` });
    }
  }

  // Product concentration risk
  if (productMetrics.length >= 2 && totalActive > 0) {
    const topShare = productMetrics[0].active / totalActive * 100;
    if (topShare > 60) {
      insights.push({ icon: '⚡', category: 'Concentration Risk', color: '#fbbf24',
        title: `${productMetrics[0].product} holds ${topShare.toFixed(0)}% of active base — dangerous concentration`,
        detail: `Over-reliance on one product creates platform vulnerability — diversify subscriber distribution` });
    }
  }

  // Exit spike in recent months
  if (monthlyMovement.length >= 2) {
    const recent6 = monthlyMovement.slice(-6);
    const worstExit = [...recent6].sort((a, b) => b.exited - a.exited)[0];
    if (worstExit && worstExit.new > 0 && worstExit.exited > worstExit.new * 2.5) {
      insights.push({ icon: '🚨', category: 'Exit Spike', color: '#f87171',
        title: `${worstExit.month} saw exits (${worstExit.exited.toLocaleString()}) outpace new subs by ${(worstExit.exited / worstExit.new).toFixed(1)}×`,
        detail: `Churn rate: ${worstExit.churnRate}% — investigate trigger events around that period` });
    }
  }

  return insights;
}

// ─── UNSUBSCRIBER ANALYSIS ────────────────────────────────────────────────────
// All UNSUBSCRIBED cycles, deduplicated by Email+Scid+Cycle (same logic as
// completedCycles in getSummaryKPIs). Covers full exit history including
// investors who later came back (win-backs).
export function getUnsubscriberAnalysis(rawData, filters) {
  const data = filterNonPrivate(normalizeData(rawData));

  // Detect P&L column name — exit rows often have blank P&L so we scan all rows
  const pnlKey = data.length
    ? (() => {
        const keys = Object.keys(data[0]);
        if (keys.includes('Total PnL')) return 'Total PnL';
        return keys.find(k => /total.*(pnl|p&l|profit)/i.test(k)) ||
               keys.find(k => /(pnl|p&l|profit.*loss)/i.test(k)) || 'Total PnL';
      })()
    : 'Total PnL';

  // Pre-pass A: build per-baseKey subscription intervals for cycle-transition detection.
  // An UNSUBSCRIBED row where the same baseKey (Email+Scid) is still active the next
  // day is a cycle transition (C1→C2, C2→C3, etc.), not a real exit.
  const bkIntervals = new Map(); // baseKey → [{start: ms, end: ms}]
  const DAY_MS_U = 86400000;
  for (const r of data) {
    const latestStatus = String(r['Latest Subscription Status'] || '').trim().toUpperCase().replace(/ /g, '_');
    if (latestStatus === 'REQUESTED_ACCESS') continue;
    const email = String(r['Email'] || '').trim().toLowerCase();
    const scid  = String(r['Scid']  || '').trim();
    const pan   = String(r['PAN']   || '').trim().toUpperCase();
    const sc    = String(r['Smallcase Name'] || '').trim();
    const bk    = (email && scid) ? `${email}|||${scid}` : `${pan}|||${sc}`;
    if (!bk || bk === '|||') continue;
    const startD = parseExcelDate(r['Subscription Start Date']);
    if (!startD) continue;
    const cycleStatus = String(r['Cycle Level Status'] || '').trim().toUpperCase();
    const exitD = cycleStatus === 'UNSUBSCRIBED' ? parseExcelDate(r['Cycle End Date']) : null;
    const endT = exitD ? exitD.getTime() : Infinity;
    if (!bkIntervals.has(bk)) bkIntervals.set(bk, []);
    bkIntervals.get(bk).push({ start: startD.getTime(), end: endT });
  }

  // Pre-pass B: build best known P&L per subscriber-product key from ALL rows.
  // Exit rows frequently carry blank P&L (P&L is a live portfolio metric updated
  // only on active rows). The last non-zero P&L from any row is the best proxy
  // for "P&L at the time they were a subscriber."
  const bestPLByKey = new Map();
  for (const r of data) {
    const email = String(r['Email'] || '').trim().toLowerCase();
    const scid  = String(r['Scid']  || '').trim();
    const pan   = String(r['PAN']   || '').trim().toUpperCase();
    const sc    = String(r['Smallcase Name'] || '').trim();
    const bk    = (email && scid) ? `${email}|||${scid}` : `${pan}|||${sc}`;
    if (!bk || bk === '|||') continue;
    const pl = Number(r[pnlKey]);
    if (!isNaN(pl) && pl !== 0) bestPLByKey.set(bk, pl);
  }

  // Pass 1 — one row per unique investor-product (Email+Scid), keeping their LAST exit cycle.
  // Previously this kept every UNSUBSCRIBED cycle row, inflating counts for multi-cycle investors.
  // Now each unique subscriber-product appears once — the cycle they finally left on.
  const exitMap           = new Map(); // baseKey → row (highest Cycle Number that is UNSUBSCRIBED)
  const latestByKey       = new Map(); // baseKey → { status, cycle, pan }
  const latestActiveRowByKey = new Map(); // baseKey → latest active row (for win-back re-sub date)

  for (const r of data) {
    const latestStatus = String(r['Latest Subscription Status'] || '').trim().toUpperCase().replace(/ /g, '_');
    if (latestStatus === 'REQUESTED_ACCESS') continue;

    const email = String(r['Email']          || '').trim().toLowerCase();
    const scid  = String(r['Scid']           || '').trim();
    const pan   = String(r['PAN']            || '').trim().toUpperCase();
    const sc    = String(r['Smallcase Name'] || '').trim();
    const baseKey = (email && scid) ? `${email}|||${scid}` : `${pan}|||${sc}`;
    if (!baseKey || baseKey === '|||') continue;

    const cycle = Number(r['Cycle Number']) || 0;

    // Track the highest-cycle status (used for win-back detection)
    const cur = latestByKey.get(baseKey);
    if (!cur || cycle > cur.cycle) latestByKey.set(baseKey, { status: latestStatus, cycle, pan });

    // Track latest active row for win-back re-subscription date
    if (ACTIVE_STATUSES.has(latestStatus)) {
      const curActive = latestActiveRowByKey.get(baseKey);
      if (!curActive || cycle > (Number(curActive['Cycle Number']) || 0)) {
        latestActiveRowByKey.set(baseKey, r);
      }
    }

    if (String(r['Cycle Level Status'] || '').trim().toUpperCase() !== 'UNSUBSCRIBED') continue;

    // Keep only the highest-cycle exit row per unique investor-product
    const ex = exitMap.get(baseKey);
    if (!ex || cycle > (Number(ex['Cycle Number']) || 0)) exitMap.set(baseKey, r);
  }

  // Filter out cycle transitions using two methods:
  // Method 1 (bkIntervals): reliable for rows that have a Subscription Start Date.
  // Method 2 (cycle progression): catches transitions where the next-cycle row has no start date —
  //   if latestByKey shows the investor is currently ACTIVE at exactly exitCycle+1,
  //   it is unambiguously a cycle transition (C1→C2, C2→C3, etc.).
  const exits = Array.from(exitMap.values()).filter(r => {
    const exitD = parseExcelDate(r['Cycle End Date']);
    if (!exitD) return true;
    const email = String(r['Email'] || '').trim().toLowerCase();
    const scid  = String(r['Scid']  || '').trim();
    const pan   = String(r['PAN']   || '').trim().toUpperCase();
    const sc    = String(r['Smallcase Name'] || '').trim();
    const bk    = (email && scid) ? `${email}|||${scid}` : `${pan}|||${sc}`;

    // Method 1: interval check (requires start date on the next-cycle row)
    const nextDayT = exitD.getTime() + DAY_MS_U;
    const ivs = bkIntervals.get(bk) || [];
    if (ivs.some(iv => iv.start <= nextDayT && iv.end > nextDayT)) return false;

    // Method 2 (fallback for missing start dates): check latestActiveRowByKey.
    // If the investor is currently active AND their next subscription started within 7 days
    // of the exit date → cycle transition. Win-backs have gaps of 30+ days so they're safe.
    const latest = latestByKey.get(bk);
    if (latest && ACTIVE_STATUSES.has(latest.status)) {
      const exitCycle = Number(r['Cycle Number']) || 0;
      if (latest.cycle > exitCycle) {
        const activeRow = latestActiveRowByKey.get(bk);
        const reSubD = activeRow ? parseExcelDate(activeRow['Subscription Start Date']) : null;
        if (reSubD) {
          const gapDays = (reSubD.getTime() - exitD.getTime()) / DAY_MS_U;
          if (gapDays >= -1 && gapDays <= 7) return false; // cycle transition
        }
        // No start date on active row: cannot confirm gap, keep conservative (include as exit)
      }
    }

    return true;
  });

  // Period + dimension filters apply here, to the final exit list — NOT to the
  // raw rows above, which need full cross-cycle history to correctly tell a
  // real exit apart from a cycle transition (e.g. C1 -> C2 renewal).
  const scopedExits = (filters?.dateFrom || filters?.dateTo || hasDimensionFilters(filters))
    ? exits.filter(r => {
        if (!matchesDimensionFilters(r, filters)) return false;
        if (!filters.dateFrom && !filters.dateTo) return true;
        const exitD = parseExcelDate(r['Cycle End Date'] || r['Exit Date']);
        return inRange(exitD, filters.dateFrom || null, filters.dateTo ? toEndOfDay(filters.dateTo) : null);
      })
    : exits;
  const n = scopedExits.length;

  // latestExitByKey = exitMap (already one row per baseKey, already the highest cycle)
  const latestExitByKey = exitMap;

  // Win-backs: Email+Scid has an exit row AND is currently active
  const exitedBaseKeys = new Set(exitMap.keys());
  const WINBACK_MIN_DAYS = 30; // must return after >30 days to qualify as a win-back

  const winBackPANs    = new Set();
  const winBackDetails = [];
  for (const [bk, { status, pan }] of latestByKey) {
    if (!exitedBaseKeys.has(bk) || !ACTIVE_STATUSES.has(status)) continue;
    const exitRow   = latestExitByKey.get(bk);
    const activeRow = latestActiveRowByKey.get(bk);
    if (!exitRow || !activeRow) continue;

    const exitDate  = parseExcelDate(exitRow['Cycle End Date'] || exitRow['Exit Date']);
    const reSubDate = parseExcelDate(activeRow['Subscription Start Date']);
    if (!exitDate || !reSubDate) continue;

    const daysGap = Math.round((reSubDate.getTime() - exitDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysGap <= WINBACK_MIN_DAYS) continue; // returned too quickly — likely a renewal, not a win-back

    winBackPANs.add(pan);
    winBackDetails.push({
      name:         String(activeRow['User Name']      || exitRow['User Name'] || '').trim(),
      email:        String(activeRow['Email']          || exitRow['Email']     || '').trim(),
      pan,
      product:      String(activeRow['Smallcase Name'] || '').trim(),
      broker:       String(activeRow['Broker Name']    || '').trim(),
      exitDate,
      exitCycle:    Number(exitRow['Cycle Number'])   || 0,
      reSubDate,
      currentCycle: Number(activeRow['Cycle Number']) || 0,
      daysGap,
    });
  }

  // Short returns: exited AND came back within ≤30 days (too quick to be a win-back)
  const shortReturnPANs    = new Set();
  const shortReturnDetails = [];
  for (const [bk, { status, pan }] of latestByKey) {
    if (!exitedBaseKeys.has(bk) || !ACTIVE_STATUSES.has(status)) continue;
    const exitRow   = latestExitByKey.get(bk);
    const activeRow = latestActiveRowByKey.get(bk);
    if (!exitRow || !activeRow) continue;
    const exitDate  = parseExcelDate(exitRow['Cycle End Date'] || exitRow['Exit Date']);
    const reSubDate = parseExcelDate(activeRow['Subscription Start Date']);
    if (!exitDate || !reSubDate) continue;
    const daysGap = Math.round((reSubDate.getTime() - exitDate.getTime()) / 86400000);
    if (daysGap < 0 || daysGap > WINBACK_MIN_DAYS) continue; // only ≤30 days
    shortReturnPANs.add(pan);
    shortReturnDetails.push({
      name:     String(activeRow['User Name'] || exitRow['User Name'] || '').trim(),
      pan,
      product:  String(activeRow['Smallcase Name'] || '').trim(),
      broker:   String(activeRow['Broker Name']    || '').trim(),
      exitDate,
      reSubDate,
      daysGap,
    });
  }

  // How many exit cycles belong to short-return PANs (for exclusive total)
  let shortReturnExitCycles = 0;
  for (const r of scopedExits) {
    const p = String(r['PAN'] || '').trim().toUpperCase();
    if (shortReturnPANs.has(p)) shortReturnExitCycles++;
  }

  // Current status lookup: is each subscriber now active or still out?
  const currentStatusLookup = {};
  for (const [bk, { status }] of latestByKey) {
    currentStatusLookup[bk] = ACTIVE_STATUSES.has(status) ? 'Active' : 'Unsubscribed';
  }

  // Aggregations in a single pass
  const exitedPANs = new Set();
  const cycleCounts = { '1': 0, '2': 0, '3': 0, '4': 0, '5+': 0 };
  const productMap = {}, brokerMap = {}, stateMap = {}, monthMap = {}, reasonMap = {};
  const plArr = [], plBuckets = {}, productPLMap = {};
  let tenureSum = 0, tenureCount = 0, cycleSum = 0;
  let positivePL = 0, negativePL = 0, zeroPL = 0;
  let positivePLSum = 0, negativePLSum = 0;

  for (const r of scopedExits) {
    const pan    = String(r['PAN']            || '').trim().toUpperCase();
    const prod   = String(r['Smallcase Name'] || 'Unknown').trim();
    const broker = String(r['Broker Name']    || 'Unknown').trim() || 'Unknown';
    const state  = String(r['State']          || 'Unknown').trim() || 'Unknown';
    const reason = String(r['Cancellation Reason'] || '').trim();
    const c = Number(r['Cycle Number']) || 0;

    if (pan) exitedPANs.add(pan);
    cycleCounts[c >= 5 ? '5+' : c >= 1 ? String(c) : '1']++;
    cycleSum += Math.max(c, 1);

    productMap[prod]  = (productMap[prod]  || 0) + 1;
    brokerMap[broker] = (brokerMap[broker] || 0) + 1;
    stateMap[state]   = (stateMap[state]   || 0) + 1;

    if (reason && reason.toLowerCase() !== 'nan' && reason.toLowerCase() !== 'none' && reason !== '') {
      reasonMap[reason] = (reasonMap[reason] || 0) + 1;
    }

    // Tenure: First Sub Date → Cycle End Date
    const startD = parseExcelDate(r['First Subscription Date'] || r['Subscription Start Date']);
    const endD   = parseExcelDate(r['Cycle End Date']);
    if (startD && endD && endD > startD) {
      tenureSum += (endD.getFullYear() - startD.getFullYear()) * 12 + endD.getMonth() - startD.getMonth();
      tenureCount++;
    }

    // Monthly trend by Cycle End Date
    if (endD) {
      const mk = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, '0')}`;
      if (!monthMap[mk]) monthMap[mk] = {
        month: mk,
        label: `${endD.toLocaleString('default', { month: 'short' })} '${String(endD.getFullYear()).slice(2)}`,
        count: 0, c1: 0, cPlus: 0,
      };
      monthMap[mk].count++;
      c <= 1 ? monthMap[mk].c1++ : monthMap[mk].cPlus++;
    }

    // P&L at exit: try the exit row first, fall back to best known P&L from any row
    const email_r = String(r['Email'] || '').trim().toLowerCase();
    const scid_r  = String(r['Scid']  || '').trim();
    const bk_r    = (email_r && scid_r) ? `${email_r}|||${scid_r}` : `${pan}|||${prod}`;
    const pl = Number(r[pnlKey]) || bestPLByKey.get(bk_r) || 0;
    plArr.push(pl);
    if (pl > 0) { positivePL++; positivePLSum += pl; }
    else if (pl < 0) { negativePL++; negativePLSum += pl; }
    else zeroPL++;
    const plBucket = pl < -500000 ? '< -5L' : pl < -100000 ? '-5L to -1L' :
                     pl < 0 ? '-1L to 0' : pl === 0 ? 'Break-even' :
                     pl <= 100000 ? '0 to 1L' : pl <= 500000 ? '1L to 5L' : '> 5L';
    plBuckets[plBucket] = (plBuckets[plBucket] || 0) + 1;
    if (!productPLMap[prod]) productPLMap[prod] = [];
    productPLMap[prod].push(pl);
  }

  const PL_BUCKET_ORDER = ['< -5L', '-5L to -1L', '-1L to 0', 'Break-even', '0 to 1L', '1L to 5L', '> 5L'];
  const avgPLAtExit    = plArr.length   ? Math.round(plArr.reduce((a, b) => a + b, 0) / plArr.length) : 0;
  const avgPositivePL  = positivePL > 0 ? Math.round(positivePLSum / positivePL) : 0;
  const avgNegativePL  = negativePL > 0 ? Math.round(negativePLSum / negativePL) : 0;
  const totalReasons = Object.values(reasonMap).reduce((a, b) => a + b, 0);

  // ── Unique-client P&L: one entry per PAN, summing P&L across all their exits ──
  // A person who exited 3 products gets one row with totalPL = sum of all three.
  const panPLMap = new Map();
  for (const r of scopedExits) {
    const pan  = String(r['PAN'] || '').trim().toUpperCase();
    if (!pan) continue;
    const prod    = String(r['Smallcase Name'] || '').trim();
    const email_r = String(r['Email'] || '').trim().toLowerCase();
    const scid_r  = String(r['Scid']  || '').trim();
    const bk_r = (email_r && scid_r) ? `${email_r}|||${scid_r}` : `${pan}|||${prod}`;
    const pl = Number(r[pnlKey]) || bestPLByKey.get(bk_r) || 0;
    if (!panPLMap.has(pan)) {
      panPLMap.set(pan, {
        pan,
        name: String(r['User Name'] || r['Name'] || '').trim(),
        totalPL: 0,
        products: [],
        lastExitDate: null,
      });
    }
    const entry = panPLMap.get(pan);
    entry.totalPL += pl;
    if (prod && !entry.products.includes(prod)) entry.products.push(prod);
    const ed = parseExcelDate(r['Cycle End Date']);
    if (ed && (!entry.lastExitDate || ed > entry.lastExitDate)) entry.lastExitDate = ed;
  }

  const uniqueClients = [...panPLMap.values()];
  let ucPos = 0, ucNeg = 0, ucZero = 0, ucPosSum = 0, ucNegSum = 0;
  const ucBuckets = {};
  for (const c of uniqueClients) {
    const pl = c.totalPL;
    if (pl > 0)      { ucPos++;  ucPosSum += pl; }
    else if (pl < 0) { ucNeg++;  ucNegSum += pl; }
    else               ucZero++;
    const bucket = pl < -500000 ? '< -5L' : pl < -100000 ? '-5L to -1L' :
                   pl < 0 ? '-1L to 0' : pl === 0 ? 'Break-even' :
                   pl <= 100000 ? '0 to 1L' : pl <= 500000 ? '1L to 5L' : '> 5L';
    ucBuckets[bucket] = (ucBuckets[bucket] || 0) + 1;
  }
  const ucTotal = uniqueClients.length;
  const ucAvgPL = ucTotal > 0 ? Math.round(uniqueClients.reduce((a, c) => a + c.totalPL, 0) / ucTotal) : 0;

  return {
    exits: scopedExits,
    kpis: {
      totalExits: n,
      uniqueInvestors: exitedPANs.size,
      cycle1Exits: cycleCounts['1'],
      multiCycleExits: n - cycleCounts['1'],
      avgCycleAtExit:   n > 0 ? +(cycleSum / n).toFixed(1) : 0,
      avgTenureMonths:  tenureCount > 0 ? +(tenureSum / tenureCount).toFixed(1) : 0,
      winBacks:    winBackPANs.size,
      winBackRate: exitedPANs.size > 0 ? +(winBackPANs.size / exitedPANs.size * 100).toFixed(1) : 0,
      // Inclusive = current (exit counted even if client returned quickly)
      // Exclusive = treats short returns as continuity (exit not counted)
      shortReturnCount:              shortReturnPANs.size,
      totalExitsExclShort:           n - shortReturnExitCycles,
      uniqueInvestorsExclShort:      exitedPANs.size - shortReturnPANs.size,
      avgPLAtExit,
      avgPositivePL,
      avgNegativePL,
      positiveExits: positivePL,
      negativeExits: negativePL,
      pctPositiveExits: n > 0 ? +(positivePL / n * 100).toFixed(1) : 0,
      pctNegativeExits: n > 0 ? +(negativePL / n * 100).toFixed(1) : 0,
    },
    byProduct: Object.entries(productMap).sort((a, b) => b[1] - a[1])
      .map(([product, count]) => ({ product, count, pct: n > 0 ? +(count / n * 100).toFixed(1) : 0 })),
    byCycle: ['1', '2', '3', '4', '5+'].map(k => ({ cycle: `Cycle ${k}`, count: cycleCounts[k] })),
    byBroker: Object.entries(brokerMap).sort((a, b) => b[1] - a[1]).slice(0, 15)
      .map(([broker, count]) => ({ broker, count, pct: n > 0 ? +(count / n * 100).toFixed(1) : 0 })),
    byState: Object.entries(stateMap).sort((a, b) => b[1] - a[1]).slice(0, 15)
      .map(([state, count]) => ({ state, count })),
    monthlyTrend: Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month)),
    reasons: Object.entries(reasonMap).sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => ({ reason, count, pct: totalReasons > 0 ? +(count / totalReasons * 100).toFixed(1) : 0 })),
    winBackDetails: winBackDetails.sort((a, b) => (b.reSubDate?.getTime() || 0) - (a.reSubDate?.getTime() || 0)),
    shortReturnDetails: shortReturnDetails.sort((a, b) => (b.exitDate?.getTime() || 0) - (a.exitDate?.getTime() || 0)),
    plAnalysis: {
      avgPLAtExit,
      positiveCount: positivePL,
      negativeCount: negativePL,
      zeroCount:     zeroPL,
      pctPositive: n > 0 ? +(positivePL / n * 100).toFixed(1) : 0,
      pctNegative: n > 0 ? +(negativePL / n * 100).toFixed(1) : 0,
      byBucket: PL_BUCKET_ORDER.map(label => ({ label, count: plBuckets[label] || 0 })),
      byProduct: Object.entries(productPLMap)
        .map(([product, pls]) => ({
          product: product.length > 22 ? product.slice(0, 22) + '…' : product,
          avgPL: Math.round(pls.reduce((a, b) => a + b, 0) / pls.length),
          count: pls.length,
        }))
        .sort((a, b) => b.avgPL - a.avgPL)
        .slice(0, 12),
    },
    uniqueClientPL: {
      totalClients: ucTotal,
      positiveCount: ucPos,
      negativeCount: ucNeg,
      zeroCount:     ucZero,
      pctPositive: ucTotal > 0 ? +(ucPos  / ucTotal * 100).toFixed(1) : 0,
      pctNegative: ucTotal > 0 ? +(ucNeg  / ucTotal * 100).toFixed(1) : 0,
      avgPL:        ucAvgPL,
      avgPositivePL: ucPos > 0 ? Math.round(ucPosSum / ucPos) : 0,
      avgNegativePL: ucNeg > 0 ? Math.round(ucNegSum / ucNeg) : 0,
      byBucket: PL_BUCKET_ORDER.map(label => ({ label, count: ucBuckets[label] || 0 })),
      topLosers:  [...uniqueClients].sort((a, b) => a.totalPL - b.totalPL).slice(0, 10),
      topGainers: [...uniqueClients].sort((a, b) => b.totalPL - a.totalPL).slice(0, 10),
    },
    currentStatusLookup,
    pnlKey,
    bestPLLookup: Object.fromEntries(bestPLByKey),
  };
}

// ─── AUM & SUMMARY TIMELINE (monthly snapshots derived from raw subscription data) ─
// For each calendar month: computes active subscribers (Email+Scid deduped), unique
// investors (PAN), AUM sum, new starts, new signups, and cumulative totals.
export function getAUMSummaryTimeline(rawData, filters) {
  let data = filterNonPrivate(normalizeData(rawData));
  // Dimension filters (product/state/broker/etc.) are safe to apply per-row up
  // front. The date-period filter is NOT applied here — the running/cumulative
  // totals (totalSignups, totalSubscriptionCycles, AUM) need full history to be
  // correct; instead the period is applied afterwards by trimming which months
  // are returned (see bottom of this function).
  if (hasDimensionFilters(filters)) data = data.filter(row => matchesDimensionFilters(row, filters));

  // Pre-process rows (one pass)
  const rows = [];
  const newSubsByMK = new Map(); // 'YYYY-M' → { subs, signups }
  // Track which cycleKeys (subKey+cycle) have already been counted in newSubsByMK
  // so plan-duration variant rows (same subscription, different plan options) are
  // not counted as additional new subscriptions.
  const newSubsCountedKeys = new Set();

  for (const r of data) {
    const latestStatus = String(r['Latest Subscription Status'] || '').trim().toUpperCase().replace(/ /g, '_');
    if (latestStatus === 'REQUESTED_ACCESS') continue;

    const startD = parseExcelDate(r['Subscription Start Date']);
    if (!startD) continue;

    const email = String(r['Email'] || '').trim().toLowerCase();
    const scid  = String(r['Scid']  || '').trim();
    const pan   = String(r['PAN']   || '').trim().toUpperCase();
    const sc    = String(r['Smallcase Name'] || '').trim();
    const subKey = (email && scid) ? `${email}|||${scid}` : `${pan}|||${sc}`;
    if (!subKey || subKey === '|||') continue;

    const cycle = Number(r['Cycle Number']) || 0;
    const cycleKey = `${subKey}|||${cycle}`;
    const cycleStatus = String(r['Cycle Level Status'] || '').trim().toUpperCase();
    const isUnsub = cycleStatus === 'UNSUBSCRIBED';
    const cycleEndD = isUnsub ? parseExcelDate(r['Cycle End Date']) : null;

    // Count each unique cycleKey only once in newSubsByMK
    if (!newSubsCountedKeys.has(cycleKey)) {
      newSubsCountedKeys.add(cycleKey);
      const mk = `${startD.getFullYear()}-${startD.getMonth()}`;
      if (!newSubsByMK.has(mk)) newSubsByMK.set(mk, { subs: 0, signups: 0 });
      const bucket = newSubsByMK.get(mk);
      bucket.subs++;
      if (cycle <= 1) bucket.signups++;
    }

    rows.push({
      startT:    startD.getTime(),
      cycleEndT: cycleEndD ? cycleEndD.getTime() : Infinity,
      isUnsub,
      subKey,
      cycleKey,
      cycle,
      pan,
      aum: Number(r['AUM']) || Number(r['Networth']) || 0,
    });
  }

  if (!rows.length) return [];

  // Detect whether the dataset has a dedicated AUM column.
  // If not, we fall back to Networth — which is per-investor, not per-product,
  // so the monthly AUM sum must deduplicate by PAN.
  const hasAUMColumn = data.some(r => Number(r['AUM']) > 0);

  // Sort by start date for sweep-line advance
  rows.sort((a, b) => a.startT - b.startT);

  // Completed-cycle rows sorted by their end date
  const completedRows = rows
    .filter(r => r.isUnsub && r.cycleEndT !== Infinity)
    .sort((a, b) => a.cycleEndT - b.cycleEndT);

  // Build month range — anchored to the data's own latest activity, not
  // today's real date, so a stale upload doesn't tack on empty trailing
  // months at the end of the timeline.
  const minDate = new Date(rows[0].startT);
  const now = getLatestActivityDate(rawData);
  const months = [];
  const cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  while (cursor <= now) { months.push(new Date(cursor)); cursor.setMonth(cursor.getMonth() + 1); }

  // Sweep-line state
  let rowIdx = 0, completedIdx = 0;
  const cumPANs       = new Set();
  const cumCycles     = new Set();
  const cumCompleted  = new Set();

  const timeline = months.map(mStart => {
    const mEnd  = new Date(mStart.getFullYear(), mStart.getMonth() + 1, 0, 23, 59, 59);
    const mEndT = mEnd.getTime();

    // Advance cumulative pointers (rows sorted by startT / cycleEndT)
    while (rowIdx < rows.length && rows[rowIdx].startT <= mEndT) {
      const row = rows[rowIdx];
      if (row.pan) cumPANs.add(row.pan);
      cumCycles.add(row.cycleKey);
      rowIdx++;
    }
    while (completedIdx < completedRows.length && completedRows[completedIdx].cycleEndT <= mEndT) {
      cumCompleted.add(completedRows[completedIdx].cycleKey);
      completedIdx++;
    }

    // Active at month end: deduplicate by subKey, keep highest cycle
    const activeMap = new Map();
    for (let i = 0; i < rowIdx; i++) {
      const row = rows[i];
      if (row.isUnsub && row.cycleEndT <= mEndT) continue; // already exited
      const ex = activeMap.get(row.subKey);
      if (!ex || row.cycle > ex.cycle) activeMap.set(row.subKey, row);
    }

    let totalAUM = 0;
    const activePANs = new Set();
    if (hasAUMColumn) {
      // Per-product AUM column exists — safe to sum directly
      for (const row of activeMap.values()) {
        totalAUM += row.aum;
        if (row.pan) activePANs.add(row.pan);
      }
    } else {
      // Networth varies per product/basket, not one portfolio-wide figure per investor —
      // sum across each investor's distinct active holdings (activeMap is already deduped
      // one-row-per-basket, so this doesn't double-count any single holding).
      for (const row of activeMap.values()) {
        if (row.pan) {
          totalAUM += row.aum;
          activePANs.add(row.pan);
        }
      }
    }

    const mk = `${mStart.getFullYear()}-${mStart.getMonth()}`;
    const { subs: newSubscriptions = 0, signups: newSignups = 0 } = newSubsByMK.get(mk) || {};

    return {
      date: mStart,
      month:     `${mStart.toLocaleString('default', { month: 'short' })} '${String(mStart.getFullYear()).slice(2)}`,
      monthFull: `${mStart.toLocaleString('default', { month: 'long' })} ${mStart.getFullYear()}`,
      aum:        totalAUM,
      aumCrores:  +(totalAUM / 1e7).toFixed(2),
      totalActiveSubscriptions: activeMap.size,
      totalInvestors:           activePANs.size,
      newSubscriptions,
      newSignups,
      totalSignups:             cumPANs.size,
      totalSubscriptionCycles:  cumCycles.size,
      completedCycles:          cumCompleted.size,
    };
  });

  // Apply the period filter LAST, by trimming which months are shown — the
  // cumulative math above needs every month up to "now" to be correct.
  if (filters?.dateFrom || filters?.dateTo) {
    const from = filters.dateFrom || null;
    const to   = filters.dateTo ? toEndOfDay(filters.dateTo) : null;
    return timeline.filter(m => inRange(m.date, from, to));
  }
  return timeline;
}

// ─── HELPER: normalise plan amount to monthly ─────────────────────────────────
function toMonthly(amount, planDuration) {
  const d = String(planDuration || '').toLowerCase();
  if (d.includes('annual') || d.includes('year') || d.includes('yearly')) return amount / 12;
  if (d.includes('quarter')) return amount / 3;
  if (d.includes('semi') || d.includes('half')) return amount / 6;
  // Heuristic: amounts over ₹3000 are likely annual fees
  if (amount > 3000) return amount / 12;
  return amount;
}

// ─── MRR / ARR METRICS ────────────────────────────────────────────────────────
export function getMRRMetrics(currentMaster, rawData) {
  const normalized = filterNonPrivate(normalizeData(rawData));
  const activeSubs = deduplicateByPAN(currentMaster.filter(isActive));

  // Current MRR from active unique investors
  const currentMRR = activeSubs.reduce((sum, r) => {
    const amt = Number(r['Plan Amount']) || 0;
    return sum + toMonthly(amt, r['Plan Duration']);
  }, 0);

  // Deduplicate normalized rows by Email+Scid+Cycle so plan-duration variant rows
  // don't inflate MRR (same subscription counted multiple times).
  const mrrDedup = new Map();
  for (const r of normalized) {
    const email = String(r['Email'] || '').trim().toLowerCase();
    const scid  = String(r['Scid']  || '').trim();
    const pan   = String(r['PAN']   || '').trim().toUpperCase();
    const sc    = String(r['Smallcase Name'] || '').trim();
    const cycle = Number(r['Cycle Number']) || 0;
    const bk = (email && scid) ? `${email}|||${scid}` : `${pan}|||${sc}`;
    const key = `${bk}|||${cycle}`;
    if (!mrrDedup.has(key)) mrrDedup.set(key, r);
  }
  const mrrRows = Array.from(mrrDedup.values());

  // Monthly MRR trend: walk each month, sum active plan amounts for that snapshot
  const monthMap = new Map();
  for (const r of mrrRows) {
    const start = parseExcelDate(r['Subscription Start Date']);
    const end   = parseExcelDate(r['Cycle End Date']);
    if (!start) continue;
    const amt = toMonthly(Number(r['Plan Amount']) || 0, r['Plan Duration']);
    if (!amt) continue;
    // Mark this subscription as contributing MRR from its start month
    const sk = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
    if (!monthMap.has(sk)) monthMap.set(sk, { month: sk, newMRR: 0, churnMRR: 0, activeMRR: 0, subs: 0 });
    monthMap.get(sk).newMRR += amt;
    monthMap.get(sk).subs++;
    if (end) {
      const ek = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}`;
      if (!monthMap.has(ek)) monthMap.set(ek, { month: ek, newMRR: 0, churnMRR: 0, activeMRR: 0, subs: 0 });
      const cs = String(r['Cycle Level Status'] || '').trim().toUpperCase();
      if (cs === 'UNSUBSCRIBED') monthMap.get(ek).churnMRR += amt;
    }
  }

  // Compute cumulative active MRR
  const months = [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month));
  let running = 0;
  for (const m of months) { running += m.newMRR - m.churnMRR; m.activeMRR = Math.max(0, running); }

  // MRR by product (current)
  const productMRR = new Map();
  for (const r of activeSubs) {
    const p = r['Smallcase Name'] || 'Unknown';
    const amt = toMonthly(Number(r['Plan Amount']) || 0, r['Plan Duration']);
    productMRR.set(p, (productMRR.get(p) || 0) + amt);
  }
  const byProduct = [...productMRR.entries()]
    .map(([product, mrr]) => ({ product, mrr: Math.round(mrr), arr: Math.round(mrr * 12) }))
    .sort((a, b) => b.mrr - a.mrr);

  return {
    currentMRR: Math.round(currentMRR),
    currentARR: Math.round(currentMRR * 12),
    activeInvestors: activeSubs.length,
    avgRevenuePerUser: activeSubs.length > 0 ? Math.round(currentMRR / activeSubs.length) : 0,
    trend: months.slice(-18).map(m => ({
      month: m.month,
      newMRR: Math.round(m.newMRR),
      churnMRR: Math.round(m.churnMRR),
      activeMRR: Math.round(m.activeMRR),
      netMRR: Math.round(m.newMRR - m.churnMRR),
    })),
    byProduct,
  };
}

// ─── REVENUE AT RISK ──────────────────────────────────────────────────────────
// currentMaster here should be the DIMENSION-filtered master, not period-filtered —
// this is a forward-looking (next 90 days from today) forecast, so a past-dated
// period filter ("6M", a custom range, etc.) must never hide a subscription
// that's actually expiring soon just because it started outside that window.
export function getRevenueAtRisk(currentMaster, filters) {
  const now = new Date();
  const d30 = new Date(now); d30.setDate(d30.getDate() + 30);
  const d60 = new Date(now); d60.setDate(d60.getDate() + 60);
  const d90 = new Date(now); d90.setDate(d90.getDate() + 90);

  const dimFiltered = hasDimensionFilters(filters)
    ? currentMaster.filter(row => matchesDimensionFilters(row, filters))
    : currentMaster;
  const activeSubs = deduplicateByPAN(dimFiltered.filter(isActive));
  const buckets = { '0-30': [], '31-60': [], '61-90': [], '90+': [] };

  for (const r of activeSubs) {
    const expiry = parseExcelDate(r['Cycle End Date']);
    if (!expiry || expiry < now) continue;
    const amt = Number(r['Plan Amount']) || 0;
    const daysLeft = Math.ceil((expiry - now) / 86400000);
    const entry = {
      name: r['User Name'] || '—', pan: String(r['PAN'] || '').trim().toUpperCase(),
      product: r['Smallcase Name'] || '—', broker: r['Broker Name'] || '—',
      cycle: Number(r['Cycle Number']) || 1, planAmount: amt,
      networth: Number(r['Networth']) || 0, pnl: Number(r['Total PnL']) || 0,
      expiryDate: expiry.toISOString().slice(0, 10), daysLeft,
      churnRisk: daysLeft <= 30 ? 'High' : daysLeft <= 60 ? 'Medium' : 'Low',
    };
    if (expiry <= d30) buckets['0-30'].push(entry);
    else if (expiry <= d60) buckets['31-60'].push(entry);
    else if (expiry <= d90) buckets['61-90'].push(entry);
    else buckets['90+'].push(entry);
  }

  const summarize = (rows) => ({
    count: rows.length,
    revenue: rows.reduce((s, r) => s + r.planAmount, 0),
    avgNetworth: rows.length ? Math.round(rows.reduce((s, r) => s + r.networth, 0) / rows.length) : 0,
    rows: rows.sort((a, b) => b.planAmount - a.planAmount),
  });

  return {
    total: activeSubs.length,
    buckets: {
      critical: summarize(buckets['0-30']),
      warning:  summarize(buckets['31-60']),
      watch:    summarize(buckets['61-90']),
      safe:     summarize(buckets['90+']),
    },
    totalAtRisk: [...buckets['0-30'], ...buckets['31-60'], ...buckets['61-90']],
  };
}

// ─── LTV (LIFETIME VALUE) ─────────────────────────────────────────────────────
export function getLTVData(rawData, currentMaster) {
  const normalized = filterNonPrivate(normalizeData(rawData));

  // Which PANs are in scope for the currently selected filters (dimension +
  // period). LTV totals themselves stay lifetime figures — that's the point
  // of "Lifetime Value" — but WHICH investors show up respects the filter,
  // same as every other tab.
  const scopedPANs = currentMaster
    ? new Set(currentMaster.map(r => String(r['PAN'] || '').trim().toUpperCase()).filter(Boolean))
    : null;

  // Deduplicate by PAN+Smallcase+Cycle before accumulating spend so plan-duration
  // variant rows (same subscription, different plan options) don't inflate LTV.
  const ltvDedup = new Map();
  for (const r of normalized) {
    const pan = String(r['PAN'] || '').trim().toUpperCase();
    if (!pan) continue;
    const sc    = String(r['Smallcase Name'] || '').trim();
    const cycle = Number(r['Cycle Number']) || 1;
    const key   = `${pan}|||${sc}|||${cycle}`;
    if (!ltvDedup.has(key)) ltvDedup.set(key, r);
  }
  const ltvRows = Array.from(ltvDedup.values());

  // Accumulate total spend per PAN across all cycles and products
  const panMap = new Map();
  for (const r of ltvRows) {
    const pan = String(r['PAN'] || '').trim().toUpperCase();
    if (!pan) continue;
    const amt = Number(r['Plan Amount']) || 0;
    const cycle = Number(r['Cycle Number']) || 1;
    const product = r['Smallcase Name'] || 'Unknown';
    const status = String(r['Latest Subscription Status'] || r['Cycle Level Status'] || '').trim().toUpperCase();
    if (!panMap.has(pan)) panMap.set(pan, {
      pan, name: r['User Name'] || '—', totalSpend: 0, cycles: 0,
      products: new Set(), status: 'UNSUBSCRIBED', networth: 0, pnl: 0, firstSub: null, lastSub: null,
    });
    const e = panMap.get(pan);
    e.totalSpend += amt;
    e.cycles = Math.max(e.cycles, cycle);
    e.products.add(product);
    if (status !== 'UNSUBSCRIBED') e.status = 'ACTIVE';
    e.networth = Math.max(e.networth, Number(r['Networth']) || 0);
    e.pnl = Number(r['Total PnL']) || e.pnl;
    const d = parseExcelDate(r['Subscription Start Date']);
    if (d) { if (!e.firstSub || d < e.firstSub) e.firstSub = d; if (!e.lastSub || d > e.lastSub) e.lastSub = d; }
  }

  const investors = [...panMap.values()]
    .filter(e => !scopedPANs || scopedPANs.has(e.pan))
    .map(e => ({
      ...e, products: e.products.size, productList: [...e.products].join(', '),
      tenureMonths: e.firstSub && e.lastSub
        ? Math.max(1, Math.round((e.lastSub - e.firstSub) / (30.44 * 86400000)))
        : 1,
    })).sort((a, b) => b.totalSpend - a.totalSpend);

  const totalLTV = investors.reduce((s, i) => s + i.totalSpend, 0);
  const avgLTV = investors.length ? Math.round(totalLTV / investors.length) : 0;
  const activeInvestors = investors.filter(i => i.status === 'ACTIVE');
  const avgActiveLTV = activeInvestors.length ? Math.round(activeInvestors.reduce((s, i) => s + i.totalSpend, 0) / activeInvestors.length) : 0;

  // LTV by networth bucket
  const nwBuckets = [
    { label: '< ₹1L',      min: 0,        max: 100000 },
    { label: '₹1L-₹5L',   min: 100000,   max: 500000 },
    { label: '₹5L-₹25L',  min: 500000,   max: 2500000 },
    { label: '₹25L-₹1Cr', min: 2500000,  max: 10000000 },
    { label: '> ₹1Cr',    min: 10000000, max: Infinity },
  ];
  const ltvByNW = nwBuckets.map(b => {
    const rows = investors.filter(i => i.networth >= b.min && i.networth < b.max);
    return { label: b.label, count: rows.length, avgLTV: rows.length ? Math.round(rows.reduce((s, i) => s + i.totalSpend, 0) / rows.length) : 0 };
  });

  return { investors: investors.slice(0, 200), totalLTV, avgLTV, avgActiveLTV, ltvByNW, totalInvestors: investors.length };
}

// ─── INVESTOR 360 SEARCH ──────────────────────────────────────────────────────
export function searchInvestor(rawData, query) {
  if (!query || query.trim().length < 2) return null;
  const normalized = filterNonPrivate(normalizeData(rawData));
  const q = query.trim().toLowerCase();

  const matches = normalized.filter(r => {
    const name  = String(r['User Name'] || '').toLowerCase();
    const email = String(r['Email'] || '').toLowerCase();
    const pan   = String(r['PAN'] || '').toLowerCase();
    return name.includes(q) || email.includes(q) || pan.includes(q);
  });
  if (!matches.length) return { found: false };

  // Group by PAN → find the canonical PAN
  const panSet = new Set(matches.map(r => String(r['PAN'] || '').trim().toUpperCase()).filter(Boolean));
  const primaryPAN = [...panSet][0];

  // Get all rows for any matched PAN
  const allRows = normalized.filter(r => panSet.has(String(r['PAN'] || '').trim().toUpperCase()) || matches.includes(r));

  const repr = allRows.reduce((best, r) => {
    const cycle = Number(r['Cycle Number']) || 0;
    return (!best || cycle > (Number(best['Cycle Number']) || 0)) ? r : best;
  }, null);

  // Timeline: one entry per product+cycle
  const cycleMap = new Map();
  for (const r of allRows) {
    const email = String(r['Email'] || '').trim().toLowerCase();
    const scid  = String(r['Scid'] || '').trim();
    const pan   = String(r['PAN'] || '').trim().toUpperCase();
    const sc    = String(r['Smallcase Name'] || '').trim();
    const cycle = Number(r['Cycle Number']) || 0;
    const key   = `${(email || pan)}|||${(scid || sc)}|||${cycle}`;
    if (!cycleMap.has(key)) cycleMap.set(key, r);
  }
  const timeline = [...cycleMap.values()].sort((a, b) => {
    const da = parseExcelDate(a['Subscription Start Date']);
    const db = parseExcelDate(b['Subscription Start Date']);
    return (db || 0) - (da || 0);
  }).map(r => ({
    product: r['Smallcase Name'] || '—',
    cycle: Number(r['Cycle Number']) || 1,
    status: r['Cycle Level Status'] || r['Latest Subscription Status'] || '—',
    startDate: r['Subscription Start Date'] ? parseExcelDate(r['Subscription Start Date'])?.toISOString().slice(0, 10) : '—',
    endDate:   r['Cycle End Date'] ? parseExcelDate(r['Cycle End Date'])?.toISOString().slice(0, 10) : '—',
    planAmount: Number(r['Plan Amount']) || 0,
    discount:   Number(r['Offer Discount']) || 0,
    offerCode:  r['Offer Code'] || '—',
    cancelReason: r['Cancellation Reason'] || '—',
  }));

  const products = [...new Set(allRows.map(r => r['Smallcase Name']).filter(Boolean))];
  const totalSpend = timeline.reduce((s, t) => s + t.planAmount, 0);
  const maxCycle = Math.max(...timeline.map(t => t.cycle), 1);

  return {
    found: true,
    name: repr?.['User Name'] || '—',
    pan: primaryPAN || '—',
    email: String(repr?.['Email'] || '').trim(),
    state: repr?.['State'] || '—',
    broker: repr?.['Broker Name'] || '—',
    attribution: repr?.['Attribution Source'] || '—',
    riskProfile: repr?.['Risk Profile'] || '—',
    networth: Number(repr?.['Networth']) || 0,
    pnl: Number(repr?.['Total PnL']) || 0,
    status: repr?.['Latest Subscription Status'] || '—',
    products, timeline, totalSpend, maxCycle,
    firstSubDate: timeline.length ? timeline[timeline.length - 1].startDate : '—',
  };
}

// ─── CHURN RISK SCORES ────────────────────────────────────────────────────────
// currentMaster here should be the DIMENSION-filtered master, not period-filtered
// — this scores CURRENTLY active subscriptions by risk of churning soon, so a
// past-dated period filter must not exclude a long-tenured active subscriber
// just because they started outside that window.
export function getChurnRiskScores(currentMaster, filters) {
  const dimFiltered = hasDimensionFilters(filters)
    ? currentMaster.filter(row => matchesDimensionFilters(row, filters))
    : currentMaster;
  const activeSubs = deduplicateByPAN(dimFiltered.filter(isActive));
  const now = new Date();

  const scored = activeSubs.map(r => {
    let score = 0;
    const cycle  = Number(r['Cycle Number']) || 1;
    const nw     = Number(r['Networth']) || 0;
    const pnl    = Number(r['Total PnL']) || 0;
    const amt    = Number(r['Plan Amount']) || 0;
    const disc   = Number(r['Offer Discount']) || 0;
    const start  = parseExcelDate(r['Subscription Start Date']);
    const expiry = parseExcelDate(r['Cycle End Date']);
    const daysActive = start ? Math.floor((now - start) / 86400000) : 365;
    const daysLeft   = expiry ? Math.ceil((expiry - now) / 86400000) : 90;
    const pnlPct     = nw > 0 ? (pnl / nw) * 100 : (amt > 0 ? (pnl / amt) * 100 : 0);

    // Cycle risk: first-timers churn more
    if (cycle === 1) score += 3;
    else if (cycle === 2) score += 1;

    // P&L risk
    if (pnlPct < -20) score += 4;
    else if (pnlPct < -5) score += 2;
    else if (pnlPct > 10) score -= 2;

    // Days left risk
    if (daysLeft <= 15) score += 3;
    else if (daysLeft <= 30) score += 2;
    else if (daysLeft <= 60) score += 1;

    // Discount dependency risk
    if (disc > 0 && amt > 0 && (disc / amt) > 0.4) score += 2;
    else if (disc > 0) score += 1;

    // New subscriber risk
    if (daysActive < 30) score += 1;

    const riskLevel = score >= 7 ? 'Critical' : score >= 5 ? 'High' : score >= 3 ? 'Medium' : 'Low';
    return {
      name: r['User Name'] || '—',
      pan: String(r['PAN'] || '').trim().toUpperCase(),
      product: r['Smallcase Name'] || '—',
      broker: r['Broker Name'] || '—',
      cycle, score, riskLevel,
      networth: nw, pnl, planAmount: amt, pnlPct: Math.round(pnlPct * 10) / 10,
      daysLeft, daysActive,
    };
  }).sort((a, b) => b.score - a.score);

  const byLevel = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  for (const s of scored) byLevel[s.riskLevel]++;

  return { scored, byLevel, total: scored.length };
}

// ─── REACTIVATION PIPELINE ────────────────────────────────────────────────────
export function getReactivationPipeline(rawData, filters) {
  const normalized = filterNonPrivate(normalizeData(rawData));
  const now = new Date();
  const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 180);
  // A selected period filter overrides the default "last 180 days" window —
  // consistent with the rest of the dashboard, an explicit period means
  // "reactivation candidates who exited in that window," not always-180-days.
  const periodFrom = filters?.dateFrom || null;
  const periodTo   = filters?.dateTo ? toEndOfDay(filters.dateTo) : null;

  // One exit per unique investor-product (full history — needed to find each
  // base key's LAST exit cycle correctly regardless of the period filter)
  const exitMap = new Map();
  for (const r of normalized) {
    const cs = String(r['Cycle Level Status'] || '').trim().toUpperCase();
    if (cs !== 'UNSUBSCRIBED') continue;
    const email = String(r['Email'] || '').trim().toLowerCase();
    const scid  = String(r['Scid'] || '').trim();
    const pan   = String(r['PAN'] || '').trim().toUpperCase();
    const sc    = String(r['Smallcase Name'] || '').trim();
    const base  = (email && scid) ? `${email}|||${scid}` : `${pan}|||${sc}`;
    const cycle = Number(r['Cycle Number']) || 0;
    const ex = exitMap.get(base);
    if (!ex || cycle > (Number(ex['Cycle Number']) || 0)) exitMap.set(base, r);
  }

  // Filter to recent exits (or the selected period, if one is set) + dimension filters
  const recent = [...exitMap.values()].filter(r => {
    if (!matchesDimensionFilters(r, filters)) return false;
    const d = parseExcelDate(r['Exit Date']) || parseExcelDate(r['Cycle End Date']);
    if (!d) return false;
    return (periodFrom || periodTo) ? inRange(d, periodFrom, periodTo) : d >= cutoff;
  });

  // Score reactivation potential
  const scored = recent.map(r => {
    let score = 0;
    const nw    = Number(r['Networth']) || 0;
    const pnl   = Number(r['Total PnL']) || 0;
    const amt   = Number(r['Plan Amount']) || 0;
    const cycle = Number(r['Cycle Number']) || 1;
    const pnlPct = (nw || amt) > 0 ? (pnl / (nw || amt)) * 100 : 0;
    const reason = String(r['Cancellation Reason'] || '').toLowerCase();
    const exitD  = parseExcelDate(r['Exit Date']) || parseExcelDate(r['Cycle End Date']);
    const daysSinceExit = exitD ? Math.floor((now - exitD) / 86400000) : 180;

    // Positive P&L = amenable to return
    if (pnlPct > 10) score += 3;
    else if (pnlPct > 0) score += 1;
    else if (pnlPct < -15) score -= 2;

    // High networth = valuable win-back
    if (nw > 10000000) score += 3;
    else if (nw > 2500000) score += 2;
    else if (nw > 500000) score += 1;

    // Pricing-related exit = can offer deal
    if (reason.includes('pric') || reason.includes('cost') || reason.includes('expen')) score += 2;
    if (reason.includes('perform') || reason.includes('return') || reason.includes('loss')) score -= 1;

    // Loyal (multiple cycles) = higher chance to return
    if (cycle >= 3) score += 2;
    else if (cycle >= 2) score += 1;

    // Recent exit = urgent
    if (daysSinceExit <= 30) score += 2;
    else if (daysSinceExit <= 60) score += 1;

    return {
      name: r['User Name'] || '—',
      pan: String(r['PAN'] || '').trim().toUpperCase(),
      product: r['Smallcase Name'] || '—',
      broker: r['Broker Name'] || '—',
      state: r['State'] || '—',
      cycle, score, networth: nw, pnl, planAmount: amt,
      pnlPct: Math.round(pnlPct * 10) / 10,
      cancelReason: r['Cancellation Reason'] || '—',
      exitDate: exitD ? exitD.toISOString().slice(0, 10) : '—',
      daysSinceExit,
      priority: score >= 6 ? 'Hot' : score >= 4 ? 'Warm' : score >= 2 ? 'Possible' : 'Cold',
    };
  }).sort((a, b) => b.score - a.score);

  const byPriority = { Hot: 0, Warm: 0, Possible: 0, Cold: 0 };
  for (const s of scored) byPriority[s.priority]++;

  return { scored, byPriority, total: scored.length, totalRevenuePotential: scored.reduce((s, r) => s + r.planAmount, 0) };
}

// ─── RM PERFORMANCE ───────────────────────────────────────────────────────────
export function getRMPerformance(currentMaster, rawData) {
  const normalized = filterNonPrivate(normalizeData(rawData));
  const rmMap = new Map();

  for (const r of currentMaster) {
    const rm = String(r['RM Email'] || '').trim().toLowerCase() || 'Unassigned';
    if (!rmMap.has(rm)) rmMap.set(rm, []);
    rmMap.get(rm).push(r);
  }

  // Also compute exits per RM from rawData
  const exitMap = new Map();
  for (const r of normalized) {
    const cs = String(r['Cycle Level Status'] || '').trim().toUpperCase();
    if (cs !== 'UNSUBSCRIBED') continue;
    const rm = String(r['RM Email'] || '').trim().toLowerCase() || 'Unassigned';
    exitMap.set(rm, (exitMap.get(rm) || 0) + 1);
  }

  return Array.from(rmMap.entries()).map(([rm, rows]) => {
    const deduped = deduplicateByPAN(rows);
    const active  = deduped.filter(isActive);
    const exited  = deduped.filter(isExited).length;
    const renewed = active.filter(r => (Number(r['Cycle Number']) || 0) > 1).length;
    const nws     = active.map(r => Number(r['Networth']) || 0).filter(n => n > 0);
    const pnls    = active.map(r => Number(r['Total PnL']) || 0);
    const revenue = deduped.reduce((s, r) => s + (Number(r['Plan Amount']) || 0), 0);
    return {
      rm: rm === 'unassigned' ? 'Unassigned' : rm,
      total: deduped.length, active: active.length, exited,
      activeRate: deduped.length > 0 ? +(active.length / deduped.length * 100).toFixed(1) : 0,
      renewalRate: active.length > 0 ? +(renewed / active.length * 100).toFixed(1) : 0,
      avgNetworth: Math.round(avg(nws)),
      avgPnL: Math.round(avg(pnls)),
      totalRevenue: Math.round(revenue),
      avgRevenue: deduped.length > 0 ? Math.round(revenue / deduped.length) : 0,
    };
  }).filter(r => r.rm !== 'Unassigned' || r.total > 0).sort((a, b) => b.total - a.total);
}

// ─── RENEWAL CALENDAR ─────────────────────────────────────────────────────────
// currentMaster here should be the DIMENSION-filtered master, not period-filtered
// — this is a forward-looking calendar of upcoming expiries, so a past-dated
// period filter must not hide a subscription expiring soon just because it
// started outside that window.
export function getRenewalCalendar(currentMaster, filters) {
  const now = new Date();
  const dimFiltered = hasDimensionFilters(filters)
    ? currentMaster.filter(row => matchesDimensionFilters(row, filters))
    : currentMaster;
  const activeSubs = deduplicateByPAN(dimFiltered.filter(isActive));
  const calMap = new Map();

  for (const r of activeSubs) {
    const expiry = parseExcelDate(r['Cycle End Date']);
    if (!expiry || expiry < now) continue;
    const key = `${expiry.getFullYear()}-${String(expiry.getMonth() + 1).padStart(2, '0')}`;
    if (!calMap.has(key)) calMap.set(key, { month: key, count: 0, revenue: 0, rows: [] });
    const entry = calMap.get(key);
    entry.count++;
    entry.revenue += Number(r['Plan Amount']) || 0;
    entry.rows.push({
      name: r['User Name'] || '—', pan: String(r['PAN'] || '').trim().toUpperCase(),
      product: r['Smallcase Name'] || '—', broker: r['Broker Name'] || '—',
      cycle: Number(r['Cycle Number']) || 1,
      planAmount: Number(r['Plan Amount']) || 0,
      expiryDate: expiry.toISOString().slice(0, 10),
      networth: Number(r['Networth']) || 0,
    });
  }

  return [...calMap.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(0, 12)
    .map(m => ({ ...m, rows: m.rows.sort((a, b) => b.planAmount - a.planAmount) }));
}

// ─── OFFER CODE ROI ───────────────────────────────────────────────────────────
export function getOfferCodeROI(currentMaster, rawData) {
  const normalized = filterNonPrivate(normalizeData(rawData));

  // For each PAN, find their first subscription's offer code and whether they renewed
  const panFirst = new Map();
  for (const r of normalized) {
    const pan = String(r['PAN'] || '').trim().toUpperCase();
    if (!pan) continue;
    const cycle = Number(r['Cycle Number']) || 0;
    if (cycle > 1) continue; // only first-touch
    const ex = panFirst.get(pan);
    const d = parseExcelDate(r['Subscription Start Date']);
    if (!ex || (d && (!ex.d || d < ex.d))) panFirst.set(pan, { r, d, code: String(r['Offer Code'] || '').trim() || 'No Code' });
  }

  // Find max cycle achieved per PAN
  const panMaxCycle = new Map();
  for (const r of normalized) {
    const pan = String(r['PAN'] || '').trim().toUpperCase();
    if (!pan) continue;
    const cycle = Number(r['Cycle Number']) || 0;
    panMaxCycle.set(pan, Math.max(panMaxCycle.get(pan) || 0, cycle));
  }

  // Build per-code aggregates
  const codeMap = new Map();
  for (const [pan, { code, r }] of panFirst) {
    if (!codeMap.has(code)) codeMap.set(code, {
      code, acquired: 0, renewed: 0, totalDiscount: 0, totalNW: 0, nwCount: 0, totalPnL: 0,
    });
    const e = codeMap.get(code);
    e.acquired++;
    if ((panMaxCycle.get(pan) || 0) > 1) e.renewed++;
    e.totalDiscount += Number(r['Offer Discount']) || 0;
    const nw = Number(r['Networth']) || 0;
    if (nw > 0) { e.totalNW += nw; e.nwCount++; }
    e.totalPnL += Number(r['Total PnL']) || 0;
  }

  return [...codeMap.values()].map(e => ({
    code: e.code,
    acquired: e.acquired,
    renewed: e.renewed,
    renewalRate: e.acquired > 0 ? +(e.renewed / e.acquired * 100).toFixed(1) : 0,
    avgDiscount: e.acquired > 0 ? Math.round(e.totalDiscount / e.acquired) : 0,
    totalDiscountCost: Math.round(e.totalDiscount),
    avgNetworth: e.nwCount > 0 ? Math.round(e.totalNW / e.nwCount) : 0,
    avgPnL: e.acquired > 0 ? Math.round(e.totalPnL / e.acquired) : 0,
    retentionValue: e.renewed,
  })).sort((a, b) => b.acquired - a.acquired).slice(0, 25);
}

// ─── FILE READER ──────────────────────────────────────────────────────────────
export function readExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
        // Look for a summary sheet (any sheet after the first that has a "Date" column)
        let summary = null;
        for (let i = 1; i < wb.SheetNames.length; i++) {
          const s = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[i]], { defval: '' });
          if (s.length && Object.keys(s[0]).some(k => k.toLowerCase().trim() === 'date')) {
            summary = s;
            break;
          }
        }
        resolve({ rows, summary });
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}
