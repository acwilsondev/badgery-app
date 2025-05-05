-- Add criteria_type column to badges table
ALTER TABLE badges ADD COLUMN IF NOT EXISTS criteria_type TEXT NOT NULL DEFAULT 'binary';

-- Set existing badges to the appropriate criteria type
UPDATE badges SET criteria_type = 'numeric', requires_progress = TRUE WHERE criteria IS NOT NULL AND criteria != '';

-- Update all existing badges to have criteria sections if they don't already
UPDATE badges SET criteria_sections = 
  CASE 
    WHEN criteria_sections IS NULL THEN 
      jsonb_build_array(
        jsonb_build_object(
          'title', 'Requirements',
          'description', 'Complete these requirements to earn the badge',
          'items', jsonb_build_array(
            jsonb_build_object(
              'id', 'item-1',
              'text', COALESCE(criteria, description),
              'description', NULL,
              'value', 100
            )
          )
        )
      )
    ELSE criteria_sections
  END
WHERE requires_progress = TRUE;