import 'aws-sdk-client-mock-jest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  UpdateItemCommand,
  PutItemCommand,
  ResourceNotFoundException,
  DeleteItemCommand,
  ScanCommand,
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import { apiGatewayProxyEvent } from './helpers';

jest.mock('uuid', () => ({
  v4: () => 'test-uuid',
}));

process.env.USERS_TABLE_NAME = 'USERS_TABLE_NAME';

import { lambdaHandler } from '../app';
import { jsonResponse } from '../utils';

const dynamoDBMock = mockClient(DynamoDBClient);
dynamoDBMock.onAnyCommand().rejects(new Error('Unimplemented.'));

// TODO: Add more unit test coverage.
describe('app', () => {
  beforeEach(() => {
    dynamoDBMock.reset();
  });

  afterEach(() => {
    dynamoDBMock.restore();
  });

  describe('POST /users', () => {
    it('saves user to the DB', async () => {
      dynamoDBMock
        .on(PutItemCommand, {
          TableName: process.env.USERS_TABLE_NAME,
          Item: {
            id: { S: 'test-uuid' },
            name: { S: 'Test' },
            email: { S: 'test@test.com' },
          },
        })
        .resolves({});

      const request = apiGatewayProxyEvent('post', '/users', {
        name: 'Test',
        email: 'test@test.com',
      });
      const response = await lambdaHandler(request);

      expect(response).toStrictEqual(
        jsonResponse(201, {
          id: 'test-uuid',
          name: 'Test',
          email: 'test@test.com',
        }),
      );
    });

    describe('returns 400', () => {
      it('if invalid json is provided', async () => {
        const request = apiGatewayProxyEvent('post', '/users', {});
        request.body = '{"invalid":';
        const response = await lambdaHandler(request);

        expect(response).toStrictEqual(
          jsonResponse(400, {
            message: 'Body parsing error.',
          }),
        );
      });

      it('if invalid user shape is provided', async () => {
        const request = apiGatewayProxyEvent('post', '/users', {
          user: 'Test',
          email: 'test@test.com',
        });
        const response = await lambdaHandler(request);

        expect(response).toStrictEqual(
          jsonResponse(400, {
            message: 'Input validation error.',
          }),
        );
      });

      it('if invalid email is provided', async () => {
        const request = apiGatewayProxyEvent('post', '/users', {
          name: 'Test',
          email: 'test',
        });
        const response = await lambdaHandler(request);

        expect(response).toStrictEqual(
          jsonResponse(400, {
            message: 'Input validation error.',
          }),
        );
      });
    });

    describe('returns 500', () => {
      it('on unhandled exception', async () => {
        dynamoDBMock.onAnyCommand().rejects(new Error('Unhandled exception.'));

        const request = apiGatewayProxyEvent('post', '/users', {
          name: 'Test',
          email: 'test@test.com',
        });
        const response = await lambdaHandler(request);

        expect(response).toStrictEqual(
          jsonResponse(500, {
            message: 'Internal server error.',
          }),
        );
      });
    });
  });

  describe('GET /users', () => {
    it('returns a list of users', async () => {
      dynamoDBMock
        .on(ScanCommand, { TableName: process.env.USERS_TABLE_NAME, ExclusiveStartKey: undefined })
        .resolves({
          Items: [{ id: { S: 'key-1' }, name: { S: '1' }, email: { S: '1@gmail.com' } }],
          LastEvaluatedKey: { id: { S: 'key-1' } },
        })
        .on(ScanCommand, { TableName: process.env.USERS_TABLE_NAME, ExclusiveStartKey: { id: { S: 'key-1' } } })
        .resolves({
          Items: [{ id: { S: 'key-2' }, name: { S: '2' }, email: { S: '2@gmail.com' } }],
          LastEvaluatedKey: undefined,
        });

      const request = apiGatewayProxyEvent('get', '/users');
      const response = await lambdaHandler(request);

      expect(response).toStrictEqual(
        jsonResponse(200, {
          results: [
            { id: 'key-1', name: '1', email: '1@gmail.com' },
            { id: 'key-2', name: '2', email: '2@gmail.com' },
          ],
        }),
      );
    });
  });

  describe('PATCH /users/{id}', () => {
    it('updates a user', async () => {
      dynamoDBMock.on(UpdateItemCommand, {
        TableName: process.env.USERS_TABLE_NAME,
        Key: {
          id: { S: 'test-id' },
        },
        AttributeUpdates: {
          name: { Action: 'PUT', Value: { S: 'new-name' } },
          email: { Action: 'PUT', Value: { S: 'new-email' } },
        },
      });

      const request = apiGatewayProxyEvent(
        'patch',
        '/users/{id}',
        {
          name: 'new-name',
          email: 'new-email@email.com',
        },
        { id: 'test-id' },
      );
      const response = await lambdaHandler(request);

      expect(response).toStrictEqual(jsonResponse(200, {}));
    });

    describe('returns 400', () => {
      it('if invalid user shape is provided', async () => {
        const request = apiGatewayProxyEvent(
          'patch',
          '/users/{id}',
          {
            name: 'new-name',
          },
          { id: 'test-id' },
        );
        const response = await lambdaHandler(request);

        expect(response).toStrictEqual(
          jsonResponse(400, {
            message: 'Input validation error.',
          }),
        );
      });
    });

    describe('returns 404', () => {
      it('if record is not found', async () => {
        dynamoDBMock
          .on(UpdateItemCommand)
          .rejects(new ResourceNotFoundException({ $metadata: {}, message: 'Record not found.' }));

        const request = apiGatewayProxyEvent(
          'patch',
          '/users/{id}',
          {
            name: 'new-name',
            email: 'new-email@email.com',
          },
          { id: 'test-id' },
        );
        const response = await lambdaHandler(request);

        expect(response).toStrictEqual(jsonResponse(404, { message: 'User not found.' }));
      });
    });
  });

  describe('DELETE /users/{id}', () => {
    it('deletes a user', async () => {
      dynamoDBMock.on(DeleteItemCommand, {
        TableName: process.env.USERS_TABLE_NAME,
        Key: {
          id: { S: 'test-id' },
        },
      });

      const request = apiGatewayProxyEvent('delete', '/users/{id}', {}, { id: 'test-id' });
      const response = await lambdaHandler(request);

      expect(response).toStrictEqual(jsonResponse(200, {}));
    });

    describe('returns 404', () => {
      it('if record is not found', async () => {
        dynamoDBMock
          .on(DeleteItemCommand)
          .rejects(new ResourceNotFoundException({ $metadata: {}, message: 'Record not found.' }));

        const request = apiGatewayProxyEvent('delete', '/users/{id}', {}, { id: 'test-id' });
        const response = await lambdaHandler(request);

        expect(response).toStrictEqual(jsonResponse(404, { message: 'User not found.' }));
      });
    });
  });

  describe('unknown route', () => {
    it('returns 401', () => {
      const request = apiGatewayProxyEvent('get', '/unknown');
      const response = lambdaHandler(request);

      expect(response).resolves.toStrictEqual(jsonResponse(401));
    });
  });
});
