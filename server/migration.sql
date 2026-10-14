CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY, username text NOT NULL UNIQUE, password_hash text NOT NULL,
 role text NOT NULL CHECK(role IN ('owner','cashier','bar')), active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
 token_digest text PRIMARY KEY, user_id uuid REFERENCES users(id), csrf_token text NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT now() + interval '12 hours'
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE TABLE IF NOT EXISTS login_limits (
 key text PRIMARY KEY, attempts integer NOT NULL, window_start timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ingredients (
 id uuid PRIMARY KEY, name text NOT NULL, unit text NOT NULL,
 stock numeric(18,6) NOT NULL DEFAULT 0 CHECK(stock>=0), low_stock numeric(18,6) NOT NULL DEFAULT 0 CHECK(low_stock>=0)
);
CREATE TABLE IF NOT EXISTS menus (
 id uuid PRIMARY KEY, name text NOT NULL, category text NOT NULL,
 price_satang bigint NOT NULL CHECK(price_satang>=0 AND price_satang<=1000000000), active boolean NOT NULL DEFAULT true,
 recipe jsonb NOT NULL DEFAULT '[]', options jsonb NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS shifts (
 id uuid PRIMARY KEY, opened_by uuid NOT NULL REFERENCES users(id), opened_at timestamptz NOT NULL DEFAULT now(),
 opening_cash_satang bigint NOT NULL CHECK(opening_cash_satang>=0), expected_cash_satang bigint NOT NULL CHECK(expected_cash_satang>=0),
 closed_at timestamptz, closed_by uuid REFERENCES users(id), counted_cash_satang bigint CHECK(counted_cash_satang>=0), difference_satang bigint
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_shift ON shifts((true)) WHERE closed_at IS NULL;
CREATE TABLE IF NOT EXISTS queues (day date PRIMARY KEY, last_number integer NOT NULL CHECK(last_number>0));
CREATE TABLE IF NOT EXISTS orders (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), shift_id uuid NOT NULL REFERENCES shifts(id),
 day date NOT NULL, queue_number integer NOT NULL, status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','preparing','ready','completed','refunded')),
 total_satang bigint NOT NULL CHECK(total_satang>=0), amount_tendered_satang bigint NOT NULL, change_satang bigint NOT NULL CHECK(change_satang>=0),
 payment_method text NOT NULL CHECK(payment_method IN ('cash','transfer')), created_at timestamptz NOT NULL DEFAULT now(),
 items jsonb NOT NULL, consumption jsonb NOT NULL, UNIQUE(day,queue_number)
);
CREATE INDEX IF NOT EXISTS orders_day_idx ON orders(day);
CREATE TABLE IF NOT EXISTS refunds (
 order_id uuid PRIMARY KEY REFERENCES orders(id), user_id uuid NOT NULL REFERENCES users(id), reason text NOT NULL,
 restocked boolean NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS idempotency (
 operation text NOT NULL, key text NOT NULL, body_hash text NOT NULL, user_id uuid NOT NULL REFERENCES users(id),
 response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(operation,key)
);
CREATE TABLE IF NOT EXISTS stock_movements (
 id uuid PRIMARY KEY, ingredient_id uuid NOT NULL REFERENCES ingredients(id), quantity numeric(18,6) NOT NULL,
 reason text NOT NULL, user_id uuid NOT NULL REFERENCES users(id), order_id uuid REFERENCES orders(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION keep_order_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') THEN
  RAISE EXCEPTION 'Paid order snapshots are immutable';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS order_snapshot_immutable ON orders;
CREATE TRIGGER order_snapshot_immutable BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION keep_order_snapshot();
CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
INSERT INTO schema_migrations(version) VALUES(1) ON CONFLICT DO NOTHING;
