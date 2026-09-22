import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { getReturns } from '../api.js';

export default function ReturnsList() {
  const navigate = useNavigate();
  const [returns, setReturns] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    getReturns().then(setReturns).catch((err) => setError(err.message));
  }, []);

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>Returns</h2>
          <p>Return history — start a return from the sale detail page.</p>
        </div>
      </div>

      {error && <div className="login-error" style={{ maxWidth: 500 }}>{error}</div>}

      {returns.length === 0 ? (
        <div className="empty-state">No returns recorded yet.</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr><th>Receipt</th><th>Customer</th><th>Return Date</th><th>Refund Status</th><th>Refund Amount</th></tr>
          </thead>
          <tbody>
            {returns.map((r) => (
              <tr key={r.id} onClick={() => navigate(`/sales/${r.sale_id}`)} style={{ cursor: 'pointer' }}>
                <td className="num">{r.receipt_no}</td>
                <td>{r.customer_name}</td>
                <td>{r.return_date?.slice(0, 10)}</td>
                <td style={{ textTransform: 'capitalize' }}>
                  <span className={`badge ${r.refund_status === 'full' ? 'in_stock' : r.refund_status === 'partial' ? 'reserved' : 'sold'}`}>
                    {r.refund_status}
                  </span>
                </td>
                <td className="num">{Number(r.refund_amount).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Layout>
  );
}
