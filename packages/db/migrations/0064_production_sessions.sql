CREATE TABLE manufacturing.production_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  work_order_id uuid NOT NULL REFERENCES manufacturing.work_orders(id),
  route_option_id uuid NOT NULL REFERENCES manufacturing.route_options(id),
  operation_setup_id uuid NOT NULL REFERENCES manufacturing.operation_setups(id),
  machine_id uuid NOT NULL REFERENCES catalog.machines(id),
  operator_employee_id uuid NOT NULL REFERENCES workforce.employees(id),
  production_date date NOT NULL,
  shift text NOT NULL CHECK (length(btrim(shift)) > 0),
  measurement_method text NOT NULL
    CHECK (measurement_method IN ('weight', 'counter')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed')),
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  end_reason text CHECK (
    end_reason IS NULL OR end_reason IN (
      'operator_change', 'shift_change', 'item_complete',
      'job_change', 'manual_stop'
    )
  ),
  start_count bigint CHECK (start_count IS NULL OR start_count >= 0),
  end_count bigint CHECK (end_count IS NULL OR end_count >= 0),
  carried_from_session_id uuid
    REFERENCES manufacturing.production_sessions(id),
  gross_weight_kg numeric(20,3)
    CHECK (gross_weight_kg IS NULL OR gross_weight_kg >= 0),
  crate_count integer CHECK (crate_count IS NULL OR crate_count >= 0),
  crate_weight_kg numeric(20,3)
    CHECK (crate_weight_kg IS NULL OR crate_weight_kg >= 0),
  net_weight_kg numeric(20,3)
    CHECK (net_weight_kg IS NULL OR net_weight_kg >= 0),
  piece_weight_grams numeric(20,3) NOT NULL
    CHECK (piece_weight_grams > 0),
  total_pieces bigint NOT NULL DEFAULT 0 CHECK (total_pieces >= 0),
  quantity_good bigint NOT NULL DEFAULT 0 CHECK (quantity_good >= 0),
  quantity_rejected bigint NOT NULL DEFAULT 0 CHECK (quantity_rejected >= 0),
  production_entry_id uuid REFERENCES manufacturing.production_entries(id),
  started_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  closed_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  reversed_at timestamptz,
  reversal_reason text,
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (ended_at IS NULL OR ended_at >= started_at),
  CHECK (
    (measurement_method = 'counter' AND start_count IS NOT NULL)
    OR measurement_method = 'weight'
  ),
  CHECK (
    (status = 'open' AND ended_at IS NULL AND end_reason IS NULL)
    OR (status = 'closed' AND ended_at IS NOT NULL AND end_reason IS NOT NULL)
  )
);

CREATE UNIQUE INDEX production_sessions_one_open_machine_unique
  ON manufacturing.production_sessions (machine_id)
  WHERE status = 'open' AND reversed_at IS NULL;

CREATE INDEX production_sessions_floor_day_idx
  ON manufacturing.production_sessions (
    organization_id, production_date DESC, machine_id
  )
  WHERE reversed_at IS NULL;

CREATE INDEX production_sessions_context_end_idx
  ON manufacturing.production_sessions (
    machine_id, ended_at DESC, work_order_id, operation_setup_id
  )
  WHERE status = 'closed' AND reversed_at IS NULL;

CREATE TABLE manufacturing.production_session_downtime_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  production_session_id uuid NOT NULL
    REFERENCES manufacturing.production_sessions(id),
  reason_code text NOT NULL CHECK (length(btrim(reason_code)) > 0),
  reason_name text NOT NULL CHECK (length(btrim(reason_name)) > 0),
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  entered_role text NOT NULL
    CHECK (entered_role IN ('quality', 'shop_floor', 'machinist')),
  entered_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz,
  reversal_reason text,
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (ended_at > started_at)
);

CREATE INDEX production_session_downtime_session_time_idx
  ON manufacturing.production_session_downtime_events (
    production_session_id, started_at
  )
  WHERE reversed_at IS NULL;

CREATE TABLE manufacturing.production_session_rejection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  production_session_id uuid NOT NULL
    REFERENCES manufacturing.production_sessions(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  type_code text NOT NULL CHECK (length(btrim(type_code)) > 0),
  type_name text NOT NULL CHECK (length(btrim(type_name)) > 0),
  reason_code text NOT NULL CHECK (length(btrim(reason_code)) > 0),
  reason_name text NOT NULL CHECK (length(btrim(reason_name)) > 0),
  remark_code text NOT NULL CHECK (length(btrim(remark_code)) > 0),
  remark_name text NOT NULL CHECK (length(btrim(remark_name)) > 0),
  entered_role text NOT NULL CHECK (entered_role = 'quality'),
  entered_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz,
  reversal_reason text,
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX production_session_rejection_session_time_idx
  ON manufacturing.production_session_rejection_events (
    production_session_id, recorded_at
  )
  WHERE reversed_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON
  manufacturing.production_sessions,
  manufacturing.production_session_downtime_events,
  manufacturing.production_session_rejection_events
TO mrmpl_web;

GRANT SELECT ON
  manufacturing.production_sessions,
  manufacturing.production_session_downtime_events,
  manufacturing.production_session_rejection_events
TO mrmpl_worker, mrmpl_reporting;
