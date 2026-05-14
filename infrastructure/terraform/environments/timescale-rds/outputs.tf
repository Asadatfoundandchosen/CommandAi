output "db_instance_endpoint" {
  value = module.timescale_rds.db_instance_endpoint
}

output "db_instance_port" {
  value = module.timescale_rds.db_instance_port
}

output "database_name" {
  value = module.timescale_rds.database_name
}

output "master_username" {
  value = module.timescale_rds.master_username
}

output "connection_summary" {
  value = module.timescale_rds.connection_summary
}

output "master_password" {
  value     = module.timescale_rds.master_password
  sensitive = true
}
