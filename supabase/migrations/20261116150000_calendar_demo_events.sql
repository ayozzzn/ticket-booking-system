/*
# Demo events for the calendar (Nov 2026 - Jan 2027)

- Only sample data, so the calendar is not empty on a new database. Fixed IDs, safe to run twice.
- The events and venues are made up for the demo. Delete or edit them in the admin panel (Calendar or Events tab).
- Times are Almaty time (+05:00). Prices are USD cents like every other price in the project.
- Real events are added in the admin panel: Admin > Calendar > pick a day > "Add event on this date".
*/

INSERT INTO events (id, title, description, category, venue, city, starts_at) VALUES
('20000000-0000-4000-8000-000000000101', 'Kazakh Short Films Night', 'A screening of award-winning short films from young Kazakh directors, followed by a Q&A with the filmmakers.', 'Cinema', 'Arman Cinema Hall', 'Astana', '2026-11-18 19:00:00+05'),
('20000000-0000-4000-8000-000000000102', 'Winter Pop Night', 'An evening of pop hits with a live band and a light show.', 'Concert', 'Almaty Arena', 'Almaty', '2026-11-20 20:00:00+05'),
('20000000-0000-4000-8000-000000000103', 'Hockey: Astana vs Almaty', 'The big league derby. Loud fans, fast hockey.', 'Sports', 'Barys Arena', 'Astana', '2026-11-22 18:00:00+05'),
('20000000-0000-4000-8000-000000000104', 'Swan Lake', 'The classic ballet performed by the full company with live orchestra.', 'Theatre', 'Abay Opera House', 'Almaty', '2026-11-25 19:30:00+05'),
('20000000-0000-4000-8000-000000000105', 'Family Animation Day', 'Three animated films in one afternoon. Popcorn included.', 'Cinema', 'Kinopark Hall 3', 'Almaty', '2026-11-29 15:00:00+05'),
('20000000-0000-4000-8000-000000000106', 'Jazz at the Opera', 'The city jazz orchestra plays modern classics with guest soloists.', 'Concert', 'Astana Opera', 'Astana', '2026-12-03 19:00:00+05'),
('20000000-0000-4000-8000-000000000107', 'Football: Kairat vs Tobol', 'A league match. Gates open two hours before kick-off.', 'Sports', 'Central Stadium', 'Almaty', '2026-12-06 14:00:00+05'),
('20000000-0000-4000-8000-000000000108', 'Symphonic Rock', 'Famous rock songs played by a symphony orchestra and a rock band.', 'Concert', 'Palace of Independence', 'Astana', '2026-12-06 20:00:00+05'),
('20000000-0000-4000-8000-000000000109', 'The Cherry Orchard', 'A new staging of Chekhov''s last play, with a young cast.', 'Theatre', 'Auezov Drama Theatre', 'Almaty', '2026-12-12 19:00:00+05'),
('20000000-0000-4000-8000-000000000110', 'Classic Cinema: Silent Film with Live Piano', 'A silent classic with a pianist playing live.', 'Cinema', 'Arman Cinema Hall', 'Astana', '2026-12-14 18:00:00+05'),
('20000000-0000-4000-8000-000000000111', 'Electronic Winter Fest', 'DJs from Kazakhstan and abroad, a long night of electronic music.', 'Concert', 'Almaty Arena', 'Almaty', '2026-12-19 21:00:00+05'),
('20000000-0000-4000-8000-000000000112', 'Figure Skating Gala', 'Top skaters perform their best programs in a winter gala show.', 'Sports', 'Barys Arena', 'Astana', '2026-12-20 17:00:00+05'),
('20000000-0000-4000-8000-000000000113', 'The Nutcracker', 'The New Year ballet for all the family.', 'Theatre', 'Abay Opera House', 'Almaty', '2026-12-26 19:00:00+05'),
('20000000-0000-4000-8000-000000000114', 'New Year Concert Under the Stars', 'Live music before midnight and fireworks at 00:00. Dress warm.', 'Concert', 'Republic Square', 'Almaty', '2026-12-31 22:00:00+05'),
('20000000-0000-4000-8000-000000000115', 'New Year Gala Concert', 'Opera and ballet stars perform favourite pieces.', 'Concert', 'Astana Opera', 'Astana', '2027-01-09 19:00:00+05'),
('20000000-0000-4000-8000-000000000116', 'Director''s Cut Night', 'A cult film in its director''s cut, with an introduction from a film critic.', 'Cinema', 'Kinopark Hall 1', 'Almaty', '2027-01-16 20:00:00+05'),
('20000000-0000-4000-8000-000000000117', 'Winter Cup Final', 'The final of the indoor winter cup.', 'Sports', 'Central Stadium', 'Almaty', '2027-01-23 18:00:00+05'),
('20000000-0000-4000-8000-000000000118', 'Folk Music Evening', 'Dombra, kobyz and modern arrangements by the national folk ensemble.', 'Concert', 'Palace of Independence', 'Astana', '2027-01-30 19:00:00+05')
ON CONFLICT (id) DO NOTHING;

INSERT INTO ticket_tiers (id, event_id, name, description, price_cents, capacity, sold) VALUES
('10000000-0000-4000-8000-000000000501', '20000000-0000-4000-8000-000000000101', 'Standard', 'Any seat', 600, 150, 0),
('10000000-0000-4000-8000-000000000502', '20000000-0000-4000-8000-000000000102', 'Standard', 'Seated', 3500, 400, 0),
('10000000-0000-4000-8000-000000000503', '20000000-0000-4000-8000-000000000102', 'Fan Zone', 'Standing, close to the stage', 6000, 150, 0),
('10000000-0000-4000-8000-000000000504', '20000000-0000-4000-8000-000000000103', 'Standard', 'Upper tier', 1500, 500, 0),
('10000000-0000-4000-8000-000000000505', '20000000-0000-4000-8000-000000000103', 'Premium', 'Lower tier, centre', 4000, 120, 0),
('10000000-0000-4000-8000-000000000506', '20000000-0000-4000-8000-000000000104', 'Balcony', 'Balcony seats', 3000, 120, 0),
('10000000-0000-4000-8000-000000000507', '20000000-0000-4000-8000-000000000104', 'Stalls', 'Central stalls', 7000, 80, 0),
('10000000-0000-4000-8000-000000000508', '20000000-0000-4000-8000-000000000105', 'Child', 'Up to 12 years', 400, 100, 0),
('10000000-0000-4000-8000-000000000509', '20000000-0000-4000-8000-000000000105', 'Adult', '', 600, 100, 0),
('10000000-0000-4000-8000-000000000510', '20000000-0000-4000-8000-000000000106', 'Standard', 'Seated', 4000, 250, 0),
('10000000-0000-4000-8000-000000000511', '20000000-0000-4000-8000-000000000106', 'VIP', 'First rows', 9000, 40, 0),
('10000000-0000-4000-8000-000000000512', '20000000-0000-4000-8000-000000000107', 'Standard', 'East stand', 1200, 600, 0),
('10000000-0000-4000-8000-000000000513', '20000000-0000-4000-8000-000000000107', 'Premium', 'West stand, covered', 3500, 200, 0),
('10000000-0000-4000-8000-000000000514', '20000000-0000-4000-8000-000000000108', 'Standard', 'Seated', 4500, 300, 0),
('10000000-0000-4000-8000-000000000515', '20000000-0000-4000-8000-000000000109', 'Standard', 'Seated', 2500, 180, 0),
('10000000-0000-4000-8000-000000000516', '20000000-0000-4000-8000-000000000109', 'Premium', 'Best seats', 5500, 40, 0),
('10000000-0000-4000-8000-000000000517', '20000000-0000-4000-8000-000000000110', 'Standard', 'Any seat', 750, 120, 0),
('10000000-0000-4000-8000-000000000518', '20000000-0000-4000-8000-000000000111', 'Early bird', 'First tickets', 3000, 300, 0),
('10000000-0000-4000-8000-000000000519', '20000000-0000-4000-8000-000000000111', 'Standard', '', 4500, 500, 0),
('10000000-0000-4000-8000-000000000520', '20000000-0000-4000-8000-000000000112', 'Standard', '', 3000, 350, 0),
('10000000-0000-4000-8000-000000000521', '20000000-0000-4000-8000-000000000112', 'Premium', 'Near the ice', 7000, 60, 0),
('10000000-0000-4000-8000-000000000522', '20000000-0000-4000-8000-000000000113', 'Balcony', '', 3500, 120, 0),
('10000000-0000-4000-8000-000000000523', '20000000-0000-4000-8000-000000000113', 'Stalls', '', 8000, 80, 0),
('10000000-0000-4000-8000-000000000524', '20000000-0000-4000-8000-000000000114', 'Standard', 'Standing', 5000, 800, 0),
('10000000-0000-4000-8000-000000000525', '20000000-0000-4000-8000-000000000115', 'Standard', '', 5000, 250, 0),
('10000000-0000-4000-8000-000000000526', '20000000-0000-4000-8000-000000000115', 'VIP', '', 12000, 40, 0),
('10000000-0000-4000-8000-000000000527', '20000000-0000-4000-8000-000000000116', 'Standard', '', 650, 160, 0),
('10000000-0000-4000-8000-000000000528', '20000000-0000-4000-8000-000000000117', 'Standard', '', 1500, 500, 0),
('10000000-0000-4000-8000-000000000529', '20000000-0000-4000-8000-000000000117', 'Premium', '', 4000, 100, 0),
('10000000-0000-4000-8000-000000000530', '20000000-0000-4000-8000-000000000118', 'Standard', '', 3000, 300, 0),
('10000000-0000-4000-8000-000000000531', '20000000-0000-4000-8000-000000000118', 'Premium', '', 6500, 60, 0)
ON CONFLICT (id) DO NOTHING;
