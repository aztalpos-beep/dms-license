const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function branchFilter(req, tableAlias) {
  const branchId = req.user.role === 'super_admin'
    ? (req.query.branch_id ? Number(req.query.branch_id) : null)
    : req.user.branchId;
  return { branchId, clause: branchId ? `${tableAlias}.branch_id = $1` : null };
}

// GET /api/reports/profit?month=YYYY-MM&branch_id=(super_admin only)
// Per-sale profit (selling price - purchase cost) minus approved expenses that month.
router.get('/profit', async (req, res) => {
  try {
    const { branchId, clause } = branchFilter(req, 's');
    let { start_date, end_date, month } = req.query;
    if (!start_date || !end_date) {
      month = month || new Date().toISOString().slice(0, 7);
      const [y, m] = month.split('-').map(Number);
      start_date = `${month}-01`;
      end_date = new Date(y, m, 0).toISOString().slice(0, 10); // last day of month
    }

    const params = branchId ? [branchId, start_date, end_date] : [start_date, end_date];
    const idx = branchId ? 2 : 1;

    const salesProfit = await pool.query(
      `SELECT s.id, s.receipt_no, s.sale_date, s.total_amount, b.name AS branch_name,
              STRING_AGG(DISTINCT i.title, ', ') AS product_name,
              COALESCE(SUM(si.quantity * i.purchase_price), 0) AS total_cost,
              s.total_amount - COALESCE(SUM(si.quantity * i.purchase_price), 0) AS profit,
              (SELECT COUNT(*) FROM sale_payment_plan p WHERE p.sale_id = s.id) AS installment_count
       FROM sales s
       JOIN branches b ON b.id = s.branch_id
       JOIN sale_items si ON si.sale_id = s.id
       JOIN inventory_items i ON i.id = si.inventory_item_id
       WHERE s.deleted_at IS NULL ${clause ? 'AND ' + clause + ' ' : ''}AND s.sale_date BETWEEN $${idx} AND $${idx + 1} AND s.status != 'returned'
       GROUP BY s.id, b.name
       ORDER BY s.sale_date DESC`,
      params
    );

    const grossProfit = salesProfit.rows.reduce((sum, r) => sum + Number(r.profit), 0);

    const expenseConditions = ["status = 'approved'", `expense_date BETWEEN $${idx} AND $${idx + 1}`];
    if (branchId) expenseConditions.push('branch_id = $1');
    const expensesResult = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE ${expenseConditions.join(' AND ')}`,
      params
    );
    const totalExpenses = Number(expensesResult.rows[0].total);

    res.json({
      start_date, end_date,
      sales: salesProfit.rows,
      gross_profit: grossProfit,
      total_expenses: totalExpenses,
      net_profit: grossProfit - totalExpenses,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load profit report.' });
  }
});

// GET /api/reports/receivables?branch_id=(super_admin only)
router.get('/receivables', async (req, res) => {
  try {
    const { branchId, clause } = branchFilter(req, 's');
    const params = branchId ? [branchId] : [];

    const result = await pool.query(
      `SELECT s.id AS sale_id, s.receipt_no, s.outstanding_balance, s.sale_date, c.name AS customer_name, c.mobile_no
       FROM sales s JOIN customers c ON c.id = s.customer_id
       WHERE s.deleted_at IS NULL AND s.outstanding_balance > 0 AND s.status = 'active' ${clause ? 'AND ' + clause : ''}
       ORDER BY s.outstanding_balance DESC`,
      params
    );

    const total = result.rows.reduce((sum, r) => sum + Number(r.outstanding_balance), 0);
    res.json({ total_outstanding: total, sales: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load receivables report.' });
  }
});

// GET /api/reports/inventory-valuation?branch_id=(super_admin only)
router.get('/inventory-valuation', async (req, res) => {
  try {
    const { branchId, clause } = branchFilter(req, 'i');
    const params = branchId ? [branchId] : [];

    const result = await pool.query(
      `SELECT item_type, COUNT(*) AS item_count, COALESCE(SUM(purchase_price), 0) AS total_value
       FROM inventory_items i
       WHERE i.deleted_at IS NULL AND status = 'in_stock' ${clause ? 'AND ' + clause : ''}
       GROUP BY item_type`,
      params
    );

    const total = result.rows.reduce((sum, r) => sum + Number(r.total_value), 0);
    res.json({ total_valuation: total, by_type: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load inventory valuation report.' });
  }
});

// GET /api/reports/cash-flow?branch_id=(super_admin only)
// Daily cashbook history, reused as the cash flow report.
router.get('/cash-flow', async (req, res) => {
  try {
    const { branchId } = branchFilter(req, '');
    const { start_date, end_date } = req.query;

    const conditions = [];
    const params = [];
    if (branchId) { params.push(branchId); conditions.push(`branch_id = $${params.length}`); }
    if (start_date && end_date) {
      params.push(start_date, end_date);
      conditions.push(`ledger_date BETWEEN $${params.length - 1} AND $${params.length}`);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT * FROM daily_cashbook ${whereClause} ORDER BY ledger_date DESC ${start_date ? '' : 'LIMIT 90'}`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load cash flow report.' });
  }
});

// GET /api/reports/vendor-purchases?branch_id=(super_admin only)
router.get('/vendor-purchases', async (req, res) => {
  try {
    const { branchId } = branchFilter(req, 'i');
    const { start_date, end_date } = req.query;

    const joinConditions = ['i.deleted_at IS NULL'];
    const params = [];
    if (branchId) { params.push(branchId); joinConditions.push(`i.branch_id = $${params.length}`); }
    if (start_date && end_date) {
      params.push(start_date, end_date);
      joinConditions.push(`i.purchase_date BETWEEN $${params.length - 1} AND $${params.length}`);
    }
    const joinClause = `AND ${joinConditions.join(' AND ')}`;

    const result = await pool.query(
      `SELECT v.id AS vendor_id, v.name AS vendor_name, COUNT(i.id) AS item_count,
              COALESCE(SUM(i.purchase_price), 0) AS total_purchased
       FROM vendors v
       LEFT JOIN inventory_items i ON i.vendor_id = v.id ${joinClause}
       GROUP BY v.id
       ORDER BY total_purchased DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load vendor purchase report.' });
  }
});

// GET /api/reports/category-summary?branch_id=(super_admin only)
// Sales count, revenue, outstanding balance and stock-in-hand, split by
// automobile vs spare-parts -- powers the Automobile / Spare Parts tabs on
// the dashboard.
router.get('/category-summary', async (req, res) => {
  try {
    const { branchId, clause: salesClause } = branchFilter(req, 's');
    const salesParams = branchId ? [branchId] : [];

    const salesResult = await pool.query(
      `SELECT sale_category,
              COUNT(*) AS sales_count,
              COALESCE(SUM(total_amount), 0) AS total_revenue,
              COALESCE(SUM(outstanding_balance), 0) AS outstanding_balance
       FROM sales s
       WHERE s.deleted_at IS NULL AND status <> 'cancelled' ${salesClause ? 'AND ' + salesClause : ''}
       GROUP BY sale_category`,
      salesParams
    );

    const { clause: invClause } = branchFilter(req, 'i');
    const invParams = branchId ? [branchId] : [];

    const vehicleStockResult = await pool.query(
      `SELECT COUNT(*) AS stock_in_hand
       FROM inventory_items i
       WHERE i.deleted_at IS NULL AND item_type IN ('car', 'tractor') AND status = 'in_stock' ${invClause ? 'AND ' + invClause : ''}`,
      invParams
    );

    const sparePartStockResult = await pool.query(
      `SELECT COALESCE(SUM(sp.quantity_on_hand), 0) AS stock_in_hand
       FROM inventory_items i
       JOIN inventory_spare_part_details sp ON sp.inventory_item_id = i.id
       WHERE i.deleted_at IS NULL AND i.item_type = 'spare_part' AND i.status = 'in_stock' ${invClause ? 'AND ' + invClause : ''}`,
      invParams
    );

    const salesFor = (category) => {
      const row = salesResult.rows.find((r) => r.sale_category === category);
      return {
        sales_count: row ? Number(row.sales_count) : 0,
        total_revenue: row ? Number(row.total_revenue) : 0,
        outstanding_balance: row ? Number(row.outstanding_balance) : 0,
      };
    };

    res.json({
      automobile: { ...salesFor('automobile'), stock_in_hand: Number(vehicleStockResult.rows[0].stock_in_hand) },
      spare_part: { ...salesFor('spare_part'), stock_in_hand: Number(sparePartStockResult.rows[0].stock_in_hand) },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load category summary.' });
  }
});

// GET /api/reports/branch-summary?start_date=&end_date=  (super_admin only)
// Per-branch breakdown: sales profit, approved expenses, and net profit for
// every branch side by side -- the "all branches at a glance" view.
router.get('/branch-summary', requireRole('super_admin'), async (req, res) => {
  try {
    let { start_date, end_date, month } = req.query;
    if (!start_date || !end_date) {
      month = month || new Date().toISOString().slice(0, 7);
      const [y, m] = month.split('-').map(Number);
      start_date = `${month}-01`;
      end_date = new Date(y, m, 0).toISOString().slice(0, 10);
    }

    const result = await pool.query(
      `WITH sale_profits AS (
         SELECT s.id, s.branch_id, s.total_amount,
                COALESCE(SUM(si.quantity * i.purchase_price), 0) AS cost
         FROM sales s
         JOIN sale_items si ON si.sale_id = s.id
         JOIN inventory_items i ON i.id = si.inventory_item_id
         WHERE s.deleted_at IS NULL AND s.sale_date BETWEEN $1 AND $2 AND s.status != 'returned'
         GROUP BY s.id
       ),
       branch_profit AS (
         SELECT branch_id, COUNT(*) AS sales_count, COALESCE(SUM(total_amount - cost), 0) AS gross_profit
         FROM sale_profits
         GROUP BY branch_id
       ),
       branch_expenses AS (
         SELECT branch_id, COALESCE(SUM(amount), 0) AS total_expenses
         FROM expenses
         WHERE status = 'approved' AND expense_date BETWEEN $1 AND $2
         GROUP BY branch_id
       )
       SELECT b.id AS branch_id, b.name AS branch_name,
              COALESCE(bp.sales_count, 0) AS sales_count,
              COALESCE(bp.gross_profit, 0) AS gross_profit,
              COALESCE(be.total_expenses, 0) AS total_expenses,
              COALESCE(bp.gross_profit, 0) - COALESCE(be.total_expenses, 0) AS net_profit
       FROM branches b
       LEFT JOIN branch_profit bp ON bp.branch_id = b.id
       LEFT JOIN branch_expenses be ON be.branch_id = b.id
       ORDER BY b.id`,
      [start_date, end_date]
    );

    const totals = result.rows.reduce((acc, r) => ({
      sales_count: acc.sales_count + Number(r.sales_count),
      gross_profit: acc.gross_profit + Number(r.gross_profit),
      total_expenses: acc.total_expenses + Number(r.total_expenses),
      net_profit: acc.net_profit + Number(r.net_profit),
    }), { sales_count: 0, gross_profit: 0, total_expenses: 0, net_profit: 0 });

    res.json({ start_date, end_date, branches: result.rows, totals });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load branch summary report.' });
  }
});

module.exports = router;