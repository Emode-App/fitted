ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS inventory_count integer NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS reserved_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_inventory_nonnegative;
ALTER TABLE public.products ADD CONSTRAINT products_inventory_nonnegative
    CHECK (inventory_count >= 0 AND reserved_count >= 0 AND reserved_count <= inventory_count);

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS expires_at timestamptz,
    ADD COLUMN IF NOT EXISTS failure_reason text,
    ADD COLUMN IF NOT EXISTS refunded_amount integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS dispute_status text;

ALTER TABLE public.stripe_events
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'processing',
    ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS last_error text,
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.stripe_events ALTER COLUMN processed_at DROP NOT NULL;
ALTER TABLE public.stripe_events ALTER COLUMN processed_at DROP DEFAULT;

CREATE INDEX IF NOT EXISTS orders_pending_expiry_idx ON public.orders (expires_at) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS orders_payment_intent_unique_idx ON public.orders (stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.release_marketplace_order(p_order_id uuid, p_reason text DEFAULT 'canceled')
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
    affected integer := 0;
BEGIN
    PERFORM 1 FROM public.orders WHERE id = p_order_id AND status = 'pending' FOR UPDATE;
    IF NOT FOUND THEN RETURN false; END IF;

    UPDATE public.products p
    SET reserved_count = greatest(0, p.reserved_count - counts.quantity)
    FROM (
        SELECT product_id, count(*)::integer AS quantity
        FROM public.order_items WHERE order_id = p_order_id AND product_id IS NOT NULL
        GROUP BY product_id
    ) counts
    WHERE p.id = counts.product_id;

    UPDATE public.orders
    SET status = CASE WHEN p_reason = 'expired' THEN 'expired' ELSE 'failed' END,
        failure_reason = left(p_reason, 500), updated_at = now()
    WHERE id = p_order_id;
    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN affected > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_expired_marketplace_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
    row record;
    released integer := 0;
BEGIN
    FOR row IN SELECT id FROM public.orders WHERE status = 'pending' AND expires_at < now() FOR UPDATE SKIP LOCKED LOOP
        IF public.release_marketplace_order(row.id, 'expired') THEN released := released + 1; END IF;
    END LOOP;
    RETURN released;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_marketplace_order(
    p_buyer_id uuid,
    p_seller_id uuid,
    p_items jsonb,
    p_shipping jsonb,
    p_fee_percent numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
    product_ids uuid[];
    product_count integer;
    subtotal integer;
    fee integer;
    new_order_id uuid;
    item jsonb;
    product_row record;
    chosen_size text;
BEGIN
    IF p_buyer_id IS NULL OR p_seller_id IS NULL OR p_buyer_id = p_seller_id THEN
        RAISE EXCEPTION 'invalid_buyer_or_seller';
    END IF;
    IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) < 1 OR jsonb_array_length(p_items) > 25 THEN
        RAISE EXCEPTION 'invalid_items';
    END IF;
    IF p_fee_percent < 0 OR p_fee_percent > 30 THEN RAISE EXCEPTION 'invalid_fee'; END IF;

    PERFORM public.release_expired_marketplace_orders();
    SELECT array_agg(DISTINCT (value->>'product_id')::uuid), count(DISTINCT value->>'product_id')
    INTO product_ids, product_count FROM jsonb_array_elements(p_items);
    IF product_count <> jsonb_array_length(p_items) THEN RAISE EXCEPTION 'duplicate_or_invalid_items'; END IF;

    PERFORM 1 FROM public.products WHERE id = ANY(product_ids) ORDER BY id FOR UPDATE;
    IF (SELECT count(*) FROM public.products WHERE id = ANY(product_ids)) <> product_count THEN
        RAISE EXCEPTION 'product_unavailable';
    END IF;

    subtotal := 0;
    FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
        SELECT id, seller_id, name, price, sizes, image_urls, is_active, inventory_count, reserved_count
        INTO product_row FROM public.products WHERE id = (item->>'product_id')::uuid;
        IF product_row.seller_id <> p_seller_id OR NOT product_row.is_active OR product_row.inventory_count - product_row.reserved_count < 1 THEN
            RAISE EXCEPTION 'product_unavailable';
        END IF;
        chosen_size := nullif(trim(item->>'size'), '');
        IF jsonb_array_length(coalesce(product_row.sizes, '[]'::jsonb)) > 0
           AND (chosen_size IS NULL OR NOT (product_row.sizes ? chosen_size)) THEN
            RAISE EXCEPTION 'invalid_size';
        END IF;
        subtotal := subtotal + round(product_row.price * 100)::integer;
    END LOOP;
    IF subtotal < 50 OR subtotal > 500000 THEN RAISE EXCEPTION 'invalid_total'; END IF;
    fee := round(subtotal * p_fee_percent / 100)::integer;

    INSERT INTO public.orders (buyer_id, seller_id, status, subtotal_amount, platform_fee_amount, currency, shipping, expires_at)
    VALUES (p_buyer_id, p_seller_id, 'pending', subtotal, fee, 'usd', p_shipping, now() + interval '30 minutes')
    RETURNING id INTO new_order_id;

    FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
        SELECT * INTO product_row FROM public.products WHERE id = (item->>'product_id')::uuid;
        INSERT INTO public.order_items (order_id, product_id, name, price_amount, size, image_url)
        VALUES (new_order_id, product_row.id, product_row.name, round(product_row.price * 100)::integer,
                nullif(trim(item->>'size'), ''), product_row.image_urls->>0);
    END LOOP;

    UPDATE public.products SET reserved_count = reserved_count + 1 WHERE id = ANY(product_ids);
    RETURN jsonb_build_object('order_id', new_order_id, 'subtotal', subtotal, 'fee', fee);
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_marketplace_order(p_order_id uuid, p_payment_intent_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
    counts record;
BEGIN
    PERFORM 1 FROM public.orders
    WHERE id = p_order_id AND status = 'pending'
      AND (stripe_payment_intent_id IS NULL OR stripe_payment_intent_id = p_payment_intent_id)
    FOR UPDATE;
    IF NOT FOUND THEN RETURN false; END IF;

    FOR counts IN
        SELECT product_id, count(*)::integer quantity FROM public.order_items
        WHERE order_id = p_order_id AND product_id IS NOT NULL GROUP BY product_id
    LOOP
        UPDATE public.products
        SET inventory_count = greatest(0, inventory_count - counts.quantity),
            reserved_count = greatest(0, reserved_count - counts.quantity),
            is_active = (inventory_count - counts.quantity) > 0
        WHERE id = counts.product_id AND reserved_count >= counts.quantity AND inventory_count >= counts.quantity;
        IF NOT FOUND THEN RAISE EXCEPTION 'inventory_finalize_failed'; END IF;
    END LOOP;

    UPDATE public.orders SET status = 'paid', stripe_payment_intent_id = p_payment_intent_id,
        expires_at = NULL, failure_reason = NULL, updated_at = now()
    WHERE id = p_order_id;
    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_marketplace_order(uuid, uuid, jsonb, jsonb, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_marketplace_order(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_marketplace_order(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_expired_marketplace_orders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_marketplace_order(uuid, uuid, jsonb, jsonb, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_marketplace_order(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_marketplace_order(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_expired_marketplace_orders() TO service_role;

-- Sellers may still mark paid orders fulfilled; protect every new financial field.
CREATE OR REPLACE FUNCTION public.protect_order_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        NEW.id := OLD.id; NEW.buyer_id := OLD.buyer_id; NEW.seller_id := OLD.seller_id;
        NEW.subtotal_amount := OLD.subtotal_amount; NEW.platform_fee_amount := OLD.platform_fee_amount;
        NEW.currency := OLD.currency; NEW.stripe_payment_intent_id := OLD.stripe_payment_intent_id;
        NEW.shipping := OLD.shipping; NEW.created_at := OLD.created_at; NEW.expires_at := OLD.expires_at;
        NEW.failure_reason := OLD.failure_reason; NEW.refunded_amount := OLD.refunded_amount;
        NEW.dispute_status := OLD.dispute_status;
        IF NOT (OLD.status = 'paid' AND NEW.status = 'fulfilled') THEN NEW.status := OLD.status; END IF;
        NEW.updated_at := now();
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_order_columns() FROM PUBLIC, anon, authenticated;
