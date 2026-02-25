-- Add new classification fields for AI pipeline
-- summary: one-line AI-generated summary
-- requires_response: whether the email needs a reply
-- response_deadline: urgency tier ('today', 'this_week', 'none')
-- matched_signals: JSON array of context signals that influenced classification

ALTER TABLE email_classifications ADD COLUMN summary TEXT;
ALTER TABLE email_classifications ADD COLUMN requires_response BOOLEAN DEFAULT 0;
ALTER TABLE email_classifications ADD COLUMN response_deadline TEXT;
ALTER TABLE email_classifications ADD COLUMN matched_signals TEXT;
