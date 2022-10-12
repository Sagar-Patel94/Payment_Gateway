const express = require('express');
const customerController = require('./../controllers/customerController');
const transController = require('./../controllers/transactionController');
const router = express.Router();
const checkAuth = require('../middlewares/checkAuth');

router.route('/create').post(customerController.createCustomer);
router.route('/').get(customerController.getAllCustomers);
router.route('/statelist/:id').get(customerController.getStateList);
router.route('/countrylist').get(customerController.getCountryList);
router.route('/:id').get(customerController.getCustomerById);
router.route('/customertokentxn').post(transController.chargeCustomerViaToken);

module.exports = router;
