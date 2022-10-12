'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    /**
     * Add altering commands here.
     *
     * Example:
     * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
     */
    await queryInterface.addColumn('ServiceApiKeyTables', 'UserId', {
      type: Sequelize.INTEGER,
      references: {
        model: 'Users',
        key: 'id',
      },
      onDelete: 'RESTRICT',
    });
    await queryInterface.removeColumn(
      'ServiceApiKeyTables',
      'ServiceProvider',
      Sequelize.STRING
    );
    await queryInterface.removeColumn(
      'Transactions',
      'CountryId',
      Sequelize.INTEGER
    );
    await queryInterface.removeColumn(
      'Transactions',
      'StateId',
      Sequelize.INTEGER
    );
    await queryInterface.removeColumn(
      'Transactions',
      'UserId',
      Sequelize.INTEGER
    );
  },

  down: async (queryInterface, Sequelize) => {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
    await queryInterface.removeColumn('ServiceApiKeyTables', 'UserId', {
      type: Sequelize.INTEGER,
      references: {
        model: 'Users',
        key: 'id',
      },
      onDelete: 'RESTRICT',
    });
    await queryInterface.addColumn(
      'ServiceApiKeyTables',
      'ServiceProvider',
      Sequelize.STRING
    );
    await queryInterface.addColumn(
      'Transactions',
      'CountryId',
      Sequelize.INTEGER
    );
    await queryInterface.addColumn(
      'Transactions',
      'StateId',
      Sequelize.INTEGER
    );
    await queryInterface.addColumn('Transactions', 'UserId', Sequelize.INTEGER);
  },
};
