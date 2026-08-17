-- Paid styling is not part of the first production release. Prevent legacy or
-- modified clients from creating payment requests or self-certifying payment
-- completion. A future release must move all transitions to a verified webhook.

CREATE OR REPLACE FUNCTION public.block_client_styling_payment_mutations()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
        IF TG_OP = 'INSERT' AND NEW.payment_request IS NOT NULL THEN
            RAISE EXCEPTION 'Paid styling requests are unavailable';
        END IF;
        IF TG_OP = 'UPDATE' AND NEW.payment_request IS DISTINCT FROM OLD.payment_request THEN
            RAISE EXCEPTION 'Paid styling requests are unavailable';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_client_styling_payment_mutations ON public.messages;
CREATE TRIGGER block_client_styling_payment_mutations
BEFORE INSERT OR UPDATE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.block_client_styling_payment_mutations();

REVOKE ALL ON FUNCTION public.block_client_styling_payment_mutations() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Stylists can create styling sessions" ON public.styling_sessions;
DROP POLICY IF EXISTS "Participants can update styling sessions" ON public.styling_sessions;
REVOKE INSERT, UPDATE, DELETE ON public.styling_sessions FROM anon, authenticated;
GRANT SELECT ON public.styling_sessions TO authenticated;
