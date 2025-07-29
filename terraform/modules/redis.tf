resource "docker_image" "redis" {
  name         = "docker.io/library/redis:8.0.2-alpine"
  keep_locally = true
}
resource "docker_container" "redis" {
  name     = "mfe-redis"
  hostname = "mfe-redis"
  image    = docker_image.redis.image_id
  command  = ["redis-server", "--save", "60", "1", "--loglevel", "warning"]
  restart  = "unless-stopped"
    networks_advanced {
    name = var.network_name
  }
  healthcheck {
    test         = ["CMD-SHELL", "redis-cli ping | grep PONG"]
    interval     = "30s"
    retries      = 5
    start_period = "20s"
    timeout      = "3s"
  }
  volumes {
    host_path      = abspath("${path.root}/volumes/redis")
    container_path = "/data"
  }
}