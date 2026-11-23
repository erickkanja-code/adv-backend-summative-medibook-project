const reportModel = require('../models/reportModel');
const doctorModel = require('../models/doctorModel');
const AppError = require('../utils/AppError');
const { parseId } = require('../validators/common');
const { formatDate, formatDateTime } = require('../utils/dateTime');
const {
  MAX_APPOINTMENTS_PER_DAY,
  BUSY_DAY_THRESHOLD_PERCENT,
  STATISTICS_WINDOW_DAYS,
} = require('../config/businessRules');

// GET /api/doctors/:id/statistics
async function getDoctorStatistics(req, res) {
  const doctorId = parseId(req.params.id);
  const doctor = await doctorModel.findById(doctorId);
  if (!doctor) throw AppError.notFound(`Doctor ${doctorId} not found`, 'DOCTOR_NOT_FOUND');

  const now = new Date();
  const { summary, perDay, utilization } = await reportModel.getDoctorStatistics(doctorId, {
    now: formatDateTime(now),
    startDate: formatDate(now),
    windowDays: STATISTICS_WINDOW_DAYS,
    dailyCapacity: MAX_APPOINTMENTS_PER_DAY,
  });

  res.json({
    doctorId: doctor.id,
    doctorName: doctor.fullName,
    specialty: doctor.specialty,
    revenueCollected: summary.revenueCollected,
    upcomingAppointments: summary.upcomingAppointments,
    dailyCapacity: MAX_APPOINTMENTS_PER_DAY,
    next7Days: {
      from: perDay[0].date,
      to: perDay[perDay.length - 1].date,
      bookedSlots: utilization.bookedSlots,
      capacitySlots: utilization.capacitySlots,
      utilizationPercent: utilization.utilizationPercent,
      appointmentsPerDay: perDay,
    },
  });
}

// GET /api/reports/doctors
async function getDoctorsReport(req, res) {
  res.json({ doctors: await reportModel.getDoctorsReport() });
}

// GET /api/reports/busy-days
async function getBusyDays(req, res) {
  const busyDays = await reportModel.getBusyDays({
    dailyCapacity: MAX_APPOINTMENTS_PER_DAY,
    thresholdPercent: BUSY_DAY_THRESHOLD_PERCENT,
  });
  res.json({
    dailyCapacity: MAX_APPOINTMENTS_PER_DAY,
    thresholdPercent: BUSY_DAY_THRESHOLD_PERCENT,
    busyDays,
  });
}

module.exports = { getDoctorStatistics, getDoctorsReport, getBusyDays };
