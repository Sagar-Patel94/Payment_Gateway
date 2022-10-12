const models = require('../models');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const crypto = require('crypto');
const sendEmail = require('../utils/sendEmail');
const Sentry = require('@sentry/node');

exports.login = async (req, res) => {
  // console.log(JSON.stringify(req.headers));
  console.log(req.headers['authorization']);
  const email = req.body.Email;
  await models.User.findOne({
    where: {
      [Op.and]: [{ IsDeleted: false }, { IsActive: true }, { Email: email }],
    },
  })
    .then((user) => {
      if (user === null) {
        res.status(404).json({
          message: 'User is not Active!',
        });
      } else {
        models.Role.findOne({ where: { id: user.RoleId } }).then((role) => {
          if (role === null) {
            res.status(404).json({
              message: 'Invalid Credentials!',
            });
          } else {
            bcryptjs.compare(
              req.body.Password,
              user.Password,
              function (err, result) {
                if (result) {
                  const token = jwt.sign(
                    {
                      FullName: user.FullName,
                      Email: user.Email,
                      UUID: user.UUID,
                      Id: user.id,
                      Role: role.RoleName,
                      RoleId: role.id,
                    },
                    process.env.JWT_SECRET,
                    {
                      expiresIn: 86400, // 24 hours
                    }
                  );
                  return res.status(200).json({
                    message: 'AUTHENTICATION_SUCCESSFUL',
                    token: token,
                  });
                } else {
                  res.status(404).json({
                    message: 'Invalid Credentials!',
                  });
                }
              }
            );
          }
        });
      }
    })
    .catch((err) => {
      Sentry.captureException(err);
      console.log(err);
      res.status(500).json({
        message: 'Something went wrong',
      });
    });
};

exports.resetPassword = async (req, res) => {
  const user = await models.User.findOne({
    where: {
      Email: req.body.Email,
    },
  });
  try {
    if (user) {
      console.log('1');

      let token = await models.ResetTokens.findOne({
        where: { userId: user.UUID },
      });

      if (token) {
        models.ResetTokens.destroy({ where: { userId: user.UUID } });
      }

      let resetToken = crypto.randomBytes(32).toString('hex');
      const hash = await bcryptjs.hash(resetToken, Number(10));
      console.log('1');
      await models.ResetTokens.create({
        userId: user.UUID,
        token: hash,
        createdAt: Date.now(),
      });
      console.log('2');

      const link = `http://localhost:8001/api/v1/auth/resetPasswordController?token=${resetToken}&id=${user.UUID}`;

      await sendEmail(
        user.Email,
        'Password Reset Request',
        { name: user.FullName, link: link },
        './template.hbs'
      );

      return res.json('Activation  Sent to mail Succesfully');
    } else {
      console.log('dasd');
      return res.json({ Message: 'Mail Not Exist' });
    }
  } catch (error) {
    Sentry.captureException(error);
    return error;
  }
};
exports.resetPasswordController = async (req, res, next) => {
  const userId = req.query.id;
  const token = req.query.token;
  const password = req.body.Password;

  let passwordResetToken = await models.ResetTokens.findOne({
    where: { userId: userId },
  });
  if (passwordResetToken) {
    const isValid = await bcryptjs.compare(token, passwordResetToken.token);
    console.log(isValid);
  }
  const hash = await bcryptjs.hash(password, Number(10));
  console.log(hash);
  await models.User.update({ Password: hash }, { where: { UUID: userId } })
    .then(async (result) => {
      console.log(result);
      await models.ResetTokens.destroy({ where: { userId: userId } });
      return res.status(200).json({
        Message: 'Password Changed Successfully',
      });
    })
    .catch((err) => {
      Sentry.captureException(err);
      return res.status(200).json({
        Message: err,
      });
    });
};

exports.keyLogin = async (req, res) => {
  // console.log(JSON.stringify(req.headers));
  const adminToken = req.headers['authorization'];
  const merchantId = req.body.MerchantId;
  if (adminToken != undefined) {
    await models.User.findOne({
      where: {
        [Op.and]: [
          { IsDeleted: false },
          { IsActive: true },
          { UUID: merchantId },
        ],
      },
    })
      .then((user) => {
        if (user === null) {
          res.status(404).json({
            message: 'User is not Active!',
          });
        } else {
          models.Role.findOne({ where: { id: user.RoleId } }).then((role) => {
            if (role === null) {
              res.status(404).json({
                message: 'Invalid Credentials!',
              });
            } else {
              const token = jwt.sign(
                {
                  FullName: user.FullName,
                  Email: user.Email,
                  UUID: user.UUID,
                  Id: user.id,
                  Role: role.RoleName,
                  RoleId: role.id,
                },
                process.env.JWT_SECRET,
                {
                  expiresIn: 86400, // 24 hours
                }
              );
              return res.status(200).json({
                message: 'AUTHENTICATION_SUCCESSFUL',
                token: token,
              });
            }
          });
        }
      })
      .catch((err) => {
        Sentry.captureException(err);
        console.log(err);
        res.status(500).json({
          message: 'Something went wrong',
        });
      });
  } else {
    res.status(400).json({
      message: 'Token is invalid',
    });
  }
};
