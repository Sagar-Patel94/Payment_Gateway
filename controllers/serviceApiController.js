const models = require('../models');
const bcryptjs = require('bcryptjs');
const Sentry = require('@sentry/node');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
//User Route handlers
const generateApiKey = require('generate-api-key');
const fs = require('fs'),
  request = require('request');

exports.createApiKey = async (req, res) => {
  // Create an API key with a length between a certain range and with a prefix..
  const apiKey = generateApiKey({
    method: 'string',
    length: 27,
    prefix: 'api-',
    pool: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-~+/',
  });
  const findUser = await models.User.findOne({
    where: {
      UUID: req.body.MerchantId,
    },
  });
  const services = {
    UserId: findUser.id,
    ApiKey: apiKey,
  };

  await models.ServiceApiKeyTable.create(services).then((response) => {
    res.status(200).json({
      message: 'Key generated successfully',
      data: response,
    });
  });
};

exports.getAllServices = async (req, res) => {
  const services = await models.ServiceApiKeyMapping.findAll();
  if (services.length > 0) {
    res.status(200).json({
      message: 'Services found successfully',
      data: services,
    });
  } else {
    res.status(404).json({
      message: 'Service not found',
    });
  }
};

exports.checkApiKey = async (keyValue) => {
  const keyFromDb = await models.ServiceApiKeyTable.findOne({
    where: {
      ApiKey: keyValue,
    },
  });
  if (keyFromDb != null && keyFromDb != undefined) {
    const findUserRole = await models.User.findOne({
      where: {
        id: keyFromDb.UserId,
        IsActive: true,
        IsDeleted: false,
      },
    });
    const checkRole = await models.Role.findOne({
      where: { id: findUserRole.RoleId, IsActive: true, IsDeleted: false },
    });
    if (checkRole.RoleName == 'Merchant') {
      return keyFromDb;
    } else {
      return null;
    }
  } else {
    return keyFromDb;
  }
};
exports.checkAdminKey = async (keyValue) => {
  const keyFromDb = await models.ServiceApiKeyTable.findOne({
    where: {
      ApiKey: keyValue,
    },
  });
  if (keyFromDb != null && keyFromDb != undefined) {
    const findUserRole = await models.User.findOne({
      where: {
        id: keyFromDb.UserId,
        IsActive: true,
        IsDeleted: false,
      },
    });
    const checkRole = await models.Role.findOne({
      where: { id: findUserRole.RoleId, IsActive: true, IsDeleted: false },
    });
    if (checkRole.RoleName == 'Admin') {
      return keyFromDb;
    } else {
      return null;
    }
  } else {
    return keyFromDb;
  }
};

exports.download = (uri, comapanyName, callback) => {
  let imagePath = '';
  request.head(uri, function (err, res, body) {
    var img = res.headers['content-type'].split('/');
    imagePath = `./data/Images/${comapanyName}.${img[1]}`;

    request(uri).pipe(fs.createWriteStream(imagePath)).on('close', callback);
  });
};

//**Create/Update Merchant using API call */
exports.createMerchant = async (req, res) => {
  let checkApiKey = await exports.checkAdminKey(req.headers['authorization']);
  try {
    if (checkApiKey != null) {
      if (req.body.MerchantLogo != undefined) {
        exports.download(
          req.body.MerchantLogo,
          req.body.CompanyName,
          function () {
            console.log('done');
          }
        );
      }

      const Password = '123456';
      if (req.body.Password == undefined) {
        req.body.Password = Password;
      }
      const defaultPwd = req.body.Password ?? Password;
      const saltRound = await bcryptjs.genSalt(10);
      const hashPwd = await bcryptjs.hash(defaultPwd, saltRound);
      const roleId = await models.Role.findOne({
        where: {
          RoleName: 'Merchant',
        },
      });

      const userExist = await models.User.findOne({
        where: {
          Email: req.body.Email,
        },
      });
      if (userExist != null) {
        const modifiedUser = {
          FullName: req.body.FullName,
          Email: req.body.Email,
          PhoneNumber: req.body.PhoneNumber,
          CompanyName: req.body.CompanyName,
          LogoPath: req.body.MerchantLogo,
          PrivacyPolicyURL: req.body.PrivacyPolicyURL,
          ReturnPolicyURL: req.body.ReturnPolicyURL,
          CancellationPolicyURL: req.body.CancellationPolicyURL,
          ShippingPolicyURL: req.body.ShippingPolicyURL,
          NotificationEmail: req.body.NotificationEmail ?? req.body.Email,
          DisplaySaveCard: req.body.DisplaySaveCard,
          Address: req.body.Address,
        };
        const result = await models.User.update(modifiedUser, {
          where: {
            Email: req.body.Email,
          },
        });

        const updatedUserResult = await models.User.findOne({
          where: {
            Email: req.body.Email,
          },
        });
        const data = {
          id: updatedUserResult.UUID,
          createdAt: updatedUserResult.createdAt,
          updatedAt: updatedUserResult.updatedAt,
          IsActive: updatedUserResult.IsActive ? 'Active' : 'InActive',
        };
        res.status(200).json({
          message: 'Merchant Updated Successfully',
          data: data,
        });
      } else {
        const merchant = {
          FullName: req.body.FullName,
          Email: req.body.Email,
          Password: hashPwd,
          PhoneNumber: req.body.PhoneNumber,
          CompanyName: req.body.CompanyName,
          IsActive: true,
          IsDeleted: false,
          RoleId: roleId.id,
          LogoPath: req.body.MerchantLogo,
          PrivacyPolicyURL: req.body.PrivacyPolicyURL,
          ReturnPolicyURL: req.body.ReturnPolicyURL,
          CancellationPolicyURL: req.body.CancellationPolicyURL,
          ShippingPolicyURL: req.body.ShippingPolicyURL,
          NotificationEmail: req.body.NotificationEmail ?? req.body.Email,
          DisplaySaveCard: req.body.DisplaySaveCard,
          CustomerTip: false,
        };
        const createdUser = await models.User.create(merchant);
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
          const createdApiKey = await models.ServiceApiKeyTable.create(
            services
          );
          createdUser.setDataValue('ApiKey', createdApiKey.ApiKey);
          const data = {
            id: createdUser.UUID,
            ApiKey: createdApiKey.ApiKey,
            createdAt: createdUser.createdAt,
            updatedAt: createdUser.updatedAt,
            IsActive: createdUser.IsActive ? 'Active' : 'InActive',
          };
          res.status(200).json({
            message: 'Merchant created Successfully',
            data: data,
          });
        } else {
          res.status(400).json({
            message: 'Something went wrong',
          });
        }
      }
    } else {
      res.status(401).json({ message: 'Unauthorized key', code: '401' });
    }
  } catch (error) {
    Sentry.captureException(error);
    return res.status(500).json({
      message: 'Something went wrong',
      error: error,
    });
  }
};

//**Create/Update Merchant using API call */

//**Add gateway for  Merchant using API call */

exports.getPaidBy = (method) => {
  const methods = {
    FluidPay: 'ACH',
    Payrix: 'Card',
    PaysafeCash: 'Cash',
  };
  return methods[method];
};

//**Add gateway for  Merchant using API call */
exports.addPaymentGateWay = async (req, res) => {
  let checkApiKey = await exports.checkAdminKey(req.headers['authorization']);
  let tempGateWays = [];
  const user = await models.User.findOne({
    where: {
      id: checkApiKey.UserId,
    },
  });
  try {
    if (checkApiKey != null) {
      if (user != null) {
        if (req.body.Gateways && req.body.Gateways.length > 0) {
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
              ConvenienceFeeMinimum: req.body.Gateways[i].ConvenienceFeeMinimum,
              ConvenienceFeeType: req.body.Gateways[i].ConvenienceFeeType,
              ConvenienceFeeActive: req.body.Gateways[i].ConvenienceFeeActive,
              GatewayStatus: req.body.Gateways[i].GatewayStatus,
              SuggestedMode: req.body.Gateways[i].SuggestedMode,
              UserId: user.id,
              AuthTransactionKey: req.body.Gateways[i].AuthTransactionKey,
            };
            let gatewaysAdded = await models.MerchantPaymentGateWay.create(
              addGateway
            );
            let data = {
              id: gatewaysAdded.UUID,
              GatewayType: gatewaysAdded.GatewayType,
              createdAt: gatewaysAdded.createdAt,
              updatedAt: gatewaysAdded.updatedAt,
              MerchantId: req.body.MerchantId,
            };
            tempGateWays.push(data);
          }
          res.status(200).json({
            message: 'Gateway added Successfully',
            data: tempGateWays,
          });
        }
      } else {
        return res.status(400).json({
          message: 'Merchant Not Found.Cannot add gateway',
          error: err,
        });
      }
    } else {
      return res.status(401).json({ message: 'Unauthorized key', code: '401' });
    }
  } catch (err) {
    Sentry.captureException(err);
    return res.status(500).json({
      message: 'Something went wrong',
      error: err,
    });
  }
};

//**Generate Payment Link for  Merchant using API call */
exports.generatePayLink = async (req, res) => {
  let checkApiKey = await exports.checkApiKey(req.headers['authorization']);
  try {
    if (checkApiKey != null) {
      let fees = [];
      let convenienceFeeData = '';
      const user = await models.User.findOne({
        where: {
          id: checkApiKey.UserId,
        },
      });

      const merchantGateway = await models.MerchantPaymentGateWay.findAll({
        where: {
          [Op.and]: [
            {
              UserId: user.id,
            },
            { ConvenienceFeeActive: req.body.ConvenienceFeeActive },
          ],
        },
      });
      for (let i = 0; i < merchantGateway.length; i++) {
        convenienceFeeData = {
          ConvenienceFee: merchantGateway[i].ConvenienceFeeValue,
          gatewayName: merchantGateway[i].GatewayType,
          id: merchantGateway[i].UUID,
        };
        fees.push(convenienceFeeData);
      }

      const checkForCustomer = await models.Customer.findOne({
        where: {
          [Op.and]: [
            { CountryCode: req.body.CountryCode },
            { PhoneNumber: req.body.CustomerNumber },
            { UserId: user.id },
          ],
        },
      });
      if (user != null) {
        if (
          req.body.Amount != undefined &&
          req.body.CustomerNumber != undefined
        ) {
          if (checkForCustomer == null) {
            console.log('hello I am new');
            const customer = {
              CountryCode: req.body.CountryCode,
              PhoneNumber: req.body.CustomerNumber,
              UserId: user.id,
            };
            models.Customer.create(customer).then((customerData) => {
              const paymentLink = {
                Amount: parseFloat(req.body.Amount),
                UserId: user.id,
                CustomerId: customerData.id,
                PaymentType: req.body.Type,
                ReferenceNo: req.body.RefNo,
                Description: req.body.Description,
                WebHookUrl: req.body.WebHookUrl,
                Message: req.body.Message,
                ConvenienceFeeActive: req.body.ConvenienceFeeActive,
                CreatedBy: req.body.CreatedBy,
              };
              models.PaymentLink.create(paymentLink)
                .then((linkData) => {
                  const data = {
                    id: linkData.UUID,
                    CompanyName: user.CompanyName,
                    Amount: parseFloat(req.body.Amount),
                    ConvenienceFee: fees,
                    ReferenceNo: linkData.ReferenceNo,
                    Description: linkData.Description,
                    Message: linkData.Message,
                    ConvenienceFeeActive: linkData.ConvenienceFeeActive,
                    paymentLink:
                      `${process.env.PAYLINK_URL}` + `${linkData.UUID}`,
                    updatedAt: linkData.updatedAt,
                    createdAt: linkData.createdAt,
                  };
                  console.log('Data is :', data);
                  res.status(200).json({
                    message: 'Payment link generated successfully',
                    data: data,
                  });
                })
                .catch((err) => {
                  Sentry.captureException(err);
                  res.status(400).json({
                    message: 'Something went wrong',
                    error: err,
                  });
                });
            });
          } else {
            console.log('hello I am exist');
            const paymentLink = {
              Amount: parseFloat(req.body.Amount),
              UserId: user.id,
              CustomerId: checkForCustomer.id,
              PaymentType: req.body.Type,
              ReferenceNo: req.body.RefNo,
              Description: req.body.Description,
              WebHookUrl: req.body.WebHookUrl,
              Message: req.body.Message,
              ConvenienceFeeActive: req.body.ConvenienceFeeActive,
              CreatedBy: req.body.CreatedBy,
            };
            models.PaymentLink.create(paymentLink)
              .then((linkData) => {
                const data = {
                  id: linkData.UUID,
                  CompanyName: user.CompanyName,
                  Amount: parseFloat(req.body.Amount),
                  ConvenienceFee: fees,
                  ReferenceNo: linkData.ReferenceNo,
                  Description: linkData.Description,
                  paymentLink:
                    `${process.env.PAYLINK_URL}` + `${linkData.UUID}`,
                  updatedAt: linkData.updatedAt,
                  createdAt: linkData.createdAt,
                };
                console.log('Data is :', data);
                res.status(200).json({
                  message: 'Payment link generated successfully',
                  data: data,
                });
              })
              .catch((err) => {
                Sentry.captureException(err);
                res.status(400).json({
                  message: 'Something went wrong',
                  error: err,
                });
              });
          }
        } else {
          res.status(400).json({ message: 'Undefined Parameter' });
        }
      } else {
        res.status(400).json({ message: 'Invalid Merchant' });
      }
    } else {
      res.status(401).json({ message: 'Unauthorized key', code: '401' });
    }
  } catch (error) {
    Sentry.captureException(error);
    return res.status(500).json({
      message: 'Something went wrong',
      error: error,
    });
  }
};
//**Generate Payment Link for  Merchant using API call */

//**Get PaymentGateways by Merchant Id using API call */
exports.getPaymentGatewaysbyMerchant = async (req, res) => {
  let checkApiKey = await exports.checkApiKey(req.headers['authorization']);
  if (checkApiKey != null) {
    console.log(req.params.id);
    await models.User.findOne({
      where: { UUID: req.params.id },
    }).then((user) => {
      if (user === null) {
        console.log(user);
        res.status(400).json({
          message: 'Invalid Merchant',
        });
      } else {
        console.log('Hai', user);
        models.MerchantPaymentGateWay.findAll({
          include: [
            {
              model: models.User,
              attributes: [
                'UUID',
                'FullName',
                'Email',
                'PhoneNumber',
                'LogoPath',
                'CompanyName',
              ],
            },
          ],
          where: { UserId: user.id },
        }).then((result) => {
          let tmpArray = [],
            resultData = '';
          console.log;
          for (let i = 0; i < result.length; i++) {
            resultData = {
              id: result[i].UUID,
              MerchantId: result[i].User.UUID,
              GatewayApiKey: result[i].GatewayApiKey,
              GatewayType: result[i].GatewayType,
              ConvenienceFeeValue: result[i].ConvenienceFeeValue,
              ConvenienceFeeType: result[i].ConvenienceFeeType,
              ConvenienceFeeMinimum: result[i].ConvenienceFeeMinimum,
              ConvenienceFeeActive: result[i].ConvenienceFeeActive,
              GatewayStatus: result[i].GatewayStatus,
              GMerchantId: result[i].GMerchantId,
              createdAt: result[i].createdAt,
              updatedAt: result[i].updatedAt,
              user: result[i].User,
            };
            tmpArray.push(resultData);
          }

          res.status(200).json({
            message: 'Gateways found successfully',
            data: tmpArray,
          });
        });
      }
    });
  } else {
    res.status(401).json({ message: 'Unauthorized key', code: '401' });
  }
};

exports.paymentLinkDetailsById = async (req, res) => {
  await models.PaymentLink.findOne({
    include: [
      {
        model: models.User,
      },
      {
        model: models.Customer,
      },
    ],
    where: { UUID: req.params.id },
  }).then((link) => {
    if (link === null) {
      res.status(400).json({
        message: 'Invalid Link',
      });
    } else {
      models.MerchantPaymentGateWay.findAll({
        where: { [Op.and]: [{ UserId: link.UserId }, { GatewayStatus: true }] },
      }).then((gateway) => {
        console.log(gateway);
        if (gateway === null) {
          res.status(400).json({
            message: 'Invalid Link',
          });
        } else {
          console.log(link.CustomerId);
          models.CardTokens.findAll({
            where: {
              [Op.and]: [
                { CustomerId: link.CustomerId },
                { GatewayType: gateway[0].GatewayType },
              ],
            },
          }).then((card) => {
            // write code for ach from achtokens
            models.AchTokens.findAll({
              where: {
                [Op.and]: [
                  { CustomerId: link.CustomerId },
                  { GatewayType: gateway[0].GatewayType },
                ],
              },
            }).then((ach) => {
              const linkData = {
                data: link,
                gateway: gateway,
                card: card,
                ach: ach,
              };
              res.status(200).json({
                message: 'Data found successfully',
                data: linkData,
              });
            });
          });
        }
      });
    }
  });
};

/* Update Merchant By Id*/
exports.updateMerchant = async (req, res) => {
  let checkApiKey = await exports.checkApiKey(req.headers['authorization']);
  try {
    if (checkApiKey != null) {
      if (req.body.MerchantLogo != undefined) {
        exports.download(
          req.body.MerchantLogo,
          req.body.CompanyName,
          function () {
            console.log('done');
          }
        );
      }
      let createdApiKey = '';
      const findUser = await models.User.findOne({
        where: {
          UUID: req.params.id,
        },
      });
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
      await models.User.update(
        {
          FullName: req.body.FullName,
          Email: req.body.Email,
          PhoneNumber: req.body.PhoneNumber,
          CompanyName: req.body.CompanyName,
          LogoPath: req.body.MerchantLogo,
          PrivacyPolicyURL: req.body.PrivacyPolicyURL,
          ReturnPolicyURL: req.body.ReturnPolicyURL,
          CancellationPolicyURL: req.body.CancellationPolicyURL,
          ShippingPolicyURL: req.body.ShippingPolicyURL,
          NotificationEmail: req.body.NotificationEmail,
          DisplaySaveCard: req.body.DisplaySaveCard,
        },
        {
          where: {
            UUID: req.params.id,
          },
        }
      )
        .then(async (result) => {
          const findUpdatedData = await models.User.findOne({
            where: { UUID: req.params.id },
          });
          const data = {
            id: findUpdatedData.UUID,
            createdAt: findUpdatedData.createdAt,
            updatedAt: findUpdatedData.updatedAt,
            IsActive: findUpdatedData.IsActive ? 'Active' : 'InActive',
            ApiKey: createdApiKey.ApiKey,
          };
          res.status(200).json({
            message: 'Merchant Updated Successfully',
            data: data,
          });
        })
        .catch((err) => {
          Sentry.captureException(err);
          res.status(400).json({
            message: 'User Updation Failed',
            error: err,
          });
        });
    } else {
      res.status(401).json({ message: 'Unauthorized key', code: '401' });
    }
  } catch (error) {
    Sentry.captureException(error);
    res.status(400).json({ message: 'Something went wrong' });
  }
};
//Get Merchant Data by Id
exports.getMerchanthById = async (req, res) => {
  let checkApiKey = await exports.checkApiKey(req.headers['authorization']);
  if (checkApiKey != null) {
    await models.User.findOne({
      where: { id: checkApiKey.UserId },
    }).then((user) => {
      if (user === null) {
        res.status(400).json({
          message: 'User Not Exist',
        });
      } else {
        const userData = {
          id: user.UUID,
          FullName: user.FullName,
          Email: user.Email,
          CompanyName: user.CompanyName,
          PhoneNumber: user.PhoneNumber,
          LogoPath: user.LogoPath,
          PrivacyPolicyURL: user.PrivacyPolicyURL,
          ReturnPolicyURL: user.ReturnPolicyURL,
          CancellationPolicyURL: user.CancellationPolicyURL,
          ShippingPolicyURL: user.ShippingPolicyURL,
          NotificationEmail: user.NotificationEmail,
          DisplaySaveCard: user.DisplaySaveCard,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          ApiKey: checkApiKey.ApiKey,
        };

        res.status(200).json({
          message: 'Merchant Details found successfully',
          data: userData,
        });
      }
    });
  } else {
    res.status(401).json({ message: 'Unauthorized key', code: '401' });
  }
};

//Update Gateway
exports.updateGateway = async (req, res) => {
  const user = await models.User.findOne({ where: { UUID: req.params.id } });
  let tempGateWays = [];
  let checkApiKey = await exports.checkApiKey(req.headers['authorization']);
  try {
    if (checkApiKey != null) {
      if (req.body.Gateways && req.body.Gateways.length > 0) {
        for (let i = 0; i < req.body.Gateways.length; i++) {
          // let getwayValue = exports.getPaidBy(req.body.Gateways[i].GatewayType);
          // if (req.body.Gateways[i].GatewayType == 'FluidPay') {
          //   getwayValue = 'Card';
          // }
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
          };
          let getWayUpdated = await models.MerchantPaymentGateWay.update(
            updateGateway,
            {
              where: {
                [Op.and]: [
                  {
                    UserId: user.id,
                    GatewayType: req.body.Gateways[i].GatewayType,
                  },
                ],
              },
            }
          );
          let findGateWay = await models.MerchantPaymentGateWay.findOne({
            where: {
              [Op.and]: [
                {
                  UserId: user.id,
                  GatewayType: req.body.Gateways[i].GatewayType,
                },
              ],
            },
          });
          tempGateWays.push({
            id: user.UUID,
            GatewayType: findGateWay.GatewayType,
            createdAt: findGateWay.createdAt,
            updatedAt: findGateWay.updatedAt,
          });
        }
        return res.status(200).json({
          message: 'Gateways Updated Successfully',
          data: tempGateWays,
        });
      }
    } else {
      res.status(401).json({ message: 'Unauthorized key', code: '401' });
    }
  } catch (err) {
    Sentry.captureException(err);
    return res.status(500).json({
      message: 'Something went wrong',
      error: err,
    });
  }
};

//Delete Link Generated
exports.deletePayLink = async (req, res) => {
  let checkApiKey = await exports.checkApiKey(req.headers['authorization']);
  if (checkApiKey != null) {
    const link = await models.PaymentLink.findOne({
      where: { UUID: req.params.id },
    });
    if (link != null) {
      await models.PaymentLink.destroy({
        where: { UUID: req.params.id },
      }).then((result) => {
        res.status(200).json({
          message: 'Payment Link cancelled successfully',
        });
      });
    }
  } else {
    res.status(401).json({ message: 'Unauthorized key', code: '401' });
  }
};
