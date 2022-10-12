'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    /**
     * Add altering commands here.
     *
     * Example:
     * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
     */
    await queryInterface.removeColumn(
      'Users',
      'GatewayApiKey',
      Sequelize.STRING
    );
    await queryInterface.removeColumn('Users', 'GatwayType', Sequelize.STRING);
    await queryInterface.removeColumn(
      'Users',
      'ConvenienceFeeValue',
      Sequelize.STRING
    );
    await queryInterface.removeColumn('Users', 'GMerchantId', Sequelize.STRING);
    await queryInterface.removeColumn(
      'Users',
      'ConvenienceFeeType',
      Sequelize.STRING
    );
    await queryInterface.removeColumn(
      'Users',
      'ConvenienceFeeMinimum',
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
    await queryInterface.addColumn('Users', 'GatewayApiKey', Sequelize.STRING);
    await queryInterface.addColumn('Users', 'GatwayType', Sequelize.STRING);
    await queryInterface.addColumn(
      'Users',
      'ConvenienceFeeValue',
      Sequelize.STRING
    );
    await queryInterface.addColumn('Users', 'GMerchantId', Sequelize.STRING);
    await queryInterface.addColumn(
      'Users',
      'ConvenienceFeeType',
      Sequelize.STRING
    );
    await queryInterface.addColumn(
      'Users',
      'ConvenienceFeeMinimum',
      Sequelize.STRING
    );
  },
};
