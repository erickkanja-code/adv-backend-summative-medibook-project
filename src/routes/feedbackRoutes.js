const { Router } = require('express');
const feedbackController = require('../controllers/feedbackController');

const router = Router();

router.get('/', feedbackController.showForm);
router.post('/', feedbackController.submit);

module.exports = router;
