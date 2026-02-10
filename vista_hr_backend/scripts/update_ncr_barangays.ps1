$Url = "PASTE_RAW_GITHUB_URL_HERE"
$Out = "app\data\ncr_barangays.json"

Invoke-WebRequest -Uri $Url -OutFile $Out
Write-Host "Updated: $Out"
