'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class States extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      this.hasMany(models.Customer);
      this.hasMany(models.Transaction, { foreignKey: 'BillingState' });
      this.hasMany(models.Transaction, { foreignKey: 'ShippingState' });
      this.belongsTo(models.Country, {
        foreignKey: 'CountryId',
      });
    }
  }
  States.init(
    {
      StateName: DataTypes.STRING,
      Abbrevation: DataTypes.STRING,
      CountryId: DataTypes.INTEGER,
    },
    {
      sequelize,
      modelName: 'States',
    }
  );
  return States;
};
