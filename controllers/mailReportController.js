const sgMail = require('@sendgrid/mail');
const Sentry = require('@sentry/node');
const cron = require('node-cron');
const models = require('../models');
const { Op } = require('sequelize');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { Sequelize } = require('sequelize');
const handlebars = require('handlebars');
const sendEmail = require('../utils/dailyMail');
const dailyEmail = require('../utils/dailyMail');
const fetch = require('node-fetch');
const moment = require('moment');
const ApiContracts = require('authorizenet').APIContracts;
const ApiControllers = require('authorizenet').APIControllers;

if (process.env.NODE_ENV === 'production') {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY_PROD);
} else {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY_DEMO);
}

exports.createReport = async (req, res) => {
  try {
    const userMails = [];
    const findMerchants = await models.User.findAll({
      where: {
        [Op.and]: [
          // { id: 9 },
          { IsDeleted: false },
          { IsActive: true },
          { RoleId: 4 },
        ],
      },
    });
    for (let i = 0; i < findMerchants.length; i++) {
      let uMail =
        findMerchants[i].NotificationEmail !== null
          ? findMerchants[i].NotificationEmail
          : findMerchants[i].Email;
      let userId = findMerchants[i].id;
      let comapanyName = findMerchants[i].comapanyName;
      userMails.push({ id: userId, mail: uMail, comapanyName: comapanyName });
    }

    for (let i = 0; i < userMails.length; i++) {
      const totalSaleTransactions = await models.Transaction.findAll({
        where: {
          [Op.and]: [
            { Type: '1' },
            { MerchantId: userMails[i].id },
            { Status: { [Op.in]: ['1', '3', '4'] } },
            {
              createdAt: {
                [Op.gt]: new Date(new Date() - 24 * 60 * 60 * 1000),
              },
            },
          ],
        },
      });

      const totalAuthTransactions = await models.Transaction.findAll({
        where: {
          [Op.and]: [
            { Type: '2' },
            { MerchantId: userMails[i].id },
            { Status: { [Op.in]: ['1', '3'] } },
            {
              createdAt: {
                [Op.gt]: new Date(new Date() - 24 * 60 * 60 * 1000),
              },
            },
          ],
        },
      });

      const TotalSaleAmount = await models.Transaction.findAll({
        attributes: [
          [Sequelize.fn('SUM', Sequelize.col('Amount')), 'total_amount'],
        ],
        raw: true,
        group: ['MerchantId'],
        where: {
          [Op.and]: [
            { Type: '1' },
            { MerchantId: userMails[i].id },
            { Status: { [Op.in]: ['1', '3', '4'] } },
            {
              createdAt: {
                [Op.gt]: new Date(new Date() - 24 * 60 * 60 * 1000),
              },
            },
          ],
        },
      });

      const TotalAuthAmount = await models.Transaction.findAll({
        attributes: [
          [Sequelize.fn('SUM', Sequelize.col('Amount')), 'total_amount'],
        ],
        raw: true,
        group: ['MerchantId'],
        where: {
          [Op.and]: [
            { Type: '2' },
            { MerchantId: userMails[i].id },
            { Status: { [Op.in]: ['1', '3', '4'] } },
            {
              createdAt: {
                [Op.gt]: new Date(new Date() - 24 * 60 * 60 * 1000),
              },
            },
          ],
        },
      });
      const totalRefundTransactions = await models.Transaction.findAll({
        where: {
          [Op.and]: [
            { Refund: true },
            { MerchantId: userMails[i].id },
            { Status: { [Op.in]: ['1', '3', '4'] } },
            {
              createdAt: {
                [Op.gt]: new Date(new Date() - 24 * 60 * 60 * 1000),
              },
            },
          ],
        },
      });

      const totalCaptureTransactions = await models.Transaction.findAll({
        where: {
          [Op.and]: [
            { Capture: true },
            { MerchantId: userMails[i].id },
            { Status: { [Op.in]: ['1', '3', '4'] } },
            {
              createdAt: {
                [Op.gt]: new Date(new Date() - 24 * 60 * 60 * 1000),
              },
            },
          ],
        },
      });

      const totalVoidTransactions = await models.Transaction.findAll({
        where: {
          [Op.and]: [
            { Capture: true },
            { MerchantId: userMails[i].id },
            { Status: { [Op.in]: ['1', '3', '4'] } },
            {
              createdAt: {
                [Op.gt]: new Date(new Date() - 24 * 60 * 60 * 1000),
              },
            },
          ],
        },
      });

      let dataValues = {
        currentDate: new Date(
          Date.now() -
            1 * 864e5 -
            new Date(Date.now() - 1 * 864e5).getTimezoneOffset() * 6e4
        )
          .toISOString()
          .split('T')[0],
        SaleTotalNumber:
          totalSaleTransactions.length == 0
            ? 'NA'
            : totalSaleTransactions.length,
        AuthTotalNumber:
          totalAuthTransactions.length == 0
            ? 'NA'
            : totalAuthTransactions.length,
        TotalSaleAmount:
          TotalSaleAmount.length == 0 ? 'NA' : TotalSaleAmount[0].total_amount,
        TotalAuthAmount:
          TotalAuthAmount.length == 0 ? 'NA' : TotalAuthAmount[0].total_amount,
        RefundTransactionsTotal:
          totalRefundTransactions.length == 0
            ? 'NA'
            : totalRefundTransactions.length,
        CaptureTransactionsTotal:
          totalCaptureTransactions.length == 0
            ? 'NA'
            : totalCaptureTransactions.length,
        VoidTransactionsTotal:
          totalVoidTransactions.length == 0
            ? 'NA'
            : totalVoidTransactions.length,
        comapanyName: userMails[i].comapanyName,
      };
      await sendEmail(
        userMails[i].mail,
        dataValues,
        'Transaction Report',
        '../utils/dailyStatus.hbs'
      );
    }
  } catch (err) {
    Sentry.captureException(err);
    res.status(401).json({
      message: err.message,
    });
  }
};

exports.createAdminReport = async (req, res) => {
  try {
    const userDetails = {};
    let transDetails = [];
    const findMerchants = await models.User.findAll({
      where: {
        [Op.and]: [
          // { id: 102 },
          { IsDeleted: false },
          { IsActive: true },
          { RoleId: 4 },
        ],
      },
    });

    const findRoles = await models.Role.findOne({
      where: {
        [Op.and]: [
          //{ id: 9 },
          { IsDeleted: false },
          { IsActive: true },
          { RoleName: 'Admin' },
        ],
      },
    });

    console.log(findRoles);

    const findAdmins = await models.User.findOne({
      where: {
        [Op.and]: [
          //{ id: 9 },
          { IsDeleted: false },
          { IsActive: true },
          { RoleId: findRoles.id },
        ],
      },
    });

    console.log(findAdmins);

    // for (let i = 0; i < findMerchants.length; i++) {
    //   let uMail = findMerchants[i].Email;
    //   let userId = findMerchants[i].id;
    //   let comapanyName = findMerchants[i].comapanyName;
    //   userMails.push({ id: userId, mail: uMail, comapanyName: comapanyName });
    // }
    let SaleTotalNumberTot = 0;
    let AuthTotalNumberTot = 0;
    let TotalSaleAmountTot = 0;
    let TotalAuthAmountTot = 0;
    let RefundTransactionsTotalTot = 0;
    let CaptureTransactionsTotalTot = 0;
    let VoidTransactionsTotalTot = 0;

    for (let i = 0; i < findMerchants.length; i++) {
      const totalSaleTransactions = await models.Transaction.findAll({
        where: {
          [Op.and]: [
            { Type: '1' },
            { MerchantId: findMerchants[i].id },
            { Status: { [Op.in]: ['1', '3', '4'] } },
            {
              createdAt: {
                [Op.gt]: new Date(new Date() - 24 * 60 * 60 * 1000),
              },
            },
          ],
        },
      });

      const totalAuthTransactions = await models.Transaction.findAll({
        where: {
          [Op.and]: [
            { Type: '2' },
            { Status: { [Op.in]: ['1', '3', '4'] } },
            { MerchantId: findMerchants[i].id },
            {
              createdAt: {
                [Op.gt]: new Date(new Date() - 24 * 60 * 60 * 1000),
              },
            },
          ],
        },
      });

      const TotalSaleAmount = await models.Transaction.findAll({
        attributes: [
          [Sequelize.fn('SUM', Sequelize.col('Amount')), 'total_amount'],
        ],
        raw: true,
        group: ['MerchantId'],
        where: {
          [Op.and]: [
            { Type: '1' },
            { Status: { [Op.in]: ['1', '3', '4'] } },
            { MerchantId: findMerchants[i].id },
            {
              createdAt: {
                [Op.gt]: new Date(new Date() - 24 * 60 * 60 * 1000),
              },
            },
          ],
        },
      });

      const TotalAuthAmount = await models.Transaction.findAll({
        attributes: [
          [Sequelize.fn('SUM', Sequelize.col('Amount')), 'total_amount'],
        ],
        raw: true,
        group: ['MerchantId'],
        where: {
          [Op.and]: [
            { Type: '2' },
            { Status: { [Op.in]: ['1', '3', '4'] } },
            { MerchantId: findMerchants[i].id },
            {
              createdAt: {
                [Op.gt]: new Date(new Date() - 24 * 60 * 60 * 1000),
              },
            },
          ],
        },
      });
      const totalRefundTransactions = await models.Transaction.findAll({
        where: {
          [Op.and]: [
            { Refund: true },
            { MerchantId: findMerchants[i].id },
            { Status: { [Op.in]: ['1', '3', '4'] } },
            {
              createdAt: {
                [Op.gt]: new Date(new Date() - 24 * 60 * 60 * 1000),
              },
            },
          ],
        },
      });

      const totalCaptureTransactions = await models.Transaction.findAll({
        where: {
          [Op.and]: [
            { Capture: true },
            { MerchantId: findMerchants[i].id },
            { Status: { [Op.in]: ['1', '3', '4'] } },
            {
              createdAt: {
                [Op.gt]: new Date(new Date() - 24 * 60 * 60 * 1000),
              },
            },
          ],
        },
      });

      const totalVoidTransactions = await models.Transaction.findAll({
        where: {
          [Op.and]: [
            { Capture: true },
            { MerchantId: findMerchants[i].id },
            { Status: { [Op.in]: ['1', '3', '4'] } },
            {
              createdAt: {
                [Op.gt]: new Date(new Date() - 24 * 60 * 60 * 1000),
              },
            },
          ],
        },
      });

      let dataValues = {
        MerchantName: findMerchants[i].FullName,
        SaleTotalNumber:
          totalSaleTransactions.length == 0
            ? 'NA'
            : totalSaleTransactions.length,
        AuthTotalNumber:
          totalAuthTransactions.length == 0
            ? 'NA'
            : totalAuthTransactions.length,
        TotalSaleAmount:
          TotalSaleAmount.length == 0 ? 'NA' : TotalSaleAmount[0].total_amount,
        TotalAuthAmount:
          TotalAuthAmount.length == 0 ? 'NA' : TotalAuthAmount[0].total_amount,
        RefundTransactionsTotal:
          totalRefundTransactions.length == 0
            ? 'NA'
            : totalRefundTransactions.length,
        CaptureTransactionsTotal:
          totalCaptureTransactions.length == 0
            ? 'NA'
            : totalCaptureTransactions.length,
        VoidTransactionsTotal:
          totalVoidTransactions.length == 0
            ? 'NA'
            : totalVoidTransactions.length,
        companyName: findMerchants[i].CompanyName,
      };

      transDetails.push(dataValues);

      SaleTotalNumberTot =
        totalSaleTransactions.length == 0
          ? 'NA'
          : SaleTotalNumberTot + totalSaleTransactions.length;
      AuthTotalNumberTot =
        totalAuthTransactions.length == 0
          ? 'NA'
          : AuthTotalNumberTot + totalAuthTransactions.length;
      let totSaleAmt =
        TotalSaleAmount.length == 0 ? 0 : TotalSaleAmount[0].total_amount;
      TotalSaleAmountTot = (
        parseFloat(TotalSaleAmountTot) + parseFloat(totSaleAmt)
      ).toFixed(2);
      let totAuthAmt =
        TotalAuthAmount.length == 0 ? 0 : TotalAuthAmount[0].total_amount;
      TotalAuthAmountTot = (
        parseFloat(TotalAuthAmountTot) + parseFloat(totAuthAmt)
      ).toFixed(2);
      RefundTransactionsTotalTot =
        totalRefundTransactions.length == 0
          ? 'NA'
          : RefundTransactionsTotalTot + totalRefundTransactions.length;
      CaptureTransactionsTotalTot =
        totalCaptureTransactions.length == 0
          ? 'NA'
          : CaptureTransactionsTotalTot + totalCaptureTransactions.length;
      VoidTransactionsTotalTot =
        totalVoidTransactions.length == 0
          ? 'NA'
          : VoidTransactionsTotalTot + totalVoidTransactions.length;
    }

    let transDetailsTot = {
      MerchantName: 'Total',
      SaleTotalNumber: SaleTotalNumberTot,
      AuthTotalNumber: AuthTotalNumberTot,
      TotalSaleAmount: TotalSaleAmountTot,
      TotalAuthAmount: TotalAuthAmountTot,
      RefundTransactionsTotal: RefundTransactionsTotalTot,
      CaptureTransactionsTotal: CaptureTransactionsTotalTot,
      VoidTransactionsTotal: VoidTransactionsTotalTot,
      CompanyName: '',
    };

    transDetails.push(transDetailsTot);

    userDetails.currentDate = new Date(
      Date.now() -
        1 * 864e5 -
        new Date(Date.now() - 1 * 864e5).getTimezoneOffset() * 6e4
    )
      .toISOString()
      .split('T')[0];

    userDetails.transDetails = transDetails;

    await dailyEmail(
      'jim@auxpay.net',
      userDetails,
      'Admin Transaction Report',
      '../utils/adminDailyStatus.hbs'
    );
  } catch (err) {
    Sentry.captureException(err);
  }
};

exports.updatePayrixTransactionStatus = async (req, res) => {
  try {
    let failedArray,
      successArray = [];
    const findAllTxn = await models.Transaction.findAll({
      attributes: ['TransactionId'],
      where: {
        Type: { [Op.eq]: '1' },
        Status: {
          [Op.in]: ['1', '3'],
        },
        SettledDate: { [Op.is]: null },
        TransactionGateWay: {
          [Op.eq]: 'Payrix',
        },
      },
    });

    const apiKey = await models.MerchantPaymentGateWay.findOne({
      where: {
        GatewayType: 'Payrix',
      },
    });

    let array = findAllTxn.map((temp) => temp.TransactionId);
    console.log(array.length);
    for (let i = 0; i < array.length; i++) {
      let config = {
        method: 'get',
        url: `${process.env.PAYRIX_URL}/txns/${array[i]}`,
        headers: {
          'Content-Type': 'application/json',
          APIKEY: apiKey.GatewayApiKey,
        },
      };
      const resp = await axios(config);
      let setteledAt = '';
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
                TransactionId: array[i],
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
                TransactionId: array[i],
              },
            }
          );
        }

        successArray.push(array[i]);
      } else {
        failedArray.push(array[i]);
      }
    }
  } catch (err) {
    Sentry.captureException(err);
    return res.status(401).json({ message: err.message });
  }
};

exports.updateFluidTransactionStatus = async (req, res) => {
  console.log('cron started for status update FP');
  try {
    let successArray = [];
    const findAllTxn = await models.Transaction.findAll({
      attributes: ['TransactionId', 'MerchantId'],
      where: {
        Type: { [Op.eq]: '1' },
        Status: {
          [Op.in]: ['1', '3'],
        },
        SettledDate: { [Op.is]: null },
        TransactionGateWay: {
          [Op.eq]: 'FluidPay',
        },
      },
    });
    // const findAllTxn = await models.Transaction.findAll({
    //   attributes: ['id', 'TransactionId', 'MerchantId'],
    //   where: {
    //     Type: { [Op.eq]: '1' },
    //     Status: {
    //       [Op.in]: ['4'],
    //     },
    //     MerchantId: {
    //       [Op.in]: ['21', '15', '24', '7', '25', '22'],
    //       // [Op.in]: ['21'],
    //     },
    //     SettledDate: { [Op.not]: null },
    //     TransactionGateWay: {
    //       [Op.eq]: 'FluidPay',
    //     },
    //   },
    //   // limit: 1,
    //   // ororder: [['id', 'desc']],
    // });
    for (let j = 0; j < findAllTxn.length; j++) {
      const findApi = await models.MerchantPaymentGateWay.findOne({
        where: {
          UserId: findAllTxn[j].MerchantId,
          GatewayType: {
            [Op.eq]: 'FluidPay',
          },
        },
      });
      findAllTxn[j].setDataValue('Apikey', findApi.GatewayApiKey);
    }

    for (let i = 0; i < findAllTxn.length; i++) {
      let setteledAt = '';
      const requestHeader = {
        'Content-Type': 'application/json',
        Authorization: findAllTxn[i].dataValues.Apikey,
      };
      const requestOptions = {
        method: 'GET',
        headers: requestHeader,
      };
      const response = await fetch(
        `${process.env.FLUIDPAY_API_URL}/api/transaction/${findAllTxn[i].TransactionId}`,
        requestOptions
      );
      const data = await response.json();
      if (data.status === 'success') {
        if (data['data'].status == 'settled') {
          data['data'].status = '4';
          if (data['data'].settled_at != null) {
            setteledAt = moment(data['data'].settled_at)
              .utc()
              .format('YYYY-MM-DD HH:mm:ss');
          }
          const updateStatus = await models.Transaction.update(
            {
              Status: data['data'].status,
              SettledDate: setteledAt,
              updatedAt: moment(data['data'].updated_at)
                .utc()
                .format('YYYY-MM-DD HH:mm:ss'),
            },
            {
              where: {
                TransactionId: findAllTxn[i].TransactionId,
              },
            }
          );
          console.log(updateStatus);
        }
        successArray.push(findAllTxn[i]);
      }
    }
  } catch (err) {
    Sentry.captureException(err);
    return res.status(401).json({ message: err.message });
  }
};

exports.updateAuthorizenetTransactionStatus = async (req, res) => {
  console.log('cron started for status update Authorizenet');
  try {
    const findAllTxn = await models.Transaction.findAll({
      attributes: ['TransactionId', 'MerchantId'],
      where: {
        Type: { [Op.eq]: '1' },
        Status: {
          [Op.in]: ['1', '3'],
        },
        SettledDate: { [Op.is]: null },
        TransactionGateWay: {
          [Op.eq]: 'Authorizenet',
        },
      },
    });

    for (let i = 0; i < findAllTxn.length; i++) {
      await getAuthorizenetTransation(findAllTxn[i].TransactionId)
     }
   return res.status(200).json({ message: "Success", data : findAllTxn });
  } catch (err) {
    Sentry.captureException(err);
    return res.status(401).json({ message: err.message });
  }
};

async function getAuthorizenetTransation(transactionId){
  let setteledAt = '';
  var merchantAuthenticationType = new ApiContracts.MerchantAuthenticationType();
  merchantAuthenticationType.setName(process.env.APILoginKey);
  merchantAuthenticationType.setTransactionKey(process.env.TransactionKey);

  var getRequest = new ApiContracts.GetTransactionDetailsRequest();
  getRequest.setMerchantAuthentication(merchantAuthenticationType);
  getRequest.setTransId(transactionId);
  console.log(JSON.stringify(getRequest.getJSON(), null, 2));
  var ctrl = new ApiControllers.GetTransactionDetailsController(getRequest.getJSON());

  await ctrl.execute(async function(){
    var apiResponse = ctrl.getResponse();
    var response = new ApiContracts.GetTransactionDetailsResponse(apiResponse);
    if(response != null){
      if(response.getMessages().getResultCode() == ApiContracts.MessageTypeEnum.OK){
        if (response.transaction.transactionStatus == "settledSuccessfully") {
          if (response.transaction.batch.settlementTimeUTC != null) {
            setteledAt = moment(response.transaction.batch.settlementTimeUTC).utc().format('YYYY-MM-DD HH:mm:ss');
          }
          const updateStatus = await models.Transaction.update(
            {
              Status: '4',
              SettledDate: setteledAt,
              updatedAt: setteledAt,
            },
            {
              where: {
                TransactionId: transactionId,
              },
            }
          );
          console.log(updateStatus);
        }
      } else{
        console.log('Result Code: ' + response.getMessages().getResultCode());
        console.log('Error Code: ' + response.getMessages().getMessage()[0].getCode());
        console.log('Error message: ' + response.getMessages().getMessage()[0].getText());
      }
    }
    else{
      console.log('Null Response.');
    }
  });
}
if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'demo') {
  cron.schedule('0 7 * * *', exports.createReport);
  cron.schedule('0 7 * * *', exports.createAdminReport);
  cron.schedule('0 * * * *', exports.updatePayrixTransactionStatus);
  cron.schedule('0 * * * *', exports.updateFluidTransactionStatus);
  cron.schedule('0 * * * *', exports.updateAuthorizenetTransactionStatus);
}
