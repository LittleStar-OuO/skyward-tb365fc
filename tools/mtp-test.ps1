param(
    [Parameter(Mandatory=$true)][ValidateSet('in','out')][string]$Mode,
    [Parameter(Mandatory=$true)][string]$Source,
    [string]$Name,
    [int]$TimeoutSeconds = 90
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms

# Shell.CopyHere on an MTP folder runs on the shell's apartment thread, so
# the caller has to keep pumping messages until the copy shows.
function Pump-Until([scriptblock]$Check) {
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        [Windows.Forms.Application]::DoEvents()
        $got = & $Check
        if ($got) { return $got }
        Start-Sleep -Milliseconds 250
    }
    return $null
}

$shell = New-Object -ComObject Shell.Application
$dev = $shell.NameSpace(17).Items() | Where-Object { $_.Name -like 'Lenovo*' } | Select-Object -First 1
if (-not $dev) { throw 'no Lenovo MTP device in This PC' }
$storage = $dev.GetFolder.Items() | Select-Object -First 1
if (-not $storage) { throw 'the device offers no storage' }
$download = $storage.GetFolder.Items() | Where-Object { $_.Name -eq 'Download' } | Select-Object -First 1
if (-not $download) { throw 'the device has no Download folder' }
$folder = $download.GetFolder

if ($Mode -eq 'in') {
    $src = (Resolve-Path -LiteralPath $Source).Path
    if (-not $Name) { $Name = Split-Path -Leaf $src }
    $size = (Get-Item -LiteralPath $src).Length
    Write-Output "copy-in $src ($size bytes) as $Name"
    $folder.CopyHere($src, 16)
    $seen = Pump-Until { $folder.Items() | Where-Object { $_.Name -eq $Name } | Select-Object -First 1 }
    if (-not $seen) { throw "the device did not show $Name after the copy" }
    Write-Output "seen on the device: $($seen.Name)"
} else {
    if (-not $Name) { $Name = $Source }
    $item = $folder.Items() | Where-Object { $_.Name -eq $Source } | Select-Object -First 1
    if (-not $item) { throw "no $Source in Download on the device" }
    $out = 'C:\Users\LittleStar\Downloads\mtp-out'
    New-Item -ItemType Directory -Force -Path $out | Out-Null
    Remove-Item -LiteralPath (Join-Path $out $Name) -ErrorAction SilentlyContinue
    Write-Output "copy-out $Source as $out\$Name"
    $shell.NameSpace($out).CopyHere($item, 16)
    $file = Pump-Until {
        $f = Get-Item -LiteralPath (Join-Path $out $Name) -ErrorAction SilentlyContinue
        if ($f -and $f.Length -gt 0) { $f }
    }
    if (-not $file) { throw "the copy of $Name did not finish" }
    # One more check a moment later, so a file still growing is not taken as done.
    Start-Sleep -Seconds 2
    $file = Get-Item -LiteralPath $file.FullName
    Write-Output "got $($file.Length) bytes: $($file.FullName)"
}
