'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class PaymentLink extends Model {
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
  PaymentLink.init(
    {
      UUID: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4 },
      Amount: DataTypes.DECIMAL(15, 2),
      UserId: DataTypes.INTEGER,
      CustomerId: DataTypes.INTEGER,
      PaymentType: DataTypes.STRING,
      ReferenceNo: DataTypes.STRING,
      Description: DataTypes.STRING,
      TransactionId: DataTypes.STRING,
      WebHookUrl: DataTypes.STRING,
      Message: DataTypes.STRING,
      ConvenienceFeeActive: DataTypes.BOOLEAN,
      CreatedBy: DataTypes.STRING,
    },
    {
      sequelize,
      modelName: 'PaymentLink',
    }
  );
  return PaymentLink;
};
