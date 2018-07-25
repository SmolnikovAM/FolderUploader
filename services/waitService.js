const Wait = {
  timeoutCounter: 0,
  tooManyRequestsTimer: Promise.resolve(),
  promiseWaitTime(time) {
    let ok;
    this.tooManyRequestsTimer = new Promise(res => {
      ok = res;
    });
    this.timeoutCounter++;
    // logError(`current timeout: ${++this.timeoutCounter}`);
    setTimeout(() => {
      ok();
      // logGood(`end of timeout: ${this.timeoutCounter}`);
    }, time);
    return this.tooManyRequestsTimer;
  },
};

module.exports = {
  Wait,
};
