const https = require('https');
const { httpHeaderSafeJson } = require('../utils/helpers');

const {
  ConnectionError,
  BadRequestError,
  DataNotFoundError,
  TooManyRequestsError,
  WrongOffsetError,
  UnhandledError,
  RunTimeError,
  ConflictError,
} = require('../utils/errors');

const { APP_KEY, APP_SECRET, ACCESS_TOKEN } = require('../config/key');

const { MIN_WAIT_TIME } = require('../config/constants');

const GET_METADATA_URL = '/2/files/get_metadata';
const UPLOAD_FILE_URL = '/2/files/upload';
const UPLOAD_FILE_SESSION_START_URL = '/2/files/upload_session/start';
const UPLOAD_FILE_SESSION_APPEND_URL = '/2/files/upload_session/append_v2';
const UPLOAD_FILE_SESSION_FINISH_URL = '/2/files/upload_session/finish';
const CREATE_FOLDER_URL = '/2/files/create_folder_v2';
const HOSTNAME_CONTENT = 'content.dropboxapi.com';
const HOSTNAME_API = 'api.dropboxapi.com';
const LOCALHOST = 'localhost';
const APPLICATION_JSON = 'application/json';
const APPLICATION_OCTET_STREAM = 'application/octet-stream';

const DROPBOX_MODE_ADD = 'add';
const DROPBOX_MODE_OVERWRITE = 'overwrite';
const DROPBOX_API_ARG = 'Dropbox-API-Arg';
const AUTHORIZATION = `Bearer ${ACCESS_TOKEN}`;
const CONTENT_TYPE = 'Content-Type';
const USER_AGENT = 'User-Agent';
const USER_AGENT_VALUE = 'api-explorer-client';
const METHOD_POST = 'POST';
const RETRY_AFTER = 'retry-after';
const CONTENT_LENGTH = 'Content-Length';

const INCORRECT_OFFSET = 'incorrect_offset';
const CORRECT_OFFSET = 'correct_offset';

function getHeader(headers, filed) {
  const header = Object.keys(headers).find(
    x => x.toUpperCase() === filed.toUpperCase(),
  );
  return header ? headers[header] : null;
}

function isApplicationJSONHeader(headers) {
  return (
    getHeader(headers, CONTENT_TYPE).toUpperCase() ===
    APPLICATION_JSON.toUpperCase()
  );
}

function searchField(obj, field, arr = []) {
  if (typeof obj !== 'object') {
    return { value: null, find: false };
  }
  if (obj === null) return { value: null, find: false };
  const keys = Object.keys(obj);
  arr.push(obj);
  for (let key of keys) {
    if (key === field) {
      return { value: obj[key], find: true };
    }
    if (arr.indexOf(obj[key]) === -1) {
      const val = searchField(obj[key], field, arr);
      if (val.find) return val;
    }
  }
  return { value: null, find: false };
}

function responseHandler({ resultGood, resultError, returnObj }) {
  let err;
  let errorParams = {};

  const parseErr = () => {
    try {
      errorParams.error_summary = returnObj.data.error_summary;
      errorParams.error = returnObj.data.error;

      if (errorParams.error_summary.indexOf(INCORRECT_OFFSET) !== -1) {
        const correct = searchField(errorParams, CORRECT_OFFSET);
        if (correct.find) {
          errorParams[CORRECT_OFFSET] = correct.value;
        }
      }
    } catch (e) {}
  };

  const { statusCode } = returnObj;
  switch (true) {
    case statusCode === 200:
      resultGood(returnObj);
      break;
    case statusCode === 409:
      parseErr();
      if (
        errorParams.error_summary &&
        errorParams.error_summary.indexOf(INCORRECT_OFFSET) !== -1
      ) {
        err = new WrongOffsetError(`wrong offset`);
        err[CORRECT_OFFSET] = errorParams[CORRECT_OFFSET];
      } else if (
        errorParams.error_summary &&
        errorParams.error_summary.indexOf('conflict') !== -1
      ) {
        err = new ConflictError(`conflict`);
      } else {
        err = new DataNotFoundError(`path not found`);
      }
      err.errorParams = errorParams;
      err.returnObj = returnObj;
      resultError(err);
      break;
    case statusCode === 429 || statusCode === 503:
      err = new TooManyRequestsError('file of folder  not found');
      err.timeout = +getHeader(returnObj.headers, RETRY_AFTER) || MIN_WAIT_TIME;
      parseErr();
      err.errorParams = errorParams;
      err.returnObj = returnObj;
      resultError(err);
      break;
    case statusCode === 401:
      err = new UnauthorizedError('problem');
      parseErr();
      err.errorParams = errorParams;
      err.returnObj = returnObj;
      resultError(err);
      break;
    case statusCode === 400:
      err = new BadRequestError('Bad request');
      parseErr();
      err.errorParams = errorParams;
      err.returnObj = returnObj;
      resultError(err);
      break;
    default:
      err = new UnhandledError('unpredictible answer');
      parseErr();
      err.errorParams = errorParams;
      err.returnObj = returnObj;
      resultError(err);
      break;
  }
}

function createParamsForRequest({ pathTo, reqFnStr, body, cursor }) {
  const parameters = {};

  const options = {
    host: LOCALHOST,
    path: reqFnStr,
    method: METHOD_POST,
    headers: {
      Authorization: AUTHORIZATION,
      [USER_AGENT]: USER_AGENT_VALUE,
    },
  };
  let bodyToWrite = Buffer.alloc(0);

  switch (reqFnStr) {
    case GET_METADATA_URL:
      parameters.include_media_info = false;
      parameters.include_deleted = false;
      parameters.include_has_explicit_shared_members = false;
      parameters.path = pathTo;
      options.hostname = HOSTNAME_API;
      options.headers[CONTENT_TYPE] = APPLICATION_JSON;
      bodyToWrite = Buffer.from(JSON.stringify(parameters));
      break;
    case CREATE_FOLDER_URL:
      parameters.path = pathTo;
      parameters.autorename = false;
      options.hostname = HOSTNAME_API;
      options.headers[CONTENT_TYPE] = APPLICATION_JSON;
      bodyToWrite = Buffer.from(JSON.stringify(parameters));
      break;
    case UPLOAD_FILE_URL:
      parameters.mode = DROPBOX_MODE_OVERWRITE;
      parameters.autorename = true;
      parameters.mute = false;
      parameters.path = pathTo;
      options.hostname = HOSTNAME_CONTENT;
      options.headers[CONTENT_TYPE] = APPLICATION_OCTET_STREAM;
      options.headers[DROPBOX_API_ARG] = JSON.stringify(parameters); //httpHeaderSafeJson(parameters);   // JSON.stringify(parameters);
      bodyToWrite = body;
      break;
    case UPLOAD_FILE_SESSION_START_URL:
      parameters.close = false;
      options.hostname = HOSTNAME_CONTENT;
      options.headers[CONTENT_TYPE] = APPLICATION_OCTET_STREAM;
      options.headers[DROPBOX_API_ARG] = JSON.stringify(parameters); //httpHeaderSafeJson(parameters);   //  JSON.stringify(parameters);
      bodyToWrite = body;
      break;
    case UPLOAD_FILE_SESSION_APPEND_URL:
      parameters.close = false;
      parameters.cursor = cursor;
      options.hostname = HOSTNAME_CONTENT;
      options.headers[CONTENT_TYPE] = APPLICATION_OCTET_STREAM;
      options.headers[DROPBOX_API_ARG] = JSON.stringify(parameters); //httpHeaderSafeJson(parameters);   //  JSON.stringify(parameters);
      options.headers[CONTENT_LENGTH] = body.length;
      bodyToWrite = body;
      break;
    case UPLOAD_FILE_SESSION_FINISH_URL:
      parameters.cursor = cursor;
      parameters.commit = {
        path: pathTo,
        autorename: true,
        mute: false,
        mode: DROPBOX_MODE_OVERWRITE,
      };
      options.hostname = HOSTNAME_CONTENT;
      options.headers[CONTENT_TYPE] = APPLICATION_OCTET_STREAM;
	console.log(httpHeaderSafeJson(parameters))
      options.headers[DROPBOX_API_ARG] =  httpHeaderSafeJson(parameters);   //  
      options.headers[CONTENT_LENGTH] = body.length;
      bodyToWrite = body;
      break;
    default:
      break;
  }

  return { bodyToWrite, options };
}

function requestToDBX(item, reqFnStr) {
  const { bodyToWrite, options } = createParamsForRequest({
    ...item,
    reqFnStr,
  });

  let resultGood, resultError;
  const result = new Promise((promiseResolve, promiseReject) => {
    resultGood = promiseResolve;
    resultError = promiseReject;
  });

  const req = https.request(options, res => {
    let responseData = Buffer.alloc(0);
    let responseObj;

    res.on('data', data => {
      responseData += Buffer.concat(
        [responseData, data],
        responseData.length + data.length,
      );
    });

    res.on('end', () => {
      if (isApplicationJSONHeader(res.headers)) {
        try {
          responseObj = JSON.parse(responseData.toString());
        } catch (e) {
          const err = new RunTimeError('Problem with JSON parse');
          return resultError(err);
        }
      }

      const returnObj = {
        data: responseObj,
        statusCode: res.statusCode,
        headers: res.headers,
      };

      responseHandler({ resultGood, returnObj, resultError });
    });
  });

  req.on('error', e => {
    const err = new ConnectionError(`Connection Error: ${e.message}`);
    err.originalError = e;
    resultError(err);
  });

  if (bodyToWrite.length > 0) {
    req.write(bodyToWrite);
  }
  req.end();

  return result;
}

function filesCreateFolder(item) {
  const reqFnStr = CREATE_FOLDER_URL;
  return requestToDBX(item, reqFnStr);
}

function fileGetMetadata(item) {
  const reqFnStr = GET_METADATA_URL;
  return requestToDBX(item, reqFnStr);
}

function filesUpload(item) {
  const reqFnStr = UPLOAD_FILE_URL;
  return requestToDBX(item, reqFnStr);
}

function filesUploadSessionStart(item) {
  const reqFnStr = UPLOAD_FILE_SESSION_START_URL;
  return requestToDBX(item, reqFnStr);
}

function filesUploadSessionAppendV2(item) {
  if (!Reflect.has(item, 'cursor')) {
    throw new UnhandledError('no cursor');
  }
  const reqFnStr = UPLOAD_FILE_SESSION_APPEND_URL;
  return requestToDBX(item, reqFnStr);
}

function filesUploadSessionFinish(item) {
  if (!Reflect.has(item, 'cursor')) {
    throw new UnhandledError('no cursor');
  }
  const reqFnStr = UPLOAD_FILE_SESSION_FINISH_URL;
  return requestToDBX(item, reqFnStr);
}

module.exports = {
  filesUpload,
  filesUploadSessionFinish,
  filesUploadSessionAppendV2,
  filesUploadSessionStart,
  fileGetMetadata,
  filesCreateFolder,
};
