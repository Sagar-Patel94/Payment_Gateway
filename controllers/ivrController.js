const { dirname } = require('path');
const models = require('../models');
const readXlsxFile = require('read-excel-file/node');
const { Op } = require('sequelize');
const Sentry = require('@sentry/node');
const TranasactionService = require('../services/transaction.service');
const TranasactionServiceInstance = new TranasactionService();

// Get List of pending transaction IVR for front-end
exports.getIvrList = async (req, res) => {

    try {

        const limit = req.query.perPage == undefined || NaN ? 10 : parseInt(req.query.perPage);
        const offset = req.query.page == undefined || NaN ? 0 : parseInt(req.query.page) - 1;
        const skipRecord = Math.ceil(offset * limit);
        const sortOrder = req.query.sort === undefined ? 'asc' : req.query.sort;
        const sortColumn = req.query.sortColumn === undefined ? 'id' : req.query.sortColumn;
        const searchKey = req.query.q === undefined ? '' : req.query.q;
        const UserId = req.query.user === undefined ? req.currentUser.Id : req.query.user;

        const IvrList = await models.IVRpendingTransaction.findAndCountAll({
            where: {
                [Op.and]: [
                    {
                        UserId: {
                            [Op.eq]: UserId,
                        },
                    },
                ],
                [Op.or]: [
                    {
                        FirstName: {
                            [Op.like]: '%' + searchKey + '%',
                        },
                    },
                    {
                        LastName: {
                            [Op.like]: '%' + searchKey + '%',
                        },
                    },
                    {
                        SSNLast4Digit: {
                            [Op.like]: '%' + searchKey + '%',
                        },
                    },
                    {
                        CellPhoneNumber1: {
                            [Op.like]: '%' + searchKey + '%',
                        },
                    },
                    {
                        Email: {
                            [Op.like]: '%' + searchKey + '%',
                        },
                    },
                ],
            },
            order: [[sortColumn, sortOrder]],
            limit: limit,
            offset: skipRecord,
        });
        const totalPages = Math.ceil(IvrList['count'] / limit);
        res.status(200).json({
            message: 'Data found successfully',
            data: IvrList,
            paging: {
                pages: totalPages,
            },
        });
    } catch (error) {
        Sentry.captureException(error);
        res.status(500).json({
            message: 'Something went wrong',
            error: error,
        });
    }
}

// Get IVR details by IVR pending details id
exports.getIvrDetailsById = async (req, res) => {
    try {
        const ivrDetails = await models.IVRpendingTransaction.findOne({
            where: { UUID: req.params.id },
        });
        res.status(200).json({
            message: 'Data found successfully',
            data: ivrDetails,
        });
    } catch (err) {
        Sentry.captureException(err);
        res.status(500).json({
            message: 'Something went wrong',
            error: err,
        });
    }
}

// Delete IVR by id
exports.deleteIvr = async (req, res) => {
    try {

        await models.IVRpendingTransaction.destroy({
            where: {
                id: req.params.id
            }
        }).then((result) => {
            res.status(200).json({
                message: 'Deleted Successfully',
            });
        }).catch((err) => {
            Sentry.captureException(err);
            res.status(500).json({
                message: 'Something Went Wrong',
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
}

// Import Spredsheet schema from front-end
exports.importList = async (req, res) => {

    const { rows, userId } = req.body;
    const user = await models.User.findOne({
        where: {
            id: userId
        }
    });
    if (user) {
        try {
            var userObj = { MerchantId: user.UUID, UserId: userId };
            var ROWS = [];
            const schema = {
                'Actual Acct Standing Desc': {
                    prop: 'ActualAcctStandingDesc',
                    type: String
                },
                'Collateral Stock Number': {
                    prop: 'CollateralStockNumber',
                    type: String
                },
                'Borrower 1 First Name': {
                    prop: 'FirstName',
                    type: String
                },
                'Borrower 1 Last Name': {
                    prop: 'LastName',
                    type: String
                },
                'Borrower 1 SSN Last 4': {
                    prop: 'SSNLast4Digit',
                    type: Number
                },
                'Borrower 1 Address 1': {
                    prop: 'Address1',
                    type: String
                },
                'Borrower 1 Address 2': {
                    prop: 'Address2',
                    type: String
                },
                'Borrower 1 City': {
                    prop: 'City',
                    type: String
                },
                'Borrower 1 State': {
                    prop: 'State',
                    type: String
                },
                'Borrower 1 Zipcode': {
                    prop: 'PostalCode',
                    type: Number
                },
                'Borrower 1 Home Phone 1': {
                    prop: 'HomePhoneNumber1',
                    type: Number
                },
                'Borrower 1 Home Phone 2': {
                    prop: 'HomePhoneNumber2',
                    type: Number
                },
                'Borrower 1 Work Phone 1': {
                    prop: 'WorkPhoneNumber',
                    type: Number
                },
                'Borrower 1 Cell Phone': {
                    prop: 'CellPhoneNumber1',
                    type: Number
                },
                'Borrower 1 Email': {
                    prop: 'Email',
                    type: readXlsxFile.Email
                },
                'Collateral Description': {
                    prop: 'CollateralDescription',
                    type: String
                },
                'Collateral VIN': {
                    prop: 'CollateralVIN',
                    type: String
                },
                'Acct Cur Total Balance': {
                    prop: 'AcctCurrentTotalBalance',
                    type: String
                },
                'Actual # Days Past Due': {
                    prop: 'ActualDaysPastDue',
                    type: Number
                },
                'Cur Due Date': {
                    prop: 'CurrentDueDate',
                    type: Date
                },
                'Cur Due Amt': {
                    prop: 'CurrentDueAmount',
                    type: String
                },
                'Acct Last Paid Date': {
                    prop: 'AcctLastPaidDate',
                    type: Date
                },
                'Acct Last Paid Amount': {
                    prop: 'AcctLastPaidAmount',
                    type: String
                },
                'Next Due Date': {
                    prop: 'NextDueDate',
                    type: Date
                },
                'Next Due Amount': {
                    prop: 'NextDueAmount',
                    type: String
                },
                'Last Promise Due Date': {
                    prop: 'LastPromiseDueDate',
                    type: Date
                },
                'Last Promise Status Desc': {
                    prop: 'LastPromiseStatusDesc',
                    type: String
                },


            }
            rows.forEach(row => {
                const newObj = Object.create({});
                for (let key of Object.keys(row)) {
                    newObj[schema[key].prop] = row[key];
                }
                ROWS.push({ ...newObj, ...userObj });
            });

            await models.IVRpendingTransaction.bulkCreate(ROWS)
                .then((result) => {
                    return res.status(201).json({
                        message: 'Excel file imported Successfully',
                        data: result,
                    });
                })
                .catch((err) => {
                    Sentry.captureException(err);
                    res.status(500).json({
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
    } else {
        Sentry.captureException(err);
        res.status(404).json({
            message: 'User not found',
            error: {},
        });
    }
}
// Import SpreadSheet of pending IVR transaction
exports.importExcel = async (req, res) => {
    const appRootDir = dirname(require.main.filename);
    const excelFile = appRootDir + '/data/IVRpendingTransaction.xlsx';

    const schema = {
        'Actual Acct Standing Desc': {
            prop: 'ActualAcctStandingDesc',
            type: String
        },
        'Collateral Stock Number': {
            prop: 'CollateralStockNumber',
            type: String
        },
        'Borrower 1 First Name': {
            prop: 'FirstName',
            type: String
        },
        'Borrower 1 Last Name': {
            prop: 'LastName',
            type: String
        },
        'Borrower 1 SSN Last 4': {
            prop: 'SSNLast4Digit',
            type: Number
        },
        'Borrower 1 Address 1': {
            prop: 'Address1',
            type: String
        },
        'Borrower 1 Address 2': {
            prop: 'Address2',
            type: String
        },
        'Borrower 1 City': {
            prop: 'City',
            type: String
        },
        'Borrower 1 State': {
            prop: 'State',
            type: String
        },
        'Borrower 1 Zipcode': {
            prop: 'PostalCode',
            type: Number
        },
        'Borrower 1 Home Phone 1': {
            prop: 'HomePhoneNumber1',
            type: Number
        },
        'Borrower 1 Home Phone 2': {
            prop: 'HomePhoneNumber2',
            type: Number
        },
        'Borrower 1 Work Phone 1': {
            prop: 'WorkPhoneNumber',
            type: Number
        },
        'Borrower 1 Cell Phone': {
            prop: 'CellPhoneNumber1',
            type: Number
        },
        'Borrower 1 Email': {
            prop: 'Email',
            type: readXlsxFile.Email
        },
        'Collateral Description': {
            prop: 'CollateralDescription',
            type: String
        },
        'Collateral VIN': {
            prop: 'CollateralVIN',
            type: String
        },
        'Acct Cur Total Balance': {
            prop: 'AcctCurrentTotalBalance',
            type: String
        },
        'Actual # Days Past Due': {
            prop: 'ActualDaysPastDue',
            type: Number
        },
        'Cur Due Date': {
            prop: 'CurrentDueDate',
            type: Date
        },
        'Cur Due Amt': {
            prop: 'CurrentDueAmount',
            type: String
        },
        'Acct Last Paid Date': {
            prop: 'AcctLastPaidDate',
            type: Date
        },
        'Acct Last Paid Amount': {
            prop: 'AcctLastPaidAmount',
            type: String
        },
        'Next Due Date': {
            prop: 'NextDueDate',
            type: Date
        },
        'Next Due Amount': {
            prop: 'NextDueAmount',
            type: String
        },
        'Last Promise Due Date': {
            prop: 'LastPromiseDueDate',
            type: Date
        },
        'Last Promise Status Desc': {
            prop: 'LastPromiseStatusDesc',
            type: String
        },


    }
    try {
        readXlsxFile(excelFile, { schema, ignoreEmptyRows: false }).then((rows) => {
            var ROWS = [];
            var user = { MerchantId: "333aa1bc-2fdc-451d-8f30-14fd4288eb6f", UserId: 102 };
            rows.rows.forEach(row => {
                ROWS.push({ ...row, ...user });
            });

            models.IVRpendingTransaction.bulkCreate(ROWS)
                .then((result) => {
                    res.status(201).json({
                        message: 'Excel file imported Successfully',
                        data: result,
                    });
                })
                .catch((err) => {
                    Sentry.captureException(err);
                    res.status(500).json({
                        message: 'Something went wrong',
                        error: err,
                    });
                });
        })
    } catch (error) {
        Sentry.captureException(error);
        res.status(500).json({
            message: 'Something went wrong',
            error: error,
        });
    }
}

// To verify user by SSN and Zip Code for IVR
exports.getUserBySsnAndZipCode = async (req, res) => {

    if (req.body.ssn == null || req.body.ssn == undefined || req.body.zip == null || req.body.zip == undefined) {
        Sentry.captureException('SSN or Zip code must have in request.');
        return res.status(400).json({
            status: 'notfound',
            message: 'Something went wrong',
            error: "SSN or Zip code must have in request.",
            data: null
        });

    } else {
        let { ssn, zip } = req.body;

        try {
            var transactionData = await models.IVRpendingTransaction.findOne({
                where: {
                    SSNLast4Digit: ssn,
                    PostalCode: zip
                },
                order: [
                    ['id', 'DESC']
                ]
            });
            if (transactionData !== null && transactionData !== undefined) {
                if (transactionData.CellPhoneNumber1 != null) {
                    transactionData.dataValues['phoneNumber'] = transactionData.CellPhoneNumber1.slice(-10);
                    transactionData.dataValues['CellPhoneNumber1'] = transactionData.CellPhoneNumber1.slice(-10);
                }
                res.status(200).json({
                    status: 'found',
                    message: 'IVR pending transaction',
                    data: transactionData,
                });
            } else {
                Sentry.captureException('IVR pending transaction has not been found');
                res.status(200).json({
                    status: 'notfound',
                    message: 'IVR pending transaction has not been found',
                    data: null
                });
            }
        } catch (error) {
            Sentry.captureException('IVR pending transaction has not been found');
            res.status(400).json({
                status: 'notfound',
                message: 'Something went wrong',
                data: null
            });
        }
    }
}

// To verify User by Phone Number for AuxCHAT
exports.getUserByPhoneNumber = async (req, res) => {
    if (req.body.merchantId == null || req.body.merchantId == undefined || req.body.phoneNumber == null || req.body.phoneNumber == undefined) {
        Sentry.captureException('Parameters are missing in request.');
        return res.status(400).json({
            status: 'notfound',
            message: 'Something went wrong',
            error: "Parameters are missing in request.",
            data: null
        });
    } else {
        let { merchantId, phoneNumber } = req.body;

        try {
            var transactionData = await models.IVRpendingTransaction.findOne({
                where: {
                    CellPhoneNumber1: phoneNumber,
                },
                order: [
                    ['id', 'DESC']
                ]
            });
            if (transactionData !== null && transactionData !== undefined) {
                if (transactionData.CellPhoneNumber1 != null) {
                    transactionData.dataValues['phoneNumber'] = transactionData.CellPhoneNumber1.slice(-10);
                    transactionData.dataValues['CellPhoneNumber1'] = transactionData.CellPhoneNumber1.slice(-10);
                }
                res.status(200).json({
                    status: 'found',
                    message: 'Pending transaction',
                    data: transactionData,
                });
            } else {
                Sentry.captureException('IVR pending transaction has not been found');
                res.status(200).json({
                    status: 'notfound',
                    message: 'Pending transaction has not been found',
                    data: null
                });
            }
        } catch (error) {
            Sentry.captureException('Error');
            res.status(400).json({
                status: 'notfound',
                message: 'Something went wrong',
                error: error
            });
        }
    }
}
// To process Transaction
exports.transaction = async (req, res) => {
    if (req.body.UUID == null || req.body.UUID == undefined || req.body.CardNumber == null || req.body.CardNumber == undefined || req.body.Cvv == null || req.body.Cvv == undefined || req.body.ExpiryDate == null || req.body.ExpiryDate == undefined || req.body.MerchantId == null || req.body.MerchantId == undefined) {
        Sentry.captureException('Something went wrong with request params.');
        return res.status(200).json({
            status: 'failed',
            message: 'Something went wrong',
            error: "Something went wrong with request params.",
            data: null
        });

    } else {

        var {
            UUID,
            MerchantId,
            CardNumber,
            Cvv,
            ExpiryDate,
        } = req.body;

        const pendingTransaction = await models.IVRpendingTransaction.findOne({
            where: {
                UUID: UUID
            }
        });
        if (pendingTransaction == null) {
            Sentry.captureException('Transaction Not Exist!!');
            res.status(200).json({
                message: 'Transaction Not Exist',
            });
        } else {
            var { HomePhoneNumber1, HomePhoneNumber2, WorkPhoneNumber, CellPhoneNumber1 } = pendingTransaction

            if (HomePhoneNumber1 != null) {
                var phone = HomePhoneNumber1
            } else if (HomePhoneNumber2 != null) {
                var phone = HomePhoneNumber2
            } else if (WorkPhoneNumber != null) {
                var phone = WorkPhoneNumber
            } else if (CellPhoneNumber1 != null) {
                var phone = CellPhoneNumber1
            }
            var ExpiryDateObject = new String(ExpiryDate);
            if (ExpiryDateObject.length === 4) {
                var expirydate = `${ExpiryDateObject[0]}${ExpiryDateObject[1]}/${ExpiryDateObject[2]}${ExpiryDateObject[3]}`;
            } else if (ExpiryDateObject.length === 3) {
                var expirydate = `0${ExpiryDateObject[0]}/${ExpiryDateObject[1]}${ExpiryDateObject[2]}`;
            }
            req.body = {
                "Amount": pendingTransaction.CurrentDueAmount,
                "ConvenienceFeeActive": true,
                "BillingEmail": pendingTransaction.Email,
                "BillingCustomerName": `${pendingTransaction.FirstName} ${pendingTransaction.LastName}`,
                "BillingPostalCode": pendingTransaction.PostalCode,
                "BillingPhoneNumber": phone,
                "BillingCountry": "USA",
                "shippingSameAsBilling": true,
                "CardNumber": CardNumber.toString().replace(/\d{4}(?=.)/g, '$& '),
                "ExpiryDate": expirydate,
                "Cvv": Cvv.toString(),
                "MerchantId": MerchantId,
                "TransactionType": "1",
                "PaymentTokenization": true,
                "BillingAddress": pendingTransaction.Address1,
                "BillingCity": pendingTransaction.City,
                "BillingState": pendingTransaction.State,
                "BillingCountryCode": "+1",
                "Description": "IVR",
                "ReferenceNo": "",
                "Message": "",
                "RequestOrigin": "ivr",
                "SuggestedMode": "Card"
            };

            try {
                const response = await TranasactionServiceInstance.postTransaction(req.body, req.headers);
                console.log('response', response);
                res.status(200).json(response);

            } catch (error) {
                console.log('error  -  ', error)
                res.status(200).json({
                    status: 'error', message: error
                })
            }


        }
    }
}
