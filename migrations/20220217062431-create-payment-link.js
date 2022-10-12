'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('PaymentLinks', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      UUID: {
        type: Sequelize.UUID,
      },
      Amount: {
        type: Sequelize.DECIMAL(15, 2),
      },
      UserId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          // MerchantPaymentGateWays hasMany Merchants n:n
          model: 'Users',
          key: 'id',
        },
      },
      CustomerId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          // MerchantPaymentGateWays hasMany Merchants n:n
          model: 'Customers',
          key: 'id',
        },
      },
      TransactionId: {
        type: Sequelize.STRING,
      },
      PaymentType: {
        type: Sequelize.STRING,
      },
      ReferenceNo: {
        type: Sequelize.STRING,
      },
      Description: {
        type: Sequelize.STRING,
      },
      WebHookUrl: {
        type: Sequelize.STRING,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('PaymentLinks');
  },
};
