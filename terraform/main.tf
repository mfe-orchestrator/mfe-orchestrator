module "dynamic_modules" {
  source       = "./modules"
  network_name = docker_network.standard_network.name
}
