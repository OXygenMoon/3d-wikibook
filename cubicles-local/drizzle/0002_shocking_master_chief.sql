CREATE TABLE "source_classes" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"namespace" text NOT NULL,
	"subject" text NOT NULL,
	"zone_id" integer NOT NULL,
	"position" integer NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "source_classes_subject_unique" UNIQUE("provider","namespace","subject"),
	CONSTRAINT "source_classes_zone_unique" UNIQUE("provider","namespace","zone_id")
);
--> statement-breakpoint
CREATE TABLE "source_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"namespace" text NOT NULL,
	"subject" text NOT NULL,
	"position" integer NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "source_groups_subject_unique" UNIQUE("provider","namespace","subject")
);
--> statement-breakpoint
CREATE TABLE "source_identities" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"namespace" text NOT NULL,
	"subject" text NOT NULL,
	"user_id" text NOT NULL,
	"position" integer NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "source_identities_subject_unique" UNIQUE("provider","namespace","subject"),
	CONSTRAINT "source_identities_user_unique" UNIQUE("provider","namespace","user_id")
);
--> statement-breakpoint
CREATE TABLE "source_memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"user_id" text NOT NULL,
	"position" integer NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "source_memberships_group_user_unique" UNIQUE("group_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "source_classes" ADD CONSTRAINT "source_classes_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_identities" ADD CONSTRAINT "source_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_memberships" ADD CONSTRAINT "source_memberships_group_id_source_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."source_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_memberships" ADD CONSTRAINT "source_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "source_classes" DROP CONSTRAINT "source_classes_zone_unique";
--> statement-breakpoint
ALTER TABLE "source_classes" ADD CONSTRAINT "source_classes_zone_unique" UNIQUE ("provider", "namespace", "zone_id") DEFERRABLE INITIALLY DEFERRED;
