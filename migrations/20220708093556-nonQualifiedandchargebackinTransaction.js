'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    /**
     * Add altering commands here.
     *
     * Example:
     * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
     */
    await queryInterface.addColumn('Transactions', 'NonQualified', {
      type: Sequelize.BOOLEAN,
    });
    await queryInterface.addColumn('Transactions', 'ChargeBack', {
      type: Sequelize.BOOLEAN,
    });
  },

  down: async (queryInterface, Sequelize) => {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
    await queryInterface.removeColumn('Transactions', 'NonQualified', {
      type: Sequelize.BOOLEAN,
    });
    await queryInterface.removeColumn('Transactions', 'ChargeBack', {
      type: Sequelize.BOOLEAN,
    });
  },
};
