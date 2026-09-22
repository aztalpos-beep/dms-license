import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { getInventory, deleteInventoryItem } from '../api.js';

export default function InventoryList() {
  const navigate = useNavigate();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [filters, setFilters] = useState({
    item_type: '',
    status: '',
    search: '',
  });

  /*
   * Extract the numeric sequence from a stock code.
   *
   * Examples:
   * 001    -> 1
   * 002    -> 2
   * 010    -> 10
   * 018    -> 18
   * 01(Z)  -> 1
   * 02(Z)  -> 2
   * 04(Z)  -> 4
   */
  function getStockNumber(stockCode) {
    const code = String(stockCode || '').trim();

    if (!code) {
      return Number.MAX_SAFE_INTEGER;
    }

    const match = code.match(/\d+/);

    if (!match) {
      return Number.MAX_SAFE_INTEGER;
    }

    return Number(match[0]);
  }

  /*
   * Check whether stock code contains the Z suffix.
   *
   * 001    -> false
   * 01(Z)  -> true
   * 04(Z)  -> true
   */
  function isZStockCode(stockCode) {
    const code = String(stockCode || '').trim();

    return /\(Z\)/i.test(code);
  }

  /*
   * Sort inventory by Stock Code sequence.
   *
   * Correct order:
   *
   * 001
   * 002
   * 003
   * 004
   * 005
   * 006
   * 007
   * 008
   * 009
   * 010
   * 011
   * 012
   * 013
   * 014
   * 015
   * 016
   * 017
   * 018
   * 01(Z)
   * 02(Z)
   * 03(Z)
   * 04(Z)
   *
   * The numeric portion is the primary sequence.
   *
   * If two stock codes have the same number:
   * normal code comes first,
   * Z code comes second.
   *
   * Example:
   * 001
   * 01(Z)
   */
  function sortInventoryByStockCode(inventory) {
    return [...inventory].sort((a, b) => {
      const codeA = String(a.stock_code || '').trim();
      const codeB = String(b.stock_code || '').trim();

      // Items without stock code go to the end.
      if (!codeA && !codeB) {
        return Number(a.id || 0) - Number(b.id || 0);
      }

      if (!codeA) {
        return 1;
      }

      if (!codeB) {
        return -1;
      }

      const numberA = getStockNumber(codeA);
      const numberB = getStockNumber(codeB);

      // Primary sorting: numeric stock sequence
      if (numberA !== numberB) {
        return numberA - numberB;
      }

      /*
       * Same numeric number.
       *
       * Example:
       * 001
       * 01(Z)
       *
       * Normal stock code first,
       * Z stock code second.
       */
      const zA = isZStockCode(codeA);
      const zB = isZStockCode(codeB);

      if (zA !== zB) {
        return zA ? 1 : -1;
      }

      /*
       * If both have the same number and same Z status,
       * use the actual stock code as a secondary sort.
       */
      const codeCompare = codeA.localeCompare(
        codeB,
        undefined,
        {
          numeric: true,
          sensitivity: 'base',
        }
      );

      if (codeCompare !== 0) {
        return codeCompare;
      }

      // Final fallback: inventory ID
      return Number(a.id || 0) - Number(b.id || 0);
    });
  }

  function load(currentFilters = filters) {
    setLoading(true);
    setError('');

    const cleaned = Object.fromEntries(
      Object.entries(currentFilters).filter(([, value]) => value)
    );

    getInventory(cleaned)
      .then((data) => {
        const inventory = Array.isArray(data) ? data : [];

        const sortedInventory =
          sortInventoryByStockCode(inventory);

        setItems(sortedInventory);
      })
      .catch((err) => {
        setError(err.message || 'Could not load inventory.');
      })
      .finally(() => {
        setLoading(false);
      });
  }

  useEffect(() => {
    load(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFilterChange(key, value) {
    const nextFilters = {
      ...filters,
      [key]: value,
    };

    setFilters(nextFilters);
    load(nextFilters);
  }

  async function handleDelete(e, item) {
    e.preventDefault();
    e.stopPropagation();

    const confirmed = window.confirm(
      `Delete "${item.title || 'this item'}"?\n\nStock Code: ${
        item.stock_code || '—'
      }\n\nThis item will be moved to Trash for 3 days.`
    );

    if (!confirmed) {
      return;
    }

    try {
      setError('');

      await deleteInventoryItem(item.id);

      // Refresh inventory after successful deletion
      load(filters);
    } catch (err) {
      setError(err.message || 'Could not delete inventory item.');
    }
  }

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>Inventory</h2>
          <p>
            Unified stock list across cars, tractors and spare parts.
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            className="btn"
            onClick={() => navigate('/inventory/bulk-vehicles')}
          >
            + Add Multiple Vehicles
          </button>

          <button
            type="button"
            className="btn primary"
            onClick={() => navigate('/inventory/new')}
          >
            + Add Item
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <input
          type="text"
          placeholder="Search title or stock code…"
          value={filters.search}
          onChange={(e) =>
            handleFilterChange('search', e.target.value)
          }
        />

        <select
          value={filters.item_type}
          onChange={(e) =>
            handleFilterChange('item_type', e.target.value)
          }
        >
          <option value="">All Types</option>
          <option value="car">Car</option>
          <option value="tractor">Tractor</option>
          <option value="spare_part">Spare Part</option>
        </select>

        <select
          value={filters.status}
          onChange={(e) =>
            handleFilterChange('status', e.target.value)
          }
        >
          <option value="">All Statuses</option>
          <option value="in_stock">In Stock</option>
          <option value="reserved">Reserved</option>
          <option value="sold">Sold</option>
          <option value="returned">Returned</option>
        </select>
      </div>

      {error && (
        <div
          className="login-error"
          style={{
            maxWidth: 600,
            marginBottom: 16,
          }}
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
      ) : items.length === 0 ? (
        <div className="empty-state">
          No inventory items yet. Add your first item to get started.
        </div>
      ) : (
        <div
          style={{
            width: '100%',
            overflowX: 'auto',
          }}
        >
          <table className="data-table">
            <thead>
              <tr>
                <th>Stock Code</th>
                <th>Type</th>
                <th>Title</th>
                <th>Vendor</th>
                <th>Purchase Price</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => navigate(`/inventory/${item.id}`)}
                  style={{
                    cursor: 'pointer',
                  }}
                >
                  <td className="num">
                    {item.stock_code || '—'}
                  </td>

                  <td>
                    {item.item_type
                      ? item.item_type.replace(/_/g, ' ')
                      : '—'}
                  </td>

                  <td>
                    {item.title || '—'}
                  </td>

                  <td>
                    {item.vendor_name || '—'}
                  </td>

                  <td className="num">
                    {Number(
                      item.purchase_price || 0
                    ).toLocaleString()}
                  </td>

                  <td>
                    <span
                      className={`badge ${item.status || ''}`}
                    >
                      {item.status
                        ? item.status.replace(/_/g, ' ')
                        : '—'}
                    </span>
                  </td>

                  <td
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                    style={{
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={(e) => handleDelete(e, item)}
                      style={{
                        padding: '5px 12px',
                        fontSize: 11,
                        color: '#dc2626',
                        border:
                          '1px solid rgba(220, 38, 38, 0.35)',
                        background: '#fff',
                        cursor: 'pointer',
                        display: 'inline-block',
                        visibility: 'visible',
                        opacity: 1,
                      }}
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