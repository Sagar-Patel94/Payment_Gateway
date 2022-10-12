'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    /**
     * Add altering commands here.
     *
     * Example:
     * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
     */
    await queryInterface.addColumn('Users', 'CustomerTip', {
      type: Sequelize.BOOLEAN,
    });
    await queryInterface.addColumn('Transactions', 'TipAmount', {
      type: Sequelize.DECIMAL(15, 2),
    });
  },

  down: async (queryInterface, Sequelize) => {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
    await queryInterface.removeColumn('Users', 'CustomerTip', {
      type: Sequelize.BOOLEAN,
    });
    await queryInterface.removeColumn('Transactions', 'TipAmount', {
      type: Sequelize.DECIMAL(15, 2),
    });
  },
};
