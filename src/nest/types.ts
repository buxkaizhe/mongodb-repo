import { type MongoClientOptions } from 'mongodb';

interface MongodbRepositoryClientOption extends MongoClientOptions {
  dbName: string;
}

interface MongodbModuleOption {
  uri: string;
  dbName: string;
  clientOption?: MongoClientOptions;
}

interface MongodbModuleAsyncOptions {
  useFactory: (
    ...args: any[]
  ) => Promise<MongodbRepositoryClientOption> | MongodbRepositoryClientOption;
  inject?: any[];
}

const MONGODB_REPOSITORY_DEFAULT_CONNECTION =
  'MongodbRepositoryDefaultConnectionName';

const MONGODB_REPOSITORY_MODULE_OPTION = 'MongodbRepositoryModuleOption';

export type GenericZodType = {
  _input: any;
  _output: any;
  description?: string;
  safeParse: (data: unknown) => any;
};

export {
  MongodbRepositoryClientOption,
  MongodbModuleOption,
  MongodbModuleAsyncOptions,
  MONGODB_REPOSITORY_DEFAULT_CONNECTION,
  MONGODB_REPOSITORY_MODULE_OPTION,
};
