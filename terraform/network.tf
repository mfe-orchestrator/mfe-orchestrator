# https://registry.terraform.io/providers/kreuzwerker/docker/latest/docs/resources/network
resource "docker_network" "standard_network" {
  name = "microfrontend-orchestrator-hub"
}

output "network_name" {
  value = docker_network.standard_network.name
}