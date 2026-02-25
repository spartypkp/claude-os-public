-- Add received_at to email_classifications so UI shows when email arrived, not when classified
ALTER TABLE email_classifications ADD COLUMN received_at TEXT;
