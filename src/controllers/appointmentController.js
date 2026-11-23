const appointmentModel = require('../models/appointmentModel');
const appointmentService = require('../services/appointmentService');
const AppError = require('../utils/AppError');
const { assertValid, parseId } = require('../validators/common');
const { validateBookingRequest } = require('../validators/bookingValidator');
const { optionalId, optionalDate, optionalStatus } = require('../validators/queryValidator');

// GET /api/appointments?doctorId=&patientId=&status=&date=
async function list(req, res) {
  const filters = {
    doctorId: optionalId(req.query.doctorId, 'doctorId'),
    patientId: optionalId(req.query.patientId, 'patientId'),
    status: optionalStatus(req.query.status, 'status'),
    date: optionalDate(req.query.date, 'date'),
  };
  res.json(await appointmentModel.findAll(filters));
}

async function getById(req, res) {
  const id = parseId(req.params.id);
  const appointment = await appointmentModel.findById(id);
  if (!appointment) throw AppError.notFound(`Appointment ${id} not found`, 'APPOINTMENT_NOT_FOUND');
  res.json(appointment);
}

// POST /api/appointments  { patientId, doctorId, datetime: "YYYY-MM-DD HH:mm" }
async function book(req, res) {
  const request = assertValid(validateBookingRequest(req.body), 'Invalid booking request');
  const appointment = await appointmentService.bookAppointment(request);
  res.status(201).location(`/api/appointments/${appointment.id}`).json(appointment);
}

// POST /api/appointments/:id/cancellation
async function cancel(req, res) {
  const id = parseId(req.params.id);
  const { appointment, refund } = await appointmentService.cancelAppointment(id);
  res.json({
    message: `Appointment cancelled. Refund: ${refund.amount.toFixed(2)} (${refund.percent}%)`,
    refund,
    appointment,
  });
}

module.exports = { list, getById, book, cancel };
