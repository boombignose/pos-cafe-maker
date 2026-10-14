CREATE TABLE recovery_acknowledgements (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id),
 checkout_key text NOT NULL, source_epoch text NOT NULL, reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO schema_migrations(version) VALUES(3);
