'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    /**
     * Add altering commands here.
     *
     * Example:
     * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
     */
    await queryInterface.addColumn('Users', 'GatewayId', {
      type: Sequelize.INTEGER,
    });
    await queryInterface.addColumn('Users', 'Address', Sequelize.STRING(300));
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
      'Address',
      Sequelize.STRING(300)
    );
    await queryInterface.removeColumn('Users', 'GatewayId', {
      type: Sequelize.INTEGER,
    });
  },
};
