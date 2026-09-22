import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import {
  getProfitReport, getReceivablesReport, getInventoryValuationReport,
  getCashFlowReport, getVendorPurchasesReport, getBranchSummaryReport, downloadReport,
} from '../api.js';
import { getUser } from '../auth.js';

const BASE_TABS = [
  { key: 'profit', label: 'Net Profit' },
  { key: 'receivables', label: 'Receivables' },
  { key: 'valuation', label: 'Inventory Valuation' },
  { key: 'cashflow', label: 'Cash Flow' },
  { key: 'vendors', label: 'Vendor Purchases' },
];

const BRANCH_SUMMARY_TAB = { key: 'branch_summary', label: 'Branch Summary' };

export default function ReportsPage() {
  const user = getUser();
  const isSuperAdmin = user?.role === 'super_admin';

  const TABS = isSuperAdmin ? [...BASE_TABS, BRANCH_SUMMARY_TAB] : BASE_TABS;

  const [tab, setTab] = useState('profit');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(monthAgo);
  const [endDate, setEndDate] = useState(today);
  const [period, setPeriod] = useState('monthly');
  const [anchorDate, setAnchorDate] = useState(new Date().toISOString().slice(0, 10));
  const [downloading, setDownloading] = useState('');

  // Branch Summary tab: which branch row to focus on ('' = show all branches).
  const [selectedBranchId, setSelectedBranchId] = useState('');

  const isDateBound = ['profit', 'cashflow', 'vendors', 'branch_summary'].includes(tab);

  function load() {
    setError('');
    setData(null);
    const loaders = {
      profit: () => getProfitReport(startDate, endDate),
      receivables: getReceivablesReport,
      valuation: getInventoryValuationReport,
      cashflow: () => getCashFlowReport(startDate, endDate),
      vendors: () => getVendorPurchasesReport(startDate, endDate),
      branch_summary: () => getBranchSummaryReport(startDate, endDate),
    };
    loaders[tab]().then(setData).catch((err) => setError(err.message));
  }

  useEffect(load, [tab, startDate, endDate]);

  async function handleDownload(format) {
    setDownloading(format);
    setError('');
    try {
      await downloadReport({
        report: tab, format, period, date: anchorDate,
        branch_id: user.role === 'super_admin' ? user.branchId : undefined,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading('');
    }
  }

  const branchRows = tab === 'branch_summary' && data?.branches
    ? (selectedBranchId
        ? data.branches.filter((b) => String(b.branch_id) === String(selectedBranchId))
        : data.branches)
    : [];

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>Reports</h2>
          <p>Profit, receivables, inventory valuation, cash flow, and vendor purchases.</p>
        </div>
      </div>

      <div className="filter-bar">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? 'btn primary' : 'btn'}
            onClick={() => { setData(null); setError(''); setTab(t.key); setSelectedBranchId(''); }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isDateBound && (
        <div className="filter-bar" style={{ alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: 'var(--muted)', marginRight: 4 }}>Date Range:</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <span style={{ color: 'var(--muted)' }}>to</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      )}

      {tab !== 'branch_summary' && (
        <div className="filter-bar" style={{ alignItems: 'center' }}>
          {['daily', 'weekly', 'monthly', 'yearly'].map((p) => (
            <button
              key={p}
              className={period === p ? 'btn primary' : 'btn'}
              style={{ textTransform: 'capitalize' }}
              onClick={() => setPeriod(p)}
            >
              {p}
            </button>
          ))}
          <input type="date" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} />
          <span style={{ width: 1, height: 22, background: 'var(--line-light)' }} />
          <button className="btn" disabled={downloading === 'pdf'} onClick={() => handleDownload('pdf')}>
            {downloading === 'pdf' ? 'Preparing…' : '⬇ PDF'}
          </button>
          <button className="btn" disabled={downloading === 'xlsx'} onClick={() => handleDownload('xlsx')}>
            {downloading === 'xlsx' ? 'Preparing…' : '⬇ Excel'}
          </button>
        </div>
      )}

      {error && <div className="login-error" style={{ maxWidth: 640 }}>{error}</div>}
      {!data && !error && <p style={{ color: '#6b7280', fontSize: 13 }}>Loading…</p>}

      {data && tab === 'profit' && (
        <>
          <div className="form-card" style={{ marginBottom: 20, maxWidth: 500 }}>
            <div className="form-row">
              <div className="field"><label>Gross Profit</label><div className="num">{data.gross_profit.toLocaleString()}</div></div>
              <div className="field"><label>Total Expenses</label><div className="num">{data.total_expenses.toLocaleString()}</div></div>
            </div>
            <div className="field">
              <label>Net Profit</label>
              <div className="num" style={{ fontSize: 20, fontWeight: 700, color: data.net_profit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {data.net_profit.toLocaleString()}
              </div>
            </div>
          </div>
          {data.sales.length === 0 ? (
            <div className="empty-state">No sales this month.</div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Receipt</th><th>Product</th><th>Branch</th><th>Sale Type</th><th>Date</th><th>Total</th><th>Cost</th><th>Profit</th></tr></thead>
              <tbody>
                {data.sales.map((s) => (
                  <tr key={s.id}>
                    <td className="num">{s.receipt_no}</td>
                    <td>{s.product_name || '—'}</td>
                    <td>{s.branch_name}</td>
                    <td>
                      {Number(s.installment_count) > 0
                        ? `Installment (${s.installment_count})`
                        : 'Net'}
                    </td>
                    <td>{s.sale_date?.slice(0, 10)}</td>
                    <td className="num">{Number(s.total_amount).toLocaleString()}</td>
                    <td className="num">{Number(s.total_cost).toLocaleString()}</td>
                    <td className="num" style={{ color: Number(s.profit) >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                      {Number(s.profit).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {data && tab === 'receivables' && (
        <>
          <div className="form-card" style={{ marginBottom: 20, maxWidth: 320 }}>
            <label>Total Outstanding</label>
            <div className="num" style={{ fontSize: 20, fontWeight: 700, color: 'var(--danger)' }}>
              {data.total_outstanding.toLocaleString()}
            </div>
          </div>
          {data.sales.length === 0 ? (
            <div className="empty-state">No outstanding receivables.</div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Customer</th><th>Mobile</th><th>Receipt</th><th>Outstanding</th></tr></thead>
              <tbody>
                {data.sales.map((s) => (
                  <tr key={s.sale_id}>
                    <td>{s.customer_name}</td>
                    <td>{s.mobile_no || '—'}</td>
                    <td className="num">{s.receipt_no}</td>
                    <td className="num" style={{ color: 'var(--danger)', fontWeight: 600 }}>{Number(s.outstanding_balance).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {data && tab === 'valuation' && (
        <>
          <div className="form-card" style={{ marginBottom: 20, maxWidth: 320 }}>
            <label>Total Valuation (in-stock)</label>
            <div className="num" style={{ fontSize: 20, fontWeight: 700, color: 'var(--navy)' }}>
              {data.total_valuation.toLocaleString()}
            </div>
          </div>
          <table className="data-table">
            <thead><tr><th>Item Type</th><th>Count</th><th>Total Value</th></tr></thead>
            <tbody>
              {data.by_type.map((row) => (
                <tr key={row.item_type}>
                  <td>{row.item_type.replace('_', ' ')}</td>
                  <td>{row.item_count}</td>
                  <td className="num">{Number(row.total_value).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {data && tab === 'cashflow' && (
        data.length === 0 ? (
          <div className="empty-state">No cashbook entries saved yet.</div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Date</th><th>Opening</th><th>Cash In</th><th>Cash Out</th><th>Closing</th></tr></thead>
            <tbody>
              {data.map((h) => (
                <tr key={h.id}>
                  <td>{h.ledger_date?.slice(0, 10)}</td>
                  <td className="num">{Number(h.opening_cash).toLocaleString()}</td>
                  <td className="num">{(Number(h.cash_in_sales) + Number(h.cash_in_recovery) + Number(h.cash_in_other)).toLocaleString()}</td>
                  <td className="num">{(Number(h.cash_out_expenses) + Number(h.cash_out_refunds)).toLocaleString()}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{Number(h.closing_cash).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}

      {data && tab === 'vendors' && (
        data.length === 0 ? (
          <div className="empty-state">No vendors yet.</div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Vendor</th><th>Items Purchased</th><th>Total Value</th></tr></thead>
            <tbody>
              {data.map((v) => (
                <tr key={v.vendor_id}>
                  <td>{v.vendor_name}</td>
                  <td>{v.item_count}</td>
                  <td className="num">{Number(v.total_purchased).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}

      {/* ================= BRANCH SUMMARY (super_admin only) ================= */}
      {data && tab === 'branch_summary' && (
        <>
          <div className="filter-bar" style={{ alignItems: 'center' }}>
            <label style={{ fontSize: 12, color: 'var(--muted)', marginRight: 4 }}>Branch:</label>
            <select value={selectedBranchId} onChange={(e) => setSelectedBranchId(e.target.value)}>
              <option value="">All Branches</option>
              {data.branches.map((b) => (
                <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>
              ))}
            </select>
          </div>

          {!selectedBranchId && (
            <div className="dashboard-kpi-grid" style={{ marginBottom: 20 }}>
              <div className="dashboard-kpi-card">
                <div className="dashboard-kpi-label">Total Sales</div>
                <div className="dashboard-kpi-value num">{data.totals.sales_count}</div>
              </div>
              <div className="dashboard-kpi-card">
                <div className="dashboard-kpi-label">Gross Profit (All Branches)</div>
                <div className="dashboard-kpi-value num" style={{ color: 'var(--success)' }}>
                  {data.totals.gross_profit.toLocaleString()}
                </div>
              </div>
              <div className="dashboard-kpi-card">
                <div className="dashboard-kpi-label">Total Expenses</div>
                <div className="dashboard-kpi-value num" style={{ color: 'var(--danger)' }}>
                  {data.totals.total_expenses.toLocaleString()}
                </div>
              </div>
              <div className="dashboard-kpi-card">
                <div className="dashboard-kpi-label">Net Profit (All Branches)</div>
                <div className="dashboard-kpi-value num" style={{ color: data.totals.net_profit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {data.totals.net_profit.toLocaleString()}
                </div>
              </div>
            </div>
          )}

          {branchRows.length === 0 ? (
            <div className="empty-state">No branch data for this range.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Branch</th>
                  <th>Sales Count</th>
                  <th>Gross Profit</th>
                  <th>Total Expenses</th>
                  <th>Net Profit</th>
                </tr>
              </thead>
              <tbody>
                {branchRows.map((b) => (
                  <tr key={b.branch_id}>
                    <td style={{ fontWeight: 600 }}>{b.branch_name}</td>
                    <td className="num">{b.sales_count}</td>
                    <td className="num" style={{ color: 'var(--success)' }}>{Number(b.gross_profit).toLocaleString()}</td>
                    <td className="num" style={{ color: 'var(--danger)' }}>{Number(b.total_expenses).toLocaleString()}</td>
                    <td className="num" style={{ fontWeight: 700, color: Number(b.net_profit) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {Number(b.net_profit).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </Layout>
  );
}