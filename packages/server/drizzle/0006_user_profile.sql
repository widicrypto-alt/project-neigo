ALTER TABLE users
  ADD COLUMN IF NOT EXISTS profile_age integer,
  ADD COLUMN IF NOT EXISTS profile_gender varchar(30),
  ADD COLUMN IF NOT EXISTS profile_pronouns varchar(40),
  ADD COLUMN IF NOT EXISTS profile_bio text;
