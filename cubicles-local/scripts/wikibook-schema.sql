BEGIN TRANSACTION READ ONLY;
SELECT json_build_object(
  'kind', 'wikibook-live-schema-baseline',
  'version', 1,
  'readOnly', true,
  'userRowsRead', false,
  'tables', (
    SELECT json_agg(json_build_object(
      'name', table_name,
      'columns', (
        SELECT json_agg(json_build_object(
          'name', column_name,
          'dataType', data_type,
          'udt', udt_name,
          'nullable', is_nullable = 'YES'
        ) ORDER BY ordinal_position)
        FROM information_schema.columns columns
        WHERE columns.table_schema = tables.table_schema AND columns.table_name = tables.table_name
      )
    ) ORDER BY table_name)
    FROM information_schema.tables tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  )
);
ROLLBACK;
