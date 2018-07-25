const { Wait } = require('./waitService');

const {
  fileGetMetadata,
  filesCreateFolder,
  filesUpload,
  filesUploadSessionAppendV2,
  filesUploadSessionFinish,
  filesUploadSessionStart,
} = require('../APIs/dropboxAPI.js');

const {
  BadCommandCLIError,
  ConnectionError,
  BadRequestError,
  DataNotFoundError,
  TooManyRequestsError,
  WrongOffsetError,
  RunTimeError,
  UnhandledError,
  UnauthorizedError,
  ConflictError,
} = require('../utils/errors');

const { Writable } = require('stream');
const {
  MAX_BLOB,
  MAX_FILE_SIZE,
  START,
  WAIT,
  WRITE,
  MIN_WAIT_TIME,
  HASH_BLOB_SIZE,
} = require('../config/constants');
const { readFileSync, createReadStream } = require('fs');

const RETRY_AFTER = 'retry-after';

const wrapper = async fn => {
  console.log('call', fn.toString());
  let done = false;
  let res;
  let cnt = 0;
  const MAX_RETRY = 4;
  do {
    await Wait.tooManyRequestsTimer;
    try {
      res = await fn();
      done = true;
    } catch (err) {
      // if (cnt > MAX_RETRY) throw err;
      switch (true) {
        case err instanceof TooManyRequestsError:
          Wait.promiseWaitTime(err[RETRY_AFTER]);
          console.log('timeout: ', err[RETRY_AFTER]);
          break;
        case err instanceof ConnectionError:
          cnt += 1;
          Wait.promiseWaitTime(cnt * MIN_WAIT_TIME);
          console.log('timeout: ', cnt * MIN_WAIT_TIME);
          break;
        default:
          throw err;
      }
    }
  } while (!done);
  return res;
};

async function wrapFileGetMetadata(item) {
  return wrapper(async () => await fileGetMetadata(item));
}

async function wrapfilesUpload(item) {
  return wrapper(async () => await filesUpload(item));
}

async function wrapFilesUploadSessionAppendV2(item) {
  return wrapper(async () => await filesUploadSessionAppendV2(item));
}

async function wrapFilesUploadSessionFinish(item) {
  return wrapper(async () => await filesUploadSessionFinish(item));
}

async function wrapFilesUploadSessionStart(item) {
  return wrapper(async () => await filesUploadSessionStart(item));
}

async function createDBXFolder(item) {
  let res;
  try {
    res = await wrapper(async () => filesCreateFolder(item));
    // res = await wrapFileGetMetadata(item);
  } catch (err) {
    if (err instanceof ConflictError) {
      res = await wrapFileGetMetadata(item);
      if (res.data['.tag'] !== 'folder') {
        console.log('not folder');
        throw err;
      } else return res;
    }
    throw err;
  }
  return res;
}

class WritibleToDropBox extends Writable {
  constructor(item) {
    super();
    this.item = item;
    this.status = item.data.uploadSessionId ? WRITE : START;
    this.item.data.offset = this.item.data.offset ? this.item.data.offset : 0;
    this.offset = 0;
    this.currentChunck = 0;
    this.dataStore = Buffer.alloc(0);
    this.promiseArr = [];
    this.dataPushArr = [];
    this.dataOffset = 0;
    // this.hashStore = '';
    // this.dataDeltaForHash = Buffer.alloc(0);
  }

  async _write(data, encoding, callback) {
    this.dataOffset += data.length;

    if (this.dataOffset < this.item.data.offset) {
      this.dataStore = Buffer.alloc(0);
      callback();
      return;
    }

    this.dataStore = Buffer.concat(
      [this.dataStore, data],
      this.dataStore.length + data.length,
    );

    if (this.offset !== this.item.data.offset) {
      this.dataStore = this.dataStore.slice(
        this.dataStore.length - (this.dataOffset - this.item.data.offset),
        this.dataStore.length,
      );
      this.offset = this.item.data.offset;
      console.log('correxted stream offset', this.offset);
    }

    let dataPush;
    if (this.dataStore.length < MAX_BLOB) {
      callback();
      return;
    }

    do {
      console.log('start load', this.offset);
      await Wait.tooManyRequestsTimer;
      if (this.dataStore.length > MAX_BLOB) {
        dataPush = Buffer.from(this.dataStore.slice(0, MAX_BLOB));
        this.dataStore = Buffer.from(
          this.dataStore.slice(MAX_BLOB, this.dataStore.length),
        );
      } else {
        dataPush = Buffer.from(this.dataStore);
        this.dataStore = Buffer.alloc(0);
      }

      if (this.status === START) {
        let res;
        res = await wrapFilesUploadSessionStart({
          body: dataPush,
        });
        this.item.data.uploadSessionId = res.data.session_id;
        this.status = WRITE;
      } else if (this.status === WRITE) {
        const cursor = {
          session_id: this.item.data.uploadSessionId,
          offset: this.offset,
        };
        this.dataPushArr.unshift({ dataPush, cursor });
        if (this.dataPushArr.length > 3) {
          this.dataPushArr.pop();
        }

        try {
          console.log('cursor: ', cursor);
          console.log('fileoffset: ', this.dataOffset);
          await wrapFilesUploadSessionAppendV2({
            body: dataPush,
            cursor,
          });
        } catch (err) {
          if (err instanceof WrongOffsetError) {
            const newChunk = this.dataPushArr.find(
              da => da.dataPush.offset === err.current_offset,
            );
            if (!newChunk) throw err;
            const idx = this.dataPushArr.indexOf(newChunk);
            let dataPush = Buffer.alloc(0);
            for (let i = idx; i >= 0; i -= 1) {
              dataPush = Buffer.concat(
                [dataPush, this.dataPushArr.dataPush],
                dataPush.length + this.dataPushArr.dataPush.length,
              );
            }
            this.offset = err.current_offset;
            await wrapFilesUploadSessionAppendV2({
              body: dataPush,
              cursor: {
                session_id: this.item.data.uploadSessionId,
                offset: this.offset,
              },
            });
          } else throw err;
        }
      }

      this.offset += dataPush.length;
      this.item.data.offset = this.offset;
    } while (this.dataStore.length > MAX_BLOB);
    callback();
  }

  async _final(callback) {
    // await Promise.all(this.promiseArr);
    const res = await wrapFilesUploadSessionFinish({
      pathTo: this.item.data.pathTo,
      body: this.dataStore,
      cursor: {
        session_id: this.item.data.uploadSessionId,
        offset: this.item.data.offset,
      },
    });
    this.emit('dbxresult', res);
    callback();
  }
}

async function uploadSmallFileToDBX(item, setItemParams) {
  const { pathTo } = item;
  let buffer = Buffer.alloc(0);
  let endHs;
  const endHash = new Promise(res => (endHs = res));

  const rs = createReadStream(pathFrom);
  const hasher = dch.create();

  rs.on('data', buf => {
    hasher.update(buf);
    buffer = Buffer.concat([buffer, buf], buffer.length + buf.length);
  });

  rs.on('end', () => endHs(hasher.digest('hex')));
  const hexDigest = await endHash;

  const res = await wrapper(
    async () => await filesUpload({ pathTo, body: buffer }),
  );

  if (hexDigest !== res.data.content_hash) {
    await setItemParams({
      status: NEW,
      hashFs: hexDigest,
      hashDBX: res.content_hash,
      errorMsg: 'hash not equal',
    });
  }
  return { hexDigest, res };
}

async function uploadToDBX(item, setItemParams) {
  const { size } = item;

  if (size < MAX_FILE_SIZE) {
    return uploadSmallFileToDBX(item, setItemParams);
  }
  return uploadBigFileToDBX(item, setItemParams);
}

async function uploadBigFileToDBX(item, setItemParams) {
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
  log(`start upload ${pathFrom}`);
  rs.pipe(wsDropbox);
  await endUpload;
  await endHash;
  log(`end upload ${pathFrom}`);

  return { hexDigest, res };
}

module.exports = {
  createDBXFolder,
  wrapFileGetMetadata,
  wrapfilesUpload,
  wrapFilesUploadSessionAppendV2,
  wrapFilesUploadSessionFinish,
  wrapFilesUploadSessionStart,
  WritibleToDropBox,
};

// createLogFunctions({
//   copyToDropboxSync,
//   createDBXFolder,
//   fileGetMetadata,
//   uploadToDBX,
// });
