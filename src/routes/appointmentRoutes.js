const { Router } = require('express');
const appointmentController = require('../controllers/appointmentController');

const router = Router();

router.get('/', appointmentController.list);
router.post('/', appointmentController.book);
router.get('/:id', appointmentController.getById);
router.post('/:id/cancellation', appointmentController.cancel);

module.exports = router;
