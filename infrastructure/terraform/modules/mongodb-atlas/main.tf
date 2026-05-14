# Project is the Atlas tenant scope for the cluster, users, and peering.
resource "mongodbatlas_project" "this" {
  name = var.atlas_project_name
  # `org_id` is set by the root module when calling the provider / passing variable.
  org_id = var.atlas_org_id
}

resource "random_password" "app_user" {
  length  = 32
  special = true
}

resource "random_password" "admin_user" {
  length  = 32
  special = true
}

resource "random_password" "readonly_user" {
  length  = 32
  special = true
}

resource "mongodbatlas_network_container" "this" {
  project_id       = mongodbatlas_project.this.id
  atlas_cidr_block = var.atlas_cidr_for_network_container
  provider_name    = "AWS"
  region_name      = var.atlas_aws_region_name
}

# VPC peering from Atlas into the EKS VPC (private connectivity for drivers using private SRV).
resource "mongodbatlas_network_peering" "eks" {
  accepter_region_name   = var.atlas_aws_accepter_region
  project_id             = mongodbatlas_project.this.id
  container_id           = mongodbatlas_network_container.this.id
  provider_name          = "AWS"
  route_table_cidr_block = var.eks_vpc_cidr
  vpc_id                 = var.eks_vpc_id
  aws_account_id         = var.aws_account_id
}

# Replica set: `electable_nodes` = 3 (default) → M30+ in AWS is a 3-member replica set;
# Atlas automatically places one electable node per distinct AZ in the region (e.g. us-east-1a/b/c).
# Auto-failover to a new primary is enabled for replica sets (no extra Terraform resource).
resource "mongodbatlas_advanced_cluster" "this" {
  project_id             = mongodbatlas_project.this.id
  name                   = var.cluster_name
  cluster_type           = "REPLICASET"
  backup_enabled         = true
  mongo_db_major_version = var.mongo_db_major_version
  # PITR is part of cloud backup in Atlas; `backup_enabled` enables continuous backup.

  depends_on = [mongodbatlas_network_peering.eks]

  replication_specs {
    region_configs {
      provider_name = "AWS"
      region_name   = var.atlas_aws_region_name
      priority      = 7

      electable_specs {
        instance_size = var.instance_size
        node_count    = var.electable_nodes
        disk_size_gb  = var.initial_disk_size_gb
        # Disk auto-scaling is managed in Atlas for dedicated tiers (M30+); tune in UI/API if needed.
      }
    }
  }

  # Atlas monitoring is enabled for the project/cluster in the control plane; no extra resource required.
}

# Cloud backup: hourly snapshots, snapshot retention, and PITR restore window.
# See `docs/runbooks/mongodb-restore.md` and SYSTEM-PROMPT (30d retention, monthly test).
resource "mongodbatlas_cloud_backup_schedule" "main" {
  project_id   = mongodbatlas_project.this.id
  cluster_name = mongodbatlas_advanced_cluster.this.name

  reference_hour_of_day    = var.backup_reference_hour_of_day
  reference_minute_of_hour = var.backup_reference_minute_of_hour
  restore_window_days      = var.backup_restore_window_days

  policy_item_hourly {
    frequency_interval = 1
    retention_unit     = "days"
    retention_value    = var.backup_snapshot_retention_days
  }

  depends_on = [mongodbatlas_advanced_cluster.this]
}

# Application user: read + write on app database only.
resource "mongodbatlas_database_user" "app_user" {
  username           = "app_user"
  password             = random_password.app_user.result
  project_id           = mongodbatlas_project.this.id
  auth_database_name   = "admin"
  roles {
    role_name     = "readWrite"
    database_name = var.app_database_name
  }
}

# Admin: schema + index + collection admin (no cluster admin).
resource "mongodbatlas_database_user" "admin_user" {
  username           = "admin_user"
  password             = random_password.admin_user.result
  project_id           = mongodbatlas_project.this.id
  auth_database_name   = "admin"
  roles {
    role_name     = "dbAdmin"
    database_name = var.app_database_name
  }
}

# Read-only: reporting / analytics read paths.
resource "mongodbatlas_database_user" "readonly_user" {
  username           = "readonly_user"
  password             = random_password.readonly_user.result
  project_id           = mongodbatlas_project.this.id
  auth_database_name   = "admin"
  roles {
    role_name     = "read"
    database_name = var.app_database_name
  }
}

# Access from the peered EKS VPC CIDR (in addition to Atlas network + peering).
resource "mongodbatlas_project_ip_access_list" "peered_vpc" {
  project_id = mongodbatlas_project.this.id
  cidr_block = var.eks_vpc_cidr
  comment    = "EKS VPC (peering)"
}
