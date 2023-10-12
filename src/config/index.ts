type MongoLookupMeta = {
  fromCollection: string;
  as: string;
  localField?: string;
  foreignField?: string;
  array?: boolean;
};

type tRepositoryConfig<T = unknown> = {
  // context for Repository
  // eg. Restaurants, Businesses, Vouchers, VoucherClaims
  collectionName: string;
  transform?: { [k in keyof T]?: 'oid' | 'date' };
  lookups?: { [k in keyof T]?: MongoLookupMeta };
};

class MongoConfig<T> {
  static describe<T>(config: tRepositoryConfig<T>) {
    config.transform = {
      ...config.transform,
    };
    return JSON.stringify(config);
  }

  static fromString<T>(json: string) {
    return new MongoConfig(JSON.parse(json)) as MongoConfig<T>;
  }

  private config: tRepositoryConfig<T>;

  constructor(config: tRepositoryConfig<T>) {
    this.config = config;
  }

  get collectionName() {
    return this.config.collectionName;
  }

  get availableLookups() {
    return Object.keys(this.config.lookups || {});
  }

  get lookups() {
    return this.config.lookups;
  }

  get transform() {
    return this.config.transform;
  }
}

export { tRepositoryConfig, MongoConfig };
