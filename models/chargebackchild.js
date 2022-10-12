'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class ChargeBackChild extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      this.belongsTo(models.ChargeBackMaster, {
        foreignKey: 'ChargeBackMasterId',
      });
    }
  }
  ChargeBackChild.init(
    {
      UUID: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4 },
      ChargeBackMasterId: DataTypes.INTEGER,
      TransactionId: DataTypes.STRING,
      MerchantName: DataTypes.STRING,
      ChargeBackDate: DataTypes.DATE,
      Status: DataTypes.BOOLEAN,
    },
    {
      sequelize,
      modelName: 'ChargeBackChild',
    }
  );
  return ChargeBackChild;
};
