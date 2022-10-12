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
      'Users',
      'PrivacyPolicyURL',
      Sequelize.STRING
    );
    await queryInterface.addColumn(
      'Users',
      'ReturnPolicyURL',
      Sequelize.STRING
    );
    await queryInterface.addColumn(
      'Users',
      'CancellationPolicyURL',
      Sequelize.STRING
    );
    await queryInterface.addColumn(
      'Users',
      'ShippingPolicyURL',
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
      'Users',
      'PrivacyPolicyURL',
      Sequelize.STRING
    );
    await queryInterface.removeColumn(
      'Users',
      'ReturnPolicyURL',
      Sequelize.STRING
    );
    await queryInterface.removeColumn(
      'Users',
      'CancellationPolicyURL',
      Sequelize.STRING
    );
    await queryInterface.removeColumn(
      'Users',
      'ShippingPolicyURL',
      Sequelize.STRING
    );
  },
};
