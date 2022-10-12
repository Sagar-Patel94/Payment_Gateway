'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class CardTokens extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      this.belongsTo(models.User, {
        foreignKey: 'UserId',
      });
      this.belongsTo(models.Customer, {
        foreignKey: 'CustomerId',
      });
    }
  }
  CardTokens.init(
    {
      UUID: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4 },
      Tokenid: DataTypes.STRING,
      UserId: DataTypes.INTEGER,
      CustomerId: DataTypes.INTEGER,
      GatewayCustomerId: DataTypes.STRING,
      Status: DataTypes.STRING,
      GatewayType: DataTypes.STRING,
      LastNumber: DataTypes.STRING,
      CardBrand: DataTypes.STRING,
      FirstNumber: DataTypes.STRING,
      Expiration: DataTypes.STRING,
      BillingEmail: DataTypes.STRING,
      BillingCustomerName: DataTypes.STRING,
      BillingAddress: DataTypes.STRING,
      BillingCity: DataTypes.STRING,
      BillingState: DataTypes.STRING,
      BillingPostalCode: DataTypes.STRING,
      BillingCountry: DataTypes.STRING,
      BillingPhoneNumber: DataTypes.STRING,
      PaymentId: DataTypes.STRING,
      BillingCountryCode: DataTypes.STRING(25),
    },
    {
      sequelize,
      modelName: 'CardTokens',
    }
  );
  return CardTokens;
};
