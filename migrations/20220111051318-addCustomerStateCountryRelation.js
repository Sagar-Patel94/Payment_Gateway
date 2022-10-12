'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    /**
     * Add altering commands here.
     *
     * Example:
     * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
     */

    await queryInterface.addConstraint('Customers', {
      fields: ['StateId'],
      type: 'foreign key',
      name: 'state_fkey_stateId',
      references: {
        //Required field
        table: 'States',
        field: 'id',
      },
      onDelete: 'no action',
    });
    await queryInterface.addConstraint('Customers', {
      fields: ['CountryId'],
      type: 'foreign key',
      name: 'country_fkey_countryId',
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
    await queryInterface.removeConstraint('Customers', {
      fields: ['StateId'],
      type: 'foreign key',
      name: 'state_fkey_stateId',
      references: {
        //Required field
        table: 'States',
        field: 'id',
      },
      onDelete: 'no action',
    });
    await queryInterface.removeConstraint('Customers', {
      fields: ['CountryId'],
      type: 'foreign key',
      name: 'country_fkey_countryId',
      references: {
        //Required field
        table: 'Countries',
        field: 'id',
      },
      onDelete: 'no action',
    });
  },
};
