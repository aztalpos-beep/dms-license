-- Add variant_feature field to vehicle details (Variant Feature, separate from Variant)
ALTER TABLE inventory_vehicle_details ADD COLUMN IF NOT EXISTS variant_feature TEXT;
