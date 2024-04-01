import { parseJsonBody, getPathParam, jsonResponse, UserReportedError } from '../utils';
import { apiGatewayProxyEvent } from './helpers';

describe('utils', () => {
  describe('jsonResponse', () => {
    it('returns a JSON response', () => {
      expect(jsonResponse(200, { key: 'value' })).toStrictEqual({
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
        },
        body: '{"key":"value"}',
      });
    });
  });

  describe('parseJsonBody', () => {
    it('returns a parsed JSON body', () => {
      const request = apiGatewayProxyEvent('post', '/users', { test: 'object', value: 1 });

      expect(parseJsonBody(request.body)).toStrictEqual({ test: 'object', value: 1 });
    });

    it('throws a UserReportedError on invalid JSON', () => {
      const request = apiGatewayProxyEvent('post', '/users', {});
      request.body = '{"invalid":';

      expect(() => parseJsonBody(request.body)).toThrow(new UserReportedError(400, 'Body parsing error.'));
    });
  });

  describe('getPathParam', () => {
    it('returns a path parameter value', () => {
      const request = apiGatewayProxyEvent('get', '/users/123', {}, { id: '123' });

      expect(getPathParam(request, 'id')).toBe('123');
    });

    it('throws a UserReportedError on missing path parameter', () => {
      const request = apiGatewayProxyEvent('get', '/users', {}, {});

      expect(() => getPathParam(request, 'id')).toThrow(new UserReportedError(400, 'Param id not found.'));
    });
  });
});
