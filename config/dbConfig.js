// const dotenv = require('dotenv');
// dotenv.config({ path: './config.env' });

// const username = process.env.DBUSER;
// const password = process.env.PASSWORD;
// const database = process.env.DATABASE;
// const host = process.env.HOST;
// const port = process.env.DBPORT;
// const node_env = process.env.NODE_ENV;

// const config = {
//   development: {
//     db: {
//       username,
//       password,
//       database,
//       host,
//       port,
//     },
//   },
//   test: {},
//   production: {},
// };

// module.exports = config[node_env];

require('dotenv').config({ path: './config.env' });
module.exports = {
  development: {
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'mysql',

    // dialectOptions: {
    //   // useUTC: false, //for reading from database
    //   // dateStrings: true,
    //   // typeCast: function (field, next) {
    //   //   // for reading from database
    //   //   if (field.type === 'DATETIME') {
    //   //     return field.string();
    //   //   }
    //   //   return next();
    //   // },
    //   typeCast: function (field, next) {
    //     if (field.type == 'DATETIME' || field.type == 'TIMESTAMP') {
    //       return new Date(field.string() + 'Z');
    //     }
    //     return next();
    //   },
    // },
  },
  test: {},
  production: {
    // username: process.env.DB_USERNAME,
    // password: process.env.DB_PASSWORD,
    // database: process.env.DB_DATABASE,
    // host: process.env.DB_HOST,
    // port: process.env.DB_PORT,
    // dialect: 'mysql',
  },
};
