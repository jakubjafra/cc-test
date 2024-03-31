import { APIGatewayProxyEventV2, APIGatewayProxyResult } from 'aws-lambda';
import assert from 'node:assert';
import { DynamoDBClient, PutItemCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import { object, string, InferType } from 'yup';
import { v4 as uuidv4 } from 'uuid';

interface User {
  id: string;
  name: string;
  email: string;
}

const client = new DynamoDBClient({});

const UsersTableName = process.env.USERS_TABLE_NAME;
assert(UsersTableName);

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

export const lambdaHandler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResult> => {
  try {
    switch (event.routeKey) {
      case 'POST /users':
        const userInput = await validateUserInput(event.body);
        const user = await createUser(userInput);

        return response(201, user);

      case 'DELETE /users/{id}':
        const userId = event?.pathParameters?.id;
        if (!userId) {
          throw new UserReportedError(404);
        }

        await deleteUser(userId);

        return response(200, {});

      default:
        return response(404, {});
    }
  } catch (err) {
    // TODO: Monitor the errors.
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
