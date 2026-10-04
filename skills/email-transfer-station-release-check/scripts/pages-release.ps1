[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateSet('Immediate', 'Prepare', 'Verify', 'Preflight', 'Deploy')]
    [string]$Action,

    [string]$ManifestPath,

    [string]$ProductRoot,
    [string[]]$ValidationEvidence = @(),
    [switch]$EnvironmentSmokeRequired,
    [string]$EnvironmentSmokeEvidence,
    [switch]$DryRun,
    [switch]$AuthorizeDeploy,
    [switch]$ConfirmDevelopmentValidated,
    [string]$PreflightFixturePath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:Clock = [Diagnostics.Stopwatch]::StartNew()
$script:Schema = 'email-transfer-station-pages-readiness/v2'
$script:ReceiptSchema = 'email-transfer-station-pages-release-receipt/v2'
$script:WorkspaceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\..')).TrimEnd('\')
$script:PrivateTmpRoot = [IO.Path]::GetFullPath((Join-Path $script:WorkspaceRoot 'output\release')).TrimEnd('\')
$script:CanonicalProductRoot = $script:WorkspaceRoot

function Write-JsonResult {
    param([Parameter(Mandatory)]$Value)
    $Value | ConvertTo-Json -Depth 12 -Compress
}

function Stop-Release {
    param(
        [Parameter(Mandatory)][string[]]$Reasons,
        [string]$Status = 'RELEASE_NOT_READY',
        [int]$ExitCode = 20
    )
    Write-JsonResult ([ordered]@{
        status = $Status
        reasons = @($Reasons)
        elapsed_ms = $script:Clock.ElapsedMilliseconds
    })
    exit $ExitCode
}

function Get-SafeReason {
    param([Parameter(Mandatory)][string]$Message)
    $allowed = @(
        'candidate_not_clean', 'candidate_not_isolated_under_private_tmp',
        'candidate_root_mismatch', 'cloudflare_api_failed',
        'canonical_branch_not_main', 'canonical_root_mismatch',
        'credential_key_missing', 'credential_source_missing',
        'directory_missing', 'entry_asset_missing', 'entry_asset_not_found',
        'git_command_failed', 'pages_config_unrecognized',
        'pages_functions_empty', 'pages_output_mismatch',
        'path_missing', 'prepared_input_missing', 'process_start_failed',
        'wrangler_auth_failed', 'wrangler_binary_missing',
        'wrangler_metadata_invalid', 'wrangler_metadata_missing'
    )
    if ($allowed -contains $Message) { return $Message }
    return 'workflow_or_schema_error'
}

function Resolve-FullPath {
    param([Parameter(Mandatory)][string]$Path, [switch]$AllowMissing)
    $full = [IO.Path]::GetFullPath($Path).TrimEnd('\')
    if (-not $AllowMissing -and -not (Test-Path -LiteralPath $full)) {
        Stop-Release @('path_missing')
    }
    return $full
}

function Test-IsBelow {
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Parent)
    return $Path.StartsWith($Parent.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)
}

function Get-StringSha256 {
    param([Parameter(Mandatory)][AllowEmptyString()][string]$Value)
    $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
    return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
}

function Get-FileSha256 {
    param([Parameter(Mandatory)][string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Invoke-ProcessCapture {
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [Parameter(Mandatory)][string[]]$Arguments,
        [Parameter(Mandatory)][string]$WorkingDirectory,
        [int]$TimeoutSeconds = 30,
        [hashtable]$Environment = @{}
    )
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $FilePath
    $start.WorkingDirectory = $WorkingDirectory
    $start.UseShellExecute = $false
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.CreateNoWindow = $true
    foreach ($argument in $Arguments) {
        [void]$start.ArgumentList.Add($argument)
    }
    foreach ($entry in $Environment.GetEnumerator()) {
        $start.Environment[$entry.Key] = [string]$entry.Value
    }
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $start
    if (-not $process.Start()) {
        throw 'process_start_failed'
    }
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
        $process.Kill($true)
        $process.WaitForExit()
        return [pscustomobject]@{ ExitCode = $null; Stdout = ''; Stderr = ''; TimedOut = $true }
    }
    return [pscustomobject]@{
        ExitCode = $process.ExitCode
        Stdout = $stdout.GetAwaiter().GetResult()
        Stderr = $stderr.GetAwaiter().GetResult()
        TimedOut = $false
    }
}

function Invoke-Git {
    param([Parameter(Mandatory)][string]$Root, [Parameter(Mandatory)][string[]]$Arguments)
    $result = Invoke-ProcessCapture -FilePath 'git' -Arguments (@('-C', $Root) + $Arguments) -WorkingDirectory $Root
    if ($result.TimedOut -or $result.ExitCode -ne 0) {
        throw 'git_command_failed'
    }
    return $result.Stdout.Trim()
}

function Get-DirectoryFingerprint {
    param([Parameter(Mandatory)][string]$Root)
    if (-not (Test-Path -LiteralPath $Root -PathType Container)) {
        throw 'directory_missing'
    }
    $files = @(Get-ChildItem -LiteralPath $Root -File -Recurse | Sort-Object {
        [IO.Path]::GetRelativePath($Root, $_.FullName).Replace('\', '/')
    })
    $records = foreach ($file in $files) {
        $relative = [IO.Path]::GetRelativePath($Root, $file.FullName).Replace('\', '/')
        '{0}`t{1}`t{2}' -f $relative, $file.Length, (Get-FileSha256 $file.FullName)
    }
    return [pscustomobject]@{
        fingerprint = Get-StringSha256 ($records -join "`n")
        file_count = $files.Count
    }
}

function Get-PagesConfig {
    param([Parameter(Mandatory)][string]$Path)
    $text = Get-Content -Raw -LiteralPath $Path
    $project = [regex]::Match($text, '(?m)^\s*name\s*=\s*"(?<v>[^"]+)"\s*$')
    $output = [regex]::Match($text, '(?m)^\s*pages_build_output_dir\s*=\s*"(?<v>[^"]+)"\s*$')
    $backend = $null
    foreach ($block in [regex]::Matches($text, '(?ms)^\s*\[\[services\]\]\s*(?<body>.*?)(?=^\s*\[\[|\z)')) {
        $body = $block.Groups['body'].Value
        $binding = [regex]::Match($body, '(?m)^\s*binding\s*=\s*"(?<v>[^"]+)"\s*$')
        if ($binding.Success -and $binding.Groups['v'].Value -eq 'BACKEND') {
            $service = [regex]::Match($body, '(?m)^\s*service\s*=\s*"(?<v>[^"]+)"\s*$')
            $environment = [regex]::Match($body, '(?m)^\s*environment\s*=\s*"(?<v>[^"]+)"\s*$')
            if ($service.Success -and $environment.Success) {
                $backend = [pscustomobject]@{ service = $service.Groups['v'].Value; environment = $environment.Groups['v'].Value }
            }
        }
    }
    if (-not $project.Success -or -not $output.Success -or $null -eq $backend) {
        throw 'pages_config_unrecognized'
    }
    if ($output.Groups['v'].Value.Replace('\', '/') -ne '../frontend/dist') {
        throw 'pages_output_mismatch'
    }
    return [pscustomobject]@{
        project = $project.Groups['v'].Value
        output = $output.Groups['v'].Value.Replace('\', '/')
        backend_service = $backend.service
        backend_environment = $backend.environment
        sha256 = Get-FileSha256 $Path
    }
}

function Get-WranglerInfo {
    param([Parameter(Mandatory)][string]$PagesRoot)
    $binaryPath = Join-Path $PagesRoot 'node_modules\wrangler\bin\wrangler.js'
    $packagePath = Join-Path $PagesRoot 'node_modules\wrangler\package.json'
    if (-not (Test-Path -LiteralPath $binaryPath -PathType Leaf)) {
        throw 'wrangler_binary_missing'
    }
    if (-not (Test-Path -LiteralPath $packagePath -PathType Leaf)) {
        throw 'wrangler_metadata_missing'
    }
    try {
        $package = Get-Content -Raw -LiteralPath $packagePath | ConvertFrom-Json
        if ($package.name -ne 'wrangler' -or [string]::IsNullOrWhiteSpace([string]$package.version)) {
            throw 'wrangler_metadata_invalid'
        }
    } catch {
        throw 'wrangler_metadata_invalid'
    }
    return [pscustomobject]@{
        version = [string]$package.version
        binary_sha256 = Get-FileSha256 $binaryPath
        package_sha256 = Get-FileSha256 $packagePath
    }
}

function Get-CandidateSnapshot {
    param([Parameter(Mandatory)][string]$Root, [switch]$Canonical)
    $root = Resolve-FullPath $Root
    if ($Canonical) {
        if ($root -ne $script:CanonicalProductRoot) { throw 'canonical_root_mismatch' }
    } elseif (-not (Test-IsBelow $root $script:PrivateTmpRoot) -or $root -eq $script:CanonicalProductRoot) {
        throw 'candidate_not_isolated_under_private_tmp'
    }
    if ((Invoke-Git $root @('status', '--porcelain=v1')).Length -ne 0) {
        throw 'candidate_not_clean'
    }
    $top = Resolve-FullPath (Invoke-Git $root @('rev-parse', '--show-toplevel'))
    if ($top -ne $root) {
        throw 'candidate_root_mismatch'
    }
    $configPath = Join-Path $root 'pages\wrangler.toml'
    $pagesPath = Join-Path $root 'pages'
    $functionsPath = Join-Path $root 'pages\functions'
    $distPath = Join-Path $root 'frontend\dist'
    $indexPath = Join-Path $distPath 'index.html'
    foreach ($required in @($configPath, $functionsPath, $distPath, $indexPath)) {
        if (-not (Test-Path -LiteralPath $required)) {
            throw 'prepared_input_missing'
        }
    }
    $config = Get-PagesConfig $configPath
    $wrangler = Get-WranglerInfo $pagesPath
    $functions = Get-DirectoryFingerprint $functionsPath
    if ($functions.file_count -lt 1) {
        throw 'pages_functions_empty'
    }
    $dist = Get-DirectoryFingerprint $distPath
    $index = Get-Content -Raw -LiteralPath $indexPath
    $entryMatch = [regex]::Match($index, '<script[^>]+src=["''](?<src>/assets/index-[^"'']+\.js)["'']')
    if (-not $entryMatch.Success) {
        throw 'entry_asset_not_found'
    }
    $entryRelative = $entryMatch.Groups['src'].Value.TrimStart('/').Replace('/', '\')
    $entryPath = [IO.Path]::GetFullPath((Join-Path $distPath $entryRelative))
    if (-not (Test-IsBelow $entryPath $distPath) -or -not (Test-Path -LiteralPath $entryPath -PathType Leaf)) {
        throw 'entry_asset_missing'
    }
    $branch = Invoke-Git $root @('rev-parse', '--abbrev-ref', 'HEAD')
    if ($Canonical -and $branch -ne 'main') { throw 'canonical_branch_not_main' }
    return [pscustomobject]@{
        root = $root
        relative_root = [IO.Path]::GetRelativePath($script:WorkspaceRoot, $root).Replace('\', '/')
        head = Invoke-Git $root @('rev-parse', 'HEAD')
        tree = Invoke-Git $root @('rev-parse', 'HEAD^{tree}')
        base = Invoke-Git $root @('rev-parse', 'HEAD^')
        branch = $branch
        pages = $config
        wrangler = $wrangler
        functions = $functions
        dist = $dist
        entry = [pscustomobject]@{
            path = '/' + $entryRelative.Replace('\', '/')
            sha256 = Get-FileSha256 $entryPath
        }
    }
}

function Get-SnapshotIdentity {
    param([Parameter(Mandatory)]$Snapshot)
    $values = @(
        $Snapshot.head, $Snapshot.tree, $Snapshot.base, $Snapshot.branch,
        $Snapshot.pages.project, $Snapshot.pages.output,
        $Snapshot.pages.backend_service, $Snapshot.pages.backend_environment,
        $Snapshot.pages.sha256, $Snapshot.wrangler.version,
        $Snapshot.wrangler.binary_sha256, $Snapshot.wrangler.package_sha256,
        $Snapshot.functions.fingerprint, [string]$Snapshot.functions.file_count,
        $Snapshot.dist.fingerprint, [string]$Snapshot.dist.file_count,
        $Snapshot.entry.path, $Snapshot.entry.sha256
    )
    return Get-StringSha256 ($values -join "`n")
}

function New-ReadinessRecord {
    param(
        [Parameter(Mandatory)]$Snapshot,
        [string[]]$Evidence = @(),
        [bool]$SmokeRequired = $false,
        [AllowNull()][string]$SmokeEvidence = $null
    )
    return [ordered]@{
        schema = $script:Schema
        status = 'READY'
        prepared_at_utc = [datetime]::UtcNow.ToString('o')
        candidate = [ordered]@{ relative_path = $Snapshot.relative_root }
        project = [ordered]@{
            name = $Snapshot.pages.project
            backend = [ordered]@{ service = $Snapshot.pages.backend_service; environment = $Snapshot.pages.backend_environment }
        }
        git = [ordered]@{ head = $Snapshot.head; tree = $Snapshot.tree; base = $Snapshot.base; branch = $Snapshot.branch }
        inputs = [ordered]@{
            pages_config_sha256 = $Snapshot.pages.sha256
            wrangler = [ordered]@{
                version = $Snapshot.wrangler.version
                binary_sha256 = $Snapshot.wrangler.binary_sha256
                package_sha256 = $Snapshot.wrangler.package_sha256
            }
            functions_fingerprint = $Snapshot.functions.fingerprint
            functions_file_count = $Snapshot.functions.file_count
        }
        artifact = [ordered]@{
            dist_fingerprint = $Snapshot.dist.fingerprint
            dist_file_count = $Snapshot.dist.file_count
            entry = [ordered]@{ path = $Snapshot.entry.path; sha256 = $Snapshot.entry.sha256 }
        }
        validation = [ordered]@{
            evidence = @($Evidence)
            environment_sensitive_smoke = [ordered]@{ required = $SmokeRequired; evidence = $SmokeEvidence }
        }
    }
}

function Write-ReleaseReceipt {
    param(
        [Parameter(Mandatory)]$Manifest,
        [Parameter(Mandatory)]$Preflight,
        [Parameter(Mandatory)][string[]]$DeploymentUrls,
        [Parameter(Mandatory)]$Acceptance
    )
    $receiptRoot = Join-Path $script:PrivateTmpRoot 'receipts'
    [void](New-Item -ItemType Directory -Path $receiptRoot -Force)
    $receiptPath = Join-Path $receiptRoot ('{0}-{1}.json' -f $Manifest.git.head, [datetime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ'))
    [ordered]@{
        schema = $script:ReceiptSchema
        status = if ($Acceptance.passed) { 'ACCEPTED' } else { 'ACCEPTANCE_FAILED' }
        recorded_at_utc = [datetime]::UtcNow.ToString('o')
        git = [ordered]@{ head = $Manifest.git.head; tree = $Manifest.git.tree; base = $Manifest.git.base; branch = $Manifest.git.branch }
        artifact = [ordered]@{
            dist_fingerprint = $Manifest.artifact.dist_fingerprint
            dist_file_count = $Manifest.artifact.dist_file_count
            entry = [ordered]@{ path = $Manifest.artifact.entry.path; sha256 = $Manifest.artifact.entry.sha256 }
        }
        inputs = [ordered]@{
            pages_config_sha256 = $Manifest.inputs.pages_config_sha256
            functions_fingerprint = $Manifest.inputs.functions_fingerprint
            functions_file_count = $Manifest.inputs.functions_file_count
            wrangler = [ordered]@{
                version = $Manifest.inputs.wrangler.version
                binary_sha256 = $Manifest.inputs.wrangler.binary_sha256
                package_sha256 = $Manifest.inputs.wrangler.package_sha256
            }
        }
        preflight = [ordered]@{
            project_name = $Preflight.project_name
            production_branch = $Preflight.production_branch
            backend_service = $Preflight.backend_service
            backend_environment = $Preflight.backend_environment
            rollback = $Preflight.rollback
        }
        deployment = [ordered]@{ urls = @($DeploymentUrls); commit_hash = $Manifest.git.head; branch = $Preflight.production_branch }
        acceptance = $Acceptance
        upload_attempts = 1
    } | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $receiptPath -Encoding utf8
    return [IO.Path]::GetRelativePath($script:WorkspaceRoot, $receiptPath).Replace('\', '/')
}

function Read-ReadinessManifest {
    param([Parameter(Mandatory)][string]$Path)
    try {
        $manifest = Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json
        if ($manifest.schema -ne $script:Schema -or $manifest.status -ne 'READY') {
            throw 'schema'
        }
        return $manifest
    } catch {
        Stop-Release @('manifest_invalid')
    }
}

function Resolve-CandidateFromManifest {
    param([Parameter(Mandatory)]$Manifest)
    if ($ProductRoot) {
        return Resolve-FullPath $ProductRoot
    }
    try {
        return Resolve-FullPath (Join-Path $script:WorkspaceRoot ([string]$Manifest.candidate.relative_path))
    } catch {
        Stop-Release @('candidate_path_unavailable')
    }
}

function Test-Readiness {
    param([Parameter(Mandatory)]$Manifest, [Parameter(Mandatory)][string]$Root)
    $reasons = [Collections.Generic.List[string]]::new()
    try {
        $current = Get-CandidateSnapshot $Root
    } catch {
        $reasons.Add($_.Exception.Message)
        return [pscustomobject]@{ Ready = $false; Reasons = @($reasons); Snapshot = $null }
    }
    $checks = @(
        @('git_head_mismatch', [string]$Manifest.git.head, $current.head),
        @('git_tree_mismatch', [string]$Manifest.git.tree, $current.tree),
        @('git_base_mismatch', [string]$Manifest.git.base, $current.base),
        @('git_branch_mismatch', [string]$Manifest.git.branch, $current.branch),
        @('project_config_mismatch', [string]$Manifest.project.name, $current.pages.project),
        @('backend_service_config_mismatch', [string]$Manifest.project.backend.service, $current.pages.backend_service),
        @('backend_environment_config_mismatch', [string]$Manifest.project.backend.environment, $current.pages.backend_environment),
        @('pages_config_mismatch', [string]$Manifest.inputs.pages_config_sha256, $current.pages.sha256),
        @('wrangler_version_mismatch', [string]$Manifest.inputs.wrangler.version, $current.wrangler.version),
        @('wrangler_binary_mismatch', [string]$Manifest.inputs.wrangler.binary_sha256, $current.wrangler.binary_sha256),
        @('wrangler_package_mismatch', [string]$Manifest.inputs.wrangler.package_sha256, $current.wrangler.package_sha256),
        @('functions_mismatch', [string]$Manifest.inputs.functions_fingerprint, $current.functions.fingerprint),
        @('functions_count_mismatch', [string]$Manifest.inputs.functions_file_count, [string]$current.functions.file_count),
        @('dist_mismatch', [string]$Manifest.artifact.dist_fingerprint, $current.dist.fingerprint),
        @('dist_count_mismatch', [string]$Manifest.artifact.dist_file_count, [string]$current.dist.file_count),
        @('entry_path_mismatch', [string]$Manifest.artifact.entry.path, $current.entry.path),
        @('entry_hash_mismatch', [string]$Manifest.artifact.entry.sha256, $current.entry.sha256)
    )
    foreach ($check in $checks) {
        if ($check[1] -ne $check[2]) {
            $reasons.Add($check[0])
        }
    }
    if (@($Manifest.validation.evidence).Count -lt 1) {
        $reasons.Add('validation_evidence_missing')
    }
    if ([bool]$Manifest.validation.environment_sensitive_smoke.required -and
        [string]::IsNullOrWhiteSpace([string]$Manifest.validation.environment_sensitive_smoke.evidence)) {
        $reasons.Add('environment_smoke_evidence_missing')
    }
    return [pscustomobject]@{ Ready = $reasons.Count -eq 0; Reasons = @($reasons); Snapshot = $current }
}

function Get-PropertyValue {
    param($Object, [Parameter(Mandatory)][string]$Name)
    if ($null -eq $Object) { return $null }
    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) { return $null }
    return $property.Value
}

function Find-BackendBinding {
    param($Node, [int]$Depth = 0)
    if ($null -eq $Node -or $Depth -gt 8 -or $Node -is [string] -or $Node -is [ValueType]) {
        return $null
    }
    $direct = Get-PropertyValue $Node 'BACKEND'
    if ($null -ne $direct) { return $direct }
    $binding = Get-PropertyValue $Node 'binding'
    $name = Get-PropertyValue $Node 'name'
    if ($binding -eq 'BACKEND' -or $name -eq 'BACKEND') { return $Node }
    if ($Node -is [Collections.IEnumerable]) {
        foreach ($child in $Node) {
            $found = Find-BackendBinding $child ($Depth + 1)
            if ($null -ne $found) { return $found }
        }
        return $null
    }
    foreach ($property in $Node.PSObject.Properties) {
        $found = Find-BackendBinding $property.Value ($Depth + 1)
        if ($null -ne $found) { return $found }
    }
    return $null
}

function Read-PrivateCredentials {
    $credentialFile = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.config\email-transfer-station\cloudflare.env'
    if (-not (Test-Path -LiteralPath $credentialFile -PathType Leaf)) {
        throw 'credential_source_missing'
    }
    $values = @{}
    foreach ($line in Get-Content -LiteralPath $credentialFile) {
        $match = [regex]::Match($line, '^\s*(?:export\s+)?(?<key>[A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?<value>.*?)\s*$')
        if (-not $match.Success) { continue }
        $value = $match.Groups['value'].Value
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        $values[$match.Groups['key'].Value] = $value
    }
    foreach ($required in @('CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN')) {
        if (-not $values.ContainsKey($required) -or [string]::IsNullOrWhiteSpace([string]$values[$required])) {
            throw 'credential_key_missing'
        }
    }
    return [pscustomobject]@{ AccountId = $values.CLOUDFLARE_ACCOUNT_ID; Token = $values.CLOUDFLARE_API_TOKEN }
}

function ConvertTo-SafeDeployment {
    param($Deployment)
    $trigger = Get-PropertyValue $Deployment 'deployment_trigger'
    $metadata = Get-PropertyValue $trigger 'metadata'
    return [ordered]@{
        id = Get-PropertyValue $Deployment 'id'
        url = Get-PropertyValue $Deployment 'url'
        created_on = Get-PropertyValue $Deployment 'created_on'
        branch = Get-PropertyValue $metadata 'branch'
        commit_hash = Get-PropertyValue $metadata 'commit_hash'
    }
}

function ConvertTo-AcceptanceUrl {
    param($Value)
    $text = ([string]$Value).Trim()
    if ([string]::IsNullOrWhiteSpace($text)) { return $null }
    if ($text -notmatch '^https://') { $text = 'https://' + $text.TrimStart('/') }
    try {
        $uri = [Uri]$text
        if ($uri.Scheme -ne 'https' -or [string]::IsNullOrWhiteSpace($uri.Host)) { return $null }
        return $uri.GetLeftPart([UriPartial]::Authority).TrimEnd('/')
    } catch {
        return $null
    }
}

function Invoke-AcceptanceGet {
    param([Parameter(Mandatory)]$Client, [Parameter(Mandatory)][string]$Url)
    $response = $null
    try {
        $response = $Client.GetAsync($Url).GetAwaiter().GetResult()
        return [pscustomobject]@{
            status = [int]$response.StatusCode
            content_type = [string]$response.Content.Headers.ContentType.MediaType
            bytes = $response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
        }
    } catch {
        return [pscustomobject]@{ status = 0; content_type = ''; bytes = [byte[]]@() }
    } finally {
        if ($null -ne $response) { $response.Dispose() }
    }
}

function Test-ReleaseAcceptance {
    param(
        [Parameter(Mandatory)]$Manifest,
        [Parameter(Mandatory)][string[]]$Targets
    )
    $normalizedTargets = @($Targets | ForEach-Object { ConvertTo-AcceptanceUrl $_ } | Where-Object { $_ } | Sort-Object -Unique)
    if ($normalizedTargets.Count -eq 0) {
        return [pscustomobject]@{ passed = $false; checked_at_utc = [datetime]::UtcNow.ToString('o'); attempts = 0; targets = @(); checks = @(); reasons = @('acceptance_target_missing') }
    }
    $client = [Net.Http.HttpClient]::new()
    $client.Timeout = [TimeSpan]::FromSeconds(5)
    $client.DefaultRequestHeaders.UserAgent.ParseAdd('email-transfer-station-release-check/1')
    try {
        for ($attempt = 1; $attempt -le 3; $attempt++) {
            $checks = [Collections.Generic.List[object]]::new()
            foreach ($target in $normalizedTargets) {
                $root = Invoke-AcceptanceGet $client ($target + '/')
                $rootText = if ($root.status -eq 200) { [Text.Encoding]::UTF8.GetString($root.bytes) } else { '' }
                $checks.Add([ordered]@{ target = $target; name = 'root'; status = $root.status; passed = ($root.status -eq 200 -and $rootText.Contains([string]$Manifest.artifact.entry.path)) })
                if ($root.status -ne 200) { continue }

                $admin = Invoke-AcceptanceGet $client ($target + '/admin')
                $checks.Add([ordered]@{ target = $target; name = 'admin'; status = $admin.status; passed = ($admin.status -eq 200) })
                $settings = Invoke-AcceptanceGet $client ($target + '/open_api/settings')
                $checks.Add([ordered]@{ target = $target; name = 'open_settings'; status = $settings.status; passed = ($settings.status -eq 200) })
                $unauthorized = Invoke-AcceptanceGet $client ($target + '/api/admin/overview')
                $checks.Add([ordered]@{ target = $target; name = 'admin_unauthorized'; status = $unauthorized.status; passed = ($unauthorized.status -eq 401 -and $unauthorized.content_type -eq 'text/plain') })
                $asset = Invoke-AcceptanceGet $client ($target + '/' + ([string]$Manifest.artifact.entry.path).TrimStart('/'))
                $assetHash = if ($asset.status -eq 200) { [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([byte[]]$asset.bytes)).ToLowerInvariant() } else { '' }
                $checks.Add([ordered]@{ target = $target; name = 'entry_asset'; status = $asset.status; passed = ($asset.status -eq 200 -and $assetHash -eq [string]$Manifest.artifact.entry.sha256) })
            }
            $failed = @($checks | Where-Object { -not $_.passed })
            if ($failed.Count -eq 0) {
                return [pscustomobject]@{ passed = $true; checked_at_utc = [datetime]::UtcNow.ToString('o'); attempts = $attempt; targets = $normalizedTargets; checks = @($checks); reasons = @() }
            }
            if ($attempt -lt 3) { Start-Sleep -Seconds 2 }
        }
        return [pscustomobject]@{
            passed = $false
            checked_at_utc = [datetime]::UtcNow.ToString('o')
            attempts = 3
            targets = $normalizedTargets
            checks = @($checks)
            reasons = @($failed | ForEach-Object { '{0}:{1}' -f $_.target, $_.name })
        }
    } finally {
        $client.Dispose()
    }
}

function Get-CloudflarePreflight {
    param([Parameter(Mandatory)]$Manifest, [Parameter(Mandatory)][string]$Root)
    $source = 'live'
    if ($PreflightFixturePath) {
        $source = 'fixture'
        try {
            $fixturePath = Resolve-FullPath $PreflightFixturePath
            if (-not (Test-IsBelow $fixturePath $script:PrivateTmpRoot)) {
                Stop-Release @('preflight_fixture_must_be_under_private_tmp')
            }
            $fixtureText = Get-Content -Raw -LiteralPath $fixturePath
            if ($fixtureText -match '(?i)"(?:api[_-]?token|authorization|password|secret)"\s*:') {
                Stop-Release @('preflight_fixture_not_sanitized')
            }
            $fixture = $fixtureText | ConvertFrom-Json
            $project = $fixture.project
            $deployments = @($fixture.deployments)
        } catch {
            if ($_.Exception.Message -in @('preflight_fixture_must_be_under_private_tmp', 'preflight_fixture_not_sanitized')) { throw }
            Stop-Release @('preflight_fixture_invalid')
        }
    } else {
        $wrangler = Join-Path $Root 'pages\node_modules\wrangler\bin\wrangler.js'
        if (-not (Test-Path -LiteralPath $wrangler -PathType Leaf)) {
            Stop-Release @('wrangler_not_prepared')
        }
        try {
            $credentials = Read-PrivateCredentials
            $childEnvironment = @{
                CLOUDFLARE_ACCOUNT_ID = $credentials.AccountId
                CLOUDFLARE_API_TOKEN = $credentials.Token
            }
            $whoami = Invoke-ProcessCapture -FilePath 'node' -Arguments @($wrangler, 'whoami') -WorkingDirectory (Join-Path $Root 'pages') -TimeoutSeconds 30 -Environment $childEnvironment
            if ($whoami.TimedOut -or $whoami.ExitCode -ne 0) {
                throw 'wrangler_auth_failed'
            }
            $headers = @{ Authorization = 'Bearer ' + $credentials.Token }
            $projectUri = 'https://api.cloudflare.com/client/v4/accounts/{0}/pages/projects/{1}' -f $credentials.AccountId, $Manifest.project.name
            $deploymentsUri = $projectUri + '/deployments?env=production&per_page=5'
            $projectPayload = Invoke-RestMethod -Method Get -Uri $projectUri -Headers $headers -TimeoutSec 30
            $deploymentsPayload = Invoke-RestMethod -Method Get -Uri $deploymentsUri -Headers $headers -TimeoutSec 30
            if (-not $projectPayload.success -or -not $deploymentsPayload.success) {
                throw 'cloudflare_api_failed'
            }
            $project = $projectPayload.result
            $deployments = @($deploymentsPayload.result)
        } catch {
            Stop-Release @((Get-SafeReason $_.Exception.Message))
        } finally {
            $credentials = $null
            $headers = $null
        }
    }
    $projectName = Get-PropertyValue $project 'name'
    $productionBranch = Get-PropertyValue $project 'production_branch'
    $configs = Get-PropertyValue $project 'deployment_configs'
    $production = Get-PropertyValue $configs 'production'
    $backend = Find-BackendBinding $production
    $service = Get-PropertyValue $backend 'service'
    if ($null -eq $service) { $service = Get-PropertyValue $backend 'service_name' }
    $environment = Get-PropertyValue $backend 'environment'
    if ($null -eq $environment) { $environment = Get-PropertyValue $backend 'environment_name' }
    $latest = @($deployments | Where-Object { (Get-PropertyValue $_ 'environment') -eq 'production' } | Sort-Object {
        [datetime](Get-PropertyValue $_ 'created_on')
    } -Descending | Select-Object -First 1)
    $reasons = [Collections.Generic.List[string]]::new()
    if ($projectName -ne $Manifest.project.name) { $reasons.Add('project_mismatch') }
    if ([string]::IsNullOrWhiteSpace([string]$productionBranch)) { $reasons.Add('production_branch_missing') }
    if ($service -ne $Manifest.project.backend.service -or $environment -ne $Manifest.project.backend.environment) { $reasons.Add('backend_mismatch') }
    if ($latest.Count -ne 1) { $reasons.Add('rollback_anchor_missing') }
    if ($reasons.Count -gt 0) { Stop-Release @($reasons) }
    $acceptanceUrls = @(
        @(Get-PropertyValue $project 'subdomain')
        @(Get-PropertyValue $project 'domains')
    ) | ForEach-Object { ConvertTo-AcceptanceUrl $_ } | Where-Object { $_ } | Sort-Object -Unique
    return [pscustomobject]@{
        source = $source
        project_name = [string]$projectName
        production_branch = [string]$productionBranch
        backend_service = [string]$service
        backend_environment = [string]$environment
        rollback = ConvertTo-SafeDeployment $latest[0]
        acceptance_urls = @($acceptanceUrls)
    }
}

function Get-SafeDeployCommand {
    param([Parameter(Mandatory)]$Manifest, [Parameter(Mandatory)]$Preflight)
    return @(
        'wrangler', 'pages', 'deploy', '../frontend/dist',
        '--project-name', [string]$Manifest.project.name,
        '--branch', [string]$Preflight.production_branch,
        '--commit-hash', [string]$Manifest.git.head
    )
}

try {
    $immediate = $Action -eq 'Immediate'
    $initialSnapshotIdentity = $null
    if ($immediate) {
        if ($ManifestPath -or $ProductRoot -or $ValidationEvidence.Count -gt 0) { Stop-Release @('immediate_does_not_accept_manifest_candidate_or_evidence') }
        if (-not $ConfirmDevelopmentValidated) { Stop-Release @('development_validation_confirmation_required') }
        if ($DryRun -and -not $PreflightFixturePath) { Stop-Release @('dry_run_requires_sanitized_fixture') }
        if (-not $DryRun -and $PreflightFixturePath) { Stop-Release @('fixture_forbidden_for_live_deploy') }
        if (-not $DryRun -and -not $AuthorizeDeploy) { Stop-Release @('explicit_deploy_authorization_switch_required') }
        $root = $script:CanonicalProductRoot
        $snapshot = Get-CandidateSnapshot $root -Canonical
        $initialSnapshotIdentity = Get-SnapshotIdentity $snapshot
        $manifest = New-ReadinessRecord -Snapshot $snapshot -Evidence @('same-task development validation confirmed')
    } else {
        if ([string]::IsNullOrWhiteSpace($ManifestPath)) { Stop-Release @('manifest_path_required') }
        $manifestFull = Resolve-FullPath $ManifestPath -AllowMissing
        if (-not (Test-IsBelow $manifestFull $script:PrivateTmpRoot)) {
            Stop-Release @('manifest_must_be_under_private_tmp')
        }

        if ($Action -eq 'Prepare') {
            if (-not $ProductRoot) { Stop-Release @('candidate_path_required') }
            if (Test-IsBelow $manifestFull (Resolve-FullPath $ProductRoot)) { Stop-Release @('manifest_must_be_outside_candidate') }
            if ($ValidationEvidence.Count -lt 1) { Stop-Release @('validation_evidence_required') }
            $evidence = foreach ($item in $ValidationEvidence) {
                $clean = $item.Trim()
                if ($clean.Length -lt 1 -or $clean.Length -gt 200 -or $clean -match '[\r\n]' -or $clean -match '(?i)(api[_-]?token|authorization|password|secret)\s*[:=]') {
                    Stop-Release @('validation_evidence_not_sanitized')
                }
                $clean
            }
            if ($EnvironmentSmokeRequired -and [string]::IsNullOrWhiteSpace($EnvironmentSmokeEvidence)) {
                Stop-Release @('environment_smoke_evidence_required')
            }
            $snapshot = Get-CandidateSnapshot $ProductRoot
            $manifest = New-ReadinessRecord -Snapshot $snapshot -Evidence $evidence `
                -SmokeRequired ([bool]$EnvironmentSmokeRequired) `
                -SmokeEvidence $(if ($EnvironmentSmokeRequired) { $EnvironmentSmokeEvidence.Trim() } else { $null })
            $parent = Split-Path -Parent $manifestFull
            [void](New-Item -ItemType Directory -Path $parent -Force)
            $manifest | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $manifestFull -Encoding utf8
            Write-JsonResult ([ordered]@{
                status = 'READINESS_PREPARED'
                manifest = [IO.Path]::GetRelativePath($script:WorkspaceRoot, $manifestFull).Replace('\', '/')
                git_tree = $snapshot.tree
                entry_asset = $snapshot.entry.path
                entry_sha256 = $snapshot.entry.sha256
                wrangler_version = $snapshot.wrangler.version
                elapsed_ms = $script:Clock.ElapsedMilliseconds
            })
            exit 0
        }

        $manifest = Read-ReadinessManifest $manifestFull
        $root = Resolve-CandidateFromManifest $manifest
        $readiness = Test-Readiness $manifest $root
        if (-not $readiness.Ready) { Stop-Release $readiness.Reasons }
        if ($Action -eq 'Verify') {
            Write-JsonResult ([ordered]@{
                status = 'RELEASE_READY'
                git_tree = $manifest.git.tree
                entry_asset = $manifest.artifact.entry.path
                entry_sha256 = $manifest.artifact.entry.sha256
                wrangler_version = $manifest.inputs.wrangler.version
                environment_smoke_required = [bool]$manifest.validation.environment_sensitive_smoke.required
                elapsed_ms = $script:Clock.ElapsedMilliseconds
            })
            exit 0
        }

        if ($PreflightFixturePath -and $Action -eq 'Deploy' -and -not $DryRun) {
            Stop-Release @('fixture_forbidden_for_live_deploy')
        }
        if ($Action -eq 'Deploy' -and -not $DryRun -and -not $AuthorizeDeploy) {
            Stop-Release @('explicit_deploy_authorization_switch_required')
        }
    }

    $preflight = Get-CloudflarePreflight $manifest $root
    if ($Action -eq 'Preflight') {
        Write-JsonResult ([ordered]@{
            status = 'PREFLIGHT_OK'
            source = $preflight.source
            project_name = $preflight.project_name
            production_branch = $preflight.production_branch
            backend_service = $preflight.backend_service
            backend_environment = $preflight.backend_environment
            rollback = $preflight.rollback
            elapsed_ms = $script:Clock.ElapsedMilliseconds
        })
        exit 0
    }

    $command = Get-SafeDeployCommand $manifest $preflight
    if ($DryRun) {
        Write-JsonResult ([ordered]@{
            status = if ($immediate) { 'IMMEDIATE_DRY_RUN' } else { 'DEPLOY_DRY_RUN' }
            preflight_source = $preflight.source
            command = $command -join ' '
            git_head = $manifest.git.head
            dist_fingerprint = $manifest.artifact.dist_fingerprint
            rollback = $preflight.rollback
            upload_attempts = 0
            elapsed_ms = $script:Clock.ElapsedMilliseconds
        })
        exit 0
    }
    if ($immediate) {
        $currentSnapshot = Get-CandidateSnapshot $root -Canonical
        if ((Get-SnapshotIdentity $currentSnapshot) -ne $initialSnapshotIdentity) {
            Stop-Release @('snapshot_changed_before_upload')
        }
    } else {
        $finalReadiness = Test-Readiness $manifest $root
        if (-not $finalReadiness.Ready) { Stop-Release $finalReadiness.Reasons }
    }
    $wrangler = Join-Path $root 'pages\node_modules\wrangler\bin\wrangler.js'
    if (-not (Test-Path -LiteralPath $wrangler -PathType Leaf)) { Stop-Release @('wrangler_not_prepared') }
    $credentials = Read-PrivateCredentials
    $result = Invoke-ProcessCapture -FilePath 'node' -Arguments @(
        $wrangler, 'pages', 'deploy', '../frontend/dist',
        '--project-name', [string]$manifest.project.name,
        '--branch', [string]$preflight.production_branch,
        '--commit-hash', [string]$manifest.git.head
    ) -WorkingDirectory (Join-Path $root 'pages') -TimeoutSeconds 180 -Environment @{
        CLOUDFLARE_ACCOUNT_ID = $credentials.AccountId
        CLOUDFLARE_API_TOKEN = $credentials.Token
    }
    $credentials = $null
    if ($result.TimedOut) {
        Stop-Release @('upload_timed_out_state_ambiguous') 'UPLOAD_AMBIGUOUS' 30
    }
    if ($result.ExitCode -ne 0) {
        Stop-Release @('upload_failed_no_retry') 'UPLOAD_FAILED' 31
    }
    $urls = @([regex]::Matches($result.Stdout + "`n" + $result.Stderr, 'https://[a-z0-9.-]+\.pages\.dev\b', 'IgnoreCase') | ForEach-Object Value | Sort-Object -Unique)
    $acceptance = Test-ReleaseAcceptance -Manifest $manifest -Targets @($urls + $preflight.acceptance_urls)
    try {
        $receiptPath = Write-ReleaseReceipt -Manifest $manifest -Preflight $preflight -DeploymentUrls $urls -Acceptance $acceptance
    } catch {
        Write-JsonResult ([ordered]@{
            status = 'DEPLOYED_RECEIPT_WRITE_FAILED'
            upload_attempts = 1
            deployment_urls = $urls
            rollback = $preflight.rollback
            elapsed_ms = $script:Clock.ElapsedMilliseconds
        })
        exit 32
    }
    if (-not $acceptance.passed) {
        Write-JsonResult ([ordered]@{
            status = 'ACCEPTANCE_FAILED'
            upload_attempts = 1
            deployment_urls = $urls
            receipt = $receiptPath
            reasons = $acceptance.reasons
            rollback = $preflight.rollback
            elapsed_ms = $script:Clock.ElapsedMilliseconds
        })
        exit 33
    }
    Write-JsonResult ([ordered]@{
        status = 'ACCEPTED'
        mode = if ($immediate) { 'immediate' } else { 'deferred' }
        upload_attempts = 1
        deployment_urls = $urls
        receipt = $receiptPath
        acceptance_attempts = $acceptance.attempts
        rollback = $preflight.rollback
        entry_asset = $manifest.artifact.entry.path
        entry_sha256 = $manifest.artifact.entry.sha256
        elapsed_ms = $script:Clock.ElapsedMilliseconds
    })
    exit 0
} catch {
    Stop-Release @((Get-SafeReason $_.Exception.Message)) 'RELEASE_NOT_READY' 21
}
