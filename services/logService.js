const clc = require('cli-color');
const { createWriteStream } = require('fs');
const path = require('path');
const LOG_PATH = path.resolve('./logs');

let numAction = 0;
const logStream = createWriteStream(logName(), { flags: 'w' });
let writableOk;
const writableReady = new Promise(res => (writableOk = res));
logStream.on('ready', writableOk);

function logName() {
  return path.join(LOG_PATH, `${Date.now()}.log`);
}

function toJson(args) {
  let argsStr = 'problem with JSON';
  try {
    argsStr = JSON.stringify(args);
  } catch (e) {}
  return argsStr;
}

function getDate() {
  const d = new Date();
  const fix = (s, n) => `00000${s}`.slice(-n);
  const hh = d.getHours().toString();
  const mm = d.getMinutes().toString();
  const ss = d.getSeconds().toString();
  const ms = d.getMilliseconds().toString();
  return `${fix(hh, 2)}:${fix(mm, 2)}:${fix(ss, 2)}:${fix(ms, 3)}`;
}

function header(args, fn) {
  let str = '';
  let argsStr = toJson(args) || '';
  str += '----------\n';
  str += `start ${getDate()}\n`;
  str += `# ${numAction++} \n`;
  str += `${fn.name.replace('_', '')} `;
  let strFs = str;
  str += `args: ${argsStr.slice(0, 40)}\n`;
  strFs += `args: ${argsStr}\n`;
  return { str, strFs };
}

function footer(res) {
  let argsStr = toJson(res) || '';
  let str1 = `end ${getDate()}\n`;

  const strFs1 = `${str1} result: ${argsStr}`;
  str1 += `result: ${argsStr.slice(0, 40)}`;

  return { str1, strFs1 };
}

async function printToFile(str) {
  // await writableReady;
  logStream.write(str + '\n');
}

function logFnSync(fn, args, that) {
  let { str, strFs } = header(args, fn);

  let res;
  if (that && typeof that === 'object' && that !== null) {
    res = fn.apply(that, args);
  } else {
    res = fn(...args);
  }
  const { str1, strFs1 } = footer(res);
  console.log(str + str1);
  printToFile(strFs + strFs1);
  return res;
}

async function logFn(fn, args, that) {
  let { str, strFs } = header(args, fn);

  let res;
  if (that && typeof that === 'object' && that !== null) {
    res = await fn.apply(that, args);
  } else {
    res = await fn(...args);
  }
  const { str1, strFs1 } = footer(res);
  console.log(str + str1);
  printToFile(strFs + strFs1);
  return res;
}

function log(...args) {
  let argsStr = toJson(args) || '';

  let str = '----------\n';
  str += `${getDate()}\n`;

  str += `# ${numAction++} \n`;

  console.log(str);
  console.log(argsStr.slice(0, 40));

  printToFile(str + argsStr);
}

function logError(str) {
  const w = `time ${getDate()}\n ${str}`;
  console.log(w);
  printToFile(w);
}

function logGood(str) {
  const w = `time ${getDate()}\n ${str}`;
  console.log(w);
  printToFile(w);
}

function createLogFunctions(obj) {
  const newObj = {};
  Object.keys(obj).forEach(key => {
    newObj[key.replace('_', '')] = function(...args) {
      return logFn(obj[key], args);
    };
  });
  return newObj;
}

function closeLogFile() {
  logStream.end();
}

module.exports = {
  closeLogFile,
  logError,
  logGood,
  logFnSync,
  logFn,
  log,
  createLogFunctions,
};
