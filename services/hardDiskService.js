const fs = require('fs');
const { promisify } = require('util');
const path = require('path');
const {
  DIR,
  FILE,
  NEW,
  CAN_NOT_COPY,
  WINDOWS_RESERVED_NAMES_ARRAY,
  WINDOWS_RESERVED_SYMBOLS_REEXP,
  DROPBOX_RESERVED_FILE_NAMES,
} = require('../config/constants');
const { createLogFunctions } = require('./logService');

function getStat(...args) {
  return promisify(fs.stat)(...args);
}
function readDirPromise(...args) {
  return promisify(fs.readdir)(...args);
}

async function getListOfPaths({ pathFrom, pathTo }) {
  const list = [];
  let currentFolderFrom = pathFrom;
  let currentFolderTo = pathTo;
  let parent = { status: NEW, name: pathFrom };
  let order = 0;
  do {
    const listtmp = (await readDirPromise(currentFolderFrom)).map(name => ({
      name,
      pathFrom: path.resolve(path.join(currentFolderFrom, name)),
      pathTo: `${currentFolderTo}/${name}`,
      processed: false,
      order: order++,
    }));

    listtmp.forEach(x => {
      let done;
      x.infoDone = new Promise(res => (done = res));
      getStat(x.pathFrom).then(res => {
        x.type = res.isDirectory() ? DIR : FILE;
        if (x.type === FILE) {
          const idx = x.name.lastIndexOf('.');
          x.fileType =
            idx >= 0 ? x.name.slice(idx, x.name.length).toUpperCase() : null;
        } else {
          x.fileType = null;
        }
        x.size = res.size;
        if (parent.status === NEW) {
          const { status, reason } = checkValidNames(x);
          x.status = status;
          x.errorMsg = reason;
        } else {
          x.status = parent.status;
          x.errorMsg = 'bad parent';
        }

        x.sessionId = null;
        x.createDate = res.ctimeMs;
        x.parentName = parent.name;
        x.parentPathFrom = parent.pathFrom;
        // x.info = res;
        done();
      });
    });

    await Promise.all(listtmp.map(x => x.infoDone));

    list.push(...listtmp.map(({ infoDone, ...rest }) => rest));
    const item = list.find(x => x.type === DIR && !x.processed);
    if (item) {
      item.processed = true;
      currentFolderFrom = item.pathFrom;
      currentFolderTo = item.pathTo;
      parent = item;
    } else {
      currentFolderFrom = undefined;
    }
  } while (currentFolderFrom !== undefined);
  const result = list.map(({ processed, ...rest }) => rest);
  return result;
}

function checkValidNames({ name }) {
  const idx = name.lastIndexOf('.');
  const nameWithoutExtension = idx === -1 ? name : name.slice(0, idx);

  if (name.indexOf('/') >= 0 || name.indexOf('\\') >= 0) {
    return { status: CAN_NOT_COPY, reason: 'no slash' };
  }

  if (name.match(WINDOWS_RESERVED_SYMBOLS_REEXP)) {
    return {
      status: CAN_NOT_COPY,
      reason: `Windows forbidden symbols: ${name}`,
    };
  }

  if (WINDOWS_RESERVED_NAMES_ARRAY.indexOf(name.toUpperCase()) >= 0) {
    return { status: CAN_NOT_COPY, reason: 'Windows reserved name' };
  }

  if (
    WINDOWS_RESERVED_NAMES_ARRAY.indexOf(nameWithoutExtension.toUpperCase()) >=
    0
  ) {
    return { status: CAN_NOT_COPY, reason: 'Windows reserved name' };
  }

  if (DROPBOX_RESERVED_FILE_NAMES.indexOf(name.toUpperCase()) >= 0) {
    return { status: CAN_NOT_COPY, reason: 'Dropbox reserved name' };
  }

  if (name && name.length && (name[0] === '$' || name[0] === '~')) {
    return { status: CAN_NOT_COPY, reason: 'temporary files' };
  }

  if (name && name.length && name[name.length - 1] === '.') {
    return { status: CAN_NOT_COPY, reason: 'dot endings' };
  }

  if (name && name !== name.trim()) {
    return { status: CAN_NOT_COPY, reason: 'spaces at the corners' };
  }

  return { status: NEW, reason: null };
}

module.exports = createLogFunctions({ getStat, getListOfPaths });
