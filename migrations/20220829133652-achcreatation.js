'use strict';

module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('Aches', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      UUID: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4 },
      CustomerId: Sequelize.INTEGER,
      RoutingNumber: Sequelize.STRING,
      AccountNumber: Sequelize.STRING,
      SecCode: Sequelize.STRING,
      AccountType: Sequelize.STRING,
      CheckNumber: Sequelize.STRING,
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });

    await queryInterface.createTable('AchTokens', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
        UUID: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4 },
        Tokenid: Sequelize.STRING,
        UserId: Sequelize.INTEGER,
        CustomerId: Sequelize.INTEGER,
        GatewayCustomerId: Sequelize.STRING,
        Status: Sequelize.STRING,
        GatewayType: Sequelize.STRING,
        RoutingNumber: Sequelize.STRING,
        AccountNumber: Sequelize.STRING,
        SecCode: Sequelize.STRING,
        AccountType: Sequelize.STRING,
        CheckNumber: Sequelize.STRING,
        Company:Sequelize.STRING,
        BillingEmail: Sequelize.STRING,
        BillingCustomerName: Sequelize.STRING,
        BillingAddress: Sequelize.STRING,
        BillingCity: Sequelize.STRING,
        BillingState: Sequelize.STRING,
        BillingPostalCode: Sequelize.STRING,
        BillingCountry: Sequelize.STRING,
        BillingPhoneNumber: Sequelize.STRING,
        PaymentId: Sequelize.STRING,
        BillingCountryCode: Sequelize.STRING(25),
        createdAt: {
          allowNull: true,
          type: Sequelize.DATE,
        },
        updatedAt: {
          allowNull: false,
          type: Sequelize.DATE,
        },
    });

    await queryInterface.addColumn('Transactions', 'RoutingNumber', {
      allowNull: true,
      type: Sequelize.STRING(25)
    });
    await queryInterface.addColumn('Transactions', 'AccountNumber', {
      allowNull: true,
      type: Sequelize.STRING(25)
    });
    await queryInterface.addColumn('Transactions', 'SecCode', {
      allowNull: true,
      type: Sequelize.STRING(25)
    });
    await queryInterface.addColumn('Transactions', 'Company', {
      allowNull: true,
      type: Sequelize.STRING(25)
    });
    await queryInterface.addColumn('Transactions', 'CheckNumber', {
      allowNull: true,
      type: Sequelize.STRING(25)
    });
    await queryInterface.addColumn('Transactions', 'AccountType', {
      allowNull: true,
      type: Sequelize.STRING(25)
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('Aches');
    await queryInterface.dropTable('Achtokens');
    await queryInterface.removeColumn('Transactions', 'RoutingNumber', {
      allowNull: true,
      type: Sequelize.STRING(25)
    });
    await queryInterface.removeColumn('Transactions', 'AccountNumber', {
      allowNull: true,
      type: Sequelize.STRING(25)
    });
    await queryInterface.removeColumn('Transactions', 'SecCode', {
      allowNull: true,
      type: Sequelize.STRING(25)
    });
    await queryInterface.removeColumn('Transactions', 'Company', {
      allowNull: true,
      type: Sequelize.STRING(25)
    });
    await queryInterface.removeColumn('Transactions', 'CheckNumber', {
      allowNull: true,
      type: Sequelize.STRING(25)
    });
    await queryInterface.removeColumn('Transactions', 'AccountType', {
      allowNull: true,
      type: Sequelize.STRING(25)
    });
  }
};
