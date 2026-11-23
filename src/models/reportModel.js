const db = require('./db');

// Revenue the clinic keeps: what was paid minus what was refunded.
// (Payment is taken at booking time, so upcoming booked appointments count.)
const NET_REVENUE = 'a.amount_paid - COALESCE(a.refund_amount, 0)';

// Generates one row per calendar day: startDate, startDate+1, ... (windowDays rows).
const DAY_WINDOW_CTE = `
  WITH RECURSIVE day_window (day, day_number) AS (
    SELECT CAST(? AS DATE), 1
    UNION ALL
    SELECT day + INTERVAL 1 DAY, day_number + 1 FROM day_window WHERE day_number < ?
  )`;

// Booked appointments per day of the window, including days with zero.
const BOOKINGS_PER_DAY = `
  SELECT day_window.day, COUNT(a.id) AS appointments
  FROM day_window
  LEFT JOIN appointments a
         ON a.doctor_id = ?
        AND a.status = 'BOOKED'
        AND a.appt_datetime >= day_window.day
        AND a.appt_datetime <  day_window.day + INTERVAL 1 DAY
  GROUP BY day_window.day`;

async function getDoctorSummary(doctorId, now) {
  const rows = await db.query(
    `SELECT COALESCE(SUM(${NET_REVENUE}), 0) AS revenueCollected,
            COUNT(CASE WHEN a.status = 'BOOKED' AND a.appt_datetime > ? THEN 1 END) AS upcomingAppointments
     FROM doctors d
     LEFT JOIN appointments a ON a.doctor_id = d.id
     WHERE d.id = ?`,
    [now, doctorId],
  );
  return rows[0];
}

async function getDoctorDailyCounts(doctorId, { startDate, windowDays, dailyCapacity }) {
  return db.query(
    `${DAY_WINDOW_CTE}
     SELECT DATE_FORMAT(per_day.day, '%Y-%m-%d') AS date,
            per_day.appointments,
            ROUND(per_day.appointments * 100 / ?, 2) AS utilizationPercent
     FROM (${BOOKINGS_PER_DAY}) AS per_day
     ORDER BY per_day.day`,
    [startDate, windowDays, dailyCapacity, doctorId],
  );
}

async function getDoctorWindowUtilization(doctorId, { startDate, windowDays, dailyCapacity }) {
  const rows = await db.query(
    `${DAY_WINDOW_CTE}
     SELECT SUM(per_day.appointments) AS bookedSlots,
            ? * COUNT(*) AS capacitySlots,
            ROUND(SUM(per_day.appointments) * 100 / (? * COUNT(*)), 2) AS utilizationPercent
     FROM (${BOOKINGS_PER_DAY}) AS per_day`,
    [startDate, windowDays, dailyCapacity, dailyCapacity, doctorId],
  );
  return rows[0];
}

/**
 * Doctor statistics: revenue collected, upcoming count, appointments per day for
 * the window, and utilization against the daily cap - all aggregated in SQL.
 */
async function getDoctorStatistics(doctorId, { now, startDate, windowDays, dailyCapacity }) {
  const window = { startDate, windowDays, dailyCapacity };
  const [summary, perDay, utilization] = await Promise.all([
    getDoctorSummary(doctorId, now),
    getDoctorDailyCounts(doctorId, window),
    getDoctorWindowUtilization(doctorId, window),
  ]);
  return { summary, perDay, utilization };
}

/**
 * Every doctor's appointment totals and revenue. LEFT JOIN keeps doctors
 * with zero appointments (their counts and revenue come out as 0).
 */
async function getDoctorsReport() {
  return db.query(
    `SELECT d.id AS doctorId,
            d.full_name AS doctorName,
            d.specialty,
            COUNT(a.id) AS totalAppointments,
            COUNT(CASE WHEN a.status = 'BOOKED' THEN 1 END) AS activeAppointments,
            COUNT(CASE WHEN a.status = 'CANCELLED' THEN 1 END) AS cancelledAppointments,
            COALESCE(SUM(${NET_REVENUE}), 0) AS revenueCollected
     FROM doctors d
     LEFT JOIN appointments a ON a.doctor_id = d.id
     GROUP BY d.id, d.full_name, d.specialty
     ORDER BY revenueCollected DESC, d.full_name`,
  );
}

/**
 * Every (doctor, date) with MORE than thresholdPercent of the daily capacity booked.
 * Compared in whole numbers (booked * 100 > capacity * threshold) to avoid rounding:
 * with 12 slots and 80%, a day qualifies from 10 bookings (83.33%).
 */
async function getBusyDays({ dailyCapacity, thresholdPercent }) {
  return db.query(
    `SELECT d.id AS doctorId,
            d.full_name AS doctorName,
            DATE_FORMAT(a.appt_datetime, '%Y-%m-%d') AS date,
            COUNT(*) AS bookedAppointments,
            ROUND(COUNT(*) * 100 / ?, 2) AS utilizationPercent
     FROM appointments a
     JOIN doctors d ON d.id = a.doctor_id
     WHERE a.status = 'BOOKED'
     GROUP BY d.id, d.full_name, DATE_FORMAT(a.appt_datetime, '%Y-%m-%d')
     HAVING COUNT(*) * 100 > ? * ?
     ORDER BY date, d.full_name`,
    [dailyCapacity, dailyCapacity, thresholdPercent],
  );
}

module.exports = { getDoctorStatistics, getDoctorsReport, getBusyDays };
