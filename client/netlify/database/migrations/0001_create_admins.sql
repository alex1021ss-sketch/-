-- Stores admin login credentials for the management dashboard.
-- Passwords are never stored in plain text; password_hash holds a
-- salted scrypt digest in the form "<salt>:<derivedKey>".
CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
