'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    /**
     * Add altering commands here.
     *
     * Example:
     * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
     */
    await queryInterface.addColumn('Users', 'AuthorizationFee', {
      type: Sequelize.DECIMAL(15, 2),
      after: 'ChargeBacks',
    });
    await queryInterface.addColumn('Users', 'RefundFee', {
      type: Sequelize.DECIMAL(15, 2),
      after: 'AuthorizationFee',
    });
    await queryInterface.addColumn('Users', 'MiscFee1', {
      type: Sequelize.DECIMAL(15, 2),
      after: 'RefundFee',
    });
    await queryInterface.addColumn('Users', 'MiscFee2', {
      type: Sequelize.DECIMAL(15, 2),
      after: 'MiscFee1',
    });
  },

  down: async (queryInterface, Sequelize) => {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
    await queryInterface.removeColumn('Users', 'AuthorizationFee', {
      type: Sequelize.DECIMAL(15, 2),
      after: 'ChargeBacks',
    });
    await queryInterface.removeColumn('Users', 'RefundFee', {
      type: Sequelize.DECIMAL(15, 2),
      after: 'AuthorizationFee',
    });
    await queryInterface.removeColumn('Users', 'MiscFee1', {
      type: Sequelize.DECIMAL(15, 2),
      after: 'RefundFee',
    });
    await queryInterface.removeColumn('Users', 'MiscFee2', {
      type: Sequelize.DECIMAL(15, 2),
      after: 'MiscFee1',
    });
  },
};
