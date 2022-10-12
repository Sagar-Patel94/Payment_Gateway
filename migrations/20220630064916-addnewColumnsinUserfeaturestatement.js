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
      'TransactionFee',
      Sequelize.DECIMAL(15, 2)
    );
    await queryInterface.addColumn(
      'Users',
      'TextFee',
      Sequelize.DECIMAL(15, 2)
    );
    await queryInterface.addColumn(
      'Users',
      'GatewayFee',
      Sequelize.DECIMAL(15, 2)
    );
    await queryInterface.addColumn(
      'Users',
      'NonQualified',
      Sequelize.DECIMAL(15, 2)
    );
    await queryInterface.addColumn(
      'Users',
      'WaivedConvenience',
      Sequelize.DECIMAL(15, 2)
    );
    await queryInterface.addColumn(
      'Users',
      'ChargeBacks',
      Sequelize.DECIMAL(15, 2)
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
      'TransactionFee',
      Sequelize.DECIMAL(15, 2)
    );
    await queryInterface.removeColumn(
      'Users',
      'TextFee',
      Sequelize.DECIMAL(15, 2)
    );
    await queryInterface.removeColumn(
      'Users',
      'GatewayFee',
      Sequelize.DECIMAL(15, 2)
    );
    await queryInterface.removeColumn(
      'Users',
      'NonQualified',
      Sequelize.DECIMAL(15, 2)
    );
    await queryInterface.removeColumn(
      'Users',
      'WaivedConvenience',
      Sequelize.DECIMAL(15, 2)
    );
    await queryInterface.removeColumn(
      'Users',
      'ChargeBacks',
      Sequelize.DECIMAL(15, 2)
    );
  },
};
