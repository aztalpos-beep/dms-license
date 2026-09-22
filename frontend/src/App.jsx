import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing.jsx';
import BranchLogin from './pages/BranchLogin.jsx';
import SuperAdminLogin from './pages/SuperAdminLogin.jsx';
import DashboardPlaceholder from './pages/DashboardPlaceholder.jsx';
import InventoryList from './pages/InventoryList.jsx';
import InventoryForm from './pages/InventoryForm.jsx';
import BulkVehicleForm from './pages/BulkVehicleForm.jsx';
import InventoryDetail from './pages/InventoryDetail.jsx';
import StockPage from './pages/StockPage.jsx';
import VendorsList from './pages/VendorsList.jsx';
import VendorDetail from './pages/VendorDetail.jsx';
import CustomersList from './pages/CustomersList.jsx';
import CustomerProfile from './pages/CustomerProfile.jsx';
import LedgerPage from './pages/LedgerPage.jsx';
import SalesList from './pages/SalesList.jsx';
import NewSaleWizard from './pages/NewSaleWizard.jsx';
import SaleDetail from './pages/SaleDetail.jsx';
import RecoveryDashboard from './pages/RecoveryDashboard.jsx';
import ReturnsList from './pages/ReturnsList.jsx';
import ExpensesPage from './pages/ExpensesPage.jsx';
import CashbookPage from './pages/CashbookPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import AdminPage from './pages/AdminPage.jsx';

export default function App() {
  // Browser tab title
  useEffect(() => {
    document.title = 'Demo ERP';
  }, []);

  // Global fix: disable the browser's default Up/Down-arrow-key behavior
  // on every <input type="number"> across the entire app. Without this,
  // pressing Up/Down while a number field is focused silently increments
  // or decrements the value by 1 — easy to trigger by accident (e.g. while
  // tabbing/navigating with the keyboard) and it produces confusing values
  // in amount fields. The visual spinner arrows are already hidden via
  // global.css; this removes the keyboard shortcut too, everywhere, so no
  // individual page needs its own fix.
  useEffect(() => {
    function blockNumberArrowKeys(e) {
      if (
        (e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
        e.target instanceof HTMLInputElement &&
        e.target.type === 'number'
      ) {
        e.preventDefault();
      }
    }
    window.addEventListener('keydown', blockNumberArrowKeys);
    return () => window.removeEventListener('keydown', blockNumberArrowKeys);
  }, []);

  // Same problem via mouse: scrolling the page while the cursor happens to
  // be over a focused number field silently changes its value (by the
  // field's `step`, e.g. 0.01), producing odd decimal-heavy numbers.
  // Blurring the field the instant a wheel event reaches it stops the
  // browser from applying that change, without blocking normal page
  // scrolling.
  useEffect(() => {
    function blurNumberOnWheel(e) {
      if (e.target instanceof HTMLInputElement && e.target.type === 'number') {
        e.target.blur();
      }
    }
    window.addEventListener('wheel', blurNumberOnWheel, { passive: true });
    return () => window.removeEventListener('wheel', blurNumberOnWheel);
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login/:branchId" element={<BranchLogin />} />
        <Route path="/admin-login" element={<SuperAdminLogin />} />
        <Route path="/dashboard" element={<DashboardPlaceholder />} />
        <Route path="/inventory" element={<InventoryList />} />
        <Route path="/inventory/new" element={<InventoryForm />} />
        <Route path="/inventory/bulk-vehicles" element={<BulkVehicleForm />} />
        <Route path="/inventory/:id" element={<InventoryDetail />} />
        <Route path="/inventory/:id/edit" element={<InventoryForm />} />
        <Route path="/stock" element={<StockPage />} />
        <Route path="/vendors" element={<VendorsList />} />
        <Route path="/vendors/:id" element={<VendorDetail />} />
        <Route path="/customers" element={<CustomersList />} />
        <Route path="/customers/:id" element={<CustomerProfile />} />
        <Route path="/ledger" element={<LedgerPage />} />
        <Route path="/sales" element={<SalesList />} />
        <Route path="/sales/new" element={<NewSaleWizard />} />
        <Route path="/sales/:id" element={<SaleDetail />} />
        <Route path="/recovery" element={<RecoveryDashboard />} />
        <Route path="/returns" element={<ReturnsList />} />
        <Route path="/expenses" element={<ExpensesPage />} />
        <Route path="/cashbook" element={<CashbookPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </BrowserRouter>
  );
}