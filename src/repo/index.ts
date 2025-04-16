import { tRepositoryConfig, MongoConfig } from '../config';
import _ from 'lodash';
import {
  Db,
  MongoClient,
  Document as mdbDocument,
  Filter,
  BulkWriteOptions,
  DeleteOptions,
  FindOneAndUpdateOptions,
  FindOptions,
  InsertOneOptions,
  OptionalUnlessRequiredId,
  UpdateFilter,
  UpdateOptions,
  ObjectId,
  CountDocumentsOptions,
  AggregateOptions,
  OptionalId,
} from 'mongodb';

class MongodbRepositoryForType<T extends mdbDocument, O = T> {
  protected config: MongoConfig<T>;
  protected mongoClient: MongoClient;
  protected db: Db;

  constructor(cfg: tRepositoryConfig<T>, mongoClient: MongoClient, db: Db) {
    this.config = new MongoConfig<T>(cfg);
    this.mongoClient = mongoClient;
    this.db = db;
  }

  get collection() {
    return this.db.collection<T>(this.config.collectionName);
  }

  get client(): MongoClient {
    return this.mongoClient;
  }

  protected convert<V extends string | string[]>(attr: string, value: V) {
    const { transform } = this.config;
    const construct = (v: string) => {
      switch (transform?.[attr]) {
        case 'oid':
          return new ObjectId(v);
        case 'date':
          return new Date(v);
        default:
          return v;
      }
    };
    return Array.isArray(value)
      ? (value.map(construct) as Array<V>)
      : (construct(value) as V);
  }

  protected generatePipeline(attr: keyof T) {
    const lookupConfig = this.config.lookups?.[attr];
    if (!lookupConfig) return [];

    const res = [];

    const $lookup = {
      from: lookupConfig.fromCollection,
      localField: lookupConfig.localField ?? attr,
      as: lookupConfig.as,
      foreignField: lookupConfig.foreignField || '_id',
    };
    res.push({ $lookup });

    if (lookupConfig.array != true) {
      res.push({
        $unwind: {
          path: `$${$lookup.as}`,
          preserveNullAndEmptyArrays: true,
        },
      });
    }

    return res;
  }

  buildQuery<
    V extends UpdateFilter<T> | Filter<T> | OptionalUnlessRequiredId<T>,
  >(query: V) {
    const cfg = this.config;

    function isTransformKey(k: string) {
      return Object.keys(cfg.transform || {}).includes(k);
    }

    function isMongoKey(k: string) {
      return [
        '$eq',
        '$ne',
        '$gt',
        '$gte',
        '$lt',
        '$lte',
        '$in',
        '$nin',
        //
        '$set',
        '$setOnInsert',
        '$unset',
        '$where',
        '$and',
        '$or',
        '$push',
      ].includes(k);
    }

    const convertQuery = (q: V): V => {
      return Object.keys(q).reduce<typeof q>((query, key) => {
        const val = _.get(query, key);
        if (isTransformKey(key)) {
          if (Array.isArray(val) || typeof val === 'string') {
            _.set(query, key, this.convert(key, val));
          } else if (!!val && Object.keys(val).every(isMongoKey)) {
            Object.keys(val).forEach((vk) => {
              _.set(val, vk, this.convert(key, val[vk]));
            });
          }
        } else if (isMongoKey(key)) {
          _.set(query, key, convertQuery(val));
        }
        return query;
      }, q);
    };

    return convertQuery(query);
  }

  async find(filter: Filter<T>, options?: FindOptions<mdbDocument>) {
    const res = await this.collection
      .find(this.buildQuery(filter), options)
      .toArray();
    return res;
  }

  async findOne(filter: Filter<T>, options?: FindOptions<mdbDocument>) {
    const res = await this.collection
      .find(this.buildQuery(filter), { ...options, limit: 1 })
      .toArray();
    return res[0] ?? undefined;
  }

  async findAndPopulate(
    filter: Filter<T>,
    options: FindOptions<mdbDocument> & {
      populate?: string[];
    },
  ) {
    const aggregation: mdbDocument[] = [{ $match: this.buildQuery(filter) }];

    const supportedOperators = ['sort', 'skip', 'limit'];

    Object.entries(options || {})
      .filter(([k]) => {
        return supportedOperators.includes(k);
      })
      .forEach(([k, v]) => {
        aggregation.push({
          [`\$${k}`]: v,
        });
      });

    if (options.populate?.length) {
      options.populate.forEach((pf) => {
        const pipeline = this.generatePipeline(pf);
        aggregation.push(...pipeline);
      });
    }

    const result = await this.collection
      .aggregate(aggregation, options)
      .toArray();

    return result.map((r) => {
      options.populate?.forEach((p) => {
        const lookup = this.config.lookups?.[p];
        if (!lookup) return;
        const value = _.get(r, lookup.as ?? p);
        if (Array.isArray(value) && lookup.array != true) {
          _.set(r, lookup.as ?? p, null);
        }
      });
      return r;
    }) as O[];
  }

  async findOneAndUpdate(
    filter: Filter<T>,
    update: UpdateFilter<T>,
    options?: FindOneAndUpdateOptions,
  ) {
    const updateResult = await this.collection.findOneAndUpdate(
      this.buildQuery(filter),
      this.buildQuery(update),
      { returnDocument: 'after', ...options },
    );

    if (!updateResult.ok) {
      throw new Error(
        `mongodb: findOneAndUpdate failed. \nlastErrorObject: ${updateResult.lastErrorObject}`,
      );
    }
    return updateResult.value;
  }

  async updateMany(
    filter: Filter<T>,
    update: UpdateFilter<T>,
    options?: UpdateOptions,
  ) {
    const updateResult = await this.collection.updateMany(
      this.buildQuery(filter),
      this.buildQuery(update),
      { ...options },
    );

    if (!updateResult.acknowledged) {
      throw new Error(
        'mongodb: updateMany failed. \nError: driver failed to acknowledge updateMany',
      );
    }
    return updateResult;
  }

  async deleteOne(filter: Filter<T>, options?: DeleteOptions) {
    return await this.collection.deleteOne(this.buildQuery(filter), options);
  }

  async deleteMany(filter: Filter<T>, options?: DeleteOptions) {
    return await this.collection.deleteMany(this.buildQuery(filter), options);
  }

  async insertOne(doc: OptionalId<T>, options?: InsertOneOptions) {
    const insertResult = await this.collection.insertOne(
      this.buildQuery(doc as unknown as OptionalUnlessRequiredId<T>),
      options,
    );
    if (!insertResult.acknowledged) {
      throw new Error(
        'mongodb: insertOne failed. \nError: driver failed to acknowledge insertOne',
      );
    }
    return { ...insertResult, doc: { ...doc, _id: insertResult.insertedId } };
  }

  async insertMany(docs: OptionalId<T>[], options?: BulkWriteOptions) {
    const insertResult = await this.collection.insertMany(
      this.buildQuery(
        docs.map((d) => this.buildQuery(d)),
      ) as OptionalUnlessRequiredId<T>[],
      options,
    );
    if (!insertResult.acknowledged) {
      throw new Error(
        'mongodb: insertMany failed. \nError: driver failed to acknowledge insertMany',
      );
    }
    return insertResult;
  }

  async countDocuments(query: Filter<T>, options?: CountDocumentsOptions) {
    return await this.collection.countDocuments(
      this.buildQuery(query),
      options,
    );
  }

  async aggregate(pipeline?: Document[], options?: AggregateOptions) {
    return this.collection.aggregate(pipeline, options).toArray();
  }
}

class MongodbRepositoryForZod<
  T extends { _input: mdbDocument; _output: mdbDocument; description?: string },
> extends MongodbRepositoryForType<T['_input'], T['_output']> {
  constructor(schema: T, mongoClient: MongoClient, db: Db) {
    if (!schema.description) {
      throw new Error('Zod schema must have a description');
    }
    super(
      MongoConfig.fromString(schema.description as string),
      mongoClient,
      db,
    );
  }
}

export { MongodbRepositoryForType, MongodbRepositoryForZod };
export * from '../nest';
