'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Transactions', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      UUID: {
        type: Sequelize.UUID,
      },
      TransactionId: {
        type: Sequelize.STRING,
      },
      CustomerId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          // Customer hasMany Transactions n:n
          model: 'Customers',
          key: 'id',
        },
      },
      MerchantId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          // User hasMany Transactions n:n
          model: 'Users',
          key: 'id',
        },
      },
      GatewayCustomerId: {
        type: Sequelize.STRING,
      },
      Amount: {
        type: Sequelize.DECIMAL(15, 2),
      },
      CardNumber: {
        type: Sequelize.STRING,
      },
      PaymentMethod: {
        type: Sequelize.STRING,
      },
      Type: {
        type: Sequelize.STRING,
      },
      Status: {
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
    await queryInterface.dropTable('Transactions');
  },
};
