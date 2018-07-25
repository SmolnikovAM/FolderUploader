const FilePathClass = require('../model/filePathClass');
const { getStat, getListOfPaths } = require('../services/hardDiskService');
const {
  createDBXFolder,
  wrapFileGetMetadata,
} = require('../services/dropboxService');

const { createLogFunctions } = require('../services/logService');
const { END, ERROR } = require('../config/constants');
const {
  insertBulk,
  getNotCreatedFolders,
  changePathStatus,
  getPathToCopy,
  allWorkToNew,
} = require('../services/pathService');
const { State } = require('./state');

async function generateAndInsertFolders({ pathFrom, pathTo }) {
  const listPathsToInsert = await getListOfPaths({ pathFrom, pathTo });
  await insertBulk(listPathsToInsert);
}

async function copyAlgorithm() {
  let item = null;
  await allWorkToNew();
  do {
    await State.newUploadFilesAwait;
    item = await getPathToCopy();
    if (item) {
      const pathToUploadItem = new FilePathClass(item);
      const uploadPromise = pathToUploadItem.promiseEndReturn();
      pathToUploadItem.start();
      State.addPath(uploadPromise);
    }
  } while (item);
  await Promise.all(State.paths.map(({ promise }) => promise));
}

async function checkPaths({ pathFrom, pathTo }) {
  let folderStat;
  let folderDBXStat;
  try {
    folderStat = await getStat(pathFrom);
  } catch (err) {
    return false;
  }
  try {
    folderDBXStat = await wrapFileGetMetadata({ pathTo });
  } catch (err) {
    return false;
  }
  if (folderDBXStat.data['.tag'] !== 'folder') {
    return false;
  }
  if (folderStat === undefined || folderDBXStat === undefined) {
    return false;
  }
  if (!folderStat.isDirectory()) {
    return false;
  }
  return true;
}

async function createNotCreatedFoldersInDropbox() {
  const folderList = await getNotCreatedFolders();

  let id;
  let cnt = 0;
  let cntErrors = 0;
  for (let i = 0; i < folderList.length; i += 1) {
    try {
      const { pathTo } = folderList[i];
      id = folderList[i].id;
      await createDBXFolder({ pathTo });
      await changePathStatus({ id, status: END });
      cnt += 1;
    } catch (err) {
      await changePathStatus({
        id,
        status: ERROR,
        errorMsg: err.message || err.status,
      });
      cntErrors += 1;
    }
  }
  return { ctreated: cnt, createdErrors: cntErrors };
}

module.exports = createLogFunctions({
  checkPaths,
  copyAlgorithm,
  generateAndInsertFolders,
  createNotCreatedFoldersInDropbox,
});
