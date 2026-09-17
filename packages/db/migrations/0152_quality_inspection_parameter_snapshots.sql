-- Keep inspection evidence independent of subsequent engineering changes.
ALTER TABLE quality.first_piece_readings ADD COLUMN parameter_snapshot jsonb;
ALTER TABLE quality.hourly_check_readings ADD COLUMN parameter_snapshot jsonb;

UPDATE quality.first_piece_readings reading
SET parameter_snapshot = to_jsonb(parameter)
FROM quality.parameter_definitions parameter
WHERE parameter.id = reading.parameter_definition_id;

UPDATE quality.hourly_check_readings reading
SET parameter_snapshot = to_jsonb(parameter)
FROM quality.parameter_definitions parameter
WHERE parameter.id = reading.parameter_definition_id;
