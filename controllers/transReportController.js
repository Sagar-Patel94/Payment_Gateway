const fs = require('fs');
const fetch = require('node-fetch');
const Sentry = require('@sentry/node');
const models = require('../models');
const { Op } = require('sequelize');
const db = require('../models/index');
const { QueryTypes } = require('sequelize');
const { getPaidBy } = require('../controllers/transactionController');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const sendEmail = require('../utils/sendEmail');
const { Console } = require('console');
const { Sequelize } = require('../models');
const moment = require('moment');

console.log(
  'Date Formatted',
  moment('2022-07-28T00:34:54Z').utc().format('YYYY-MM-DD HH:mm:ss')
);
exports.getAggreagteTransactions = async (req, res) => {
  // console.log('Timezone is', Intl.DateTimeFormat().resolvedOptions().timeZone);
  let token = '';
  let decoded = '';
  token = req.headers.authorization.split(' ');
  decoded = jwt.verify(token[1], process.env.JWT_SECRET);
  console.log(
    'Date Formatted',
    moment(req.query.dateFrom).utc().format('YYYY-MM-DD HH:mm:ss')
  );
  let statusValue, paymentType;
  tempPaidBy = '';
  let custId = '';

  if (req.query.result != undefined) {
    statusValue = req.query.result.split(',');
  } else {
    statusValue = '';
  }
  let dateFrom = req.query.dateFrom;
  // moment(req.query.dateFrom).format('YYYY-MM-DD HH:mm:ss');
  // dateTo = req.query.dateTo;
  dateTo = req.query.dateTo;
  // moment(req.query.dateTo).format('YYYY-MM-DD HH:mm:ss');
  paymentType = req.query.paymentType ?? '1';
  if (req.query.paidBy != undefined) {
    tempPaidBy = req.query.paidBy.split(',');
  } else {
    tempPaidBy = '';
  }

  if (req.query.custId != undefined) {
    custId = req.query.custId.split(',');
  } else {
    custId = '';
  }

  let paidBy = '';
  if (tempPaidBy.length > 0) {
    for (let i = 0; i < tempPaidBy.length; i++) {
      let getwayValue = getPaidBy(tempPaidBy[i]);
      paidBy = [];
      paidBy.push(getwayValue);
    }
  } else {
    paidBy = '';
  }

  let conditionsArray = [
    {
      MerchantId: {
        [Op.eq]: decoded.Id,
      },
    },
    {
      Type: {
        [Op.eq]: paymentType,
      },
    },
    {
      Status: {
        [Op.eq]: '4',
      },
    },
    {
      SettledDate: {
        [Op.between]: [dateFrom, dateTo],
      },
    },
  ];

  let conditionsArrayForRefund = [
    {
      MerchantId: {
        [Op.eq]: decoded.Id,
      },
    },
    {
      Type: {
        [Op.eq]: paymentType,
      },
    },
    {
      Status: {
        [Op.eq]: '4',
      },
    },
    {
      Refund: {
        [Op.eq]: true,
      },
    },
    {
      SettledDate: {
        [Op.between]: [dateFrom, dateTo],
      },
    },
  ];

  if (req.query.processorId && req.query.processorId != '') {
    processorId = req.query.processorId.split(',');
    conditionsArray.push({
      ProcessorId: {
        [Op.in]: processorId,
      },
    });
    conditionsArrayForRefund.push({
      ProcessorId: {
        [Op.in]: processorId,
      },
    });
  }

  await models.Transaction.findAll({
    // subQuery: false,
    attributes: [
      'id',
      [
        Sequelize.fn('date', Sequelize.col('Transaction.SettledDate')),
        'ReportEndingTime',
      ],
      [Sequelize.fn('COUNT', Sequelize.col('Transaction.id')), 'SalesCount'],
      [Sequelize.fn('SUM', Sequelize.col('Amount')), 'TotalSales'],
    ],
    include: [
      {
        model: models.User,
        as: 'User',
        attributes: ['FullName', 'Email'],
      },
    ],
    group: [
      'id',
      [Sequelize.fn('date', Sequelize.col('Transaction.SettledDate'))],
    ],
    where: conditionsArray,
    order: [['id', 'DESC']],
  })
    .then(async (transaction) => {
      const transwithData = await models.Transaction.findAll({
        // subQuery: false,
        attributes: [
          'id',
          [
            Sequelize.fn('date', Sequelize.col('Transaction.SettledDate')),
            'ReportEndingTime',
          ],
          [
            Sequelize.fn('COUNT', Sequelize.col('Transaction.id')),
            'SalesCount',
          ],
          [Sequelize.fn('SUM', Sequelize.col('Amount')), 'Amount'],
        ],
        include: [
          {
            model: models.User,
            as: 'User',
            attributes: ['FullName', 'Email'],
          },
        ],
        group: [
          'id',
          [Sequelize.fn('date', Sequelize.col('Transaction.SettledDate'))],
        ],
        where: {
          [Op.and]: conditionsArrayForRefund,
        },
        order: [['id', 'DESC']],
      });
      let j = 0;
      let refundArray = [];
      for (let i = 0; i < transwithData.length; i++) {
        for (let k = 0; k < transaction.length; k++) {
          if (transaction[k].id === transwithData[i].id) {
            const tempArray = await models.RefundVoidCaptureTable.findOne({
              where: {
                TransactionId: {
                  [Op.eq]: transaction[k].id,
                },
              },
            });
            refundArray.push({
              RefundAmount: tempArray.Amount,
              RefundCount: tempArray != undefined ? 1 : 0,
              TranDate: transaction[k].dataValues.ReportEndingTime,
            });
          }
        }
      }
      const combinedTransaction = await models.Transaction.findAll({
        // subQuery: false,
        attributes: [
          [
            Sequelize.fn('date', Sequelize.col('Transaction.SettledDate')),
            'ReportEndingTime',
          ],
          [
            Sequelize.fn('COUNT', Sequelize.col('Transaction.id')),
            'SalesCount',
          ],
          [Sequelize.fn('SUM', Sequelize.col('Amount')), 'TotalSales'],
          [
            Sequelize.fn('SUM', Sequelize.col('ConvenienceFeeValue')),
            'TotalFee',
          ],
        ],
        include: [
          {
            model: models.User,
            as: 'User',
            attributes: ['FullName', 'Email'],
          },
        ],
        group: [
          [Sequelize.fn('date', Sequelize.col('Transaction.SettledDate'))],
        ],
        where: {
          [Op.and]: conditionsArray,
        },
        order: [
          [
            Sequelize.fn('date', Sequelize.col('Transaction.SettledDate')),
            'DESC',
          ],
        ],
      });
      console.log('Refund Array is', refundArray);

      let tranArray = [];
      for (m = 0; m < combinedTransaction.length; m++) {
        let count = 0;
        for (j = 0; j < refundArray.length; j++) {
          if (
            combinedTransaction[m].dataValues.ReportEndingTime ==
            refundArray[j].TranDate
          ) {
            let NetSales =
              parseFloat(combinedTransaction[m].dataValues.TotalSales) -
              parseFloat(combinedTransaction[m].dataValues.TotalFee) -
              parseFloat(refundArray[j].RefundAmount);
            count = 1;
            tranArray.push({
              ending_time: `${combinedTransaction[m].dataValues.ReportEndingTime} - 7.00 PM`,
              merchant_name: combinedTransaction[m].dataValues.User.FullName,
              days_trans_count: combinedTransaction[m].dataValues.SalesCount,
              day_sales: combinedTransaction[m].dataValues.TotalSales,
              total_Fee: combinedTransaction[m].dataValues.TotalFee,
              day_refund_count: refundArray[j] != undefined ? 1 : 0,
              day_refunds: refundArray[j].RefundAmount,
              day_total: parseFloat(NetSales),
            });
          }
        }
        if (count == 0) {
          let NetSales =
            parseFloat(combinedTransaction[m].dataValues.TotalSales) -
            parseFloat(combinedTransaction[m].dataValues.TotalFee);
          tranArray.push({
            ending_time: `${combinedTransaction[m].dataValues.ReportEndingTime} - 7.00 PM`,
            merchant_name: combinedTransaction[m].dataValues.User.FullName,
            days_trans_count: combinedTransaction[m].dataValues.SalesCount,
            day_sales: combinedTransaction[m].dataValues.TotalSales,
            total_Fee: combinedTransaction[m].dataValues.TotalFee,
            day_refund_count: 0,
            day_refunds: 0,
            day_total: parseFloat(NetSales),
          });
        }
      }
      res.status(200).json({
        message: 'Transactions found successfully',
        data: tranArray,
      });
    })
    .catch(async (err) => {
      Sentry.captureException(err);
      console.log(err);
      res.status(401).json({
        message: 'Something went wrong',
        error: err,
      });
    });
};

exports.getAggreagteCardWiseData = async (req, res) => {
  let token = '';
  let decoded = '';
  token = req.headers.authorization.split(' ');
  decoded = jwt.verify(token[1], process.env.JWT_SECRET);
  let mid = '';
  let processorId = '';
  let dateFrom = '',
    dateTo = '';
  if (req.query.mid != undefined) {
    decoded.Id = req.query.mid;
    dateFrom = moment(req.query.dateFrom).utc().format('YYYY-MM-DD HH:mm:ss');
    // let dateFrom = moment(req.query.dateFrom).format('YYYY-MM-DD HH:mm:ss');
    // let dateFrom = req.query.dateFrom;
    dateTo = moment(req.query.dateTo).utc().format('YYYY-MM-DD HH:mm:ss');
    // dateTo = moment(req.query.dateTo).format('YYYY-MM-DD HH:mm:ss');
    // dateTo = req.query.dateTo;
    processorId = null;
  } else {
    dateFrom =
      moment(req.query.dateFrom).utc().format('YYYY-MM-DD') + ' 00:00:00';
    // let dateFrom = moment(req.query.dateFrom).format('YYYY-MM-DD HH:mm:ss');
    // let dateFrom = req.query.dateFrom;
    dateTo =
      moment(req.query.dateFrom).utc().format('YYYY-MM-DD') + ' 23:59:59';
    if (req.query.processorId && req.query.processorId != '') {
      processorId = req.query.processorId;
    } else {
      processorId = null;
    }
  }

  let paidBy = '',
    paymentType = '';

  await db.sequelize
    .query(
      'CALL sp_getcardwiseaggregate(:dateFrom,:dateTo,:processorId,:paidBy,:paymentType,:merchantId)',
      // 'CALL sp_new(:dateFrom,:dateTo,:paidBy,:paymentType,:merchantId)',//Testing SP
      {
        replacements: {
          dateFrom: dateFrom,
          dateTo: dateTo,
          processorId: processorId,
          paidBy: paidBy,
          paymentType: paymentType,
          merchantId: decoded.Id,
        },
        type: QueryTypes.SELECT,
        raw: true,
      }
    )
    .then(async (result) => {
      let agrregateData = Object.keys(result[0]).map((key) => result[0][key]);
      let IndividualCardTrans = Object.keys(result[1]).map(
        (key) => result[1][key]
      );

      res.status(200).json({
        message: 'Agrregate Data found successfully',
        data: IndividualCardTrans,
        aggregateData: agrregateData,
      });
    })
    .catch(async (err) => {
      Sentry.captureException(err);
      console.log(err);
      res.status(500).json({
        message: 'Something went wrong',
        error: err,
      });
    });
};
