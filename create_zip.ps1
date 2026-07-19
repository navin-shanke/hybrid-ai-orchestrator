Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipPath = 'zip-history\CM-2.zip'
if (Test-Path $zipPath) { Remove-Item $zipPath }
$files = @(
    '.serena\.gitignore',
    '.serena\project.yml',
    'src\modules\configuration\errors\ConfigException.ts',
    'src\modules\configuration\services\ConfigurationService.ts',
    'tests\modules\configuration\Configuration.test.ts',
    'tests\modules\configuration\errors\ConfigException.test.ts',
    'tests\shared\domain\ValueObject.test.ts',
    'tests\shared\utils\DateTime.test.ts',
    'tests\shared\utils\Validation.test.ts',
    'vitest.config.ts',
    'docs\ai-memory\CHANGELOG.md',
    'docs\ai-memory\CURRENT_SPRINT.md',
    'docs\ai-memory\IMPLEMENTATION_PROGRESS.md',
    'docs\ai-memory\NEXT_ACTIONS.md'
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