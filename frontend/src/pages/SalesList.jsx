import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { getSales, deleteSale } from '../api.js';

export default function SalesList() {
  const navigate = useNavigate();

  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');

  function load(tab, searchTerm = search) {
    setLoading(true);
    setError('');

    const filters = {};
    if (tab !== 'all') filters.sale_category = tab;

    const trimmedSearch = searchTerm.trim();
    if (trimmedSearch) filters.search = trimmedSearch;

    getSales(filters)
      .then(setSales)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      load(activeTab, search);
    }, 300);

    return () => clearTimeout(timer);
    // eslint-disable-next-line
  }, [activeTab, search]);

  async function handleDelete(e, sale) {
    e.preventDefault();
    e.stopPropagation();

    const confirmed = window.confirm(
      `Delete sale ${sale.receipt_no}?\n\n` +
      `This sale will be moved to Trash for 3 days. ` +
      `The database record will not be physically deleted.`
    );

    if (!confirmed) return;

    try {
      setError('');

      await deleteSale(sale.id);

      load(activeTab, search);
    } catch (err) {
      // If the backend rejects this (e.g. insufficient role), the error
      // message from the API is shown here — authorization is enforced
      // server-side, not by hiding the button on the frontend.
      setError(err.message);
    }
  }

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>Sales</h2>

          <p>
            All invoices — automobile sales (net or installment)
            and spare-parts sales (net only) are tracked separately.
          </p>
        </div>

        <button
          className="btn primary"
          onClick={() => navigate('/sales/new')}
        >
          + New Sale
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          className={
            activeTab === 'all'
              ? 'btn primary'
              : 'btn'
          }
          onClick={() => setActiveTab('all')}
        >
          All Sales
        </button>

        <button
          type="button"
          className={
            activeTab === 'automobile'
              ? 'btn primary'
              : 'btn'
          }
          onClick={() =>
            setActiveTab('automobile')
          }
        >
          Automobile
        </button>

        <button
          type="button"
          className={
            activeTab === 'spare_part'
              ? 'btn primary'
              : 'btn'
          }
          onClick={() =>
            setActiveTab('spare_part')
          }
        >
          Spare Parts
        </button>
      </div>

      <div style={{ marginBottom: 16, maxWidth: 620, position: 'relative' }}>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by customer name, phone, CNIC or receipt no..."
          aria-label="Search sales"
          style={{
            width: '100%',
            height: 42,
            padding: search ? '0 82px 0 14px' : '0 14px',
            border: '1.5px solid var(--line-light)',
            borderRadius: 8,
            background: '#fff',
            fontSize: 13,
            outline: 'none',
          }}
        />
        {search && (
          <button
            type="button"
            className="btn ghost"
            onClick={() => setSearch('')}
            style={{
              position: 'absolute',
              right: 6,
              top: '50%',
              transform: 'translateY(-50%)',
              padding: '5px 10px',
              fontSize: 11,
            }}
          >
            Clear
          </button>
        )}
      </div>

      {error && (
        <div
          className="login-error"
          style={{ maxWidth: 500 }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <p
          style={{
            color: '#6b7280',
            fontSize: 13,
          }}
        >
          Loading…
        </p>
      ) : sales.length === 0 ? (
        <div className="empty-state">
          {search ? `No sales found for "${search}".` : 'No sales recorded yet.'}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Receipt No</th>
                <th>Customer</th>
                <th>Category</th>
                <th>Date</th>
                <th>Total</th>
                <th>Outstanding</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {sales.map((s) => (
                <tr
                  key={s.id}
                  onClick={() =>
                    navigate(`/sales/${s.id}`)
                  }
                  style={{
                    cursor: 'pointer',
                  }}
                >
                  <td className="num">
                    {s.receipt_no}
                  </td>

                  <td>
                    {s.customer_name}
                  </td>

                  <td>
                    <span
                      className={`badge ${s.sale_category}`}
                    >
                      {s.sale_category === 'automobile'
                        ? 'Automobile'
                        : 'Spare Parts'}
                    </span>
                  </td>

                  <td>
                    {s.sale_date?.slice(0, 10)}
                  </td>

                  <td className="num">
                    {Number(
                      s.total_amount
                    ).toLocaleString()}
                  </td>

                  <td
                    style={{
                      color:
                        Number(
                          s.outstanding_balance
                        ) > 0
                          ? 'var(--danger)'
                          : 'inherit',
                      fontWeight: 600,
                    }}
                  >
                    {Number(
                      s.outstanding_balance
                    ).toLocaleString()}
                  </td>

                  <td>
                    <span className="badge">
                      {s.status}
                    </span>
                  </td>

                  <td
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
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
                        display: 'inline-block',
                        visibility: 'visible',
                        opacity: 1,
                      }}
                      onClick={(e) =>
                        handleDelete(e, s)
                      }
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
