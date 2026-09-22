import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { getCustomers, createCustomer, uploadFile } from '../api.js';

export default function CustomersList() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ name: '', father_name: '', nic: '', address: '', mobile_no: '', picture_url: '', referred_by: '' });

  function load(currentSearch) {
    getCustomers(currentSearch ? { search: currentSearch } : {})
      .then(setCustomers)
      .catch((err) => setError(err.message));
  }

  useEffect(() => { load(''); }, []);

  function handleSearchChange(value) {
    setSearch(value);
    load(value);
  }

  async function handlePictureChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const url = await uploadFile(file);
      setForm((f) => ({ ...f, picture_url: url }));
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
      await createCustomer(form);
      setForm({ name: '', father_name: '', nic: '', address: '', mobile_no: '', picture_url: '', referred_by: '' });
      setShowForm(false);
      load(search);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>Customers</h2>
          <p>Search by name, mobile number, or NIC.</p>
        </div>
        <button className="btn primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : '+ Add Customer'}
        </button>
      </div>

      <div className="filter-bar">
        <input
          type="text"
          placeholder="Search name, mobile, or NIC…"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          style={{ minWidth: 280 }}
        />
      </div>

      {error && <div className="login-error" style={{ maxWidth: 500 }}>{error}</div>}

      {showForm && (
        <form className="form-card" onSubmit={handleSubmit} style={{ marginBottom: 20 }}>
          <div className="form-row" style={{ marginBottom: 16 }}>
            <div className="field" style={{ flex: '0 0 140px' }}>
              <label>Picture</label>
              <div style={{
                width: 120, height: 120, borderRadius: 6, border: '1.5px solid var(--line-light)',
                background: '#fbfbfc', display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden', marginBottom: 10,
              }}>
                {form.picture_url ? (
                  <img src={form.picture_url} alt="Customer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>No photo</span>
                )}
              </div>
              <label
                htmlFor="customer-picture-input"
                className="btn"
                style={{ display: 'block', textAlign: 'center', fontSize: 11.5, padding: '6px 8px', textTransform: 'none', letterSpacing: 0 }}
              >
                {uploading ? 'Uploading…' : form.picture_url ? 'Change Photo' : 'Upload Photo'}
              </label>
              <input
                id="customer-picture-input"
                type="file"
                accept="image/*"
                onChange={handlePictureChange}
                style={{ display: 'none' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div className="form-row">
                <div className="field">
                  <label>Name</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div className="field">
                  <label>Father Name (S/O)</label>
                  <input value={form.father_name} onChange={(e) => setForm({ ...form, father_name: e.target.value })} />
                </div>
              </div>
              <div className="form-row">
                <div className="field">
                  <label>NIC</label>
                  <input value={form.nic} onChange={(e) => setForm({ ...form, nic: e.target.value })} />
                </div>
                <div className="field">
                  <label>Mobile No</label>
                  <input value={form.mobile_no} onChange={(e) => setForm({ ...form, mobile_no: e.target.value })} />
                </div>
              </div>
              <div className="field">
                <label>Address</label>
                <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div className="field">
                <label>Reference (referred by)</label>
                <input value={form.referred_by} onChange={(e) => setForm({ ...form, referred_by: e.target.value })} placeholder="e.g. existing customer, staff member" />
              </div>
            </div>
          </div>
          <button className="btn primary" type="submit" disabled={saving || uploading}>
            {saving ? 'Saving…' : 'Save Customer'}
          </button>
        </form>
      )}

      {customers.length === 0 ? (
        <div className="empty-state">No customers yet.</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr><th></th><th>Name</th><th>Mobile</th><th>NIC</th><th>Outstanding Balance</th></tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} onClick={() => navigate(`/customers/${c.id}`)} style={{ cursor: 'pointer' }}>
                <td style={{ width: 40 }}>
                  {c.picture_url ? (
                    <img src={c.picture_url} alt={c.name} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-bg)' }} />
                  )}
                </td>
                <td>{c.name}</td>
                <td className="num">{c.mobile_no || '—'}</td>
                <td className="num">{c.nic || '—'}</td>
                <td style={{ color: Number(c.outstanding_balance) > 0 ? 'var(--danger)' : 'inherit', fontWeight: 600 }}>
                  {Number(c.outstanding_balance).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Layout>
  );
}
