class ErrorL extends Error {
  constructor(option) {
    super(option);
    logErrorL(this);
  }
}

class BadCommandCLIError extends ErrorL {}
class ConnectionError extends ErrorL {}
class BadRequestError extends ErrorL {}
class DataNotFoundError extends ErrorL {}
class TooManyRequestsError extends ErrorL {}
class WrongOffsetError extends ErrorL {}
class RunTimeError extends ErrorL {}
class UnhandledError extends ErrorL {}
class UnauthorizedError extends ErrorL {}
class ConflictError extends ErrorL {}

const allErrors = {
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
};

function logErrorL(err) {
  const keyPrint = Object.keys(allErrors).find(
    key => err instanceof allErrors[key],
  );
  console.log('error called:', keyPrint);
}

module.exports = allErrors;
