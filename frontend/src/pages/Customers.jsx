import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { getCustomers, createCustomer, uploadImage } from '../api.js';

export default function CustomersList() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', father_name: '', nic: '', address: '', mobile_no: '' });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

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

  function handleImageChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function resetForm() {
    setForm({ name: '', father_name: '', nic: '', address: '', mobile_no: '' });
    setImageFile(null);
    setImagePreview(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      let picture_url = null;
      if (imageFile) {
        const uploadResult = await uploadImage(imageFile);
        picture_url = uploadResult.url;
      }
      await createCustomer({ ...form, picture_url });
      resetForm();
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
            <label>Customer Picture</label>
            <input type="file" accept="image/*" onChange={handleImageChange} />
            {imagePreview && (
              <img
                src={imagePreview}
                alt="Preview"
                style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6, marginTop: 8 }}
              />
            )}
          </div>

          <button className="btn primary" type="submit" disabled={saving}>
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
                <td>
                  {c.picture_url ? (
                    <img
                      src={c.picture_url}
                      alt={c.name}
                      style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: '50%' }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 32, height: 32, borderRadius: '50%', background: '#e5e7eb',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#6b7280',
                      }}
                    >
                      {c.name?.[0]?.toUpperCase() || '?'}
                    </div>
                  )}
                </td>
                <td>{c.name}</td>
                <td>{c.mobile_no || '—'}</td>
                <td>{c.nic || '—'}</td>
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
