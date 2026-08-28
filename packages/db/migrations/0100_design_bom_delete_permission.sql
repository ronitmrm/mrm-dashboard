-- Design saves replace their nested BOM rows atomically, so the web role
-- needs narrowly scoped delete access to those replaceable child rows.
GRANT DELETE ON
  sales.design_bom_lines
TO mrmpl_web;
