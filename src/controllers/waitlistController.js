const waitlistService = require('../services/waitlistService');
const { assertValid } = require('../validators/common');
const { validateBookingRequest } = require('../validators/bookingValidator');
const { optionalId, optionalDate, required } = require('../validators/queryValidator');

// POST /api/waitlist  { patientId, doctorId, datetime } -> 202 Accepted (booking happens later)
async function join(req, res) {
  const request = assertValid(validateBookingRequest(req.body), 'Invalid waitlist request');
  const entry = await waitlistService.joinWaitlist(request);
  res.status(202).json({
    message: `Added to the waitlist at position ${entry.position}. You will be booked automatically when a slot is freed.`,
    entry,
  });
}

// GET /api/waitlist?doctorId=1&date=2027-03-15
async function list(req, res) {
  const doctorId = required(optionalId(req.query.doctorId, 'doctorId'), 'doctorId');
  const date = required(optionalDate(req.query.date, 'date'), 'date');
  res.json(await waitlistService.getWaitlist({ doctorId, date }));
}

module.exports = { join, list };
