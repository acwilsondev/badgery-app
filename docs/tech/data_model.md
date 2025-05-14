- All options have
- Created On (linux epoch millis)
- Created By (user fk)
- Updated On (linux epoch millis)
- Updated By (user fk)
- Active (boolean)

User

- id (PK)
- name
- email
- password
- etc.

Organization

- id (PK)
- name
- description

UserOrganization (Join table)

- user_id (FK → User)
- organization_id (FK → Organization)

UserOrganizationScope

- id (PK)
- user_id (FK → User)
- organization_id (FK → Organization)
- scope (string or enum) -- e.g., 'grant_achievement', 'revoke_achievement', 'edit_badge', 'viewer'

Badge

- id (PK)
- organization_id (FK → Organization)
- name
- description

BadgePrerequisite (Join table for prerequisites)

- badge_id (FK → Badge)
- prerequisite_badge_id (FK → Badge)

Metric

- id (PK)
- name
- description
- type ('boolean' | 'numeric')
- target_value (int) -- e.g., 1 for boolean true, or 100 for numeric goal

BadgeMetric (Join table between Badges and Metrics)

- badge_id (FK → Badge)
- metric_id (FK → Metric)

Achievement

- id (PK)
- user_id (FK → User)
- badge_id (FK → Badge)
- status ('in_progress', 'achieved')
- awarded_at (nullable)

Progress

- id (PK)
- user_id (FK → User)
- metric_id (FK → Metric)
- value (bool or numeric depending on Metric type)
- updated_at

Key Relationships

- A User can belong to many Organizations.
- A Badge belongs to a single Organization.
- A Badge can require many Metrics and other Badges.
- An Achievement tracks a User's progress toward or completion of a Badge.
- Progress records how a User is doing on each Metric.
- Metric types dictate how to evaluate completion (boolean or numeric threshold logic).
