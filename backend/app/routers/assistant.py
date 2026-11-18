"""Dashboard assistant — answers admins' questions about the uploaded data.

Claude (Haiku 5.5, as in the PF Performance dashboard's assistant) gets a
description of the dataset plus three read-only lookup tools; it decides which
lookups answer the question, this server runs them on the in-memory dataset
(app.assistant_data) and sends back only their results. The dataset itself is
never sent.

Privacy: by explicit decision every column may be looked up, including PAN,
DOB, contact details, net worth and P&L — so the endpoint is admin-only, and
nothing about the conversation is stored here: the audit log records only that
a question was asked plus its token counts and cost (for the spend cap).
"""
import asyncio
import json
from datetime import date, datetime

import anthropic
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app import assistant_data as ad
from app.auth import require_role
from app.config import settings
from app.database import get_db
from app.limiter import limiter
from app.models import AuditLog, User

router = APIRouter()

MAX_ROUNDS = 6
MAX_TOKENS = 16000
TOOL_RESULT_CHARS = 30000   # keeps one oversized lookup from flooding the context

# Claude Haiku 5.5 list prices (prompts up to 100K tokens, which every call here
# is) — used only for the local monthly spend estimate, not for billing.
PRICE_IN_PER_MTOK = 0.10
PRICE_OUT_PER_MTOK = 0.50
CACHE_WRITE_MULT = 1.25
CACHE_READ_MULT = 0.10

_client = None


def _get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key, timeout=90.0, max_retries=2)
    return _client


# ── Spend cap ────────────────────────────────────────────────────────────────
def _month_spend(db: Session) -> float:
    start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    logs = db.query(AuditLog).filter(AuditLog.action == "assistant_question", AuditLog.created_at >= start).all()
    return round(sum(float((l.details or {}).get("cost_usd") or 0) for l in logs), 4)


def _cost(usage) -> float:
    inp = (usage.input_tokens or 0) * PRICE_IN_PER_MTOK
    inp += (getattr(usage, "cache_creation_input_tokens", 0) or 0) * PRICE_IN_PER_MTOK * CACHE_WRITE_MULT
    inp += (getattr(usage, "cache_read_input_tokens", 0) or 0) * PRICE_IN_PER_MTOK * CACHE_READ_MULT
    return (inp + (usage.output_tokens or 0) * PRICE_OUT_PER_MTOK) / 1_000_000


# ── Tools ────────────────────────────────────────────────────────────────────
_VIEW = {"type": "string", "enum": ["subscriptions", "cycles"],
         "description": "subscriptions = current state, one row per client per smallcase (their latest cycle). "
                        "cycles = every subscription cycle ever (history, movements over time)."}
_FILTERS = {
    "type": "array",
    "description": "All conditions must match (AND). Text comparisons ignore case and surrounding spaces. "
                   "Dates are YYYY-MM-DD.",
    "items": {
        "type": "object",
        "properties": {
            "column": {"type": "string"},
            "op": {"type": "string", "enum": ["equals", "not_equals", "in", "not_in", "contains", "not_contains",
                                              "gt", "gte", "lt", "lte", "between", "is_blank", "not_blank"]},
            "value": {"description": "A single value; a list for in/not_in; [from, to] (inclusive) for between; "
                                     "omit for is_blank/not_blank."},
        },
        "required": ["column", "op"],
    },
}
TOOLS = [
    {
        "name": "aggregate",
        "description": "Count, add up, average etc. over the rows matching the filters, optionally broken down by "
                       "one or more columns (dates can be grouped by day/month/quarter/year). Use this for any "
                       "'how many', 'total', 'average', 'by broker/state/month' question. "
                       "For numbers of subscribers/investors use count_distinct on PAN, not count.",
        "input_schema": {
            "type": "object",
            "properties": {
                "view": _VIEW,
                "filters": _FILTERS,
                "group_by": {"type": "array", "items": {"type": "object", "properties": {
                    "column": {"type": "string"},
                    "bucket": {"type": "string", "enum": ["day", "month", "quarter", "year"],
                               "description": "Only for date columns."},
                }, "required": ["column"]}},
                "metrics": {"type": "array", "description": "Defaults to a row count.", "items": {
                    "type": "object", "properties": {
                        "op": {"type": "string", "enum": ["count", "count_distinct", "sum", "avg", "median", "min", "max"]},
                        "column": {"type": "string", "description": "Not needed for count."},
                        "label": {"type": "string"},
                    }, "required": ["op"]}},
                "sort": {"type": "object", "properties": {
                    "by": {"type": "string", "description": "A metric label or group column."},
                    "desc": {"type": "boolean"}}},
                "limit": {"type": "integer", "description": "Max groups returned (default 50, max 500)."},
            },
            "required": ["view"],
        },
    },
    {
        "name": "list_rows",
        "description": "List individual rows (clients/subscriptions) matching the filters, with the chosen columns. "
                       "Use for 'which clients…', 'show me…', or to look up a specific person.",
        "input_schema": {
            "type": "object",
            "properties": {
                "view": _VIEW,
                "filters": _FILTERS,
                "columns": {"type": "array", "items": {"type": "string"}},
                "sort": {"type": "object", "properties": {"by": {"type": "string"}, "desc": {"type": "boolean"}}},
                "limit": {"type": "integer", "description": "Default 25, max 200."},
            },
            "required": ["view"],
        },
    },
    {
        "name": "distinct_values",
        "description": "The different values a column takes (with how many rows have each), e.g. to find the exact "
                       "spelling of a broker, offer code or smallcase before filtering on it.",
        "input_schema": {
            "type": "object",
            "properties": {
                "view": _VIEW,
                "column": {"type": "string"},
                "filters": _FILTERS,
                "limit": {"type": "integer", "description": "Default 100, max 500."},
            },
            "required": ["view", "column"],
        },
    },
]


def _run_tool(ds: ad.Dataset, name: str, args: dict) -> dict:
    view = args.get("view", "subscriptions")
    if name == "aggregate":
        return ad.aggregate(ds, view, args.get("filters"), args.get("group_by"), args.get("metrics"),
                            args.get("sort"), args.get("limit", 50))
    if name == "list_rows":
        return ad.list_rows(ds, view, args.get("filters"), args.get("columns"), args.get("sort"), args.get("limit", 25))
    if name == "distinct_values":
        return ad.distinct_values(ds, view, args.get("column"), args.get("filters"), args.get("limit", 100))
    raise ad.QueryError(f"Unknown tool {name}")


def _describe_step(name: str, args: dict) -> str:
    """Plain-English summary of one lookup, shown under the answer."""
    view = "current subscriptions" if args.get("view", "subscriptions") == "subscriptions" else "all subscription cycles"
    ops = {"equals": "is", "not_equals": "is not", "in": "is one of", "not_in": "is not one of", "contains": "contains",
           "not_contains": "doesn't contain", "gt": ">", "gte": "≥", "lt": "<", "lte": "≤", "between": "between",
           "is_blank": "is blank", "not_blank": "is not blank"}
    conds = []
    for f in args.get("filters") or []:
        v = f.get("value")
        v = " and ".join(map(str, v)) if f.get("op") == "between" and isinstance(v, list) else (
            ", ".join(map(str, v)) if isinstance(v, list) else v)
        conds.append(f"{f.get('column')} {ops.get(f.get('op'), f.get('op'))}" + ("" if v is None else f" {v}"))
    where = f" where {'; '.join(conds)}" if conds else ""
    if name == "aggregate":
        def metric(m):
            col, op = m.get("column"), m.get("op")
            if op == "count":
                return "counted rows"
            if op == "count_distinct":
                return {"PAN": "counted unique investors (by PAN)",
                        ad.INVESTOR_ID: "counted unique investors"}.get(col, f"counted different {col} values")
            return {"sum": f"added up {col}", "avg": f"averaged {col}", "median": f"took the middle value of {col}",
                    "min": f"found the lowest {col}", "max": f"found the highest {col}"}.get(op, f"{op} of {col}")
        ms = [metric(m) for m in args.get("metrics") or [{"op": "count"}]]
        gb = [g.get("column") + (f" (per {g['bucket']})" if g.get("bucket") else "") if isinstance(g, dict) else str(g)
              for g in args.get("group_by") or []]
        text = f"{', '.join(ms)} in {view}{where}" + (f", split by {', '.join(gb)}" if gb else "")
        return text[0].upper() + text[1:]
    if name == "list_rows":
        return f"Listed {view}{where}"
    return f"Checked the values of {args.get('column')} in {view}{where}"


def _system_prompt(ds: ad.Dataset) -> str:
    headline = "\n".join(f"- {k}: {v:,}" for k, v in ds.headline.items())
    return f"""You answer questions from Niveshaay's admins about the subscription data behind their Equity Business Dashboard. Niveshaay sells smallcase subscriptions (model portfolios); each row is one subscription cycle for one client.

How to answer
- Use the lookup tools for any number or list; never estimate or invent figures. Run independent lookups in parallel.
- Use the dashboard's definitions below so your numbers match what admins see on screen. If a question is ambiguous (e.g. "customers" could mean subscribers or subscriptions), pick the dashboard's meaning and say which you used.
- Answer in plain, everyday English for non-technical business readers: lead with the answer, keep it short, no jargon or column names unless helpful. Use ₹ and Indian number style (e.g. ₹12.5 lakh, ₹3.2 crore, 1,25,000).
- For breakdowns, a short list or a small markdown table is fine.
- If the data can't answer the question, say so plainly and suggest what it can answer.

Dataset
- File: {ds.file_name}; uploaded {ds.uploaded_at:%d %b %Y}. Today is {date.today():%d %b %Y}.
- Private smallcases (name containing "private") are excluded everywhere, as on the dashboard.
- Two views: "subscriptions" ({len(ds.views['subscriptions']):,} rows) = current state, one row per client per smallcase, their latest cycle (Email+Scid identity; clients who only requested access are left out). "cycles" ({len(ds.views['cycles']):,} rows) = every cycle ever, for history and month-by-month movement.

Dashboard definitions
- Subscriber / investor / client = a unique PAN → use count_distinct on PAN. A subscription = one client in one smallcase.
- Active = "{ad.IS_ACTIVE}" is Yes (Latest Subscription Status is SUBSCRIBED, GRACE PERIOD or SUBSCRIBED_USER_CANCELLED). "{ad.INVESTOR_ACTIVE}" = Yes when that PAN has any active subscription.
- "This month" on the dashboard = the month of the latest activity in the data, {ds.latest_activity:%B %Y} (latest activity date {ds.latest_activity:%d %b %Y}). Use that for "this month"/"MTD", and say so.
- Month-by-month movements count investors by "{ad.INVESTOR_ID}" (PAN, or email when PAN is blank) — use count_distinct on it for these:
  - New subscribers in a month = cycles view, Subscription Start Date in that month, Cycle Number ≤ 1. Renewals = same but Cycle Number > 1.
  - Exits in a month = cycles view, Cycle Level Status UNSUBSCRIBED, Cycle End Date in that month, and "{ad.INVESTOR_ACTIVE}" = No (an old cycle followed by a renewal isn't an exit).
- Money and wealth figures (Networth, Total PnL, Plan Amount, Offer Discount) are per subscription row; the dashboard averages them over active subscribers. Total PnL is a percentage return.
- REQUESTED_ACCESS rows are people who signed up but never paid.

Headline numbers (as shown on the dashboard)
{headline}

Columns (view "cycles"; the same columns exist in "subscriptions")
{ds.describe()}
"""


# ── Endpoint ─────────────────────────────────────────────────────────────────
class HistoryItem(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., max_length=8000)


class AskRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    history: list[HistoryItem] = Field(default_factory=list, max_length=40)


@router.get("/status")
async def status(db: Session = Depends(get_db), current_user: User = Depends(require_role(["admin"]))):
    return {
        "enabled": bool(settings.anthropic_api_key),
        "month_spend_usd": _month_spend(db),
        "monthly_cap_usd": settings.assistant_monthly_cap_usd,
    }


async def answer_question(ds: ad.Dataset, question: str, history: list, usage: dict) -> dict:
    """Runs the question → lookups → answer loop. `usage` is filled in as calls
    are made (tokens, cost, lookups), so the caller can record spend even when
    a later call fails. Anthropic errors propagate to the caller."""
    messages = history + [{"role": "user", "content": question.strip()}]
    system = [{"type": "text", "text": _system_prompt(ds), "cache_control": {"type": "ephemeral"}}]
    client = _get_client()
    steps = []

    for _ in range(MAX_ROUNDS):
        response = await client.messages.create(
            model=settings.assistant_model,
            max_tokens=MAX_TOKENS,
            system=system,
            tools=TOOLS,
            messages=messages,
            cache_control={"type": "ephemeral"},
        )
        u = response.usage
        usage["cost_usd"] += _cost(u)
        usage["tokens_in"] += ((u.input_tokens or 0) + (getattr(u, "cache_read_input_tokens", 0) or 0)
                               + (getattr(u, "cache_creation_input_tokens", 0) or 0))
        usage["tokens_out"] += u.output_tokens or 0

        if response.stop_reason == "refusal":
            return {"answer": "Sorry, I can't help with that question.", "steps": steps}
        if response.stop_reason != "tool_use":
            answer = "\n\n".join(b.text for b in response.content if b.type == "text").strip()
            if response.stop_reason == "max_tokens":
                answer += "\n\n(The answer was cut short — try asking for less at once.)"
            return {"answer": answer or "(no answer)", "steps": steps}

        messages.append({"role": "assistant", "content": response.content})
        calls = [b for b in response.content if b.type == "tool_use"]

        async def run(call):
            try:
                result = await asyncio.to_thread(_run_tool, ds, call.name, call.input or {})
                text, is_error = json.dumps(result, ensure_ascii=False, default=str), False
                if len(text) > TOOL_RESULT_CHARS:
                    text = text[:TOOL_RESULT_CHARS] + ' …(result cut short — narrow the filters or lower the limit)'
            except ad.QueryError as e:
                text, is_error = f"Error: {e}", True
            except Exception as e:  # a bug in a lookup shouldn't kill the whole answer
                text, is_error = f"Error running {call.name}: {e}", True
            return {"type": "tool_result", "tool_use_id": call.id, "content": text, "is_error": is_error}

        results = await asyncio.gather(*(run(c) for c in calls))
        steps += [_describe_step(c.name, c.input or {}) for c, r in zip(calls, results) if not r["is_error"]]
        usage["lookups"] = len(steps)
        messages.append({"role": "user", "content": list(results)})

    return {"answer": "That question needed more lookups than I'm allowed in one go. "
                      "Try splitting it into smaller questions.", "steps": steps}


@router.post("/ask")
@limiter.limit("10/minute")
async def ask(
    request: Request,
    body: AskRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    if not settings.anthropic_api_key:
        raise HTTPException(503, "The assistant isn't set up on this server yet (no Anthropic API key).")
    if _month_spend(db) >= settings.assistant_monthly_cap_usd:
        raise HTTPException(429, f"This month's assistant budget (${settings.assistant_monthly_cap_usd:g}) has been "
                                 "used up. It resets on the 1st, or an admin can raise ASSISTANT_MONTHLY_CAP_USD.")

    ds = await asyncio.to_thread(ad.get_dataset, db)
    if ds is None or ds.n == 0:
        raise HTTPException(400, "There's no data loaded yet — upload a file first.")

    # Earlier turns as plain text (tool calls stay inside one request); must start with the user
    history = [h.model_dump() for h in body.history[-12:]]
    while history and history[0]["role"] != "user":
        history.pop(0)

    usage = {"tokens_in": 0, "tokens_out": 0, "cost_usd": 0.0, "lookups": 0}
    try:
        return await answer_question(ds, body.question, history, usage)
    except anthropic.AuthenticationError:
        raise HTTPException(502, "The Anthropic API key was rejected — check ANTHROPIC_API_KEY on the server.")
    except anthropic.RateLimitError:
        raise HTTPException(429, "The assistant is busy right now — please try again in a minute.")
    except anthropic.APIConnectionError:
        raise HTTPException(502, "Couldn't reach Anthropic from the server — check its internet access.")
    except anthropic.APIStatusError as e:
        raise HTTPException(502, f"The assistant service returned an error ({e.status_code}). Please try again.")
    finally:
        if usage["cost_usd"]:
            usage["cost_usd"] = round(usage["cost_usd"], 6)
            db.add(AuditLog(
                user_id=current_user.id, action="assistant_question", details=usage,
                ip_address=request.client.host if request.client else None,
                user_agent=request.headers.get("user-agent"),
            ))
            db.commit()
