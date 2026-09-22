import { getToken } from './auth';

const API_BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || 'Request failed.');
  }

  return data;
}

// Same as request(), but attaches the JWT from the current session.
// Use this for every call to a protected (post-login) endpoint.
async function authedRequest(path, options = {}) {
  const token = getToken();

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (data.code === 'DEMO_TRIAL_EXPIRED' || data.demoExpired === true) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');

      window.location.replace('/demo-expired');
      return new Promise(() => {});
    }

    throw new Error(data.error || 'Request failed.');
  }

  return data;
}

// ---- Vendors ----
export function getVendors() {
  return authedRequest('/vendors');
}
export function getVendor(id) {
  return authedRequest(`/vendors/${id}`);
}
export function createVendor(payload) {
  return authedRequest('/vendors', { method: 'POST', body: JSON.stringify(payload) });
}
export function deleteVendor(id) {
  return authedRequest(`/vendors/${id}`, { method: 'DELETE' });
}
export function getVendorTrash(filters = {}) {
  const params = new URLSearchParams(filters).toString();
  return authedRequest(`/vendors/trash${params ? `?${params}` : ''}`);
}
export function restoreVendor(id) {
  return authedRequest(`/vendors/trash/${id}/restore`, { method: 'POST' });
}

// ---- Inventory ----
export function getInventory(filters = {}) {
  const params = new URLSearchParams(filters).toString();
  return authedRequest(`/inventory${params ? `?${params}` : ''}`);
}
export function getInventoryItem(id) {
  return authedRequest(`/inventory/${id}`);
}
export function createInventoryItem(payload) {
  return authedRequest('/inventory', { method: 'POST', body: JSON.stringify(payload) });
}
export function updateInventoryItem(id, payload) {
  return authedRequest(`/inventory/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}
export function createBulkVehicles(payload) {
  return authedRequest('/inventory/bulk-vehicles', { method: 'POST', body: JSON.stringify(payload) });
}
export function deleteInventoryItem(id) {
  return authedRequest(`/inventory/${id}`, { method: 'DELETE' });
}
export function getInventoryTrash(filters = {}) {
  const params = new URLSearchParams(filters).toString();
  return authedRequest(`/inventory/trash${params ? `?${params}` : ''}`);
}
export function restoreInventoryItem(id) {
  return authedRequest(`/inventory/trash/${id}/restore`, { method: 'POST' });
}

// ---- Customers ----
export function getCustomers(filters = {}) {
  const params = new URLSearchParams(filters).toString();
  return authedRequest(`/customers${params ? `?${params}` : ''}`);
}
export function getCustomer(id) {
  return authedRequest(`/customers/${id}`);
}
export function createCustomer(payload) {
  return authedRequest('/customers', { method: 'POST', body: JSON.stringify(payload) });
}
export function updateCustomer(id, payload) {
  return authedRequest(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}
export function addLedgerEntry(customerId, payload) {
  return authedRequest(`/customers/${customerId}/ledger`, { method: 'POST', body: JSON.stringify(payload) });
}
export function deleteLedgerEntry(customerId, entryId) {
  return authedRequest(`/customers/${customerId}/ledger/${entryId}`, { method: 'DELETE' });
}
// Downloads a one-page PDF ledger statement for a customer (print/share).
// Uses raw fetch (like downloadReport) because it needs the auth header
// attached manually before triggering a file save.
export async function downloadCustomerStatement(customerId) {
  const token = getToken();
  const res = await fetch(`/api/customers/${customerId}/statement`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Could not generate statement.');
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="(.+)"/);
  const filename = match ? match[1] : `statement-${customerId}.pdf`;

  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

// ---- Sales ----
export function getSales(filters = {}) {
  const params = new URLSearchParams(filters).toString();
  return authedRequest(`/sales${params ? `?${params}` : ''}`);
}
export function getSale(id) {
  return authedRequest(`/sales/${id}`);
}
export function createSale(payload) {
  return authedRequest('/sales', { method: 'POST', body: JSON.stringify(payload) });
}
export function deleteSale(id) {
  return authedRequest(`/sales/${id}`, { method: 'DELETE' });
}
export function getSalesTrash(filters = {}) {
  const params = new URLSearchParams(filters).toString();
  return authedRequest(`/sales/trash${params ? `?${params}` : ''}`);
}
export function restoreSale(id) {
  return authedRequest(`/sales/trash/${id}/restore`, { method: 'POST' });
}
export function updateInstallmentPlan(saleId, installments) {
  return authedRequest(`/sales/${saleId}/payment-plan`, { method: 'PUT', body: JSON.stringify({ installments }) });
}

// ---- File upload ----
// Uses raw fetch (not the JSON helper) because this sends multipart/form-data.
export async function uploadFile(file) {
  const token = getToken();
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/uploads', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Upload failed.');
  }
  return data.url; // e.g. "/uploads/12345-abcde.jpg"
}

// ---- Payments & Recovery ----
export function getSalePayments(saleId) {
  return authedRequest(`/sales/${saleId}/payments`);
}
export function recordPayment(saleId, payload) {
  return authedRequest(`/sales/${saleId}/payments`, { method: 'POST', body: JSON.stringify(payload) });
}
export function getRecoveryDashboard(filters = {}) {
  const params = new URLSearchParams(filters).toString();
  return authedRequest(`/recovery${params ? `?${params}` : ''}`);
}

// ---- Returns / Cancellations ----
export function getReturns() {
  return authedRequest('/returns');
}
export function createReturn(saleId, payload) {
  return authedRequest(`/sales/${saleId}/return`, { method: 'POST', body: JSON.stringify(payload) });
}

// ---- Expenses ----
export function getExpenses(filters = {}) {
  const params = new URLSearchParams(filters).toString();
  return authedRequest(`/expenses${params ? `?${params}` : ''}`);
}
export function createExpense(payload) {
  return authedRequest('/expenses', { method: 'POST', body: JSON.stringify(payload) });
}
export function approveExpense(id) {
  return authedRequest(`/expenses/${id}/approve`, { method: 'PUT' });
}
export function rejectExpense(id) {
  return authedRequest(`/expenses/${id}/reject`, { method: 'PUT' });
}
export function getMonthlyExpenseSummary(filters = {}) {
  const params = new URLSearchParams(filters).toString();
  return authedRequest(`/expenses/summary/monthly${params ? `?${params}` : ''}`);
}

// ---- Cash Ledger ----
export function getCashbookEntry(date) {
  return authedRequest(`/cashbook?date=${date}`);
}
export function getCashbookHistory() {
  return authedRequest('/cashbook/history');
}
export function saveCashbookEntry(payload) {
  return authedRequest('/cashbook', { method: 'POST', body: JSON.stringify(payload) });
}
export function deleteCashbookEntry(id) {
  return authedRequest(`/cashbook/${id}`, { method: 'DELETE' });
}
export function getCashbookTrash(filters = {}) {
  const params = new URLSearchParams(filters).toString();
  return authedRequest(`/cashbook/trash${params ? `?${params}` : ''}`);
}
export function restoreCashbookEntry(id) {
  return authedRequest(`/cashbook/trash/${id}/restore`, { method: 'POST' });
}

// ---- Reports ----
export function getProfitReport(startDate, endDate, branchId) {
  const params = new URLSearchParams();
  if (startDate && endDate) {
    params.set('start_date', startDate);
    params.set('end_date', endDate);
  }
  if (branchId) params.set('branch_id', branchId);
  const qs = params.toString();
  return authedRequest(`/reports/profit${qs ? `?${qs}` : ''}`);
}
export function getReceivablesReport(filters = {}) {
  const params = new URLSearchParams(filters).toString();
  return authedRequest(`/reports/receivables${params ? `?${params}` : ''}`);
}
export function getCategorySummary(filters = {}) {
  const params = new URLSearchParams(filters).toString();
  return authedRequest(`/reports/category-summary${params ? `?${params}` : ''}`);
}
export function getInventoryValuationReport(filters = {}) {
  const params = new URLSearchParams(filters).toString();
  return authedRequest(`/reports/inventory-valuation${params ? `?${params}` : ''}`);
}
export function getCashFlowReport(startDate, endDate, branchId) {
  const params = new URLSearchParams();
  if (startDate && endDate) {
    params.set('start_date', startDate);
    params.set('end_date', endDate);
  }
  if (branchId) params.set('branch_id', branchId);
  const qs = params.toString();
  return authedRequest(`/reports/cash-flow${qs ? `?${qs}` : ''}`);
}
export function getVendorPurchasesReport(startDate, endDate, branchId) {
  const params = new URLSearchParams();
  if (startDate && endDate) {
    params.set('start_date', startDate);
    params.set('end_date', endDate);
  }
  if (branchId) params.set('branch_id', branchId);
  const qs = params.toString();
  return authedRequest(`/reports/vendor-purchases${qs ? `?${qs}` : ''}`);
}
export function getBranchSummaryReport(startDate, endDate) {
  const params = startDate && endDate ? `?start_date=${startDate}&end_date=${endDate}` : '';
  return authedRequest(`/reports/branch-summary${params}`);
}

// ---- Administration ----
export function getAdminUsers() {
  return authedRequest('/admin/users');
}
export function createAdminUser(payload) {
  return authedRequest('/admin/users', { method: 'POST', body: JSON.stringify(payload) });
}
export function updateAdminUser(id, payload) {
  return authedRequest(`/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}
export function updateUserPassword(id, password) {
  return authedRequest(`/admin/users/${id}/password`, { method: 'PUT', body: JSON.stringify({ password }) });
}
export function getAdminBranches() {
  return authedRequest('/admin/branches');
}
export function createAdminBranch(payload) {
  return authedRequest('/admin/branches', { method: 'POST', body: JSON.stringify(payload) });
}
export function updateAdminBranch(id, payload) {
  return authedRequest(`/admin/branches/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

// ---- Demo Clients ----

export function getDemoClients() {
  return authedRequest('/admin/demo-clients');
}

export function createDemoClient(payload) {
  return authedRequest('/admin/demo-clients', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function extendDemoTrial(id, days = 3) {
  return authedRequest(`/admin/demo-clients/${id}/extend`, {
    method: 'POST',
    body: JSON.stringify({ days }),
  });
}

export function updateDemoClientStatus(id, isActive) {
  return authedRequest(`/admin/demo-clients/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ is_active: isActive }),
  });
}

export function getAuditLog() {
  return authedRequest('/admin/audit-log');
}

// ---- Export (PDF / Excel downloads) ----
// Downloads require the auth header, so a plain <a href> won't work —
// fetch the file as a blob and trigger the save via a temporary link.
export async function downloadReport({ report, format, period, date, branch_id }) {
  const token = getToken();
  const params = new URLSearchParams({ report, format, period, date });
  if (branch_id) params.set('branch_id', branch_id);

  const res = await fetch(`/api/export?${params.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Download failed.');
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="(.+)"/);
  const filename = match ? match[1] : `${report}.${format}`;

  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export function getBranches() {
  return request('/branches');
}

export function branchLogin(branchId, username, password) {
  return request('/login', {
    method: 'POST',
    body: JSON.stringify({ branch_id: branchId, username, password }),
  });
}

export function forgotPassword(branchId, username) {
  return request('/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ branch_id: branchId, username }),
  });
}

export function superAdminLogin(username, password) {
  return request('/super-admin-login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export function logoutApi() {
  const token = getToken();
  return fetch('/api/auth/logout', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }).catch(() => {}); // best-effort; don't block logout if this fails
}