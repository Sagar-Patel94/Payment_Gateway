'use strict';

module.exports = {
  async up (queryInterface, Sequelize) {
     await queryInterface.removeColumn('Transactions','CheckNumber',Sequelize.STRING);
     await queryInterface.removeColumn('Aches','CheckNumber',Sequelize.STRING);
     await queryInterface.removeColumn('AchTokens','CheckNumber',Sequelize.STRING);
     await queryInterface.addColumn('Transactions','isBusinessUserForACH',Sequelize.BOOLEAN);
     await queryInterface.addColumn('Transactions','SuggestedMode',Sequelize.STRING);
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.addColumn('Transactions', 'CheckNumber', Sequelize.STRING);
    await queryInterface.addColumn('Aches', 'CheckNumber', Sequelize.STRING);
    await queryInterface.addColumn('AchTokens', 'CheckNumber', Sequelize.STRING);
     await queryInterface.removeColumn('Transactions','isBusinessUserForACH',Sequelize.BOOLEAN);
     await queryInterface.removeColumn('Transactions','SuggestedMode',Sequelize.STRING);
  }
};
