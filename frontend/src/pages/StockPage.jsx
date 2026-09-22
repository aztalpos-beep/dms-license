import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { getInventory } from '../api.js';

function fmtMoney(n) {
  return Number(n || 0).toLocaleString();
}

function fmtLabel(s) {
  return s ? String(s).replace(/_/g, ' ') : '-';
}

// One labeled value in a detail card. Renders "-" for empty/null so the
// card layout never shifts between items that have a field and items that
// don't.
function Field({ label, value }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, wordBreak: 'break-word' }}>
        {value === null || value === undefined || value === '' ? '-' : value}
      </div>
    </div>
  );
}

// Full-detail card for one inventory item. Shows every field relevant to
// its type -- vehicle fields for cars/tractors, spare-part fields for
// spare parts -- plus the fields common to all items.
function StockCard({ item, onClick }) {
  const isVehicle = item.item_type === 'car' || item.item_type === 'tractor';

  return (
    <div
      onClick={onClick}
      style={{
        border: '1px solid var(--line-light)',
        borderRadius: 8,
        padding: 16,
        marginBottom: 12,
        cursor: 'pointer',
        background: '#fff',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{item.title || '-'}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Stock Code: {item.stock_code || '-'}</div>
        </div>
        <span className={`badge ${item.status || ''}`}>{fmtLabel(item.status)}</span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: 12,
        }}
      >
        <Field label="Type" value={fmtLabel(item.item_type)} />
        <Field label="Vendor" value={item.vendor_name} />
        <Field label="Purchase Price" value={fmtMoney(item.purchase_price)} />
        <Field label="Purchase Date" value={item.purchase_date ? String(item.purchase_date).slice(0, 10) : null} />

        {isVehicle ? (
          <>
            <Field label="Model" value={item.model} />
            <Field label="Variant" value={item.variant} />
            <Field label="Color" value={item.color} />
            <Field label="Engine No" value={item.engine_no} />
            <Field label="Chassis No" value={item.chassis_no} />
            <Field label="Registration No" value={item.registration_no} />
          </>
        ) : (
          <>
            <Field label="Part No" value={item.part_no} />
            <Field label="Brand" value={item.brand} />
            <Field label="Unit Type" value={item.unit_type} />
            <Field label="Quantity On Hand" value={item.quantity_on_hand} />
            <Field label="Reorder Level" value={item.reorder_level} />
          </>
        )}
      </div>
    </div>
  );
}

export default function StockPage() {
  const navigate = useNavigate();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  // Only items currently 'in_stock' belong here -- sold, reserved, and
  // returned-but-not-yet-restocked items are excluded, since this page is
  // meant to reflect what's actually available right now.
  function load() {
    setLoading(true);
    setError('');
    getInventory({ status: 'in_stock' })
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message || 'Could not load stock.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = items.filter((item) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (item.title || '').toLowerCase().includes(q) ||
      (item.stock_code || '').toLowerCase().includes(q) ||
      (item.engine_no || '').toLowerCase().includes(q) ||
      (item.chassis_no || '').toLowerCase().includes(q) ||
      (item.part_no || '').toLowerCase().includes(q)
    );
  });

  const automobiles = filtered.filter((i) => i.item_type === 'car' || i.item_type === 'tractor');
  const spareParts = filtered.filter((i) => i.item_type === 'spare_part');

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>Stock -- Full Detail</h2>
          <p>Complete record for every automobile and spare part currently in stock.</p>
        </div>
      </div>

      <div className="filter-bar">
        <input
          type="text"
          placeholder="Search title, stock code, engine no, chassis no, part no..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && (
        <div className="login-error" style={{ maxWidth: 600, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ color: '#6b7280', fontSize: 13 }}>Loading...</p>
      ) : (
        <>
          <h3 style={{ marginTop: 8, marginBottom: 12 }}>
            Automobiles -- Cars &amp; Tractors ({automobiles.length})
          </h3>
          {automobiles.length === 0 ? (
            <div className="empty-state">No cars or tractors in stock.</div>
          ) : (
            automobiles.map((item) => (
              <StockCard key={item.id} item={item} onClick={() => navigate(`/inventory/${item.id}`)} />
            ))
          )}

          <h3 style={{ marginTop: 28, marginBottom: 12 }}>
            Spare Parts ({spareParts.length})
          </h3>
          {spareParts.length === 0 ? (
            <div className="empty-state">No spare parts in stock.</div>
          ) : (
            spareParts.map((item) => (
              <StockCard key={item.id} item={item} onClick={() => navigate(`/inventory/${item.id}`)} />
            ))
          )}
        </>
      )}
    </Layout>
  );
}