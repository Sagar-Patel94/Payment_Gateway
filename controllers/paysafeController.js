const fs = require('fs');
const Sentry = require('@sentry/node');
const fetch = require('node-fetch');
const models = require('../models');
const { Op } = require('sequelize');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const sendEmail = require('../utils/sendEmail');
const request = require('request');
const crypto = require('crypto');
const moment = require('moment');

exports.getTransStatus = (status) => {
  const Status = {
    INITIATED: '1',
    PAYMENT_CAPTURED: '4',
    PAYMENT_EXPIRED: '2',
  };
  return Status[status];
};

exports.webHookStatus = (status) => {
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
  return fVal;
};

exports.payments = async (req, res) => {
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
    const user = await models.User.findOne({
      where: {
        UUID: decoded.UUID,
      },
    });
    const customerExist = await models.Customer.findOne({
      where: {
        [Op.and]: [
          { CountryCode: req.body.CountryCode },
          { PhoneNumber: req.body.PhoneNumber },
          { UserId: user.id },
        ],
      },
    });
    const stateData = await models.States.findOne({
      where: {
        Abbrevation: req.body.State,
      },
    });
    const countryData = await models.Country.findOne({
      where: {
        Abbrevation: req.body.Country,
      },
    });
    const userGateWayData = await models.MerchantPaymentGateWay.findOne({
      where: {
        [Op.and]: [
          { UserId: user.id },
          { GatewayStatus: true },
          { SuggestedMode: 'Cash' },
        ],
      },
    });
    const FeeValue = parseFloat(
      exports.getConvenienceFee(
        req.body.Amount,
        userGateWayData.ConvenienceFeeValue,
        userGateWayData.ConvenienceFeeType,
        userGateWayData.ConvenienceFeeMinimum
      )
    );
    const total =
      parseFloat(req.body.Amount) +
      parseFloat(FeeValue) +
      parseFloat(req.body.TipAmount);
    if (customerExist != null) {
      models.Customer.update(
        {
          CustomerName: req.body.CustomerName,
          Address: req.body.Address,
          City: req.body.City,
          PostalCode: req.body.PostalCode,
          StateId: stateData != undefined ? stateData.id : null,
          CountryId: countryData != undefined ? countryData.id : null,
          CountryCode: req.body.CountryCode,
          PhoneNumber: req.body.PhoneNumber,
          Email: req.body.Email,
          UserId: user.id,
        },
        { where: { id: customerExist.id } }
      );
      // const customerData = await models.Customer.create(customer);
      const nameSplit = req.body.CustomerName.split(' ');

      const data = JSON.stringify({
        type: 'PAYSAFECARD',
        amount: total,
        currency: 'USD',
        redirect: {
          success_url: `${process.env.PAYSAFE_SUCCESS_URL}`,
          failure_url: `${process.env.PAYSAFE_FAILURE_URL}`,
        },
        webhook_url: `${process.env.PAYSAFE_WEBHOOK}`,

        customer: {
          id: customerExist.id.toString(),
        },
        shop_id: 'shop1',
        expiration_time_minutes: '4320',
        customer_takeover_data: {
          first_name: nameSplit[0],
          last_name: nameSplit[1],
          address1: req.body.Address,
          postcode: req.body.PostalCode,
          city: stateData.StateName,
          country_iso2: 'US',
          phone_number: req.body.PhoneNumber,
          email: req.body.Email ?? null,
        },
      });
      const config = {
        method: 'post',
        //Demo URL
        url: `${process.env.PAYSAFE_ENDPOINT}payments`,
        headers: {
          'Content-Type': 'application/json',
          //Demo Authorization
          Authorization: `Basic ${userGateWayData.GatewayApiKey}`,
          'Correlation-ID':
            'pscash_trxid01_' + Math.round(Math.random() * 9999),
        },
        data: data,
      };
      const request = {
        GatewayType: 'PaysafeCash',
        Request: config,
        Response: null,
        CustomerId: customerExist.id,
        MerchantId: user.id,
      };
      const addRequest = await models.ResponseRequestTable.create(request);
      const response = await axios(config);
      const requestResponse = {
        GatewayType: 'PaysafeCash',
        Request: config,
        Response: response.data,
        CustomerId: customerExist.id,
        MerchantId: user.id,
      };
      const insertRequest = await models.ResponseRequestTable.create(
        requestResponse
      );

      if (response.data && response.data.redirect) {
        const stats = exports.getTransStatus(response.data.status);

        const transactionData = {
          CustomerId: customerExist.id,
          MerchantId: user.id,
          TransactionId: response.data.id,
          Amount: response.data.amount,
          Type: '1',
          Status: stats,
          BillingEmail: req.body.Email,
          BillingCustomerName: req.body.CustomerName,
          BillingAddress: req.body.Address,
          BillingCity: req.body.Email,
          BillingState: stateData != undefined ? stateData.id : null,
          BillingPostalCode: req.body.PostalCode,
          BillingCountry: countryData != undefined ? countryData.id : null,
          BillingCountryCode: req.body.CountryCode,
          BillingPhoneNumber: req.body.PhoneNumber,
          IsShippingSame: req.body.shippingSameAsBilling,
          ShippingEmail: req.body.Email ?? null,
          ShippingCustomerName: req.body.CustomerName,
          ShippingAddress: req.body.Address,
          ShippingCity: req.body.City,
          ShippingState: stateData.id,
          ShippingPostalCode: req.body.PostalCode,
          ShippingCountry: countryData.id,
          ShippingPhoneNumber: req.body.PhoneNumber,
          ExpiryDate: null,
          Cvv: null,
          ConvenienceFeeValue: parseFloat(FeeValue),
          ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
          ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
          AuthCode: response.data.redirect.auth_url,
          TransactionGateWay: 'PaysafeCash',
          Refund: false,
          Void: false,
          Capture: false,
          Tokenization: false, // req.body.PaymentTokenization,
          Message: req.body.Message,
          Description: req.body.Description,
          ReferenceNo: req.body.ReferenceNo,
          ConvenienceFeeActive: userGateWayData.ConvenienceFeeActive,
          RequestOrigin: 'pg-sms',
          createdAt: moment(response.data.created).format(
            'YYYY-MM-DD HH:mm:ss'
          ),
          updatedAt: moment(response.data.updated).format(
            'YYYY-MM-DD HH:mm:ss'
          ),
          ProcessorId: null,
          SuggestedMode:
            req.body.SuggestedMode != undefined
              ? req.body.SuggestedMode
              : 'Cash',
          TipAmount: parseFloat(req.body.TipAmount),
        };
        const trs = await models.Transaction.create(transactionData);
        await exports.sendWebHook(
          undefined,
          trs,
          req.body.PaymentLinkId,
          user.id
        );
        res.status(200).json({
          message: 'Payment barcode generated successfully',
          url: response.data.redirect.auth_url,
          data: response.data,
        });
      } else {
        Sentry.captureException(response.data);
        const requestResponse = {
          GatewayType: 'PaysafeCash',
          Request: config,
          Response: response.data,
          CustomerId: customerExist.id,
          MerchantId: user.id,
        };
        const insertRequest = await models.ResponseRequestTable.create(
          requestResponse
        );
        res.status(403).json(response.data);
      }
    }
    //Else part starts
    else {
      const customer = {
        CustomerName: req.body.CustomerName,
        Address: req.body.Address,
        City: req.body.City,
        PostalCode: req.body.PostalCode,
        StateId: stateData != undefined ? stateData.id : null,
        CountryId: countryData != undefined ? countryData.id : null,
        CountryCode: req.body.CountryCode,
        PhoneNumber: req.body.PhoneNumber,
        Email: req.body.Email,
        UserId: user.id,
      };
      const customerData = await models.Customer.create(customer);
      const nameSplit = req.body.CustomerName.split(' ');
      const data = JSON.stringify({
        type: 'PAYSAFECARD',
        amount: total,
        currency: 'USD',
        redirect: {
          success_url: `${process.env.PAYSAFE_SUCCESS_URL}`,
          failure_url: `${process.env.PAYSAFE_FAILURE_URL}`,
        },
        //Demo URL
        webhook_url: `${process.env.PAYSAFE_WEBHOOK}`,
        customer: {
          id: customerData.id.toString(),
        },
        shop_id: 'shop1',
        expiration_time_minutes: '4320',
        customer_takeover_data: {
          first_name: nameSplit[0],
          last_name: nameSplit[1],
          address1: req.body.Address,
          postcode: req.body.PostalCode,
          city: stateData.StateName,
          country_iso2: 'US',
          phone_number: req.body.PhoneNumber,
          email: req.body.Email,
        },
      });
      console.log(data);
      const config = {
        method: 'post',
        url: `${process.env.PAYSAFE_ENDPOINT}payments`,
        headers: {
          'Content-Type': 'application/json',
          //Demo Authorization
          Authorization: `Basic ${userGateWayData.GatewayApiKey}`,
          'Correlation-ID':
            'pscash_trxid01_' + Math.round(Math.random() * 9999),
        },
        data: data,
      };
      const requestResponseTbl = {
        GatewayType: 'PaysafeCash',
        Request: config,
        Response: null,
        CustomerId: customerData.id,
        MerchantId: user.id,
      };
      const addRequest = await models.ResponseRequestTable.create(
        requestResponseTbl
      );

      const response = await axios(config);
      const requestResponse = {
        GatewayType: 'PaysafeCash',
        Request: config,
        Response: response.data,
        CustomerId: customerData.id,
        MerchantId: user.id,
      };
      const insertRequest = await models.ResponseRequestTable.create(
        requestResponse
      );
      if (response.data && response.data.redirect) {
        const stats = exports.getTransStatus(response.data.status);
        const transactionData = {
          CustomerId: customerData.id,
          MerchantId: user.id,
          TransactionId: response.data.id,
          Amount: response.data.amount,
          Type: '1',
          Status: stats,
          BillingEmail: req.body.Email,
          BillingCustomerName: req.body.CustomerName,
          BillingAddress: req.body.Address,
          BillingCity: req.body.Email,
          BillingState: stateData != undefined ? stateData.id : null,
          BillingPostalCode: req.body.PostalCode,
          BillingCountry: countryData != undefined ? countryData.id : null,
          BillingCountryCode: req.body.CountryCode,
          BillingPhoneNumber: req.body.PhoneNumber,
          IsShippingSame: req.body.shippingSameAsBilling,
          ShippingEmail: req.body.Email ?? null,
          ShippingCustomerName: req.body.CustomerName,
          ShippingAddress: req.body.Address,
          ShippingCity: req.body.City,
          ShippingState: stateData.id,
          ShippingPostalCode: req.body.PostalCode,
          ShippingCountry: countryData.id,
          ShippingPhoneNumber: req.body.PhoneNumber,
          ExpiryDate: null,
          Cvv: null,
          ConvenienceFeeValue: parseFloat(FeeValue),
          ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
          ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
          AuthCode: response.data.redirect.auth_url,
          TransactionGateWay: 'PaysafeCash',
          Refund: false,
          Void: false,
          Capture: false,
          Tokenization: false, // req.body.PaymentTokenization,
          Message: req.body.Message,
          Description: req.body.Description,
          ReferenceNo: req.body.ReferenceNo,
          ConvenienceFeeActive: userGateWayData.ConvenienceFeeActive,
          RequestOrigin: 'pg-sms',
          createdAt: moment(response.data.created).format(
            'YYYY-MM-DD HH:mm:ss'
          ),
          updatedAt: moment(response.data.updated).format(
            'YYYY-MM-DD HH:mm:ss'
          ),
          ProcessorId: null,
          SuggestedMode:
            req.body.SuggestedMode != undefined
              ? req.body.SuggestedMode
              : 'Cash',
          TipAmount: parseFloat(req.body.TipAmount),
        };
        const trs = await models.Transaction.create(transactionData);
        await exports.sendWebHook(
          undefined,
          trs,
          req.body.PaymentLinkId,
          user.id
        );

        res.status(200).json({
          message: 'Payment barcode generated successfully',
          url: response.data.redirect.auth_url,
          data: response.data,
        });
      } else {
        Sentry.captureException(response.data);
        const requestResponse = {
          GatewayType: 'PaysafeCash',
          Request: config,
          Response: response.data,
          CustomerId: customerData.id,
          MerchantId: user.id,
        };
        const insertRequest = await models.ResponseRequestTable.create(
          requestResponse
        );
        res.status(403).json(response.data);
      }
    }
  } catch (err) {
    Sentry.captureException(err);
    res.status(403).json(err);
  }
};

exports.payementNotification = async (req, res) => {
  let headers = req.headers;
  let body = req.body;
  const Request = Object.assign(headers, body);
  if (req.body.data.mtid != undefined) {
    const transData = await models.Transaction.findOne({
      where: {
        TransactionId: req.body.data.mtid,
      },
    });
    const CustomerName = await models.Customer.findOne({
      where: { id: transData.CustomerId },
    });
    const linkId = await models.PaymentLink.findOne({
      where: { TransactionId: transData.UUID },
    });
    if (transData) {
      const RequestResponse = {
        GatewayType: 'PaysafeCash',
        Request: Request,
        Response: null,
        CustomerId: transData.CustomerId,
        MerchantId: transData.MerchantId,
      };
      const stats = exports.getTransStatus(req.body.eventType);

      await models.ResponseRequestTable.create(RequestResponse);
      await transData.update({ Status: stats }).then(async (transaction) => {
        const transtionData = await models.Transaction.findOne({
          where: {
            TransactionId: req.body.data.mtid,
          },
        });

        const getStatus =
          transtionData === undefined
            ? `Failed Due to payment Expired`
            : exports.webHookStatus(transtionData.Status);

        const webhookTransData = {
          TransactionId:
            transtionData === undefined ? null : transtionData.TransactionId,
          Amount: transtionData === undefined ? null : transtionData.Amount,
          CreatedAt:
            transtionData === undefined ? null : transtionData.createdAt,
          AuthCode: transtionData === undefined ? null : transtionData.AuthCode,
          PaymenyLinkId: linkId.UUID,
          Status: getStatus,
          Fee:
            transtionData === undefined
              ? null
              : transtionData.ConvenienceFeeValue,
          GatewayType:
            transtionData === undefined
              ? null
              : transtionData.TransactionGateWay,
          CreatedBy: linkId.CreatedBy,
          CustomerName: CustomerName.CustomerName,
          TipAmount:
            transtionData === undefined ? null : transtionData.TipAmount,
        };
        const webHookConfig = {
          method: 'post',
          url: linkId.WebHookUrl,
          headers: {
            'Content-Type': 'application/json',
          },
          data: webhookTransData,
        };
        const requestCreated = {
          GatewayType: linkId.UUID,
          Request: webHookConfig,
          Response: '',
          CustomerId: null,
          MerchantId: null,
        };
        await models.ResponseRequestTable.create(requestCreated);

        axios(webHookConfig)
          .then(async (respnse) => {
            const responseCreated = {
              GatewayType: 'PaysafeCash',
              Request: webHookConfig,
              Response: respnse.data,
              CustomerId: null,
              MerchantId: null,
            };
            await models.ResponseRequestTable.create(responseCreated);
            return res.sendStatus(200);
          })
          .catch((err) => {
            Sentry.captureException(err);
          });
      });
    } else {
      res.sendStatus(404);
    }
  } else {
    res.sendStatus(404);
  }
};

// exports.verifySignature = (secret, body, signature) => {
//   signatureComputed = crypto
//     .createHmac('SHA256', secret)
//     .update(new Buffer(JSON.stringify(body), 'utf8'))
//     .digest('base64');

//   return signatureComputed === signature ? true : false;
// };

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
      ? exports.webHookStatus(resultTransaction.Status)
      : `${exports.webHookStatus(
          resultTransaction.Status
        )} due to ${transactionError}`;
  // const webhookTransData = {
  //   TransactionId: resultTransaction.TransactionId,
  //   Amount: resultTransaction.Amount,
  //   CreatedAt: resultTransaction.createdAt,
  //   PaymenyLinkId: linkId,
  //   AuthCode: resultTransaction.AuthCode,
  //   Fee: resultTransaction.ConvenienceFeeValue,
  //   Status: resultTransaction.Status,
  //   Fee: resultTransaction.ConvenienceFeeValue,
  //   GatewayType: resultTransaction.TransactionGateWay,
  // };
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

  const updateLink = await models.PaymentLink.update(
    { TransactionId: resultTransaction.UUID },
    {
      where: {
        UUID: linkId,
      },
    }
  );
  const requestCreated = {
    GatewayType: linkId,
    Request: webHookConfig,
    Response: '',
    CustomerId: null,
    MerchantId: null,
  };
  await models.ResponseRequestTable.create(requestCreated);
  const webHookResponse = await axios(webHookConfig);
  const responseCreated = {
    GatewayType: linkId,
    Request: webHookConfig,
    Response: webHookResponse.data,
    CustomerId: null,
    MerchantId: null,
  };
  await models.ResponseRequestTable.create(responseCreated);
  return webHookResponse;
};
