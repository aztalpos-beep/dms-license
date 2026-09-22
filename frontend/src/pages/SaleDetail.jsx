import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { getSale, getSalePayments, recordPayment, createReturn, updateInstallmentPlan } from '../api.js';

export default function SaleDetail() {
  const { id } = useParams();
  const [sale, setSale] = useState(null);
  const [payments, setPayments] = useState([]);
  const [error, setError] = useState('');
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [method, setMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [refundStatus, setRefundStatus] = useState('none');
  const [refundAmount, setRefundAmount] = useState('0');
  const [returnNotes, setReturnNotes] = useState('');
  const [returning, setReturning] = useState(false);
  const [editingPlan, setEditingPlan] = useState(false);
  const [editedRows, setEditedRows] = useState([]);
  const [planError, setPlanError] = useState('');
  const [savingPlan, setSavingPlan] = useState(false);

  function load() {
    getSale(id).then(setSale).catch((err) => setError(err.message));
    getSalePayments(id).then(setPayments).catch(() => {});
  }

  useEffect(load, [id]);

  useEffect(() => {
    if (sale?.receipt_no) {
      document.title = `Receipt ${sale.receipt_no}`;
    }
  }, [sale]);

  function printPaymentReceipt(payment) {
    const w = window.open('', '_blank', 'width=480,height=680');
    if (!w) {
      setError('Please allow pop-ups for this site to print the payment receipt.');
      return;
    }
    const balance = Number(payment.outstanding_balance);

    const itemRows = (sale.items || [])
      .map(
        (it) => `<tr>
          <td class="label">${it.title || '-'}${it.model ? ` - ${it.model}` : ''}</td>
          <td class="value">${it.stock_code || '-'}</td>
        </tr>`
      )
      .join('');

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Payment Receipt - ${sale.receipt_no}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; padding: 26px; color: #14181F; }
  .center { text-align: center; }
  .logo { max-height: 60px; max-width: 200px; margin: 0 auto 8px; display: block; }
  h1 { font-size: 20px; margin: 0; color: #0B1E3D; letter-spacing: 0.02em; }
  .branch { font-size: 12px; font-weight: 700; color: #C9922C; margin-top: 2px; }
  .muted { font-size: 10.5px; color: #59606C; margin-top: 2px; }
  hr { border: none; border-top: 2px solid #0B1E3D; margin: 14px 0 16px; }
  .big { font-size: 15px; font-weight: 800; letter-spacing: 0.04em; margin-bottom: 4px; }
  .section-label { font-size: 10.5px; font-weight: 700; color: #59606C; text-transform: uppercase; letter-spacing: 0.04em; margin: 14px 0 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  td { padding: 5px 0; font-size: 12.5px; }
  td.label { color: #59606C; width: 55%; }
  td.value { text-align: right; font-weight: 600; }
  .balance { font-size: 13.5px; font-weight: 800; color: ${balance > 0 ? '#C14545' : '#1A8F4C'}; }
  .sign { margin-top: 70px; display: flex; justify-content: space-between; }
  .sign div { width: 45%; border-top: 1px solid #14181F; text-align: center; padding-top: 5px; font-size: 10.5px; }
</style>
</head>
<body>
  <div class="center">
    <img class="logo" src="/logo.png" alt="" onerror="this.style.display='none'" />
    <h1>${sale.branch_name || ''}</h1>
    ${sale.branch_address ? `<div class="muted">${sale.branch_address}</div>` : ''}
    ${sale.branch_phone ? `<div class="muted">Phone: ${sale.branch_phone}</div>` : ''}
  </div>
  <hr />
  <div class="center big">PAYMENT RECEIPT</div>
  <table>
    <tr><td class="label">Sale / Receipt No</td><td class="value">${sale.receipt_no}</td></tr>
    <tr><td class="label">Customer</td><td class="value">${sale.customer_name}</td></tr>
    <tr><td class="label">Father Name</td><td class="value">${sale.customer_father_name || '-'}</td></tr>
    <tr><td class="label">Payment Date</td><td class="value">${(payment.payment_date || '').slice(0, 10)}</td></tr>
    <tr><td class="label">Amount Received</td><td class="value">${Number(payment.amount_received).toLocaleString()}</td></tr>
    <tr><td class="label">Payment Method</td><td class="value" style="text-transform:capitalize">${payment.payment_method}</td></tr>
    ${payment.notes ? `<tr><td class="label">Notes</td><td class="value">${payment.notes}</td></tr>` : ''}
  </table>
  ${itemRows ? `
  <div class="section-label">Product</div>
  <table>${itemRows}</table>
  ` : ''}
  <hr />
  <table>
    <tr><td class="label">Remaining Outstanding Balance</td><td class="value balance">${balance.toLocaleString()}</td></tr>
  </table>
  <div class="sign">
    <div>Customer Signature</div>
    <div>Received By</div>
  </div>
</body>
</html>`;
    w.document.write(html);
    w.document.close();
    w.addEventListener('afterprint', () => w.close());
    setTimeout(() => { w.focus(); w.print(); }, 250);
  }

  function printReturnReceipt(ret) {
    const w = window.open('', '_blank', 'width=480,height=680');
    if (!w) {
      setError('Please allow pop-ups for this site to print the return receipt.');
      return;
    }

    const itemRows = (sale.items || [])
      .map(
        (it) => `<tr>
          <td class="label">${it.title || '-'}${it.model ? ` - ${it.model}` : ''}</td>
          <td class="value">${it.stock_code || '-'}</td>
        </tr>`
      )
      .join('');

    const returnDateStr = (ret.return_date || ret.created_at || '').slice(0, 10) || new Date().toISOString().slice(0, 10);

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Return Receipt - ${sale.receipt_no}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; padding: 26px; color: #14181F; }
  .center { text-align: center; }
  .logo { max-height: 60px; max-width: 200px; margin: 0 auto 8px; display: block; }
  h1 { font-size: 20px; margin: 0; color: #0B1E3D; letter-spacing: 0.02em; }
  .muted { font-size: 10.5px; color: #59606C; margin-top: 2px; }
  hr { border: none; border-top: 2px solid #0B1E3D; margin: 14px 0 16px; }
  .big { font-size: 15px; font-weight: 800; letter-spacing: 0.04em; margin-bottom: 4px; color: #C14545; }
  .section-label { font-size: 10.5px; font-weight: 700; color: #59606C; text-transform: uppercase; letter-spacing: 0.04em; margin: 14px 0 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  td { padding: 5px 0; font-size: 12.5px; }
  td.label { color: #59606C; width: 55%; }
  td.value { text-align: right; font-weight: 600; }
  .sign { margin-top: 70px; display: flex; justify-content: space-between; }
  .sign div { width: 45%; border-top: 1px solid #14181F; text-align: center; padding-top: 5px; font-size: 10.5px; }
</style>
</head>
<body>
  <div class="center">
    <img class="logo" src="/logo.png" alt="" onerror="this.style.display='none'" />
    <h1>${sale.branch_name || ''}</h1>
    ${sale.branch_address ? `<div class="muted">${sale.branch_address}</div>` : ''}
    ${sale.branch_phone ? `<div class="muted">Phone: ${sale.branch_phone}</div>` : ''}
  </div>
  <hr />
  <div class="center big">RETURN RECEIPT</div>
  <table>
    <tr><td class="label">Sale / Receipt No</td><td class="value">${sale.receipt_no}</td></tr>
    <tr><td class="label">Customer</td><td class="value">${sale.customer_name}</td></tr>
    <tr><td class="label">Father Name</td><td class="value">${sale.customer_father_name || '-'}</td></tr>
    <tr><td class="label">Return Date</td><td class="value">${returnDateStr}</td></tr>
    <tr><td class="label">Refund Status</td><td class="value" style="text-transform:capitalize">${ret.refund_status}</td></tr>
    <tr><td class="label">Refund Amount</td><td class="value">${Number(ret.refund_amount).toLocaleString()}</td></tr>
    ${ret.forgiven_balance > 0 ? `<tr><td class="label">Outstanding Balance Forgiven</td><td class="value">${Number(ret.forgiven_balance).toLocaleString()}</td></tr>` : ''}
    ${ret.notes ? `<tr><td class="label">Notes</td><td class="value">${ret.notes}</td></tr>` : ''}
  </table>
  ${itemRows ? `
  <div class="section-label">Returned Items</div>
  <table>${itemRows}</table>
  ` : ''}
  <hr />
  <div class="sign">
    <div>Customer Signature</div>
    <div>Received By</div>
  </div>
</body>
</html>`;
    w.document.write(html);
    w.document.close();
    w.addEventListener('afterprint', () => w.close());
    setTimeout(() => { w.focus(); w.print(); }, 250);
  }

  async function handleRecordPayment(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (!(Number(amount) > 0)) {
        setError('Amount received must be greater than zero.');
        setSaving(false);
        return;
      }
      const result = await recordPayment(id, {
        amount_received: Number(amount),
        payment_date: paymentDate || undefined,
        payment_method: method,
        notes: notes || undefined,
      });
      setAmount(''); setPaymentDate(''); setNotes(''); setShowPaymentForm(false);
      load();
      printPaymentReceipt(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleReturn(e) {
    e.preventDefault();
    setReturning(true);
    setError('');
    try {
      // Capture this BEFORE load() runs -- load() will refetch the sale and
      // outstanding_balance will already be 0 by then (the return API zeroes
      // it out), so this is the only chance to know what was forgiven.
      const forgivenBalance = Number(sale.outstanding_balance);
      const result = await createReturn(id, {
        refund_status: refundStatus,
        refund_amount: Number(refundAmount) || 0,
        notes: returnNotes || undefined,
      });
      setShowReturnForm(false);
      load();
      printReturnReceipt({ ...result, forgiven_balance: forgivenBalance });
    } catch (err) {
      setError(err.message);
    } finally {
      setReturning(false);
    }
  }

  function startEditingPlan() {
    setPlanError('');
    setEditedRows(
      (sale.payment_plan || []).map((p) => ({
        id: p.id,
        due_date: (p.due_date || '').slice(0, 10),
        expected_amount: String(p.expected_amount),
      }))
    );
    setEditingPlan(true);
  }

  function cancelEditingPlan() {
    setEditingPlan(false);
    setEditedRows([]);
    setPlanError('');
  }

  function updateEditedRow(idx, field, value) {
    setEditedRows((rows) => rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  }

  const editedTotal = editedRows.reduce((sum, r) => sum + (Number(r.expected_amount) || 0), 0);
  const editedPlanBase = Number(sale?.total_amount || 0) - Number(sale?.advance_received || 0);

  async function saveEditedPlan() {
    setPlanError('');

    const hasIncomplete = editedRows.some(
      (r) => !r.due_date || !r.expected_amount || Number(r.expected_amount) <= 0
    );
    if (hasIncomplete) {
      setPlanError('Every installment needs a due date and an amount greater than zero.');
      return;
    }

    const mismatch = editedTotal - editedPlanBase;
    if (Math.abs(mismatch) > 0.01) {
      setPlanError(
        mismatch > 0
          ? `Installments add up to ${editedTotal.toLocaleString()}, which is ${mismatch.toLocaleString()} more than ${editedPlanBase.toLocaleString()}. Adjust your amounts.`
          : `Installments add up to ${editedTotal.toLocaleString()}, which is ${Math.abs(mismatch).toLocaleString()} short of ${editedPlanBase.toLocaleString()}. Adjust your amounts.`
      );
      return;
    }

    setSavingPlan(true);
    try {
      await updateInstallmentPlan(
        id,
        editedRows.map((r) => ({ id: r.id, due_date: r.due_date, expected_amount: Number(r.expected_amount) }))
      );
      setEditingPlan(false);
      setEditedRows([]);
      load();
    } catch (err) {
      setPlanError(err.message);
    } finally {
      setSavingPlan(false);
    }
  }

  if (error) return <Layout><div className="login-error" style={{ maxWidth: 500 }}>{error}</div></Layout>;
  if (!sale) return <Layout><p style={{ color: '#6b7280', fontSize: 13 }}>Loading...</p></Layout>;

  const totalPaid = Number(sale.advance_received) + payments.reduce((sum, p) => sum + Number(p.amount_received), 0);
  const canManage = sale.status === 'active' || sale.status === 'completed';

  const planBase = Number(sale.total_amount) - Number(sale.advance_received);
  const actualPaidTowardPlan = payments.reduce((sum, p) => sum + Number(p.amount_received), 0);

  // Each installment keeps its own fixed amount. Payments are still
  // consumed oldest-due-first (FIFO), but a shortfall on one installment
  // does NOT get added on top of the next one -- the next installment
  // stays at its own scheduled amount, and the earlier shortfall just
  // stays as that installment's own "remaining" figure.
  let remainingPool = actualPaidTowardPlan;
  const planRows = (sale.payment_plan || []).map((p) => {
    const originalExpected = Number(p.expected_amount);
    const paidForThis = Math.min(Math.max(remainingPool, 0), originalExpected);
    remainingPool -= paidForThis;
    const remainingForThis = originalExpected - paidForThis;
    const status = paidForThis >= originalExpected ? 'paid' : paidForThis > 0 ? 'partial' : 'pending';
    return { ...p, expected: originalExpected, originalExpected, paidForThis, remainingForThis, status };
  });

  const totalCoveredOfPlan = Math.min(actualPaidTowardPlan, planBase);
  const planFullyCovered = planRows.length > 0 && totalCoveredOfPlan >= planBase;

  return (
    <Layout>
      <style>{`
        @media print {
          @page { size: A4; margin: 8mm; }
          .app-sidebar, .no-print { display: none !important; }
          .app-main { margin-left: 0 !important; padding: 0 !important; }
          body, .app-main { font-size: 11px !important; }
          .receipt-letterhead { margin-bottom: 8px !important; padding-bottom: 8px !important; }
          .receipt-letterhead h1 { font-size: 18px !important; }
          .receipt-logo { max-height: 46px !important; margin-bottom: 6px !important; }
          .page-header { margin-bottom: 8px !important; padding-bottom: 5px !important; }
          .page-header h2 { font-size: 14px !important; }
          h2 { font-size: 12.5px !important; }
          .form-card { box-shadow: none !important; border: 1px solid var(--line) !important; padding: 8px 12px !important; margin-bottom: 8px !important; }
          .field label { font-size: 9px !important; margin-bottom: 2px !important; }
          .data-table { margin-bottom: 8px !important; }
          .data-table th, .data-table td { padding: 4px 8px !important; font-size: 10.5px !important; }
          .data-table th { background: var(--navy) !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .badge { -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 1px 7px !important; }
          .empty-state { padding: 8px !important; margin-bottom: 8px !important; font-size: 11px !important; }
          .receipt-signatures { margin-top: 70px !important; padding-top: 10px !important; }
        }
      `}</style>

      <div className="receipt-letterhead" style={{ textAlign: 'center', marginBottom: 16, paddingBottom: 14, borderBottom: '2px solid var(--navy)' }}>
        <img
          className="receipt-logo"
          src="/logo.png"
          alt=""
          style={{ maxHeight: 64, maxWidth: 220, marginBottom: 8 }}
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)', letterSpacing: '0.02em' }}>{sale.branch_name}</h1>
        {sale.branch_address && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{sale.branch_address}</div>}
        {sale.branch_phone && <div style={{ fontSize: 11, color: 'var(--muted)' }}>Phone: {sale.branch_phone}</div>}
      </div>

      <div className="page-header">
        <div>
          <h2 className="num">Receipt {sale.receipt_no}</h2>
          <p>{sale.sale_date?.slice(0, 10)}</p>
        </div>
        <div className="no-print" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="badge">{sale.status}</span>
          <button className="btn" onClick={() => window.print()}>🖨 Print Receipt</button>
          {canManage && (
            <>
              {sale.status === 'active' && (
                <button className="btn primary" onClick={() => setShowPaymentForm((s) => !s)}>
                  {showPaymentForm ? 'Cancel' : '+ Record Payment'}
                </button>
              )}
              <button className="btn" onClick={() => setShowReturnForm((s) => !s)}>
                {showReturnForm ? 'Cancel' : 'Return / Cancel Sale'}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="form-card" style={{ marginBottom: 20 }}>
        <div className="form-row">
          <div className="field"><label>Customer Name</label><div>{sale.customer_name}</div></div>
          <div className="field"><label>Father Name</label><div>{sale.customer_father_name || '-'}</div></div>
        </div>
        <div className="form-row">
          <div className="field"><label>Contact Number</label><div className="num">{sale.customer_mobile || '-'}</div></div>
          <div className="field"><label>Address</label><div>{sale.customer_address || '-'}</div></div>
        </div>
      </div>

      {showReturnForm && (
        <form className="form-card no-print" onSubmit={handleReturn} style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
            This restores all items on this sale back to inventory and forgives any remaining balance owed.
          </p>
          <div className="form-row">
            <div className="field">
              <label>Refund Status</label>
              <select
                value={refundStatus}
                onChange={(e) => setRefundStatus(e.target.value)}
                style={{ width: '100%', height: 36, border: '1.5px solid var(--line-light)', borderRadius: 4, padding: '0 10px' }}
              >
                <option value="none">No refund</option>
                <option value="partial">Partial refund</option>
                <option value="full">Full refund</option>
              </select>
            </div>
            <div className="field">
              <label>Refund Amount</label>
              <input type="number" step="0.01" min="0" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} disabled={refundStatus === 'none'} />
            </div>
          </div>
          <div className="field">
            <label>Notes</label>
            <input value={returnNotes} onChange={(e) => setReturnNotes(e.target.value)} placeholder="optional" />
          </div>
          <button className="btn primary" type="submit" disabled={returning}>
            {returning ? 'Processing...' : 'Confirm Return'}
          </button>
        </form>
      )}

      <div className="form-card" style={{ marginBottom: 20 }}>
        <div className="form-row no-print">
          <div className="field"><label>Subtotal</label><div className="num">{Number(sale.subtotal).toLocaleString()}</div></div>
          <div className="field"><label>Discount</label><div className="num">{Number(sale.discount).toLocaleString()}</div></div>
        </div>
        <div className="form-row">
          <div className="field"><label>Total Amount</label><div className="num" style={{ fontWeight: 700 }}>{Number(sale.total_amount).toLocaleString()}</div></div>
          <div className="field"><label>Advance Received</label><div className="num">{Number(sale.advance_received).toLocaleString()}</div></div>
        </div>
        <div className="form-row">
          <div className="field">
            <label>Total Paid So Far</label>
            <div className="num" style={{ fontWeight: 700, color: 'var(--success)' }}>{totalPaid.toLocaleString()}</div>
          </div>
          <div className="field">
            <label>Outstanding Balance</label>
            <div className="num" style={{ fontWeight: 700, color: Number(sale.outstanding_balance) > 0 ? 'var(--danger)' : 'inherit' }}>
              {Number(sale.outstanding_balance).toLocaleString()}
            </div>
          </div>
        </div>
        <div className="form-row no-print">
          <div className="field">
            <label>Total Investment</label>
            <div className="num" style={{ fontWeight: 700, color: 'var(--gold-dark)' }}>
              {Math.max(0, (sale.items || []).reduce((sum, it) => sum + Number(it.quantity) * Number(it.purchase_price || 0), 0) - Number(sale.advance_received)).toLocaleString()}
            </div>
          </div>
          <div className="field">
            <label>Profit</label>
            <div className="num" style={{ fontWeight: 700, color: (Number(sale.total_amount) - (sale.items || []).reduce((sum, it) => sum + Number(it.quantity) * Number(it.purchase_price || 0), 0)) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {(Number(sale.total_amount) - (sale.items || []).reduce((sum, it) => sum + Number(it.quantity) * Number(it.purchase_price || 0), 0)).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {showPaymentForm && (
        <form className="form-card no-print" onSubmit={handleRecordPayment} style={{ marginBottom: 20 }}>
          <div className="form-row">
            <div className="field">
              <label>Amount Received</label>
              <input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <div className="field">
              <label>Payment Date</label>
              <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="field">
              <label>Method</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                style={{ width: '100%', height: 36, border: '1.5px solid var(--line-light)', borderRadius: 4, padding: '0 10px' }}
              >
                <option value="cash">Cash</option>
                <option value="bank">Bank</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="field">
              <label>Notes (partial / early / late)</label>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" />
            </div>
          </div>
          <button className="btn primary" type="submit" disabled={saving}>
            {saving ? 'Recording...' : 'Record Payment'}
          </button>
        </form>
      )}

      <div className="page-header" style={{ marginBottom: 8 }}><h2 style={{ fontSize: 14 }}>Items</h2></div>
      <table className="data-table" style={{ marginBottom: 20 }}>
        <thead><tr><th>Stock Code</th><th>Product Name</th><th>Model</th><th>Type</th><th>Qty</th><th>Engine No</th><th>Chassis No</th><th>Unit Price</th><th>Line Total</th></tr></thead>
        <tbody>
          {sale.items.map((it) => (
            <tr key={it.id}>
              <td>{it.stock_code}</td>
              <td>{it.title}</td>
              <td>{it.model || '-'}</td>
              <td>{it.item_type.replace('_', ' ')}</td>
              <td>{it.quantity}</td>
              <td>{it.engine_no || '-'}</td>
              <td>{it.chassis_no || '-'}</td>
              <td className="num">{Number(it.unit_price).toLocaleString()}</td>
              <td className="num">{(it.quantity * Number(it.unit_price)).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="page-header" style={{ marginBottom: 8 }}><h2 style={{ fontSize: 14 }}>Payments Received</h2></div>
      {payments.length === 0 && Number(sale.advance_received) === 0 ? (
        <div className="empty-state" style={{ marginBottom: 20 }}>No payments recorded yet.</div>
      ) : (
        <table className="data-table" style={{ marginBottom: 20 }}>
          <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Notes</th><th className="no-print"></th></tr></thead>
          <tbody>
            {Number(sale.advance_received) > 0 && (
              <tr>
                <td>{sale.sale_date?.slice(0, 10)}</td>
                <td className="num" style={{ color: '#2f6e3d', fontWeight: 600 }}>{Number(sale.advance_received).toLocaleString()}</td>
                <td>Advance</td>
                <td>Advance received at time of sale</td>
                <td className="no-print"></td>
              </tr>
            )}
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{p.payment_date?.slice(0, 10)}</td>
                <td className="num" style={{ color: '#2f6e3d', fontWeight: 600 }}>{Number(p.amount_received).toLocaleString()}</td>
                <td style={{ textTransform: 'capitalize' }}>{p.payment_method}</td>
                <td>{p.notes || '-'}</td>
                <td className="no-print">
                  <button
                    type="button"
                    className="btn ghost"
                    style={{ padding: '4px 10px', fontSize: 11 }}
                    onClick={() => printPaymentReceipt({ ...p, outstanding_balance: sale.outstanding_balance })}
                  >
                    🖨 Print
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div>
        <div className="page-header" style={{ marginBottom: 8 }}>
          <h2 style={{ fontSize: 14 }}>Installment Plan</h2>
          {sale.payment_plan.length > 0 && !editingPlan && (
            <button type="button" className="btn no-print" onClick={startEditingPlan}>✎ Edit Installments</button>
          )}
        </div>
        {sale.payment_plan.length === 0 ? (
          <div className="empty-state" style={{ marginBottom: 20 }}>No installment plan set for this sale.</div>
        ) : (
          <table className="data-table" style={{ marginBottom: 8 }}>
            <thead><tr><th>#</th><th>Due Date</th><th>Installment Amount</th><th>Paid So Far</th><th>Remaining</th><th>Status</th></tr></thead>
            <tbody>
              {editingPlan
                ? editedRows.map((row, idx) => (
                    <tr key={row.id}>
                      <td>{idx + 1}</td>
                      <td>
                        <input
                          type="date"
                          value={row.due_date}
                          onChange={(e) => updateEditedRow(idx, 'due_date', e.target.value)}
                          style={{ width: '100%', height: 30, border: '1.5px solid var(--line-light)', borderRadius: 4, padding: '0 6px' }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={row.expected_amount}
                          onChange={(e) => updateEditedRow(idx, 'expected_amount', e.target.value)}
                          style={{ width: '100%', height: 30, border: '1.5px solid var(--line-light)', borderRadius: 4, padding: '0 6px', textAlign: 'right' }}
                        />
                      </td>
                      <td className="num" style={{ color: 'var(--muted)' }}>-</td>
                      <td className="num" style={{ color: 'var(--muted)' }}>-</td>
                      <td style={{ color: 'var(--muted)', fontSize: 11 }}>Editing</td>
                    </tr>
                  ))
                : planRows.map((p) => (
                <tr key={p.id}>
                  <td>{p.installment_no}</td>
                  <td>{p.due_date?.slice(0, 10)}</td>
                  <td className="num">{p.expected.toLocaleString()}</td>
                  <td className="num" style={{ fontWeight: 600, color: p.paidForThis > 0 ? 'var(--success)' : 'var(--muted)' }}>
                    {p.paidForThis > 0 ? p.paidForThis.toLocaleString() : '-'}
                  </td>
                  <td className="num" style={{ fontWeight: 700, color: p.remainingForThis > 0 ? 'var(--danger)' : 'var(--success)' }}>
                    {p.remainingForThis > 0 ? p.remainingForThis.toLocaleString() : '0'}
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={
                        p.status === 'paid'
                          ? { background: 'rgba(26,143,76,0.12)', color: '#1A8F4C', border: '1px solid rgba(26,143,76,0.35)' }
                          : p.status === 'partial'
                          ? { background: 'rgba(201,146,44,0.15)', color: '#C9922C', border: '1px solid rgba(201,146,44,0.4)' }
                          : { background: 'rgba(193,69,69,0.10)', color: '#C14545', border: '1px solid rgba(193,69,69,0.3)' }
                      }
                    >
                      {p.status === 'paid' ? '✓ Paid' : p.status === 'partial' ? '◔ Partial' : 'Pending'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {editingPlan && (
          <div className="no-print" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, marginBottom: 8, color: Math.abs(editedTotal - editedPlanBase) > 0.01 ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
              Total: {editedTotal.toLocaleString()} / Required: {editedPlanBase.toLocaleString()}
              {Math.abs(editedTotal - editedPlanBase) > 0.01 && (
                <span> -- {editedTotal > editedPlanBase ? 'reduce' : 'increase'} by {Math.abs(editedTotal - editedPlanBase).toLocaleString()}</span>
              )}
            </div>
            {planError && <div className="login-error" style={{ marginBottom: 10 }}>{planError}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="btn" onClick={cancelEditingPlan}>Cancel</button>
              <button type="button" className="btn primary" onClick={saveEditedPlan} disabled={savingPlan}>
                {savingPlan ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}

        {sale.payment_plan.length > 0 && !editingPlan && (
          <div style={{ marginBottom: 20 }}>
            {planFullyCovered ? (
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)' }}>✓ Fully Paid -- installment plan covers the full outstanding balance.</div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Plan covers {totalCoveredOfPlan.toLocaleString()} of {planBase.toLocaleString()} owed.</div>
            )}
          </div>
        )}
      </div>

      <div className="no-print">
        <div className="page-header" style={{ marginBottom: 8 }}><h2 style={{ fontSize: 14 }}>Documents</h2></div>
        {sale.documents.length === 0 ? (
          <div className="empty-state">No documents attached.</div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Type</th><th>File</th></tr></thead>
            <tbody>
              {sale.documents.map((d) => (
                <tr key={d.id}>
                  <td>{d.document_type || '-'}</td>
                  <td><a href={d.file_url} target="_blank" rel="noreferrer">{d.file_url}</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="receipt-signatures" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 100, paddingTop: 16 }}>
        <div style={{ textAlign: 'center', width: 200 }}>
          <div style={{ borderTop: '1px solid var(--text)', paddingTop: 6, fontSize: 11 }}>Customer Signature</div>
        </div>
        <div style={{ textAlign: 'center', width: 200 }}>
          <div style={{ borderTop: '1px solid var(--text)', paddingTop: 6, fontSize: 11 }}>Authorized Signature</div>
        </div>
      </div>
    </Layout>
  );
}