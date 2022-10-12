'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class card extends Model {
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
  card.init(
    {
      UUID: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4 },
      CardHolderName: DataTypes.STRING,
      CustomerId: DataTypes.INTEGER,
      CardNumber: DataTypes.STRING,
      Cvv: DataTypes.STRING,
      ExpiryDate: DataTypes.STRING,
      Brand: DataTypes.STRING,
    },
    {
      sequelize,
      modelName: 'Card',
    }
  );
  return card;
};
