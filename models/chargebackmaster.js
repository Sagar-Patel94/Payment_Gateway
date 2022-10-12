'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class ChargeBackMaster extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      this.hasMany(models.ChargeBackChild, {
        foreignKey: 'ChargeBackMasterId',
      });
    }
  }
  ChargeBackMaster.init(
    {
      UUID: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4 },
      FileName: DataTypes.STRING,
      TotalCount: DataTypes.STRING,
    },
    {
      sequelize,
      modelName: 'ChargeBackMaster',
    }
  );
  return ChargeBackMaster;
};
