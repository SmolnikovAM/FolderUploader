const Sequelize = require('sequelize');
const sequelize = require('../config/sequelizeDB');
const {
  DIR,
  FILE,
  NEW,
  WORK,
  ERROR,
  END,
  CAN_NOT_COPY,
} = require('../config/constants');

const FilePath = sequelize.define('filePath', {
  id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
  pathFrom: { type: Sequelize.STRING(5000) },
  pathTo: { type: Sequelize.STRING(5000) },
  newPath: { type: Sequelize.STRING(5000) },
  idPath: { type: Sequelize.STRING(5000) },
  type: { type: Sequelize.STRING, isIn: [[FILE, DIR]] }, // 'FILE' 'DIR'
  fileType: { type: Sequelize.STRING },
  parentName: { type: Sequelize.STRING(1000) },
  parentPathFrom: { type: Sequelize.STRING(5000) },
  name: { type: Sequelize.STRING(1000) }, // file or folder name
  size: { type: Sequelize.INTEGER }, // file size
  createDate: { type: Sequelize.STRING }, // from fstat / ms
  status: {
    type: Sequelize.STRING,
    isIn: [[NEW, WORK, ERROR, END, CAN_NOT_COPY]],
  }, // 'NEW' 'WORK' 'ERROR' 'END' 'CAN_NOT_COPY'
  errorMsg: { type: Sequelize.STRING(2048) },
  sessionId: { type: Sequelize.STRING }, // process that currently work with file
  uploadSessionId: { type: Sequelize.STRING }, // process that currently work with file
  offset: { type: Sequelize.INTEGER },
  order: { type: Sequelize.INTEGER },
  hashFs: { type: Sequelize.STRING(1024) },
  hashDBX: { type: Sequelize.STRING(1024) },
});

module.exports = FilePath;
