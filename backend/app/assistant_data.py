"""Data side of the dashboard assistant: the latest uploaded dataset, held in
memory in a compact column-wise form, plus the read-only lookups the model is
allowed to run on it (aggregate / list rows / distinct values).

The model never receives the dataset itself — 225k+ rows wouldn't fit in a
request — it asks for these lookups and only their results go back to it.

Definitions mirror src/dataEngine.js so the assistant's numbers match the
dashboard's: same column-name normalisation (CANONICAL), private smallcases
excluded everywhere, the "current subscription master" (one row per client per
smallcase, latest cycle) and the same "active" statuses. Keep the two in step
if those definitions change.
"""
import re
import statistics
import threading
from datetime import date, datetime

from sqlalchemy.orm import Session

from app.models import UploadData, UploadSession

# ── Mirrors src/dataEngine.js ────────────────────────────────────────────────
CANONICAL = {
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
    'first subs date': 'First Subscription Date',
    'aum': 'AUM', 'assets under management': 'AUM',
    'total active subscriptions': 'Total Active Subscriptions', 'active subscriptions': 'Total Active Subscriptions',
    'total investors': 'Total Investors', 'investors': 'Total Investors',
    'new subscriptions': 'New Subscriptions',
    'total completed subscription cycles': 'Completed Cycles', 'total completed cycles': 'Completed Cycles', 'completed subscription cycles': 'Completed Cycles',
    'total subscription cycles': 'Total Subscription Cycles', 'subscription cycles': 'Total Subscription Cycles',
    'new signups': 'New Signups',
    'total signups': 'Total Signups',
}
ACTIVE_STATUSES = {'SUBSCRIBED', 'GRACE PERIOD', 'GRACE_PERIOD', 'SUBSCRIBED_USER_CANCELLED'}

IS_ACTIVE = 'Is Active'
INVESTOR_ACTIVE = 'Investor Currently Active'
INVESTOR_ID = 'Investor ID'   # PAN, or Email when PAN is blank — the dashboard's key for monthly movements

_ISO_DATE = re.compile(r'^\d{4}-\d{2}-\d{2}')
_NUM = re.compile(r'^-?\d+(\.\d+)?$')


def _num(v) -> float:
    """JS Number(v) || 0 — what dataEngine.js uses for Cycle Number etc."""
    try:
        f = float(str(v).strip().replace(',', '')) if str(v).strip() else 0.0
        return f if f == f else 0.0
    except ValueError:
        return 0.0


def _parse_date(v):
    s = str(v or '').strip()
    if not s:
        return None
    if _ISO_DATE.match(s):
        try:
            return date.fromisoformat(s[:10])
        except ValueError:
            return None
    for fmt in ('%m/%d/%Y', '%m/%d/%y', '%d-%m-%Y', '%d/%m/%Y'):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None


class Dataset:
    """Column-wise copy of the uploaded rows. `views` maps a view name to the
    list of row indexes it covers."""

    def __init__(self, raw_rows: list, file_name: str, uploaded_at):
        self.file_name = file_name
        self.uploaded_at = uploaded_at
        first = raw_rows[0] if raw_rows else {}
        key_map = {k: CANONICAL.get(k.lower().strip(), k) for k in first.keys()}
        self.columns = list(dict.fromkeys(key_map.values()))
        intern: dict = {}
        cols = {c: [] for c in self.columns}
        for row in raw_rows:
            for orig, canon in key_map.items():
                v = row.get(orig, '')
                v = '' if v is None else str(v)
                cols[canon].append(intern.setdefault(v, v))
        self.n = len(raw_rows)

        # Column types, from a sample: dates are ISO text, numbers are plain
        self.date_cols, self.num_cols = set(), set()
        for c in self.columns:
            sample = [v for v in cols[c][:20000] if v.strip()][:5000]
            if not sample:
                continue
            if sum(1 for v in sample if _ISO_DATE.match(v)) >= 0.9 * len(sample):
                self.date_cols.add(c)
            elif sum(1 for v in sample if _NUM.match(v.replace(',', ''))) >= 0.95 * len(sample):
                self.num_cols.add(c)
        for c in self.date_cols:
            cols[c] = [v[:10] if _ISO_DATE.match(v) else '' for v in cols[c]]
        for c in self.num_cols:
            cols[c] = [(_num(v) if v.strip() else None) for v in cols[c]]
        self.cols = cols

        get = lambda c, i: cols[c][i] if c in cols else ''
        upper = lambda c, i: str(get(c, i) or '').strip().upper()

        # Private smallcases (or no smallcase) are excluded from every calculation
        non_private = [i for i in range(self.n)
                       if (sc := str(get('Smallcase Name', i) or '').strip()) and 'private' not in sc.lower()]

        # Current subscription master: one row per Email+Scid (fallback PAN+Smallcase),
        # highest Cycle Number, tie → latest First Subscription Date; no REQUESTED_ACCESS
        master: dict = {}
        for i in non_private:
            if upper('Latest Subscription Status', i).replace(' ', '_') == 'REQUESTED_ACCESS':
                continue
            email = str(get('Email', i) or '').strip().lower()
            scid = str(get('Scid', i) or '').strip()
            pan = upper('PAN', i)
            sc = str(get('Smallcase Name', i) or '').strip()
            key = f'{email}|||{scid}' if (email and scid) else f'{pan}|||{sc}'
            if key == '|||':
                continue
            ex = master.get(key)
            if ex is None:
                master[key] = i
                continue
            rc, ec = _num(get('Cycle Number', i)), _num(get('Cycle Number', ex))
            if rc > ec:
                master[key] = i
            elif rc == ec:
                rd = _parse_date(get('First Subscription Date', i) or get('Subscription Start Date', i))
                ed = _parse_date(get('First Subscription Date', ex) or get('Subscription Start Date', ex))
                if rd and ed and rd > ed:
                    master[key] = i
        subscriptions = sorted(master.values())

        # Derived columns
        is_active = ['Yes' if str(get('Latest Subscription Status', i) or '').upper() in ACTIVE_STATUSES else 'No'
                     for i in range(self.n)]
        active_pans = {upper('PAN', i) for i in subscriptions if is_active[i] == 'Yes'} - {''}
        cols[IS_ACTIVE] = is_active
        cols[INVESTOR_ACTIVE] = ['Yes' if upper('PAN', i) in active_pans else 'No' for i in range(self.n)]
        cols[INVESTOR_ID] = [upper('PAN', i) or upper('Email', i) for i in range(self.n)]
        self.columns += [IS_ACTIVE, INVESTOR_ACTIVE, INVESTOR_ID]

        self.views = {'cycles': non_private, 'subscriptions': subscriptions}

        # Latest activity date — the dashboard's "this month" anchor
        today = date.today()
        latest = None
        for i in non_private:
            s = _parse_date(get('Subscription Start Date', i))
            if s and s <= today and (latest is None or s > latest):
                latest = s
            if upper('Cycle Level Status', i) == 'UNSUBSCRIBED':
                e = _parse_date(get('Cycle End Date', i))
                if e and e <= today and (latest is None or e > latest):
                    latest = e
        self.latest_activity = latest or today

        # Headline numbers exactly as the dashboard header computes them
        all_pans = {upper('PAN', i) for i in subscriptions} - {''}
        self.headline = {
            'total unique subscribers (PANs, ever subscribed, excl. requested-access only)': len(all_pans),
            'active subscribers (unique PANs with an active subscription)': len(active_pans),
            'exited subscribers (unique PANs, none active)': len(all_pans) - len(active_pans),
            'total subscriptions (client × smallcase, latest cycle)': len(subscriptions),
            'active subscriptions': sum(1 for i in subscriptions if is_active[i] == 'Yes'),
            'unique PANs in all rows incl. requested-access': len({upper('PAN', i) for i in non_private} - {''}),
        }

    # ── Description for the system prompt ────────────────────────────────────
    def describe(self) -> str:
        lines = []
        for c in self.columns:
            vals = self.cols[c]
            idx = self.views['cycles']
            if c in self.date_cols:
                ds = sorted({vals[i] for i in idx if vals[i]})
                desc = f'date (YYYY-MM-DD), {ds[0]} to {ds[-1]}' if ds else 'date (all blank)'
            elif c in self.num_cols:
                ns = [vals[i] for i in idx if vals[i] is not None]
                desc = f'number, {min(ns):g} to {max(ns):g}' if ns else 'number (all blank)'
            else:
                distinct = {vals[i] for i in idx}
                if len(distinct) <= 40:
                    shown = ', '.join(repr(v) for v in sorted(distinct) if v != '')
                    desc = f'text, values: {shown}' + (" (and blank)" if '' in distinct else '')
                else:
                    desc = f'text, {len(distinct):,} distinct values'
            lines.append(f'- {c}: {desc}')
        return '\n'.join(lines)


# ── Cache: rebuilt only when a new upload becomes the active dataset ─────────
_cache = {'session_id': None, 'dataset': None}
_lock = threading.Lock()


def get_dataset(db: Session):
    session = (
        db.query(UploadSession)
        .filter(UploadSession.is_active == True)
        .order_by(UploadSession.uploaded_at.desc())
        .first()
    )
    if not session:
        return None
    with _lock:
        if _cache['session_id'] != str(session.id):
            rec = db.query(UploadData).filter(UploadData.session_id == session.id).first()
            rows = rec.rows_json if rec else []
            _cache['dataset'] = Dataset(rows, session.file_name, session.uploaded_at)
            _cache['session_id'] = str(session.id)
        return _cache['dataset']


# ── Lookups ──────────────────────────────────────────────────────────────────
class QueryError(ValueError):
    pass


def _resolve_column(ds: Dataset, name: str) -> str:
    if name in ds.cols:
        return name
    low = str(name).strip().lower()
    for c in ds.columns:
        if c.lower() == low:
            return c
    if low in CANONICAL and CANONICAL[low] in ds.cols:
        return CANONICAL[low]
    raise QueryError(f'Unknown column "{name}". Available: {", ".join(ds.columns)}')


def _norm_text(v) -> str:
    return str(v if v is not None else '').strip().lower()


def _check_date(ds, col, v):
    if col in ds.date_cols and not (isinstance(v, str) and _ISO_DATE.match(v)):
        raise QueryError(f'Dates for "{col}" must be written YYYY-MM-DD (got {v!r})')
    return v


def _predicate(ds: Dataset, f: dict):
    col = _resolve_column(ds, f.get('column'))
    op = f.get('op')
    val = f.get('value')
    vals = ds.cols[col]
    is_num, is_date = col in ds.num_cols, col in ds.date_cols

    def scalar(v):
        if is_num:
            try:
                return float(v)
            except (TypeError, ValueError):
                raise QueryError(f'"{col}" is a number column; {v!r} is not a number')
        if is_date:
            return _check_date(ds, col, v)
        return _norm_text(v)

    def cell(i):
        v = vals[i]
        return v if (is_num or is_date) else _norm_text(v)

    blank = (lambda i: vals[i] is None) if is_num else (lambda i: str(vals[i]).strip() == '')

    if op == 'is_blank':
        return blank
    if op == 'not_blank':
        return lambda i: not blank(i)
    if op in ('equals', 'not_equals'):
        t = scalar(val)
        eq = lambda i: (not blank(i)) and cell(i) == t
        return eq if op == 'equals' else (lambda i: not eq(i))
    if op in ('in', 'not_in'):
        if not isinstance(val, list):
            raise QueryError(f'"{op}" needs a list of values')
        ts = {scalar(v) for v in val}
        isin = lambda i: (not blank(i)) and cell(i) in ts
        return isin if op == 'in' else (lambda i: not isin(i))
    if op in ('contains', 'not_contains'):
        t = _norm_text(val)
        has = lambda i: t in _norm_text(vals[i])
        return has if op == 'contains' else (lambda i: not has(i))
    if op in ('gt', 'gte', 'lt', 'lte'):
        if not (is_num or is_date):
            raise QueryError(f'"{op}" only works on number or date columns; "{col}" is text')
        t = scalar(val)
        cmp = {'gt': lambda a: a > t, 'gte': lambda a: a >= t, 'lt': lambda a: a < t, 'lte': lambda a: a <= t}[op]
        return lambda i: (not blank(i)) and cmp(cell(i))
    if op == 'between':
        if not (isinstance(val, list) and len(val) == 2):
            raise QueryError('"between" needs [from, to] (both inclusive)')
        if not (is_num or is_date):
            raise QueryError(f'"between" only works on number or date columns; "{col}" is text')
        lo, hi = scalar(val[0]), scalar(val[1])
        return lambda i: (not blank(i)) and lo <= cell(i) <= hi
    raise QueryError(f'Unknown filter op "{op}"')


def _filtered(ds: Dataset, view: str, filters):
    if view not in ds.views:
        raise QueryError('view must be "subscriptions" or "cycles"')
    preds = [_predicate(ds, f) for f in (filters or [])]
    return [i for i in ds.views[view] if all(p(i) for p in preds)]


def _bucket(v: str, bucket: str) -> str:
    if not v:
        return '(blank)'
    if bucket == 'year':
        return v[:4]
    if bucket == 'quarter':
        return f'{v[:4]}-Q{(int(v[5:7]) - 1) // 3 + 1}'
    if bucket == 'month':
        return v[:7]
    return v[:10]


def _display(v):
    if v is None or v == '':
        return '(blank)'
    if isinstance(v, float):
        return int(v) if v.is_integer() else round(v, 4)
    return v


def aggregate(ds: Dataset, view: str, filters=None, group_by=None, metrics=None, sort=None, limit=50) -> dict:
    idx = _filtered(ds, view, filters)
    groups = []
    for g in group_by or []:
        g = g if isinstance(g, dict) else {'column': g}
        col = _resolve_column(ds, g.get('column'))
        bucket = g.get('bucket')
        if bucket and col not in ds.date_cols:
            raise QueryError(f'bucket only applies to date columns; "{col}" is not a date')
        groups.append((col, bucket))
    metrics = metrics or [{'op': 'count'}]
    specs = []
    for m in metrics:
        op = m.get('op')
        if op not in ('count', 'count_distinct', 'sum', 'avg', 'median', 'min', 'max'):
            raise QueryError(f'Unknown metric op "{op}"')
        col = _resolve_column(ds, m['column']) if op != 'count' else None
        if op in ('sum', 'avg', 'median') and col not in ds.num_cols:
            raise QueryError(f'"{op}" needs a number column; "{col}" is not numeric')
        specs.append((op, col, m.get('label') or (op if op == 'count' else f'{op}({col})')))

    buckets: dict = {}
    for i in idx:
        key = tuple(
            _bucket(ds.cols[c][i], b) if b else _display(ds.cols[c][i])
            for c, b in groups
        )
        buckets.setdefault(key, []).append(i)

    out = []
    for key, members in buckets.items():
        row = {f'{c} ({b})' if b else c: k for (c, b), k in zip(groups, key)}
        for op, col, label in specs:
            if op == 'count':
                row[label] = len(members)
                continue
            vals = ds.cols[col]
            if op == 'count_distinct':
                row[label] = len({_norm_text(vals[i]) for i in members} - {''})
                continue
            present = [vals[i] for i in members if vals[i] is not None and vals[i] != '']
            if not present:
                row[label] = None
            elif op == 'sum':
                row[label] = round(sum(present), 2)
            elif op == 'avg':
                row[label] = round(sum(present) / len(present), 2)
            elif op == 'median':
                row[label] = round(statistics.median(present), 2)
            elif op == 'min':
                row[label] = _display(min(present))
            else:
                row[label] = _display(max(present))
        out.append(row)

    if sort and sort.get('by'):
        by = sort['by']
        # numbers before text, compared within their own kind; blanks always last
        sortable = lambda v: (0, v, '') if isinstance(v, (int, float)) else (1, 0, str(v).lower())
        present = [r for r in out if r.get(by) not in (None, '(blank)')]
        missing = [r for r in out if r.get(by) in (None, '(blank)')]
        present.sort(key=lambda r: sortable(r.get(by)), reverse=bool(sort.get('desc')))
        out = present + missing
    elif groups:
        out.sort(key=lambda r: tuple(str(r[k]) for k in list(r)[:len(groups)]))
    limit = max(1, min(int(limit or 50), 500))
    return {'matching_rows': len(idx), 'groups': len(out), 'rows': out[:limit], 'truncated': len(out) > limit}


def list_rows(ds: Dataset, view: str, filters=None, columns=None, sort=None, limit=25) -> dict:
    idx = _filtered(ds, view, filters)
    cols = [_resolve_column(ds, c) for c in (columns or [])] or [
        c for c in ('User Name', 'Email', 'PAN', 'Smallcase Name', 'Cycle Number', 'Latest Subscription Status',
                    'Subscription Start Date', 'Cycle End Date', 'Plan Amount') if c in ds.cols]
    if sort and sort.get('by'):
        sc = _resolve_column(ds, sort['by'])
        vals = ds.cols[sc]
        present = [i for i in idx if vals[i] not in (None, '')]
        missing = [i for i in idx if vals[i] in (None, '')]
        present.sort(key=lambda i: vals[i] if sc in ds.num_cols or sc in ds.date_cols else _norm_text(vals[i]),
                     reverse=bool(sort.get('desc')))
        idx = present + missing
    limit = max(1, min(int(limit or 25), 200))
    rows = [{c: _display(ds.cols[c][i]) for c in cols} for i in idx[:limit]]
    return {'matching_rows': len(idx), 'rows': rows, 'truncated': len(idx) > limit}


def distinct_values(ds: Dataset, view: str, column: str, filters=None, limit=100) -> dict:
    col = _resolve_column(ds, column)
    idx = _filtered(ds, view, filters)
    counts: dict = {}
    for i in idx:
        k = _display(ds.cols[col][i])
        counts[k] = counts.get(k, 0) + 1
    items = sorted(counts.items(), key=lambda kv: -kv[1])
    limit = max(1, min(int(limit or 100), 500))
    return {'column': col, 'distinct_values': len(items),
            'values': [{'value': k, 'rows': n} for k, n in items[:limit]], 'truncated': len(items) > limit}
