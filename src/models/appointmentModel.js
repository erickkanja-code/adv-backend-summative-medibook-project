const db = require('./db');

const SELECT_APPOINTMENT_DETAILS = `
  SELECT a.id,
         a.patient_id     AS patientId,
         p.full_name      AS patientName,
         p.email          AS patientEmail,
         p.phone          AS patientPhone,
         a.doctor_id      AS doctorId,
         d.full_name      AS doctorName,
         d.specialty,
         d.room,
         a.appt_datetime  AS apptDatetime,
         a.amount_paid    AS amountPaid,
         a.status,
         a.booked_on      AS bookedOn,
         a.cancelled_at   AS cancelledAt,
         a.refund_amount  AS refundAmount
  FROM appointments a
  JOIN patients p ON p.id = a.patient_id
  JOIN doctors  d ON d.id = a.doctor_id`;

async function findById(id, conn) {
  const rows = await db.query(`${SELECT_APPOINTMENT_DETAILS} WHERE a.id = ?`, [id], conn);
  return rows[0] || null;
}

// filters: { doctorId, patientId, status, date } - all optional, all parameterized.
async function findAll({ doctorId, patientId, status, date } = {}) {
  const conditions = [];
  const params = [];
  if (doctorId !== undefined) {
    conditions.push('a.doctor_id = ?');
    params.push(doctorId);
  }
  if (patientId !== undefined) {
    conditions.push('a.patient_id = ?');
    params.push(patientId);
  }
  if (status !== undefined) {
    conditions.push('a.status = ?');
    params.push(status);
  }
  if (date !== undefined) {
    conditions.push('a.appt_datetime >= ? AND a.appt_datetime < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(date, date);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return db.query(`${SELECT_APPOINTMENT_DETAILS} ${where} ORDER BY a.appt_datetime, a.id`, params);
}

/**
 * Locks the doctor's row for the rest of the booking transaction.
 * Every booking for the same doctor must take this lock first, so two
 * simultaneous requests are processed one after the other: the second one
 * sees the first one's appointment when it checks the slot and the daily cap.
 */
async function lockDoctorForBooking(doctorId, conn) {
  const rows = await db.query(
    'SELECT id, consultation_fee AS consultationFee FROM doctors WHERE id = ? FOR UPDATE',
    [doctorId],
    conn,
  );
  return rows[0] || null;
}

async function isSlotTaken(doctorId, datetime, conn) {
  const rows = await db.query(
    "SELECT 1 FROM appointments WHERE doctor_id = ? AND appt_datetime = ? AND status = 'BOOKED' LIMIT 1",
    [doctorId, datetime],
    conn,
  );
  return rows.length > 0;
}

async function patientHasAppointmentAt(patientId, datetime, conn) {
  const rows = await db.query(
    "SELECT 1 FROM appointments WHERE patient_id = ? AND appt_datetime = ? AND status = 'BOOKED' LIMIT 1",
    [patientId, datetime],
    conn,
  );
  return rows.length > 0;
}

async function countBookedForDoctorOnDate(doctorId, date, conn) {
  const rows = await db.query(
    `SELECT COUNT(*) AS booked
     FROM appointments
     WHERE doctor_id = ? AND status = 'BOOKED'
       AND appt_datetime >= ? AND appt_datetime < DATE_ADD(?, INTERVAL 1 DAY)`,
    [doctorId, date, date],
    conn,
  );
  return rows[0].booked;
}

/**
 * Inserts a booking and returns its id. If a unique key still fires (the
 * database is the last line of defence), the error is tagged with the
 * constraint name so the service can explain which rule was broken.
 */
async function create({ patientId, doctorId, datetime, amountPaid, bookedOn }, conn) {
  try {
    const result = await db.query(
      `INSERT INTO appointments (patient_id, doctor_id, appt_datetime, amount_paid, status, booked_on)
       VALUES (?, ?, ?, ?, 'BOOKED', ?)`,
      [patientId, doctorId, datetime, amountPaid, bookedOn],
      conn,
    );
    return result.insertId;
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      err.constraint = err.message.includes('uq_patient_active_slot') ? 'uq_patient_active_slot' : 'uq_doctor_active_slot';
    }
    throw err;
  }
}

// Locks one appointment row so it cannot be cancelled twice concurrently.
async function findByIdForUpdate(id, conn) {
  const rows = await db.query(
    `SELECT id, patient_id AS patientId, doctor_id AS doctorId, appt_datetime AS apptDatetime,
            amount_paid AS amountPaid, status
     FROM appointments WHERE id = ? FOR UPDATE`,
    [id],
    conn,
  );
  return rows[0] || null;
}

// Status change and refund record are written by ONE statement in the caller's
// transaction, so they can only succeed or fail together.
async function markCancelled(id, { cancelledAt, refundAmount }, conn) {
  const result = await db.query(
    `UPDATE appointments
     SET status = 'CANCELLED', cancelled_at = ?, refund_amount = ?
     WHERE id = ? AND status = 'BOOKED'`,
    [cancelledAt, refundAmount, id],
    conn,
  );
  return result.affectedRows === 1;
}

module.exports = {
  findById,
  findAll,
  lockDoctorForBooking,
  isSlotTaken,
  patientHasAppointmentAt,
  countBookedForDoctorOnDate,
  create,
  findByIdForUpdate,
  markCancelled,
};
