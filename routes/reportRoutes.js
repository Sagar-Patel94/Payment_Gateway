const express = require('express');
const transController = require('../controllers/transactionController');
const router = express.Router();

router
  .route('/transaction-preference')
  .get(transController.getReprtPreferenceFields);

router
  .route('/transaction-preference')
  .post(transController.setReprtPreferenceFields);

module.exports = router;
