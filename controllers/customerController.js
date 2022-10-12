const models = require('../models');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const Sentry = require('@sentry/node');

exports.createCustomer = async (req, res) => {
  const token = req.headers.authorization.split(' ');
  const decoded = jwt.verify(token[1], process.env.JWT_SECRET);
  console.log(decoded);
  const existValue = await models.Customer.findOne({
    where: {
      CountryCode: req.body.CountryCode,
      PhoneNumber: req.body.PhoneNumber,
    },
  });
  if (existValue != null) {
    res.status(400).json({ message: 'Customer Exist Already' });
  } else {
    const customer = {
      CustomerName: req.body.CustomerName,
      Address: req.body.Address,
      City: req.body.City,
      PostalCode: req.body.PostalCode,
      StateId: req.body.StateId,
      CountryId: req.body.CountryId,
      CountryCode: req.body.CountryCode,
      PhoneNumber: req.body.PhoneNumber,
      Email: req.body.Email,
      UserId: decoded.Role == 'Admin' ? req.body.UserId : decoded.Id,
    };
    await models.Customer.create(customer)
      .then((result) => {
        res.status(201).json({
          message: 'Customer created Successfully',
          user: result,
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
};

exports.getAllCustomers = async (req, res) => {
  const limit =
    req.query.perPage == undefined || NaN ? 10 : parseInt(req.query.perPage);
  const offset =
    req.query.page == undefined || NaN ? 0 : parseInt(req.query.page) - 1;
  const skipRecord = Math.ceil(offset * limit);
  const sortOrder = req.query.sort === undefined ? 'asc' : req.query.sort;
  const sortColumn =
    req.query.sortColumn === undefined ? 'CustomerName' : req.query.sortColumn;
  const searchKey = req.query.q === undefined ? '' : req.query.q;
  req.query.status = req.query.status == undefined ? '' : req.query.status;
  req.query.user = req.query.user == undefined ? '' : req.query.user;
  if (req.query.user == '') {
    await models.Customer.findAndCountAll({
      include: [
        {
          model: models.User,
          attributes: ['FullName', 'Email'],
        },
        {
          model: models.States,
          attributes: ['StateName', 'Abbrevation'],
        },
        {
          model: models.Country,
          attributes: ['Name', 'Abbrevation'],
        },
      ],
      where: {
        [Op.and]: [
          {
            CustomerName: {
              [Op.ne]: null,
            },
          },
        ],
        [Op.or]: [
          {
            CustomerName: {
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
        ],
      },
      order: [[sortColumn, sortOrder]],
      limit: limit,
      offset: skipRecord,
    })
      .then((customer) => {
        const totalPages = Math.ceil(customer['count'] / limit);
        res.status(200).json({
          message: 'Customer found successfully',
          data: customer,
          paging: {
            total: customer['count'],
            pages: totalPages,
          },
        });
      })
      .catch((err) => {
        Sentry.captureException(err);
        res.status(500).json({
          message: 'Something went wrong',
          error: err,
        });
      });
  } else if (req.query.user != '') {
    await models.Customer.findAndCountAll({
      include: [
        {
          model: models.User,
          attributes: ['FullName', 'Email'],
        },
        {
          model: models.States,
          attributes: ['StateName', 'Abbrevation'],
        },
        {
          model: models.Country,
          attributes: ['Name', 'Abbrevation'],
        },
      ],
      where: {
        [Op.and]: [
          {
            UserId: {
              [Op.eq]: req.query.user,
            },
          },
          {
            CustomerName: {
              [Op.ne]: null,
            },
          },
        ],
        [Op.or]: [
          {
            CustomerName: {
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
        ],
      },
      order: [[sortColumn, sortOrder]],
      limit: limit,
      offset: skipRecord,
    })
      .then((customer) => {
        const totalPages = Math.ceil(customer['count'] / limit);
        res.status(200).json({
          message: 'Customer found successfully',
          data: customer,
          paging: {
            total: customer['count'],
            pages: totalPages,
          },
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
};

exports.getCustomerById = async (req, res) => {
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
    const userGateways = await models.MerchantPaymentGateWay.findOne({
      where: {
        [Op.and]: [
          { UserId: decoded.Id },
          { SuggestedMode: 'Card' },
          { GatewayStatus: true },
        ],
      },
    });
    await models.Customer.findOne({
      include: {
        model: models.User,
        attributes: ['FullName'],
      },
      where: { [Op.and]: [{ UserId: decoded.Id }, { UUID: req.params.id }] },
    }).then(async (customer) => {
      if (customer === null) {
        res.status(400).json({
          message: 'Customer Not Exist',
        });
      } else {
        await models.CardTokens.findAll({
          where: {
            [Op.and]: [
              { UserId: decoded.Id },
              { CustomerId: customer.id },
              { GatewayType: userGateways.GatewayType },
            ],
          },
        }).then(async (cards) => {
          customer.setDataValue('Cards', cards);
          customer.setDataValue('Gateways', userGateways);
          res.status(200).json({
            message: 'Customer found successfully',
            data: customer,
          });
        });
      }
    });
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).json({
      message: 'Something went wrong',
      error: err,
    });
  }
};

exports.getStateList = async (req, res) => {
  try {
    const countryData = await models.Country.findOne({
      where: {
        Abbrevation: req.params.id,
      },
    });
    const stateData = await models.States.findAll({
      where: {
        CountryId: countryData.id,
      },
    });
    if (stateData !== null && stateData !== undefined) {
      res.status(200).json({
        message: 'States found successfully',
        data: stateData,
      });
    } else {
      Sentry.captureException('State List has not been found');
      res.status(400).json({
        message: 'State List has not been found',
      });
    }
  } catch (err) {
    Sentry.captureException('State List has not been found');
    res.status(400).json({
      message: 'Something went wrong',
    });
  }
};

exports.getCountryList = async (req, res) => {
  await models.Country.findAll({})
    .then((countries) => {
      res.status(200).json({
        message: 'Countries found successfully',
        data: countries,
      });
    })
    .catch((err) => {
      Sentry.captureException(err);
      res.status(500).json({
        message: 'Something went wrong',
        error: err,
      });
    });
};
