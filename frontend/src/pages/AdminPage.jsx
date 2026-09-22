import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import {
  getAdminUsers,
  createAdminUser,
  updateAdminUser,
  updateUserPassword,
  getAdminBranches,
  createAdminBranch,
  getAuditLog,
} from '../api.js';
import { getUser } from '../auth.js';

const ROLES = ['manager', 'sales_staff', 'accountant', 'admin'];

const TABS = [
  { key: 'users', label: 'Users & Roles' },
  { key: 'branches', label: 'Branches' },
  { key: 'audit', label: 'Audit Log' },
];

function EyeIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
      <path d="M9.9 4.2A10.5 10.5 0 0 1 12 4c5.5 0 9 5 9 8a8.7 8.7 0 0 1-2 3.5" />
      <path d="M6.6 6.6C4.4 8 3 10.2 3 12c0 3 3.5 8 9 8a10 10 0 0 0 5.4-1.6" />
    </svg>
  );
}

export default function AdminPage() {
  const currentUser = getUser();
  const isSuperAdmin = currentUser.role === 'super_admin';

  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [auditRows, setAuditRows] = useState([]);
  const [error, setError] = useState('');

  const [showUserForm, setShowUserForm] = useState(false);
  const [userForm, setUserForm] = useState({
    name: '',
    username: '',
    password: '',
    role: 'sales_staff',
    branch_id: '',
  });
  const [savingUser, setSavingUser] = useState(false);
  const [showCreatePassword, setShowCreatePassword] = useState(false);

  const [passwordUserId, setPasswordUserId] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');

  const [showBranchForm, setShowBranchForm] = useState(false);
  const [branchForm, setBranchForm] = useState({
    name: '',
    location: '',
  });
  const [savingBranch, setSavingBranch] = useState(false);

  function loadUsers() {
    getAdminUsers()
      .then(setUsers)
      .catch((err) => setError(err.message));
  }

  function loadBranches() {
    getAdminBranches()
      .then(setBranches)
      .catch((err) => setError(err.message));
  }

  function loadAudit() {
    getAuditLog()
      .then(setAuditRows)
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    setError('');

    if (tab === 'users') {
      loadUsers();
      loadBranches();
    }

    if (tab === 'branches') {
      loadBranches();
    }

    if (tab === 'audit') {
      loadAudit();
    }
  }, [tab]);

  async function handleCreateUser(e) {
    e.preventDefault();
    setSavingUser(true);
    setError('');

    try {
      await createAdminUser(userForm);

      setUserForm({
        name: '',
        username: '',
        password: '',
        role: 'sales_staff',
        branch_id: '',
      });

      setShowCreatePassword(false);
      setShowUserForm(false);
      loadUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingUser(false);
    }
  }

  async function handleToggleActive(u) {
    try {
      await updateAdminUser(u.id, {
        is_active: !u.is_active,
      });

      loadUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  function openPasswordForm(u) {
    setPasswordUserId(
      passwordUserId === u.id ? null : u.id
    );

    setNewPassword('');
    setShowNewPassword(false);
    setPasswordMessage('');
  }

  async function handleChangePassword(e, userId) {
    e.preventDefault();
    setSavingPassword(true);
    setPasswordMessage('');

    try {
      await updateUserPassword(userId, newPassword);

      setPasswordMessage(
        'Password updated successfully.'
      );

      setNewPassword('');
      setShowNewPassword(false);
    } catch (err) {
      setPasswordMessage(err.message);
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleCreateBranch(e) {
    e.preventDefault();
    setSavingBranch(true);
    setError('');

    try {
      await createAdminBranch(branchForm);

      setBranchForm({
        name: '',
        location: '',
      });

      setShowBranchForm(false);
      loadBranches();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingBranch(false);
    }
  }

  const passwordWrapperStyle = {
    position: 'relative',
    width: '100%',
  };

  const passwordInputStyle = {
    width: '100%',
    paddingRight: 46,
  };

  const passwordButtonStyle = {
    position: 'absolute',
    right: 10,
    top: '50%',
    transform: 'translateY(-50%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    padding: 0,
    border: 'none',
    borderRadius: 6,
    background: 'transparent',
    color: '#64748b',
    cursor: 'pointer',
  };

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>Administration</h2>
          <p>User roles, branch management, and audit trail.</p>
        </div>
      </div>

      <div className="filter-bar">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? 'btn primary' : 'btn'}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div
          className="login-error"
          style={{ maxWidth: 640 }}
        >
          {error}
        </div>
      )}

      {tab === 'users' && (
        <>
          <div
            className="page-header"
            style={{
              border: 'none',
              marginBottom: 12,
            }}
          >
            <div />

            <button
              className="btn primary"
              onClick={() => {
                setShowUserForm((s) => !s);
                setShowCreatePassword(false);
              }}
            >
              {showUserForm ? 'Cancel' : '+ Add User'}
            </button>
          </div>

          {showUserForm && (
            <form
              className="form-card"
              onSubmit={handleCreateUser}
              style={{ marginBottom: 20 }}
            >
              <div className="form-row">
                <div className="field">
                  <label>Name</label>

                  <input
                    value={userForm.name}
                    onChange={(e) =>
                      setUserForm({
                        ...userForm,
                        name: e.target.value,
                      })
                    }
                    required
                  />
                </div>

                <div className="field">
                  <label>Username</label>

                  <input
                    value={userForm.username}
                    onChange={(e) =>
                      setUserForm({
                        ...userForm,
                        username: e.target.value,
                      })
                    }
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="field">
                  <label>Password</label>

                  <div style={passwordWrapperStyle}>
                    <input
                      type={
                        showCreatePassword
                          ? 'text'
                          : 'password'
                      }
                      value={userForm.password}
                      onChange={(e) =>
                        setUserForm({
                          ...userForm,
                          password: e.target.value,
                        })
                      }
                      autoComplete="new-password"
                      required
                      style={passwordInputStyle}
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setShowCreatePassword(
                          (current) => !current
                        )
                      }
                      aria-label={
                        showCreatePassword
                          ? 'Hide password'
                          : 'Show password'
                      }
                      title={
                        showCreatePassword
                          ? 'Hide password'
                          : 'Show password'
                      }
                      style={passwordButtonStyle}
                    >
                      {showCreatePassword ? (
                        <EyeOffIcon />
                      ) : (
                        <EyeIcon />
                      )}
                    </button>
                  </div>
                </div>

                <div className="field">
                  <label>Role</label>

                  <select
                    value={userForm.role}
                    onChange={(e) =>
                      setUserForm({
                        ...userForm,
                        role: e.target.value,
                      })
                    }
                    style={{
                      width: '100%',
                      height: 36,
                      border:
                        '1.5px solid var(--line-light)',
                      borderRadius: 4,
                      padding: '0 10px',
                    }}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r.replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {isSuperAdmin && (
                <div className="field">
                  <label>Branch</label>

                  <select
                    value={userForm.branch_id}
                    onChange={(e) =>
                      setUserForm({
                        ...userForm,
                        branch_id: e.target.value,
                      })
                    }
                    style={{
                      width: '100%',
                      height: 36,
                      border:
                        '1.5px solid var(--line-light)',
                      borderRadius: 4,
                      padding: '0 10px',
                    }}
                    required
                  >
                    <option value="">
                      — Select branch —
                    </option>

                    {branches.map((b) => (
                      <option
                        key={b.id}
                        value={b.id}
                      >
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                className="btn primary"
                type="submit"
                disabled={savingUser}
              >
                {savingUser
                  ? 'Creating…'
                  : 'Create User'}
              </button>
            </form>
          )}

          {users.length === 0 ? (
            <div className="empty-state">
              No users found.
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Branch ID</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>

              <tbody>
                {users.map((u) => (
                  <React.Fragment key={u.id}>
                    <tr>
                      <td>{u.name}</td>

                      <td className="num">
                        {u.username}
                      </td>

                      <td
                        style={{
                          textTransform: 'capitalize',
                        }}
                      >
                        {u.role.replace('_', ' ')}
                      </td>

                      <td>
                        {u.branch_id ?? 'ALL'}
                      </td>

                      <td>
                        <span
                          className={`badge ${
                            u.is_active
                              ? 'in_stock'
                              : 'returned'
                          }`}
                        >
                          {u.is_active
                            ? 'active'
                            : 'inactive'}
                        </span>
                      </td>

                      <td>
                        <button
                          className="btn ghost"
                          style={{
                            padding: '4px 8px',
                            fontSize: 11,
                          }}
                          onClick={() =>
                            handleToggleActive(u)
                          }
                        >
                          {u.is_active
                            ? 'Deactivate'
                            : 'Activate'}
                        </button>{' '}

                        <button
                          className="btn ghost"
                          style={{
                            padding: '4px 8px',
                            fontSize: 11,
                          }}
                          onClick={() =>
                            openPasswordForm(u)
                          }
                        >
                          {passwordUserId === u.id
                            ? 'Cancel'
                            : 'Change Password'}
                        </button>
                      </td>
                    </tr>

                    {passwordUserId === u.id && (
                      <tr>
                        <td colSpan={6}>
                          <form
                            className="form-card"
                            style={{
                              margin: '8px 0',
                            }}
                            onSubmit={(e) =>
                              handleChangePassword(
                                e,
                                u.id
                              )
                            }
                          >
                            <div
                              className="form-row"
                              style={{
                                alignItems: 'flex-end',
                              }}
                            >
                              <div className="field">
                                <label>
                                  New Password for {u.name}
                                </label>

                                <div
                                  style={
                                    passwordWrapperStyle
                                  }
                                >
                                  <input
                                    type={
                                      showNewPassword
                                        ? 'text'
                                        : 'password'
                                    }
                                    value={newPassword}
                                    onChange={(e) =>
                                      setNewPassword(
                                        e.target.value
                                      )
                                    }
                                    autoComplete="new-password"
                                    minLength={6}
                                    required
                                    style={
                                      passwordInputStyle
                                    }
                                  />

                                  <button
                                    type="button"
                                    onClick={() =>
                                      setShowNewPassword(
                                        (current) =>
                                          !current
                                      )
                                    }
                                    aria-label={
                                      showNewPassword
                                        ? 'Hide password'
                                        : 'Show password'
                                    }
                                    title={
                                      showNewPassword
                                        ? 'Hide password'
                                        : 'Show password'
                                    }
                                    style={
                                      passwordButtonStyle
                                    }
                                  >
                                    {showNewPassword ? (
                                      <EyeOffIcon />
                                    ) : (
                                      <EyeIcon />
                                    )}
                                  </button>
                                </div>
                              </div>

                              <button
                                className="btn primary"
                                type="submit"
                                disabled={savingPassword}
                              >
                                {savingPassword
                                  ? 'Saving…'
                                  : 'Save Password'}
                              </button>
                            </div>

                            {passwordMessage && (
                              <div
                                style={{
                                  marginTop: 8,
                                  fontSize: 12,
                                }}
                              >
                                {passwordMessage}
                              </div>
                            )}
                          </form>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {tab === 'branches' && (
        <>
          {isSuperAdmin && (
            <div
              className="page-header"
              style={{
                border: 'none',
                marginBottom: 12,
              }}
            >
              <div />

              <button
                className="btn primary"
                onClick={() =>
                  setShowBranchForm((s) => !s)
                }
              >
                {showBranchForm
                  ? 'Cancel'
                  : '+ Add Branch'}
              </button>
            </div>
          )}

          {showBranchForm && (
            <form
              className="form-card"
              onSubmit={handleCreateBranch}
              style={{ marginBottom: 20 }}
            >
              <div className="form-row">
                <div className="field">
                  <label>Name</label>

                  <input
                    value={branchForm.name}
                    onChange={(e) =>
                      setBranchForm({
                        ...branchForm,
                        name: e.target.value,
                      })
                    }
                    required
                  />
                </div>

                <div className="field">
                  <label>Location</label>

                  <input
                    value={branchForm.location}
                    onChange={(e) =>
                      setBranchForm({
                        ...branchForm,
                        location: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <button
                className="btn primary"
                type="submit"
                disabled={savingBranch}
              >
                {savingBranch
                  ? 'Creating…'
                  : 'Create Branch'}
              </button>
            </form>
          )}

          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Location</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {branches.map((b) => (
                <tr key={b.id}>
                  <td>{b.name}</td>

                  <td>{b.location || '—'}</td>

                  <td>
                    <span
                      className={`badge ${
                        b.is_active
                          ? 'in_stock'
                          : 'returned'
                      }`}
                    >
                      {b.is_active
                        ? 'active'
                        : 'inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {tab === 'audit' && (
        <>
          {(() => {
            const loginLogoutRows =
              auditRows.filter(
                (r) =>
                  r.action === 'login' ||
                  r.action === 'logout'
              );

            const byUser = {};

            loginLogoutRows.forEach((r) => {
              const key =
                r.user_name || 'Unknown';

              if (!byUser[key]) {
                byUser[key] = {
                  lastLogin: null,
                  lastLogout: null,
                };
              }

              if (
                r.action === 'login' &&
                !byUser[key].lastLogin
              ) {
                byUser[key].lastLogin =
                  r.created_at;
              }

              if (
                r.action === 'logout' &&
                !byUser[key].lastLogout
              ) {
                byUser[key].lastLogout =
                  r.created_at;
              }
            });

            const summaryEntries =
              Object.entries(byUser);

            if (summaryEntries.length === 0) {
              return null;
            }

            return (
              <>
                <div
                  className="page-header"
                  style={{
                    border: 'none',
                    marginBottom: 8,
                  }}
                >
                  <h2 style={{ fontSize: 14 }}>
                    User Activity — Last Login / Logout
                  </h2>
                </div>

                <table
                  className="data-table"
                  style={{ marginBottom: 24 }}
                >
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Last Login</th>
                      <th>Last Logout</th>
                    </tr>
                  </thead>

                  <tbody>
                    {summaryEntries.map(
                      ([name, times]) => (
                        <tr key={name}>
                          <td>{name}</td>

                          <td className="num">
                            {times.lastLogin
                              ? new Date(
                                  times.lastLogin
                                ).toLocaleString()
                              : '—'}
                          </td>

                          <td className="num">
                            {times.lastLogout
                              ? new Date(
                                  times.lastLogout
                                ).toLocaleString()
                              : '—'}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </>
            );
          })()}

          <div
            className="page-header"
            style={{
              border: 'none',
              marginBottom: 8,
            }}
          >
            <h2 style={{ fontSize: 14 }}>
              Full Activity Log
            </h2>
          </div>

          {auditRows.length === 0 ? (
            <div className="empty-state">
              No audit entries yet.
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Entity</th>
                </tr>
              </thead>

              <tbody>
                {auditRows.map((r) => (
                  <tr key={r.id}>
                    <td className="num">
                      {new Date(
                        r.created_at
                      ).toLocaleString()}
                    </td>

                    <td>
                      {r.user_name || '—'}
                    </td>

                    <td
                      style={{
                        textTransform: 'capitalize',
                      }}
                    >
                      {r.action.replace('_', ' ')}
                    </td>

                    <td>
                      {r.entity_type
                        ? `${r.entity_type} #${r.entity_id}`
                        : '—'}
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