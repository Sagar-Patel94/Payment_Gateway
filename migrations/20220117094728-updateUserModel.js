'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    /**
     * Add altering commands here.
     *
     * Example:
     * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
     */
    await queryInterface.addColumn('Users', 'GatwayType', Sequelize.STRING);
    await queryInterface.addColumn(
      'Users',
      'ConveinenceFeePercentage',
      Sequelize.STRING
    );
  },

  down: async (queryInterface, Sequelize) => {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
    await queryInterface.removeColumn('Users', 'GatwayType', Sequelize.STRING);
    await queryInterface.removeColumn(
      'Users',
      'ConveinenceFeePercentage',
      Sequelize.STRING
    );
  },
};
