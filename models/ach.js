'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Ach extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      this.belongsTo(models.Customer, {
        foreignKey: 'CustomerId',
      });
    }
  }
  Ach.init(
    {
      UUID: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4 },
      CustomerId: DataTypes.INTEGER,
      RoutingNumber: DataTypes.STRING,
      AccountNumber: DataTypes.STRING,
      SecCode: DataTypes.STRING,
      AccountType: DataTypes.STRING,
    },
    {
      sequelize,
      modelName: 'Ach',
    }
  );
  return Ach;
};
