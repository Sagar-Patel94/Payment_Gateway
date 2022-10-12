'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    /**
     * Add altering commands here.
     *
     * Example:
     * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
     */
    await queryInterface.addColumn('Transactions', 'ProcessorId', {
      after: 'updatedAt',
      type: Sequelize.STRING,
    });
    await queryInterface.addColumn('Transactions', 'CapturedDate', {
      allowNull: true,
      type: Sequelize.DATE,
      after: 'ProcessorId',
    });
    await queryInterface.addColumn('Transactions', 'SettledDate', {
      allowNull: true,
      type: Sequelize.DATE,
      after: 'CapturedDate',
    });
  },

  down: async (queryInterface, Sequelize) => {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
    await queryInterface.removeColumn('Transactions', 'ProcessorId', {
      after: 'updatedAt',
      type: Sequelize.STRING,
    });
    await queryInterface.removeColumn('Transactions', 'CapturedDate', {
      allowNull: true,
      type: Sequelize.DATE,
      after: 'ProcessorId',
    });
    await queryInterface.removeColumn('Transactions', 'SettledDate', {
      allowNull: true,
      type: Sequelize.DATE,
      after: 'CapturedDate',
    });
  },
};
