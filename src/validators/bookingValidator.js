const { validateBody } = require('./common');

// Shape check only (presence and types). Whether the date/time is a bookable
// slot is decided by the booking rules in validateAppointmentSlot.
const BOOKING_REQUEST_RULES = Object.freeze({
  patientId: { type: 'id' },
  doctorId: { type: 'id' },
  datetime: { type: 'string', max: 25 },
});

function validateBookingRequest(body) {
  return validateBody(body, BOOKING_REQUEST_RULES);
}

module.exports = { validateBookingRequest };
