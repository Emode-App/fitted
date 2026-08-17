-- Keep extension ownership out of the API-exposed public schema. pg_net creates
-- and continues to expose its request functions through its own `net` schema.
create schema if not exists extensions;

drop extension if exists pg_net;
create extension pg_net with schema extensions;
