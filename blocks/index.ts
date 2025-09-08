import { rdsCluster } from "./modules/rds_cluster";
import { storageBucket } from "./modules/storage_bucket";

export const blocks = {
  rdsCluster,
  storageBucket,
} as const;
