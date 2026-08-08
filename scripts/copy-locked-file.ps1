Add-Type -TypeDefinition @'
using System;
using System.IO;
public class SharedCopy {
  public static void Copy(string src, string dst) {
    using (var input = new FileStream(src, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
    using (var output = new FileStream(dst, FileMode.Create, FileAccess.Write)) {
      input.CopyTo(output);
    }
  }
}
'@

$src = 'K:\marketplace-labs\.browser-profile\Default\Network\Cookies'
$dst = 'K:\marketplace-labs\.browser-profile-probe\Default\Network\Cookies'
New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null
try {
  [SharedCopy]::Copy($src, $dst)
  Write-Output "Cookies copied OK bytes=$((Get-Item $dst).Length)"
} catch {
  Write-Output "FAIL: $($_.Exception.Message)"
}
