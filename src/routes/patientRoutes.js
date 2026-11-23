const { Router } = require('express');
const patientController = require('../controllers/patientController');

const router = Router();

router.get('/', patientController.list);
router.post('/', patientController.create);
router.get('/:id', patientController.getById);
router.put('/:id', patientController.replace);
router.patch('/:id', patientController.update);
router.delete('/:id', patientController.remove);

module.exports = router;
