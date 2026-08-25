-- Where the picture came from, kept apart from where it is published.
--
-- A delivery lives in private-media as an object path, readable only by the two
-- people in that conversation and only through a short-lived signed URL.
-- Putting that path in generated_image_url would have handed a profile visitor
-- a link that expires and that storage would refuse them anyway.
--
-- So the private original and the public copy are different columns. The public
-- one stays null until the client approves, which makes approval the moment a
-- private image becomes a public one -- and revoking the moment it stops being,
-- because portfolio-decision deletes the copy rather than hiding the row.
alter table public.portfolio_items
    add column if not exists source_generated_path text,
    add column if not exists source_board_path text;

comment on column public.portfolio_items.generated_image_url is
    'Public copy, written only on approval. Null while pending or revoked.';
comment on column public.portfolio_items.source_generated_path is
    'Private-media object path of the original delivery. Never served publicly.';
