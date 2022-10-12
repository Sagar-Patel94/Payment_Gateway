'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class RefundVoidCaptureTable extends Model {
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
      this.belongsTo(models.Transaction, {
        foreignKey: 'TransactionId',
      });
    }
  }
  RefundVoidCaptureTable.init(
    {
      UUID: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4 },
      Amount: DataTypes.DECIMAL(15, 2),
      UserId: DataTypes.INTEGER,
      TransactionId: DataTypes.INTEGER,
      NewTransactionId: DataTypes.STRING,
      PaymentType: DataTypes.STRING,
      Status: DataTypes.STRING,
      GatewayType: DataTypes.STRING,
      PrevTransactionId: DataTypes.STRING,
    },
    {
      sequelize,
      modelName: 'RefundVoidCaptureTable',
    }
  );
  return RefundVoidCaptureTable;
};
