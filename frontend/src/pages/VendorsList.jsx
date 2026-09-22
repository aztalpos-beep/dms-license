import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import {
  getVendors,
  createVendor,
  deleteVendor,
} from '../api.js';

export default function VendorsList() {
  const navigate = useNavigate();

  const [vendors, setVendors] = useState([]);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  const [saving, setSaving] = useState(false);

  function load() {
    setError('');

    getVendors()
      .then(setVendors)
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();

    setSaving(true);
    setError('');

    try {
      await createVendor({
        name,
        phone,
        address,
      });

      setName('');
      setPhone('');
      setAddress('');
      setShowForm(false);

      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(e, vendor) {
    e.preventDefault();
    e.stopPropagation();

    const confirmed = window.confirm(
      `Delete vendor "${vendor.name}"?\n\n` +
      `This vendor will be moved to Trash for 3 days. ` +
      `The database record will not be physically deleted.`
    );

    if (!confirmed) return;

    try {
      setError('');

      await deleteVendor(vendor.id);

      load();
    } catch (err) {
      // If the backend rejects this (e.g. insufficient role), the error
      // message from the API is shown here — authorization is enforced
      // server-side, not by hiding the button on the frontend.
      setError(err.message);
    }
  }

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>Vendors</h2>
          <p>
            Suppliers linked to purchases in this branch.
          </p>
        </div>

        <button
          className="btn primary"
          onClick={() => setShowForm((s) => !s)}
        >
          {showForm ? 'Cancel' : '+ Add Vendor'}
        </button>
      </div>

      {error && (
        <div
          className="login-error"
          style={{ maxWidth: 500 }}
        >
          {error}
        </div>
      )}

      {showForm && (
        <form
          className="form-card"
          onSubmit={handleSubmit}
          style={{ marginBottom: 20 }}
        >
          <div className="form-row">
            <div className="field">
              <label>Name</label>
              <input
                value={name}
                onChange={(e) =>
                  setName(e.target.value)
                }
                required
              />
            </div>

            <div className="field">
              <label>Phone</label>
              <input
                value={phone}
                onChange={(e) =>
                  setPhone(e.target.value)
                }
              />
            </div>
          </div>

          <div className="field">
            <label>Address</label>
            <input
              value={address}
              onChange={(e) =>
                setAddress(e.target.value)
              }
            />
          </div>

          <button
            className="btn primary"
            type="submit"
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save Vendor'}
          </button>
        </form>
      )}

      {vendors.length === 0 ? (
        <div className="empty-state">
          No vendors yet.
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Address</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {vendors.map((v) => (
                <tr
                  key={v.id}
                  onClick={() =>
                    navigate(`/vendors/${v.id}`)
                  }
                  style={{ cursor: 'pointer' }}
                >
                  <td>{v.name}</td>

                  <td>
                    {v.phone || '—'}
                  </td>

                  <td>
                    {v.address || '—'}
                  </td>

                  <td
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    <button
                      type="button"
                      className="btn ghost"
                      style={{
                        padding: '5px 12px',
                        fontSize: 11,
                        color: '#dc2626',
                        border: '1px solid rgba(220, 38, 38, 0.35)',
                        background: '#fff',
                        cursor: 'pointer',
                        display: 'inline-block',
                        visibility: 'visible',
                        opacity: 1,
                      }}
                      onClick={(e) =>
                        handleDelete(e, v)
                      }
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
