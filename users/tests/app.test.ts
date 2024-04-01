import 'aws-sdk-client-mock-jest';
import { mockClient } from 'aws-sdk-client-mock';
import { PutItemCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyEventV2 } from 'aws-lambda';

jest.mock('uuid', () => ({
  v4: () => 'test-uuid',
}));

process.env.USERS_TABLE_NAME = 'USERS_TABLE_NAME';

import { lambdaHandler } from '../app';

function apiGatewayProxyEvent(method: string, uri: string, body: unknown = {}): APIGatewayProxyEventV2 {
  return {
    routeKey: `${method.toUpperCase()} ${uri}`,
    body: JSON.stringify(body),
  } as APIGatewayProxyEventV2;
}

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

      expect(response).toStrictEqual({
        statusCode: 201,
        body: JSON.stringify({
          id: 'test-uuid',
          name: 'Test',
          email: 'test@test.com',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });
  });
});
