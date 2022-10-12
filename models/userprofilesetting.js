'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class UserProfileSetting extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      this.belongsTo(models.User, {
        foreignKey: 'UserId'
      })
    }
  }
  UserProfileSetting.init({
    UUID: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4 },
    UserId: DataTypes.INTEGER,
    TransactionCompleted: DataTypes.INTEGER,
    TransactionFailed: DataTypes.INTEGER,
    NewCardAdded: DataTypes.INTEGER,
    VirtualPayCompleted: DataTypes.INTEGER,
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE
  }, {
    sequelize,
    modelName: 'UserProfileSetting',
  });
  return UserProfileSetting;
};