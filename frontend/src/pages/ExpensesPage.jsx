import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import { getExpenses, createExpense, approveExpense, rejectExpense, getMonthlyExpenseSummary, uploadFile } from '../api.js';
import { getUser } from '../auth.js';

const CATEGORIES = ['Utilities', 'Rent', 'Salaries', 'Maintenance', 'Fuel', 'Office Supplies', 'Other'];

export default function ExpensesPage() {
  const user = getUser();
  const canApprove = ['super_admin', 'admin', 'manager'].includes(user.role);

  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ expense_date: '', category: 'Utilities', description: '', amount: '', receipt_image_url: '' });

  function load(status) {
    getExpenses(status ? { status } : {}).then(setExpenses).catch((err) => setError(err.message));
    getMonthlyExpenseSummary().then(setSummary).catch(() => {});
  }

  useEffect(() => { load(''); }, []);

  function handleFilterChange(value) {
    setStatusFilter(value);
    load(value);
  }

  async function handleReceiptChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const url = await uploadFile(file);
      setForm((f) => ({ ...f, receipt_image_url: url }));
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await createExpense(form);
      setForm({ expense_date: '', category: 'Utilities', description: '', amount: '', receipt_image_url: '' });
      setShowForm(false);
      load(statusFilter);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove(id) {
    try { await approveExpense(id); load(statusFilter); } catch (err) { setError(err.message); }
  }
  async function handleReject(id) {
    try { await rejectExpense(id); load(statusFilter); } catch (err) { setError(err.message); }
  }

  const thisMonth = summary[0];

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>Expenses</h2>
          <p>Daily expense entry with manager approval workflow.</p>
        </div>
        <button className="btn primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : '+ Add Expense'}
        </button>
      </div>

      {error && <div className="login-error" style={{ maxWidth: 500 }}>{error}</div>}

      {thisMonth && (
        <div className="form-card" style={{ marginBottom: 20, maxWidth: 320 }}>
          <label style={{ display: 'block', fontSize: 10.5, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>
            Approved this month ({thisMonth.month})
          </label>
          <div className="num" style={{ fontSize: 20, fontWeight: 700, color: 'var(--navy)' }}>
            {Number(thisMonth.total).toLocaleString()}
          </div>
        </div>
      )}

      {showForm && (
        <form className="form-card" onSubmit={handleSubmit} style={{ marginBottom: 20 }}>
          <div className="form-row">
            <div className="field">
              <label>Date</label>
              <input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
            </div>
            <div className="field">
              <label>Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                style={{ width: '100%', height: 36, border: '1.5px solid var(--line-light)', borderRadius: 4, padding: '0 10px' }}
              >
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="field">
              <label>Amount</label>
              <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
            </div>
            <div className="field">
              <label>Description</label>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>Receipt Image (optional)</label>
            <input type="file" accept="image/*" onChange={handleReceiptChange} style={{ fontSize: 12 }} />
            {uploading && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Uploading…</div>}
            {form.receipt_image_url && !uploading && (
              <div style={{ fontSize: 11, color: '#2f6e3d', marginTop: 4 }}>✓ Receipt uploaded</div>
            )}
          </div>
          <button className="btn primary" type="submit" disabled={saving || uploading}>
            {saving ? 'Submitting…' : 'Submit for Approval'}
          </button>
        </form>
      )}

      <div className="filter-bar">
        <select
          value={statusFilter}
          onChange={(e) => handleFilterChange(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {expenses.length === 0 ? (
        <div className="empty-state">No expenses found.</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>Status</th>{canApprove && <th></th>}</tr>
          </thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id}>
                <td>{e.expense_date?.slice(0, 10)}</td>
                <td>{e.category}</td>
                <td>{e.description || '—'}</td>
                <td className="num">{Number(e.amount).toLocaleString()}</td>
                <td>
                  <span className={`badge ${e.status === 'approved' ? 'in_stock' : e.status === 'rejected' ? 'returned' : 'reserved'}`}>
                    {e.status}
                  </span>
                </td>
                {canApprove && (
                  <td>
                    {e.status === 'pending' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn primary" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => handleApprove(e.id)}>Approve</button>
                        <button className="btn ghost" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => handleReject(e.id)}>Reject</button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Layout>
  );
}
