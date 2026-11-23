const { Router } = require('express');
const doctorController = require('../controllers/doctorController');

const router = Router();

router.get('/', doctorController.list);
router.post('/', doctorController.create);
router.get('/:id', doctorController.getById);
router.put('/:id', doctorController.replace);
router.patch('/:id', doctorController.update);
router.delete('/:id', doctorController.remove);

module.exports = router;
