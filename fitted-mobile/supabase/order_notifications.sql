-- ============================================================
-- ORDER NOTIFICATIONS
-- Run in the Supabase SQL Editor / applied via migration. Idempotent.
--
-- Fires an in-app notification on order state changes:
--   pending -> paid       : notify the SELLER of a new sale
--   paid    -> fulfilled  : notify the BUYER their order shipped
--
-- SECURITY DEFINER so the insert bypasses RLS (the actor is not the recipient).
-- ============================================================

-- Allow the new notification types.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN ('like', 'comment', 'follow', 'order_sold', 'order_shipped'));

CREATE OR REPLACE FUNCTION notify_order_status_change()
RETURNS TRIGGER AS $$
DECLARE
    v_amount TEXT := to_char(NEW.subtotal_amount / 100.0, 'FM999990.00');
BEGIN
    IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid'
       AND NEW.seller_id IS NOT NULL AND NEW.buyer_id IS NOT NULL THEN
        INSERT INTO notifications (user_id, actor_id, type, content, is_read, created_at)
        VALUES (NEW.seller_id, NEW.buyer_id, 'order_sold', v_amount, FALSE, now());
    ELSIF NEW.status = 'fulfilled' AND OLD.status IS DISTINCT FROM 'fulfilled'
       AND NEW.buyer_id IS NOT NULL AND NEW.seller_id IS NOT NULL THEN
        INSERT INTO notifications (user_id, actor_id, type, content, is_read, created_at)
        VALUES (NEW.buyer_id, NEW.seller_id, 'order_shipped', v_amount, FALSE, now());
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS order_status_notify ON orders;
CREATE TRIGGER order_status_notify
    AFTER UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION notify_order_status_change();
