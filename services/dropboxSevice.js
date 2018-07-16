require('es6-promise').polyfill();
require('isomorphic-fetch'); // or another library of choice.
// const crypto = require('crypto');
const dch = require('./dropboxHasherService');

const { Dropbox } = require('dropbox');
const { Writable } = require('stream');
const {
  MAX_BLOB,
  MAX_FILE_SIZE,
  WAIT,
  WRITE,
  MIN_WAIT_TIME,
  HASH_BLOB_SIZE,
} = require('../config/constants');
const { APP_KEY, APP_SECRET, ACCESS_TOKEN } = require('../config/key');
const { createLogFunctions, log, logError } = require('./logService');
const { State } = require('../state/state');
const { readFileSync, createReadStream } = require('fs');
const { getStat } = require('./hardDiskService');

const dropbox = new Dropbox({ accessToken: ACCESS_TOKEN });

function getRetryTime(err) {
  let val = MIN_WAIT_TIME * 2;
  try {
    val = +err.response.headers._headers['retry-after'][0] * 1000;
  } catch (e) {}
  return val + MIN_WAIT_TIME;
}

const wrapper = async (fn, ...args) => {
  let done = false;
  let res;
  let cnt = 0;
  const MAX_RETRY = 4;
  do {
    await State.DBXAwait;
    try {
      res = await fn(args);
      done = true;
    } catch (err) {
      const time = getRetryTime(err);
      const wait = State.promiseWaitTime(time);
      log(`COPY ERROR!!!!!!!!`, err);
      log(fn.toString(), args);
      cnt += 1;
      if (cnt > MAX_RETRY) {
        log('max retry', fn.toString(), args);
        throw err;
      }
      // if (
      //   err &&
      //   Reflect.has(err, 'status') &&
      //   (err.status === 429 || err.status === 503)
      // ) {
      // } else {
      // }
      log(`start timeout ${fn.toString()}`, time, args);
      log(`end timeout ${fn.toString()}`, time, args);
      await wait;
    }
  } while (!done);
  return res;
};

async function fileGetMetadata(path) {
  return wrapper(async par => dropbox.filesGetMetadata(...par), { path });
}

async function filesUploadSessionStart(options) {
  log(`---------start upload`);
  return wrapper(async par => dropbox.filesUploadSessionStart(...par), options);
}
async function filesUploadSessionAppendV2(options) {
  log(`---append`, options.cursor);

  return wrapper(
    async par => dropbox.filesUploadSessionAppendV2(...par),
    options,
  );
}

async function filesUploadSessionFinish(options) {
  return wrapper(
    async par => dropbox.filesUploadSessionFinish(...par),
    options,
  );
}

async function copyToDropboxSync({ buffer, pathTo }) {
  const result = await wrapper(async par => dropbox.filesUpload(...par), {
    path: pathTo,
    contents: buffer,
    autorename: true,
    mode: 'overwrite',
  });
  return result;
}

// function calculateHash(buf) {
//   if (buf.length < HASH_BLOB_SIZE) {
//     return;
//   }
// }

class WritibleToDropBox extends Writable {
  constructor(path, options) {
    super(options);
    this.commit = {
      path,
      mode: 'add',
      autorename: true,
      mute: false,
    };
    this.status = 'OFF';
    this.sessionId = null;
    this.offset = 0;
    this.currentChunck = 0;
    this.dataStore = Buffer.alloc(0);
    this.promiseArr = [];
    // this.hashStore = '';
    // this.dataDeltaForHash = Buffer.alloc(0);
  }

  async _write(data, encoding, callback) {
    let dataPush;
    this.dataStore = Buffer.concat(
      [this.dataStore, data],
      this.dataStore.length + data.length,
    );

    if (this.dataStore.length < MAX_BLOB) {
      callback();
      return;
    }
    do {
      await State.DBXAwait;
      if (this.dataStore.length > MAX_BLOB) {
        dataPush = Buffer.from(this.dataStore.slice(0, MAX_BLOB));
        this.dataStore = Buffer.from(
          this.dataStore.slice(MAX_BLOB, this.dataStore.length),
        );
      } else {
        dataPush = Buffer.from(this.dataStore);
        this.dataStore = Buffer.alloc(0);
      }

      if (this.status === 'OFF') {
        let res;
        res = await filesUploadSessionStart({
          close: false,
          contents: dataPush,
        });
        const { session_id } = res;

        this.sessionId = session_id;
        this.status = WRITE;
      } else if (this.status === WRITE) {
        const cursor = { session_id: this.sessionId, offset: this.offset };

        // this.promiseArr.push(
        // );
        await filesUploadSessionAppendV2({
          cursor: cursor,
          close: false,
          contents: dataPush,
        });
      }

      this.offset += dataPush.length;
    } while (this.dataStore.length > MAX_BLOB);
    callback();
  }

  async _final(callback) {
    const cursor = {
      session_id: this.sessionId,
      offset: this.offset,
    };
    // await Promise.all(this.promiseArr);
    const res = await filesUploadSessionFinish({
      cursor: cursor,
      commit: this.commit,
      contents: this.dataStore,
    });
    this.emit('dbxresult', res);
    callback();
  }
}

async function createDBXFolder(path) {
  let res;
  try {
    res = await wrapper(async par => dropbox.filesCreateFolder(...par), {
      path,
      autorename: false,
    });
  } catch (err) {
    if (err.status === 409) {
      return 'already have';
    }
    throw err;
  }
  return res;
}

async function uploadToDBX({ pathFrom, pathTo }) {
  let size;
  size = (await getStat(pathFrom)).size;
  let hexDigest;
  try {
    if (size < MAX_FILE_SIZE) {
      let buffer = Buffer.alloc(0);
      let endHs;
      const endHash = new Promise(res => (endHs = res));

      const rs = createReadStream(pathFrom);
      const hasher = dch.create();
      rs.on('data', function(buf) {
        hasher.update(buf);
        buffer = Buffer.concat([buffer, buf], buffer.length + buf.length);
      });
      rs.on('end', () => {
        hexDigest = hasher.digest('hex');
        endHs();
      });
      await endHash;
      const res = await copyToDropboxSync({ buffer, pathTo });
      return { hexDigest, res };
    } else {
      let endFn;
      const endUpload = new Promise(res => (endFn = res));
      let endHs;
      const endHash = new Promise(res => (endHs = res));

      const wsDropbox = new WritibleToDropBox(pathTo);
      const hasher = dch.create();
      const rs = createReadStream(pathFrom);
      rs.on('data', function(buf) {
        hasher.update(buf);
      });
      rs.on('end', () => {
        hexDigest = hasher.digest('hex');
        endHs();
      });

      wsDropbox.on('finish', endFn);
      let res;
      wsDropbox.on('dbxresult', data => {
        res = data;
        endHs();
      });
      rs.pipe(wsDropbox);
      log(`start upload ${pathFrom}`);
      await endUpload;
      await endHash;
      log(`end upload ${pathFrom}`);

      return { hexDigest, res };
    }
  } catch (err) {
    log(err, { pathFrom, pathTo });
    return false;
  }
}

module.exports = createLogFunctions({
  copyToDropboxSync,
  createDBXFolder,
  fileGetMetadata,
  uploadToDBX,
});
