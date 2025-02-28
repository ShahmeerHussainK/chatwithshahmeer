
-- Check if winners_processed column exists, if not add it
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'auctions' 
        AND column_name = 'winners_processed'
    ) THEN
        ALTER TABLE auctions ADD COLUMN winners_processed BOOLEAN DEFAULT FALSE;
    END IF;
END
$$;

-- Update existing auctions to make sure they process correctly
UPDATE auctions 
SET winners_processed = FALSE 
WHERE ends_at < NOW() AND winners_processed IS NULL;
