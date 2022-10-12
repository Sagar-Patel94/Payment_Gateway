const express = require('express');
const roleController = require('../controllers/roleController');
const router = express.Router();
const checkAuth = require('../middlewares/checkAuth');

//User Routes
router.route('/').get(roleController.getAllRoles);
router.route('/create').post(roleController.createRoles);
router
  .route('/:id')
  .get(roleController.getRoleById)
  .put(roleController.updateRole);

router.route('/delete/:id').put(roleController.deleteRole); //For delete a User only update flag

module.exports = router;
