const express = require('express');
const router = express.Router();
const paysafeController = require('./../controllers/paysafeController');

router.route('/payments').post(paysafeController.payments);
router.route('/hooks').post(paysafeController.payementNotification);

module.exports = router;
