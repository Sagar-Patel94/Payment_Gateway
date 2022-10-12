'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    /**
     * Add altering commands here.
     *
     * Example:
     * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
     */

    await queryInterface.addColumn('Transactions', 'Message', Sequelize.STRING);
    await queryInterface.addColumn(
      'MerchantPaymentGateWays',
      'ConvenienceFeeActive',
      Sequelize.BOOLEAN
    );
    await queryInterface.addColumn(
      'PaymentLinks',
      'ConvenienceFeeActive',
      Sequelize.BOOLEAN
    );
    await queryInterface.addColumn('PaymentLinks', 'Message', Sequelize.STRING);
    await queryInterface.addColumn(
      'Transactions',
      'Description',
      Sequelize.STRING
    );
    await queryInterface.addColumn(
      'Transactions',
      'ReferenceNo',
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
      'Transactions',
      'Message',
      Sequelize.STRING
    );
    await queryInterface.removeColumn(
      'MerchantPaymentGateWays',
      'ConvenienceFeeActive',
      Sequelize.BOOLEAN
    );
    await queryInterface.removeColumn(
      'PaymentLinks',
      'ConvenienceFeeActive',
      Sequelize.BOOLEAN
    );
    await queryInterface.removeColumn(
      'PaymentLinks',
      'Message',
      Sequelize.STRING
    );
    await queryInterface.removeColumn(
      'Transactions',
      'Description',
      Sequelize.STRING
    );
    await queryInterface.removeColumn(
      'Transactions',
      'ReferenceNo',
      Sequelize.STRING
    );
  },
};
