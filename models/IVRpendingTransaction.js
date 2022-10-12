'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
    class IVRpendingTransaction extends Model {
        static associate(models) {
            // define association here
        }
    }

    IVRpendingTransaction.init(
        {
            UUID: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4 },
            MerchantId: DataTypes.UUID,
            UserId: DataTypes.INTEGER,
            ActualAcctStandingDesc: DataTypes.STRING,
            CollateralStockNumber: DataTypes.STRING,
            FirstName: DataTypes.STRING,
            LastName: DataTypes.STRING,
            SSNLast4Digit: DataTypes.INTEGER,
            Address1: DataTypes.STRING,
            Address2: DataTypes.STRING,
            City: DataTypes.STRING,
            State: DataTypes.STRING,
            PostalCode: DataTypes.STRING,
            HomePhoneNumber1: DataTypes.STRING,
            HomePhoneNumber2: DataTypes.STRING,
            WorkPhoneNumber: DataTypes.STRING,
            CellPhoneNumber1: DataTypes.STRING,
            Email: DataTypes.STRING,
            CollateralDescription: DataTypes.STRING,
            CollateralVIN: DataTypes.STRING,
            AcctCurrentTotalBalance: DataTypes.DECIMAL(15, 2),
            ActualDaysPastDue: DataTypes.INTEGER,
            CurrentDueDate: DataTypes.DATE,
            CurrentDueAmount: DataTypes.DECIMAL(15, 2),
            AcctLastPaidDate: DataTypes.DATE,
            AcctLastPaidAmount: DataTypes.DECIMAL(15, 2),
            NextDueDate: DataTypes.DATE,
            NextDueAmount: DataTypes.DECIMAL(15, 2),
            LastPromiseDueDate: DataTypes.DATE,
            LastPromiseStatusDesc: DataTypes.STRING,
            Status: DataTypes.INTEGER,
            createdAt: DataTypes.DATE,
            updatedAt: DataTypes.DATE
        },
        {
            sequelize,
            modelName: 'IVRpendingTransaction',
            timestamps: false,
        }
    );

    return IVRpendingTransaction;
};