const express = require('express');
const router = express.Router();
const serviceApiController = require('./../controllers/serviceApiController');
const mailController = require('./../controllers/mailReportController');

router.route('/keygenerator').post(serviceApiController.createApiKey);
router.route('/getservices').get(serviceApiController.getAllServices);
router
  .route('/merchants/createmerchant')
  .post(serviceApiController.createMerchant);

router
  .route('/merchants/:id')
  .get(serviceApiController.getMerchanthById)
  .put(serviceApiController.updateMerchant);

router
  .route('/gateways/addgateway')
  .post(serviceApiController.addPaymentGateWay);

router
  .route('/gateways/:id')
  .get(serviceApiController.getPaymentGatewaysbyMerchant)
  .put(serviceApiController.updateGateway);

router
  .route('/gateways/createpaymentlink')
  .post(serviceApiController.generatePayLink);

router
  .route('/paymentlink/:id')
  .get(serviceApiController.paymentLinkDetailsById);

router.route('/paymentlink/:id').delete(serviceApiController.deletePayLink);

module.exports = router;
