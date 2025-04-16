import {
  Inject,
  Global,
  Module,
  DynamicModule,
  Provider,
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { MongoClient, Db } from 'mongodb';
import {
  MongodbRepositoryClientOption,
  MongodbModuleAsyncOptions,
  MongodbModuleOption,
  MONGODB_REPOSITORY_DEFAULT_CONNECTION,
  MONGODB_REPOSITORY_MODULE_OPTION,
  GenericZodType,
} from './types';
import { MongoConfig, tRepositoryConfig } from '../config';
import { MongodbRepositoryForType, MongodbRepositoryForZod } from '../repo';

function InjectMongodbRepositoryZod<T extends GenericZodType>(model: T) {
  return Inject(getMongodbRepositoryTokenZod(model));
}

function InjectMongodbRepository(cfg: tRepositoryConfig) {
  return Inject(getMongodbRepositoryToken(cfg));
}

function getMongodbRepositoryTokenZod<T extends GenericZodType>(model: T) {
  if (model.description == null) {
    throw Error(`No meta found for ${model}`);
  }
  const mm = MongoConfig.fromString(model.description);
  return `${mm.collectionName}@MongoDbRepo`;
}

function getMongodbRepositoryToken<T>(cfg: tRepositoryConfig<T>) {
  return `${cfg.collectionName}@MongoDbRepo`;
}

@Global()
@Module({})
class MongodbRepositoryCoreModule {
  static forRoot(
    uri: string,
    options: MongodbRepositoryClientOption,
  ): DynamicModule {
    const connectionProvider = {
      provide: MONGODB_REPOSITORY_DEFAULT_CONNECTION,
      useFactory: async () => {
        const client = new MongoClient(uri, options);
        await client.connect();
        return { db: client.db(options.dbName), client };
      },
    };

    return {
      module: MongodbRepositoryCoreModule,
      providers: [connectionProvider],
      exports: [connectionProvider],
    };
  }

  static forRootAsync(options: MongodbModuleAsyncOptions): DynamicModule {
    const asyncProvider: Provider[] = [
      {
        provide: MONGODB_REPOSITORY_MODULE_OPTION,
        useFactory: options.useFactory,
        inject: options.inject ?? [],
      },
    ];

    const connectionProvider: Provider = {
      provide: MONGODB_REPOSITORY_DEFAULT_CONNECTION,
      useFactory: async (moduleOption: MongodbModuleOption) => {
        const { uri, clientOption } = moduleOption;
        const client = new MongoClient(uri, clientOption);
        await client.connect();
        return { db: client.db(moduleOption.dbName), client };
      },
      inject: [MONGODB_REPOSITORY_MODULE_OPTION],
    };

    return {
      module: MongodbRepositoryCoreModule,
      providers: [...asyncProvider, connectionProvider],
      exports: [connectionProvider],
    };
  }
}

@Module({})
class MongodbRepositoryModule {
  static forRoot(
    uri: string,
    options: MongodbRepositoryClientOption,
  ): DynamicModule {
    return {
      module: MongodbRepositoryModule,
      imports: [MongodbRepositoryCoreModule.forRoot(uri, options)],
    };
  }

  static forRootAsync(options: MongodbModuleAsyncOptions): DynamicModule {
    return {
      module: MongodbRepositoryModule,
      imports: [MongodbRepositoryCoreModule.forRootAsync(options)],
    };
  }

  static forConfig(models: tRepositoryConfig<unknown>[]): DynamicModule {
    const providers = models.map((model) => {
      return {
        provide: getMongodbRepositoryToken(model),
        useFactory: ({ db, client }: { db: Db; client: MongoClient }) => {
          return new MongodbRepositoryForType(model, client, db);
        },
        inject: [MONGODB_REPOSITORY_DEFAULT_CONNECTION],
      };
    });
    return {
      module: MongodbRepositoryModule,
      providers,
      exports: providers,
    };
  }

  static forFeature(models: GenericZodType[]): DynamicModule {
    const providers = models.map((model) => {
      return {
        provide: getMongodbRepositoryTokenZod(model),
        useFactory: ({ db, client }: { db: Db; client: MongoClient }) => {
          return new MongodbRepositoryForZod(model, client, db);
        },
        inject: [MONGODB_REPOSITORY_DEFAULT_CONNECTION],
      };
    });
    return {
      module: MongodbRepositoryModule,
      providers,
      exports: providers,
    };
  }
}

@Injectable()
class ZodValidationPipe implements PipeTransform {
  constructor(
    private schema: GenericZodType | ((value: unknown) => GenericZodType),
  ) {}
  transform(value: unknown, _metadata: ArgumentMetadata) {
    const validator =
      this.schema instanceof Function ? this.schema(value) : this.schema;

    const result = validator.safeParse(value);
    if (result.success === false) {
      throw new BadRequestException(result.error.errors);
    }
    return result.data;
  }
}

export {
  MongodbRepositoryModule,
  getMongodbRepositoryToken,
  InjectMongodbRepository,
  getMongodbRepositoryTokenZod,
  InjectMongodbRepositoryZod,
  ZodValidationPipe,
};
