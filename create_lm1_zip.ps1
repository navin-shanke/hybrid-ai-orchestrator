Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipPath = 'zip-history\LM-1.zip'
if (Test-Path $zipPath) { Remove-Item $zipPath }
$files = @(
    'src\modules\logger\contracts\ILogger.ts',
    'src\modules\logger\domain\LogLevels.ts',
    'src\modules\logger\services\LoggerService.ts',
    'src\modules\logger\infrastructure\ConsoleAdapter.ts',
    'src\modules\logger\errors\LoggerException.ts',
    'src\modules\configuration\services\ConfigurationService.ts',
    'src\modules\configuration\services\NoopLogger.ts',
    'tests\modules\logger\Logger.test.ts',
    'docs\ai-memory\CHANGELOG.md',
    'docs\ai-memory\CURRENT_SPRINT.md',
    'docs\ai-memory\IMPLEMENTATION_PROGRESS.md',
    'docs\ai-memory\NEXT_ACTIONS.md',
    'vitest.config.ts'
)
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, 'Create')
foreach ($f in $files) {
    if (Test-Path $f) {
        $entryName = $f.Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $f, $entryName)
        Write-Host "Added: $f"
    } else {
        Write-Warning "Missing: $f"
    }
}
$zip.Dispose()
Write-Host "ZIP created at: $zipPath"