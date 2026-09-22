-- Explicitly tag each sale as an 'automobile' sale or a 'spare_part' sale.
-- The application already enforces that a sale cannot mix the two
-- categories (see backend/src/routes/sales.js), so this column just makes
-- that fact queryable directly (sales list, reports) without joining
-- sale_items -> inventory_items every time.
--
-- Note: this replaces the old assumption in 005_sales.sql that "a vehicle
-- sale = exactly one row (quantity 1)". That is no longer true — a single
-- automobile sale can now contain several vehicle line items (each still
-- quantity 1, since every vehicle is a unique unit), so it's now
-- "one row per vehicle, quantity 1 per row" rather than "exactly one row".

ALTER TABLE sales ADD COLUMN IF NOT EXISTS sale_category TEXT
    CHECK (sale_category IN ('automobile', 'spare_part'));

-- Backfill existing sales from their line items.
UPDATE sales s
SET sale_category = sub.category
FROM (
    SELECT si.sale_id,
           CASE WHEN bool_or(i.item_type <> 'spare_part') THEN 'automobile' ELSE 'spare_part' END AS category
    FROM sale_items si
    JOIN inventory_items i ON i.id = si.inventory_item_id
    GROUP BY si.sale_id
) sub
WHERE s.id = sub.sale_id AND s.sale_category IS NULL;

-- Every sale must have at least one item (enforced by the API), so every
-- row should now have a category. Going forward the API always supplies it.
ALTER TABLE sales ALTER COLUMN sale_category SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_category ON sales (sale_category);
