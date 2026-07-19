Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipPath = 'zip-history\EB-1.zip'
if (Test-Path $zipPath) { Remove-Item $zipPath }
$files = @(
    'src\modules\event-bus\contracts\IEventBus.ts',
    'src\modules\event-bus\contracts\IEventBusAdapter.ts',
    'src\modules\event-bus\domain\entities\Event.ts',
    'src\modules\event-bus\domain\entities\Subscription.ts',
    'src\modules\event-bus\domain\entities\SubscriberRegistry.ts',
    'src\modules\event-bus\domain\value-objects\Priority.ts',
    'src\modules\event-bus\domain\value-objects\EventStatus.ts',
    'src\modules\event-bus\domain\value-objects\TopicPattern.ts',
    'src\modules\event-bus\services\EventBus.ts',
    'tests\modules\event-bus\domain\value-objects\TopicPattern.test.ts',
    'tests\modules\event-bus\domain\entities\Event.test.ts',
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