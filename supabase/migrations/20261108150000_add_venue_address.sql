
ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS venue_address text;
