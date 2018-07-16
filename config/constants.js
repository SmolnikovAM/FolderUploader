const MAX_BLOB = 8 * 1000 * 1000;
const HASH_BLOB_SIZE = 4 * 1024 * 1024;
const MAX_FILE_SIZE = 150 * 1000 * 1000;
const THREADS = 20;
const MIN_WAIT_TIME = 30000;
const MAX_FILES_UPLOAD_IN_MOMENT = 10;

const ADD_MODE_START = 'ADD_MODE_START';
const ADD_MODE_PATH_LIST = 'ADD_MODE_PATH_LIST';
const CREATE_FOLDERS_MODE = 'CREATE_FOLDERS_MODE';
const COPY_MODE = 'COPY_MODE';
const END_MODE = 'END_MODE';

const ADD_COMMAND = '--ADD';

const NEW = 'NEW';
const WORK = 'WORK';
const ERROR = 'ERROR';
const END = 'END';
const CAN_NOT_COPY = 'CAN_NOT_COPY';

const DIR = 'DIR';
const FILE = 'FILE';
const SUCCESS = 'SUCCESS';
const START = 'START';
const ID = 'ID';
const WAIT = 'WAIT';
const HELP1_COMMAND = 'help';
const HELP2_COMMAND = '--help';
const WRITE = 'WRITE';

const WINDOWS_RESERVED_NAMES_ARRAY = [
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
]; // https://docs.microsoft.com/ru-ru/windows/desktop/FileIO/naming-a-file#naming_conventions
const WINDOWS_RESERVED_SYMBOLS_REEXP = new RegExp(/[\<\>\:\"\\\|\?\*]+/);

const DROPBOX_RESERVED_FILE_NAMES = [
  'desktop.ini',
  'thumbs.db',
  '.ds_store',
  'icon\r',
  '.dropbox',
  '.dropbox.attr',
].map(x => x.toUpperCase());

module.exports = {
  DROPBOX_RESERVED_FILE_NAMES,
  WINDOWS_RESERVED_SYMBOLS_REEXP,
  WINDOWS_RESERVED_NAMES_ARRAY,
  CAN_NOT_COPY,
  HASH_BLOB_SIZE,
  MAX_FILES_UPLOAD_IN_MOMENT,
  MIN_WAIT_TIME,
  ADD_MODE_START,
  ADD_MODE_PATH_LIST,
  COPY_MODE,
  END_MODE,
  CREATE_FOLDERS_MODE,
  HELP2_COMMAND,
  ADD_COMMAND,
  NEW,
  WORK,
  ERROR,
  END,
  FILE,
  DIR,
  MAX_BLOB,
  SUCCESS,
  START,
  ID,
  MAX_FILE_SIZE,
  THREADS,
  WAIT,
  WRITE,
};
