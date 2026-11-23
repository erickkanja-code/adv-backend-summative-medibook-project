const { Router } = require('express');
const reportController = require('../controllers/reportController');

const router = Router();

router.get('/doctors', reportController.getDoctorsReport);
router.get('/busy-days', reportController.getBusyDays);

module.exports = router;
