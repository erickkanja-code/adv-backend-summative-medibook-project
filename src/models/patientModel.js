const db = require('./db');
const AppError = require('../utils/AppError');

const SELECT_PATIENT = `
  SELECT id, full_name AS fullName, email, phone, created_at AS createdAt
  FROM patients`;

// API field -> table column. Only these columns can ever be updated.
const COLUMNS = Object.freeze({ fullName: 'full_name', email: 'email', phone: 'phone' });

function translateWriteError(err) {
  if (err.code === 'ER_DUP_ENTRY') {
    return AppError.conflict('A patient with this email already exists', 'EMAIL_TAKEN');
  }
  return err;
}

async function findAll() {
  return db.query(`${SELECT_PATIENT} ORDER BY id`);
}

async function findById(id, conn) {
  const rows = await db.query(`${SELECT_PATIENT} WHERE id = ?`, [id], conn);
  return rows[0] || null;
}

async function create({ fullName, email, phone }) {
  try {
    const result = await db.query(
      'INSERT INTO patients (full_name, email, phone) VALUES (?, ?, ?)',
      [fullName, email, phone],
    );
    return findById(result.insertId);
  } catch (err) {
    throw translateWriteError(err);
  }
}

// Returns the updated patient, or null when the id does not exist.
async function update(id, changes) {
  const { clause, values } = db.buildSetClause(COLUMNS, changes);
  try {
    const result = await db.query(`UPDATE patients SET ${clause} WHERE id = ?`, [...values, id]);
    return result.affectedRows === 0 ? null : findById(id);
  } catch (err) {
    throw translateWriteError(err);
  }
}

// Returns true when a row was deleted, false when the id does not exist.
async function remove(id) {
  try {
    const result = await db.query('DELETE FROM patients WHERE id = ?', [id]);
    return result.affectedRows > 0;
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      throw AppError.conflict(
        'This patient has appointments on record (kept for refund history) and cannot be deleted',
        'PATIENT_HAS_APPOINTMENTS',
      );
    }
    throw err;
  }
}

module.exports = { findAll, findById, create, update, remove };
