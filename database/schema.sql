-- =====================================================================
-- MediBook - database schema (MySQL 8.0.16+ : CHECK constraints are enforced)
-- Normalized to 3NF from the clinic spreadsheet:
--   patient_*  columns  -> patients      (depend only on the patient)
--   doctor_*, specialty, consultation_fee, room -> doctors (depend only on the doctor)
--   appt_ref, appt_datetime, amount_paid, booked_on -> appointments
-- appointments links the other two (each patient / doctor has 0..N appointments).
-- Running this script drops and recreates the database from scratch.
-- =====================================================================

DROP DATABASE IF EXISTS medibook;
CREATE DATABASE medibook CHARACTER SET utf8mb4;
USE medibook;

-- ---------------------------------------------------------------------
-- patients
-- ---------------------------------------------------------------------
CREATE TABLE patients (
  id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  full_name   VARCHAR(100)  NOT NULL,
  email       VARCHAR(255)  NOT NULL,
  phone       VARCHAR(20)   NOT NULL,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT pk_patients PRIMARY KEY (id),
  CONSTRAINT uq_patients_email UNIQUE (email),
  CONSTRAINT chk_patients_full_name CHECK (CHAR_LENGTH(TRIM(full_name)) >= 2),
  CONSTRAINT chk_patients_email CHECK (email LIKE '%_@_%._%'),
  CONSTRAINT chk_patients_phone CHECK (CHAR_LENGTH(phone) >= 7)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
-- doctors
-- ---------------------------------------------------------------------
CREATE TABLE doctors (
  id                INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  full_name         VARCHAR(100)   NOT NULL,
  specialty         VARCHAR(100)   NOT NULL,
  consultation_fee  DECIMAL(10,2)  NOT NULL,
  room              VARCHAR(10)    NOT NULL,
  created_at        DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT pk_doctors PRIMARY KEY (id),
  CONSTRAINT chk_doctors_full_name CHECK (CHAR_LENGTH(TRIM(full_name)) >= 2),
  CONSTRAINT chk_doctors_specialty CHECK (CHAR_LENGTH(TRIM(specialty)) >= 2),
  CONSTRAINT chk_doctors_fee CHECK (consultation_fee >= 0),
  CONSTRAINT chk_doctors_room CHECK (CHAR_LENGTH(TRIM(room)) >= 1)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
-- appointments
-- amount_paid is a snapshot of the fee at booking time (fees can change later),
-- so it is a fact about the appointment, not a copy of doctors.consultation_fee.
-- A cancellation keeps the row (status, cancelled_at, refund_amount) as refund history.
-- ---------------------------------------------------------------------
CREATE TABLE appointments (
  id             INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  patient_id     INT UNSIGNED   NOT NULL,
  doctor_id      INT UNSIGNED   NOT NULL,
  appt_datetime  DATETIME       NOT NULL,
  amount_paid    DECIMAL(10,2)  NOT NULL,
  status         ENUM('BOOKED','CANCELLED') NOT NULL DEFAULT 'BOOKED',
  booked_on      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at   DATETIME       NULL,
  refund_amount  DECIMAL(10,2)  NULL,

  -- Computed by MySQL: equals appt_datetime while BOOKED, NULL once CANCELLED.
  -- UNIQUE indexes ignore NULLs, so the unique keys below apply only to live
  -- bookings: a cancelled slot can be booked again while its record is kept.
  active_slot    DATETIME GENERATED ALWAYS AS (
                   CASE WHEN status = 'BOOKED' THEN appt_datetime ELSE NULL END
                 ) STORED,

  CONSTRAINT pk_appointments PRIMARY KEY (id),
  CONSTRAINT fk_appointments_patient FOREIGN KEY (patient_id)
    REFERENCES patients (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_appointments_doctor FOREIGN KEY (doctor_id)
    REFERENCES doctors (id) ON UPDATE RESTRICT ON DELETE RESTRICT,

  -- Business rule: a doctor can never hold two live appointments at the same date/time.
  CONSTRAINT uq_doctor_active_slot UNIQUE (doctor_id, active_slot),
  -- Business rule: a patient cannot be in two live appointments at the same date/time.
  CONSTRAINT uq_patient_active_slot UNIQUE (patient_id, active_slot),

  -- Business rule: appointments start on a 30-minute boundary.
  CONSTRAINT chk_appt_slot_boundary
    CHECK (MINUTE(appt_datetime) IN (0, 30) AND SECOND(appt_datetime) = 0),
  -- Business rule: working hours 09:00-17:00, so the last 30-minute slot starts at 16:30.
  CONSTRAINT chk_appt_working_hours
    CHECK (TIME(appt_datetime) BETWEEN '09:00:00' AND '16:30:00'),
  CONSTRAINT chk_appt_amount_paid CHECK (amount_paid >= 0),
  -- A cancellation and its refund record always exist together (and only then).
  CONSTRAINT chk_appt_cancellation_record CHECK (
       (status = 'BOOKED'    AND cancelled_at IS NULL     AND refund_amount IS NULL)
    OR (status = 'CANCELLED' AND cancelled_at IS NOT NULL AND refund_amount IS NOT NULL)
  ),
  CONSTRAINT chk_appt_refund_range
    CHECK (refund_amount IS NULL OR refund_amount BETWEEN 0 AND amount_paid),
  CONSTRAINT chk_appt_cancel_before_start
    CHECK (cancelled_at IS NULL OR cancelled_at < appt_datetime),

  INDEX idx_appointments_doctor_datetime (doctor_id, appt_datetime)
) ENGINE = InnoDB;
