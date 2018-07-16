const { getStat } = require('./hardDiskService');
const {
  fileGetMetadata,
  createDBXFolder,
  uploadToDBX,
} = require('./dropboxSevice');
const { createLogFunctions } = require('./logService');
const { END, ERROR } = require('../config/constants');
const { changePathStatus, getPathToCopy } = require('./pathService');
const { State } = require('../state/state');

async function copyAlgorithm() {
  let item = null;
  do {
    item = await getPathToCopy();
    if (item) {
      await State.newUploadFilesAwait;
      await State.DBXAwait;
      const uploadPromise = uploadToDBX(item);
      State.addPath(uploadPromise);
      const { id } = item;
      uploadPromise
        .then(response => {
          if (response) {
            const { hexDigest, res } = response;
            changePathStatus({
              id,
              status: hexDigest === res.content_hash ? END : NEW,
              hashFs: hexDigest,
              hashDBX: res.content_hash,
              errorMsg: hexDigest === res.content_hash ? '' : 'hash not equal',
            });
          } else {
            changePathStatus({ id, status: ERROR });
          }
        })
        .catch(err => {
          changePathStatus({
            id,
            status: ERROR,
            errorMsg: JSON.stringify(err),
          });
        });
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
    folderDBXStat = await fileGetMetadata(pathTo);
  } catch (err) {
    return false;
  }

  if (folderDBXStat['.tag'] !== 'folder') {
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

async function createDBXFoldersFromList(folderList) {
  let id;
  let cnt = 0;
  let cntErrors = 0;
  for (let i = 0; i < folderList.length; i += 1) {
    try {
      const { pathTo } = folderList[i];
      id = folderList[i].id;
      await createDBXFolder(pathTo);
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
  createDBXFoldersFromList,
  copyAlgorithm,
});
