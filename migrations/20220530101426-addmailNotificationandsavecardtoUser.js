'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    /**
     * Add altering commands here.
     *
     * Example:
     * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
     */
    await queryInterface.addColumn(
      'Users',
      'NotificationEmail',
      Sequelize.STRING
    );
    await queryInterface.addColumn(
      'Users',
      'DisplaySaveCard',
      Sequelize.BOOLEAN
    );
  },

  down: async (queryInterface, Sequelize) => {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
    await queryInterface.removeColumn(
      'Users',
      'NotificationEmail',
      Sequelize.STRING
    );
    await queryInterface.removeColumn(
      'Users',
      'DisplaySaveCard',
      Sequelize.BOOLEAN
    );
  },
};
