import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { getInventoryItem } from '../api.js';

export default function InventoryDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getInventoryItem(id).then(setItem).catch((err) => setError(err.message));
  }, [id]);

  if (error) {
    return (
      <Layout>
        <div className="login-error" style={{ maxWidth: 500 }}>{error}</div>
      </Layout>
    );
  }

  if (!item) {
    return <Layout><p style={{ color: '#6b7280', fontSize: 13 }}>Loading…</p></Layout>;
  }

  const isVehicle = item.item_type === 'car' || item.item_type === 'tractor';

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>{item.title}</h2>
          <p>
            {item.stock_code} · {item.item_type.replace('_', ' ')} ·{' '}
            <span className={`badge ${item.status}`}>{item.status.replace('_', ' ')}</span>
          </p>
        </div>
        <button className="btn" onClick={() => navigate(`/inventory/${id}/edit`)}>Edit</button>
      </div>

      <div className="form-card">
        <div className="form-row">
          <div className="field">
            <label>Vendor</label>
            <div>{item.vendor_name || '—'}</div>
          </div>
          <div className="field">
            <label>Purchase Price</label>
            <div>{Number(item.purchase_price).toLocaleString()}</div>
          </div>
        </div>
        <div className="form-row">
          <div className="field">
            <label>Purchase Date</label>
            <div>{item.purchase_date?.slice(0, 10)}</div>
          </div>
          <div className="field">
            <label>Branch ID</label>
            <div>{item.branch_id}</div>
          </div>
        </div>

        <hr style={{ border: 'none', borderTop: '1px dashed var(--line-light)', margin: '16px 0' }} />

        {isVehicle ? (
          <>
            <div className="form-row">
              <div className="field"><label>Engine No</label><div>{item.engine_no || '—'}</div></div>
              <div className="field"><label>Chassis No</label><div>{item.chassis_no || '—'}</div></div>
            </div>
            <div className="form-row">
              <div className="field"><label>Registration No</label><div>{item.registration_no || '—'}</div></div>
              <div className="field"><label>Model</label><div>{item.model || '—'}</div></div>
            </div>
            <div className="form-row">
              <div className="field"><label>Variant</label><div>{item.variant || '—'}</div></div>
              <div className="field"><label>Color</label><div>{item.color || '—'}</div></div>
            </div>
          </>
        ) : (
          <>
            <div className="form-row">
              <div className="field"><label>Part No</label><div>{item.part_no || '—'}</div></div>
              <div className="field"><label>Brand</label><div>{item.brand || '—'}</div></div>
            </div>
            <div className="form-row">
              <div className="field"><label>Unit Type</label><div>{item.unit_type || '—'}</div></div>
              <div className="field"><label>Quantity On Hand</label><div>{item.quantity_on_hand}</div></div>
            </div>
            <div className="form-row">
              <div className="field"><label>Reorder Level</label><div>{item.reorder_level}</div></div>
              <div className="field" />
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
