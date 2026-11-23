const { Router } = require('express');
const patientRoutes = require('./patientRoutes');
const doctorRoutes = require('./doctorRoutes');

const router = Router();

router.get('/health', (req, res) => res.json({ status: 'ok' }));

router.use('/api/patients', patientRoutes);
router.use('/api/doctors', doctorRoutes);

module.exports = router;
