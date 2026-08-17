-- ============================================================
-- MARKETPLACE ORDERS
-- Run in the Supabase SQL Editor / applied via migration. Idempotent.
--
-- A marketplace checkout creates one order per SELLER (a multi-seller cart is
-- split into multiple orders, each paid via a Stripe Connect destination charge).
-- Amounts are in integer cents and are computed server-side in the
-- create-order-payment edge function — never trusted from the client.
--
-- buyer_id / seller_id use ON DELETE SET NULL so order history survives account
-- deletion. Rows are written only by the service role (edge function + webhook);
-- buyers and sellers can read their own orders.
-- ============================================================

CREATE TABLE IF NOT EXISTS orders (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id                 UUID REFERENCES users(id) ON DELETE SET NULL,
    seller_id                UUID REFERENCES users(id) ON DELETE SET NULL,
    status                   TEXT NOT NULL DEFAULT 'pending',   -- pending|paid|failed|cancelled|fulfilled
    subtotal_amount          INTEGER NOT NULL,                  -- cents
    platform_fee_amount      INTEGER NOT NULL DEFAULT 0,        -- cents
    currency                 TEXT NOT NULL DEFAULT 'usd',
    stripe_payment_intent_id TEXT,
    shipping                 JSONB,                             -- { name, line1, line2, city, state, postal_code, country }
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Buyer or seller can read orders" ON orders;
CREATE POLICY "Buyer or seller can read orders" ON orders
    FOR SELECT USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

CREATE TABLE IF NOT EXISTS order_items (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id     UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id   UUID REFERENCES products(id) ON DELETE SET NULL,
    name         TEXT NOT NULL,            -- snapshot at purchase time
    price_amount INTEGER NOT NULL,         -- cents snapshot
    size         TEXT,
    image_url    TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Order parties can read order items" ON order_items;
CREATE POLICY "Order parties can read order items" ON order_items
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM orders o
        WHERE o.id = order_items.order_id
          AND (auth.uid() = o.buyer_id OR auth.uid() = o.seller_id)
    ));

CREATE INDEX IF NOT EXISTS orders_buyer_idx ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS orders_seller_idx ON orders(seller_id);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(order_id);

-- ------------------------------------------------------------
-- Seller fulfillment: a seller may move their own PAID order to FULFILLED
-- (shipped) and nothing else. Mirrors the protect_message_columns pattern —
-- an UPDATE policy scoped to the seller plus a trigger that locks every other
-- column for non-service-role callers.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Seller can update own orders" ON orders;
CREATE POLICY "Seller can update own orders" ON orders
    FOR UPDATE USING (auth.uid() = seller_id) WITH CHECK (auth.uid() = seller_id);

CREATE OR REPLACE FUNCTION protect_order_columns()
RETURNS TRIGGER AS $$
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        NEW.id                       := OLD.id;
        NEW.buyer_id                 := OLD.buyer_id;
        NEW.seller_id                := OLD.seller_id;
        NEW.subtotal_amount          := OLD.subtotal_amount;
        NEW.platform_fee_amount      := OLD.platform_fee_amount;
        NEW.currency                 := OLD.currency;
        NEW.stripe_payment_intent_id := OLD.stripe_payment_intent_id;
        NEW.shipping                 := OLD.shipping;
        NEW.created_at               := OLD.created_at;
        IF NOT (OLD.status = 'paid' AND NEW.status = 'fulfilled') THEN
            NEW.status := OLD.status;
        END IF;
        NEW.updated_at := now();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS protect_orders ON orders;
CREATE TRIGGER protect_orders
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION protect_order_columns();
