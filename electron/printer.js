'use strict';

/**
 * Windows raw ESC/POS printing via PowerShell + winspool.drv P/Invoke.
 * No native Node.js modules required — uses .NET CLR which ships with Windows.
 */

const { exec } = require('child_process');
const path = require('path');
const os   = require('os');
const fs   = require('fs');

// C# class that talks directly to the Windows print spooler (winspool.drv)
const CSHARP = `
using System;
using System.Runtime.InteropServices;
public class RawPrinter {
    [DllImport("winspool.drv", CharSet=CharSet.Unicode)]
    public static extern bool OpenPrinter(string n, out IntPtr h, IntPtr d);
    [DllImport("winspool.drv")]
    public static extern bool ClosePrinter(IntPtr h);
    [DllImport("winspool.drv", CharSet=CharSet.Unicode)]
    public static extern int StartDocPrinter(IntPtr h, int level, IntPtr pDi);
    [DllImport("winspool.drv")]
    public static extern bool EndDocPrinter(IntPtr h);
    [DllImport("winspool.drv")]
    public static extern bool StartPagePrinter(IntPtr h);
    [DllImport("winspool.drv")]
    public static extern bool EndPagePrinter(IntPtr h);
    [DllImport("winspool.drv")]
    public static extern bool WritePrinter(IntPtr h, byte[] b, int n, out int w);
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
    public struct DOCINFO { public string pDocName; public string pOutputFile; public string pDataType; }
    public static int Send(string printerName, byte[] bytes) {
        IntPtr hPrinter;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) return -1;
        try {
            DOCINFO di; di.pDocName="MGM Receipt"; di.pOutputFile=null; di.pDataType="RAW";
            GCHandle g = GCHandle.Alloc(di, GCHandleType.Pinned);
            int docId = StartDocPrinter(hPrinter, 1, g.AddrOfPinnedObject());
            g.Free();
            if (docId <= 0) return -2;
            StartPagePrinter(hPrinter);
            int written; WritePrinter(hPrinter, bytes, bytes.Length, out written);
            EndPagePrinter(hPrinter); EndDocPrinter(hPrinter);
            return written;
        } finally { ClosePrinter(hPrinter); }
    }
}
`;

// Escape single quotes for PowerShell single-quoted strings
function psq(s) { return s.replace(/'/g, "''"); }

/**
 * Send raw ESC/POS bytes to a Windows system printer.
 * @param {string} hexData  - hex-encoded bytes
 * @param {string} printerName - exact Windows printer name
 */
async function printRaw(hexData, printerName) {
  if (process.platform !== 'win32') {
    throw new Error('Raw printing via PowerShell is Windows-only');
  }

  const ts     = Date.now();
  const tmpBin = path.join(os.tmpdir(), `mgm_${ts}.bin`);
  const tmpPs  = path.join(os.tmpdir(), `mgm_${ts}.ps1`);

  fs.writeFileSync(tmpBin, Buffer.from(hexData, 'hex'));

  // Build script using single-quoted here-string so no PS variable interpolation occurs
  const script = [
    `Add-Type -TypeDefinition @'`,
    CSHARP,
    `'@`,
    `$bytes = [System.IO.File]::ReadAllBytes('${psq(tmpBin)}')`,
    `$n = [RawPrinter]::Send('${psq(printerName)}', $bytes)`,
    `if ($n -gt 0) { exit 0 }`,
    `elseif ($n -eq -1) { Write-Error "Cannot open printer '${'${psq(printerName)}'}'.  Check the printer name in Settings matches exactly what appears in Windows > Printers & Scanners."; exit 1 }`,
    `else { Write-Error "Printer opened but job failed (code $n). The printer may be offline or out of paper."; exit 1 }`,
  ].join('\r\n');

  fs.writeFileSync(tmpPs, script, 'utf8');

  return new Promise((resolve, reject) => {
    exec(
      `powershell -NonInteractive -NoProfile -ExecutionPolicy Bypass -File "${tmpPs}"`,
      { timeout: 15000 },
      (err, _stdout, stderr) => {
        try { fs.unlinkSync(tmpBin); } catch {}
        try { fs.unlinkSync(tmpPs);  } catch {}
        if (err) reject(new Error((stderr || err.message || 'Print failed').trim()));
        else resolve({ ok: true });
      },
    );
  });
}

/**
 * Check if a Windows printer exists and is in a ready state.
 * Used by Settings "Test Print" to give early feedback before sending bytes.
 */
async function checkPrinterStatus(printerName) {
  if (process.platform !== 'win32') return { ok: true, status: 'Unknown' };

  const tmpPs = path.join(os.tmpdir(), `mgm_status_${Date.now()}.ps1`);
  const script = [
    `$p = Get-Printer -Name '${psq(printerName)}' -ErrorAction SilentlyContinue`,
    `if (-not $p) { Write-Output 'NOT_FOUND'; exit }`,
    `Write-Output $p.PrinterStatus`,
  ].join('\r\n');

  fs.writeFileSync(tmpPs, script, 'utf8');

  return new Promise((resolve) => {
    exec(
      `powershell -NonInteractive -NoProfile -ExecutionPolicy Bypass -File "${tmpPs}"`,
      { timeout: 6000 },
      (err, stdout) => {
        try { fs.unlinkSync(tmpPs); } catch {}
        if (err) return resolve({ ok: false, status: 'Error' });
        const status = stdout.trim() || 'Unknown';
        resolve({ ok: status === 'Normal', status });
      },
    );
  });
}

module.exports = { printRaw, checkPrinterStatus };
