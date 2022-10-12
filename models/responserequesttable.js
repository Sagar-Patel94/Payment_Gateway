'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class ResponseRequestTable extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  ResponseRequestTable.init(
    {
      GatewayType: DataTypes.STRING(300),
      Request: DataTypes.JSON,
      Response: DataTypes.JSON,
      MerchantId: DataTypes.INTEGER,
      CustomerId: DataTypes.INTEGER,
    },
    {
      sequelize,
      modelName: 'ResponseRequestTable',
    }
  );
  return ResponseRequestTable;
};
