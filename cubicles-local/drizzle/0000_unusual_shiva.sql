CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"target" text,
	"detail" jsonb,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_state" (
	"id" integer PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"revision" bigint DEFAULT 1 NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"seq" serial PRIMARY KEY NOT NULL,
	"id" uuid NOT NULL,
	"name" text NOT NULL,
	"text" text NOT NULL,
	"time" bigint NOT NULL,
	"player_id" text,
	"system" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"created_at" bigint NOT NULL,
	"seen" bigint NOT NULL,
	"x" double precision NOT NULL,
	"z" double precision NOT NULL,
	"rotation" double precision DEFAULT 0 NOT NULL,
	"avatar" text DEFAULT 'classic' NOT NULL,
	"color" text DEFAULT '#a6b79a' NOT NULL,
	"dancing" boolean DEFAULT false NOT NULL,
	"last_message" bigint,
	"last_sticker" bigint,
	"fishing_at" bigint
);
