import React, { useState, useMemo, useCallback, useRef, useEffect, lazy, Suspense, useTransition } from 'react';
import * as XLSX from 'xlsx';
import { api } from './api';
import AdminPanel from './components/AdminPanel';
import {
  buildCurrentSubscriptionMaster,
  getFilterOptions, applyFilters, getSummaryKPIs, getMonthlyMovement,
  getProductMetrics, buildCohortData, buildRenewalFunnel, getRenewalByProduct,
  getDiscountSummary, getDiscountByDimension, getOfferCodeMetrics,
  getInvestorSegments, getBrokerMetrics, getAttributionMetrics,
  getGeographyMetrics, getCancellationMetrics, getMigrationData,
  generateInsights, getRetentionMetrics, getAUMSummaryTimeline,
  getUnsubscriberAnalysis, formatNumber, formatCurrency, filterRawByDate,
  getMRRMetrics, getRevenueAtRisk, getLTVData,
  getChurnRiskScores, getReactivationPipeline, getRMPerformance,
  getRenewalCalendar, getOfferCodeROI,
} from './dataEngine';
import { saveToStorage, loadFromStorage, loadFromLocalCache, clearStorage } from './storage';

// ─── Auth is handled by the FastAPI backend (backend/app/routers/auth.py) ────
// Credentials are stored in PostgreSQL — no hardcoded passwords here.

// ─── LAZY TAB IMPORTS ─────────────────────────────────────────────────────────
const Tab01Executive    = lazy(() => import('./tabs/Tab01_Executive'));
const Tab03Unsubscriber = lazy(() => import('./tabs/Tab03_Unsubscriber'));
const Tab02Movement     = lazy(() => import('./tabs/Tab02_Movement'));
const Tab03Product      = lazy(() => import('./tabs/Tab03_Product'));
const Tab04Retention    = lazy(() => import('./tabs/Tab04_Retention'));
const Tab05Renewal      = lazy(() => import('./tabs/Tab05_Renewal'));
const Tab06Discount     = lazy(() => import('./tabs/Tab06_Discount'));
const Tab07Investor     = lazy(() => import('./tabs/Tab07_Investor'));
const Tab08Broker       = lazy(() => import('./tabs/Tab08_Broker'));
const Tab09Geography    = lazy(() => import('./tabs/Tab09_Geography'));
const Tab11Migration    = lazy(() => import('./tabs/Tab11_Migration'));
const Tab12Insights     = lazy(() => import('./tabs/Tab12_Insights'));
const Tab13AUMSummary   = lazy(() => import('./tabs/Tab13_AUMSummary'));
const Tab15AuditLog     = lazy(() => import('./tabs/Tab15_AuditLog'));
const Tab16Comparison   = lazy(() => import('./tabs/Tab16_Comparison'));
const Tab17Flow         = lazy(() => import('./tabs/Tab17_SubscriberFlow'));
const Tab20LTV          = lazy(() => import('./tabs/Tab20_LTV'));
const Tab22ChurnRisk    = lazy(() => import('./tabs/Tab22_ChurnRisk'));

const TAB_COMPONENTS = {
  exec: Tab01Executive, aumsummary: Tab13AUMSummary, unsub: Tab03Unsubscriber,
  movement: Tab02Movement, product: Tab03Product,
  retention: Tab04Retention, renewal: Tab05Renewal, discount: Tab06Discount,
  investor: Tab07Investor, broker: Tab08Broker, geo: Tab09Geography,
  migration: Tab11Migration, insights: Tab12Insights,
  auditlog: Tab15AuditLog, comparison: Tab16Comparison,
  flow: Tab17Flow, ltv: Tab20LTV, churnrisk: Tab22ChurnRisk,
};

const TABS = [
  { id: 'exec',       num: '01', label: 'Executive Command',      icon: '⚡' },
  { id: 'aumsummary', num: '02', label: 'Revenue Overview',       icon: '🏦' },
  { id: 'unsub',      num: '03', label: 'Unsubscriber Analysis',  icon: '🚪' },
  { id: 'movement',   num: '04', label: 'Subscriber Movement',    icon: '📊' },
  { id: 'product',    num: '05', label: 'Product Intelligence',   icon: '🎯' },
  { id: 'retention',  num: '06', label: 'Retention & Churn',      icon: '🔒' },
  { id: 'renewal',    num: '07', label: 'Renewal Intelligence',   icon: '🔄' },
  { id: 'discount',   num: '08', label: 'Pricing & Offers',       icon: '🏷️' },
  { id: 'investor',   num: '09', label: 'Investor Hub',           icon: '💰' },
  { id: 'broker',     num: '10', label: 'Distribution Network',   icon: '🤝' },
  { id: 'geo',        num: '11', label: 'Geography',              icon: '🗺️' },
  { id: 'migration',  num: '12', label: 'Product Migration',      icon: '🔀' },
  { id: 'insights',   num: '13', label: 'AI Insights',            icon: '🤖' },
  { id: 'auditlog',   num: '14', label: 'Audit Log',              icon: '📋' },
  { id: 'comparison', num: '15', label: 'Comparison',             icon: '⚖️' },
  { id: 'flow',       num: '16', label: 'Subscriber Flow',        icon: '🌊' },
  { id: 'ltv',        num: '17', label: 'Lifetime Value',         icon: '💎' },
  { id: 'churnrisk',  num: '18', label: 'Risk & Recovery',        icon: '🛡️' },
];

const FILTER_FIELDS = [
  { key: 'smallcase',   label: 'Smallcase' },
  { key: 'state',       label: 'State' },
  { key: 'broker',      label: 'Broker' },
  { key: 'attribution', label: 'Source' },
  { key: 'riskProfile', label: 'Risk Profile' },
  { key: 'planType',    label: 'Plan Type' },
  { key: 'status',      label: 'Status' },
];

// ─── THEME TOGGLE SWITCH ──────────────────────────────────────────────────────
function ThemeToggle({ theme, setTheme }) {
  const isDark = theme === 'dark';
  return (
    <button
      className="theme-toggle-btn"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      title={`Switch to ${isDark ? 'light' : 'dark'} theme`}
    >
      <span className="toggle-icon">{isDark ? '🌙' : '☀️'}</span>
      <span className="toggle-track"><span className="toggle-thumb" /></span>
    </button>
  );
}

// ─── OTP INPUT: 6 individual digit boxes ─────────────────────────────────────
function OTPInput({ value, onChange, autoFocus }) {
  const refs = useRef([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] || '');

  const update = (index, char) => {
    const arr = digits.slice();
    arr[index] = char;
    onChange(arr.join(''));
  };

  const handleInput = (i, e) => {
    const d = e.target.value.replace(/\D/g, '').slice(-1);
    update(i, d);
    if (d && i < 5) refs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace') {
      if (digits[i]) { update(i, ''); }
      else if (i > 0) { update(i - 1, ''); refs.current[i - 1]?.focus(); }
    } else if (e.key === 'ArrowLeft'  && i > 0) refs.current[i - 1]?.focus();
    else if  (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus();
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    onChange(pasted);
    const focusIdx = Math.min(pasted.length, 5);
    setTimeout(() => refs.current[focusIdx]?.focus(), 0);
  };

  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', margin: '6px 0' }}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={2}
          value={d}
          autoFocus={autoFocus && i === 0}
          onChange={e => handleInput(i, e)}
          onKeyDown={e => handleKeyDown(i, e)}
          onPaste={handlePaste}
          style={{
            width: 46, height: 54, textAlign: 'center', fontSize: 24,
            fontWeight: 600, fontFamily: 'monospace',
            background: 'var(--bg-elevated)',
            border: `1.5px solid ${d ? 'var(--accent-cyan)' : 'var(--border-default)'}`,
            borderRadius: 10, color: 'var(--text-primary)', outline: 'none',
            caretColor: 'var(--accent-cyan)', transition: 'border-color .15s',
          }}
        />
      ))}
    </div>
  );
}

// ─── LOGIN SCREEN (sign-in + register + OTP flows) ────────────────────────────
function LoginScreen({ onLogin }) {
  // view: 'login' | 'login-otp' | 'register' | 'register-otp'
  const [view, setView] = useState('login');

  // Login state
  const [username,    setUsername]    = useState('');
  const [tempToken,   setTempToken]   = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');

  // Register state
  const [regFirst,    setRegFirst]    = useState('');
  const [regLast,     setRegLast]     = useState('');
  const [regEmail,    setRegEmail]    = useState('');
  const [regMobile,   setRegMobile]   = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm,  setRegConfirm]  = useState('');
  const [regUsername, setRegUsername] = useState('');  // shown after registration

  // OTP
  const [otp, setOtp] = useState('');

  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const reset = () => { setError(''); setSuccess(''); };

  // ── Login step 1: send OTP ────────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    reset();
    setLoading(true);
    try {
      const res = await api.login(username.trim());
      if (res.requires_otp) {
        setTempToken(res.temp_token);
        setMaskedEmail(res.masked_email);
        setView('login-otp');
      }
    } catch (err) {
      setError(err.message || 'Account not found. Contact your administrator.');
    } finally {
      setLoading(false);
    }
  };

  // ── Login step 2: OTP ──────────────────────────────────────────────────────
  const handleLoginOTP = async (e) => {
    e.preventDefault();
    if (otp.length !== 6) { setError('Enter the 6-digit OTP.'); return; }
    reset();
    setLoading(true);
    try {
      const { access_token, user } = await api.verifyLoginOTP(tempToken, otp);
      localStorage.setItem('nia_token', access_token);
      onLogin(user);
    } catch (err) {
      setError(err.message || 'Incorrect OTP. Please try again.');
      setLoading(false);
    }
  };

  // ── Register step 1: send OTP ──────────────────────────────────────────────
  const handleRegisterSend = async (e) => {
    e.preventDefault();
    reset();
    if (!regEmail.toLowerCase().endsWith('@niveshaay.com')) {
      setError('Only @niveshaay.com email addresses are allowed.');
      return;
    }
    const digits = regMobile.replace(/\D/g, '');
    if (digits.length !== 10) {
      setError('Mobile number must be exactly 10 digits.');
      return;
    }
    if (regPassword !== regConfirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.registerSendOTP({
        first_name: regFirst.trim(),
        last_name:  regLast.trim(),
        email:      regEmail.trim().toLowerCase(),
        mobile:     digits,
        password:   regPassword,
      });
      setSuccess(res.message || 'OTP sent! Check your email.');
      setView('register-otp');
    } catch (err) {
      setError(err.message || 'Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Register step 2: verify OTP ───────────────────────────────────────────
  const handleRegisterVerify = async (e) => {
    e.preventDefault();
    if (otp.length !== 6) { setError('Enter the 6-digit OTP.'); return; }
    reset();
    setLoading(true);
    try {
      const res = await api.registerVerify(regEmail.trim().toLowerCase(), otp);
      setRegUsername(res.username || '');
      setSuccess(res.message || 'Registration submitted. Pending admin approval.');
      setView('login');
      setUsername('');
    } catch (err) {
      setError(err.message || 'Incorrect OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
    borderRadius: 8, color: 'var(--text-primary)', padding: '10px 14px',
    fontSize: 14, outline: 'none', transition: 'border-color .15s',
  };
  const mobileWrap = { display: 'flex', gap: 8 };
  const mobilePrefix = {
    background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
    borderRadius: 8, color: 'var(--text-muted)', padding: '10px 12px',
    fontSize: 14, whiteSpace: 'nowrap', flexShrink: 0,
  };

  return (
    <div className="login-screen">
      <div className="login-brand">
        <div className="login-brand-icon">📊</div>
        <div className="login-brand-name">NIA Antigravity</div>
        <div className="login-brand-sub">Subscription Intelligence Platform</div>
      </div>

      {/* ── SIGN IN ─────────────────────────────────────────────── */}
      {view === 'login' && (
        <form className="login-card" onSubmit={handleLogin} autoComplete="off">
          <div className="login-title">Sign In</div>
          <div className="login-desc">Enter your username or email — we'll send a one-time code</div>

          <div className="login-field">
            <label className="login-label">Username or Email</label>
            <input className="login-input" type="text" value={username} autoFocus
              onChange={e => { setUsername(e.target.value); reset(); }}
              placeholder="Enter username or email address" />
          </div>

          {error   && <div className="login-error"><span>⚠️</span> {error}</div>}
          {success && <div style={{ color: 'var(--accent-green)', fontSize: 13, marginBottom: 8 }}>✓ {success}</div>}

          <button className="btn-primary" type="submit" disabled={!username || loading}>
            {loading ? <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Sending OTP...</> : '→ Send OTP'}
          </button>

          <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'var(--text-muted)' }}>
            New to NIA Antigravity?{' '}
            <button type="button" onClick={() => { reset(); setOtp(''); setView('register'); }}
              style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', cursor: 'pointer', fontSize: 13, padding: 0 }}>
              Create account
            </button>
          </div>
        </form>
      )}

      {/* ── LOGIN OTP ───────────────────────────────────────────── */}
      {view === 'login-otp' && (
        <form className="login-card" onSubmit={handleLoginOTP} autoComplete="off">
          <div className="login-title">Two-Factor Verification</div>
          <div className="login-desc">
            An OTP has been sent to <strong style={{ color: 'var(--accent-cyan)' }}>{maskedEmail}</strong>
          </div>

          <div className="login-field">
            <label className="login-label" style={{ textAlign: 'center', display: 'block' }}>Enter 6-digit OTP</label>
            <OTPInput value={otp} onChange={v => { setOtp(v); setError(''); }} autoFocus />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, textAlign: 'center' }}>
              Valid for 5 minutes · Check your Niveshaay inbox
            </div>
          </div>

          {error && <div className="login-error"><span>⚠️</span> {error}</div>}

          <button className="btn-primary" type="submit" disabled={otp.length !== 6 || loading}>
            {loading ? <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Verifying...</> : '✓ Verify & Sign In'}
          </button>

          <div style={{ textAlign: 'center', marginTop: 12, fontSize: 13 }}>
            <button type="button" onClick={() => { reset(); setOtp(''); setView('login'); setUsername(''); }}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, padding: 0 }}>
              ← Back to Sign In
            </button>
          </div>
        </form>
      )}

      {/* ── REGISTER ────────────────────────────────────────────── */}
      {view === 'register' && (
        <form className="login-card" onSubmit={handleRegisterSend} autoComplete="off"
          style={{ maxWidth: 420 }}>
          <div className="login-title">Create Account</div>
          <div className="login-desc">Only @niveshaay.com email addresses may register</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div className="login-field" style={{ marginBottom: 0 }}>
              <label className="login-label">First Name</label>
              <input style={inputStyle} type="text" value={regFirst} autoFocus required
                onChange={e => { setRegFirst(e.target.value); reset(); }} placeholder="Jay" />
            </div>
            <div className="login-field" style={{ marginBottom: 0 }}>
              <label className="login-label">Last Name</label>
              <input style={inputStyle} type="text" value={regLast} required
                onChange={e => { setRegLast(e.target.value); reset(); }} placeholder="Chaudhari" />
            </div>
          </div>

          <div className="login-field">
            <label className="login-label">Niveshaay Email</label>
            <input style={inputStyle} type="email" value={regEmail} required
              onChange={e => { setRegEmail(e.target.value); reset(); }}
              placeholder="you@niveshaay.com" />
          </div>

          <div className="login-field">
            <label className="login-label">Mobile Number</label>
            <div style={mobileWrap}>
              <span style={mobilePrefix}>+91</span>
              <input style={{ ...inputStyle, flex: 1 }} type="tel" value={regMobile} required
                maxLength={10} inputMode="numeric" pattern="[0-9]{10}"
                onChange={e => { setRegMobile(e.target.value.replace(/\D/g, '').slice(0, 10)); reset(); }}
                placeholder="10-digit mobile number" />
            </div>
          </div>

          <div className="login-field">
            <label className="login-label">Password</label>
            <input style={inputStyle} type="password" value={regPassword} required
              onChange={e => { setRegPassword(e.target.value); reset(); }}
              placeholder="Min 8 chars · uppercase · digit · special" />
          </div>

          <div className="login-field">
            <label className="login-label">Confirm Password</label>
            <input style={inputStyle} type="password" value={regConfirm} required
              onChange={e => { setRegConfirm(e.target.value); reset(); }}
              placeholder="Re-enter password" />
          </div>

          {error   && <div className="login-error"><span>⚠️</span> {error}</div>}

          <button className="btn-primary" type="submit"
            disabled={!regFirst || !regLast || !regEmail || !regMobile || !regPassword || !regConfirm || loading}>
            {loading ? <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Sending OTP...</> : '→ Send Verification OTP'}
          </button>

          <div style={{ textAlign: 'center', marginTop: 12, fontSize: 13 }}>
            <button type="button" onClick={() => { reset(); setOtp(''); setView('login'); }}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, padding: 0 }}>
              ← Back to Sign In
            </button>
          </div>
        </form>
      )}

      {/* ── REGISTER OTP ────────────────────────────────────────── */}
      {view === 'register-otp' && (
        <form className="login-card" onSubmit={handleRegisterVerify} autoComplete="off">
          <div className="login-title">Verify Your Email</div>
          <div className="login-desc">
            Enter the OTP sent to <strong style={{ color: 'var(--accent-cyan)' }}>{regEmail}</strong>
          </div>

          {success && (
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--accent-green)', borderRadius: 8,
              padding: '10px 14px', color: 'var(--accent-green)', fontSize: 13, marginBottom: 12 }}>
              ✓ {success}
            </div>
          )}

          <div className="login-field">
            <label className="login-label" style={{ textAlign: 'center', display: 'block' }}>Enter 6-digit OTP</label>
            <OTPInput value={otp} onChange={v => { setOtp(v); setError(''); }} autoFocus />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, textAlign: 'center' }}>
              Valid for 10 minutes · Check your Niveshaay inbox
            </div>
          </div>

          {error && <div className="login-error"><span>⚠️</span> {error}</div>}

          <button className="btn-primary" type="submit" disabled={otp.length !== 6 || loading}>
            {loading ? <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Creating account...</> : '✓ Verify & Create Account'}
          </button>

          <div style={{ textAlign: 'center', marginTop: 12, fontSize: 13 }}>
            <button type="button" onClick={() => { reset(); setOtp(''); setView('register'); }}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, padding: 0 }}>
              ← Edit details / Resend OTP
            </button>
          </div>
        </form>
      )}

      <div className="login-footer">Niveshaay Investment Advisors · Internal Platform</div>
    </div>
  );
}

// ─── UPLOAD SCREEN ────────────────────────────────────────────────────────────
function UploadScreen({ onDataLoaded, userName }) {
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(null);
  const inputRef = useRef(null);

  const handleFile = useCallback((f) => {
    if (!f) return;
    const ext = f.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) { setError('Please upload a valid Excel (.xlsx, .xls) or CSV file.'); return; }
    setFile(f); setError('');
  }, []);

  const handleLoad = () => {
    if (!file) return;
    setLoading(true); setError(''); setProgress(0);
    file.arrayBuffer().then(buffer => {
      const worker = new Worker(new URL('./workers/dataWorker.js', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => {
        if (data.type === 'PROGRESS') { setProgress(data.pct); }
        else if (data.type === 'DONE') {
          worker.terminate();
          if (!data.rows.length) { setError('File appears empty or has no data rows.'); setLoading(false); setProgress(null); return; }
          onDataLoaded(data.rows, data.fileName);
        } else if (data.type === 'ERROR') {
          worker.terminate();
          setError(data.message || 'Failed to process file.');
          setLoading(false); setProgress(null);
        }
      };
      worker.onerror = (e) => { worker.terminate(); setError(e.message || 'Worker failed.'); setLoading(false); setProgress(null); };
      worker.postMessage({ type: 'PARSE_EXCEL', buffer, fileName: file.name }, [buffer]);
    }).catch(err => { setError(err.message || 'Failed to read file.'); setLoading(false); setProgress(null); });
  };

  return (
    <div className="upload-screen">
      <div className="upload-brand">
        <div className="upload-brand-logo">
          <div className="brand-icon">📊</div>
          <div>
            <div className="brand-name">NIA Antigravity</div>
            {userName && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Logged in as {userName}</div>}
          </div>
        </div>
        <div className="brand-subtitle">Subscription Intelligence Platform</div>
      </div>

      <div className="upload-card">
        <div className="upload-title">Load Subscription Dataset</div>
        <div className="upload-desc">Upload your subscriber export to generate the full executive analytics dashboard across 12 intelligence modules.</div>

        <div
          className={`drop-zone ${dragging ? 'dragging' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
          onClick={() => inputRef.current?.click()}
        >
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
            onChange={e => handleFile(e.target.files[0])} />
          <span className="drop-icon">📂</span>
          <div className="drop-text"><strong>Click to browse</strong> or drag & drop</div>
          <div className="drop-hint">Supports .xlsx · .xls · .csv</div>
        </div>

        {file && (
          <div className="file-selected">
            <span>📄</span>
            <span style={{ flex: 1 }}>{file.name}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{(file.size / 1024).toFixed(0)} KB</span>
          </div>
        )}
        {error && <div className="error-banner"><span>⚠️</span><span>{error}</span></div>}

        {progress !== null && (
          <div style={{ marginBottom: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
              <span>Processing…</span><span>{progress}%</span>
            </div>
            <div style={{ background: 'var(--bg-elevated)', borderRadius: 4, height: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progress}%`, background: 'var(--accent-cyan)', transition: 'width 0.3s' }} />
            </div>
          </div>
        )}

        <button className="btn-primary" onClick={handleLoad} disabled={!file || loading}>
          {loading
            ? <><div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Processing...</>
            : <><span>🚀</span> Generate Intelligence Dashboard</>}
        </button>
      </div>

      <div className="upload-features">
        {[{ icon: '🔒', label: '12 Analytics Modules' }, { icon: '🔄', label: 'Auto Deduplication' }, { icon: '⚡', label: 'Instant Insights' }]
          .map(f => <div key={f.label} className="feature-badge"><span className="f-icon">{f.icon}</span><span className="f-label">{f.label}</span></div>)}
      </div>
    </div>
  );
}

// ─── FILTER BAR ───────────────────────────────────────────────────────────────
const DATE_PRESETS = [
  { label: '1M', months: 1 },
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: 'YTD', months: 'ytd' },
  { label: '1Y', months: 12 },
];

function FilterBar({ filterOptions, filters, setFilters, filtersOpen }) {
  const activeCount = Object.values(filters).filter(v => (Array.isArray(v) && v.length > 0) || (v instanceof Date)).length;
  const handleChange = (key, val) => setFilters(prev => ({ ...prev, [key]: val === '__all__' ? [] : [val] }));

  const applyPreset = (months) => {
    const to = new Date(); to.setHours(23, 59, 59, 999);
    let from;
    if (months === 'ytd') {
      from = new Date(to.getFullYear(), 0, 1);
    } else {
      from = new Date(to.getFullYear(), to.getMonth() - months, to.getDate());
      // If the day overflowed (e.g. Mar 31 → 1M back = Feb 31 → Mar 3),
      // setDate(0) rolls back to the last valid day of the intended month.
      if (from.getDate() !== to.getDate()) from.setDate(0);
    }
    setFilters(prev => ({ ...prev, dateFrom: from, dateTo: to }));
  };

  const activePreset = (() => {
    if (!filters.dateFrom || !filters.dateTo) return null;
    const ms = filters.dateTo - filters.dateFrom;
    const now = new Date(); now.setHours(23, 59, 59, 999);
    const sameDay = (a, b) => Math.abs(a - b) < 86400000;
    if (!sameDay(filters.dateTo, now)) return null;
    if (filters.dateFrom.getMonth() === 0 && filters.dateFrom.getDate() === 1 && filters.dateFrom.getFullYear() === now.getFullYear()) return 'YTD';
    const diffMonths = Math.round(ms / (30.44 * 86400000));
    if (diffMonths === 1) return '1M';
    if (diffMonths === 3) return '3M';
    if (diffMonths === 6) return '6M';
    if (diffMonths === 12) return '1Y';
    return null;
  })();

  if (!filtersOpen) return null;
  return (
    <div className="filter-bar">
      <span className="filter-label">🔍 Filters</span>
      {FILTER_FIELDS.map(f => (
        <select key={f.key} className="filter-select" value={filters[f.key]?.[0] || '__all__'}
          onChange={e => handleChange(f.key, e.target.value)} title={f.label}>
          <option value="__all__">All {f.label}s</option>
          {(filterOptions[f.key] || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, borderLeft: '1px solid var(--border-default)', paddingLeft: 10, marginLeft: 4 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', marginRight: 2 }}>Period:</span>
        {DATE_PRESETS.map(p => (
          <button key={p.label}
            onClick={() => applyPreset(p.months)}
            style={{
              padding: '3px 8px', fontSize: 11, borderRadius: 4, cursor: 'pointer',
              border: activePreset === p.label ? '1px solid var(--accent-cyan)' : '1px solid var(--border-default)',
              background: activePreset === p.label ? 'rgba(0,212,255,0.15)' : 'var(--bg-elevated)',
              color: activePreset === p.label ? 'var(--accent-cyan)' : 'var(--text-secondary)',
              fontWeight: activePreset === p.label ? 600 : 400,
            }}>
            {p.label}
          </button>
        ))}
        <input type="date" className="filter-date" title="From"
          value={filters.dateFrom ? filters.dateFrom.toISOString().slice(0, 10) : ''}
          onChange={e => setFilters(prev => ({ ...prev, dateFrom: e.target.value ? new Date(e.target.value) : undefined }))} />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>→</span>
        <input type="date" className="filter-date" title="To"
          value={filters.dateTo ? filters.dateTo.toISOString().slice(0, 10) : ''}
          onChange={e => setFilters(prev => ({ ...prev, dateTo: e.target.value ? new Date(e.target.value) : undefined }))} />
      </div>
      {activeCount > 0 && <button className="btn-clear-filters" onClick={() => setFilters({})}>✕ Clear All ({activeCount})</button>}
    </div>
  );
}

// ─── INLINE UPLOAD MODAL ──────────────────────────────────────────────────────
function UploadModal({ onClose, onDataLoaded }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(null);
  const inputRef = useRef(null);

  const handleFile = (f) => {
    if (!f) return;
    const ext = f.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) { setError('Invalid file type.'); return; }
    setFile(f); setError('');
  };

  const handleLoad = () => {
    if (!file) return;
    setLoading(true); setProgress(0);
    file.arrayBuffer().then(buffer => {
      const worker = new Worker(new URL('./workers/dataWorker.js', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => {
        if (data.type === 'PROGRESS') { setProgress(data.pct); }
        else if (data.type === 'DONE') {
          worker.terminate();
          if (!data.rows.length) { setError('File appears empty.'); setLoading(false); setProgress(null); return; }
          onDataLoaded(data.rows, data.fileName);
          onClose();
        } else if (data.type === 'ERROR') {
          worker.terminate();
          setError(data.message || 'Failed to process file.');
          setLoading(false); setProgress(null);
        }
      };
      worker.onerror = (e) => { worker.terminate(); setError(e.message || 'Worker failed.'); setLoading(false); setProgress(null); };
      worker.postMessage({ type: 'PARSE_EXCEL', buffer, fileName: file.name }, [buffer]);
    }).catch(err => { setError(err.message || 'Failed to read file.'); setLoading(false); setProgress(null); });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(4,9,20,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-bright)', borderRadius: 'var(--radius-xl)', padding: '2rem', width: 420, maxWidth: '90vw' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--accent-cyan)' }}>📤 Update Dataset</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          Upload a new Excel/CSV file. This will replace the current dataset and persist until the next update.
        </div>
        <div
          style={{ border: '2px dashed var(--border-bright)', borderRadius: 10, padding: '1.5rem', textAlign: 'center', cursor: 'pointer', marginBottom: '1rem' }}
          onClick={() => inputRef.current?.click()}
        >
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
            onChange={e => handleFile(e.target.files[0])} />
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>📂</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            {file ? <><strong style={{ color: 'var(--accent-cyan)' }}>📄 {file.name}</strong> ({(file.size / 1024).toFixed(0)} KB)</> : 'Click to choose file'}
          </div>
        </div>
        {error && <div className="error-banner" style={{ marginBottom: '0.75rem' }}><span>⚠️</span><span>{error}</span></div>}
        {progress !== null && (
          <div style={{ marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
              <span>Processing…</span><span>{progress}%</span>
            </div>
            <div style={{ background: 'var(--bg-elevated)', borderRadius: 4, height: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progress}%`, background: 'var(--accent-cyan)', transition: 'width 0.3s' }} />
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-primary" onClick={handleLoad} disabled={!file || loading} style={{ flex: 1 }}>
            {loading ? <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Processing...</> : '🚀 Load Dataset'}
          </button>
          <button onClick={onClose} style={{ padding: '0 1rem', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-secondary)', cursor: 'pointer' }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── TAB LOADING FALLBACK ─────────────────────────────────────────────────────
function TabFallback() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--text-muted)', gap: 12 }}>
      <div className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} /> Loading module...
    </div>
  );
}

// ─── TAB ERROR BOUNDARY ───────────────────────────────────────────────────────
class TabErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(err) { return { error: err }; }
  componentDidCatch(err, info) { console.error('[Tab render error]', err, info); }
  componentDidUpdate(prev) { if (prev.tabId !== this.props.tabId) this.setState({ error: null }); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '2rem', color: '#f87171', background: 'rgba(248,113,113,0.08)', borderRadius: 12, margin: '1rem', fontFamily: 'monospace', fontSize: 13 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Tab failed to render — open browser console (F12) for details</div>
          <div style={{ color: 'var(--text-muted)', wordBreak: 'break-all' }}>{String(this.state.error)}</div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [authed, setAuthed] = useState(false);
  const [currentUser, setCurrentUser] = useState(null); // { id, username, full_name, role, ... }
  const [rawData, setRawData] = useState(null);
  const [fileName, setFileName] = useState('');
  const [savedAt, setSavedAt] = useState('');
  const [backendSynced, setBackendSynced] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('exec');
  const [filters, setFilters] = useState({});
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('nia_theme') || 'dark');
  const [restoreError, setRestoreError] = useState(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('nia_theme', theme);
  }, [theme]);

  // Restore dataset: backend first, local IDB as fallback
  const restoreFromBackend = useCallback(async () => {
    setRestoreError(null);
    // 1. PostgreSQL — primary source of truth
    try {
      const latest = await api.getLatestData();
      if (latest?.rows?.length) {
        setRawData(latest.rows);
        setFileName(latest.file_name || '');
        setSavedAt(latest.uploaded_at || '');
        setBackendSynced(true);
        try { await saveToStorage(latest.rows, latest.file_name || ''); } catch {}
        return true;
      }
    } catch (err) {
      // Backend was reachable but the request failed (e.g. the response was too
      // large to parse) — remember this so the UI can show "couldn't load your
      // data, retry?" instead of the misleading "you have no data yet" prompt.
      setRestoreError(err.message);
    }
    // 2. Backend offline or has no data — fall back to local IDB cache
    try {
      const cached = await loadFromLocalCache();
      if (cached?.rawData?.length) {
        setRawData(cached.rawData);
        setFileName(cached.fileName || '');
        setSavedAt(cached.savedAt || '');
        setBackendSynced(false);
        return true;
      }
    } catch {}
    return false;
  }, []);

  // On mount: load cache into memory, then verify auth before showing anything.
  // Data is NEVER displayed until the user is authenticated.
  useEffect(() => {
    const init = async () => {
      // ── Phase 1: pre-load local cache into memory (fast, no UI shown yet) ────
      let stored = null;
      try { stored = await loadFromLocalCache(); } catch { /* ignore */ }

      if (stored?.rawData?.length) {
        setRawData(stored.rawData);
        setFileName(stored.fileName || '');
        setSavedAt(stored.savedAt || '');
      }

      // ── Phase 2: verify JWT — do NOT release loading screen until this done ──
      const token = localStorage.getItem('nia_token');
      if (!token) {
        // No token → show login immediately (no network wait)
        setInitLoading(false);
        return;
      }
      try {
        const user = await api.getMe();
        setCurrentUser(user);
        setAuthed(true);
        const restored = await restoreFromBackend();
        if (!restored && stored?.rawData?.length) {
          // Backend has no data for this account — push local cache silently
          try {
            await api.uploadData(stored.rawData, stored.fileName || '');
            setBackendSynced(true);
          } catch {}
        }
      } catch {
        // JWT invalid/expired or backend unreachable → stays unauthenticated → login
      }
      setInitLoading(false);
    };
    init();
  }, [restoreFromBackend]);

  // Warn before closing if data hasn't been synced to backend yet
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (!backendSynced && rawData?.length) {
        e.preventDefault();
        e.returnValue = 'Sync is pending — your data has not been saved to the server yet. Please wait for sync to complete before closing.';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [backendSynced, rawData]);

  const handleDataLoaded = useCallback(async (rows, name) => {
    // Automatic backup: before the old dataset gets replaced, download a full
    // backup of what's about to be overwritten. This needs no extra click —
    // it happens as a side effect of the upload action the user is already
    // taking — and it protects data independent of anything server-side.
    if (rawData?.length) {
      try {
        const ws = XLSX.utils.json_to_sheet(rawData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'FlatFee');
        const dateStr = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(wb, `NIA_AutoBackup_${dateStr}.xlsx`);
      } catch { /* best-effort — never block the actual upload on this */ }
    }

    setRawData(rows);
    setFileName(name);
    setSavedAt(new Date().toISOString());
    setBackendSynced(false);
    // 1. Save locally first — instant, always works
    try {
      await saveToStorage(rows, name);
    } catch (err) {
      alert(`Warning: Could not save data locally.\n${err.message}\n\nData is visible now but will be lost on refresh.`);
    }
    // 2. Sync to PostgreSQL — durable cross-session persistence
    try {
      await api.uploadData(rows, name);
      setBackendSynced(true);
    } catch {
      // Backend offline — data is local only; banner will prompt user to sync
    }
  }, [rawData]);

  const handleLogout = useCallback(async () => {
    // Remove auth token only — do NOT wipe local IDB cache.
    // The auth gate ensures data is never visible until JWT is re-verified,
    // so IDB data sitting on disk is safe. Wiping it would break restore on re-login.
    localStorage.removeItem('nia_token');
    try { await api.logout(); } catch {}
    setAuthed(false);
    setCurrentUser(null);
    setRawData(null);
    setFileName('');
    setSavedAt('');
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const user = await api.getMeSilent();
      setCurrentUser(user);
      setAuthed(true);
      return user;
    } catch { return null; }
  }, []);

  if (initLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-void)', color: 'var(--text-muted)', gap: 12 }}>
        <div className="spinner" style={{ width: 24, height: 24, borderWidth: 3 }} /> Verifying session...
      </div>
    );
  }

  if (!authed) {
    // Gate: NO data is visible until the user has authenticated
    return <LoginScreen onLogin={async (user) => {
      setCurrentUser(user);
      setAuthed(true);
      await restoreFromBackend();
    }} />;
  }

  if (!rawData && restoreError) {
    // The backend has data but this browser failed to load it (e.g. the response
    // was too large to parse) — show that plainly instead of the upload prompt,
    // which would wrongly suggest there's no data at all.
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-void)', padding: '2rem' }}>
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: 12 }}>⚠️</div>
          <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: 8 }}>
            Couldn't load your existing data
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>{restoreError}</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button className="btn-icon" style={{ color: 'var(--accent-cyan)', borderColor: 'var(--accent-cyan)' }}
              disabled={retrying}
              onClick={async () => { setRetrying(true); await restoreFromBackend(); setRetrying(false); }}>
              {retrying ? 'Retrying...' : '↻ Retry'}
            </button>
            <button className="btn-icon" onClick={() => setRestoreError(null)}>
              Upload a file instead
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!rawData) {
    return <UploadScreen onDataLoaded={handleDataLoaded} userName={currentUser?.username} />;
  }

  return <Dashboard
    rawData={rawData} fileName={fileName} savedAt={savedAt}
    currentUser={currentUser} activeTab={activeTab} setActiveTab={setActiveTab}
    filters={filters} setFilters={setFilters}
    filtersOpen={filtersOpen} setFiltersOpen={setFiltersOpen}
    onLogout={handleLogout}
    onDataLoaded={handleDataLoaded}
    showUploadModal={showUploadModal} setShowUploadModal={setShowUploadModal}
    refreshUser={refreshUser}
    backendSynced={backendSynced}
    onGoToLogin={() => setAuthed(false)}
    theme={theme} setTheme={setTheme}
    onSyncToBackend={async () => {
      try { await api.uploadData(rawData, fileName); setBackendSynced(true); } catch {}
    }}
  />;
}

const ROLE_COLORS = { admin: '#f87171', operations: '#fbbf24', editor: '#34d399', viewer: '#94a3b8' };
const CAN_UPLOAD  = ['admin', 'operations', 'editor'];

// ─── DATA FRESHNESS BANNER ────────────────────────────────────────────────────
function DataFreshnessBanner({ savedAt }) {
  if (!savedAt) return null;
  const days = Math.floor((Date.now() - new Date(savedAt)) / 86400000);
  if (days < 7) return null;
  const stale = days > 30;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '5px 16px', fontSize: 12,
      background: stale ? 'rgba(248,113,113,0.08)' : 'rgba(251,191,36,0.08)',
      borderBottom: `1px solid ${stale ? 'rgba(248,113,113,0.3)' : 'rgba(251,191,36,0.3)'}`,
      color: stale ? '#f87171' : '#fbbf24',
    }}>
      {stale ? '🔴' : '🟡'}
      <span>
        Dataset is <strong>{days} days old</strong> — last uploaded {new Date(savedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}.
        {stale ? ' Data may be significantly outdated — please refresh.' : ' Consider uploading fresh data soon.'}
      </span>
    </div>
  );
}

// ─── BACKEND SYNC WARNING ────────────────────────────────────────────────────
function SyncWarningBanner({ authed, backendSynced, onSyncToBackend, onGoToLogin, onRetryAuth }) {
  const [syncing, setSyncing]   = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [done, setDone]         = useState(false);
  const autoFired = useRef(false);

  const hasToken = !!localStorage.getItem('nia_token');

  // Auto-reconnect when token exists but not yet authed
  useEffect(() => {
    if (!authed && hasToken && !retrying && !autoFired.current) {
      autoFired.current = true;
      setRetrying(true);
      onRetryAuth().then(user => {
        setRetrying(false);
        if (!user) autoFired.current = false; // allow retry next time
      }).catch(() => { setRetrying(false); autoFired.current = false; });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-sync as soon as authed flips to true
  useEffect(() => {
    if (authed && !backendSynced && !done && !syncing) {
      setSyncing(true);
      onSyncToBackend().then(() => {
        setSyncing(false);
        setDone(true);
      }).catch(() => setSyncing(false));
    }
  }, [authed]); // eslint-disable-line react-hooks/exhaustive-deps

  if (backendSynced || done) return null;

  const handleSync = async () => {
    setSyncing(true);
    await onSyncToBackend();
    setSyncing(false);
    setDone(true);
  };

  const handleRetry = async () => {
    setRetrying(true);
    const user = await onRetryAuth();
    setRetrying(false);
    if (!user) alert('Could not connect to backend. Make sure start_all.bat is running.');
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px', fontSize: 12,
      background: 'rgba(251,191,36,0.1)', borderBottom: '1px solid rgba(251,191,36,0.4)',
      color: '#fbbf24',
    }}>
      <span>⚠️</span>
      <span style={{ flex: 1 }}>
        <strong>Data not synced to server.</strong> It is saved locally only — clearing your browser will delete it permanently.
      </span>

      {/* Already have a valid token — just reconnect silently */}
      {!authed && hasToken && (
        <button onClick={handleRetry} disabled={retrying} style={{
          padding: '3px 14px', fontSize: 11, borderRadius: 6, cursor: retrying ? 'default' : 'pointer',
          background: 'rgba(251,191,36,0.2)', border: '1px solid #fbbf24',
          color: '#fbbf24', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {retrying ? <><div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> Reconnecting…</> : '🔄 Reconnect & Sync'}
        </button>
      )}

      {/* No token — must log in */}
      {!authed && !hasToken && (
        <button onClick={onGoToLogin} style={{
          padding: '3px 14px', fontSize: 11, borderRadius: 6, cursor: 'pointer',
          background: 'rgba(251,191,36,0.2)', border: '1px solid #fbbf24',
          color: '#fbbf24', fontWeight: 600,
        }}>
          🔐 Log In to Sync
        </button>
      )}

      {/* Authenticated — show sync */}
      {authed && (
        <button onClick={handleSync} disabled={syncing} style={{
          padding: '3px 14px', fontSize: 11, borderRadius: 6, cursor: syncing ? 'default' : 'pointer',
          background: 'rgba(251,191,36,0.2)', border: '1px solid #fbbf24',
          color: '#fbbf24', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {syncing ? <><div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> Syncing…</> : '☁️ Sync Now'}
        </button>
      )}
    </div>
  );
}

// ─── THRESHOLD ALERT BANNER ───────────────────────────────────────────────────
function AlertBanner({ kpis }) {
  const [dismissed, setDismissed] = useState([]);
  if (!kpis) return null;

  const churnPct = kpis.totalUniqueSubscribers > 0
    ? Math.round(kpis.exitedSubscribers / kpis.totalUniqueSubscribers * 100) : 0;
  const ret = kpis.retentionRate;

  const all = [
    ret < 70 && { id: 'ret-crit',   type: 'error', msg: `Critical: Retention rate is ${ret}% — below 70% safety threshold. Immediate action required.` },
    ret >= 70 && ret < 80 && { id: 'ret-warn', type: 'warn', msg: `Retention rate is ${ret}% — below the 80% benchmark. Monitor closely.` },
    churnPct > 10 && { id: 'churn-crit', type: 'error', msg: `High cumulative churn: ${churnPct}% of all subscribers have exited.` },
    churnPct > 5 && churnPct <= 10 && { id: 'churn-warn', type: 'warn', msg: `Cumulative churn is ${churnPct}% of total subscriber base.` },
  ].filter(Boolean);

  const visible = all.filter(a => !dismissed.includes(a.id));
  if (!visible.length) return null;

  return (
    <div>
      {visible.map(a => (
        <div key={a.id} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '5px 16px', fontSize: 12,
          background: a.type === 'error' ? 'rgba(248,113,113,0.08)' : 'rgba(251,191,36,0.08)',
          borderLeft: `3px solid ${a.type === 'error' ? '#f87171' : '#fbbf24'}`,
          color: a.type === 'error' ? '#f87171' : '#fbbf24',
        }}>
          <span>{a.type === 'error' ? '🔴' : '🟡'}</span>
          <span style={{ flex: 1 }}>{a.msg}</span>
          <button onClick={() => setDismissed(p => [...p, a.id])}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '0 4px', fontSize: 14, lineHeight: 1 }}>✕</button>
        </div>
      ))}
    </div>
  );
}

// ─── DRAGGABLE TAB NAV ────────────────────────────────────────────────────────
const TAB_ORDER_KEY = 'nia_tab_order';

function loadTabOrder() {
  try {
    const saved = JSON.parse(localStorage.getItem(TAB_ORDER_KEY) || '[]');
    if (Array.isArray(saved) && saved.length === TABS.length && saved.every(id => TABS.find(t => t.id === id))) {
      return saved.map(id => TABS.find(t => t.id === id));
    }
    // Tab list changed — reset saved order to include new tabs
    localStorage.removeItem(TAB_ORDER_KEY);
  } catch {}
  return TABS;
}

function DraggableTabNav({ activeTab, setActiveTab }) {
  const [tabs, setTabs] = useState(loadTabOrder);
  const [, startTransition] = useTransition();
  const dragIdx = useRef(null);
  const overIdx = useRef(null);

  const onDragStart = (i) => { dragIdx.current = i; };
  const onDragEnter = (i) => { overIdx.current = i; };
  const onDragOver  = (e) => { e.preventDefault(); };

  const onDrop = () => {
    const from = dragIdx.current, to = overIdx.current;
    if (from === null || to === null || from === to) return;
    const next = [...tabs];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setTabs(next);
    localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(next.map(t => t.id)));
    dragIdx.current = null; overIdx.current = null;
  };

  return (
    <nav className="tab-nav">
      {tabs.map((t, i) => (
        <button
          key={t.id}
          draggable
          onDragStart={() => onDragStart(i)}
          onDragEnter={() => onDragEnter(i)}
          onDragOver={onDragOver}
          onDrop={onDrop}
          className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
          onClick={() => startTransition(() => setActiveTab(t.id))}
          title="Drag to reorder"
          style={{ cursor: 'grab' }}
        >
          <span>{t.icon}</span>
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

// ─── DASHBOARD (split out to keep useMemo stable) ────────────────────────────
function Dashboard({ rawData, fileName, savedAt, currentUser, activeTab, setActiveTab, filters, setFilters,
  filtersOpen, setFiltersOpen, onLogout, onDataLoaded, showUploadModal, setShowUploadModal, refreshUser,
  backendSynced, onSyncToBackend, onGoToLogin, theme, setTheme }) {

  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [goal, setGoal] = useState(() => Number(localStorage.getItem('nia_goal')) || 0);
  useEffect(() => { localStorage.setItem('nia_goal', String(goal)); }, [goal]);

  // NOTE: this used to run derived computations off useDeferredValue(filters)
  // to keep the filter UI responsive. Removed — it was a source of stale/stuck
  // KPI values (recomputation could lag behind or never catch up with the
  // latest filter state). Correctness matters more here than that micro-
  // optimization; the underlying computations are fast enough without it.
  const isFilterPending = false;

  // Heavy computations that only re-run when the file changes
  const baseData = useMemo(() => {
    const master = buildCurrentSubscriptionMaster(rawData);
    const filterOptions = getFilterOptions(master);
    const cohorts = buildCohortData(rawData);
    const migrationData = getMigrationData(rawData);
    const aumTimeline = getAUMSummaryTimeline(rawData);
    // These three are filter-independent — compute once per file upload, not per filter change
    const unsubData = getUnsubscriberAnalysis(rawData);
    const ltvData = getLTVData(rawData, master);
    const reactivationPipeline = getReactivationPipeline(rawData);
    // Always-unfiltered AUM total — a stable headline number that never changes
    // with the period/basket filters, shown alongside the filtered AUM figure.
    const totalAUMAllTime = getSummaryKPIs(master, rawData).totalAUM;
    return { master, filterOptions, cohorts, migrationData, aumTimeline, unsubData, ltvData, reactivationPipeline, totalAUMAllTime };
  }, [rawData]);

  // Filter-dependent computations — recomputes whenever filters changes
  const derived = useMemo(() => {
    const { master, cohorts, migrationData } = baseData;

    // Filtered master: EVERY filter applies here — dimensions (smallcase, state,
    // broker, etc.) AND the date period. "1M" means "active at some point during
    // the last month," not "started in the last month" (see overlapsPeriod).
    const filtered = applyFilters(master, filters);

    // Time-series + dimension-aware: rows matching all filters, keyed by whether
    // the subscription overlapped the selected period.
    const filteredRaw = filterRawByDate(rawData, filters);
    const monthly = getMonthlyMovement(filteredRaw);
    const cancellationMetrics = getCancellationMetrics(filteredRaw);

    const kpis = getSummaryKPIs(filtered, filteredRaw);
    const retentionMetrics = getRetentionMetrics(monthly);
    const products = getProductMetrics(filtered, filteredRaw);
    const renewalFunnel = buildRenewalFunnel(filtered);
    const renewalByProduct = getRenewalByProduct(filtered);
    const discountSummary = getDiscountSummary(filtered);
    const discountByProduct = getDiscountByDimension(filtered, 'Smallcase Name');
    const discountByBroker = getDiscountByDimension(filtered, 'Broker Name');
    const discountByState = getDiscountByDimension(filtered, 'State');
    const offerCodes = getOfferCodeMetrics(filtered);
    const investorSegments = getInvestorSegments(filtered);
    const brokerMetrics = getBrokerMetrics(filtered);
    const attributionMetrics = getAttributionMetrics(filtered);
    const geoMetrics = getGeographyMetrics(filtered);
    const insights = generateInsights(filtered, monthly, products, brokerMetrics, geoMetrics);

    // Period-over-period: compare the immediately preceding window of the same length
    let prevKpis = null;
    if (filters.dateFrom && filters.dateTo) {
      const periodMs = filters.dateTo.getTime() - filters.dateFrom.getTime();
      const prevTo   = new Date(filters.dateFrom.getTime() - 1);
      const prevFrom = new Date(prevTo.getTime() - periodMs);
      const prevFilters = { ...filters, dateFrom: prevFrom, dateTo: prevTo };
      const prevRaw      = filterRawByDate(rawData, prevFilters);
      const prevFiltered = applyFilters(master, prevFilters);
      prevKpis = getSummaryKPIs(prevFiltered, prevRaw);
    }

    const mrrMetrics          = getMRRMetrics(filtered, filteredRaw);
    const revenueAtRisk       = getRevenueAtRisk(filtered);
    const churnRisk           = getChurnRiskScores(filtered);
    const rmPerformance       = getRMPerformance(filtered, filteredRaw);
    const renewalCalendar     = getRenewalCalendar(filtered);
    const offerCodeROI        = getOfferCodeROI(filtered, filteredRaw);

    return {
      filteredMaster: filtered, filteredRaw, kpis, retentionMetrics, products,
      renewalFunnel, renewalByProduct, discountSummary, discountByProduct,
      discountByBroker, discountByState, offerCodes, investorSegments,
      brokerMetrics, attributionMetrics, geoMetrics, cancellationMetrics,
      insights, monthly, cohorts, migrationData, prevKpis,
      mrrMetrics, revenueAtRisk, churnRisk,
      rmPerformance, renewalCalendar, offerCodeROI,
    };
  }, [baseData, filters]);

  const handleExport = useCallback(() => {
    if (!derived.filteredMaster?.length) return;
    const ws = XLSX.utils.json_to_sheet(derived.filteredMaster);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Subscribers');
    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `NIA_Subscribers_${dateStr}.xlsx`);
  }, [derived.filteredMaster]);

  // Full raw-data backup — every row exactly as uploaded, unfiltered and
  // unprocessed. Unlike "Export" above (which is a filtered/deduplicated
  // view), this file can be re-uploaded to fully restore the dataset if the
  // server ever loses it, independent of any server/hosting issue.
  const handleExportRawBackup = useCallback(() => {
    if (!rawData?.length) return;
    const ws = XLSX.utils.json_to_sheet(rawData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'FlatFee');
    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `NIA_Backup_${dateStr}.xlsx`);
  }, [rawData]);

  const tabProps = useMemo(() => ({
    currentMaster: derived.filteredMaster, rawData,
    kpis: derived.kpis, prevKpis: derived.prevKpis,
    totalAUMAllTime: baseData.totalAUMAllTime,
    retentionMetrics: derived.retentionMetrics,
    monthly: derived.monthly, products: derived.products, cohorts: derived.cohorts,
    filteredRaw: derived.filteredRaw,
    renewalFunnel: derived.renewalFunnel, renewalByProduct: derived.renewalByProduct,
    discountSummary: derived.discountSummary, discountByProduct: derived.discountByProduct,
    discountByBroker: derived.discountByBroker, discountByState: derived.discountByState,
    offerCodes: derived.offerCodes, investorSegments: derived.investorSegments,
    brokerMetrics: derived.brokerMetrics, attributionMetrics: derived.attributionMetrics,
    geoMetrics: derived.geoMetrics, cancellationMetrics: derived.cancellationMetrics,
    migrationData: derived.migrationData, insights: derived.insights,
    summaryData: baseData.aumTimeline,
    unsubData: baseData.unsubData,
    mrrMetrics: derived.mrrMetrics,
    revenueAtRisk: derived.revenueAtRisk,
    ltvData: baseData.ltvData,
    churnRisk: derived.churnRisk,
    reactivationPipeline: baseData.reactivationPipeline,
    rmPerformance: derived.rmPerformance,
    renewalCalendar: derived.renewalCalendar,
    offerCodeROI: derived.offerCodeROI,
    goal, setGoal, currentUser,
    filters, setFilters,
    refreshUser,
  }), [derived, baseData, goal, currentUser, filters, rawData, setGoal, setFilters, refreshUser]);

  const ActiveTab = TAB_COMPONENTS[activeTab];
  const kpis = derived.kpis;
  const savedAtLabel = savedAt ? new Date(savedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

  return (
    <div className="app-shell">
      {showUploadModal && (
        <UploadModal onClose={() => setShowUploadModal(false)} onDataLoaded={onDataLoaded} />
      )}
      {showAdminPanel && (
        <AdminPanel currentUser={currentUser} onClose={() => setShowAdminPanel(false)} />
      )}

      {/* Header */}
      <header className="app-header">
        <div className="header-brand">
          <div className="header-brand-icon">📊</div>
          <div>
            <span className="header-brand-text">NIA Antigravity</span>
            <span className="header-brand-sep">·</span>
            <span className="header-brand-sub">Subscription Intelligence</span>
          </div>
        </div>

        <div className="header-meta">
          <div className="header-stat"><span>Subscribers</span><span className="hs-val">{formatNumber(kpis?.totalUniqueSubscribers || 0)}</span></div>
          <div className="header-stat"><span>Active</span><span className="hs-val">{formatNumber(kpis?.activeSubscribers || 0)}</span></div>
          <div className="header-stat"><span>Retention</span><span className="hs-val">{kpis?.retentionRate || 0}%</span></div>
          <div className="header-stat">
            <span>Dataset</span>
            <span className="hs-val" style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={fileName}>
              {fileName.replace(/\.[^.]+$/, '')}
            </span>
          </div>
          {savedAtLabel && (
            <div className="header-stat"><span>Updated</span><span className="hs-val">{savedAtLabel}</span></div>
          )}
        </div>

        <div className="header-actions">
          <ThemeToggle theme={theme} setTheme={setTheme} />
          <button className="btn-icon" onClick={() => setFiltersOpen(o => !o)}>
            🔍 {filtersOpen ? 'Hide' : 'Show'} Filters
          </button>
          {currentUser?.role === 'admin' && (
            <button className="btn-icon" style={{ color: '#fbbf24', borderColor: '#fbbf24' }}
              onClick={() => setShowAdminPanel(true)}>
              ⚙️ Admin
            </button>
          )}
          {(!currentUser || CAN_UPLOAD.includes(currentUser.role)) && (
            <button className="btn-icon" style={{ color: 'var(--accent-cyan)', borderColor: 'var(--accent-cyan)' }}
              onClick={() => setShowUploadModal(true)}>
              📤 Update Data
            </button>
          )}
          <button className="btn-icon" style={{ color: '#34d399', borderColor: '#34d399' }}
            onClick={handleExport} title="Export filtered subscriber data as Excel">
            ⬇️ Export
          </button>
          <button className="btn-icon" style={{ color: '#fbbf24', borderColor: '#fbbf24' }}
            onClick={handleExportRawBackup} title="Download a full backup of the raw uploaded data — keep this safe; re-uploading it fully restores the dataset">
            💾 Backup
          </button>
          <button className="btn-icon" onClick={onLogout}
            title={`${currentUser?.full_name || currentUser?.username} · ${currentUser?.role} · Click to logout`}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            👤 {currentUser?.username}
            <span style={{
              fontSize: '0.65rem', fontWeight: 700, padding: '1px 6px',
              borderRadius: 10, background: 'rgba(0,0,0,0.3)',
              color: ROLE_COLORS[currentUser?.role] || 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              {currentUser?.role}
            </span>
          </button>
        </div>
      </header>

      <SyncWarningBanner authed={!!currentUser} backendSynced={backendSynced} onSyncToBackend={onSyncToBackend} onGoToLogin={onGoToLogin} onRetryAuth={refreshUser} />
      <DataFreshnessBanner savedAt={savedAt} />
      <AlertBanner kpis={kpis} />

      {/* Tab Nav — drag tabs to reorder; order saved to localStorage */}
      <DraggableTabNav activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Filter Bar */}
      {baseData.filterOptions && (
        <FilterBar filterOptions={baseData.filterOptions} filters={filters} setFilters={setFilters} filtersOpen={filtersOpen} />
      )}

      {/* Active tab only — dims slightly while deferred filter recalculates */}
      <main className={`tab-content${isFilterPending ? ' tab-content-pending' : ''}`}>
        <TabErrorBoundary tabId={activeTab}>
          <Suspense fallback={<TabFallback />}>
            <ActiveTab {...tabProps} />
          </Suspense>
        </TabErrorBoundary>
      </main>

      {/* Ticker Bar */}
      <div className="ticker-bar">
        {[
          { label: 'TOTAL SUBS',    val: formatNumber(kpis?.totalSubscriptions || 0),    cls: '' },
          { label: 'UNIQUE INV',    val: formatNumber(kpis?.totalUniqueSubscribers || 0), cls: '' },
          { label: 'ACTIVE',        val: formatNumber(kpis?.activeSubscribers || 0),       cls: 'ticker-pos' },
          { label: 'EXITED',        val: formatNumber(kpis?.exitedSubscribers || 0),       cls: 'ticker-neg' },
          { label: 'NEW UNIQUE MTD',val: `+${formatNumber(kpis?.newUniqueMTD || 0)}`,      cls: 'ticker-pos' },
          { label: 'RENEWALS MTD',  val: `+${formatNumber(kpis?.renewalsMTD || 0)}`,       cls: 'ticker-pos' },
          { label: 'RETENTION',     val: `${kpis?.retentionRate || 0}%`,                   cls: 'ticker-pos' },
          { label: 'RENEWAL RATE',  val: `${kpis?.renewalRate || 0}%`,                     cls: 'ticker-pos' },
          { label: 'AVG PLAN',      val: formatCurrency(kpis?.avgPlanAmount || 0, true),   cls: '' },
          { label: 'PRODUCTS',      val: kpis?.totalProducts || 0,                         cls: '' },
        ].map(({ label, val, cls }) => (
          <div key={label} className="ticker-item">
            <span className="ticker-label">{label}</span>
            <span className={`ticker-val ${cls}`}>{val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
