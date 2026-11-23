const { Router } = require('express');
const doctorController = require('../controllers/doctorController');
const reportController = require('../controllers/reportController');

const router = Router();

router.get('/', doctorController.list);
router.post('/', doctorController.create);
router.get('/:id', doctorController.getById);
router.put('/:id', doctorController.replace);
router.patch('/:id', doctorController.update);
router.delete('/:id', doctorController.remove);
router.get('/:id/statistics', reportController.getDoctorStatistics);

module.exports = router;
