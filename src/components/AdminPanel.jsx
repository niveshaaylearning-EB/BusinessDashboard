import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

const ROLE_COLORS = { admin: '#f87171', operations: '#fbbf24', editor: '#34d399', viewer: '#94a3b8' };
const ROLE_OPTIONS = ['admin', 'operations', 'editor', 'viewer'];

function RoleBadge({ role }) {
  return (
    <span style={{
      fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10,
      background: 'rgba(0,0,0,0.35)', color: ROLE_COLORS[role] || '#94a3b8',
      textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
    }}>
      {role}
    </span>
  );
}

function Spinner() {
  return <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#22d3ee', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />;
}

export default function AdminPanel({ currentUser, onClose }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('pending');
  const [busy, setBusy] = useState({});
  const [showCreate, setShowCreate] = useState(false);

  // Create user form state
  const [newUsername, setNewUsername]   = useState('');
  const [newEmail, setNewEmail]         = useState('');
  const [newFullName, setNewFullName]   = useState('');
  const [newRole, setNewRole]           = useState('viewer');
  const [newPassword, setNewPassword]   = useState('');
  const [createErr, setCreateErr]       = useState('');
  const [createBusy, setCreateBusy]     = useState(false);
  const [createSuccess, setCreateSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const list = await api.getUsers();
      setUsers(list);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (id, action, payload = {}) => {
    setBusy(b => ({ ...b, [id]: action }));
    setErr('');
    try {
      if (action === 'approve')    await api.updateUser(id, { is_active: true, ...payload });
      else if (action === 'role')  await api.updateUser(id, payload);
      else if (action === 'deactivate') await api.deactivateUser(id);
      else if (action === 'activate')   await api.updateUser(id, { is_active: true });
      else if (action === 'delete')     await api.deleteUser(id);
      await load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(b => ({ ...b, [id]: null })); }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreateErr(''); setCreateSuccess(''); setCreateBusy(true);
    try {
      const u = await api.createUser({
        username:  newUsername.trim(),
        email:     newEmail.trim().toLowerCase() || undefined,
        full_name: newFullName.trim() || undefined,
        role:      newRole,
        password:  newPassword,
      });
      setCreateSuccess(`User "${u.username}" created successfully.`);
      setNewUsername(''); setNewEmail(''); setNewFullName(''); setNewRole('viewer'); setNewPassword('');
      await load();
    } catch (e) { setCreateErr(e.message); }
    finally { setCreateBusy(false); }
  };

  const pending  = users.filter(u => !u.is_active);
  const active   = users.filter(u => u.is_active);
  const displayed = tab === 'pending' ? pending : tab === 'active' ? active : users;

  const s = {
    overlay: {
      position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.92)',
      display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end',
      zIndex: 2000,
    },
    panel: {
      width: '100%', maxWidth: 900,
      background: 'var(--bg-card)', borderLeft: '1px solid var(--border-bright)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    },
    header: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-default)',
      background: 'var(--bg-elevated)', flexShrink: 0,
    },
    tabBar: {
      display: 'flex', gap: 0, padding: '0 1.5rem',
      borderBottom: '1px solid var(--border-default)',
      flexShrink: 0, background: 'var(--bg-elevated)',
    },
    body: { flex: 1, overflow: 'auto', padding: '1.25rem 1.5rem' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
    th: {
      textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 600,
      color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em',
      borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap',
    },
    td: {
      padding: '10px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)',
      color: 'var(--text-primary)', verticalAlign: 'middle',
    },
    btnPrimary: {
      background: 'var(--accent-cyan)', color: '#000', border: 'none',
      borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600,
      cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 5,
    },
    btnDanger: {
      background: 'rgba(248,113,113,0.15)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)',
      borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600,
      cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 5,
    },
    btnGhost: {
      background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
      border: '1px solid var(--border-default)', borderRadius: 6,
      padding: '5px 12px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
    },
    roleSelect: {
      background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
      borderRadius: 6, color: 'var(--text-primary)', padding: '4px 8px',
      fontSize: 12, cursor: 'pointer',
    },
    input: {
      width: '100%', boxSizing: 'border-box',
      background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
      borderRadius: 8, color: 'var(--text-primary)', padding: '9px 12px',
      fontSize: 13, outline: 'none',
    },
  };

  const TabBtn = ({ id, label, count }) => (
    <button
      onClick={() => setTab(id)}
      style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: '12px 16px',
        fontSize: 13, fontWeight: tab === id ? 700 : 400,
        color: tab === id ? 'var(--accent-cyan)' : 'var(--text-muted)',
        borderBottom: tab === id ? '2px solid var(--accent-cyan)' : '2px solid transparent',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
      {label}
      {count > 0 && (
        <span style={{
          background: id === 'pending' ? 'rgba(251,191,36,0.2)' : 'rgba(34,211,238,0.15)',
          color: id === 'pending' ? '#fbbf24' : 'var(--accent-cyan)',
          borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700,
        }}>{count}</span>
      )}
    </button>
  );

  const isBusy = (id) => !!busy[id];
  const isMe = (id) => id === currentUser?.id;

  return (
    <div style={s.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={s.panel}>
        {/* Header */}
        <div style={s.header}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--accent-cyan)' }}>
              👤 User Management
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {users.length} total · {active.length} active · {pending.length} pending approval
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button style={s.btnPrimary} onClick={() => { setShowCreate(!showCreate); setCreateErr(''); setCreateSuccess(''); }}>
              {showCreate ? '✕ Cancel' : '+ Add User'}
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.3rem', padding: '0 4px' }}>✕</button>
          </div>
        </div>

        {/* Create User Form */}
        {showCreate && (
          <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-default)', background: 'rgba(34,211,238,0.03)', flexShrink: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12, color: 'var(--accent-cyan)' }}>Add New User</div>
            <form onSubmit={handleCreate}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginBottom: 8 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Username *</label>
                  <input style={s.input} value={newUsername} required
                    onChange={e => setNewUsername(e.target.value)} placeholder="e.g. jchaudhari" />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Full Name</label>
                  <input style={s.input} value={newFullName}
                    onChange={e => setNewFullName(e.target.value)} placeholder="Jay Chaudhari" />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Email</label>
                  <input style={s.input} type="email" value={newEmail}
                    onChange={e => setNewEmail(e.target.value)} placeholder="user@niveshaay.com" />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Role</label>
                  <select style={{ ...s.input, padding: '9px 8px' }} value={newRole} onChange={e => setNewRole(e.target.value)}>
                    {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Password *</label>
                  <input style={s.input} type="password" value={newPassword} required
                    onChange={e => setNewPassword(e.target.value)} placeholder="Min 8 · uppercase · digit · special" />
                </div>
              </div>
              {createErr     && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 8 }}>⚠️ {createErr}</div>}
              {createSuccess && <div style={{ color: '#34d399', fontSize: 12, marginBottom: 8 }}>✓ {createSuccess}</div>}
              <button type="submit" style={s.btnPrimary} disabled={createBusy}>
                {createBusy ? <><Spinner /> Creating...</> : '+ Create User'}
              </button>
            </form>
          </div>
        )}

        {/* Tabs */}
        <div style={s.tabBar}>
          <TabBtn id="pending" label="Pending Approval" count={pending.length} />
          <TabBtn id="active"  label="Active Users"     count={active.length} />
          <TabBtn id="all"     label="All Users"        count={users.length} />
        </div>

        {/* Body */}
        <div style={s.body}>
          {err && (
            <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, padding: '10px 14px', color: '#f87171', fontSize: 13, marginBottom: 12 }}>
              ⚠️ {err}
              <button onClick={() => setErr('')} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', marginLeft: 8, fontSize: 14 }}>✕</button>
            </div>
          )}

          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', padding: '2rem' }}>
              <Spinner /> Loading users...
            </div>
          ) : displayed.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', fontSize: 14 }}>
              {tab === 'pending' ? '✓ No pending approvals' : 'No users found'}
            </div>
          ) : (
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>User</th>
                  <th style={s.th}>Email</th>
                  <th style={s.th}>Role</th>
                  <th style={s.th}>Registered</th>
                  <th style={s.th}>Last Login</th>
                  <th style={s.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map(u => (
                  <tr key={u.id} style={{ opacity: isBusy(u.id) ? 0.6 : 1 }}>
                    <td style={s.td}>
                      <div style={{ fontWeight: 600 }}>{u.full_name || u.username}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>@{u.username}</div>
                    </td>
                    <td style={s.td}>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{u.email || '—'}</span>
                    </td>
                    <td style={s.td}>
                      {isMe(u.id) ? (
                        <RoleBadge role={u.role} />
                      ) : (
                        <select
                          style={s.roleSelect}
                          value={u.role}
                          disabled={isBusy(u.id)}
                          onChange={e => act(u.id, 'role', { role: e.target.value })}>
                          {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      )}
                    </td>
                    <td style={{ ...s.td, fontSize: 12, color: 'var(--text-muted)' }}>
                      {u.created_at ? new Date(u.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td style={{ ...s.td, fontSize: 12, color: 'var(--text-muted)' }}>
                      {u.last_login ? new Date(u.last_login).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : <span style={{ color: 'rgba(251,191,36,0.8)', fontSize: 11 }}>Never</span>}
                    </td>
                    <td style={s.td}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {!u.is_active && (
                          <>
                            <button style={s.btnPrimary} disabled={isBusy(u.id)}
                              onClick={() => act(u.id, 'approve')}>
                              {busy[u.id] === 'approve' ? <><Spinner /> Approving...</> : '✓ Approve'}
                            </button>
                            <button style={s.btnDanger} disabled={isBusy(u.id)}
                              onClick={() => { if (window.confirm(`Delete user "${u.username}"? This cannot be undone.`)) act(u.id, 'delete'); }}>
                              {busy[u.id] === 'delete' ? <><Spinner /> Deleting...</> : '✕ Reject'}
                            </button>
                          </>
                        )}
                        {u.is_active && !isMe(u.id) && (
                          <button style={s.btnDanger} disabled={isBusy(u.id)}
                            onClick={() => { if (window.confirm(`Deactivate "${u.username}"?`)) act(u.id, 'deactivate'); }}>
                            {busy[u.id] === 'deactivate' ? <><Spinner /> ...</> : 'Deactivate'}
                          </button>
                        )}
                        {u.is_active && isMe(u.id) && (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>You</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
