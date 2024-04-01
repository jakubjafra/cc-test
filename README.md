cc-test
=======

A simple REST API built with AWS SAM, consisting of a single AWS Lambda behind an API Gateway which stores the records in DynamoDB table. New changes are deployed automatically to the `dev` env on push to the `main` branch, via a simple GitHub workflow.

Architecture diagram:

![architecture diagram](./diagram.png)

Capabilities
------------

* Simple CRUD REST API
* A deployment pipeline
* IAM roles used
* Lambda have a minimum required set of permissions (I've used a single lambda, a split could help here)
* Visual diagram created
* Resource names defined in env variables (example: `USERS_TABLE_NAME`)
* Input validation (using `yup`)
* Typescript used

Extras:

* Unit test coverage


API doc (examples)
------------------

The API exposes 4 simple endpoints:
```
/users [GET, POST]
/users/{id} [DELETE, PATCH]
```

TODO: Create a swagger documentation.

### Examples

Replace `{url}` with an API endpoint, and `{id}` with UUID of a given user.

Create a new user:
```
curl -X POST -H "Content-Type: application/json" -d "{\"name\":\"BradyMoss\",\"email\":\"brady@moss.com\"}" {url}/users
```

Get a list of users:
```
curl -X GET {url}/users
```

Edit a given user:
```
curl -X PATCH -H "Content-Type: application/json" -d "{\"name\":\"BradyMossEdited\",\"email\":\"brady@moss.com\"}" {url}/users/{id}
```

Delete a given user:
```
curl -X DELETE {url}/users/{id}
```

Example commands
----------------

Installing dependencies locally: `cd users && npm install`

Running unit tests: `cd users && npm run test`
