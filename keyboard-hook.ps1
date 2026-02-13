
Add-Type -TypeDefinition @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.IO;

public class KeyboardHook {
  private const int WH_KEYBOARD_LL = 13;
  private const int WM_KEYDOWN = 0x0100;
  private const int VK_LWIN = 0x5B;
  private const int VK_RWIN = 0x5C;
  private static string outputFile = "C:\\Users\\iamro\\AppData\\Local\\Temp\\electron-keyboard-hook.txt";
  
  [DllImport("user32.dll", CharSet=CharSet.Auto, SetLastError=true)]
  private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);
  
  [DllImport("user32.dll", CharSet=CharSet.Auto, SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  private static extern bool UnhookWindowsHookEx(IntPtr hhk);
  
  [DllImport("user32.dll", CharSet=CharSet.Auto, SetLastError=true)]
  private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);
  
  [DllImport("kernel32.dll", CharSet=CharSet.Auto, SetLastError=true)]
  private static extern IntPtr GetModuleHandle(string lpModuleName);
  
  [DllImport("user32.dll")]
  private static extern short GetAsyncKeyState(int vKey);
  
  private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);
  private static LowLevelKeyboardProc _proc = HookCallback;
  private static IntPtr _hookID = IntPtr.Zero;
  
  public static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
    if (nCode >= 0 && wParam == (IntPtr)WM_KEYDOWN) {
      int vkCode = Marshal.ReadInt32(lParam);
      if (vkCode == VK_LWIN || vkCode == VK_RWIN) {
        bool ctrl = (GetAsyncKeyState(0x11) & 0x8000) != 0;
        bool alt = (GetAsyncKeyState(0x12) & 0x8000) != 0;
        bool shift = (GetAsyncKeyState(0x10) & 0x8000) != 0;
        
        try {
          File.AppendAllText(outputFile, $"WINKEY|DOWN|{ctrl}|{alt}|{shift}
");
        } catch {}
      }
    }
    return CallNextHookEx(_hookID, nCode, wParam, lParam);
  }
  
  public static void StartHook() {
    _hookID = SetWindowsHookEx(WH_KEYBOARD_LL, _proc, GetModuleHandle(Process.GetCurrentProcess().MainModule.ModuleName), 0);
  }
  
  public static void StopHook() {
    if (_hookID != IntPtr.Zero) {
      UnhookWindowsHookEx(_hookID);
      _hookID = IntPtr.Zero;
    }
  }
}
"@ -ReferencedAssemblies System.Windows.Forms

[KeyboardHook]::StartHook()
Write-Output "HOOK_STARTED"

# Keep script running and monitor for stop signal
$stopFile = "C:\\Users\\iamro\\AppData\\Local\\Temp\\electron-keyboard-hook.txt.stop"
while (-not (Test-Path $stopFile)) {
  Start-Sleep -Milliseconds 100
}

[KeyboardHook]::StopHook()
  