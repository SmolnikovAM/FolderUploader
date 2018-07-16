const Sequelize = require('sequelize');
const path = require('path');

const dbPath = path.resolve(__dirname, '../db/dbx_bd.sqlite');
const sequelize = new Sequelize('dbx_bd', '', '', {
  dialect: 'sqlite',
  storage: dbPath,
  logging: false,
});

module.exports = sequelize;
