const express = require('express');
const authController = require('../controllers/authController');
const router = express.Router();
const checkAuth = require('../middlewares/checkAuth');

router.route('/login').post(authController.login);
router.route('/keylogin').post(checkAuth.deryptToken, authController.keyLogin);
router
  .route('/resetPasswordController')
  .patch(authController.resetPasswordController);
router.route('/resetpassword').post(authController.resetPassword);

module.exports = router;
