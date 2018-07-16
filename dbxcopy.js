const { closeLogFile } = require('./services/logService');
const path = require('path');
const { State } = require('./state/state');
const {
  checkPaths,
  createDBXFoldersFromList,
  copyAlgorithm,
} = require('./services/apiService');
const { getListOfPaths } = require('./services/hardDiskService');
const { insertBulk, getNotCreatedFolders } = require('./services/pathService');
const { startModel } = require('./model/indexModel');

const {
  ADD_COMMAND,
  ADD_MODE_START,
  ADD_MODE_PATH_LIST,
  CREATE_FOLDERS_MODE,
  COPY_MODE,
  END_MODE,
} = require('./config/constants');
const { BadCommandCLIError } = require('./utils/errors.js');
function getCLIStatus(arg) {
  const trimArg = arg.map(a => a.trim());
  const [p1, p2, p3] = trimArg;
  const isUndf = p => p === undefined;
  switch (true) {
    case isUndf(p1) && isUndf(p2) && isUndf(p3):
      return { status: CREATE_FOLDERS_MODE };
    case p1.toUpperCase() === ADD_COMMAND && !isUndf(p2) && !isUndf(p3):
      return {
        status: ADD_MODE_START,
        pathFrom: p2,
        pathTo: p3,
      };
    default:
      throw new BadCommandCLIError('bad CLI comamnd');
  }
}

async function main() {
  const [, , /*program, path*/ ...arg] = process.argv;
  const { status, ...restOptions } = getCLIStatus(arg);
  let newStatus;
  State.setStatus(status);
  await startModel();
  while (State.status !== END_MODE) {
    switch (State.status) {
      case ADD_MODE_START:
        const goodPaths = await checkPaths(restOptions);
        newStatus = goodPaths ? ADD_MODE_PATH_LIST : END_MODE;
        State.setStatus(newStatus);
        break;
      case ADD_MODE_PATH_LIST:
        const listPathsToInsert = await getListOfPaths(restOptions);
        if (!listPathsToInsert) {
          State.setStatus(END_MODE);
          break;
        }
        await insertBulk(listPathsToInsert);
        State.setStatus(CREATE_FOLDERS_MODE);
        break;
      case CREATE_FOLDERS_MODE:
        const foldersList = await getNotCreatedFolders();
        await createDBXFoldersFromList(foldersList);
        State.setStatus(COPY_MODE);
        break;
      case COPY_MODE:
        console.time('copy');
        await copyAlgorithm();
        console.timeEnd('copy');
        State.setStatus(END_MODE);
        break;
      default:
        State.setStatus(END_MODE);
        break;
    }
  }
}

main().catch(err => {
  throw err;
});
