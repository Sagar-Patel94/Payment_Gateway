'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class NonQualifiedChild extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      this.belongsTo(models.NonQualifiedMaster, {
        foreignKey: 'NonQualifiedMasterId',
      });
    }
  }
  NonQualifiedChild.init(
    {
      UUID: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4 },
      NonQualifiedMasterId: DataTypes.INTEGER,
      TransactionId: DataTypes.STRING,
      MerchantName: DataTypes.STRING,
      Status: DataTypes.BOOLEAN,
    },
    {
      sequelize,
      modelName: 'NonQualifiedChild',
    }
  );
  return NonQualifiedChild;
};
