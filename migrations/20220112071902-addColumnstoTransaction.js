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
      'Transactions',
      'BillingEmail',
      Sequelize.STRING
    );
    await queryInterface.addColumn(
      'Transactions',
      'BillingCustomerName',
      Sequelize.STRING
    );
    await queryInterface.addColumn(
      'Transactions',
      'BillingAddress',
      Sequelize.STRING
    );
    await queryInterface.addColumn(
      'Transactions',
      'BillingCity',
      Sequelize.STRING
    );
    await queryInterface.addColumn(
      'Transactions',
      'BillingState',
      Sequelize.INTEGER
    );
    await queryInterface.addColumn(
      'Transactions',
      'BillingPostalCode',
      Sequelize.STRING
    );
    await queryInterface.addColumn(
      'Transactions',
      'BillingCountry',
      Sequelize.INTEGER
    );
    await queryInterface.addColumn(
      'Transactions',
      'BillingPhoneNumber',
      Sequelize.STRING
    );
    await queryInterface.addColumn(
      'Transactions',
      'IsShippingSame',
      Sequelize.BOOLEAN
    );
    await queryInterface.addColumn(
      'Transactions',
      'ShippingEmail',
      Sequelize.STRING
    );
    await queryInterface.addColumn(
      'Transactions',
      'ShippingCustomerName',
      Sequelize.STRING
    );
    await queryInterface.addColumn(
      'Transactions',
      'ShippingAddress',
      Sequelize.STRING
    );
    await queryInterface.addColumn(
      'Transactions',
      'ShippingCity',
      Sequelize.STRING
    );
    await queryInterface.addColumn(
      'Transactions',
      'ShippingState',
      Sequelize.INTEGER
    );
    await queryInterface.addColumn(
      'Transactions',
      'ShippingPostalCode',
      Sequelize.STRING
    );
    await queryInterface.addColumn(
      'Transactions',
      'ShippingCountry',
      Sequelize.INTEGER
    );
    await queryInterface.addColumn(
      'Transactions',
      'ShippingPhoneNumber',
      Sequelize.STRING
    );
    await queryInterface.addColumn(
      'Transactions',
      'ExpiryDate',
      Sequelize.STRING
    );
    await queryInterface.addColumn('Transactions', 'Cvv', Sequelize.STRING);
    await queryInterface.addConstraint('Transactions', {
      fields: ['BillingState'],
      type: 'foreign key',
      name: 'bstate_fkey_bstateId',
      references: {
        //Required field
        table: 'States',
        field: 'id',
      },
      onDelete: 'no action',
    });
    await queryInterface.addConstraint('Transactions', {
      fields: ['BillingCountry'],
      type: 'foreign key',
      name: 'bcountry_fkey_bcountryId',
      references: {
        //Required field
        table: 'Countries',
        field: 'id',
      },
      onDelete: 'no action',
    });
    await queryInterface.addConstraint('Transactions', {
      fields: ['ShippingState'],
      type: 'foreign key',
      name: 'shstate_fkey_shstateId',
      references: {
        //Required field
        table: 'States',
        field: 'id',
      },
      onDelete: 'no action',
    });
    await queryInterface.addConstraint('Transactions', {
      fields: ['ShippingCountry'],
      type: 'foreign key',
      name: 'shcountry_fkey_shcountryId',
      references: {
        //Required field
        table: 'Countries',
        field: 'id',
      },
      onDelete: 'no action',
    });
  },

  down: async (queryInterface, Sequelize) => {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */

    await queryInterface.removeColumn(
      'Transactions',
      'BillingEmail',
      Sequelize.STRING
    );
    await queryInterface.removeColumn(
      'Transactions',
      'BillingCustomerName',
      Sequelize.STRING
    );
    await queryInterface.removeColumn(
      'Transactions',
      'BillingAddress',
      Sequelize.STRING
    );
    await queryInterface.removeColumn(
      'Transactions',
      'BillingCity',
      Sequelize.STRING
    );
    await queryInterface.removeColumn(
      'Transactions',
      'BillingState',
      Sequelize.INTEGER
    );
    await queryInterface.removeColumn(
      'Transactions',
      'BillingPostalCode',
      Sequelize.STRING
    );
    await queryInterface.removeColumn(
      'Transactions',
      'BillingCountry',
      Sequelize.INTEGER
    );
    await queryInterface.removeColumn(
      'Transactions',
      'BillingPhoneNumber',
      Sequelize.STRING
    );
    await queryInterface.removeColumn(
      'Transactions',
      'IsShippingSame',
      Sequelize.BOOLEAN
    );
    await queryInterface.removeColumn(
      'Transactions',
      'ShippingEmail',
      Sequelize.STRING
    );
    await queryInterface.removeColumn(
      'Transactions',
      'ShippingCustomerName',
      Sequelize.STRING
    );
    await queryInterface.removeColumn(
      'Transactions',
      'ShippingAddress',
      Sequelize.STRING
    );
    await queryInterface.removeColumn(
      'Transactions',
      'ShippingCity',
      Sequelize.STRING
    );
    await queryInterface.removeColumn(
      'Transactions',
      'ShippingState',
      Sequelize.INTEGER
    );
    await queryInterface.removeColumn(
      'Transactions',
      'ShippingPostalCode',
      Sequelize.STRING
    );
    await queryInterface.removeColumn(
      'Transactions',
      'ShippingCountry',
      Sequelize.INTEGER
    );
    await queryInterface.removeColumn(
      'Transactions',
      'ShippingPhoneNumber',
      Sequelize.STRING
    );

    await queryInterface.removeColumn(
      'Transactions',
      'ExpiryDate',
      Sequelize.STRING
    );
    await queryInterface.removeColumn('Transactions', 'Cvv', Sequelize.STRING);
    await queryInterface.removeConstraint('Transactions', {
      fields: ['BillingState'],
      type: 'foreign key',
      name: 'bstate_fkey_bstateId',
      references: {
        //Required field
        table: 'States',
        field: 'id',
      },
      onDelete: 'no action',
    });
    await queryInterface.removeConstraint('Transactions', {
      fields: ['BillingCountry'],
      type: 'foreign key',
      name: 'bcountry_fkey_bcountryId',
      references: {
        //Required field
        table: 'Countries',
        field: 'id',
      },
      onDelete: 'no action',
    });
    await queryInterface.removeConstraint('Transactions', {
      fields: ['ShippingState'],
      type: 'foreign key',
      name: 'shstate_fkey_shstateId',
      references: {
        //Required field
        table: 'States',
        field: 'id',
      },
      onDelete: 'no action',
    });
    await queryInterface.removeConstraint('Transactions', {
      fields: ['ShippingCountry'],
      type: 'foreign key',
      name: 'shcountry_fkey_shcountryId',
      references: {
        //Required field
        table: 'Countries',
        field: 'id',
      },
      onDelete: 'no action',
    });
  },
};
