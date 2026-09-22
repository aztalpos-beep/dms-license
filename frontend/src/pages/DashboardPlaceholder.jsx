import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { getUser, isLoggedIn } from '../auth';

import {
  getSales,
  getInventory,
  getExpenses,
  getRecoveryDashboard,
  getReceivablesReport,
  getProfitReport,
  getInventoryValuationReport,
  getCategorySummary,
  getAdminBranches,
} from '../api.js';

export default function DashboardPlaceholder() {
  const navigate = useNavigate();
  const user = getUser();

  const isSuperAdmin = user?.role === 'super_admin';

  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');

  const [recentSales, setRecentSales] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [pendingExpenses, setPendingExpenses] = useState([]);
  const [recoveryRows, setRecoveryRows] = useState([]);
  const [totalOutstanding, setTotalOutstanding] = useState(0);
  const [profit, setProfit] = useState(null);
  const [valuation, setValuation] = useState(null);
  const [categorySummary, setCategorySummary] = useState(null);

  const [categoryTab, setCategoryTab] = useState('automobile');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  /*
   * ---------------------------------------------------------
   * LOAD BRANCHES FOR SUPER ADMIN
   * ---------------------------------------------------------
   */
  useEffect(() => {
    if (!isLoggedIn()) {
      navigate('/');
      return;
    }

    if (!isSuperAdmin) return;

    getAdminBranches()
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : [];
        setBranches(list);
      })
      .catch((err) => {
        setError(err?.message || 'Could not load branches.');
      });
  }, [navigate, isSuperAdmin]);

  /*
   * ---------------------------------------------------------
   * LOAD DASHBOARD DATA
   * ---------------------------------------------------------
   */
  useEffect(() => {
    if (!isLoggedIn()) {
      navigate('/');
      return;
    }

    loadDashboard();
  }, [navigate, selectedBranchId]);

  async function loadDashboard() {
    setLoading(true);
    setError('');

    // For Super Admin:
    // '' = All Branches
    // branch ID = selected branch
    //
    // For normal users:
    // backend automatically limits data to their branch.
    const branchFilters =
      isSuperAdmin && selectedBranchId
        ? { branch_id: selectedBranchId }
        : {};

    const today = new Date().toISOString().slice(0, 10);

    /*
     * Reset old values first so switching branches never
     * temporarily shows the previous branch's data.
     */
    setRecentSales([]);
    setLowStock([]);
    setPendingExpenses([]);
    setRecoveryRows([]);
    setTotalOutstanding(0);
    setProfit(null);
    setValuation(null);
    setCategorySummary(null);

    try {
      /*
       * -----------------------------------------------------
       * RECENT SALES
       * -----------------------------------------------------
       */
      getSales(branchFilters)
        .then((rows) => {
          setRecentSales(
            Array.isArray(rows)
              ? rows.slice(0, 5)
              : []
          );
        })
        .catch(() => {});

      /*
       * -----------------------------------------------------
       * LOW STOCK
       * -----------------------------------------------------
       */
      getInventory({
        item_type: 'spare_part',
        ...branchFilters,
      })
        .then((rows) => {
          const data = Array.isArray(rows)
            ? rows
            : [];

          setLowStock(
            data.filter(
              (r) =>
                Number(r.quantity_on_hand) <=
                Number(r.reorder_level)
            )
          );
        })
        .catch(() => {});

      /*
       * -----------------------------------------------------
       * PENDING EXPENSES
       * -----------------------------------------------------
       */
      getExpenses({
        status: 'pending',
        ...branchFilters,
      })
        .then((rows) => {
          setPendingExpenses(
            Array.isArray(rows)
              ? rows
              : []
          );
        })
        .catch(() => {});

      /*
       * -----------------------------------------------------
       * RECOVERY DUE
       * -----------------------------------------------------
       */
      getRecoveryDashboard(branchFilters)
        .then((rows) => {
          const list = Array.isArray(rows)
            ? rows
            : [];

          const seenSaleIds = new Set();
          const uniqueBySale = [];

          for (const row of list) {
            if (!seenSaleIds.has(row.sale_id)) {
              seenSaleIds.add(row.sale_id);
              uniqueBySale.push(row);
            }
          }

          setRecoveryRows(
            uniqueBySale.slice(0, 5)
          );
        })
        .catch(() => {});

      /*
       * -----------------------------------------------------
       * OUTSTANDING RECEIVABLES
       * -----------------------------------------------------
       */
      getReceivablesReport(branchFilters)
        .then((data) => {
          setTotalOutstanding(
            Number(
              data?.total_outstanding || 0
            )
          );
        })
        .catch(() => {});

      /*
       * -----------------------------------------------------
       * TODAY'S PROFIT
       * -----------------------------------------------------
       */
      getProfitReport(
        today,
        today,
        isSuperAdmin && selectedBranchId
          ? selectedBranchId
          : undefined
      )
        .then(setProfit)
        .catch((err) => {
          setError(
            err?.message ||
              'Could not load profit report.'
          );
        });

      /*
       * -----------------------------------------------------
       * INVENTORY VALUATION
       * -----------------------------------------------------
       */
      getInventoryValuationReport(branchFilters)
        .then(setValuation)
        .catch(() => {});

      /*
       * -----------------------------------------------------
       * AUTOMOBILE / SPARE PART SUMMARY
       * -----------------------------------------------------
       */
      getCategorySummary(branchFilters)
        .then(setCategorySummary)
        .catch(() => {});
    } finally {
      /*
       * Do not block the dashboard waiting for every widget.
       * Individual widgets handle their own errors.
       */
      setLoading(false);
    }
  }

  /*
   * ---------------------------------------------------------
   * SELECTED BRANCH NAME
   * ---------------------------------------------------------
   */
  const selectedBranch =
    branches.find(
      (b) =>
        String(b.id) ===
        String(selectedBranchId)
    );

  const selectedBranchName =
    selectedBranch?.name ||
    (selectedBranchId
      ? 'Selected Branch'
      : 'All Branches');

  /*
   * ---------------------------------------------------------
   * CATEGORY
   * ---------------------------------------------------------
   */
  const selectedCategory =
    categorySummary?.[categoryTab] || null;

  const totalLowStock =
    lowStock.length;

  return (
    <Layout>
      <div className="dashboard-page">

        {/* ==================================================
            PAGE HEADER
        =================================================== */}
        <div
          className="page-header dashboard-header"
          style={{
            alignItems: 'center',
            gap: 20,
          }}
        >
          <div>
            <h2>Dashboard</h2>

            <p>
              Welcome back,{' '}
              {user?.name || 'Manager'}

              {isSuperAdmin
                ? ` - ${selectedBranchName}.`
                : user?.branchName
                ? ` - ${user.branchName}.`
                : '.'}
            </p>
          </div>

          {/* ==================================================
              SUPER ADMIN BRANCH SELECTOR
          =================================================== */}
          {isSuperAdmin && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginLeft: 'auto',
              }}
            >
              <label
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--muted)',
                  whiteSpace: 'nowrap',
                }}
              >
                Branch
              </label>

              <select
                value={selectedBranchId}
                onChange={(e) =>
                  setSelectedBranchId(
                    e.target.value
                  )
                }
                style={{
                  minWidth: 230,
                  height: 40,
                  border:
                    '1.5px solid var(--line-light)',
                  borderRadius: 10,
                  padding: '0 12px',
                  background: '#fff',
                  color: 'var(--navy)',
                  fontWeight: 600,
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="">
                  All Branches
                </option>

                {branches.map((branch) => (
                  <option
                    key={branch.id}
                    value={branch.id}
                  >
                    {branch.name}
                    {branch.location
                      ? ` - ${branch.location}`
                      : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* ==================================================
            ACTIVE BRANCH INDICATOR
        =================================================== */}
        {isSuperAdmin && (
          <div
            style={{
              marginBottom: 16,
              padding: '9px 14px',
              borderRadius: 10,
              background:
                selectedBranchId
                  ? 'rgba(79,107,255,0.08)'
                  : 'rgba(80,180,120,0.08)',
              border:
                '1px solid rgba(79,107,255,0.12)',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--navy)',
            }}
          >
            {selectedBranchId
              ? `Showing dashboard data for ${selectedBranchName}`
              : 'Showing combined dashboard data for all branches'}
          </div>
        )}

        {loading && (
          <div
            style={{
              fontSize: 12,
              color: 'var(--muted)',
              marginBottom: 10,
            }}
          >
            Updating dashboard…
          </div>
        )}

        {error && (
          <div className="login-error dashboard-error">
            {error}
          </div>
        )}

        {/* ==================================================
            KPI CARDS
        =================================================== */}
        <section className="dashboard-kpi-grid">

          <div className="dashboard-kpi-card">
            <div className="dashboard-kpi-label">
              Today's Sale Profit
            </div>

            <div
              className="dashboard-kpi-value num"
              style={{
                color:
                  profit &&
                  Number(
                    profit.gross_profit
                  ) >= 0
                    ? 'var(--success)'
                    : 'var(--danger)',
              }}
            >
              {profit
                ? Number(
                    profit.gross_profit || 0
                  ).toLocaleString()
                : '—'}
            </div>
          </div>

          <div className="dashboard-kpi-card">
            <div className="dashboard-kpi-label">
              Outstanding Receivables
            </div>

            <div
              className="dashboard-kpi-value num"
              style={{
                color: 'var(--danger)',
              }}
            >
              {totalOutstanding.toLocaleString()}
            </div>
          </div>

          <div className="dashboard-kpi-card">
            <div className="dashboard-kpi-label">
              Pending Expense Approvals
            </div>

            <div
              className="dashboard-kpi-value num"
              style={{
                color: 'var(--navy)',
              }}
            >
              {pendingExpenses.length}
            </div>
          </div>

          <div className="dashboard-kpi-card">
            <div className="dashboard-kpi-label">
              Low Stock Alerts
            </div>

            <div
              className="dashboard-kpi-value num"
              style={{
                color:
                  totalLowStock > 0
                    ? 'var(--danger)'
                    : 'var(--success)',
              }}
            >
              {totalLowStock}
            </div>
          </div>

        </section>

        {/* ==================================================
            INVENTORY VALUE
        =================================================== */}
        <section className="dashboard-section">

          <div className="dashboard-section-title">
            <h2>Inventory Value</h2>
          </div>

          <div className="form-card dashboard-inventory-card">

            <div className="dashboard-main-label">
              Total Inventory Value (in-stock)
            </div>

            <div
              className="dashboard-total-value num"
              style={{
                color: 'var(--navy)',
              }}
            >
              {valuation
                ? Number(
                    valuation.total_valuation || 0
                  ).toLocaleString()
                : '—'}
            </div>

            {valuation && (
              <div className="inventory-value-grid">

                {[
                  'car',
                  'tractor',
                  'spare_part',
                ].map((type) => {
                  const row =
                    valuation.by_type?.find(
                      (item) =>
                        item.item_type === type
                    );

                  const label =
                    type === 'spare_part'
                      ? 'Spare Parts'
                      : type === 'car'
                      ? 'Cars'
                      : 'Tractors';

                  return (
                    <div
                      className="inventory-value-item"
                      key={type}
                    >
                      <div className="dashboard-small-label">
                        {label}
                      </div>

                      <div className="inventory-value-number num">
                        {row
                          ? Number(
                              row.total_value || 0
                            ).toLocaleString()
                          : '0'}
                      </div>

                      <div className="inventory-value-meta">
                        {row
                          ? row.item_count
                          : 0}{' '}
                        in stock
                      </div>
                    </div>
                  );
                })}

              </div>
            )}

          </div>
        </section>

        {/* ==================================================
            AUTOMOBILE VS SPARE PARTS
        =================================================== */}
        <section className="dashboard-section">

          <div className="dashboard-section-title">
            <h2>
              Automobile vs Spare Parts
            </h2>
          </div>

          <div className="form-card category-card">

            <div className="category-tabs">

              <button
                type="button"
                className={
                  categoryTab === 'automobile'
                    ? 'btn primary category-tab active'
                    : 'btn category-tab'
                }
                onClick={() =>
                  setCategoryTab(
                    'automobile'
                  )
                }
              >
                Automobile
              </button>

              <button
                type="button"
                className={
                  categoryTab === 'spare_part'
                    ? 'btn primary category-tab active'
                    : 'btn category-tab'
                }
                onClick={() =>
                  setCategoryTab(
                    'spare_part'
                  )
                }
              >
                Spare Parts
              </button>

            </div>

            {selectedCategory ? (
              <div className="category-stats-grid">

                <div className="category-stat">
                  <div className="dashboard-small-label">
                    Sales Count
                  </div>

                  <div
                    className="category-stat-value num"
                    style={{
                      color: 'var(--navy)',
                    }}
                  >
                    {
                      selectedCategory.sales_count
                    }
                  </div>
                </div>

                <div className="category-stat">
                  <div className="dashboard-small-label">
                    Total Revenue
                  </div>

                  <div
                    className="category-stat-value num"
                    style={{
                      color:
                        'var(--success)',
                    }}
                  >
                    {Number(
                      selectedCategory.total_revenue ||
                        0
                    ).toLocaleString()}
                  </div>
                </div>

                <div className="category-stat">
                  <div className="dashboard-small-label">
                    Outstanding Balance
                  </div>

                  <div
                    className="category-stat-value num"
                    style={{
                      color:
                        Number(
                          selectedCategory.outstanding_balance ||
                            0
                        ) > 0
                          ? 'var(--danger)'
                          : 'var(--navy)',
                    }}
                  >
                    {Number(
                      selectedCategory.outstanding_balance ||
                        0
                    ).toLocaleString()}
                  </div>
                </div>

                <div className="category-stat">
                  <div className="dashboard-small-label">
                    Stock In Hand
                  </div>

                  <div className="category-stat-value num">
                    {Number(
                      selectedCategory.stock_in_hand ||
                        0
                    ).toLocaleString()}

                    <span className="category-unit">
                      {categoryTab ===
                      'automobile'
                        ? 'units'
                        : 'pcs'}
                    </span>
                  </div>
                </div>

              </div>
            ) : (
              <div className="dashboard-loading">
                Loading…
              </div>
            )}

          </div>
        </section>

        {/* ==================================================
            LOWER DASHBOARD
        =================================================== */}
        <div className="dashboard-two-column">

          {/* RECENT SALES */}
          <section className="dashboard-panel">

            <div className="dashboard-section-title">
              <h2>Recent Sales</h2>
            </div>

            {recentSales.length === 0 ? (
              <div className="empty-state">
                No sales yet.
              </div>
            ) : (
              <div className="dashboard-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Receipt</th>
                      <th>Customer</th>
                      <th>Total</th>
                    </tr>
                  </thead>

                  <tbody>
                    {recentSales.map(
                      (sale) => (
                        <tr
                          key={sale.id}
                          onClick={() =>
                            navigate(
                              `/sales/${sale.id}`
                            )
                          }
                          style={{
                            cursor:
                              'pointer',
                          }}
                        >
                          <td className="num">
                            {sale.receipt_no}
                          </td>

                          <td>
                            {
                              sale.customer_name
                            }
                          </td>

                          <td className="num">
                            {Number(
                              sale.total_amount ||
                                0
                            ).toLocaleString()}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            )}

          </section>

          {/* RECOVERY */}
          <section className="dashboard-panel">

            <div className="dashboard-section-title">
              <h2>Recovery Due</h2>
            </div>

            {recoveryRows.length === 0 ? (
              <div className="empty-state">
                No outstanding recovery.
              </div>
            ) : (
              <div className="dashboard-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Receipt</th>
                      <th>Outstanding</th>
                    </tr>
                  </thead>

                  <tbody>
                    {recoveryRows.map(
                      (row) => (
                        <tr
                          key={`${row.sale_id}-${row.installment_id}`}
                          onClick={() =>
                            navigate(
                              `/sales/${row.sale_id}`
                            )
                          }
                          style={{
                            cursor:
                              'pointer',
                          }}
                        >
                          <td>
                            {
                              row.customer_name
                            }
                          </td>

                          <td className="num">
                            {
                              row.receipt_no
                            }
                          </td>

                          <td
                            className="num"
                            style={{
                              color:
                                'var(--danger)',
                              fontWeight: 600,
                            }}
                          >
                            {Number(
                              row.outstanding_balance ||
                                0
                            ).toLocaleString()}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            )}

          </section>

          {/* PENDING EXPENSES */}
          <section className="dashboard-panel">

            <div className="dashboard-section-title">
              <h2>
                Pending Expense Approvals
              </h2>
            </div>

            {pendingExpenses.length ===
            0 ? (
              <div className="empty-state">
                Nothing pending.
              </div>
            ) : (
              <div className="dashboard-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Amount</th>
                    </tr>
                  </thead>

                  <tbody>
                    {pendingExpenses
                      .slice(0, 5)
                      .map(
                        (expense) => (
                          <tr
                            key={
                              expense.id
                            }
                            onClick={() =>
                              navigate(
                                '/expenses'
                              )
                            }
                            style={{
                              cursor:
                                'pointer',
                            }}
                          >
                            <td>
                              {
                                expense.category
                              }
                            </td>

                            <td className="num">
                              {Number(
                                expense.amount ||
                                  0
                              ).toLocaleString()}
                            </td>
                          </tr>
                        )
                      )}
                  </tbody>
                </table>
              </div>
            )}

          </section>

          {/* LOW STOCK */}
          <section className="dashboard-panel">

            <div className="dashboard-section-title">
              <h2>
                Low Stock Alerts
              </h2>
            </div>

            {lowStock.length === 0 ? (
              <div className="empty-state">
                All spare parts
                sufficiently stocked.
              </div>
            ) : (
              <div className="dashboard-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>On Hand</th>
                      <th>
                        Reorder Level
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {lowStock
                      .slice(0, 5)
                      .map(
                        (item) => (
                          <tr
                            key={item.id}
                            onClick={() =>
                              navigate(
                                `/inventory/${item.id}`
                              )
                            }
                            style={{
                              cursor:
                                'pointer',
                            }}
                          >
                            <td>
                              {item.title}
                            </td>

                            <td className="num">
                              {
                                item.quantity_on_hand
                              }
                            </td>

                            <td className="num">
                              {
                                item.reorder_level
                              }
                            </td>
                          </tr>
                        )
                      )}
                  </tbody>
                </table>
              </div>
            )}

          </section>

        </div>

      </div>
    </Layout>
  );
}