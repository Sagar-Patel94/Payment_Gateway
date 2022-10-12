'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('RefundVoidCaptureTables', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
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
      OriginTransactionId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Transactions',
          key: 'id',
        },
      },
      NewTransactionId: {
        type: Sequelize.STRING,
      },
      PaymentType: {
        type: Sequelize.STRING,
      },
      Status: {
        type: Sequelize.STRING,
      },
      GatewayType: {
        type: Sequelize.STRING,
      },
      PrevTransactionId: {
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
    await queryInterface.dropTable('RefundVoidCaptureTables');
  },
};
