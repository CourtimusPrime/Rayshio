-- Up Migration

-- Advances every identity sequence past the largest id already in its table.
--
-- Second half of the dump-restore damage that 0005 repairs. The dump inserted
-- rows with their original ids but never advanced the owning sequences, so
-- `billing.invoices` held ids up to 3073 while its sequence still sat at 10, and
-- `server.service` held ids to 15 with its sequence at 4. Six of the ten
-- sequences were behind; four had never been used at all.
--
-- While the primary keys were missing this produced silent duplicate ids.
-- Restoring the keys in 0005 turned it into a visible failure instead —
-- discovery died on `duplicate key value violates unique constraint
-- "service_pkey"` the first time it inserted a vendor. Which is the better
-- outcome, but it means 0005 is only half a repair without this.
--
-- Written as a loop over the catalog rather than a list of tables so it also
-- covers any table added later, and so nothing is missed by hand. `max(id)` is
-- read through query_to_xml because the table name is not known until runtime.
--
-- Safe on a fresh database: an empty table yields NULL and is skipped, and a
-- correctly-positioned sequence is left alone. Sets no id and moves no row —
-- it only tells the sequence where the data already is.

DO $$
DECLARE
  rec record;
  max_id bigint;
  seq_last bigint;
BEGIN
  FOR rec IN
    SELECT c.table_schema, c.table_name,
           pg_get_serial_sequence(format('%I.%I', c.table_schema, c.table_name), 'id') AS seqname
    FROM information_schema.columns c
    WHERE c.column_name = 'id'
      AND c.table_schema IN ('client', 'server', 'billing')
  LOOP
    CONTINUE WHEN rec.seqname IS NULL;

    EXECUTE format('SELECT max(id) FROM %I.%I', rec.table_schema, rec.table_name)
      INTO max_id;
    CONTINUE WHEN max_id IS NULL;

    SELECT pg_sequence_last_value(rec.seqname::regclass) INTO seq_last;

    IF seq_last IS NULL OR seq_last < max_id THEN
      -- `is_called = true`, so the *next* value is max_id + 1 rather than max_id
      PERFORM setval(rec.seqname::regclass, max_id, true);
      RAISE NOTICE 'resynced %: sequence % -> %',
        rec.seqname, coalesce(seq_last::text, 'unused'), max_id;
    END IF;
  END LOOP;
END $$;

-- Down Migration

-- Intentionally empty. The inverse would be to move sequences *back* behind
-- existing ids, which is the broken state this exists to leave — and doing so
-- would hand out ids that are already taken.
SELECT 1;
