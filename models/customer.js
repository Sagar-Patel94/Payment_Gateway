'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class customer extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      this.hasMany(models.Card);
      this.belongsTo(models.User, {
        foreignKey: 'UserId',
      });
      this.hasMany(models.Transaction, { foreignKey: 'CustomerId' });
      this.belongsTo(models.States, { foreignKey: 'StateId' });
      this.belongsTo(models.Country, {
        foreignKey: 'CountryId',
      });
      this.hasMany(models.PaymentLink, {
        foreignKey: 'CustomerId',
      });
      this.hasMany(models.CardTokens, { foreignKey: 'CustomerId' });
    }
  }
  customer.init(
    {
      UUID: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4 },
      CustomerName: DataTypes.STRING,
      Address: DataTypes.STRING,
      City: DataTypes.STRING,
      PostalCode: DataTypes.STRING,
      StateId: DataTypes.INTEGER,
      CountryId: DataTypes.INTEGER,
      PhoneNumber: DataTypes.STRING,
      Email: DataTypes.STRING,
      UserId: DataTypes.INTEGER,
      GatewayCustomerId: DataTypes.STRING,
      CountryCode: DataTypes.STRING(25),
    },
    {
      sequelize,
      modelName: 'Customer',
    }
  );
  return customer;
};
