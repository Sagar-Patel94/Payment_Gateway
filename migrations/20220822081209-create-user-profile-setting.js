'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('UserProfileSettings', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      UUID: {
        type: Sequelize.UUID,
      },
      UserId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id',
        },
      },
      TransactionCompleted: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      TransactionFailed: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      NewCardAdded: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      VirtualPayCompleted: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('now')
      },
      updatedAt: {
        allowNull: true,
        type: Sequelize.DATE
      }
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('UserProfileSettings');
  }
};