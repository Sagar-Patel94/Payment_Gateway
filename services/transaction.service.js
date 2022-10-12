const models = require('../models');
const fetch = require('node-fetch');
const { Op } = require('sequelize');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const Sentry = require('@sentry/node');
const sendEmail = require('../utils/sendEmail');
const moment = require('moment');
const { utc } = require('moment');

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
    timeDiffTo = ' 16:59:59';
}

class TranasactionService {

    //To process all Txn via Auxvault

    async postTransaction(req, headers) {
        let token = '';
        let decoded = '';
        if (req.MerchantId != undefined) {
            decoded = {};
            decoded.UUID = req.MerchantId;
        } else {
            token = headers.authorization.split(' ');
            decoded = jwt.verify(token[1], process.env.JWT_SECRET);
        }

        try {
            const userInfo = await models.User.findOne({
                where: {
                    UUID: decoded.UUID,
                },
            });
            const userLevel = userInfo.UserLevel;
            const findGateWay = await this.userGateways(req, userInfo);

            let gateWay = findGateWay[0].GatewayType;
            // return {gateWay, userLevel};
            if (gateWay == 'Payrix') {
                return this.processPayrixTransactions(
                    req,
                    userInfo,
                    findGateWay[0]
                );
            } else if (
                gateWay == 'FluidPay' &&
                (userLevel == 'Level1' || userLevel == 'Level2')
            ) {
                return this.processFluidLOneTwoTransactions(
                    req,
                    userInfo,
                    findGateWay[0],
                    findGateWay[1],
                    findGateWay[2],
                    findGateWay[3]
                );
            } else if (gateWay == 'FluidPay' && userLevel == 'Level3') {
                return this.processFluidLThreeTransactions(
                    req,
                    userInfo,
                    findGateWay[0],
                    findGateWay[1],
                    findGateWay[2],
                    findGateWay[3]
                );
            }
        } catch (error) {
            Sentry.captureException(error);
            return { status: 'error', message: error.ReferenceError };
        }
    }

    async userGateways(req, userInfo) {
        try {
            let total = '';
            let feeAmount = '';
            let minmumTxn = '';
            let userLevel = userInfo.UserLevel;
            let userGateWayData = '';
            if (req.PaymentLinkId == undefined) {
                userGateWayData = await models.MerchantPaymentGateWay.findOne({
                    where: {
                        [Op.and]: [
                            { UserId: userInfo.id },
                            { SuggestedMode: 'Card' },
                            { GatewayStatus: true },
                            { ConvenienceFeeActive: req.ConvenienceFeeActive },
                        ],
                    },
                });

                if (
                    req.ConvenienceFeeActive === true &&
                    userGateWayData.GatewayType == 'FluidPay' &&
                    userLevel == 'Level1'
                ) {
                    userGateWayData = await models.MerchantPaymentGateWay.findOne({
                        where: {
                            [Op.and]: [
                                { UserId: userInfo.id },
                                { SuggestedMode: 'Card' },
                                { GatewayStatus: true },
                                { ConvenienceFeeActive: req.ConvenienceFeeActive },
                            ],
                        },
                    });
                    feeAmount = parseFloat(
                        this.getConvenienceFee(
                            req.Amount,
                            userGateWayData.ConvenienceFeeValue,
                            userGateWayData.ConvenienceFeeType,
                            userGateWayData.ConvenienceFeeMinimum
                        )
                    );
                    total = parseFloat(req.Amount) + parseFloat(feeAmount);
                } else if (
                    req.ConvenienceFeeActive === true &&
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
                                { ConvenienceFeeActive: req.ConvenienceFeeActive },
                            ],
                        },
                    });
                    feeAmount = parseFloat(
                        this.getConvenienceFee(
                            req.Amount,
                            userGateWayData.ConvenienceFeeValue,
                            userGateWayData.ConvenienceFeeType,
                            userGateWayData.ConvenienceFeeMinimum
                        )
                    );
                    total = parseFloat(req.Amount) + parseFloat(feeAmount);
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
                                        { ConvenienceFeeActive: req.ConvenienceFeeActive },
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
                                    { ConvenienceFeeActive: req.ConvenienceFeeActive },
                                ],
                            },
                        });
                    }
                } else if (
                    req.ConvenienceFeeActive === false &&
                    userGateWayData.ConvenienceFeeActive === false &&
                    userGateWayData.GatewayType == 'FluidPay' &&
                    (userLevel == 'Level2' || userLevel == 'Level3')
                ) {
                    feeAmount = parseFloat(0);
                    minmumTxn = false;
                    total = parseFloat(req.Amount);
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
                } else {
                    feeAmount = parseFloat(0);
                    minmumTxn = false;
                    total = parseFloat(req.Amount);
                    userGateWayData = await models.MerchantPaymentGateWay.findOne({
                        where: {
                            [Op.and]: [
                                { UserId: userInfo.id },
                                { SuggestedMode: 'Card' },
                                { GatewayStatus: true },
                                { ConvenienceFeeActive: req.ConvenienceFeeActive },
                            ],
                        },
                    });
                }
            } else {
                const checkFeeActive = await models.PaymentLink.findOne({
                    where: { UUID: req.PaymentLinkId },
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
                        this.getConvenienceFee(
                            req.Amount,
                            userGateWayData.ConvenienceFeeValue,
                            userGateWayData.ConvenienceFeeType,
                            userGateWayData.ConvenienceFeeMinimum
                        )
                    );
                    total = parseFloat(req.Amount) + parseFloat(feeAmount);
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
                        this.getConvenienceFee(
                            req.Amount,
                            userGateWayData.ConvenienceFeeValue,
                            userGateWayData.ConvenienceFeeType,
                            userGateWayData.ConvenienceFeeMinimum
                        )
                    );
                    total = parseFloat(req.Amount) + parseFloat(feeAmount);
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
                    total = parseFloat(req.Amount);
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
                } else {
                    feeAmount = parseFloat(0);
                    minmumTxn = false;
                    total = parseFloat(req.Amount);
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
            return {
                status: 'error',
                message: 'Something went wrong',
                error: err,
            };
        }
    }

    getConvenienceFee(
        amount,
        feeValue,
        isUnitPercentage,
        feeMinimum
    ) {
        const fVal =
            isUnitPercentage == 'Percentage'
                ? (parseFloat(amount) * parseFloat(feeValue)) / 100 <
                    parseFloat(feeMinimum)
                    ? parseFloat(feeMinimum)
                    : (parseFloat(amount) * parseFloat(feeValue)) / 100
                : parseFloat(feeValue);
        return parseFloat(fVal).toFixed(2);
    }
    // To process a Txn via Auxvault using Payrix
    async processPayrixTransactions(req, userInfo, userGateWayData) {
        const delay = (ms = 4000) => new Promise((r) => setTimeout(r, ms));
        try {
            let feeAmount = '',
                total = '';

            const payment = {
                number: req.CardNumber.replace(/\s/g, ''),
                cvv: req.Cvv,
            };

            let transaction = {
                merchant: userGateWayData.GMerchantId,
                type: req.TransactionType,
                origin: '1',
                payment: payment,
                expiration: req.ExpiryDate.replace(/\s/g, '').replace(/\\|\//g, ''),
                first: req.BillingCustomerName,
                address1: req.BillingAddress,
                city: req.BillingCity,
                state: req.BillingState != 'OT' ? req.BillingState : '',
                zip: req.BillingPostalCode,
                country: req.BillingCountry,
                email:
                    req.BillingEmail !== null && req.BillingEmail !== undefined
                        ? req.BillingEmail
                        : null,
                phone: req.BillingPhoneNumber,
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
                    Abbrevation: req.BillingState ?? null,
                },
            });

            const countryData = await models.Country.findOne({
                where: {
                    Abbrevation: req.BillingCountry ?? null,
                },
            });
            if (req.PaymentLinkId == undefined) {
                if (
                    userGateWayData.ConvenienceFeeActive == true &&
                    req.ConvenienceFeeActive == true
                ) {
                    feeAmount = parseFloat(
                        this.getConvenienceFee(
                            req.Amount,
                            userGateWayData.ConvenienceFeeValue,
                            userGateWayData.ConvenienceFeeType,
                            userGateWayData.ConvenienceFeeMinimum
                        )
                    );
                    total = parseFloat(req.Amount) + parseFloat(feeAmount);
                    transaction['total'] = Math.round(total * 100);
                    transaction['fee'] = Math.round(feeAmount * 100);
                } else {
                    feeAmount = null;
                    total = parseFloat(req.Amount);
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
                    const checkCustomer = await this.checkCustomerExist(
                        req,
                        userInfo.id
                    );

                    const findCustomer = await models.Customer.findOne({
                        where: {
                            [Op.and]: [
                                { CountryCode: req.BillingCountryCode },
                                { PhoneNumber: req.BillingPhoneNumber },
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
                            BillingCountryCode: req.BillingCountryCode,
                            BillingPhoneNumber: transData[0].phone,
                            IsShippingSame: req.shippingSameAsBilling,
                            ShippingEmail: transData[0].email,
                            ShippingCustomerName: transData[0].first,
                            ShippingAddress: transData[0].address1,
                            ShippingCity: transData[0].city,
                            ShippingState: stateData != undefined ? stateData.id : null,
                            ShippingPostalCode: transData[0].zip,
                            ShippingCountry: countryData != undefined ? countryData.id : null,
                            ShippingPhoneNumber: transData[0].phone,
                            ExpiryDate: req.ExpiryDate.replace(/\s/g, '').replace(
                                /\\|\//g,
                                ''
                            ),
                            Cvv: req.Cvv,
                            ConvenienceFeeValue: feeAmount != null ? transData[0].fee / 100 : 0,
                            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
                            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
                            AuthCode: transData[0].authorization,
                            TransactionGateWay: 'Payrix',
                            Refund: false,
                            Void: false,
                            Capture: false,
                            Tokenization: req.PaymentTokenization,
                            Message: req.Message,
                            Description: req.Description,
                            ReferenceNo: req.ReferenceNo,
                            ConvenienceFeeActive:
                                userGateWayData.ConvenienceFeeActive == true &&
                                    req.ConvenienceFeeActive == true
                                    ? true
                                    : false,
                            RequestOrigin: req.RequestOrigin,
                            createdAt: transData[0].created,
                            updatedAt: transData[0].modified,
                            SuggestedMode : req.SuggestedMode != undefined ? req.SuggestedMode : null
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
                        await this.checkNotificationSettingAndCreateEmail(userInfo.id, transData[0].id, 'TransactionCompleted');
                        if (req.PaymentTokenization == true) {
                            if (checkCustomer != 'skip Token') {
                                const createToken = {
                                    merchant: userGateWayData.GMerchantId,
                                    first: transData[0].first,
                                    phone: transData[0].phone,
                                    country: req.BillingCountry,
                                    zip: transData[0].zip,
                                    state:
                                        req.BillingState != 'OT' ? req.BillingState : '',
                                    city: transData[0].city,
                                    address1: transData[0].address1,
                                    inactive: 0,
                                    frozen: 0,
                                    shippingFirst: transData[0].first,
                                    shippingAddress1: transData[0].address1,
                                    shippingCity: transData[0].city,
                                    shippingState:
                                        req.BillingState != 'OT' ? req.BillingState : '',
                                    shippingZip: transData[0].zip,
                                    shippingCountry: req.BillingCountry,
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
                                await this.createCustomerToken(
                                    createToken,
                                    userGateWayData.GatewayApiKey,
                                    trs,
                                    payment,
                                    req.ExpiryDate.replace(/\s/g, '').replace(/\\|\//g, ''),
                                    checkCustomer
                                );
                                return {
                                    status: 'success',
                                    message: 'Transaction Completed Successfully',
                                    data: JSON.parse(JSON.stringify(trs)),
                                };
                            } else {
                                return {
                                    status: 'success',
                                    message: 'Transaction Completed Successfully',
                                    data: JSON.parse(JSON.stringify(trs)),
                                };
                            }
                        } else {
                            return {
                                status: 'success',
                                message: 'Transaction Completed Successfully',
                                data: JSON.parse(JSON.stringify(trs)),
                            };
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
                            BillingCountryCode: req.BillingCountryCode,
                            BillingPhoneNumber: transData[0].phone,
                            IsShippingSame: req.shippingSameAsBilling,
                            ShippingEmail: transData[0].email,
                            ShippingCustomerName: transData[0].first,
                            ShippingAddress: transData[0].address1,
                            ShippingCity: transData[0].city,
                            ShippingState: stateData != undefined ? stateData.id : null,
                            ShippingPostalCode: transData[0].zip,
                            ShippingCountry: countryData != undefined ? countryData.id : null,
                            ShippingPhoneNumber: transData[0].phone,
                            ExpiryDate: req.ExpiryDate.replace(/\s/g, '').replace(
                                /\\|\//g,
                                ''
                            ),
                            Cvv: req.Cvv,
                            ConvenienceFeeValue: feeAmount != null ? transData[0].fee / 100 : 0,
                            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
                            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
                            AuthCode: transData[0].authorization,
                            TransactionGateWay: 'Payrix',
                            Refund: false,
                            Void: false,
                            Capture: false,
                            Tokenization: req.PaymentTokenization,
                            Message: req.Message,
                            Description: req.Description,
                            ReferenceNo: req.ReferenceNo,
                            ConvenienceFeeActive:
                                userGateWayData.ConvenienceFeeActive == true &&
                                    req.ConvenienceFeeActive == true
                                    ? true
                                    : false,
                            RequestOrigin: req.RequestOrigin,
                            createdAt: transData[0].created,
                            updatedAt: transData[0].modified,
                            SuggestedMode : req.SuggestedMode != undefined ? req.SuggestedMode : null
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
                        await this.checkNotificationSettingAndCreateEmail(userInfo.id, transData[0].id, 'TransactionFailed');
                        if (req.PaymentTokenization == true) {
                            if (checkCustomer != 'skip Token') {
                                const createToken = {
                                    merchant: userGateWayData.GMerchantId,
                                    first: transData[0].first,
                                    phone: transData[0].phone,
                                    country: req.BillingCountry,
                                    zip: transData[0].zip,
                                    state:
                                        req.BillingState != 'OT' ? req.BillingState : '',
                                    city: transData[0].city,
                                    address1: transData[0].address1,
                                    inactive: 0,
                                    frozen: 0,
                                    shippingFirst: transData[0].first,
                                    shippingAddress1: transData[0].address1,
                                    shippingCity: transData[0].city,
                                    shippingState:
                                        req.BillingState != 'OT' ? req.BillingState : '',
                                    shippingZip: transData[0].zip,
                                    shippingCountry: req.BillingCountry,
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
                                await this.createCustomerToken(
                                    createToken,
                                    userGateWayData.GatewayApiKey,
                                    trs,
                                    payment,
                                    req.ExpiryDate.replace(/\s/g, '').replace(/\\|\//g, ''),
                                    checkCustomer
                                );
                                return {
                                    status: 'error',
                                    message: `Transaction Failed due to ${transError}`,
                                    data: JSON.parse(JSON.stringify(trs)),
                                };
                            } else {
                                return {
                                    status: 'error',
                                    message: `Transaction Failed due to ${transError}`,
                                    data: JSON.parse(JSON.stringify(trs)),
                                };
                            }
                        } else {
                            return {
                                status: 'error',
                                message: `Transaction Failed due to ${transError}`,
                                data: JSON.parse(JSON.stringify(trs)),
                            };
                        }
                    } else if (
                        newResp.response.data.length == 0 &&
                        newResp.response.errors.length > 0
                    ) {
                        await this.sendEmailToMerchantOnFailedTransaction(userInfo, 'Transaction Failed', `${newResp.response.errors[0].msg}`);
                        Sentry.captureException(newResp.response.errors[0].msg);
                        return {
                            status: 'error',
                            message: `${newResp.response.errors[0].msg}`,
                        };
                    }
                } else {
                    await this.sendEmailToMerchantOnFailedTransaction(userInfo, 'Transaction Failed', responseData.response.errors[0].msg);
                    Sentry.captureException(responseData.response.errors[0].msg);
                    return {
                        status: 'error',
                        message: `${responseData.response.errors[0].msg}`,
                    };
                }
            } else {
                //For paymentLink Transactions
                const checkFeeActive = await models.PaymentLink.findOne({
                    where: { UUID: req.PaymentLinkId },
                });
                if (
                    checkFeeActive.ConvenienceFeeActive == true &&
                    userGateWayData.ConvenienceFeeActive == true
                ) {
                    feeAmount = parseFloat(
                        this.getConvenienceFee(
                            req.Amount,
                            userGateWayData.ConvenienceFeeValue,
                            userGateWayData.ConvenienceFeeType,
                            userGateWayData.ConvenienceFeeMinimum
                        )
                    );
                    total = parseFloat(req.Amount) + parseFloat(feeAmount);
                    transaction['total'] = Math.round(total * 100);
                    transaction['fee'] = Math.round(feeAmount * 100);
                } else {
                    feeAmount = null;
                    total = parseFloat(req.Amount);
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
                    const checkCustomer = await this.checkCustomerExist(
                        req,
                        userInfo.id
                    );

                    const findCustomer = await models.Customer.findOne({
                        where: {
                            [Op.and]: [
                                { CountryCode: req.BillingCountryCode },
                                { PhoneNumber: req.BillingPhoneNumber },
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
                            BillingCountryCode: req.BillingCountryCode,
                            BillingPhoneNumber: transData[0].phone,
                            IsShippingSame: req.shippingSameAsBilling,
                            ShippingEmail: transData[0].email,
                            ShippingCustomerName: transData[0].first,
                            ShippingAddress: transData[0].address1,
                            ShippingCity: transData[0].city,
                            ShippingState: stateData != undefined ? stateData.id : null,
                            ShippingPostalCode: transData[0].zip,
                            ShippingCountry: countryData != undefined ? countryData.id : null,
                            ShippingPhoneNumber: transData[0].phone,
                            ExpiryDate: req.ExpiryDate.replace(/\s/g, '').replace(
                                /\\|\//g,
                                ''
                            ),
                            Cvv: req.Cvv,
                            ConvenienceFeeValue: feeAmount != null ? transData[0].fee / 100 : 0,
                            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
                            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
                            AuthCode: transData[0].authorization,
                            TransactionGateWay: 'Payrix',
                            Refund: false,
                            Void: false,
                            Capture: false,
                            Tokenization: req.PaymentTokenization,
                            Message: req.Message,
                            Description: req.Description,
                            ReferenceNo: req.ReferenceNo,
                            ConvenienceFeeActive:
                                userGateWayData.ConvenienceFeeActive == true &&
                                    req.ConvenienceFeeActive == true
                                    ? true
                                    : false,
                            RequestOrigin: req.RequestOrigin,
                            createdAt: transData[0].created,
                            updatedAt: transData[0].modified,
                            SuggestedMode : req.SuggestedMode != undefined ? req.SuggestedMode : null
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
                        await this.checkNotificationSettingAndCreateEmail(userInfo.id, transData[0].id, 'TransactionCompleted');

                        if (req.PaymentTokenization == true) {
                            if (checkCustomer != 'skip Token') {
                                const createToken = {
                                    merchant: userGateWayData.GMerchantId,
                                    first: transData[0].first,
                                    phone: transData[0].phone,
                                    country: req.BillingCountry,
                                    zip: transData[0].zip,
                                    state:
                                        req.BillingState != 'OT' ? req.BillingState : '',
                                    city: transData[0].city,
                                    address1: transData[0].address1,
                                    inactive: 0,
                                    frozen: 0,
                                    shippingFirst: transData[0].first,
                                    shippingAddress1: transData[0].address1,
                                    shippingCity: transData[0].city,
                                    shippingState:
                                        req.BillingState != 'OT' ? req.BillingState : '',
                                    shippingZip: transData[0].zip,
                                    shippingCountry: req.BillingCountry,
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
                                await this.createCustomerToken(
                                    createToken,
                                    userGateWayData.GatewayApiKey,
                                    trs,
                                    payment,
                                    req.ExpiryDate.replace(/\s/g, '').replace(/\\|\//g, ''),
                                    checkCustomer
                                );
                                await this.sendWebHook(
                                    undefined,
                                    trs,
                                    req.PaymentLinkId,
                                    userInfo.id
                                );
                                return {
                                    status: 'success',
                                    message: 'Transaction Completed Successfully',
                                    data: JSON.parse(JSON.stringify(trs)),
                                };
                            } else {
                                await this.sendWebHook(
                                    undefined,
                                    trs,
                                    req.PaymentLinkId,
                                    userInfo.id
                                );
                                return {
                                    status: 'success',
                                    message: 'Transaction Completed Successfully',
                                    data: JSON.parse(JSON.stringify(trs)),
                                };
                            }
                        } else {
                            await this.sendWebHook(
                                undefined,
                                trs,
                                req.PaymentLinkId,
                                userInfo.id
                            );
                            return {
                                status: 'success',
                                message: 'Transaction Completed Successfully',
                                data: JSON.parse(JSON.stringify(trs)),
                            };
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
                            BillingCountryCode: req.BillingCountryCode,
                            BillingPhoneNumber: transData[0].phone,
                            IsShippingSame: req.shippingSameAsBilling,
                            ShippingEmail: transData[0].email,
                            ShippingCustomerName: transData[0].first,
                            ShippingAddress: transData[0].address1,
                            ShippingCity: transData[0].city,
                            ShippingState: stateData != undefined ? stateData.id : null,
                            ShippingPostalCode: transData[0].zip,
                            ShippingCountry: countryData != undefined ? countryData.id : null,
                            ShippingPhoneNumber: transData[0].phone,
                            ExpiryDate: req.ExpiryDate.replace(/\s/g, '').replace(
                                /\\|\//g,
                                ''
                            ),
                            Cvv: req.Cvv,
                            ConvenienceFeeValue: feeAmount != null ? transData[0].fee / 100 : 0,
                            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
                            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
                            AuthCode: transData[0].authorization,
                            TransactionGateWay: 'Payrix',
                            Refund: false,
                            Void: false,
                            Capture: false,
                            Tokenization: req.PaymentTokenization,
                            Message: req.Message,
                            Description: req.Description,
                            ReferenceNo: req.ReferenceNo,
                            ConvenienceFeeActive:
                                userGateWayData.ConvenienceFeeActive == true &&
                                    req.ConvenienceFeeActive == true
                                    ? true
                                    : false,
                            RequestOrigin: req.RequestOrigin,
                            createdAt: transData[0].created,
                            updatedAt: transData[0].modified,
                            SuggestedMode : req.SuggestedMode != undefined ? req.SuggestedMode : null
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

                        await this.checkNotificationSettingAndCreateEmail(userInfo.id, transData[0].id, 'TransactionFailed');

                        if (req.PaymentTokenization == true) {
                            if (checkCustomer != 'skip Token') {
                                const createToken = {
                                    merchant: userGateWayData.GMerchantId,
                                    first: transData[0].first,
                                    phone: transData[0].phone,
                                    country: req.BillingCountry,
                                    zip: transData[0].zip,
                                    state:
                                        req.BillingState != 'OT' ? req.BillingState : '',
                                    city: transData[0].city,
                                    address1: transData[0].address1,
                                    inactive: 0,
                                    frozen: 0,
                                    shippingFirst: transData[0].first,
                                    shippingAddress1: transData[0].address1,
                                    shippingCity: transData[0].city,
                                    shippingState:
                                        req.BillingState != 'OT' ? req.BillingState : '',
                                    shippingZip: transData[0].zip,
                                    shippingCountry: req.BillingCountry,
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
                                await this.createCustomerToken(
                                    createToken,
                                    userGateWayData.GatewayApiKey,
                                    trs,
                                    payment,
                                    req.ExpiryDate.replace(/\s/g, '').replace(/\\|\//g, ''),
                                    checkCustomer
                                );
                                await this.sendWebHook(
                                    transError,
                                    trs,
                                    req.PaymentLinkId,
                                    userInfo.id
                                );
                                return {
                                    status: 'error',
                                    message: `Transaction Failed due to ${transError}`,
                                    data: JSON.parse(JSON.stringify(trs)),
                                };
                            } else {
                                await this.sendWebHook(
                                    transError,
                                    trs,
                                    req.PaymentLinkId,
                                    userInfo.id
                                );
                                return {
                                    status: 'error',
                                    message: `Transaction Failed due to ${transError}`,
                                    data: JSON.parse(JSON.stringify(trs)),
                                };
                            }
                        } else {
                            await this.sendWebHook(
                                transError,
                                trs,
                                req.PaymentLinkId,
                                userInfo.id
                            );
                            return {
                                status: 'error',
                                message: `Transaction Failed due to ${transError}`,
                                data: JSON.parse(JSON.stringify(trs)),
                            };
                        }
                    } else if (
                        newResp.response.data.length == 0 &&
                        newResp.response.errors.length > 0
                    ) {
                        await this.sendEmailToMerchantOnFailedTransaction(userInfo, 'Transaction Failed', `Transaction Failed due to ${newResp.response.errors[0].msg}`);

                        Sentry.captureException(newResp.response.errors[0].msg);
                        return {
                            status: 'error',
                            message: `${newResp.response.errors[0].msg}`,
                        };
                    }
                } else {
                    await this.sendWebHook(
                        `Transaction Failed due to ${responseData.response.errors[0].msg}`,
                        undefined,
                        req.PaymentLinkId,
                        userInfo.id
                    );
                    await this.sendEmailToMerchantOnFailedTransaction(userInfo, 'Transaction Failed', `Transaction Failed due to ${responseData.response.errors[0].msg}`);
                    Sentry.captureException(responseData.response.errors[0].msg);
                    return {
                        status: 'error',
                        message: `${responseData.response.errors[0].msg}`,
                    };
                }
            }
        } catch (error) {
            Sentry.captureException(error);
            return {
                status: 'error',
                message: 'Something went wrong',
                function: 'processPayrixTransactions',
                error: error,
            };
        }
    }

    // To Create Token for customer (Applicable only to Payrix Txns)
    async createCustomerToken(
        tokenObj,
        apiKey,
        trsData,
        paymentOpt,
        expiryDate,
        checkCustomer
    ) {
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

    //Transaction Status Constants General for txns via Auxvault
    getTransStatus = (status) => {
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

    async sendWebHook(
        transactionError,
        resultTransaction,
        linkId,
        userId
    ) {
        const wbUrl = await models.PaymentLink.findOne({ where: { UUID: linkId } });
        const customerName = await models.Customer.findOne({
            where: { id: wbUrl.CustomerId },
        });
        const getStatus =
            resultTransaction === undefined
                ? `Failed Due to ${transactionError}`
                : transactionError == undefined
                    ? this.getTransStatus(resultTransaction.Status)
                    : `${this.getTransStatus(
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
    }

    //To fetch customer info and insert/update the customer for each Txn
    async checkCustomerExist(req, merchantId) {
        let customerCardExist;
        let tokenExist;
        const customerExist = await models.Customer.findOne({
            where: {
                [Op.and]: [
                    { CountryCode: req.BillingCountryCode },
                    { PhoneNumber: req.BillingPhoneNumber },
                    { UserId: merchantId },
                ],
            },
        });
        if (customerExist != null) {
            customerCardExist = await models.Card.findOne({
                where: {
                    [Op.and]: [
                        { CardNumber: req.CardNumber },
                        { CustomerId: customerExist.id },
                    ],
                },
            });
            // tokenExist = await models.CardTokens.findAll({
            //   where: {
            //     [Op.and]: [
            //       { CardNumber: req.CardNumber },
            //       { CustomerId: customerExist.id },
            //     ],
            //   },
            // });
        }

        const stateData = await models.States.findOne({
            where: {
                Abbrevation: req.BillingState ?? null,
            },
        });
        const countryData = await models.Country.findOne({
            where: {
                Abbrevation: req.BillingCountry ?? null,
            },
        });
        if (customerExist != undefined) {
            const updateCustomer = await models.Customer.update(
                {
                    CustomerName: req.BillingCustomerName,
                    Address: req.BillingAddress,
                    City: req.BillingCity,
                    PostalCode: req.BillingPostalCode,
                    StateId: stateData != undefined ? stateData.id : null,
                    CountryId: countryData != undefined ? countryData.id : null,
                    CountryCode: customerExist.CountryCode,
                    PhoneNumber: customerExist.PhoneNumber,
                    Email: req.BillingEmail ?? null,
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
                CustomerName: req.BillingCustomerName,
                Address: req.BillingAddress,
                City: req.BillingCity,
                PostalCode: req.BillingPostalCode,
                StateId: stateData != undefined ? stateData.id : null,
                CountryId: countryData != undefined ? countryData.id : null,
                CountryCode: req.BillingCountryCode,
                PhoneNumber: req.BillingPhoneNumber,
                Email: req.BillingEmail ?? null,
                UserId: merchantId,
            };
            const insertCustomer = await models.Customer.create(customer);
        }
        const findCustomer = await models.Customer.findOne({
            where: {
                [Op.and]: [
                    { CountryCode: req.BillingCountryCode },
                    { PhoneNumber: req.BillingPhoneNumber },
                    { UserId: merchantId },
                ],
            },
        });

        if (customerCardExist != null) {
            const cardObj = {
                CardHolderName: req.BillingCustomerName,
                CustomerId: customerExist.id,
                CardNumber: req.CardNumber,
                Cvv: req.Cvv,
                ExpiryDate: req.ExpiryDate.replace(/\s/g, '').replace(/\\|\//g, ''),
                Brand: req.Brand,
            };
            const updateCard = await models.Card.update(cardObj, {
                where: {
                    id: customerCardExist.id,
                },
            });
        } else {
            const cardObj = {
                CardHolderName: req.BillingCustomerName,
                CustomerId: findCustomer.id,
                CardNumber: req.CardNumber,
                Cvv: req.Cvv,
                ExpiryDate: req.ExpiryDate.replace(/\s/g, '').replace(/\\|\//g, ''),
                Brand: req.Brand,
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

    //To process a Txn via Auxvault using FluidPay Level 1 and two Merchants

    async processFluidLOneTwoTransactions(
        req,
        userInfo,
        userGateWayData,
        total,
        feeAmount,
        minmumTxn
    ) {
        try {
            let countryName = req.BillingCountry === 'USA' ? 'US' : undefined;
            const card = {
                number: req.CardNumber.replace(/\s/g, ''),
                expiration_date: req.ExpiryDate.replace(/\s/g, ''),
                cvc: req.Cvv,
            };

            const customerExist = await models.Customer.findOne({
                where: {
                    [Op.and]: [
                        { CountryCode: req.BillingCountryCode },
                        { PhoneNumber: req.BillingPhoneNumber },
                        { UserId: userInfo.id },
                    ],
                },
            });

            const billingAddress = {
                first_name: req.BillingCustomerName,
                address_line_1: req.BillingAddress ?? undefined,
                city: req.BillingCity ?? undefined,
                state: req.BillingState ?? undefined,
                postal_code: String(req.BillingPostalCode || ''),
                country: countryName ?? undefined,
                phone: req.BillingPhoneNumber,
                email: req.BillingEmail ?? null,
            };
            if (req.shippingSameAsBilling === true) {
                var shippingAddress = {
                    first_name: req.BillingCustomerName,
                    address_line_1: req.BillingAddress ?? undefined,
                    city: req.BillingCity ?? undefined,
                    state: req.BillingState ?? undefined,
                    postal_code: String(req.BillingPostalCode || ''),
                    country: countryName ?? undefined,
                    phone: req.BillingPhoneNumber,
                    email: req.BillingEmail ?? null,
                };
            } else {
                var shippingAddress = {
                    first_name: req.ShippingCustomerName,
                    address_line_1: req.ShippingAddress ?? undefined,
                    city: req.ShippingCity ?? undefined,
                    state: req.ShippingState ?? undefined,
                    postal_code: String(req.ShippingPostalCode || ''),
                    country: countryName ?? undefined,
                    phone: req.ShippingPhoneNumber,
                    email: req.ShippingEmail ?? null,
                };
            }
            const requestHeader = {
                'Content-Type': 'application/json',
                Authorization: userGateWayData.GatewayApiKey,
            };
            if (req.PaymentLinkId == undefined) {
                var transaction = {
                    type: req.TransactionType == '1' ? 'sale' : 'authorize',
                    amount: Math.round(total * 100),
                    currency: 'USD',
                    email_receipt: false,
                    email_address: req.BillingEmail,
                    processor_id: userGateWayData.ProcessorId,
                    payment_method: { card: card },
                    billing_address: billingAddress,
                    shipping_address: shippingAddress,
                };
                if (
                    req.PaymentTokenization == true &&
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
                    const checkCustomer = await this.checkCustomerExist(
                        req,
                        userInfo.id
                    );

                    const findCustomer = await models.Customer.findOne({
                        where: {
                            [Op.and]: [
                                { CountryCode: req.BillingCountryCode },
                                { PhoneNumber: req.BillingPhoneNumber },
                                { UserId: userInfo.id },
                            ],
                        },
                    });

                    if (checkCustomer != 'skip Token') {
                        const cardToken = await this.createFluidToken(
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
                            Abbrevation: req.BillingState ?? null,
                        },
                    });
                    const countryData = await models.Country.findOne({
                        where: {
                            Abbrevation: req.BillingCountry ?? null,
                        },
                    });
                    const paymentMethods = this.fluidPayCardBrands(
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
                            Type: req.TransactionType,
                            Status: data['data'].status,
                            BillingEmail: data['data'].billing_address['email'],
                            BillingCustomerName: data['data'].billing_address['first_name'],
                            BillingAddress: data['data'].billing_address['address_line_1'],
                            BillingCity: data['data'].billing_address['city'],
                            BillingState: stateData != undefined ? stateData.id : null,
                            BillingPostalCode: data['data'].billing_address['postal_code'],
                            BillingCountry: countryData != undefined ? countryData.id : null,
                            BillingCountryCode: req.BillingCountryCode,
                            BillingPhoneNumber: data['data'].billing_address['phone'],
                            IsShippingSame: req.shippingSameAsBilling,
                            ShippingEmail: data['data'].billing_address['email'],
                            ShippingCustomerName: data['data'].billing_address['first_name'],
                            ShippingAddress: data['data'].billing_address['address_line_1'],
                            ShippingCity: data['data'].billing_address['city'],
                            ShippingState: stateData != undefined ? stateData.id : null,
                            ShippingPostalCode: data['data'].billing_address['postal_code'],
                            ShippingCountry: countryData != undefined ? countryData.id : null,
                            ShippingPhoneNumber: data['data'].billing_address['phone'],
                            ExpiryDate: req.ExpiryDate.replace(/\s/g, '').replace(
                                /\\|\//g,
                                ''
                            ),
                            Cvv: req.Cvv,
                            ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
                            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
                            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
                            AuthCode: data['data'].response_body['card'].auth_code,
                            TransactionGateWay: 'FluidPay',
                            Refund: false,
                            Void: false,
                            Capture: false,
                            Tokenization: req.PaymentTokenization,
                            Message: req.Message,
                            Description: req.Description,
                            ReferenceNo: req.ReferenceNo,
                            ConvenienceFeeActive:
                                minmumTxn != ''
                                    ? minmumTxn
                                    : userGateWayData.ConvenienceFeeActive,
                            RequestOrigin: req.RequestOrigin,
                            createdAt: data['data'].created_at,
                            updatedAt: data['data'].updated_at,
                            ProcessorId: userGateWayData.ProcessorId,
                            SuggestedMode : req.SuggestedMode != undefined ? req.SuggestedMode : null
                        };
                        const transData = await models.Transaction.create(transactionInsert);
                        await this.checkNotificationSettingAndCreateEmail(userInfo.id, data['data'].id, 'TransactionCompleted');

                        return {
                            status: 'success',
                            message: 'Transaction Processed Successfully',
                            data: JSON.parse(JSON.stringify(transData)),
                        };
                    } else if (data['data'].status == 'declined') {
                        data['data'].status = '9';
                        const transactionInsert = {
                            CustomerId: findCustomer.id,
                            MerchantId: userInfo.id,
                            TransactionId: data['data'].id,
                            Amount: data['data'].amount / 100,
                            CardNumber: data['data'].response_body['card'].last_four,
                            PaymentMethod: paymentMethods,
                            Type: req.TransactionType,
                            Status: data['data'].status,
                            BillingEmail: data['data'].billing_address['email'],
                            BillingCustomerName: data['data'].billing_address['first_name'],
                            BillingAddress: data['data'].billing_address['address_line_1'],
                            BillingCity: data['data'].billing_address['city'],
                            BillingState: stateData != undefined ? stateData.id : null,
                            BillingPostalCode: data['data'].billing_address['postal_code'],
                            BillingCountry: countryData != undefined ? countryData.id : null,
                            BillingCountryCode: req.BillingCountryCode,
                            BillingPhoneNumber: data['data'].billing_address['phone'],
                            IsShippingSame: req.shippingSameAsBilling,
                            ShippingEmail: data['data'].billing_address['email'],
                            ShippingCustomerName: data['data'].billing_address['first_name'],
                            ShippingAddress: data['data'].billing_address['address_line_1'],
                            ShippingCity: data['data'].billing_address['city'],
                            ShippingState: stateData != undefined ? stateData.id : null,
                            ShippingPostalCode: data['data'].billing_address['postal_code'],
                            ShippingCountry: countryData != undefined ? countryData.id : null,
                            ShippingPhoneNumber: data['data'].billing_address['phone'],
                            ExpiryDate: req.ExpiryDate.replace(/\s/g, '').replace(
                                /\\|\//g,
                                ''
                            ),
                            Cvv: req.Cvv,
                            ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
                            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
                            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
                            AuthCode: data['data'].response_body['card'].auth_code,
                            TransactionGateWay: 'FluidPay',
                            Refund: false,
                            Void: false,
                            Capture: false,
                            Tokenization: req.PaymentTokenization,
                            Message: req.Message,
                            Description: req.Description,
                            ReferenceNo: req.ReferenceNo,
                            ConvenienceFeeActive:
                                minmumTxn != ''
                                    ? minmumTxn
                                    : userGateWayData.ConvenienceFeeActive,
                            RequestOrigin: req.RequestOrigin,
                            createdAt: data['data'].created_at,
                            updatedAt: data['data'].updated_at,
                            ProcessorId: userGateWayData.ProcessorId,
                            SuggestedMode : req.SuggestedMode != undefined ? req.SuggestedMode : null
                        };
                        const transData = await models.Transaction.create(transactionInsert);
                        await this.checkNotificationSettingAndCreateEmail(userInfo.id, data['data'].id, 'TransactionFailed');
                        return {
                            status: 'error',
                            message: `Transaction declined due to ${data['data']['response_body']['card'].processor_response_text}`,
                            data: JSON.parse(JSON.stringify(transData)),
                        };
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
                            Type: req.TransactionType,
                            Status: data['data'].status,
                            BillingEmail: data['data'].billing_address['email'],
                            BillingCustomerName: data['data'].billing_address['first_name'],
                            BillingAddress: data['data'].billing_address['address_line_1'],
                            BillingCity: data['data'].billing_address['city'],
                            BillingState: stateData != undefined ? stateData.id : null,
                            BillingPostalCode: data['data'].billing_address['postal_code'],
                            BillingCountry: countryData != undefined ? countryData.id : null,
                            BillingCountryCode: req.BillingCountryCode,
                            BillingPhoneNumber: data['data'].billing_address['phone'],
                            IsShippingSame: req.shippingSameAsBilling,
                            ShippingEmail: data['data'].billing_address['email'],
                            ShippingCustomerName: data['data'].billing_address['first_name'],
                            ShippingAddress: data['data'].billing_address['address_line_1'],
                            ShippingCity: data['data'].billing_address['city'],
                            ShippingState: stateData != undefined ? stateData.id : null,
                            ShippingPostalCode: data['data'].billing_address['postal_code'],
                            ShippingCountry: countryData != undefined ? countryData.id : null,
                            ShippingPhoneNumber: data['data'].billing_address['phone'],
                            ExpiryDate: req.ExpiryDate.replace(/\s/g, '').replace(
                                /\\|\//g,
                                ''
                            ),
                            Cvv: req.Cvv,
                            ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
                            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
                            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
                            AuthCode: data['data'].response_body['card'].auth_code,
                            TransactionGateWay: 'FluidPay',
                            Refund: false,
                            Void: false,
                            Capture: false,
                            Tokenization: req.PaymentTokenization,
                            Message: req.Message,
                            Description: req.Description,
                            ReferenceNo: req.ReferenceNo,
                            ConvenienceFeeActive:
                                minmumTxn != ''
                                    ? minmumTxn
                                    : userGateWayData.ConvenienceFeeActive,
                            RequestOrigin: req.RequestOrigin,
                            createdAt: data['data'].created_at,
                            updatedAt: data['data'].updated_at,
                            ProcessorId: userGateWayData.ProcessorId,
                            SuggestedMode : req.SuggestedMode != undefined ? req.SuggestedMode : null
                        };
                        const transData = await models.Transaction.create(transactionInsert);
                        await this.checkNotificationSettingAndCreateEmail(userInfo.id, data['data'].id, 'TransactionFailed');
                        return {
                            status: 'error',
                            message: `Transaction declined due to ${data['data']['response_body']['card'].processor_response_text}`,
                            data: JSON.parse(JSON.stringify(transData)),
                        };
                    }
                } else {
                    await this.sendEmailToMerchantOnFailedTransaction(userInfo, 'Transaction Failed', `Transaction Failed due to ${data.msg}`);

                    return {
                        status: 'error',
                        message: data.msg,
                        data: JSON.parse(JSON.stringify(data)),
                    };
                }
            } else {
                const checkFeeActive = await models.PaymentLink.findOne({
                    where: { UUID: req.PaymentLinkId },
                });

                transaction = {
                    type: req.TransactionType == '1' ? 'sale' : 'authorize',
                    amount: Math.round(total * 100),
                    currency: 'USD',
                    email_receipt: false,
                    email_address: req.BillingEmail,
                    processor_id: userGateWayData.ProcessorId,
                    payment_method: { card: card },
                    billing_address: billingAddress,
                    shipping_address: shippingAddress,
                };
                if (
                    req.PaymentTokenization == true &&
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
                    const checkCustomer = await this.checkCustomerExist(
                        req,
                        userInfo.id
                    );

                    const findCustomer = await models.Customer.findOne({
                        where: {
                            [Op.and]: [
                                { CountryCode: req.BillingCountryCode },
                                { PhoneNumber: req.BillingPhoneNumber },
                                { UserId: userInfo.id },
                            ],
                        },
                    });
                    if (checkCustomer != 'skip Token') {
                        const cardToken = await this.createFluidToken(
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
                            Abbrevation: req.BillingState ?? null,
                        },
                    });
                    const countryData = await models.Country.findOne({
                        where: {
                            Abbrevation: req.BillingCountry ?? null,
                        },
                    });
                    const paymentMethods = this.fluidPayCardBrands(
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
                            Type: req.TransactionType,
                            Status: data['data'].status,
                            BillingEmail: data['data'].billing_address['email'],
                            BillingCustomerName: data['data'].billing_address['first_name'],
                            BillingAddress: data['data'].billing_address['address_line_1'],
                            BillingCity: data['data'].billing_address['city'],
                            BillingState: stateData != undefined ? stateData.id : null,
                            BillingPostalCode: data['data'].billing_address['postal_code'],
                            BillingCountry: countryData != undefined ? countryData.id : null,
                            BillingCountryCode: req.BillingCountryCode,
                            BillingPhoneNumber: data['data'].billing_address['phone'],
                            IsShippingSame: req.shippingSameAsBilling,
                            ShippingEmail: data['data'].billing_address['email'],
                            ShippingCustomerName: data['data'].billing_address['first_name'],
                            ShippingAddress: data['data'].billing_address['address_line_1'],
                            ShippingCity: data['data'].billing_address['city'],
                            ShippingState: stateData != undefined ? stateData.id : null,
                            ShippingPostalCode: data['data'].billing_address['postal_code'],
                            ShippingCountry: countryData != undefined ? countryData.id : null,
                            ShippingPhoneNumber: data['data'].billing_address['phone'],
                            ExpiryDate: req.ExpiryDate.replace(/\s/g, '').replace(
                                /\\|\//g,
                                ''
                            ),
                            Cvv: req.Cvv,
                            ConvenienceFeeValue: feeAmount != null ? feeAmount : 0,
                            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
                            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
                            AuthCode: data['data'].response_body['card'].auth_code,
                            TransactionGateWay: 'FluidPay',
                            Refund: false,
                            Void: false,
                            Capture: false,
                            Tokenization: req.PaymentTokenization,
                            Message: req.Message,
                            Description: req.Description,
                            ReferenceNo: req.ReferenceNo,
                            ConvenienceFeeActive:
                                minmumTxn != ''
                                    ? minmumTxn
                                    : userGateWayData.ConvenienceFeeActive,
                            RequestOrigin: req.RequestOrigin,
                            createdAt: data['data'].created_at,
                            updatedAt: data['data'].updated_at,
                            ProcessorId: userGateWayData.ProcessorId,
                            SuggestedMode : req.SuggestedMode != undefined ? req.SuggestedMode : null
                        };
                        const transData = await models.Transaction.create(transactionInsert);

                        await this.checkNotificationSettingAndCreateEmail(userInfo.id, data['data'].id, 'TransactionCompleted');

                        await this.sendWebHook(
                            undefined,
                            transData,
                            req.PaymentLinkId,
                            userInfo.id
                        );

                        return {
                            status: 'success',
                            message: 'Transaction Completed Successfully',
                            data: JSON.parse(JSON.stringify(transData)),
                        };
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
                            Type: req.TransactionType,
                            Status: data['data'].status,
                            BillingEmail: data['data'].billing_address['email'],
                            BillingCustomerName: data['data'].billing_address['first_name'],
                            BillingAddress: data['data'].billing_address['address_line_1'],
                            BillingCity: data['data'].billing_address['city'],
                            BillingState: stateData != undefined ? stateData.id : null,
                            BillingPostalCode: data['data'].billing_address['postal_code'],
                            BillingCountry: countryData != undefined ? countryData.id : null,
                            BillingCountryCode: req.BillingCountryCode,
                            BillingPhoneNumber: data['data'].billing_address['phone'],
                            IsShippingSame: req.shippingSameAsBilling,
                            ShippingEmail: data['data'].billing_address['email'],
                            ShippingCustomerName: data['data'].billing_address['first_name'],
                            ShippingAddress: data['data'].billing_address['address_line_1'],
                            ShippingCity: data['data'].billing_address['city'],
                            ShippingState: stateData != undefined ? stateData.id : null,
                            ShippingPostalCode: data['data'].billing_address['postal_code'],
                            ShippingCountry: countryData != undefined ? countryData.id : null,
                            ShippingPhoneNumber: data['data'].billing_address['phone'],
                            ExpiryDate: req.ExpiryDate.replace(/\s/g, '').replace(
                                /\\|\//g,
                                ''
                            ),
                            Cvv: req.Cvv,
                            ConvenienceFeeValue: feeAmount != null ? feeAmount : 0,
                            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
                            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
                            AuthCode: data['data'].response_body['card'].auth_code,
                            TransactionGateWay: 'FluidPay',
                            Refund: false,
                            Void: false,
                            Capture: false,
                            Tokenization: req.PaymentTokenization,
                            Message: req.Message,
                            Description: req.Description,
                            ReferenceNo: req.ReferenceNo,
                            ConvenienceFeeActive:
                                minmumTxn != ''
                                    ? minmumTxn
                                    : userGateWayData.ConvenienceFeeActive,
                            RequestOrigin: req.RequestOrigin,
                            createdAt: data['data'].created_at,
                            updatedAt: data['data'].updated_at,
                            ProcessorId: userGateWayData.ProcessorId,
                            SuggestedMode : req.SuggestedMode != undefined ? req.SuggestedMode : null
                        };
                        const transData = await models.Transaction.create(transactionInsert);
                        await this.checkNotificationSettingAndCreateEmail(userInfo.id, data['data'].id, 'TransactionFailed');
                        await this.sendWebHook(
                            `Transaction declined due to ${data['data']['response_body']['card'].processor_response_text}`,
                            transData,
                            req.PaymentLinkId,
                            userInfo.id
                        );

                        return {
                            status: 'error',
                            message: `Transaction declined due to ${data['data']['response_body']['card'].processor_response_text}`,
                            data: JSON.parse(JSON.stringify(transData)),
                        };
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
                            Type: req.TransactionType,
                            Status: data['data'].status,
                            BillingEmail: data['data'].billing_address['email'],
                            BillingCustomerName: data['data'].billing_address['first_name'],
                            BillingAddress: data['data'].billing_address['address_line_1'],
                            BillingCity: data['data'].billing_address['city'],
                            BillingState: stateData != undefined ? stateData.id : null,
                            BillingPostalCode: data['data'].billing_address['postal_code'],
                            BillingCountry: countryData != undefined ? countryData.id : null,
                            BillingCountryCode: req.BillingCountryCode,
                            BillingPhoneNumber: data['data'].billing_address['phone'],
                            IsShippingSame: req.shippingSameAsBilling,
                            ShippingEmail: data['data'].billing_address['email'],
                            ShippingCustomerName: data['data'].billing_address['first_name'],
                            ShippingAddress: data['data'].billing_address['address_line_1'],
                            ShippingCity: data['data'].billing_address['city'],
                            ShippingState: stateData != undefined ? stateData.id : null,
                            ShippingPostalCode: data['data'].billing_address['postal_code'],
                            ShippingCountry: countryData != undefined ? countryData.id : null,
                            ShippingPhoneNumber: data['data'].billing_address['phone'],
                            ExpiryDate: req.ExpiryDate.replace(/\s/g, '').replace(
                                /\\|\//g,
                                ''
                            ),
                            Cvv: req.Cvv,
                            ConvenienceFeeValue: feeAmount != null ? feeAmount : 0,
                            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
                            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
                            AuthCode: data['data'].response_body['card'].auth_code,
                            TransactionGateWay: 'FluidPay',
                            Refund: false,
                            Void: false,
                            Capture: false,
                            Tokenization: req.PaymentTokenization,
                            Message: req.Message,
                            Description: req.Description,
                            ReferenceNo: req.ReferenceNo,
                            ConvenienceFeeActive:
                                minmumTxn != ''
                                    ? minmumTxn
                                    : userGateWayData.ConvenienceFeeActive,
                            RequestOrigin: req.RequestOrigin,
                            createdAt: data['data'].created_at,
                            updatedAt: data['data'].updated_at,
                            ProcessorId: userGateWayData.ProcessorId,
                            SuggestedMode : req.SuggestedMode != undefined ? req.SuggestedMode : null
                        };
                        const transData = await models.Transaction.create(transactionInsert);
                        await this.checkNotificationSettingAndCreateEmail(userInfo.id, data['data'].id, 'TransactionFailed');
                        await this.sendWebHook(
                            `Transaction declined due to ${data['data']['response_body']['card'].processor_response_text}`,
                            transData,
                            req.PaymentLinkId,
                            userInfo.id
                        );

                        return {
                            status: 'error',
                            message: `Transaction declined due to ${data['data']['response_body']['card'].processor_response_text}`,
                            data: JSON.parse(JSON.stringify(transData)),
                        };
                    }
                } else {
                    await this.sendEmailToMerchantOnFailedTransaction(userInfo, 'Transaction Failed', `Transaction Failed due to ${data.msg}`);

                    await this.sendWebHook(
                        data.msg,
                        undefined,
                        req.PaymentLinkId,
                        userInfo.id
                    );
                    return {
                        status: 'error',
                        message: data.msg,
                        data: JSON.parse(JSON.stringify(data)),
                    };
                }
            }
        } catch (error) {
            Sentry.captureException(error);
            return {
                status: 'error',
                message: 'Something went wrong',
                error: error,
            };
        }
    }

    //To fetch Brands of credit card used for Txns FP
    fluidPayCardBrands = (brand) => {
        const methods = {
            amex: '1',
            visa: '2',
            mastercard: '3',
            diners: '4',
            discover: '5',
        };
        return methods[brand];
    };

    //To Create customer vault FluidPay
    async createFluidToken(
        req,
        userInfo,
        userGateWayData,
        gatewayData,
        customerData,
        checkCustomer
    ) {
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
                                BillingEmail: req.BillingEmail ?? null,
                                BillingCustomerName: req.BillingCustomerName,
                                BillingAddress: req.BillingAddress ?? undefined,
                                BillingCity: req.BillingCity ?? undefined,
                                BillingState: req.BillingState ?? undefined,
                                BillingPostalCode: String(req.BillingPostalCode || ''),
                                BillingCountry:
                                    req.BillingCountry === 'USA' ? 'US' : undefined,
                                BillingCountryCode: req.BillingCountryCode,
                                BillingPhoneNumber: req.BillingPhoneNumber,
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
                    number: req.CardNumber.replace(/\s/g, ''),
                    expiration_date: req.ExpiryDate.replace(/\s/g, ''),
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
                                BillingEmail: req.BillingEmail ?? null,
                                BillingCustomerName: req.BillingCustomerName,
                                BillingAddress: req.BillingAddress ?? undefined,
                                BillingCity: req.BillingCity ?? undefined,
                                BillingState: req.BillingState ?? undefined,
                                BillingPostalCode: String(req.BillingPostalCode || ''),
                                BillingCountry:
                                    req.BillingCountry === 'USA' ? 'US' : undefined,
                                BillingCountryCode: req.BillingCountryCode,
                                BillingPhoneNumber: req.BillingPhoneNumber,
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
                    BillingEmail: req.BillingEmail ?? null,
                    BillingCustomerName: req.BillingCustomerName,
                    BillingAddress: req.BillingAddress ?? undefined,
                    BillingCity: req.BillingCity ?? undefined,
                    BillingState: req.BillingState ?? undefined,
                    BillingPostalCode: String(req.BillingPostalCode || ''),
                    BillingCountry: req.BillingCountry === 'USA' ? 'US' : undefined,
                    BillingCountryCode: req.BillingCountryCode,
                    BillingPhoneNumber: req.BillingPhoneNumber,
                    PaymentId: gatewayData['data'].customer_payment_ID,
                };
                const insertData = await models.CardTokens.create(token);
            }
        } catch (err) {
            Sentry.captureException(err);
            return false;
        }
    };

    async processFluidLThreeTransactions(
        req,
        userInfo,
        userGateWayData,
        total,
        feeAmount,
        minmumTxn
    ) {
        try {
            let countryName = req.BillingCountry === 'USA' ? 'US' : undefined;
            const card = {
                number: req.CardNumber.replace(/\s/g, ''),
                expiration_date: req.ExpiryDate.replace(/\s/g, ''),
                cvc: req.Cvv,
            };

            const customerExist = await models.Customer.findOne({
                where: {
                    [Op.and]: [
                        { CountryCode: req.BillingCountryCode },
                        { PhoneNumber: req.BillingPhoneNumber },
                        { UserId: userInfo.id },
                    ],
                },
            });

            const billingAddress = {
                first_name: req.BillingCustomerName,
                address_line_1: req.BillingAddress ?? undefined,
                city: req.BillingCity ?? undefined,
                state: req.BillingState ?? undefined,
                postal_code: String(req.BillingPostalCode || ''),
                country: countryName ?? undefined,
                phone: req.BillingPhoneNumber,
                email: req.BillingEmail ?? null,
            };
            if (req.shippingSameAsBilling === true) {
                var shippingAddress = {
                    first_name: req.BillingCustomerName,
                    address_line_1: req.BillingAddress ?? undefined,
                    city: req.BillingCity ?? undefined,
                    state: req.BillingState ?? undefined,
                    postal_code: String(req.BillingPostalCode || ''),
                    country: countryName ?? undefined,
                    phone: req.BillingPhoneNumber,
                    email: req.BillingEmail ?? null,
                };
            } else {
                var shippingAddress = {
                    first_name: req.ShippingCustomerName,
                    address_line_1: req.ShippingAddress ?? undefined,
                    city: req.ShippingCity ?? undefined,
                    state: req.ShippingState ?? undefined,
                    postal_code: String(req.ShippingPostalCode || ''),
                    country: countryName ?? undefined,
                    phone: req.ShippingPhoneNumber,
                    email: req.ShippingEmail ?? null,
                };
            }
            const requestHeader = {
                'Content-Type': 'application/json',
                Authorization: userGateWayData.GatewayApiKey,
            };

            var transaction = {
                type: req.TransactionType == '1' ? 'sale' : 'authorize',
                amount: Math.round(total * 100),
                currency: 'USD',
                email_receipt: false,
                email_address: req.BillingEmail,
                create_vault_record: true,
                processor_id: userGateWayData.ProcessorId,
                payment_method: { card: card },
                billing_address: billingAddress,
                shipping_address: shippingAddress,
            };
            if (
                req.PaymentTokenization == true &&
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
                    type: req.TransactionType == '1' ? 'sale' : 'authorize',
                    amount: Math.round(total * 100),
                    currency: 'USD',
                    email_receipt: false,
                    email_address: req.BillingEmail,
                    create_vault_record: true,
                    processor_id: userGateWayData.ProcessorId,
                    payment_method: { card: card },
                    billing_address: billingAddress,
                    shipping_address: shippingAddress,
                };
                if (
                    req.PaymentTokenization == true &&
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
                    const checkCustomer = await this.checkCustomerExist(
                        req,
                        userInfo.id
                    );

                    const findCustomer = await models.Customer.findOne({
                        where: {
                            [Op.and]: [
                                { CountryCode: req.BillingCountryCode },
                                { PhoneNumber: req.BillingPhoneNumber },
                                { UserId: userInfo.id },
                            ],
                        },
                    });
                    if (checkCustomer != 'skip Token') {
                        const cardToken = await this.createFluidToken(
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
                            Abbrevation: req.BillingState ?? null,
                        },
                    });
                    const countryData = await models.Country.findOne({
                        where: {
                            Abbrevation: req.BillingCountry ?? null,
                        },
                    });
                    const paymentMethods = this.fluidPayCardBrands(
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
                            Type: req.TransactionType,
                            Status: newDataC['data'].status,
                            BillingEmail: newDataC['data'].billing_address['email'],
                            BillingCustomerName: newDataC['data'].billing_address['first_name'],
                            BillingAddress: newDataC['data'].billing_address['address_line_1'],
                            BillingCity: newDataC['data'].billing_address['city'],
                            BillingState: stateData != undefined ? stateData.id : null,
                            BillingPostalCode: newDataC['data'].billing_address['postal_code'],
                            BillingCountry: countryData != undefined ? countryData.id : null,
                            BillingCountryCode: req.BillingCountryCode,
                            BillingPhoneNumber: newDataC['data'].billing_address['phone'],
                            IsShippingSame: req.shippingSameAsBilling,
                            ShippingEmail: newDataC['data'].billing_address['email'],
                            ShippingCustomerName:
                                newDataC['data'].billing_address['first_name'],
                            ShippingAddress: newDataC['data'].billing_address['address_line_1'],
                            ShippingCity: newDataC['data'].billing_address['city'],
                            ShippingState: stateData != undefined ? stateData.id : null,
                            ShippingPostalCode: newDataC['data'].billing_address['postal_code'],
                            ShippingCountry: countryData != undefined ? countryData.id : null,
                            ShippingPhoneNumber: newDataC['data'].billing_address['phone'],
                            ExpiryDate: req.ExpiryDate.replace(/\s/g, '').replace(
                                /\\|\//g,
                                ''
                            ),
                            Cvv: req.Cvv,
                            ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
                            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
                            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
                            AuthCode: newDataC['data'].response_body['card'].auth_code,
                            TransactionGateWay: 'FluidPay',
                            Refund: false,
                            Void: false,
                            Capture: false,
                            Tokenization: false, // req.PaymentTokenization,
                            Message: req.Message,
                            Description: req.Description,
                            ReferenceNo: req.ReferenceNo,
                            ConvenienceFeeActive:
                                minmumTxn != ''
                                    ? minmumTxn
                                    : userGateWayData.ConvenienceFeeActive,
                            RequestOrigin: req.RequestOrigin,
                            createdAt: newDataC['data'].created_at,
                            updatedAt: newDataC['data'].updated_at,
                            ProcessorId: userGateWayData.ProcessorId,
                            SuggestedMode : req.SuggestedMode != undefined ? req.SuggestedMode : null
                        };
                        const transData = await models.Transaction.create(transactionInsert);
                        await this.checkNotificationSettingAndCreateEmail(userInfo.id, newDataC['data'].id, 'TransactionCompleted');

                        if (req.PaymentLinkId != undefined) {
                            await this.sendWebHook(
                                undefined,
                                transData,
                                req.PaymentLinkId,
                                userInfo.id
                            );
                        }

                        return {
                            status: 'success',
                            message: 'Transaction Processed Successfully',
                            data: JSON.parse(JSON.stringify(transData)),
                        };
                    } else if (newDataC['data'].status == 'declined') {
                        newDataC['data'].status = '9';
                        const transactionInsert = {
                            CustomerId: findCustomer.id,
                            MerchantId: userInfo.id,
                            TransactionId: newDataC['data'].id,
                            Amount: newDataC['data'].amount / 100,
                            CardNumber: newDataC['data'].response_body['card'].last_four,
                            PaymentMethod: paymentMethods,
                            Type: req.TransactionType,
                            Status: newDataC['data'].status,
                            BillingEmail: newDataC['data'].billing_address['email'],
                            BillingCustomerName: newDataC['data'].billing_address['first_name'],
                            BillingAddress: newDataC['data'].billing_address['address_line_1'],
                            BillingCity: newDataC['data'].billing_address['city'],
                            BillingState: stateData != undefined ? stateData.id : null,
                            BillingPostalCode: newDataC['data'].billing_address['postal_code'],
                            BillingCountry: countryData != undefined ? countryData.id : null,
                            BillingCountryCode: req.BillingCountryCode,
                            BillingPhoneNumber: newDataC['data'].billing_address['phone'],
                            IsShippingSame: req.shippingSameAsBilling,
                            ShippingEmail: newDataC['data'].billing_address['email'],
                            ShippingCustomerName:
                                newDataC['data'].billing_address['first_name'],
                            ShippingAddress: newDataC['data'].billing_address['address_line_1'],
                            ShippingCity: newDataC['data'].billing_address['city'],
                            ShippingState: stateData != undefined ? stateData.id : null,
                            ShippingPostalCode: newDataC['data'].billing_address['postal_code'],
                            ShippingCountry: countryData != undefined ? countryData.id : null,
                            ShippingPhoneNumber: newDataC['data'].billing_address['phone'],
                            ExpiryDate: req.ExpiryDate.replace(/\s/g, '').replace(
                                /\\|\//g,
                                ''
                            ),
                            Cvv: req.Cvv,
                            ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
                            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
                            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
                            AuthCode: newDataC['data'].response_body['card'].auth_code,
                            TransactionGateWay: 'FluidPay',
                            Refund: false,
                            Void: false,
                            Capture: false,
                            Tokenization: false, // req.PaymentTokenization,
                            Message: req.Message,
                            Description: req.Description,
                            ReferenceNo: req.ReferenceNo,
                            ConvenienceFeeActive:
                                minmumTxn != ''
                                    ? minmumTxn
                                    : userGateWayData.ConvenienceFeeActive,
                            RequestOrigin: req.RequestOrigin,
                            createdAt: newDataC['data'].created_at,
                            updatedAt: newDataC['data'].updated_at,
                            ProcessorId: userGateWayData.ProcessorId,
                            SuggestedMode : req.SuggestedMode != undefined ? req.SuggestedMode : null
                        };
                        const transData = await models.Transaction.create(transactionInsert);
                        await this.checkNotificationSettingAndCreateEmail(userInfo.id, newDataC['data'].id, 'TransactionFailed');

                        if (req.PaymentLinkId != undefined) {
                            await this.sendWebHook(
                                `Transaction declined due to ${newDataC['data']['response_body']['card'].processor_response_text}`,
                                transData,
                                req.PaymentLinkId,
                                userInfo.id
                            );
                        }
                        return {
                            status: 'error',
                            message: `Transaction declined due to ${newDataC['data']['response_body']['card'].processor_response_text}`,
                            data: JSON.parse(JSON.stringify(transData)),
                        };
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
                            Type: req.TransactionType,
                            Status: newDataC['data'].status,
                            BillingEmail: newDataC['data'].billing_address['email'],
                            BillingCustomerName: newDataC['data'].billing_address['first_name'],
                            BillingAddress: newDataC['data'].billing_address['address_line_1'],
                            BillingCity: newDataC['data'].billing_address['city'],
                            BillingState: stateData != undefined ? stateData.id : null,
                            BillingPostalCode: newDataC['data'].billing_address['postal_code'],
                            BillingCountry: countryData != undefined ? countryData.id : null,
                            BillingCountryCode: req.BillingCountryCode,
                            BillingPhoneNumber: newDataC['data'].billing_address['phone'],
                            IsShippingSame: req.shippingSameAsBilling,
                            ShippingEmail: newDataC['data'].billing_address['email'],
                            ShippingCustomerName:
                                newDataC['data'].billing_address['first_name'],
                            ShippingAddress: newDataC['data'].billing_address['address_line_1'],
                            ShippingCity: newDataC['data'].billing_address['city'],
                            ShippingState: stateData != undefined ? stateData.id : null,
                            ShippingPostalCode: newDataC['data'].billing_address['postal_code'],
                            ShippingCountry: countryData != undefined ? countryData.id : null,
                            ShippingPhoneNumber: newDataC['data'].billing_address['phone'],
                            ExpiryDate: req.ExpiryDate.replace(/\s/g, '').replace(
                                /\\|\//g,
                                ''
                            ),
                            Cvv: req.Cvv,
                            ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
                            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
                            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
                            AuthCode: newDataC['data'].response_body['card'].auth_code,
                            TransactionGateWay: 'FluidPay',
                            Refund: false,
                            Void: false,
                            Capture: false,
                            Tokenization: false, // req.PaymentTokenization,
                            Message: req.Message,
                            Description: req.Description,
                            ReferenceNo: req.ReferenceNo,
                            ConvenienceFeeActive:
                                minmumTxn != ''
                                    ? minmumTxn
                                    : userGateWayData.ConvenienceFeeActive,
                            RequestOrigin: req.RequestOrigin,
                            createdAt: newDataC['data'].created_at,
                            updatedAt: newDataC['data'].updated_at,
                            ProcessorId: userGateWayData.ProcessorId,
                            SuggestedMode : req.SuggestedMode != undefined ? req.SuggestedMode : null
                        };
                        const transData = await models.Transaction.create(transactionInsert);
                        await this.checkNotificationSettingAndCreateEmail(userInfo.id, newDataC['data'].id, 'TransactionFailed');
                        if (req.PaymentLinkId != undefined) {
                            await this.sendWebHook(
                                `Transaction declined due to ${newDataC['data']['response_body']['card'].processor_response_text}`,
                                transData,
                                req.PaymentLinkId,
                                userInfo.id
                            );
                        }
                        return {
                            status: 'error',
                            message: `Transaction declined due to ${newDataC['data']['response_body']['card'].processor_response_text}`,
                            data: JSON.parse(JSON.stringify(transData)),
                        };
                    }
                } else {
                    await this.sendEmailToMerchantOnFailedTransaction(userInfo, 'Transaction Failed', `Transaction Failed due to ${data.msg}`);

                    return {
                        status: 'error',
                        message: data.msg,
                        data: JSON.parse(JSON.stringify(data)),
                    };
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
                    type: req.TransactionType == '1' ? 'sale' : 'authorize',
                    amount: Math.round(total * 100),
                    currency: 'USD',
                    email_receipt: false,
                    email_address: req.BillingEmail,
                    create_vault_record: true,
                    processor_id: userGateWayData.ProcessorId,
                    payment_method: { card: card },
                    billing_address: billingAddress,
                    shipping_address: shippingAddress,
                };
                if (
                    req.PaymentTokenization == true &&
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
                    const checkCustomer = await this.checkCustomerExist(
                        req,
                        userInfo.id
                    );

                    const findCustomer = await models.Customer.findOne({
                        where: {
                            [Op.and]: [
                                { CountryCode: req.BillingCountryCode },
                                { PhoneNumber: req.BillingPhoneNumber },
                                { UserId: userInfo.id },
                            ],
                        },
                    });
                    if (checkCustomer != 'skip Token') {
                        const cardToken = await this.createFluidToken(
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
                            Abbrevation: req.BillingState ?? null,
                        },
                    });
                    const countryData = await models.Country.findOne({
                        where: {
                            Abbrevation: req.BillingCountry ?? null,
                        },
                    });
                    const paymentMethods = this.fluidPayCardBrands(
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
                            Type: req.TransactionType,
                            Status: newDataD['data'].status,
                            BillingEmail: newDataD['data'].billing_address['email'],
                            BillingCustomerName: newDataD['data'].billing_address['first_name'],
                            BillingAddress: newDataD['data'].billing_address['address_line_1'],
                            BillingCity: newDataD['data'].billing_address['city'],
                            BillingState: stateData != undefined ? stateData.id : null,
                            BillingPostalCode: newDataD['data'].billing_address['postal_code'],
                            BillingCountry: countryData != undefined ? countryData.id : null,
                            BillingCountryCode: req.BillingCountryCode,
                            BillingPhoneNumber: newDataD['data'].billing_address['phone'],
                            IsShippingSame: req.shippingSameAsBilling,
                            ShippingEmail: newDataD['data'].billing_address['email'],
                            ShippingCustomerName:
                                newDataD['data'].billing_address['first_name'],
                            ShippingAddress: newDataD['data'].billing_address['address_line_1'],
                            ShippingCity: newDataD['data'].billing_address['city'],
                            ShippingState: stateData != undefined ? stateData.id : null,
                            ShippingPostalCode: newDataD['data'].billing_address['postal_code'],
                            ShippingCountry: countryData != undefined ? countryData.id : null,
                            ShippingPhoneNumber: newDataD['data'].billing_address['phone'],
                            ExpiryDate: req.ExpiryDate.replace(/\s/g, '').replace(
                                /\\|\//g,
                                ''
                            ),
                            Cvv: req.Cvv,
                            ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
                            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
                            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
                            AuthCode: newDataD['data'].response_body['card'].auth_code,
                            TransactionGateWay: 'FluidPay',
                            Refund: false,
                            Void: false,
                            Capture: false,
                            Tokenization: false, // req.PaymentTokenization,
                            Message: req.Message,
                            Description: req.Description,
                            ReferenceNo: req.ReferenceNo,
                            ConvenienceFeeActive:
                                minmumTxn != ''
                                    ? minmumTxn
                                    : userGateWayData.ConvenienceFeeActive,
                            RequestOrigin: req.RequestOrigin,
                            createdAt: newDataD['data'].created_at,
                            updatedAt: newDataD['data'].updated_at,
                            ProcessorId: userGateWayData.ProcessorId,
                            SuggestedMode : req.SuggestedMode != undefined ? req.SuggestedMode : null
                        };
                        const transData = await models.Transaction.create(transactionInsert);
                        await this.checkNotificationSettingAndCreateEmail(userInfo.id, newDataD['data'].id, 'TransactionCompleted');

                        if (req.PaymentLinkId != undefined) {
                            await this.sendWebHook(
                                undefined,
                                transData,
                                req.PaymentLinkId,
                                userInfo.id
                            );
                        }
                        return {
                            status: 'success',
                            message: 'Transaction Processed Successfully',
                            data: JSON.parse(JSON.stringify(transData)),
                        };
                    } else if (newDataD['data'].status == 'declined') {
                        newDataD['data'].status = '9';
                        const transactionInsert = {
                            CustomerId: findCustomer.id,
                            MerchantId: userInfo.id,
                            TransactionId: newDataD['data'].id,
                            Amount: newDataD['data'].amount / 100,
                            CardNumber: newDataD['data'].response_body['card'].last_four,
                            PaymentMethod: paymentMethods,
                            Type: req.TransactionType,
                            Status: newDataD['data'].status,
                            BillingEmail: newDataD['data'].billing_address['email'],
                            BillingCustomerName: newDataD['data'].billing_address['first_name'],
                            BillingAddress: newDataD['data'].billing_address['address_line_1'],
                            BillingCity: newDataD['data'].billing_address['city'],
                            BillingState: stateData != undefined ? stateData.id : null,
                            BillingPostalCode: newDataD['data'].billing_address['postal_code'],
                            BillingCountry: countryData != undefined ? countryData.id : null,
                            BillingCountryCode: req.BillingCountryCode,
                            BillingPhoneNumber: newDataD['data'].billing_address['phone'],
                            IsShippingSame: req.shippingSameAsBilling,
                            ShippingEmail: newDataD['data'].billing_address['email'],
                            ShippingCustomerName:
                                newDataD['data'].billing_address['first_name'],
                            ShippingAddress: newDataD['data'].billing_address['address_line_1'],
                            ShippingCity: newDataD['data'].billing_address['city'],
                            ShippingState: newDataD != undefined ? stateData.id : null,
                            ShippingPostalCode: newDataD['data'].billing_address['postal_code'],
                            ShippingCountry: countryData != undefined ? countryData.id : null,
                            ShippingPhoneNumber: newDataD['data'].billing_address['phone'],
                            ExpiryDate: req.ExpiryDate.replace(/\s/g, '').replace(
                                /\\|\//g,
                                ''
                            ),
                            Cvv: req.Cvv,
                            ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
                            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
                            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
                            AuthCode: newDataD['data'].response_body['card'].auth_code,
                            TransactionGateWay: 'FluidPay',
                            Refund: false,
                            Void: false,
                            Capture: false,
                            Tokenization: false, // req.PaymentTokenization,
                            Message: req.Message,
                            Description: req.Description,
                            ReferenceNo: req.ReferenceNo,
                            ConvenienceFeeActive:
                                minmumTxn != ''
                                    ? minmumTxn
                                    : userGateWayData.ConvenienceFeeActive,
                            RequestOrigin: req.RequestOrigin,
                            createdAt: newDataD['data'].created_at,
                            updatedAt: newDataD['data'].updated_at,
                            ProcessorId: userGateWayData.ProcessorId,
                            SuggestedMode : req.SuggestedMode != undefined ? req.SuggestedMode : null
                        };
                        const transData = await models.Transaction.create(transactionInsert);
                        await this.checkNotificationSettingAndCreateEmail(userInfo.id, newDataD['data'].id, 'TransactionFailed');

                        if (req.PaymentLinkId != undefined) {
                            await this.sendWebHook(
                                `Transaction declined due to ${newDataD['data']['response_body']['card'].processor_response_text}`,
                                transData,
                                req.PaymentLinkId,
                                userInfo.id
                            );
                        }
                        return {
                            status: 'error',
                            message: `Transaction declined due to ${newDataD['data']['response_body']['card'].processor_response_text}`,
                            data: JSON.parse(JSON.stringify(transData)),
                        };
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
                            Type: req.TransactionType,
                            Status: newDataD['data'].status,
                            BillingEmail: newDataD['data'].billing_address['email'],
                            BillingCustomerName: newDataD['data'].billing_address['first_name'],
                            BillingAddress: newDataD['data'].billing_address['address_line_1'],
                            BillingCity: newDataD['data'].billing_address['city'],
                            BillingState: stateData != undefined ? stateData.id : null,
                            BillingPostalCode: newDataD['data'].billing_address['postal_code'],
                            BillingCountry: countryData != undefined ? countryData.id : null,
                            BillingCountryCode: req.BillingCountryCode,
                            BillingPhoneNumber: newDataD['data'].billing_address['phone'],
                            IsShippingSame: req.shippingSameAsBilling,
                            ShippingEmail: newDataD['data'].billing_address['email'],
                            ShippingCustomerName:
                                newDataD['data'].billing_address['first_name'],
                            ShippingAddress: newDataD['data'].billing_address['address_line_1'],
                            ShippingCity: newDataD['data'].billing_address['city'],
                            ShippingState: stateData != undefined ? stateData.id : null,
                            ShippingPostalCode: newDataD['data'].billing_address['postal_code'],
                            ShippingCountry: countryData != undefined ? countryData.id : null,
                            ShippingPhoneNumber: newDataD['data'].billing_address['phone'],
                            ExpiryDate: req.ExpiryDate.replace(/\s/g, '').replace(
                                /\\|\//g,
                                ''
                            ),
                            Cvv: req.Cvv,
                            ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
                            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
                            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
                            AuthCode: newDataD['data'].response_body['card'].auth_code,
                            TransactionGateWay: 'FluidPay',
                            Refund: false,
                            Void: false,
                            Capture: false,
                            Tokenization: false, // req.PaymentTokenization,
                            Message: req.Message,
                            Description: req.Description,
                            ReferenceNo: req.ReferenceNo,
                            ConvenienceFeeActive:
                                minmumTxn != ''
                                    ? minmumTxn
                                    : userGateWayData.ConvenienceFeeActive,
                            RequestOrigin: req.RequestOrigin,
                            createdAt: newDataD['data'].created_at,
                            updatedAt: newDataD['data'].updated_at,
                            ProcessorId: userGateWayData.ProcessorId,
                            SuggestedMode : req.SuggestedMode != undefined ? req.SuggestedMode : null
                        };
                        const transData = await models.Transaction.create(transactionInsert);
                        await this.checkNotificationSettingAndCreateEmail(userInfo.id, newDataD['data'].id, 'TransactionFailed');
                        if (req.PaymentLinkId != undefined) {
                            await this.sendWebHook(
                                `Transaction declined due to ${newDataD['data']['response_body']['card'].processor_response_text}`,
                                transData,
                                req.PaymentLinkId,
                                userInfo.id
                            );
                        }
                        return {
                            status: 'error',
                            message: `Transaction declined due to ${newDataD['data']['response_body']['card'].processor_response_text}`,
                            data: JSON.parse(JSON.stringify(transData)),
                        };
                    }
                } else {
                    if (req.PaymentLinkId != undefined) {
                        await this.sendWebHook(
                            data.msg,
                            undefined,
                            req.PaymentLinkId,
                            userInfo.id
                        );
                    }
                    await this.sendEmailToMerchantOnFailedTransaction(userInfo, 'Transaction Failed', `Transaction Failed due to ${data.msg}`);

                    return {
                        status: 'error',
                        message: data.msg,
                        data: JSON.parse(JSON.stringify(data)),
                    };
                }
            } else {
                if (data.status === 'success') {
                    const checkCustomer = await this.checkCustomerExist(
                        req,
                        userInfo.id
                    );

                    const findCustomer = await models.Customer.findOne({
                        where: {
                            [Op.and]: [
                                { CountryCode: req.BillingCountryCode },
                                { PhoneNumber: req.BillingPhoneNumber },
                                { UserId: userInfo.id },
                            ],
                        },
                    });
                    if (checkCustomer != 'skip Token') {
                        const cardToken = await this.createFluidToken(
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
                            Abbrevation: req.BillingState ?? null,
                        },
                    });
                    const countryData = await models.Country.findOne({
                        where: {
                            Abbrevation: req.BillingCountry ?? null,
                        },
                    });
                    const paymentMethods = this.fluidPayCardBrands(
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
                            Type: req.TransactionType,
                            Status: data['data'].status,
                            BillingEmail: data['data'].billing_address['email'],
                            BillingCustomerName: data['data'].billing_address['first_name'],
                            BillingAddress: data['data'].billing_address['address_line_1'],
                            BillingCity: data['data'].billing_address['city'],
                            BillingState: stateData != undefined ? stateData.id : null,
                            BillingPostalCode: data['data'].billing_address['postal_code'],
                            BillingCountry: countryData != undefined ? countryData.id : null,
                            BillingCountryCode: req.BillingCountryCode,
                            BillingPhoneNumber: data['data'].billing_address['phone'],
                            IsShippingSame: req.shippingSameAsBilling,
                            ShippingEmail: data['data'].billing_address['email'],
                            ShippingCustomerName: data['data'].billing_address['first_name'],
                            ShippingAddress: data['data'].billing_address['address_line_1'],
                            ShippingCity: data['data'].billing_address['city'],
                            ShippingState: stateData != undefined ? stateData.id : null,
                            ShippingPostalCode: data['data'].billing_address['postal_code'],
                            ShippingCountry: countryData != undefined ? countryData.id : null,
                            ShippingPhoneNumber: data['data'].billing_address['phone'],
                            ExpiryDate: req.ExpiryDate.replace(/\s/g, '').replace(
                                /\\|\//g,
                                ''
                            ),
                            Cvv: req.Cvv,
                            ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
                            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
                            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
                            AuthCode: data['data'].response_body['card'].auth_code,
                            TransactionGateWay: 'FluidPay',
                            Refund: false,
                            Void: false,
                            Capture: false,
                            Tokenization: false, // req.PaymentTokenization,
                            Message: req.Message,
                            Description: req.Description,
                            ReferenceNo: req.ReferenceNo,
                            ConvenienceFeeActive:
                                minmumTxn != ''
                                    ? minmumTxn
                                    : userGateWayData.ConvenienceFeeActive,
                            RequestOrigin: req.RequestOrigin,
                            createdAt: data['data'].created_at,
                            updatedAt: data['data'].updated_at,
                            ProcessorId: userGateWayData.ProcessorId,
                            SuggestedMode : req.SuggestedMode != undefined ? req.SuggestedMode : null
                        };
                        const transData = await models.Transaction.create(transactionInsert);
                        await this.checkNotificationSettingAndCreateEmail(userInfo.id, data['data'].id, 'TransactionCompleted');

                        if (req.PaymentLinkId != undefined) {
                            await this.sendWebHook(
                                undefined,
                                transData,
                                req.PaymentLinkId,
                                userInfo.id
                            );
                        }
                        return {
                            status: 'success',
                            message: 'Transaction Processed Successfully',
                            data: JSON.parse(JSON.stringify(transData)),
                        };
                    } else if (data['data'].status == 'declined') {
                        data['data'].status = '9';
                        const transactionInsert = {
                            CustomerId: findCustomer.id,
                            MerchantId: userInfo.id,
                            TransactionId: data['data'].id,
                            Amount: data['data'].amount / 100,
                            CardNumber: data['data'].response_body['card'].last_four,
                            PaymentMethod: paymentMethods,
                            Type: req.TransactionType,
                            Status: data['data'].status,
                            BillingEmail: data['data'].billing_address['email'],
                            BillingCustomerName: data['data'].billing_address['first_name'],
                            BillingAddress: data['data'].billing_address['address_line_1'],
                            BillingCity: data['data'].billing_address['city'],
                            BillingState: stateData != undefined ? stateData.id : null,
                            BillingPostalCode: data['data'].billing_address['postal_code'],
                            BillingCountry: countryData != undefined ? countryData.id : null,
                            BillingCountryCode: req.BillingCountryCode,
                            BillingPhoneNumber: data['data'].billing_address['phone'],
                            IsShippingSame: req.shippingSameAsBilling,
                            ShippingEmail: data['data'].billing_address['email'],
                            ShippingCustomerName: data['data'].billing_address['first_name'],
                            ShippingAddress: data['data'].billing_address['address_line_1'],
                            ShippingCity: data['data'].billing_address['city'],
                            ShippingState: stateData != undefined ? stateData.id : null,
                            ShippingPostalCode: data['data'].billing_address['postal_code'],
                            ShippingCountry: countryData != undefined ? countryData.id : null,
                            ShippingPhoneNumber: data['data'].billing_address['phone'],
                            ExpiryDate: req.ExpiryDate.replace(/\s/g, '').replace(
                                /\\|\//g,
                                ''
                            ),
                            Cvv: req.Cvv,
                            ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
                            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
                            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
                            AuthCode: data['data'].response_body['card'].auth_code,
                            TransactionGateWay: 'FluidPay',
                            Refund: false,
                            Void: false,
                            Capture: false,
                            Tokenization: false, // req.PaymentTokenization,
                            Message: req.Message,
                            Description: req.Description,
                            ReferenceNo: req.ReferenceNo,
                            ConvenienceFeeActive:
                                minmumTxn != ''
                                    ? minmumTxn
                                    : userGateWayData.ConvenienceFeeActive,
                            RequestOrigin: req.RequestOrigin,
                            createdAt: data['data'].created_at,
                            updatedAt: data['data'].updated_at,
                            ProcessorId: userGateWayData.ProcessorId,
                            SuggestedMode : req.SuggestedMode != undefined ? req.SuggestedMode : null
                        };
                        const transData = await models.Transaction.create(transactionInsert);
                        if (req.PaymentLinkId != undefined) {
                            await this.sendWebHook(
                                `Transaction declined due to ${data['data']['response_body']['card'].processor_response_text}`,
                                transData,
                                req.PaymentLinkId,
                                userInfo.id
                            );
                        }
                        await this.checkNotificationSettingAndCreateEmail(userInfo.id, data['data'].id, 'TransactionFailed');

                        return {
                            status: 'error',
                            message: `Transaction declined due to ${data['data']['response_body']['card'].processor_response_text}`,
                            data: JSON.parse(JSON.stringify(transData)),
                        };
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
                            Type: req.TransactionType,
                            Status: data['data'].status,
                            BillingEmail: data['data'].billing_address['email'],
                            BillingCustomerName: data['data'].billing_address['first_name'],
                            BillingAddress: data['data'].billing_address['address_line_1'],
                            BillingCity: data['data'].billing_address['city'],
                            BillingState: stateData != undefined ? stateData.id : null,
                            BillingPostalCode: data['data'].billing_address['postal_code'],
                            BillingCountry: countryData != undefined ? countryData.id : null,
                            BillingCountryCode: req.BillingCountryCode,
                            BillingPhoneNumber: data['data'].billing_address['phone'],
                            IsShippingSame: req.shippingSameAsBilling,
                            ShippingEmail: data['data'].billing_address['email'],
                            ShippingCustomerName: data['data'].billing_address['first_name'],
                            ShippingAddress: data['data'].billing_address['address_line_1'],
                            ShippingCity: data['data'].billing_address['city'],
                            ShippingState: stateData != undefined ? stateData.id : null,
                            ShippingPostalCode: data['data'].billing_address['postal_code'],
                            ShippingCountry: countryData != undefined ? countryData.id : null,
                            ShippingPhoneNumber: data['data'].billing_address['phone'],
                            ExpiryDate: req.ExpiryDate.replace(/\s/g, '').replace(
                                /\\|\//g,
                                ''
                            ),
                            Cvv: req.Cvv,
                            ConvenienceFeeValue: feeAmount != 0 ? feeAmount : 0,
                            ConvenienceFeeMinimum: userGateWayData.ConvenienceFeeMinimum,
                            ConvenienceFeeType: userGateWayData.ConvenienceFeeType,
                            AuthCode: data['data'].response_body['card'].auth_code,
                            TransactionGateWay: 'FluidPay',
                            Refund: false,
                            Void: false,
                            Capture: false,
                            Tokenization: false, // req.PaymentTokenization,
                            Message: req.Message,
                            Description: req.Description,
                            ReferenceNo: req.ReferenceNo,
                            ConvenienceFeeActive:
                                minmumTxn != ''
                                    ? minmumTxn
                                    : userGateWayData.ConvenienceFeeActive,
                            RequestOrigin: req.RequestOrigin,
                            createdAt: data['data'].created_at,
                            updatedAt: data['data'].updated_at,
                            ProcessorId: userGateWayData.ProcessorId,
                            SuggestedMode : req.SuggestedMode != undefined ? req.SuggestedMode : null
                        };
                        const transData = await models.Transaction.create(transactionInsert);
                        if (req.PaymentLinkId != undefined) {
                            await this.sendWebHook(
                                `Transaction declined due to ${data['data']['response_body']['card'].processor_response_text}`,
                                transData,
                                req.PaymentLinkId,
                                userInfo.id
                            );
                        }
                        await this.checkNotificationSettingAndCreateEmail(userInfo.id, data['data'].id, 'TransactionFailed');
                        return {
                            status: 'error',
                            message: `Transaction declined due to ${data['data']['response_body']['card'].processor_response_text}`,
                            data: JSON.parse(JSON.stringify(transData)),
                        };
                    }
                } else {
                    if (req.PaymentLinkId != undefined) {
                        await this.sendWebHook(
                            data.msg,
                            undefined,
                            req.PaymentLinkId,
                            userInfo.id
                        );
                    }
                    await this.sendEmailToMerchantOnFailedTransaction(userInfo, 'Transaction Failed', `Transaction Failed due to ${data.msg}`);

                    return {
                        status: 'error',
                        message: data.msg,
                        data: JSON.parse(JSON.stringify(data)),
                    };
                }
            }
        } catch (error) {
            Sentry.captureException(error);
            return {
                status: 'error',
                message: error,
            };
        }
    }

    //To set Date Format in receipt/transaction mail
    getFormattedDate = (date) => {
        let year = date.getFullYear();
        let month = (1 + date.getMonth()).toString().padStart(2, '0');
        let day = date.getDate().toString().padStart(2, '0');

        return month + '-' + day + '-' + year;
    };

    //To fetch Brands of credit card used for Txns Payrix
    getCardBrands = (brand) => {
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

    //Check Merchant Notification Setting and create email object
    async checkNotificationSettingAndCreateEmail(
        MerchantId,
        TransactionId,
        NotificationTitle
    ) {

        const UserProfileSetting = await models.UserProfileSetting.findOne({
            where: { UserId: MerchantId, [NotificationTitle]: 1 }
        });

        if (UserProfileSetting === null)
            return false;
        else {
            const titleMessage = {
                "TransactionCompleted": "Transaction Completed",
                "Transaction Failed": "Transaction Failed"
            };

            const transaction = await models.Transaction.findOne({
                include: [
                    {
                        model: models.User,
                        attributes: ['FullName', 'Email', 'NotificationEmail', 'CompanyName', 'LogoPath', 'PhoneNumber'],
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
                where: { TransactionId: TransactionId },
            });

            try {
                if (transaction) {
                    const statusValue = this.getTransStatus(transaction.Status);
                    const date = this.getFormattedDate(transaction.createdAt);
                    const brand = this.getCardBrands(transaction.PaymentMethod);
                    const customer = await models.Customer.findOne({
                        where: {
                            id: transaction.CustomerId,
                        },
                    });

                    var data = {
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
                        CustomerName: customer.CustomerName,
                        CustomerEmail: customer.Email,
                        CustomerPhoneNumber: customer.PhoneNumber,
                    };

                    return await this.sendEmailToMerchantAfterTransaction(
                        transaction.User.NotificationEmail ? transaction.User.NotificationEmail : transaction.User.Email,
                        titleMessage[NotificationTitle],
                        data
                    );

                }
                else
                    return false;
            } catch (error) {

            }
            return [UserProfileSetting, transaction];
        }


    }

    //Send Email to merchant after Transaction
    async sendEmailToMerchantAfterTransaction(
        email,
        title,
        data
    ) {
        try {
            await sendEmail(
                email,
                title,
                data,
                '../utils/emailMerchantTransaction.hbs'
            );
            return true;
        } catch (error) {
            Sentry.captureException(error);
            return {
                status: 'error',
                message: 'Something went wrong',
                function: 'sendEmailToMerchantAfterTransaction',
                error: error,
            };
        }
    }

    //Send Email to merchant after Transaction
    async sendEmailToMerchantOnFailedTransaction(
        userInfo,
        title,
        error
    ) {
        const UserProfileSetting = await models.UserProfileSetting.findOne({
            where: { UserId: userInfo.id, TransactionFailed: 1 }
        });
        if (UserProfileSetting === null)
            return false;
        else {
            var email = userInfo.NotificationEmail ? userInfo.NotificationEmail : userInfo.Email;
            try {
                await sendEmail(
                    email,
                    title,
                    {
                        error: error,
                        Merchant: userInfo.CompanyName,
                        LogoPath: userInfo.LogoPath,
                    },
                    '../utils/emailMerchantFailedTransaction.hbs'
                );
                return true;
            } catch (error) {
                Sentry.captureException(error);
                return {
                    status: 'error',
                    message: 'Something went wrong',
                    function: 'sendEmailToMerchantOnFailedTransaction',
                    error: error,
                };
            }
        }
    }
}

module.exports = TranasactionService;