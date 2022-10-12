'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    /**
     * Add altering commands here.
     *
     * Example:
     * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
     */
    await queryInterface.addColumn('Users', 'City', {
      type: Sequelize.STRING(150),
    });
    await queryInterface.addColumn('Users', 'State', {
      type: Sequelize.STRING(150),
    });
    await queryInterface.addColumn('Users', 'Country', {
      type: Sequelize.STRING(150),
    });
    await queryInterface.addColumn('Users', 'PostalCode', {
      type: Sequelize.STRING(20),
    });
  },

  down: async (queryInterface, Sequelize) => {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
    await queryInterface.removeColumn('Users', 'City', {
      type: Sequelize.STRING(150),
    });
    await queryInterface.removeColumn('Users', 'State', {
      type: Sequelize.STRING(150),
    });
    await queryInterface.removeColumn('Users', 'Country', {
      type: Sequelize.STRING(150),
    });
    await queryInterface.removeColumn('Users', 'PostalCode', {
      type: Sequelize.STRING(20),
    });
  },
};
