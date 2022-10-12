'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Country extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      this.hasMany(models.Customer);
      this.hasMany(models.Transaction, { foreignKey: 'BillingCountry' });
      this.hasMany(models.Transaction, { foreignKey: 'ShippingCountry' });
      this.hasMany(models.States, { foreignKey: 'CountryId' });
    }
  }
  Country.init(
    {
      Name: DataTypes.STRING,
      Abbrevation: DataTypes.STRING,
    },
    {
      sequelize,
      modelName: 'Country',
    }
  );
  return Country;
};
