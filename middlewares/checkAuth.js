const jwt = require('jsonwebtoken');
const models = require('../models');
const { Op } = require('sequelize');
const db = require('../models/index');
const Sentry = require('@sentry/node');

exports.deryptToken = async (req, res, next) => {
  const token = req.headers['authorization'];
  if (req.body.PaymentLinkId == undefined && token != undefined) {
    if (token) {
      try {
        const tk = token.split(' ');
        const decoded = jwt.verify(tk[1], process.env.JWT_SECRET);
        req.currentUser = decoded;
        next();
      } catch (error) {
        Sentry.captureException(error);
        return res.status(401).json({
          message: 'Invalid Token',
        });
      }
    } else {
      Sentry.captureException('Invalid Token');
      return res.status(401).json({
        message: 'Invalid Token',
      });
    }
  } else {
    next();
  }
};
