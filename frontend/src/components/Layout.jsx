import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { getUser, clearSession } from '../auth';
import { logoutApi } from '../api';

const NAV_GROUPS = [
  {
    label: 'Overview',
    links: [
      { to: '/dashboard', label: 'Dashboard' },
    ],
  },
  {
    label: 'Inventory',
    links: [
      { to: '/inventory', label: 'Inventory List' },
      { to: '/stock', label: 'Stock' },
      { to: '/vendors', label: 'Vendors' },
    ],
  },
  {
    label: 'Customers',
    links: [
      { to: '/customers', label: 'Customer List' },
      { to: '/ledger', label: 'Ledger' },
    ],
  },
  {
    label: 'Sales',
    links: [
      { to: '/sales', label: 'Sales List' },
      { to: '/sales/new', label: 'New Sale' },
    ],
  },
  {
    label: 'Recovery',
    links: [
      { to: '/recovery', label: 'Recovery Dashboard' },
    ],
  },
  {
    label: 'Returns',
    links: [
      { to: '/returns', label: 'Returns / Cancellations' },
    ],
  },
  {
    label: 'Expenses',
    links: [
      { to: '/expenses', label: 'Daily Expenses' },
    ],
  },
  {
    label: 'Cash Ledger',
    links: [
      { to: '/cashbook', label: 'Daily Cashbook' },
    ],
  },
  {
    label: 'Reports',
    links: [
      { to: '/reports', label: 'All Reports' },
    ],
  },
  {
    label: 'Administration',
    roles: ['super_admin'],
    links: [
      { to: '/admin', label: 'Users & Branches' },
    ],
  },
];

export default function Layout({ children }) {
  const navigate = useNavigate();
  const user = getUser();

  // Desktop:
  // false = full sidebar
  // true  = icon-only sidebar
  const [collapsed, setCollapsed] = useState(false);

  // Mobile:
  // false = sidebar closed
  // true = sidebar open
  const [mobileOpen, setMobileOpen] = useState(false);

  function toggleSidebar() {
    setCollapsed((value) => !value);
  }

  function toggleMobileSidebar() {
    setMobileOpen((value) => !value);
  }

  function closeMobileSidebar() {
    setMobileOpen(false);
  }

  function handleLogout() {
    logoutApi();
    clearSession();
    navigate('/');
  }

  return (
    <div
      className={[
        'app-shell',
        collapsed ? 'sidebar-collapsed' : '',
        mobileOpen ? 'mobile-sidebar-open' : '',
      ].join(' ').trim()}
    >

      {/* Mobile backdrop */}
      <div
        className="sidebar-backdrop"
        onClick={closeMobileSidebar}
        aria-hidden="true"
      />

      {/* Mobile menu button */}
      <button
        type="button"
        className="mobile-menu-button"
        onClick={toggleMobileSidebar}
        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
      >
        {mobileOpen ? '×' : '☰'}
      </button>

      {/* ================= SIDEBAR ================= */}
      <aside className="app-sidebar">

        {/* Sidebar Header */}
        <div className="sidebar-header">

          <div className="sidebar-brand-wrap">

            {collapsed ? (
              <div className="sidebar-logo">
                DMS
              </div>
            ) : (
              <div className="sidebar-brand">
                <div className="sidebar-brand-title">
                  Demo ERP
                </div>

                <div className="sidebar-branch-name">
                  {user?.branchName || 'YAZMAN MOTORS'}
                </div>
              </div>
            )}

          </div>

          {/* Desktop collapse button */}
          <button
            type="button"
            className="sidebar-toggle"
            onClick={toggleSidebar}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? '→' : '←'}
          </button>

          {/* Mobile close button */}
          <button
            type="button"
            className="mobile-sidebar-close"
            onClick={closeMobileSidebar}
            aria-label="Close sidebar"
          >
            ×
          </button>

        </div>

        {/* ================= NAVIGATION ================= */}
        <div className="app-nav-scroll">

          {NAV_GROUPS
            .filter(
              (group) =>
                !group.roles ||
                group.roles.includes(user?.role)
            )
            .map((group) => (

              <div
                className="app-nav-group"
                key={group.label}
              >

                {!collapsed && (
                  <div className="app-nav-group-label">
                    {group.label}
                  </div>
                )}

                {group.links.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    end={link.to === '/sales'}
                    title={collapsed ? link.label : undefined}
                    onClick={closeMobileSidebar}
                    className={({ isActive }) =>
                      `app-nav-link${isActive ? ' active' : ''}`
                    }
                  >

                    <span className="nav-icon">
                      {getNavIcon(link.label)}
                    </span>

                    {!collapsed && (
                      <span className="nav-label">
                        {link.label}
                      </span>
                    )}

                  </NavLink>
                ))}

              </div>
            ))}

        </div>

        {/* ================= FOOTER ================= */}
        <div className="app-sidebar-footer">

          {collapsed ? (
            <div className="sidebar-footer-collapsed">

              <div
                className="collapsed-user"
                title={user?.name || 'User'}
              >
                {(user?.name || 'U')
                  .charAt(0)
                  .toUpperCase()}
              </div>

              <button
                type="button"
                className="sidebar-logout collapsed-logout"
                onClick={handleLogout}
                title="Log out"
                aria-label="Log out"
              >
                ↪
              </button>

            </div>
          ) : (
            <div className="sidebar-footer-expanded">

              <div className="sidebar-user-name">
                {user?.name || 'User'}
              </div>

              <div className="sidebar-user-role">
                {user?.role || ''}
              </div>

              <button
                type="button"
                className="sidebar-logout"
                onClick={handleLogout}
              >
                Log out
              </button>

            </div>
          )}

        </div>

      </aside>

      {/* ================= MAIN ================= */}
      <main className="app-main">
        {children}
      </main>

    </div>
  );
}


/* =====================================================
   COLLAPSED SIDEBAR ICONS
===================================================== */

function getNavIcon(label) {
  const icons = {
    'Dashboard': '⌂',
    'Inventory List': '▣',
    'Stock': '⬒',
    'Vendors': '♙',
    'Customer List': '♙',
    'Ledger': '▤',
    'Sales List': '▰',
    'New Sale': '+',
    'Recovery Dashboard': '↻',
    'Returns / Cancellations': '↩',
    'Daily Expenses': '₹',
    'Daily Cashbook': '▤',
    'All Reports': '▥',
    'Users & Branches': '⚙',
  };

  return icons[label] || '•';
}
