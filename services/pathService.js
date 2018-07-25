const Sequelize = require('sequelize');
const sequelize = require('../config/sequelizeDB');
const FilePath = require('../model/filePathModel');
const { createLogFunctions, log } = require('./logService');
const uuid = require('uuid/v4');
const { FILE, DIR, NEW, WORK, ERROR, END } = require('../config/constants');

const Op = Sequelize.Op;

async function insertBulk(items) {
  return FilePath.bulkCreate(items);
}

async function getNotCreatedFolders() {
  const sessionId = uuid();
  await FilePath.update(
    {
      sessionId,
      status: WORK,
    },
    {
      where: {
        type: DIR,
        [Op.or]: [{ status: WORK }, { status: NEW }],
      },
    },
  );

  const folders = await FilePath.findAll({
    where: {
      type: DIR,
      status: WORK,
      sessionId,
    },
    order: ['order'],
  });
  return folders;
}

async function changePathStatus(options) {
  const { id, ...set } = options;

  return FilePath.update(set, {
    where: {
      id,
    },
  });
}

async function haveFilesToCopy() {
  return FilePath.count({
    where: {
      status: 'NEW',
      type: 'FILE',
    },
  });
}

async function getPathToCopy() {
  const sessionId = uuid();
  let repeatWhile = true;
  let item = null;

  do {
    try {
      await sequelize.transaction(transaction =>
        sequelize.query(
          `update filePaths 
       set sessionId = ?,
           status = 'WORK'
     WHERE id in (select fp.id as id 
                    from filePaths as fp 
                   where fp.status = 'NEW'
                     and fp.type= 'FILE'
                   limit 1)`,
          {
            replacements: [sessionId],
            type: sequelize.QueryTypes.UPDATE,
          },
          { transaction },
        ),
      );
    } catch (err) {
      log(err.messange);
      return null;
    }

    item = await FilePath.findOne({
      where: {
        sessionId,
      },
    });

    if (item) {
      repeatWhile = false;
    } else {
      const cnt = await haveFilesToCopy();
      if (cnt === 0) {
        repeatWhile = false;
      }
    }
  } while (repeatWhile);

  return item;
}

function allWorkToNew() {
  return FilePath.update(
    { status: NEW },
    {
      where: {
        status: WORK,
      },
    },
  );
}

module.exports = createLogFunctions({
  insertBulk,
  getNotCreatedFolders,
  changePathStatus,
  getPathToCopy,
  allWorkToNew,
});
