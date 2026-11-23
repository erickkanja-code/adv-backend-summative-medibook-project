const { Router } = require('express');
const patientRoutes = require('./patientRoutes');
const doctorRoutes = require('./doctorRoutes');
const appointmentRoutes = require('./appointmentRoutes');
const waitlistRoutes = require('./waitlistRoutes');

const router = Router();

router.get('/health', (req, res) => res.json({ status: 'ok' }));

router.use('/api/patients', patientRoutes);
router.use('/api/doctors', doctorRoutes);
router.use('/api/appointments', appointmentRoutes);
router.use('/api/waitlist', waitlistRoutes);

module.exports = router;
