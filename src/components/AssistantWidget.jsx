import { useState, useRef, useEffect, Fragment } from 'react';
import { api } from '../api';

// Floating "Ask about your data" chat, admin-only (the backend endpoint is
// admin-gated regardless). Answers come from Claude running read-only lookups
// on the latest uploaded dataset on the server — see backend/app/routers/assistant.py.
// The conversation lives only in this component's state: nothing is saved,
// and closing the browser tab clears it.

const EXAMPLES = [
  'How many new subscribers did we get this month?',
  'Which brokers bring the most active subscribers?',
  'How many people exited each month this year?',
  'What is the average plan amount by smallcase?',
];

// ── Minimal, safe rendering of the answer's markdown (no HTML injection) ─────
function inline(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : <Fragment key={i}>{part}</Fragment>);
}

function Answer({ text }) {
  const lines = text.split('\n');
  const blocks = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) rows.push(lines[i].trim().slice(1, -1).split('|').map(c => c.trim()));
        i++;
      }
      blocks.push(
        <div key={blocks.length} style={{ overflowX: 'auto', margin: '6px 0' }}>
          <table className="assistant-table">
            <thead><tr>{rows[0].map((c, j) => <th key={j}>{inline(c)}</th>)}</tr></thead>
            <tbody>{rows.slice(1).map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>);
    } else if (/^\s*([-*•]|\d+\.)\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*([-*•]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*•]|\d+\.)\s+/, ''));
        i++;
      }
      blocks.push(<ul key={blocks.length}>{items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ul>);
    } else if (line.trim()) {
      blocks.push(<p key={blocks.length}>{inline(line.replace(/^#+\s*/, ''))}</p>);
      i++;
    } else {
      i++;
    }
  }
  return <div className="assistant-answer">{blocks}</div>;
}

export default function AssistantWidget() {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]); // [{role, content, steps?}]
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Only show the button when the server has the assistant switched on
  useEffect(() => {
    api.assistantStatus().then(s => setEnabled(!!s.enabled)).catch(() => setEnabled(false));
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading, error]);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  if (!enabled) return null;

  const send = async (text) => {
    const question = (text ?? input).trim();
    if (!question || loading) return;
    setInput('');
    setError('');
    const history = messages.map(m => ({ role: m.role, content: m.content }));
    setMessages(prev => [...prev, { role: 'user', content: question }]);
    setLoading(true);
    try {
      const res = await api.assistantAsk(question, history);
      setMessages(prev => [...prev, { role: 'assistant', content: res.answer, steps: res.steps || [] }]);
    } catch (err) {
      setError(err.message || 'The assistant could not answer right now.');
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  if (!open) {
    return (
      <button className="assistant-launcher" onClick={() => setOpen(true)} title="Ask a question about your data">
        💬 <span>Ask about your data</span>
      </button>
    );
  }

  return (
    <div className="assistant-panel" role="dialog" aria-label="Ask about your data">
      <div className="assistant-header">
        <div>
          <div className="assistant-title">Ask about your data</div>
          <div className="assistant-sub">From the latest upload · admins only</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {messages.length > 0 && (
            <button className="assistant-icon-btn" onClick={() => { setMessages([]); setError(''); }} title="Start a new conversation">
              New chat
            </button>
          )}
          <button className="assistant-icon-btn" onClick={() => setOpen(false)} title="Close" aria-label="Close">✕</button>
        </div>
      </div>

      <div className="assistant-body" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="assistant-empty">
            <p>Ask anything about your subscribers, renewals, exits, brokers, plans or payments. For example:</p>
            {EXAMPLES.map(q => (
              <button key={q} className="assistant-example" onClick={() => send(q)}>{q}</button>
            ))}
          </div>
        )}

        {messages.map((m, i) => (
          m.role === 'user'
            ? <div key={i} className="assistant-msg assistant-msg-user">{m.content}</div>
            : (
              <div key={i} className="assistant-msg assistant-msg-bot">
                <Answer text={m.content} />
                {m.steps?.length > 0 && (
                  <details className="assistant-steps">
                    <summary>How this was worked out</summary>
                    <ul>{m.steps.map((s, j) => <li key={j}>{s}</li>)}</ul>
                  </details>
                )}
              </div>
            )
        ))}

        {loading && (
          <div className="assistant-msg assistant-msg-bot assistant-thinking">
            <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Looking through the data…
          </div>
        )}
        {error && <div className="assistant-error">⚠️ {error}</div>}
      </div>

      <div className="assistant-input-row">
        <textarea
          ref={inputRef}
          className="assistant-input"
          rows={2}
          value={input}
          maxLength={2000}
          placeholder="Type your question…"
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={loading}
        />
        <button className="btn-primary assistant-send" onClick={() => send()} disabled={!input.trim() || loading}>
          Ask
        </button>
      </div>
    </div>
  );
}
