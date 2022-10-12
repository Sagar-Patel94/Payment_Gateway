'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Customers', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      UUID: {
        type: Sequelize.UUID,
      },
      CustomerName: {
        type: Sequelize.STRING,
      },
      Address: {
        type: Sequelize.STRING,
      },
      City: {
        type: Sequelize.STRING,
      },
      PostalCode: {
        type: Sequelize.STRING,
      },
      StateId: {
        type: Sequelize.INTEGER,
      },
      CountryId: {
        type: Sequelize.INTEGER,
      },
      PhoneNumber: {
        type: Sequelize.STRING,
      },
      Email: {
        type: Sequelize.STRING,
      },
      UserId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id',
        },
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
    await queryInterface.dropTable('Customers');
  },
};
