-- Email verification: users start 'pending' and activate via an emailed link.
ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN verify_token TEXT NOT NULL DEFAULT '';
