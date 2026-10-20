CREATE TABLE "class_announcements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"class_id" integer NOT NULL,
	"author_id" text NOT NULL,
	"position" integer NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_submissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"class_id" integer NOT NULL,
	"position" integer NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "class_submissions_task_user_unique" UNIQUE("task_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "class_tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"class_id" integer NOT NULL,
	"author_id" text NOT NULL,
	"position" integer NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" text,
	"visibility" text NOT NULL,
	"position" integer NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "office_layouts" (
	"id" integer PRIMARY KEY NOT NULL,
	"zone_id" integer NOT NULL,
	"position" integer NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reward_grants" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"submission_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "reward_grants_task_user_unique" UNIQUE("task_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"role" text NOT NULL,
	"class_id" integer NOT NULL,
	"office_id" integer NOT NULL,
	"position" integer NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_office_id_unique" UNIQUE("office_id")
);
--> statement-breakpoint
CREATE TABLE "world_buildings" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" uuid,
	"position" integer NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zones" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "class_announcements" ADD CONSTRAINT "class_announcements_class_id_zones_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_announcements" ADD CONSTRAINT "class_announcements_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_submissions" ADD CONSTRAINT "class_submissions_task_id_class_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."class_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_submissions" ADD CONSTRAINT "class_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_submissions" ADD CONSTRAINT "class_submissions_class_id_zones_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_tasks" ADD CONSTRAINT "class_tasks_class_id_zones_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_tasks" ADD CONSTRAINT "class_tasks_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_assets" ADD CONSTRAINT "model_assets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_layouts" ADD CONSTRAINT "office_layouts_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_grants" ADD CONSTRAINT "reward_grants_task_id_class_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."class_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_grants" ADD CONSTRAINT "reward_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_grants" ADD CONSTRAINT "reward_grants_submission_id_class_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."class_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_class_id_zones_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_buildings" ADD CONSTRAINT "world_buildings_asset_id_model_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."model_assets"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "class_announcements" ALTER CONSTRAINT "class_announcements_class_id_zones_id_fk" DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "class_announcements" ALTER CONSTRAINT "class_announcements_author_id_users_id_fk" DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "class_submissions" ALTER CONSTRAINT "class_submissions_task_id_class_tasks_id_fk" DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "class_submissions" ALTER CONSTRAINT "class_submissions_user_id_users_id_fk" DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "class_submissions" ALTER CONSTRAINT "class_submissions_class_id_zones_id_fk" DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "class_tasks" ALTER CONSTRAINT "class_tasks_class_id_zones_id_fk" DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "class_tasks" ALTER CONSTRAINT "class_tasks_author_id_users_id_fk" DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "model_assets" ALTER CONSTRAINT "model_assets_owner_id_users_id_fk" DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "office_layouts" ALTER CONSTRAINT "office_layouts_zone_id_zones_id_fk" DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "reward_grants" ALTER CONSTRAINT "reward_grants_task_id_class_tasks_id_fk" DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "reward_grants" ALTER CONSTRAINT "reward_grants_user_id_users_id_fk" DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "reward_grants" ALTER CONSTRAINT "reward_grants_submission_id_class_submissions_id_fk" DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "users" ALTER CONSTRAINT "users_class_id_zones_id_fk" DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "world_buildings" ALTER CONSTRAINT "world_buildings_asset_id_model_assets_id_fk" DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_username_unique";
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE ("username") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_office_id_unique";
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_office_id_unique" UNIQUE ("office_id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "class_submissions" DROP CONSTRAINT "class_submissions_task_user_unique";
--> statement-breakpoint
ALTER TABLE "class_submissions" ADD CONSTRAINT "class_submissions_task_user_unique" UNIQUE ("task_id", "user_id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "reward_grants" DROP CONSTRAINT "reward_grants_task_user_unique";
--> statement-breakpoint
ALTER TABLE "reward_grants" ADD CONSTRAINT "reward_grants_task_user_unique" UNIQUE ("task_id", "user_id") DEFERRABLE INITIALLY DEFERRED;
