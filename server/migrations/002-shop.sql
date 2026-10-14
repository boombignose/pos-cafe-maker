CREATE TABLE shop_settings (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 name text NOT NULL DEFAULT 'ร้านคาเฟ่', address text NOT NULL DEFAULT '',
 phone text NOT NULL DEFAULT '', paper text NOT NULL DEFAULT '80' CHECK(paper IN ('58','80'))
);
INSERT INTO shop_settings(singleton) VALUES(true);
ALTER TABLE orders ADD COLUMN shop jsonb;
INSERT INTO schema_migrations(version) VALUES(2);
