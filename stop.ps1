# Stops whatever is listening on the two dev ports. Started by run.ps1.
# By port, not by process name: `dotnet run` and `npm start` each spawn the process that
# actually holds the port, so the PIDs run.ps1 knows about are only the wrappers.
Get-NetTCPConnection -LocalPort 60702, 4200 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }

Write-Host 'Stopped.'
