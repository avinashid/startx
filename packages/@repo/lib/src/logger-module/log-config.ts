export type LogConfig = {
  routeInfo: boolean;
  requestBody: boolean;
  validationErrors: boolean;
  queryParams: boolean;
  responseBody: boolean;
  steps: boolean;
};
export const logConfig: LogConfig = {
  routeInfo: false,
  responseBody: false,
  validationErrors: false,
  requestBody: false,
  queryParams: false,
  steps: false,
};
