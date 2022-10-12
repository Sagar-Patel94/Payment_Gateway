'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('ChargeBackChildren', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      UUID: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4 },
      ChargeBackMasterId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'ChargeBackMasters',
          key: 'id',
        },
      },
      TransactionId: {
        type: Sequelize.STRING,
      },
      MerchantName: {
        type: Sequelize.STRING,
      },
      ChargeBackDate: {
        type: Sequelize.DATE,
      },
      Status: {
        type: Sequelize.BOOLEAN,
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
    await queryInterface.dropTable('ChargeBackChildren');
  },
};
