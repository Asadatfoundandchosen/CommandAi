output "db_instance_identifier" {
  value       = aws_db_instance.this.id
  description = "RDS instance identifier."
}

output "db_instance_endpoint" {
  value       = aws_db_instance.this.address
  description = "Writer hostname for application connection strings."
}

output "db_instance_port" {
  value       = aws_db_instance.this.port
  description = "PostgreSQL port (5432)."
}

output "database_name" {
  value       = aws_db_instance.this.db_name
  description = "Database name created on the instance."
}

output "master_username" {
  value       = aws_db_instance.this.username
  description = "Master username (store password only in Vault)."
}

output "connection_summary" {
  value       = "postgresql://${aws_db_instance.this.username}:<password-from-vault>@${aws_db_instance.this.address}:${aws_db_instance.this.port}/${aws_db_instance.this.db_name}?sslmode=require"
  description = "Template for TIMESCALE_DATABASE_URL — inject password from Vault; never commit."
}

output "master_password" {
  value       = random_password.master.result
  description = "Initial master password — copy once into Vault then rotate; Terraform state is sensitive."
  sensitive   = true
}
