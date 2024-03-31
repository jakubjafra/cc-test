import { APIGatewayProxyEventV2, APIGatewayProxyResult } from 'aws-lambda';
import assert from 'node:assert';
import {
  AttributeValue,
  DynamoDBClient,
  ResourceNotFoundException,
  PutItemCommand,
  UpdateItemCommand,
  ScanCommand,
  DeleteItemCommand,
} from '@aws-sdk/client-dynamodb';
import { object, string, InferType } from 'yup';
import { v4 as uuidv4 } from 'uuid';

interface User {
  id: string;
  name: string;
  email: string;
}

const client = new DynamoDBClient({});

function assertExists<T>(value?: T | null): T {
  assert(value);
  return value;
}

const UsersTableName = assertExists(process.env.USERS_TABLE_NAME);

class UserReportedError extends Error {
  statusCode: number;

  constructor(statusCode: number, message = 'Internal server error.') {
    super(message);
    this.statusCode = statusCode;
  }
}

function parseJsonBody(body: APIGatewayProxyEventV2['body']): unknown {
  try {
    if (body) {
      return JSON.parse(body);
    }
  } catch (err) {}

  throw new UserReportedError(400, 'Body parsing error.');
}

const userInputSchema = object({
  name: string().required(),
  email: string().email().required(),
});
type UserInput = InferType<typeof userInputSchema>;

async function validateUserInput(body: APIGatewayProxyEventV2['body']): Promise<UserInput> {
  try {
    return await userInputSchema.validate(parseJsonBody(body));
  } catch (error) {
    throw new UserReportedError(400, 'Input validation error.');
  }
}

async function createUser(userInput: UserInput): Promise<User> {
  const user: User = {
    id: uuidv4(),
    ...userInput,
  };

  await client.send(
    new PutItemCommand({
      TableName: UsersTableName,
      Item: {
        id: { S: user.id },
        name: { S: user.name },
        email: { S: user.email },
      },
    }),
  );

  return user;
}

async function scanAll(tableName: string): Promise<Record<string, AttributeValue>[]> {
  const results: Record<string, AttributeValue>[] = [];

  let lastEvaluatedKey = undefined;
  let response;
  do {
    response = await client.send(new ScanCommand({ TableName: tableName, ExclusiveStartKey: lastEvaluatedKey }));
    (response?.Items ?? []).forEach((item) => results.push(item));
    lastEvaluatedKey = response.LastEvaluatedKey;
  } while (response.LastEvaluatedKey !== undefined);

  return results;
}

async function listUsers(): Promise<User[]> {
  // TODO: Better would be to implement actual pagination, but for this demo this will do.
  const records = await scanAll(UsersTableName);

  return records.map((record) => ({
    id: record.id.S as string,
    name: record.name.S as string,
    email: record.email.S as string,
  }));
}

async function patchUser(userId: string, userInput: UserInput): Promise<void> {
  await client.send(
    new UpdateItemCommand({
      TableName: UsersTableName,
      Key: {
        id: { S: userId },
      },
      AttributeUpdates: {
        name: { Action: 'PUT', Value: { S: userInput.name } },
        email: { Action: 'PUT', Value: { S: userInput.email } },
      },
    }),
  );
}

async function deleteUser(userId: string): Promise<void> {
  await client.send(
    new DeleteItemCommand({
      TableName: UsersTableName,
      Key: {
        id: { S: userId },
      },
    }),
  );
}

function response(statusCode: number, value: unknown = {}): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(value),
  };
}

function getPathParam(event: APIGatewayProxyEventV2, paramName: string): string {
  const paramValue = event?.pathParameters?.[paramName];
  if (!paramValue) {
    throw new UserReportedError(400, `Param {paramName} not found.`);
  }
  return paramValue;
}

export const lambdaHandler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResult> => {
  try {
    switch (event.routeKey) {
      case 'POST /users': {
        const userInput = await validateUserInput(event.body);

        const user = await createUser(userInput);

        return response(201, user);
      }

      case 'GET /users': {
        const users = await listUsers();

        return response(200, {
          results: users,
        });
      }

      case 'PATCH /users/{id}': {
        const userId = getPathParam(event, 'id');
        const userInput = await validateUserInput(event.body);

        try {
          await patchUser(userId, userInput);
        } catch (err) {
          if (err instanceof ResourceNotFoundException) {
            throw new UserReportedError(404);
          }
          throw err;
        }

        return response(200);
      }

      case 'DELETE /users/{id}': {
        const userId = getPathParam(event, 'id');

        try {
          await deleteUser(userId);
        } catch (err) {
          if (err instanceof ResourceNotFoundException) {
            throw new UserReportedError(404);
          }
          throw err;
        }

        return response(200);
      }

      default:
        return response(404);
    }
  } catch (err) {
    // TODO: Report the errors to monitoring service.
    console.error(err);

    if (err instanceof UserReportedError) {
      return response(err.statusCode, {
        message: err.message,
      });
    }

    return response(500, {
      message: 'Internal server error.',
    });
  }
};
