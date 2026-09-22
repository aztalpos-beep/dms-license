import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { getCustomers, getInventory, createSale, uploadFile } from '../api.js';
import { getUser } from '../auth.js';

export default function NewSaleWizard() {
  const navigate = useNavigate();
  const user = getUser();
  const canDiscount = ['super_admin', 'admin', 'manager'].includes(user.role);

  const [saleType, setSaleType] = useState('net'); // 'net' | 'installment'
  const [activeCategory, setActiveCategory] = useState('automobile'); // 'automobile' | 'spare_part' — which item list the search shows
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [receiptNo, setReceiptNo] = useState('');
  const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 10));
  const [availableItems, setAvailableItems] = useState([]);
  const [itemToAdd, setItemToAdd] = useState('');
  const [itemQuery, setItemQuery] = useState('');
  const [showItemDropdown, setShowItemDropdown] = useState(false);
  const ITEM_DROPDOWN_LIMIT = 8;
  const [cart, setCart] = useState([]); // { inventory_item_id, title, stock_code, item_type, quantity, purchase_price, unit_price }
  const [discount, setDiscount] = useState('0');
  const [advance, setAdvance] = useState('0');
  const [installments, setInstallments] = useState([]); // { due_date, expected_amount }
  const [documents, setDocuments] = useState([]); // { document_type, file_url }
  const [uploadingDocIdx, setUploadingDocIdx] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showInstallmentConfirm, setShowInstallmentConfirm] = useState(false);
  const [pendingPayload, setPendingPayload] = useState(null);

  // Pulled out so it can be called again (not just on first mount). Inventory
  // edits made elsewhere (another tab, another page) don't otherwise show up
  // here until a full page reload — the picker would keep offering stale
  // stock codes/titles for items the user already edited.
  function refreshInventory() {
    return getInventory({ status: 'in_stock' }).then(setAvailableItems).catch(() => {});
  }

  useEffect(() => {
    getCustomers().then(setCustomers).catch(() => {});
    refreshInventory();
  }, []);

  const cartHasVehicle = cart.some((c) => c.item_type !== 'spare_part');
  const cartHasSparePart = cart.some((c) => c.item_type === 'spare_part');

  // Once the cart has a real item in it, the tab follows the cart (it's
  // committed to that category). Before that, the tab itself decides what
  // the search shows — this is what lets the user browse automobiles or
  // spare parts up front, without needing to add an item first.
  useEffect(() => {
    if (cartHasVehicle) setActiveCategory('automobile');
    else if (cartHasSparePart) setActiveCategory('spare_part');
  }, [cartHasVehicle, cartHasSparePart]);

  // An automobile sale and a spare-parts sale can never mix on one invoice.
  const categoryFilteredItems = availableItems.filter((i) => {
    if (cartHasVehicle) return i.item_type !== 'spare_part';
    if (cartHasSparePart) return i.item_type === 'spare_part';
    return activeCategory === 'automobile' ? i.item_type !== 'spare_part' : i.item_type === 'spare_part';
  });

  // Never render the full inventory list — filter by what's typed and cap
  // the results, so the picker stays short even with a large catalog.
  const filteredAvailableItems = (itemQuery.trim()
    ? categoryFilteredItems.filter((i) =>
        `${i.stock_code} ${i.title}`.toLowerCase().includes(itemQuery.trim().toLowerCase())
      )
    : categoryFilteredItems
  ).slice(0, ITEM_DROPDOWN_LIMIT);
  const hiddenItemCount = (itemQuery.trim()
    ? categoryFilteredItems.filter((i) => `${i.stock_code} ${i.title}`.toLowerCase().includes(itemQuery.trim().toLowerCase())).length
    : categoryFilteredItems.length) - filteredAvailableItems.length;

  function addItemToCart() {
    const item = availableItems.find((i) => String(i.id) === String(itemToAdd));
    if (!item) {
      setError('Select an item from the list first.');
      return;
    }

    const isVehicle = item.item_type !== 'spare_part';
    if (isVehicle && cartHasSparePart) {
      setError('This invoice already has spare parts — an automobile sale cannot include spare parts, and vice versa.');
      return;
    }
    if (!isVehicle && cartHasVehicle) {
      setError('This invoice already has a vehicle — an automobile sale cannot include spare parts, and vice versa.');
      return;
    }
    if (cart.some((c) => c.inventory_item_id === item.id)) {
      setError('That item is already in the cart.');
      return;
    }

    setError('');
    setCart([...cart, {
      inventory_item_id: item.id,
      title: item.title,
      stock_code: item.stock_code,
      item_type: item.item_type,
      quantity: 1,
      purchase_price: item.purchase_price, // cost reference, read-only
      unit_price: item.purchase_price,     // selling price, editable — defaults to cost
    }]);
    setItemToAdd('');
    setItemQuery('');
  }

  function updateCartLine(idx, field, value) {
    const next = [...cart];
    next[idx][field] = value;
    setCart(next);
  }

  function removeCartLine(idx) {
    setCart(cart.filter((_, i) => i !== idx));
  }

  const subtotal = cart.reduce((sum, c) => sum + (Number(c.quantity) * Number(c.unit_price)), 0);
  const totalCost = cart.reduce((sum, c) => sum + (Number(c.quantity) * Number(c.purchase_price)), 0);
  const totalAmount = subtotal - (Number(discount) || 0);
  const estimatedProfit = totalAmount - totalCost;

  // Net Sale = fully paid on the spot. Keep advance in sync with total automatically.
  useEffect(() => {
    if (saleType === 'net') {
      setAdvance(String(totalAmount > 0 ? totalAmount : 0));
      setInstallments([]);
    }
  }, [saleType, totalAmount]);

  // Spare parts are net (cash) sale only — installments are not offered for them.
  // Driven by the cart once it has committed, otherwise by the active tab.
  const isSparePartsSale = cartHasSparePart || (cart.length === 0 && activeCategory === 'spare_part');
  useEffect(() => {
    if (isSparePartsSale && saleType === 'installment') {
      setSaleType('net');
    }
  }, [isSparePartsSale, saleType]);

  const outstandingPreview = totalAmount - (Number(advance) || 0);

  function addInstallmentRow() {
    setInstallments([...installments, { due_date: '', expected_amount: '' }]);
  }
  function updateInstallment(idx, field, value) {
    const next = [...installments];
    next[idx][field] = value;
    setInstallments(next);
  }
  function removeInstallment(idx) {
    setInstallments(installments.filter((_, i) => i !== idx));
  }

  // Running balance table: for each installment row, show the balance
  // remaining after that installment is expected to be paid.
  let runningBalance = outstandingPreview;
  const installmentRows = installments.map((inst) => {
    const amt = Number(inst.expected_amount) || 0;
    runningBalance = runningBalance - amt;
    return { ...inst, balanceAfter: runningBalance };
  });

  function addDocumentRow() {
    setDocuments([...documents, { document_type: '', file_url: '' }]);
  }
  function updateDocument(idx, field, value) {
    const next = [...documents];
    next[idx][field] = value;
    setDocuments(next);
  }
  function removeDocument(idx) {
    setDocuments(documents.filter((_, i) => i !== idx));
  }

  async function handleDocumentFileChange(idx, e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingDocIdx(idx);
    setError('');
    try {
      const url = await uploadFile(file);
      updateDocument(idx, 'file_url', url);
      updateDocument(idx, 'file_name', file.name);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingDocIdx(null);
    }
  }

  const CUSTOMER_DROPDOWN_LIMIT = 8;

  // Normalize the search text so CNIC searches work even when the user types
  // spaces or dashes differently from how the CNIC is stored. Name searches
  // remain case-insensitive and keep normal spaces intact.
  function normalizeCustomerText(value) {
    return String(value || '').trim().toLowerCase();
  }

  function normalizeCustomerNic(value) {
    return String(value || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  }

  const customerQuery = normalizeCustomerText(customerSearch);
  const customerNicQuery = normalizeCustomerNic(customerSearch);

  const matchingCustomers = customers
    .map((c) => {
      const name = normalizeCustomerText(c.name);
      const nic = normalizeCustomerNic(c.nic);
      const nameMatch = customerQuery && name.includes(customerQuery);
      const nicMatch = customerNicQuery && nic.includes(customerNicQuery);

      if (!customerQuery) return { customer: c, score: 0 };
      if (!nameMatch && !nicMatch) return null;

      // Put exact and beginning matches first, so the most likely customer
      // appears at the top of the dropdown.
      let score = 1;
      if (name === customerQuery || nic === customerNicQuery) score = 4;
      else if (name.startsWith(customerQuery) || nic.startsWith(customerNicQuery)) score = 3;
      else score = 2;

      return { customer: c, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || String(a.customer.name || '').localeCompare(String(b.customer.name || '')))
    .map(({ customer }) => customer);

  const filteredCustomers = matchingCustomers.slice(0, CUSTOMER_DROPDOWN_LIMIT);
  const hiddenCustomerCount = Math.max(0, matchingCustomers.length - filteredCustomers.length);

  const selectedCustomer = customers.find((c) => String(c.id) === String(customerId));

  function selectCustomer(c) {
    setCustomerId(c.id);
    setCustomerSearch('');
    setShowCustomerDropdown(false);
  }

  function clearCustomerSelection() {
    setCustomerId('');
    setCustomerSearch('');
    setShowCustomerDropdown(false);
  }

  function buildPayload() {
    const payload = {
      customer_id: customerId,
      receipt_no: receiptNo.trim(),
      sale_date: saleDate,
      items: cart.map((c) => ({
        inventory_item_id: c.inventory_item_id,
        quantity: Number(c.quantity),
        unit_price: Number(c.unit_price),
      })),
      discount: Number(discount) || 0,
      advance_received: Number(advance) || 0,
      installment_plan: saleType === 'installment'
        ? installments
            .filter((i) => i.due_date && i.expected_amount)
            .map((i) => ({ due_date: i.due_date, expected_amount: Number(i.expected_amount) }))
        : [],
      documents: documents.filter((d) => d.file_url),
    };
    if (user.role === 'super_admin') payload.branch_id = user.branchId;
    return payload;
  }

  async function submitSale(payload) {
    setSaving(true);
    setError('');
    try {
      const sale = await createSale(payload);
      navigate(`/sales/${sale.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!customerId) { setError('Select a customer.'); return; }
    if (!receiptNo.trim()) { setError('Enter a receipt number.'); return; }
    if (!saleDate) { setError('Select a sale date.'); return; }
    if (cart.length === 0) { setError('Add at least one item.'); return; }
    if (Number(discount) < 0) { setError('Discount cannot be negative.'); return; }
    if (Number(advance) < 0) { setError('Amount received cannot be negative.'); return; }

    // If this is an installment sale and there's still a balance left after
    // the advance/discount, the installment plan MUST fully account for it:
    //   - at least one installment row is required
    //   - every row needs a due date and a positive amount
    //   - the rows' amounts must add up to exactly the outstanding balance
    //     (not less, not more) -- otherwise the sale can be finalized with
    //     money unaccounted for, which is what this blocks.
    if (saleType === 'installment' && outstandingPreview > 0) {
      if (installments.length === 0) {
        setError('This sale has an outstanding balance -- add at least one installment to cover it.');
        return;
      }
      const hasIncompleteRow = installments.some(
        (i) => !i.due_date || !i.expected_amount || Number(i.expected_amount) <= 0
      );
      if (hasIncompleteRow) {
        setError('Every installment row needs a due date and an amount greater than zero before you can finalize the sale.');
        return;
      }
      const installmentTotal = installments.reduce((sum, i) => sum + Number(i.expected_amount), 0);
      const mismatch = installmentTotal - outstandingPreview;
      if (Math.abs(mismatch) > 0.01) {
        setError(
          mismatch > 0
            ? `Installments add up to ${installmentTotal.toLocaleString()}, which is ${mismatch.toLocaleString()} more than the outstanding balance of ${outstandingPreview.toLocaleString()}. Adjust your amounts.`
            : `Installments add up to ${installmentTotal.toLocaleString()}, which is ${Math.abs(mismatch).toLocaleString()} short of the outstanding balance of ${outstandingPreview.toLocaleString()}. Adjust your amounts.`
        );
        return;
      }
    }

    const payload = buildPayload();

    // Installment sale with a filled-in schedule -- show a confirmation
    // popup before actually saving. Net sale, or an installment sale with
    // no rows at all, goes straight through (nothing to confirm).
    if (saleType === 'installment' && payload.installment_plan.length > 0) {
      setPendingPayload(payload);
      setShowInstallmentConfirm(true);
      return;
    }

    submitSale(payload);
  }

  function confirmInstallmentsAndSave() {
    setShowInstallmentConfirm(false);
    if (pendingPayload) submitSale(pendingPayload);
  }

  function editInstallments() {
    setShowInstallmentConfirm(false);
    setPendingPayload(null);
  }

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>New Sale</h2>
          <p>Sell one or more vehicles (net or installment), or a multi-item spare-parts cart (net sale only) — the two cannot be mixed on one invoice.</p>
        </div>
      </div>

      {error && <div className="login-error" style={{ maxWidth: 640 }}>{error}</div>}

      {/* Category tabs — choose what the "Add Item" search shows.
          Switching tabs never clears the cart; once the cart has an item,
          it stays locked to that category and the tabs follow it. */}
      <div className="form-card" style={{ maxWidth: 720, marginBottom: 16, padding: 14 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className={activeCategory === 'automobile' ? 'btn primary' : 'btn'}
            style={{ flex: 1 }}
            onClick={() => setActiveCategory('automobile')}
          >
            Automobiles (Cars / Tractors)
          </button>
          <button
            type="button"
            className={activeCategory === 'spare_part' ? 'btn primary' : 'btn'}
            style={{ flex: 1 }}
            onClick={() => setActiveCategory('spare_part')}
          >
            Spare Parts
          </button>
        </div>
        {(cartHasVehicle || cartHasSparePart) && (
          <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8 }}>
            This invoice already has {cartHasVehicle ? 'a vehicle' : 'spare parts'} in the cart, so it's locked to{' '}
            {cartHasVehicle ? 'automobiles' : 'spare parts'} — the other tab is just for browsing and won't let you add a mismatched item.
          </p>
        )}
      </div>

      {/* Sale type toggle */}
      <div className="form-card" style={{ maxWidth: 720, marginBottom: 16, padding: 14 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className={saleType === 'net' ? 'btn primary' : 'btn'}
            style={{ flex: 1 }}
            onClick={() => setSaleType('net')}
          >
            Net Sale
          </button>
          <button
            type="button"
            className={saleType === 'installment' ? 'btn primary' : 'btn'}
            style={{ flex: 1, opacity: isSparePartsSale ? 0.5 : 1, cursor: isSparePartsSale ? 'not-allowed' : 'pointer' }}
            disabled={isSparePartsSale}
            title={isSparePartsSale ? 'Spare parts are net sale only.' : ''}
            onClick={() => setSaleType('installment')}
          >
            Installment Sale
          </button>
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8 }}>
          {isSparePartsSale
            ? 'This cart has spare parts — spare-parts sales must be paid in full (net sale only).'
            : saleType === 'net'
              ? 'Net Sale: paid in full now. No installment schedule.'
              : 'Installment Sale: set a payment schedule and track balance as installments are added.'}
        </p>
      </div>

      <form className="form-card" style={{ maxWidth: 720 }} onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="field" style={{ position: 'relative' }}>
            <label>Customer</label>
            <input
              type="text"
              value={customerSearch}
              onChange={(e) => {
                setCustomerSearch(e.target.value);
                setCustomerId('');
                setShowCustomerDropdown(true);
              }}
              onFocus={() => setShowCustomerDropdown(true)}
              onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 150)}
              placeholder="Search customer by name or CNIC..."
              autoComplete="off"
            />
            {selectedCustomer && (
              <div style={{ fontSize: 12, color: 'var(--success)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>
                  ✓ {selectedCustomer.name}{selectedCustomer.nic ? ` - ${selectedCustomer.nic}` : ''} ({selectedCustomer.mobile_no || 'no mobile'})
                </span>
                <button
                  type="button"
                  onClick={clearCustomerSelection}
                  style={{ fontSize: 11, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  change
                </button>
              </div>
            )}
            {showCustomerDropdown && (
              <div
                style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                  background: '#fff', border: '1.5px solid var(--line-light)', borderRadius: 6,
                  maxHeight: 280, overflowY: 'auto', marginTop: 2, boxShadow: '0 6px 18px rgba(0,0,0,0.10)',
                }}
              >
                {filteredCustomers.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--muted)', padding: '10px 12px' }}>
                    {customerQuery ? 'No customer found by that name or CNIC.' : 'Start typing a customer name or CNIC.'}
                  </div>
                ) : (
                  <>
                    {filteredCustomers.map((c) => (
                      <div
                        key={c.id}
                        onMouseDown={() => selectCustomer(c)}
                        style={{
                          padding: '9px 11px', fontSize: 12.5, cursor: 'pointer',
                          borderBottom: '1px solid var(--line-light)',
                          background: String(customerId) === String(c.id) ? 'var(--accent-bg)' : '#fff',
                        }}
                      >
                        <div style={{ fontWeight: 700 }}>{c.name}</div>
                        <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>
                          {c.nic ? `CNIC: ${c.nic}` : 'No CNIC on file'} · {c.mobile_no || 'No mobile'}
                        </div>
                      </div>
                    ))}
                    {hiddenCustomerCount > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--muted)', padding: '7px 10px' }}>
                        +{hiddenCustomerCount} more — keep typing to narrow the results
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="field">
            <label>Sale Date</label>
            <input
              type="date"
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="field">
          <label>Receipt Number</label>
          <input
            value={receiptNo}
            onChange={(e) => setReceiptNo(e.target.value)}
            placeholder="e.g. INV-1001"
            required
          />
        </div>

        <div className="field" style={{ marginTop: 8 }}>
          <label style={{ textTransform: 'none', fontWeight: 700, fontSize: 12 }}>Add Item</label>
          {cartHasVehicle && (
            <p style={{ fontSize: 11, color: 'var(--muted)', margin: '2px 0 0' }}>
              You can add more than one vehicle to this invoice — only spare parts are blocked while a vehicle is in the cart.
            </p>
          )}
        </div>
        <div className="form-row">
          <div className="field" style={{ flex: 3, position: 'relative' }}>
            <input
              type="text"
              value={itemQuery}
              placeholder="Type stock code or title to search…"
              onChange={(e) => {
                setItemQuery(e.target.value);
                setItemToAdd('');
                setShowItemDropdown(true);
              }}
              onFocus={() => {
                // Refetch every time the picker opens — not just on page
                // load — so a stock code edited elsewhere (another tab/page)
                // shows up immediately instead of the stale value from the
                // initial fetch.
                refreshInventory();
                setShowItemDropdown(true);
              }}
              onBlur={() => setTimeout(() => setShowItemDropdown(false), 150)}
              style={{ width: '100%', height: 36, border: '1.5px solid var(--line-light)', borderRadius: 4, padding: '0 10px' }}
            />
            {showItemDropdown && (
              <div
                className="month-picker-panel"
                style={{ width: '100%', maxHeight: 280, overflowY: 'auto', padding: 6 }}
              >
                {filteredAvailableItems.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--muted)', padding: 8 }}>
                    No matching in-stock items.
                  </div>
                )}
                {filteredAvailableItems.map((i) => (
                  <div
                    key={i.id}
                    onMouseDown={() => {
                      setItemToAdd(i.id);
                      setItemQuery(`${i.stock_code} — ${i.title}`);
                      setShowItemDropdown(false);
                    }}
                    style={{
                      padding: '8px 10px',
                      fontSize: 13,
                      cursor: 'pointer',
                      borderRadius: 6,
                      background: String(itemToAdd) === String(i.id) ? 'var(--accent-bg)' : 'transparent',
                    }}
                  >
                    {i.stock_code} — {i.title}{' '}
                    <span style={{ color: 'var(--muted)', fontSize: 11 }}>({i.item_type.replace('_', ' ')})</span>
                  </div>
                ))}
                {hiddenItemCount > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', padding: '6px 8px 2px' }}>
                    +{hiddenItemCount} more — keep typing to narrow it down
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="field" style={{ flex: 1 }}>
            <button type="button" className="btn" style={{ width: '100%' }} onClick={addItemToCart}>Add</button>
          </div>
        </div>

        {cart.length > 0 && (
          <table className="data-table" style={{ marginBottom: 16 }}>
            <thead>
              <tr><th>Item</th><th>Qty</th><th>Purchase Price</th><th>Selling Price</th><th>Line Total</th><th></th></tr>
            </thead>
            <tbody>
              {cart.map((c, idx) => (
                <tr key={c.inventory_item_id}>
                  <td>{c.stock_code} — {c.title}</td>
                  <td style={{ width: 70 }}>
                    <input
                      type="number" min="1" value={c.quantity}
                      disabled={c.item_type !== 'spare_part'}
                      onChange={(e) => updateCartLine(idx, 'quantity', e.target.value)}
                      style={{ width: 60, height: 28 }}
                    />
                  </td>
                  <td style={{ width: 100, color: 'var(--muted)' }}>
                    {Number(c.purchase_price).toLocaleString()}
                  </td>
                  <td style={{ width: 110 }}>
                    <input
                      type="number" step="0.01" value={c.unit_price}
                      onChange={(e) => updateCartLine(idx, 'unit_price', e.target.value)}
                      style={{ width: 100, height: 28 }}
                    />
                  </td>
                  <td>{(Number(c.quantity) * Number(c.unit_price)).toLocaleString()}</td>
                  <td><button type="button" className="btn ghost" onClick={() => removeCartLine(idx)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="form-row">
          <div className="field">
            <label>Discount {!canDiscount && '(manager approval required)'}</label>
            <input
              type="text" inputMode="decimal" value={discount}
              disabled={!canDiscount}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) setDiscount(v);
              }}
            />
          </div>
          <div className="field">
            <label>{saleType === 'net' ? 'Amount Received (full payment)' : 'Advance Received'}</label>
            <input
              type="number" step="0.01" min="0" value={advance}
              disabled={saleType === 'net'}
              className="no-spinner"
              onChange={(e) => setAdvance(e.target.value < 0 ? '0' : e.target.value)}
            />
          </div>
        </div>

        <div className="form-card" style={{ background: 'var(--accent-bg)', border: 'none', marginBottom: 16 }}>
          <div className="form-row">
            <div className="field"><label>Total Cost</label><div>{totalCost.toLocaleString()}</div></div>
            <div className="field"><label>Subtotal (Selling)</label><div>{subtotal.toLocaleString()}</div></div>
            <div className="field"><label>Total (after discount)</label><div>{totalAmount.toLocaleString()}</div></div>
          </div>
          <div className="form-row">
            <div className="field">
              <label>Estimated Profit</label>
              <div style={{ fontWeight: 700, color: estimatedProfit >= 0 ? '#2f6e3d' : 'var(--danger)' }}>
                {estimatedProfit.toLocaleString()}
              </div>
            </div>
            <div className="field">
              <label>Outstanding Balance</label>
              <div style={{ fontWeight: 700, color: outstandingPreview > 0 ? 'var(--danger)' : 'inherit' }}>
                {outstandingPreview.toLocaleString()}
              </div>
            </div>
            <div className="field" />
          </div>
        </div>

        {saleType === 'installment' && (
          <>
            <div className="field">
              <label style={{ textTransform: 'none', fontWeight: 700, fontSize: 12 }}>Installment Plan</label>
            </div>
            {installments.map((inst, idx) => (
              <div className="form-row" key={idx}>
                <div className="field">
                  <input type="date" value={inst.due_date} onChange={(e) => updateInstallment(idx, 'due_date', e.target.value)} />
                </div>
                <div className="field">
                  <input type="number" step="0.01" placeholder="Amount" value={inst.expected_amount} onChange={(e) => updateInstallment(idx, 'expected_amount', e.target.value)} />
                </div>
                <button type="button" className="btn ghost" onClick={() => removeInstallment(idx)}>Remove</button>
              </div>
            ))}
            <button type="button" className="btn" style={{ marginBottom: 16 }} onClick={addInstallmentRow}>+ Add Installment</button>

            {installments.length > 0 && (
              <table className="data-table" style={{ marginBottom: 16 }}>
                <thead>
                  <tr><th>#</th><th>Due Date</th><th>Receiving Amount</th><th>Balance After</th></tr>
                </thead>
                <tbody>
                  {installmentRows.map((row, idx) => (
                    <tr key={idx}>
                      <td>{idx + 1}</td>
                      <td>{row.due_date || '—'}</td>
                      <td>{Number(row.expected_amount || 0).toLocaleString()}</td>
                      <td style={{ color: row.balanceAfter > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
                        {row.balanceAfter > 0 ? row.balanceAfter.toLocaleString() : '✓ Fully Paid'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        <div className="field">
          <label style={{ textTransform: 'none', fontWeight: 700, fontSize: 12 }}>Documents (optional)</label>
          <p style={{ fontSize: 11, color: 'var(--muted)', margin: '2px 0 8px' }}>
            e.g. scanned buyer ID, clearance documents
          </p>
        </div>
        {documents.map((doc, idx) => (
          <div className="form-row" key={idx} style={{ alignItems: 'center' }}>
            <div className="field">
              <input placeholder="Document type (e.g. buyer ID)" value={doc.document_type} onChange={(e) => updateDocument(idx, 'document_type', e.target.value)} />
            </div>
            <div className="field">
              <input
                type="file"
                onChange={(e) => handleDocumentFileChange(idx, e)}
                style={{ fontSize: 11.5, border: 'none', padding: 0 }}
              />
              {uploadingDocIdx === idx && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Uploading…</div>}
              {doc.file_url && uploadingDocIdx !== idx && (
                <div style={{ fontSize: 11, color: '#2f6e3d', marginTop: 4 }}>
                  ✓ Uploaded{doc.file_name ? `: ${doc.file_name}` : ''}
                </div>
              )}
            </div>
            <button type="button" className="btn ghost" onClick={() => removeDocument(idx)}>Remove</button>
          </div>
        ))}
        <button type="button" className="btn" style={{ marginBottom: 16 }} onClick={addDocumentRow}>+ Add Document</button>

        <button className="btn primary" type="submit" disabled={saving}>
          {saving ? 'Finalizing…' : 'Finalize Sale'}
        </button>
      </form>

      {showInstallmentConfirm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.45)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div className="form-card" style={{ maxWidth: 560, width: '92%', maxHeight: '85vh', overflowY: 'auto' }}>
            <h3 style={{ marginTop: 0, marginBottom: 4 }}>Confirm Installment Plan</h3>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
              Review the schedule below before saving this sale.
            </p>
            <table className="data-table" style={{ marginBottom: 16 }}>
              <thead>
                <tr><th>#</th><th>Due Date</th><th>Amount</th><th>Balance After</th></tr>
              </thead>
              <tbody>
                {installmentRows
                  .filter((row) => row.due_date && row.expected_amount)
                  .map((row, idx) => (
                    <tr key={idx}>
                      <td>{idx + 1}</td>
                      <td>{row.due_date}</td>
                      <td>{Number(row.expected_amount || 0).toLocaleString()}</td>
                      <td style={{ color: row.balanceAfter > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
                        {row.balanceAfter > 0 ? row.balanceAfter.toLocaleString() : '✓ Fully Paid'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={editInstallments}>Edit</button>
              <button type="button" className="btn primary" onClick={confirmInstallmentsAndSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}