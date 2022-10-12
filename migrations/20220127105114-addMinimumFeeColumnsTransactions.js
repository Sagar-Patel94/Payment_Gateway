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
      'Transactions',
      'ConvenienceFeeType',
      Sequelize.STRING
    );
    await queryInterface.addColumn(
      'Transactions',
      'ConvenienceFeeMinimum',
      Sequelize.STRING
    );
    await queryInterface.renameColumn(
      'Transactions',
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
      'Transactions',
      'ConvenienceFeeType',
      Sequelize.STRING
    );
    await queryInterface.removeColumn(
      'Transactions',
      'ConvenienceFeeMinimum',
      Sequelize.STRING
    );
    await queryInterface.renameColumn(
      'Transactions',
      'ConvenienceFeeValue',
      'ConveinenceFeePercentage'
    );
  },
};
