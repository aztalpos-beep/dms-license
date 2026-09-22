import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { getCustomers, getCustomer, addLedgerEntry, deleteLedgerEntry, downloadCustomerStatement } from '../api.js';

export default function LedgerPage() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [customer, setCustomer] = useState(null);
  const [error, setError] = useState('');

  const [showEntryForm, setShowEntryForm] = useState(false);
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [chargeAmount, setChargeAmount] = useState('');
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);

  async function handleDownloadStatement() {
    setError('');
    setDownloading(true);
    try {
      await downloadCustomerStatement(selectedId);
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading(false);
    }
  }

  function loadCustomers(currentSearch) {
    getCustomers(currentSearch ? { search: currentSearch } : {}).then(setCustomers).catch((err) => setError(err.message));
  }

  useEffect(() => { loadCustomers(''); }, []);

  function loadSelectedCustomer(customerId) {
    if (!customerId) { setCustomer(null); return; }
    getCustomer(customerId).then(setCustomer).catch((err) => setError(err.message));
  }

  function handleSelect(customerId) {
    setSelectedId(customerId);
    loadSelectedCustomer(customerId);
  }

  async function handleAddEntry(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const charge = Number(chargeAmount) || 0;
      const advance = Number(advanceAmount) || 0;
      if (charge < 0 || advance < 0) {
        setError('Amounts cannot be negative.');
        setSaving(false);
        return;
      }
      if (charge <= 0 && advance <= 0) {
        setError('Enter a charge amount, an advance amount, or both.');
        setSaving(false);
        return;
      }
      if (charge > 0) {
        await addLedgerEntry(selectedId, { entry_type: 'debit', amount: charge, description: description || 'Charge added', entry_date: entryDate });
      }
      if (advance > 0) {
        await addLedgerEntry(selectedId, { entry_type: 'credit', amount: advance, description: description || 'Advance / payment received', entry_date: entryDate });
      }
      setChargeAmount(''); setAdvanceAmount(''); setDescription(''); setShowEntryForm(false);
      loadSelectedCustomer(selectedId);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteEntry(entryId) {
    if (!window.confirm('Delete this ledger entry? This cannot be undone.')) return;
    setError('');
    try {
      await deleteLedgerEntry(selectedId, entryId);
      loadSelectedCustomer(selectedId);
    } catch (err) {
      setError(err.message);
    }
  }

  let ledgerRows = [];
  let balance = 0;
  let totalDebit = 0;
  let totalCredit = 0;
  if (customer) {
    balance = Number(customer.outstanding_balance);
    const chronological = [...customer.ledger].sort(
      (a, b) => new Date(a.entry_date) - new Date(b.entry_date) || a.id - b.id
    );
    let runningCollected = 0;
    let runningBalance = 0;
    ledgerRows = chronological.map((entry) => {
      const amt = Number(entry.amount);
      if (entry.entry_type === 'debit') runningBalance += amt;
      else { runningBalance -= amt; runningCollected += amt; }
      return { ...entry, runningCollected, runningBalance };
    });
    totalDebit = chronological.reduce((s, e) => (e.entry_type === 'debit' ? s + Number(e.amount) : s), 0);
    totalCredit = chronological.reduce((s, e) => (e.entry_type === 'credit' ? s + Number(e.amount) : s), 0);
  }

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>Ledger</h2>
          <p>Select a customer to view or add to their running account.</p>
        </div>
      </div>

      <div className="filter-bar">
        <input
          type="text"
          placeholder="Search customer by name, mobile, or NIC…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); loadCustomers(e.target.value); }}
          style={{ minWidth: 260 }}
        />
        <select
          value={selectedId}
          onChange={(e) => handleSelect(e.target.value)}
          style={{ minWidth: 220 }}
        >
          <option value="">— Select customer —</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.mobile_no || 'no mobile'})</option>)}
        </select>
      </div>

      {error && <div className="login-error" style={{ maxWidth: 640 }}>{error}</div>}

      {!customer ? (
        <div className="empty-state">Select a customer above to view their ledger.</div>
      ) : (
        <>
          <div className="page-header" style={{ border: 'none', marginBottom: 12 }}>
            <div>
              <h2 style={{ fontSize: 16 }}>{customer.name}</h2>
              <p>{customer.mobile_no || '—'} · S/O {customer.father_name || '—'}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div className="num" style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10.5, textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--font-body)' }}>Balance</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: balance > 0 ? 'var(--danger)' : 'var(--success)' }}>{balance.toLocaleString()}</div>
              </div>
              <button className="btn" onClick={handleDownloadStatement} disabled={downloading}>
                {downloading ? 'Preparing…' : '⤓ Download Statement'}
              </button>
              <button className="btn primary" onClick={() => setShowEntryForm((s) => !s)}>
                {showEntryForm ? 'Cancel' : '+ Ledger Entry'}
              </button>
            </div>
          </div>

          {/* Brief summary: total charged, total collected, net balance */}
          <div className="form-card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              <div>
                <label>Total Charged (Debit)</label>
                <div className="num" style={{ fontSize: 18, fontWeight: 700, color: 'var(--danger)' }}>
                  {totalDebit.toLocaleString()}
                </div>
              </div>
              <div>
                <label>Total Collected (Credit)</label>
                <div className="num" style={{ fontSize: 18, fontWeight: 700, color: 'var(--success)' }}>
                  {totalCredit.toLocaleString()}
                </div>
              </div>
              <div>
                <label>Net Balance Owed</label>
                <div className="num" style={{ fontSize: 18, fontWeight: 700, color: balance > 0 ? 'var(--danger)' : 'var(--success)' }}>
                  {balance.toLocaleString()}
                </div>
              </div>
            </div>
          </div>

          {showEntryForm && (
            <form className="form-card" onSubmit={handleAddEntry} style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 12 }}>
                e.g. customer took an item worth 5,000 and gave 4,000 advance — enter both below in one go.
              </p>
              <div className="form-row">
                <div className="field">
                  <label>Date</label>
                  <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
                </div>
                <div className="field">
                  <label>Description</label>
                  <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. spare part purchase" />
                </div>
              </div>
              <div className="form-row">
                <div className="field">
                  <label>Charge Amount (item / new debt)</label>
                  <input type="number" step="0.01" min="0" value={chargeAmount} onChange={(e) => setChargeAmount(e.target.value)} placeholder="0" />
                </div>
                <div className="field">
                  <label>Advance / Payment Received</label>
                  <input type="number" step="0.01" min="0" value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)} placeholder="0" />
                </div>
              </div>

              <div className="form-card" style={{ background: 'var(--accent-bg)', border: 'none', marginBottom: 16 }}>
                <label>Remaining Balance After This Entry</label>
                <div className="num" style={{ fontSize: 18, fontWeight: 700, color: (balance + (Number(chargeAmount) || 0) - (Number(advanceAmount) || 0)) > 0 ? 'var(--danger)' : 'var(--success)' }}>
                  {(balance + (Number(chargeAmount) || 0) - (Number(advanceAmount) || 0)).toLocaleString()}
                </div>
              </div>

              <button className="btn primary" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Add Entry'}
              </button>
            </form>
          )}

          {ledgerRows.length === 0 ? (
            <div className="empty-state">No ledger entries yet.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Details</th>
                  <th>Reference</th>
                  <th>Amount</th>
                  <th>Total Collected</th>
                  <th>Balance Remaining</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {ledgerRows.map((entry) => (
                  <tr
                    key={entry.id}
                    onClick={() => entry.sale_id && navigate(`/sales/${entry.sale_id}`)}
                    style={{ cursor: entry.sale_id ? 'pointer' : 'default' }}
                  >
                    <td className="num">{entry.entry_date?.slice(0, 10)}</td>
                    <td>{entry.description || (entry.entry_type === 'debit' ? 'Charge added' : 'Payment received')}</td>
                    <td className="num" style={{ color: entry.sale_id ? 'var(--gold-dark)' : 'var(--muted)' }}>
                      {entry.receipt_no || (entry.sale_id ? `Sale #${entry.sale_id}` : '—')}
                    </td>
                    <td className="num" style={{ color: entry.entry_type === 'debit' ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
                      {entry.entry_type === 'debit' ? '+' : '−'}{Number(entry.amount).toLocaleString()}
                    </td>
                    <td className="num">{entry.runningCollected.toLocaleString()}</td>
                    <td className="num" style={{ fontWeight: 700, color: entry.runningBalance > 0 ? 'var(--danger)' : 'var(--success)' }}>
                      {entry.runningBalance.toLocaleString()}
                    </td>
                    <td>
                      {!entry.sale_id && (
                        <button
                          className="btn ghost"
                          style={{ padding: '3px 8px', fontSize: 11 }}
                          onClick={(e) => { e.stopPropagation(); handleDeleteEntry(entry.id); }}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                <tr className="ledger-summary-row" style={{ background: 'var(--navy)' }}>
                  <td colSpan={6} style={{ fontWeight: 700, color: '#fff' }}>Closing Balance — Amount Owed by Customer</td>
                  <td className="num" style={{ fontWeight: 700, color: '#fff' }}>
                    {ledgerRows.length > 0 ? ledgerRows[ledgerRows.length - 1].runningBalance.toLocaleString() : 0}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </>
      )}
    </Layout>
  );
}
