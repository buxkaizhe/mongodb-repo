import { MongoClient } from 'mongodb';
import { z } from 'zod';
import { MongoConfig, tRepositoryConfig } from './config';
import { MongodbRepositoryForType, MongodbRepositoryForZod } from './repo';

const UserModel = z
  .object({
    _id: z.string(),
    name: z.string(),
  })
  .describe(
    MongoConfig.describe({
      collectionName: 'Users',
      transform: {
        _id: 'oid',
      },
    }),
  );

const TransactionConfig: tRepositoryConfig<tTransaction> = {
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

const TransactionModel = z
  .object({
    _id: z.string(),
    status: z.enum(['PENDING', 'SUCCESS', 'FAILED']),
    date: z.string(),
    from: z.string(),
    to: z.string(),
    users: z.array(z.string()),
    pf_user: UserModel.optional(),
    pf_users: z.array(UserModel).optional(),
  })
  .describe(MongoConfig.describe(TransactionConfig));

type tTransaction = z.infer<typeof TransactionModel>;

async function bootstrap() {
  const mongoClient = new MongoClient('mongodb://localhost:27017/');

  const trxRepo_zod = new MongodbRepositoryForZod(
    TransactionModel,
    mongoClient,
    mongoClient.db('repo_db'),
  );

  const trxRepo = new MongodbRepositoryForType<tTransaction>(
    TransactionConfig,
    mongoClient,
    mongoClient.db('repo_db'),
  );
  const t = await trxRepo_zod.findOneAndUpdate(
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
  )!;

  const [populated] = await trxRepo.findAndPopulate(
    { _id: t?._id.toString() },

    { populate: ['user', 'user2', 'users'] },
  );

  console.log(populated);

  // {
  //   _id: new ObjectId("6527d349bce59986d40b214a"),
  //   date: 2023-10-02T16:00:00.000Z,
  //   status: 'PENDING',
  //   user: new ObjectId("6527b103bce59986d40b0657"),
  //   user2: new ObjectId("6527b103bce59986d40b0658"),
  //   users: [
  //     new ObjectId("6527b103bce59986d40b0657"),
  //     new ObjectId("6527b103bce59986d40b0658")
  //   ],
  //   pf_users: [
  //     {
  //       _id: new ObjectId("6527b103bce59986d40b0657"),
  //       name: 'wendywong'
  //     },
  //     {
  //       _id: new ObjectId("6527b103bce59986d40b0658"),
  //       name: 'buxkaizhe'
  //     }
  //   ]
  // }
}

bootstrap();
