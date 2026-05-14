output "vpc_id" {
  description = "VPC ID — reference from other stacks or data sources"
  value       = module.vpc.vpc_id
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = module.vpc.public_subnet_ids
}

output "private_subnet_ids" {
  description = "Private subnet IDs (typical attach target for internal workloads)"
  value       = module.vpc.private_subnet_ids
}

output "security_group_ids" {
  description = "VPC baseline security group IDs (from vpc module)"
  value       = module.vpc.security_group_ids
}

output "sg_web_id" {
  description = "Web tier security group ID"
  value       = module.security_groups.sg_web_id
}

output "sg_api_id" {
  description = "API tier security group ID"
  value       = module.security_groups.sg_api_id
}

output "sg_db_id" {
  description = "Database tier security group ID"
  value       = module.security_groups.sg_db_id
}

output "sg_internal_id" {
  description = "Internal mesh security group ID"
  value       = module.security_groups.sg_internal_id
}

output "application_security_group_ids" {
  description = "Map of application security group names to IDs"
  value       = module.security_groups.security_group_ids
}

output "nat_gateway_ids" {
  description = "NAT Gateway IDs"
  value       = module.vpc.nat_gateway_ids
}

output "public_route_table_id" {
  description = "Public route table ID"
  value       = module.vpc.public_route_table_id
}

output "private_route_table_ids" {
  description = "Private route table IDs"
  value       = module.vpc.private_route_table_ids
}
