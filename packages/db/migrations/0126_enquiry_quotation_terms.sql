-- Optional values chosen from commercial masters and retained on each enquiry.
ALTER TABLE sales.enquiries
  ADD COLUMN brass_material_specs text,
  ADD COLUMN reports text,
  ADD COLUMN taxes_and_duties text;
