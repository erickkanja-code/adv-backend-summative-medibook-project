// OpenAPI 3.0 description of the MediBook API, served by Swagger UI at /api-docs.
// Business values in descriptions come from businessRules.js so the docs never drift.
const {
  MAX_APPOINTMENTS_PER_DAY,
  BUSY_DAY_THRESHOLD_PERCENT,
  STATISTICS_WINDOW_DAYS,
  REFUND_POLICY,
} = require('../config/businessRules');

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const response = (name) => ({ $ref: `#/components/responses/${name}` });
const json = (schema, example) => ({ 'application/json': { schema, ...(example && { example }) } });
const idParam = (description) => ({
  name: 'id',
  in: 'path',
  required: true,
  description,
  schema: { type: 'integer', minimum: 1 },
});

function crudPaths({ tag, basePath, label, schema, input, example }) {
  return {
    [basePath]: {
      get: {
        tags: [tag],
        summary: `List all ${label}s`,
        responses: { 200: { description: 'OK', content: json({ type: 'array', items: ref(schema) }) }, 503: response('ServiceUnavailable') },
      },
      post: {
        tags: [tag],
        summary: `Create a ${label}`,
        requestBody: { required: true, content: json(ref(input), example) },
        responses: {
          201: { description: 'Created (Location header points to the new resource)', content: json(ref(schema)) },
          400: response('BadRequest'),
          409: response('Conflict'),
        },
      },
    },
    [`${basePath}/{id}`]: {
      parameters: [idParam(`${label} id`)],
      get: {
        tags: [tag],
        summary: `Get one ${label}`,
        responses: { 200: { description: 'OK', content: json(ref(schema)) }, 400: response('BadRequest'), 404: response('NotFound') },
      },
      put: {
        tags: [tag],
        summary: `Replace a ${label} (all fields required)`,
        requestBody: { required: true, content: json(ref(input), example) },
        responses: {
          200: { description: 'Updated', content: json(ref(schema)) },
          400: response('BadRequest'),
          404: response('NotFound'),
          409: response('Conflict'),
        },
      },
      patch: {
        tags: [tag],
        summary: `Update some fields of a ${label}`,
        requestBody: { required: true, content: json(ref(`${schema}Patch`)) },
        responses: {
          200: { description: 'Updated', content: json(ref(schema)) },
          400: response('BadRequest'),
          404: response('NotFound'),
          409: response('Conflict'),
        },
      },
      delete: {
        tags: [tag],
        summary: `Delete a ${label}`,
        description: `Refused with 409 when the ${label} has appointments (they are kept as refund history).`,
        responses: { 204: { description: 'Deleted' }, 400: response('BadRequest'), 404: response('NotFound'), 409: response('Conflict') },
      },
    },
  };
}

// PATCH accepts any non-empty subset of the create fields.
const patchOf = (input) => ({ type: 'object', minProperties: 1, properties: input.properties });

const PATIENT_INPUT = {
  type: 'object',
  required: ['fullName', 'email', 'phone'],
  properties: {
    fullName: { type: 'string', minLength: 2, maxLength: 100 },
    email: { type: 'string', format: 'email', maxLength: 255, description: 'Unique; stored in lower case' },
    phone: { type: 'string', minLength: 7, maxLength: 20, description: 'Digits, spaces, parentheses, dashes, leading +' },
  },
};

const DOCTOR_INPUT = {
  type: 'object',
  required: ['fullName', 'specialty', 'consultationFee', 'room'],
  properties: {
    fullName: { type: 'string', minLength: 2, maxLength: 100 },
    specialty: { type: 'string', minLength: 2, maxLength: 100 },
    consultationFee: { type: 'number', minimum: 0, multipleOf: 0.01 },
    room: { type: 'string', maxLength: 10, pattern: '^[A-Za-z0-9-]+$' },
  },
};

const bookingExample = { patientId: 6, doctorId: 1, datetime: '2027-03-15 15:00' };

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'MediBook API',
    version: '1.0.0',
    description:
      'Clinic appointment booking backend. Date/times are clinic-local, formatted `YYYY-MM-DD HH:mm`.\n\n' +
      `Slots are 30 minutes between 09:00 and 17:00 (last start 16:30), at most ${MAX_APPOINTMENTS_PER_DAY} per doctor per day.\n\n` +
      'With the seed data, Dr. Kofi Boateng (doctorId 1) has 11 of 12 slots booked on 2027-03-15: one more booking fills the day, ' +
      'the next one returns 409 with a waitlist offer.',
  },
  servers: [{ url: '/', description: 'This server' }],
  tags: [
    { name: 'Patients' },
    { name: 'Doctors' },
    { name: 'Appointments', description: 'Booking and cancellation' },
    { name: 'Waitlist', description: 'Redis-backed waitlist; the worker books waitlisted patients when a slot is freed' },
    { name: 'Reports', description: 'Aggregated in SQL' },
    { name: 'Feedback', description: 'Localized HTML page (open it in the browser for the rendered form)' },
    { name: 'Health' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Liveness check',
        responses: { 200: { description: 'OK', content: json({ type: 'object', properties: { status: { type: 'string', example: 'ok' } } }) } },
      },
    },

    ...crudPaths({
      tag: 'Patients',
      basePath: '/api/patients',
      label: 'patient',
      schema: 'Patient',
      input: 'PatientInput',
      example: { fullName: 'Esi Mensah', email: 'esi.mensah@mail.com', phone: '0244-555-777' },
    }),

    ...crudPaths({
      tag: 'Doctors',
      basePath: '/api/doctors',
      label: 'doctor',
      schema: 'Doctor',
      input: 'DoctorInput',
      example: { fullName: 'Dr. Yaa Amoah', specialty: 'Neurology', consultationFee: 180.0, room: 'R-21' },
    }),

    '/api/doctors/{id}/statistics': {
      get: {
        tags: ['Doctors', 'Reports'],
        summary: 'Statistics for one doctor',
        description:
          `Revenue collected (amount paid minus refunds), upcoming appointment count, appointments per day for the next ${STATISTICS_WINDOW_DAYS} days ` +
          `(starting today) and utilization against the ${MAX_APPOINTMENTS_PER_DAY}-slot daily cap.`,
        parameters: [idParam('Doctor id')],
        responses: {
          200: { description: 'OK', content: json(ref('DoctorStatistics')) },
          400: response('BadRequest'),
          404: response('NotFound'),
        },
      },
    },

    '/api/appointments': {
      get: {
        tags: ['Appointments'],
        summary: 'List appointments (optional filters)',
        parameters: [
          { name: 'doctorId', in: 'query', schema: { type: 'integer', minimum: 1 } },
          { name: 'patientId', in: 'query', schema: { type: 'integer', minimum: 1 } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['BOOKED', 'CANCELLED'] } },
          { name: 'date', in: 'query', description: 'YYYY-MM-DD', schema: { type: 'string', format: 'date', example: '2027-03-15' } },
        ],
        responses: { 200: { description: 'OK', content: json({ type: 'array', items: ref('Appointment') }) }, 400: response('BadRequest') },
      },
      post: {
        tags: ['Appointments'],
        summary: 'Book an appointment',
        description:
          'Rules: future only, on a 30-minute boundary, start between 09:00 and 16:30, ' +
          `at most ${MAX_APPOINTMENTS_PER_DAY} per doctor per day, one live booking per doctor slot (also under simultaneous requests). ` +
          'The price is set by the server from the doctor\'s fee. When the slot or day is full the 409 response contains `details.waitlist`.',
        requestBody: { required: true, content: json(ref('BookingRequest'), bookingExample) },
        responses: {
          201: { description: 'Booked', content: json(ref('Appointment')) },
          400: response('BadRequest'),
          404: response('NotFound'),
          409: {
            description: 'SLOT_TAKEN, DAY_FULL (both include a waitlist offer) or PATIENT_SLOT_CONFLICT',
            content: json(ref('Error'), {
              error: {
                status: 409,
                code: 'DAY_FULL',
                message: `This doctor already has the maximum of ${MAX_APPOINTMENTS_PER_DAY} appointments on that day`,
                details: {
                  waitlist: {
                    offered: true,
                    message: 'Join the waitlist and you will be booked automatically when a slot is freed for this doctor on this day.',
                    method: 'POST',
                    endpoint: '/api/waitlist',
                    body: { patientId: 2, doctorId: 1, datetime: '2027-03-15 16:00:00' },
                  },
                },
              },
            }),
          },
          422: response('Unprocessable'),
        },
      },
    },

    '/api/appointments/{id}': {
      get: {
        tags: ['Appointments'],
        summary: 'Get one appointment',
        parameters: [idParam('Appointment id')],
        responses: { 200: { description: 'OK', content: json(ref('Appointment')) }, 400: response('BadRequest'), 404: response('NotFound') },
      },
    },

    '/api/appointments/{id}/cancellation': {
      post: {
        tags: ['Appointments'],
        summary: 'Cancel an appointment and record its refund',
        description:
          `Refund from the notice given: more than ${REFUND_POLICY.FULL_REFUND_ABOVE_HOURS}h → ${REFUND_POLICY.FULL_REFUND_PERCENT}%; ` +
          `${REFUND_POLICY.PARTIAL_REFUND_FROM_HOURS}–${REFUND_POLICY.FULL_REFUND_ABOVE_HOURS}h inclusive → ${REFUND_POLICY.PARTIAL_REFUND_PERCENT}%; ` +
          `less than ${REFUND_POLICY.PARTIAL_REFUND_FROM_HOURS}h → ${REFUND_POLICY.NO_REFUND_PERCENT}%. ` +
          'The record is kept, the slot becomes bookable again and the waitlist worker is notified. No request body.',
        parameters: [idParam('Appointment id')],
        responses: {
          200: { description: 'Cancelled', content: json(ref('CancellationResult')) },
          400: response('BadRequest'),
          404: response('NotFound'),
          409: response('Conflict'),
          422: response('Unprocessable'),
        },
      },
    },

    '/api/waitlist': {
      get: {
        tags: ['Waitlist'],
        summary: 'See a doctor-day waitlist in order',
        parameters: [
          { name: 'doctorId', in: 'query', required: true, schema: { type: 'integer', minimum: 1, example: 1 } },
          { name: 'date', in: 'query', required: true, schema: { type: 'string', format: 'date', example: '2027-03-15' } },
        ],
        responses: {
          200: { description: 'OK', content: json({ type: 'array', items: ref('WaitlistEntry') }) },
          400: response('BadRequest'),
          503: response('ServiceUnavailable'),
        },
      },
      post: {
        tags: ['Waitlist'],
        summary: 'Join the waitlist for a full slot or day',
        description: 'Only accepted when the requested slot or the doctor\'s day is fully booked (otherwise 422 SLOT_AVAILABLE).',
        requestBody: { required: true, content: json(ref('BookingRequest'), { patientId: 2, doctorId: 1, datetime: '2027-03-15 16:00' }) },
        responses: {
          202: { description: 'Accepted: the booking happens later in the worker', content: json(ref('WaitlistJoinResult')) },
          400: response('BadRequest'),
          404: response('NotFound'),
          409: response('Conflict'),
          422: response('Unprocessable'),
          503: response('ServiceUnavailable'),
        },
      },
    },

    '/api/reports/doctors': {
      get: {
        tags: ['Reports'],
        summary: 'Every doctor\'s appointment totals and revenue (including doctors with none)',
        responses: { 200: { description: 'OK', content: json(ref('DoctorsReport')) } },
      },
    },

    '/api/reports/busy-days': {
      get: {
        tags: ['Reports'],
        summary: `Every (doctor, date) with more than ${BUSY_DAY_THRESHOLD_PERCENT}% of the ${MAX_APPOINTMENTS_PER_DAY}-slot capacity booked`,
        responses: { 200: { description: 'OK', content: json(ref('BusyDaysReport')) } },
      },
    },

    '/feedback': {
      get: {
        tags: ['Feedback'],
        summary: 'Course feedback page',
        description: 'Unsupported or missing `lang` falls back to English.',
        parameters: [{ name: 'lang', in: 'query', schema: { type: 'string', enum: ['en', 'fr'] } }],
        responses: { 200: { description: 'HTML page', content: { 'text/html': { schema: { type: 'string' } } } } },
      },
      post: {
        tags: ['Feedback'],
        summary: 'Submit the feedback form (answers are not stored; returns a thank-you page)',
        parameters: [{ name: 'lang', in: 'query', schema: { type: 'string', enum: ['en', 'fr'] } }],
        requestBody: {
          content: {
            'application/x-www-form-urlencoded': {
              schema: {
                type: 'object',
                properties: Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`q${n}`, { type: 'string' }])),
              },
            },
          },
        },
        responses: { 200: { description: 'HTML thank-you page', content: { 'text/html': { schema: { type: 'string' } } } } },
      },
    },
  },

  components: {
    schemas: {
      PatientInput: PATIENT_INPUT,
      PatientPatch: patchOf(PATIENT_INPUT),
      Patient: {
        allOf: [
          { type: 'object', properties: { id: { type: 'integer', example: 1 } } },
          ref('PatientInput'),
          { type: 'object', properties: { createdAt: { type: 'string', example: '2026-11-23 09:00:00' } } },
        ],
      },
      DoctorInput: DOCTOR_INPUT,
      DoctorPatch: patchOf(DOCTOR_INPUT),
      Doctor: {
        allOf: [
          { type: 'object', properties: { id: { type: 'integer', example: 1 } } },
          ref('DoctorInput'),
          { type: 'object', properties: { createdAt: { type: 'string', example: '2026-11-23 09:00:00' } } },
        ],
      },
      BookingRequest: {
        type: 'object',
        required: ['patientId', 'doctorId', 'datetime'],
        properties: {
          patientId: { type: 'integer', minimum: 1 },
          doctorId: { type: 'integer', minimum: 1 },
          datetime: { type: 'string', description: 'YYYY-MM-DD HH:mm (clinic-local)', example: '2027-03-15 15:00' },
        },
      },
      Appointment: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          patientId: { type: 'integer' },
          patientName: { type: 'string' },
          patientEmail: { type: 'string' },
          patientPhone: { type: 'string' },
          doctorId: { type: 'integer' },
          doctorName: { type: 'string' },
          specialty: { type: 'string' },
          room: { type: 'string' },
          apptDatetime: { type: 'string', example: '2027-03-15 15:00:00' },
          amountPaid: { type: 'number', example: 150 },
          status: { type: 'string', enum: ['BOOKED', 'CANCELLED'] },
          bookedOn: { type: 'string' },
          cancelledAt: { type: 'string', nullable: true },
          refundAmount: { type: 'number', nullable: true },
        },
      },
      CancellationResult: {
        type: 'object',
        properties: {
          message: { type: 'string', example: 'Appointment cancelled. Refund: 75.00 (50%)' },
          refund: {
            type: 'object',
            properties: {
              percent: { type: 'integer', enum: [0, 50, 100] },
              amount: { type: 'number', example: 75 },
              hoursNotice: { type: 'number', example: 36.5 },
              policy: { type: 'string' },
            },
          },
          appointment: ref('Appointment'),
        },
      },
      WaitlistEntry: {
        type: 'object',
        properties: {
          position: { type: 'integer', example: 1 },
          patientId: { type: 'integer' },
          doctorId: { type: 'integer' },
          date: { type: 'string', example: '2027-03-15' },
          requestedDatetime: { type: 'string', example: '2027-03-15 16:00:00' },
          joinedAt: { type: 'string', format: 'date-time' },
        },
      },
      WaitlistJoinResult: {
        type: 'object',
        properties: { message: { type: 'string' }, entry: ref('WaitlistEntry') },
      },
      DayCount: {
        type: 'object',
        properties: {
          date: { type: 'string', example: '2026-11-24' },
          appointments: { type: 'integer', example: 1 },
          utilizationPercent: { type: 'number', example: 8.33 },
        },
      },
      DoctorStatistics: {
        type: 'object',
        properties: {
          doctorId: { type: 'integer' },
          doctorName: { type: 'string' },
          specialty: { type: 'string' },
          revenueCollected: { type: 'number' },
          upcomingAppointments: { type: 'integer' },
          dailyCapacity: { type: 'integer', example: MAX_APPOINTMENTS_PER_DAY },
          next7Days: {
            type: 'object',
            properties: {
              from: { type: 'string' },
              to: { type: 'string' },
              bookedSlots: { type: 'integer' },
              capacitySlots: { type: 'integer', example: MAX_APPOINTMENTS_PER_DAY * STATISTICS_WINDOW_DAYS },
              utilizationPercent: { type: 'number' },
              appointmentsPerDay: { type: 'array', items: ref('DayCount') },
            },
          },
        },
      },
      DoctorsReport: {
        type: 'object',
        properties: {
          doctors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                doctorId: { type: 'integer' },
                doctorName: { type: 'string' },
                specialty: { type: 'string' },
                totalAppointments: { type: 'integer' },
                activeAppointments: { type: 'integer' },
                cancelledAppointments: { type: 'integer' },
                revenueCollected: { type: 'number' },
              },
            },
          },
        },
      },
      BusyDaysReport: {
        type: 'object',
        properties: {
          dailyCapacity: { type: 'integer', example: MAX_APPOINTMENTS_PER_DAY },
          thresholdPercent: { type: 'integer', example: BUSY_DAY_THRESHOLD_PERCENT },
          busyDays: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                doctorId: { type: 'integer' },
                doctorName: { type: 'string' },
                date: { type: 'string', example: '2027-03-15' },
                bookedAppointments: { type: 'integer', example: 11 },
                utilizationPercent: { type: 'number', example: 91.67 },
              },
            },
          },
        },
      },
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              status: { type: 'integer' },
              code: { type: 'string' },
              message: { type: 'string' },
              details: { description: 'Per-field problems (400) or a waitlist offer (409)' },
            },
          },
        },
      },
    },
    responses: {
      BadRequest: { description: 'Malformed input (details lists each field)', content: json(ref('Error')) },
      NotFound: { description: 'Unknown id', content: json(ref('Error')) },
      Conflict: { description: 'Conflicts with the current state', content: json(ref('Error')) },
      Unprocessable: { description: 'Well-formed but breaks a business rule', content: json(ref('Error')) },
      ServiceUnavailable: { description: 'MySQL or Redis unavailable', content: json(ref('Error')) },
    },
  },
};
