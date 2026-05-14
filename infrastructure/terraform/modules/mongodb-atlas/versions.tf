terraform {
  required_version = ">= 1.5"

  required_providers {
    mongodbatlas = {
      source  = "mongodb/mongodbatlas"
      version = "~> 1.20"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}
