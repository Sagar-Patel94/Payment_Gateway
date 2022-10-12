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
      'CardTokens',
      'LastNumber',
      Sequelize.STRING
    );
    await queryInterface.addColumn('CardTokens', 'CardBrand', Sequelize.STRING);
    await queryInterface.addColumn(
      'CardTokens',
      'FirstNumber',
      Sequelize.STRING
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
      'CardTokens',
      'LastNumber',
      Sequelize.STRING
    );
    await queryInterface.removeColumn(
      'CardTokens',
      'CardBrand',
      Sequelize.STRING
    );
    await queryInterface.removeColumn(
      'CardTokens',
      'FirstNumber',
      Sequelize.STRING
    );
  },
};
