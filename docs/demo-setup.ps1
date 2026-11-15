# Run (hidden) by demo.tape: a throwaway project with one key in its manifest.
$KK = Join-Path $PWD 'bin\keepkeys.js'
$dir = Join-Path ([IO.Path]::GetTempPath()) ("keepkeys-demo-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory $dir | Out-Null
Set-Location $dir
git init -q
@'
# Stripe secret key for the API server
# where: https://dashboard.stripe.com/apikeys
# to: .env.local, server/.dev.vars
STRIPE_SECRET_KEY=
'@ | Set-Content -Encoding ascii .env.example
function global:keepkeys { node $KK @args }
function global:prompt { "$([char]27)[1;32m`$$([char]27)[0m " }
Clear-Host
