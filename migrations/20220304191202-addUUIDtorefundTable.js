'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    /**
     * Add altering commands here.
     *
     * Example:
     * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
     */
    await queryInterface.addColumn('RefundVoidCaptureTables', 'UUID', {
      type: Sequelize.UUID,
      after: 'id',
    });
  },

  down: async (queryInterface, Sequelize) => {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
    await queryInterface.removeColumn('RefundVoidCaptureTables', 'UUID', {
      type: Sequelize.UUID,
      after: 'id',
    });
  },
};
