const express = require('express');
const transController = require('../controllers/transactionController');
const transReportController = require('../controllers/transReportController');
const checkAuth = require('../middlewares/checkAuth');
const router = express.Router();

// router.param('id', transController.checkId);
//For Get Email report for Transaction Receipts
router.route('/emailreport/:id').get(transController.getEmailReport);

//For Get All Transactions Data
router
  .route('/transaction/list')
  .get(checkAuth.deryptToken, transController.getAllTransactions);

//For Get aggregate Transactions Data for reports
router
  .route('/transaction/reports')
  .get(transReportController.getAggreagteTransactions);

//For Get aggregate Transactions Data for reports by Card brand wise eg: Visa, MasterCard,etc
router
  .route('/transaction/cardwise')
  .get(transReportController.getAggreagteCardWiseData);

//For process a payment via Paymentlink or Virtual Terminal
// router.route('/transaction').post(transController.processTransactions);
router
  .route('/transaction')
  .post(checkAuth.deryptToken, transController.postTransaction);

router
  .route('/achTransaction')
  .post(checkAuth.deryptToken, transController.achPostTransaction);

//For process a saved card token payment via Paymentlink or Virtual Terminal
router.route('/tokentxn').post(transController.tokenTransactions);

//For process a Payrix Refund Transaction
// router
//   .route('/refundtransaction')
//   .post(transController.payRixRefundTransaction);

router.route('/refundtransaction').post(transController.refundTransactions);

//For process a Void Transaction
// router.route('/voidtransaction').post(transController.payRixVoidTransaction);
router.route('/voidtransaction').post(transController.voidTransactions);

//For process a Capture Transaction
// router
//   .route('/capturetransaction')
//   .post(transController.payRixCaptureTransaction);
router.route('/capturetransaction').post(transController.captureTransactions);
// router.route('/transaction/:id').post(transController.processTransactions);

// router.route('/nonqaulified').post(transController.nonQualifiedSingleUpdate);
// router.route('/chargebacks').post(transController.chargeBackSingleUpdate);

//For Get Transaction By id
router
  .route('/transaction/:id')
  .get(checkAuth.deryptToken, transController.getTransactionById);

//For Get RefundVoidCaptureData By id
router
  .route('/returntransactions/:id')
  .get(transController.getRefundVoidCaptureDataById);

// router.route('/txnstatus').put(transController.updateTransactionStatus);

//For Non-Qualified Txns Bulk Update
router
  .route('/nonqualifiedbulkupdate')
  .post(transController.nonQualifiedBulkUpdate);
router.route('/nonqualified').get(transController.getAllNonQualifiedFiles);
router.route('/nonqualified/:id').get(transController.getNqFileById);
router
  .route('/chargebackbulkupdate')
  .post(transController.chargeBackBulkUpdate);
router.route('/chargebacks').get(transController.getAllChargeBackFiles);
router.route('/chargebacks/:id').get(transController.getChargeBackFileById);

module.exports = router;
