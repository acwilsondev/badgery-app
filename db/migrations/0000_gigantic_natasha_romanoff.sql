CREATE TABLE IF NOT EXISTS "achievements" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "badge_id" integer NOT NULL,
        "status" text DEFAULT 'in_progress' NOT NULL,
        "awarded_at" timestamp,
        "awarded_by" integer,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "created_by" integer,
        "updated_at" timestamp,
        "updated_by" integer,
        "active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "badge_categories" (
        "id" serial PRIMARY KEY NOT NULL,
        "name" text NOT NULL,
        "organization_id" integer NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "created_by" integer,
        "updated_at" timestamp,
        "updated_by" integer,
        "active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "badge_metrics" (
        "badge_id" integer NOT NULL,
        "metric_id" integer NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "created_by" integer,
        "updated_at" timestamp,
        "updated_by" integer,
        "active" boolean DEFAULT true NOT NULL,
        PRIMARY KEY ("badge_id", "metric_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "badge_prerequisites" (
        "badge_id" integer NOT NULL,
        "prerequisite_badge_id" integer NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "created_by" integer,
        "updated_at" timestamp,
        "updated_by" integer,
        "active" boolean DEFAULT true NOT NULL,
        PRIMARY KEY ("badge_id", "prerequisite_badge_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "progress" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "metric_id" integer NOT NULL,
        "value" text NOT NULL,
        "last_updated_at" timestamp DEFAULT now() NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "created_by" integer,
        "updated_at" timestamp,
        "updated_by" integer,
        "active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "badges" (
        "id" serial PRIMARY KEY NOT NULL,
        "name" text NOT NULL,
        "description" text NOT NULL,
        "criteria" text,
        "image_url" text,
        "color" text DEFAULT '#4F46E5',
        "category_id" integer,
        "organization_id" integer NOT NULL,
        "requires_progress" boolean DEFAULT false NOT NULL,
        "criteria_sections" jsonb,
        "criteria_type" text DEFAULT 'binary' NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "created_by" integer,
        "updated_at" timestamp,
        "updated_by" integer,
        "active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "metrics" (
        "id" serial PRIMARY KEY NOT NULL,
        "name" text NOT NULL,
        "description" text NOT NULL,
        "type" text NOT NULL,
        "target_value" integer NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "created_by" integer,
        "updated_at" timestamp,
        "updated_by" integer,
        "active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organizations" (
        "id" serial PRIMARY KEY NOT NULL,
        "name" text NOT NULL,
        "description" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "created_by" integer,
        "updated_at" timestamp,
        "updated_by" integer,
        "active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_organization" (
        "user_id" integer NOT NULL,
        "organization_id" integer NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "created_by" integer,
        "updated_at" timestamp,
        "updated_by" integer,
        "active" boolean DEFAULT true NOT NULL,
        PRIMARY KEY ("user_id", "organization_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_organization_scope" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "organization_id" integer NOT NULL,
        "scope" text NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "created_by" integer,
        "updated_at" timestamp,
        "updated_by" integer,
        "active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
        "id" serial PRIMARY KEY NOT NULL,
        "username" text NOT NULL,
        "password" text NOT NULL,
        "name" text NOT NULL,
        "email" text NOT NULL,
        "role" text DEFAULT 'user' NOT NULL,
        "organization_id" integer,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "created_by" integer,
        "updated_at" timestamp,
        "updated_by" integer,
        "active" boolean DEFAULT true NOT NULL,
        CONSTRAINT "users_username_unique" UNIQUE("username"),
        CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "achievements" ADD CONSTRAINT "achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "achievements" ADD CONSTRAINT "achievements_badge_id_badges_id_fk" FOREIGN KEY ("badge_id") REFERENCES "public"."badges"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "achievements" ADD CONSTRAINT "achievements_awarded_by_users_id_fk" FOREIGN KEY ("awarded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "badge_categories" ADD CONSTRAINT "badge_categories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "badge_metrics" ADD CONSTRAINT "badge_metrics_badge_id_badges_id_fk" FOREIGN KEY ("badge_id") REFERENCES "public"."badges"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "badge_metrics" ADD CONSTRAINT "badge_metrics_metric_id_metrics_id_fk" FOREIGN KEY ("metric_id") REFERENCES "public"."metrics"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "badge_prerequisites" ADD CONSTRAINT "badge_prerequisites_badge_id_badges_id_fk" FOREIGN KEY ("badge_id") REFERENCES "public"."badges"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "badge_prerequisites" ADD CONSTRAINT "badge_prerequisites_prerequisite_badge_id_badges_id_fk" FOREIGN KEY ("prerequisite_badge_id") REFERENCES "public"."badges"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "progress" ADD CONSTRAINT "progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "progress" ADD CONSTRAINT "progress_metric_id_metrics_id_fk" FOREIGN KEY ("metric_id") REFERENCES "public"."metrics"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "badges" ADD CONSTRAINT "badges_category_id_badge_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."badge_categories"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "badges" ADD CONSTRAINT "badges_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_organization" ADD CONSTRAINT "user_organization_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_organization" ADD CONSTRAINT "user_organization_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_organization_scope" ADD CONSTRAINT "user_organization_scope_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_organization_scope" ADD CONSTRAINT "user_organization_scope_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint
-- Data migration section

-- 1. Migrate users to have many-to-many relationship with organizations
INSERT INTO "user_organization" ("user_id", "organization_id")
SELECT "id", "organization_id" FROM "users"
WHERE "organization_id" IS NOT NULL
ON CONFLICT DO NOTHING;

-- 2. Create some basic metrics from existing badges with criteria sections
INSERT INTO "metrics" ("name", "description", "type", "target_value")
SELECT 
  b."name" || ' - Completion', 
  COALESCE(b."description", 'Complete this requirement'), 
  COALESCE(b."criteria_type", 'binary'),
  CASE WHEN COALESCE(b."criteria_type", 'binary') = 'binary' THEN 1 ELSE 100 END
FROM "badges" b
WHERE b."requires_progress" = true
ON CONFLICT DO NOTHING;

-- 3. Link badges to their metrics
INSERT INTO "badge_metrics" ("badge_id", "metric_id")
SELECT b."id", m."id"
FROM "badges" b
JOIN "metrics" m ON m."name" = b."name" || ' - Completion'
WHERE b."requires_progress" = true
ON CONFLICT DO NOTHING;

-- 4. Migrate awarded_badges to achievements if the table exists
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'awarded_badges') THEN
    INSERT INTO "achievements" (
      "id", "user_id", "badge_id", "status", "awarded_at", "awarded_by", 
      "created_at"
    )
    SELECT 
      "id", "user_id", "badge_id", "status", "awarded_at", "awarded_by", 
      "awarded_at"
    FROM "awarded_badges"
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- 5. Migrate badge_progress to progress if the table exists
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'badge_progress') THEN
    INSERT INTO "progress" (
      "id", "user_id", "metric_id", "value", "last_updated_at",
      "created_at", "updated_by"
    )
    SELECT 
      bp."id", 
      bp."user_id",
      m."id",
      bp."progress"::text,
      bp."last_updated",
      bp."last_updated",
      bp."updated_by"
    FROM "badge_progress" bp
    JOIN "badges" b ON bp."badge_id" = b."id"
    JOIN "badge_metrics" bm ON b."id" = bm."badge_id"
    JOIN "metrics" m ON bm."metric_id" = m."id"
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
