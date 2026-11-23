const db = require('./db');
const AppError = require('../utils/AppError');

const SELECT_DOCTOR = `
  SELECT id, full_name AS fullName, specialty, consultation_fee AS consultationFee,
         room, created_at AS createdAt
  FROM doctors`;

// API field -> table column. Only these columns can ever be updated.
const COLUMNS = Object.freeze({
  fullName: 'full_name',
  specialty: 'specialty',
  consultationFee: 'consultation_fee',
  room: 'room',
});

async function findAll() {
  return db.query(`${SELECT_DOCTOR} ORDER BY id`);
}

async function findById(id, conn) {
  const rows = await db.query(`${SELECT_DOCTOR} WHERE id = ?`, [id], conn);
  return rows[0] || null;
}

async function create({ fullName, specialty, consultationFee, room }) {
  const result = await db.query(
    'INSERT INTO doctors (full_name, specialty, consultation_fee, room) VALUES (?, ?, ?, ?)',
    [fullName, specialty, consultationFee, room],
  );
  return findById(result.insertId);
}

// Returns the updated doctor, or null when the id does not exist.
async function update(id, changes) {
  const { clause, values } = db.buildSetClause(COLUMNS, changes);
  const result = await db.query(`UPDATE doctors SET ${clause} WHERE id = ?`, [...values, id]);
  return result.affectedRows === 0 ? null : findById(id);
}

// Returns true when a row was deleted, false when the id does not exist.
async function remove(id) {
  try {
    const result = await db.query('DELETE FROM doctors WHERE id = ?', [id]);
    return result.affectedRows > 0;
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      throw AppError.conflict(
        'This doctor has appointments on record (kept for refund history) and cannot be deleted',
        'DOCTOR_HAS_APPOINTMENTS',
      );
    }
    throw err;
  }
}

module.exports = { findAll, findById, create, update, remove };
