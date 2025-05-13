-- Add audit fields to existing tables

-- Organizations
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS created_by INTEGER,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS updated_by INTEGER,
ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE NOT NULL;

-- Users
ALTER TABLE users 
DROP COLUMN IF EXISTS organization_id, -- Remove direct organization reference
ADD COLUMN IF NOT EXISTS created_by INTEGER,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS updated_by INTEGER,
ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE NOT NULL;

-- Badge Categories
ALTER TABLE badge_categories
ADD COLUMN IF NOT EXISTS created_by INTEGER,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS updated_by INTEGER,
ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE NOT NULL;

-- Badges
ALTER TABLE badges
DROP COLUMN IF EXISTS requires_progress,
DROP COLUMN IF EXISTS criteria_sections,
DROP COLUMN IF EXISTS criteria_type,
DROP COLUMN IF EXISTS criteria,
ADD COLUMN IF NOT EXISTS created_by INTEGER,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS updated_by INTEGER,
ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE NOT NULL;

-- Create new join tables

-- User-Organization mapping (many-to-many)
CREATE TABLE IF NOT EXISTS user_organization (
  user_id INTEGER NOT NULL REFERENCES users(id),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by INTEGER,
  updated_at TIMESTAMP,
  updated_by INTEGER,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (user_id, organization_id)
);

-- User Organization Scopes/Permissions
CREATE TABLE IF NOT EXISTS user_organization_scope (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  scope TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by INTEGER,
  updated_at TIMESTAMP,
  updated_by INTEGER,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Badge Prerequisites
CREATE TABLE IF NOT EXISTS badge_prerequisites (
  badge_id INTEGER NOT NULL REFERENCES badges(id),
  prerequisite_badge_id INTEGER NOT NULL REFERENCES badges(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by INTEGER,
  updated_at TIMESTAMP,
  updated_by INTEGER,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (badge_id, prerequisite_badge_id)
);

-- Metrics
CREATE TABLE IF NOT EXISTS metrics (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  type TEXT NOT NULL, -- 'boolean' or 'numeric'
  target_value INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by INTEGER,
  updated_at TIMESTAMP,
  updated_by INTEGER,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Badge Metrics (join table)
CREATE TABLE IF NOT EXISTS badge_metrics (
  badge_id INTEGER NOT NULL REFERENCES badges(id),
  metric_id INTEGER NOT NULL REFERENCES metrics(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by INTEGER,
  updated_at TIMESTAMP,
  updated_by INTEGER,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (badge_id, metric_id)
);

-- Achievements (replaces awarded_badges)
CREATE TABLE IF NOT EXISTS achievements (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  badge_id INTEGER NOT NULL REFERENCES badges(id),
  status TEXT NOT NULL DEFAULT 'in_progress',
  awarded_at TIMESTAMP,
  awarded_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by INTEGER,
  updated_at TIMESTAMP,
  updated_by INTEGER,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Progress (replaces badge_progress)
CREATE TABLE IF NOT EXISTS progress (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  metric_id INTEGER NOT NULL REFERENCES metrics(id),
  value TEXT NOT NULL,
  last_updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by INTEGER,
  updated_at TIMESTAMP,
  updated_by INTEGER,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Migrate existing data (this needs to be done carefully to preserve existing data)

-- 1. Migrate users to have multiple organizations
INSERT INTO user_organization (user_id, organization_id)
SELECT id, organization_id FROM users 
WHERE organization_id IS NOT NULL;

-- 2. Migrate awarded_badges to achievements
INSERT INTO achievements (
  id, user_id, badge_id, status, awarded_at, awarded_by, 
  created_at, created_by
)
SELECT 
  id, user_id, badge_id, status, awarded_at, awarded_by, 
  created_at, awarded_by
FROM awarded_badges;

-- 3. Create metrics from badge criteria sections
-- This is a complex migration that depends on the structure of the criteria_sections JSON
-- A placeholder query that would need to be customized:

-- Find all badges that have criteria sections
WITH badge_criteria AS (
  SELECT 
    id AS badge_id,
    jsonb_array_elements(
      CASE 
        WHEN criteria_sections IS NULL OR criteria_sections::text = 'null' THEN '[{"title": "Requirements", "criteria": [{"id": 1, "name": "Complete the badge", "description": "Satisfy all requirements"}]}]'::jsonb
        WHEN jsonb_typeof(criteria_sections) = 'string' THEN (criteria_sections::text)::jsonb
        ELSE criteria_sections
      END
    ) AS section
  FROM badges
  WHERE criteria_sections IS NOT NULL OR criteria_type IS NOT NULL
)
-- For each section, create metrics
INSERT INTO metrics (name, description, type, target_value, created_at)
SELECT 
  (section->>'title') || ' - ' || (json_array_elements(section->'criteria')->>'name') AS name,
  COALESCE(json_array_elements(section->'criteria')->>'description', 'Complete this requirement') AS description,
  COALESCE(b.criteria_type, 'binary') AS type,
  CASE 
    WHEN COALESCE(b.criteria_type, 'binary') = 'binary' THEN 1
    ELSE COALESCE((json_array_elements(section->'criteria')->>'maxValue')::integer, 100)
  END AS target_value,
  NOW() AS created_at
FROM badge_criteria bc
JOIN badges b ON bc.badge_id = b.id
ON CONFLICT DO NOTHING;

-- 4. Link badges to metrics
WITH badge_criteria AS (
  SELECT 
    id AS badge_id,
    jsonb_array_elements(
      CASE 
        WHEN criteria_sections IS NULL OR criteria_sections::text = 'null' THEN '[{"title": "Requirements", "criteria": [{"id": 1, "name": "Complete the badge", "description": "Satisfy all requirements"}]}]'::jsonb
        WHEN jsonb_typeof(criteria_sections) = 'string' THEN (criteria_sections::text)::jsonb
        ELSE criteria_sections
      END
    ) AS section
  FROM badges
  WHERE criteria_sections IS NOT NULL OR criteria_type IS NOT NULL
)
INSERT INTO badge_metrics (badge_id, metric_id, created_at)
SELECT 
  bc.badge_id,
  m.id AS metric_id,
  NOW() AS created_at
FROM badge_criteria bc
CROSS JOIN LATERAL json_array_elements(bc.section->'criteria') AS criteria
JOIN metrics m ON 
  (bc.section->>'title') || ' - ' || (criteria->>'name') = m.name
ON CONFLICT DO NOTHING;

-- 5. Migrate badge_progress to progress
INSERT INTO progress (
  id, user_id, metric_id, value, last_updated_at,
  created_at, created_by, updated_by
)
SELECT 
  bp.id, 
  bp.user_id,
  m.id AS metric_id,
  CASE
    WHEN COALESCE(b.criteria_type, 'binary') = 'binary' THEN 
      CASE WHEN bp.progress::numeric > 0 THEN 'true' ELSE 'false' END
    ELSE 
      bp.progress::text
  END AS value,
  bp.last_updated,
  bp.last_updated,
  bp.updated_by,
  bp.updated_by
FROM badge_progress bp
JOIN badges b ON bp.badge_id = b.id
JOIN badge_metrics bm ON b.id = bm.badge_id
JOIN metrics m ON bm.metric_id = m.id
ON CONFLICT DO NOTHING;