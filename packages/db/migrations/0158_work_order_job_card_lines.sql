-- A customer order/part can be split across separate Job Cards.
-- work_orders_job_card_unique remains the production line identity.
DROP INDEX manufacturing.work_orders_number_unique;
CREATE INDEX work_orders_number_idx
  ON manufacturing.work_orders (organization_id, lower(work_order_number));
