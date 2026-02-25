-- Add domain column to leetcode_problems table
ALTER TABLE leetcode_problems ADD COLUMN domain TEXT DEFAULT 'leetcode';

-- Update all existing rows to have domain='leetcode'
UPDATE leetcode_problems SET domain = 'leetcode' WHERE domain IS NULL;

-- Create index on domain column for efficient filtering
CREATE INDEX IF NOT EXISTS idx_leetcode_problems_domain ON leetcode_problems(domain);
