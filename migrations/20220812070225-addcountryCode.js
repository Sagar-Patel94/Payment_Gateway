'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    /**
     * Add altering commands here.
     *
     * Example:BillingCountry
     * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
     */
    await queryInterface.addColumn('Customers', 'CountryCode', {
      allowNull: true,
      type: Sequelize.STRING(25),
      after: 'CountryId',
    });
    await queryInterface.addColumn('Transactions', 'BillingCountryCode', {
      allowNull: true,
      type: Sequelize.STRING(25),
      after: 'BillingCountry',
    });
    await queryInterface.addColumn('CardTokens', 'BillingCountryCode', {
      allowNull: true,
      type: Sequelize.STRING(25),
      after: 'BillingCountry',
    });
  },

  down: async (queryInterface, Sequelize) => {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
    await queryInterface.removeColumn('Customers', 'CountryCode', {
      allowNull: true,
      type: Sequelize.STRING(25),
      after: 'CountryId',
    });
    await queryInterface.removeColumn('Transactions', 'BillingCountryCode', {
      allowNull: true,
      type: Sequelize.STRING(25),
      after: 'BillingCountry',
    });
    await queryInterface.removeColumn('CardTokens', 'BillingCountryCode', {
      allowNull: true,
      type: Sequelize.STRING(25),
      after: 'BillingCountry',
    });
  },
};
