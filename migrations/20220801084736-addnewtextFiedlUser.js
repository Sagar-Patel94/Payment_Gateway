'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    /**
     * Add altering commands here.
     *
     * Example:
     * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
     */
    await queryInterface.addColumn('Users', 'Miscellaneous1', {
      type: Sequelize.STRING(200),
      defaultValue: 'Miscellaneous',
    });
    await queryInterface.addColumn('Users', 'Miscellaneous2', {
      type: Sequelize.STRING(200),
      defaultValue: 'Miscellaneous',
    });
  },

  down: async (queryInterface, Sequelize) => {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
    await queryInterface.removeColumn('Users', 'Miscellaneous1', {
      type: Sequelize.STRING(200),
      defaultValue: 'Miscellaneous1',
    });
    await queryInterface.removeColumn('Users', 'Miscellaneous2', {
      type: Sequelize.STRING(200),
      defaultValue: 'Miscellaneous2',
    });
  },
};
