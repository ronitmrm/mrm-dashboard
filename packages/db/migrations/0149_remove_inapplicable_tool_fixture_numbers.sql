-- Numbering recommendations belong only to the conventional production floors.
-- Remove generated data from every retained snapshot, preserving other content.
UPDATE derived.dashboard_read_models
SET payload = payload
  #- '{productionFloorSnapshots,cnc,toolFixtureNumbers}'
  #- '{productionFloorSnapshots,forging,toolFixtureNumbers}'
WHERE payload #> '{productionFloorSnapshots,cnc,toolFixtureNumbers}' IS NOT NULL
   OR payload #> '{productionFloorSnapshots,forging,toolFixtureNumbers}' IS NOT NULL;
