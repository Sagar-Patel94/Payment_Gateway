const models = require('../models');
const Sentry = require('@sentry/node');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const generateApiKey = require('generate-api-key');
const fs = require('fs'),
  request = require('request');
const { Sequelize } = require('sequelize');
//User Route handlers

exports.download = (uri, comapanyName, callback) => {
  let imagePath = '';
  request.head(uri, function (err, res, body) {
    var img = res.headers['content-type'].split('/');
    imagePath = `./data/Images/${comapanyName}.${img[1]}`;

    request(uri).pipe(fs.createWriteStream(imagePath)).on('close', callback);
  });
};

exports.getAllUsers = async (req, res) => {
  const limit =
    req.query.perPage == undefined || NaN ? 10 : parseInt(req.query.perPage);
  console.log(limit);
  const offset =
    req.query.page == undefined || NaN ? 0 : parseInt(req.query.page) - 1;
  const skipRecord = Math.ceil(offset * limit);
  const sortOrder = req.query.sort === undefined ? 'asc' : req.query.sort;
  const sortColumn =
    req.query.sortColumn === undefined ? 'FullName' : req.query.sortColumn;
  const searchKey = req.query.q === undefined ? '' : req.query.q;
  req.query.status = req.query.status == undefined ? '' : req.query.status;
  req.query.role = req.query.role == undefined ? '' : req.query.role;

  const timeZoneoffSet = new Date().getTimezoneOffset();
  let date = new Date(),
    y = date.getFullYear(),
    m = date.getMonth();
  let firstDay = new Date(y, m, 1);
  let lastDay = new Date(y, m + 1, 0);
  firstDay = new Date(firstDay).getTime() - timeZoneoffSet * 60 * 1000;
  dateFrom = new Date(firstDay).toISOString().split('T')[0];
  lastDay = new Date(lastDay).getTime() - timeZoneoffSet * 60 * 1000;
  dateTo = new Date(lastDay).toISOString().split('T')[0];
  dateFrom = dateFrom + ' 00:00:00';
  dateTo = dateTo + ' 23:59:59';

  console.log(dateFrom, dateTo);

  const includeTables = [
    {
      model: models.Role,
      attributes: ['RoleName'],
    },
  ];
  const whereClausesOrData = [
    {
      FullName: {
        [Op.like]: '%' + searchKey + '%',
      },
    },
    {
      CompanyName: {
        [Op.like]: '%' + searchKey + '%',
      },
    },
    {
      Email: {
        [Op.like]: '%' + searchKey + '%',
      },
    },
    {
      PhoneNumber: {
        [Op.like]: '%' + searchKey + '%',
      },
    },
  ];
  let conditionsArray = [
    {
      IsDeleted: {
        [Op.eq]: false,
      },
    },
  ];

  if (req.query.status == '' && req.query.role == '') {
    conditionsArray.push({
      IsActive: {
        [Op.eq]: true,
      },
      RoleId: { [Op.eq]: 4 },
    });
  }
  if (req.query.status != '' && req.query.role == '') {
    conditionsArray.push({
      IsActive: {
        [Op.eq]: req.query.status,
      },
    });
  }
  if (req.query.status == '' && req.query.role != '') {
    conditionsArray.push({
      RoleId: {
        [Op.eq]: req.query.role,
      },
    });
  }
  if (req.query.status != '' && req.query.role != '') {
    conditionsArray.push({
      IsActive: {
        [Op.eq]: req.query.status,
      },
      RoleId: {
        [Op.eq]: req.query.role,
      },
    });
  }

  await models.User.findAndCountAll({
    include: includeTables,
    where: {
      [Op.and]: conditionsArray,
      [Op.or]: whereClausesOrData,
    },
    order: [[sortColumn, sortOrder]],
    limit: limit,
    offset: skipRecord,
  })
    .then(async (user) => {
      console.log('Mine is', user.rows.length);
      for (let i = 0; i < user.rows.length; i++) {
        let TotalAmount = 0;
        if (
          user.rows[i].RoleId === 4 &&
          user.rows[i].IsActive === true &&
          user.rows[i].IsDeleted === false
        ) {
          let TotalSaleAmount = await models.Transaction.findAll({
            attributes: [
              [Sequelize.fn('SUM', Sequelize.col('Amount')), 'total_amount'],
            ],
            raw: true,
            group: ['MerchantId'],
            where: {
              [Op.and]: [
                { MerchantId: user.rows[i].id },
                {
                  createdAt: {
                    [Op.between]: [dateFrom, dateTo],
                  },
                },
              ],
            },
          });

          if (TotalSaleAmount.length != 0) {
            TotalAmount = parseFloat(TotalSaleAmount[0].total_amount).toFixed(
              2
            );
          } else {
            TotalAmount = 'NA';
          }
        } else {
          TotalAmount = 'NA';
        }

        user.rows[i].setDataValue('TotalSales', TotalAmount);
      }

      const totalPages = Math.ceil(user['count'] / limit);
      res.status(200).json({
        message: 'User found successfully',
        data: user,
        paging: {
          pages: totalPages,
        },
      });
    })
    .catch((err) => {
      Sentry.captureException(err);
      res.status(400).json({
        message: 'Error',
      });
    });
};

exports.ddlUsers = async (req, res) => {
  const includeTables = [
    {
      model: models.Role,
      attributes: ['RoleName'],
    },
  ];

  let conditionsArray = [
    {
      IsDeleted: {
        [Op.eq]: false,
      },
      IsActive: {
        [Op.eq]: true,
      },
    },
  ];
  await models.User.findAll({
    include: includeTables,
    where: {
      [Op.and]: conditionsArray,
    },
  })
    .then(async (user) => {
      let userData;
      let userArray = [];
      console.log('Enthayi', user);
      if (user != null) {
        for (let i = 0; i < user.length; i++) {
          userData = {
            id: user[i].id,
            UUID: user[i].UUID,
            FullName: user[i].FullName,
            CompanyName: user[i].CompanyName,
          };
          userArray.push(userData);
        }

        res.status(200).json({
          message: 'User found successfully',
          data: userArray,
        });
      } else {
        res.status(200).json({
          message: 'User List is empty',
        });
      }
    })
    .catch((err) => {
      Sentry.captureException(err);
      res.status(400).json({
        message: 'Error',
      });
    });
};

exports.getUserById = async (req, res) => {
  const findUser = await models.User.findOne({
    include: {
      model: models.Role,
      attributes: ['RoleName'],
    },
    where: { UUID: req.params.id },
  });
  const findRole = await models.Role.findOne({
    where: { id: findUser.RoleId },
  });
  const ApiKeys = await models.ServiceApiKeyTable.findAll({
    where: { UserId: findUser.id },
  });
  if (findUser === null) {
    res.status(404).json({
      message: 'User Not Exist',
    });
  } else {
    let userData = '';
    if (findRole.RoleName != 'Admin') {
      var UserProfileSetting = [];
      UserProfileSetting = await models.UserProfileSetting.findOne({
        where: { UserId: findUser.id },
      });
      const gatways = await models.MerchantPaymentGateWay.findAll({
        where: { UserId: findUser.id },
      });
      userData = {
        id: findUser.id,
        UUID: findUser.UUID,
        FullName: findUser.FullName,
        Email: findUser.Email,
        Password: findUser.Password,
        CompanyName: findUser.CompanyName,
        PhoneNumber: findUser.PhoneNumber,
        IsActive: findUser.IsActive,
        IsDeleted: findUser.IsDeleted,
        LogoPath: findUser.LogoPath,
        PrivacyPolicyURL: findUser.PrivacyPolicyURL,
        ReturnPolicyURL: findUser.ReturnPolicyURL,
        CancellationPolicyURL: findUser.CancellationPolicyURL,
        ShippingPolicyURL: findUser.ShippingPolicyURL,
        NotificationEmail: findUser.NotificationEmail,
        DisplaySaveCard: findUser.DisplaySaveCard,
        createdAt: findUser.createdAt,
        updatedAt: findUser.updatedAt,
        RoleId: findUser.RoleId,
        TransactionFee: findUser.TransactionFee,
        TextFee: findUser.TextFee,
        GatewayFee: findUser.GatewayFee,
        NonQualified: findUser.NonQualified,
        WaivedConvenience: findUser.WaivedConvenience,
        ChargeBacks: findUser.ChargeBacks,
        AuthorizationFee: findUser.AuthorizationFee,
        Miscellaneous1: findUser.Miscellaneous1,
        Miscellaneous2: findUser.Miscellaneous2,
        RefundFee: findUser.RefundFee,
        MiscFee1: findUser.MiscFee1,
        MiscFee2: findUser.MiscFee2,
        Role: findUser.Role,
        Address: findUser.Address,
        City: findUser.City,
        State: findUser.State,
        Country: findUser.Country,
        PostalCode: findUser.PostalCode,
        GatewayId: findUser.GatewayId,
        UserLevel: findUser.UserLevel,
        Gateways: gatways,
        ApiKeys: ApiKeys,
        UserProfileSetting: UserProfileSetting,
        CustomerTip: findUser.CustomerTip,
      };
      res.status(200).json({
        message: 'User found successfully',
        data: userData,
      });
    } else {
      res.status(200).json({
        message: 'User found successfully',
        data: findUser,
      });
    }
  }
};

exports.getPaidBy = (method) => {
  const methods = {
    FluidPay: 'ACH',
    Payrix: 'Card',
    PaysafeCash: 'Cash',
  };
  return methods[method];
};

exports.createUsers = async (req, res) => {
  let tempGateWays = [];
  try {
    if (req.body.MerchantLogo != undefined) {
      exports.download(
        req.body.MerchantLogo,
        req.body.CompanyName,
        function () {
          console.log('done');
        }
      );
    }
    const findRole = await models.Role.findOne({
      where: {
        id: req.body.RoleId,
      },
    });
    const Password = '123456';
    const defaultPwd = req.body.Password ?? Password;
    const saltRound = await bcryptjs.genSalt(10);
    const hashPwd = await bcryptjs.hash(defaultPwd, saltRound);
    const userCheck = await models.User.findOne({
      where: {
        Email: req.body.Email,
      },
    });

    if (userCheck) {
      return res.status(400).send({
        message: 'Failed! Email is already in use!',
      });
    } else {
      const user = {
        FullName: req.body.FullName,
        Email: req.body.Email,
        Password: hashPwd,
        PhoneNumber: req.body.PhoneNumber,
        CompanyName: req.body.CompanyName,
        IsActive: true,
        IsDeleted: false,
        RoleId: req.body.RoleId,
        LogoPath: req.body.MerchantLogo,
        PrivacyPolicyURL: req.body.PrivacyPolicyURL,
        ReturnPolicyURL: req.body.ReturnPolicyURL,
        CancellationPolicyURL: req.body.CancellationPolicyURL,
        ShippingPolicyURL: req.body.ShippingPolicyURL,
        NotificationEmail: req.body.NotificationEmail ?? req.body.Email,
        DisplaySaveCard: req.body.DisplaySaveCard,
        Address: req.body.Address,
        City: req.body.City,
        State: req.body.State,
        Country: req.body.Country,
        PostalCode: req.body.PostalCode,
        Miscellaneous1: req.body.Miscellaneous1,
        Miscellaneous2: req.body.Miscellaneous2,
        UserLevel: req.body.UserLevel,
        CustomerTip: req.body.CustomerTip,
      };
      const createdUser = await models.User.create(user);
      const gatewayId = 10000 + createdUser.id;
      const addGatewayId = await models.User.update(
        { GatewayId: gatewayId },
        {
          where: {
            UUID: createdUser.UUID,
          },
        }
      );
      if (createdUser != null) {
        const apiKey = generateApiKey({
          method: 'string',
          length: 27,
          prefix: 'api-',
          pool: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-~+/',
        });
        const services = {
          UserId: createdUser.id,
          ApiKey: apiKey,
        };
        const createdApiKey = await models.ServiceApiKeyTable.create(services);
        createdUser.setDataValue('ApiKey', createdApiKey.ApiKey);
        if (findRole.RoleName !== 'Admin') {
          if (req.body.Gateways != undefined && req.body.Gateways.length > 0) {
            for (let i = 0; i < req.body.Gateways.length; i++) {
              // let getwayValue = exports.getPaidBy(
              //   req.body.Gateways[i].GatewayType
              // );
              // if (req.body.Gateways[i].GatewayType == 'FluidPay') {
              //   getwayValue = 'Card';
              // }
              const addGateway = {
                GatewayApiKey: req.body.Gateways[i].GatewayApiKey,
                ConvenienceFeeValue: req.body.Gateways[i].ConvenienceFeeValue,
                GatewayType: req.body.Gateways[i].GatewayType,
                GMerchantId: req.body.Gateways[i].GMerchantId,
                ConvenienceFeeMinimum:
                  req.body.Gateways[i].ConvenienceFeeMinimum,
                ConvenienceFeeType: req.body.Gateways[i].ConvenienceFeeType,
                ConvenienceFeeActive: req.body.Gateways[i].ConvenienceFeeActive,
                GatewayStatus: req.body.Gateways[i].GatewayStatus,
                SuggestedMode: req.body.Gateways[i].SuggestedMode,
                UserId: createdUser.id,
                ProcessorId: req.body.Gateways[i].ProcessorId,
                ProcessorLevel: req.body.Gateways[i].ProcessorLevel,
                Note: req.body.Gateways[i].Note,
                ProcessorLabel: req.body.Gateways[i].ProcessorLabel,
                AuthTransactionKey: req.body.Gateways[i].AuthTransactionKey,
              };
              let gatewaysAdded = await models.MerchantPaymentGateWay.create(
                addGateway
              );
              tempGateWays.push(gatewaysAdded);
            }

            createdUser.setDataValue('Gateways', tempGateWays);
            return res.status(201).json({
              message: 'User created Successfully',
              data: createdUser,
            });
          } else {
            return res.status(201).json({
              message: 'User created Successfully',
              data: createdUser,
            });
          }
        } else {
          return res.status(201).json({
            message: 'User created Successfully',
            data: createdUser,
          });
        }
      } else {
        return res.status(400).json({
          message: 'User Creation Failed',
        });
      }
    }
  } catch (error) {
    Sentry.captureException(error);
    return res.status(500).json({
      message: 'Something went wrong',
      error: error.message,
    });
  }
};

exports.updateUser = async (req, res) => {
  let tempGateWays;
  try {
    let createdApiKey = '';
    const findUser = await models.User.findOne({
      where: {
        UUID: req.params.id,
      },
    });
    if (req.body.MerchantLogo != undefined) {
      exports.download(
        req.body.MerchantLogo,
        req.body.CompanyName,
        function () {
          console.log('done');
        }
      );
    }
    createdApiKey = await models.ServiceApiKeyTable.findOne({
      where: { UserId: findUser.id },
    });
    if (createdApiKey == null) {
      const apiKey = generateApiKey({
        method: 'string',
        length: 27,
        prefix: 'api-',
        pool: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-~+/',
      });
      const services = {
        UserId: findUser.id,
        ApiKey: apiKey,
      };
      createdApiKey = await models.ServiceApiKeyTable.create(services);
    }
    const modifiedUser = {
      FullName: req.body.FullName,
      Email: req.body.Email,
      PhoneNumber: req.body.PhoneNumber,
      CompanyName: req.body.CompanyName,
      IsActive: req.body.IsActive,
      IsDeleted: req.body.IsDeleted,
      RoleId: req.body.RoleId,
      LogoPath: req.body.MerchantLogo,
      PrivacyPolicyURL: req.body.PrivacyPolicyURL,
      ReturnPolicyURL: req.body.ReturnPolicyURL,
      CancellationPolicyURL: req.body.CancellationPolicyURL,
      ShippingPolicyURL: req.body.ShippingPolicyURL,
      NotificationEmail: req.body.NotificationEmail,
      DisplaySaveCard: req.body.DisplaySaveCard,
      Address: req.body.Address,
      TransactionFee: req.body.TransactionFee,
      TextFee: req.body.TextFee,
      GatewayFee: req.body.GatewayFee,
      NonQualified: req.body.NonQualified,
      WaivedConvenience: req.body.WaivedConvenience,
      ChargeBacks: req.body.ChargeBacks,
      AuthorizationFee: req.body.AuthorizationFee,
      Miscellaneous1: req.body.Miscellaneous1,
      Miscellaneous2: req.body.Miscellaneous2,
      RefundFee: req.body.RefundFee,
      MiscFee1: req.body.MiscFee1,
      MiscFee2: req.body.MiscFee2,
      Address: req.body.Address,
      City: req.body.City,
      State: req.body.State,
      Country: req.body.Country,
      PostalCode: req.body.PostalCode,
      UserLevel: req.body.UserLevel,
      CustomerTip: req.body.CustomerTip,
    };
    const result = await models.User.update(modifiedUser, {
      where: {
        UUID: req.params.id,
      },
    });

    const updatedUserResult = await models.User.findOne({
      where: {
        UUID: req.params.id,
      },
    });

    if (result != null) {
      if (req.body.Gateways && req.body.Gateways.length > 0) {
        for (let i = 0; i < req.body.Gateways.length; i++) {
          // let getwayValue = exports.getPaidBy(req.body.Gateways[i].GatewayType);
          // if (req.body.Gateways[i].GatewayType == 'FluidPay') {
          //   getwayValue = 'Card';
          // }
          if (req.body.Gateways[i].id != undefined) {
            const updateGateway = {
              GatewayApiKey: req.body.Gateways[i].GatewayApiKey,
              ConvenienceFeeValue: req.body.Gateways[i].ConvenienceFeeValue,
              GatewayType: req.body.Gateways[i].GatewayType,
              GMerchantId: req.body.Gateways[i].GMerchantId,
              ConvenienceFeeMinimum: req.body.Gateways[i].ConvenienceFeeMinimum,
              ConvenienceFeeType: req.body.Gateways[i].ConvenienceFeeType,
              ConvenienceFeeActive: req.body.Gateways[i].ConvenienceFeeActive,
              GatewayStatus: req.body.Gateways[i].GatewayStatus,
              SuggestedMode: req.body.Gateways[i].SuggestedMode,
              UserId: updatedUserResult.id,
              ProcessorId: req.body.Gateways[i].ProcessorId,
              ProcessorLevel: req.body.Gateways[i].ProcessorLevel,
              Note: req.body.Gateways[i].Note,
              ProcessorLabel: req.body.Gateways[i].ProcessorLabel,
              AuthTransactionKey: req.body.Gateways[i].AuthTransactionKey,
            };
            let getWayUpdated = await models.MerchantPaymentGateWay.update(
              updateGateway,
              {
                where: {
                  [Op.and]: [
                    {
                      UUID: req.body.Gateways[i].UUID,
                      UserId: updatedUserResult.id,
                    },
                  ],
                },
              }
            );
            console.log('Is updated', getWayUpdated);
          } else {
            const insertGateway = {
              GatewayApiKey: req.body.Gateways[i].GatewayApiKey,
              ConvenienceFeeValue: req.body.Gateways[i].ConvenienceFeeValue,
              GatewayType: req.body.Gateways[i].GatewayType,
              GMerchantId: req.body.Gateways[i].GMerchantId,
              ConvenienceFeeMinimum: req.body.Gateways[i].ConvenienceFeeMinimum,
              ConvenienceFeeType: req.body.Gateways[i].ConvenienceFeeType,
              ConvenienceFeeActive: req.body.Gateways[i].ConvenienceFeeActive,
              GatewayStatus: req.body.Gateways[i].GatewayStatus,
              SuggestedMode: req.body.Gateways[i].SuggestedMode,
              UserId: updatedUserResult.id,
              ProcessorId: req.body.Gateways[i].ProcessorId,
              ProcessorLevel: req.body.Gateways[i].ProcessorLevel,
              Note: req.body.Gateways[i].Note,
              AuthTransactionKey: req.body.Gateways[i].AuthTransactionKey,
            };
            let getWayAdded = await models.MerchantPaymentGateWay.create(
              insertGateway
            );
          }
        }
        tempGateWays = await models.MerchantPaymentGateWay.findAll({
          where: {
            UserId: updatedUserResult.id,
          },
        });
        updatedUserResult.setDataValue('Gateways', tempGateWays);
        updatedUserResult.setDataValue('ApiKey', createdApiKey.ApiKey);
        return res.status(200).json({
          message: 'User Updated Successfully',
          data: updatedUserResult,
        });
      } else {
        updatedUserResult.setDataValue('ApiKey', createdApiKey.ApiKey);
        return res.status(200).json({
          message: 'User Updated Successfully',
          data: updatedUserResult,
        });
      }
    } else {
      res.status(400).json({
        message: 'User Updation Failed',
      });
    }
  } catch (err) {
    Sentry.captureException(err);
    return res.status(500).json({
      message: 'Something went wrong',
      error: err,
    });
  }
};

exports.deleteUser = async (req, res) => {
  await models.User.update(
    {
      IsActive: req.body.IsActive,
      IsDeleted: req.body.IsDeleted,
    },
    {
      where: {
        UUID: req.params.id,
      },
    }
  )
    .then((result) => {
      res.status(200).json({
        message: 'User Deleted Successfully',
      });
    })
    .catch((err) => {
      Sentry.captureException(err);
      res.status(500).json({
        message: 'Something Went Wrong',
        error: err,
      });
    });
};

exports.updateUserStatus = async (req, res) => {
  await models.User.update(
    {
      IsActive: req.body.IsActive,
    },
    {
      where: {
        UUID: req.params.id,
      },
    }
  )
    .then((result) => {
      res.status(200).json({
        message: 'User Status updated Successfully',
      });
    })
    .catch((err) => {
      Sentry.captureException(err);
      res.status(500).json({
        message: 'Something Went Wrong',
        error: err,
      });
    });
};

exports.updateMerchantPassword = async (req, res) => {
  bcryptjs.genSalt(10, function (err, salt) {
    bcryptjs.hash(req.body.Password, salt, function (err, hash) {
      models.User.update(
        {
          Password: hash,
        },
        {
          where: {
            UUID: req.params.id,
          },
        }
      )
        .then((result) => {
          res.status(200).json({
            message: 'Merchant password updated Successfully',
          });
        })
        .catch((err) => {
          Sentry.captureException(err);
          res.status(500).json({
            message: 'Something Went Wrong',
            error: err,
          });
        });
    });
  });
};

exports.merchantStatement = async (req, res) => {
  try {
    let token = '';
    let decoded = '';
    if (req.query.mid != undefined) {
      decoded = {};
      decoded.Id = req.query.mid;
    } else {
      token = req.headers.authorization.split(' ');
      decoded = jwt.verify(token[1], process.env.JWT_SECRET);
    }
    let paymentType = '',
      dateFrom = '',
      dateTo = '';
    let transactionsFeeCount = '',
      MonthlyCardData = '',
      MonthlyCashData = '',
      MonthlyAchData = '',
      txtToPayCount = '',
      waivedFeeCount = '',
      gatewayFeeCount = '',
      nonQualifiedCount = '',
      chargeBackCount = '';
    paymentType = req.query.paymentType ?? '1';
    if (req.query.dateFrom != undefined) {
      dateFrom = req.query.dateFrom;
    }
    if (req.query.dateTo != undefined) {
      dateTo = req.query.dateTo;
    }
    const findUser = await models.User.findOne({
      where: { id: req.query.mid },
    });
    const gateWayData = await models.MerchantPaymentGateWay.findOne({
      where: {
        [Op.and]: [
          { UserId: findUser.id },
          { ProcessorLevel: { [Op.or]: ['QuantumB', 'QuantumD'] } },
        ],
      },
    });
    if (findUser != null) {
      transactionsFeeCount = await models.Transaction.findAll({
        // subQuery: false,
        attributes: [
          [
            Sequelize.fn('COUNT', Sequelize.col('Transaction.id')),
            'SalesCount',
          ],
          [Sequelize.fn('SUM', Sequelize.col('Amount')), 'Amount'],
        ],
        where: {
          [Op.and]: [
            {
              MerchantId: {
                [Op.eq]: findUser.id,
              },
            },
            {
              Type: {
                [Op.eq]: paymentType,
              },
            },
            {
              createdAt: {
                [Op.between]: [dateFrom, dateTo],
              },
            },
          ],
        },
      });

      //The query to find sum of settled sale Card transactions only
      MonthlyCardData = await models.Transaction.findAll({
        // subQuery: false,
        attributes: [
          [
            Sequelize.fn('COUNT', Sequelize.col('Transaction.id')),
            'SalesCount',
          ],
          [
            Sequelize.fn('SUM', Sequelize.col('ConvenienceFeeValue')),
            'FeeTotal',
          ],
          [Sequelize.fn('SUM', Sequelize.col('Amount')), 'Amount'],
        ],
        where: {
          [Op.and]: [
            {
              MerchantId: {
                [Op.eq]: findUser.id,
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
            { SuggestedMode: { [Op.eq]: 'Card' } },
            {
              SettledDate: {
                [Op.between]: [dateFrom, dateTo],
              },
            },
          ],
        },
      });

      //The query to find sum of settled sale Cash transactions only
      MonthlyCashData = await models.Transaction.findAll({
        // subQuery: false,
        attributes: [
          [
            Sequelize.fn('COUNT', Sequelize.col('Transaction.id')),
            'SalesCount',
          ],
          [
            Sequelize.fn('SUM', Sequelize.col('ConvenienceFeeValue')),
            'FeeTotal',
          ],
          [Sequelize.fn('SUM', Sequelize.col('Amount')), 'Amount'],
        ],
        where: {
          [Op.and]: [
            {
              MerchantId: {
                [Op.eq]: findUser.id,
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
            { SuggestedMode: { [Op.eq]: 'Cash' } },
            {
              SettledDate: {
                [Op.between]: [dateFrom, dateTo],
              },
            },
          ],
        },
      });

      //The query to find sum of settled sale Ach transactions only
      MonthlyAchData = await models.Transaction.findAll({
        // subQuery: false,
        attributes: [
          [
            Sequelize.fn('COUNT', Sequelize.col('Transaction.id')),
            'SalesCount',
          ],
          [
            Sequelize.fn('SUM', Sequelize.col('ConvenienceFeeValue')),
            'FeeTotal',
          ],
          [Sequelize.fn('SUM', Sequelize.col('Amount')), 'Amount'],
        ],
        where: {
          [Op.and]: [
            {
              MerchantId: {
                [Op.eq]: findUser.id,
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
            { SuggestedMode: { [Op.eq]: 'ACH' } },
            {
              SettledDate: {
                [Op.between]: [dateFrom, dateTo],
              },
            },
          ],
        },
      });

      txtToPayCount = await models.Transaction.findAll({
        // subQuery: false,
        attributes: [
          [
            Sequelize.fn('COUNT', Sequelize.col('Transaction.id')),
            'SalesCount',
          ],
          [Sequelize.fn('SUM', Sequelize.col('Amount')), 'Amount'],
        ],
        where: {
          [Op.and]: [
            {
              MerchantId: {
                [Op.eq]: findUser.id,
              },
            },
            {
              Type: {
                [Op.eq]: paymentType,
              },
            },
            {
              RequestOrigin: {
                [Op.like]: 'pg%',
              },
            },
            {
              createdAt: {
                [Op.between]: [dateFrom, dateTo],
              },
            },
          ],
        },
      });

      waivedFeeCount = await models.Transaction.findAll({
        // subQuery: false,
        attributes: [
          [
            Sequelize.fn('COUNT', Sequelize.col('Transaction.id')),
            'SalesCount',
          ],
          [Sequelize.fn('SUM', Sequelize.col('Amount')), 'Amount'],
        ],
        where: {
          [Op.and]: [
            {
              MerchantId: {
                [Op.eq]: findUser.id,
              },
            },
            {
              Type: {
                [Op.eq]: paymentType,
              },
            },
            {
              ConvenienceFeeValue: {
                [Op.eq]: gateWayData.ConvenienceFeeMinimum,
              },
            },
            {
              createdAt: {
                [Op.between]: [dateFrom, dateTo],
              },
            },
          ],
        },
      });

      // waivedFeeCount = await models.Transaction.findAll({
      //   // subQuery: false,
      //   attributes: [
      //     [
      //       Sequelize.fn('COUNT', Sequelize.col('Transaction.id')),
      //       'SalesCount',
      //     ],
      //     [Sequelize.fn('SUM', Sequelize.col('Amount')), 'Amount'],
      //   ],
      //   where: {
      //     [Op.and]: [
      //       {
      //         MerchantId: {
      //           [Op.eq]: findUser.id,
      //         },
      //       },
      //       {
      //         Type: {
      //           [Op.eq]: paymentType,
      //         },
      //       },
      //       {
      //         ConvenienceFeeActive: {
      //           [Op.eq]: false,
      //         },
      //       },
      //       {
      //         createdAt: {
      //           [Op.between]: [dateFrom, dateTo],
      //         },
      //       },
      //     ],
      //   },
      // });

      authFeeCount = await models.Transaction.findAll({
        // subQuery: false,
        attributes: [
          [
            Sequelize.fn('COUNT', Sequelize.col('Transaction.id')),
            'SalesCount',
          ],
          [Sequelize.fn('SUM', Sequelize.col('Amount')), 'Amount'],
        ],
        where: {
          [Op.and]: [
            {
              MerchantId: {
                [Op.eq]: findUser.id,
              },
            },
            {
              Type: {
                [Op.eq]: '2',
              },
            },
            {
              createdAt: {
                [Op.between]: [dateFrom, dateTo],
              },
            },
          ],
        },
      });

      refundFeeCount = await models.Transaction.findAll({
        // subQuery: false,
        attributes: [
          [
            Sequelize.fn('COUNT', Sequelize.col('Transaction.id')),
            'SalesCount',
          ],
          [Sequelize.fn('SUM', Sequelize.col('Amount')), 'Amount'],
        ],
        where: {
          [Op.and]: [
            {
              MerchantId: {
                [Op.eq]: findUser.id,
              },
            },
            {
              Refund: {
                [Op.eq]: true,
              },
            },
            {
              createdAt: {
                [Op.between]: [dateFrom, dateTo],
              },
            },
          ],
        },
      });

      nonQualifiedCount = await models.Transaction.findAll({
        // subQuery: false,
        attributes: [
          [
            Sequelize.fn('COUNT', Sequelize.col('Transaction.id')),
            'SalesCount',
          ],
          [Sequelize.fn('SUM', Sequelize.col('Amount')), 'Amount'],
        ],
        where: {
          [Op.and]: [
            {
              MerchantId: {
                [Op.eq]: findUser.id,
              },
            },
            {
              Type: {
                [Op.eq]: paymentType,
              },
            },
            {
              NonQualified: {
                [Op.eq]: true,
              },
            },
            {
              createdAt: {
                [Op.between]: [dateFrom, dateTo],
              },
            },
          ],
        },
      });

      chargeBackCount = await models.Transaction.findAll({
        // subQuery: false,
        attributes: [
          [
            Sequelize.fn('COUNT', Sequelize.col('Transaction.id')),
            'SalesCount',
          ],
          [Sequelize.fn('SUM', Sequelize.col('Amount')), 'Amount'],
        ],
        where: {
          [Op.and]: [
            {
              MerchantId: {
                [Op.eq]: findUser.id,
              },
            },
            {
              Type: {
                [Op.eq]: paymentType,
              },
            },
            {
              ChargeBack: {
                [Op.eq]: true,
              },
            },
            {
              createdAt: {
                [Op.between]: [dateFrom, dateTo],
              },
            },
          ],
        },
      });

      const combinedTxn = await models.Transaction.findAll({
        // subQuery: false,
        attributes: [
          [
            Sequelize.fn('date', Sequelize.col('Transaction.SettledDate')),
            'ReportDate',
          ],
          [Sequelize.fn('COUNT', Sequelize.col('Transaction.id')), 'Sales'],
          [Sequelize.fn('SUM', Sequelize.col('Amount')), 'GrossTotal'],
          [
            Sequelize.fn('SUM', Sequelize.col('ConvenienceFeeValue')),
            'ConvenienceFee',
          ],
        ],
        group: [
          [Sequelize.fn('date', Sequelize.col('Transaction.SettledDate'))],
        ],
        where: {
          [Op.and]: [
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
              SettledDate: {
                [Op.between]: [dateFrom, dateTo],
              },
            },
          ],
        },
        order: [
          [
            Sequelize.fn('date', Sequelize.col('Transaction.SettledDate')),
            'DESC',
          ],
        ],
      });

      const singleRefundData = await models.Transaction.findAll({
        // subQuery: false,
        attributes: [
          'id',
          [
            Sequelize.fn('date', Sequelize.col('Transaction.SettledDate')),
            'ReportDate',
          ],
        ],
        include: [
          {
            model: models.Customer,
            attributes: ['CustomerName', 'Email'],
          },
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
          [Op.and]: [
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
              Refund: {
                [Op.eq]: true,
              },
            },
            {
              createdAt: {
                [Op.between]: [dateFrom, dateTo],
              },
            },
          ],
        },
        order: [['id', 'DESC']],
      });

      let totalRefund = 0;
      //for find total refund deduction
      for (let j = 0; j < combinedTxn.length; j++) {
        for (let i = 0; i < singleRefundData.length; i++) {
          if (
            combinedTxn[j].dataValues.ReportDate ==
            singleRefundData[i].dataValues.ReportDate
          ) {
            const tempArray = await models.RefundVoidCaptureTable.findOne({
              where: {
                TransactionId: {
                  [Op.eq]: singleRefundData[i].id,
                },
              },
            });
            totalRefund =
              parseFloat(totalRefund) + parseFloat(tempArray.Amount);
          }
        }
      }

      const statementData = {
        TransactionFee: {
          count: parseFloat(transactionsFeeCount[0].dataValues.SalesCount),
          amount: parseFloat(findUser.TransactionFee),
        },
        Text2PAYFee: {
          count: parseFloat(txtToPayCount[0].dataValues.SalesCount),
          amount: parseFloat(findUser.TextFee),
        },
        GatewayFee: {
          count: parseFloat(1),
          amount: parseFloat(findUser.GatewayFee),
        },
        NonQualifiedFee: {
          count: parseFloat(nonQualifiedCount[0].dataValues.Amount),
          amount: parseFloat(findUser.NonQualified),
        },
        chargeBackFee: {
          count: parseFloat(chargeBackCount[0].dataValues.SalesCount),
          amount: parseFloat(findUser.ChargeBacks),
        },
        WaivedConvenienceFee: {
          count: parseFloat(waivedFeeCount[0].dataValues.Amount),
          amount: parseFloat(findUser.WaivedConvenience),
        },
        AuthorizationFee: {
          count: parseFloat(authFeeCount[0].dataValues.SalesCount),
          amount: parseFloat(findUser.AuthorizationFee),
        },
        RefundFee: {
          count: parseFloat(refundFeeCount[0].dataValues.SalesCount),
          amount: parseFloat(findUser.RefundFee),
        },
        MiscFee1: {
          count: parseFloat(1),
          amount: parseFloat(findUser.MiscFee1),
          label: findUser.Miscellaneous1,
        },
        MiscFee2: {
          count: parseFloat(1),
          amount: parseFloat(findUser.MiscFee2),
          label: findUser.Miscellaneous2,
        },
        CreditCards: {
          count: parseFloat(MonthlyCardData[0].dataValues.SalesCount),
          amount: parseFloat(MonthlyCardData[0].dataValues.Amount),
          FeeTotal: parseFloat(MonthlyCardData[0].dataValues.FeeTotal),
        },
        Cash: {
          count: parseFloat(MonthlyCashData[0].dataValues.SalesCount),
          amount: parseFloat(MonthlyCashData[0].dataValues.Amount),
          FeeTotal: parseFloat(MonthlyCashData[0].dataValues.FeeTotal),
        },
        ACH: {
          count: parseFloat(MonthlyAchData[0].dataValues.SalesCount),
          amount: parseFloat(MonthlyAchData[0].dataValues.Amount),
          FeeTotal: parseFloat(MonthlyAchData[0].dataValues.FeeTotal),
        },

        Refund: {
          count: parseFloat(singleRefundData.length),
          amount: parseFloat(totalRefund),
        },
        chargebacks: {
          count: parseFloat(chargeBackCount[0].dataValues.SalesCount),
          amount: parseFloat(chargeBackCount[0].dataValues.Amount),
        },
      };

      res
        .status(200)
        .json({ msg: 'Statement Found Successfully', data: statementData });
    } else {
      Sentry.captureException('User not found');
      res.status(400).json({ msg: 'User not found' });
    }
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({
      message: 'Something Went Wrong',
      error: error,
    });
  }
};

exports.summaryByMethod = async (req, res) => {
  try {
    let token = '';
    let decoded = '';
    if (req.query.mid != undefined) {
      decoded = {};
      decoded.Id = req.query.mid;
    } else {
      token = req.headers.authorization.split(' ');
      decoded = jwt.verify(token[1], process.env.JWT_SECRET);
    }
    let paymentType = '',
      dateFrom = '',
      dateTo = '';
    let termainalCount = '',
      txtToPayCount = '',
      ivrCount = '';
    paymentType = req.query.paymentType ?? '1';
    if (req.query.dateFrom != undefined) {
      dateFrom = req.query.dateFrom;
    }
    if (req.query.dateTo != undefined) {
      dateTo = req.query.dateTo;
    }
    const findUser = await models.User.findOne({
      where: { id: req.query.mid },
    });
    if (findUser != null) {
      termainalCount = await models.Transaction.findAll({
        subQuery: false,
        attributes: [
          [
            Sequelize.fn('COUNT', Sequelize.col('Transaction.id')),
            'SalesCount',
          ],
          [Sequelize.fn('SUM', Sequelize.col('Amount')), 'Amount'],
        ],
        where: {
          [Op.and]: [
            {
              MerchantId: {
                [Op.eq]: findUser.id,
              },
            },
            {
              Type: {
                [Op.eq]: paymentType,
              },
            },
            { Status: { [Op.in]: ['4'] } },
            {
              RequestOrigin: {
                [Op.eq]: 'vt',
              },
            },
            {
              SettledDate: {
                [Op.between]: [dateFrom, dateTo],
              },
            },
          ],
        },
      });

      txtToPayCount = await models.Transaction.findAll({
        subQuery: false,
        attributes: [
          [
            Sequelize.fn('COUNT', Sequelize.col('Transaction.id')),
            'SalesCount',
          ],
          [Sequelize.fn('SUM', Sequelize.col('Amount')), 'Amount'],
        ],
        where: {
          [Op.and]: [
            {
              MerchantId: {
                [Op.eq]: findUser.id,
              },
            },
            {
              Type: {
                [Op.eq]: paymentType,
              },
            },
            { Status: { [Op.in]: ['4'] } },
            {
              RequestOrigin: {
                [Op.like]: 'pg%',
              },
            },
            {
              SettledDate: {
                [Op.between]: [dateFrom, dateTo],
              },
            },
          ],
        },
      });

      ivrCount = await models.Transaction.findAll({
        subQuery: false,
        attributes: [
          [
            Sequelize.fn('COUNT', Sequelize.col('Transaction.id')),
            'SalesCount',
          ],
          [Sequelize.fn('SUM', Sequelize.col('Amount')), 'Amount'],
        ],
        where: {
          [Op.and]: [
            {
              MerchantId: {
                [Op.eq]: findUser.id,
              },
            },
            {
              Type: {
                [Op.eq]: paymentType,
              },
            },
            { Status: { [Op.in]: ['4'] } },
            {
              RequestOrigin: {
                [Op.eq]: 'ivr',
              },
            },
            {
              SettledDate: {
                [Op.between]: [dateFrom, dateTo],
              },
            },
          ],
        },
      });

      const summaryData = {
        VirtualTerminal: {
          count: parseFloat(termainalCount[0].dataValues.SalesCount),
          amount: parseFloat(termainalCount[0].dataValues.Amount),
        },
        Text2Pay: {
          count: parseFloat(txtToPayCount[0].dataValues.SalesCount),
          amount: parseFloat(txtToPayCount[0].dataValues.Amount),
        },
        IvrData: {
          count: parseFloat(ivrCount[0].dataValues.SalesCount),
          amount: parseFloat(ivrCount[0].dataValues.Amount),
        },
      };

      res
        .status(200)
        .json({ msg: 'Statement Found Successfully', data: summaryData });
    } else {
      Sentry.captureException('User not found');
      res.status(400).json({ msg: 'User not found' });
    }
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({
      message: 'Something Went Wrong',
      error: error,
    });
  }
};

exports.getRefundDetails = async (req, res) => {
  try {
    let token = '';
    let decoded = '';
    if (req.query.mid != undefined) {
      decoded = {};
      decoded.Id = req.query.mid;
    } else {
      token = req.headers.authorization.split(' ');
      decoded = jwt.verify(token[1], process.env.JWT_SECRET);
    }
    paymentType = req.query.paymentType ?? '1';
    if (req.query.dateFrom != undefined) {
      dateFrom = req.query.dateFrom;
    }
    if (req.query.dateTo != undefined) {
      dateTo = req.query.dateTo;
    }

    if (req.query.result != undefined) {
      statusValue = req.query.result.split(',');
    } else {
      statusValue = '';
    }

    paymentType = req.query.paymentType ?? '1';

    const refundCaptureData = await models.RefundVoidCaptureTable.findAll({
      where: { UserId: decoded.Id },
    });

    const findAllTxn = await models.Transaction.findAll({
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
      where: {
        [Op.and]: [
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
          { Status: { [Op.in]: ['4'] } },
          {
            SettledDate: {
              [Op.between]: [dateFrom, dateTo],
            },
          },
        ],
      },
      order: [['id', 'DESC']],
    });

    const transwithData = await models.Transaction.findAll({
      // subQuery: false,
      attributes: [
        'id',
        'UUID',
        'TransactionId',
        [
          Sequelize.fn('date', Sequelize.col('Transaction.SettledDate')),
          'ReportEndingTime',
        ],
        [Sequelize.fn('COUNT', Sequelize.col('Transaction.id')), 'SalesCount'],
        [Sequelize.fn('SUM', Sequelize.col('Amount')), 'Amount'],
      ],
      include: [
        {
          model: models.Customer,
          attributes: ['CustomerName', 'Email'],
        },
        {
          model: models.User,
          as: 'User',
          attributes: ['FullName', 'Email'],
        },
      ],
      group: [
        'id',
        'UUID',
        'TransactionId',
        [Sequelize.fn('date', Sequelize.col('Transaction.SettledDate'))],
      ],
      where: {
        [Op.and]: [
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
            Refund: {
              [Op.eq]: true,
            },
          },
          { Status: { [Op.in]: ['4'] } },
          {
            SettledDate: {
              [Op.between]: [dateFrom, dateTo],
            },
          },
        ],
      },
      order: [['id', 'DESC']],
    });
    let j = 0;
    let refundArray = [];
    for (let i = 0; i < transwithData.length; i++) {
      for (let k = 0; k < findAllTxn.length; k++) {
        if (findAllTxn[k].id === transwithData[i].id) {
          const tempArray = await models.RefundVoidCaptureTable.findOne({
            where: {
              TransactionId: {
                [Op.eq]: findAllTxn[k].id,
              },
            },
          });
          refundArray.push({
            RefundDate: tempArray.createdAt,
            TransactionId: tempArray.PrevTransactionId,
            UUID: transwithData[i].UUID,
            CardHolderName: transwithData[i].Customer.CustomerName,
            Fee: parseFloat(transwithData[i].ConvenienceFeeValue),
            Amount: parseFloat(tempArray.Amount),
          });
        }
      }
    }
    res.status(200).json({
      message: 'Transactions found successfully',
      data: refundArray,
    });
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({
      message: 'Something Went Wrong',
      error: error,
    });
  }
};

exports.chargeBackSummary = async (req, res) => {
  try {
    let token = '';
    let decoded = '';
    if (req.query.mid != undefined) {
      decoded = {};
      decoded.Id = req.query.mid;
    } else {
      token = req.headers.authorization.split(' ');
      decoded = jwt.verify(token[1], process.env.JWT_SECRET);
    }
    paymentType = req.query.paymentType ?? '1';
    if (req.query.dateFrom != undefined) {
      dateFrom = req.query.dateFrom;
    }
    if (req.query.dateTo != undefined) {
      dateTo = req.query.dateTo;
    }

    if (req.query.result != undefined) {
      statusValue = req.query.result.split(',');
    } else {
      statusValue = '';
    }

    paymentType = req.query.paymentType ?? '1';

    const transwithChargeBack = await models.Transaction.findAll({
      include: [
        {
          model: models.Customer,
          attributes: ['CustomerName', 'Email'],
        },
        {
          model: models.User,
          as: 'User',
          attributes: ['FullName', 'Email'],
        },
      ],
      where: {
        [Op.and]: [
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
            ChargeBack: {
              [Op.eq]: true,
            },
          },
          { Status: { [Op.in]: ['4'] } },
          {
            createdAt: {
              [Op.between]: [dateFrom, dateTo],
            },
          },
        ],
      },
      order: [['id', 'DESC']],
    });
    let j = 0;
    let chargeBackArray = [];
    for (let i = 0; i < transwithChargeBack.length; i++) {
      chargeBackArray.push({
        chargeBackDate: transwithChargeBack[i].ChargeBackDate,
        UUID: transwithChargeBack[i].UUID,
        TransactionId: transwithChargeBack[i].TransactionId,
        CardHolderName: transwithChargeBack[i].Customer.CustomerName,
        Fee: parseFloat(transwithChargeBack[i].ConvenienceFeeValue),
        Amount: parseFloat(transwithChargeBack[i].Amount),
      });
    }
    res.status(200).json({
      message: 'Charge Backs found successfully',
      data: chargeBackArray,
    });
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({
      message: 'Something Went Wrong',
      error: error,
    });
  }
};
exports.getRefundAndChargeBackDetails = async (req, res) => {
  try {
    let token = '';
    let decoded = '';
    if (req.query.mid != undefined) {
      decoded = {};
      decoded.Id = req.query.mid;
    } else {
      token = req.headers.authorization.split(' ');
      decoded = jwt.verify(token[1], process.env.JWT_SECRET);
    }
    paymentType = req.query.paymentType ?? '1';
    if (req.query.dateFrom != undefined) {
      dateFrom = req.query.dateFrom;
    }
    if (req.query.dateTo != undefined) {
      dateTo = req.query.dateTo;
    }
    const ChargeBackFee = await models.User.findOne({
      where: { id: decoded.Id },
    });
    if (req.query.result != undefined) {
      statusValue = req.query.result.split(',');
    } else {
      statusValue = '';
    }

    paymentType = req.query.paymentType ?? '1';

    const combinedTxn = await models.Transaction.findAll({
      // subQuery: false,
      attributes: [
        [
          Sequelize.fn('date', Sequelize.col('Transaction.SettledDate')),
          'ReportDate',
        ],
        [Sequelize.fn('COUNT', Sequelize.col('Transaction.id')), 'Sales'],
        [Sequelize.fn('SUM', Sequelize.col('Amount')), 'GrossTotal'],
        [
          Sequelize.fn('SUM', Sequelize.col('ConvenienceFeeValue')),
          'ConvenienceFee',
        ],
      ],
      group: [[Sequelize.fn('date', Sequelize.col('Transaction.SettledDate'))]],
      where: {
        [Op.and]: [
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
          { Status: { [Op.in]: ['4'] } },
          {
            SettledDate: {
              [Op.between]: [dateFrom, dateTo],
            },
          },
        ],
      },
      order: [
        [
          Sequelize.fn('date', Sequelize.col('Transaction.SettledDate')),
          'DESC',
        ],
      ],
    });

    const combinedchrgBackTxn = await models.Transaction.findAll({
      // subQuery: false,
      attributes: [
        [
          Sequelize.fn('date', Sequelize.col('Transaction.SettledDate')),
          'ReportDate',
        ],
        [Sequelize.fn('COUNT', Sequelize.col('Transaction.id')), 'Sales'],
        [Sequelize.fn('SUM', Sequelize.col('Amount')), 'GrossTotal'],
        [
          Sequelize.fn('SUM', Sequelize.col('ConvenienceFeeValue')),
          'ConvenienceFee',
        ],
      ],
      include: [
        {
          model: models.User,
          as: 'User',
          attributes: ['FullName', 'Email'],
        },
      ],
      group: [[Sequelize.fn('date', Sequelize.col('Transaction.SettledDate'))]],
      where: {
        [Op.and]: [
          {
            MerchantId: {
              [Op.eq]: decoded.Id,
            },
          },
          {
            ChargeBack: {
              [Op.eq]: true,
            },
          },
          {
            Type: {
              [Op.eq]: paymentType,
            },
          },
          {
            SettledDate: {
              [Op.between]: [dateFrom, dateTo],
            },
          },
        ],
      },
      order: [
        [
          Sequelize.fn('date', Sequelize.col('Transaction.SettledDate')),
          'DESC',
        ],
      ],
    });

    const singleRefundData = await models.Transaction.findAll({
      // subQuery: false,
      attributes: [
        'id',
        [
          Sequelize.fn('date', Sequelize.col('Transaction.SettledDate')),
          'ReportDate',
        ],
      ],
      include: [
        {
          model: models.Customer,
          attributes: ['CustomerName', 'Email'],
        },
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
        [Op.and]: [
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
          { Status: { [Op.in]: ['4'] } },
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
        ],
      },
      order: [['id', 'DESC']],
    });

    //for find total refund deduction
    for (let j = 0; j < combinedTxn.length; j++) {
      let totalAmt = 0;
      for (let i = 0; i < singleRefundData.length; i++) {
        if (
          combinedTxn[j].dataValues.ReportDate ==
          singleRefundData[i].dataValues.ReportDate
        ) {
          const tempArray = await models.RefundVoidCaptureTable.findOne({
            where: {
              TransactionId: {
                [Op.eq]: singleRefundData[i].id,
              },
              // [Op.and]: [
              //   // Sequelize.fn('date', singleRefundData[i].dataValues.ReportDate),
              //   Sequelize.where(
              //     Sequelize.fn('date', Sequelize.col('createdAt')),
              //     '=',
              //     singleRefundData[i].dataValues.ReportDate
              //   ),
              // ],
            },
          });
          totalAmt = parseFloat(totalAmt) + parseFloat(tempArray.Amount);
        }
      }
      combinedTxn[j].setDataValue('RefundDeductions', parseFloat(totalAmt));
    }

    //for find total chargeback deduction
    for (let j = 0; j < combinedTxn.length; j++) {
      let totalChargeBack = '';
      for (let i = 0; i < combinedchrgBackTxn.length; i++) {
        if (
          combinedTxn[j].dataValues.ReportDate ==
          combinedchrgBackTxn[i].dataValues.ReportDate
        ) {
          totalChargeBack =
            parseFloat(combinedchrgBackTxn[i].dataValues.Sales) *
            parseFloat(ChargeBackFee.ChargeBacks);
        }
      }
      combinedTxn[j].setDataValue(
        'ChargeBackDeductions',
        parseFloat(totalChargeBack)
      );
    }

    res.status(200).json({
      message: 'Settlement Report found successfully',
      data: combinedTxn,
    });
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({
      message: 'Something Went Wrong',
      error: error,
    });
  }
};

// Update to notification settings, the user will get the update

exports.createOrUpdateNotificationSetting = async (req, res) => {
  const uid = req.params.uid;
  const findUser = await models.User.findOne({
    where: { UUID: uid },
  });
  if (findUser === null) {
    return res.status(404).json({
      message: 'User Not Exist',
    });
  } else {
    const UserProfileSetting = await models.UserProfileSetting.findOne({
      where: { UserId: findUser.id },
    });

    var data = {
      UserId: findUser.id,
      TransactionCompleted: req.body.TransactionCompleted
        ? parseInt(req.body.TransactionCompleted)
        : 0,
      TransactionFailed: req.body.TransactionFailed
        ? parseInt(req.body.TransactionFailed)
        : 0,
      NewCardAdded: req.body.NewCardAdded ? parseInt(req.body.NewCardAdded) : 0,
      VirtualPayCompleted: req.body.VirtualPayCompleted
        ? parseInt(req.body.VirtualPayCompleted)
        : 0,
    };
    if (UserProfileSetting === null) {
      const createUserProfileSetting = await models.UserProfileSetting.create(
        data
      );
      if (createUserProfileSetting != null) {
        return res.status(200).json({
          message: 'Notification Setting Updated Successfully',
          data: createUserProfileSetting,
        });
      } else {
        return res.status(400).json({
          message: 'Notification Setting Not Updated Please try again.',
          data: {},
        });
      }
    } else {
      data.updatedAt = Sequelize.fn('now');
      const updateUserProfileSetting = await models.UserProfileSetting.update(
        data,
        {
          where: {
            id: UserProfileSetting.id,
          },
        }
      );

      if (updateUserProfileSetting != null) {
        return res.status(200).json({
          message: 'Notification Setting Updated Successfully',
          data: updateUserProfileSetting,
        });
      } else {
        return res.status(400).json({
          message: 'Notification Setting Not Updated Please try again.',
          data: {},
        });
      }
    }
  }
};
