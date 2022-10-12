'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('CardTokens', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      UUID: {
        type: Sequelize.UUID,
      },
      Tokenid: {
        type: Sequelize.STRING,
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
      GatewayCuetomerId: {
        type: Sequelize.STRING,
      },
      Status: {
        type: Sequelize.STRING,
      },
      GatewayType: {
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
    await queryInterface.dropTable('CardTokens');
  },
};
