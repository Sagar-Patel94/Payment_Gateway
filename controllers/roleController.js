const models = require('../models');
const { Op } = require('sequelize');
const Sentry = require('@sentry/node');
//User Route handlers

exports.getAllRoles = async (req, res) => {
  await models.Role.findAll({
    where: {
      [Op.and]: [{ IsDeleted: false }, { IsActive: true }],
    },
  }).then((role) => {
    res.status(200).json({
      message: 'Role found successfully',
      data: role,
    });
  });
};

exports.getRoleById = async (req, res) => {
  await models.Role.findOne({ where: { UUID: req.params.id } }).then((role) => {
    if (role === null) {
      res.status(401).json({
        message: 'Role Not Exist',
      });
    } else {
      res.status(200).json({
        message: 'Role found successfully',
        data: role,
      });
    }
  });
};
exports.createRoles = async (req, res) => {
  const role = {
    RoleName: req.body.RoleName,
    IsActive: req.body.IsActive,
    IsDeleted: req.body.IsDeleted,
  };
  await models.Role.create(role)
    .then((result) => {
      res.status(201).json({
        message: 'Role created Successfully',
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
};

exports.updateRole = async (req, res) => {
  await models.Role.update(
    {
      RoleName: req.body.RoleName,
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
        message: 'Role Updated Successfully',
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

exports.deleteRole = async (req, res) => {
  await models.Role.update(
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
        message: 'Role Deleted Successfully',
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
