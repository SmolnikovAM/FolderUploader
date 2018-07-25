const FilePath = require('./filePathModel');
const { Wait } = require('../services/waitService');
const dch = require('../services/dropboxHasherService');
const { createReadStream } = require('fs');
const {
  // fileGetMetadata,
  // filesCreateFolder,
  // filesUpload,
  // filesUploadSessionAppendV2,
  // filesUploadSessionFinish,
  // filesUploadSessionStart,
} = require('../APIs/dropboxAPI.js');

const {
  wrapFileGetMetadata,
  wrapfilesUpload,
  wrapFilesUploadSessionAppendV2,
  WritibleToDropBox,
} = require('../services/dropboxService');

const { Writable } = require('stream');
const {
  MAX_BLOB,
  MAX_FILE_SIZE,
  START,
  WAIT,
  WRITE,
  MIN_WAIT_TIME,
  HASH_BLOB_SIZE,
  ERROR,
  NEW,
  END,
} = require('../config/constants');

const BEGIN = 'BEGIN';
const CHECK_EXISTANCE = 'CHECK_EXISTANCE';
const ONLY_FILE_HASH = 'ONLY_FILE_HASH';
const COPY = 'COPY';
const RETRY_AFTER = 'retry-after';
const COPY_SMALL = 'COPY_SMALL';
const COPY_BIG = 'COPY_BIG';
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

class FilePathClass {
  constructor(item) {
    const vm = this;
    this.copyState = 'BEGIN';
    const _data = {};
    this.data = {};
    this.chain = Promise.resolve();
    this.copyEndPromise = new Promise(res => (this.copyEndFn = res));
    const { id } = item;

    Object.keys(item.dataValues).forEach(key => {
      _data[key] = item.dataValues[key];

      Object.defineProperty(this.data, key, {
        get() {
          return _data[key];
        },
        set(value) {
          if (key === 'id') return;
          _data[key] = value;
          vm.chain = vm.chain.then(() =>
            FilePath.update(
              { [key]: value },
              {
                where: {
                  id,
                },
              },
            ),
          );
        },
        enumerable: true,
        configurable: false,
      });
    });
    this.createReadStream = () => {
      this.fsStreamStarted = false;
      this.fsStream = createReadStream(this.data.pathFrom);
      this.fsStreamEnd = new Promise(res => (this.fsStreamEndFn = res));
    };
    this.createReadStream();
    this.endHashPromise = new Promise(res => (this.endHashFn = res));
    this.endHashPromise.then(res => {
      if (res) this.data.hashFs = res;
    });
    this.fsStreamQueueFnOn = [];
    this.fsStreamQueueFnEnd = [];
  }

  startFileStream() {
    if (this.fsStreamStarted) {
      this.createReadStream();
    }
    this.fsStreamStarted = true;
    this.fsStream.on('data', data => {
      this.fsStreamQueueFnOn.forEach(fn => fn(data));
    });
    this.fsStream.on('end', data => {
      this.fsStreamQueueFnEnd.forEach(fn => fn(data));
      this.fsStreamEndFn();
    });
  }

  promiseEndReturn() {
    return this.copyEndPromise;
  }

  async start() {
    // this._fsStream.pause();

    do {
      switch (this.copyState) {
        case BEGIN:
          console.log(this.copyState);
          if (this.data.hashFs === null) {
            const hasher = dch.create();
            this.fsStreamQueueFnOn.push(buf => {
              hasher.update(buf);
            });
            this.fsStreamQueueFnEnd.push(() => {
              const hexDigest = hasher.digest('hex');
              this.endHashFn(hexDigest);
            });
          } else {
            this.endHashFn();
          }

          this.copyState = CHECK_EXISTANCE;
          break;
        case CHECK_EXISTANCE:
          console.log(this.copyState);
          let resCheckFile;
          try {
            resCheckFile = await wrapFileGetMetadata({
              pathTo: this.data.pathTo,
            });
            if (this.data.hashFs === resCheckFile.data.content_hash) {
              this.data.hashDBX = resCheckFile.data.content_hash;
              this.data.status = END;
              this.copyState = END;
            } else if (this.data.hashFs === null) {
              this.copyState = ONLY_FILE_HASH;
            } else {
              this.copyState = COPY;
            }
          } catch (e) {
            if (e instanceof DataNotFoundError) {
              this.copyState = COPY;
            } else {
              throw e;
            }
          }
          break;
        case ONLY_FILE_HASH:
          console.log(this.copyState);
          this.startFileStream();
          await this.endHashPromise;
          this.fsStreamQueueFnOn.length = 0;
          this.fsStreamQueueFnEnd.length = 0;
          this.copyState = CHECK_EXISTANCE;
          break;
        case COPY:
          console.log(this.copyState);
          if (this.data.size < MAX_FILE_SIZE) {
            this.copyState = COPY_SMALL;
          } else {
            this.copyState = COPY_BIG;
          }
          break;
        case COPY_SMALL:
          console.log(this.copyState);
          let buffer = Buffer.alloc(0);
          this.fsStreamQueueFnOn.push(buf => {
            buffer = Buffer.concat([buffer, buf], buffer.length + buf.length);
          });
          this.startFileStream();
          await this.fsStreamEnd;
          try {
            const res = await wrapfilesUpload({
              body: buffer,
              pathTo: this.data.pathTo,
            });
            this.data.hashDBX = res.data.content_hash;
            if (this.data.hashDBX === this.data.hashFs) {
              this.data.status = END;
            } else {
              this.data.status = NEW;
            }
          } catch (err) {
            this.data.status = ERROR;
            let text = err.messages;
            try {
              text = JSON.stringify(err);
            } catch (e) {}
            this.data.errMsg = text;
          }
          this.copyState = END;
          break;
        case COPY_BIG:
          console.log(this.copyState);
          if (this.data.uploadSessionId) {
            // check offset
            try {
              console.log('start check');
              await wrapFilesUploadSessionAppendV2({
                body: Buffer.alloc(0),
                cursor: {
                  session_id: this.data.uploadSessionId,
                  offset: this.data.offset,
                },
              });
            } catch (err) {
              if (err instanceof WrongOffsetError) {
                this.data.offset = err.correct_offset;
                console.log('offset corrected', err.correct_offset);
              } else {
                this.data.status = ERROR;
                this.copyState = END;
                let text = err.messages;
                try {
                  text = JSON.stringify(err);
                } catch (e) {}
                this.data.errMsg = text;
                this.copyEndFn();
                return;
              }
            }
          }
          console.log('create stream');
          let endFn;
          const endUpload = new Promise(res => (endFn = res));
          const wsDropbox = new WritibleToDropBox(this);

          wsDropbox.on('dbxresult', res => {
            this.data.hashDBX = res.data.content_hash;
            if (this.data.hashDBX === this.data.hashFs) {
              this.data.status = END;
            } else {
              this.data.status = NEW;
            }
            endFn();
          });
          this.startFileStream();
          this.fsStream.pipe(wsDropbox);
          await endUpload;
          this.copyState = END;
          break;
        default:
          this.copyState = END;
          break;
      }
    } while (this.copyState !== END);

    this.copyEndFn();
  }
}

module.exports = FilePathClass;
