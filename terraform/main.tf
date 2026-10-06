module "dynamic_modules" {
  source            = "./modules"
  network_name      = docker_network.standard_network.name
  frontend_url      = var.frontend_url
  jwt_secret        = var.jwt_secret
  mcp_enabled       = var.mcp_enabled
  anthropic_api_key = var.anthropic_api_key
}
