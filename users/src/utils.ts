import { APIGatewayProxyEventV2, APIGatewayProxyResult } from 'aws-lambda';
import assert from 'node:assert';

export class UserReportedError extends Error {
  statusCode: number;

  constructor(statusCode: number, message = 'Internal server error.') {
    super(message);
    this.statusCode = statusCode;
  }
}

export function assertExists<T>(value?: T | null, message?: string): T {
  assert(value, message);
  return value;
}

export function parseJsonBody(body: APIGatewayProxyEventV2['body']): unknown {
  try {
    if (body) {
      return JSON.parse(body);
    }
  } catch (err) {}

  throw new UserReportedError(400, 'Body parsing error.');
}

export interface JsonResponse extends APIGatewayProxyResult {
  statusCode: number;
  headers: {
    'Content-Type': 'application/json';
  };
  body: string;
}

export function jsonResponse(statusCode: number, value: unknown = {}): JsonResponse {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(value),
  };
}

export function getPathParam(event: APIGatewayProxyEventV2, paramName: string): string {
  const paramValue = event?.pathParameters?.[paramName];
  if (!paramValue) {
    throw new UserReportedError(400, `Param ${paramName} not found.`);
  }
  return paramValue;
}
