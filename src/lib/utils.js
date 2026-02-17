/**
 * Shared utilities
 */

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Convert error to OpenAI error format
 */
export function convertErrorToOpenAI(error, status = 500) {
  return {
    error: {
      message: error.message || 'Unknown error',
      type: status === 401 || status === 403 ? 'invalid_request_error'
        : status === 429 ? 'rate_limit_error'
        : status >= 500 ? 'server_error'
        : 'api_error',
      code: status === 401 ? 'invalid_api_key' : 'server_error',
    },
  };
}
