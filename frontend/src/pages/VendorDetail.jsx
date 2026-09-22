import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { getVendor } from '../api.js';

export default function VendorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [vendor, setVendor] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getVendor(id).then(setVendor).catch((err) => setError(err.message));
  }, [id]);

  if (error) {
    return <Layout><div className="login-error" style={{ maxWidth: 500 }}>{error}</div></Layout>;
  }
  if (!vendor) {
    return <Layout><p style={{ color: '#6b7280', fontSize: 13 }}>Loading…</p></Layout>;
  }

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>{vendor.name}</h2>
          <p>{vendor.phone || '—'} · {vendor.address || '—'}</p>
        </div>
      </div>

      <div className="page-header" style={{ marginBottom: 8 }}>
        <h2 style={{ fontSize: 14 }}>Purchase History</h2>
      </div>

      {vendor.purchases.length === 0 ? (
        <div className="empty-state">No purchases recorded from this vendor yet.</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr><th>Stock Code</th><th>Type</th><th>Title</th><th>Price</th><th>Date</th><th>Status</th></tr>
          </thead>
          <tbody>
            {vendor.purchases.map((p) => (
              <tr key={p.id} onClick={() => navigate(`/inventory/${p.id}`)} style={{ cursor: 'pointer' }}>
                <td>{p.stock_code}</td>
                <td>{p.item_type.replace('_', ' ')}</td>
                <td>{p.title}</td>
                <td>{Number(p.purchase_price).toLocaleString()}</td>
                <td>{p.purchase_date?.slice(0, 10)}</td>
                <td><span className={`badge ${p.status}`}>{p.status.replace('_', ' ')}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Layout>
  );
}
