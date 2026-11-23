const { Router } = require('express');
const swaggerUi = require('swagger-ui-express');
const openApiSpec = require('../docs/openapi');
const patientRoutes = require('./patientRoutes');
const doctorRoutes = require('./doctorRoutes');
const appointmentRoutes = require('./appointmentRoutes');
const waitlistRoutes = require('./waitlistRoutes');
const reportRoutes = require('./reportRoutes');
const feedbackRoutes = require('./feedbackRoutes');

const router = Router();

router.get('/health', (req, res) => res.json({ status: 'ok' }));

// Interactive API documentation (Swagger UI) and the raw OpenAPI document.
router.get('/api-docs.json', (req, res) => res.json(openApiSpec));
router.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, { customSiteTitle: 'MediBook API docs' }));

router.use('/api/patients', patientRoutes);
router.use('/api/doctors', doctorRoutes);
router.use('/api/appointments', appointmentRoutes);
router.use('/api/waitlist', waitlistRoutes);
router.use('/api/reports', reportRoutes);
router.use('/feedback', feedbackRoutes);

module.exports = router;
