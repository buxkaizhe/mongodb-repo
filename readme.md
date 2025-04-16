# MongoDB Repository

This package contains a repository for MongoDb, which can be used simply by passing a config, MongoClient and Db instance.

## Installation

```bash
  npm install @buxkaizhe/mongodb-repo
```

## Usage/Examples

- First, construct a repository config

  ```ts
  const TransactionConfig: tRepositoryConfig = {
    collectionName: 'Transactions',
    transform: {
      _id: 'oid',
      from: 'oid',
      to: 'oid',
      users: 'oid',
      date: 'date',
    },
    lookups: {
      from: {
        fromCollection: 'Users',
        as: 'pf_from',
      },
      to: {
        fromCollection: 'Users',
        as: 'pf_to',
      },
      users: {
        fromCollection: 'Users',
        as: 'pf_users',
        array: true,
      },
    },
  };
  ```

- There are two types of repository to use

  - With type

    ```ts
    import {
      mongodb,
      tRepositoryConfig,
      MongoConfig,
      MongodbRepositoryForType,
    } from '@buxkaizhe/mongodb-repo';

    type tTransaction = {
      _id: string;
      status: 'PENDING' | 'SUCCESS' | 'FAILED';
      date: string;
      from: string;
      to: string;
      users: string[];
    };

    const trxRepo = new MongodbRepositoryForType<tTransaction>(
      TransactionConfig,
      mongoClient,
      mongoClient.db('repo_db'),
    );
    ```

  - With zod schema

    ```ts
    import { mongodb, MongoConfig, MongodbRepositoryForZod } from '@buxkaizhe/mongodb-repo';

    const TransactionModel = z
      .object({
        _id: z.string(),
        status: z.enum(['PENDING', 'SUCCESS', 'FAILED']),
        date: z.string(),
        from: z.string(),
        to: z.string(),
        users: z.array(z.string()),
      })
      .describe(MongoConfig.describe(TransactionConfig));

    const trxRepo = new MongodbRepositoryForZod(
      TransactionModel
      mongoClient,
      mongoClient.db('repo_db'),
    );
    ```

- How to use

  ```ts
  const t = await trxRepo.findOneAndUpdate(
    {
      date: '2023-10-03 00:00',
    },
    {
      $setOnInsert: {
        from: '6527b103bce59986d40b0657',
        to: '6527b103bce59986d40b0658',
        users: ['6527b103bce59986d40b0657', '6527b103bce59986d40b0658'],
        date: '2023-10-03 00:00',
        status: 'PENDING',
      },
    },
    {
      upsert: true,
    },
  );

  const [populated] = await trxRepo.findAndPopulate(
    { _id: t?._id.toString() },
    { populate: ['user', 'user2', 'users'] },
  );

  console.log(populated);
  ```

- Output

  ```-
    {
      _id: new ObjectId("6527d349bce59986d40b214a"),
      date: 2023-10-02T16:00:00.000Z,
      status: 'PENDING',
      user: new ObjectId("6527b103bce59986d40b0657"),
      user2: new ObjectId("6527b103bce59986d40b0658"),
      users: [
        new ObjectId("6527b103bce59986d40b0657"),
        new ObjectId("6527b103bce59986d40b0658")
      ],
      pf_users: [
        {
          _id: new ObjectId("6527b103bce59986d40b0657"),
          name: 'wendywong'
        },
        {
          _id: new ObjectId("6527b103bce59986d40b0658"),
          name: 'buxkaizhe'
        }
      ]
    }
  ```

## Version

- 5.6.1

  - requires `@nestjs/common` (`^9.0.0 || ^10.0.0`) as peer dependencies
  - requires `mongodb` (`^5.6.0`) as peer dependencies
  - should support most zod version (experimental)
  - remove unused dependencies
  - modify scripts for publishing and local linking

- 5.6.0-6

  - fix type for `insertMany`

- 5.6.0-5

  - add support for `aggregate`

- 5.6.0-4

  - add support for `countDocuments`

- 5.6.0-2, 5.6.0-3

  - update zod to 3.22.4

- 5.6.0-1
  - first version ✨
