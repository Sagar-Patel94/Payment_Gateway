'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      this.belongsTo(models.Role, {
        foreignKey: 'RoleId',
      });
      this.hasMany(models.Customer);
      this.hasMany(models.ServiceApiKeyTable, { foreignKey: 'UserId' });
      this.hasMany(models.Transaction, { foreignKey: 'MerchantId' });
      this.hasMany(models.MerchantPaymentGateWay);
      this.hasMany(models.PaymentLink);
      this.hasMany(models.RefundVoidCaptureTable);
      this.hasMany(models.CardTokens, { foreignKey: 'UserId' });
      this.hasMany(models.UserProfileSetting, { foreignKey: 'UserId' });
    }
  }
  User.init(
    {
      UUID: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4 },
      FullName: DataTypes.STRING,
      Email: { type: DataTypes.STRING, allowNull: false },
      Password: DataTypes.STRING,
      CompanyName: DataTypes.STRING,
      PhoneNumber: DataTypes.STRING,
      IsActive: DataTypes.BOOLEAN,
      IsDeleted: DataTypes.BOOLEAN,
      LogoPath: DataTypes.STRING,
      PrivacyPolicyURL: DataTypes.STRING,
      ReturnPolicyURL: DataTypes.STRING,
      CancellationPolicyURL: DataTypes.STRING,
      ShippingPolicyURL: DataTypes.STRING,
      NotificationEmail: DataTypes.STRING,
      DisplaySaveCard: DataTypes.BOOLEAN,
      TransactionFee: DataTypes.DECIMAL(15, 2),
      TextFee: DataTypes.DECIMAL(15, 2),
      GatewayFee: DataTypes.DECIMAL(15, 2),
      NonQualified: DataTypes.DECIMAL(15, 2),
      WaivedConvenience: DataTypes.DECIMAL(15, 2),
      ChargeBacks: DataTypes.DECIMAL(15, 2),
      AuthorizationFee: DataTypes.DECIMAL(15, 2),
      RefundFee: DataTypes.DECIMAL(15, 2),
      MiscFee1: DataTypes.DECIMAL(15, 2),
      MiscFee2: DataTypes.DECIMAL(15, 2),
      GatewayId: DataTypes.INTEGER,
      RoleId: DataTypes.INTEGER,
      Address: DataTypes.STRING(300),
      City: DataTypes.STRING(150),
      State: DataTypes.STRING(150),
      Country: DataTypes.STRING(150),
      PostalCode: DataTypes.STRING(20),
      Miscellaneous1: DataTypes.STRING(200),
      Miscellaneous2: DataTypes.STRING(200),
      UserLevel: DataTypes.STRING(100),
      CustomerTip: DataTypes.BOOLEAN,
    },
    {
      sequelize,
      modelName: 'User',
    }
  );
  return User;
};
