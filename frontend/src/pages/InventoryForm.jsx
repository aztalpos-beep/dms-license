import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { getVendors, createInventoryItem, updateInventoryItem, getInventoryItem } from '../api.js';
import { getUser } from '../auth.js';

const emptyVehicleDetails = { engine_no: '', chassis_no: '', registration_no: '', model: '', variant: '', color: '' };
const emptySparePartDetails = { part_no: '', brand: '', unit_type: '', quantity_on_hand: 0, reorder_level: 0 };

export default function InventoryForm() {
  const { id } = useParams(); // present only in edit mode
  const isEdit = !!id;
  const navigate = useNavigate();
  const user = getUser();

  const [itemType, setItemType] = useState('car');
  const [stockCode, setStockCode] = useState('');
  const [title, setTitle] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [status, setStatus] = useState('in_stock');
  const [vehicleDetails, setVehicleDetails] = useState(emptyVehicleDetails);
  const [sparePartDetails, setSparePartDetails] = useState(emptySparePartDetails);
  const [vendors, setVendors] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getVendors().then(setVendors).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    getInventoryItem(id).then((item) => {
      setItemType(item.item_type);
      setStockCode(item.stock_code);
      setTitle(item.title);
      setVendorId(item.vendor_id || '');
      setPurchasePrice(item.purchase_price);
      setPurchaseDate(item.purchase_date?.slice(0, 10) || '');
      setStatus(item.status);
      if (item.item_type === 'spare_part') {
        setSparePartDetails({
          part_no: item.part_no || '',
          brand: item.brand || '',
          unit_type: item.unit_type || '',
          quantity_on_hand: item.quantity_on_hand ?? 0,
          reorder_level: item.reorder_level ?? 0,
        });
      } else {
        setVehicleDetails({
          engine_no: item.engine_no || '',
          chassis_no: item.chassis_no || '',
          registration_no: item.registration_no || '',
          model: item.model || '',
          variant: item.variant || '',
          color: item.color || '',
        });
      }
    }).catch((err) => setError(err.message));
  }, [id, isEdit]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);

    const payload = {
      item_type: itemType,
      stock_code: stockCode,
      title,
      vendor_id: vendorId || null,
      purchase_price: purchasePrice,
      purchase_date: purchaseDate,
      status,
      vehicle_details: itemType !== 'spare_part' ? vehicleDetails : undefined,
      spare_part_details: itemType === 'spare_part' ? sparePartDetails : undefined,
    };

    if (user.role === 'super_admin') {
      payload.branch_id = user.branchId; // super_admin has none by default; left for a future branch-picker
    }

    try {
      if (isEdit) {
        await updateInventoryItem(id, payload);
        navigate(`/inventory/${id}`);
      } else {
        const created = await createInventoryItem(payload);
        navigate(`/inventory/${created.id}`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>{isEdit ? 'Edit Item' : 'Add Inventory Item'}</h2>
          <p>Shared inventory record — fields adapt to the item type.</p>
        </div>
      </div>

      {error && <div className="login-error" style={{ maxWidth: 640 }}>{error}</div>}

      <form className="form-card" onSubmit={handleSubmit}>
        <div className="field">
          <label>Item Type</label>
          <select
            value={itemType}
            onChange={(e) => setItemType(e.target.value)}
            disabled={isEdit}
            style={{ width: '100%', height: 36, border: '1.5px solid var(--line-light)', borderRadius: 4, padding: '0 10px' }}
          >
            <option value="car">Car</option>
            <option value="tractor">Tractor</option>
            <option value="spare_part">Spare Part</option>
          </select>
        </div>

        <div className="form-row">
          <div className="field">
            <label>Stock Code</label>
            <input value={stockCode} onChange={(e) => setStockCode(e.target.value)} required />
          </div>
          <div className="field">
            <label>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
        </div>

        <div className="form-row">
          <div className="field">
            <label>Vendor</label>
            <select
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              style={{ width: '100%', height: 36, border: '1.5px solid var(--line-light)', borderRadius: 4, padding: '0 10px' }}
            >
              <option value="">— None —</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Purchase Price</label>
            <input type="number" step="0.01" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} required />
          </div>
        </div>

        <div className="form-row">
          <div className="field">
            <label>Purchase Date</label>
            <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} required />
          </div>
          <div className="field">
            <label>Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{ width: '100%', height: 36, border: '1.5px solid var(--line-light)', borderRadius: 4, padding: '0 10px' }}
            >
              <option value="in_stock">In Stock</option>
              <option value="reserved">Reserved</option>
              <option value="sold">Sold</option>
              <option value="returned">Returned</option>
            </select>
          </div>
        </div>

        {itemType !== 'spare_part' ? (
          <>
            <div className="field" style={{ marginTop: 4 }}>
              <label style={{ textTransform: 'none', fontWeight: 700, fontSize: 12 }}>Vehicle Details</label>
            </div>
            <div className="form-row">
              <div className="field">
                <label>Engine No</label>
                <input value={vehicleDetails.engine_no} onChange={(e) => setVehicleDetails({ ...vehicleDetails, engine_no: e.target.value })} />
              </div>
              <div className="field">
                <label>Chassis No</label>
                <input value={vehicleDetails.chassis_no} onChange={(e) => setVehicleDetails({ ...vehicleDetails, chassis_no: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label>Registration No</label>
                <input value={vehicleDetails.registration_no} onChange={(e) => setVehicleDetails({ ...vehicleDetails, registration_no: e.target.value })} />
              </div>
              <div className="field">
                <label>Model</label>
                <input value={vehicleDetails.model} onChange={(e) => setVehicleDetails({ ...vehicleDetails, model: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label>Variant</label>
                <input value={vehicleDetails.variant} onChange={(e) => setVehicleDetails({ ...vehicleDetails, variant: e.target.value })} />
              </div>
              <div className="field">
                <label>Color</label>
                <input value={vehicleDetails.color} onChange={(e) => setVehicleDetails({ ...vehicleDetails, color: e.target.value })} />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="field" style={{ marginTop: 4 }}>
              <label style={{ textTransform: 'none', fontWeight: 700, fontSize: 12 }}>Spare Part Details</label>
            </div>
            <div className="form-row">
              <div className="field">
                <label>Part No</label>
                <input value={sparePartDetails.part_no} onChange={(e) => setSparePartDetails({ ...sparePartDetails, part_no: e.target.value })} />
              </div>
              <div className="field">
                <label>Brand</label>
                <input value={sparePartDetails.brand} onChange={(e) => setSparePartDetails({ ...sparePartDetails, brand: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label>Unit Type</label>
                <input value={sparePartDetails.unit_type} onChange={(e) => setSparePartDetails({ ...sparePartDetails, unit_type: e.target.value })} placeholder="e.g. piece, box" />
              </div>
              <div className="field">
                <label>Quantity On Hand</label>
                <input type="number" value={sparePartDetails.quantity_on_hand} onChange={(e) => setSparePartDetails({ ...sparePartDetails, quantity_on_hand: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label>Reorder Level</label>
                <input type="number" value={sparePartDetails.reorder_level} onChange={(e) => setSparePartDetails({ ...sparePartDetails, reorder_level: e.target.value })} />
              </div>
              <div className="field" />
            </div>
          </>
        )}

        <button className="btn primary" type="submit" disabled={saving}>
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Item'}
        </button>
      </form>
    </Layout>
  );
}
