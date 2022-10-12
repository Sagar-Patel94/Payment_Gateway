'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('IVRpendingTransactions', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      UUID: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4 },
      UserId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id',
        },
      },
      MerchantId: {
        allowNull: false,
        type: Sequelize.UUID
      },
      ActualAcctStandingDesc: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      CollateralStockNumber: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      FirstName: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      LastName: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      SSNLast4Digit: {
        allowNull: true,
        type: Sequelize.INTEGER,
      },
      Address1: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      Address2: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      City: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      State: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      PostalCode: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      HomePhoneNumber1: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      HomePhoneNumber2: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      WorkPhoneNumber: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      CellPhoneNumber1: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      Email: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      CollateralDescription: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      CollateralVIN: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      AcctCurrentTotalBalance: {
        allowNull: true,
        type: Sequelize.DECIMAL(15, 2),
      },
      ActualDaysPastDue: {
        allowNull: true,
        type: Sequelize.INTEGER,
      },
      CurrentDueDate: {
        allowNull: true,
        type: Sequelize.DATE,
      },
      CurrentDueAmount: {
        allowNull: true,
        type: Sequelize.DECIMAL(15, 2),
      },
      AcctLastPaidDate: {
        allowNull: true,
        type: Sequelize.DATE,
      },
      AcctLastPaidAmount: {
        allowNull: true,
        type: Sequelize.DECIMAL(15, 2),
      },
      NextDueDate: {
        allowNull: true,
        type: Sequelize.DATE,
      },
      NextDueAmount: {
        allowNull: true,
        type: Sequelize.DECIMAL(15, 2),
      },
      LastPromiseDueDate: {
        allowNull: true,
        type: Sequelize.DATE,
      },
      LastPromiseStatusDesc: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      Status: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('now'),
      },
      updatedAt: {
        allowNull: true,
        type: Sequelize.DATE,
      },
    });
  },

  async down(queryInterface, Sequelize) {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
    await queryInterface.dropTable('IVRpendingTransactions');
  },
};
