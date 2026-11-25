-- ============================================================================
-- Library Management System — Seed Data
-- 3 Floors, 60 Seats + 3 Group Rooms with (x, y) coordinates on a 1000x600 map
-- 18 Curated Books (5 featured in the 3D hero), Default Settings, Holidays,
-- Welcome Announcement, and 24-hour Historical Occupancy Snapshots
-- ============================================================================

-- 1. Default Settings (singleton row id = 1)
insert into public.settings (
  id, open_time, close_time, max_bookings_per_day, max_hours_per_day,
  early_entry_min, no_show_min, book_limit, book_pickup_hours, book_loan_days,
  allowed_email_domain, timezone
)
values (
  1, '08:00', '22:00', 2, 8.0,
  15, 15, 1, 24, 14,
  '', 'Asia/Kolkata'
)
on conflict (id) do nothing;

-- 2. Floors (Fixed deterministic UUIDs so seed is idempotent)
insert into public.floors (id, name, level, description) values
  ('11111111-1111-4111-8111-111111111101', 'Ground Floor — Commons & Reference', 1, 'Open reading hall, quick-access reference desks, power bar, and collaborative study room.'),
  ('11111111-1111-4111-8111-111111111102', 'Second Floor — Silent Study Wing', 2, 'Whisper-quiet individual carrels, sunlit window desks, and dedicated focus pods.'),
  ('11111111-1111-4111-8111-111111111103', 'Third Floor — Research & Group Suites', 3, 'Deep-work research alcoves, dual-monitor power desks, and bookable discussion rooms.')
on conflict (level) do nothing;

-- 3. Seats across 3 floors (canvas coordinate system: 0..1000 x 0..600)
insert into public.seats (floor_id, section, table_no, seat_no, label, seat_type, capacity, x, y) values
  -- ================= FLOOR 1: Ground Floor (20 desks + 1 Group Room) =================
  -- Section: Reading Hall (Tables T1 - T3, 4 seats each)
  ('11111111-1111-4111-8111-111111111101', 'Reading Hall', 'T1', 'S1', 'F1-T1-S1', 'desk', 1, 130, 120),
  ('11111111-1111-4111-8111-111111111101', 'Reading Hall', 'T1', 'S2', 'F1-T1-S2', 'desk', 1, 210, 120),
  ('11111111-1111-4111-8111-111111111101', 'Reading Hall', 'T1', 'S3', 'F1-T1-S3', 'desk', 1, 130, 200),
  ('11111111-1111-4111-8111-111111111101', 'Reading Hall', 'T1', 'S4', 'F1-T1-S4', 'desk', 1, 210, 200),

  ('11111111-1111-4111-8111-111111111101', 'Reading Hall', 'T2', 'S1', 'F1-T2-S1', 'desk', 1, 370, 120),
  ('11111111-1111-4111-8111-111111111101', 'Reading Hall', 'T2', 'S2', 'F1-T2-S2', 'desk', 1, 450, 120),
  ('11111111-1111-4111-8111-111111111101', 'Reading Hall', 'T2', 'S3', 'F1-T2-S3', 'desk', 1, 370, 200),
  ('11111111-1111-4111-8111-111111111101', 'Reading Hall', 'T2', 'S4', 'F1-T2-S4', 'desk', 1, 450, 200),

  ('11111111-1111-4111-8111-111111111101', 'Reading Hall', 'T3', 'S1', 'F1-T3-S1', 'desk', 1, 130, 370),
  ('11111111-1111-4111-8111-111111111101', 'Reading Hall', 'T3', 'S2', 'F1-T3-S2', 'desk', 1, 210, 370),
  ('11111111-1111-4111-8111-111111111101', 'Reading Hall', 'T3', 'S3', 'F1-T3-S3', 'desk', 1, 130, 450),
  ('11111111-1111-4111-8111-111111111101', 'Reading Hall', 'T3', 'S4', 'F1-T3-S4', 'desk', 1, 210, 450),

  -- Section: Power Bar (Tables P1 - P2, 4 seats each)
  ('11111111-1111-4111-8111-111111111101', 'Power Bar', 'P1', 'S1', 'F1-P1-S1', 'power', 1, 370, 370),
  ('11111111-1111-4111-8111-111111111101', 'Power Bar', 'P1', 'S2', 'F1-P1-S2', 'power', 1, 450, 370),
  ('11111111-1111-4111-8111-111111111101', 'Power Bar', 'P1', 'S3', 'F1-P1-S3', 'power', 1, 370, 450),
  ('11111111-1111-4111-8111-111111111101', 'Power Bar', 'P1', 'S4', 'F1-P1-S4', 'power', 1, 450, 450),

  -- Section: Window Bays (Table W1)
  ('11111111-1111-4111-8111-111111111101', 'Window Bays', 'W1', 'S1', 'F1-W1-S1', 'power', 1, 670, 120),
  ('11111111-1111-4111-8111-111111111101', 'Window Bays', 'W1', 'S2', 'F1-W1-S2', 'power', 1, 770, 120),
  ('11111111-1111-4111-8111-111111111101', 'Window Bays', 'W1', 'S3', 'F1-W1-S3', 'power', 1, 670, 210),
  ('11111111-1111-4111-8111-111111111101', 'Window Bays', 'W1', 'S4', 'F1-W1-S4', 'power', 1, 770, 210),

  -- Section: Group Rooms
  ('11111111-1111-4111-8111-111111111101', 'Group Rooms', 'R1', 'RM', 'F1-ROOM-A', 'group_room', 6, 760, 420),

  -- ================= FLOOR 2: Silent Study Wing (20 desks + 1 Group Room) =================
  -- Section: Quiet Carrels (Tables Q1 - Q3)
  ('11111111-1111-4111-8111-111111111102', 'Quiet Carrels', 'Q1', 'S1', 'F2-Q1-S1', 'quiet', 1, 130, 120),
  ('11111111-1111-4111-8111-111111111102', 'Quiet Carrels', 'Q1', 'S2', 'F2-Q1-S2', 'quiet', 1, 220, 120),
  ('11111111-1111-4111-8111-111111111102', 'Quiet Carrels', 'Q1', 'S3', 'F2-Q1-S3', 'quiet', 1, 130, 210),
  ('11111111-1111-4111-8111-111111111102', 'Quiet Carrels', 'Q1', 'S4', 'F2-Q1-S4', 'quiet', 1, 220, 210),

  ('11111111-1111-4111-8111-111111111102', 'Quiet Carrels', 'Q2', 'S1', 'F2-Q2-S1', 'quiet', 1, 380, 120),
  ('11111111-1111-4111-8111-111111111102', 'Quiet Carrels', 'Q2', 'S2', 'F2-Q2-S2', 'quiet', 1, 470, 120),
  ('11111111-1111-4111-8111-111111111102', 'Quiet Carrels', 'Q2', 'S3', 'F2-Q2-S3', 'quiet', 1, 380, 210),
  ('11111111-1111-4111-8111-111111111102', 'Quiet Carrels', 'Q2', 'S4', 'F2-Q2-S4', 'quiet', 1, 470, 210),

  ('11111111-1111-4111-8111-111111111102', 'Quiet Carrels', 'Q3', 'S1', 'F2-Q3-S1', 'quiet', 1, 130, 380),
  ('11111111-1111-4111-8111-111111111102', 'Quiet Carrels', 'Q3', 'S2', 'F2-Q3-S2', 'quiet', 1, 220, 380),
  ('11111111-1111-4111-8111-111111111102', 'Quiet Carrels', 'Q3', 'S3', 'F2-Q3-S3', 'quiet', 1, 130, 470),
  ('11111111-1111-4111-8111-111111111102', 'Quiet Carrels', 'Q3', 'S4', 'F2-Q3-S4', 'quiet', 1, 220, 470),

  -- Section: Focus Pods (Tables F1 - F2)
  ('11111111-1111-4111-8111-111111111102', 'Focus Pods', 'FP1', 'S1', 'F2-FP1-S1', 'power', 1, 380, 380),
  ('11111111-1111-4111-8111-111111111102', 'Focus Pods', 'FP1', 'S2', 'F2-FP1-S2', 'power', 1, 470, 380),
  ('11111111-1111-4111-8111-111111111102', 'Focus Pods', 'FP1', 'S3', 'F2-FP1-S3', 'power', 1, 380, 470),
  ('11111111-1111-4111-8111-111111111102', 'Focus Pods', 'FP1', 'S4', 'F2-FP1-S4', 'power', 1, 470, 470),

  -- Section: North Alcove
  ('11111111-1111-4111-8111-111111111102', 'North Alcove', 'NA1', 'S1', 'F2-NA1-S1', 'quiet', 1, 690, 120),
  ('11111111-1111-4111-8111-111111111102', 'North Alcove', 'NA1', 'S2', 'F2-NA1-S2', 'quiet', 1, 790, 120),
  ('11111111-1111-4111-8111-111111111102', 'North Alcove', 'NA1', 'S3', 'F2-NA1-S3', 'quiet', 1, 690, 210),
  ('11111111-1111-4111-8111-111111111102', 'North Alcove', 'NA1', 'S4', 'F2-NA1-S4', 'quiet', 1, 790, 210),

  -- Section: Group Rooms
  ('11111111-1111-4111-8111-111111111102', 'Group Rooms', 'R2', 'RM', 'F2-ROOM-B', 'group_room', 6, 760, 420),

  -- ================= FLOOR 3: Research & Group Suites (16 desks + 2 Group Rooms) =================
  -- Section: Research Alcoves (Tables RS1 - RS2)
  ('11111111-1111-4111-8111-111111111103', 'Research Alcoves', 'RS1', 'S1', 'F3-RS1-S1', 'power', 1, 130, 120),
  ('11111111-1111-4111-8111-111111111103', 'Research Alcoves', 'RS1', 'S2', 'F3-RS1-S2', 'power', 1, 220, 120),
  ('11111111-1111-4111-8111-111111111103', 'Research Alcoves', 'RS1', 'S3', 'F3-RS1-S3', 'power', 1, 130, 210),
  ('11111111-1111-4111-8111-111111111103', 'Research Alcoves', 'RS1', 'S4', 'F3-RS1-S4', 'power', 1, 220, 210),

  ('11111111-1111-4111-8111-111111111103', 'Research Alcoves', 'RS2', 'S1', 'F3-RS2-S1', 'power', 1, 380, 120),
  ('11111111-1111-4111-8111-111111111103', 'Research Alcoves', 'RS2', 'S2', 'F3-RS2-S2', 'power', 1, 470, 120),
  ('11111111-1111-4111-8111-111111111103', 'Research Alcoves', 'RS2', 'S3', 'F3-RS2-S3', 'power', 1, 380, 210),
  ('11111111-1111-4111-8111-111111111103', 'Research Alcoves', 'RS2', 'S4', 'F3-RS2-S4', 'power', 1, 470, 210),

  -- Section: Digital Lab (Tables DL1 - DL2)
  ('11111111-1111-4111-8111-111111111103', 'Digital Lab', 'DL1', 'S1', 'F3-DL1-S1', 'power', 1, 130, 380),
  ('11111111-1111-4111-8111-111111111103', 'Digital Lab', 'DL1', 'S2', 'F3-DL1-S2', 'power', 1, 220, 380),
  ('11111111-1111-4111-8111-111111111103', 'Digital Lab', 'DL1', 'S3', 'F3-DL1-S3', 'power', 1, 130, 470),
  ('11111111-1111-4111-8111-111111111103', 'Digital Lab', 'DL1', 'S4', 'F3-DL1-S4', 'power', 1, 220, 470),

  ('11111111-1111-4111-8111-111111111103', 'Digital Lab', 'DL2', 'S1', 'F3-DL2-S1', 'quiet', 1, 380, 380),
  ('11111111-1111-4111-8111-111111111103', 'Digital Lab', 'DL2', 'S2', 'F3-DL2-S2', 'quiet', 1, 470, 380),
  ('11111111-1111-4111-8111-111111111103', 'Digital Lab', 'DL2', 'S3', 'F3-DL2-S3', 'quiet', 1, 380, 470),
  ('11111111-1111-4111-8111-111111111103', 'Digital Lab', 'DL2', 'S4', 'F3-DL2-S4', 'quiet', 1, 470, 470),

  -- Section: Group Suites
  ('11111111-1111-4111-8111-111111111103', 'Group Rooms', 'R3', 'RM', 'F3-ROOM-C', 'group_room', 8, 760, 180),
  ('11111111-1111-4111-8111-111111111103', 'Group Rooms', 'R4', 'RM', 'F3-ROOM-D', 'group_room', 10, 760, 420)
on conflict (label) do nothing;

-- 4. Curated Books Catalogue (5 hero-featured + 13 additional academic & classic titles)
insert into public.books (title, author, isbn, category, description, cover_url, published_year, shelf_location, status, featured_in_hero) values
  ('Designing Data-Intensive Applications', 'Martin Kleppmann', '978-1449373320', 'Computer Science', 'The big ideas behind reliable, scalable, and maintainable distributed systems.', 'https://images.unsplash.com/photo-1532012197267-da84d127e765?auto=format&fit=crop&w=400&q=80', 2017, 'F1-CS-01', 'available', true),
  ('The Feynman Lectures on Physics', 'Richard P. Feynman', '978-0465023820', 'Physics', 'Timeless lectures covering mechanics, radiation, heat, electromagnetism, and quantum mechanics.', 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=400&q=80', 2011, 'F2-PH-04', 'available', true),
  ('Structure and Interpretation of Computer Programs', 'Harold Abelson & Gerald Jay Sussman', '978-0262510875', 'Computer Science', 'Foundational text on abstraction, recursion, and programming language design.', 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=400&q=80', 1996, 'F1-CS-02', 'available', true),
  ('Sapiens: A Brief History of Humankind', 'Yuval Noah Harari', '978-0062316097', 'History', 'A sweeping narrative of human evolution from the Cognitive Revolution to the modern age.', 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&w=400&q=80', 2015, 'F1-HI-12', 'available', true),
  ('Deep Learning', 'Ian Goodfellow, Yoshua Bengio & Aaron Courville', '978-0262035613', 'AI & Machine Learning', 'Comprehensive mathematical and conceptual foundation for modern neural networks.', 'https://images.unsplash.com/photo-1589998059171-988d887df646?auto=format&fit=crop&w=400&q=80', 2016, 'F3-AI-01', 'available', true),
  ('Introduction to Algorithms (CLRS)', 'Thomas H. Cormen et al.', '978-0262046305', 'Computer Science', 'The definitive graduate and undergraduate guide to algorithms and data structures.', 'https://images.unsplash.com/photo-1495446815901-a7297e633e8d?auto=format&fit=crop&w=400&q=80', 2022, 'F1-CS-05', 'available', false),
  ('Linear Algebra Done Right', 'Sheldon Axler', '978-3031410253', 'Mathematics', 'Elegant determinant-free approach to vector spaces, eigenvalues, and inner products.', 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=400&q=80', 2024, 'F2-MA-02', 'available', false),
  ('Clean Architecture', 'Robert C. Martin', '978-0134494166', 'Software Engineering', 'A craftsman guide to software structure, boundaries, and maintainable design.', 'https://images.unsplash.com/photo-1516979187457-637abb4f9353?auto=format&fit=crop&w=400&q=80', 2017, 'F1-SE-03', 'available', false),
  ('Thinking, Fast and Slow', 'Daniel Kahneman', '978-0374533557', 'Psychology', 'Nobel laureate exploration of System 1 and System 2 cognitive decision-making.', 'https://images.unsplash.com/photo-1476275466078-4007374efbbe?auto=format&fit=crop&w=400&q=80', 2011, 'F2-PS-07', 'available', false),
  ('The Art of Electronics', 'Paul Horowitz & Winfield Hill', '978-0521809269', 'Electrical Engineering', 'Hands-on reference to analog and digital circuit design for engineers.', 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=400&q=80', 2015, 'F3-EE-01', 'available', false),
  ('Molecular Biology of the Cell', 'Bruce Alberts et al.', '978-0393884821', 'Biology', 'Authoritative modern synthesis of cell structure, genetics, and molecular pathways.', 'https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&w=400&q=80', 2022, 'F2-BI-09', 'available', false),
  ('Principles of Economics', 'N. Gregory Mankiw', '978-0357722718', 'Economics', 'Clear, modern introduction to microeconomics, macroeconomics, and policy.', 'https://images.unsplash.com/photo-1519682337058-a94d519337bc?auto=format&fit=crop&w=400&q=80', 2023, 'F1-EC-04', 'available', false),
  ('Operating System Concepts', 'Abraham Silberschatz', '978-1119800361', 'Computer Science', 'Processes, scheduling, virtual memory, storage, and distributed OS architecture.', 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=400&q=80', 2021, 'F1-CS-09', 'available', false),
  ('The Design of Everyday Things', 'Don Norman', '978-0465050659', 'Design', 'Classic study of affordances, signifiers, feedback, and human-centered design.', 'https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?auto=format&fit=crop&w=400&q=80', 2013, 'F1-DS-02', 'available', false),
  ('Database Internals', 'Alex Petrov', '978-1492040347', 'Computer Science', 'Deep dive into B-trees, LSM trees, consensus algorithms, and distributed storage.', 'https://images.unsplash.com/photo-1506880018603-83d5b814b5a6?auto=format&fit=crop&w=400&q=80', 2019, 'F3-CS-11', 'available', false),
  ('Meditations', 'Marcus Aurelius', '978-0812968255', 'Philosophy', 'Personal writings of the Roman Emperor on Stoic ethics, focus, and resilience.', 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=400&q=80', 2003, 'F2-PL-01', 'available', false),
  ('Pattern Recognition and Machine Learning', 'Christopher M. Bishop', '978-0387310732', 'AI & Machine Learning', 'Bayesian inference, graphical models, kernel methods, and probabilistic ML.', 'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?auto=format&fit=crop&w=400&q=80', 2006, 'F3-AI-04', 'available', false),
  ('Organic Chemistry', 'Jonathan Clayden, Nick Greeves & Stuart Warren', '978-0199270293', 'Chemistry', 'Mechanistic approach to organic reactions, stereochemistry, and synthesis.', 'https://images.unsplash.com/photo-1535905557558-afc4877a26fc?auto=format&fit=crop&w=400&q=80', 2012, 'F2-CH-03', 'available', false)
on conflict (isbn) do nothing;

-- 5. Initial Announcement
insert into public.announcements (message, level, active)
select 'Welcome to Athenaeum Smart Library! Remember to check in within 15 minutes of your booking start time.', 'info', true
where not exists (select 1 from public.announcements);

-- 6. Sample upcoming national holiday
insert into public.holidays (date, label)
values ('2027-01-26', 'Republic Day')
on conflict (date) do nothing;

-- 7. Seed realistic historical occupancy snapshots (for busy-time chart on first boot)
insert into public.occupancy_snapshots (floor_id, taken_at, occupied_count, reserved_count, total_seats)
select
  f.id,
  (date_trunc('day', now()) - interval '1 day') + make_interval(hours => h.hr),
  case
    when h.hr between 8 and 9 then round(f.cap * 0.25)::int
    when h.hr between 10 and 12 then round(f.cap * 0.78)::int
    when h.hr between 13 and 14 then round(f.cap * 0.35)::int
    when h.hr between 15 and 18 then round(f.cap * 0.85)::int
    when h.hr between 19 and 21 then round(f.cap * 0.45)::int
    else 2
  end,
  case
    when h.hr between 10 and 18 then 4
    else 1
  end,
  f.cap
from (
  select '11111111-1111-4111-8111-111111111101'::uuid as id, 21 as cap
  union all
  select '11111111-1111-4111-8111-111111111102'::uuid, 21
  union all
  select '11111111-1111-4111-8111-111111111103'::uuid, 18
) f
cross join generate_series(8, 21) as h(hr)
where not exists (select 1 from public.occupancy_snapshots limit 1);
