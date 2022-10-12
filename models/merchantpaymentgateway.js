'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class MerchantPaymentGateWay extends Model {
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
    }
  }
  MerchantPaymentGateWay.init(
    {
      UserId: DataTypes.INTEGER,
      UUID: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4 },
      GatewayApiKey: DataTypes.STRING,
      GatewayType: DataTypes.STRING,
      ConvenienceFeeValue: DataTypes.STRING,
      ConvenienceFeeType: DataTypes.STRING,
      ConvenienceFeeMinimum: DataTypes.STRING,
      GMerchantId: DataTypes.STRING,
      SuggestedMode: DataTypes.STRING,
      ConvenienceFeeActive: DataTypes.BOOLEAN,
      GatewayStatus: DataTypes.BOOLEAN,
      ProcessorId: DataTypes.STRING,
      ProcessorLevel: DataTypes.STRING(100),
      Note: DataTypes.STRING(100),
      ProcessorLabel: DataTypes.STRING,
      AuthTransactionKey: DataTypes.STRING
    },
    {
      sequelize,
      modelName: 'MerchantPaymentGateWay',
    }
  );
  return MerchantPaymentGateWay;
};
