'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    /**
     * Add altering commands here.
     *
     * Example:
     * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
     */
    await queryInterface.addColumn('States', 'CountryId', {
      type: Sequelize.INTEGER,
      references: {
        model: 'Countries',
        key: 'id',
      },
      onDelete: 'RESTRICT',
    });

    await queryInterface.changeColumn('Transactions', 'ConvenienceFeeValue', {
      type: Sequelize.DECIMAL(15, 2),
      defaultValue: null,
    });
  },

  down: async (queryInterface, Sequelize) => {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
    await queryInterface.removeColumn('States', 'CountryId', {
      type: Sequelize.INTEGER,
      references: {
        model: 'Countries',
        key: 'id',
      },
      onDelete: 'RESTRICT',
    });

    await queryInterface.changeColumn('Transactions', 'ConvenienceFeeValue', {
      type: Sequelize.STRING,
      defaultValue: null,
    });
  },
};
