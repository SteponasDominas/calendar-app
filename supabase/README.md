# Supabase Database Foundation

This folder contains SQL for the initial calendar schema and seed helpers.

## Files
- `schema.sql`: Complete reference schema with RLS policies.
- `seed.sql`: Helper function to insert starter events for a specific user.
- `migrations/*.sql`: Timestamped migration files for Supabase CLI workflows.

## Apply Locally
1. Start Supabase locally.
2. Apply migrations in order.
3. (Optional) Run `select public.seed_sample_events('<user-uuid>');` after creating a user.

## Core Table
`public.events` stores user-owned calendar records with strict row-level security.
`public.event_color_groups` stores per-user stable title-to-color mappings.
