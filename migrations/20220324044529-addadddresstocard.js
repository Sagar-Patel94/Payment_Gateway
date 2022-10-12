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
      'BillingEmail',
      Sequelize.STRING
    );
    await queryInterface.addColumn(
      'CardTokens',
      'BillingCustomerName',
      Sequelize.STRING
    );
    await queryInterface.addColumn(
      'CardTokens',
      'BillingAddress',
      Sequelize.STRING
    );
    await queryInterface.addColumn(
      'CardTokens',
      'BillingCity',
      Sequelize.STRING
    );
    await queryInterface.addColumn(
      'CardTokens',
      'BillingState',
      Sequelize.STRING
    );
    await queryInterface.addColumn(
      'CardTokens',
      'BillingPostalCode',
      Sequelize.STRING
    );
    await queryInterface.addColumn(
      'CardTokens',
      'BillingCountry',
      Sequelize.STRING
    );
    await queryInterface.addColumn(
      'CardTokens',
      'BillingPhoneNumber',
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
      'BillingEmail',
      Sequelize.STRING
    );
    await queryInterface.removeColumn(
      'CardTokens',
      'BillingCustomerName',
      Sequelize.STRING
    );
    await queryInterface.removeColumn(
      'CardTokens',
      'BillingAddress',
      Sequelize.STRING
    );
    await queryInterface.removeColumn(
      'CardTokens',
      'BillingCity',
      Sequelize.STRING
    );
    await queryInterface.removeColumn(
      'CardTokens',
      'BillingState',
      Sequelize.STRING
    );
    await queryInterface.removeColumn(
      'CardTokens',
      'BillingPostalCode',
      Sequelize.STRING
    );
    await queryInterface.removeColumn(
      'CardTokens',
      'BillingCountry',
      Sequelize.STRING
    );
    await queryInterface.removeColumn(
      'CardTokens',
      'BillingPhoneNumber',
      Sequelize.STRING
    );
  },
};
