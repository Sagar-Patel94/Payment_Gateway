'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Cards', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      UUID: {
        type: Sequelize.UUID,
      },
      CardHolderName: {
        type: Sequelize.STRING,
      },
      CustomerId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          // Customer hasMany Cards n:n
          model: 'Customers',
          key: 'id',
        },
      },
      CardNumber: {
        type: Sequelize.STRING,
      },
      Cvv: {
        type: Sequelize.STRING,
      },
      ExpiryDate: {
        type: Sequelize.STRING,
      },
      Brand: {
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
    await queryInterface.dropTable('Cards');
  },
};
