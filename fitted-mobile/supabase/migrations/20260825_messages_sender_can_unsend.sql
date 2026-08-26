-- Unsending is deleting for both people, so only the sender may do it. There
-- was no DELETE policy on messages at all before this, which meant every
-- attempt was refused -- and refused silently, since nothing in the app offered
-- the action in the first place.
--
-- Two kinds of message are deliberately excluded. A styling delivery is what a
-- client paid for and is referenced by styling_sessions.delivery_message_id; a
-- stylist capturing $75 and then removing the outfit is not an unsend, it is
-- taking the thing back. A payment request is the record of what was agreed.
-- The app checks both before offering the action and explains why, so this
-- policy is the floor rather than the only line of defence.
create policy "Senders can unsend their own messages"
    on public.messages for delete
    to authenticated
    using (
        auth.uid() = sender_id
        and styling_delivery is null
        and payment_request is null
    );
