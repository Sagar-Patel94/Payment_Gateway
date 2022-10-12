'use strict';

module.exports = {
  async up (queryInterface, Sequelize) {
  await queryInterface.addColumn('MerchantPaymentGateWays', 'AuthTransactionKey', {
    allowNull: true,
    type: Sequelize.STRING(25)
  });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('MerchantPaymentGateWays', 'AuthTransactionKey', {
      allowNull: true,
      type: Sequelize.STRING(25)
    });
  }
};
