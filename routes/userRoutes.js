const express = require('express');
const userController = require('./../controllers/userController');
const checkAuth = require('../middlewares/checkAuth');
const router = express.Router();

//User Routes
router.route('/').get(userController.getAllUsers);
// For Statement feature
router.route('/statement').get(userController.merchantStatement);
router.route('/methodsummary').get(userController.summaryByMethod);
router.route('/refundsummary').get(userController.getRefundDetails);
router.route('/chargebacksummary').get(userController.chargeBackSummary);
router
  .route('/settlementsummary')
  .get(userController.getRefundAndChargeBackDetails);
router.route('/list').get(userController.ddlUsers);
router.route('/create').post(userController.createUsers);
router
  .route('/:id')
  .get(userController.getUserById)
  .put(userController.updateUser);

router.route('/updatestatus/:id').patch(userController.updateUserStatus);
router
  .route('/changepassword/:id')
  .patch(userController.updateMerchantPassword);

router
  .route('/delete/:id')
  .put(checkAuth.deryptToken, userController.deleteUser); //For delete a User only update flag

router
  .route('/notification-setting/:uid')
  .post(userController.createOrUpdateNotificationSetting);

module.exports = router;
