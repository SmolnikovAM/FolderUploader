const {
  logFn,
  log,
  logFnSync,
  logError,
  logGood,
} = require('../services/logService');
const { MAX_FILES_UPLOAD_IN_MOMENT } = require('../config/constants');

class AppState {
  constructor() {
    this.status = null;
    this.DBXAwait = Promise.resolve();
    this.newUploadFilesAwait = Promise.resolve();
    this.paths = [];
    this.filesFunction = () => {};
    this.timeoutCounter = 0;
  }

  _setStatus(val) {
    this.status = val;
    return this.status;
  }

  _promiseWaitTime(time) {
    let ok;
    this.DBXAwait = new Promise(res => {
      ok = res;
    });
    this.timeoutCounter++;
    logError(`current timeout: ${++this.timeoutCounter}`);
    setTimeout(() => {
      ok();
      logGood(`end of timeout: ${this.timeoutCounter}`);
    }, time);
    return this.DBXAwait;
  }

  _addPath(pathPromise) {
    const promiseObj = { promise: pathPromise, resolve: false };
    this.paths.push(promiseObj);
    if (this.paths.length >= MAX_FILES_UPLOAD_IN_MOMENT) {
      this.newUploadFilesAwait = new Promise(res => {
        this.filesFunction = res;
      });
    }

    pathPromise.then(() => {
      promiseObj.resolve = true;
      this.filesFunction();
      this.paths = this.paths.filter(({ promise, resolve }) => !resolve);
    });

    return this.paths.length;
  }

  addPath(...args) {
    return logFnSync(this._addPath, args, this);
  }
  setStatus(...args) {
    return logFnSync(this._setStatus, args, this);
  }

  promiseWaitTime(...args) {
    return logFnSync(this._promiseWaitTime, args, this);
  }
}

const State = new AppState();

module.exports = { State };
