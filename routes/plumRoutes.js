const express = require('express');
const router = express.Router();
const Sentry = require('@sentry/node');
const axios = require('axios');
const checkAuth = require('../middlewares/checkAuth');
const ivrController = require('../controllers/ivrController');

const data = {
  users: [
    {
      id: 1,
      fullName: 'Jim Fisher',
      company: 'AuxPay',
      role: 'customer',
      username: 'jim',
      country: 'USA',
      contact: '1234567890',
      email: 'jim@auxpay.net',
      pendingPayments: {
        amount: 100.0,
        convenienceFee: 3.99,
        total: 103.99,
        status: 'pending',
      },
      completedPayments: [
        {
          amount: 77.5,
          convenienceFee: 1.99,
          status: 'completed',
          createdDate: '2022-01-28 10:30:00',
        },
      ],
      status: 'active',
    },
  ],
};

router
  .route('/ivr')
  .get(checkAuth.deryptToken, ivrController.getIvrList)
  .post(checkAuth.deryptToken, ivrController.importList);

router
  .route('/ivr/:id')
  .get(checkAuth.deryptToken, ivrController.getIvrDetailsById)
  .delete(checkAuth.deryptToken, ivrController.deleteIvr);

router.route('/import').get(checkAuth.deryptToken, ivrController.importExcel);
router.route('/getUserBySSNAndZip').post(ivrController.getUserBySsnAndZipCode);
router.route('/transaction').post(ivrController.transaction);
router.route('/getUserByPhone').post(ivrController.getUserByPhoneNumber);
router.route('/user').get((req, res) => {
  const { id } = req.query;
  const user = data.users.find((i) => i.id === Number(id));
  return user && user.status
    ? res.json({ status: 'found', data: user })
    : res.json({ status: 'notfound', data: null });
});

router.route('/getUserByPhone').post((req, res) => {
  const { phone } = req.body;
  const user = data.users.find((i) => i.contact === phone);
  return user && user.status
    ? res.json({ status: 'found', data: user })
    : res.json({ status: 'notfound', data: null });
});

/*
router.route('/transaction').post((req, res) => {
  const {
    type,
    origin,
    payment_number,
    payment_cvv,
    expiration,
    total,
    fee,
    first,
    phone,
  } = req.body;
  const config = {
    method: 'post',
    url: `${process.env.PAYRIX_URL}/txns`,
    headers: {
      'Content-Type': 'application/json',
      APIKEY: '1b4cb9743471d6d49a964066ee290cbe',
    },
    data: {
      merchant: 't1_mer_60d35dde16c4cfea3a7dc3a',
      type: 1,
      origin: 1,
      payment: {
        number: payment_number,
        cvv: payment_cvv,
      },
      expiration: Number(expiration),
      total: Math.round(total * 100),
      fee: Math.round(fee * 100),
      first,
      phone,
    },
  };

  axios(config)
    .then(function (response) {
      if (response.data.response.data.length > 0) {
        res.json({
          status: 'success',
        });
      } else {
        res.json({
          status: 'failed',
          message:
            response.data.response.errors &&
            response.data.response.errors[0].msg,
        });
      }
    })
    .catch(function (error) {
      Sentry.captureException(error);
      console.log(error);
      res.json({});
    });
});
*/

module.exports = router;
