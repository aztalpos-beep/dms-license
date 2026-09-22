import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import {
  getCashbookEntry,
  getCashbookHistory,
  saveCashbookEntry,
  deleteCashbookEntry,
  getCashbookTrash,
  restoreCashbookEntry,
} from '../api.js';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(d) {
  if (!d) return '';
  return String(d).slice(0, 10);
}

function blankLine() {
  return { particulars: '', amount: '' };
}

// One side of the ledger (Credit / Debit): itemized rows the user types by
// hand, an "Add Line" button, and an auto-summed (never editable) total.
function LedgerSide({ title, color, lines, onChange, onAdd, onRemove, total }) {
  return (
    <div style={{ flex: 1, minWidth: 0, border: '1px solid var(--line-light)', borderRadius: 6, overflow: 'hidden' }}>
      <div style={{ background: color, color: '#fff', fontWeight: 700, fontSize: 12.5, textAlign: 'center', padding: '7px 6px' }}>
        {title}
      </div>
      <div style={{ padding: 10 }}>
        {lines.map((line, idx) => (
          <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
            <input
              value={line.particulars}
              onChange={(e) => onChange(idx, 'particulars', e.target.value)}
              placeholder="Particulars"
              style={{ flex: 3 }}
            />
            <input
              type="number"
              step="0.01"
              value={line.amount}
              onChange={(e) => onChange(idx, 'amount', e.target.value)}
              placeholder="0.00"
              style={{ flex: 1.4 }}
            />
            <button
              type="button"
              className="btn ghost"
              onClick={() => onRemove(idx)}
              style={{ padding: '4px 8px', fontSize: 12 }}
              title="Remove line"
            >
              ✕
            </button>
          </div>
        ))}
        <button type="button" className="btn" onClick={onAdd} style={{ fontSize: 12, padding: '4px 10px', marginTop: 2 }}>
          + Add Line
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 8, borderTop: '1px solid var(--line-light)', fontWeight: 700, fontSize: 13 }}>
          <span>Total</span>
          <span className="num">{total.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

export default function CashbookPage() {
  const [date, setDate] = useState(today());
  const [entry, setEntry] = useState(null);

  const [openingCash, setOpeningCash] = useState('0');
  const [closingCash, setClosingCash] = useState('0');
  const [adjustmentNote, setAdjustmentNote] = useState('');
  const [creditLines, setCreditLines] = useState([blankLine()]);
  const [debitLines, setDebitLines] = useState([blankLine()]);

  const [history, setHistory] = useState([]);
  const [trash, setTrash] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState('entry'); // 'entry' | 'history' | 'trash'

  function applyEntry(data) {
    setEntry(data);
    setOpeningCash(String(data.opening_cash));
    setClosingCash(String(data.closing_cash));
    setAdjustmentNote(data.adjustment_note || '');
    const c = (data.credit_lines || []).map((l) => ({ particulars: l.particulars, amount: String(l.amount) }));
    const d = (data.debit_lines || []).map((l) => ({ particulars: l.particulars, amount: String(l.amount) }));
    setCreditLines(c.length > 0 ? c : [blankLine()]);
    setDebitLines(d.length > 0 ? d : [blankLine()]);
  }

  function loadEntry(d) {
    getCashbookEntry(d).then(applyEntry).catch((err) => setError(err.message));
  }

  useEffect(() => { loadEntry(date); }, [date]);

  function loadHistory() {
    setError('');
    getCashbookHistory().then(setHistory).catch((err) => setError(err.message));
  }

  function loadTrash() {
    setError('');
    getCashbookTrash().then(setTrash).catch((err) => setError(err.message));
  }

  function updateLine(setter, idx, field, value) {
    setter((lines) => lines.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  }
  function addLine(setter) {
    setter((lines) => [...lines, blankLine()]);
  }
  function removeLine(setter, idx) {
    setter((lines) => lines.filter((_, i) => i !== idx));
  }

  const totalCredit = creditLines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
  const totalDebit = debitLines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
  const suggestedClosing = (Number(openingCash) || 0) + totalCredit - totalDebit;

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const saved = await saveCashbookEntry({
        ledger_date: date,
        opening_cash: Number(openingCash) || 0,
        closing_cash: Number(closingCash) || 0,
        adjustment_note: adjustmentNote || undefined,
        credit_lines: creditLines
          .filter((l) => Number(l.amount) > 0)
          .map((l) => ({ particulars: l.particulars, amount: Number(l.amount) })),
        debit_lines: debitLines
          .filter((l) => Number(l.amount) > 0)
          .map((l) => ({ particulars: l.particulars, amount: Number(l.amount) })),
      });
      applyEntry(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(e, row) {
    e.preventDefault();
    e.stopPropagation();

    const confirmed = window.confirm(
      `Delete the cashbook entry for ${fmtDate(row.ledger_date)}?\n\n` +
      `This entry will be moved to Trash for 3 days. ` +
      `The database record will not be physically deleted.`
    );

    if (!confirmed) return;

    try {
      setError('');
      await deleteCashbookEntry(row.id);
      loadHistory();
      // If we just deleted the entry for the date currently open in the
      // entry form, refresh it so the form falls back to the live preview.
      if (row.ledger_date && String(row.ledger_date).slice(0, 10) === date) {
        loadEntry(date);
      }
    } catch (err) {
      // If the backend rejects this (e.g. insufficient role), the error
      // message from the API is shown here — authorization is enforced
      // server-side, not by hiding the button on the frontend.
      setError(err.message);
    }
  }

  async function handleRestore(e, row) {
    e.preventDefault();
    e.stopPropagation();

    try {
      setError('');
      await restoreCashbookEntry(row.id);
      loadTrash();
    } catch (err) {
      setError(err.message);
    }
  }

  function switchView(next) {
    setView(next);
    if (next === 'history') loadHistory();
    if (next === 'trash') loadTrash();
  }

  if (error && !entry) return <Layout><div className="login-error" style={{ maxWidth: 900 }}>{error}</div></Layout>;
  if (!entry) return <Layout><p style={{ color: '#6b7280', fontSize: 13 }}>Loading…</p></Layout>;

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>Daily Cash Ledger</h2>
          <p>Fully manual — add each Cash In / Cash Out line by hand; nothing is pulled from sales or expenses.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={view === 'entry' ? 'btn primary' : 'btn'} onClick={() => switchView('entry')}>
            Entry
          </button>
          <button className={view === 'history' ? 'btn primary' : 'btn'} onClick={() => switchView('history')}>
            History
          </button>
          <button className={view === 'trash' ? 'btn primary' : 'btn'} onClick={() => switchView('trash')}>
            Trash
          </button>
        </div>
      </div>

      {error && (
        <div className="login-error" style={{ maxWidth: 900, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {view === 'history' && (
        history.length === 0 ? (
          <div className="empty-state">No cashbook entries saved yet.</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Opening</th>
                  <th>Cash In (Total)</th>
                  <th>Cash Out (Total)</th>
                  <th>Closing</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr
                    key={h.id}
                    onClick={() => { setDate(fmtDate(h.ledger_date)); setView('entry'); }}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>{fmtDate(h.ledger_date)}</td>
                    <td className="num">{Number(h.opening_cash).toLocaleString()}</td>
                    <td className="num">{(Number(h.cash_in_sales) + Number(h.cash_in_recovery) + Number(h.cash_in_other)).toLocaleString()}</td>
                    <td className="num">{(Number(h.cash_out_expenses) + Number(h.cash_out_refunds)).toLocaleString()}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{Number(h.closing_cash).toLocaleString()}</td>
                    <td
                      onClick={(e) => { e.stopPropagation(); }}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      <button
                        type="button"
                        className="btn ghost"
                        style={{
                          padding: '5px 12px',
                          fontSize: 11,
                          color: '#dc2626',
                          border: '1px solid rgba(220, 38, 38, 0.35)',
                          background: '#fff',
                          cursor: 'pointer',
                        }}
                        onClick={(e) => handleDelete(e, h)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {view === 'trash' && (
        trash.length === 0 ? (
          <div className="empty-state">Trash is empty.</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Closing</th>
                  <th>Deleted By</th>
                  <th>Deleted At</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {trash.map((h) => (
                  <tr key={h.id}>
                    <td>{fmtDate(h.ledger_date)}</td>
                    <td className="num">{Number(h.closing_cash).toLocaleString()}</td>
                    <td>{h.deleted_by_name || '—'}</td>
                    <td>{h.deleted_at ? String(h.deleted_at).slice(0, 19).replace('T', ' ') : '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        className="btn"
                        style={{ padding: '5px 12px', fontSize: 11 }}
                        onClick={(e) => handleRestore(e, h)}
                      >
                        Restore
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {view === 'entry' && (
        <form className="form-card" style={{ maxWidth: 1000 }} onSubmit={handleSave}>
          <div className="form-row">
            <div className="field">
              <label>Branch</label>
              <div style={{ padding: '8px 10px', border: '1.5px solid var(--line-light)', borderRadius: 4, fontWeight: 600 }}>
                {entry.branch_name || '—'}
              </div>
            </div>
            <div className="field">
              <label>Ledger Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="field">
              <label>Opening Cash In Hand</label>
              <input type="number" step="0.01" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', margin: '16px 0' }}>
            <LedgerSide
              title="CASH IN (CREDIT)"
              color="var(--success)"
              lines={creditLines}
              onChange={(idx, field, value) => updateLine(setCreditLines, idx, field, value)}
              onAdd={() => addLine(setCreditLines)}
              onRemove={(idx) => removeLine(setCreditLines, idx)}
              total={totalCredit}
            />
            <LedgerSide
              title="CASH OUT (DEBIT)"
              color="var(--danger)"
              lines={debitLines}
              onChange={(idx, field, value) => updateLine(setDebitLines, idx, field, value)}
              onAdd={() => addLine(setDebitLines)}
              onRemove={(idx) => removeLine(setDebitLines, idx)}
              total={totalDebit}
            />
          </div>

          <div className="form-row">
            <div className="field">
              <label>Closing Cash In Hand (type the actual counted amount)</label>
              <input type="number" step="0.01" value={closingCash} onChange={(e) => setClosingCash(e.target.value)} />
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                For reference only — Opening + Cash In − Cash Out = {suggestedClosing.toLocaleString()}. Not filled in automatically.
              </div>
            </div>
            <div className="field">
              <label>Adjustment Note</label>
              <input value={adjustmentNote} onChange={(e) => setAdjustmentNote(e.target.value)} placeholder="optional — e.g. reason for a mismatch" />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
            <button className="btn primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : entry.saved ? 'Update Entry' : 'Save Entry'}
            </button>
            {entry.saved && (
              <>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>Already saved for this date — saving again will update it.</span>
                <button
                  type="button"
                  className="btn ghost"
                  style={{ color: '#dc2626', border: '1px solid rgba(220, 38, 38, 0.35)' }}
                  onClick={(e) => handleDelete(e, entry)}
                >
                  Delete This Entry
                </button>
              </>
            )}
          </div>
        </form>
      )}
    </Layout>
  );
}
