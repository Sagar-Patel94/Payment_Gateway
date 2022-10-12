'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class transaction extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      this.belongsTo(models.User, {
        foreignKey: 'MerchantId',
      });
      this.belongsTo(models.Customer, {
        foreignKey: 'CustomerId',
      });
      this.belongsTo(models.States, { foreignKey: 'BillingState' });
      this.belongsTo(models.Country, {
        foreignKey: 'BillingCountry',
      });
      this.belongsTo(models.States, { foreignKey: 'ShippingState' });
      this.belongsTo(models.Country, {
        foreignKey: 'ShippingCountry',
      });
      this.hasMany(models.RefundVoidCaptureTable, {
        foreignKey: 'TransactionId',
      });
    }
  }
  transaction.init(
    {
      UUID: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4 },
      TransactionId: DataTypes.STRING,
      CustomerId: DataTypes.INTEGER,
      MerchantId: DataTypes.INTEGER,
      GatewayCustomerId: DataTypes.STRING,
      Amount: DataTypes.DECIMAL(15, 2),
      CardNumber: DataTypes.STRING,
      PaymentMethod: DataTypes.STRING,
      Type: DataTypes.STRING,
      Status: DataTypes.STRING,
      BillingEmail: DataTypes.STRING,
      BillingCustomerName: DataTypes.STRING,
      BillingAddress: DataTypes.STRING,
      BillingCity: DataTypes.STRING,
      BillingState: DataTypes.INTEGER,
      BillingPostalCode: DataTypes.STRING,
      BillingCountry: DataTypes.INTEGER,
      BillingPhoneNumber: DataTypes.STRING,
      IsShippingSame: DataTypes.BOOLEAN,
      ShippingEmail: DataTypes.STRING,
      ShippingCustomerName: DataTypes.STRING,
      ShippingAddress: DataTypes.STRING,
      ShippingCity: DataTypes.STRING,
      ShippingState: DataTypes.INTEGER,
      ShippingPostalCode: DataTypes.STRING,
      ShippingCountry: DataTypes.INTEGER,
      ShippingPhoneNumber: DataTypes.STRING,
      ExpiryDate: DataTypes.STRING,
      Cvv: DataTypes.STRING,
      ConvenienceFeeValue: DataTypes.DECIMAL(15, 2),
      ConvenienceFeeType: DataTypes.STRING,
      ConvenienceFeeMinimum: DataTypes.STRING,
      AuthCode: DataTypes.STRING,
      TransactionGateWay: DataTypes.STRING,
      Refund: DataTypes.BOOLEAN,
      Void: DataTypes.BOOLEAN,
      Capture: DataTypes.BOOLEAN,
      Tokenization: DataTypes.BOOLEAN,
      Message: DataTypes.STRING,
      Description: DataTypes.STRING,
      ReferenceNo: DataTypes.STRING,
      ConvenienceFeeActive: DataTypes.BOOLEAN,
      RequestOrigin: DataTypes.STRING,
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
      ProcessorId: DataTypes.STRING,
      CapturedDate: DataTypes.DATE,
      SettledDate: DataTypes.DATE,
      NonQualified: DataTypes.BOOLEAN,
      ChargeBack: DataTypes.BOOLEAN,
      ChargeBackDate: DataTypes.DATE,
      BillingCountryCode: DataTypes.STRING(25),
      RoutingNumber: DataTypes.STRING,
      AccountNumber: DataTypes.STRING,
      SecCode: DataTypes.STRING,
      AccountType: DataTypes.STRING,
      Company: DataTypes.STRING,
      isBusinessUserForACH: DataTypes.BOOLEAN,
      SuggestedMode: DataTypes.STRING,
      TipAmount: DataTypes.DECIMAL(15, 2),
    },
    {
      sequelize,
      modelName: 'Transaction',
      timestamps: false,
    }
  );
  return transaction;
};
