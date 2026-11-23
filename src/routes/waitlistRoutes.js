const { Router } = require('express');
const waitlistController = require('../controllers/waitlistController');

const router = Router();

router.get('/', waitlistController.list);
router.post('/', waitlistController.join);

module.exports = router;
