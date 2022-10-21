const fs = require('fs');
const fetch = require('node-fetch');
const models = require('../models');
const { Op } = require('sequelize');
const db = require('../models/index');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const sendEmail = require('../utils/sendEmail');
const Sentry = require('@sentry/node');
const moment = require('moment');
const { utc } = require('moment');
const TranasactionService = require('../services/transaction.service');
const TranasactionServiceInstance = new TranasactionService();
const ApiContracts = require('authorizenet').APIContracts;
const ApiControllers = require('authorizenet').APIControllers;
const lookUp = require('binlookup')();

let timeDiffFrom = '',
  timeDiffTo = '';
if (Intl.DateTimeFormat().resolvedOptions().timeZone === 'Asia/Calcutta') {
  timeDiffFrom = ' 05:30:00';
  timeDiffTo = ' 05:29:59';
} else if (
  Intl.DateTimeFormat().resolvedOptions().timeZone === 'US/Pacific' ||
  Intl.DateTimeFormat().resolvedOptions().timeZone === 'America/Los_Angeles'
) {
  timeDiffFrom = ' 17:00:00';
  let Date;
  timeDiffTo = ' 16:59:59';
}

//To set Date Format in receipt mail
exports.getFormattedDate = (date) => {
  let year = date.getFullYear();
  let month = (1 + date.getMonth()).toString().padStart(2, '0');
  let day = date.getDate().toString().padStart(2, '0');

  return month + '-' + day + '-' + year;
};

//To set Type of Transaction while trying Refund/Void/Capture
// (currently applicable only to Payrix)
exports.TransactionType = (type) => {
  if (type == 'FullRefund' || type == 'PartialRefund') {
    type = 'Refund';
  }
  const txnType = {
    Sale: 1,
    Auth: 2,
    Capture: 3,
    Void: 4,
    Refund: 5,
  };
  return txnType[type];
};

//Transaction Status Constants General for txns via Auxvault
exports.getTransStatus = (status) => {
  const Status = {
    0: 'Pending',
    1: 'Approved',
    2: 'Failed',
    3: 'Captured',
    4: 'Settled',
    5: 'Returned',
    6: 'INITIATED',
    7: 'PAYMENT_CAPTURED',
    9: 'Declined',
  };
  return Status[status];
};

//To fetch Brands of credit card used for Txns Payrix
exports.getCardBrands = (brand) => {
  const methods = {
    1: 'American Express',
    2: 'Visa',
    3: 'MasterCard',
    4: 'Diners Club',
    5: 'Discover',
    7: 'Debit card',
    8: 'Checking account',
    9: 'Savings account',
    10: 'Corporate checking account',
    11: 'Corporate savings account',
  };
  return methods[brand];
};

//To fetch Brands of credit card used for Txns FP
exports.fluidPayCardBrands = (brand) => {
  const methods = {
    amex: '1',
    visa: '2',
    mastercard: '3',
    diners: '4',
    discover: '5',
  };
  return methods[brand];
};

//To set Gateway type used for Txns
exports.getPaidBy = (method) => {
  let gateWays = [];
  const methods = {
    ACH: ['FluidPay'],
    Card: ['FluidPay', 'Payrix'],
    Cash: ['PaysafeCash'],
  };

  return methods[method];
};

//To create receipt as email template and send receipt as mail for individual Txns
exports.getEmailReport = async (req, res) => {
  const transaction = await models.Transaction.findOne({
    include: [
      {
        model: models.User,
        attributes: [
          'FullName',
          'Email',
          'NotificationEmail',
          'CompanyName',
          'LogoPath',
          'PhoneNumber',
        ],
      },
      {
        model: models.Customer,
        attributes: ['CustomerName', 'Email'],
      },
      {
        model: models.States,
        attributes: ['id', 'StateName', 'Abbrevation'],
      },
      {
        model: models.Country,
        attributes: ['id', 'Name', 'Abbrevation'],
      },
    ],
    where: { TransactionId: req.params.id },
  });
  try {
    if (transaction) {
      const statusValue = exports.getTransStatus(transaction.Status);
      const date = exports.getFormattedDate(transaction.createdAt);
      const brand = exports.getCardBrands(transaction.PaymentMethod);
      const customer = await models.Customer.findOne({
        where: {
          id: transaction.CustomerId,
        },
      });
      await sendEmail(
        customer.Email,
        'Transaction Receipt',
        {
          Type: transaction.Type == '1' ? 'Paid' : 'Authorized',
          Total: transaction.Amount,
          Amount: (
            transaction.Amount - transaction.ConvenienceFeeValue
          ).toFixed(2),
          Date: date,
          Status: statusValue,
          Merchant: transaction.User.CompanyName,
          ConvenienceFee: transaction.ConvenienceFeeValue,
          Method: `${brand} ending with ${transaction.CardNumber}`,
          Cardholder: transaction.Customer.CustomerName,
          AuthorizationCode: transaction.AuthCode,
          GatewayRef: transaction.TransactionId,
          LogoPath: transaction.User.LogoPath,
          PhoneNumber: transaction.User.PhoneNumber,
        },
        '../utils/emailReport.hbs'
      );
      res.status(200).json({
        message: 'Transaction found successfully',
        data: transaction,
      });
    } else {
      return res.json({ Message: 'Mail Not Exist' });
    }
  } catch (error) {
    Sentry.captureException(error);
    return error;
  }
};

// To fetch all Txns via Auxvault for logged in user
exports.getAllTransactions = async (req, res) => {
  let token = '';
  let decoded = '';
  token = req.headers.authorization.split(' ');
  decoded = jwt.verify(token[1], process.env.JWT_SECRET);
  const limit =
    req.query.perPage == undefined || NaN ? 10 : parseInt(req.query.perPage);
  const offset =
    req.query.page == undefined || NaN ? 0 : parseInt(req.query.page) - 1;
  const skipRecord = Math.ceil(offset * limit);
  const sortOrder = req.query.sort === undefined ? 'desc' : req.query.sort;
  const sortColumn =
    req.query.sortColumn === undefined ? 'id' : req.query.sortColumn;
  const searchKey = req.query.q === undefined ? '' : req.query.q;
  // req.query.method = req.query.method == undefined ? '' : req.query.method;
  const includeTables = [
    {
      model: models.User,
      as: 'User',
      attributes: ['FullName', 'Email'],
    },
    {
      model: models.Customer,
      as: 'Customer',
      attributes: ['id', 'UUID', 'CustomerName', 'Email'],
    },
    {
      model: models.States,
      attributes: ['id', 'StateName', 'Abbrevation'],
    },
    {
      model: models.Country,
      attributes: ['id', 'Name', 'Abbrevation'],
    },
  ];
  const whereClausesOrData = [
    { '$Customer.CustomerName$': { [Op.like]: `%${searchKey}%` } },
    {
      id: {
        [Op.like]: `%${searchKey}%`,
      },
    },
    {
      Amount: {
        [Op.like]: `%${searchKey}%`,
      },
    },
    {
      TransactionId: {
        [Op.like]: '%' + searchKey + '%',
      },
    },
    {
      CardNumber: {
        [Op.like]: '%' + searchKey + '%',
      },
    },
    {
      RoutingNumber: {
        [Op.like]: '%' + searchKey + '%',
      },
    },
    {
      AccountNumber: {
        [Op.like]: '%' + searchKey + '%',
      },
    },
  ];

  let conditionsArray = [
    {
      MerchantId: {
        [Op.eq]: decoded.Id,
      },
    },
  ];

  let statusValue, paymentType, convFeeFilter;
  tempPaidBy = '';
  let custId = '',
    requestOrigin = '';
  if (req.query.result && req.query.result != '') {
    statusValue = req.query.result.split(',');
    conditionsArray.push({
      Status: {
        [Op.in]: statusValue,
      },
    });
  }

  if (req.query.custId && req.query.custId != '') {
    custId = req.query.custId.split(',');
    conditionsArray.push({
      CustomerId: {
        [Op.in]: custId,
      },
    });
  }

  if (req.query.requestOrigin && req.query.requestOrigin != '') {
    requestOrigin = req.query.requestOrigin.split(',');
    conditionsArray.push({
      RequestOrigin: {
        [Op.in]: requestOrigin,
      },
    });
  }

  if (req.query.paymentType && req.query.paymentType != '') {
    paymentType = req.query.paymentType.split(',');
    conditionsArray.push({
      Type: {
        [Op.in]: paymentType,
      },
    });
  }
  if (req.query.paidBy && req.query.paidBy != '') {
    tempPaidBy = req.query.paidBy.split(',');
  } else {
    tempPaidBy = ['Card', 'ACH', 'Cash'];
  }

  //let paidBy = '';
  // if (tempPaidBy.length > 0) {
  //   for (let i = 0; i < tempPaidBy.length; i++) {
  //     paidBy = exports.getPaidBy(tempPaidBy[i]);
  //   }
  //   conditionsArray.push({
  //     TransactionGateWay: {
  //       [Op.in]: paidBy,
  //     },
  //   });
  // }

  conditionsArray.push({
    SuggestedMode: {
      [Op.in]: tempPaidBy,
    },
  });
  let dateRange = '';
  if (req.query.dateRange && req.query.dateRange != '') {
    dateRange = req.query.dateRange;
  }
  let dateFrom = '',
    dateTo = '';
  const timeZoneoffSet = new Date().getTimezoneOffset();
  if (
    dateRange == 'today' &&
    req.query.dateFrom == '' &&
    req.query.dateTo == ''
  ) {
    dateFrom = new Date().toISOString().split('T')[0];
    dateFrom = new Date(dateFrom + timeDiffFrom);
    dateTo = new Date(dateFrom + timeDiffTo);
  } else if (
    dateRange == 'thisWeek' &&
    req.query.dateFrom == '' &&
    req.query.dateTo == ''
  ) {
    let curr = new Date(); // get current date
    let fDayofWeek = curr.getDate() - curr.getDay(); // First day is the day of the month - the day of the week
    let eDayofWeek = fDayofWeek + 6; // last day is the first day + 6

    let firstday = new Date(curr.setDate(fDayofWeek)).toUTCString();
    let lastday = new Date(curr.setDate(eDayofWeek)).toUTCString();

    firstday = new Date(firstday).getTime() - timeZoneoffSet * 60 * 1000;
    dateFrom = new Date(firstday).toISOString().split('T')[0];
    lastday = new Date(lastday).getTime() - timeZoneoffSet * 60 * 1000;
    dateTo = new Date(lastday).toISOString().split('T')[0];
    dateFrom = new Date(dateFrom + timeDiffFrom);
    dateTo = new Date(dateTo + timeDiffTo);
  } else if (
    dateRange == 'thisMonth' &&
    req.query.dateFrom == '' &&
    req.query.dateTo == ''
  ) {
    var date = new Date(),
      y = date.getFullYear(),
      m = date.getMonth();
    var firstDay = new Date(y, m, 1);
    var lastDay = new Date(y, m + 1, 0);
    firstDay = new Date(firstDay).getTime() - timeZoneoffSet * 60 * 1000;
    dateFrom = new Date(firstDay).toISOString().split('T')[0];
    lastDay = new Date(lastDay).getTime() - timeZoneoffSet * 60 * 1000;
    dateTo = new Date(lastDay).toISOString().split('T')[0];
    dateFrom = new Date(dateFrom + timeDiffFrom);
    dateTo = new Date(dateTo + timeDiffTo);
  } else if (
    dateRange == 'custom' &&
    req.query.dateFrom != '' &&
    req.query.dateTo != ''
  ) {
    dateFrom = new Date(req.query.dateFrom + timeDiffFrom);
    dateTo = new Date(req.query.dateTo + timeDiffTo);
  } else if (
    dateRange == 'custom' &&
    req.query.dateFrom == '' &&
    req.query.dateTo == ''
  ) {
    let currentDate = new Date();
    var priorDate = new Date(new Date().setDate(currentDate.getDate() - 30));
    dateFrom = new Date(
      new Date(priorDate).toISOString().split('T')[0] + timeDiffFrom
    );
    dateTo = new Date(
      new Date(currentDate).toISOString().split('T')[0] + timeDiffTo
    );
  } else if (dateRange == '' && !req.query.dateFrom && !req.query.dateTo) {
    dateFrom = '';
    dateTo = '';
  }

  if (dateRange && dateRange != '') {
    conditionsArray.push({
      CreatedAt: {
        [Op.between]: [dateFrom, dateTo],
      },
    });
  }
  console.log('My Dates', dateFrom, dateTo);
  console.log('My zone', Intl.DateTimeFormat().resolvedOptions().timeZone);
  console.log('My times', timeDiffFrom, timeDiffTo);

  if (req.query.convenienceFee && req.query.convenienceFee != '') {
    convFeeFilter = req.query.convenienceFee.split(',');
    conditionsArray.push({
      ConvenienceFeeActive: {
        [Op.in]: convFeeFilter,
      },
    });
  }

  await models.Transaction.findAndCountAll({
    // subQuery: false,
    include: includeTables,
    where: {
      [Op.and]: conditionsArray,
      [Op.or]: whereClausesOrData,
    },
    order: [[sortColumn, sortOrder]],
    limit: limit,
    offset: skipRecord,
  })
    .then(async (transaction) => {
      const totalPages = Math.ceil(transaction['count'] / limit);
      res.status(200).json({
        message: 'Transaction found successfully',
        data: transaction,
        paging: {
          pages: totalPages,
        },
      });
    })
    .catch(async (err) => {
      Sentry.captureException(err);
      res.status(500).json({
        message: 'Something went wrong',
        error: err,
      });
    });
};

// To fetch individual Txns via Auxvault for logged in user
exports.getTransactionById = async (req, res) => {
  const currentUser = req.currentUser;
  const transaction = await models.Transaction.findOne({
    include: [
      {
        model: models.User,
        attributes: ['FullName', 'Email'],
      },
      {
        model: models.Customer,
        attributes: ['CustomerName', 'Email'],
      },
      {
        model: models.States,
        attributes: ['id', 'StateName', 'Abbrevation'],
      },
      {
        model: models.Country,
        attributes: ['id', 'Name', 'Abbrevation'],
      },
    ],
    where: {
      [Op.and]: [{ UUID: req.params.id }],
    },
  });
  if (transaction === null) {
    res.status(404).json({
      message: 'Transaction Not Exist',
    });
  } else {
    let TransactionId = transaction.TransactionId;
    const userGateWayData = await models.MerchantPaymentGateWay.findOne({
      where: {
        [Op.and]: [
          { GatewayType: transaction.TransactionGateWay },
          { UserID: transaction.MerchantId },
        ],
      },
    });
    if (transaction.TransactionGateWay == 'Payrix') {
      let config = {
        method: 'get',
        url: `${process.env.PAYRIX_URL}/txns/${TransactionId}`,
        headers: {
          'Content-Type': 'application/json',
          APIKEY: userGateWayData.GatewayApiKey,
        },
      };
      let setteledAt = '';
      const resp = await axios(config);

      if (resp.data.response.data.length > 0) {
        const data = resp.data;
        if (data.response.data[0].status != '4') {
          const updateStatus = await models.Transaction.update(
            {
              Status: data.response.data[0].status,
              updatedAt: moment(data.response.data[0].modified).format(
                'YYYY-MM-DD HH:mm:ss'
              ),
            },
            {
              where: {
                [Op.and]: [{ TransactionId: TransactionId }],
              },
            }
          );
        } else {
          if (data.response.data[0].settled != null) {
            setteledAt = moment(
              data.response.data[0].settled.toString()
            ).format('YYYY-MM-DD HH:mm:ss');
          } else {
            setteledAt = moment(data.response.data[0].modified).format(
              'YYYY-MM-DD HH:mm:ss'
            );
          }
          const updateStatus = await models.Transaction.update(
            {
              Status: data.response.data[0].status,
              SettledDate: setteledAt,
              updatedAt: moment(data.response.data[0].modified).format(
                'YYYY-MM-DD HH:mm:ss'
              ),
            },
            {
              where: {
                TransactionId: TransactionId,
              },
            }
          );
        }

        const findupdatedTrs = await models.Transaction.findOne({
          include: [
            {
              model: models.User,
              attributes: ['FullName', 'Email'],
            },
            {
              model: models.Customer,
              attributes: ['CustomerName', 'Email'],
            },
            {
              model: models.States,
              attributes: ['id', 'StateName', 'Abbrevation'],
            },
            {
              model: models.Country,
              attributes: ['id', 'Name', 'Abbrevation'],
            },
          ],
          where: {
            [Op.and]: [
              { TransactionId: TransactionId },
              { UUID: req.params.id },
            ],
          },
        });
        if (findupdatedTrs.Refund == true) {
          const refundData = await models.RefundVoidCaptureTable.findOne({
            where: { TransactionId: findupdatedTrs.id },
          });

          findupdatedTrs.setDataValue('RefundData', refundData);
          return res.status(200).json({
            message: 'Transaction Found Successfully',
            data: findupdatedTrs,
          });
        } else if (findupdatedTrs.Capture == true) {
          const captureData = await models.RefundVoidCaptureTable.findOne({
            where: { TransactionId: findupdatedTrs.id },
          });

          findupdatedTrs.setDataValue('CaptureData', captureData);
          return res.status(200).json({
            message: 'Transaction Found Successfully',
            data: findupdatedTrs,
          });
        } else if (findupdatedTrs.Void == true) {
          const voidData = await models.RefundVoidCaptureTable.findOne({
            where: { TransactionId: findupdatedTrs.id },
          });

          findupdatedTrs.setDataValue('VoidData', voidData);
          return res.status(200).json({
            message: 'Transaction Found Successfully',
            data: findupdatedTrs,
          });
        } else {
          return res.status(200).json({
            message: 'Transaction Found Successfully',
            data: findupdatedTrs,
          });
        }
      } else {
        return res.status(200).json({
          message: 'Something went wrong',
          data: resp,
        });
      }
    } else if (transaction.TransactionGateWay == 'FluidPay') {
      const requestHeader = {
        'Content-Type': 'application/json',
        Authorization: userGateWayData.GatewayApiKey,
      };
      const requestOptions = {
        method: 'GET',
        headers: requestHeader,
      };
      const response = await fetch(
        `${process.env.FLUIDPAY_API_URL}/api/transaction/${TransactionId}`,
        requestOptions
      );
      const data = await response.json();
      let setteledAt = '';
      if (data.status === 'success') {
        if (
          data['data'].status == 'authorized' ||
          data['data'].status == 'voided'
        ) {
          data['data'].status = '1';
          const updateStatus = await models.Transaction.update(
            {
              Status: data['data'].status,
              updatedAt: moment(data['data'].updated_at).format(
                'YYYY-MM-DD HH:mm:ss'
              ),
            },
            {
              where: {
                [Op.and]: [{ TransactionId: TransactionId }],
              },
            }
          );
        } else if (data['data'].status == 'pending_settlement') {
          data['data'].status = '1';
          const updateStatus = await models.Transaction.update(
            {
              Status: data['data'].status,
              updatedAt: moment(data['data'].updated_at).format(
                'YYYY-MM-DD HH:mm:ss'
              ),
            },
            {
              where: {
                [Op.and]: [{ TransactionId: TransactionId }],
              },
            }
          );
        } else if (data['data'].status == 'settled') {
          data['data'].status = '4';
          if (data['data'].settled_at != null) {
            setteledAt = moment(data['data'].settled_at).format(
              'YYYY-MM-DD HH:mm:ss'
            );
          }
          const updateStatus = await models.Transaction.update(
            {
              Status: data['data'].status,
              SettledDate: setteledAt,
              updatedAt: moment(data['data'].updated_at).format(
                'YYYY-MM-DD HH:mm:ss'
              ),
            },
            {
              where: {
                [Op.and]: [{ TransactionId: TransactionId }],
              },
            }
          );
        } else if (data['data'].status == 'declined') {
          data['data'].status = '9';
          const updateStatus = await models.Transaction.update(
            {
              Status: data['data'].status,
              updatedAt: moment(data['data'].updated_at).format(
                'YYYY-MM-DD HH:mm:ss'
              ),
            },
            {
              where: {
                [Op.and]: [{ TransactionId: TransactionId }],
              },
            }
          );
        } else if (
          data['data'].status == 'failed' ||
          data['data'].status == 'unknown'
        ) {
          data['data'].status = '2';
          const updateStatus = await models.Transaction.update(
            {
              Status: data['data'].status,
              updatedAt: moment(data['data'].updated_at).format(
                'YYYY-MM-DD HH:mm:ss'
              ),
            },
            {
              where: {
                [Op.and]: [{ TransactionId: TransactionId }],
              },
            }
          );
        }

        const findupdatedTrs = await models.Transaction.findOne({
          include: [
            {
              model: models.User,
              attributes: ['FullName', 'Email'],
            },
            {
              model: models.Customer,
              attributes: ['CustomerName', 'Email'],
            },
            {
              model: models.States,
              attributes: ['id', 'StateName', 'Abbrevation'],
            },
            {
              model: models.Country,
              attributes: ['id', 'Name', 'Abbrevation'],
            },
          ],
          where: {
            [Op.and]: [
              { TransactionId: TransactionId },
              { UUID: req.params.id },
            ],
          },
        });
        if (findupdatedTrs.Refund == true) {
          const refundData = await models.RefundVoidCaptureTable.findOne({
            where: { TransactionId: findupdatedTrs.id },
          });

          findupdatedTrs.setDataValue('RefundData', refundData);
          return res.status(200).json({
            message: 'Transaction Found Successfully',
            data: findupdatedTrs,
          });
        } else if (findupdatedTrs.Capture == true) {
          const captureData = await models.RefundVoidCaptureTable.findOne({
            where: { TransactionId: findupdatedTrs.id },
          });

          findupdatedTrs.setDataValue('CaptureData', captureData);
          return res.status(200).json({
            message: 'Transaction Found Successfully',
            data: findupdatedTrs,
          });
        } else if (findupdatedTrs.Void == true) {
          const voidData = await models.RefundVoidCaptureTable.findOne({
            where: { TransactionId: findupdatedTrs.id },
          });

          findupdatedTrs.setDataValue('VoidData', voidData);
          return res.status(200).json({
            message: 'Transaction Found Successfully',
            data: findupdatedTrs,
          });
        } else {
          return res.status(200).json({
            message: 'Transaction Found Successfully',
            data: findupdatedTrs,
          });
        }
      } else {
        return res.status(200).json({
          message: data.status,
          data: JSON.parse(JSON.stringify(data)),
        });
      }
    } else {
      return res.status(200).json({
        message: 'Transaction Found Successfully',
        data: transaction,
      });
    }
  }
};

// To Calculate ConvenienceFee for Txn defined by Auxvault
exports.getConvenienceFee = (
  amount,
  feeValue,
  isUnitPercentage,
  feeMinimum
) => {
  const fVal =
    isUnitPercentage == 'Percentage'
      ? (parseFloat(amount) * parseFloat(feeValue)) / 100 <
        parseFloat(feeMinimum)
        ? parseFloat(feeMinimum)
        : (parseFloat(amount) * parseFloat(feeValue)) / 100
      : parseFloat(feeValue);
  return parseFloat(fVal).toFixed(2);
};

// To process a Txn via Auxvault using Payrix
exports.processPayrixTransactions = async (
  req,
  userInfo,
  userGateWayData,
  res
) => {
  const delay = (ms = 4000) => new Promise((r) => setTimeout(r, ms));
  try {
    let feeAmount = '',
      total = '';

    const payment = {
      number: req.body.CardNumber.replace(/\s/g, ''),
      cvv: req.body.Cvv,
    };
    let transaction = {
      merchant: userGateWayData.GMerchantId,
      type: req.body.TransactionType,
      origin: '1',
      payment: payment,
      expiration: req.body.ExpiryDate.replace(/\s/g, '').replace(/\\|\//g, ''),
      first: req.body.BillingCustomerName,
      address1: req.body.BillingAddress,
      city: req.body.BillingCity,
      state: req.body.BillingState != 'OT' ? req.body.BillingState : '',
      zip: req.body.BillingPostalCode,
      country: req.body.BillingCountry,
      email:
        req.body.BillingEmail !== null && req.body.BillingEmail !== undefined
          ? req.body.BillingEmail
          : null,
      phone: req.body.BillingPhoneNumber,
    };
    let requestConfig = {
      method: 'post',
      url: `${process.env.PAYRIX_URL}/txns`,
      headers: {
        'Content-Type': 'application/json',
        APIKEY: userGateWayData.GatewayApiKey,
      },
    };
    const stateData = await models.States.findOne({
      where: {
        Abbrevation: req.body.BillingState ?? null,
      },
    });
    const countryData = await models.Country.findOne({
      where: {
        Abbrevation: req.body.BillingCountry ?? null,
      },
    });

    if (req.body.PaymentLinkId == undefined) {
      if (
        userGateWayData.ConvenienceFeeActive == true &&
        req.body.ConvenienceFeeActive == true
      ) {
        feeAmount = parseFloat(
          exports.getConvenienceFee(
            req.body.Amount,
            userGateWayData.ConvenienceFeeValue,
            userGateWayData.ConvenienceFeeType,
            userGateWayData.ConvenienceFeeMinimum
          )
        );
        total =
          parseFloat(req.body.Amount) +
          parseFloat(feeAmount) +
          parseFloat(req.body.TipAmount);
        transaction['total'] = Math.round(total * 100);
        transaction['fee'] = Math.round(feeAmount * 100);
      } else {
        feeAmount = null;
        total = parseFloat(req.body.Amount) + parseFloat(req.body.TipAmount);
        transaction['total'] = Math.round(total * 100);
      }
      requestConfig['data'] = transaction;
      const requestbfreDelayVT = {
        GatewayType: userGateWayData.GatewayType,
        Request: requestConfig,
        MerchantId: userInfo.id,
      };
      await models.ResponseRequestTable.create(requestbfreDelayVT);
      const resp = await axios(requestConfig);
      const responseData = resp.data;
      const responseBforeDelayVT = {
        GatewayType: userGateWayData.GatewayType,
        Request: requestConfig,
        Response: responseData,
        MerchantId: userInfo.id,
      };
      await models.ResponseRequestTable.create(responseBforeDelayVT);
      if (responseData.response.errors.length == 0) {
        let newConfig = {
          method: 'get',
          url: `${process.env.PAYRIX_URL}/txns/${responseData.response.data[0].id}`,
          headers: {
            'Content-Type': 'application/json',
            APIKEY: userGateWayData.GatewayApiKey,
          },
        };
        const requestWithNewReqVT = {
          GatewayType: userGateWayData.GatewayType,
          Request: newConfig,
          MerchantId: userInfo.id,
        };
        await models.ResponseRequestTable.create(requestWithNewReqVT);
        await delay();
        const resp = await axios(newConfig);
        const newResp = resp.data;
        const rspnsaftrDelayVT = {
          GatewayType: userGateWayData.GatewayType,
          Request: newConfig,
          Response: newResp,
          MerchantId: userInfo.id,
        };
        await models.ResponseRequestTable.create(rspnsaftrDelayVT);
        const checkCustomer = await exports.checkCustomerExist(
          req,
          userInfo.id
        );

        const findCustomer = await models.Customer.findOne({
          where: {
            [Op.and]: [
              { CountryCode: req.body.BillingCountryCode },
              { PhoneNumber: req.body.BillingPhoneNumber },
              { UserId: userInfo.id },
            ],
          },
        });
        if (
          newResp.response.data.length > 0 &&
          newResp.response.data[0].status != 2 &&
          newResp.response.errors.length == 0
        ) {
          const transData = newResp.response.data;
          const transactionData = {
            CustomerId: findCustomer.id,
            MerchantId: userInfo.id,
            TransactionId: transData[0].id,
            Amount: transData[0].total / 100,
            CardNumber: transData[0].payment.number,
            PaymentMethod: transData[0].payment.method,
            Type: transData[0].type,
            Status: transData[0].status,
            BillingEmail: transData[0].email,
            BillingCustomerName: transData[0].first,
            BillingAddress: transData[0].address1,
            BillingCity: transData[0].city,
            BillingState: stateData != undefined ? stateData.id : null,
            BillingPostalCode: transData[0].zip,
            BillingCountry: countryData != undefined ? countryData.id : null,
            BillingCountryCode: req.body.BillingCountryCode,
            BillingPhoneNumber: transData[0].phone,
            IsShippingSame: req.body.shippingSameAsBilling,
            ShippingEmail: transData[0].email,
            ShippingCustomerName: transData[0].first,
            ShippingAddress: transData[0].address1,
            ShippingCity: transData[0].city,
            ShippingState: stateData != undefined ? stateData.id : null,
            ShippingPostalCode: transData[0].zip,
            ShippingCountry: countryData != undefined ? countryData.id : null,
            ShippingPhoneNumber: transData[0].phone,
            ExpiryDate: req.body.ExpiryDate.replace(/\s/g, '').replace(
              /\\|\//g,
              ''
            ),
            Cvv: req.body.Cvv,
            ConvenienceFeeValue: feeAmount != null ? transData[0].fee / 100 : 0,
            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
            AuthCode: transData[0].authorization,
            TransactionGateWay: 'Payrix',
            Refund: false,
            Void: false,
            Capture: false,
            Tokenization: req.body.PaymentTokenization,
            Message: req.body.Message,
            Description: req.body.Description,
            ReferenceNo: req.body.ReferenceNo,
            ConvenienceFeeActive:
              userGateWayData.ConvenienceFeeActive == true &&
              req.body.ConvenienceFeeActive == true
                ? true
                : false,
            RequestOrigin: req.body.RequestOrigin,
            createdAt: transData[0].created,
            updatedAt: transData[0].modified,
            SuggestedMode:
              req.body.SuggestedMode != undefined
                ? req.body.SuggestedMode
                : 'Card',
            TipAmount: parseFloat(req.body.TipAmount),
          };
          const insertTrans = await models.Transaction.create(transactionData);
          const trs = await models.Transaction.findOne({
            where: {
              [Op.and]: [
                { TransactionId: transData[0].id },
                { MerchantId: userInfo.id },
                { CustomerId: findCustomer.id },
              ],
            },
          });
          await TranasactionServiceInstance.checkNotificationSettingAndCreateEmail(
            userInfo.id,
            transData[0].id,
            'TransactionCompleted'
          ); // Check and Send Email according to notification setting
          if (req.body.PaymentTokenization == true) {
            if (checkCustomer != 'skip Token') {
              const createToken = {
                merchant: userGateWayData.GMerchantId,
                first: transData[0].first,
                phone: transData[0].phone,
                country: req.body.BillingCountry,
                zip: transData[0].zip,
                state:
                  req.body.BillingState != 'OT' ? req.body.BillingState : '',
                city: transData[0].city,
                address1: transData[0].address1,
                inactive: 0,
                frozen: 0,
                shippingFirst: transData[0].first,
                shippingAddress1: transData[0].address1,
                shippingCity: transData[0].city,
                shippingState:
                  req.body.BillingState != 'OT' ? req.body.BillingState : '',
                shippingZip: transData[0].zip,
                shippingCountry: req.body.BillingCountry,
                shippingPhone: transData[0].phone,
              };
              if (createToken.email == '') {
                delete createToken.email;
              }
              if (
                createToken.state == 'OT' &&
                createToken.shippingState == 'OT'
              ) {
                delete createToken.state;
                delete createToken.shippingState;
              }
              if (
                createToken.state == 'OT' &&
                createToken.shippingState == 'OT'
              ) {
                delete createToken.state;
                delete createToken.shippingState;
              }
              await exports.createCustomerToken(
                createToken,
                userGateWayData.GatewayApiKey,
                trs,
                payment,
                req.body.ExpiryDate.replace(/\s/g, '').replace(/\\|\//g, ''),
                checkCustomer
              );
              return res.status(200).json({
                status: 'success',
                message: 'Transaction Completed Successfully',
                data: JSON.parse(JSON.stringify(trs)),
              });
            } else {
              return res.status(200).json({
                status: 'success',
                message: 'Transaction Completed Successfully',
                data: JSON.parse(JSON.stringify(trs)),
              });
            }
          } else {
            return res.status(200).json({
              status: 'success',
              message: 'Transaction Completed Successfully',
              data: JSON.parse(JSON.stringify(trs)),
            });
          }
        } else if (
          newResp.response.data.length > 0 &&
          newResp.response.data[0].status == 2 &&
          newResp.response.errors.length > 0
        ) {
          const transData = newResp.response.data;
          const transError = newResp.response.errors[0].msg;
          const transactionData = {
            CustomerId: findCustomer.id,
            MerchantId: userInfo.id,
            TransactionId: transData[0].id,
            Amount: transData[0].total / 100,
            CardNumber: transData[0].payment.number,
            PaymentMethod: transData[0].payment.method,
            Type: transData[0].type,
            Status: transData[0].status,
            BillingEmail: transData[0].email,
            BillingCustomerName: transData[0].first,
            BillingAddress: transData[0].address1,
            BillingCity: transData[0].city,
            BillingState: stateData != undefined ? stateData.id : null,
            BillingPostalCode: transData[0].zip,
            BillingCountry: countryData != undefined ? countryData.id : null,
            BillingCountryCode: req.body.BillingCountryCode,
            BillingPhoneNumber: transData[0].phone,
            IsShippingSame: req.body.shippingSameAsBilling,
            ShippingEmail: transData[0].email,
            ShippingCustomerName: transData[0].first,
            ShippingAddress: transData[0].address1,
            ShippingCity: transData[0].city,
            ShippingState: stateData != undefined ? stateData.id : null,
            ShippingPostalCode: transData[0].zip,
            ShippingCountry: countryData != undefined ? countryData.id : null,
            ShippingPhoneNumber: transData[0].phone,
            ExpiryDate: req.body.ExpiryDate.replace(/\s/g, '').replace(
              /\\|\//g,
              ''
            ),
            Cvv: req.body.Cvv,
            ConvenienceFeeValue: feeAmount != null ? transData[0].fee / 100 : 0,
            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
            AuthCode: transData[0].authorization,
            TransactionGateWay: 'Payrix',
            Refund: false,
            Void: false,
            Capture: false,
            Tokenization: req.body.PaymentTokenization,
            Message: req.body.Message,
            Description: req.body.Description,
            ReferenceNo: req.body.ReferenceNo,
            ConvenienceFeeActive:
              userGateWayData.ConvenienceFeeActive == true &&
              req.body.ConvenienceFeeActive == true
                ? true
                : false,
            RequestOrigin: req.body.RequestOrigin,
            createdAt: transData[0].created,
            updatedAt: transData[0].modified,
            SuggestedMode:
              req.body.SuggestedMode != undefined
                ? req.body.SuggestedMode
                : 'Card',
            TipAmount: parseFloat(req.body.TipAmount),
          };
          const insertTrans = await models.Transaction.create(transactionData);
          const trs = await models.Transaction.findOne({
            where: {
              [Op.and]: [
                { TransactionId: transData[0].id },
                { MerchantId: userInfo.id },
                { CustomerId: findCustomer.id },
              ],
            },
          });
          await TranasactionServiceInstance.checkNotificationSettingAndCreateEmail(
            userInfo.id,
            transData[0].id,
            'TransactionFailed'
          ); // Check and Send Email according to notification setting
          if (req.body.PaymentTokenization == true) {
            if (checkCustomer != 'skip Token') {
              const createToken = {
                merchant: userGateWayData.GMerchantId,
                first: transData[0].first,
                phone: transData[0].phone,
                country: req.body.BillingCountry,
                zip: transData[0].zip,
                state:
                  req.body.BillingState != 'OT' ? req.body.BillingState : '',
                city: transData[0].city,
                address1: transData[0].address1,
                inactive: 0,
                frozen: 0,
                shippingFirst: transData[0].first,
                shippingAddress1: transData[0].address1,
                shippingCity: transData[0].city,
                shippingState:
                  req.body.BillingState != 'OT' ? req.body.BillingState : '',
                shippingZip: transData[0].zip,
                shippingCountry: req.body.BillingCountry,
                shippingPhone: transData[0].phone,
              };
              if (createToken.email == '') {
                delete createToken.email;
              }
              if (
                createToken.state == 'OT' &&
                createToken.shippingState == 'OT'
              ) {
                delete createToken.state;
                delete createToken.shippingState;
              }
              if (
                createToken.state == 'OT' &&
                createToken.shippingState == 'OT'
              ) {
                delete createToken.state;
                delete createToken.shippingState;
              }
              await exports.createCustomerToken(
                createToken,
                userGateWayData.GatewayApiKey,
                trs,
                payment,
                req.body.ExpiryDate.replace(/\s/g, '').replace(/\\|\//g, ''),
                checkCustomer
              );
              return res.status(200).json({
                status: 'error',
                message: `Transaction Failed due to ${transError}`,
                data: JSON.parse(JSON.stringify(trs)),
              });
            } else {
              return res.status(200).json({
                status: 'error',
                message: `Transaction Failed due to ${transError}`,
                data: JSON.parse(JSON.stringify(trs)),
              });
            }
          } else {
            return res.status(200).json({
              status: 'error',
              message: `Transaction Failed due to ${transError}`,
              data: JSON.parse(JSON.stringify(trs)),
            });
          }
        } else if (
          newResp.response.data.length == 0 &&
          newResp.response.errors.length > 0
        ) {
          await TranasactionServiceInstance.sendEmailToMerchantOnFailedTransaction(
            userInfo,
            'Transaction Failed',
            `${newResp.response.errors[0].msg}`
          );
          Sentry.captureException(newResp.response.errors[0].msg);
          return res.status(500).json({
            status: 'error',
            message: `${newResp.response.errors[0].msg}`,
          });
        }
      } else {
        await TranasactionServiceInstance.sendEmailToMerchantOnFailedTransaction(
          userInfo,
          'Transaction Failed',
          `${responseData.response.errors[0].msg}`
        );
        Sentry.captureException(responseData.response.errors[0].msg);
        return res.status(500).json({
          status: 'error',
          message: `${responseData.response.errors[0].msg}`,
        });
      }
    } else {
      //For paymentLink Transactions
      const checkFeeActive = await models.PaymentLink.findOne({
        where: { UUID: req.body.PaymentLinkId },
      });
      if (
        checkFeeActive.ConvenienceFeeActive == true &&
        userGateWayData.ConvenienceFeeActive == true
      ) {
        feeAmount = parseFloat(
          exports.getConvenienceFee(
            req.body.Amount,
            userGateWayData.ConvenienceFeeValue,
            userGateWayData.ConvenienceFeeType,
            userGateWayData.ConvenienceFeeMinimum
          )
        );
        total =
          parseFloat(req.body.Amount) +
          parseFloat(feeAmount) +
          parseFloat(req.body.TipAmount);
        transaction['total'] = Math.round(total * 100);
        transaction['fee'] = Math.round(feeAmount * 100);
      } else {
        feeAmount = null;
        total = parseFloat(req.body.Amount) + parseFloat(req.body.TipAmount);
        transaction['total'] = Math.round(total * 100);
      }
      requestConfig['data'] = transaction;
      const requestbfreDelayPL = {
        GatewayType: userGateWayData.GatewayType,
        Request: requestConfig,
        MerchantId: userInfo.id,
      };
      await models.ResponseRequestTable.create(requestbfreDelayPL);
      const resp = await axios(requestConfig);
      const responseData = resp.data;
      const respnseBfreDelyPL = {
        GatewayType: userGateWayData.GatewayType,
        Request: requestConfig,
        Response: responseData,
        MerchantId: userInfo.id,
      };
      await models.ResponseRequestTable.create(respnseBfreDelyPL);
      if (responseData.response.errors.length == 0) {
        let newConfig = {
          method: 'get',
          url: `${process.env.PAYRIX_URL}/txns/${responseData.response.data[0].id}`,
          headers: {
            'Content-Type': 'application/json',
            APIKEY: userGateWayData.GatewayApiKey,
          },
        };
        const reqWithNewReqPL = {
          GatewayType: userGateWayData.GatewayType,
          Request: newConfig,
          MerchantId: userInfo.id,
        };
        await models.ResponseRequestTable.create(reqWithNewReqPL);
        await delay();
        const resp = await axios(newConfig);
        const newResp = resp.data;
        const respAftrDelyPL = {
          GatewayType: userGateWayData.GatewayType,
          Request: newConfig,
          Response: newResp,
          MerchantId: userInfo.id,
        };
        await models.ResponseRequestTable.create(respAftrDelyPL);
        const checkCustomer = await exports.checkCustomerExist(
          req,
          userInfo.id
        );

        const findCustomer = await models.Customer.findOne({
          where: {
            [Op.and]: [
              { CountryCode: req.body.BillingCountryCode },
              { PhoneNumber: req.body.BillingPhoneNumber },
              { UserId: userInfo.id },
            ],
          },
        });
        if (
          newResp.response.data.length > 0 &&
          newResp.response.data[0].status != 2 &&
          newResp.response.errors.length == 0
        ) {
          const transData = newResp.response.data;
          const transactionData = {
            CustomerId: findCustomer.id,
            MerchantId: userInfo.id,
            TransactionId: transData[0].id,
            Amount: transData[0].total / 100,
            CardNumber: transData[0].payment.number,
            PaymentMethod: transData[0].payment.method,
            Type: transData[0].type,
            Status: transData[0].status,
            BillingEmail: transData[0].email,
            BillingCustomerName: transData[0].first,
            BillingAddress: transData[0].address1,
            BillingCity: transData[0].city,
            BillingState: stateData != undefined ? stateData.id : null,
            BillingPostalCode: transData[0].zip,
            BillingCountry: countryData != undefined ? countryData.id : null,
            BillingCountryCode: req.body.BillingCountryCode,
            BillingPhoneNumber: transData[0].phone,
            IsShippingSame: req.body.shippingSameAsBilling,
            ShippingEmail: transData[0].email,
            ShippingCustomerName: transData[0].first,
            ShippingAddress: transData[0].address1,
            ShippingCity: transData[0].city,
            ShippingState: stateData != undefined ? stateData.id : null,
            ShippingPostalCode: transData[0].zip,
            ShippingCountry: countryData != undefined ? countryData.id : null,
            ShippingPhoneNumber: transData[0].phone,
            ExpiryDate: req.body.ExpiryDate.replace(/\s/g, '').replace(
              /\\|\//g,
              ''
            ),
            Cvv: req.body.Cvv,
            ConvenienceFeeValue: feeAmount != null ? transData[0].fee / 100 : 0,
            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
            AuthCode: transData[0].authorization,
            TransactionGateWay: 'Payrix',
            Refund: false,
            Void: false,
            Capture: false,
            Tokenization: req.body.PaymentTokenization,
            Message: req.body.Message,
            Description: req.body.Description,
            ReferenceNo: req.body.ReferenceNo,
            ConvenienceFeeActive:
              userGateWayData.ConvenienceFeeActive == true &&
              req.body.ConvenienceFeeActive == true
                ? true
                : false,
            RequestOrigin: req.body.RequestOrigin,
            createdAt: transData[0].created,
            updatedAt: transData[0].modified,
            SuggestedMode:
              req.body.SuggestedMode != undefined
                ? req.body.SuggestedMode
                : 'Card',
            TipAmount: parseFloat(req.body.TipAmount),
          };
          const insertTrans = await models.Transaction.create(transactionData);
          const trs = await models.Transaction.findOne({
            where: {
              [Op.and]: [
                { TransactionId: transData[0].id },
                { MerchantId: userInfo.id },
                { CustomerId: findCustomer.id },
              ],
            },
          });
          await TranasactionServiceInstance.checkNotificationSettingAndCreateEmail(
            userInfo.id,
            transData[0].id,
            'TransactionCompleted'
          ); // Check and Send Email according to notification setting
          if (req.body.PaymentTokenization == true) {
            if (checkCustomer != 'skip Token') {
              const createToken = {
                merchant: userGateWayData.GMerchantId,
                first: transData[0].first,
                phone: transData[0].phone,
                country: req.body.BillingCountry,
                zip: transData[0].zip,
                state:
                  req.body.BillingState != 'OT' ? req.body.BillingState : '',
                city: transData[0].city,
                address1: transData[0].address1,
                inactive: 0,
                frozen: 0,
                shippingFirst: transData[0].first,
                shippingAddress1: transData[0].address1,
                shippingCity: transData[0].city,
                shippingState:
                  req.body.BillingState != 'OT' ? req.body.BillingState : '',
                shippingZip: transData[0].zip,
                shippingCountry: req.body.BillingCountry,
                shippingPhone: transData[0].phone,
              };
              if (createToken.email == '') {
                delete createToken.email;
              }
              if (
                createToken.state == 'OT' &&
                createToken.shippingState == 'OT'
              ) {
                delete createToken.state;
                delete createToken.shippingState;
              }
              if (
                createToken.state == 'OT' &&
                createToken.shippingState == 'OT'
              ) {
                delete createToken.state;
                delete createToken.shippingState;
              }
              await exports.createCustomerToken(
                createToken,
                userGateWayData.GatewayApiKey,
                trs,
                payment,
                req.body.ExpiryDate.replace(/\s/g, '').replace(/\\|\//g, ''),
                checkCustomer
              );
              await exports.sendWebHook(
                undefined,
                trs,
                req.body.PaymentLinkId,
                userInfo.id
              );
              return res.status(200).json({
                status: 'success',
                message: 'Transaction Completed Successfully',
                data: JSON.parse(JSON.stringify(trs)),
              });
            } else {
              await exports.sendWebHook(
                undefined,
                trs,
                req.body.PaymentLinkId,
                userInfo.id
              );
              return res.status(200).json({
                status: 'success',
                message: 'Transaction Completed Successfully',
                data: JSON.parse(JSON.stringify(trs)),
              });
            }
          } else {
            await exports.sendWebHook(
              undefined,
              trs,
              req.body.PaymentLinkId,
              userInfo.id
            );
            return res.status(200).json({
              status: 'success',
              message: 'Transaction Completed Successfully',
              data: JSON.parse(JSON.stringify(trs)),
            });
          }
        } else if (
          newResp.response.data.length > 0 &&
          newResp.response.data[0].status == 2 &&
          newResp.response.errors.length > 0
        ) {
          const transData = newResp.response.data;
          const transError = newResp.response.errors[0].msg;
          const transactionData = {
            CustomerId: findCustomer.id,
            MerchantId: userInfo.id,
            TransactionId: transData[0].id,
            Amount: transData[0].total / 100,
            CardNumber: transData[0].payment.number,
            PaymentMethod: transData[0].payment.method,
            Type: transData[0].type,
            Status: transData[0].status,
            BillingEmail: transData[0].email,
            BillingCustomerName: transData[0].first,
            BillingAddress: transData[0].address1,
            BillingCity: transData[0].city,
            BillingState: stateData != undefined ? stateData.id : null,
            BillingPostalCode: transData[0].zip,
            BillingCountry: countryData != undefined ? countryData.id : null,
            BillingCountryCode: req.body.BillingCountryCode,
            BillingPhoneNumber: transData[0].phone,
            IsShippingSame: req.body.shippingSameAsBilling,
            ShippingEmail: transData[0].email,
            ShippingCustomerName: transData[0].first,
            ShippingAddress: transData[0].address1,
            ShippingCity: transData[0].city,
            ShippingState: stateData != undefined ? stateData.id : null,
            ShippingPostalCode: transData[0].zip,
            ShippingCountry: countryData != undefined ? countryData.id : null,
            ShippingPhoneNumber: transData[0].phone,
            ExpiryDate: req.body.ExpiryDate.replace(/\s/g, '').replace(
              /\\|\//g,
              ''
            ),
            Cvv: req.body.Cvv,
            ConvenienceFeeValue: feeAmount != null ? transData[0].fee / 100 : 0,
            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
            AuthCode: transData[0].authorization,
            TransactionGateWay: 'Payrix',
            Refund: false,
            Void: false,
            Capture: false,
            Tokenization: req.body.PaymentTokenization,
            Message: req.body.Message,
            Description: req.body.Description,
            ReferenceNo: req.body.ReferenceNo,
            ConvenienceFeeActive:
              userGateWayData.ConvenienceFeeActive == true &&
              req.body.ConvenienceFeeActive == true
                ? true
                : false,
            RequestOrigin: req.body.RequestOrigin,
            createdAt: transData[0].created,
            updatedAt: transData[0].modified,
            SuggestedMode:
              req.body.SuggestedMode != undefined
                ? req.body.SuggestedMode
                : 'Card',
            TipAmount: parseFloat(req.body.TipAmount),
          };
          const insertTrans = await models.Transaction.create(transactionData);
          const trs = await models.Transaction.findOne({
            where: {
              [Op.and]: [
                { TransactionId: transData[0].id },
                { MerchantId: userInfo.id },
                { CustomerId: findCustomer.id },
              ],
            },
          });
          await TranasactionServiceInstance.checkNotificationSettingAndCreateEmail(
            userInfo.id,
            transData[0].id,
            'TransactionFailed'
          ); // Check and Send Email according to notification setting
          if (req.body.PaymentTokenization == true) {
            if (checkCustomer != 'skip Token') {
              const createToken = {
                merchant: userGateWayData.GMerchantId,
                first: transData[0].first,
                phone: transData[0].phone,
                country: req.body.BillingCountry,
                zip: transData[0].zip,
                state:
                  req.body.BillingState != 'OT' ? req.body.BillingState : '',
                city: transData[0].city,
                address1: transData[0].address1,
                inactive: 0,
                frozen: 0,
                shippingFirst: transData[0].first,
                shippingAddress1: transData[0].address1,
                shippingCity: transData[0].city,
                shippingState:
                  req.body.BillingState != 'OT' ? req.body.BillingState : '',
                shippingZip: transData[0].zip,
                shippingCountry: req.body.BillingCountry,
                shippingPhone: transData[0].phone,
              };
              if (createToken.email == '') {
                delete createToken.email;
              }
              if (
                createToken.state == 'OT' &&
                createToken.shippingState == 'OT'
              ) {
                delete createToken.state;
                delete createToken.shippingState;
              }
              if (
                createToken.state == 'OT' &&
                createToken.shippingState == 'OT'
              ) {
                delete createToken.state;
                delete createToken.shippingState;
              }
              await exports.createCustomerToken(
                createToken,
                userGateWayData.GatewayApiKey,
                trs,
                payment,
                req.body.ExpiryDate.replace(/\s/g, '').replace(/\\|\//g, ''),
                checkCustomer
              );
              await exports.sendWebHook(
                transError,
                trs,
                req.body.PaymentLinkId,
                userInfo.id
              );
              return res.status(200).json({
                status: 'error',
                message: `Transaction Failed due to ${transError}`,
                data: JSON.parse(JSON.stringify(trs)),
              });
            } else {
              await exports.sendWebHook(
                transError,
                trs,
                req.body.PaymentLinkId,
                userInfo.id
              );
              return res.status(200).json({
                status: 'error',
                message: `Transaction Failed due to ${transError}`,
                data: JSON.parse(JSON.stringify(trs)),
              });
            }
          } else {
            await exports.sendWebHook(
              transError,
              trs,
              req.body.PaymentLinkId,
              userInfo.id
            );
            return res.status(200).json({
              status: 'error',
              message: `Transaction Failed due to ${transError}`,
              data: JSON.parse(JSON.stringify(trs)),
            });
          }
        } else if (
          newResp.response.data.length == 0 &&
          newResp.response.errors.length > 0
        ) {
          await TranasactionServiceInstance.sendEmailToMerchantOnFailedTransaction(
            userInfo,
            'Transaction Failed',
            `${newResp.response.errors[0].msg}`
          );
          Sentry.captureException(newResp.response.errors[0].msg);
          return res.status(500).json({
            status: 'error',
            message: `${newResp.response.errors[0].msg}`,
          });
        }
      } else {
        await TranasactionServiceInstance.sendEmailToMerchantOnFailedTransaction(
          userInfo,
          'Transaction Failed',
          `${responseData.response.errors[0].msg}`
        );
        await exports.sendWebHook(
          `Transaction Failed due to ${responseData.response.errors[0].msg}`,
          undefined,
          req.body.PaymentLinkId,
          userInfo.id
        );
        Sentry.captureException(responseData.response.errors[0].msg);
        return res.status(500).json({
          status: 'error',
          message: `${responseData.response.errors[0].msg}`,
        });
      }
    }
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong',
      error: err,
    });
  }
};

// To Create Token for customer (Applicable only to Payrix Txns)
exports.createCustomerToken = async (
  tokenObj,
  apiKey,
  trsData,
  paymentOpt,
  expiryDate,
  checkCustomer
) => {
  const config = {
    method: 'post',
    url: `${process.env.PAYRIX_URL}/customers`,
    headers: {
      'Content-Type': 'application/json',
      APIKEY: apiKey,
    },
    data: tokenObj,
  };
  const customerExist = await models.Customer.findOne({
    where: {
      id: trsData.CustomerId,
    },
  });
  if (
    checkCustomer == 'create Token' &&
    customerExist.GatewayCustomerId == null
  ) {
    return await axios(config)
      .then(async (response) => {
        const getData = response.data.response.data[0];
        await models.Customer.update(
          { GatewayCustomerId: getData.id },
          {
            where: {
              id: trsData.CustomerId,
            },
          }
        ).then(async (customer) => {
          const tokenData = {
            customer: getData.id,
            payment: paymentOpt,
            expiration: expiryDate,
          };

          const tokenConfig = {
            method: 'post',
            url: `${process.env.PAYRIX_URL}/tokens`,
            headers: {
              'Content-Type': 'application/json',
              APIKEY: apiKey,
            },
            data: tokenData,
          };
          return await axios(tokenConfig).then(async (tokenResponse) => {
            const tokenRespnse = tokenResponse.data.response.data[0];

            const token = {
              Tokenid: tokenRespnse.token,
              UserId: trsData.MerchantId,
              CustomerId: trsData.CustomerId,
              GatewayCustomerId: tokenRespnse.customer,
              Status: tokenRespnse.status,
              GatewayType: trsData.TransactionGateWay,
              LastNumber: tokenRespnse.payment.number,
              CardBrand: tokenRespnse.payment.method,
              FirstNumber: tokenRespnse.payment.bin,
              Expiration: tokenRespnse.expiration,
              BillingEmail: getData.email,
              BillingCustomerName: getData.first,
              BillingAddress: getData.address1,
              BillingCity: getData.city,
              BillingState: getData.state,
              BillingPostalCode: getData.zip,
              BillingCountry: getData.country,
              BillingCountryCode: trsData.BillingCountryCode,
              BillingPhoneNumber: getData.phone,
            };
            await models.CardTokens.create(token)
              .then(async (tokenData) => {
                await models.Transaction.update(
                  { GatewayCustomerId: tokenRespnse.customer },
                  {
                    where: {
                      id: trsData.id,
                    },
                  }
                );
                return true;
              })
              .catch(async (err) => {
                Sentry.captureException(err);
                return false;
              });
          });
        });
      })
      .catch(async (err) => {
        Sentry.captureException(err);
        return false;
      });
  } else if (
    checkCustomer == 'New card for customer' &&
    customerExist.GatewayCustomerId == null
  ) {
    return await axios(config)
      .then(async (response) => {
        const getData = response.data.response.data[0];
        await models.Customer.update(
          { GatewayCustomerId: getData.id },
          {
            where: {
              id: trsData.CustomerId,
            },
          }
        ).then(async (customer) => {
          const tokenData = {
            customer: getData.id,
            payment: paymentOpt,
            expiration: expiryDate,
          };

          const tokenConfig = {
            method: 'post',
            url: `${process.env.PAYRIX_URL}/tokens`,
            headers: {
              'Content-Type': 'application/json',
              APIKEY: apiKey,
            },
            data: tokenData,
          };
          return await axios(tokenConfig).then(async (tokenResponse) => {
            const tokenRespnse = tokenResponse.data.response.data[0];

            const token = {
              Tokenid: tokenRespnse.token,
              UserId: trsData.MerchantId,
              CustomerId: trsData.CustomerId,
              GatewayCustomerId: tokenRespnse.customer,
              Status: tokenRespnse.status,
              GatewayType: trsData.TransactionGateWay,
              LastNumber: tokenRespnse.payment.number,
              CardBrand: tokenRespnse.payment.method,
              FirstNumber: tokenRespnse.payment.bin,
              Expiration: tokenRespnse.expiration,
              BillingEmail: getData.email,
              BillingCustomerName: getData.first,
              BillingAddress: getData.address1,
              BillingCity: getData.city,
              BillingState: getData.state,
              BillingPostalCode: getData.zip,
              BillingCountry: getData.country,
              BillingCountryCode: trsData.BillingCountryCode,
              BillingPhoneNumber: getData.phone,
            };
            await models.CardTokens.create(token)
              .then(async (tokenData) => {
                await models.Transaction.update(
                  { GatewayCustomerId: tokenRespnse.customer },
                  {
                    where: {
                      id: trsData.id,
                    },
                  }
                );
                return true;
              })
              .catch(async (err) => {
                Sentry.captureException(err);
                return false;
              });
          });
        });
      })
      .catch(async (err) => {
        Sentry.captureException(err);
        return false;
      });
  } else if (
    checkCustomer == 'New card for customer' &&
    customerExist.GatewayCustomerId != null
  ) {
    const tokenData = {
      customer: customerExist.GatewayCustomerId,
      payment: paymentOpt,
      expiration: expiryDate,
    };

    const tokenConfig = {
      method: 'post',
      url: `${process.env.PAYRIX_URL}/tokens`,
      headers: {
        'Content-Type': 'application/json',
        APIKEY: apiKey,
      },
      data: tokenData,
    };
    return await axios(tokenConfig).then(async (tokenResponse) => {
      const tokenRespnse = tokenResponse.data.response.data[0];

      const token = {
        Tokenid: tokenRespnse.token,
        UserId: trsData.MerchantId,
        CustomerId: trsData.CustomerId,
        GatewayCustomerId: tokenRespnse.customer,
        Status: tokenRespnse.status,
        GatewayType: trsData.TransactionGateWay,
        LastNumber: tokenRespnse.payment.number,
        CardBrand: tokenRespnse.payment.method,
        FirstNumber: tokenRespnse.payment.bin,
        Expiration: tokenRespnse.expiration,
        BillingEmail: customerExist.email,
        BillingCustomerName: customerExist.first,
        BillingAddress: customerExist.address1,
        BillingCity: customerExist.city,
        BillingState: customerExist.state,
        BillingPostalCode: customerExist.zip,
        BillingCountry: customerExist.country,
        BillingCountryCode: customerExist.CountryCode,
        BillingPhoneNumber: customerExist.PhoneNumber,
      };
      await models.CardTokens.create(token)
        .then(async (tokenData) => {
          await models.Transaction.update(
            { GatewayCustomerId: tokenRespnse.customer },
            {
              where: {
                id: trsData.id,
              },
            }
          );
          return true;
        })
        .catch(async (err) => {
          Sentry.captureException(err);
          return false;
        });
    });
  }
};

//To Create customer vault FluidPay
exports.createFluidToken = async (
  req,
  userInfo,
  userGateWayData,
  gatewayData,
  customerData,
  checkCustomer
) => {
  try {
    if (
      checkCustomer == 'New card for customer' &&
      customerData.GatewayCustomerId == null
    ) {
      await models.Customer.update(
        { GatewayCustomerId: gatewayData['data'].customer_id },
        {
          where: {
            [Op.and]: [{ id: customerData.id }, { UserId: userInfo.id }],
          },
        }
      );
      const findCustomer = await models.Customer.findOne({
        where: { id: customerData.id },
      });
      const requestHeader = {
        'Content-Type': 'application/json',
        Authorization: userGateWayData.GatewayApiKey,
      };
      const requestOptions = {
        method: 'GET',
        headers: requestHeader,
      };
      const response = await fetch(
        `${process.env.FLUIDPAY_API_URL}/api/vault/${findCustomer.GatewayCustomerId}`,
        requestOptions
      );
      const data = await response.json();
      if (data.status === 'success') {
        paymentIdArray = data['data']['data']['customer'].payments.cards;
        for (let i = 0; i < paymentIdArray.length; i++) {
          const existToken = await models.CardTokens.findOne({
            where: { PaymentId: paymentIdArray[i].id },
          });
          if (existToken == null) {
            const token = {
              Tokenid: data['data'].id,
              UserId: userInfo.id,
              CustomerId: customerData.id,
              GatewayCustomerId: data['data'].id,
              GatewayType: userGateWayData.GatewayType,
              LastNumber: paymentIdArray[i].masked_number.slice(-4),
              CardBrand: paymentIdArray[i].card_type,
              FirstNumber: paymentIdArray[i].masked_number.substring(0, 6),
              Expiration: paymentIdArray[i].expiration_date.replace(/\s/g, ''),
              BillingEmail: req.body.BillingEmail ?? null,
              BillingCustomerName: req.body.BillingCustomerName,
              BillingAddress: req.body.BillingAddress ?? undefined,
              BillingCity: req.body.BillingCity ?? undefined,
              BillingState: req.body.BillingState ?? undefined,
              BillingPostalCode: String(req.body.BillingPostalCode || ''),
              BillingCountry:
                req.body.BillingCountry === 'USA' ? 'US' : undefined,
              BillingCountryCode: req.body.BillingCountryCode,
              BillingPhoneNumber: req.body.BillingPhoneNumber,
              PaymentId: paymentIdArray[i].id,
            };
            const insertData = await models.CardTokens.create(token);
          }
        }
      }
    } else if (
      checkCustomer == 'New card for customer' &&
      customerData.GatewayCustomerId != null
    ) {
      const requestHeader = {
        'Content-Type': 'application/json',
        Authorization: userGateWayData.GatewayApiKey,
      };
      const jsonString = JSON.stringify({
        number: req.body.CardNumber.replace(/\s/g, ''),
        expiration_date: req.body.ExpiryDate.replace(/\s/g, ''),
      });
      const requestOptions = {
        method: 'POST',
        headers: requestHeader,
        body: jsonString,
      };
      const response = await fetch(
        `${process.env.FLUIDPAY_API_URL}/api/vault/customer/${customerData.GatewayCustomerId}/card`,
        requestOptions
      );
      const data = await response.json();
      if (data.status === 'success') {
        const existToken = await models.CardTokens.findAll({
          where: { GatewayCustomerId: customerData.GatewayCustomerId },
        });
        paymentIdArray = data['data']['data']['customer'].payments.cards;
        for (let i = 0; i < paymentIdArray.length; i++) {
          const existToken = await models.CardTokens.findOne({
            where: { PaymentId: paymentIdArray[i].id },
          });
          if (existToken == null) {
            const token = {
              Tokenid: data['data'].id,
              UserId: userInfo.id,
              CustomerId: customerData.id,
              GatewayCustomerId: data['data'].id,
              GatewayType: userGateWayData.GatewayType,
              LastNumber: paymentIdArray[i].masked_number.slice(-4),
              CardBrand: paymentIdArray[i].card_type,
              FirstNumber: paymentIdArray[i].masked_number.substring(0, 6),
              Expiration: paymentIdArray[i].expiration_date.replace(/\s/g, ''),
              BillingEmail: req.body.BillingEmail ?? null,
              BillingCustomerName: req.body.BillingCustomerName,
              BillingAddress: req.body.BillingAddress ?? undefined,
              BillingCity: req.body.BillingCity ?? undefined,
              BillingState: req.body.BillingState ?? undefined,
              BillingPostalCode: String(req.body.BillingPostalCode || ''),
              BillingCountry:
                req.body.BillingCountry === 'USA' ? 'US' : undefined,
              BillingCountryCode: req.body.BillingCountryCode,
              BillingPhoneNumber: req.body.BillingPhoneNumber,
              PaymentId: paymentIdArray[i].id,
            };
            const insertData = await models.CardTokens.create(token);
          }
        }
      }
    } else if (
      checkCustomer == 'create Token' &&
      customerData.GatewayCustomerId == null
    ) {
      await models.Customer.update(
        { GatewayCustomerId: gatewayData['data'].customer_id },
        {
          where: {
            [Op.and]: [{ id: customerData.id }, { UserId: userInfo.id }],
          },
        }
      );
      const findCustomer = await models.Customer.findOne({
        where: { id: customerData.id },
      });

      const token = {
        Tokenid: gatewayData['data'].customer_id,
        UserId: userInfo.id,
        CustomerId: findCustomer.id,
        GatewayCustomerId: gatewayData['data'].customer_id,
        GatewayType: userGateWayData.GatewayType,
        LastNumber: gatewayData['data'].response_body['card'].last_four,
        CardBrand: gatewayData['data'].response_body['card'].card_type,
        FirstNumber: gatewayData['data'].response_body['card'].first_six,
        Expiration: gatewayData['data'].response_body['card'].expiration_date,
        BillingEmail: req.body.BillingEmail ?? null,
        BillingCustomerName: req.body.BillingCustomerName,
        BillingAddress: req.body.BillingAddress ?? undefined,
        BillingCity: req.body.BillingCity ?? undefined,
        BillingState: req.body.BillingState ?? undefined,
        BillingPostalCode: String(req.body.BillingPostalCode || ''),
        BillingCountry: req.body.BillingCountry === 'USA' ? 'US' : undefined,
        BillingCountryCode: req.body.BillingCountryCode,
        BillingPhoneNumber: req.body.BillingPhoneNumber,
        PaymentId: gatewayData['data'].customer_payment_ID,
      };
      const insertData = await models.CardTokens.create(token);
    }
  } catch (err) {
    Sentry.captureException(err);
    return false;
  }
};

// To Send Txn Info to Auxchat/Any service used Auxvault API
exports.sendWebHook = async (
  transactionError,
  resultTransaction,
  linkId,
  userId
) => {
  const wbUrl = await models.PaymentLink.findOne({ where: { UUID: linkId } });
  const customerName = await models.Customer.findOne({
    where: { id: wbUrl.CustomerId },
  });
  const getStatus =
    resultTransaction === undefined
      ? `Failed Due to ${transactionError}`
      : transactionError == undefined
      ? exports.getTransStatus(resultTransaction.Status)
      : `${exports.getTransStatus(
          resultTransaction.Status
        )} due to ${transactionError}`;
  const webhookTransData = {
    TransactionId:
      resultTransaction === undefined ? null : resultTransaction.TransactionId,
    Amount: resultTransaction === undefined ? null : resultTransaction.Amount,
    CreatedAt:
      resultTransaction === undefined ? null : resultTransaction.createdAt,
    AuthCode:
      resultTransaction === undefined ? null : resultTransaction.AuthCode,
    PaymenyLinkId: linkId,
    Status: getStatus,
    Fee:
      resultTransaction === undefined
        ? null
        : resultTransaction.ConvenienceFeeValue,
    GatewayType:
      resultTransaction === undefined
        ? null
        : resultTransaction.TransactionGateWay,
    CreatedBy: wbUrl.CreatedBy,
    CustomerName: customerName.CustomerName,
    TipAmount:
      resultTransaction === undefined ? null : resultTransaction.TipAmount,
  };
  const webHookConfig = {
    method: 'post',
    url: wbUrl.WebHookUrl,
    headers: {
      'Content-Type': 'application/json',
    },
    data: webhookTransData,
  };

  if (resultTransaction !== undefined && transactionError === undefined) {
    const upResult = await models.PaymentLink.update(
      { TransactionId: resultTransaction.UUID },
      {
        where: {
          UUID: linkId,
        },
      }
    );
  }
  const requestCreated = {
    GatewayType: linkId,
    Request: webHookConfig,
    Response: '',
    CustomerId: null,
    MerchantId: null,
  };
  await models.ResponseRequestTable.create(requestCreated);
  const hookResponse = await axios(webHookConfig);
  const responseCreated = {
    GatewayType: linkId,
    Request: webHookConfig,
    Response: hookResponse.data,
    CustomerId: null,
    MerchantId: null,
  };
  await models.ResponseRequestTable.create(responseCreated);
  return hookResponse;
};

//Get Transaction Details from Payrix portal
exports.getTxnFromGateway = async (txnId, privateKey) => {
  const configq = {
    method: 'get',
    url: `${process.env.PAYRIX_URL}/txns/${txnId}`,
    headers: {
      'Content-Type': 'application/json',
      APIKEY: privateKey,
    },
  };

  return await axios(configq)
    .then(async (response) => {
      const getData = response.data.response.data[0];
      return getData;
    })
    .catch(async (err) => {
      Sentry.captureException(err);
      return err;
    });
};

//To request a Refund for Txn done through Payrix
exports.payRixRefundTransaction = async (
  req,
  userInfo,
  userGateWayData,
  transactionId,
  res
) => {
  const txnData = await exports.getTxnFromGateway(
    req.body.TransactionId,
    userGateWayData.GatewayApiKey
  );

  if (req.body.TransactionId != undefined && req.body.MerchantId != undefined) {
    const txntype = exports.TransactionType(req.body.TransactionFor);
    let data = '';
    if (
      req.body.Amount != undefined &&
      req.body.TransactionFor != 'FullRefund'
    ) {
      data = {
        fortxn: req.body.TransactionId,
        type: txntype,
        total: Math.round(parseFloat(req.body.Amount) * 100),
      };
    } else {
      data = {
        fortxn: req.body.TransactionId,
        type: txntype,
      };
    }

    const config = {
      method: 'post',
      url: `${process.env.PAYRIX_URL}/txns`,
      headers: {
        'Content-Type': 'application/json',
        APIKEY: userGateWayData.GatewayApiKey,
      },
      data: data,
    };
    if (
      (txnData.status == 3 || txnData.status == 4) &&
      transactionId.Type != '2'
    ) {
      axios(config)
        .then((response) => {
          if (response.data.response.data[0] !== undefined) {
            const data = response.data; // if resp contains the data you will get it here.
            const transData = data.response.data;
            const RequestResponse = {
              GatewayType: userGateWayData.GatewayType,
              Request: config,
              Response: data,
              MerchantId: userInfo.id,
            };
            models.ResponseRequestTable.create(RequestResponse).then(
              (resultData) => {
                models.Transaction.update(
                  {
                    Refund: true,
                    TransactionId: transData[0].id,
                    Status: transData[0].status,
                  },
                  {
                    where: {
                      id: transactionId.id,
                    },
                  }
                ).then((trs) => {
                  const newTxn = {
                    Amount: transData[0].total / 100,
                    UserId: userInfo.id,
                    TransactionId: transactionId.id,
                    NewTransactionId: transData[0].id,
                    PaymentType: transData[0].type,
                    Status: transData[0].status,
                    GatewayType: transactionId.TransactionGateWay,
                    PrevTransactionId: transData[0].fortxn,
                  };

                  models.RefundVoidCaptureTable.create(newTxn)
                    .then((results) => {
                      res.status(200).json({
                        message: 'Transaction Refund Initiated Successfully',
                        data: JSON.parse(JSON.stringify(data)),
                      });
                    })
                    .catch((err) => {
                      Sentry.captureException(err);
                      res.status(500).json({
                        message: 'Something went wrong',
                        error: err,
                      });
                    });
                });
              }
            );
          } else if (response.data.response.errors[0] != undefined) {
            res.status(500).json({
              message: response.data.response.errors[0].msg,
            });
          }
        })
        .catch((err) => {
          Sentry.captureException(err);
          res.status(500).json({
            message: 'Something went wrong',
            error: err,
          });
        });
    } else {
      let message = '';
      if (transactionId.Type == '2') {
        message = 'This is a Auth transaction. Cannot apply refund';
      } else {
        message = 'The Transaction is already captured or setteled';
      }
      res.status(400).json({ message: message });
    }
  } else {
    return res.status(400).json({ message: 'Invalid data' });
  }
};

//To convert Auth Txn to Sale Txn done through Payrix
exports.payRixCaptureTransaction = async (
  req,
  userIdData,
  userGateWayData,
  transactionId,
  res
) => {
  if (req.body.TransactionId != undefined && req.body.MerchantId != undefined) {
    const txntype = exports.TransactionType(req.body.TransactionFor);

    const data = {
      fortxn: req.body.TransactionId,
      type: txntype,
    };

    const config = {
      method: 'post',
      url: `${process.env.PAYRIX_URL}/txns`,
      headers: {
        'Content-Type': 'application/json',
        APIKEY: userGateWayData.GatewayApiKey,
      },
      data: data,
    };
    if (transactionId.Type == '2') {
      axios(config)
        .then((response) => {
          if (response.data.response.data[0] !== undefined) {
            const data = response.data;
            const transData = data.response.data;
            const RequestResponse = {
              GatewayType: userGateWayData.GatewayType,
              Request: config,
              Response: data,
              MerchantId: userIdData.id,
            };
            models.ResponseRequestTable.create(RequestResponse).then(
              (resultData) => {
                models.Transaction.update(
                  {
                    Capture: true,
                    TransactionId: transData[0].id,
                    Status: transData[0].status,
                    Type: '1',
                  },
                  {
                    where: {
                      id: transactionId.id,
                    },
                  }
                ).then((trs) => {
                  const newTxn = {
                    Amount: transData[0].total / 100,
                    UserId: userIdData.id,
                    TransactionId: transactionId.id,
                    NewTransactionId: transData[0].id,
                    PaymentType: transData[0].type,
                    Status: transData[0].status,
                    GatewayType: transactionId.TransactionGateWay,
                    PrevTransactionId: transData[0].fortxn,
                  };
                  models.RefundVoidCaptureTable.create(newTxn)
                    .then((results) => {
                      res.status(200).json({
                        message: 'Transaction Capture Initiated Successfully',
                        data: JSON.parse(JSON.stringify(data)),
                      });
                    })
                    .catch((err) => {
                      Sentry.captureException(err);
                      res.status(500).json({
                        message: 'Something went wrong',
                        error: err,
                      });
                    });
                });
              }
            );
          } else if (response.data.response.errors[0] != undefined) {
            res.status(500).json({
              message: response.data.response.errors[0].msg,
            });
          }
        })
        .catch((err) => {
          Sentry.captureException(err);
          res.status(500).json({
            message: 'Something went wrong',
            error: err,
          });
        });
    } else {
      res.status(500).json({
        message: 'This is Sale transaction.Cannot apply capture',
      });
    }
  } else {
    return res.status(400).json({ message: 'Invalid data' });
  }
};

//To reverse/void a Txn done through Payrix
exports.payRixVoidTransaction = async (
  req,
  userIdData,
  userGateWayData,
  transactionId,
  res
) => {
  const txnData = await exports.getTxnFromGateway(
    req.body.TransactionId,
    userGateWayData.GatewayApiKey
  );
  if (req.body.TransactionId != undefined && req.body.MerchantId != undefined) {
    const txntype = exports.TransactionType(req.body.TransactionFor);

    const data = {
      fortxn: req.body.TransactionId,
      type: txntype,
    };

    const config = {
      method: 'post',
      url: `${process.env.PAYRIX_URL}/txns`,
      headers: {
        'Content-Type': 'application/json',
        APIKEY: userGateWayData.GatewayApiKey,
      },
      data: data,
    };
    if (txnData.status == '1') {
      axios(config)
        .then((response) => {
          if (response.data.response.data[0] !== undefined) {
            const data = response.data; // if resp contains the data you will get it here.

            const transData = data.response.data;
            const RequestResponse = {
              GatewayType: userGateWayData.GatewayType,
              Request: config,
              Response: data,
              MerchantId: userIdData.id,
            };
            models.ResponseRequestTable.create(RequestResponse).then(
              (resultData) => {
                models.Transaction.update(
                  {
                    Void: true,
                    TransactionId: transData[0].id,
                    Status: transData[0].status,
                  },
                  {
                    where: {
                      id: transactionId.id,
                    },
                  }
                ).then((trs) => {
                  const voidData = {
                    Amount: transData[0].total / 100,
                    UserId: userIdData.id,
                    TransactionId: transactionId.id,
                    NewTransactionId: transData[0].id,
                    PaymentType: transData[0].type,
                    Status: transData[0].status,
                    GatewayType: transactionId.TransactionGateWay,
                    PrevTransactionId: transData[0].fortxn,
                  };
                  models.RefundVoidCaptureTable.create(voidData)
                    .then((result) => {
                      res.status(200).json({
                        message: 'Transaction Void Initiated Successfully',
                        data: JSON.parse(JSON.stringify(data)),
                      });
                    })
                    .catch((err) => {
                      Sentry.captureException(err);
                      res.status(500).json({
                        message: 'Something went wrong',
                        error: response.data.response.errors[0],
                      });
                    });
                });
              }
            );
          } else if (response.data.response.errors[0] != undefined) {
            res.status(500).json({
              message: response.data.response.errors[0].msg,
            });
          }
        })
        .catch((err) => {
          Sentry.captureException(err);
          res.status(500).json({
            message: 'Something went wrong',
            error: err,
          });
        });
    } else {
      res.status(500).json({
        message: 'This transaction was already Captured.Cannot apply void',
      });
    }
  } else {
    return res.status(400).json({ message: 'Invalid data' });
  }
};

//To fetch single data from RefundVoidCaptureTable
exports.getRefundVoidCaptureDataById = async (req, res) => {
  await models.RefundVoidCaptureTable.findOne({
    where: { TransactionId: req.params.id },
  }).then((transaction) => {
    if (transaction === null) {
      res.status(404).json({
        message: 'Transaction Not Exist',
      });
    } else {
      res.status(200).json({
        message: 'Transaction found successfully',
        data: transaction,
      });
    }
  });
};

//To process all Txn via Auxvault
exports.postTransaction = async (req, res) => {
  let token = '';
  let decoded = '';
  if (req.body.MerchantId != undefined) {
    decoded = {};
    decoded.UUID = req.body.MerchantId;
  } else {
    token = req.headers.authorization.split(' ');
    decoded = jwt.verify(token[1], process.env.JWT_SECRET);
  }
  try {
    let userGateWayData = '',
      FluidPayAcc = '';
    const userInfo = await models.User.findOne({
      where: {
        UUID: decoded.UUID,
      },
    });

    const userLevel = userInfo.UserLevel;
    const findGateWay = await exports.userGateways(req, userInfo, res);

    let gateWay = findGateWay[0].GatewayType;

    if (gateWay == 'Payrix') {
      return exports.processPayrixTransactions(
        req,
        userInfo,
        findGateWay[0],
        res
      );
    } else if (
      gateWay == 'FluidPay' &&
      (userLevel == 'Level1' || userLevel == 'Level2')
    ) {
      return exports.processFluidLOneTwoTransactions(
        req,
        userInfo,
        findGateWay[0],
        findGateWay[1],
        findGateWay[2],
        findGateWay[3],
        res
      );
    } else if (gateWay == 'FluidPay' && userLevel == 'Level3') {
      return exports.processFluidLThreeTransactions(
        req,
        userInfo,
        findGateWay[0],
        findGateWay[1],
        findGateWay[2],
        findGateWay[3],
        res
      );
    } else if (
      gateWay == 'Authorizenet' &&
      (userLevel == 'Level1' || userLevel == 'Level2')
    ) {
      return exports.authorizenetTransaction(
        req,
        userInfo,
        findGateWay[0],
        findGateWay[1],
        findGateWay[2],
        findGateWay[3],
        res
      );
    } else if (gateWay == 'Authorizenet' && userLevel == 'Level3') {
      return exports.authorizenetTransactionThree(
        req,
        userInfo,
        findGateWay[0],
        findGateWay[1],
        findGateWay[2],
        findGateWay[3],
        res
      );
    }
  } catch (err) {
    Sentry.captureException(err);
    return res
      .status(400)
      .json({ status: 'error', message: err.ReferenceError });
  }
};

//To process a Txn via Auxvault using FluidPay Level 1 and two Merchants
exports.processFluidLOneTwoTransactions = async (
  req,
  userInfo,
  userGateWayData,
  total,
  feeAmount,
  minmumTxn,
  res
) => {
  try {
    let countryName = req.body.BillingCountry === 'USA' ? 'US' : undefined;
    const card = {
      number: req.body.CardNumber.replace(/\s/g, ''),
      expiration_date: req.body.ExpiryDate.replace(/\s/g, ''),
      cvc: req.body.Cvv,
    };

    const customerExist = await models.Customer.findOne({
      where: {
        [Op.and]: [
          { CountryCode: req.body.BillingCountryCode },
          { PhoneNumber: req.body.BillingPhoneNumber },
          { UserId: userInfo.id },
        ],
      },
    });

    const billingAddress = {
      first_name: req.body.BillingCustomerName,
      address_line_1: req.body.BillingAddress ?? undefined,
      city: req.body.BillingCity ?? undefined,
      state: req.body.BillingState ?? undefined,
      postal_code: String(req.body.BillingPostalCode || ''),
      country: countryName ?? undefined,
      phone: req.body.BillingPhoneNumber,
      email: req.body.BillingEmail ?? null,
    };
    if (req.body.shippingSameAsBilling === true) {
      shippingAddress = {
        first_name: req.body.BillingCustomerName,
        address_line_1: req.body.BillingAddress ?? undefined,
        city: req.body.BillingCity ?? undefined,
        state: req.body.BillingState ?? undefined,
        postal_code: String(req.body.BillingPostalCode || ''),
        country: countryName ?? undefined,
        phone: req.body.BillingPhoneNumber,
        email: req.body.BillingEmail ?? null,
      };
    } else {
      shippingAddress = {
        first_name: req.body.ShippingCustomerName,
        address_line_1: req.body.ShippingAddress ?? undefined,
        city: req.body.ShippingCity ?? undefined,
        state: req.body.ShippingState ?? undefined,
        postal_code: String(req.body.ShippingPostalCode || ''),
        country: countryName ?? undefined,
        phone: req.body.ShippingPhoneNumber,
        email: req.body.ShippingEmail ?? null,
      };
    }
    const requestHeader = {
      'Content-Type': 'application/json',
      Authorization: userGateWayData.GatewayApiKey,
    };
    if (req.body.PaymentLinkId == undefined) {
      transaction = {
        type: req.body.TransactionType == '1' ? 'sale' : 'authorize',
        amount: Math.round(total * 100),
        currency: 'USD',
        email_receipt: false,
        email_address: req.body.BillingEmail,
        processor_id: userGateWayData.ProcessorId,
        payment_method: { card: card },
        billing_address: billingAddress,
        shipping_address: shippingAddress,
      };
      if (
        req.body.PaymentTokenization == true &&
        (customerExist == null || customerExist.GatewayCustomerId == null)
      ) {
        transaction['create_vault_record'] = true;
      } else {
        transaction['create_vault_record'] = false;
      }
      const jsonString = JSON.stringify(transaction); // Based upon your setup. You may or may not need to stringify

      const requestOptions = {
        method: 'POST',
        headers: requestHeader,
        body: jsonString,
        redirect: 'follow',
      };
      const requestCreated = {
        GatewayType: userGateWayData.GatewayType,
        Request: requestOptions,
        Response: '',
        MerchantId: userInfo.id,
      };
      await models.ResponseRequestTable.create(requestCreated);
      const response = await fetch(
        `${process.env.FLUIDPAY_API_URL}/api/transaction`,
        requestOptions
      );
      const data = await response.json();
      const responseInsert = {
        GatewayType: userGateWayData.GatewayType,
        Request: requestOptions,
        Response: data,
        MerchantId: userInfo.id,
      };
      const responseId = await models.ResponseRequestTable.create(
        responseInsert
      );
      if (data.status === 'success') {
        const checkCustomer = await exports.checkCustomerExist(
          req,
          userInfo.id
        );

        const findCustomer = await models.Customer.findOne({
          where: {
            [Op.and]: [
              { CountryCode: req.body.BillingCountryCode },
              { PhoneNumber: req.body.BillingPhoneNumber },
              { UserId: userInfo.id },
            ],
          },
        });

        if (checkCustomer != 'skip Token') {
          const cardToken = await exports.createFluidToken(
            req,
            userInfo,
            userGateWayData,
            data,
            findCustomer,
            checkCustomer
          );
        }
        await models.ResponseRequestTable.update(
          { CustomerId: findCustomer.id },
          { where: { id: responseId.id } }
        );
        const stateData = await models.States.findOne({
          where: {
            Abbrevation: req.body.BillingState ?? null,
          },
        });
        const countryData = await models.Country.findOne({
          where: {
            Abbrevation: req.body.BillingCountry ?? null,
          },
        });
        const paymentMethods = exports.fluidPayCardBrands(
          data['data'].response_body['card'].card_type
        );
        if (
          data['data'].status == 'pending_settlement' ||
          data['data'].status == 'authorized' ||
          data['data'].status == 'voided'
        ) {
          data['data'].status = '1';
          const transactionInsert = {
            CustomerId: findCustomer.id,
            MerchantId: userInfo.id,
            TransactionId: data['data'].id,
            Amount: data['data'].amount / 100,
            CardNumber: data['data'].response_body['card'].last_four,
            PaymentMethod: paymentMethods,
            Type: req.body.TransactionType,
            Status: data['data'].status,
            BillingEmail: data['data'].billing_address['email'],
            BillingCustomerName: data['data'].billing_address['first_name'],
            BillingAddress: data['data'].billing_address['address_line_1'],
            BillingCity: data['data'].billing_address['city'],
            BillingState: stateData != undefined ? stateData.id : null,
            BillingPostalCode: data['data'].billing_address['postal_code'],
            BillingCountry: countryData != undefined ? countryData.id : null,
            BillingCountryCode: req.body.BillingCountryCode,
            BillingPhoneNumber: data['data'].billing_address['phone'],
            IsShippingSame: req.body.shippingSameAsBilling,
            ShippingEmail: data['data'].billing_address['email'],
            ShippingCustomerName: data['data'].billing_address['first_name'],
            ShippingAddress: data['data'].billing_address['address_line_1'],
            ShippingCity: data['data'].billing_address['city'],
            ShippingState: stateData != undefined ? stateData.id : null,
            ShippingPostalCode: data['data'].billing_address['postal_code'],
            ShippingCountry: countryData != undefined ? countryData.id : null,
            ShippingPhoneNumber: data['data'].billing_address['phone'],
            ExpiryDate: req.body.ExpiryDate.replace(/\s/g, '').replace(
              /\\|\//g,
              ''
            ),
            Cvv: req.body.Cvv,
            ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
            AuthCode: data['data'].response_body['card'].auth_code,
            TransactionGateWay: 'FluidPay',
            Refund: false,
            Void: false,
            Capture: false,
            Tokenization: req.body.PaymentTokenization,
            Message: req.body.Message,
            Description: req.body.Description,
            ReferenceNo: req.body.ReferenceNo,
            ConvenienceFeeActive:
              minmumTxn != ''
                ? minmumTxn
                : userGateWayData.ConvenienceFeeActive,
            RequestOrigin: req.body.RequestOrigin,
            createdAt: data['data'].created_at,
            updatedAt: data['data'].updated_at,
            ProcessorId: userGateWayData.ProcessorId,
            SuggestedMode:
              req.body.SuggestedMode != undefined
                ? req.body.SuggestedMode
                : 'Card',
            TipAmount: parseFloat(req.body.TipAmount),
          };
          const transData = await models.Transaction.create(transactionInsert);
          await TranasactionServiceInstance.checkNotificationSettingAndCreateEmail(
            userInfo.id,
            data['data'].id,
            'TransactionCompleted'
          );
          return res.status(200).json({
            status: 'success',
            message: 'Transaction Processed Successfully',
            data: JSON.parse(JSON.stringify(transData)),
          });
        } else if (data['data'].status == 'declined') {
          data['data'].status = '9';
          const transactionInsert = {
            CustomerId: findCustomer.id,
            MerchantId: userInfo.id,
            TransactionId: data['data'].id,
            Amount: data['data'].amount / 100,
            CardNumber: data['data'].response_body['card'].last_four,
            PaymentMethod: paymentMethods,
            Type: req.body.TransactionType,
            Status: data['data'].status,
            BillingEmail: data['data'].billing_address['email'],
            BillingCustomerName: data['data'].billing_address['first_name'],
            BillingAddress: data['data'].billing_address['address_line_1'],
            BillingCity: data['data'].billing_address['city'],
            BillingState: stateData != undefined ? stateData.id : null,
            BillingPostalCode: data['data'].billing_address['postal_code'],
            BillingCountry: countryData != undefined ? countryData.id : null,
            BillingCountryCode: req.body.BillingCountryCode,
            BillingPhoneNumber: data['data'].billing_address['phone'],
            IsShippingSame: req.body.shippingSameAsBilling,
            ShippingEmail: data['data'].billing_address['email'],
            ShippingCustomerName: data['data'].billing_address['first_name'],
            ShippingAddress: data['data'].billing_address['address_line_1'],
            ShippingCity: data['data'].billing_address['city'],
            ShippingState: stateData != undefined ? stateData.id : null,
            ShippingPostalCode: data['data'].billing_address['postal_code'],
            ShippingCountry: countryData != undefined ? countryData.id : null,
            ShippingPhoneNumber: data['data'].billing_address['phone'],
            ExpiryDate: req.body.ExpiryDate.replace(/\s/g, '').replace(
              /\\|\//g,
              ''
            ),
            Cvv: req.body.Cvv,
            ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
            AuthCode: data['data'].response_body['card'].auth_code,
            TransactionGateWay: 'FluidPay',
            Refund: false,
            Void: false,
            Capture: false,
            Tokenization: req.body.PaymentTokenization,
            Message: req.body.Message,
            Description: req.body.Description,
            ReferenceNo: req.body.ReferenceNo,
            ConvenienceFeeActive:
              minmumTxn != ''
                ? minmumTxn
                : userGateWayData.ConvenienceFeeActive,
            RequestOrigin: req.body.RequestOrigin,
            createdAt: data['data'].created_at,
            updatedAt: data['data'].updated_at,
            ProcessorId: userGateWayData.ProcessorId,
            SuggestedMode:
              req.body.SuggestedMode != undefined
                ? req.body.SuggestedMode
                : 'Card',
            TipAmount: parseFloat(req.body.TipAmount),
          };
          const transData = await models.Transaction.create(transactionInsert);
          await TranasactionServiceInstance.checkNotificationSettingAndCreateEmail(
            userInfo.id,
            data['data'].id,
            'TransactionFailed'
          );
          return res.status(200).json({
            status: 'error',
            message: `Transaction declined due to ${data['data']['response_body']['card'].processor_response_text}`,
            data: JSON.parse(JSON.stringify(transData)),
          });
        } else if (
          data['data'].status == 'failed' ||
          data['data'].status == 'unknown'
        ) {
          data['data'].status = '2';
          const transactionInsert = {
            CustomerId: findCustomer.id,
            MerchantId: userInfo.id,
            TransactionId: data['data'].id,
            Amount: data['data'].amount / 100,
            CardNumber: data['data'].response_body['card'].last_four,
            PaymentMethod: paymentMethods,
            Type: req.body.TransactionType,
            Status: data['data'].status,
            BillingEmail: data['data'].billing_address['email'],
            BillingCustomerName: data['data'].billing_address['first_name'],
            BillingAddress: data['data'].billing_address['address_line_1'],
            BillingCity: data['data'].billing_address['city'],
            BillingState: stateData != undefined ? stateData.id : null,
            BillingPostalCode: data['data'].billing_address['postal_code'],
            BillingCountry: countryData != undefined ? countryData.id : null,
            BillingCountryCode: req.body.BillingCountryCode,
            BillingPhoneNumber: data['data'].billing_address['phone'],
            IsShippingSame: req.body.shippingSameAsBilling,
            ShippingEmail: data['data'].billing_address['email'],
            ShippingCustomerName: data['data'].billing_address['first_name'],
            ShippingAddress: data['data'].billing_address['address_line_1'],
            ShippingCity: data['data'].billing_address['city'],
            ShippingState: stateData != undefined ? stateData.id : null,
            ShippingPostalCode: data['data'].billing_address['postal_code'],
            ShippingCountry: countryData != undefined ? countryData.id : null,
            ShippingPhoneNumber: data['data'].billing_address['phone'],
            ExpiryDate: req.body.ExpiryDate.replace(/\s/g, '').replace(
              /\\|\//g,
              ''
            ),
            Cvv: req.body.Cvv,
            ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
            AuthCode: data['data'].response_body['card'].auth_code,
            TransactionGateWay: 'FluidPay',
            Refund: false,
            Void: false,
            Capture: false,
            Tokenization: req.body.PaymentTokenization,
            Message: req.body.Message,
            Description: req.body.Description,
            ReferenceNo: req.body.ReferenceNo,
            ConvenienceFeeActive:
              minmumTxn != ''
                ? minmumTxn
                : userGateWayData.ConvenienceFeeActive,
            RequestOrigin: req.body.RequestOrigin,
            createdAt: data['data'].created_at,
            updatedAt: data['data'].updated_at,
            ProcessorId: userGateWayData.ProcessorId,
            SuggestedMode:
              req.body.SuggestedMode != undefined
                ? req.body.SuggestedMode
                : 'Card',
            TipAmount: parseFloat(req.body.TipAmount),
          };
          const transData = await models.Transaction.create(transactionInsert);
          await TranasactionServiceInstance.checkNotificationSettingAndCreateEmail(
            userInfo.id,
            data['data'].id,
            'TransactionFailed'
          );
          return res.status(200).json({
            status: 'error',
            message: `Transaction declined due to ${data['data']['response_body']['card'].processor_response_text}`,
            data: JSON.parse(JSON.stringify(transData)),
          });
        }
      } else {
        return res.status(200).json({
          status: 'error',
          message: data.msg,
          data: JSON.parse(JSON.stringify(data)),
        });
      }
    } else {
      const checkFeeActive = await models.PaymentLink.findOne({
        where: { UUID: req.body.PaymentLinkId },
      });

      transaction = {
        type: req.body.TransactionType == '1' ? 'sale' : 'authorize',
        amount: Math.round(total * 100),
        currency: 'USD',
        email_receipt: false,
        email_address: req.body.BillingEmail,
        processor_id: userGateWayData.ProcessorId,
        payment_method: { card: card },
        billing_address: billingAddress,
        shipping_address: shippingAddress,
      };
      if (
        req.body.PaymentTokenization == true &&
        (customerExist == null || customerExist.GatewayCustomerId == null)
      ) {
        transaction['create_vault_record'] = true;
      } else {
        transaction['create_vault_record'] = false;
      }

      const jsonString = JSON.stringify(transaction); // Based upon your setup. You may or may not need to stringify

      const requestOptions = {
        method: 'POST',
        headers: requestHeader,
        body: jsonString,
        redirect: 'follow',
      };
      const requestCreated = {
        GatewayType: userGateWayData.GatewayType,
        Request: requestOptions,
        Response: '',
        MerchantId: userInfo.id,
      };
      await models.ResponseRequestTable.create(requestCreated);
      const response = await fetch(
        `${process.env.FLUIDPAY_API_URL}/api/transaction`,
        requestOptions
      );
      const data = await response.json();
      const responseInsert = {
        GatewayType: userGateWayData.GatewayType,
        Request: requestOptions,
        Response: data,
        MerchantId: userInfo.id,
      };
      const responseId = await models.ResponseRequestTable.create(
        responseInsert
      );
      if (data.status === 'success') {
        const checkCustomer = await exports.checkCustomerExist(
          req,
          userInfo.id
        );

        const findCustomer = await models.Customer.findOne({
          where: {
            [Op.and]: [
              { CountryCode: req.body.BillingCountryCode },
              { PhoneNumber: req.body.BillingPhoneNumber },
              { UserId: userInfo.id },
            ],
          },
        });
        if (checkCustomer != 'skip Token') {
          const cardToken = await exports.createFluidToken(
            req,
            userInfo,
            userGateWayData,
            data,
            findCustomer,
            checkCustomer
          );
        }
        await models.ResponseRequestTable.update(
          { CustomerId: findCustomer.id },
          { where: { id: responseId.id } }
        );

        const stateData = await models.States.findOne({
          where: {
            Abbrevation: req.body.BillingState ?? null,
          },
        });
        const countryData = await models.Country.findOne({
          where: {
            Abbrevation: req.body.BillingCountry ?? null,
          },
        });
        const paymentMethods = exports.fluidPayCardBrands(
          data['data'].response_body['card'].card_type
        );
        if (
          data['data'].status == 'pending_settlement' ||
          data['data'].status == 'authorized' ||
          data['data'].status == 'voided'
        ) {
          data['data'].status = '1';
          const transactionInsert = {
            CustomerId: findCustomer.id,
            MerchantId: userInfo.id,
            TransactionId: data['data'].id,
            Amount: data['data'].amount / 100,
            CardNumber: data['data'].response_body['card'].last_four,
            PaymentMethod: paymentMethods,
            Type: req.body.TransactionType,
            Status: data['data'].status,
            BillingEmail: data['data'].billing_address['email'],
            BillingCustomerName: data['data'].billing_address['first_name'],
            BillingAddress: data['data'].billing_address['address_line_1'],
            BillingCity: data['data'].billing_address['city'],
            BillingState: stateData != undefined ? stateData.id : null,
            BillingPostalCode: data['data'].billing_address['postal_code'],
            BillingCountry: countryData != undefined ? countryData.id : null,
            BillingCountryCode: req.body.BillingCountryCode,
            BillingPhoneNumber: data['data'].billing_address['phone'],
            IsShippingSame: req.body.shippingSameAsBilling,
            ShippingEmail: data['data'].billing_address['email'],
            ShippingCustomerName: data['data'].billing_address['first_name'],
            ShippingAddress: data['data'].billing_address['address_line_1'],
            ShippingCity: data['data'].billing_address['city'],
            ShippingState: stateData != undefined ? stateData.id : null,
            ShippingPostalCode: data['data'].billing_address['postal_code'],
            ShippingCountry: countryData != undefined ? countryData.id : null,
            ShippingPhoneNumber: data['data'].billing_address['phone'],
            ExpiryDate: req.body.ExpiryDate.replace(/\s/g, '').replace(
              /\\|\//g,
              ''
            ),
            Cvv: req.body.Cvv,
            ConvenienceFeeValue: feeAmount != null ? feeAmount : 0,
            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
            AuthCode: data['data'].response_body['card'].auth_code,
            TransactionGateWay: 'FluidPay',
            Refund: false,
            Void: false,
            Capture: false,
            Tokenization: req.body.PaymentTokenization,
            Message: req.body.Message,
            Description: req.body.Description,
            ReferenceNo: req.body.ReferenceNo,
            ConvenienceFeeActive:
              minmumTxn != ''
                ? minmumTxn
                : userGateWayData.ConvenienceFeeActive,
            RequestOrigin: req.body.RequestOrigin,
            createdAt: data['data'].created_at,
            updatedAt: data['data'].updated_at,
            ProcessorId: userGateWayData.ProcessorId,
            SuggestedMode:
              req.body.SuggestedMode != undefined
                ? req.body.SuggestedMode
                : 'Card',
            TipAmount: parseFloat(req.body.TipAmount),
          };
          const transData = await models.Transaction.create(transactionInsert);
          await exports.sendWebHook(
            undefined,
            transData,
            req.body.PaymentLinkId,
            userInfo.id
          );
          await TranasactionServiceInstance.checkNotificationSettingAndCreateEmail(
            userInfo.id,
            data['data'].id,
            'TransactionCompleted'
          );
          return res.status(200).json({
            status: 'success',
            message: 'Transaction Completed Successfully',
            data: JSON.parse(JSON.stringify(transData)),
          });
        } else if (
          data['data'].status == 'declined' ||
          data['data'].status == 'failed'
        ) {
          data['data'].status = '9';
          const transactionInsert = {
            CustomerId: findCustomer.id,
            MerchantId: userInfo.id,
            TransactionId: data['data'].id,
            Amount: data['data'].amount / 100,
            CardNumber: data['data'].response_body['card'].last_four,
            PaymentMethod: paymentMethods,
            Type: req.body.TransactionType,
            Status: data['data'].status,
            BillingEmail: data['data'].billing_address['email'],
            BillingCustomerName: data['data'].billing_address['first_name'],
            BillingAddress: data['data'].billing_address['address_line_1'],
            BillingCity: data['data'].billing_address['city'],
            BillingState: stateData != undefined ? stateData.id : null,
            BillingPostalCode: data['data'].billing_address['postal_code'],
            BillingCountry: countryData != undefined ? countryData.id : null,
            BillingCountryCode: req.body.BillingCountryCode,
            BillingPhoneNumber: data['data'].billing_address['phone'],
            IsShippingSame: req.body.shippingSameAsBilling,
            ShippingEmail: data['data'].billing_address['email'],
            ShippingCustomerName: data['data'].billing_address['first_name'],
            ShippingAddress: data['data'].billing_address['address_line_1'],
            ShippingCity: data['data'].billing_address['city'],
            ShippingState: stateData != undefined ? stateData.id : null,
            ShippingPostalCode: data['data'].billing_address['postal_code'],
            ShippingCountry: countryData != undefined ? countryData.id : null,
            ShippingPhoneNumber: data['data'].billing_address['phone'],
            ExpiryDate: req.body.ExpiryDate.replace(/\s/g, '').replace(
              /\\|\//g,
              ''
            ),
            Cvv: req.body.Cvv,
            ConvenienceFeeValue: feeAmount != null ? feeAmount : 0,
            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
            AuthCode: data['data'].response_body['card'].auth_code,
            TransactionGateWay: 'FluidPay',
            Refund: false,
            Void: false,
            Capture: false,
            Tokenization: req.body.PaymentTokenization,
            Message: req.body.Message,
            Description: req.body.Description,
            ReferenceNo: req.body.ReferenceNo,
            ConvenienceFeeActive:
              minmumTxn != ''
                ? minmumTxn
                : userGateWayData.ConvenienceFeeActive,
            RequestOrigin: req.body.RequestOrigin,
            createdAt: data['data'].created_at,
            updatedAt: data['data'].updated_at,
            ProcessorId: userGateWayData.ProcessorId,
            SuggestedMode:
              req.body.SuggestedMode != undefined
                ? req.body.SuggestedMode
                : 'Card',
            TipAmount: parseFloat(req.body.TipAmount),
          };
          const transData = await models.Transaction.create(transactionInsert);
          await exports.sendWebHook(
            `Transaction declined due to ${data['data']['response_body']['card'].processor_response_text}`,
            transData,
            req.body.PaymentLinkId,
            userInfo.id
          );
          await TranasactionServiceInstance.checkNotificationSettingAndCreateEmail(
            userInfo.id,
            data['data'].id,
            'TransactionFailed'
          );
          return res.status(200).json({
            status: 'error',
            message: `Transaction declined due to ${data['data']['response_body']['card'].processor_response_text}`,
            data: JSON.parse(JSON.stringify(transData)),
          });
        } else if (
          data['data'].status == 'failed' ||
          data['data'].status == 'unknown'
        ) {
          data['data'].status = '2';
          const transactionInsert = {
            CustomerId: findCustomer.id,
            MerchantId: userInfo.id,
            TransactionId: data['data'].id,
            Amount: data['data'].amount / 100,
            CardNumber: data['data'].response_body['card'].last_four,
            PaymentMethod: paymentMethods,
            Type: req.body.TransactionType,
            Status: data['data'].status,
            BillingEmail: data['data'].billing_address['email'],
            BillingCustomerName: data['data'].billing_address['first_name'],
            BillingAddress: data['data'].billing_address['address_line_1'],
            BillingCity: data['data'].billing_address['city'],
            BillingState: stateData != undefined ? stateData.id : null,
            BillingPostalCode: data['data'].billing_address['postal_code'],
            BillingCountry: countryData != undefined ? countryData.id : null,
            BillingCountryCode: req.body.BillingCountryCode,
            BillingPhoneNumber: data['data'].billing_address['phone'],
            IsShippingSame: req.body.shippingSameAsBilling,
            ShippingEmail: data['data'].billing_address['email'],
            ShippingCustomerName: data['data'].billing_address['first_name'],
            ShippingAddress: data['data'].billing_address['address_line_1'],
            ShippingCity: data['data'].billing_address['city'],
            ShippingState: stateData != undefined ? stateData.id : null,
            ShippingPostalCode: data['data'].billing_address['postal_code'],
            ShippingCountry: countryData != undefined ? countryData.id : null,
            ShippingPhoneNumber: data['data'].billing_address['phone'],
            ExpiryDate: req.body.ExpiryDate.replace(/\s/g, '').replace(
              /\\|\//g,
              ''
            ),
            Cvv: req.body.Cvv,
            ConvenienceFeeValue: feeAmount != null ? feeAmount : 0,
            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
            AuthCode: data['data'].response_body['card'].auth_code,
            TransactionGateWay: 'FluidPay',
            Refund: false,
            Void: false,
            Capture: false,
            Tokenization: req.body.PaymentTokenization,
            Message: req.body.Message,
            Description: req.body.Description,
            ReferenceNo: req.body.ReferenceNo,
            ConvenienceFeeActive:
              minmumTxn != ''
                ? minmumTxn
                : userGateWayData.ConvenienceFeeActive,
            RequestOrigin: req.body.RequestOrigin,
            createdAt: data['data'].created_at,
            updatedAt: data['data'].updated_at,
            ProcessorId: userGateWayData.ProcessorId,
            SuggestedMode:
              req.body.SuggestedMode != undefined
                ? req.body.SuggestedMode
                : 'Card',
            TipAmount: parseFloat(req.body.TipAmount),
          };
          const transData = await models.Transaction.create(transactionInsert);
          await TranasactionServiceInstance.checkNotificationSettingAndCreateEmail(
            userInfo.id,
            data['data'].id,
            'TransactionFailed'
          );
          await exports.sendWebHook(
            `Transaction declined due to ${data['data']['response_body']['card'].processor_response_text}`,
            transData,
            req.body.PaymentLinkId,
            userInfo.id
          );
          await TranasactionServiceInstance.sendEmailToMerchantOnFailedTransaction(
            userInfo,
            'Transaction Failed',
            `Transaction Failed due to ${data['data']['response_body']['card'].processor_response_text}`
          );
          return res.status(200).json({
            status: 'error',
            message: `Transaction declined due to ${data['data']['response_body']['card'].processor_response_text}`,
            data: JSON.parse(JSON.stringify(transData)),
          });
        }
      } else {
        await exports.sendWebHook(
          data.msg,
          undefined,
          req.body.PaymentLinkId,
          userInfo.id
        );
        return res.status(200).json({
          status: 'error',
          message: data.msg,
          data: JSON.parse(JSON.stringify(data)),
        });
      }
    }
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).json({
      status: 'error',
      message: err,
    });
  }
};

//To process a Txn via Auxvault using FluidPay Level 3 Merchants
exports.processFluidLThreeTransactions = async (
  req,
  userInfo,
  userGateWayData,
  total,
  feeAmount,
  minmumTxn,
  res
) => {
  try {
    let countryName = req.body.BillingCountry === 'USA' ? 'US' : undefined;
    const card = {
      number: req.body.CardNumber.replace(/\s/g, ''),
      expiration_date: req.body.ExpiryDate.replace(/\s/g, ''),
      cvc: req.body.Cvv,
    };

    const customerExist = await models.Customer.findOne({
      where: {
        [Op.and]: [
          { CountryCode: req.body.BillingCountryCode },
          { PhoneNumber: req.body.BillingPhoneNumber },
          { UserId: userInfo.id },
        ],
      },
    });

    const billingAddress = {
      first_name: req.body.BillingCustomerName,
      address_line_1: req.body.BillingAddress ?? undefined,
      city: req.body.BillingCity ?? undefined,
      state: req.body.BillingState ?? undefined,
      postal_code: String(req.body.BillingPostalCode || ''),
      country: countryName ?? undefined,
      phone: req.body.BillingPhoneNumber,
      email: req.body.BillingEmail ?? null,
    };
    if (req.body.shippingSameAsBilling === true) {
      shippingAddress = {
        first_name: req.body.BillingCustomerName,
        address_line_1: req.body.BillingAddress ?? undefined,
        city: req.body.BillingCity ?? undefined,
        state: req.body.BillingState ?? undefined,
        postal_code: String(req.body.BillingPostalCode || ''),
        country: countryName ?? undefined,
        phone: req.body.BillingPhoneNumber,
        email: req.body.BillingEmail ?? null,
      };
    } else {
      shippingAddress = {
        first_name: req.body.ShippingCustomerName,
        address_line_1: req.body.ShippingAddress ?? undefined,
        city: req.body.ShippingCity ?? undefined,
        state: req.body.ShippingState ?? undefined,
        postal_code: String(req.body.ShippingPostalCode || ''),
        country: countryName ?? undefined,
        phone: req.body.ShippingPhoneNumber,
        email: req.body.ShippingEmail ?? null,
      };
    }
    const requestHeader = {
      'Content-Type': 'application/json',
      Authorization: userGateWayData.GatewayApiKey,
    };

    transaction = {
      type: req.body.TransactionType == '1' ? 'sale' : 'authorize',
      amount: Math.round(total * 100),
      currency: 'USD',
      email_receipt: false,
      email_address: req.body.BillingEmail,
      create_vault_record: true,
      processor_id: userGateWayData.ProcessorId,
      payment_method: { card: card },
      billing_address: billingAddress,
      shipping_address: shippingAddress,
    };
    if (
      req.body.PaymentTokenization == true &&
      (customerExist == null || customerExist.GatewayCustomerId == null)
    ) {
      transaction['create_vault_record'] = true;
    } else {
      transaction['create_vault_record'] = false;
    }
    const jsonString = JSON.stringify(transaction); // Based upon your setup. You may or may not need to stringify

    const requestOptions = {
      method: 'POST',
      headers: requestHeader,
      body: jsonString,
      redirect: 'follow',
    };
    const requestCreated = {
      GatewayType: userGateWayData.GatewayType,
      Request: requestOptions,
      Response: '',
      MerchantId: userInfo.id,
    };
    await models.ResponseRequestTable.create(requestCreated);
    const response = await fetch(
      `${process.env.FLUIDPAY_API_URL}/api/transaction`,
      requestOptions
    );
    const data = await response.json();
    const responseInsert = {
      GatewayType: userGateWayData.GatewayType,
      Request: requestOptions,
      Response: data,
      MerchantId: userInfo.id,
    };
    const responseId = await models.ResponseRequestTable.create(responseInsert);
    if (
      data.status === 'success' &&
      data['data'].status === 'declined' &&
      userGateWayData.ProcessorLevel == 'QuantumA' &&
      userGateWayData.ConvenienceFeeActive == true
    ) {
      userGateWayData = await models.MerchantPaymentGateWay.findOne({
        where: {
          [Op.and]: [
            { UserId: userInfo.id },
            { SuggestedMode: 'Card' },
            { GatewayStatus: true },
            { processorLevel: 'QuantumC' },
          ],
        },
      });
      const requestHeader = {
        'Content-Type': 'application/json',
        Authorization: userGateWayData.GatewayApiKey,
      };
      transaction = {
        type: req.body.TransactionType == '1' ? 'sale' : 'authorize',
        amount: Math.round(total * 100),
        currency: 'USD',
        email_receipt: false,
        email_address: req.body.BillingEmail,
        create_vault_record: true,
        processor_id: userGateWayData.ProcessorId,
        payment_method: { card: card },
        billing_address: billingAddress,
        shipping_address: shippingAddress,
      };
      if (
        req.body.PaymentTokenization == true &&
        (customerExist == null || customerExist.GatewayCustomerId == null)
      ) {
        transaction['create_vault_record'] = true;
      } else {
        transaction['create_vault_record'] = false;
      }
      const jsonString = JSON.stringify(transaction);
      const requestOptions = {
        method: 'POST',
        headers: requestHeader,
        body: jsonString,
        redirect: 'follow',
      };
      const requestCreated = {
        GatewayType: userGateWayData.GatewayType,
        Request: requestOptions,
        Response: '',
        MerchantId: userInfo.id,
      };
      await models.ResponseRequestTable.create(requestCreated);
      const response = await fetch(
        `${process.env.FLUIDPAY_API_URL}/api/transaction`,
        requestOptions
      );
      const newDataC = await response.json();
      const responseInsert = {
        GatewayType: userGateWayData.GatewayType,
        Request: requestOptions,
        Response: newDataC,
        MerchantId: userInfo.id,
      };
      const responseId = await models.ResponseRequestTable.create(
        responseInsert
      );
      if (newDataC.status === 'success') {
        const checkCustomer = await exports.checkCustomerExist(
          req,
          userInfo.id
        );

        const findCustomer = await models.Customer.findOne({
          where: {
            [Op.and]: [
              { CountryCode: req.body.BillingCountryCode },
              { PhoneNumber: req.body.BillingPhoneNumber },
              { UserId: userInfo.id },
            ],
          },
        });
        if (checkCustomer != 'skip Token') {
          const cardToken = await exports.createFluidToken(
            req,
            userInfo,
            userGateWayData,
            newDataC,
            findCustomer,
            checkCustomer
          );
        }
        await models.ResponseRequestTable.update(
          { CustomerId: findCustomer.id },
          { where: { id: responseId.id } }
        );
        const stateData = await models.States.findOne({
          where: {
            Abbrevation: req.body.BillingState ?? null,
          },
        });
        const countryData = await models.Country.findOne({
          where: {
            Abbrevation: req.body.BillingCountry ?? null,
          },
        });
        const paymentMethods = exports.fluidPayCardBrands(
          newDataC['data'].response_body['card'].card_type
        );
        if (
          newDataC['data'].status == 'pending_settlement' ||
          newDataC['data'].status == 'authorized' ||
          newDataC['data'].status == 'voided'
        ) {
          newDataC['data'].status = '1';
          const transactionInsert = {
            CustomerId: findCustomer.id,
            MerchantId: userInfo.id,
            TransactionId: newDataC['data'].id,
            Amount: newDataC['data'].amount / 100,
            CardNumber: newDataC['data'].response_body['card'].last_four,
            PaymentMethod: paymentMethods,
            Type: req.body.TransactionType,
            Status: newDataC['data'].status,
            BillingEmail: newDataC['data'].billing_address['email'],
            BillingCustomerName: newDataC['data'].billing_address['first_name'],
            BillingAddress: newDataC['data'].billing_address['address_line_1'],
            BillingCity: newDataC['data'].billing_address['city'],
            BillingState: stateData != undefined ? stateData.id : null,
            BillingPostalCode: newDataC['data'].billing_address['postal_code'],
            BillingCountry: countryData != undefined ? countryData.id : null,
            BillingCountryCode: req.body.BillingCountryCode,
            BillingPhoneNumber: newDataC['data'].billing_address['phone'],
            IsShippingSame: req.body.shippingSameAsBilling,
            ShippingEmail: newDataC['data'].billing_address['email'],
            ShippingCustomerName:
              newDataC['data'].billing_address['first_name'],
            ShippingAddress: newDataC['data'].billing_address['address_line_1'],
            ShippingCity: newDataC['data'].billing_address['city'],
            ShippingState: stateData != undefined ? stateData.id : null,
            ShippingPostalCode: newDataC['data'].billing_address['postal_code'],
            ShippingCountry: countryData != undefined ? countryData.id : null,
            ShippingPhoneNumber: newDataC['data'].billing_address['phone'],
            ExpiryDate: req.body.ExpiryDate.replace(/\s/g, '').replace(
              /\\|\//g,
              ''
            ),
            Cvv: req.body.Cvv,
            ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
            AuthCode: newDataC['data'].response_body['card'].auth_code,
            TransactionGateWay: 'FluidPay',
            Refund: false,
            Void: false,
            Capture: false,
            Tokenization: false, // req.body.PaymentTokenization,
            Message: req.body.Message,
            Description: req.body.Description,
            ReferenceNo: req.body.ReferenceNo,
            ConvenienceFeeActive:
              minmumTxn != ''
                ? minmumTxn
                : userGateWayData.ConvenienceFeeActive,
            RequestOrigin: req.body.RequestOrigin,
            createdAt: newDataC['data'].created_at,
            updatedAt: newDataC['data'].updated_at,
            ProcessorId: userGateWayData.ProcessorId,
            SuggestedMode:
              req.body.SuggestedMode != undefined
                ? req.body.SuggestedMode
                : 'Card',
            TipAmount: parseFloat(req.body.TipAmount),
          };
          const transData = await models.Transaction.create(transactionInsert);
          if (req.body.PaymentLinkId != undefined) {
            await exports.sendWebHook(
              undefined,
              transData,
              req.body.PaymentLinkId,
              userInfo.id
            );
          }
          await TranasactionServiceInstance.checkNotificationSettingAndCreateEmail(
            userInfo.id,
            newDataC['data'].id,
            'TransactionCompleted'
          );
          return res.status(200).json({
            status: 'success',
            message: 'Transaction Processed Successfully',
            data: JSON.parse(JSON.stringify(transData)),
          });
        } else if (newDataC['data'].status == 'declined') {
          newDataC['data'].status = '9';
          const transactionInsert = {
            CustomerId: findCustomer.id,
            MerchantId: userInfo.id,
            TransactionId: newDataC['data'].id,
            Amount: newDataC['data'].amount / 100,
            CardNumber: newDataC['data'].response_body['card'].last_four,
            PaymentMethod: paymentMethods,
            Type: req.body.TransactionType,
            Status: newDataC['data'].status,
            BillingEmail: newDataC['data'].billing_address['email'],
            BillingCustomerName: newDataC['data'].billing_address['first_name'],
            BillingAddress: newDataC['data'].billing_address['address_line_1'],
            BillingCity: newDataC['data'].billing_address['city'],
            BillingState: stateData != undefined ? stateData.id : null,
            BillingPostalCode: newDataC['data'].billing_address['postal_code'],
            BillingCountry: countryData != undefined ? countryData.id : null,
            BillingCountryCode: req.body.BillingCountryCode,
            BillingPhoneNumber: newDataC['data'].billing_address['phone'],
            IsShippingSame: req.body.shippingSameAsBilling,
            ShippingEmail: newDataC['data'].billing_address['email'],
            ShippingCustomerName:
              newDataC['data'].billing_address['first_name'],
            ShippingAddress: newDataC['data'].billing_address['address_line_1'],
            ShippingCity: newDataC['data'].billing_address['city'],
            ShippingState: stateData != undefined ? stateData.id : null,
            ShippingPostalCode: newDataC['data'].billing_address['postal_code'],
            ShippingCountry: countryData != undefined ? countryData.id : null,
            ShippingPhoneNumber: newDataC['data'].billing_address['phone'],
            ExpiryDate: req.body.ExpiryDate.replace(/\s/g, '').replace(
              /\\|\//g,
              ''
            ),
            Cvv: req.body.Cvv,
            ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
            AuthCode: newDataC['data'].response_body['card'].auth_code,
            TransactionGateWay: 'FluidPay',
            Refund: false,
            Void: false,
            Capture: false,
            Tokenization: false, // req.body.PaymentTokenization,
            Message: req.body.Message,
            Description: req.body.Description,
            ReferenceNo: req.body.ReferenceNo,
            ConvenienceFeeActive:
              minmumTxn != ''
                ? minmumTxn
                : userGateWayData.ConvenienceFeeActive,
            RequestOrigin: req.body.RequestOrigin,
            createdAt: newDataC['data'].created_at,
            updatedAt: newDataC['data'].updated_at,
            ProcessorId: userGateWayData.ProcessorId,
            SuggestedMode:
              req.body.SuggestedMode != undefined
                ? req.body.SuggestedMode
                : 'Card',
            TipAmount: parseFloat(req.body.TipAmount),
          };
          const transData = await models.Transaction.create(transactionInsert);
          await TranasactionServiceInstance.checkNotificationSettingAndCreateEmail(
            userInfo.id,
            newDataC['data'].id,
            'TransactionFailed'
          );
          if (req.body.PaymentLinkId != undefined) {
            await exports.sendWebHook(
              `Transaction declined due to ${newDataC['data']['response_body']['card'].processor_response_text}`,
              transData,
              req.body.PaymentLinkId,
              userInfo.id
            );
          }
          return res.status(200).json({
            status: 'error',
            message: `Transaction declined due to ${newDataC['data']['response_body']['card'].processor_response_text}`,
            data: JSON.parse(JSON.stringify(transData)),
          });
        } else if (
          newDataC['data'].status == 'failed' ||
          newDataC['data'].status == 'unknown'
        ) {
          newDataC['data'].status = '2';
          const transactionInsert = {
            CustomerId: findCustomer.id,
            MerchantId: userInfo.id,
            TransactionId: newDataC['data'].id,
            Amount: newDataC['data'].amount / 100,
            CardNumber: newDataC['data'].response_body['card'].last_four,
            PaymentMethod: paymentMethods,
            Type: req.body.TransactionType,
            Status: newDataC['data'].status,
            BillingEmail: newDataC['data'].billing_address['email'],
            BillingCustomerName: newDataC['data'].billing_address['first_name'],
            BillingAddress: newDataC['data'].billing_address['address_line_1'],
            BillingCity: newDataC['data'].billing_address['city'],
            BillingState: stateData != undefined ? stateData.id : null,
            BillingPostalCode: newDataC['data'].billing_address['postal_code'],
            BillingCountry: countryData != undefined ? countryData.id : null,
            BillingCountryCode: req.body.BillingCountryCode,
            BillingPhoneNumber: newDataC['data'].billing_address['phone'],
            IsShippingSame: req.body.shippingSameAsBilling,
            ShippingEmail: newDataC['data'].billing_address['email'],
            ShippingCustomerName:
              newDataC['data'].billing_address['first_name'],
            ShippingAddress: newDataC['data'].billing_address['address_line_1'],
            ShippingCity: newDataC['data'].billing_address['city'],
            ShippingState: stateData != undefined ? stateData.id : null,
            ShippingPostalCode: newDataC['data'].billing_address['postal_code'],
            ShippingCountry: countryData != undefined ? countryData.id : null,
            ShippingPhoneNumber: newDataC['data'].billing_address['phone'],
            ExpiryDate: req.body.ExpiryDate.replace(/\s/g, '').replace(
              /\\|\//g,
              ''
            ),
            Cvv: req.body.Cvv,
            ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
            AuthCode: newDataC['data'].response_body['card'].auth_code,
            TransactionGateWay: 'FluidPay',
            Refund: false,
            Void: false,
            Capture: false,
            Tokenization: false, // req.body.PaymentTokenization,
            Message: req.body.Message,
            Description: req.body.Description,
            ReferenceNo: req.body.ReferenceNo,
            ConvenienceFeeActive:
              minmumTxn != ''
                ? minmumTxn
                : userGateWayData.ConvenienceFeeActive,
            RequestOrigin: req.body.RequestOrigin,
            createdAt: newDataC['data'].created_at,
            updatedAt: newDataC['data'].updated_at,
            ProcessorId: userGateWayData.ProcessorId,
            SuggestedMode:
              req.body.SuggestedMode != undefined
                ? req.body.SuggestedMode
                : 'Card',
            TipAmount: parseFloat(req.body.TipAmount),
          };
          const transData = await models.Transaction.create(transactionInsert);
          await TranasactionServiceInstance.checkNotificationSettingAndCreateEmail(
            userInfo.id,
            newDataC['data'].id,
            'TransactionFailed'
          );
          if (req.body.PaymentLinkId != undefined) {
            await exports.sendWebHook(
              `Transaction declined due to ${newDataC['data']['response_body']['card'].processor_response_text}`,
              transData,
              req.body.PaymentLinkId,
              userInfo.id
            );
          }
          return res.status(200).json({
            status: 'error',
            message: `Transaction declined due to ${newDataC['data']['response_body']['card'].processor_response_text}`,
            data: JSON.parse(JSON.stringify(transData)),
          });
        }
      } else {
        return res.status(200).json({
          status: 'error',
          message: data.msg,
          data: JSON.parse(JSON.stringify(data)),
        });
      }
    } else if (
      data.status === 'success' &&
      data['data'].status === 'declined' &&
      userGateWayData.ProcessorLevel == 'QuantumB' &&
      userGateWayData.ConvenienceFeeActive == false
    ) {
      userGateWayData = await models.MerchantPaymentGateWay.findOne({
        where: {
          [Op.and]: [
            { UserId: userInfo.id },
            { SuggestedMode: 'Card' },
            { GatewayStatus: true },
            { processorLevel: 'QuantumD' },
          ],
        },
      });
      const requestHeader = {
        'Content-Type': 'application/json',
        Authorization: userGateWayData.GatewayApiKey,
      };
      transaction = {
        type: req.body.TransactionType == '1' ? 'sale' : 'authorize',
        amount: Math.round(total * 100),
        currency: 'USD',
        email_receipt: false,
        email_address: req.body.BillingEmail,
        create_vault_record: true,
        processor_id: userGateWayData.ProcessorId,
        payment_method: { card: card },
        billing_address: billingAddress,
        shipping_address: shippingAddress,
      };
      if (
        req.body.PaymentTokenization == true &&
        (customerExist == null || customerExist.GatewayCustomerId == null)
      ) {
        transaction['create_vault_record'] = true;
      } else {
        transaction['create_vault_record'] = false;
      }
      const jsonString = JSON.stringify(transaction);
      const requestOptions = {
        method: 'POST',
        headers: requestHeader,
        body: jsonString,
        redirect: 'follow',
      };
      const requestCreated = {
        GatewayType: userGateWayData.GatewayType,
        Request: requestOptions,
        Response: '',
        MerchantId: userInfo.id,
      };
      await models.ResponseRequestTable.create(requestCreated);
      const response = await fetch(
        `${process.env.FLUIDPAY_API_URL}/api/transaction`,
        requestOptions
      );
      const newDataD = await response.json();
      const responseInsert = {
        GatewayType: userGateWayData.GatewayType,
        Request: requestOptions,
        Response: newDataD,
        MerchantId: userInfo.id,
      };
      const responseId = await models.ResponseRequestTable.create(
        responseInsert
      );
      if (newDataD.status === 'success') {
        const checkCustomer = await exports.checkCustomerExist(
          req,
          userInfo.id
        );

        const findCustomer = await models.Customer.findOne({
          where: {
            [Op.and]: [
              { CountryCode: req.body.BillingCountryCode },
              { PhoneNumber: req.body.BillingPhoneNumber },
              { UserId: userInfo.id },
            ],
          },
        });
        if (checkCustomer != 'skip Token') {
          const cardToken = await exports.createFluidToken(
            req,
            userInfo,
            userGateWayData,
            newDataD,
            findCustomer,
            checkCustomer
          );
        }
        await models.ResponseRequestTable.update(
          { CustomerId: findCustomer.id },
          { where: { id: responseId.id } }
        );
        const stateData = await models.States.findOne({
          where: {
            Abbrevation: req.body.BillingState ?? null,
          },
        });
        const countryData = await models.Country.findOne({
          where: {
            Abbrevation: req.body.BillingCountry ?? null,
          },
        });
        const paymentMethods = exports.fluidPayCardBrands(
          newDataD['data'].response_body['card'].card_type
        );
        if (
          newDataD['data'].status == 'pending_settlement' ||
          newDataD['data'].status == 'authorized' ||
          newDataD['data'].status == 'voided'
        ) {
          newDataD['data'].status = '1';
          const transactionInsert = {
            CustomerId: findCustomer.id,
            MerchantId: userInfo.id,
            TransactionId: newDataD['data'].id,
            Amount: newDataD['data'].amount / 100,
            CardNumber: newDataD['data'].response_body['card'].last_four,
            PaymentMethod: paymentMethods,
            Type: req.body.TransactionType,
            Status: newDataD['data'].status,
            BillingEmail: newDataD['data'].billing_address['email'],
            BillingCustomerName: newDataD['data'].billing_address['first_name'],
            BillingAddress: newDataD['data'].billing_address['address_line_1'],
            BillingCity: newDataD['data'].billing_address['city'],
            BillingState: stateData != undefined ? stateData.id : null,
            BillingPostalCode: newDataD['data'].billing_address['postal_code'],
            BillingCountry: countryData != undefined ? countryData.id : null,
            BillingCountryCode: req.body.BillingCountryCode,
            BillingPhoneNumber: newDataD['data'].billing_address['phone'],
            IsShippingSame: req.body.shippingSameAsBilling,
            ShippingEmail: newDataD['data'].billing_address['email'],
            ShippingCustomerName:
              newDataD['data'].billing_address['first_name'],
            ShippingAddress: newDataD['data'].billing_address['address_line_1'],
            ShippingCity: newDataD['data'].billing_address['city'],
            ShippingState: stateData != undefined ? stateData.id : null,
            ShippingPostalCode: newDataD['data'].billing_address['postal_code'],
            ShippingCountry: countryData != undefined ? countryData.id : null,
            ShippingPhoneNumber: newDataD['data'].billing_address['phone'],
            ExpiryDate: req.body.ExpiryDate.replace(/\s/g, '').replace(
              /\\|\//g,
              ''
            ),
            Cvv: req.body.Cvv,
            ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
            AuthCode: newDataD['data'].response_body['card'].auth_code,
            TransactionGateWay: 'FluidPay',
            Refund: false,
            Void: false,
            Capture: false,
            Tokenization: false, // req.body.PaymentTokenization,
            Message: req.body.Message,
            Description: req.body.Description,
            ReferenceNo: req.body.ReferenceNo,
            ConvenienceFeeActive:
              minmumTxn != ''
                ? minmumTxn
                : userGateWayData.ConvenienceFeeActive,
            RequestOrigin: req.body.RequestOrigin,
            createdAt: newDataD['data'].created_at,
            updatedAt: newDataD['data'].updated_at,
            ProcessorId: userGateWayData.ProcessorId,
            SuggestedMode:
              req.body.SuggestedMode != undefined
                ? req.body.SuggestedMode
                : 'Card',
            TipAmount: parseFloat(req.body.TipAmount),
          };
          const transData = await models.Transaction.create(transactionInsert);
          await TranasactionServiceInstance.checkNotificationSettingAndCreateEmail(
            userInfo.id,
            newDataD['data'].id,
            'TransactionCompleted'
          );
          if (req.body.PaymentLinkId != undefined) {
            await exports.sendWebHook(
              undefined,
              transData,
              req.body.PaymentLinkId,
              userInfo.id
            );
          }
          return res.status(200).json({
            status: 'success',
            message: 'Transaction Processed Successfully',
            data: JSON.parse(JSON.stringify(transData)),
          });
        } else if (newDataD['data'].status == 'declined') {
          newDataD['data'].status = '9';
          const transactionInsert = {
            CustomerId: findCustomer.id,
            MerchantId: userInfo.id,
            TransactionId: newDataD['data'].id,
            Amount: newDataD['data'].amount / 100,
            CardNumber: newDataD['data'].response_body['card'].last_four,
            PaymentMethod: paymentMethods,
            Type: req.body.TransactionType,
            Status: newDataD['data'].status,
            BillingEmail: newDataD['data'].billing_address['email'],
            BillingCustomerName: newDataD['data'].billing_address['first_name'],
            BillingAddress: newDataD['data'].billing_address['address_line_1'],
            BillingCity: newDataD['data'].billing_address['city'],
            BillingState: stateData != undefined ? stateData.id : null,
            BillingPostalCode: newDataD['data'].billing_address['postal_code'],
            BillingCountry: countryData != undefined ? countryData.id : null,
            BillingCountryCode: req.body.BillingCountryCode,
            BillingPhoneNumber: newDataD['data'].billing_address['phone'],
            IsShippingSame: req.body.shippingSameAsBilling,
            ShippingEmail: newDataD['data'].billing_address['email'],
            ShippingCustomerName:
              newDataD['data'].billing_address['first_name'],
            ShippingAddress: newDataD['data'].billing_address['address_line_1'],
            ShippingCity: newDataD['data'].billing_address['city'],
            ShippingState: newDataD != undefined ? stateData.id : null,
            ShippingPostalCode: newDataD['data'].billing_address['postal_code'],
            ShippingCountry: countryData != undefined ? countryData.id : null,
            ShippingPhoneNumber: newDataD['data'].billing_address['phone'],
            ExpiryDate: req.body.ExpiryDate.replace(/\s/g, '').replace(
              /\\|\//g,
              ''
            ),
            Cvv: req.body.Cvv,
            ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
            AuthCode: newDataD['data'].response_body['card'].auth_code,
            TransactionGateWay: 'FluidPay',
            Refund: false,
            Void: false,
            Capture: false,
            Tokenization: false, // req.body.PaymentTokenization,
            Message: req.body.Message,
            Description: req.body.Description,
            ReferenceNo: req.body.ReferenceNo,
            ConvenienceFeeActive:
              minmumTxn != ''
                ? minmumTxn
                : userGateWayData.ConvenienceFeeActive,
            RequestOrigin: req.body.RequestOrigin,
            createdAt: newDataD['data'].created_at,
            updatedAt: newDataD['data'].updated_at,
            ProcessorId: userGateWayData.ProcessorId,
            SuggestedMode:
              req.body.SuggestedMode != undefined
                ? req.body.SuggestedMode
                : 'Card',
            TipAmount: parseFloat(req.body.TipAmount),
          };
          const transData = await models.Transaction.create(transactionInsert);
          await TranasactionServiceInstance.checkNotificationSettingAndCreateEmail(
            userInfo.id,
            newDataD['data'].id,
            'TransactionFailed'
          );
          if (req.body.PaymentLinkId != undefined) {
            await exports.sendWebHook(
              `Transaction declined due to ${newDataD['data']['response_body']['card'].processor_response_text}`,
              transData,
              req.body.PaymentLinkId,
              userInfo.id
            );
          }
          return res.status(200).json({
            status: 'error',
            message: `Transaction declined due to ${newDataD['data']['response_body']['card'].processor_response_text}`,
            data: JSON.parse(JSON.stringify(transData)),
          });
        } else if (
          newDataD['data'].status == 'failed' ||
          newDataD['data'].status == 'unknown'
        ) {
          newDataD['data'].status = '2';
          const transactionInsert = {
            CustomerId: findCustomer.id,
            MerchantId: userInfo.id,
            TransactionId: newDataD['data'].id,
            Amount: newDataD['data'].amount / 100,
            CardNumber: newDataD['data'].response_body['card'].last_four,
            PaymentMethod: paymentMethods,
            Type: req.body.TransactionType,
            Status: newDataD['data'].status,
            BillingEmail: newDataD['data'].billing_address['email'],
            BillingCustomerName: newDataD['data'].billing_address['first_name'],
            BillingAddress: newDataD['data'].billing_address['address_line_1'],
            BillingCity: newDataD['data'].billing_address['city'],
            BillingState: stateData != undefined ? stateData.id : null,
            BillingPostalCode: newDataD['data'].billing_address['postal_code'],
            BillingCountry: countryData != undefined ? countryData.id : null,
            BillingCountryCode: req.body.BillingCountryCode,
            BillingPhoneNumber: newDataD['data'].billing_address['phone'],
            IsShippingSame: req.body.shippingSameAsBilling,
            ShippingEmail: newDataD['data'].billing_address['email'],
            ShippingCustomerName:
              newDataD['data'].billing_address['first_name'],
            ShippingAddress: newDataD['data'].billing_address['address_line_1'],
            ShippingCity: newDataD['data'].billing_address['city'],
            ShippingState: stateData != undefined ? stateData.id : null,
            ShippingPostalCode: newDataD['data'].billing_address['postal_code'],
            ShippingCountry: countryData != undefined ? countryData.id : null,
            ShippingPhoneNumber: newDataD['data'].billing_address['phone'],
            ExpiryDate: req.body.ExpiryDate.replace(/\s/g, '').replace(
              /\\|\//g,
              ''
            ),
            Cvv: req.body.Cvv,
            ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
            AuthCode: newDataD['data'].response_body['card'].auth_code,
            TransactionGateWay: 'FluidPay',
            Refund: false,
            Void: false,
            Capture: false,
            Tokenization: false, // req.body.PaymentTokenization,
            Message: req.body.Message,
            Description: req.body.Description,
            ReferenceNo: req.body.ReferenceNo,
            ConvenienceFeeActive:
              minmumTxn != ''
                ? minmumTxn
                : userGateWayData.ConvenienceFeeActive,
            RequestOrigin: req.body.RequestOrigin,
            createdAt: newDataD['data'].created_at,
            updatedAt: newDataD['data'].updated_at,
            ProcessorId: userGateWayData.ProcessorId,
            SuggestedMode:
              req.body.SuggestedMode != undefined
                ? req.body.SuggestedMode
                : 'Card',
            TipAmount: parseFloat(req.body.TipAmount),
          };
          const transData = await models.Transaction.create(transactionInsert);
          await TranasactionServiceInstance.checkNotificationSettingAndCreateEmail(
            userInfo.id,
            newDataD['data'].id,
            'TransactionFailed'
          );
          if (req.body.PaymentLinkId != undefined) {
            await exports.sendWebHook(
              `Transaction declined due to ${newDataD['data']['response_body']['card'].processor_response_text}`,
              transData,
              req.body.PaymentLinkId,
              userInfo.id
            );
          }
          return res.status(200).json({
            status: 'error',
            message: `Transaction declined due to ${newDataD['data']['response_body']['card'].processor_response_text}`,
            data: JSON.parse(JSON.stringify(transData)),
          });
        }
      } else {
        if (req.body.PaymentLinkId != undefined) {
          await exports.sendWebHook(
            data.msg,
            undefined,
            req.body.PaymentLinkId,
            userInfo.id
          );
        }
        return res.status(200).json({
          status: 'error',
          message: data.msg,
          data: JSON.parse(JSON.stringify(data)),
        });
      }
    } else {
      if (data.status === 'success') {
        const checkCustomer = await exports.checkCustomerExist(
          req,
          userInfo.id
        );

        const findCustomer = await models.Customer.findOne({
          where: {
            [Op.and]: [
              { CountryCode: req.body.BillingCountryCode },
              { PhoneNumber: req.body.BillingPhoneNumber },
              { UserId: userInfo.id },
            ],
          },
        });
        if (checkCustomer != 'skip Token') {
          const cardToken = await exports.createFluidToken(
            req,
            userInfo,
            userGateWayData,
            data,
            findCustomer,
            checkCustomer
          );
        }
        await models.ResponseRequestTable.update(
          { CustomerId: findCustomer.id },
          { where: { id: responseId.id } }
        );
        const stateData = await models.States.findOne({
          where: {
            Abbrevation: req.body.BillingState ?? null,
          },
        });
        const countryData = await models.Country.findOne({
          where: {
            Abbrevation: req.body.BillingCountry ?? null,
          },
        });
        const paymentMethods = exports.fluidPayCardBrands(
          data['data'].response_body['card'].card_type
        );
        if (
          data['data'].status == 'pending_settlement' ||
          data['data'].status == 'authorized' ||
          data['data'].status == 'voided'
        ) {
          data['data'].status = '1';
          const transactionInsert = {
            CustomerId: findCustomer.id,
            MerchantId: userInfo.id,
            TransactionId: data['data'].id,
            Amount: data['data'].amount / 100,
            CardNumber: data['data'].response_body['card'].last_four,
            PaymentMethod: paymentMethods,
            Type: req.body.TransactionType,
            Status: data['data'].status,
            BillingEmail: data['data'].billing_address['email'],
            BillingCustomerName: data['data'].billing_address['first_name'],
            BillingAddress: data['data'].billing_address['address_line_1'],
            BillingCity: data['data'].billing_address['city'],
            BillingState: stateData != undefined ? stateData.id : null,
            BillingPostalCode: data['data'].billing_address['postal_code'],
            BillingCountry: countryData != undefined ? countryData.id : null,
            BillingCountryCode: req.body.BillingCountryCode,
            BillingPhoneNumber: data['data'].billing_address['phone'],
            IsShippingSame: req.body.shippingSameAsBilling,
            ShippingEmail: data['data'].billing_address['email'],
            ShippingCustomerName: data['data'].billing_address['first_name'],
            ShippingAddress: data['data'].billing_address['address_line_1'],
            ShippingCity: data['data'].billing_address['city'],
            ShippingState: stateData != undefined ? stateData.id : null,
            ShippingPostalCode: data['data'].billing_address['postal_code'],
            ShippingCountry: countryData != undefined ? countryData.id : null,
            ShippingPhoneNumber: data['data'].billing_address['phone'],
            ExpiryDate: req.body.ExpiryDate.replace(/\s/g, '').replace(
              /\\|\//g,
              ''
            ),
            Cvv: req.body.Cvv,
            ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
            AuthCode: data['data'].response_body['card'].auth_code,
            TransactionGateWay: 'FluidPay',
            Refund: false,
            Void: false,
            Capture: false,
            Tokenization: false, // req.body.PaymentTokenization,
            Message: req.body.Message,
            Description: req.body.Description,
            ReferenceNo: req.body.ReferenceNo,
            ConvenienceFeeActive:
              minmumTxn != ''
                ? minmumTxn
                : userGateWayData.ConvenienceFeeActive,
            RequestOrigin: req.body.RequestOrigin,
            createdAt: data['data'].created_at,
            updatedAt: data['data'].updated_at,
            ProcessorId: userGateWayData.ProcessorId,
            SuggestedMode:
              req.body.SuggestedMode != undefined
                ? req.body.SuggestedMode
                : 'Card',
            TipAmount: parseFloat(req.body.TipAmount),
          };
          const transData = await models.Transaction.create(transactionInsert);
          await TranasactionServiceInstance.checkNotificationSettingAndCreateEmail(
            userInfo.id,
            data['data'].id,
            'TransactionCompleted'
          );
          if (req.body.PaymentLinkId != undefined) {
            await exports.sendWebHook(
              undefined,
              transData,
              req.body.PaymentLinkId,
              userInfo.id
            );
          }
          return res.status(200).json({
            status: 'success',
            message: 'Transaction Processed Successfully',
            data: JSON.parse(JSON.stringify(transData)),
          });
        } else if (data['data'].status == 'declined') {
          data['data'].status = '9';
          const transactionInsert = {
            CustomerId: findCustomer.id,
            MerchantId: userInfo.id,
            TransactionId: data['data'].id,
            Amount: data['data'].amount / 100,
            CardNumber: data['data'].response_body['card'].last_four,
            PaymentMethod: paymentMethods,
            Type: req.body.TransactionType,
            Status: data['data'].status,
            BillingEmail: data['data'].billing_address['email'],
            BillingCustomerName: data['data'].billing_address['first_name'],
            BillingAddress: data['data'].billing_address['address_line_1'],
            BillingCity: data['data'].billing_address['city'],
            BillingState: stateData != undefined ? stateData.id : null,
            BillingPostalCode: data['data'].billing_address['postal_code'],
            BillingCountry: countryData != undefined ? countryData.id : null,
            BillingCountryCode: req.body.BillingCountryCode,
            BillingPhoneNumber: data['data'].billing_address['phone'],
            IsShippingSame: req.body.shippingSameAsBilling,
            ShippingEmail: data['data'].billing_address['email'],
            ShippingCustomerName: data['data'].billing_address['first_name'],
            ShippingAddress: data['data'].billing_address['address_line_1'],
            ShippingCity: data['data'].billing_address['city'],
            ShippingState: stateData != undefined ? stateData.id : null,
            ShippingPostalCode: data['data'].billing_address['postal_code'],
            ShippingCountry: countryData != undefined ? countryData.id : null,
            ShippingPhoneNumber: data['data'].billing_address['phone'],
            ExpiryDate: req.body.ExpiryDate.replace(/\s/g, '').replace(
              /\\|\//g,
              ''
            ),
            Cvv: req.body.Cvv,
            ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
            AuthCode: data['data'].response_body['card'].auth_code,
            TransactionGateWay: 'FluidPay',
            Refund: false,
            Void: false,
            Capture: false,
            Tokenization: false, // req.body.PaymentTokenization,
            Message: req.body.Message,
            Description: req.body.Description,
            ReferenceNo: req.body.ReferenceNo,
            ConvenienceFeeActive:
              minmumTxn != ''
                ? minmumTxn
                : userGateWayData.ConvenienceFeeActive,
            RequestOrigin: req.body.RequestOrigin,
            createdAt: data['data'].created_at,
            updatedAt: data['data'].updated_at,
            ProcessorId: userGateWayData.ProcessorId,
            SuggestedMode:
              req.body.SuggestedMode != undefined
                ? req.body.SuggestedMode
                : 'Card',
            TipAmount: parseFloat(req.body.TipAmount),
          };
          const transData = await models.Transaction.create(transactionInsert);
          if (req.body.PaymentLinkId != undefined) {
            await exports.sendWebHook(
              `Transaction declined due to ${data['data']['response_body']['card'].processor_response_text}`,
              transData,
              req.body.PaymentLinkId,
              userInfo.id
            );
          }
          await TranasactionServiceInstance.checkNotificationSettingAndCreateEmail(
            userInfo.id,
            data['data'].id,
            'TransactionFailed'
          );
          return res.status(200).json({
            status: 'error',
            message: `Transaction declined due to ${data['data']['response_body']['card'].processor_response_text}`,
            data: JSON.parse(JSON.stringify(transData)),
          });
        } else if (
          data['data'].status == 'failed' ||
          data['data'].status == 'unknown'
        ) {
          data['data'].status = '2';
          const transactionInsert = {
            CustomerId: findCustomer.id,
            MerchantId: userInfo.id,
            TransactionId: data['data'].id,
            Amount: data['data'].amount / 100,
            CardNumber: data['data'].response_body['card'].last_four,
            PaymentMethod: paymentMethods,
            Type: req.body.TransactionType,
            Status: data['data'].status,
            BillingEmail: data['data'].billing_address['email'],
            BillingCustomerName: data['data'].billing_address['first_name'],
            BillingAddress: data['data'].billing_address['address_line_1'],
            BillingCity: data['data'].billing_address['city'],
            BillingState: stateData != undefined ? stateData.id : null,
            BillingPostalCode: data['data'].billing_address['postal_code'],
            BillingCountry: countryData != undefined ? countryData.id : null,
            BillingCountryCode: req.body.BillingCountryCode,
            BillingPhoneNumber: data['data'].billing_address['phone'],
            IsShippingSame: req.body.shippingSameAsBilling,
            ShippingEmail: data['data'].billing_address['email'],
            ShippingCustomerName: data['data'].billing_address['first_name'],
            ShippingAddress: data['data'].billing_address['address_line_1'],
            ShippingCity: data['data'].billing_address['city'],
            ShippingState: stateData != undefined ? stateData.id : null,
            ShippingPostalCode: data['data'].billing_address['postal_code'],
            ShippingCountry: countryData != undefined ? countryData.id : null,
            ShippingPhoneNumber: data['data'].billing_address['phone'],
            ExpiryDate: req.body.ExpiryDate.replace(/\s/g, '').replace(
              /\\|\//g,
              ''
            ),
            Cvv: req.body.Cvv,
            ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
            AuthCode: data['data'].response_body['card'].auth_code,
            TransactionGateWay: 'FluidPay',
            Refund: false,
            Void: false,
            Capture: false,
            Tokenization: false, // req.body.PaymentTokenization,
            Message: req.body.Message,
            Description: req.body.Description,
            ReferenceNo: req.body.ReferenceNo,
            ConvenienceFeeActive:
              minmumTxn != ''
                ? minmumTxn
                : userGateWayData.ConvenienceFeeActive,
            RequestOrigin: req.body.RequestOrigin,
            createdAt: data['data'].created_at,
            updatedAt: data['data'].updated_at,
            ProcessorId: userGateWayData.ProcessorId,
            SuggestedMode:
              req.body.SuggestedMode != undefined
                ? req.body.SuggestedMode
                : 'Card',
            TipAmount: parseFloat(req.body.TipAmount),
          };
          const transData = await models.Transaction.create(transactionInsert);
          await TranasactionServiceInstance.checkNotificationSettingAndCreateEmail(
            userInfo.id,
            data['data'].id,
            'TransactionFailed'
          );
          if (req.body.PaymentLinkId != undefined) {
            await exports.sendWebHook(
              `Transaction declined due to ${data['data']['response_body']['card'].processor_response_text}`,
              transData,
              req.body.PaymentLinkId,
              userInfo.id
            );
          }
          return res.status(200).json({
            status: 'error',
            message: `Transaction declined due to ${data['data']['response_body']['card'].processor_response_text}`,
            data: JSON.parse(JSON.stringify(transData)),
          });
        }
      } else {
        if (req.body.PaymentLinkId != undefined) {
          await exports.sendWebHook(
            data.msg,
            undefined,
            req.body.PaymentLinkId,
            userInfo.id
          );
        }
        return res.status(200).json({
          status: 'error',
          message: data.msg,
          data: JSON.parse(JSON.stringify(data)),
        });
      }
    }
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).json({
      status: 'error',
      message: err,
    });
  }
};

// Deprecated APi created for Old Report template
exports.getReprtPreferenceFields = async (req, res) => {
  let token = '';
  let decoded = '';
  if (req.body.MerchantId != undefined) {
    decoded = {};
    decoded.UUID = req.body.MerchantId;
  } else {
    token = req.headers.authorization.split(' ');
    decoded = jwt.verify(token[1], process.env.JWT_SECRET);
  }

  const userInfo = await models.User.findOne({
    where: {
      UUID: decoded.UUID,
    },
  });

  await models.ReportFieldsTransaction.findOne({
    where: { MerchantId: userInfo.id },
  }).then((resultData) => {
    if (resultData === null) {
      res.status(204).json({
        message: 'Result Not Exist',
      });
    } else {
      const data = {
        id: resultData.id,
        Fieldnames: resultData.FiledNames.columns,
        MerchantId: resultData.MerchantId,
        createdAt: resultData.createdAt,
        updatedAt: resultData.updatedAt,
      };
      res.status(200).json({
        message: 'Result found successfully',
        data: data,
      });
    }
  });
};

// Deprecated APi created for Old Report template
exports.setReprtPreferenceFields = async (req, res) => {
  let token = '';
  let decoded = '';
  if (req.body.MerchantId != undefined) {
    decoded = {};
    decoded.UUID = req.body.MerchantId;
  } else {
    token = req.headers.authorization.split(' ');
    decoded = jwt.verify(token[1], process.env.JWT_SECRET);
  }

  const userInfo = await models.User.findOne({
    where: {
      UUID: decoded.UUID,
    },
  });
  const fieldInfo = await models.ReportFieldsTransaction.findOne({
    where: { MerchantId: userInfo.id },
  });
  try {
    let requestFields = { columns: req.body.columns };

    if (fieldInfo != undefined) {
      const fields = {
        FiledNames: requestFields,
      };
      await models.ReportFieldsTransaction.update(
        {
          FiledNames: requestFields,
        },
        {
          where: {
            MerchantId: userInfo.id,
          },
        }
      )
        .then(async (result) => {
          res.status(200).json({
            message: 'Fields Updated Successfully',
            Result: 'Ok',
          });
        })
        .catch(async (err) => {
          Sentry.captureException(err);
          res.status(500).json({
            message: 'Something went wrong',
            error: err,
          });
        });
    } else {
      const fields = {
        FiledNames: requestFields,
        MerchantId: userInfo.id,
      };
      await models.ReportFieldsTransaction.create(fields)
        .then(async (result) => {
          res.status(201).json({
            message: 'Fields Saved Successfully',
            Result: result,
          });
        })
        .catch((err) => {
          Sentry.captureException(err);
          res.status(500).json({
            message: 'Something went wrong',
            error: err,
          });
        });
    }
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).json({
      message: err,
    });
  }
};

//To charge payment from customer (only applicable to customer used Payrix)
exports.processChargeCustomerViaTkn = async (req, res) => {
  try {
    let token = '';
    let decoded = '';
    if (req.body.MerchantId != undefined) {
      decoded = {};
      decoded.UUID = req.body.MerchantId;
    } else {
      token = req.headers.authorization.split(' ');
      decoded = jwt.verify(token[1], process.env.JWT_SECRET);
    }

    const delay = (ms = 4000) => new Promise((r) => setTimeout(r, ms));

    const userIdData = await models.User.findOne({
      where: {
        UUID: decoded.UUID,
      },
    });
    const userGateWayData = await models.MerchantPaymentGateWay.findOne({
      where: {
        [Op.and]: [
          { UserId: userIdData.id },
          { SuggestedMode: 'Card' },
          { GatewayStatus: true },
        ],
      },
    });

    const customerData = await models.Customer.findOne({
      where: {
        GatewayCustomerId: req.body.GatewayCustomerId,
      },
    });

    const CardData = await models.CardTokens.findOne({
      where: {
        [Op.and]: [
          { GatewayCustomerId: req.body.GatewayCustomerId },
          { CustomerId: customerData.id },
        ],
      },
    });

    if (
      userGateWayData.ConvenienceFeeActive == true &&
      req.body.ConvenienceFeeActive == true
    ) {
      FeeValue = exports.getConvenienceFee(
        req.body.Amount,
        userGateWayData.ConvenienceFeeValue,
        userGateWayData.ConvenienceFeeType,
        userGateWayData.ConvenienceFeeMinimum
      );
      total = parseFloat(req.body.Amount) + FeeValue;
    } else {
      FeeValue = null;
      total = parseFloat(req.body.Amount);
    }
    if (FeeValue != null) {
      transaction = JSON.stringify({
        merchant: userGateWayData.GMerchantId,
        type: req.body.TransactionType,
        origin: '2',
        token: req.body.TokenId,
        expiration: req.body.Expiration,
        total: Math.round(total * 100),
        fee: FeeValue != null ? Math.round(FeeValue * 100) : null,
      });
    } else {
      transaction = JSON.stringify({
        merchant: userGateWayData.GMerchantId,
        type: req.body.TransactionType,
        origin: '2',
        token: req.body.TokenId,
        expiration: req.body.Expiration,
        total: Math.round(total * 100),
      });
    }
    const config = {
      method: 'post',
      url: `${process.env.PAYRIX_URL}/txns`,
      headers: {
        'Content-Type': 'application/json',
        APIKEY: userGateWayData.GatewayApiKey,
      },
      data: transaction,
    };

    return await axios(config)
      .then(async (response) => {
        const responseData = response.data; // if resp contains the data you will get it here.
        if (responseData.response.errors.length == 0) {
          let newConfig = {
            method: 'get',
            url: `${process.env.PAYRIX_URL}/txns/${responseData.response.data[0].id}`,
            headers: {
              'Content-Type': 'application/json',
              APIKEY: userGateWayData.GatewayApiKey,
            },
          };
          await delay();
          axios(newConfig).then(async (newResult) => {
            const data = newResult.data;
            if (
              data.response.data.length > 0 &&
              data.response.data[0].status != 2 &&
              data.response.errors.length == 0
            ) {
              const transData = data.response.data;
              const RequestResponse = {
                GatewayType: userGateWayData.GatewayType,
                Request: config,
                Response: data,
                CustomerId: customerData.id,
                MerchantId: userIdData.id,
              };
              models.ResponseRequestTable.create(RequestResponse).then(
                (resultData) => {
                  const transactionData = {
                    CustomerId: customerData.id,
                    MerchantId: userIdData.id,
                    TransactionId: transData[0].id,
                    Amount: transData[0].total / 100,
                    GatewayCustomerId: req.body.GatewayCustomerId,
                    CardNumber: CardData.LastNumber,
                    PaymentMethod: CardData.CardBrand,
                    Type: transData[0].type,
                    Status: transData[0].status,
                    BillingEmail: transData[0].email,
                    BillingCustomerName: transData[0].first,
                    BillingAddress: transData[0].address1,
                    BillingCity: transData[0].city,
                    BillingState: customerData.StateId,
                    BillingPostalCode: transData[0].zip,
                    BillingCountry: customerData.CountryId,
                    BillingCountryCode: req.body.BillingCountryCode,
                    BillingPhoneNumber: transData[0].phone,
                    IsShippingSame: req.body.shippingSameAsBilling,
                    ShippingEmail: transData[0].email,
                    ShippingCustomerName: transData[0].first,
                    ShippingAddress: transData[0].address1,
                    ShippingCity: transData[0].city,
                    ShippingState: customerData.StateId,
                    ShippingPostalCode: transData[0].zip,
                    ShippingCountry: customerData.CountryId,
                    ShippingPhoneNumber: transData[0].phone,
                    ConvenienceFeeValue: transData[0].fee / 100,
                    ConvenienceFeeMinimum:
                      userGateWayData.ConvenienceFeeMinimum,
                    ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
                    AuthCode: transData[0].authorization,
                    TransactionGateWay: 'Payrix',
                    Refund: false,
                    Void: false,
                    Capture: false,
                    Tokenization: req.body.PaymentTokenization,
                    Message: req.body.Message,
                    Description: req.body.Description,
                    ReferenceNo: req.body.ReferenceNo,
                    ConvenienceFeeActive:
                      userGateWayData.ConvenienceFeeActive == true &&
                      req.body.ConvenienceFeeActive == true
                        ? true
                        : false,
                    RequestOrigin: req.body.RequestOrigin,
                    createdAt: transData[0].created,
                    updatedAt: transData[0].modified,
                    SuggestedMode:
                      req.body.SuggestedMode != undefined
                        ? req.body.SuggestedMode
                        : 'Card',
                    TipAmount: parseFloat(req.body.TipAmount),
                  };
                  models.Transaction.create(transactionData).then(
                    async (trs) => {
                      return res.status(200).json({
                        message: 'Transaction Completed Successfully',
                        data: JSON.parse(JSON.stringify(trs)),
                      });
                    }
                  );
                }
              );
            } else if (
              data.response.data.length > 0 &&
              data.response.data[0].status == 2 &&
              data.response.errors.length == 0
            ) {
              const transData = data.response.data;
              const transErrors = data.response.errors[0].msg;
              const RequestResponse = {
                GatewayType: userGateWayData.GatewayType,
                Request: config,
                Response: data,
                CustomerId: customerData.id,
                MerchantId: userIdData.id,
              };
              models.ResponseRequestTable.create(RequestResponse).then(
                (resultData) => {
                  const transactionData = {
                    CustomerId: customerData.id,
                    MerchantId: userIdData.id,
                    TransactionId: transData[0].id,
                    Amount: transData[0].total / 100,
                    GatewayCustomerId: req.body.GatewayCustomerId,
                    CardNumber: CardData.LastNumber,
                    PaymentMethod: CardData.CardBrand,
                    Type: transData[0].type,
                    Status: transData[0].status,
                    BillingEmail: transData[0].email,
                    BillingCustomerName: transData[0].first,
                    BillingAddress: transData[0].address1,
                    BillingCity: transData[0].city,
                    BillingState: customerData.StateId,
                    BillingPostalCode: transData[0].zip,
                    BillingCountry: customerData.CountryId,
                    BillingCountryCode: req.body.BillingCountryCode,
                    BillingPhoneNumber: transData[0].phone,
                    IsShippingSame: req.body.shippingSameAsBilling,
                    ShippingEmail: transData[0].email,
                    ShippingCustomerName: transData[0].first,
                    ShippingAddress: transData[0].address1,
                    ShippingCity: transData[0].city,
                    ShippingState: customerData.StateId,
                    ShippingPostalCode: transData[0].zip,
                    ShippingCountry: customerData.CountryId,
                    ShippingPhoneNumber: transData[0].phone,
                    ConvenienceFeeValue: transData[0].fee / 100,
                    ConvenienceFeeMinimum:
                      userGateWayData.ConvenienceFeeMinimum,
                    ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
                    AuthCode: transData[0].authorization,
                    TransactionGateWay: 'Payrix',
                    Refund: false,
                    Void: false,
                    Capture: false,
                    Tokenization: req.body.PaymentTokenization,
                    Message: req.body.Message,
                    Description: req.body.Description,
                    ReferenceNo: req.body.ReferenceNo,
                    ConvenienceFeeActive:
                      userGateWayData.ConvenienceFeeActive == true &&
                      req.body.ConvenienceFeeActive == true
                        ? true
                        : false,
                    RequestOrigin: req.body.RequestOrigin,
                    createdAt: transData[0].created,
                    updatedAt: transData[0].modified,
                    SuggestedMode:
                      req.body.SuggestedMode != undefined
                        ? req.body.SuggestedMode
                        : 'Card',
                    TipAmount: parseFloat(req.body.TipAmount),
                  };
                  models.Transaction.create(transactionData).then(
                    async (trs) => {
                      res.status(200).json({
                        message: `Transaction Failed due to ${transErrors}`,
                        data: JSON.parse(JSON.stringify(trs)),
                      });
                    }
                  );
                }
              );
            } else if (
              data.response.data.length == 0 &&
              data.response.errors.length > 0
            ) {
              Sentry.captureException(data.response.errors[0].msg);
              return res.status(500).json({
                message: `${data.response.errors[0].msg}`,
              });
            }
          });
        } else {
          Sentry.captureException(responseData.response.errors[0].msg);
          return res.status(500).json({
            message: `${responseData.response.errors[0].msg}`,
          });
        }
      })
      .catch(async (err) => {
        Sentry.captureException(err);
        res.status(400).json({
          message: 'Something went wrong',
          error: err,
        });
      });
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).json({
      message: 'Something went wrong',
      error: err,
    });
  }
};

//To fetch customer info and insert/update the customer for each Txn
exports.checkCustomerExist = async (req, merchantId) => {
  let customerCardExist;
  let tokenExist;
  const customerExist = await models.Customer.findOne({
    where: {
      [Op.and]: [
        { CountryCode: req.body.BillingCountryCode },
        { PhoneNumber: req.body.BillingPhoneNumber },
        { UserId: merchantId },
      ],
    },
  });
  if (customerExist != null) {
    customerCardExist = await models.Card.findOne({
      where: {
        [Op.and]: [
          { CardNumber: req.body.CardNumber },
          { CustomerId: customerExist.id },
        ],
      },
    });
    // tokenExist = await models.CardTokens.findAll({
    //   where: {
    //     [Op.and]: [
    //       { CardNumber: req.body.CardNumber },
    //       { CustomerId: customerExist.id },
    //     ],
    //   },
    // });
  }

  const stateData = await models.States.findOne({
    where: {
      Abbrevation: req.body.BillingState ?? null,
    },
  });
  const countryData = await models.Country.findOne({
    where: {
      Abbrevation: req.body.BillingCountry ?? null,
    },
  });
  if (customerExist != undefined) {
    const updateCustomer = await models.Customer.update(
      {
        CustomerName: req.body.BillingCustomerName,
        Address: req.body.BillingAddress,
        City: req.body.BillingCity,
        PostalCode: req.body.BillingPostalCode,
        StateId: stateData != undefined ? stateData.id : null,
        CountryId: countryData != undefined ? countryData.id : null,
        CountryCode: customerExist.CountryCode,
        PhoneNumber: customerExist.PhoneNumber,
        Email: req.body.BillingEmail ?? null,
        UserId: merchantId,
      },
      {
        where: {
          id: customerExist.id,
        },
      }
    );
  } else {
    const customer = {
      CustomerName: req.body.BillingCustomerName,
      Address: req.body.BillingAddress,
      City: req.body.BillingCity,
      PostalCode: req.body.BillingPostalCode,
      StateId: stateData != undefined ? stateData.id : null,
      CountryId: countryData != undefined ? countryData.id : null,
      CountryCode: req.body.BillingCountryCode,
      PhoneNumber: req.body.BillingPhoneNumber,
      Email: req.body.BillingEmail ?? null,
      UserId: merchantId,
    };
    const insertCustomer = await models.Customer.create(customer);
  }
  const findCustomer = await models.Customer.findOne({
    where: {
      [Op.and]: [
        { CountryCode: req.body.BillingCountryCode },
        { PhoneNumber: req.body.BillingPhoneNumber },
        { UserId: merchantId },
      ],
    },
  });

  if (customerCardExist != null) {
    const cardObj = {
      CardHolderName: req.body.BillingCustomerName,
      CustomerId: customerExist.id,
      CardNumber: req.body.CardNumber,
      Cvv: req.body.Cvv,
      ExpiryDate: req.body.ExpiryDate.replace(/\s/g, '').replace(/\\|\//g, ''),
      Brand: req.body.Brand,
    };
    const updateCard = await models.Card.update(cardObj, {
      where: {
        id: customerCardExist.id,
      },
    });
  } else {
    const cardObj = {
      CardHolderName: req.body.BillingCustomerName,
      CustomerId: findCustomer.id,
      CardNumber: req.body.CardNumber,
      Cvv: req.body.Cvv,
      ExpiryDate: req.body.ExpiryDate.replace(/\s/g, '').replace(/\\|\//g, ''),
      Brand: req.body.Brand,
    };
    const insertCard = await models.Card.create(cardObj);
  }

  if (customerExist != null && customerCardExist != null) {
    return 'skip Token';
  } else if (customerExist != null && customerCardExist == null) {
    return 'New card for customer';
  } else {
    return 'create Token';
  }
};

exports.refundTransactions = async (req, res) => {
  let token = '';
  let decoded = '';
  if (req.body.MerchantId != undefined) {
    decoded = {};
    decoded.UUID = req.body.MerchantId;
  } else {
    token = req.headers.authorization.split(' ');
    decoded = jwt.verify(token[1], process.env.JWT_SECRET);
  }
  const transactionId = await models.Transaction.findOne({
    where: { TransactionId: req.body.TransactionId },
  });
  const userIdData = await models.User.findOne({
    where: {
      UUID: decoded.UUID,
    },
  });
  const gateway = await exports.userGateWay(userIdData, transactionId);

  switch (gateway.GatewayType) {
    case 'Payrix':
      return exports.payRixRefundTransaction(
        req,
        userIdData,
        gateway,
        transactionId,
        res
      );
      break;
    case 'FluidPay':
      return exports.fluidRefundTransactions(
        req,
        userIdData,
        gateway,
        transactionId,
        res
      );
      break;
    case 'Authorizenet':
      return exports.AuthorizenetRefundTransactions(
        req,
        userIdData,
        gateway,
        transactionId,
        res
      );
      break;
  }
};

exports.userGateWay = async (userId, transactionId) => {
  if (userId != null) {
    let userGateWayData = '';
    
    if (transactionId.TransactionGateWay == 'Payrix') {
      userGateWayData = await models.MerchantPaymentGateWay.findOne({
        where: {
          [Op.and]: [
            { UserId: userId.id },
            { SuggestedMode: 'Card' },
            { GatewayType: transactionId.TransactionGateWay },
          ],
        },
      });
    } else if (transactionId.TransactionGateWay == 'FluidPay') {
      userGateWayData = await models.MerchantPaymentGateWay.findOne({
        where: {
          [Op.and]: [
            { UserId: userId.id },
            { SuggestedMode: 'Card' },
            { GatewayType: transactionId.TransactionGateWay },
            { ConvenienceFeeActive: transactionId.ConvenienceFeeActive },
          ],
        },
      });
    } else if (transactionId.TransactionGateWay == 'Authorizenet') {
      userGateWayData = await models.MerchantPaymentGateWay.findOne({
        where: {
          [Op.and]: [
            { UserId: userId.id },
            { SuggestedMode: 'Card' },
            { GatewayType: transactionId.TransactionGateWay },
            { ConvenienceFeeActive: transactionId.ConvenienceFeeActive },
          ],
        },
      });
    }
    return userGateWayData;
  }
};

exports.captureTransactions = async (req, res) => {
  let token = '';
  let decoded = '';
  if (req.body.MerchantId != undefined) {
    decoded = {};
    decoded.UUID = req.body.MerchantId;
  } else {
    token = req.headers.authorization.split(' ');
    decoded = jwt.verify(token[1], process.env.JWT_SECRET);
  }
  const transactionId = await models.Transaction.findOne({
    where: { TransactionId: req.body.TransactionId },
  });
  const userIdData = await models.User.findOne({
    where: {
      UUID: decoded.UUID,
    },
  });
  const gateway = await exports.userGateWay(userIdData, transactionId);

  switch (gateway.GatewayType) {
    case 'Payrix':
      return exports.payRixCaptureTransaction(
        req,
        userIdData,
        gateway,
        transactionId,
        res
      );
      break;
    case 'FluidPay':
      return exports.fluidCaptureTransactions(
        req,
        userIdData,
        gateway,
        transactionId,
        res
      );
      break;
    case 'Authorizenet':
      return exports.AuthorizenetCaptureTransactions(
        req,
        userIdData,
        gateway,
        transactionId,
        res
      );
      break;
  }
};

exports.voidTransactions = async (req, res) => {
  let token = '';
  let decoded = '';
  if (req.body.MerchantId != undefined) {
    decoded = {};
    decoded.UUID = req.body.MerchantId;
  } else {
    token = req.headers.authorization.split(' ');
    decoded = jwt.verify(token[1], process.env.JWT_SECRET);
  }
  const transactionId = await models.Transaction.findOne({
    where: { TransactionId: req.body.TransactionId },
  });
  const userIdData = await models.User.findOne({
    where: {
      UUID: decoded.UUID,
    },
  });
  const gateway = await exports.userGateWay(userIdData, transactionId);

  switch (gateway.GatewayType) {
    case 'Payrix':
      return exports.payRixVoidTransaction(
        req,
        userIdData,
        gateway,
        transactionId,
        res
      );
      break;
    case 'FluidPay':
      return exports.fluidVoidTransactions(
        req,
        userIdData,
        gateway,
        transactionId,
        res
      );
      break;
    case 'Authorizenet':
      return exports.AuthorizenetVoidTransactions(
        req,
        userIdData,
        gateway,
        transactionId,
        res
      );
      break;
  }
};

exports.fluidRefundTransactions = async (
  req,
  userInfo,
  userGateWayData,
  transactionId,
  res
) => {
  
  const txnData = await exports.getTxnFromFluidPay(
    req.body.TransactionId,
    userGateWayData.GatewayApiKey
    );
  if (req.body.TransactionId != undefined && req.body.MerchantId != undefined) {
    const txntype = exports.TransactionType(req.body.TransactionFor);
    
    const requestHeader = {
      'Content-Type': 'application/json',
      Authorization: userGateWayData.GatewayApiKey,
    };
    
    let requestOptions = '';
    let jsonString = '';
    if (
      req.body.Amount != undefined &&
      req.body.TransactionFor != 'FullRefund'
      ) {
      jsonString = JSON.stringify({
        amount: Math.round(parseFloat(req.body.Amount) * 100),
      });
      requestOptions = {
        method: 'POST',
        headers: requestHeader,
        body: jsonString,
      };
    } else {
      jsonString = JSON.stringify({
        amount: Math.round(parseFloat(req.body.Amount) * 100),
      });
      requestOptions = {
        method: 'POST',
        headers: requestHeader,
        body: jsonString,
      };
    }
    console.log("ssssssssssssss", transactionId.CustomerId, "ssssssssssssssssssss");
    return;
    if (txnData['data'].status == 'settled' && transactionId.Type != '2') {
      const requestCreated = {
        GatewayType: userGateWayData.GatewayType,
        Request: requestOptions,
        Response: '',
        MerchantId: userInfo.id,
      };
      await models.ResponseRequestTable.create(requestCreated);
      
      const response = await fetch(
        `${process.env.FLUIDPAY_API_URL}/api/transaction/${transactionId.TransactionId}/refund`,
        requestOptions
        );
        const data = await response.json();

      if (data.status === 'success') {
        const transData = data['data'];
        const RequestResponse = {
          GatewayType: userGateWayData.GatewayType,
          Request: requestOptions,
          Response: data,
          MerchantId: userInfo.id,
        };
        const resCreated = await models.ResponseRequestTable.create(
          RequestResponse
        );
        // create new txn for refund

        const createNewTransaction = await models.Transaction.create(
          {
            TransactionId: txnData['data'].id,
            CustomerId: transactionId.CustomerId,
            MerchantId: transactionId.MerchantId,
            Amount: transactionId.Amount,
            CardNumber: txnData['data'].response_body.card.last_four,
            PaymentMethod: txnData['data'].payment_method,
            Type: txnData['data'].type,
            Status: "1",
            BillingEmail: txnData['data'].billing_address['email'],
            BillingCustomerName: txnData['data'].billing_address['first_name'],
            BillingAddress: txnData['data'].billing_address['address_line_1'],
            BillingCity: txnData['data'].billing_address['city'],
            BillingState: txnData['data'].billing_address['state'],
            BillingPostalCode: txnData['data'].billing_address['postal_code'],
            BillingCountry: txnData['data'].billing_address['country'],
            BillingCountryCode: req.body.BillingCountryCode,
            BillingPhoneNumber: txnData['data'].billing_address['phone'],
            IsShippingSame: req.body.shippingSameAsBilling,
            ShippingEmail: txnData['data'].billing_address['email'],
            ShippingCustomerName:
            transactionId.ShippingCustomerName,
            ShippingAddress: txnData['data'].billing_address['address_line_1'],
            ShippingCity: txnData['data'].billing_address['city'],
            ShippingState: txnData['data'].shipping_address['state'],
            ShippingPostalCode: txnData['data'].billing_address['postal_code'],
            ShippingCountry: txnData['data'].shipping_address['country'],
            ShippingPhoneNumber: txnData['data'].billing_address['phone'],
            ExpiryDate: transactionId.ExpiryDate,
            Cvv: transactionId.Cvv,
            ConvenienceFeeValue: transactionId.ConvenienceFeeValue,
            ConvenienceFeeMinimum: transactionId.ConvenienceFeeMinimum,
            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
            AuthCode: txnData['data'].response_body['card'].auth_code,
            TransactionGateWay: 'FluidPay',
            Refund: true,
            Void: false,
            Capture: false,
            Tokenization: false, // req.body.PaymentTokenization,
            Message: transactionId.Message,
            Description: transactionId.Description,
            ReferenceNo: transactionId.ReferenceNo,
            ConvenienceFeeActive:
              minmumTxn != ''
                ? minmumTxn
                : userGateWayData.ConvenienceFeeActive,
            RequestOrigin: transactionId.RequestOrigin,
            createdAt: txnData['data'].created_at,
            updatedAt: txnData['data'].updated_at,
            SettledDate: txnData['data'].settled_at,
            ProcessorId: txnData['data'].response_body.card.processor_id,
            SuggestedMode:
              transactionId.SuggestedMode,
            TipAmount: transactionId.TipAmount,
          }
        )

        
        // const updateTransaction = await models.Transaction.update(
        //   {
        //     Refund: true,
        //     TransactionId: transData.id,
        //   },
        //   {
        //     where: {
        //       id: transactionId.id,
        //     },
        //   }
        // );
        const newTxn = {
          Amount: transData.amount / 100,
          UserId: userInfo.id,
          TransactionId: transactionId.id,
          NewTransactionId: transData.id,
          PaymentType: 5,
          Status: 3,
          GatewayType: transactionId.TransactionGateWay,
          PrevTransactionId: transData.referenced_transaction_id,
        };

        let instert = await models.RefundVoidCaptureTable.create(newTxn);
        res.status(200).json({
          message: 'Transaction Refund Initiated Successfully',
          data: JSON.parse(JSON.stringify(data)),
        });
      } else {
        res.status(500).json({
          message: data.msg,
        });
      }
    } else {
      let message = '';
      if (transactionId.Type == '2') {
        message = 'This is a Auth transaction. Cannot apply refund';
      } else {
        message = 'The Transaction is not yet setteled';
      }
      res.status(400).json({ message: message });
    }
  } else {
    return res.status(400).json({ message: 'Invalid data' });
  }
};

//To convert Auth Txn to Sale Txn done through FluidPay
exports.fluidCaptureTransactions = async (
  req,
  userIdData,
  userGateWayData,
  transactionId,
  res
) => {
  try {
    const txnData = await exports.getTxnFromFluidPay(
      req.body.TransactionId,
      userGateWayData.GatewayApiKey
    );

    if (
      req.body.TransactionId != undefined &&
      req.body.MerchantId != undefined
    ) {
      const txntype = exports.TransactionType(req.body.TransactionFor);

      const requestHeader = {
        'Content-Type': 'application/json',
        Authorization: userGateWayData.GatewayApiKey,
      };

      let requestOptions = {
        method: 'POST',
        headers: requestHeader,
        body: JSON.stringify({ amount: txnData['data'].amount }),
      };

      if (
        txnData['data'].status == 'pending_settlement' ||
        txnData['data'].status == 'authorized'
      ) {
        const requestCreated = {
          GatewayType: userGateWayData.GatewayType,
          Request: requestOptions,
          Response: '',
          MerchantId: userIdData.id,
        };
        await models.ResponseRequestTable.create(requestCreated);

        const response = await fetch(
          `${process.env.FLUIDPAY_API_URL}/api/transaction/${transactionId.TransactionId}/capture`,
          requestOptions
        );
        const data = await response.json();
        const captureResponse = {
          GatewayType: userGateWayData.GatewayType,
          Request: requestOptions,
          Response: data,
          MerchantId: userIdData.id,
        };
        await models.ResponseRequestTable.create(captureResponse);
        if (data.status === 'success') {
          const transData = data['data'];
          const RequestResponse = {
            GatewayType: userGateWayData.GatewayType,
            Request: requestOptions,
            Response: data,
            MerchantId: userIdData.id,
          };
          const resCreated = await models.ResponseRequestTable.create(
            RequestResponse
          );
          const updateTransaction = await models.Transaction.update(
            {
              Capture: true,
              TransactionId: transData.id,
              Status: 3,
              Type: '1',
            },
            {
              where: {
                id: transactionId.id,
              },
            }
          );
          const newTxn = {
            Amount: transData.amount / 100,
            UserId: userIdData.id,
            TransactionId: transactionId.id,
            NewTransactionId: transData.id,
            PaymentType: 3,
            Status: 0,
            GatewayType: transactionId.TransactionGateWay,
            PrevTransactionId: transData.id,
          };

          let instert = await models.RefundVoidCaptureTable.create(newTxn);
          res.status(200).json({
            message: 'Transaction Capture Initiated Successfully',
            data: JSON.parse(JSON.stringify(data)),
          });
        } else {
          res.status(500).json({
            message: data.msg,
          });
        }
      } else {
        res.status(500).json({
          message: 'This is Sale transaction.Cannot apply capture',
        });
      }
    } else {
      return res.status(400).json({ message: 'Invalid data' });
    }
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).json({
      message: 'Something went wrong',
      error: err,
    });
  }
};

//To reverse/void a Txn done through Payrix
exports.fluidVoidTransactions = async (
  req,
  userIdData,
  userGateWayData,
  transactionId,
  res
) => {
  try {
    const txnData = await exports.getTxnFromFluidPay(
      req.body.TransactionId,
      userGateWayData.GatewayApiKey
    );

    if (
      req.body.TransactionId != undefined &&
      req.body.MerchantId != undefined
    ) {
      const txntype = exports.TransactionType(req.body.TransactionFor);

      const requestHeader = {
        'Content-Type': 'application/json',
        Authorization: userGateWayData.GatewayApiKey,
      };

      let requestOptions = {
        method: 'POST',
        headers: requestHeader,
      };

      if (
        txnData['data'].status == 'pending_settlement' ||
        txnData['data'].status == 'authorized'
      ) {
        const requestCreated = {
          GatewayType: userGateWayData.GatewayType,
          Request: requestOptions,
          Response: '',
          MerchantId: userIdData.id,
        };
        await models.ResponseRequestTable.create(requestCreated);

        const response = await fetch(
          `${process.env.FLUIDPAY_API_URL}/api/transaction/${transactionId.TransactionId}/void`,
          requestOptions
        );
        const data = await response.json();
        const RequestResponse = {
          GatewayType: userGateWayData.GatewayType,
          Request: requestOptions,
          Response: data,
          MerchantId: userIdData.id,
        };
        const resCreated = await models.ResponseRequestTable.create(
          RequestResponse
        );
        if (data.status === 'success') {
          const transData = data['data'];

          const updateTransaction = await models.Transaction.update(
            {
              Void: true,
              TransactionId: transData.id,
            },
            {
              where: {
                id: transactionId.id,
              },
            }
          );
          const newTxn = {
            Amount: transData.amount / 100,
            UserId: userIdData.id,
            TransactionId: transactionId.id,
            NewTransactionId: transData.id,
            PaymentType: 4,
            Status: 1,
            GatewayType: transactionId.TransactionGateWay,
            PrevTransactionId: transData.id,
          };

          let instert = await models.RefundVoidCaptureTable.create(newTxn);
          res.status(200).json({
            message: 'Transaction Void Initiated Successfully',
            data: JSON.parse(JSON.stringify(data)),
          });
        } else {
          res.status(500).json({
            message: data.msg,
          });
        }
      } else {
        res.status(500).json({
          message: 'This transaction was already Captured.Cannot apply void',
        });
      }
    } else {
      return res.status(400).json({ message: 'Invalid data' });
    }
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).json({
      message: 'Something went wrong',
      error: err,
    });
  }
};

exports.getTxnFromFluidPay = async (txnId, privateKey) => {
  try {
    const requestHeader = {
      'Content-Type': 'application/json',
      Authorization: privateKey,
    };
    const requestOptions = {
      method: 'GET',
      headers: requestHeader,
    };
    const response = await fetch(
      `${process.env.FLUIDPAY_API_URL}/api/transaction/${txnId}`,
      requestOptions
    );
    const data = await response.json();

    if (data.status === 'success') {
      return data;
    } else {
      res.status(500).json({
        message: data.status,
      });
    }
  } catch (err) {
    Sentry.captureException(err);
    console.log(err.message);
    // res.status(500).json({
    //   message: 'Something went wrong',
    //   error: err,
    // });
  }
};

exports.nonQualifiedSingleUpdate = async (req, res) => {
  try {
    let findTxn = '';
    if (req.params.id != undefined) {
      findTxn = await models.Transaction.findOne({
        where: { UUID: req.params.id },
      });

      if (findTxn != null) {
        const updateTxn = await models.Transaction.update(
          { NonQualified: true },
          {
            where: { id: findTxn.id },
          }
        );
        res.status(200).json({
          message: 'Tranasaction marked as Non-Qualified',
        });
      } else {
        res.status(400).json({
          message: 'Tranasaction not found for update',
        });
      }
    } else {
      Sentry.captureException('Tranasaction Id missing for update');
      res.status(400).json({
        message: 'Tranasaction Id missing for update',
      });
    }
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).json({
      message: 'Something went wrong',
      error: err,
    });
  }
};

// exports.updateTransactionStatus = async (req, res) => {
//   console.log('cron started for status update FP');
//   try {
//     let successArray = [];
//     let failArray = [];
//     const findAllTxn = await models.Transaction.findAll({
//       attributes: ['id', 'TransactionId', 'MerchantId'],
//       where: {
//         Type: { [Op.eq]: '1' },
//         Status: {
//           [Op.in]: ['4'],
//         },
//         MerchantId: {
//           // [Op.in]: ['21', '15', '24', '7', '25', '22'],
//           [Op.in]: ['21'],
//         },
//         SettledDate: {
//           [Op.between]: [
//             '2022-07-01T00:00:00.000Z',
//             '2022-07-10T23:59:59.999Z',
//           ],
//         },
//         TransactionGateWay: {
//           [Op.eq]: 'FluidPay',
//         },
//         // TransactionId: {
//         //   [Op.eq]: 'cbgt9ms6lr8tdmjelgl0',
//         // },
//       },
//       // limit: 1,
//       // ororder: [['id', 'desc']],
//     });

//     for (let j = 0; j < findAllTxn.length; j++) {
//       const findApi = await models.MerchantPaymentGateWay.findOne({
//         where: {
//           UserId: findAllTxn[j].MerchantId,
//           GatewayType: {
//             [Op.eq]: 'FluidPay',
//           },
//         },
//       });
//       findAllTxn[j].setDataValue('Apikey', findApi.GatewayApiKey);
//     }

//     for (let i = 0; i < findAllTxn.length; i++) {
//       let setteledAt = '';
//       const requestHeader = {
//         'Content-Type': 'application/json',
//         Authorization: findAllTxn[i].dataValues.Apikey,
//       };
//       const requestOptions = {
//         method: 'GET',
//         headers: requestHeader,
//       };
//       const response = await fetch(
//         `${process.env.FLUIDPAY_API_URL}/api/transaction/${findAllTxn[i].dataValues.TransactionId}`,
//         requestOptions
//       );
//       const data = await response.json();
//       if (data.status === 'success') {
//         if (data['data'].status == 'settled') {
//           data['data'].status = '4';
//           if (data['data'].settled_at != null) {
//             setteledAt = moment(data['data'].settled_at).format(
//               'YYYY-MM-DD HH:mm:ss'
//             );
//           }
//           let updateValues = {
//             Status: data['data'].status,
//             SettledDate: setteledAt,
//             updatedAt: moment(data['data'].updated_at).format(
//               'YYYY-MM-DD HH:mm:ss'
//             ),
//           };
//           await models.Transaction.update(updateValues, {
//             where: { id: findAllTxn[i].id },
//           })
//             .then(async (result) => {
//               console.log(result, findAllTxn[i].TransactionId);
//               if (result[0] == 1)
//                 successArray.push(findAllTxn[i].TransactionId);
//               else failArray.push(findAllTxn[i].TransactionId);
//             })
//             .catch(async (err) => {
//               console.log(err, findAllTxn[i].TransactionId);
//             });
//         }
//       }
//     }
//     return res.status(200).json({ data: successArray, data2: failArray });
//   } catch (err) {
//     Sentry.captureException(err);
//     return res.status(401).json({ message: err.message });
//   }

exports.userGateways = async (req, userInfo, res) => {
  try {
    let total = '';
    let feeAmount = '';
    let minmumTxn = '';
    let userLevel = userInfo.UserLevel;
    let userGateWayData = '';
    if (req.body.PaymentLinkId == undefined) {
      userGateWayData = await models.MerchantPaymentGateWay.findOne({
        where: {
          [Op.and]: [
            { UserId: userInfo.id },
            { SuggestedMode: 'Card' },
            { GatewayStatus: true },
            { ConvenienceFeeActive: req.body.ConvenienceFeeActive },
          ],
        },
      });

      if (
        req.body.ConvenienceFeeActive === true &&
        userGateWayData.GatewayType == 'FluidPay' &&
        userLevel == 'Level1'
      ) {
        userGateWayData = await models.MerchantPaymentGateWay.findOne({
          where: {
            [Op.and]: [
              { UserId: userInfo.id },
              { SuggestedMode: 'Card' },
              { GatewayStatus: true },
              { ConvenienceFeeActive: req.body.ConvenienceFeeActive },
            ],
          },
        });
        feeAmount = parseFloat(
          exports.getConvenienceFee(
            req.body.Amount,
            userGateWayData.ConvenienceFeeValue,
            userGateWayData.ConvenienceFeeType,
            userGateWayData.ConvenienceFeeMinimum
          )
        );
        total =
          parseFloat(req.body.Amount) +
          parseFloat(feeAmount) +
          parseFloat(req.body.TipAmount);
      } else if (
        req.body.ConvenienceFeeActive === true &&
        userGateWayData.ConvenienceFeeActive === true &&
        userGateWayData.GatewayType == 'FluidPay' &&
        (userLevel == 'Level2' || userLevel == 'Level3')
      ) {
        userGateWayData = await models.MerchantPaymentGateWay.findOne({
          where: {
            [Op.and]: [
              { UserId: userInfo.id },
              { SuggestedMode: 'Card' },
              { GatewayStatus: true },
              { ConvenienceFeeActive: req.body.ConvenienceFeeActive },
            ],
          },
        });
        feeAmount = parseFloat(
          exports.getConvenienceFee(
            req.body.Amount,
            userGateWayData.ConvenienceFeeValue,
            userGateWayData.ConvenienceFeeType,
            userGateWayData.ConvenienceFeeMinimum
          )
        );
        total =
          parseFloat(req.body.Amount) +
          parseFloat(feeAmount) +
          parseFloat(req.body.TipAmount);
        if (
          parseFloat(feeAmount) <=
            parseFloat(userGateWayData.ConvenienceFeeMinimum) &&
          userGateWayData.ConvenienceFeeType != 'Fixed'
        ) {
          minmumTxn = true;
          userGateWayData = await models.MerchantPaymentGateWay.findOne({
            where: {
              [Op.and]: [
                { UserId: userInfo.id },
                { SuggestedMode: 'Card' },
                { GatewayStatus: true },
                { ProcessorLevel: 'QuantumB' },
              ],
            },
          });
          if (userGateWayData == null) {
            userGateWayData = await models.MerchantPaymentGateWay.findOne({
              where: {
                [Op.and]: [
                  { UserId: userInfo.id },
                  { SuggestedMode: 'Card' },
                  { GatewayStatus: true },
                  { ConvenienceFeeActive: req.body.ConvenienceFeeActive },
                ],
              },
            });
          }
        } else {
          userGateWayData = await models.MerchantPaymentGateWay.findOne({
            where: {
              [Op.and]: [
                { UserId: userInfo.id },
                { SuggestedMode: 'Card' },
                { GatewayStatus: true },
                { ConvenienceFeeActive: req.body.ConvenienceFeeActive },
              ],
            },
          });
        }
      } else if (
        req.body.ConvenienceFeeActive === false &&
        userGateWayData.ConvenienceFeeActive === false &&
        userGateWayData.GatewayType == 'FluidPay' &&
        (userLevel == 'Level2' || userLevel == 'Level3')
      ) {
        feeAmount = parseFloat(0);
        minmumTxn = false;
        total = parseFloat(req.body.Amount) + parseFloat(req.body.TipAmount);
        userGateWayData = await models.MerchantPaymentGateWay.findOne({
          where: {
            [Op.and]: [
              { UserId: userInfo.id },
              { SuggestedMode: 'Card' },
              { GatewayStatus: true },
              { ProcessorLevel: 'QuantumB' },
            ],
          },
        });
      } else if (
        req.body.ConvenienceFeeActive === true &&
        userGateWayData.ConvenienceFeeActive === true &&
        userGateWayData.GatewayType == 'Authorizenet'
      ) {
        userGateWayData = await models.MerchantPaymentGateWay.findOne({
          where: {
            [Op.and]: [
              { UserId: userInfo.id },
              { SuggestedMode: 'Card' },
              { GatewayStatus: true },
              { ConvenienceFeeActive: req.body.ConvenienceFeeActive },
            ],
          },
        });
        feeAmount = parseFloat(
          exports.getConvenienceFee(
            req.body.Amount,
            userGateWayData.ConvenienceFeeValue,
            userGateWayData.ConvenienceFeeType,
            userGateWayData.ConvenienceFeeMinimum
          )
        );
        total =
          parseFloat(req.body.Amount) +
          parseFloat(feeAmount) +
          parseFloat(req.body.TipAmount);
      } else {
        feeAmount = parseFloat(0);
        minmumTxn = false;
        total = parseFloat(req.body.Amount) + parseFloat(req.body.TipAmount);
        userGateWayData = await models.MerchantPaymentGateWay.findOne({
          where: {
            [Op.and]: [
              { UserId: userInfo.id },
              { SuggestedMode: 'Card' },
              { GatewayStatus: true },
              { ConvenienceFeeActive: req.body.ConvenienceFeeActive },
            ],
          },
        });
      }
    } else {
      const checkFeeActive = await models.PaymentLink.findOne({
        where: { UUID: req.body.PaymentLinkId },
      });

      userGateWayData = await models.MerchantPaymentGateWay.findOne({
        where: {
          [Op.and]: [
            { UserId: userInfo.id },
            { SuggestedMode: 'Card' },
            { GatewayStatus: true },
            { ConvenienceFeeActive: checkFeeActive.ConvenienceFeeActive },
          ],
        },
      });

      if (
        checkFeeActive.ConvenienceFeeActive === true &&
        userGateWayData.GatewayType == 'FluidPay' &&
        userLevel == 'Level1'
      ) {
        userGateWayData = await models.MerchantPaymentGateWay.findOne({
          where: {
            [Op.and]: [
              { UserId: userInfo.id },
              { SuggestedMode: 'Card' },
              { GatewayStatus: true },
              { ConvenienceFeeActive: checkFeeActive.ConvenienceFeeActive },
            ],
          },
        });
        feeAmount = parseFloat(
          exports.getConvenienceFee(
            req.body.Amount,
            userGateWayData.ConvenienceFeeValue,
            userGateWayData.ConvenienceFeeType,
            userGateWayData.ConvenienceFeeMinimum
          )
        );
        total =
          parseFloat(req.body.Amount) +
          parseFloat(feeAmount) +
          parseFloat(req.body.TipAmount);
      } else if (
        checkFeeActive.ConvenienceFeeActive === true &&
        userGateWayData.ConvenienceFeeActive === true &&
        userGateWayData.GatewayType == 'FluidPay' &&
        (userLevel == 'Level2' || userLevel == 'Level3')
      ) {
        userGateWayData = await models.MerchantPaymentGateWay.findOne({
          where: {
            [Op.and]: [
              { UserId: userInfo.id },
              { SuggestedMode: 'Card' },
              { GatewayStatus: true },
              { ConvenienceFeeActive: checkFeeActive.ConvenienceFeeActive },
            ],
          },
        });
        feeAmount = parseFloat(
          exports.getConvenienceFee(
            req.body.Amount,
            userGateWayData.ConvenienceFeeValue,
            userGateWayData.ConvenienceFeeType,
            userGateWayData.ConvenienceFeeMinimum
          )
        );
        total =
          parseFloat(req.body.Amount) +
          parseFloat(feeAmount) +
          parseFloat(req.body.TipAmount);
        if (
          parseFloat(feeAmount) <=
            parseFloat(userGateWayData.ConvenienceFeeMinimum) &&
          userGateWayData.ConvenienceFeeType != 'Fixed'
        ) {
          minmumTxn = true;
          userGateWayData = await models.MerchantPaymentGateWay.findOne({
            where: {
              [Op.and]: [
                { UserId: userInfo.id },
                { SuggestedMode: 'Card' },
                { GatewayStatus: true },
                { ProcessorLevel: 'QuantumB' },
              ],
            },
          });
          if (userGateWayData == null) {
            userGateWayData = await models.MerchantPaymentGateWay.findOne({
              where: {
                [Op.and]: [
                  { UserId: userInfo.id },
                  { SuggestedMode: 'Card' },
                  { GatewayStatus: true },
                  { ConvenienceFeeActive: checkFeeActive.ConvenienceFeeActive },
                ],
              },
            });
          }
        } else {
          userGateWayData = await models.MerchantPaymentGateWay.findOne({
            where: {
              [Op.and]: [
                { UserId: userInfo.id },
                { SuggestedMode: 'Card' },
                { GatewayStatus: true },
                { ConvenienceFeeActive: checkFeeActive.ConvenienceFeeActive },
              ],
            },
          });
        }
      } else if (
        checkFeeActive.ConvenienceFeeActive === false &&
        userGateWayData.ConvenienceFeeActive === false &&
        userGateWayData.GatewayType == 'FluidPay' &&
        (userLevel == 'Level2' || userLevel == 'Level3')
      ) {
        feeAmount = parseFloat(0);
        minmumTxn = false;
        total = parseFloat(req.body.Amount) + parseFloat(req.body.TipAmount);
        userGateWayData = await models.MerchantPaymentGateWay.findOne({
          where: {
            [Op.and]: [
              { UserId: userInfo.id },
              { SuggestedMode: 'Card' },
              { GatewayStatus: true },
              { ProcessorLevel: 'QuantumB' },
            ],
          },
        });
      } else if (
        checkFeeActive.ConvenienceFeeActive === true &&
        userGateWayData.ConvenienceFeeActive === true &&
        userGateWayData.GatewayType == 'Authorizenet'
      ) {
        userGateWayData = await models.MerchantPaymentGateWay.findOne({
          where: {
            [Op.and]: [
              { UserId: userInfo.id },
              { SuggestedMode: 'Card' },
              { GatewayStatus: true },
              { ConvenienceFeeActive: checkFeeActive.ConvenienceFeeActive },
            ],
          },
        });
        feeAmount = parseFloat(
          exports.getConvenienceFee(
            req.body.Amount,
            userGateWayData.ConvenienceFeeValue,
            userGateWayData.ConvenienceFeeType,
            userGateWayData.ConvenienceFeeMinimum
          )
        );
        total =
          parseFloat(req.body.Amount) +
          parseFloat(feeAmount) +
          parseFloat(req.body.TipAmount);
      } else {
        feeAmount = parseFloat(0);
        minmumTxn = false;
        total = parseFloat(req.body.Amount) + parseFloat(req.body.TipAmount);
        userGateWayData = await models.MerchantPaymentGateWay.findOne({
          where: {
            [Op.and]: [
              { UserId: userInfo.id },
              { SuggestedMode: 'Card' },
              { GatewayStatus: true },
              { ConvenienceFeeActive: checkFeeActive.ConvenienceFeeActive },
            ],
          },
        });
      }
    }
    return [userGateWayData, total, feeAmount, minmumTxn];
  } catch (err) {
    Sentry.captureException(err);
    return res.status(401).json({ message: err.message });
  }
};

//To process a Token Txn via Payrix
exports.processPayrixTknTxn = async (req, res) => {
  const delay = (ms = 4000) => new Promise((r) => setTimeout(r, ms));
  let token = '';
  let FeeValue = '',
    total = '';
  let decoded = '';
  let transaction = '';
  if (req.body.MerchantId != undefined) {
    decoded = {};
    decoded.UUID = req.body.MerchantId;
  } else {
    token = req.headers.authorization.split(' ');
    decoded = jwt.verify(token[1], process.env.JWT_SECRET);
  }
  const userIdData = await models.User.findOne({
    where: {
      UUID: decoded.UUID,
    },
  });
  const userGateWayData = await models.MerchantPaymentGateWay.findOne({
    where: {
      [Op.and]: [
        { UserId: userIdData.id },
        { SuggestedMode: 'Card' },
        { GatewayStatus: true },
      ],
    },
  });

  const customerData = await models.Customer.findOne({
    where: {
      GatewayCustomerId: req.body.GatewayCustomerId,
    },
  });

  const CardData = await models.CardTokens.findOne({
    where: {
      [Op.and]: [
        { GatewayCustomerId: req.body.GatewayCustomerId },
        { CustomerId: customerData.id },
      ],
    },
  });
  const checkFeeActive = await models.PaymentLink.findOne({
    where: { UUID: req.body.PaymentLinkId },
  });
  if (
    checkFeeActive.ConvenienceFeeActive == true &&
    userGateWayData.ConvenienceFeeActive == true
  ) {
    FeeValue = exports.getConvenienceFee(
      req.body.Amount,
      userGateWayData.ConvenienceFeeValue,
      userGateWayData.ConvenienceFeeType,
      userGateWayData.ConvenienceFeeMinimum
    );
    total =
      parseFloat(req.body.Amount) +
      parseFloat(FeeValue) +
      parseFloat(req.body.TipAmount);
  } else {
    FeeValue = null;
    total = parseFloat(req.body.Amount) + parseFloat(req.body.TipAmount);
  }
  if (FeeValue != null) {
    transaction = JSON.stringify({
      merchant: userGateWayData.GMerchantId,
      type: req.body.TransactionType,
      origin: '2',
      token: req.body.TokenId,
      expiration: '1223',
      total: Math.round(total * 100),
      fee: FeeValue != null ? Math.round(FeeValue * 100) : null,
    });
  } else {
    transaction = JSON.stringify({
      merchant: userGateWayData.GMerchantId,
      type: req.body.TransactionType,
      origin: '2',
      token: req.body.TokenId,
      expiration: '1223',
      total: Math.round(total * 100),
    });
  }
  const config = {
    method: 'post',
    url: `${process.env.PAYRIX_URL}/txns`,
    headers: {
      'Content-Type': 'application/json',
      APIKEY: userGateWayData.GatewayApiKey,
    },
    data: transaction,
  };

  return await axios(config)
    .then(async (response) => {
      const responseData = response.data; // if resp contains the data you will get it here.
      if (responseData.response.errors.length == 0) {
        let newConfig = {
          method: 'get',
          url: `${process.env.PAYRIX_URL}/txns/${responseData.response.data[0].id}`,
          headers: {
            'Content-Type': 'application/json',
            APIKEY: userGateWayData.GatewayApiKey,
          },
        };
        await delay();
        axios(newConfig).then(async (newResult) => {
          const data = newResult.data;
          if (
            data.response.data.length > 0 &&
            data.response.data[0].status != 2 &&
            data.response.errors.length == 0
          ) {
            const transData = data.response.data;
            const RequestResponse = {
              GatewayType: userGateWayData.GatewayType,
              Request: config,
              Response: data,
              CustomerId: customerData.id,
              MerchantId: userIdData.id,
            };
            models.ResponseRequestTable.create(RequestResponse).then(
              (resultData) => {
                const transactionData = {
                  CustomerId: customerData.id,
                  MerchantId: userIdData.id,
                  TransactionId: transData[0].id,
                  Amount: transData[0].total / 100,
                  GatewayCustomerId: req.body.GatewayCustomerId,
                  CardNumber: CardData.LastNumber,
                  PaymentMethod: CardData.CardBrand,
                  Type: transData[0].type,
                  Status: transData[0].status,
                  BillingEmail: transData[0].email,
                  BillingCustomerName: transData[0].first,
                  BillingAddress: transData[0].address1,
                  BillingCity: transData[0].city,
                  BillingState: customerData.StateId,
                  BillingPostalCode: transData[0].zip,
                  BillingCountry: customerData.CountryId,
                  BillingCountryCode: req.body.BillingCountryCode,
                  BillingPhoneNumber: transData[0].phone,
                  IsShippingSame: req.body.shippingSameAsBilling,
                  ShippingEmail: transData[0].email,
                  ShippingCustomerName: transData[0].first,
                  ShippingAddress: transData[0].address1,
                  ShippingCity: transData[0].city,
                  ShippingState: customerData.StateId,
                  ShippingPostalCode: transData[0].zip,
                  ShippingCountry: customerData.CountryId,
                  ShippingPhoneNumber: transData[0].phone,
                  ConvenienceFeeValue: transData[0].fee / 100,
                  ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
                  ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
                  AuthCode: transData[0].authorization,
                  TransactionGateWay: 'Payrix',
                  Refund: false,
                  Void: false,
                  Capture: false,
                  Tokenization: req.body.PaymentTokenization,
                  Message: req.body.Message,
                  Description: req.body.Description,
                  ReferenceNo: req.body.ReferenceNo,
                  ConvenienceFeeActive:
                    checkFeeActive.ConvenienceFeeActive == true &&
                    userGateWayData.ConvenienceFeeActive == true
                      ? true
                      : false,
                  RequestOrigin: req.body.RequestOrigin,
                  createdAt: transData[0].created,
                  updatedAt: transData[0].modified,
                  SuggestedMode:
                    req.body.SuggestedMode != undefined
                      ? req.body.SuggestedMode
                      : 'Card',
                  TipAmount: parseFloat(req.body.TipAmount),
                };
                models.Transaction.create(transactionData).then(async (trs) => {
                  const Transaction = trs;
                  await exports.sendWebHook(
                    undefined,
                    Transaction,
                    req.body.PaymentLinkId,
                    userIdData.id
                  );
                  return res.status(200).json({
                    message: 'Transaction Completed Successfully',
                    data: JSON.parse(JSON.stringify(trs)),
                  });
                });
              }
            );
          } else if (
            data.response.data.length > 0 &&
            data.response.data[0].status == 2 &&
            data.response.errors.length == 0
          ) {
            const transData = data.response.data;
            const transErrors = data.response.errors[0].msg;
            const RequestResponse = {
              GatewayType: userGateWayData.GatewayType,
              Request: config,
              Response: data,
              CustomerId: customerData.id,
              MerchantId: userIdData.id,
            };
            models.ResponseRequestTable.create(RequestResponse).then(
              (resultData) => {
                const transactionData = {
                  CustomerId: customerData.id,
                  MerchantId: userIdData.id,
                  TransactionId: transData[0].id,
                  Amount: transData[0].total / 100,
                  // parseFloat(transData[0].total / 100) -
                  // parseFloat(transData[0].fee / 100),
                  GatewayCustomerId: req.body.GatewayCustomerId,
                  CardNumber: CardData.LastNumber,
                  PaymentMethod: CardData.CardBrand,
                  Type: transData[0].type,
                  Status: transData[0].status,
                  BillingEmail: transData[0].email,
                  BillingCustomerName: transData[0].first,
                  BillingAddress: transData[0].address1,
                  BillingCity: transData[0].city,
                  BillingState: customerData.StateId,
                  BillingPostalCode: transData[0].zip,
                  BillingCountry: customerData.CountryId,
                  BillingCountryCode: req.body.BillingCountryCode,
                  BillingPhoneNumber: transData[0].phone,
                  IsShippingSame: req.body.shippingSameAsBilling,
                  ShippingEmail: transData[0].email,
                  ShippingCustomerName: transData[0].first,
                  ShippingAddress: transData[0].address1,
                  ShippingCity: transData[0].city,
                  ShippingState: customerData.StateId,
                  ShippingPostalCode: transData[0].zip,
                  ShippingCountry: customerData.CountryId,
                  ShippingPhoneNumber: transData[0].phone,
                  ConvenienceFeeValue: transData[0].fee / 100,
                  ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
                  ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
                  AuthCode: transData[0].authorization,
                  TransactionGateWay: 'Payrix',
                  Refund: false,
                  Void: false,
                  Capture: false,
                  Tokenization: req.body.PaymentTokenization,
                  Message: req.body.Message,
                  Description: req.body.Description,
                  ReferenceNo: req.body.ReferenceNo,
                  ConvenienceFeeActive:
                    checkFeeActive.ConvenienceFeeActive == true &&
                    userGateWayData.ConvenienceFeeActive == true
                      ? true
                      : false,
                  RequestOrigin: req.body.RequestOrigin,
                  createdAt: transData[0].created,
                  updatedAt: transData[0].modified,
                  SuggestedMode:
                    req.body.SuggestedMode != undefined
                      ? req.body.SuggestedMode
                      : 'Card',
                  TipAmount: parseFloat(req.body.TipAmount),
                };
                models.Transaction.create(transactionData).then(async (trs) => {
                  const Transaction = trs;
                  if (req.body.PaymentLinkId != undefined) {
                    await exports.sendWebHook(
                      transErrors,
                      Transaction,
                      req.body.PaymentLinkId,
                      userIdData.id
                    );
                    res.status(200).json({
                      message: `Transaction Failed due to ${transErrors}`,
                      data: JSON.parse(JSON.stringify(trs)),
                    });
                  } else {
                    res.status(200).json({
                      message: `Transaction Failed due to ${transErrors}`,
                      data: JSON.parse(JSON.stringify(trs)),
                    });
                  }
                });
              }
            );
          } else if (
            data.response.data.length == 0 &&
            data.response.errors.length > 0
          ) {
            Sentry.captureException(data.response.errors[0].msg);
            return res.status(500).json({
              message: `${data.response.errors[0].msg}`,
            });
          }
        });
      } else {
        Sentry.captureException(responseData.response.errors[0].msg);
        return res.status(500).json({
          message: `${responseData.response.errors[0].msg}`,
        });
      }
    })
    .catch((err) => {
      Sentry.captureException(err);
      res.status(400).json({
        message: 'Something went wrong',
        error: err.response.data,
        errorStack: err,
      });
    });
};

exports.tokenTransactions = async (req, res) => {
  let token = '';
  let decoded = '';
  if (req.body.MerchantId != undefined) {
    decoded = {};
    decoded.UUID = req.body.MerchantId;
  } else {
    token = req.headers.authorization.split(' ');
    decoded = jwt.verify(token[1], process.env.JWT_SECRET);
  }
  try {
    let userGateWayData = '',
      FluidPayAcc = '';
    const userInfo = await models.User.findOne({
      where: {
        UUID: decoded.UUID,
      },
    });

    const userLevel = userInfo.UserLevel;
    const findGateWay = await exports.userGateways(req, userInfo, res);

    let gateWay = findGateWay[0].GatewayType;
    if (gateWay == 'Payrix') {
      return exports.processPayrixTknTxn(req, userInfo, findGateWay[0], res);
    } else if (
      gateWay == 'FluidPay' &&
      (userLevel == 'Level1' || userLevel == 'Level2')
    ) {
      return exports.processFluidLOneTwoTknTxn(
        req,
        userInfo,
        findGateWay[0],
        findGateWay[1],
        findGateWay[2],
        findGateWay[3],
        res
      );
    } else if (gateWay == 'FluidPay' && userLevel == 'Level3') {
      return exports.processFluidLThreeTknTxn(
        req,
        userInfo,
        findGateWay[0],
        findGateWay[1],
        findGateWay[2],
        findGateWay[3],
        res
      );
    }
  } catch (err) {
    Sentry.captureException(err);
    res.status(400).json({
      message: err.message,
    });
  }
};

exports.processFluidLOneTwoTknTxn = async (
  req,
  userInfo,
  userGateWayData,
  total,
  feeAmount,
  minmumTxn,
  res
) => {
  try {
    let stateData = '';
    let countryData = '';
    const customerExist = await models.Customer.findOne({
      where: {
        [Op.and]: [
          { GatewayCustomerId: req.body.GatewayCustomerId },
          { UserId: userInfo.id },
        ],
      },
    });
    const requestHeader = {
      'Content-Type': 'application/json',
      Authorization: userGateWayData.GatewayApiKey,
    };
    if (req.body.PaymentLinkId == undefined) {
      transaction = {
        type: req.body.TransactionType == '1' ? 'sale' : 'authorize',
        amount: Math.round(total * 100),
        currency: 'USD',
        email_receipt: false,
        email_address: req.body.BillingEmail,
        processor_id: userGateWayData.ProcessorId,
        payment_method: {
          customer: {
            id: req.body.GatewayCustomerId,
            payment_method_type: 'card',
            payment_method_id: req.body.PaymentId,
          },
        },
      };

      const jsonString = JSON.stringify(transaction);
      const requestOptions = {
        method: 'POST',
        headers: requestHeader,
        body: jsonString,
        redirect: 'follow',
      };
      const requestCreated = {
        GatewayType: userGateWayData.GatewayType,
        Request: requestOptions,
        Response: '',
        MerchantId: userInfo.id,
      };
      await models.ResponseRequestTable.create(requestCreated);
      const response = await fetch(
        `${process.env.FLUIDPAY_API_URL}/api/transaction`,
        requestOptions
      );
      const data = await response.json();
      const responseInsert = {
        GatewayType: userGateWayData.GatewayType,
        Request: requestOptions,
        Response: data,
        MerchantId: userInfo.id,
      };
      const responseId = await models.ResponseRequestTable.create(
        responseInsert
      );
      if (data.status === 'success') {
        const findCustomer = await models.Customer.findOne({
          where: {
            [Op.and]: [
              { GatewayCustomerId: req.body.GatewayCustomerId },
              { UserId: userInfo.id },
            ],
          },
        });

        await models.ResponseRequestTable.update(
          { CustomerId: findCustomer.id },
          { where: { id: responseId.id } }
        );
        const paymentMethods = exports.fluidPayCardBrands(
          data['data'].response_body['card'].card_type
        );
        if (
          data['data'].status == 'pending_settlement' ||
          data['data'].status == 'authorized' ||
          data['data'].status == 'voided'
        ) {
          data['data'].status = '1';
          const transactionInsert = {
            CustomerId: findCustomer.id,
            MerchantId: userInfo.id,
            TransactionId: data['data'].id,
            Amount: data['data'].amount / 100,
            CardNumber: data['data'].response_body['card'].last_four,
            PaymentMethod: paymentMethods,
            Type: req.body.TransactionType,
            Status: data['data'].status,
            BillingEmail: data['data'].billing_address['email'],
            BillingCustomerName: data['data'].billing_address['first_name'],
            BillingAddress: data['data'].billing_address['address_line_1'],
            BillingCity: data['data'].billing_address['city'],
            BillingState: stateData != undefined ? stateData.id : null,
            BillingPostalCode: data['data'].billing_address['postal_code'],
            BillingCountry: countryData != undefined ? countryData.id : null,
            BillingCountryCode: req.body.BillingCountryCode,
            BillingPhoneNumber: data['data'].billing_address['phone'],
            IsShippingSame: req.body.shippingSameAsBilling,
            ShippingEmail: data['data'].billing_address['email'],
            ShippingCustomerName: data['data'].billing_address['first_name'],
            ShippingAddress: data['data'].billing_address['address_line_1'],
            ShippingCity: data['data'].billing_address['city'],
            ShippingState: stateData != undefined ? stateData.id : null,
            ShippingPostalCode: data['data'].billing_address['postal_code'],
            ShippingCountry: countryData != undefined ? countryData.id : null,
            ShippingPhoneNumber: data['data'].billing_address['phone'],
            ExpiryDate: req.body.Expiration.replace(/\s/g, '').replace(
              /\\|\//g,
              ''
            ),
            Cvv: req.body.Cvv,
            ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
            AuthCode: data['data'].response_body['card'].auth_code,
            TransactionGateWay: 'FluidPay',
            Refund: false,
            Void: false,
            Capture: false,
            Tokenization: req.body.PaymentTokenization,
            Message: req.body.Message,
            Description: req.body.Description,
            ReferenceNo: req.body.ReferenceNo,
            ConvenienceFeeActive:
              minmumTxn != ''
                ? minmumTxn
                : userGateWayData.ConvenienceFeeActive,
            RequestOrigin: req.body.RequestOrigin,
            createdAt: data['data'].created_at,
            updatedAt: data['data'].updated_at,
            ProcessorId: userGateWayData.ProcessorId,
            SuggestedMode:
              req.body.SuggestedMode != undefined
                ? req.body.SuggestedMode
                : 'Card',
            TipAmount: parseFloat(req.body.TipAmount),
          };
          const transData = await models.Transaction.create(transactionInsert);

          return res.status(200).json({
            message: 'Transaction Processed Successfully',
            data: JSON.parse(JSON.stringify(transData)),
          });
        } else if (data['data'].status == 'declined') {
          data['data'].status = '9';
          const transactionInsert = {
            CustomerId: findCustomer.id,
            MerchantId: userInfo.id,
            TransactionId: data['data'].id,
            Amount: data['data'].amount / 100,
            CardNumber: data['data'].response_body['card'].last_four,
            PaymentMethod: paymentMethods,
            Type: req.body.TransactionType,
            Status: data['data'].status,
            BillingEmail: data['data'].billing_address['email'],
            BillingCustomerName: data['data'].billing_address['first_name'],
            BillingAddress: data['data'].billing_address['address_line_1'],
            BillingCity: data['data'].billing_address['city'],
            BillingState: stateData != undefined ? stateData.id : null,
            BillingPostalCode: data['data'].billing_address['postal_code'],
            BillingCountry: countryData != undefined ? countryData.id : null,
            BillingCountryCode: req.body.BillingCountryCode,
            BillingPhoneNumber: data['data'].billing_address['phone'],
            IsShippingSame: req.body.shippingSameAsBilling,
            ShippingEmail: data['data'].billing_address['email'],
            ShippingCustomerName: data['data'].billing_address['first_name'],
            ShippingAddress: data['data'].billing_address['address_line_1'],
            ShippingCity: data['data'].billing_address['city'],
            ShippingState: stateData != undefined ? stateData.id : null,
            ShippingPostalCode: data['data'].billing_address['postal_code'],
            ShippingCountry: countryData != undefined ? countryData.id : null,
            ShippingPhoneNumber: data['data'].billing_address['phone'],
            ExpiryDate: req.body.Expiration.replace(/\s/g, '').replace(
              /\\|\//g,
              ''
            ),
            Cvv: req.body.Cvv,
            ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
            AuthCode: data['data'].response_body['card'].auth_code,
            TransactionGateWay: 'FluidPay',
            Refund: false,
            Void: false,
            Capture: false,
            Tokenization: req.body.PaymentTokenization,
            Message: req.body.Message,
            Description: req.body.Description,
            ReferenceNo: req.body.ReferenceNo,
            ConvenienceFeeActive:
              minmumTxn != ''
                ? minmumTxn
                : userGateWayData.ConvenienceFeeActive,
            RequestOrigin: req.body.RequestOrigin,
            createdAt: data['data'].created_at,
            updatedAt: data['data'].updated_at,
            ProcessorId: userGateWayData.ProcessorId,
            SuggestedMode:
              req.body.SuggestedMode != undefined
                ? req.body.SuggestedMode
                : 'Card',
            TipAmount: parseFloat(req.body.TipAmount),
          };
          const transData = await models.Transaction.create(transactionInsert);

          return res.status(200).json({
            message: `Transaction declined due to ${data['data']['response_body']['card'].processor_response_text}`,
            data: JSON.parse(JSON.stringify(transData)),
          });
        } else if (
          data['data'].status == 'failed' ||
          data['data'].status == 'unknown'
        ) {
          data['data'].status = '2';
          const transactionInsert = {
            CustomerId: findCustomer.id,
            MerchantId: userInfo.id,
            TransactionId: data['data'].id,
            Amount: data['data'].amount / 100,
            CardNumber: data['data'].response_body['card'].last_four,
            PaymentMethod: paymentMethods,
            Type: req.body.TransactionType,
            Status: data['data'].status,
            BillingEmail: data['data'].billing_address['email'],
            BillingCustomerName: data['data'].billing_address['first_name'],
            BillingAddress: data['data'].billing_address['address_line_1'],
            BillingCity: data['data'].billing_address['city'],
            BillingState: stateData != undefined ? stateData.id : null,
            BillingPostalCode: data['data'].billing_address['postal_code'],
            BillingCountry: countryData != undefined ? countryData.id : null,
            BillingCountryCode: req.body.BillingCountryCode,
            BillingPhoneNumber: data['data'].billing_address['phone'],
            IsShippingSame: req.body.shippingSameAsBilling,
            ShippingEmail: data['data'].billing_address['email'],
            ShippingCustomerName: data['data'].billing_address['first_name'],
            ShippingAddress: data['data'].billing_address['address_line_1'],
            ShippingCity: data['data'].billing_address['city'],
            ShippingState: stateData != undefined ? stateData.id : null,
            ShippingPostalCode: data['data'].billing_address['postal_code'],
            ShippingCountry: countryData != undefined ? countryData.id : null,
            ShippingPhoneNumber: data['data'].billing_address['phone'],
            ExpiryDate: req.body.Expiration.replace(/\s/g, '').replace(
              /\\|\//g,
              ''
            ),
            Cvv: req.body.Cvv,
            ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
            AuthCode: data['data'].response_body['card'].auth_code,
            TransactionGateWay: 'FluidPay',
            Refund: false,
            Void: false,
            Capture: false,
            Tokenization: req.body.PaymentTokenization,
            Message: req.body.Message,
            Description: req.body.Description,
            ReferenceNo: req.body.ReferenceNo,
            ConvenienceFeeActive:
              minmumTxn != ''
                ? minmumTxn
                : userGateWayData.ConvenienceFeeActive,
            RequestOrigin: req.body.RequestOrigin,
            createdAt: data['data'].created_at,
            updatedAt: data['data'].updated_at,
            ProcessorId: userGateWayData.ProcessorId,
            SuggestedMode:
              req.body.SuggestedMode != undefined
                ? req.body.SuggestedMode
                : 'Card',
            TipAmount: parseFloat(req.body.TipAmount),
          };
          const transData = await models.Transaction.create(transactionInsert);

          return res.status(200).json({
            message: `Transaction declined due to ${data['data']['response_body']['card'].processor_response_text}`,
            data: JSON.parse(JSON.stringify(transData)),
          });
        }
      } else {
        return res.status(200).json({
          message: data.msg,
          data: JSON.parse(JSON.stringify(data)),
        });
      }
    } else {
      const checkFeeActive = await models.PaymentLink.findOne({
        where: { UUID: req.body.PaymentLinkId },
      });

      transaction = {
        type: req.body.TransactionType == '1' ? 'sale' : 'authorize',
        amount: Math.round(total * 100),
        currency: 'USD',
        email_receipt: false,
        email_address: req.body.BillingEmail,
        processor_id: userGateWayData.ProcessorId,
        payment_method: {
          customer: {
            id: req.body.GatewayCustomerId,
            payment_method_type: 'card',
            payment_method_id: req.body.PaymentId,
          },
        },
      };

      const jsonString = JSON.stringify(transaction); // Based upon your setup. You may or may not need to stringify

      const requestOptions = {
        method: 'POST',
        headers: requestHeader,
        body: jsonString,
        redirect: 'follow',
      };
      const requestCreated = {
        GatewayType: userGateWayData.GatewayType,
        Request: requestOptions,
        Response: '',
        MerchantId: userInfo.id,
      };
      await models.ResponseRequestTable.create(requestCreated);
      const response = await fetch(
        `${process.env.FLUIDPAY_API_URL}/api/transaction`,
        requestOptions
      );
      const data = await response.json();
      const responseInsert = {
        GatewayType: userGateWayData.GatewayType,
        Request: requestOptions,
        Response: data,
        MerchantId: userInfo.id,
      };
      const responseId = await models.ResponseRequestTable.create(
        responseInsert
      );
      if (data.status === 'success') {
        const findCustomer = await models.Customer.findOne({
          where: {
            [Op.and]: [
              { GatewayCustomerId: req.body.GatewayCustomerId },
              { UserId: userInfo.id },
            ],
          },
        });
        await models.ResponseRequestTable.update(
          { CustomerId: findCustomer.id },
          { where: { id: responseId.id } }
        );

        const paymentMethods = exports.fluidPayCardBrands(
          data['data'].response_body['card'].card_type
        );
        if (
          data['data'].status == 'pending_settlement' ||
          data['data'].status == 'authorized' ||
          data['data'].status == 'voided'
        ) {
          data['data'].status = '1';
          const transactionInsert = {
            CustomerId: findCustomer.id,
            MerchantId: userInfo.id,
            TransactionId: data['data'].id,
            Amount: data['data'].amount / 100,
            CardNumber: data['data'].response_body['card'].last_four,
            PaymentMethod: paymentMethods,
            Type: req.body.TransactionType,
            Status: data['data'].status,
            BillingEmail: data['data'].billing_address['email'],
            BillingCustomerName: data['data'].billing_address['first_name'],
            BillingAddress: data['data'].billing_address['address_line_1'],
            BillingCity: data['data'].billing_address['city'],
            BillingState: stateData != undefined ? stateData.id : null,
            BillingPostalCode: data['data'].billing_address['postal_code'],
            BillingCountry: countryData != undefined ? countryData.id : null,
            BillingCountryCode: req.body.BillingCountryCode,
            BillingPhoneNumber: data['data'].billing_address['phone'],
            IsShippingSame: req.body.shippingSameAsBilling,
            ShippingEmail: data['data'].billing_address['email'],
            ShippingCustomerName: data['data'].billing_address['first_name'],
            ShippingAddress: data['data'].billing_address['address_line_1'],
            ShippingCity: data['data'].billing_address['city'],
            ShippingState: stateData != undefined ? stateData.id : null,
            ShippingPostalCode: data['data'].billing_address['postal_code'],
            ShippingCountry: countryData != undefined ? countryData.id : null,
            ShippingPhoneNumber: data['data'].billing_address['phone'],
            ExpiryDate: req.body.Expiration.replace(/\s/g, '').replace(
              /\\|\//g,
              ''
            ),
            Cvv: req.body.Cvv,
            ConvenienceFeeValue: feeAmount != null ? feeAmount : 0,
            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
            AuthCode: data['data'].response_body['card'].auth_code,
            TransactionGateWay: 'FluidPay',
            Refund: false,
            Void: false,
            Capture: false,
            Tokenization: req.body.PaymentTokenization,
            Message: req.body.Message,
            Description: req.body.Description,
            ReferenceNo: req.body.ReferenceNo,
            ConvenienceFeeActive:
              minmumTxn != ''
                ? minmumTxn
                : userGateWayData.ConvenienceFeeActive,
            RequestOrigin: req.body.RequestOrigin,
            createdAt: data['data'].created_at,
            updatedAt: data['data'].updated_at,
            ProcessorId: userGateWayData.ProcessorId,
          };
          const transData = await models.Transaction.create(transactionInsert);
          await exports.sendWebHook(
            undefined,
            transData,
            req.body.PaymentLinkId,
            userInfo.id
          );

          return res.status(200).json({
            message: 'Transaction Completed Successfully',
            data: JSON.parse(JSON.stringify(transData)),
          });
        } else if (
          data['data'].status == 'declined' ||
          data['data'].status == 'failed'
        ) {
          data['data'].status = '9';
          const transactionInsert = {
            CustomerId: findCustomer.id,
            MerchantId: userInfo.id,
            TransactionId: data['data'].id,
            Amount: data['data'].amount / 100,
            CardNumber: data['data'].response_body['card'].last_four,
            PaymentMethod: paymentMethods,
            Type: req.body.TransactionType,
            Status: data['data'].status,
            BillingEmail: data['data'].billing_address['email'],
            BillingCustomerName: data['data'].billing_address['first_name'],
            BillingAddress: data['data'].billing_address['address_line_1'],
            BillingCity: data['data'].billing_address['city'],
            BillingState: stateData != undefined ? stateData.id : null,
            BillingPostalCode: data['data'].billing_address['postal_code'],
            BillingCountry: countryData != undefined ? countryData.id : null,
            BillingCountryCode: req.body.BillingCountryCode,
            BillingPhoneNumber: data['data'].billing_address['phone'],
            IsShippingSame: req.body.shippingSameAsBilling,
            ShippingEmail: data['data'].billing_address['email'],
            ShippingCustomerName: data['data'].billing_address['first_name'],
            ShippingAddress: data['data'].billing_address['address_line_1'],
            ShippingCity: data['data'].billing_address['city'],
            ShippingState: stateData != undefined ? stateData.id : null,
            ShippingPostalCode: data['data'].billing_address['postal_code'],
            ShippingCountry: countryData != undefined ? countryData.id : null,
            ShippingPhoneNumber: data['data'].billing_address['phone'],
            ExpiryDate: req.body.Expiration.replace(/\s/g, '').replace(
              /\\|\//g,
              ''
            ),
            Cvv: req.body.Cvv,
            ConvenienceFeeValue: feeAmount != null ? feeAmount : 0,
            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
            AuthCode: data['data'].response_body['card'].auth_code,
            TransactionGateWay: 'FluidPay',
            Refund: false,
            Void: false,
            Capture: false,
            Tokenization: req.body.PaymentTokenization,
            Message: req.body.Message,
            Description: req.body.Description,
            ReferenceNo: req.body.ReferenceNo,
            ConvenienceFeeActive:
              minmumTxn != ''
                ? minmumTxn
                : userGateWayData.ConvenienceFeeActive,
            RequestOrigin: req.body.RequestOrigin,
            createdAt: data['data'].created_at,
            updatedAt: data['data'].updated_at,
            ProcessorId: userGateWayData.ProcessorId,
            SuggestedMode:
              req.body.SuggestedMode != undefined
                ? req.body.SuggestedMode
                : 'Card',
            TipAmount: parseFloat(req.body.TipAmount),
          };
          const transData = await models.Transaction.create(transactionInsert);
          await exports.sendWebHook(
            `Transaction declined due to ${data['data']['response_body']['card'].processor_response_text}`,
            transData,
            req.body.PaymentLinkId,
            userInfo.id
          );

          return res.status(200).json({
            message: `Transaction declined due to ${data['data']['response_body']['card'].processor_response_text}`,
            data: JSON.parse(JSON.stringify(transData)),
          });
        } else if (
          data['data'].status == 'failed' ||
          data['data'].status == 'unknown'
        ) {
          data['data'].status = '2';
          const transactionInsert = {
            CustomerId: findCustomer.id,
            MerchantId: userInfo.id,
            TransactionId: data['data'].id,
            Amount: data['data'].amount / 100,
            CardNumber: data['data'].response_body['card'].last_four,
            PaymentMethod: paymentMethods,
            Type: req.body.TransactionType,
            Status: data['data'].status,
            BillingEmail: data['data'].billing_address['email'],
            BillingCustomerName: data['data'].billing_address['first_name'],
            BillingAddress: data['data'].billing_address['address_line_1'],
            BillingCity: data['data'].billing_address['city'],
            BillingState: stateData != undefined ? stateData.id : null,
            BillingPostalCode: data['data'].billing_address['postal_code'],
            BillingCountry: countryData != undefined ? countryData.id : null,
            BillingCountryCode: req.body.BillingCountryCode,
            BillingPhoneNumber: data['data'].billing_address['phone'],
            IsShippingSame: req.body.shippingSameAsBilling,
            ShippingEmail: data['data'].billing_address['email'],
            ShippingCustomerName: data['data'].billing_address['first_name'],
            ShippingAddress: data['data'].billing_address['address_line_1'],
            ShippingCity: data['data'].billing_address['city'],
            ShippingState: stateData != undefined ? stateData.id : null,
            ShippingPostalCode: data['data'].billing_address['postal_code'],
            ShippingCountry: countryData != undefined ? countryData.id : null,
            ShippingPhoneNumber: data['data'].billing_address['phone'],
            ExpiryDate: req.body.Expiration.replace(/\s/g, '').replace(
              /\\|\//g,
              ''
            ),
            Cvv: req.body.Cvv,
            ConvenienceFeeValue: feeAmount != null ? feeAmount : 0,
            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
            AuthCode: data['data'].response_body['card'].auth_code,
            TransactionGateWay: 'FluidPay',
            Refund: false,
            Void: false,
            Capture: false,
            Tokenization: req.body.PaymentTokenization,
            Message: req.body.Message,
            Description: req.body.Description,
            ReferenceNo: req.body.ReferenceNo,
            ConvenienceFeeActive:
              minmumTxn != ''
                ? minmumTxn
                : userGateWayData.ConvenienceFeeActive,
            RequestOrigin: req.body.RequestOrigin,
            createdAt: data['data'].created_at,
            updatedAt: data['data'].updated_at,
            ProcessorId: userGateWayData.ProcessorId,
            SuggestedMode:
              req.body.SuggestedMode != undefined
                ? req.body.SuggestedMode
                : 'Card',
            TipAmount: parseFloat(req.body.TipAmount),
          };
          const transData = await models.Transaction.create(transactionInsert);
          await exports.sendWebHook(
            `Transaction declined due to ${data['data']['response_body']['card'].processor_response_text}`,
            transData,
            req.body.PaymentLinkId,
            userInfo.id
          );

          return res.status(200).json({
            message: `Transaction declined due to ${data['data']['response_body']['card'].processor_response_text}`,
            data: JSON.parse(JSON.stringify(transData)),
          });
        }
      } else {
        await exports.sendWebHook(
          data.msg,
          undefined,
          req.body.PaymentLinkId,
          userInfo.id
        );
        return res.status(200).json({
          message: data.msg,
          data: JSON.parse(JSON.stringify(data)),
        });
      }
    }
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).json({
      message: err,
    });
  }
};

exports.processFluidLThreeTknTxn = async (
  req,
  userInfo,
  userGateWayData,
  total,
  feeAmount,
  minmumTxn,
  res
) => {
  try {
    let stateData = '';
    let countryData = '';

    const customerExist = await models.Customer.findOne({
      where: {
        [Op.and]: [
          { GatewayCustomerId: req.body.GatewayCustomerId },
          { UserId: userInfo.id },
        ],
      },
    });
    const requestHeader = {
      'Content-Type': 'application/json',
      Authorization: userGateWayData.GatewayApiKey,
    };

    transaction = {
      type: req.body.TransactionType == '1' ? 'sale' : 'authorize',
      amount: Math.round(total * 100),
      currency: 'USD',
      email_receipt: false,
      email_address: req.body.BillingEmail,
      processor_id: userGateWayData.ProcessorId,
      payment_method: {
        customer: {
          id: req.body.GatewayCustomerId,
          payment_method_type: 'card',
          payment_method_id: req.body.PaymentId,
        },
      },
    };
    const jsonString = JSON.stringify(transaction); // Based upon your setup. You may or may not need to stringify

    const requestOptions = {
      method: 'POST',
      headers: requestHeader,
      body: jsonString,
      redirect: 'follow',
    };
    const requestCreated = {
      GatewayType: userGateWayData.GatewayType,
      Request: requestOptions,
      Response: '',
      MerchantId: userInfo.id,
    };
    await models.ResponseRequestTable.create(requestCreated);
    const response = await fetch(
      `${process.env.FLUIDPAY_API_URL}/api/transaction`,
      requestOptions
    );
    const data = await response.json();
    const responseInsert = {
      GatewayType: userGateWayData.GatewayType,
      Request: requestOptions,
      Response: data,
      MerchantId: userInfo.id,
    };
    const responseId = await models.ResponseRequestTable.create(responseInsert);
    if (
      data.status === 'success' &&
      data['data'].status === 'declined' &&
      userGateWayData.ProcessorLevel == 'QuantumA' &&
      userGateWayData.ConvenienceFeeActive == true
    ) {
      userGateWayData = await models.MerchantPaymentGateWay.findOne({
        where: {
          [Op.and]: [
            { UserId: userInfo.id },
            { SuggestedMode: 'Card' },
            { GatewayStatus: true },
            { processorLevel: 'QuantumC' },
          ],
        },
      });
      const requestHeader = {
        'Content-Type': 'application/json',
        Authorization: userGateWayData.GatewayApiKey,
      };
      transaction = {
        type: req.body.TransactionType == '1' ? 'sale' : 'authorize',
        amount: Math.round(total * 100),
        currency: 'USD',
        email_receipt: false,
        email_address: req.body.BillingEmail,
        create_vault_record: true,
        processor_id: userGateWayData.ProcessorId,
        payment_method: {
          customer: {
            id: req.body.GatewayCustomerId,
            payment_method_type: 'card',
            payment_method_id: req.body.PaymentId,
          },
        },
      };
      const jsonString = JSON.stringify(transaction);
      const requestOptions = {
        method: 'POST',
        headers: requestHeader,
        body: jsonString,
        redirect: 'follow',
      };
      const requestCreated = {
        GatewayType: userGateWayData.GatewayType,
        Request: requestOptions,
        Response: '',
        MerchantId: userInfo.id,
      };
      await models.ResponseRequestTable.create(requestCreated);
      const response = await fetch(
        `${process.env.FLUIDPAY_API_URL}/api/transaction`,
        requestOptions
      );
      const newDataC = await response.json();
      const responseInsert = {
        GatewayType: userGateWayData.GatewayType,
        Request: requestOptions,
        Response: newDataC,
        MerchantId: userInfo.id,
      };
      const responseId = await models.ResponseRequestTable.create(
        responseInsert
      );
      if (newDataC.status === 'success') {
        const findCustomer = await models.Customer.findOne({
          where: {
            [Op.and]: [
              { GatewayCustomerId: req.body.GatewayCustomerId },
              { UserId: userInfo.id },
            ],
          },
        });
        await models.ResponseRequestTable.update(
          { CustomerId: findCustomer.id },
          { where: { id: responseId.id } }
        );
        const paymentMethods = exports.fluidPayCardBrands(
          newDataC['data'].response_body['card'].card_type
        );
        if (
          newDataC['data'].status == 'pending_settlement' ||
          newDataC['data'].status == 'authorized' ||
          newDataC['data'].status == 'voided'
        ) {
          newDataC['data'].status = '1';
          const transactionInsert = {
            CustomerId: findCustomer.id,
            MerchantId: userInfo.id,
            TransactionId: newDataC['data'].id,
            Amount: newDataC['data'].amount / 100,
            CardNumber: newDataC['data'].response_body['card'].last_four,
            PaymentMethod: paymentMethods,
            Type: req.body.TransactionType,
            Status: newDataC['data'].status,
            BillingEmail: newDataC['data'].billing_address['email'],
            BillingCustomerName: newDataC['data'].billing_address['first_name'],
            BillingAddress: newDataC['data'].billing_address['address_line_1'],
            BillingCity: newDataC['data'].billing_address['city'],
            BillingState: stateData != undefined ? stateData.id : null,
            BillingPostalCode: newDataC['data'].billing_address['postal_code'],
            BillingCountry: countryData != undefined ? countryData.id : null,
            BillingCountryCode: req.body.BillingCountryCode,
            BillingPhoneNumber: newDataC['data'].billing_address['phone'],
            IsShippingSame: req.body.shippingSameAsBilling,
            ShippingEmail: newDataC['data'].billing_address['email'],
            ShippingCustomerName:
              newDataC['data'].billing_address['first_name'],
            ShippingAddress: newDataC['data'].billing_address['address_line_1'],
            ShippingCity: newDataC['data'].billing_address['city'],
            ShippingState: stateData != undefined ? stateData.id : null,
            ShippingPostalCode: newDataC['data'].billing_address['postal_code'],
            ShippingCountry: countryData != undefined ? countryData.id : null,
            ShippingPhoneNumber: newDataC['data'].billing_address['phone'],
            ExpiryDate: req.body.Expiration.replace(/\s/g, '').replace(
              /\\|\//g,
              ''
            ),
            Cvv: req.body.Cvv,
            ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
            AuthCode: newDataC['data'].response_body['card'].auth_code,
            TransactionGateWay: 'FluidPay',
            Refund: false,
            Void: false,
            Capture: false,
            Tokenization: false, // req.body.PaymentTokenization,
            Message: req.body.Message,
            Description: req.body.Description,
            ReferenceNo: req.body.ReferenceNo,
            ConvenienceFeeActive:
              minmumTxn != ''
                ? minmumTxn
                : userGateWayData.ConvenienceFeeActive,
            RequestOrigin: req.body.RequestOrigin,
            createdAt: newDataC['data'].created_at,
            updatedAt: newDataC['data'].updated_at,
            ProcessorId: userGateWayData.ProcessorId,
            SuggestedMode:
              req.body.SuggestedMode != undefined
                ? req.body.SuggestedMode
                : 'Card',
            TipAmount: parseFloat(req.body.TipAmount),
          };
          const transData = await models.Transaction.create(transactionInsert);
          if (req.body.PaymentLinkId != undefined) {
            await exports.sendWebHook(
              undefined,
              transData,
              req.body.PaymentLinkId,
              userInfo.id
            );
          }

          return res.status(200).json({
            message: 'Transaction Processed Successfully',
            data: JSON.parse(JSON.stringify(transData)),
          });
        } else if (newDataC['data'].status == 'declined') {
          newDataC['data'].status = '9';
          const transactionInsert = {
            CustomerId: findCustomer.id,
            MerchantId: userInfo.id,
            TransactionId: newDataC['data'].id,
            Amount: newDataC['data'].amount / 100,
            CardNumber: newDataC['data'].response_body['card'].last_four,
            PaymentMethod: paymentMethods,
            Type: req.body.TransactionType,
            Status: newDataC['data'].status,
            BillingEmail: newDataC['data'].billing_address['email'],
            BillingCustomerName: newDataC['data'].billing_address['first_name'],
            BillingAddress: newDataC['data'].billing_address['address_line_1'],
            BillingCity: newDataC['data'].billing_address['city'],
            BillingState: stateData != undefined ? stateData.id : null,
            BillingPostalCode: newDataC['data'].billing_address['postal_code'],
            BillingCountry: countryData != undefined ? countryData.id : null,
            BillingCountryCode: req.body.BillingCountryCode,
            BillingPhoneNumber: newDataC['data'].billing_address['phone'],
            IsShippingSame: req.body.shippingSameAsBilling,
            ShippingEmail: newDataC['data'].billing_address['email'],
            ShippingCustomerName:
              newDataC['data'].billing_address['first_name'],
            ShippingAddress: newDataC['data'].billing_address['address_line_1'],
            ShippingCity: newDataC['data'].billing_address['city'],
            ShippingState: stateData != undefined ? stateData.id : null,
            ShippingPostalCode: newDataC['data'].billing_address['postal_code'],
            ShippingCountry: countryData != undefined ? countryData.id : null,
            ShippingPhoneNumber: newDataC['data'].billing_address['phone'],
            ExpiryDate: req.body.Expiration.replace(/\s/g, '').replace(
              /\\|\//g,
              ''
            ),
            Cvv: req.body.Cvv,
            ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
            AuthCode: newDataC['data'].response_body['card'].auth_code,
            TransactionGateWay: 'FluidPay',
            Refund: false,
            Void: false,
            Capture: false,
            Tokenization: false, // req.body.PaymentTokenization,
            Message: req.body.Message,
            Description: req.body.Description,
            ReferenceNo: req.body.ReferenceNo,
            ConvenienceFeeActive:
              minmumTxn != ''
                ? minmumTxn
                : userGateWayData.ConvenienceFeeActive,
            RequestOrigin: req.body.RequestOrigin,
            createdAt: newDataC['data'].created_at,
            updatedAt: newDataC['data'].updated_at,
            ProcessorId: userGateWayData.ProcessorId,
            SuggestedMode:
              req.body.SuggestedMode != undefined
                ? req.body.SuggestedMode
                : 'Card',
            TipAmount: parseFloat(req.body.TipAmount),
          };
          const transData = await models.Transaction.create(transactionInsert);
          if (req.body.PaymentLinkId != undefined) {
            await exports.sendWebHook(
              `Transaction declined due to ${newDataC['data']['response_body']['card'].processor_response_text}`,
              transData,
              req.body.PaymentLinkId,
              userInfo.id
            );
          }
          return res.status(200).json({
            message: `Transaction declined due to ${newDataC['data']['response_body']['card'].processor_response_text}`,
            data: JSON.parse(JSON.stringify(transData)),
          });
        } else if (
          newDataC['data'].status == 'failed' ||
          newDataC['data'].status == 'unknown'
        ) {
          newDataC['data'].status = '2';
          const transactionInsert = {
            CustomerId: findCustomer.id,
            MerchantId: userInfo.id,
            TransactionId: newDataC['data'].id,
            Amount: newDataC['data'].amount / 100,
            CardNumber: newDataC['data'].response_body['card'].last_four,
            PaymentMethod: paymentMethods,
            Type: req.body.TransactionType,
            Status: newDataC['data'].status,
            BillingEmail: newDataC['data'].billing_address['email'],
            BillingCustomerName: newDataC['data'].billing_address['first_name'],
            BillingAddress: newDataC['data'].billing_address['address_line_1'],
            BillingCity: newDataC['data'].billing_address['city'],
            BillingState: stateData != undefined ? stateData.id : null,
            BillingPostalCode: newDataC['data'].billing_address['postal_code'],
            BillingCountry: countryData != undefined ? countryData.id : null,
            BillingCountryCode: req.body.BillingCountryCode,
            BillingPhoneNumber: newDataC['data'].billing_address['phone'],
            IsShippingSame: req.body.shippingSameAsBilling,
            ShippingEmail: newDataC['data'].billing_address['email'],
            ShippingCustomerName:
              newDataC['data'].billing_address['first_name'],
            ShippingAddress: newDataC['data'].billing_address['address_line_1'],
            ShippingCity: newDataC['data'].billing_address['city'],
            ShippingState: stateData != undefined ? stateData.id : null,
            ShippingPostalCode: newDataC['data'].billing_address['postal_code'],
            ShippingCountry: countryData != undefined ? countryData.id : null,
            ShippingPhoneNumber: newDataC['data'].billing_address['phone'],
            ExpiryDate: req.body.Expiration.replace(/\s/g, '').replace(
              /\\|\//g,
              ''
            ),
            Cvv: req.body.Cvv,
            ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
            AuthCode: newDataC['data'].response_body['card'].auth_code,
            TransactionGateWay: 'FluidPay',
            Refund: false,
            Void: false,
            Capture: false,
            Tokenization: false, // req.body.PaymentTokenization,
            Message: req.body.Message,
            Description: req.body.Description,
            ReferenceNo: req.body.ReferenceNo,
            ConvenienceFeeActive:
              minmumTxn != ''
                ? minmumTxn
                : userGateWayData.ConvenienceFeeActive,
            RequestOrigin: req.body.RequestOrigin,
            createdAt: newDataC['data'].created_at,
            updatedAt: newDataC['data'].updated_at,
            ProcessorId: userGateWayData.ProcessorId,
            SuggestedMode:
              req.body.SuggestedMode != undefined
                ? req.body.SuggestedMode
                : 'Card',
            TipAmount: parseFloat(req.body.TipAmount),
          };
          const transData = await models.Transaction.create(transactionInsert);
          if (req.body.PaymentLinkId != undefined) {
            await exports.sendWebHook(
              `Transaction declined due to ${newDataC['data']['response_body']['card'].processor_response_text}`,
              transData,
              req.body.PaymentLinkId,
              userInfo.id
            );
          }
          return res.status(200).json({
            message: `Transaction declined due to ${newDataC['data']['response_body']['card'].processor_response_text}`,
            data: JSON.parse(JSON.stringify(transData)),
          });
        }
      } else {
        return res.status(200).json({
          message: data.msg,
          data: JSON.parse(JSON.stringify(data)),
        });
      }
    } else if (
      data.status === 'success' &&
      data['data'].status === 'declined' &&
      userGateWayData.ProcessorLevel == 'QuantumB' &&
      userGateWayData.ConvenienceFeeActive == false
    ) {
      userGateWayData = await models.MerchantPaymentGateWay.findOne({
        where: {
          [Op.and]: [
            { UserId: userInfo.id },
            { SuggestedMode: 'Card' },
            { GatewayStatus: true },
            { processorLevel: 'QuantumD' },
          ],
        },
      });
      const requestHeader = {
        'Content-Type': 'application/json',
        Authorization: userGateWayData.GatewayApiKey,
      };
      transaction = {
        type: req.body.TransactionType == '1' ? 'sale' : 'authorize',
        amount: Math.round(total * 100),
        currency: 'USD',
        email_receipt: false,
        email_address: req.body.BillingEmail,
        create_vault_record: true,
        processor_id: userGateWayData.ProcessorId,
        payment_method: {
          customer: {
            id: req.body.GatewayCustomerId,
            payment_method_type: 'card',
            payment_method_id: req.body.PaymentId,
          },
        },
      };
      const jsonString = JSON.stringify(transaction);
      const requestOptions = {
        method: 'POST',
        headers: requestHeader,
        body: jsonString,
        redirect: 'follow',
      };
      const requestCreated = {
        GatewayType: userGateWayData.GatewayType,
        Request: requestOptions,
        Response: '',
        MerchantId: userInfo.id,
      };
      await models.ResponseRequestTable.create(requestCreated);
      const response = await fetch(
        `${process.env.FLUIDPAY_API_URL}/api/transaction`,
        requestOptions
      );
      const newDataD = await response.json();
      const responseInsert = {
        GatewayType: userGateWayData.GatewayType,
        Request: requestOptions,
        Response: newDataD,
        MerchantId: userInfo.id,
      };
      const responseId = await models.ResponseRequestTable.create(
        responseInsert
      );
      if (newDataD.status === 'success') {
        const findCustomer = await models.Customer.findOne({
          where: {
            [Op.and]: [
              { GatewayCustomerId: req.body.GatewayCustomerId },
              { UserId: userInfo.id },
            ],
          },
        });
        await models.ResponseRequestTable.update(
          { CustomerId: findCustomer.id },
          { where: { id: responseId.id } }
        );

        const paymentMethods = exports.fluidPayCardBrands(
          newDataD['data'].response_body['card'].card_type
        );
        if (
          newDataD['data'].status == 'pending_settlement' ||
          newDataD['data'].status == 'authorized' ||
          newDataD['data'].status == 'voided'
        ) {
          newDataD['data'].status = '1';
          const transactionInsert = {
            CustomerId: findCustomer.id,
            MerchantId: userInfo.id,
            TransactionId: newDataD['data'].id,
            Amount: newDataD['data'].amount / 100,
            CardNumber: newDataD['data'].response_body['card'].last_four,
            PaymentMethod: paymentMethods,
            Type: req.body.TransactionType,
            Status: newDataD['data'].status,
            BillingEmail: newDataD['data'].billing_address['email'],
            BillingCustomerName: newDataD['data'].billing_address['first_name'],
            BillingAddress: newDataD['data'].billing_address['address_line_1'],
            BillingCity: newDataD['data'].billing_address['city'],
            BillingState: stateData != undefined ? stateData.id : null,
            BillingPostalCode: newDataD['data'].billing_address['postal_code'],
            BillingCountry: countryData != undefined ? countryData.id : null,
            BillingCountryCode: req.body.BillingCountryCode,
            BillingPhoneNumber: newDataD['data'].billing_address['phone'],
            IsShippingSame: req.body.shippingSameAsBilling,
            ShippingEmail: newDataD['data'].billing_address['email'],
            ShippingCustomerName:
              newDataD['data'].billing_address['first_name'],
            ShippingAddress: newDataD['data'].billing_address['address_line_1'],
            ShippingCity: newDataD['data'].billing_address['city'],
            ShippingState: stateData != undefined ? stateData.id : null,
            ShippingPostalCode: newDataD['data'].billing_address['postal_code'],
            ShippingCountry: countryData != undefined ? countryData.id : null,
            ShippingPhoneNumber: newDataD['data'].billing_address['phone'],
            ExpiryDate: req.body.Expiration.replace(/\s/g, '').replace(
              /\\|\//g,
              ''
            ),
            Cvv: req.body.Cvv,
            ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
            AuthCode: newDataD['data'].response_body['card'].auth_code,
            TransactionGateWay: 'FluidPay',
            Refund: false,
            Void: false,
            Capture: false,
            Tokenization: false, // req.body.PaymentTokenization,
            Message: req.body.Message,
            Description: req.body.Description,
            ReferenceNo: req.body.ReferenceNo,
            ConvenienceFeeActive:
              minmumTxn != ''
                ? minmumTxn
                : userGateWayData.ConvenienceFeeActive,
            RequestOrigin: req.body.RequestOrigin,
            createdAt: newDataD['data'].created_at,
            updatedAt: newDataD['data'].updated_at,
            ProcessorId: userGateWayData.ProcessorId,
            SuggestedMode:
              req.body.SuggestedMode != undefined
                ? req.body.SuggestedMode
                : 'Card',
            TipAmount: parseFloat(req.body.TipAmount),
          };
          const transData = await models.Transaction.create(transactionInsert);
          if (req.body.PaymentLinkId != undefined) {
            await exports.sendWebHook(
              undefined,
              transData,
              req.body.PaymentLinkId,
              userInfo.id
            );
          }
          return res.status(200).json({
            message: 'Transaction Processed Successfully',
            data: JSON.parse(JSON.stringify(transData)),
          });
        } else if (newDataD['data'].status == 'declined') {
          newDataD['data'].status = '9';
          const transactionInsert = {
            CustomerId: findCustomer.id,
            MerchantId: userInfo.id,
            TransactionId: newDataD['data'].id,
            Amount: newDataD['data'].amount / 100,
            CardNumber: newDataD['data'].response_body['card'].last_four,
            PaymentMethod: paymentMethods,
            Type: req.body.TransactionType,
            Status: newDataD['data'].status,
            BillingEmail: newDataD['data'].billing_address['email'],
            BillingCustomerName: newDataD['data'].billing_address['first_name'],
            BillingAddress: newDataD['data'].billing_address['address_line_1'],
            BillingCity: newDataD['data'].billing_address['city'],
            BillingState: stateData != undefined ? stateData.id : null,
            BillingPostalCode: newDataD['data'].billing_address['postal_code'],
            BillingCountry: countryData != undefined ? countryData.id : null,
            BillingCountryCode: req.body.BillingCountryCode,
            BillingPhoneNumber: newDataD['data'].billing_address['phone'],
            IsShippingSame: req.body.shippingSameAsBilling,
            ShippingEmail: newDataD['data'].billing_address['email'],
            ShippingCustomerName:
              newDataD['data'].billing_address['first_name'],
            ShippingAddress: newDataD['data'].billing_address['address_line_1'],
            ShippingCity: newDataD['data'].billing_address['city'],
            ShippingState: newDataD != undefined ? stateData.id : null,
            ShippingPostalCode: newDataD['data'].billing_address['postal_code'],
            ShippingCountry: countryData != undefined ? countryData.id : null,
            ShippingPhoneNumber: newDataD['data'].billing_address['phone'],
            ExpiryDate: req.body.Expiration.replace(/\s/g, '').replace(
              /\\|\//g,
              ''
            ),
            Cvv: req.body.Cvv,
            ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
            AuthCode: newDataD['data'].response_body['card'].auth_code,
            TransactionGateWay: 'FluidPay',
            Refund: false,
            Void: false,
            Capture: false,
            Tokenization: false, // req.body.PaymentTokenization,
            Message: req.body.Message,
            Description: req.body.Description,
            ReferenceNo: req.body.ReferenceNo,
            ConvenienceFeeActive:
              minmumTxn != ''
                ? minmumTxn
                : userGateWayData.ConvenienceFeeActive,
            RequestOrigin: req.body.RequestOrigin,
            createdAt: newDataD['data'].created_at,
            updatedAt: newDataD['data'].updated_at,
            ProcessorId: userGateWayData.ProcessorId,
            SuggestedMode:
              req.body.SuggestedMode != undefined
                ? req.body.SuggestedMode
                : 'Card',
            TipAmount: parseFloat(req.body.TipAmount),
          };
          const transData = await models.Transaction.create(transactionInsert);
          if (req.body.PaymentLinkId != undefined) {
            await exports.sendWebHook(
              `Transaction declined due to ${newDataD['data']['response_body']['card'].processor_response_text}`,
              transData,
              req.body.PaymentLinkId,
              userInfo.id
            );
          }
          return res.status(200).json({
            message: `Transaction declined due to ${newDataD['data']['response_body']['card'].processor_response_text}`,
            data: JSON.parse(JSON.stringify(transData)),
          });
        } else if (
          newDataD['data'].status == 'failed' ||
          newDataD['data'].status == 'unknown'
        ) {
          newDataD['data'].status = '2';
          const transactionInsert = {
            CustomerId: findCustomer.id,
            MerchantId: userInfo.id,
            TransactionId: newDataD['data'].id,
            Amount: newDataD['data'].amount / 100,
            CardNumber: newDataD['data'].response_body['card'].last_four,
            PaymentMethod: paymentMethods,
            Type: req.body.TransactionType,
            Status: newDataD['data'].status,
            BillingEmail: newDataD['data'].billing_address['email'],
            BillingCustomerName: newDataD['data'].billing_address['first_name'],
            BillingAddress: newDataD['data'].billing_address['address_line_1'],
            BillingCity: newDataD['data'].billing_address['city'],
            BillingState: stateData != undefined ? stateData.id : null,
            BillingPostalCode: newDataD['data'].billing_address['postal_code'],
            BillingCountry: countryData != undefined ? countryData.id : null,
            BillingCountryCode: req.body.BillingCountryCode,
            BillingPhoneNumber: newDataD['data'].billing_address['phone'],
            IsShippingSame: req.body.shippingSameAsBilling,
            ShippingEmail: newDataD['data'].billing_address['email'],
            ShippingCustomerName:
              newDataD['data'].billing_address['first_name'],
            ShippingAddress: newDataD['data'].billing_address['address_line_1'],
            ShippingCity: newDataD['data'].billing_address['city'],
            ShippingState: stateData != undefined ? stateData.id : null,
            ShippingPostalCode: newDataD['data'].billing_address['postal_code'],
            ShippingCountry: countryData != undefined ? countryData.id : null,
            ShippingPhoneNumber: newDataD['data'].billing_address['phone'],
            ExpiryDate: req.body.Expiration.replace(/\s/g, '').replace(
              /\\|\//g,
              ''
            ),
            Cvv: req.body.Cvv,
            ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
            AuthCode: newDataD['data'].response_body['card'].auth_code,
            TransactionGateWay: 'FluidPay',
            Refund: false,
            Void: false,
            Capture: false,
            Tokenization: false, // req.body.PaymentTokenization,
            Message: req.body.Message,
            Description: req.body.Description,
            ReferenceNo: req.body.ReferenceNo,
            ConvenienceFeeActive:
              minmumTxn != ''
                ? minmumTxn
                : userGateWayData.ConvenienceFeeActive,
            RequestOrigin: req.body.RequestOrigin,
            createdAt: newDataD['data'].created_at,
            updatedAt: newDataD['data'].updated_at,
            ProcessorId: userGateWayData.ProcessorId,
            SuggestedMode:
              req.body.SuggestedMode != undefined
                ? req.body.SuggestedMode
                : 'Card',
            TipAmount: parseFloat(req.body.TipAmount),
          };
          const transData = await models.Transaction.create(transactionInsert);
          if (req.body.PaymentLinkId != undefined) {
            await exports.sendWebHook(
              `Transaction declined due to ${newDataD['data']['response_body']['card'].processor_response_text}`,
              transData,
              req.body.PaymentLinkId,
              userInfo.id
            );
          }
          return res.status(200).json({
            message: `Transaction declined due to ${newDataD['data']['response_body']['card'].processor_response_text}`,
            data: JSON.parse(JSON.stringify(transData)),
          });
        }
      } else {
        if (req.body.PaymentLinkId != undefined) {
          await exports.sendWebHook(
            data.msg,
            undefined,
            req.body.PaymentLinkId,
            userInfo.id
          );
        }
        return res.status(200).json({
          message: data.msg,
          data: JSON.parse(JSON.stringify(data)),
        });
      }
    } else {
      if (data.status === 'success') {
        const findCustomer = await models.Customer.findOne({
          where: {
            [Op.and]: [
              { GatewayCustomerId: req.body.GatewayCustomerId },
              { UserId: userInfo.id },
            ],
          },
        });
        await models.ResponseRequestTable.update(
          { CustomerId: findCustomer.id },
          { where: { id: responseId.id } }
        );

        const paymentMethods = exports.fluidPayCardBrands(
          data['data'].response_body['card'].card_type
        );
        if (
          data['data'].status == 'pending_settlement' ||
          data['data'].status == 'authorized' ||
          data['data'].status == 'voided'
        ) {
          data['data'].status = '1';
          const transactionInsert = {
            CustomerId: findCustomer.id,
            MerchantId: userInfo.id,
            TransactionId: data['data'].id,
            Amount: data['data'].amount / 100,
            CardNumber: data['data'].response_body['card'].last_four,
            PaymentMethod: paymentMethods,
            Type: req.body.TransactionType,
            Status: data['data'].status,
            BillingEmail: data['data'].billing_address['email'],
            BillingCustomerName: data['data'].billing_address['first_name'],
            BillingAddress: data['data'].billing_address['address_line_1'],
            BillingCity: data['data'].billing_address['city'],
            BillingState: stateData != undefined ? stateData.id : null,
            BillingPostalCode: data['data'].billing_address['postal_code'],
            BillingCountry: countryData != undefined ? countryData.id : null,
            BillingCountryCode: req.body.BillingCountryCode,
            BillingPhoneNumber: data['data'].billing_address['phone'],
            IsShippingSame: req.body.shippingSameAsBilling,
            ShippingEmail: data['data'].billing_address['email'],
            ShippingCustomerName: data['data'].billing_address['first_name'],
            ShippingAddress: data['data'].billing_address['address_line_1'],
            ShippingCity: data['data'].billing_address['city'],
            ShippingState: stateData != undefined ? stateData.id : null,
            ShippingPostalCode: data['data'].billing_address['postal_code'],
            ShippingCountry: countryData != undefined ? countryData.id : null,
            ShippingPhoneNumber: data['data'].billing_address['phone'],
            ExpiryDate: req.body.Expiration.replace(/\s/g, '').replace(
              /\\|\//g,
              ''
            ),
            Cvv: req.body.Cvv,
            ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
            AuthCode: data['data'].response_body['card'].auth_code,
            TransactionGateWay: 'FluidPay',
            Refund: false,
            Void: false,
            Capture: false,
            Tokenization: false, // req.body.PaymentTokenization,
            Message: req.body.Message,
            Description: req.body.Description,
            ReferenceNo: req.body.ReferenceNo,
            ConvenienceFeeActive:
              minmumTxn != ''
                ? minmumTxn
                : userGateWayData.ConvenienceFeeActive,
            RequestOrigin: req.body.RequestOrigin,
            createdAt: data['data'].created_at,
            updatedAt: data['data'].updated_at,
            ProcessorId: userGateWayData.ProcessorId,
            SuggestedMode:
              req.body.SuggestedMode != undefined
                ? req.body.SuggestedMode
                : 'Card',
            TipAmount: parseFloat(req.body.TipAmount),
          };
          const transData = await models.Transaction.create(transactionInsert);
          if (req.body.PaymentLinkId != undefined) {
            await exports.sendWebHook(
              undefined,
              transData,
              req.body.PaymentLinkId,
              userInfo.id
            );
          }
          return res.status(200).json({
            message: 'Transaction Processed Successfully',
            data: JSON.parse(JSON.stringify(transData)),
          });
        } else if (data['data'].status == 'declined') {
          data['data'].status = '9';
          const transactionInsert = {
            CustomerId: findCustomer.id,
            MerchantId: userInfo.id,
            TransactionId: data['data'].id,
            Amount: data['data'].amount / 100,
            CardNumber: data['data'].response_body['card'].last_four,
            PaymentMethod: paymentMethods,
            Type: req.body.TransactionType,
            Status: data['data'].status,
            BillingEmail: data['data'].billing_address['email'],
            BillingCustomerName: data['data'].billing_address['first_name'],
            BillingAddress: data['data'].billing_address['address_line_1'],
            BillingCity: data['data'].billing_address['city'],
            BillingState: stateData != undefined ? stateData.id : null,
            BillingPostalCode: data['data'].billing_address['postal_code'],
            BillingCountry: countryData != undefined ? countryData.id : null,
            BillingCountryCode: req.body.BillingCountryCode,
            BillingPhoneNumber: data['data'].billing_address['phone'],
            IsShippingSame: req.body.shippingSameAsBilling,
            ShippingEmail: data['data'].billing_address['email'],
            ShippingCustomerName: data['data'].billing_address['first_name'],
            ShippingAddress: data['data'].billing_address['address_line_1'],
            ShippingCity: data['data'].billing_address['city'],
            ShippingState: stateData != undefined ? stateData.id : null,
            ShippingPostalCode: data['data'].billing_address['postal_code'],
            ShippingCountry: countryData != undefined ? countryData.id : null,
            ShippingPhoneNumber: data['data'].billing_address['phone'],
            ExpiryDate: req.body.Expiration.replace(/\s/g, '').replace(
              /\\|\//g,
              ''
            ),
            Cvv: req.body.Cvv,
            ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
            AuthCode: data['data'].response_body['card'].auth_code,
            TransactionGateWay: 'FluidPay',
            Refund: false,
            Void: false,
            Capture: false,
            Tokenization: false, // req.body.PaymentTokenization,
            Message: req.body.Message,
            Description: req.body.Description,
            ReferenceNo: req.body.ReferenceNo,
            ConvenienceFeeActive:
              minmumTxn != ''
                ? minmumTxn
                : userGateWayData.ConvenienceFeeActive,
            RequestOrigin: req.body.RequestOrigin,
            createdAt: data['data'].created_at,
            updatedAt: data['data'].updated_at,
            ProcessorId: userGateWayData.ProcessorId,
            SuggestedMode:
              req.body.SuggestedMode != undefined
                ? req.body.SuggestedMode
                : 'Card',
            TipAmount: parseFloat(req.body.TipAmount),
          };
          const transData = await models.Transaction.create(transactionInsert);
          if (req.body.PaymentLinkId != undefined) {
            await exports.sendWebHook(
              `Transaction declined due to ${data['data']['response_body']['card'].processor_response_text}`,
              transData,
              req.body.PaymentLinkId,
              userInfo.id
            );
          }
          return res.status(200).json({
            message: `Transaction declined due to ${data['data']['response_body']['card'].processor_response_text}`,
            data: JSON.parse(JSON.stringify(transData)),
          });
        } else if (
          data['data'].status == 'failed' ||
          data['data'].status == 'unknown'
        ) {
          data['data'].status = '2';
          const transactionInsert = {
            CustomerId: findCustomer.id,
            MerchantId: userInfo.id,
            TransactionId: data['data'].id,
            Amount: data['data'].amount / 100,
            CardNumber: data['data'].response_body['card'].last_four,
            PaymentMethod: paymentMethods,
            Type: req.body.TransactionType,
            Status: data['data'].status,
            BillingEmail: data['data'].billing_address['email'],
            BillingCustomerName: data['data'].billing_address['first_name'],
            BillingAddress: data['data'].billing_address['address_line_1'],
            BillingCity: data['data'].billing_address['city'],
            BillingState: stateData != undefined ? stateData.id : null,
            BillingPostalCode: data['data'].billing_address['postal_code'],
            BillingCountry: countryData != undefined ? countryData.id : null,
            BillingCountryCode: req.body.BillingCountryCode,
            BillingPhoneNumber: data['data'].billing_address['phone'],
            IsShippingSame: req.body.shippingSameAsBilling,
            ShippingEmail: data['data'].billing_address['email'],
            ShippingCustomerName: data['data'].billing_address['first_name'],
            ShippingAddress: data['data'].billing_address['address_line_1'],
            ShippingCity: data['data'].billing_address['city'],
            ShippingState: stateData != undefined ? stateData.id : null,
            ShippingPostalCode: data['data'].billing_address['postal_code'],
            ShippingCountry: countryData != undefined ? countryData.id : null,
            ShippingPhoneNumber: data['data'].billing_address['phone'],
            ExpiryDate: req.body.Expiration.replace(/\s/g, '').replace(
              /\\|\//g,
              ''
            ),
            Cvv: req.body.Cvv,
            ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
            AuthCode: data['data'].response_body['card'].auth_code,
            TransactionGateWay: 'FluidPay',
            Refund: false,
            Void: false,
            Capture: false,
            Tokenization: false, // req.body.PaymentTokenization,
            Message: req.body.Message,
            Description: req.body.Description,
            ReferenceNo: req.body.ReferenceNo,
            ConvenienceFeeActive:
              minmumTxn != ''
                ? minmumTxn
                : userGateWayData.ConvenienceFeeActive,
            RequestOrigin: req.body.RequestOrigin,
            createdAt: data['data'].created_at,
            updatedAt: data['data'].updated_at,
            ProcessorId: userGateWayData.ProcessorId,
            SuggestedMode:
              req.body.SuggestedMode != undefined
                ? req.body.SuggestedMode
                : 'Card',
            TipAmount: parseFloat(req.body.TipAmount),
          };
          const transData = await models.Transaction.create(transactionInsert);
          if (req.body.PaymentLinkId != undefined) {
            await exports.sendWebHook(
              `Transaction declined due to ${data['data']['response_body']['card'].processor_response_text}`,
              transData,
              req.body.PaymentLinkId,
              userInfo.id
            );
          }
          return res.status(200).json({
            message: `Transaction declined due to ${data['data']['response_body']['card'].processor_response_text}`,
            data: JSON.parse(JSON.stringify(transData)),
          });
        }
      } else {
        if (req.body.PaymentLinkId != undefined) {
          await exports.sendWebHook(
            data.msg,
            undefined,
            req.body.PaymentLinkId,
            userInfo.id
          );
        }
        return res.status(200).json({
          message: data.msg,
          data: JSON.parse(JSON.stringify(data)),
        });
      }
    }
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).json({
      message: err,
    });
  }
};

exports.chargeCustomerViaToken = async (req, res) => {
  let token = '';
  let decoded = '';
  if (req.body.MerchantId != undefined) {
    decoded = {};
    decoded.UUID = req.body.MerchantId;
  } else {
    token = req.headers.authorization.split(' ');
    decoded = jwt.verify(token[1], process.env.JWT_SECRET);
  }
  try {
    let userGateWayData = '',
      FluidPayAcc = '';
    const userInfo = await models.User.findOne({
      where: {
        UUID: decoded.UUID,
      },
    });

    const userLevel = userInfo.UserLevel;
    const findGateWay = await exports.userGateways(req, userInfo, res);

    let gateWay = findGateWay[0].GatewayType;
    if (gateWay == 'Payrix') {
      return exports.processChargeCustomerViaTkn(
        req,
        userInfo,
        findGateWay[0],
        res
      );
    } else if (
      gateWay == 'FluidPay' &&
      (userLevel == 'Level1' || userLevel == 'Level2')
    ) {
      return exports.processFluidLOneTwoTknTxn(
        req,
        userInfo,
        findGateWay[0],
        findGateWay[1],
        findGateWay[2],
        findGateWay[3],
        res
      );
    } else if (gateWay == 'FluidPay' && userLevel == 'Level3') {
      return exports.processFluidLThreeTknTxn(
        req,
        userInfo,
        findGateWay[0],
        findGateWay[1],
        findGateWay[2],
        findGateWay[3],
        res
      );
    }
  } catch (err) {
    Sentry.captureException(err);
    res.status(400).json({
      message: err.message,
    });
  }
};

// --------------------------------------- ACH APIs ------------------------------------------------------- //
exports.achPostTransaction = async (req, res) => {
  let token = '';
  let decoded = '';
  if (req.body.MerchantId != undefined) {
    decoded = {};
    decoded.UUID = req.body.MerchantId;
  } else {
    token = req.headers.authorization.split(' ');
    decoded = jwt.verify(token[1], process.env.JWT_SECRET);
  }
  try {
    let userGateWayData = '',
      FluidPayAcc = '';
    const userInfo = await models.User.findOne({
      where: {
        UUID: decoded.UUID,
      },
    });
    const userLevel = userInfo.UserLevel;
    const findGateWay = await exports.achuserGateways(req, userInfo, res);

    let gateWay = findGateWay[0].GatewayType;

    if (gateWay == 'Payrix') {
      return exports.processPayrixTransactions(
        req,
        userInfo,
        findGateWay[0],
        res
      );
    } else if (
      gateWay == 'FluidPay' &&
      (userLevel == 'Level1' || userLevel == 'Level2')
    ) {
      return exports.achFluidLOneTwoTransactions(
        req,
        userInfo,
        findGateWay[0],
        findGateWay[1],
        findGateWay[2],
        findGateWay[3],
        res
      );
    } else if (gateWay == 'FluidPay' && userLevel == 'Level3') {
      return exports.achFluidLThreeTransactions(
        req,
        userInfo,
        findGateWay[0],
        findGateWay[1],
        findGateWay[2],
        findGateWay[3],
        res
      );
    }
  } catch (err) {
    console.log(err);
    Sentry.captureException(err);
    return res
      .status(400)
      .json({ status: 'error', message: err.ReferenceError });
  }
};

exports.achFluidLOneTwoTransactions = async (
  req,
  userInfo,
  userGateWayData,
  total,
  feeAmount,
  minmumTxn,
  res
) => {
  try {
    let countryName = req.body.BillingCountry === 'USA' ? 'US' : undefined;
    const ach = {
      routing_number: req.body.routing_number,
      account_number: req.body.account_number,
      sec_code: 'ccd',
      account_type: req.body.account_type,
    };
    const customerExist = await models.Customer.findOne({
      where: {
        [Op.and]: [
          { CountryCode: req.body.BillingCountryCode },
          { PhoneNumber: req.body.BillingPhoneNumber },
          { UserId: userInfo.id },
        ],
      },
    });
    const billingAddress = {
      Company: req.body.BillingCompany,
      first_name: req.body.BillingCustomerName,
      address_line_1: req.body.BillingAddress ?? undefined,
      city: req.body.BillingCity ?? undefined,
      state: req.body.BillingState ?? undefined,
      postal_code: String(req.body.BillingPostalCode || ''),
      country: countryName ?? undefined,
      phone: req.body.BillingPhoneNumber,
      email: req.body.BillingEmail ?? null,
    };
    if (req.body.shippingSameAsBilling === true) {
      shippingAddress = {
        Company: req.body.BillingCompany,
        first_name: req.body.BillingCustomerName,
        address_line_1: req.body.BillingAddress ?? undefined,
        city: req.body.BillingCity ?? undefined,
        state: req.body.BillingState ?? undefined,
        postal_code: String(req.body.BillingPostalCode || ''),
        country: countryName ?? undefined,
        phone: req.body.BillingPhoneNumber,
        email: req.body.BillingEmail ?? null,
      };
    } else {
      shippingAddress = {
        Company: req.body.BillingCompany,
        first_name: req.body.ShippingCustomerName,
        address_line_1: req.body.ShippingAddress ?? undefined,
        city: req.body.ShippingCity ?? undefined,
        state: req.body.ShippingState ?? undefined,
        postal_code: String(req.body.ShippingPostalCode || ''),
        country: countryName ?? undefined,
        phone: req.body.ShippingPhoneNumber,
        email: req.body.ShippingEmail ?? null,
      };
    }
    const requestHeader = {
      'Content-Type': 'application/json',
      Authorization: userGateWayData.GatewayApiKey,
    };
    if (req.body.PaymentLinkId == undefined) {
      transaction = {
        type: req.body.TransactionType == '1' ? 'sale' : 'authorize',
        amount: Math.round(total * 100),
        currency: 'USD',
        email_receipt: false,
        email_address: req.body.BillingEmail,
        processor_id: userGateWayData.ProcessorId,
        //processor_id: "cc2fe646lr8tdtmfio10",  This processor Id is for ACH
        payment_method: { ach: ach },
        billing_address: billingAddress,
        shipping_address: shippingAddress,
      };
      if (
        req.body.PaymentTokenization == true &&
        (customerExist == null || customerExist.GatewayCustomerId == null)
      ) {
        transaction['create_vault_record'] = true;
      } else {
        transaction['create_vault_record'] = false;
      }
      const jsonString = JSON.stringify(transaction); // Based upon your setup. You may or may not need to stringify

      const requestOptions = {
        method: 'POST',
        headers: requestHeader,
        body: jsonString,
        redirect: 'follow',
      };
      const requestCreated = {
        GatewayType: userGateWayData.GatewayType,
        Request: requestOptions,
        Response: '',
        MerchantId: userInfo.id,
      };
      await models.ResponseRequestTable.create(requestCreated);
      const response = await fetch(
        `${process.env.FLUIDPAY_API_URL}/api/transaction`,
        requestOptions
      );
      const data = await response.json();
      const responseInsert = {
        GatewayType: userGateWayData.GatewayType,
        Request: requestOptions,
        Response: data,
        MerchantId: userInfo.id,
      };
      const responseId = await models.ResponseRequestTable.create(
        responseInsert
      );
      if (data.status === 'success') {
        const checkCustomer = await exports.achCheckCustomerExist(
          req,
          userInfo.id
        );

        const findCustomer = await models.Customer.findOne({
          where: {
            [Op.and]: [
              { CountryCode: req.body.BillingCountryCode },
              { PhoneNumber: req.body.BillingPhoneNumber },
              { UserId: userInfo.id },
            ],
          },
        });

        if (checkCustomer != 'skip ach') {
          const cardToken = await exports.achCreateFluidToken(
            req,
            userInfo,
            userGateWayData,
            data,
            findCustomer,
            checkCustomer
          );
        }
        await models.ResponseRequestTable.update(
          { CustomerId: findCustomer.id },
          { where: { id: responseId.id } }
        );
        const stateData = await models.States.findOne({
          where: {
            Abbrevation: req.body.BillingState ?? null,
          },
        });
        const countryData = await models.Country.findOne({
          where: {
            Abbrevation: req.body.BillingCountry ?? null,
          },
        });
        const transactionInsert = {
          RoutingNumber: req.body.routing_number,
          AccountNumber: req.body.account_number,
          SecCode: 'ccd',
          AccountType: req.body.account_type,
          isBusinessUserForACH: req.body.isBusinessUserForACH,
          Company: req.body.BillingCompany,
          CustomerId: findCustomer.id,
          MerchantId: userInfo.id,
          TransactionId: data['data'].id,
          Amount: data['data'].amount / 100,
          Type: req.body.TransactionType,
          BillingEmail: data['data'].billing_address['email'],
          BillingCustomerName: data['data'].billing_address['first_name'],
          BillingAddress: data['data'].billing_address['address_line_1'],
          BillingCity: data['data'].billing_address['city'],
          BillingState: stateData != undefined ? stateData.id : null,
          BillingPostalCode: data['data'].billing_address['postal_code'],
          BillingCountry: countryData != undefined ? countryData.id : null,
          BillingCountryCode: req.body.BillingCountryCode,
          BillingPhoneNumber: data['data'].billing_address['phone'],
          IsShippingSame: req.body.shippingSameAsBilling,
          ShippingEmail: data['data'].billing_address['email'],
          ShippingCustomerName: data['data'].billing_address['first_name'],
          ShippingAddress: data['data'].billing_address['address_line_1'],
          ShippingCity: data['data'].billing_address['city'],
          ShippingState: stateData != undefined ? stateData.id : null,
          ShippingPostalCode: data['data'].billing_address['postal_code'],
          ShippingCountry: countryData != undefined ? countryData.id : null,
          ShippingPhoneNumber: data['data'].billing_address['phone'],
          ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
          AuthCode: data['data'].response_body['ach'].auth_code,
          ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
          ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
          TransactionGateWay: 'FluidPay',
          Refund: false,
          Void: false,
          Capture: false,
          Tokenization: req.body.PaymentTokenization,
          Message: req.body.Message,
          Description: req.body.Description,
          ReferenceNo: req.body.ReferenceNo,
          ConvenienceFeeActive:
            minmumTxn != '' ? minmumTxn : userGateWayData.ConvenienceFeeActive,
          RequestOrigin: req.body.RequestOrigin,
          createdAt: data['data'].created_at,
          updatedAt: data['data'].updated_at,
          ProcessorId: userGateWayData.ProcessorId,
          SuggestedMode:
            req.body.SuggestedMode != undefined
              ? req.body.SuggestedMode
              : 'ACH',
          TipAmount: parseFloat(req.body.TipAmount),
        };
        if (
          data['data'].status == 'pending_settlement' ||
          data['data'].status == 'authorized' ||
          data['data'].status == 'voided'
        ) {
          data['data'].status = '1';
          transactionInsert['Status'] = data['data'].status;
          const transData = await models.Transaction.create(transactionInsert);
          return res.status(200).json({
            status: 'success',
            message: 'Transaction Processed Successfully',
            data: JSON.parse(JSON.stringify(transData)),
          });
        } else if (data['data'].status == 'declined') {
          data['data'].status = '9';
          transactionInsert['Status'] = data['data'].status;
          const transData = await models.Transaction.create(transactionInsert);
          return res.status(200).json({
            status: 'error',
            message: `Transaction declined due to ${data['data']['response_body']['ach'].processor_response_text}`,
            data: JSON.parse(JSON.stringify(transData)),
          });
        } else if (
          data['data'].status == 'failed' ||
          data['data'].status == 'unknown'
        ) {
          data['data'].status = '2';
          transactionInsert['Status'] = data['data'].status;
          const transData = await models.Transaction.create(transactionInsert);
          return res.status(200).json({
            status: 'error',
            message: `Transaction declined due to ${data['data']['response_body']['ach'].processor_response_text}`,
            data: JSON.parse(JSON.stringify(transData)),
          });
        }
      } else {
        return res.status(200).json({
          status: 'error',
          message: data.msg,
          data: JSON.parse(JSON.stringify(data)),
        });
      }
    } else {
      const checkFeeActive = await models.PaymentLink.findOne({
        where: { UUID: req.body.PaymentLinkId },
      });

      transaction = {
        type: req.body.TransactionType == '1' ? 'sale' : 'authorize',
        amount: Math.round(total * 100),
        currency: 'USD',
        email_receipt: false,
        email_address: req.body.BillingEmail,
        processor_id: userGateWayData.processor_id,
        // processor_id: "cc2fe646lr8tdtmfio10",
        payment_method: { ach: ach },
        billing_address: billingAddress,
        shipping_address: shippingAddress,
      };
      if (
        req.body.PaymentTokenization == true &&
        (customerExist == null || customerExist.GatewayCustomerId == null)
      ) {
        transaction['create_vault_record'] = true;
      } else {
        transaction['create_vault_record'] = false;
      }

      const jsonString = JSON.stringify(transaction); // Based upon your setup. You may or may not need to stringify

      const requestOptions = {
        method: 'POST',
        headers: requestHeader,
        body: jsonString,
        redirect: 'follow',
      };
      const requestCreated = {
        GatewayType: userGateWayData.GatewayType,
        Request: requestOptions,
        Response: '',
        MerchantId: userInfo.id,
      };
      await models.ResponseRequestTable.create(requestCreated);
      const response = await fetch(
        `${process.env.FLUIDPAY_API_URL}/api/transaction`,
        requestOptions
      );
      const data = await response.json();
      const responseInsert = {
        GatewayType: userGateWayData.GatewayType,
        Request: requestOptions,
        Response: data,
        MerchantId: userInfo.id,
      };
      const responseId = await models.ResponseRequestTable.create(
        responseInsert
      );
      if (data.status === 'success') {
        const checkCustomer = await exports.achCheckCustomerExist(
          req,
          userInfo.id
        );

        const findCustomer = await models.Customer.findOne({
          where: {
            [Op.and]: [
              { CountryCode: req.body.BillingCountryCode },
              { PhoneNumber: req.body.BillingPhoneNumber },
              { UserId: userInfo.id },
            ],
          },
        });
        if (checkCustomer != 'skip ach') {
          const cardToken = await exports.achCreateFluidToken(
            req,
            userInfo,
            userGateWayData,
            data,
            findCustomer,
            checkCustomer
          );
        }
        await models.ResponseRequestTable.update(
          { CustomerId: findCustomer.id },
          { where: { id: responseId.id } }
        );

        const stateData = await models.States.findOne({
          where: {
            Abbrevation: req.body.BillingState ?? null,
          },
        });
        const countryData = await models.Country.findOne({
          where: {
            Abbrevation: req.body.BillingCountry ?? null,
          },
        });

        const transactionInsert = {
          RoutingNumber: req.body.routing_number,
          AccountNumber: req.body.account_number,
          SecCode: 'ccd',
          AccountType: req.body.account_type,
          isBusinessUserForACH: req.body.isBusinessUserForACH,
          Company: req.body.BillingCompany,
          CustomerId: findCustomer.id,
          MerchantId: userInfo.id,
          TransactionId: data['data'].id,
          Amount: data['data'].amount / 100,
          Type: req.body.TransactionType,
          BillingEmail: data['data'].billing_address['email'],
          BillingCustomerName: data['data'].billing_address['first_name'],
          BillingAddress: data['data'].billing_address['address_line_1'],
          BillingCity: data['data'].billing_address['city'],
          BillingState: stateData != undefined ? stateData.id : null,
          BillingPostalCode: data['data'].billing_address['postal_code'],
          BillingCountry: countryData != undefined ? countryData.id : null,
          BillingCountryCode: req.body.BillingCountryCode,
          BillingPhoneNumber: data['data'].billing_address['phone'],
          IsShippingSame: req.body.shippingSameAsBilling,
          ShippingEmail: data['data'].billing_address['email'],
          ShippingCustomerName: data['data'].billing_address['first_name'],
          ShippingAddress: data['data'].billing_address['address_line_1'],
          ShippingCity: data['data'].billing_address['city'],
          ShippingState: stateData != undefined ? stateData.id : null,
          ShippingPostalCode: data['data'].billing_address['postal_code'],
          ShippingCountry: countryData != undefined ? countryData.id : null,
          ShippingPhoneNumber: data['data'].billing_address['phone'],
          AuthCode: data['data'].response_body['ach'].auth_code,
          ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
          ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
          ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
          TransactionGateWay: 'FluidPay',
          Refund: false,
          Void: false,
          Capture: false,
          Tokenization: req.body.PaymentTokenization,
          Message: req.body.Message,
          Description: req.body.Description,
          ReferenceNo: req.body.ReferenceNo,
          ConvenienceFeeActive:
            minmumTxn != '' ? minmumTxn : userGateWayData.ConvenienceFeeActive,
          RequestOrigin: req.body.RequestOrigin,
          createdAt: data['data'].created_at,
          updatedAt: data['data'].updated_at,
          ProcessorId: userGateWayData.ProcessorId,
          SuggestedMode:
            req.body.SuggestedMode != undefined
              ? req.body.SuggestedMode
              : 'ACH',
          TipAmount: parseFloat(req.body.TipAmount),
        };

        if (
          data['data'].status == 'pending_settlement' ||
          data['data'].status == 'authorized' ||
          data['data'].status == 'voided'
        ) {
          data['data'].status = '1';
          transactionInsert['Status'] = data['data'].status;
          const transData = await models.Transaction.create(transactionInsert);
          await exports.sendWebHook(
            undefined,
            transData,
            req.body.PaymentLinkId,
            userInfo.id
          );

          return res.status(200).json({
            status: 'success',
            message: 'Transaction Completed Successfully',
            data: JSON.parse(JSON.stringify(transData)),
          });
        } else if (
          data['data'].status == 'declined' ||
          data['data'].status == 'failed'
        ) {
          data['data'].status = '9';
          transactionInsert['Status'] = data['data'].status;
          const transData = await models.Transaction.create(transactionInsert);
          await exports.sendWebHook(
            `Transaction declined due to ${data['data']['response_body']['ach'].processor_response_text}`,
            transData,
            req.body.PaymentLinkId,
            userInfo.id
          );

          return res.status(200).json({
            status: 'error',
            message: `Transaction declined due to ${data['data']['response_body']['ach'].processor_response_text}`,
            data: JSON.parse(JSON.stringify(transData)),
          });
        } else if (
          data['data'].status == 'failed' ||
          data['data'].status == 'unknown'
        ) {
          data['data'].status = '2';
          transactionInsert['Status'] = data['data'].status;
          const transData = await models.Transaction.create(transactionInsert);
          await exports.sendWebHook(
            `Transaction declined due to ${data['data']['response_body']['ach'].processor_response_text}`,
            transData,
            req.body.PaymentLinkId,
            userInfo.id
          );

          return res.status(200).json({
            status: 'error',
            message: `Transaction declined due to ${data['data']['response_body']['ach'].processor_response_text}`,
            data: JSON.parse(JSON.stringify(transData)),
          });
        }
      } else {
        await exports.sendWebHook(
          data.msg,
          undefined,
          req.body.PaymentLinkId,
          userInfo.id
        );
        return res.status(200).json({
          status: 'error',
          message: data.msg,
          data: JSON.parse(JSON.stringify(data)),
        });
      }
    }
  } catch (err) {
    console.log(err);
    Sentry.captureException(err);
    res.status(500).json({
      status: 'error',
      message: err,
    });
  }
};

exports.achFluidLThreeTransactions = async (
  req,
  userInfo,
  userGateWayData,
  total,
  feeAmount,
  minmumTxn,
  res
) => {
  try {
    let countryName = req.body.BillingCountry === 'USA' ? 'US' : undefined;
    const ach = {
      routing_number: req.body.routing_number,
      account_number: req.body.account_number,
      sec_code: 'ccd',
      account_type: req.body.account_type,
    };

    const customerExist = await models.Customer.findOne({
      where: {
        [Op.and]: [
          { CountryCode: req.body.BillingCountryCode },
          { PhoneNumber: req.body.BillingPhoneNumber },
          { UserId: userInfo.id },
        ],
      },
    });

    const billingAddress = {
      Company: req.body.BillingCompany,
      first_name: req.body.BillingCustomerName,
      address_line_1: req.body.BillingAddress ?? undefined,
      city: req.body.BillingCity ?? undefined,
      state: req.body.BillingState ?? undefined,
      postal_code: String(req.body.BillingPostalCode || ''),
      country: countryName ?? undefined,
      phone: req.body.BillingPhoneNumber,
      email: req.body.BillingEmail ?? null,
    };
    if (req.body.shippingSameAsBilling === true) {
      shippingAddress = {
        Company: req.body.BillingCompany,
        first_name: req.body.BillingCustomerName,
        address_line_1: req.body.BillingAddress ?? undefined,
        city: req.body.BillingCity ?? undefined,
        state: req.body.BillingState ?? undefined,
        postal_code: String(req.body.BillingPostalCode || ''),
        country: countryName ?? undefined,
        phone: req.body.BillingPhoneNumber,
        email: req.body.BillingEmail ?? null,
      };
    } else {
      shippingAddress = {
        Company: req.body.BillingCompany,
        first_name: req.body.ShippingCustomerName,
        address_line_1: req.body.ShippingAddress ?? undefined,
        city: req.body.ShippingCity ?? undefined,
        state: req.body.ShippingState ?? undefined,
        postal_code: String(req.body.ShippingPostalCode || ''),
        country: countryName ?? undefined,
        phone: req.body.ShippingPhoneNumber,
        email: req.body.ShippingEmail ?? null,
      };
    }
    const requestHeader = {
      'Content-Type': 'application/json',
      Authorization: userGateWayData.GatewayApiKey,
    };

    transaction = {
      type: req.body.TransactionType == '1' ? 'sale' : 'authorize',
      amount: Math.round(total * 100),
      currency: 'USD',
      email_receipt: false,
      email_address: req.body.BillingEmail,
      create_vault_record: true,
      processor_id: userGateWayData.ProcessorId,
      payment_method: { ach: ach },
      billing_address: billingAddress,
      shipping_address: shippingAddress,
    };
    if (
      req.body.PaymentTokenization == true &&
      (customerExist == null || customerExist.GatewayCustomerId == null)
    ) {
      transaction['create_vault_record'] = true;
    } else {
      transaction['create_vault_record'] = false;
    }
    const jsonString = JSON.stringify(transaction); // Based upon your setup. You may or may not need to stringify

    const requestOptions = {
      method: 'POST',
      headers: requestHeader,
      body: jsonString,
      redirect: 'follow',
    };
    const requestCreated = {
      GatewayType: userGateWayData.GatewayType,
      Request: requestOptions,
      Response: '',
      MerchantId: userInfo.id,
    };
    await models.ResponseRequestTable.create(requestCreated);
    const response = await fetch(
      `${process.env.FLUIDPAY_API_URL}/api/transaction`,
      requestOptions
    );
    const data = await response.json();
    const responseInsert = {
      GatewayType: userGateWayData.GatewayType,
      Request: requestOptions,
      Response: data,
      MerchantId: userInfo.id,
    };
    const responseId = await models.ResponseRequestTable.create(responseInsert);
    if (
      data.status === 'success' &&
      data['data'].status === 'declined' &&
      userGateWayData.ProcessorLevel == 'QuantumA' &&
      userGateWayData.ConvenienceFeeActive == true
    ) {
      userGateWayData = await models.MerchantPaymentGateWay.findOne({
        where: {
          [Op.and]: [
            { UserId: userInfo.id },
            { SuggestedMode: 'ACH' },
            { GatewayStatus: true },
            { processorLevel: 'QuantumC' },
          ],
        },
      });
      const requestHeader = {
        'Content-Type': 'application/json',
        Authorization: userGateWayData.GatewayApiKey,
      };
      transaction = {
        type: req.body.TransactionType == '1' ? 'sale' : 'authorize',
        amount: Math.round(total * 100),
        currency: 'USD',
        email_receipt: false,
        email_address: req.body.BillingEmail,
        create_vault_record: true,
        processor_id: userGateWayData.ProcessorId,
        payment_method: { ach: ach },
        billing_address: billingAddress,
        shipping_address: shippingAddress,
      };
      if (
        req.body.PaymentTokenization == true &&
        (customerExist == null || customerExist.GatewayCustomerId == null)
      ) {
        transaction['create_vault_record'] = true;
      } else {
        transaction['create_vault_record'] = false;
      }
      const jsonString = JSON.stringify(transaction);
      const requestOptions = {
        method: 'POST',
        headers: requestHeader,
        body: jsonString,
        redirect: 'follow',
      };
      const requestCreated = {
        GatewayType: userGateWayData.GatewayType,
        Request: requestOptions,
        Response: '',
        MerchantId: userInfo.id,
      };
      await models.ResponseRequestTable.create(requestCreated);
      const response = await fetch(
        `${process.env.FLUIDPAY_API_URL}/api/transaction`,
        requestOptions
      );
      const newDataC = await response.json();
      const responseInsert = {
        GatewayType: userGateWayData.GatewayType,
        Request: requestOptions,
        Response: newDataC,
        MerchantId: userInfo.id,
      };
      const responseId = await models.ResponseRequestTable.create(
        responseInsert
      );
      if (newDataC.status === 'success') {
        const checkCustomer = await exports.achCheckCustomerExist(
          req,
          userInfo.id
        );

        const findCustomer = await models.Customer.findOne({
          where: {
            [Op.and]: [
              { CountryCode: req.body.BillingCountryCode },
              { PhoneNumber: req.body.BillingPhoneNumber },
              { UserId: userInfo.id },
            ],
          },
        });
        if (checkCustomer != 'skip ach') {
          const cardToken = await exports.achCreateFluidToken(
            req,
            userInfo,
            userGateWayData,
            newDataC,
            findCustomer,
            checkCustomer
          );
        }
        await models.ResponseRequestTable.update(
          { CustomerId: findCustomer.id },
          { where: { id: responseId.id } }
        );
        const stateData = await models.States.findOne({
          where: {
            Abbrevation: req.body.BillingState ?? null,
          },
        });
        const countryData = await models.Country.findOne({
          where: {
            Abbrevation: req.body.BillingCountry ?? null,
          },
        });

        const transactionInsert = {
          RoutingNumber: req.body.routing_number,
          AccountNumber: req.body.account_number,
          SecCode: 'ccd',
          AccountType: req.body.account_type,
          isBusinessUserForACH: req.body.isBusinessUserForACH,
          Company: req.body.BillingCompany,
          CustomerId: findCustomer.id,
          MerchantId: userInfo.id,
          TransactionId: newDataC['data'].id,
          Amount: newDataC['data'].amount / 100,
          PaymentMethod: 'ACH',
          Type: req.body.TransactionType,
          BillingEmail: newDataC['data'].billing_address['email'],
          BillingCustomerName: newDataC['data'].billing_address['first_name'],
          BillingAddress: newDataC['data'].billing_address['address_line_1'],
          BillingCity: newDataC['data'].billing_address['city'],
          BillingState: stateData != undefined ? stateData.id : null,
          BillingPostalCode: newDataC['data'].billing_address['postal_code'],
          BillingCountry: countryData != undefined ? countryData.id : null,
          BillingCountryCode: req.body.BillingCountryCode,
          BillingPhoneNumber: newDataC['data'].billing_address['phone'],
          IsShippingSame: req.body.shippingSameAsBilling,
          ShippingEmail: newDataC['data'].billing_address['email'],
          ShippingCustomerName: newDataC['data'].billing_address['first_name'],
          ShippingAddress: newDataC['data'].billing_address['address_line_1'],
          ShippingCity: newDataC['data'].billing_address['city'],
          ShippingState: stateData != undefined ? stateData.id : null,
          ShippingPostalCode: newDataC['data'].billing_address['postal_code'],
          ShippingCountry: countryData != undefined ? countryData.id : null,
          ShippingPhoneNumber: newDataC['data'].billing_address['phone'],
          ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
          ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
          ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
          AuthCode: newDataC['data'].response_body['ach'].auth_code,
          TransactionGateWay: 'FluidPay',
          Refund: false,
          Void: false,
          Capture: false,
          Tokenization: false, // req.body.PaymentTokenization,
          Message: req.body.Message,
          Description: req.body.Description,
          ReferenceNo: req.body.ReferenceNo,
          ConvenienceFeeActive:
            minmumTxn != '' ? minmumTxn : userGateWayData.ConvenienceFeeActive,
          RequestOrigin: req.body.RequestOrigin,
          createdAt: newDataC['data'].created_at,
          updatedAt: newDataC['data'].updated_at,
          ProcessorId: userGateWayData.ProcessorId,
          SuggestedMode:
            req.body.SuggestedMode != undefined
              ? req.body.SuggestedMode
              : 'ACH',
          TipAmount: parseFloat(req.body.TipAmount),
        };
        if (
          newDataC['data'].status == 'pending_settlement' ||
          newDataC['data'].status == 'authorized' ||
          newDataC['data'].status == 'voided'
        ) {
          newDataC['data'].status = '1';
          transactionInsert['Status'] = newDataC['data'].status;
          const transData = await models.Transaction.create(transactionInsert);
          if (req.body.PaymentLinkId != undefined) {
            await exports.sendWebHook(
              undefined,
              transData,
              req.body.PaymentLinkId,
              userInfo.id
            );
          }

          return res.status(200).json({
            status: 'success',
            message: 'Transaction Processed Successfully',
            data: JSON.parse(JSON.stringify(transData)),
          });
        } else if (newDataC['data'].status == 'declined') {
          newDataC['data'].status = '9';
          transactionInsert['Status'] = newDataC['data'].status;
          const transData = await models.Transaction.create(transactionInsert);
          if (req.body.PaymentLinkId != undefined) {
            await exports.sendWebHook(
              `Transaction declined due to ${newDataC['data']['response_body']['ach'].processor_response_text}`,
              transData,
              req.body.PaymentLinkId,
              userInfo.id
            );
          }
          return res.status(200).json({
            status: 'error',
            message: `Transaction declined due to ${newDataC['data']['response_body']['ach'].processor_response_text}`,
            data: JSON.parse(JSON.stringify(transData)),
          });
        } else if (
          newDataC['data'].status == 'failed' ||
          newDataC['data'].status == 'unknown'
        ) {
          newDataC['data'].status = '2';
          transactionInsert['Status'] = newDataC['data'].status;
          const transData = await models.Transaction.create(transactionInsert);
          if (req.body.PaymentLinkId != undefined) {
            await exports.sendWebHook(
              `Transaction declined due to ${newDataC['data']['response_body']['ach'].processor_response_text}`,
              transData,
              req.body.PaymentLinkId,
              userInfo.id
            );
          }
          return res.status(200).json({
            status: 'error',
            message: `Transaction declined due to ${newDataC['data']['response_body']['ach'].processor_response_text}`,
            data: JSON.parse(JSON.stringify(transData)),
          });
        }
      } else {
        return res.status(200).json({
          status: 'error',
          message: data.msg,
          data: JSON.parse(JSON.stringify(data)),
        });
      }
    } else if (
      data.status === 'success' &&
      data['data'].status === 'declined' &&
      userGateWayData.ProcessorLevel == 'QuantumB' &&
      userGateWayData.ConvenienceFeeActive == false
    ) {
      userGateWayData = await models.MerchantPaymentGateWay.findOne({
        where: {
          [Op.and]: [
            { UserId: userInfo.id },
            { SuggestedMode: 'ACH' },
            { GatewayStatus: true },
            { processorLevel: 'QuantumD' },
          ],
        },
      });
      const requestHeader = {
        'Content-Type': 'application/json',
        Authorization: userGateWayData.GatewayApiKey,
      };
      transaction = {
        type: req.body.TransactionType == '1' ? 'sale' : 'authorize',
        amount: Math.round(total * 100),
        currency: 'USD',
        email_receipt: false,
        email_address: req.body.BillingEmail,
        create_vault_record: true,
        processor_id: userGateWayData.ProcessorId,
        payment_method: { ach: ach },
        billing_address: billingAddress,
        shipping_address: shippingAddress,
      };
      if (
        req.body.PaymentTokenization == true &&
        (customerExist == null || customerExist.GatewayCustomerId == null)
      ) {
        transaction['create_vault_record'] = true;
      } else {
        transaction['create_vault_record'] = false;
      }
      const jsonString = JSON.stringify(transaction);
      const requestOptions = {
        method: 'POST',
        headers: requestHeader,
        body: jsonString,
        redirect: 'follow',
      };
      const requestCreated = {
        GatewayType: userGateWayData.GatewayType,
        Request: requestOptions,
        Response: '',
        MerchantId: userInfo.id,
      };
      await models.ResponseRequestTable.create(requestCreated);
      const response = await fetch(
        `${process.env.FLUIDPAY_API_URL}/api/transaction`,
        requestOptions
      );
      const newDataD = await response.json();
      const responseInsert = {
        GatewayType: userGateWayData.GatewayType,
        Request: requestOptions,
        Response: newDataD,
        MerchantId: userInfo.id,
      };
      const responseId = await models.ResponseRequestTable.create(
        responseInsert
      );
      if (newDataD.status === 'success') {
        const checkCustomer = await exports.achCheckCustomerExist(
          req,
          userInfo.id
        );

        const findCustomer = await models.Customer.findOne({
          where: {
            [Op.and]: [
              { CountryCode: req.body.BillingCountryCode },
              { PhoneNumber: req.body.BillingPhoneNumber },
              { UserId: userInfo.id },
            ],
          },
        });
        if (checkCustomer != 'skip ach') {
          const cardToken = await exports.achCreateFluidToken(
            req,
            userInfo,
            userGateWayData,
            newDataD,
            findCustomer,
            checkCustomer
          );
        }
        await models.ResponseRequestTable.update(
          { CustomerId: findCustomer.id },
          { where: { id: responseId.id } }
        );
        const stateData = await models.States.findOne({
          where: {
            Abbrevation: req.body.BillingState ?? null,
          },
        });
        const countryData = await models.Country.findOne({
          where: {
            Abbrevation: req.body.BillingCountry ?? null,
          },
        });
        const transactionInsert = {
          RoutingNumber: req.body.routing_number,
          AccountNumber: req.body.account_number,
          SecCode: 'ccd',
          AccountType: req.body.account_type,
          isBusinessUserForACH: req.body.isBusinessUserForACH,
          Company: req.body.BillingCompany,
          CustomerId: findCustomer.id,
          MerchantId: userInfo.id,
          TransactionId: newDataD['data'].id,
          Amount: newDataD['data'].amount / 100,
          PaymentMethod: paymentMethods,
          Type: req.body.TransactionType,
          BillingEmail: newDataD['data'].billing_address['email'],
          BillingCustomerName: newDataD['data'].billing_address['first_name'],
          BillingAddress: newDataD['data'].billing_address['address_line_1'],
          BillingCity: newDataD['data'].billing_address['city'],
          BillingState: stateData != undefined ? stateData.id : null,
          BillingPostalCode: newDataD['data'].billing_address['postal_code'],
          BillingCountry: countryData != undefined ? countryData.id : null,
          BillingCountryCode: req.body.BillingCountryCode,
          BillingPhoneNumber: newDataD['data'].billing_address['phone'],
          IsShippingSame: req.body.shippingSameAsBilling,
          ShippingEmail: newDataD['data'].billing_address['email'],
          ShippingCustomerName: newDataD['data'].billing_address['first_name'],
          ShippingAddress: newDataD['data'].billing_address['address_line_1'],
          ShippingCity: newDataD['data'].billing_address['city'],
          ShippingState: stateData != undefined ? stateData.id : null,
          ShippingPostalCode: newDataD['data'].billing_address['postal_code'],
          ShippingCountry: countryData != undefined ? countryData.id : null,
          ShippingPhoneNumber: newDataD['data'].billing_address['phone'],
          ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
          ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
          ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
          AuthCode: newDataD['data'].response_body['card'].auth_code,
          TransactionGateWay: 'FluidPay',
          Refund: false,
          Void: false,
          Capture: false,
          Tokenization: false, // req.body.PaymentTokenization,
          Message: req.body.Message,
          Description: req.body.Description,
          ReferenceNo: req.body.ReferenceNo,
          ConvenienceFeeActive:
            minmumTxn != '' ? minmumTxn : userGateWayData.ConvenienceFeeActive,
          RequestOrigin: req.body.RequestOrigin,
          createdAt: newDataD['data'].created_at,
          updatedAt: newDataD['data'].updated_at,
          ProcessorId: userGateWayData.ProcessorId,
          SuggestedMode:
            req.body.SuggestedMode != undefined
              ? req.body.SuggestedMode
              : 'ACH',
          TipAmount: parseFloat(req.body.TipAmount),
        };
        if (
          newDataD['data'].status == 'pending_settlement' ||
          newDataD['data'].status == 'authorized' ||
          newDataD['data'].status == 'voided'
        ) {
          newDataD['data'].status = '1';
          transactionInsert['Status'] = newDataD['data'].status;
          const transData = await models.Transaction.create(transactionInsert);
          if (req.body.PaymentLinkId != undefined) {
            await exports.sendWebHook(
              undefined,
              transData,
              req.body.PaymentLinkId,
              userInfo.id
            );
          }
          return res.status(200).json({
            status: 'success',
            message: 'Transaction Processed Successfully',
            data: JSON.parse(JSON.stringify(transData)),
          });
        } else if (newDataD['data'].status == 'declined') {
          newDataD['data'].status = '9';
          transactionInsert['Status'] = newDataD['data'].status;
          const transData = await models.Transaction.create(transactionInsert);
          if (req.body.PaymentLinkId != undefined) {
            await exports.sendWebHook(
              `Transaction declined due to ${newDataD['data']['response_body']['ach'].processor_response_text}`,
              transData,
              req.body.PaymentLinkId,
              userInfo.id
            );
          }
          return res.status(200).json({
            status: 'error',
            message: `Transaction declined due to ${newDataD['data']['response_body']['ach'].processor_response_text}`,
            data: JSON.parse(JSON.stringify(transData)),
          });
        } else if (
          newDataD['data'].status == 'failed' ||
          newDataD['data'].status == 'unknown'
        ) {
          newDataD['data'].status = '2';
          transactionInsert['Status'] = newDataD['data'].status;
          const transData = await models.Transaction.create(transactionInsert);
          if (req.body.PaymentLinkId != undefined) {
            await exports.sendWebHook(
              `Transaction declined due to ${newDataD['data']['response_body']['ach'].processor_response_text}`,
              transData,
              req.body.PaymentLinkId,
              userInfo.id
            );
          }
          return res.status(200).json({
            status: 'error',
            message: `Transaction declined due to ${newDataD['data']['response_body']['ach'].processor_response_text}`,
            data: JSON.parse(JSON.stringify(transData)),
          });
        }
      } else {
        if (req.body.PaymentLinkId != undefined) {
          await exports.sendWebHook(
            data.msg,
            undefined,
            req.body.PaymentLinkId,
            userInfo.id
          );
        }
        return res.status(200).json({
          status: 'error',
          message: data.msg,
          data: JSON.parse(JSON.stringify(data)),
        });
      }
    } else {
      if (data.status === 'success') {
        const checkCustomer = await exports.achCheckCustomerExist(
          req,
          userInfo.id
        );

        const findCustomer = await models.Customer.findOne({
          where: {
            [Op.and]: [
              { CountryCode: req.body.BillingCountryCode },
              { PhoneNumber: req.body.BillingPhoneNumber },
              { UserId: userInfo.id },
            ],
          },
        });
        if (checkCustomer != 'skip ach') {
          const cardToken = await exports.achCreateFluidToken(
            req,
            userInfo,
            userGateWayData,
            data,
            findCustomer,
            checkCustomer
          );
        }
        await models.ResponseRequestTable.update(
          { CustomerId: findCustomer.id },
          { where: { id: responseId.id } }
        );
        const stateData = await models.States.findOne({
          where: {
            Abbrevation: req.body.BillingState ?? null,
          },
        });
        const countryData = await models.Country.findOne({
          where: {
            Abbrevation: req.body.BillingCountry ?? null,
          },
        });
        const transactionInsert = {
          RoutingNumber: req.body.routing_number,
          AccountNumber: req.body.account_number,
          SecCode: 'ccd',
          AccountType: req.body.account_type,
          isBusinessUserForACH: req.body.isBusinessUserForACH,
          Company: req.body.BillingCompany,
          CustomerId: findCustomer.id,
          MerchantId: userInfo.id,
          TransactionId: data['data'].id,
          Amount: data['data'].amount / 100,
          PaymentMethod: 'ACH',
          Type: req.body.TransactionType,
          BillingEmail: data['data'].billing_address['email'],
          BillingCustomerName: data['data'].billing_address['first_name'],
          BillingAddress: data['data'].billing_address['address_line_1'],
          BillingCity: data['data'].billing_address['city'],
          BillingState: stateData != undefined ? stateData.id : null,
          BillingPostalCode: data['data'].billing_address['postal_code'],
          BillingCountry: countryData != undefined ? countryData.id : null,
          BillingCountryCode: req.body.BillingCountryCode,
          BillingPhoneNumber: data['data'].billing_address['phone'],
          IsShippingSame: req.body.shippingSameAsBilling,
          ShippingEmail: data['data'].billing_address['email'],
          ShippingCustomerName: data['data'].billing_address['first_name'],
          ShippingAddress: data['data'].billing_address['address_line_1'],
          ShippingCity: data['data'].billing_address['city'],
          ShippingState: stateData != undefined ? stateData.id : null,
          ShippingPostalCode: data['data'].billing_address['postal_code'],
          ShippingCountry: countryData != undefined ? countryData.id : null,
          ShippingPhoneNumber: data['data'].billing_address['phone'],
          ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
          ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
          ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
          AuthCode: data['data'].response_body['ach'].auth_code,
          TransactionGateWay: 'FluidPay',
          Refund: false,
          Void: false,
          Capture: false,
          Tokenization: false, // req.body.PaymentTokenization,
          Message: req.body.Message,
          Description: req.body.Description,
          ReferenceNo: req.body.ReferenceNo,
          ConvenienceFeeActive:
            minmumTxn != '' ? minmumTxn : userGateWayData.ConvenienceFeeActive,
          RequestOrigin: req.body.RequestOrigin,
          createdAt: data['data'].created_at,
          updatedAt: data['data'].updated_at,
          ProcessorId: userGateWayData.ProcessorId,
          SuggestedMode:
            req.body.SuggestedMode != undefined
              ? req.body.SuggestedMode
              : 'ACH',
          TipAmount: parseFloat(req.body.TipAmount),
        };
        if (
          data['data'].status == 'pending_settlement' ||
          data['data'].status == 'authorized' ||
          data['data'].status == 'voided'
        ) {
          data['data'].status = '1';
          transactionInsert['Status'] = data['data'].status;
          const transData = await models.Transaction.create(transactionInsert);
          if (req.body.PaymentLinkId != undefined) {
            await exports.sendWebHook(
              undefined,
              transData,
              req.body.PaymentLinkId,
              userInfo.id
            );
          }
          return res.status(200).json({
            status: 'success',
            message: 'Transaction Processed Successfully',
            data: JSON.parse(JSON.stringify(transData)),
          });
        } else if (data['data'].status == 'declined') {
          data['data'].status = '9';
          transactionInsert['Status'] = data['data'].status;
          const transData = await models.Transaction.create(transactionInsert);
          if (req.body.PaymentLinkId != undefined) {
            await exports.sendWebHook(
              `Transaction declined due to ${data['data']['response_body']['ach'].processor_response_text}`,
              transData,
              req.body.PaymentLinkId,
              userInfo.id
            );
          }
          return res.status(200).json({
            status: 'error',
            message: `Transaction declined due to ${data['data']['response_body']['ach'].processor_response_text}`,
            data: JSON.parse(JSON.stringify(transData)),
          });
        } else if (
          data['data'].status == 'failed' ||
          data['data'].status == 'unknown'
        ) {
          data['data'].status = '2';
          transactionInsert['Status'] = data['data'].status;
          const transData = await models.Transaction.create(transactionInsert);
          if (req.body.PaymentLinkId != undefined) {
            await exports.sendWebHook(
              `Transaction declined due to ${data['data']['response_body']['ach'].processor_response_text}`,
              transData,
              req.body.PaymentLinkId,
              userInfo.id
            );
          }
          return res.status(200).json({
            status: 'error',
            message: `Transaction declined due to ${data['data']['response_body']['ach'].processor_response_text}`,
            data: JSON.parse(JSON.stringify(transData)),
          });
        }
      } else {
        if (req.body.PaymentLinkId != undefined) {
          await exports.sendWebHook(
            data.msg,
            undefined,
            req.body.PaymentLinkId,
            userInfo.id
          );
        }
        return res.status(200).json({
          status: 'error',
          message: data.msg,
          data: JSON.parse(JSON.stringify(data)),
        });
      }
    }
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).json({
      status: 'error',
      message: err,
    });
  }
};

exports.achCheckCustomerExist = async (req, merchantId) => {
  let customerAchExist;
  let tokenExist;
  const customerExist = await models.Customer.findOne({
    where: {
      [Op.and]: [
        { CountryCode: req.body.BillingCountryCode },
        { PhoneNumber: req.body.BillingPhoneNumber },
        { UserId: merchantId },
      ],
    },
  });

  if (customerExist != null) {
    customerAchExist = await models.Ach.findOne({
      where: {
        [Op.and]: [
          { RoutingNumber: req.body.routing_number },
          { CustomerId: customerExist.id },
        ],
      },
    });
  }
  const stateData = await models.States.findOne({
    where: {
      Abbrevation: req.body.BillingState ?? null,
    },
  });
  const countryData = await models.Country.findOne({
    where: {
      Abbrevation: req.body.BillingCountry ?? null,
    },
  });
  if (customerExist != undefined) {
    const updateCustomer = await models.Customer.update(
      {
        CustomerName: req.body.BillingCustomerName,
        Address: req.body.BillingAddress,
        City: req.body.BillingCity,
        PostalCode: req.body.BillingPostalCode,
        StateId: stateData != undefined ? stateData.id : null,
        CountryId: countryData != undefined ? countryData.id : null,
        CountryCode: customerExist.CountryCode,
        PhoneNumber: customerExist.PhoneNumber,
        Email: req.body.BillingEmail ?? null,
        UserId: merchantId,
      },
      {
        where: {
          id: customerExist.id,
        },
      }
    );
  } else {
    const customer = {
      CustomerName: req.body.BillingCustomerName,
      Address: req.body.BillingAddress,
      City: req.body.BillingCity,
      PostalCode: req.body.BillingPostalCode,
      StateId: stateData != undefined ? stateData.id : null,
      CountryId: countryData != undefined ? countryData.id : null,
      CountryCode: req.body.BillingCountryCode,
      PhoneNumber: req.body.BillingPhoneNumber,
      Email: req.body.BillingEmail ?? null,
      UserId: merchantId,
    };
    const insertCustomer = await models.Customer.create(customer);
  }
  const findCustomer = await models.Customer.findOne({
    where: {
      [Op.and]: [
        { CountryCode: req.body.BillingCountryCode },
        { PhoneNumber: req.body.BillingPhoneNumber },
        { UserId: merchantId },
      ],
    },
  });

  if (customerAchExist != null) {
    const achObj = {
      CustomerId: findCustomer.id,
      RoutingNumber: req.body.routing_number,
      AccountNumber: req.body.account_number,
      SecCode: 'ccd',
      AccountType: req.body.account_type,
    };
    const updateAch = await models.Ach.update(achObj, {
      where: {
        id: customerAchExist.id,
      },
    });
  } else {
    const achObj = {
      CustomerId: findCustomer.id,
      RoutingNumber: req.body.routing_number,
      AccountNumber: req.body.account_number,
      SecCode: 'ccd',
      AccountType: req.body.account_type,
    };
    const insertAch = await models.Ach.create(achObj);
  }

  if (customerExist != null && customerAchExist != null) {
    return 'skip ach';
  } else if (customerExist != null && customerAchExist == null) {
    return 'New ach for customer';
  } else {
    return 'create ach';
  }
};

exports.achuserGateways = async (req, userInfo, res) => {
  try {
    let total = '';
    let feeAmount = '';
    let minmumTxn = '';
    let userLevel = userInfo.UserLevel;
    let userGateWayData = '';
    let suggestedMode =
      req.body.isAch != undefined || req.body.isAch == true ? 'ACH' : 'Card';
    if (req.body.PaymentLinkId == undefined) {
      userGateWayData = await models.MerchantPaymentGateWay.findOne({
        where: {
          [Op.and]: [
            { UserId: userInfo.id },
            { SuggestedMode: suggestedMode },
            { GatewayStatus: true },
            { ConvenienceFeeActive: req.body.ConvenienceFeeActive },
          ],
        },
      });

      if (
        req.body.ConvenienceFeeActive === true &&
        userGateWayData.GatewayType == 'FluidPay' &&
        userLevel == 'Level1'
      ) {
        userGateWayData = await models.MerchantPaymentGateWay.findOne({
          where: {
            [Op.and]: [
              { UserId: userInfo.id },
              { SuggestedMode: suggestedMode },
              { GatewayStatus: true },
              { ConvenienceFeeActive: req.body.ConvenienceFeeActive },
            ],
          },
        });
        feeAmount = parseFloat(
          exports.getConvenienceFee(
            req.body.Amount,
            userGateWayData.ConvenienceFeeValue,
            userGateWayData.ConvenienceFeeType,
            userGateWayData.ConvenienceFeeMinimum
          )
        );
        total =
          parseFloat(req.body.Amount) +
          parseFloat(feeAmount) +
          parseFloat(req.body.TipAmount);
      } else if (
        req.body.ConvenienceFeeActive === true &&
        userGateWayData.ConvenienceFeeActive === true &&
        userGateWayData.GatewayType == 'FluidPay' &&
        (userLevel == 'Level2' || userLevel == 'Level3')
      ) {
        userGateWayData = await models.MerchantPaymentGateWay.findOne({
          where: {
            [Op.and]: [
              { UserId: userInfo.id },
              { SuggestedMode: suggestedMode },
              { GatewayStatus: true },
              { ConvenienceFeeActive: req.body.ConvenienceFeeActive },
            ],
          },
        });
        feeAmount = parseFloat(
          exports.getConvenienceFee(
            req.body.Amount,
            userGateWayData.ConvenienceFeeValue,
            userGateWayData.ConvenienceFeeType,
            userGateWayData.ConvenienceFeeMinimum
          )
        );
        total =
          parseFloat(req.body.Amount) +
          parseFloat(feeAmount) +
          parseFloat(req.body.TipAmount);
        if (
          parseFloat(feeAmount) <=
            parseFloat(userGateWayData.ConvenienceFeeMinimum) &&
          userGateWayData.ConvenienceFeeType != 'Fixed'
        ) {
          minmumTxn = true;
          userGateWayData = await models.MerchantPaymentGateWay.findOne({
            where: {
              [Op.and]: [
                { UserId: userInfo.id },
                { SuggestedMode: suggestedMode },
                { GatewayStatus: true },
                { ProcessorLevel: 'QuantumB' },
              ],
            },
          });
          if (userGateWayData == null) {
            userGateWayData = await models.MerchantPaymentGateWay.findOne({
              where: {
                [Op.and]: [
                  { UserId: userInfo.id },
                  { SuggestedMode: suggestedMode },
                  { GatewayStatus: true },
                  { ConvenienceFeeActive: req.body.ConvenienceFeeActive },
                ],
              },
            });
          }
        } else {
          userGateWayData = await models.MerchantPaymentGateWay.findOne({
            where: {
              [Op.and]: [
                { UserId: userInfo.id },
                { SuggestedMode: suggestedMode },
                { GatewayStatus: true },
                { ConvenienceFeeActive: req.body.ConvenienceFeeActive },
              ],
            },
          });
        }
      } else if (
        req.body.ConvenienceFeeActive === false &&
        userGateWayData.ConvenienceFeeActive === false &&
        userGateWayData.GatewayType == 'FluidPay' &&
        (userLevel == 'Level2' || userLevel == 'Level3')
      ) {
        feeAmount = parseFloat(0);
        minmumTxn = false;
        total = parseFloat(req.body.Amount) + parseFloat(req.body.TipAmount);
        userGateWayData = await models.MerchantPaymentGateWay.findOne({
          where: {
            [Op.and]: [
              { UserId: userInfo.id },
              { SuggestedMode: suggestedMode },
              { GatewayStatus: true },
              { ProcessorLevel: 'QuantumB' },
            ],
          },
        });
      } else {
        feeAmount = parseFloat(0);
        minmumTxn = false;
        total = parseFloat(req.body.Amount) + parseFloat(req.body.TipAmount);
        userGateWayData = await models.MerchantPaymentGateWay.findOne({
          where: {
            [Op.and]: [
              { UserId: userInfo.id },
              { SuggestedMode: suggestedMode },
              { GatewayStatus: true },
              { ConvenienceFeeActive: req.body.ConvenienceFeeActive },
            ],
          },
        });
      }
    } else {
      const checkFeeActive = await models.PaymentLink.findOne({
        where: { UUID: req.body.PaymentLinkId },
      });

      userGateWayData = await models.MerchantPaymentGateWay.findOne({
        where: {
          [Op.and]: [
            { UserId: userInfo.id },
            { SuggestedMode: suggestedMode },
            { GatewayStatus: true },
            { ConvenienceFeeActive: checkFeeActive.ConvenienceFeeActive },
          ],
        },
      });

      if (
        checkFeeActive.ConvenienceFeeActive === true &&
        userGateWayData.GatewayType == 'FluidPay' &&
        userLevel == 'Level1'
      ) {
        userGateWayData = await models.MerchantPaymentGateWay.findOne({
          where: {
            [Op.and]: [
              { UserId: userInfo.id },
              { SuggestedMode: suggestedMode },
              { GatewayStatus: true },
              { ConvenienceFeeActive: checkFeeActive.ConvenienceFeeActive },
            ],
          },
        });
        feeAmount = parseFloat(
          exports.getConvenienceFee(
            req.body.Amount,
            userGateWayData.ConvenienceFeeValue,
            userGateWayData.ConvenienceFeeType,
            userGateWayData.ConvenienceFeeMinimum
          )
        );
        total =
          parseFloat(req.body.Amount) +
          parseFloat(feeAmount) +
          parseFloat(req.body.TipAmount);
      } else if (
        checkFeeActive.ConvenienceFeeActive === true &&
        userGateWayData.ConvenienceFeeActive === true &&
        userGateWayData.GatewayType == 'FluidPay' &&
        (userLevel == 'Level2' || userLevel == 'Level3')
      ) {
        userGateWayData = await models.MerchantPaymentGateWay.findOne({
          where: {
            [Op.and]: [
              { UserId: userInfo.id },
              { SuggestedMode: suggestedMode },
              { GatewayStatus: true },
              { ConvenienceFeeActive: checkFeeActive.ConvenienceFeeActive },
            ],
          },
        });
        feeAmount = parseFloat(
          exports.getConvenienceFee(
            req.body.Amount,
            userGateWayData.ConvenienceFeeValue,
            userGateWayData.ConvenienceFeeType,
            userGateWayData.ConvenienceFeeMinimum
          )
        );
        total =
          parseFloat(req.body.Amount) +
          parseFloat(feeAmount) +
          parseFloat(req.body.TipAmount);
        if (
          parseFloat(feeAmount) <=
            parseFloat(userGateWayData.ConvenienceFeeMinimum) &&
          userGateWayData.ConvenienceFeeType != 'Fixed'
        ) {
          minmumTxn = true;
          userGateWayData = await models.MerchantPaymentGateWay.findOne({
            where: {
              [Op.and]: [
                { UserId: userInfo.id },
                { SuggestedMode: suggestedMode },
                { GatewayStatus: true },
                { ProcessorLevel: 'QuantumB' },
              ],
            },
          });
          if (userGateWayData == null) {
            userGateWayData = await models.MerchantPaymentGateWay.findOne({
              where: {
                [Op.and]: [
                  { UserId: userInfo.id },
                  { SuggestedMode: suggestedMode },
                  { GatewayStatus: true },
                  { ConvenienceFeeActive: checkFeeActive.ConvenienceFeeActive },
                ],
              },
            });
          }
        } else {
          userGateWayData = await models.MerchantPaymentGateWay.findOne({
            where: {
              [Op.and]: [
                { UserId: userInfo.id },
                { SuggestedMode: suggestedMode },
                { GatewayStatus: true },
                { ConvenienceFeeActive: checkFeeActive.ConvenienceFeeActive },
              ],
            },
          });
        }
      } else if (
        checkFeeActive.ConvenienceFeeActive === false &&
        userGateWayData.ConvenienceFeeActive === false &&
        userGateWayData.GatewayType == 'FluidPay' &&
        (userLevel == 'Level2' || userLevel == 'Level3')
      ) {
        feeAmount = parseFloat(0);
        minmumTxn = false;
        total = parseFloat(req.body.Amount) + parseFloat(req.body.TipAmount);
        userGateWayData = await models.MerchantPaymentGateWay.findOne({
          where: {
            [Op.and]: [
              { UserId: userInfo.id },
              { SuggestedMode: suggestedMode },
              { GatewayStatus: true },
              { ProcessorLevel: 'QuantumB' },
            ],
          },
        });
      } else {
        feeAmount = parseFloat(0);
        minmumTxn = false;
        total = parseFloat(req.body.Amount) + parseFloat(req.body.TipAmount);
        userGateWayData = await models.MerchantPaymentGateWay.findOne({
          where: {
            [Op.and]: [
              { UserId: userInfo.id },
              { SuggestedMode: suggestedMode },
              { GatewayStatus: true },
              { ConvenienceFeeActive: checkFeeActive.ConvenienceFeeActive },
            ],
          },
        });
      }
    }
    return [userGateWayData, total, feeAmount, minmumTxn];
  } catch (err) {
    Sentry.captureException(err);
    return res.status(401).json({ message: err.message });
  }
};

exports.achCreateFluidToken = async (
  req,
  userInfo,
  userGateWayData,
  gatewayData,
  customerData,
  checkCustomer
) => {
  try {
    if (
      checkCustomer == 'New ach for customer' &&
      customerData.GatewayCustomerId == null
    ) {
      await models.Customer.update(
        { GatewayCustomerId: gatewayData['data'].customer_id },
        {
          where: {
            [Op.and]: [{ id: customerData.id }, { UserId: userInfo.id }],
          },
        }
      );
      const findCustomer = await models.Customer.findOne({
        where: { id: customerData.id },
      });
      const requestHeader = {
        'Content-Type': 'application/json',
        Authorization: userGateWayData.GatewayApiKey,
      };
      const requestOptions = {
        method: 'GET',
        headers: requestHeader,
      };
      const response = await fetch(
        `${process.env.FLUIDPAY_API_URL}/api/vault/${findCustomer.GatewayCustomerId}`,
        requestOptions
      );

      const data = await response.json();
      if (data.status === 'success') {
        paymentIdArray = data['data']['data']['customer'].payments.ach;
        for (let i = 0; i < paymentIdArray.length; i++) {
          const existToken = await models.AchTokens.findOne({
            where: { PaymentId: paymentIdArray[i].id },
          });
          if (existToken == null) {
            const token = {
              Tokenid: data['data'].id,
              UserId: userInfo.id,
              CustomerId: customerData.id,
              GatewayCustomerId: data['data'].id,
              GatewayType: userGateWayData.GatewayType,
              RoutingNumber: req.body.routing_number,
              AccountNumber: req.body.account_number,
              SecCode: 'ccd',
              AccountType: req.body.account_type,
              Company: req.body.BillingCompany,
              BillingEmail: req.body.BillingEmail ?? null,
              BillingCustomerName: req.body.BillingCustomerName,
              BillingAddress: req.body.BillingAddress ?? undefined,
              BillingCity: req.body.BillingCity ?? undefined,
              BillingState: req.body.BillingState ?? undefined,
              BillingPostalCode: String(req.body.BillingPostalCode || ''),
              BillingCountry:
                req.body.BillingCountry === 'USA' ? 'US' : undefined,
              BillingCountryCode: req.body.BillingCountryCode,
              BillingPhoneNumber: req.body.BillingPhoneNumber,
              PaymentId: paymentIdArray[i].id,
            };
            const insertData = await models.AchTokens.create(token);
          }
        }
      }
    } else if (
      checkCustomer == 'New ach for customer' &&
      customerData.GatewayCustomerId != null
    ) {
      const requestHeader = {
        'Content-Type': 'application/json',
        Authorization: userGateWayData.GatewayApiKey,
      };
      const jsonString = JSON.stringify({
        AccountNumber: req.body.account_number,
        RoutingNumber: req.body.routing_number,
        AccountType: req.body.account_type,
        SecCode: 'ccd',
      });
      const requestOptions = {
        method: 'POST',
        headers: requestHeader,
        body: jsonString,
      };
      const response = await fetch(
        `${process.env.FLUIDPAY_API_URL}/api/vault/customer/${customerData.GatewayCustomerId}/ach`,
        requestOptions
      );

      const data = await response.json();
      if (data.status === 'success') {
        const existToken = await models.AchTokens.findAll({
          where: { GatewayCustomerId: customerData.GatewayCustomerId },
        });
        paymentIdArray = data['data']['data']['customer'].payments.ach;
        for (let i = 0; i < paymentIdArray.length; i++) {
          const existToken = await models.AchTokens.findOne({
            where: { PaymentId: paymentIdArray[i].id },
          });
          if (existToken == null) {
            const token = {
              Tokenid: data['data'].id,
              UserId: userInfo.id,
              CustomerId: customerData.id,
              GatewayCustomerId: data['data'].id,
              GatewayType: userGateWayData.GatewayType,
              RoutingNumber: req.body.routing_number,
              AccountNumber: req.body.account_number,
              SecCode: 'ccd',
              AccountType: req.body.account_type,
              Company: req.body.BilllingCompany,
              BillingEmail: req.body.BillingEmail ?? null,
              BillingCustomerName: req.body.BillingCustomerName,
              BillingAddress: req.body.BillingAddress ?? undefined,
              BillingCity: req.body.BillingCity ?? undefined,
              BillingState: req.body.BillingState ?? undefined,
              BillingPostalCode: String(req.body.BillingPostalCode || ''),
              BillingCountry:
                req.body.BillingCountry === 'USA' ? 'US' : undefined,
              BillingCountryCode: req.body.BillingCountryCode,
              BillingPhoneNumber: req.body.BillingPhoneNumber,
              PaymentId: paymentIdArray[i].id,
            };
            const insertData = await models.AchTokens.create(token);
          }
        }
      }
    } else if (
      checkCustomer == 'create ach' &&
      customerData.GatewayCustomerId == null
    ) {
      await models.Customer.update(
        { GatewayCustomerId: gatewayData['data'].customer_id },
        {
          where: {
            [Op.and]: [{ id: customerData.id }, { UserId: userInfo.id }],
          },
        }
      );
      const findCustomer = await models.Customer.findOne({
        where: { id: customerData.id },
      });

      const token = {
        Tokenid: gatewayData['data'].customer_id,
        UserId: userInfo.id,
        CustomerId: findCustomer.id,
        GatewayCustomerId: gatewayData['data'].customer_id,
        GatewayType: userGateWayData.GatewayType,
        RoutingNumber: req.body.routing_number,
        AccountNumber: req.body.account_number,
        SecCode: 'ccd',
        AccountType: req.body.account_type,
        Company: req.body.BilllingCompany,
        BillingEmail: req.body.BillingEmail ?? null,
        BillingCustomerName: req.body.BillingCustomerName,
        BillingAddress: req.body.BillingAddress ?? undefined,
        BillingCity: req.body.BillingCity ?? undefined,
        BillingState: req.body.BillingState ?? undefined,
        BillingPostalCode: String(req.body.BillingPostalCode || ''),
        BillingCountry: req.body.BillingCountry === 'USA' ? 'US' : undefined,
        BillingCountryCode: req.body.BillingCountryCode,
        BillingPhoneNumber: req.body.BillingPhoneNumber,
        PaymentId: gatewayData['data'].customer_payment_ID,
      };
      const insertData = await models.AchTokens.create(token);
    }
  } catch (err) {
    Sentry.captureException(err);
    return false;
  }
};

exports.nonQualifiedBulkUpdate = async (req, res) => {
  try {
    let findTxn = '';
    if (req.body.data != undefined && req.body.data.length > 0) {
      const nqMasterData = {
        FileName: req.body.FileName,
        TotalCount: req.body.data.length,
      };
      const nqMasterInsert = await models.NonQualifiedMaster.create(
        nqMasterData
      );

      for (let i = 0; i < req.body.data.length; i++) {
        const findUser = await models.User.findOne({
          where: { UUID: req.body.data[i].MerchantId },
        });
        findTxn = await models.Transaction.findOne({
          where: { TransactionId: req.body.data[i].TransactionId },
        });
        if (findTxn != null) {
          if (req.body.data[i].selection === true) {
            const updateTxn = await models.Transaction.update(
              { NonQualified: true },
              {
                where: { id: findTxn.id },
              }
            );
          }
          const nqChildData = {
            NonQualifiedMasterId: nqMasterInsert.id,
            TransactionId: req.body.data[i].TransactionId,
            MerchantName: findUser.FullName,
            Status: req.body.data[i].selection,
          };
          const nqChildInsert = await models.NonQualifiedChild.create(
            nqChildData
          );
        }
      }
      res.status(200).json({
        message: 'File Updation completed',
      });
    } else {
      Sentry.captureException('File is empty');
      res.status(400).json({
        message: 'File is empty',
      });
    }
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).json({
      message: 'Something went wrong',
      error: err,
    });
  }
};

exports.getAllNonQualifiedFiles = async (req, res) => {
  try {
    const limit =
      req.query.perPage == undefined || NaN ? 10 : parseInt(req.query.perPage);
    console.log(limit);
    const offset =
      req.query.page == undefined || NaN ? 0 : parseInt(req.query.page) - 1;
    const skipRecord = Math.ceil(offset * limit);
    const sortOrder = req.query.sort === undefined ? 'asc' : req.query.sort;
    const sortColumn =
      req.query.sortColumn === undefined ? 'FileName' : req.query.sortColumn;

    const nqList = await models.NonQualifiedMaster.findAndCountAll({
      where: {
        FileName: { [Op.ne]: null },
      },
      order: [[sortColumn, sortOrder]],
      limit: limit,
      offset: skipRecord,
    });
    const totalPages = Math.ceil(nqList['count'] / limit);
    res.status(200).json({
      message: 'Data found successfully',
      data: nqList,
      paging: {
        pages: totalPages,
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).json({
      message: 'Something went wrong',
      error: err,
    });
  }
};

exports.getNqFileById = async (req, res) => {
  try {
    const findNqMaster = await models.NonQualifiedMaster.findOne({
      where: { UUID: req.params.id },
    });
    const findNqData = await models.NonQualifiedChild.findAll({
      include: {
        model: models.NonQualifiedMaster,
      },
      where: { NonQualifiedMasterId: findNqMaster.id },
    });
    for (let i = 0; i < findNqData.length; i++) {
      const transactionData = await models.Transaction.findOne({
        where: { TransactionId: findNqData[i].TransactionId },
      });
      findNqData[i].setDataValue('transactionData', transactionData);
    }

    res.status(200).json({
      message: 'Data found successfully',
      data: findNqData,
    });
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).json({
      message: 'Something went wrong',
      error: err,
    });
  }
};

exports.chargeBackBulkUpdate = async (req, res) => {
  try {
    let findTxn = '';
    if (req.body.data != undefined && req.body.data.length > 0) {
      const chMasterData = {
        FileName: req.body.FileName,
        TotalCount: req.body.data.length,
      };
      const chMasterInsert = await models.ChargeBackMaster.create(chMasterData);

      for (let i = 0; i < req.body.data.length; i++) {
        const findUser = await models.User.findOne({
          where: { UUID: req.body.data[i].MerchantId },
        });
        findTxn = await models.Transaction.findOne({
          where: { TransactionId: req.body.data[i].TransactionId },
        });
        if (findTxn != null) {
          if (req.body.data[i].selection === true) {
            const updateTxn = await models.Transaction.update(
              { ChargeBack: true, ChargeBackDate: new Date() },
              {
                where: { id: findTxn.id },
              }
            );
          }
          const chChildData = {
            ChargeBackMasterId: chMasterInsert.id,
            TransactionId: req.body.data[i].TransactionId,
            MerchantName: findUser.FullName,
            ChargeBackDate: new Date(),
            Status: req.body.data[i].selection,
          };
          const chChildInsert = await models.ChargeBackChild.create(
            chChildData
          );
        }
      }
      res.status(200).json({
        message: 'File Updation completed',
      });
    } else {
      Sentry.captureException('File is empty');
      res.status(400).json({
        message: 'File is empty',
      });
    }
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).json({
      message: 'Something went wrong',
      error: err,
    });
  }
};

exports.getAllChargeBackFiles = async (req, res) => {
  try {
    const limit =
      req.query.perPage == undefined || NaN ? 10 : parseInt(req.query.perPage);
    console.log(limit);
    const offset =
      req.query.page == undefined || NaN ? 0 : parseInt(req.query.page) - 1;
    const skipRecord = Math.ceil(offset * limit);
    const sortOrder = req.query.sort === undefined ? 'asc' : req.query.sort;
    const sortColumn =
      req.query.sortColumn === undefined ? 'FileName' : req.query.sortColumn;

    const chList = await models.ChargeBackMaster.findAndCountAll({
      where: {
        FileName: { [Op.ne]: null },
      },
      order: [[sortColumn, sortOrder]],
      limit: limit,
      offset: skipRecord,
    });
    const totalPages = Math.ceil(chList['count'] / limit);
    res.status(200).json({
      message: 'Data found successfully',
      data: chList,
      paging: {
        pages: totalPages,
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).json({
      message: 'Something went wrong',
      error: err,
    });
  }
};

exports.getChargeBackFileById = async (req, res) => {
  try {
    const findChMaster = await models.ChargeBackMaster.findOne({
      where: { UUID: req.params.id },
    });
    const findChData = await models.ChargeBackChild.findAll({
      include: {
        model: models.ChargeBackMaster,
      },
      where: { ChargeBackMasterId: findChMaster.id },
    });
    for (let i = 0; i < findChData.length; i++) {
      const transactionData = await models.Transaction.findOne({
        where: { TransactionId: findChData[i].TransactionId },
      });
      findChData[i].setDataValue('transactionData', transactionData);
    }
    res.status(200).json({
      message: 'Data found successfully',
      data: findChData,
    });
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).json({
      message: 'Something went wrong',
      error: err,
    });
  }
};

// ========================================= Authorizenet ========================================= //
exports.getTxnStatusForAuthorizenet = (status) => {
  const Status = {
    1: 'Approved',
    2: 'Declined',
    3: 'Error',
    4: 'Held for Review',
  };
  return Status[status];
};

exports.getAuthorizenetCardBrands = (brand) => {
  const methods = {
    AmericanExpress: '1',
    Visa: '2',
    Mastercard: '3',
    DinersClub: '4',
    Discover: '5',
    JCB: '6',
    eCheck: '7',
  };
  return methods[brand];
};

exports.authorizenetTransaction = async (
  req,
  userInfo,
  userGateWayData,
  total,
  feeAmount,
  minmumTxn,
  res
) => {
  try {
    const customerExist = await models.Customer.findOne({
      where: {
        [Op.and]: [
          { CountryCode: req.body.BillingCountryCode },
          { PhoneNumber: req.body.BillingPhoneNumber },
          { UserId: userInfo.id },
        ],
      },
    });
    // create customer profile in authorizenet GatewayCustomerId as customerProfileId
    if (
      req.body.PaymentTokenization == true &&
      (customerExist == null || customerExist.GatewayCustomerId == null)
    ) {
      let customerData = exports.AuthorizenetCreateCustomerProfile(
        req,
        userInfo,
        userGateWayData,
        customerExist,
        res
      );
    }
    var merchantAuthenticationType =
      new ApiContracts.MerchantAuthenticationType();
    merchantAuthenticationType.setName(userGateWayData.GatewayApiKey);
    merchantAuthenticationType.setTransactionKey(
      userGateWayData.AuthTransactionKey
    );

    var creditCard = new ApiContracts.CreditCardType();
    creditCard.setCardNumber(req.body.CardNumber);
    creditCard.setExpirationDate(req.body.ExpiryDate);
    creditCard.setCardCode(req.body.Cvv);

    var paymentType = new ApiContracts.PaymentType();
    paymentType.setCreditCard(creditCard);

    var orderDetails = new ApiContracts.OrderType();
    orderDetails.setInvoiceNumber(req.body.InvoiceNumber);
    orderDetails.setDescription(req.body.Description);

    var billTo = new ApiContracts.CustomerAddressType();
    billTo.setFirstName(req.body.BillingCustomerName);
    billTo.setCompany(req.body.BillingCompany);
    billTo.setAddress(req.body.BillingAddress);
    billTo.setCity(req.body.BillingCity);
    billTo.setState(req.body.BillingState);
    billTo.setZip(req.body.BillingPostalCode);
    billTo.setCountry(req.body.BillingCountry);

    var shipTo = new ApiContracts.CustomerAddressType();
    if (
      req.body.shippingSameAsBilling != undefined &&
      req.body.shippingSameAsBilling == true
    ) {
      shipTo.setFirstName(req.body.BillingCustomerName);
      shipTo.setCompany(req.body.BillingCompany);
      shipTo.setAddress(req.body.BillingAddress);
      shipTo.setCity(req.body.BillingCity);
      shipTo.setState(req.body.BillingState);
      shipTo.setZip(req.body.BillingPostalCode);
      shipTo.setCountry(req.body.BillingCountry);
    } else {
      shipTo.setFirstName(req.body.BillingCustomerName);
      shipTo.setCompany(req.body.ShippingCompany);
      shipTo.setAddress(req.body.ShippingAddress);
      shipTo.setCity(req.body.ShippingCity);
      shipTo.setState(req.body.ShippingState);
      shipTo.setZip(req.body.ShippingPostalCode);
      shipTo.setCountry(req.body.ShippingCountry);
    }
    const transactionType =
      req.body.TransactionType == '1'
        ? ApiContracts.TransactionTypeEnum.AUTHCAPTURETRANSACTION
        : ApiContracts.TransactionTypeEnum.AUTHONLYTRANSACTION;

    var transactionRequestType = new ApiContracts.TransactionRequestType();
    transactionRequestType.setTransactionType(transactionType);
    transactionRequestType.setPayment(paymentType);
    transactionRequestType.setAmount(parseFloat(total));
    transactionRequestType.setOrder(orderDetails);
    transactionRequestType.setBillTo(billTo);
    transactionRequestType.setShipTo(shipTo);

    var createRequest = new ApiContracts.CreateTransactionRequest();
    createRequest.setMerchantAuthentication(merchantAuthenticationType);
    createRequest.setTransactionRequest(transactionRequestType);

    console.log(
      '========================= Transaction request ========================='
    );
    console.log(JSON.stringify(createRequest.getJSON(), null, 2));
    const requestCreated = {
      GatewayType: userGateWayData.GatewayType,
      Request: createRequest,
      Response: '',
      MerchantId: userInfo.id,
    };
    await models.ResponseRequestTable.create(requestCreated);

    var ctrl = new ApiControllers.CreateTransactionController(
      createRequest.getJSON()
    );

    await ctrl.execute(async function () {
      var apiResponse = ctrl.getResponse();
      var response = new ApiContracts.CreateTransactionResponse(apiResponse);
      console.log(
        '========================= Transaction success response ========================='
      );
      console.log(JSON.stringify(response, null, 2));
      const responseInsert = {
        GatewayType: userGateWayData.GatewayType,
        Request: createRequest,
        Response: response,
        MerchantId: userInfo.id,
      };
      const responseId = await models.ResponseRequestTable.create(
        responseInsert
      );
      if (response != null) {
        if (
          response.getMessages().getResultCode() ==
          ApiContracts.MessageTypeEnum.OK
        ) {
          const checkCustomer = await exports.checkCustomerExist(
            req,
            userInfo.id
          );
          const findCustomer = await models.Customer.findOne({
            where: {
              [Op.and]: [
                { CountryCode: req.body.BillingCountryCode },
                { PhoneNumber: req.body.BillingPhoneNumber },
                { UserId: userInfo.id },
              ],
            },
          });
          if (checkCustomer != 'skip Token') {
            // const cardToken = await exports.AuthorizeCreateToken(
            //   req,
            //   userInfo,
            //   userGateWayData,
            //   data,
            //   findCustomer,
            //   checkCustomer
            // );
          }
          await models.ResponseRequestTable.update(
            { CustomerId: findCustomer.id },
            { where: { id: responseId.id } }
          );

          const stateData = await models.States.findOne({
            where: {
              Abbrevation: req.body.BillingState ?? null,
            },
          });
          const countryData = await models.Country.findOne({
            where: {
              Abbrevation: req.body.BillingCountry ?? null,
            },
          });
          const paymentMethods = exports.getAuthorizenetCardBrands(
            response.transactionResponse.accountType
          );
          const transactionInsert = {
            CustomerId: findCustomer.id,
            MerchantId: userInfo.id,
            TransactionId: response.transactionResponse.transId,
            RefTransId: response.transactionResponse.refTransId,
            Amount: parseFloat(total),
            CardNumber: response.transactionResponse.accountNumber.substr(
              response.transactionResponse.accountNumber.length - 4
            ),
            Type: req.body.TransactionType,
            ExpiryDate: req.body.ExpiryDate.replace(/\s/g, '').replace(
              /\\|\//g,
              ''
            ),
            Cvv: req.body.Cvv,
            Type: req.body.TransactionType,
            PaymentMethod: paymentMethods,
            BillingEmail: req.body.BillingEmail,
            BillingCustomerName: req.body.BillingCustomerName,
            BillingAddress: req.body.BillingAddress,
            BillingCity: req.body.BillingCity,
            BillingState: stateData != undefined ? stateData.id : null,
            BillingPostalCode: req.body.BillingPostalCode,
            BillingCountry: countryData != undefined ? countryData.id : null,
            BillingCountryCode: req.body.BillingCountryCode,
            BillingPhoneNumber: req.body.BillingPhoneNumber,
            IsShippingSame: req.body.shippingSameAsBilling,
            ShippingEmail: req.body.ShippingEmail,
            ShippingCustomerName: req.body.BillingCustomerName,
            ShippingAddress: req.body.ShippingAddress,
            ShippingCity: req.body.ShippingCity,
            ShippingState: stateData != undefined ? stateData.id : null,
            ShippingPostalCode: req.body.ShippingPostalCode,
            ShippingCountry: countryData != undefined ? countryData.id : null,
            ShippingPhoneNumber: req.body.ShippingPhoneNumber,
            ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
            AuthCode: response.transactionResponse.authCode,
            TransactionGateWay: 'Authorizenet',
            Refund: false,
            Void: false,
            Capture: false,
            Tokenization: req.body.PaymentTokenization,
            Message: req.body.Message,
            Description: req.body.Description,
            ReferenceNo: req.body.ReferenceNo,
            ConvenienceFeeActive:
              minmumTxn != ''
                ? minmumTxn
                : userGateWayData.ConvenienceFeeActive,
            RequestOrigin: req.body.RequestOrigin,
            createdAt: new Date(),
            updatedAt: new Date(),
            ProcessorId: userGateWayData.ProcessorId,
            SuggestedMode:
              req.body.SuggestedMode != undefined
                ? req.body.SuggestedMode
                : 'Card',
            TipAmount: parseFloat(req.body.TipAmount),
          };

          let status = exports.getTxnStatusForAuthorizenet(
            response.getTransactionResponse().getResponseCode()
          );
          if (status == 'Approved') {
            transactionInsert['Status'] = '1';
            const transData = await models.Transaction.create(
              transactionInsert
            );
            if (req.body.PaymentLinkId != undefined) {
              await exports.sendWebHook(
                undefined,
                transData,
                req.body.PaymentLinkId,
                userInfo.id
              );
            }
            return res.status(200).json({
              status: 'success',
              message: 'Transaction Completed Successfully',
              data: transData,
            });
          } else if (status == 'Declined') {
            // Need to change error message
            transactionInsert['Status'] = '9';
            const transData = await models.Transaction.create(
              transactionInsert
            );
            if (req.body.PaymentLinkId != undefined) {
              await exports.sendWebHook(
                response
                  .getTransactionResponse()
                  .getMessages()
                  .getMessage()[0]
                  .getDescription(),
                transData,
                req.body.PaymentLinkId,
                userInfo.id
              );
            }
            return res.status(200).json({
              status: 'error',
              message: status,
              data: JSON.parse(JSON.stringify(transData)),
            });
          } else if (status == 'Error') {
            transactionInsert['Status'] = '2';
            const transData = await models.Transaction.create(
              transactionInsert
            );
            if (req.body.PaymentLinkId != undefined) {
              await exports.sendWebHook(
                response
                  .getTransactionResponse()
                  .getMessages()
                  .getMessage()[0]
                  .getDescription(),
                transData,
                req.body.PaymentLinkId,
                userInfo.id
              );
            }
            return res.status(200).json({
              status: 'error',
              message: status,
              data: JSON.parse(JSON.stringify(transData)),
            });
          } else if (status == 'Held for Review') {
            // Need to change error message
            transactionInsert['Status'] = '0';
            const transData = await models.Transaction.create(
              transactionInsert
            );
            if (req.body.PaymentLinkId != undefined) {
              await exports.sendWebHook(
                response
                  .getTransactionResponse()
                  .getMessages()
                  .getMessage()[0]
                  .getDescription(),
                transData,
                req.body.PaymentLinkId,
                userInfo.id
              );
            }
            return res.status(200).json({
              status: 'error',
              message: status,
              data: JSON.parse(JSON.stringify(transData)),
            });
          }
        } else {
          let errorCode = response
            .getTransactionResponse()
            .getErrors()
            .getError()[0]
            .getErrorCode();
          let errorText = response
            .getTransactionResponse()
            .getErrors()
            .getError()[0]
            .getErrorText();
          if (req.body.PaymentLinkId != undefined) {
            await exports.sendWebHook(
              data.msg,
              undefined,
              req.body.PaymentLinkId,
              userInfo.id
            );
          }
          return res.status(500).json({
            status: errorCode,
            message: errorText,
            data: null,
          });
        }
      } else {
        return res.status(200).json({
          status: 200,
          message: 'Null Response',
        });
      }
    });
  } catch (error) {
    console.log(error);
    Sentry.captureException(error);
    return res.status(500).json({
      status: 'error',
      message: error,
    });
  }
};

exports.checkCardType = async (cardNumber) => {
  return await new Promise(async (resolve, reject) => {
    let config = {
      method: 'get',
      url: `https://api.iinlist.com/cards?iin=${cardNumber}`,
      headers: {
        'X-API-Key': process.env.X_API_Key,
      },
    };
    const resp = await axios(config);
    resolve(resp.data);
  });
};

exports.authorizenetTransactionThree = async (
  req,
  userInfo,
  userGateWayData,
  total,
  feeAmount,
  minmumTxn,
  res
) => {
  try {
    const customerExist = await models.Customer.findOne({
      where: {
        [Op.and]: [
          { CountryCode: req.body.BillingCountryCode },
          { PhoneNumber: req.body.BillingPhoneNumber },
          { UserId: userInfo.id },
        ],
      },
    });
    // create customer profile in authorizenet GatewayCustomerId as customerProfileId

    if (
      req.body.PaymentTokenization == true &&
      (customerExist == null || customerExist.GatewayCustomerId == null)
    ) {
      let customerData = exports.AuthorizenetCreateCustomerProfile(
        req,
        userInfo,
        userGateWayData,
        customerExist,
        res
      );
    }
    let cardNumber = req.body.CardNumber.substring(0, 8);
    const cardTypeData = await exports.checkCardType(cardNumber);
    let cardType = cardTypeData._embedded.cards[0].account.funding;
    let processorLvl;
    if (cardType === 'debit' && userGateWayData.ConvenienceFeeActive == true) {
      processorLvl = 'QuantumA';
    } else if (
      cardType === 'debit' &&
      userGateWayData.ConvenienceFeeActive == false
    ) {
      processorLvl = 'QuantumB';
    } else if (
      cardType === 'credit' &&
      userGateWayData.ConvenienceFeeActive == true
    ) {
      processorLvl = 'QuantumC';
    } else if (
      cardType === 'credit' &&
      userGateWayData.ConvenienceFeeActive == false
    ) {
      processorLvl = 'QuantumD';
    }
    // res.status(200).json(cardType)
    gatewayData = await models.MerchantPaymentGateWay.findOne({
      where: {
        [Op.and]: [
          { processorLevel: processorLvl },
          { UserId: userInfo.id },
          { SuggestedMode: 'Card' },
          { GatewayStatus: true },
        ],
      },
    });

    var merchantAuthenticationType =
      new ApiContracts.MerchantAuthenticationType();
    merchantAuthenticationType.setName(gatewayData.GatewayApiKey);
    merchantAuthenticationType.setTransactionKey(
      gatewayData.AuthTransactionKey
    );

    var creditCard = new ApiContracts.CreditCardType();
    creditCard.setCardNumber(req.body.CardNumber);
    creditCard.setExpirationDate(req.body.ExpiryDate);
    creditCard.setCardCode(req.body.Cvv);

    var paymentType = new ApiContracts.PaymentType();
    paymentType.setCreditCard(creditCard);

    var orderDetails = new ApiContracts.OrderType();
    orderDetails.setInvoiceNumber(req.body.InvoiceNumber);
    orderDetails.setDescription(req.body.Description);

    var billTo = new ApiContracts.CustomerAddressType();
    billTo.setFirstName(req.body.BillingCustomerName);
    billTo.setCompany(req.body.BillingCompany);
    billTo.setAddress(req.body.BillingAddress);
    billTo.setCity(req.body.BillingCity);
    billTo.setState(req.body.BillingState);
    billTo.setZip(req.body.BillingPostalCode);
    billTo.setCountry(req.body.BillingCountry);

    var shipTo = new ApiContracts.CustomerAddressType();

    if (
      req.body.shippingSameAsBilling != undefined &&
      req.body.shippingSameAsBilling == true
    ) {
      shipTo.setFirstName(req.body.BillingCustomerName);
      shipTo.setCompany(req.body.BillingCompany);
      shipTo.setAddress(req.body.BillingAddress);
      shipTo.setCity(req.body.BillingCity);
      shipTo.setState(req.body.BillingState);
      shipTo.setZip(req.body.BillingPostalCode);
      shipTo.setCountry(req.body.BillingCountry);
    } else {
      shipTo.setFirstName(req.body.BillingCustomerName);
      shipTo.setCompany(req.body.ShippingCompany);
      shipTo.setAddress(req.body.ShippingAddress);
      shipTo.setCity(req.body.ShippingCity);
      shipTo.setState(req.body.ShippingState);
      shipTo.setZip(req.body.ShippingPostalCode);
      shipTo.setCountry(req.body.ShippingCountry);
    }

    const transactionType =
      req.body.TransactionType == '1'
        ? ApiContracts.TransactionTypeEnum.AUTHCAPTURETRANSACTION
        : ApiContracts.TransactionTypeEnum.AUTHONLYTRANSACTION;

    var transactionRequestType = new ApiContracts.TransactionRequestType();
    transactionRequestType.setTransactionType(transactionType);
    transactionRequestType.setPayment(paymentType);
    transactionRequestType.setAmount(parseFloat(total));
    transactionRequestType.setOrder(orderDetails);
    transactionRequestType.setBillTo(billTo);
    transactionRequestType.setShipTo(shipTo);

    var createRequest = new ApiContracts.CreateTransactionRequest();
    createRequest.setMerchantAuthentication(merchantAuthenticationType);
    createRequest.setTransactionRequest(transactionRequestType);

    console.log(
      '========================= Transaction request ========================='
    );
    // console.log(JSON.stringify(createRequest.getJSON(), null, 2));
    const requestCreated = {
      GatewayType: userGateWayData.GatewayType,
      Request: createRequest,
      Response: '',
      MerchantId: userInfo.id,
    };
    await models.ResponseRequestTable.create(requestCreated);

    var ctrl = new ApiControllers.CreateTransactionController(
      createRequest.getJSON()
    );

    var apiResponse = ctrl.getResponse();
    var response = new ApiContracts.CreateTransactionResponse(apiResponse);
    // res.status(200).json({data: "ok"})
    console.log(
      '========================= Transaction success response ========================='
    );
    await ctrl.execute(async function () {
      console.log(JSON.stringify(response, null, 2));
      const responseInsert = {
        GatewayType: userGateWayData.GatewayType,
        Request: createRequest,
        Response: response,
        MerchantId: userInfo.id,
      };
      const responseId = await models.ResponseRequestTable.create(
        responseInsert
      );
      if (response != null) {
        if (
          response.getMessages().getResultCode() ==
          ApiContracts.MessageTypeEnum.OK
        ) {
          const checkCustomer = await exports.checkCustomerExist(
            req,
            userInfo.id
          );
          const findCustomer = await models.Customer.findOne({
            where: {
              [Op.and]: [
                { CountryCode: req.body.BillingCountryCode },
                { PhoneNumber: req.body.BillingPhoneNumber },
                { UserId: userInfo.id },
              ],
            },
          });
          if (checkCustomer != 'skip Token') {
            // const cardToken = await exports.AuthorizeCreateToken(
            //   req,
            //   userInfo,
            //   userGateWayData,
            //   data,
            //   findCustomer,
            //   checkCustomer
            // );
          }
          await models.ResponseRequestTable.update(
            { CustomerId: findCustomer.id },
            { where: { id: responseId.id } }
          );

          const stateData = await models.States.findOne({
            where: {
              Abbrevation: req.body.BillingState ?? null,
            },
          });
          const countryData = await models.Country.findOne({
            where: {
              Abbrevation: req.body.BillingCountry ?? null,
            },
          });
          const paymentMethods = exports.getAuthorizenetCardBrands(
            response.transactionResponse.accountType
          );

          // const cardType = await exports.checkCardType(req.body.CardNumber);

          const transactionInsert = {
            CustomerId: findCustomer.id,
            MerchantId: userInfo.id,
            TransactionId: response.transactionResponse.transId,
            RefTransId: response.transactionResponse.refTransId,
            Amount: parseFloat(total),
            CardNumber: response.transactionResponse.accountNumber.substr(
              response.transactionResponse.accountNumber.length - 4
            ),
            Type: req.body.TransactionType,
            ExpiryDate: req.body.ExpiryDate.replace(/\s/g, '').replace(
              /\\|\//g,
              ''
            ),
            Cvv: req.body.Cvv,
            Type: req.body.TransactionType,
            PaymentMethod: paymentMethods,
            BillingEmail: req.body.BillingEmail,
            BillingCustomerName: req.body.BillingCustomerName,
            BillingAddress: req.body.BillingAddress,
            BillingCity: req.body.BillingCity,
            BillingState: stateData != undefined ? stateData.id : null,
            BillingPostalCode: req.body.BillingPostalCode,
            BillingCountry: countryData != undefined ? countryData.id : null,
            BillingCountryCode: req.body.BillingCountryCode,
            BillingPhoneNumber: req.body.BillingPhoneNumber,
            IsShippingSame: req.body.shippingSameAsBilling,
            ShippingEmail: req.body.ShippingEmail,
            ShippingCustomerName: req.body.BillingCustomerName,
            ShippingAddress: req.body.ShippingAddress,
            ShippingCity: req.body.ShippingCity,
            ShippingState: stateData != undefined ? stateData.id : null,
            ShippingPostalCode: req.body.ShippingPostalCode,
            ShippingCountry: countryData != undefined ? countryData.id : null,
            ShippingPhoneNumber: req.body.ShippingPhoneNumber,
            ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
            AuthCode: response.transactionResponse.authCode,
            TransactionGateWay: 'Authorizenet',
            Refund: false,
            Void: false,
            Capture: false,
            Tokenization: req.body.PaymentTokenization,
            Message: req.body.Message,
            Description: req.body.Description,
            ReferenceNo: req.body.ReferenceNo,
            ConvenienceFeeActive:
              minmumTxn != ''
                ? minmumTxn
                : userGateWayData.ConvenienceFeeActive,
            RequestOrigin: req.body.RequestOrigin,
            createdAt: new Date(),
            updatedAt: new Date(),
            ProcessorId: userGateWayData.ProcessorId,
            SuggestedMode:
              req.body.SuggestedMode != undefined
                ? req.body.SuggestedMode
                : 'Card',
            TipAmount: parseFloat(req.body.TipAmount),
          };

          let status = exports.getTxnStatusForAuthorizenet(
            response.getTransactionResponse().getResponseCode()
          );
          if (status == 'Approved') {
            transactionInsert['Status'] = '1';
            const transData = await models.Transaction.create(
              transactionInsert
            );
            if (req.body.PaymentLinkId != undefined) {
              await exports.sendWebHook(
                undefined,
                transData,
                req.body.PaymentLinkId,
                userInfo.id
              );
            }
            return res.status(200).json({
              status: 'success',
              message: 'Transaction Completed Successfully',
              data: transData,
            });
          } else if (status == 'Declined') {
            // Need to change error message
            transactionInsert['Status'] = '9';
            const transData = await models.Transaction.create(
              transactionInsert
            );
            if (req.body.PaymentLinkId != undefined) {
              await exports.sendWebHook(
                response
                  .getTransactionResponse()
                  .getMessages()
                  .getMessage()[0]
                  .getDescription(),
                transData,
                req.body.PaymentLinkId,
                userInfo.id
              );
            }
            return res.status(200).json({
              status: 'error',
              message: status,
              data: JSON.parse(JSON.stringify(transData)),
            });
          } else if (status == 'Error') {
            transactionInsert['Status'] = '2';
            const transData = await models.Transaction.create(
              transactionInsert
            );
            if (req.body.PaymentLinkId != undefined) {
              await exports.sendWebHook(
                response
                  .getTransactionResponse()
                  .getMessages()
                  .getMessage()[0]
                  .getDescription(),
                transData,
                req.body.PaymentLinkId,
                userInfo.id
              );
            }
            return res.status(200).json({
              status: 'error',
              message: status,
              data: JSON.parse(JSON.stringify(transData)),
            });
          } else if (status == 'Held for Review') {
            // Need to change error message
            transactionInsert['Status'] = '0';
            const transData = await models.Transaction.create(
              transactionInsert
            );
            if (req.body.PaymentLinkId != undefined) {
              await exports.sendWebHook(
                response
                  .getTransactionResponse()
                  .getMessages()
                  .getMessage()[0]
                  .getDescription(),
                transData,
                req.body.PaymentLinkId,
                userInfo.id
              );
            }
            return res.status(200).json({
              status: 'error',
              message: status,
              data: JSON.parse(JSON.stringify(transData)),
            });
          }
        } else {
          let errorCode = response
            .getTransactionResponse()
            .getErrors()
            .getError()[0]
            .getErrorCode();
          let errorText = response
            .getTransactionResponse()
            .getErrors()
            .getError()[0]
            .getErrorText();
          if (req.body.PaymentLinkId != undefined) {
            await exports.sendWebHook(
              data.msg,
              undefined,
              req.body.PaymentLinkId,
              userInfo.id
            );
          }
          return res.status(500).json({
            status: errorCode,
            message: errorText,
            data: null,
          });
        }
      } else {
        return res.status(200).json({
          status: 200,
          message: 'Null Response',
        });
      }
    });
  } catch (error) {
    console.log(error);
    Sentry.captureException(error);
    return res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

exports.AuthorizenetVoidTransactions = async (
  req,
  userIdData,
  userGateWayData,
  transactionId,
  res
) => {
  try {
    if (
      req.body.TransactionId != undefined &&
      req.body.MerchantId != undefined
    ) {
      var merchantAuthenticationType =
        new ApiContracts.MerchantAuthenticationType();
      merchantAuthenticationType.setName(userGateWayData.GatewayApiKey);
      merchantAuthenticationType.setTransactionKey(
        userGateWayData.AuthTransactionKey
      );

      var transactionRequestType = new ApiContracts.TransactionRequestType();
      transactionRequestType.setTransactionType(
        ApiContracts.TransactionTypeEnum.VOIDTRANSACTION
      );
      transactionRequestType.setRefTransId(req.body.TransactionId);

      var createRequest = new ApiContracts.CreateTransactionRequest();
      createRequest.setMerchantAuthentication(merchantAuthenticationType);
      createRequest.setTransactionRequest(transactionRequestType);

      //pretty print request
      console.log(JSON.stringify(createRequest.getJSON(), null, 2));
      let ctrl = new ApiControllers.CreateTransactionController(
        createRequest.getJSON()
      );
      const requestCreated = {
        GatewayType: userGateWayData.GatewayType,
        Request: createRequest,
        Response: '',
        MerchantId: userIdData.id,
      };
      await models.ResponseRequestTable.create(requestCreated);

      ctrl.execute(async function () {
        var apiResponse = ctrl.getResponse();
        var response = new ApiContracts.CreateTransactionResponse(apiResponse);
        //pretty print response
        console.log(JSON.stringify(response, null, 2));
        const RequestResponse = {
          GatewayType: userGateWayData.GatewayType,
          Request: createRequest,
          Response: response,
          MerchantId: userIdData.id,
        };
        const resCreated = await models.ResponseRequestTable.create(
          RequestResponse
        );
        if (response != null) {
          if (
            response.getMessages().getResultCode() ==
            ApiContracts.MessageTypeEnum.OK
          ) {
            if (response.getTransactionResponse().getMessages() != null) {
              const transData = response.transactionResponse;
              const updateTransaction = await models.Transaction.update(
                {
                  Void: true,
                  TransactionId: transData.refTransID,
                },
                {
                  where: {
                    id: transactionId.id,
                  },
                }
              );
              const newTxn = {
                Amount: transactionId.amount / 100,
                UserId: userIdData.id,
                TransactionId: transactionId.id,
                NewTransactionId: transData.transId,
                PaymentType: 4,
                Status: 1,
                GatewayType: transactionId.TransactionGateWay,
                PrevTransactionId: transData.refTransID,
              };
              let instert = await models.RefundVoidCaptureTable.create(newTxn);
              res.status(200).json({
                message: 'Transaction Void Initiated Successfully',
                data: JSON.parse(JSON.stringify(transData)),
              });
            } else {
              console.log(
                '============ Failed Transaction ==================='
              );
              if (response.getTransactionResponse().getErrors() != null) {
                return res.status(500).json({
                  message: response
                    .getTransactionResponse()
                    .getErrors()
                    .getError()[0]
                    .getErrorText(),
                });
              }
            }
          } else {
            if (
              response.getTransactionResponse() != null &&
              response.getTransactionResponse().getErrors() != null
            ) {
              return res.status(500).json({
                message: response
                  .getTransactionResponse()
                  .getErrors()
                  .getError()[0]
                  .getErrorText(),
              });
            } else {
              return res.status(500).json({
                message: response.getMessages().getMessage()[0].getText(),
              });
            }
          }
        } else {
          res.status(200).json({
            message: 'Null Response',
          });
        }
      });
    } else {
      return res.status(400).json({ message: 'Invalid data' });
    }
  } catch (error) {
    console.log(error);
    Sentry.captureException(error);
    return res.status(500).json({
      status: 'error',
      message: error,
    });
  }
};

exports.AuthorizenetRefundTransactions = async (
  req,
  userInfo,
  userGateWayData,
  transactionId,
  res
) => {
  try {
    let cardNumber, expiryDate;
    if (
      req.body.TransactionId != undefined &&
      req.body.MerchantId != undefined
    ) {
      if (transactionId.Status == '4' && transactionId.Type != '2') {
        var merchantAuthenticationType =
          new ApiContracts.MerchantAuthenticationType();
        merchantAuthenticationType.setName(userGateWayData.GatewayApiKey);
        merchantAuthenticationType.setTransactionKey(
          userGateWayData.AuthTransactionKey
        );

        let transactionDetails = await models.Transaction.findOne({
          where: { TransactionId: req.body.TransactionId },
        });

        if (transactionDetails) {
          let cardDetails = await models.Card.findOne({
            where: {
              CustomerId: transactionDetails.CustomerId,
              ExpiryDate: transactionDetails.ExpiryDate.replace(
                /\s/g,
                ''
              ).replace(/\\|\//g, ''),
              CardHolderName: transactionDetails.BillingCustomerName,
            },
          });

          if (cardDetails) {
            cardNumber = cardDetails.CardNumber;
            expiryDate = cardDetails.ExpiryDate;
          }
        }
        var creditCard = new ApiContracts.CreditCardType();
        creditCard.setCardNumber(cardNumber);
        creditCard.setExpirationDate(expiryDate);

        var paymentType = new ApiContracts.PaymentType();
        paymentType.setCreditCard(creditCard);

        var transactionRequestType = new ApiContracts.TransactionRequestType();
        transactionRequestType.setTransactionType(
          ApiContracts.TransactionTypeEnum.REFUNDTRANSACTION
        );
        transactionRequestType.setPayment(paymentType);
        transactionRequestType.setAmount(req.body.Amount);
        transactionRequestType.setRefTransId(req.body.TransactionId);

        var createRequest = new ApiContracts.CreateTransactionRequest();
        createRequest.setMerchantAuthentication(merchantAuthenticationType);
        createRequest.setTransactionRequest(transactionRequestType);

        //pretty print request
        console.log(JSON.stringify(createRequest.getJSON(), null, 2));
        const requestCreated = {
          GatewayType: userGateWayData.GatewayType,
          Request: createRequest,
          Response: '',
          MerchantId: userInfo.id,
        };
        const resCreated = await models.ResponseRequestTable.create(
          requestCreated
        );
        var ctrl = new ApiControllers.CreateTransactionController(
          createRequest.getJSON()
        );
        ctrl.execute(async function () {
          var apiResponse = ctrl.getResponse();
          var response = new ApiContracts.CreateTransactionResponse(
            apiResponse
          );
          //pretty print response
          // console.log(JSON.stringify(response, null, 2));
          if (response != null) {
            console.log("//////////////////////", apiResponse, "///////////////////")
            console.log(ApiContracts.MessageTypeEnum.OK, "********************")
            res.status(200).json(createRequest);
            return;
            if (
              response.getMessages().getResultCode() ==
              ApiContracts.MessageTypeEnum.OK
            ) {
              if (response.getTransactionResponse().getMessages() != null) {
                const transData = response.getTransactionResponse();
                const RequestResponse = {
                  GatewayType: userGateWayData.GatewayType,
                  Request: createRequest,
                  Response: response,
                  MerchantId: userInfo.id,
                };
                const resCreated = await models.ResponseRequestTable.create(
                  RequestResponse
                );
                const updateTransaction = await models.Transaction.update(
                  {
                    Refund: true,
                    //TransactionId: transData.transId,
                  },
                  {
                    where: {
                      id: transactionId.id,
                    },
                  }
                );
                const newTxn = {
                  Amount: transactionId.amount / 100,
                  UserId: userInfo.id,
                  TransactionId: transactionId.id,
                  NewTransactionId: transData.transId,
                  PaymentType: 5,
                  Status: 3,
                  GatewayType: transactionId.TransactionGateWay,
                  PrevTransactionId: transData.refTransId,
                };

                let instert = await models.RefundVoidCaptureTable.create(
                  newTxn
                );
                res.status(200).json({
                  message: 'Transaction Refund Initiated Successfully',
                  data: JSON.parse(JSON.stringify(response)),
                });
              } else {
                console.log(
                  '============ Failed Transaction ================='
                );
                if (response.getTransactionResponse().getErrors() != null) {
                  res.status(500).json({
                    message: response
                      .getTransactionResponse()
                      .getErrors()
                      .getError()[0]
                      .getErrorText(),
                  });
                }
              }
            } else {
              console.log('============ Failed Transaction =================');
              if (
                response.getTransactionResponse() != null &&
                response.getTransactionResponse().getErrors() != null
              ) {
                res.status(500).json({
                  messagess: response.getMessages().getMessage()[0].getText(),
                });
              } else {
                res.status(500).json({
                  message: response
                    .getTransactionResponse()
                    .getErrors()
                    .getError()[0]
                    .getErrorText(),
                });
              }
            }
          } else {
            console.log('Null Response.');
          }
        });
      } else {
        let message = '';
        if (transactionId.Type == '2') {
          message = 'This is a Auth transaction. Cannot apply refund';
        } else {
          message = 'The Transaction is not yet setteled';
        }
        res.status(400).json({ message: message });
      }
    } else {
      return res.status(400).json({ message: 'Invalid data' });
    }
  } catch (error) {
    console.log(error);
    Sentry.captureException(error);
    return res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

exports.AuthorizenetCreateCustomerProfile = async (
  req,
  userInfo,
  userGateWayData,
  customerExist,
  res
) => {
  var merchantAuthenticationType =
    new ApiContracts.MerchantAuthenticationType();
  merchantAuthenticationType.setName(userGateWayData.GatewayApiKey);
  merchantAuthenticationType.setTransactionKey(
    userGateWayData.AuthTransactionKey
  );

  var creditCard = new ApiContracts.CreditCardType();
  creditCard.setCardNumber(req.body.CardNumber);
  creditCard.setExpirationDate(req.body.ExpiryDate);

  var paymentType = new ApiContracts.PaymentType();
  paymentType.setCreditCard(creditCard);

  var customerAddress = new ApiContracts.CustomerAddressType();
  customerAddress.setFirstName(req.body.BillingFirstName);
  customerAddress.setLastName(req.body.BillingLastName);
  customerAddress.setAddress(req.body.BillingAddress);
  customerAddress.setCity(req.body.BillingCity);
  customerAddress.setState(req.body.BillingState);
  customerAddress.setZip(req.body.BillingPostalCode);
  customerAddress.setCountry(req.body.BillingCountry);
  customerAddress.setPhoneNumber(req.body.BillingPhoneNumber);

  var customerPaymentProfileType =
    new ApiContracts.CustomerPaymentProfileType();
  customerPaymentProfileType.setCustomerType(
    ApiContracts.CustomerTypeEnum.INDIVIDUAL
  );
  customerPaymentProfileType.setPayment(paymentType);
  customerPaymentProfileType.setBillTo(customerAddress);

  var paymentProfilesList = [];
  paymentProfilesList.push(customerPaymentProfileType);

  var customerProfileType = new ApiContracts.CustomerProfileType();
  customerProfileType.setDescription(req.body.BillingPhoneNumber);
  customerProfileType.setEmail(req.body.BillingEmail);
  customerProfileType.setPaymentProfiles(paymentProfilesList);

  var createRequest = new ApiContracts.CreateCustomerProfileRequest();
  createRequest.setProfile(customerProfileType);
  createRequest.setValidationMode(ApiContracts.ValidationModeEnum.TESTMODE); // Set live mode on prod
  createRequest.setMerchantAuthentication(merchantAuthenticationType);
  var ctrl = new ApiControllers.CreateCustomerProfileController(
    createRequest.getJSON()
  );

  ctrl.execute(async function () {
    var apiResponse = ctrl.getResponse();
    var response = new ApiContracts.CreateCustomerProfileResponse(apiResponse);
    if (response != null) {
      if (
        response.getMessages().getResultCode() ==
        ApiContracts.MessageTypeEnum.OK
      ) {
        console.log(JSON.stringify(response.getJSON(), null, 2));
        console.log(
          'Successfully created a customer profile with id: ' +
            response.getCustomerProfileId()
        );
        if (customerExist == null) {
          const stateData = await models.States.findOne({
            where: {
              Abbrevation: req.body.BillingState ?? null,
            },
          });
          const countryData = await models.Country.findOne({
            where: {
              Abbrevation: req.body.BillingCountry ?? null,
            },
          });
          const customer = {
            CustomerName: req.body.BillingCustomerName,
            Address: req.body.BillingAddress,
            City: req.body.BillingCity,
            PostalCode: req.body.BillingPostalCode,
            StateId: stateData != undefined ? stateData.id : null,
            CountryId: countryData != undefined ? countryData.id : null,
            CountryCode: req.body.BillingCountryCode,
            PhoneNumber: req.body.BillingPhoneNumber,
            Email: req.body.BillingEmail ?? null,
            UserId: merchantId,
            GatewayCustomerId: response.getCustomerProfileId(),
          };
          const insertCustomer = await models.Customer.create(customer);
        } else {
          await models.Customer.update(
            { GatewayCustomerId: response.getCustomerProfileId() },
            {
              where: {
                [Op.and]: [{ id: customerExist.id }, { UserId: userInfo.id }],
              },
            }
          );
        }
      } else {
        console.log('Result Code: ' + response.getMessages().getResultCode());
        console.log(
          'Error Code: ' + response.getMessages().getMessage()[0].getCode()
        );
        console.log(
          'Error message: ' + response.getMessages().getMessage()[0].getText()
        );
      }
    } else {
      console.log('Null response received');
    }
  });
};
exports.AuthorizenetGetCustomerProfile = async (
  profileId,
  merchantAuthenticationType
) => {
  // get customer profile
  var getRequest = new ApiContracts.GetCustomerProfileRequest();
  getRequest.setCustomerProfileId(profileId);
  getRequest.setMerchantAuthentication(merchantAuthenticationType);

  var ctrl = new ApiControllers.GetCustomerProfileController(
    getRequest.getJSON()
  );

  ctrl.execute(function () {
    var apiResponse = ctrl.getResponse();
    var response = new ApiContracts.GetCustomerProfileResponse(apiResponse);
    if (response != null) {
      console.log(JSON.stringify(response.getJSON(), null, 2));
      if (
        response.getMessages().getResultCode() ==
        ApiContracts.MessageTypeEnum.OK
      ) {
        return response.getJSON();
        // console.log('Customer profile ID : ' + response.getProfile().getCustomerProfileId());
        // console.log('Customer Email : ' + response.getProfile().getEmail());
        // console.log('Description : ' + response.getProfile().getDescription());
      } else {
        return response.getJSON();
      }
    } else {
      return response.getJSON();
      console.log('Null response received');
    }
  });
};

exports.AuthorizeCreateToken = async (
  req,
  userInfo,
  userGateWayData,
  gatewayData,
  customerData,
  checkCustomer
) => {
  try {
    var merchantAuthenticationType =
      new ApiContracts.MerchantAuthenticationType();
    merchantAuthenticationType.setName(userGateWayData.GatewayApiKey);
    merchantAuthenticationType.setTransactionKey(
      userGateWayData.AuthTransactionKey
    );

    var creditCard = new ApiContracts.CreditCardType();
    creditCard.setCardNumber(req.body.CardNumber);
    creditCard.setExpirationDate(req.body.ExpiryDate);

    var paymentType = new ApiContracts.PaymentType();
    paymentType.setCreditCard(creditCard);

    var customerAddress = new ApiContracts.CustomerAddressType();
    customerAddress.setFirstName(req.body.BillingFirstName);
    customerAddress.setLastName(req.body.BillingLastName);
    customerAddress.setAddress(req.body.BillingAddress);
    customerAddress.setCity(req.body.BillingCity);
    customerAddress.setState(req.body.BillingState);
    customerAddress.setZip(req.body.BillingPostalCode);
    customerAddress.setCountry(req.body.BillingCountry);
    customerAddress.setPhoneNumber(req.body.BillingPhoneNumber);

    var customerPaymentProfileType =
      new ApiContracts.CustomerPaymentProfileType();
    customerPaymentProfileType.setCustomerType(
      ApiContracts.CustomerTypeEnum.INDIVIDUAL
    );
    customerPaymentProfileType.setPayment(paymentType);
    customerPaymentProfileType.setBillTo(customerAddress);

    var paymentProfilesList = [];
    paymentProfilesList.push(customerPaymentProfileType);

    var customerProfileType = new ApiContracts.CustomerProfileType();
    customerProfileType.setDescription(req.body.BillingPhoneNumber);
    customerProfileType.setEmail(req.body.BillingEmail);
    customerProfileType.setPaymentProfiles(paymentProfilesList);

    if (checkCustomer == 'create Token') {
      var createRequest = new ApiContracts.CreateCustomerProfileRequest();
      createRequest.setProfile(customerProfileType);
      createRequest.setValidationMode(ApiContracts.ValidationModeEnum.TESTMODE); // Set live mode on prod
      createRequest.setMerchantAuthentication(merchantAuthenticationType);
      var ctrl = new ApiControllers.CreateCustomerProfileController(
        createRequest.getJSON()
      );
      ctrl.execute(async function () {
        var apiResponse = ctrl.getResponse();
        var response = new ApiContracts.CreateCustomerProfileResponse(
          apiResponse
        );
        if (response != null) {
          if (
            response.getMessages().getResultCode() ==
            ApiContracts.MessageTypeEnum.OK
          ) {
            console.log(JSON.stringify(response.getJSON(), null, 2));
          } else {
            console.log(
              'Result Code: ' + response.getMessages().getResultCode()
            );
            console.log(
              'Error Code: ' + response.getMessages().getMessage()[0].getCode()
            );
            console.log(
              'Error message: ' +
                response.getMessages().getMessage()[0].getText()
            );
          }
        } else {
          console.log('Null response received');
        }
      });
    } else if (
      checkCustomer == 'New card for customer' &&
      customerData.GatewayCustomerId == null
    ) {
    }
  } catch (err) {
    Sentry.captureException(err);
    return false;
  }
};

exports.AuthorizenetCaptureTransactions = async (
  req,
  userIdData,
  userGateWayData,
  transactionId,
  res
) => {
  try {
    if (
      req.body.TransactionId != undefined &&
      req.body.MerchantId != undefined
    ) {
      if (transactionId.Status == '1') {
        var merchantAuthenticationType =
          new ApiContracts.MerchantAuthenticationType();
        merchantAuthenticationType.setName(userGateWayData.GatewayApiKey);
        merchantAuthenticationType.setTransactionKey(
          userGateWayData.AuthTransactionKey
        );

        var transactionRequestType = new ApiContracts.TransactionRequestType();
        transactionRequestType.setTransactionType(
          ApiContracts.TransactionTypeEnum.PRIORAUTHCAPTURETRANSACTION
        );
        transactionRequestType.setRefTransId(req.body.TransactionId);

        var createRequest = new ApiContracts.CreateTransactionRequest();
        createRequest.setMerchantAuthentication(merchantAuthenticationType);
        createRequest.setTransactionRequest(transactionRequestType);

        //pretty print request
        console.log(JSON.stringify(createRequest.getJSON(), null, 2));
        let ctrl = new ApiControllers.CreateTransactionController(
          createRequest.getJSON()
        );
        const requestCreated = {
          GatewayType: userGateWayData.GatewayType,
          Request: createRequest,
          Response: '',
          MerchantId: userIdData.id,
        };
        await models.ResponseRequestTable.create(requestCreated);

        ctrl.execute(async function () {
          var apiResponse = ctrl.getResponse();
          var response = new ApiContracts.CreateTransactionResponse(
            apiResponse
          );
          //pretty print response
          console.log(JSON.stringify(response, null, 2));
          const captureResponse = {
            GatewayType: userGateWayData.GatewayType,
            Request: requestCreated,
            Response: response,
            MerchantId: userIdData.id,
          };
          await models.ResponseRequestTable.create(captureResponse);
          if (response != null) {
            if (
              response.getMessages().getResultCode() ==
              ApiContracts.MessageTypeEnum.OK
            ) {
              if (response.getTransactionResponse().getMessages() != null) {
                const transData = response.transactionResponse;
                const updateTransaction = await models.Transaction.update(
                  {
                    Capture: true,
                    TransactionId: transData.transId,
                    Status: 3,
                    Type: '1',
                  },
                  {
                    where: {
                      id: transactionId.id,
                    },
                  }
                );
                const newTxn = {
                  Amount: transactionId.amount / 100,
                  UserId: userIdData.id,
                  TransactionId: transactionId.id,
                  NewTransactionId: transData.transId,
                  PaymentType: 3,
                  Status: 0,
                  GatewayType: transactionId.TransactionGateWay,
                  PrevTransactionId: transData.transId,
                };

                let instert = await models.RefundVoidCaptureTable.create(
                  newTxn
                );
                res.status(200).json({
                  message: 'Transaction Capture Initiated Successfully',
                  data: JSON.parse(JSON.stringify(transData)),
                });
              } else {
                console.log(
                  '============ Failed Transaction ==================='
                );
                if (response.getTransactionResponse().getErrors() != null) {
                  return res.status(500).json({
                    message: response
                      .getTransactionResponse()
                      .getErrors()
                      .getError()[0]
                      .getErrorText(),
                  });
                }
              }
            } else {
              if (
                response.getTransactionResponse() != null &&
                response.getTransactionResponse().getErrors() != null
              ) {
                return res.status(500).json({
                  message: response
                    .getTransactionResponse()
                    .getErrors()
                    .getError()[0]
                    .getErrorText(),
                });
              } else {
                return res.status(500).json({
                  message: response.getMessages().getMessage()[0].getText(),
                });
              }
            }
          } else {
            res.status(200).json({
              message: 'Null Response',
            });
          }
        });
      } else {
        res.status(500).json({
          message: 'This is Sale transaction.Cannot apply capture',
        });
      }
    } else {
      return res.status(400).json({ message: 'Invalid data' });
    }
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).json({
      message: 'Something went wrong',
      error: err,
    });
  }
};
