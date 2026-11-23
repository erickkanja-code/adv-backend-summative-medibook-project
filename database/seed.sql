-- =====================================================================
-- MediBook - sample data. Run after schema.sql.
-- Covers: the 3 original spreadsheet rows, two cancellations with refund
-- records, a doctor with zero appointments (Dr. Esi Quaye), a doctor-day
-- one slot short of the 12-appointment cap (Dr. Boateng, 2027-03-15), and
-- two appointments relative to the day the seed runs (for the 7-day statistics).
-- =====================================================================
USE medibook;

INSERT INTO patients (id, full_name, email, phone) VALUES
  (1, 'Ama Mensah',     'ama@mail.com',            '0244-111-222'),
  (2, 'Kojo Owusu',     'kojo@mail.com',           '0555-333-444'),
  (3, 'Efua Asante',    'efua.asante@mail.com',    '0201-555-666'),
  (4, 'Yaw Darko',      'yaw.darko@mail.com',      '0277-777-888'),
  (5, 'Akosua Boadu',   'akosua.boadu@mail.com',   '0266-999-000'),
  (6, 'Kwabena Osei',   'kwabena.osei@mail.com',   '0249-123-456');

INSERT INTO doctors (id, full_name, specialty, consultation_fee, room) VALUES
  (1, 'Dr. Kofi Boateng', 'Dermatology', 150.00, 'R-12'),
  (2, 'Dr. Abena Adjei',  'Paediatrics', 100.00, 'R-03'),
  (3, 'Dr. Esi Quaye',    'Cardiology',  200.00, 'R-07');  -- no appointments

-- Past appointments (the original spreadsheet rows; AP-002 paid a discounted 120.00).
INSERT INTO appointments (id, patient_id, doctor_id, appt_datetime, amount_paid, status, booked_on) VALUES
  (1, 1, 1, '2026-08-10 09:00:00', 150.00, 'BOOKED', '2026-07-01 10:15:00'),
  (2, 2, 1, '2026-08-10 09:30:00', 120.00, 'BOOKED', '2026-07-02 11:40:00'),
  (3, 1, 2, '2026-08-15 10:00:00', 100.00, 'BOOKED', '2026-07-03 08:05:00');

-- Cancellations: the rows stay as refund history.
--   #4 cancelled 75h before  -> 100% refund
--   #5 cancelled 42h before  ->  50% refund
INSERT INTO appointments
  (id, patient_id, doctor_id, appt_datetime, amount_paid, status, booked_on, cancelled_at, refund_amount) VALUES
  (4, 3, 2, '2026-09-01 11:00:00', 100.00, 'CANCELLED', '2026-08-20 09:00:00', '2026-08-29 08:00:00', 100.00),
  (5, 4, 1, '2026-09-02 14:00:00', 150.00, 'CANCELLED', '2026-08-25 16:30:00', '2026-08-31 20:00:00',  75.00);

-- Near-cap day: Dr. Boateng has 11 of 12 slots booked on 2027-03-15
-- (one more booking fills the day; the next one is offered the waitlist).
INSERT INTO appointments (id, patient_id, doctor_id, appt_datetime, amount_paid, status, booked_on) VALUES
  ( 6, 1, 1, '2027-03-15 09:00:00', 150.00, 'BOOKED', '2026-11-20 09:00:00'),
  ( 7, 2, 1, '2027-03-15 09:30:00', 150.00, 'BOOKED', '2026-11-20 09:05:00'),
  ( 8, 3, 1, '2027-03-15 10:00:00', 150.00, 'BOOKED', '2026-11-20 09:10:00'),
  ( 9, 4, 1, '2027-03-15 10:30:00', 150.00, 'BOOKED', '2026-11-20 09:15:00'),
  (10, 5, 1, '2027-03-15 11:00:00', 150.00, 'BOOKED', '2026-11-20 09:20:00'),
  (11, 6, 1, '2027-03-15 11:30:00', 150.00, 'BOOKED', '2026-11-20 09:25:00'),
  (12, 1, 1, '2027-03-15 12:00:00', 150.00, 'BOOKED', '2026-11-20 09:30:00'),
  (13, 2, 1, '2027-03-15 12:30:00', 150.00, 'BOOKED', '2026-11-20 09:35:00'),
  (14, 3, 1, '2027-03-15 13:00:00', 150.00, 'BOOKED', '2026-11-20 09:40:00'),
  (15, 4, 1, '2027-03-15 13:30:00', 150.00, 'BOOKED', '2026-11-20 09:45:00'),
  (16, 5, 1, '2027-03-15 14:00:00', 150.00, 'BOOKED', '2026-11-20 09:50:00');

-- Upcoming appointments relative to the day the seed is loaded,
-- so the doctor statistics (next 7 days) always have data.
INSERT INTO appointments (id, patient_id, doctor_id, appt_datetime, amount_paid, status, booked_on) VALUES
  (17, 5, 2, TIMESTAMP(CURDATE() + INTERVAL 1 DAY, '10:00:00'), 100.00, 'BOOKED', NOW()),
  (18, 6, 2, TIMESTAMP(CURDATE() + INTERVAL 3 DAY, '14:30:00'), 100.00, 'BOOKED', NOW());
