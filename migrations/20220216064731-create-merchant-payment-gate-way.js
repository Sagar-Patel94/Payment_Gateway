'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('MerchantPaymentGateWays', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
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
      UUID: {
        type: Sequelize.UUID,
      },
      GatewayApiKey: {
        type: Sequelize.STRING,
      },
      GatewayType: {
        type: Sequelize.STRING,
      },
      ConvenienceFeeValue: {
        type: Sequelize.STRING,
      },
      ConvenienceFeeType: {
        type: Sequelize.STRING,
      },
      ConvenienceFeeMinimum: {
        type: Sequelize.STRING,
      },
      GMerchantId: {
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
    await queryInterface.dropTable('MerchantPaymentGateWays');
  },
};
