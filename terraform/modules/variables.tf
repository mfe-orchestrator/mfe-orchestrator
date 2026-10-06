variable "network_name" {
  type = string
}

variable "frontend_url" {
  type = string
}

variable "jwt_secret" {
  type      = string
  sensitive = true
}

variable "mcp_enabled" {
  type = bool
}

variable "anthropic_api_key" {
  type      = string
  sensitive = true
}
