import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { getCustomer, addLedgerEntry, deleteLedgerEntry, getSales, downloadCustomerStatement } from '../api.js';

export default function CustomerProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [sales, setSales] = useState([]);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('overview');

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
      await downloadCustomerStatement(id);
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading(false);
    }
  }

  function load() {
    getCustomer(id).then(setCustomer).catch((err) => setError(err.message));
    getSales({ customer_id: id }).then(setSales).catch(() => {});
  }

  useEffect(load, [id]);

  async function handleAddEntry(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const charge = Number(chargeAmount) || 0;
      const advance = Number(advanceAmount) || 0;
      if (charge <= 0 && advance <= 0) {
        setError('Enter a charge amount, an advance amount, or both.');
        setSaving(false);
        return;
      }
      if (charge > 0) {
        await addLedgerEntry(id, { entry_type: 'debit', amount: charge, description: description || 'Charge added', entry_date: entryDate });
      }
      if (advance > 0) {
        await addLedgerEntry(id, { entry_type: 'credit', amount: advance, description: description || 'Advance / payment received', entry_date: entryDate });
      }
      setChargeAmount(''); setAdvanceAmount(''); setDescription(''); setShowEntryForm(false);
      load();
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
      await deleteLedgerEntry(id, entryId);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (error) return <Layout><div className="login-error" style={{ maxWidth: 500 }}>{error}</div></Layout>;
  if (!customer) return <Layout><p style={{ color: '#6b7280', fontSize: 13 }}>Loading…</p></Layout>;

  const balance = Number(customer.outstanding_balance);

  // Khata-style chronological ledger with running Debit/Credit/Balance columns
  const chronological = [...customer.ledger].sort(
    (a, b) => new Date(a.entry_date) - new Date(b.entry_date) || a.id - b.id
  );
  let runningCollected = 0;
  let runningBalance = 0;
  const ledgerRows = chronological.map((entry) => {
    const amt = Number(entry.amount);
    if (entry.entry_type === 'debit') runningBalance += amt;
    else { runningBalance -= amt; runningCollected += amt; }
    return { ...entry, runningCollected, runningBalance };
  });
  const totalDebit = chronological.reduce((s, e) => (e.entry_type === 'debit' ? s + Number(e.amount) : s), 0);
  const totalCredit = chronological.reduce((s, e) => (e.entry_type === 'credit' ? s + Number(e.amount) : s), 0);

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>{customer.name}</h2>
          <p>{customer.mobile_no || '—'} · S/O {customer.father_name || '—'} · NIC {customer.nic || '—'}</p>
        </div>
        <div className="num" style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10.5, textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--font-body)' }}>Outstanding Balance</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: balance > 0 ? 'var(--danger)' : 'var(--success)' }}>{balance.toLocaleString()}</div>
        </div>
      </div>

      <div className="filter-bar">
        <button className={tab === 'overview' ? 'btn primary' : 'btn'} onClick={() => setTab('overview')}>Overview</button>
        <button className={tab === 'ledger' ? 'btn primary' : 'btn'} onClick={() => setTab('ledger')}>Ledger</button>
      </div>

      {error && <div className="login-error" style={{ maxWidth: 640 }}>{error}</div>}

      {tab === 'overview' && (
        <>
          <div className="form-card" style={{ marginBottom: 20 }}>
            <div className="form-row">
              <div className="field"><label>Address</label><div>{customer.address || '—'}</div></div>
              <div className="field"><label>Total Sales</label><div className="num">{sales.length}</div></div>
            </div>
          </div>

          <div className="page-header" style={{ border: 'none', marginBottom: 8 }}>
            <h2 style={{ fontSize: 14 }}>Sales History</h2>
          </div>
          {sales.length === 0 ? (
            <div className="empty-state">No sales recorded for this customer yet.</div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Receipt</th><th>Date</th><th>Total</th><th>Outstanding</th><th>Status</th></tr></thead>
              <tbody>
                {sales.map((s) => (
                  <tr key={s.id} onClick={() => navigate(`/sales/${s.id}`)} style={{ cursor: 'pointer' }}>
                    <td className="num">{s.receipt_no}</td>
                    <td>{s.sale_date?.slice(0, 10)}</td>
                    <td className="num">{Number(s.total_amount).toLocaleString()}</td>
                    <td className="num" style={{ color: Number(s.outstanding_balance) > 0 ? 'var(--danger)' : 'inherit', fontWeight: 600 }}>
                      {Number(s.outstanding_balance).toLocaleString()}
                    </td>
                    <td><span className="badge">{s.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {tab === 'ledger' && (
        <>
          <div className="page-header" style={{ border: 'none', marginBottom: 12 }}>
            <div />
            <div style={{ display: 'flex', gap: 8 }}>
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
                  <input type="number" step="0.01" value={chargeAmount} onChange={(e) => setChargeAmount(e.target.value)} placeholder="0" />
                </div>
                <div className="field">
                  <label>Advance / Payment Received</label>
                  <input type="number" step="0.01" value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)} placeholder="0" />
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
