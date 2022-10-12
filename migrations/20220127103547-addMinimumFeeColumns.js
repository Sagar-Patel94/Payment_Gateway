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
      'ConvenienceFeeType',
      Sequelize.STRING
    );
    await queryInterface.addColumn(
      'Users',
      'ConvenienceFeeMinimum',
      Sequelize.STRING
    );
    await queryInterface.renameColumn(
      'Users',
      'ConveinenceFeePercentage',
      'ConvenienceFeeValue'
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
      'ConvenienceFeeType',
      Sequelize.STRING
    );
    await queryInterface.removeColumn(
      'Users',
      'ConvenienceFeeMinimum',
      Sequelize.STRING
    );
    await queryInterface.renameColumn(
      'Users',
      'ConvenienceFeeValue',
      'ConveinenceFeePercentage'
    );
  },
};
