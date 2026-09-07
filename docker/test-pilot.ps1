$ErrorActionPreference = 'Stop'
$project = 'convexa-test-' + [guid]::NewGuid().ToString('N').Substring(0,10)
$env:POSTGRES_PASSWORD = [guid]::NewGuid().ToString('N')
$env:APP_DB_PASSWORD = [guid]::NewGuid().ToString('N')
$env:JWT_SECRET = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
$env:INTERNAL_API_KEY = [guid]::NewGuid().ToString('N')
$env:CORS_ORIGINS = 'https://api-convexa.altvia.cloud'
$env:APP_URL = 'https://api-convexa.altvia.cloud'
$env:TEST_PASSWORD = [guid]::NewGuid().ToString('N')
try {
  docker compose -p $project -f docker-compose.dokploy.yml up -d --build --wait --wait-timeout 180
  if ($LASTEXITCODE -ne 0) { throw 'Containers failed readiness' }
  Get-Content docker/smoke.mjs -Raw | docker compose -p $project -f docker-compose.dokploy.yml exec -T -e TEST_PASSWORD -e TEST_PHASE=create api node --input-type=module
  if ($LASTEXITCODE -ne 0) { throw 'Initial smoke failed' }
  docker compose -p $project -f docker-compose.dokploy.yml up -d --force-recreate --wait --wait-timeout 180
  if ($LASTEXITCODE -ne 0) { throw 'Recreate failed' }
  Get-Content docker/smoke.mjs -Raw | docker compose -p $project -f docker-compose.dokploy.yml exec -T -e TEST_PASSWORD -e TEST_PHASE=verify api node --input-type=module
  if ($LASTEXITCODE -ne 0) { throw 'Persistence smoke failed' }
} finally {
  # Only this newly generated disposable project, never the deployed project.
  docker compose -p $project -f docker-compose.dokploy.yml down -v
  Remove-Item Env:TEST_PASSWORD,Env:POSTGRES_PASSWORD,Env:APP_DB_PASSWORD,Env:JWT_SECRET,Env:INTERNAL_API_KEY
}
