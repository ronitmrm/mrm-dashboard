# Maintenance Module Notes

- 2026-07-13: Planned machine maintenance is stored through `dataEntries` rather than a new Convex table.
- `maintenance_schedule` is keyed by machine number plus maintenance code, so saving the same machine/code updates the schedule.
- `maintenance_task` is keyed by task id or machine number plus maintenance code plus completed date, preserving completion history.
- The Maintenance tab reads machines from `productionControl.machinePlanningRows` / `machine_master`, schedules from `productionControl.maintenanceScheduleRows`, and completions from `productionControl.maintenanceTaskRows`.
- Due tasks are calculated in the UI from first due date or latest completion plus frequency days. Inactive schedules are ignored.
- 2026-07-13: Maintenance checklists are stored as maintenance_checklist_master rows keyed by checklist code, sequence, and step code. A maintenance_schedule may reference checklistCode; when a maintenance task is marked done, the completion payload stores checklistSteps with the entered step results.