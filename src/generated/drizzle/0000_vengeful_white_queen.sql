CREATE TABLE "post" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text,
	"description" text,
	"author_id" uuid NOT NULL,
	"created_at" timestamp(6) with time zone DEFAULT now(),
	"updated_at" timestamp(6) with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "site" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"display_name" text,
	"files" jsonb NOT NULL,
	"transcript" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"design_system" jsonb,
	"publish_state" text DEFAULT 'draft' NOT NULL,
	"deployed_url" text,
	"domain" text,
	"created_at" timestamp(6) with time zone DEFAULT now(),
	"updated_at" timestamp(6) with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_provider_id" uuid NOT NULL,
	"created_at" timestamp(6) with time zone DEFAULT now(),
	"updated_at" timestamp(6) with time zone DEFAULT now(),
	CONSTRAINT "user_identityProviderId_unique" UNIQUE("identity_provider_id")
);
--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "post_id_index" ON "post" USING btree ("id");--> statement-breakpoint
CREATE INDEX "post_author_id_index" ON "post" USING btree ("author_id");--> statement-breakpoint
CREATE UNIQUE INDEX "site_id_index" ON "site" USING btree ("id");--> statement-breakpoint
CREATE UNIQUE INDEX "site_organization_id_name_index" ON "site" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "site_organization_id_index" ON "site" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_id_index" ON "user" USING btree ("id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_identity_provider_id_index" ON "user" USING btree ("identity_provider_id");