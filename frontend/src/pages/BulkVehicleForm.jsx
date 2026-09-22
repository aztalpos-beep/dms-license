import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { getVendors, createBulkVehicles } from '../api.js';
import { getUser } from '../auth.js';

function emptyUnit() {
  return {
    stock_code: '', purchase_price: '', engine_no: '', chassis_no: '',
    registration_no: '', model: '', variant: '', variant_feature: '', color: '',
  };
}

const UNIT_FIELDS = [
  ['stock_code', 'Stock Code'],
  ['purchase_price', 'Purchase Price'],
  ['engine_no', 'Engine No'],
  ['chassis_no', 'Chassis No'],
  ['registration_no', 'Registration No'],
  ['model', 'Model'],
  ['variant', 'Variant'],
  ['variant_feature', 'Variant Feature'],
  ['color', 'Color'],
];

export default function BulkVehicleForm() {
  const navigate = useNavigate();
  const user = getUser();

  const [itemType, setItemType] = useState('tractor');
  const [title, setTitle] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [vendors, setVendors] = useState([]);
  const [units, setUnits] = useState([emptyUnit(), emptyUnit()]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { getVendors().then(setVendors).catch(() => {}); }, []);

  function updateUnit(idx, field, value) {
    const next = [...units];
    next[idx][field] = value;
    setUnits(next);
  }

  function addUnitRow() {
    setUnits([...units, emptyUnit()]);
  }

  function removeUnitRow(idx) {
    setUnits(units.filter((_, i) => i !== idx));
  }

  function applyQuantity(qty) {
    const n = Math.max(1, Number(qty) || 1);
    if (n > units.length) {
      setUnits([...units, ...Array.from({ length: n - units.length }, emptyUnit)]);
    } else if (n < units.length) {
      setUnits(units.slice(0, n));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!title || !purchaseDate) {
      setError('Title and purchase date are required.');
      return;
    }
    for (const [idx, u] of units.entries()) {
      if (!u.stock_code || !u.purchase_price) {
        setError(`Unit ${idx + 1}: stock code and purchase price are required.`);
        return;
      }
    }

    setSaving(true);
    try {
      const payload = { item_type: itemType, title, vendor_id: vendorId || null, purchase_date: purchaseDate, units };
      if (user.role === 'super_admin') payload.branch_id = user.branchId;

      await createBulkVehicles(payload);
      navigate('/inventory');
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
          <h2>Add Multiple Vehicles</h2>
          <p>Same model, multiple units — each with its own Engine No, Chassis No, Registration No, Model, Variant.</p>
        </div>
      </div>

      {error && <div className="login-error">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-card" style={{ marginBottom: 20 }}>
          <div className="form-row">
            <div className="field">
              <label>Vehicle Type</label>
              <select
                value={itemType}
                onChange={(e) => setItemType(e.target.value)}
                style={{ width: '100%', height: 36, border: '1.5px solid var(--line-light)', borderRadius: 4, padding: '0 10px' }}
              >
                <option value="tractor">Tractor</option>
                <option value="car">Car</option>
              </select>
            </div>
            <div className="field">
              <label>Title (e.g. Millat 385)</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="field">
              <label>Vendor</label>
              <select
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                style={{ width: '100%', height: 36, border: '1.5px solid var(--line-light)', borderRadius: 4, padding: '0 10px' }}
              >
                <option value="">— None —</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="field">
              <label>Purchase Date</label>
              <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} required />
            </div>
            <div className="field">
              <label>Quantity</label>
              <input type="number" min="1" value={units.length} onChange={(e) => applyQuantity(e.target.value)} />
            </div>
            <div className="field" />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16, marginBottom: 16 }}>
          {units.map((u, idx) => (
            <div key={idx} className="form-card" style={{ borderTop: '3px solid var(--gold)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 13 }}>Unit #{idx + 1}</span>
                {units.length > 1 && (
                  <button type="button" className="btn ghost" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => removeUnitRow(idx)}>
                    Remove
                  </button>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
                {UNIT_FIELDS.map(([key, label]) => (
                  <div className="field" key={key}>
                    <label>{label}</label>
                    <input
                      type={key === 'purchase_price' ? 'number' : 'text'}
                      value={u[key]}
                      onChange={(e) => updateUnit(idx, key, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button type="button" className="btn" style={{ marginBottom: 16 }} onClick={addUnitRow}>+ Add Another Unit</button>
        <br />
        <button className="btn primary" type="submit" disabled={saving}>
          {saving ? 'Creating…' : `Create ${units.length} Vehicles`}
        </button>
      </form>
    </Layout>
  );
}
