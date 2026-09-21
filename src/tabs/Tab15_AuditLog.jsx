import { memo, useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import ChartCard from '../components/ChartCard';
import FAQSection from '../components/FAQSection';

const ACTION_COLORS = {
  login:            '#22c55e',
  logout:           '#94a3b8',
  login_failed:     '#f87171',
  account_locked:   '#f87171',
  register:         '#00d4ff',
  password_changed: '#fbbf24',
  password_reset:   '#fbbf24',
  user_created:     '#34d399',
  user_updated:     '#fbbf24',
  user_deleted:     '#f87171',
  user_deactivated: '#f87171',
  data_upload:      '#a78bfa',
  data_access:      '#38bdf8',
};

const ACTION_LABELS = {
  login:            'Login',
  logout:           'Logout',
  login_failed:     'Login Failed',
  account_locked:   'Account Locked',
  register:         'Registration',
  password_changed: 'Password Changed',
  password_reset:   'Password Reset (Admin)',
  user_created:     'User Created',
  user_updated:     'User Updated',
  user_deleted:     'User Deleted',
  user_deactivated: 'User Deactivated',
  data_upload:      'Data Uploaded',
  data_access:      'Data Accessed',
};

const ACTION_FILTERS = [
  'all', 'login', 'logout', 'login_failed', 'account_locked',
  'register', 'password_changed', 'password_reset', 'user_created', 'user_updated',
  'user_deleted', 'user_deactivated', 'data_upload', 'data_access',
];

const LIMIT = 50;

export default memo(function Tab15AuditLog({ currentUser, refreshUser }) {
  const [logs,         setLogs]         = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [page,         setPage]         = useState(1);
  const [hasMore,      setHasMore]      = useState(true);
  const [actionFilter, setActionFilter] = useState('all');
  const [retrying,     setRetrying]     = useState(false);

  const isAdmin = currentUser?.role === 'admin';

  const handleRetry = useCallback(async () => {
    if (!refreshUser) { window.location.reload(); return; }
    setRetrying(true);
    await refreshUser();
    setRetrying(false);
  }, [refreshUser]);

  const load = useCallback(async (pg, action) => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getAuditLogs(pg, LIMIT, action !== 'all' ? action : undefined);
      const rows = data.logs || data.items || (Array.isArray(data) ? data : []);
      if (pg === 1) setLogs(rows);
      else setLogs(prev => [...prev, ...rows]);
      setHasMore(rows.length === LIMIT);
    } catch (err) {
      setError(err.message || 'Failed to load audit logs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    setPage(1);
    setLogs([]);
    load(1, actionFilter);
  }, [actionFilter, isAdmin, load]);

  const fmtDate = (ts) => {
    if (!ts) return '—';
    return new Date(ts).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  };

  // ── currentUser not yet resolved ─────────────────────────────────────────────
  if (!currentUser) {
    return (
      <div className="empty-state">
        {retrying
          ? <div className="spinner" style={{ width: 24, height: 24, borderWidth: 3 }} />
          : <span className="empty-state-icon">🔌</span>}
        <div style={{ fontWeight: 600, marginBottom: 6, marginTop: 8 }}>
          {retrying ? 'Connecting…' : 'Backend not connected'}
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16, maxWidth: 400, textAlign: 'center' }}>
          Make sure <code>start_all.bat</code> is running, then click Retry.
        </div>
        {!retrying && (
          <button className="btn-primary" onClick={handleRetry} style={{ padding: '8px 24px', fontSize: 13 }}>
            🔄 Retry Connection
          </button>
        )}
      </div>
    );
  }

  // ── Non-admin ────────────────────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon">🔒</span>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Admin access required</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          Logged in as <strong>{currentUser.username}</strong> · role: <strong>{currentUser.role}</strong>.
          Audit Log is restricted to admins only.
        </div>
      </div>
    );
  }

  // ── Admin view ───────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="section-heading">
        <div>
          <div className="section-title">📋 Audit Log</div>
          <div className="section-subtitle">
            Complete record of all user actions — login, logout, data uploads, user management
          </div>
        </div>
        <div className="section-divider" />
        <div className="section-badge">Admin Only</div>
      </div>

      {/* Action filter chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: '1rem' }}>
        {ACTION_FILTERS.map(a => (
          <button key={a} onClick={() => setActionFilter(a)}
            style={{
              padding: '4px 12px', fontSize: 11, borderRadius: 20, cursor: 'pointer',
              border: `1px solid ${actionFilter === a ? (ACTION_COLORS[a] || 'var(--accent-cyan)') : 'var(--border-default)'}`,
              background: actionFilter === a ? `${ACTION_COLORS[a] || 'var(--accent-cyan)'}22` : 'var(--bg-elevated)',
              color: actionFilter === a ? (ACTION_COLORS[a] || 'var(--accent-cyan)') : 'var(--text-secondary)',
              fontWeight: actionFilter === a ? 600 : 400,
              textTransform: a === 'all' ? 'capitalize' : 'none',
            }}>
            {a === 'all' ? 'All Actions' : (ACTION_LABELS[a] || a)}
          </button>
        ))}
      </div>

      {error && (
        <div className="error-banner" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ display: 'flex', gap: 8 }}><span>⚠️</span><span>{error}</span></span>
          <button className="btn-icon" style={{ fontSize: 11, padding: '3px 10px' }}
            onClick={() => { setPage(1); load(1, actionFilter); }}>
            Retry
          </button>
        </div>
      )}

      <ChartCard
        title="Activity Log"
        subtitle={`Showing ${logs.length} entries · admin: ${currentUser.username}`}
        tooltip="Chronological record of security-relevant actions across the platform — logins, failed attempts, password changes, user management, and data uploads/access — each row shows who did what, when, and from which IP address."
      >
        {loading && logs.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, gap: 10, color: 'var(--text-muted)' }}>
            <div className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} /> Loading audit logs…
          </div>
        ) : logs.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 140, gap: 6 }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>No audit log entries found</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
              Entries appear when users log in, upload data, or make account changes.
            </div>
          </div>
        ) : (
          <>
            <div className="data-table-wrap" style={{ maxHeight: 560, overflowY: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ whiteSpace: 'nowrap' }}>Timestamp</th>
                    <th>Action</th>
                    <th>User</th>
                    <th>IP</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, i) => (
                    <tr key={log.id || i}>
                      <td className="td-name" style={{ whiteSpace: 'nowrap', fontSize: 11 }}>
                        {fmtDate(log.created_at || log.timestamp)}
                      </td>
                      <td>
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                          background: `${ACTION_COLORS[log.action] || '#94a3b8'}22`,
                          color: ACTION_COLORS[log.action] || '#94a3b8',
                          whiteSpace: 'nowrap',
                        }}>
                          {ACTION_LABELS[log.action] || log.action}
                        </span>
                      </td>
                      <td className="td-name" style={{ fontSize: 12 }}>
                        {log.username || log.user_id || '—'}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                        {log.ip_address || '—'}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-secondary)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={log.details ? JSON.stringify(log.details) : ''}>
                        {log.details ? JSON.stringify(log.details) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {hasMore && (
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <button className="btn-icon"
                  onClick={() => { const next = page + 1; setPage(next); load(next, actionFilter); }}
                  disabled={loading}>
                  {loading
                    ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Loading…</>
                    : `Load More (page ${page + 1})`}
                </button>
              </div>
            )}
          </>
        )}
      </ChartCard>

      <FAQSection items={[
        { q: 'What is this page for?',
          a: 'A security and accountability record — a running list of who did what on this platform and when. Every login, failed login attempt, password change, user account change, and data upload/access is logged here, along with the IP address it came from. It\'s the page to check if you need to answer "who uploaded this file" or "who changed this account" or "was there a suspicious login attempt."' },
        { q: 'Why can only admins see this page?',
          a: 'The log contains sensitive information — other people\'s login activity, IP addresses, and account changes — so access is restricted to admin users only. If you\'re logged in as a non-admin, you\'ll see a message explaining that instead of the log itself.' },
        { q: 'What do the different action types mean?',
          a: 'Login/Logout are normal session activity. Login Failed is a wrong-password (or similar) attempt; Account Locked means too many failed attempts triggered a lockout. Registration is a new user account being created. Password Changed is a user changing their own password; Password Reset (Admin) is an admin resetting someone else\'s. User Created/Updated/Deleted/Deactivated are admin actions on other accounts. Data Uploaded and Data Accessed track when a subscription file was uploaded or when someone viewed data.' },
        { q: 'How far back does this log go, and how much loads at once?',
          a: 'The log loads 50 entries at a time, newest first — use the "Load More" button at the bottom to page further back in history. There\'s no date filter on this page; if you need a specific window, look through the pages or use the action-type chips above the table to narrow things down by category first.' },
        { q: 'What do the action-type filter chips at the top do?',
          a: 'Clicking one (e.g. "Login Failed" or "Data Uploaded") reloads the table to show only that action type, reset back to page 1. This is the only filter on the page — there\'s no way to filter by date range or by a specific user from here, only by action type.' },
        { q: 'Why does the "Details" column sometimes look like raw code?',
          a: 'It\'s the raw JSON data attached to that specific action — for example a data upload entry might include the filename and row count, or a user-management action might include which fields changed. It\'s shown as-is rather than reformatted, since the exact content varies a lot by action type; hover over a truncated entry to see the full text.' },
        { q: 'The page says "Backend not connected" — what does that mean?',
          a: 'It means the dashboard couldn\'t reach the backend server that stores and serves audit logs (and user accounts generally) — this is unrelated to your uploaded subscription data. Make sure the backend service is running, then click Retry Connection.' },
      ]} />
    </div>
  );
});
