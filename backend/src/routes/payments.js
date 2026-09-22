const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/sales/:saleId/payments
router.get('/sales/:saleId/payments', async (req, res) => {
  try {
    const saleResult = await pool.query(
      'SELECT * FROM sales WHERE id = $1',
      [req.params.saleId]
    );

    if (saleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sale not found.' });
    }

    const sale = saleResult.rows[0];

    if (
      req.user.role !== 'super_admin' &&
      sale.branch_id !== req.user.branchId
    ) {
      return res
        .status(403)
        .json({ error: 'You do not have access to this sale.' });
    }

    const result = await pool.query(
      `SELECT *
       FROM sale_payments
       WHERE sale_id = $1
       ORDER BY payment_date DESC, id DESC`,
      [req.params.saleId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load payments.' });
  }
});

// POST /api/sales/:saleId/payments
// Body:
// {
//   amount_received,
//   payment_date,
//   payment_method,
//   linked_installment_id,
//   notes
// }
router.post(
  '/sales/:saleId/payments',
  requireRole(
    'super_admin',
    'admin',
    'manager',
    'sales_staff',
    'accountant'
  ),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const saleResult = await client.query(
        'SELECT * FROM sales WHERE id = $1 FOR UPDATE',
        [req.params.saleId]
      );

      if (saleResult.rows.length === 0) {
        return res.status(404).json({ error: 'Sale not found.' });
      }

      const sale = saleResult.rows[0];

      if (
        req.user.role !== 'super_admin' &&
        sale.branch_id !== req.user.branchId
      ) {
        return res
          .status(403)
          .json({ error: 'You do not have access to this sale.' });
      }

      const {
        amount_received,
        payment_date,
        payment_method,
        linked_installment_id,
        notes,
      } = req.body;

      const amount = Number(amount_received);

      if (!amount || amount <= 0) {
        return res.status(400).json({
          error: 'amount_received must be a positive number.',
        });
      }

      if (amount > Number(sale.outstanding_balance)) {
        return res.status(400).json({
          error: `Payment (${amount.toLocaleString()}) exceeds the outstanding balance (${Number(
            sale.outstanding_balance
          ).toLocaleString()}).`,
        });
      }

      await client.query('BEGIN');

      const paymentResult = await client.query(
        `INSERT INTO sale_payments (
           sale_id,
           payment_date,
           amount_received,
           payment_method,
           linked_installment_id,
           notes,
           recorded_by
         )
         VALUES (
           $1,
           COALESCE($2, CURRENT_DATE),
           $3,
           COALESCE($4, 'cash'),
           $5,
           $6,
           $7
         )
         RETURNING *`,
        [
          req.params.saleId,
          payment_date || null,
          amount,
          payment_method || null,
          linked_installment_id || null,
          notes || null,
          req.user.userId,
        ]
      );

      const newOutstanding =
        Number(sale.outstanding_balance) - amount;

      await client.query(
        `UPDATE sales
         SET outstanding_balance = $1::numeric,
             status = CASE
               WHEN $1::numeric <= 0 THEN 'completed'
               ELSE status
             END
         WHERE id = $2`,
        [newOutstanding, req.params.saleId]
      );

      await client.query(
        `INSERT INTO customer_ledger (
           customer_id,
           sale_id,
           entry_type,
           amount,
           description,
           entry_date
         )
         VALUES (
           $1,
           $2,
           'credit',
           $3,
           $4,
           COALESCE($5, CURRENT_DATE)
         )`,
        [
          sale.customer_id,
          sale.id,
          amount,
          `Payment on sale ${sale.receipt_no}`,
          payment_date || null,
        ]
      );

      await client.query('COMMIT');

      res.status(201).json({
        ...paymentResult.rows[0],
        outstanding_balance: newOutstanding,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(err);
      res.status(500).json({
        error: 'Could not record payment.',
      });
    } finally {
      client.release();
    }
  }
);

/*
 * Allocate total payments across installments in sequence.
 *
 * Example:
 *
 * Installment 1 = 100,000
 * Installment 2 = 100,000
 * Installment 3 = 100,000
 *
 * Total paid = 150,000
 *
 * Result:
 * #1 = Paid 100,000 / Remaining 0
 * #2 = Paid 50,000  / Remaining 50,000
 * #3 = Paid 0       / Remaining 100,000
 *
 * This is the same rolling allocation logic already used
 * by the previous recovery dashboard.
 */
function allocateInstallments(planRows, totalPaidTowardPlan) {
  let remainingPool = Math.max(
    Number(totalPaidTowardPlan) || 0,
    0
  );

  return planRows.map((plan) => {
    const expectedAmount = Number(plan.expected_amount) || 0;

    const paidAmount = Math.min(
      remainingPool,
      expectedAmount
    );

    remainingPool = Math.max(
      remainingPool - paidAmount,
      0
    );

    const remainingAmount = Math.max(
      expectedAmount - paidAmount,
      0
    );

    return {
      ...plan,
      expected_amount: expectedAmount,
      paid_amount: paidAmount,
      remaining_amount: remainingAmount,
    };
  });
}

/*
 * GET /api/recovery
 *
 * With a date range:
 *   Returns EVERY installment whose due_date is inside
 *   the selected range, including:
 *
 *   - Paid
 *   - Partial
 *   - Overdue
 *   - Upcoming
 *
 * Without a date range:
 *   Keeps the previous dashboard behavior:
 *   outstanding active sales + overdue/upcoming installments
 *   up to the next 6 months.
 */
router.get('/recovery', async (req, res) => {
  try {
    const branchId =
      req.user.role === 'super_admin'
        ? req.query.branch_id
          ? Number(req.query.branch_id)
          : null
        : req.user.branchId;

    const { start_date, end_date } = req.query;

    const hasDateRange = Boolean(start_date && end_date);

    /*
     * When a date range is selected, we intentionally DO NOT require
     * outstanding_balance > 0.
     *
     * This is what allows fully paid installments to appear in the
     * selected report period.
     */
    const conditions = ['s.deleted_at IS NULL'];
    const params = [];

    if (branchId) {
      params.push(branchId);
      conditions.push(`s.branch_id = $${params.length}`);
    }

    /*
     * Default dashboard mode:
     * only sales that still have money outstanding.
     *
     * Date-range report mode:
     * all non-deleted sales are considered so paid installments
     * can also be shown.
     */
    if (!hasDateRange) {
      conditions.push(`s.outstanding_balance > 0`);
      conditions.push(`s.status = 'active'`);
    }

    const salesResult = await pool.query(
      `SELECT
         c.id AS customer_id,
         c.name AS customer_name,
         c.mobile_no,

         s.id AS sale_id,
         s.receipt_no,
         s.outstanding_balance,
         s.sale_date,
         s.total_amount,
         s.advance_received,
         s.branch_id,

         b.name AS branch_name,
         b.address AS branch_address,
         b.phone AS branch_phone

       FROM sales s

       JOIN customers c
         ON c.id = s.customer_id

       LEFT JOIN branches b
         ON b.id = s.branch_id

       WHERE ${conditions.join(' AND ')}

       ORDER BY s.id ASC`,
      params
    );

    if (salesResult.rows.length === 0) {
      return res.json([]);
    }

    const saleIds = salesResult.rows.map(
      (row) => row.sale_id
    );

    /*
     * Step 1:
     * Load every installment plan for these sales.
     */
    const planResult = await pool.query(
      `SELECT *
       FROM sale_payment_plan
       WHERE sale_id = ANY($1::int[])
       ORDER BY sale_id ASC, installment_no ASC`,
      [saleIds]
    );

    const planBySale = {};

    for (const row of planResult.rows) {
      if (!planBySale[row.sale_id]) {
        planBySale[row.sale_id] = [];
      }

      planBySale[row.sale_id].push(row);
    }

    /*
     * Step 2:
     * Total actual payments against each sale.
     *
     * Advance is NOT included here because advance_received
     * is already excluded when the installment plan is created.
     */
    const paymentsResult = await pool.query(
      `SELECT
         sale_id,
         COALESCE(SUM(amount_received), 0) AS paid
       FROM sale_payments
       WHERE sale_id = ANY($1::int[])
       GROUP BY sale_id`,
      [saleIds]
    );

    const paidBySale = {};

    for (const row of paymentsResult.rows) {
      paidBySale[row.sale_id] = Number(row.paid);
    }

    /*
     * Step 3:
     * Get item information.
     *
     * Stock code is included so the recovery team can identify
     * the exact vehicle/item.
     */
    const itemsResult = await pool.query(
      `SELECT
         si.sale_id,

         string_agg(
           CONCAT(
             COALESCE(i.stock_code, ''),
             CASE
               WHEN i.stock_code IS NOT NULL
                    AND i.title IS NOT NULL
               THEN ' - '
               ELSE ''
             END,
             COALESCE(i.title, ''),
             CASE
               WHEN vd.model IS NOT NULL
               THEN ' - ' || vd.model
               ELSE ''
             END
           ),
           ', '
           ORDER BY si.id
         ) AS item_names,

         COALESCE(
           SUM(si.quantity * i.purchase_price),
           0
         ) AS total_cost

       FROM sale_items si

       JOIN inventory_items i
         ON i.id = si.inventory_item_id

       LEFT JOIN inventory_vehicle_details vd
         ON vd.inventory_item_id = i.id

       WHERE si.sale_id = ANY($1::int[])

       GROUP BY si.sale_id`,
      [saleIds]
    );

    const itemNamesBySale = {};
    const totalCostBySale = {};

    for (const row of itemsResult.rows) {
      itemNamesBySale[row.sale_id] =
        row.item_names;

      totalCostBySale[row.sale_id] =
        Number(row.total_cost);
    }

    /*
     * Dates used for status/default view.
     *
     * Use YYYY-MM-DD strings because PostgreSQL date values
     * and HTML date inputs use this format.
     */
    const today = new Date()
      .toISOString()
      .slice(0, 10);

    const sixMonthsOut = new Date();
    sixMonthsOut.setMonth(
      sixMonthsOut.getMonth() + 6
    );

    const sixMonthsOutStr = sixMonthsOut
      .toISOString()
      .slice(0, 10);

    const rows = [];

    /*
     * Step 4:
     * Build one row per installment.
     */
    for (const sale of salesResult.rows) {
      const plan =
        planBySale[sale.sale_id] || [];

      if (plan.length === 0) {
        continue;
      }

      const paid =
        paidBySale[sale.sale_id] || 0;

      const allocated =
        allocateInstallments(plan, paid);

      for (const inst of allocated) {
        const dueDateStr =
          String(inst.due_date).slice(0, 10);

        /*
         * DATE RANGE MODE
         *
         * Include EVERY installment in range,
         * even if it is fully paid.
         */
        if (hasDateRange) {
          if (
            dueDateStr < start_date ||
            dueDateStr > end_date
          ) {
            continue;
          }
        } else {
          /*
           * DEFAULT DASHBOARD MODE
           *
           * Fully paid installments remain hidden.
           */
          if (inst.remaining_amount <= 0) {
            continue;
          }

          /*
           * Keep existing default behavior:
           * overdue + next six months.
           */
          if (dueDateStr > sixMonthsOutStr) {
            continue;
          }
        }

        let status;

        if (inst.remaining_amount <= 0) {
          status = 'paid';
        } else if (inst.paid_amount > 0) {
          status = 'partial';
        } else if (dueDateStr < today) {
          status = 'overdue';
        } else {
          status = 'upcoming';
        }

        rows.push({
          customer_id: sale.customer_id,
          customer_name: sale.customer_name,
          mobile_no: sale.mobile_no,

          sale_id: sale.sale_id,
          receipt_no: sale.receipt_no,

          outstanding_balance:
            Number(sale.outstanding_balance) || 0,

          sale_date: sale.sale_date,
          total_amount:
            Number(sale.total_amount) || 0,

          advance_received:
            Number(sale.advance_received) || 0,

          branch_id: sale.branch_id,
          branch_name: sale.branch_name,
          branch_address: sale.branch_address,
          branch_phone: sale.branch_phone,

          total_cost:
            totalCostBySale[sale.sale_id] || 0,

          installment_id: inst.id,
          installment_no: inst.installment_no,

          due_date: inst.due_date,

          expected_amount:
            Number(inst.expected_amount) || 0,

          paid_amount:
            Number(inst.paid_amount) || 0,

          remaining_amount:
            Number(inst.remaining_amount) || 0,

          is_overdue:
            dueDateStr < today &&
            Number(inst.remaining_amount) > 0,

          status,

          item_names:
            itemNamesBySale[sale.sale_id] || null,
        });
      }
    }

    /*
     * Sort:
     * 1. Due date
     * 2. Customer
     * 3. Installment number
     */
    rows.sort((a, b) => {
      const dateCompare =
        String(a.due_date).localeCompare(
          String(b.due_date)
        );

      if (dateCompare !== 0) {
        return dateCompare;
      }

      const customerCompare =
        String(a.customer_name || '').localeCompare(
          String(b.customer_name || '')
        );

      if (customerCompare !== 0) {
        return customerCompare;
      }

      return (
        Number(a.installment_no || 0) -
        Number(b.installment_no || 0)
      );
    });

    res.json(rows);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: 'Could not load recovery dashboard.',
    });
  }
});

module.exports = router;