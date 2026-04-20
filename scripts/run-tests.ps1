param(
  [ValidateSet("all", "unit", "e2e")]
  [string]$Suite = "all"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$nodePath = "C:\Users\Myenn\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if (-not (Test-Path $nodePath)) {
  throw "Node runtime introuvable : $nodePath"
}

$args = @("--test", "--test-isolation=none")

switch ($Suite) {
  "unit" { $args += "tests/unit.test.js" }
  "e2e" { $args += "tests/e2e.test.js" }
  default {
    $args += "tests/unit.test.js"
    $args += "tests/e2e.test.js"
  }
}

Push-Location $projectRoot
try {
  & $nodePath @args
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
