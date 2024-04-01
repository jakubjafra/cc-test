import { APIGatewayProxyEventV2 } from 'aws-lambda';

/** Constructs a mock {@link APIGatewayProxyEventV2} request object. */
export function apiGatewayProxyEvent(
  method: string,
  uri: string,
  body: unknown = {},
  pathParameters: Record<string, string> = {},
  rest: Partial<APIGatewayProxyEventV2> = {},
): APIGatewayProxyEventV2 {
  return {
    routeKey: `${method.toUpperCase()} ${uri}`,
    body: JSON.stringify(body),
    pathParameters,
    ...rest,
  } as APIGatewayProxyEventV2;
}
