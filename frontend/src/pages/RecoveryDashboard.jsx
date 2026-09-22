import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import {
  getRecoveryDashboard,
  recordPayment,
  getSale,
} from '../api.js';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function addMonths(dateStr, months) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function formatDate(date) {
  if (!date) {
    return '—';
  }

  return String(date).slice(0, 10);
}

function getStatusLabel(row) {
  if (row.status === 'paid') {
    return 'Paid';
  }

  if (row.status === 'partial') {
    return 'Partial';
  }

  if (row.status === 'overdue') {
    return 'Overdue';
  }

  return 'Upcoming';
}

function getStatusStyle(status) {
  if (status === 'paid') {
    return {
      background: 'rgba(26, 143, 76, 0.12)',
      color: '#1A8F4C',
      border: '1px solid rgba(26, 143, 76, 0.30)',
    };
  }

  if (status === 'partial') {
    return {
      background: 'rgba(201, 146, 44, 0.15)',
      color: '#C9922C',
      border: '1px solid rgba(201, 146, 44, 0.40)',
    };
  }

  if (status === 'overdue') {
    return {
      background: 'rgba(193, 69, 69, 0.12)',
      color: '#C14545',
      border: '1px solid rgba(193, 69, 69, 0.30)',
    };
  }

  return {
    background: 'rgba(79, 107, 255, 0.10)',
    color: '#4F6BFF',
    border: '1px solid rgba(79, 107, 255, 0.25)',
  };
}

/*
 * Opens a print-friendly payment receipt in a new window.
 */
function printPaymentReceipt(
  w,
  sale,
  payment,
  installment
) {
  const balance =
    Number(payment.outstanding_balance) || 0;

  const itemRows = (sale.items || [])
    .map(
      (it) => `<tr>
        <td class="label">
          ${it.title || '—'}
          ${it.model ? ` — ${it.model}` : ''}
        </td>
        <td class="value">
          ${it.stock_code || '—'}
        </td>
      </tr>`
    )
    .join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Payment Receipt - ${sale.receipt_no}</title>

<style>
  body {
    font-family: Arial, Helvetica, sans-serif;
    padding: 26px;
    color: #14181F;
  }

  .center {
    text-align: center;
  }

  .logo {
    max-height: 60px;
    max-width: 200px;
    margin: 0 auto 8px;
    display: block;
  }

  h1 {
    font-size: 20px;
    margin: 0;
    color: #0B1E3D;
    letter-spacing: 0.02em;
  }

  .muted {
    font-size: 10.5px;
    color: #59606C;
    margin-top: 2px;
  }

  hr {
    border: none;
    border-top: 2px solid #0B1E3D;
    margin: 14px 0 16px;
  }

  .big {
    font-size: 15px;
    font-weight: 800;
    letter-spacing: 0.04em;
    margin-bottom: 4px;
  }

  .section-label {
    font-size: 10.5px;
    font-weight: 700;
    color: #59606C;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin: 14px 0 4px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 8px;
  }

  td {
    padding: 5px 0;
    font-size: 12.5px;
  }

  td.label {
    color: #59606C;
    width: 55%;
  }

  td.value {
    text-align: right;
    font-weight: 600;
  }

  .balance {
    font-size: 13.5px;
    font-weight: 800;
    color: ${
      balance > 0
        ? '#C14545'
        : '#1A8F4C'
    };
  }

  .sign {
    margin-top: 70px;
    display: flex;
    justify-content: space-between;
  }

  .sign div {
    width: 45%;
    border-top: 1px solid #14181F;
    text-align: center;
    padding-top: 5px;
    font-size: 10.5px;
  }
</style>
</head>

<body>

  <div class="center">

    <img
      class="logo"
      src="/logo.png"
      alt=""
      onerror="this.style.display='none'"
    />

    <h1>${sale.branch_name || ''}</h1>

    ${
      sale.branch_address
        ? `<div class="muted">${sale.branch_address}</div>`
        : ''
    }

    ${
      sale.branch_phone
        ? `<div class="muted">Phone: ${sale.branch_phone}</div>`
        : ''
    }

  </div>

  <hr />

  <div class="center big">
    PAYMENT RECEIPT
  </div>

  <table>

    <tr>
      <td class="label">
        Sale / Receipt No
      </td>

      <td class="value">
        ${sale.receipt_no}
      </td>
    </tr>

    <tr>
      <td class="label">
        Customer
      </td>

      <td class="value">
        ${sale.customer_name}
      </td>
    </tr>

    <tr>
      <td class="label">
        Father Name
      </td>

      <td class="value">
        ${sale.customer_father_name || '—'}
      </td>
    </tr>

    <tr>
      <td class="label">
        Payment Date
      </td>

      <td class="value">
        ${(payment.payment_date || '').slice(0, 10)}
      </td>
    </tr>

    ${
      installment
        ? `<tr>
            <td class="label">
              Installment Amount
            </td>

            <td class="value">
              ${Number(
                installment.expected_amount
              ).toLocaleString()}
            </td>
          </tr>`
        : ''
    }

    <tr>
      <td class="label">
        Amount Received
      </td>

      <td class="value">
        ${Number(
          payment.amount_received
        ).toLocaleString()}
      </td>
    </tr>

    ${
      installment &&
      Number(payment.amount_received) <
        Number(installment.expected_amount)
        ? `<tr>
            <td
              class="label"
              style="color:#C14545;"
            >
              Short Paid By
            </td>

            <td
              class="value"
              style="color:#C14545;"
            >
              ${(
                Number(installment.expected_amount) -
                Number(payment.amount_received)
              ).toLocaleString()}
            </td>
          </tr>`
        : ''
    }

    <tr>
      <td class="label">
        Payment Method
      </td>

      <td
        class="value"
        style="text-transform:capitalize"
      >
        ${payment.payment_method}
      </td>
    </tr>

    ${
      payment.notes
        ? `<tr>
            <td class="label">
              Notes
            </td>

            <td class="value">
              ${payment.notes}
            </td>
          </tr>`
        : ''
    }

  </table>

  ${
    itemRows
      ? `
        <div class="section-label">
          Product
        </div>

        <table>
          ${itemRows}
        </table>
      `
      : ''
  }

  <hr />

  <table>

    <tr>
      <td class="label">
        Remaining Outstanding Balance
      </td>

      <td class="value balance">
        ${balance.toLocaleString()}
      </td>
    </tr>

  </table>

  <div class="sign">
    <div>Customer Signature</div>
    <div>Received By</div>
  </div>

</body>
</html>`;

  w.document.write(html);
  w.document.close();

  w.addEventListener('afterprint', () => {
    w.close();
  });

  setTimeout(() => {
    w.focus();
    w.print();
  }, 250);
}

/*
 * PRINT RECOVERY REPORT
 *
 * Prints the currently filtered recovery list.
 *
 * Includes:
 * - Customer
 * - Phone
 * - Item
 * - Receipt
 * - Installment
 * - Expected Amount
 * - Paid
 * - Remaining
 * - Due Date
 * - Status
 */
function printRecoveryReport(
  rows,
  startDate,
  endDate,
  searchText
) {
  if (!rows || rows.length === 0) {
    return;
  }

  const printWindow = window.open(
    '',
    '_blank',
    'width=1200,height=800'
  );

  if (!printWindow) {
    window.alert(
      'Print window was blocked by the browser. Please allow popups for this site.'
    );

    return;
  }

  const branchNames = [
    ...new Set(
      rows
        .map((row) => row.branch_name)
        .filter(Boolean)
    ),
  ];

  const branchName =
    branchNames.length === 1
      ? branchNames[0]
      : 'All Branches';

  const totalExpected = rows.reduce(
    (sum, row) =>
      sum + Number(row.expected_amount || 0),
    0
  );

  const totalPaid = rows.reduce(
    (sum, row) =>
      sum + Number(row.paid_amount || 0),
    0
  );

  const totalRemaining = rows.reduce(
    (sum, row) =>
      sum + Number(row.remaining_amount || 0),
    0
  );

  const paidCount = rows.filter(
    (row) => row.status === 'paid'
  ).length;

  const partialCount = rows.filter(
    (row) => row.status === 'partial'
  ).length;

  const overdueCount = rows.filter(
    (row) => row.status === 'overdue'
  ).length;

  const upcomingCount = rows.filter(
    (row) => row.status === 'upcoming'
  ).length;

  const tableRows = rows
    .map((row, index) => {
      const status = getStatusLabel(row);

      let statusClass = 'upcoming';

      if (row.status === 'paid') {
        statusClass = 'paid';
      } else if (row.status === 'partial') {
        statusClass = 'partial';
      } else if (row.status === 'overdue') {
        statusClass = 'overdue';
      }

      return `
        <tr>

          <td class="center">
            ${index + 1}
          </td>

          <td>
            <strong>
              ${row.customer_name || '—'}
            </strong>

            <div class="phone">
              ${row.mobile_no || '—'}
            </div>

            ${
              row.cnic
                ? `<div class="cnic">
                    CNIC: ${row.cnic}
                  </div>`
                : ''
            }
          </td>

          <td>
            ${row.item_names || '—'}
          </td>

          <td>
            ${row.receipt_no || '—'}
          </td>

          <td class="center">
            #${row.installment_no || '—'}
          </td>

          <td class="date">
            ${formatDate(row.due_date)}
          </td>

          <td class="amount">
            ${Number(
              row.expected_amount || 0
            ).toLocaleString()}
          </td>

          <td class="amount">
            ${Number(
              row.paid_amount || 0
            ).toLocaleString()}
          </td>

          <td class="amount remaining">
            ${Number(
              row.remaining_amount || 0
            ).toLocaleString()}
          </td>

          <td class="center">
            <span class="status ${statusClass}">
              ${status}
            </span>
          </td>

        </tr>
      `;
    })
    .join('');

  const periodText =
    startDate && endDate
      ? `${formatDate(startDate)} to ${formatDate(endDate)}`
      : 'Current Recovery View';

  const searchTextSafe =
    searchText && searchText.trim()
      ? searchText.trim()
      : '';

  const html = `<!DOCTYPE html>
<html>
<head>

<meta charset="utf-8" />

<title>
  Installment Recovery Report
</title>

<style>

  @page {
    size: A4 landscape;
    margin: 12mm;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    font-family:
      Arial,
      Helvetica,
      sans-serif;
    color: #14181F;
    background: #fff;
  }

  .header {
    text-align: center;
    margin-bottom: 14px;
  }

  .header h1 {
    margin: 0;
    font-size: 22px;
    color: #0B1E3D;
  }

  .header h2 {
    margin: 5px 0 0;
    font-size: 17px;
    color: #14181F;
  }

  .header .period {
    margin-top: 5px;
    font-size: 12px;
    color: #59606C;
  }

  .header .branch {
    margin-top: 3px;
    font-size: 12px;
    font-weight: 700;
    color: #59606C;
  }

  .header .search {
    margin-top: 4px;
    font-size: 11px;
    color: #59606C;
  }

  .summary {
    display: grid;
    grid-template-columns:
      repeat(7, 1fr);
    gap: 7px;
    margin-bottom: 12px;
  }

  .summary-box {
    border: 1px solid #D9DEE8;
    border-radius: 6px;
    padding: 7px;
    text-align: center;
  }

  .summary-label {
    font-size: 8px;
    color: #59606C;
    text-transform: uppercase;
    margin-bottom: 3px;
  }

  .summary-value {
    font-size: 13px;
    font-weight: 800;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th {
    background: #0B1E3D;
    color: #fff;
    padding: 7px 6px;
    font-size: 8.5px;
    text-align: left;
    white-space: nowrap;
  }

  td {
    border-bottom: 1px solid #DDE2EA;
    padding: 6px;
    font-size: 8.5px;
    vertical-align: middle;
  }

  tbody tr:nth-child(even) {
    background: #F7F9FC;
  }

  .center {
    text-align: center;
  }

  .date {
    white-space: nowrap;
  }

  .amount {
    text-align: right;
    white-space: nowrap;
    font-family:
      "Courier New",
      monospace;
  }

  .remaining {
    font-weight: 800;
  }

  .phone {
    margin-top: 2px;
    color: #59606C;
    font-size: 7.5px;
  }

  .cnic {
    margin-top: 2px;
    color: #59606C;
    font-size: 7.5px;
  }

  .status {
    display: inline-block;
    border-radius: 10px;
    padding: 3px 7px;
    font-size: 7.5px;
    font-weight: 700;
    white-space: nowrap;
  }

  .status.paid {
    color: #1A8F4C;
    background: #E8F6EE;
    border: 1px solid #A9D9BD;
  }

  .status.partial {
    color: #A16B00;
    background: #FFF5DD;
    border: 1px solid #E7C77D;
  }

  .status.overdue {
    color: #B33131;
    background: #FCEAEA;
    border: 1px solid #E6A7A7;
  }

  .status.upcoming {
    color: #3F5ED8;
    background: #EEF1FF;
    border: 1px solid #C5CDF8;
  }

  .footer {
    margin-top: 14px;
    display: flex;
    justify-content: space-between;
    font-size: 8px;
    color: #59606C;
  }

  @media print {

    body {
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }

    thead {
      display: table-header-group;
    }

    tr {
      page-break-inside: avoid;
    }

  }

</style>

</head>

<body>

  <div class="header">

    <h1>
      DMS POS
    </h1>

    <h2>
      INSTALLMENT RECOVERY REPORT
    </h2>

    <div class="branch">
      ${branchName}
    </div>

    <div class="period">
      Period: ${periodText}
    </div>

    ${
      searchTextSafe
        ? `<div class="search">
            Search: ${searchTextSafe}
          </div>`
        : ''
    }

  </div>

  <div class="summary">

    <div class="summary-box">
      <div class="summary-label">
        Installments
      </div>

      <div class="summary-value">
        ${rows.length}
      </div>
    </div>

    <div class="summary-box">
      <div class="summary-label">
        Expected
      </div>

      <div class="summary-value">
        ${totalExpected.toLocaleString()}
      </div>
    </div>

    <div class="summary-box">
      <div class="summary-label">
        Paid Amount
      </div>

      <div class="summary-value">
        ${totalPaid.toLocaleString()}
      </div>
    </div>

    <div class="summary-box">
      <div class="summary-label">
        Remaining
      </div>

      <div class="summary-value">
        ${totalRemaining.toLocaleString()}
      </div>
    </div>

    <div class="summary-box">
      <div class="summary-label">
        Paid
      </div>

      <div class="summary-value">
        ${paidCount}
      </div>
    </div>

    <div class="summary-box">
      <div class="summary-label">
        Partial
      </div>

      <div class="summary-value">
        ${partialCount}
      </div>
    </div>

    <div class="summary-box">
      <div class="summary-label">
        Unpaid / Due
      </div>

      <div class="summary-value">
        ${overdueCount + upcomingCount}
      </div>
    </div>

  </div>

  <table>

    <thead>

      <tr>
        <th>#</th>
        <th>Customer / Phone / CNIC</th>
        <th>Item / Stock Code</th>
        <th>Receipt</th>
        <th>Installment</th>
        <th>Due Date</th>
        <th>Amount</th>
        <th>Paid</th>
        <th>Remaining</th>
        <th>Status</th>
      </tr>

    </thead>

    <tbody>
      ${tableRows}
    </tbody>

  </table>

  <div class="footer">

    <div>
      Generated by DMS POS
    </div>

    <div>
      Printed: ${new Date().toLocaleString()}
    </div>

  </div>

</body>
</html>`;

  printWindow.document.write(html);
  printWindow.document.close();

  printWindow.addEventListener(
    'afterprint',
    () => {
      printWindow.close();
    }
  );

  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 300);
}

export default function RecoveryDashboard() {
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const [openRowKey, setOpenRowKey] =
    useState(null);

  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] =
    useState('');

  const [method, setMethod] =
    useState('cash');

  const [saving, setSaving] =
    useState(false);

  /*
   * Date range.
   */
  const [startDate, setStartDate] =
    useState('');

  const [endDate, setEndDate] =
    useState('');

  /*
   * Recovery search.
   *
   * Searches:
   * - Customer name
   * - CNIC
   * - Receipt number
   */
  const [search, setSearch] =
    useState('');

  function load(filters = {}) {
    setLoading(true);
    setError('');

    getRecoveryDashboard(filters)
      .then((data) => {
        setRows(
          Array.isArray(data)
            ? data
            : []
        );
      })
      .catch((err) => {
        setError(
          err.message ||
            'Could not load recovery dashboard.'
        );

        setRows([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }

  useEffect(() => {
    load();
  }, []);

  function applyFilter() {
    if (!startDate || !endDate) {
      setError(
        'Please select both From and To dates.'
      );

      return;
    }

    if (startDate > endDate) {
      setError(
        'From date cannot be after To date.'
      );

      return;
    }

    load({
      start_date: startDate,
      end_date: endDate,
    });
  }

  function clearFilter() {
    setStartDate('');
    setEndDate('');
    setSearch('');
    load();
  }

  function clearSearch() {
    setSearch('');
  }

  function quickRange(
    monthsBack,
    monthsForward
  ) {
    const start = addMonths(
      todayStr(),
      -monthsBack
    );

    const end = addMonths(
      todayStr(),
      monthsForward
    );

    setStartDate(start);
    setEndDate(end);

    load({
      start_date: start,
      end_date: end,
    });
  }

  function toggleRecoveryForm(key) {
    setOpenRowKey(
      openRowKey === key
        ? null
        : key
    );

    setAmount('');
    setPaymentDate('');
    setError('');
  }

  async function handleAddRecovery(
    e,
    installmentRow
  ) {
    e.preventDefault();
    e.stopPropagation();

    setSaving(true);
    setError('');

    const saleId =
      installmentRow.sale_id;

    /*
     * Open receipt window synchronously
     * so browser does not block it.
     */
    const receiptWindow = window.open(
      '',
      '_blank',
      'width=480,height=680'
    );

    if (receiptWindow) {
      receiptWindow.document.write(
        '<p style="font-family:Arial,sans-serif;padding:20px;color:#6b7280;">Preparing receipt…</p>'
      );
    }

    try {
      const result =
        await recordPayment(saleId, {
          amount_received: Number(amount),
          payment_date:
            paymentDate || undefined,
          payment_method: method,
          linked_installment_id:
            installmentRow.installment_id,
        });

      setOpenRowKey(null);
      setAmount('');
      setPaymentDate('');

      /*
       * Reload using currently selected
       * date range.
       */
      if (startDate && endDate) {
        load({
          start_date: startDate,
          end_date: endDate,
        });
      } else {
        load();
      }

      /*
       * Fetch complete sale details
       * for receipt.
       */
      if (receiptWindow) {
        try {
          const sale =
            await getSale(saleId);

          printPaymentReceipt(
            receiptWindow,
            sale,
            result,
            installmentRow
          );
        } catch {
          receiptWindow.close();
        }
      }
    } catch (err) {
      setError(
        err.message ||
          'Could not record recovery.'
      );

      if (receiptWindow) {
        receiptWindow.close();
      }
    } finally {
      setSaving(false);
    }
  }

  /*
   * SEARCH
   *
   * Customer name
   * CNIC
   * Receipt number
   */
  const normalizedSearch =
    search.trim().toLowerCase();

  const filteredRows =
    normalizedSearch
      ? rows.filter((row) => {
          const customerName =
            String(
              row.customer_name || ''
            ).toLowerCase();

          const cnic =
            String(
              row.cnic || ''
            ).toLowerCase();

          const receiptNo =
            String(
              row.receipt_no || ''
            ).toLowerCase();

          return (
            customerName.includes(
              normalizedSearch
            ) ||
            cnic.includes(
              normalizedSearch
            ) ||
            receiptNo.includes(
              normalizedSearch
            )
          );
        })
      : rows;

  /*
   * Summary figures.
   *
   * Use filteredRows so the dashboard
   * summary follows the current search.
   */
  const totalExpected =
    filteredRows.reduce(
      (sum, row) =>
        sum +
        Number(
          row.expected_amount || 0
        ),
      0
    );

  const totalPaid =
    filteredRows.reduce(
      (sum, row) =>
        sum +
        Number(
          row.paid_amount || 0
        ),
      0
    );

  const totalRemaining =
    filteredRows.reduce(
      (sum, row) =>
        sum +
        Number(
          row.remaining_amount || 0
        ),
      0
    );

  const paidCount =
    filteredRows.filter(
      (row) =>
        row.status === 'paid'
    ).length;

  const partialCount =
    filteredRows.filter(
      (row) =>
        row.status === 'partial'
    ).length;

  const overdueCount =
    filteredRows.filter(
      (row) =>
        row.status === 'overdue'
    ).length;

  const upcomingCount =
    filteredRows.filter(
      (row) =>
        row.status === 'upcoming'
    ).length;

  /*
   * Total Investment:
   * calculate once per unique sale.
   */
  const uniqueSales = new Map();

  filteredRows.forEach((row) => {
    if (
      !uniqueSales.has(
        row.sale_id
      )
    ) {
      uniqueSales.set(
        row.sale_id,
        {
          total_cost:
            Number(
              row.total_cost || 0
            ),

          advance_received:
            Number(
              row.advance_received || 0
            ),
        }
      );
    }
  });

  const totalInvestment =
    Array.from(
      uniqueSales.values()
    ).reduce(
      (sum, sale) =>
        sum +
        Math.max(
          0,
          sale.total_cost -
            sale.advance_received
        ),
      0
    );

  return (
    <Layout>

      <div className="page-header">

        <div>
          <h2>
            Recovery Dashboard
          </h2>

          <p>
            View customer installments by
            due date and prepare recovery
            follow-up lists.
          </p>
        </div>

        {filteredRows.length > 0 && (
          <button
            type="button"
            className="btn primary"
            onClick={() =>
              printRecoveryReport(
                filteredRows,
                startDate,
                endDate,
                search
              )
            }
          >
            🖨 Print Recovery List
          </button>
        )}

      </div>

      {/* ================= DATE FILTER ================= */}

      <div
        className="form-card"
        style={{
          maxWidth: 1000,
          marginBottom: 20,
        }}
      >

        <div
          className="form-row"
          style={{
            alignItems: 'flex-end',
            flexWrap: 'wrap',
          }}
        >

          <div
            className="field"
            style={{ margin: 0 }}
          >
            <label>
              From
            </label>

            <input
              type="date"
              value={startDate}
              onChange={(e) =>
                setStartDate(
                  e.target.value
                )
              }
            />
          </div>

          <div
            className="field"
            style={{ margin: 0 }}
          >
            <label>
              To
            </label>

            <input
              type="date"
              value={endDate}
              onChange={(e) =>
                setEndDate(
                  e.target.value
                )
              }
            />
          </div>

          <button
            type="button"
            className="btn primary"
            onClick={applyFilter}
            disabled={
              !startDate ||
              !endDate
            }
          >
            Apply
          </button>

          <button
            type="button"
            className="btn ghost"
            onClick={clearFilter}
          >
            Reset (Default)
          </button>

        </div>

        {/* ================= QUICK RANGES ================= */}

        <div
          style={{
            display: 'flex',
            gap: 8,
            marginTop: 14,
            flexWrap: 'wrap',
          }}
        >

          <button
            type="button"
            className="btn"
            style={{
              fontSize: 12,
            }}
            onClick={() =>
              quickRange(0, 1)
            }
          >
            Next 1 Month
          </button>

          <button
            type="button"
            className="btn"
            style={{
              fontSize: 12,
            }}
            onClick={() =>
              quickRange(0, 3)
            }
          >
            Next 3 Months
          </button>

          <button
            type="button"
            className="btn"
            style={{
              fontSize: 12,
            }}
            onClick={() =>
              quickRange(0, 6)
            }
          >
            Next 6 Months
          </button>

          <button
            type="button"
            className="btn"
            style={{
              fontSize: 12,
            }}
            onClick={() =>
              quickRange(3, 0)
            }
          >
            Past 3 Months
          </button>

          <button
            type="button"
            className="btn"
            style={{
              fontSize: 12,
            }}
            onClick={() =>
              quickRange(6, 0)
            }
          >
            Past 6 Months
          </button>

          <button
            type="button"
            className="btn"
            style={{
              fontSize: 12,
            }}
            onClick={() =>
              quickRange(12, 12)
            }
          >
            Past & Next Year
          </button>

        </div>

        {/* ================= SEARCH ================= */}

        <div
          style={{
            marginTop: 18,
            display: 'flex',
            gap: 10,
            alignItems: 'flex-end',
            flexWrap: 'wrap',
          }}
        >

          <div
            className="field"
            style={{
              margin: 0,
              flex: '1 1 420px',
            }}
          >

            <label>
              Search Customer / CNIC / Receipt No.
            </label>

            <input
              type="text"
              value={search}
              onChange={(e) =>
                setSearch(
                  e.target.value
                )
              }
              placeholder="Search by customer name, CNIC or receipt no."
              style={{
                width: '100%',
              }}
            />

          </div>

          {search.trim() && (
            <button
              type="button"
              className="btn ghost"
              onClick={clearSearch}
            >
              Clear Search
            </button>
          )}

        </div>

        {/* ================= SEARCH RESULT INFO ================= */}

        {search.trim() && (
          <div
            style={{
              marginTop: 10,
              fontSize: 12,
              color: 'var(--muted)',
            }}
          >
            Showing{' '}
            <strong>
              {filteredRows.length}
            </strong>{' '}
            of{' '}
            <strong>
              {rows.length}
            </strong>{' '}
            installments for search:
            <strong
              style={{
                marginLeft: 5,
                color: 'var(--navy)',
              }}
            >
              {search}
            </strong>
          </div>
        )}

      </div>

      {/* ================= SUMMARY ================= */}

      {!loading &&
        filteredRows.length > 0 && (
          <div
            className="dashboard-kpi-grid"
            style={{
              marginBottom: 20,
            }}
          >

            <div className="dashboard-kpi-card">

              <div className="dashboard-kpi-label">
                Installments
              </div>

              <div className="dashboard-kpi-value num">
                {filteredRows.length}
              </div>

            </div>

            <div className="dashboard-kpi-card">

              <div className="dashboard-kpi-label">
                Total Expected
              </div>

              <div
                className="dashboard-kpi-value num"
                style={{
                  color:
                    'var(--navy)',
                }}
              >
                {totalExpected.toLocaleString()}
              </div>

            </div>

            <div className="dashboard-kpi-card">

              <div className="dashboard-kpi-label">
                Total Paid
              </div>

              <div
                className="dashboard-kpi-value num"
                style={{
                  color:
                    'var(--success)',
                }}
              >
                {totalPaid.toLocaleString()}
              </div>

            </div>

            <div className="dashboard-kpi-card">

              <div className="dashboard-kpi-label">
                Remaining
              </div>

              <div
                className="dashboard-kpi-value num"
                style={{
                  color:
                    'var(--danger)',
                }}
              >
                {totalRemaining.toLocaleString()}
              </div>

            </div>

            <div className="dashboard-kpi-card">

              <div className="dashboard-kpi-label">
                Paid
              </div>

              <div
                className="dashboard-kpi-value num"
                style={{
                  color:
                    'var(--success)',
                }}
              >
                {paidCount}
              </div>

            </div>

            <div className="dashboard-kpi-card">

              <div className="dashboard-kpi-label">
                Partial
              </div>

              <div
                className="dashboard-kpi-value num"
                style={{
                  color:
                    '#C9922C',
                }}
              >
                {partialCount}
              </div>

            </div>

            <div className="dashboard-kpi-card">

              <div className="dashboard-kpi-label">
                Unpaid / Due
              </div>

              <div
                className="dashboard-kpi-value num"
                style={{
                  color:
                    overdueCount > 0
                      ? 'var(--danger)'
                      : 'var(--navy)',
                }}
              >
                {overdueCount +
                  upcomingCount}
              </div>

            </div>

          </div>
        )}

      {/* ================= ERROR ================= */}

      {error && (
        <div
          className="login-error"
          style={{
            maxWidth: 700,
          }}
        >
          {error}
        </div>
      )}

      {/* ================= LOADING ================= */}

      {loading ? (
        <div className="dashboard-loading">
          Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          No installments found in this date
          range.
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="empty-state">

          No installments found for:

          <strong
            style={{
              marginLeft: 6,
            }}
          >
            {search}
          </strong>

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
                <th>Due Date</th>
                <th>Customer</th>
                <th>Mobile</th>
                <th>Receipt</th>
                <th>Item</th>
                <th>Installment</th>
                <th>Expected</th>
                <th>Paid</th>
                <th>Remaining</th>
                <th>Status</th>
                <th></th>
              </tr>

            </thead>

            <tbody>

              {filteredRows.map((r) => {

                const key =
                  `${r.sale_id}-${r.installment_id}`;

                const isOpen =
                  openRowKey === key;

                return (
                  <React.Fragment
                    key={key}
                  >

                    <tr
                      style={{
                        cursor:
                          'pointer',
                      }}
                    >

                      <td
                        onClick={() =>
                          navigate(
                            `/sales/${r.sale_id}`
                          )
                        }
                      >
                        {formatDate(
                          r.due_date
                        )}
                      </td>

                      <td
                        onClick={() =>
                          navigate(
                            `/sales/${r.sale_id}`
                          )
                        }
                        style={{
                          fontWeight: 600,
                        }}
                      >
                        {r.customer_name ||
                          '—'}
                      </td>

                      <td
                        onClick={() =>
                          navigate(
                            `/sales/${r.sale_id}`
                          )
                        }
                      >
                        {r.mobile_no ||
                          '—'}
                      </td>

                      <td
                        className="num"
                        onClick={() =>
                          navigate(
                            `/sales/${r.sale_id}`
                          )
                        }
                      >
                        {r.receipt_no ||
                          '—'}
                      </td>

                      <td
                        onClick={() =>
                          navigate(
                            `/sales/${r.sale_id}`
                          )
                        }
                        style={{
                          minWidth: 180,
                        }}
                      >
                        {r.item_names ||
                          '—'}
                      </td>

                      <td
                        className="num"
                        onClick={() =>
                          navigate(
                            `/sales/${r.sale_id}`
                          )
                        }
                      >
                        #{r.installment_no}
                      </td>

                      <td
                        className="num"
                        onClick={() =>
                          navigate(
                            `/sales/${r.sale_id}`
                          )
                        }
                        style={{
                          fontWeight: 600,
                        }}
                      >
                        {Number(
                          r.expected_amount ||
                            0
                        ).toLocaleString()}
                      </td>

                      <td
                        className="num"
                        onClick={() =>
                          navigate(
                            `/sales/${r.sale_id}`
                          )
                        }
                        style={{
                          fontWeight: 600,
                          color:
                            Number(
                              r.paid_amount
                            ) > 0
                              ? 'var(--success)'
                              : 'var(--muted)',
                        }}
                      >
                        {Number(
                          r.paid_amount || 0
                        ) > 0
                          ? Number(
                              r.paid_amount
                            ).toLocaleString()
                          : '0'}
                      </td>

                      <td
                        className="num"
                        onClick={() =>
                          navigate(
                            `/sales/${r.sale_id}`
                          )
                        }
                        style={{
                          fontWeight: 700,
                          color:
                            Number(
                              r.remaining_amount
                            ) > 0
                              ? 'var(--danger)'
                              : 'var(--success)',
                        }}
                      >
                        {Number(
                          r.remaining_amount ||
                            0
                        ).toLocaleString()}
                      </td>

                      <td
                        onClick={() =>
                          navigate(
                            `/sales/${r.sale_id}`
                          )
                        }
                      >
                        <span
                          className="badge"
                          style={getStatusStyle(
                            r.status
                          )}
                        >
                          {getStatusLabel(
                            r
                          )}
                        </span>
                      </td>

                      <td>

                        {Number(
                          r.remaining_amount ||
                            0
                        ) > 0 ? (

                          <button
                            type="button"
                            className="btn primary"
                            style={{
                              padding:
                                '5px 10px',
                              fontSize: 11.5,
                            }}
                            onClick={(e) => {

                              e.stopPropagation();

                              toggleRecoveryForm(
                                key
                              );

                            }}
                          >
                            {isOpen
                              ? 'Cancel'
                              : '+ Add Recovery'}
                          </button>

                        ) : (

                          <span
                            style={{
                              color:
                                'var(--success)',
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            Paid
                          </span>

                        )}

                      </td>

                    </tr>

                    {isOpen && (
                      <tr>

                        <td
                          colSpan={11}
                          style={{
                            background:
                              'var(--accent-bg)',
                          }}
                        >

                          <form
                            onSubmit={(e) =>
                              handleAddRecovery(
                                e,
                                r
                              )
                            }
                            style={{
                              display:
                                'flex',
                              gap: 10,
                              alignItems:
                                'flex-end',
                              padding:
                                '10px 4px',
                              flexWrap:
                                'wrap',
                            }}
                          >

                            <div
                              className="field"
                              style={{
                                margin: 0,
                              }}
                            >

                              <label>
                                Amount Received
                              </label>

                              <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                required
                                autoFocus
                                value={amount}
                                onChange={(e) =>
                                  setAmount(
                                    e.target.value
                                  )
                                }
                                style={{
                                  width: 140,
                                }}
                              />

                            </div>

                            <div
                              className="field"
                              style={{
                                margin: 0,
                              }}
                            >

                              <label>
                                Payment Date
                              </label>

                              <input
                                type="date"
                                value={
                                  paymentDate
                                }
                                onChange={(e) =>
                                  setPaymentDate(
                                    e.target.value
                                  )
                                }
                              />

                            </div>

                            <div
                              className="field"
                              style={{
                                margin: 0,
                              }}
                            >

                              <label>
                                Method
                              </label>

                              <select
                                value={method}
                                onChange={(e) =>
                                  setMethod(
                                    e.target.value
                                  )
                                }
                              >

                                <option value="cash">
                                  Cash
                                </option>

                                <option value="bank">
                                  Bank
                                </option>

                                <option value="other">
                                  Other
                                </option>

                              </select>

                            </div>

                            <button
                              className="btn primary"
                              type="submit"
                              disabled={saving}
                            >
                              {saving
                                ? 'Recording…'
                                : 'Record'}
                            </button>

                          </form>

                        </td>

                      </tr>
                    )}

                  </React.Fragment>
                );
              })}

            </tbody>

          </table>

        </div>
      )}

    </Layout>
  );
}