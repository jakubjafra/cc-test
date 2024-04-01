import { APIGatewayProxyEventV2 } from 'aws-lambda';
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

import { assertExists, UserReportedError, parseJsonBody, JsonResponse, jsonResponse, getPathParam } from './utils';

interface User {
  id: string;
  name: string;
  email: string;
}

const usersTableName = assertExists(process.env.USERS_TABLE_NAME, 'DynamoDB Users table name is required.');

const client = new DynamoDBClient({});

const userInputSchema = object({
  name: string().required(),
  email: string().email().required(),
});
type UserInput = InferType<typeof userInputSchema>;

async function validateUserInput(body: unknown): Promise<UserInput> {
  try {
    return await userInputSchema.validate(body);
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
      TableName: usersTableName,
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
  const records = await scanAll(usersTableName);

  return records.map((record) => ({
    id: record.id.S as string,
    name: record.name.S as string,
    email: record.email.S as string,
  }));
}

async function patchUser(userId: string, userInput: UserInput): Promise<void> {
  await client.send(
    new UpdateItemCommand({
      TableName: usersTableName,
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
      TableName: usersTableName,
      Key: {
        id: { S: userId },
      },
    }),
  );
}

export const lambdaHandler = async (event: APIGatewayProxyEventV2): Promise<JsonResponse> => {
  try {
    switch (event.routeKey) {
      case 'POST /users': {
        const userInput = await validateUserInput(parseJsonBody(event.body));

        const user = await createUser(userInput);

        return jsonResponse(201, user);
      }

      case 'GET /users': {
        const users = await listUsers();

        return jsonResponse(200, {
          results: users,
        });
      }

      case 'PATCH /users/{id}': {
        const userId = getPathParam(event, 'id');
        const userInput = await validateUserInput(parseJsonBody(event.body));

        try {
          await patchUser(userId, userInput);
        } catch (err) {
          if (err instanceof ResourceNotFoundException) {
            throw new UserReportedError(404);
          }
          throw err;
        }

        return jsonResponse(200);
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

        return jsonResponse(200);
      }

      default:
        return jsonResponse(404);
    }
  } catch (err) {
    // TODO: Report the errors to monitoring service.
    console.error(err);

    if (err instanceof UserReportedError) {
      return jsonResponse(err.statusCode, {
        message: err.message,
      });
    }

    return jsonResponse(500, {
      message: 'Internal server error.',
    });
  }
};
