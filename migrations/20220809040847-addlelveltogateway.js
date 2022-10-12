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
      'MerchantPaymentGateWays',
      'ProcessorLevel',
      Sequelize.STRING(100)
    );
    await queryInterface.addColumn(
      'MerchantPaymentGateWays',
      'Note',
      Sequelize.STRING(100)
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
      'MerchantPaymentGateWays',
      'ProcessorLevel',
      Sequelize.STRING(100)
    );
    await queryInterface.removeColumn(
      'MerchantPaymentGateWays',
      'Note',
      Sequelize.STRING(100)
    );
  },
};
