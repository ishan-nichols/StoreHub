CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"actor_user_id" uuid,
	"event_name" varchar(120) NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "phone_otps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" varchar(50) NOT NULL,
	"otp_hash" varchar(255) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(255) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"device_info" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "social_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(50) NOT NULL,
	"provider_user_id" varchar(255) NOT NULL,
	"provider_email" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_accounts_provider_provider_user_id_unique" UNIQUE("provider","provider_user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255),
	"full_name" varchar(255) NOT NULL,
	"password_hash" varchar(255),
	"email_verified" boolean DEFAULT false NOT NULL,
	"phone_number" varchar(50),
	"role" varchar(20) DEFAULT 'business_owner' NOT NULL,
	"business_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	"locked_until" timestamp with time zone,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_number_unique" UNIQUE("phone_number")
);
--> statement-breakpoint
CREATE TABLE "webauthn_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge" text NOT NULL,
	"user_id" uuid,
	"email" varchar(255),
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webauthn_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"credential_id" text NOT NULL,
	"public_key" text NOT NULL,
	"device_name" varchar(255),
	"counter" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webauthn_credentials_credential_id_unique" UNIQUE("credential_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_owner_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"website" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(255) DEFAULT '' NOT NULL,
	"phone" varchar(50),
	"email" varchar(255),
	"notes" text,
	"loyalty_points" double precision DEFAULT 0 NOT NULL,
	"total_spent" double precision DEFAULT 0 NOT NULL,
	"visit_count" integer DEFAULT 0 NOT NULL,
	"last_visit_at" timestamp with time zone,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_pay_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"work_date" varchar(10) NOT NULL,
	"days_worked" numeric(3, 2) DEFAULT '1' NOT NULL,
	"daily_rate" numeric(10, 2) NOT NULL,
	"total_pay" numeric(10, 2) NOT NULL,
	"note" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"role" varchar(100) DEFAULT '' NOT NULL,
	"pin" varchar(20) DEFAULT '' NOT NULL,
	"hourly_wage" double precision DEFAULT 0 NOT NULL,
	"payroll_type" varchar(20) DEFAULT 'hourly' NOT NULL,
	"daily_wage" numeric(10, 2) DEFAULT '0',
	"job_title" varchar(100),
	"permissions" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"description" varchar(500) DEFAULT '' NOT NULL,
	"amount" double precision DEFAULT 0 NOT NULL,
	"category" varchar(100) DEFAULT '' NOT NULL,
	"date" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"unit" varchar(50) DEFAULT 'each' NOT NULL,
	"stock_quantity" numeric(10, 3) DEFAULT '0' NOT NULL,
	"low_stock_threshold" numeric(10, 3) DEFAULT '0' NOT NULL,
	"cost_per_unit" numeric(10, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"type" varchar(30) NOT NULL,
	"points_change" double precision NOT NULL,
	"points_balance_before" double precision NOT NULL,
	"points_balance_after" double precision NOT NULL,
	"sale_amount" double precision,
	"reward_used" varchar(100),
	"sale_id" uuid,
	"notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"category" varchar(100),
	"price" numeric(10, 2) NOT NULL,
	"recipe_id" uuid,
	"available" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(500) NOT NULL,
	"sku" varchar(100) DEFAULT '' NOT NULL,
	"category" varchar(100) DEFAULT '' NOT NULL,
	"price" double precision DEFAULT 0 NOT NULL,
	"quantity" double precision DEFAULT 0 NOT NULL,
	"low_stock_threshold" double precision DEFAULT 0 NOT NULL,
	"supplier_id" uuid,
	"unit" varchar(30) DEFAULT 'unit' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"barcode" varchar(100),
	"brand" varchar(255),
	"image_url" text,
	"size" varchar(100),
	"cost_price" double precision,
	"srp" double precision,
	"margin_alert_pct" double precision,
	"price_history" jsonb,
	"pos_sync_status" varchar(30),
	"pos_sync_error" text,
	"last_cost_change_at" timestamp with time zone,
	"last_price_change_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"quantity" numeric(10, 3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"category" varchar(100),
	"yield_quantity" numeric(10, 3) DEFAULT '1' NOT NULL,
	"yield_unit" varchar(50) DEFAULT 'serving' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"description" varchar(500) DEFAULT '' NOT NULL,
	"amount" double precision DEFAULT 0 NOT NULL,
	"category" varchar(100) DEFAULT '' NOT NULL,
	"frequency" varchar(20) DEFAULT 'monthly' NOT NULL,
	"day_of_week" integer,
	"day_of_month" integer,
	"month_of_year" integer,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_processed" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subtotal" double precision DEFAULT 0 NOT NULL,
	"tax" double precision DEFAULT 0 NOT NULL,
	"total" double precision DEFAULT 0 NOT NULL,
	"amount_paid" double precision DEFAULT 0 NOT NULL,
	"change" double precision DEFAULT 0 NOT NULL,
	"receipt_number" varchar(100) DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"customer_phone" varchar(50),
	"customer_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_price_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"product_id" uuid,
	"product_name" varchar(500) DEFAULT '' NOT NULL,
	"new_price" double precision DEFAULT 0 NOT NULL,
	"original_price" double precision DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"employee_id" uuid,
	"employee_name" varchar(255) DEFAULT '' NOT NULL,
	"shift_start" timestamp with time zone DEFAULT now() NOT NULL,
	"shift_end" timestamp with time zone,
	"hours_worked" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shrinkage_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"product_id" uuid,
	"product_name" varchar(500) NOT NULL,
	"category" varchar(100) DEFAULT '' NOT NULL,
	"expected_qty" double precision NOT NULL,
	"actual_qty" double precision NOT NULL,
	"discrepancy" double precision NOT NULL,
	"cost_per_unit" double precision DEFAULT 0 NOT NULL,
	"total_cost_impact" double precision DEFAULT 0 NOT NULL,
	"resolved_as" varchar(30),
	"resolved_at" timestamp with time zone,
	"notes" text,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"business_id" uuid,
	"name" varchar(255) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"address_line1" varchar(500),
	"city" varchar(255),
	"state_code" varchar(20),
	"postal_code" varchar(32),
	"country" varchar(2),
	"latitude" double precision,
	"longitude" double precision,
	"tax_rate_override" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid,
	"store_name" varchar(255) DEFAULT '' NOT NULL,
	"owner_name" varchar(255) DEFAULT '' NOT NULL,
	"business_type" varchar(50) DEFAULT 'other' NOT NULL,
	"num_employees" integer DEFAULT 0 NOT NULL,
	"pain_point" varchar(50) DEFAULT 'inventory' NOT NULL,
	"currency" varchar(10) DEFAULT 'USD' NOT NULL,
	"currency_symbol" varchar(8) DEFAULT '$' NOT NULL,
	"language" varchar(10) DEFAULT 'en' NOT NULL,
	"theme" varchar(20) DEFAULT 'light' NOT NULL,
	"accent_color" varchar(16),
	"tax_rate" double precision DEFAULT 0 NOT NULL,
	"opening_hours" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"pre_seed_data" boolean DEFAULT false NOT NULL,
	"feature_usage_count" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"store_city" varchar(255),
	"store_address" varchar(500),
	"printer_name" varchar(255),
	"printer_connection" varchar(20),
	"country" varchar(2),
	"state_code" varchar(20),
	"onboarding_version" integer,
	"store_size" varchar(20),
	"current_system" varchar(50),
	"current_pos_system" varchar(50),
	"pain_points" jsonb,
	"stock_outs" jsonb,
	"supplier_style" varchar(50),
	"schedule_style" varchar(50),
	"goal" varchar(50),
	"storage_mode" varchar(20) DEFAULT 'cloud' NOT NULL,
	"onboarding_progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"onboarding_current_step" varchar(100),
	"store_latitude" double precision,
	"store_longitude" double precision,
	"tax_jurisdiction_key" varchar(64),
	"tax_jurisdiction_confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_updated" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"contact_name" varchar(255) DEFAULT '' NOT NULL,
	"phone" varchar(50) DEFAULT '' NOT NULL,
	"email" varchar(255) DEFAULT '' NOT NULL,
	"product_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reorder_notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"system_id" varchar(50) NOT NULL,
	"status" varchar(30) DEFAULT 'disconnected' NOT NULL,
	"credentials" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webauthn_challenges" ADD CONSTRAINT "webauthn_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webauthn_credentials" ADD CONSTRAINT "webauthn_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_business_owner_id_users_id_fk" FOREIGN KEY ("business_owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_pay_records" ADD CONSTRAINT "daily_pay_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_pay_records" ADD CONSTRAINT "daily_pay_records_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_price_changes" ADD CONSTRAINT "scheduled_price_changes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_price_changes" ADD CONSTRAINT "scheduled_price_changes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shrinkage_log" ADD CONSTRAINT "shrinkage_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_locations" ADD CONSTRAINT "store_locations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_locations" ADD CONSTRAINT "store_locations_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_profiles" ADD CONSTRAINT "store_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_profiles" ADD CONSTRAINT "store_profiles_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_integrations" ADD CONSTRAINT "user_integrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_events_user_idx" ON "analytics_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "analytics_events_name_created_idx" ON "analytics_events" USING btree ("event_name","created_at");--> statement-breakpoint
CREATE INDEX "users_business_id_idx" ON "users" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "businesses_business_owner_id_idx" ON "businesses" USING btree ("business_owner_id");--> statement-breakpoint
CREATE INDEX "customers_user_idx" ON "customers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "customers_phone_idx" ON "customers" USING btree ("user_id","phone");--> statement-breakpoint
CREATE INDEX "employees_user_idx" ON "employees" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "expenses_user_idx" ON "expenses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "loyalty_txn_user_idx" ON "loyalty_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "loyalty_txn_customer_idx" ON "loyalty_transactions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "loyalty_txn_date_idx" ON "loyalty_transactions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "products_user_idx" ON "products" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "products_sku_idx" ON "products" USING btree ("user_id","sku");--> statement-breakpoint
CREATE INDEX "products_barcode_idx" ON "products" USING btree ("user_id","barcode");--> statement-breakpoint
CREATE INDEX "recurring_expenses_user_idx" ON "recurring_expenses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sales_user_idx" ON "sales" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sales_user_date_idx" ON "sales" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "sched_price_user_idx" ON "scheduled_price_changes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shifts_user_idx" ON "shifts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shrinkage_log_user_idx" ON "shrinkage_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shrinkage_log_date_idx" ON "shrinkage_log" USING btree ("user_id","detected_at");--> statement-breakpoint
CREATE INDEX "store_locations_user_idx" ON "store_locations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "store_locations_business_id_idx" ON "store_locations" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "store_profiles_business_id_idx" ON "store_profiles" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "suppliers_user_idx" ON "suppliers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_integrations_user_idx" ON "user_integrations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_integrations_user_system_idx" ON "user_integrations" USING btree ("user_id","system_id");